/**
 * T-642 AC5, AC6 — GET /me needsSignupConsent (computed, never stored) and
 * POST /me/signup-consent (AJ-642-M5, M6; AJ-517-M16, M18). Real app, in-memory Mongo, ioredis-mock.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { CURRENT_TERMS_VERSION, User } from '../models/User.model';

const PASSWORD = 'Passw0rdOk';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const FIRST = new Date('2026-10-20T10:00:00Z');

async function seed(email: string, extra: Record<string, unknown> = {}) {
  await User.create({ email, name: 'T642 Person', password: PASSWORD, ...extra });
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const d = res.body.data;
  const token = (d.tokens ?? d).accessToken as string;
  return token;
}
const raw = (email: string) => mongoose.connection.db!.collection('users').findOne({ email });
const needs = async (t: string) =>
  (await supertest(app).get('/me').set(bearer(t))).body.data.needsSignupConsent;

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

describe('T-642 AC5 — needsSignupConsent is computed', () => {
  it('true only for google with no signupConsentAt', async () => {
    const t = await seed('g1@example.com', { acceptedVia: 'google' });
    expect(await needs(t)).toBe(true);
  });
  it('false for google once signupConsentAt is set', async () => {
    const t = await seed('g2@example.com', { acceptedVia: 'google', signupConsentAt: FIRST });
    expect(await needs(t)).toBe(false);
  });
  it.each([
    ['password', undefined],
    ['password', FIRST],
    ['test', undefined],
    [undefined, undefined],
  ])('always false for acceptedVia %s (signupConsentAt %s)', async (via, at) => {
    const extra: Record<string, unknown> = {};
    if (via) extra.acceptedVia = via;
    if (at) extra.signupConsentAt = at;
    const t = await seed(`n${String(via)}${at ? 'x' : 'y'}@example.com`, extra);
    expect(await needs(t)).toBe(false);
  });
  it('is never stored on the document', async () => {
    const t = await seed('g3@example.com', { acceptedVia: 'google' });
    await needs(t);
    expect(await raw('g3@example.com')).not.toHaveProperty('needsSignupConsent');
  });
});

describe('T-642 AC6 — POST /me/signup-consent', () => {
  it('requires auth', async () => {
    expect((await supertest(app).post('/me/signup-consent')).status).toBe(401);
    expect((await supertest(app).post('/me/signup-consent').set(bearer('not-a-jwt'))).status).toBe(
      401,
    );
  });

  it('records the fields, versions and the google_confirm row; leaves acceptedVia and termsAcceptedAt', async () => {
    const termsAt = new Date('2026-10-01T00:00:00Z');
    const t = await seed('c1@example.com', {
      acceptedVia: 'google',
      termsAcceptedAt: termsAt,
      termsVersion: '2026-01-01',
      privacyVersion: '2026-01-01',
      privacyHistory: [{ version: '2026-01-01', acceptedAt: termsAt, via: 'signup' }],
    });
    const res = await supertest(app).post('/me/signup-consent').set(bearer(t));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', data: { needsSignupConsent: false } });
    expect(res.headers['cache-control']).toBe('no-store');
    const u = (await raw('c1@example.com'))!;
    expect(u.signupConsentAt).toBeInstanceOf(Date);
    expect(u.signupConsentTermsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(u.signupConsentPrivacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(u.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u.acceptedVia).toBe('google');
    expect(u.termsAcceptedAt).toEqual(termsAt);
    expect(u.privacyHistory).toHaveLength(2);
    expect(u.privacyHistory[0]).toMatchObject({ version: '2026-01-01', via: 'signup' });
    expect(u.privacyHistory[1]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'google_confirm',
      termsVersion: CURRENT_TERMS_VERSION,
      consentTextVersion: 'AJ-517-M16',
    });
    expect(await needs(t)).toBe(false);
  });

  it('is idempotent: the second call is 200, keeps the first signupConsentAt, adds no row', async () => {
    const t = await seed('c2@example.com', { acceptedVia: 'google' });
    expect((await supertest(app).post('/me/signup-consent').set(bearer(t))).status).toBe(200);
    const first = (await raw('c2@example.com'))!;
    await new Promise((r) => setTimeout(r, 15));
    expect((await supertest(app).post('/me/signup-consent').set(bearer(t))).status).toBe(200);
    const second = (await raw('c2@example.com'))!;
    expect(second.signupConsentAt).toEqual(first.signupConsentAt);
    expect(second.privacyHistory).toHaveLength(first.privacyHistory.length);
  });

  it('a google account that already has signupConsentAt is not rewritten', async () => {
    const t = await seed('c3@example.com', { acceptedVia: 'google', signupConsentAt: FIRST });
    expect((await supertest(app).post('/me/signup-consent').set(bearer(t))).status).toBe(200);
    const u = (await raw('c3@example.com'))!;
    expect(u.signupConsentAt).toEqual(FIRST);
    expect(u.signupConsentTermsVersion).toBeUndefined();
    expect((u.privacyHistory ?? []).some((r: { via: string }) => r.via === 'google_confirm')).toBe(
      false,
    );
  });

  it('non-google account: 200 and nothing written', async () => {
    const t = await seed('c4@example.com', { acceptedVia: 'password' });
    const before = (await raw('c4@example.com'))!;
    const res = await supertest(app).post('/me/signup-consent').set(bearer(t));
    expect(res.status).toBe(200);
    const after = (await raw('c4@example.com'))!;
    expect(after.signupConsentAt).toBeUndefined();
    expect(after.privacyHistory).toEqual(before.privacyHistory);
    expect(after.termsVersion).toEqual(before.termsVersion);
    expect(after.privacyVersion).toEqual(before.privacyVersion);
    expect(after.acceptedVia).toBe('password');
  });
});
