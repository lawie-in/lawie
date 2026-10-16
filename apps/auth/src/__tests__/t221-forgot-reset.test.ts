/**
 * T-221 auth side, through the real app (supertest), real Mongo (memory server), ioredis-mock,
 * email-client stubbed at the boundary.
 *
 *  AC1  POST /forgot-password: same 200 body for unknown / known / Google-only / inactive
 *  AC2  enqueue { template, userId } only; mint: FRONTEND_URL/reset-password/<64 hex>, sha256
 *       stored, 30 min, newest mint wins; single use; GET check
 *  AC3  reset: sign-up rules (422 per rule, token not used up), success clears the token and
 *       deletes every session of that user only
 *  AC4  per-email (3) and per-IP (10) limit, checked before any user lookup
 *  AC6  Google-only: mint variant google, no token stored
 *  AC7  unknown email, expired token, used token, weak password, Google-only
 */
import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import { createSession } from '../services/session.service';
import {
  completePasswordReset,
  mintPasswordReset,
  requestPasswordReset,
} from '../services/password-reset.service';

import { rawUsers, waitFor } from './t234-helpers';

const SECRET = process.env.INTERNAL_SECRET as string;
const enqueueMock = enqueueEmail as unknown as jest.Mock;
const OLD_PW = 'OldPassw0rd';
const NEW_PW = 'BrandNew1pass';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

let n = 0;
let ipN = 0;
const freshIp = () => `10.1.${Math.floor(++ipN / 250)}.${ipN % 250}`;
const mkUser = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t221-${n}@example.com`,
    name: 'Reset Person',
    password: OLD_PW,
    ...fields,
  });
};
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;

const forgot = (email: unknown, ip = freshIp()) =>
  supertest(app).post('/forgot-password').set('x-forwarded-for', ip).send({ email });
const mint = (userId: string) =>
  supertest(app)
    .post('/internal/password-reset/mint')
    .set('x-internal-secret', SECRET)
    .send({ userId });
const check = (token: string) => supertest(app).get(`/reset-password/${token}`);
const reset = (token: string, password: unknown) =>
  supertest(app).post(`/reset-password/${token}`).send({ password });

/** Mint a live link for a fresh password user and return the token. */
async function liveToken(fields: Record<string, unknown> = {}) {
  const u = await mkUser(fields);
  const res = await mint(String(u._id));
  const token = (res.body.resetUrl as string).split('/reset-password/')[1]!;
  return { u, token };
}

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1' });
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AC1/AC7 POST /forgot-password: same answer, enqueue userId only', () => {
  it('unknown email: 200, nothing enqueued', async () => {
    const res = await forgot('nobody-here@example.com');
    expect(res.status).toBe(200);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('known password user: 200 with the SAME body as unknown; job is exactly {template, userId}', async () => {
    const unknown = await forgot('nobody-here@example.com');
    const u = await mkUser();
    const known = await forgot(u.email);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    await waitFor(async () => enqueueMock.mock.calls.length > 0);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]![0]).toEqual({
      template: 'auth.passwordReset',
      userId: String(u._id),
    });
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain(u.email);
  });

  it('upper-case / padded address finds the same account', async () => {
    const u = await mkUser();
    const res = await forgot(`  ${u.email.toUpperCase()} `);
    expect(res.status).toBe(200);
    await waitFor(async () => enqueueMock.mock.calls.length > 0);
    expect(enqueueMock.mock.calls[0]![0].userId).toBe(String(u._id));
  });

  it('Google-only account: 200 same body, job enqueued (the mail says sign in with Google)', async () => {
    const u = await User.create({
      email: 'g-only-t221@example.com',
      name: 'G Only',
      authProvider: 'google',
      googleId: 'g-t221-1',
    });
    const unknown = await forgot('nobody-here@example.com');
    const res = await forgot(u.email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(unknown.body);
    await waitFor(async () => enqueueMock.mock.calls.length > 0);
    expect(enqueueMock.mock.calls[0]![0]).toEqual({
      template: 'auth.passwordReset',
      userId: String(u._id),
    });
  });

  it('inactive account: 200 same body, nothing enqueued', async () => {
    const u = await mkUser({ isActive: false });
    const unknown = await forgot('nobody-here@example.com');
    const res = await forgot(u.email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(unknown.body);
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueue failure still answers 200 (no hint)', async () => {
    enqueueMock.mockRejectedValue(new Error('redis down'));
    const u = await mkUser();
    const res = await forgot(u.email);
    expect(res.status).toBe(200);
  });

  it.each([
    ['missing', undefined],
    ['not an email', 'not-an-email'],
    ['object', { $ne: '' }],
    ['number', 5],
  ])('bad format (%s): 400, nothing enqueued, no lookup-dependent answer', async (_l, email) => {
    const res = await forgot(email);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_email' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('responses are no-store', async () => {
    const res = await forgot('nobody-here@example.com');
    expect(res.headers['cache-control']).toContain('no-store');
  });
});

describe('AC4 rate limit', () => {
  it('4th request for one email in 15 min: 429 + Retry-After, even from new IPs', async () => {
    for (let i = 0; i < 3; i += 1) expect((await forgot('limited@example.com')).status).toBe(200);
    const res = await forgot('limited@example.com');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    const ra = Number(res.headers['retry-after']);
    expect(ra).toBeGreaterThan(0);
    expect(ra).toBeLessThanOrEqual(15 * 60);
    expect(res.body.retryAfter).toBe(ra);
  });

  it('known and unknown emails get an identical 429 (status, body shape, header present)', async () => {
    const u = await mkUser();
    for (const e of [u.email, 'ghost-t221@example.com']) {
      for (let i = 0; i < 3; i += 1) await forgot(e);
    }
    const a = await forgot(u.email);
    const b = await forgot('ghost-t221@example.com');
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
    expect(a.body.error).toBe(b.body.error);
    expect(a.headers['retry-after']).toBeDefined();
    expect(b.headers['retry-after']).toBeDefined();
  });

  it('a refused request enqueues nothing even for a real account', async () => {
    const u = await mkUser();
    for (let i = 0; i < 3; i += 1) await forgot(u.email);
    await waitFor(async () => enqueueMock.mock.calls.length >= 3);
    enqueueMock.mockClear();
    expect((await forgot(u.email)).status).toBe(429);
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('the email key is case/space-insensitive', async () => {
    for (let i = 0; i < 3; i += 1) await forgot('CaseKey@Example.com');
    expect((await forgot(' casekey@example.com ')).status).toBe(429);
  });

  it('per IP: 11th request from one IP (different emails) is refused', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < 10; i += 1) {
      expect((await forgot(`ip-${i}@example.com`, ip)).status).toBe(200);
    }
    const res = await forgot('ip-11@example.com', ip);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(res.headers['retry-after']).toBeDefined();
    // another IP is unaffected
    expect((await forgot('ip-12@example.com', '203.0.113.10')).status).toBe(200);
  });

  it('checked BEFORE any user lookup: a refused request never touches the users collection', async () => {
    for (let i = 0; i < 3; i += 1) await forgot('before-lookup@example.com');
    const spy = jest.spyOn(User, 'findOne');
    const res = await forgot('before-lookup@example.com');
    expect(res.status).toBe(429);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Redis failure fails closed: 503, no lookup, nothing enqueued', async () => {
    const u = await mkUser();
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error('ECONNREFUSED'));
    const spy = jest.spyOn(User, 'findOne');
    const res = await forgot(u.email);
    expect(res.status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('keys hold a hash of the email, never the address', async () => {
    await forgot('keycheck-t221@example.com');
    const keys = await redis.keys('auth:pwreset:*');
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.join('\n')).not.toContain('keycheck');
    expect(keys).toContain(`auth:pwreset:email:${sha256('keycheck-t221@example.com')}`);
    for (const k of keys) expect(await redis.pttl(k)).toBeGreaterThan(0);
  });
});

describe('AC2/AC6 POST /internal/password-reset/mint', () => {
  it('401 without or with a wrong secret; nothing stored', async () => {
    const u = await mkUser();
    const none = await supertest(app)
      .post('/internal/password-reset/mint')
      .send({ userId: String(u._id) });
    const wrong = await supertest(app)
      .post('/internal/password-reset/mint')
      .set('x-internal-secret', 'x'.repeat(SECRET.length))
      .send({ userId: String(u._id) });
    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await raw(u._id)).passwordResetToken).toBeUndefined();
  });

  it('400 with no userId', async () => {
    expect((await mint(undefined as never)).status).toBe(400);
  });

  it('link variant: FRONTEND_URL/reset-password/<64 hex>, sha256 stored, 30 min expiry, no-store', async () => {
    const u = await mkUser();
    const before = Date.now();
    const res = await mint(String(u._id));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.variant).toBe('link');
    expect(res.body.email).toBe(u.email);
    expect(res.body.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\/[a-f0-9]{64}$/);
    const token = res.body.resetUrl.split('/reset-password/')[1] as string;
    const stored = await raw(u._id);
    expect(stored.passwordResetToken).toBe(sha256(token));
    expect(stored.passwordResetToken).not.toBe(token);
    const ttl = (stored.passwordResetExpires as Date).getTime() - before;
    expect(ttl).toBeGreaterThan(30 * 60 * 1000 - 5000);
    expect(ttl).toBeLessThan(30 * 60 * 1000 + 5000);
  });

  it('second mint invalidates the first token', async () => {
    const u = await mkUser();
    const t1 = ((await mint(String(u._id))).body.resetUrl as string).split('/reset-password/')[1]!;
    const t2 = ((await mint(String(u._id))).body.resetUrl as string).split('/reset-password/')[1]!;
    expect(t1).not.toBe(t2);
    expect((await check(t1)).body).toEqual({ valid: false });
    expect((await check(t2)).body).toEqual({ valid: true });
    expect((await reset(t1, NEW_PW)).status).toBe(400);
    expect((await reset(t2, NEW_PW)).status).toBe(200);
  });

  it('Google-only: variant google with the login URL, NO token stored', async () => {
    const u = await User.create({
      email: 'g-mint-t221@example.com',
      name: 'G',
      authProvider: 'google',
      googleId: 'g-t221-2',
    });
    const res = await mint(String(u._id));
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('google');
    expect(res.body.loginUrl).toBe('http://localhost:3000/login');
    expect(res.body).not.toHaveProperty('resetUrl');
    const stored = await raw(u._id);
    expect(stored.passwordResetToken).toBeUndefined();
    expect(stored.passwordResetExpires).toBeUndefined();
  });

  it('a user with BOTH a password and Google gets a link, not the Google variant', async () => {
    const u = await mkUser({ authProvider: 'google', googleId: 'g-both' });
    expect((await mint(String(u._id))).body.variant).toBe('link');
  });

  it('404 for unknown id, malformed id, inactive account; nothing stored', async () => {
    expect((await mint(String(new mongoose.Types.ObjectId()))).status).toBe(404);
    expect((await mint('not-an-id')).status).toBe(404);
    const u = await mkUser({ isActive: false });
    expect((await mint(String(u._id))).status).toBe(404);
    expect((await raw(u._id)).passwordResetToken).toBeUndefined();
  });
});

describe('AC2 GET /reset-password/:token', () => {
  it('live token: valid true; unknown, malformed and expired: valid false; read-only', async () => {
    const { u, token } = await liveToken();
    const ok = await check(token);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ valid: true });
    expect(ok.headers['cache-control']).toContain('no-store');
    expect(ok.headers['referrer-policy']).toBe('no-referrer');
    expect((await check(token)).body).toEqual({ valid: true }); // not consumed by checking
    expect((await check('f'.repeat(64))).body).toEqual({ valid: false });
    expect((await check('short')).body).toEqual({ valid: false });
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { passwordResetExpires: new Date(Date.now() - 1000) } },
    );
    expect((await check(token)).body).toEqual({ valid: false });
  });
});

describe('AC2/AC3 POST /reset-password/:token', () => {
  it('success: password changed (bcrypt), token fields cleared, status 200', async () => {
    const { u, token } = await liveToken();
    const res = await reset(token, NEW_PW);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    const stored = await raw(u._id);
    expect(await bcrypt.compare(NEW_PW, stored.password as string)).toBe(true);
    expect(await bcrypt.compare(OLD_PW, stored.password as string)).toBe(false);
    expect(stored.password).not.toBe(NEW_PW);
    expect(stored.passwordResetToken).toBeUndefined();
    expect(stored.passwordResetExpires).toBeUndefined();
  });

  it('the new password logs in, the old one does not', async () => {
    const { u, token } = await liveToken();
    await reset(token, NEW_PW);
    const bad = await supertest(app).post('/login').send({ email: u.email, password: OLD_PW });
    const good = await supertest(app).post('/login').send({ email: u.email, password: NEW_PW });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(good.status).toBe(200);
  });

  it('used token (second use): 400 invalid_or_expired_token, password stays the first new one', async () => {
    const { u, token } = await liveToken();
    expect((await reset(token, NEW_PW)).status).toBe(200);
    const again = await reset(token, 'Another1Passw0rd');
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ error: 'invalid_or_expired_token' });
    expect(await bcrypt.compare(NEW_PW, (await raw(u._id)).password as string)).toBe(true);
  });

  it('expired token: 400, password unchanged', async () => {
    const { u, token } = await liveToken();
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { passwordResetExpires: new Date(Date.now() - 1000) } },
    );
    const res = await reset(token, NEW_PW);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_or_expired_token' });
    expect(await bcrypt.compare(OLD_PW, (await raw(u._id)).password as string)).toBe(true);
  });

  it.each([
    ['unknown token', 'f'.repeat(64)],
    ['malformed token', 'nope'],
    ['upper-case hex of a real-length token', 'A'.repeat(64)],
  ])('%s: 400 with the one answer', async (_l, token) => {
    const res = await reset(token, NEW_PW);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_or_expired_token' });
  });

  it('a token minted before the account was deactivated no longer works', async () => {
    const { u, token } = await liveToken();
    await rawUsers().updateOne({ _id: u._id }, { $set: { isActive: false } });
    expect((await reset(token, NEW_PW)).status).toBe(400);
    expect((await check(token)).body).toEqual({ valid: false });
  });

  it('concurrent double use: exactly one wins', async () => {
    const { u, token } = await liveToken();
    const results = await Promise.all([
      reset(token, 'Winner1Password'),
      reset(token, 'Loser2Password'),
      reset(token, 'Third3Password'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400, 400]);
    const winner = results.findIndex((r) => r.status === 200);
    const pw = ['Winner1Password', 'Loser2Password', 'Third3Password'][winner]!;
    expect(await bcrypt.compare(pw, (await raw(u._id)).password as string)).toBe(true);
  });
});

describe('AC3 the four sign-up rules are enforced on reset (Ajay condition)', () => {
  it.each([
    ['too short', 'Ab1cdef', ['min_length']],
    ['no uppercase', 'alllower1pass', ['uppercase']],
    ['no lowercase', 'ALLUPPER1PASS', ['lowercase']],
    ['no digit', 'NoDigitsHere', ['number']],
    ['all four broken', '', ['min_length', 'uppercase', 'lowercase', 'number']],
    ['short and no digit', 'Abcdef', ['min_length', 'number']],
  ])(
    '%s: 422 weak_password naming the unmet rule(s); token still usable; password unchanged',
    async (_l, pw, unmet) => {
      const { u, token } = await liveToken();
      const res = await reset(token, pw);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('weak_password');
      expect([...res.body.unmet].sort()).toEqual([...(unmet as string[])].sort());
      expect(await bcrypt.compare(OLD_PW, (await raw(u._id)).password as string)).toBe(true);
      expect((await raw(u._id)).passwordResetToken).toBe(sha256(token));
      expect((await check(token)).body).toEqual({ valid: true });
      const ok = await reset(token, NEW_PW);
      expect(ok.status).toBe(200);
    },
  );

  it.each([
    ['missing', undefined],
    ['number', 12345678],
    ['array', ['Abcdefg1']],
    ['object', { $gt: '' }],
    ['null', null],
  ])('non-string password (%s): 422, nothing changed', async (_l, pw) => {
    const { token } = await liveToken();
    const res = await reset(token, pw);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('weak_password');
    expect(res.body.unmet.length).toBeGreaterThan(0);
    expect((await check(token)).body).toEqual({ valid: true });
  });

  it('a weak password is checked before the token: a dead token + weak password is 422, not 400', async () => {
    const res = await reset('f'.repeat(64), 'weak');
    expect(res.status).toBe(422);
  });

  it('exactly 8 chars with upper, lower and digit is accepted (boundary)', async () => {
    const { token } = await liveToken();
    expect((await reset(token, 'Abcdefg1')).status).toBe(200);
  });

  it('same rules as sign-up: a password reset accepts exactly what /register accepts', async () => {
    for (const [pw, ok] of [
      ['Abcdefg1', true],
      ['abcdefg1', false],
      ['ABCDEFG1', false],
      ['Abcdefgh', false],
      ['Abc1', false],
    ] as const) {
      const { token } = await liveToken();
      const r = await reset(token, pw);
      expect(r.status === 200).toBe(ok);
    }
  });
});

describe('AC3 every session of that user is signed out', () => {
  const info = (u: { email: string; name: string }) => ({
    plan: 'free',
    email: u.email,
    role: 'user',
    name: u.name,
  });

  it("success deletes all of the user's sessions (Mongo + Redis) and leaves other users alone", async () => {
    const { u, token } = await liveToken();
    const other = await mkUser();
    await createSession(String(u._id), 'access-a1', 'refresh-a1', info(u));
    await createSession(String(u._id), 'access-a2', 'refresh-a2', info(u));
    await createSession(String(other._id), 'access-o1', 'refresh-o1', info(other));
    expect(await Session.countDocuments({ userId: u._id })).toBe(2);
    expect((await redis.keys(`session:*${String(u._id)}*`)).length).toBeGreaterThan(0);

    expect((await reset(token, NEW_PW)).status).toBe(200);

    expect(await Session.countDocuments({ userId: u._id })).toBe(0);
    expect(await redis.keys(`session:*${String(u._id)}*`)).toEqual([]);
    expect(await Session.countDocuments({ userId: other._id })).toBe(1);
    expect((await redis.keys(`session:*${String(other._id)}*`)).length).toBeGreaterThan(0);
  });

  it('a weak password, a bad token and a used token delete NO session', async () => {
    const { u, token } = await liveToken();
    await createSession(String(u._id), 'access-b1', 'refresh-b1', info(u));
    await reset(token, 'weak');
    await reset('f'.repeat(64), NEW_PW);
    expect(await Session.countDocuments({ userId: u._id })).toBe(1);
    await reset(token, NEW_PW);
    expect(await Session.countDocuments({ userId: u._id })).toBe(0);
    await createSession(String(u._id), 'access-b2', 'refresh-b2', info(u));
    await reset(token, NEW_PW); // used token
    expect(await Session.countDocuments({ userId: u._id })).toBe(1);
  });

  it('service level: deleteAllSessions is called once with the userId', async () => {
    const { u, token } = await liveToken();
    const deleteAllSessions = jest.fn(async () => undefined);
    const out = await completePasswordReset(token, NEW_PW, { deleteAllSessions });
    expect(out).toEqual({ kind: 'reset', userId: String(u._id) });
    expect(deleteAllSessions).toHaveBeenCalledTimes(1);
    expect(deleteAllSessions).toHaveBeenCalledWith(String(u._id));
  });

  it('service level: not called when the token is invalid', async () => {
    const deleteAllSessions = jest.fn(async () => undefined);
    expect(await completePasswordReset('f'.repeat(64), NEW_PW, { deleteAllSessions })).toEqual({
      kind: 'invalid',
    });
    expect(deleteAllSessions).not.toHaveBeenCalled();
  });

  it('if signing out fails the request errors (500), not a silent 200', async () => {
    const { token } = await liveToken();
    const deleteAllSessions = jest.fn(async () => {
      throw new Error('redis gone');
    });
    await expect(completePasswordReset(token, NEW_PW, { deleteAllSessions })).rejects.toThrow();
  });
});

describe('service-level injection (AC7)', () => {
  it('requestPasswordReset uses the injected enqueue and redis', async () => {
    const u = await mkUser();
    const enqueue = jest.fn(async () => ({}));
    const r = await requestPasswordReset(u.email, '198.51.100.1', {
      enqueue,
      redis: redis as never,
    });
    expect(r).toEqual({ kind: 'accepted' });
    await waitFor(async () => enqueue.mock.calls.length > 0);
    expect(enqueue).toHaveBeenCalledWith({ template: 'auth.passwordReset', userId: String(u._id) });
  });

  it('mintPasswordReset directly: closing accounts (erasure) are not eligible', async () => {
    const u = await mkUser();
    await rawUsers().updateOne({ _id: u._id }, { $set: { erasure: { requestedAt: new Date() } } });
    expect(await mintPasswordReset(String(u._id))).toEqual({ kind: 'not_found' });
  });
});
