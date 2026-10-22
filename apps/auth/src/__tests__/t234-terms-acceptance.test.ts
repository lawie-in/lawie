/**
 * T-234 AC7 (password side) + login for Google-only accounts.
 * Google side of AC7 is in t234-google-terms.test.ts.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { User, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../models/User.model';

import { verifyAndSeed } from './t234-helpers';

const PASSWORD = 'Passw0rdOk';
const reg = (email: string, extra: Record<string, unknown> = {}) =>
  supertest(app)
    .post('/register')
    .send({ email, password: PASSWORD, name: 'Test Person', ...extra });

describe('T-234 AC7 — password register records Terms acceptance', () => {
  it('CURRENT_TERMS_VERSION is 2026-10-22 (matches /terms Last updated, T-541)', () => {
    expect(CURRENT_TERMS_VERSION).toBe('2026-10-22');
  });

  it('CURRENT_PRIVACY_VERSION is 2026-10-15 (Ajay, GST file Addendum 4) and CURRENT_TERMS_VERSION is 2026-10-22 (T-541); each equals its own current date', () => {
    // T-541: Terms moved to 2026-10-22 (top-up Ink expiry narrowed); Privacy stays 2026-10-15 (T-436).
    // They are separate constants, each asserted against its own date.
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15');
    expect(CURRENT_TERMS_VERSION).toBe('2026-10-22');
  });

  it('sets termsAcceptedAt (server time), termsVersion and acceptedVia=password', async () => {
    const before = Date.now();
    const res = await reg('terms@example.com');
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: 'terms@example.com' }).lean();
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u!.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(u!.termsAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(u!.termsVersion).toBe('2026-10-22');
    expect(u!.privacyVersion).toBe('2026-10-15');
    expect(u!.acceptedVia).toBe('password');
    await verifyAndSeed(u!._id);
  });

  it('ignores terms fields sent by the client', async () => {
    const res = await reg('spoof@example.com', {
      termsAcceptedAt: '2001-01-01T00:00:00.000Z',
      termsVersion: '1999-01-01',
      privacyVersion: '1999-01-01',
      acceptedVia: 'google',
    });
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: 'spoof@example.com' }).lean();
    expect(u!.termsAcceptedAt!.getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(u!.termsVersion).toBe('2026-10-22');
    expect(u!.privacyVersion).toBe('2026-10-15');
    expect(u!.acceptedVia).toBe('password');
    await verifyAndSeed(u!._id);
  });

  it('a duplicate-email register (409) does not touch the existing acceptance', async () => {
    await reg('dupterms@example.com');
    const first = await User.findOne({ email: 'dupterms@example.com' }).lean();
    const res = await reg('dupterms@example.com', {
      termsVersion: 'x',
      privacyVersion: 'x',
      acceptedVia: 'google',
    });
    expect(res.status).toBe(409);
    const after = await User.findOne({ email: 'dupterms@example.com' }).lean();
    expect(after!.termsAcceptedAt).toEqual(first!.termsAcceptedAt);
    expect(after!.termsVersion).toBe('2026-10-22');
    expect(after!.privacyVersion).toBe('2026-10-15');
    expect(after!.acceptedVia).toBe('password');
    await verifyAndSeed(first!._id);
  });

  it('users created without the sign-up flow have no acceptance (no schema default)', async () => {
    const u = await User.create({ email: 'plain@example.com', name: 'P', password: PASSWORD });
    const raw = await User.findById(u._id).lean();
    expect(raw!.termsAcceptedAt ?? null).toBeNull();
    expect(raw!.termsVersion ?? null).toBeNull();
    expect(raw!.privacyVersion ?? null).toBeNull();
    expect(User.schema.path('privacyVersion').options.default).toBeUndefined();
    expect(raw!.acceptedVia ?? null).toBeNull();
  });

  it('login does not set or change acceptance', async () => {
    await reg('loginterms@example.com');
    const before = await User.findOne({ email: 'loginterms@example.com' }).lean();
    const res = await supertest(app)
      .post('/login')
      .send({ email: 'loginterms@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    const after = await User.findOne({ email: 'loginterms@example.com' }).lean();
    expect(after!.termsAcceptedAt).toEqual(before!.termsAcceptedAt);
    expect(after!.privacyVersion).toBe(before!.privacyVersion);
    await verifyAndSeed(before!._id);
  });
});

describe('T-234 — Google-only account cannot log in with a password', () => {
  it('returns 401 "Invalid email or password" (not 500), same as a wrong password', async () => {
    await User.create({ email: 'gonly@example.com', name: 'G', googleId: 'g-only-1' });
    const res = await supertest(app)
      .post('/login')
      .send({ email: 'gonly@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error ?? res.body.message).toBe('Invalid email or password');

    await User.create({ email: 'withpw@example.com', name: 'W', password: PASSWORD });
    const wrong = await supertest(app)
      .post('/login')
      .send({ email: 'withpw@example.com', password: 'Wrong0Password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(res.body);
  });

  it('unknown email gives the same 401 body', async () => {
    const res = await supertest(app)
      .post('/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error ?? res.body.message).toBe('Invalid email or password');
  });
});
