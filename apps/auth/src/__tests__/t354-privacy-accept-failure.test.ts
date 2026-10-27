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
import { resetClock } from './t616b-helpers';

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
afterEach(() => {
  resetClock();
  jest.restoreAllMocks();
});

/** Every session / refresh / grace key (the T-616b refresh limiter key is not a session). */
const sessionKeys = () => redis.keys('session:*');

/** The first User.findById goes through; the second rejects (the read after the update). */
function failSecondUserRead() {
  const real = User.findById.bind(User);
  let calls = 0;
  jest.spyOn(User, 'findById').mockImplementation(((...args: Parameters<typeof real>) => {
    calls += 1;
    return calls === 2 ? Promise.reject(new Error('mongo down')) : real(...args);
  }) as never);
}

describe('T-354 AC1 — the database update rejects after the session is taken', () => {
  const EMAIL = 'upd-fail@example.com';

  it('is a 500 with no tokens; the old pair is dead; no session leaks; no history row', async () => {
    await seedUser(EMAIL);
    const old = await loginAs(EMAIL);
    expect(await sessionKeys()).toHaveLength(2); // one access + one refresh key
    expect(await Session.countDocuments({ userId: old.userId })).toBe(1);

    jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('mongo down'));
    const res = await accept(old.accessToken);

    expect(res.status).toBe(500);
    expect(res.body.status).not.toBe('success');
    expectNoTokensIn(res.body, old);

    await expectOldPairDead(old);

    // No session anywhere: Redis (access, refresh and grace keys) and the Mongo audit row.
    expect(await sessionKeys()).toEqual([]);
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

describe('T-354 AC1 — the Session row cannot be written during the rotation (T-616b)', () => {
  // T-616b: accept no longer calls createSession; the rotation (rotateRefreshSession) writes the
  // new pair and its Session row. The update comes AFTER the rotation now, so a failure here means
  // no consent was recorded.
  it('is a 500 with no tokens; nothing is recorded; no session key survives; the old pair is dead at once', async () => {
    await seedUser('sc-fail@example.com');
    const old = await loginAs('sc-fail@example.com');
    jest.spyOn(Session, 'create').mockRejectedValueOnce(new Error('mongo down') as never);

    const res = await accept(old.accessToken);

    expect(res.status).toBe(500);
    expect(res.body.status).not.toBe('success');
    expectNoTokensIn(res.body, old);

    const u = await User.findOne({ email: 'sc-fail@example.com' }).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory ?? []).toHaveLength(0);
    expect(await Session.countDocuments({ userId: old.userId })).toBe(0);

    // The rotation is undone: new access/refresh keys, grace record and old access key all gone,
    // with no clock advance.
    expect(await sessionKeys()).toEqual([]);
    await expectOldPairDead(old);
  });

  it('/refresh: Session.create rejecting leaves no session key, a 500 with no tokens, the old pair dead at once', async () => {
    await seedUser('sc-fail-rf@example.com');
    const old = await loginAs('sc-fail-rf@example.com');
    jest.spyOn(Session, 'create').mockRejectedValueOnce(new Error('mongo down') as never);

    const res = await supertest(app).post('/refresh').send({ refreshToken: old.refreshToken });

    expect(res.status).toBe(500);
    expectNoTokensIn(res.body, old);
    expect(await sessionKeys()).toEqual([]);
    expect(await Session.countDocuments({ userId: old.userId })).toBe(0);
    await expectOldPairDead(old);

    const again = await loginAs('sc-fail-rf@example.com');
    expect((await supertest(app).get('/me').set(bearer(again.accessToken))).status).toBe(200);
  });

  it('is not a lock-out: logging in again works and the prompt is still asked', async () => {
    await seedUser('sc-fail2@example.com');
    const old = await loginAs('sc-fail2@example.com');
    jest.spyOn(Session, 'create').mockRejectedValueOnce(new Error('mongo down') as never);
    expect((await accept(old.accessToken)).status).toBe(500);

    const again = await loginAs('sc-fail2@example.com');
    const me = await supertest(app).get('/me').set(bearer(again.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.needsPrivacyAcceptance).toBe(true);
    expect((await accept(again.accessToken)).status).toBe(200);
    const u = await User.findOne({ email: 'sc-fail2@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
  });
});

describe('T-354 AC1 — the user read after the update rejects (T-616b)', () => {
  const EMAIL = 'cs-fail@example.com';

  it('is a 500 with no tokens; the update stands; the rotation is undone at once; no session leaks', async () => {
    await seedUser(EMAIL);
    const old = await loginAs(EMAIL);
    // accept reads the user twice: before the rotation (real) and after the update (rejects).
    failSecondUserRead();

    const res = await accept(old.accessToken);

    expect(res.status).toBe(500);
    expect(res.body.status).not.toBe('success');
    expectNoTokensIn(res.body, old);

    // dead immediately, no clock advance: the undo revokes the whole family, old access key too
    await expectOldPairDead(old);
    expect(await sessionKeys()).toEqual([]);
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
    failSecondUserRead();
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
