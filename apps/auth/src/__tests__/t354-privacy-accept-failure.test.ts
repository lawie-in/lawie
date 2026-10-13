/**
 * T-354 — pins what privacy accept does when something fails AFTER it has taken the caller's
 * access session (Arjun, 12 Oct 2026, option A: keep take-session -> update -> createSession).
 * Expected: 500 with no tokens, the old pair is dead (access 401 on /me, refresh 401), no new
 * session in Redis or Mongo, and logging in again works. Real app, in-memory Mongo, ioredis-mock.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import * as sessionService from '../services/session.service';

const PASSWORD = 'Passw0rdOk';
const OLD_VERSION = '2026-10-11';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function seedUser(email: string) {
  await User.create({
    email,
    name: 'T354 Person',
    password: PASSWORD,
    privacyVersion: OLD_VERSION,
  });
}

async function loginAs(email: string): Promise<Tokens & { userId: string }> {
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const data = res.body.data as Partial<Tokens> & { tokens?: Tokens };
  const tokens = data.tokens ?? { accessToken: data.accessToken, refreshToken: data.refreshToken };
  const user = await User.findOne({ email }).lean();
  return { ...(tokens as Tokens), userId: String(user?._id) };
}

const accept = (token: string) =>
  supertest(app).post('/me/privacy-acceptance').set(bearer(token)).send({});

async function expectOldPairDead(old: Tokens) {
  expect((await supertest(app).get('/me').set(bearer(old.accessToken))).status).toBe(401);
  const refreshed = await supertest(app).post('/refresh').send({ refreshToken: old.refreshToken });
  expect(refreshed.status).toBe(401);
}

function expectNoTokensIn(body: unknown, old: Tokens) {
  const raw = JSON.stringify(body);
  expect(body).not.toHaveProperty('data.accessToken');
  expect(body).not.toHaveProperty('data.refreshToken');
  expect(raw).not.toContain(old.accessToken);
  expect(raw).not.toContain(old.refreshToken);
}

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

describe('T-354 AC1 — the database update rejects after the session is taken', () => {
  const EMAIL = 'upd-fail@example.com';

  it('is a 500 with no tokens; the old pair is dead; no session leaks; no history row', async () => {
    await seedUser(EMAIL);
    const old = await loginAs(EMAIL);
    expect(await redis.keys('*')).toHaveLength(2); // one access + one refresh key
    expect(await Session.countDocuments({ userId: old.userId })).toBe(1);

    jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('mongo down'));
    const res = await accept(old.accessToken);

    expect(res.status).toBe(500);
    expect(res.body.status).not.toBe('success');
    expectNoTokensIn(res.body, old);

    await expectOldPairDead(old);

    // No session anywhere: Redis (access and refresh keys) and the Mongo audit row.
    expect(await redis.keys('*')).toEqual([]);
    expect(await Session.countDocuments({ userId: old.userId })).toBe(0);

    // Nothing was recorded.
    const u = await User.findOne({ email: EMAIL }).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory ?? []).toHaveLength(0);
    expect(u?.privacyAcceptedAt).toBeUndefined();
  });

  it('is not a lock-out: logging in again works and /me still asks for acceptance', async () => {
    await seedUser('upd-fail2@example.com');
    const old = await loginAs('upd-fail2@example.com');
    jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('mongo down'));
    expect((await accept(old.accessToken)).status).toBe(500);

    const again = await loginAs('upd-fail2@example.com');
    expect(again.accessToken).not.toBe(old.accessToken);
    const me = await supertest(app).get('/me').set(bearer(again.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.needsPrivacyAcceptance).toBe(true);
    expect(me.body.data.privacyVersion).toBe(OLD_VERSION);

    // And accepting from the fresh session now succeeds (the failure was transient).
    const ok = await accept(again.accessToken);
    expect(ok.status).toBe(200);
    const u = await User.findOne({ email: 'upd-fail2@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
  });

  it('retrying with the same (taken) token is a 401, not a second attempt', async () => {
    await seedUser('upd-fail3@example.com');
    const old = await loginAs('upd-fail3@example.com');
    jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('mongo down'));
    expect((await accept(old.accessToken)).status).toBe(500);
    expect((await accept(old.accessToken)).status).toBe(401);
    const u = await User.findOne({ email: 'upd-fail3@example.com' }).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory ?? []).toHaveLength(0);
  });
});

describe('T-354 AC1 — createSession rejects after the update landed', () => {
  const EMAIL = 'cs-fail@example.com';

  it('is a 500 with no tokens; the update stands; the old pair is dead; no session leaks', async () => {
    await seedUser(EMAIL);
    const old = await loginAs(EMAIL);
    const spy = jest
      .spyOn(sessionService, 'createSession')
      .mockRejectedValueOnce(new Error('redis down'));

    const res = await accept(old.accessToken);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(res.body.status).not.toBe('success');
    expectNoTokensIn(res.body, old);

    await expectOldPairDead(old);
    expect(await redis.keys('*')).toEqual([]);
    expect(await Session.countDocuments({ userId: old.userId })).toBe(0);

    // The update landed: version stored and exactly one history row.
    const u = await User.findOne({ email: EMAIL }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('reaccept');
    expect(u?.privacyHistory).toHaveLength(1);
  });

  it('logging in again works and shows no prompt; no second history row is added', async () => {
    await seedUser('cs-fail2@example.com');
    const old = await loginAs('cs-fail2@example.com');
    jest.spyOn(sessionService, 'createSession').mockRejectedValueOnce(new Error('redis down'));
    expect((await accept(old.accessToken)).status).toBe(500);

    const again = await loginAs('cs-fail2@example.com');
    const me = await supertest(app).get('/me').set(bearer(again.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.needsPrivacyAcceptance).toBe(false);
    expect(me.body.data.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    const u = await User.findOne({ email: 'cs-fail2@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
  });
});
