/**
 * T-223 phase 2 — the auth routes, through the real app (supertest), real Mongo (memory
 * server), ioredis-mock, email-client stubbed at the boundary.
 *
 *  AC1  register enqueues { template: 'auth.verifyEmail', userId } (no address) and never fails
 *       or slows registration, whatever the enqueue or Redis does
 *  AC2  POST /verify-email: 200 verified (bonus once) / 200 already_verified / 400 for expired,
 *       used, forged, missing, non-string and object tokens; body only, never the query
 *  AC3  POST /verify-email/resend: 401, 202, 429 + Retry-After, 409, 503
 *  AC4  GET /me: emailVerified and hasGoogle
 *  AC8  the token is in no log and no response header; responses are no-store
 *  E2E  register -> mint (internal route) -> POST /verify-email -> /me
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

import './setupDb';

import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { generateTokenPair } from '../services/jwt.service';
import { createSession } from '../services/session.service';
import { VERIFY_RESEND_LIMIT_MESSAGE, mintVerifyLink } from '../services/verify-email.service';

import { ledger, rawUsers, waitFor } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const SECRET = process.env.INTERNAL_SECRET as string;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
const bonusRows = (id: unknown) => ledger().countDocuments({ userId: id, reason: 'free_seed' });
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;

let logSpies: jest.SpyInstance[];

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1', queue: 'email-high', deduped: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  logSpies = [
    jest.spyOn(logger, 'info').mockImplementation(() => undefined),
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined),
    jest.spyOn(logger, 'error').mockImplementation(() => undefined),
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined),
    jest.spyOn(console, 'log').mockImplementation(() => undefined),
    jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});
afterEach(() => jest.restoreAllMocks());

/** Everything the code logged in this test, serialised (Error objects included). */
function allLogged(): string {
  return JSON.stringify(
    logSpies.map((s) => s.mock.calls),
    (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v),
  );
}

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t223-r-${n}@example.com`,
    name: 'Route Person',
    password: PASSWORD,
    ...fields,
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const data = res.body.data as { accessToken?: string; tokens?: { accessToken: string } };
  return (data.tokens?.accessToken ?? data.accessToken) as string;
}

/** A session for a user with no password (Google). */
async function sessionFor(user: { _id: unknown; email: string; name: string }): Promise<string> {
  const payload = {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: 'Lawyer' as const,
    plan: 'free' as const,
  };
  const { accessToken, refreshToken } = generateTokenPair(payload);
  await createSession(String(user._id), accessToken, refreshToken, {
    plan: 'free',
    email: user.email,
    role: 'Lawyer',
    name: user.name,
  });
  return accessToken;
}

async function mintToken(id: unknown): Promise<string> {
  const r = await mintVerifyLink(String(id));
  if (r.kind !== 'minted') throw new Error(`expected minted, got ${r.kind}`);
  return tokenOf(r.link);
}

/**
 * Make only the resend-cap reads (auth:verify-email:* keys) fail or hang; every other Redis
 * read (the session check in authenticate) still works, so the handler's own path is reached.
 */
function breakCapStore(mode: 'reject' | 'hang'): void {
  const realGet = redis.get.bind(redis);
  jest.spyOn(redis, 'get').mockImplementation(((key: string) => {
    if (!String(key).startsWith('auth:verify-email:')) return realGet(key);
    return mode === 'reject'
      ? Promise.reject(new Error('redis exploded secret-detail'))
      : new Promise(() => undefined);
  }) as never);
}

const verify = (body: unknown) =>
  supertest(app)
    .post('/verify-email')
    .send(body as object);

// ── AC1: register enqueues a verify job ─────────────────────────────────────

describe('T-223 AC1 register queues the verify email', () => {
  const reg = (email: string) =>
    supertest(app).post('/register').send({ email, password: PASSWORD, name: 'New Person' });

  it('enqueues { template, userId } with no address, name or link; registration is 201', async () => {
    const res = await reg('t223-reg-1@example.com');
    expect(res.status).toBe(201);
    await waitFor(async () => enqueueMock.mock.calls.length === 1);

    const u = await User.findOne({ email: 't223-reg-1@example.com' }).lean();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.verifyEmail',
      userId: String(u!._id),
    });
    const arg = enqueueMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(['template', 'userId']);
    expect(JSON.stringify(arg)).not.toContain('@');
    // T-351: still no bonus before verification
    expect(await bonusRows(u!._id)).toBe(0);
  });

  it('logs the userId and outcome only', async () => {
    const res = await reg('t223-reg-log@example.com');
    expect(res.status).toBe(201);
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    await waitFor(async () =>
      (logger.info as jest.Mock).mock.calls.some(
        (c) => c[1] === 'Verify email requested at sign-up',
      ),
    );
    const call = (logger.info as jest.Mock).mock.calls.find(
      (c) => c[1] === 'Verify email requested at sign-up',
    )!;
    const u = await User.findOne({ email: 't223-reg-log@example.com' }).lean();
    expect(call[0]).toEqual({ userId: String(u!._id), outcome: 'queued' });
  });

  it('enqueue rejects: registration still 201, user created, only the userId is logged', async () => {
    enqueueMock.mockRejectedValue(new Error('redis down for t223-reg-2@example.com'));
    const res = await reg('t223-reg-2@example.com');
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ email: 't223-reg-2@example.com' })).toBe(1);
    await waitFor(async () =>
      (logger.error as jest.Mock).mock.calls.some((c) => c[1] === 'Verify email enqueue failed'),
    );
    expect(allLogged()).not.toContain('t223-reg-2@example.com');
  });

  it('enqueue throws synchronously: registration still 201', async () => {
    enqueueMock.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const res = await reg('t223-reg-3@example.com');
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ email: 't223-reg-3@example.com' })).toBe(1);
  });

  it('enqueue never settles: registration answers fast and does not wait for it', async () => {
    enqueueMock.mockReturnValue(new Promise(() => undefined));
    const t0 = Date.now();
    const res = await reg('t223-reg-4@example.com');
    expect(res.status).toBe(201);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('Redis (resend cap store) errors: registration is 201 and fast, nothing enqueued', async () => {
    breakCapStore('reject');
    const t0 = Date.now();
    const res = await reg('t223-reg-5@example.com');
    expect(res.status).toBe(201);
    expect(Date.now() - t0).toBeLessThan(2000);
    await new Promise((r) => setTimeout(r, 100));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('Redis (resend cap store) never answers: registration is 201 and fast', async () => {
    breakCapStore('hang');
    const t0 = Date.now();
    const res = await reg('t223-reg-6@example.com');
    expect(res.status).toBe(201);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await User.countDocuments({ email: 't223-reg-6@example.com' })).toBe(1);
  });
});

// ── AC2: POST /verify-email ─────────────────────────────────────────────────

describe('T-223 AC2 POST /verify-email', () => {
  it('valid token: 200 verified, emailVerified true, bonus granted exactly once, no-store', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    expect(await bonusRows(u._id)).toBe(0);

    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(res.headers['cache-control']).toBe('no-store');

    const doc = await raw(u._id);
    expect(doc.emailVerified).toBe(true);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(await bonusRows(u._id)).toBe(1);
    expect(doc.inkTopup).toBe(10);

    // the link is single use: a replay is 400 and grants nothing more
    const again = await verify({ token });
    expect(again.status).toBe(400);
    expect(await bonusRows(u._id)).toBe(1);
    expect((await raw(u._id)).inkTopup).toBe(10);
  });

  it('two concurrent requests with one token: one 200, one 400, one bonus', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    const [a, b] = await Promise.all([verify({ token }), verify({ token })]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await bonusRows(u._id)).toBe(1);
  });

  it('a live link on an already verified user: 200 already_verified, and the link is spent', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });

    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'already_verified' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await raw(u._id)).emailVerifyTokenHash).toBeUndefined();
    expect((await verify({ token })).status).toBe(400);
  });

  it('expired token: 400 verify_link_invalid, nothing changes', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { emailVerifyExpires: new Date(Date.now() - 1000) } },
    );
    const res = await verify({ token });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect(res.headers['cache-control']).toBe('no-store');
    const doc = await raw(u._id);
    expect(doc.emailVerified).not.toBe(true);
    expect(doc.signupBonusGrantedAt ?? null).toBeNull();
    expect(await bonusRows(u._id)).toBe(0);
  });

  it('forged token (right shape, never minted): 400, a live user is untouched', async () => {
    const u = await mk();
    await mintToken(u._id);
    const res = await verify({ token: crypto.randomBytes(32).toString('hex') });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it('an older link replaced by a newer mint: the old one is 400, the new one verifies', async () => {
    const u = await mk();
    const oldToken = await mintToken(u._id);
    const newToken = await mintToken(u._id);
    expect((await verify({ token: oldToken })).status).toBe(400);
    expect((await verify({ token: newToken })).status).toBe(200);
  });

  it('the hash of the token is not a token', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    expect((await verify({ token: hash })).status).toBe(400);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it.each([
    ['missing key', {}],
    ['empty string', { token: '' }],
    ['null', { token: null }],
    ['number', { token: 12345 }],
    ['boolean', { token: true }],
    ['array', { token: ['a'.repeat(64)] }],
    ['$ne object', { token: { $ne: null } }],
    ['$gt object', { token: { $gt: '' } }],
    ['$regex object', { token: { $regex: '.*' } }],
    ['too short', { token: 'abc123' }],
    ['upper-case hex', { token: 'A'.repeat(64) }],
    ['non-hex 64 chars', { token: 'z'.repeat(64) }],
    ['64 hex plus junk', { token: `${'a'.repeat(64)}x` }],
  ])('%s: 400 and no user is verified', async (_label, body) => {
    // a live link exists, so a NoSQL-injection style token would match it if it got through
    const u = await mk();
    await mintToken(u._id);
    const res = await verify(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect((await raw(u._id)).emailVerified).not.toBe(true);
    expect(await bonusRows(u._id)).toBe(0);
  });

  it('no body at all: 400', async () => {
    const res = await supertest(app).post('/verify-email');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
  });

  it('urlencoded body with an operator (token[$ne]=x) is 400, not a match', async () => {
    const u = await mk();
    await mintToken(u._id);
    const res = await supertest(app).post('/verify-email').type('form').send('token[$ne]=x');
    expect(res.status).toBe(400);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it('a valid token in the query string (not the body) is ignored: 400, user stays unverified', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    const res = await supertest(app).post(`/verify-email?token=${token}`).send({});
    expect(res.status).toBe(400);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
    // and in the path: no such route
    const p = await supertest(app).post(`/verify-email/${token}`).send({});
    expect(p.status).toBe(404);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
    // still valid in the body
    expect((await verify({ token })).status).toBe(200);
  });

  it('GET /verify-email is not a route (a link scanner cannot consume the token)', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    const res = await supertest(app).get('/verify-email').query({ token });
    expect(res.status).toBe(404);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it('needs no sign-in: the token is the credential', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    expect((await verify({ token })).status).toBe(200);
  });

  it('the token is in no log line and no response header or body, on 200 and 400', async () => {
    const u = await mk();
    const token = await mintToken(u._id);
    const forged = crypto.randomBytes(32).toString('hex');
    const bad = await verify({ token: forged });
    const ok = await verify({ token });
    const replay = await verify({ token });
    for (const res of [bad, ok, replay]) {
      expect(JSON.stringify(res.headers)).not.toContain(token);
      expect(JSON.stringify(res.headers)).not.toContain(forged);
      expect(res.text).not.toContain(token);
      expect(res.text).not.toContain(forged);
    }
    const logged = allLogged();
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    for (const s of [token, forged, hash]) expect(logged).not.toContain(s);
    // the body object itself is never logged either
    expect(logged).not.toContain('"token"');
  });
});

// ── AC3: POST /verify-email/resend ──────────────────────────────────────────

describe('T-223 AC3 POST /verify-email/resend', () => {
  const resend = (t?: string) => {
    const r = supertest(app).post('/verify-email/resend');
    return t ? r.set(bearer(t)) : r;
  };

  it('401 without a session; nothing enqueued', async () => {
    const res = await resend();
    expect(res.status).toBe(401);
    const bad = await resend('not-a-token');
    expect(bad.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('401 with a revoked session', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    const { deleteAllUserSessions } = await import('../services/session.service');
    await deleteAllUserSessions(String(u._id));
    expect((await resend(t)).status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('202 queued: enqueues { template, userId } only, no-store', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    const res = await resend(t);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'queued' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.verifyEmail',
      userId: String(u._id),
    });
  });

  it('the userId comes from the session: a body userId is ignored', async () => {
    const a = await mk();
    const b = await mk();
    const t = await loginAs(a.email);
    const res = await supertest(app)
      .post('/verify-email/resend')
      .set(bearer(t))
      .send({ userId: String(b._id) });
    expect(res.status).toBe(202);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.verifyEmail',
      userId: String(a._id),
    });
  });

  it('a second call within 60 s: 429 with retryAfter > 0, Retry-After header, fixed message, nothing sent', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    expect((await resend(t)).status).toBe(202);
    const res = await resend(t);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('verify_email_rate_limited');
    expect(res.body.message).toBe(VERIFY_RESEND_LIMIT_MESSAGE);
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(res.body.retryAfter).toBeLessThanOrEqual(60);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('the cap is per account: another user can resend while the first is limited', async () => {
    const a = await mk();
    const b = await mk();
    const ta = await loginAs(a.email);
    const tb = await loginAs(b.email);
    expect((await resend(ta)).status).toBe(202);
    expect((await resend(ta)).status).toBe(429);
    expect((await resend(tb)).status).toBe(202);
  });

  it('a verified user: 409 already_verified, nothing enqueued, the cap is not used up', async () => {
    const u = await mk({ emailVerified: true });
    const t = await loginAs(u.email);
    const res = await resend(t);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ status: 'already_verified' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(await redis.keys('auth:verify-email:*')).toEqual([]);
  });

  it('a Google user: 409 already_verified', async () => {
    const u = await mk({ authProvider: 'google', googleId: 'g-t223-route-1' });
    const t = await sessionFor(u);
    const res = await resend(t);
    expect(res.status).toBe(409);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a user deleted after sign-in: 404 not_found (or 401), never 202', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    await rawUsers().deleteOne({ _id: u._id });
    const res = await resend(t);
    expect([401, 404]).toContain(res.status);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('Redis errors: 503 service_unavailable, nothing enqueued, no error text leaked', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    breakCapStore('reject');
    const res = await resend(t);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'service_unavailable' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).not.toContain('secret-detail');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('all of Redis down (the session check fails first): 503, never 202, nothing enqueued', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis exploded'));
    jest.spyOn(redis, 'exists').mockRejectedValue(new Error('redis exploded'));
    const res = await resend(t);
    expect([401, 503]).toContain(res.status);
    expect(res.status).not.toBe(202);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueue failure after the cap is claimed still answers 202 (fire-and-forget)', async () => {
    enqueueMock.mockRejectedValue(new Error('queue down'));
    const u = await mk();
    const t = await loginAs(u.email);
    const res = await resend(t);
    expect(res.status).toBe(202);
  });

  it('five per day: after five sends (minute key cleared between) the sixth is 429 with a long retryAfter', async () => {
    const u = await mk();
    const t = await loginAs(u.email);
    for (let i = 0; i < 5; i += 1) {
      expect((await resend(t)).status).toBe(202);
      await redis.del(`auth:verify-email:min:${String(u._id)}`);
    }
    const res = await resend(t);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(60);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
    expect(enqueueMock).toHaveBeenCalledTimes(5);
  });
});

// ── AC4: GET /me emailVerified and hasGoogle ────────────────────────────────

describe('T-223 AC4 GET /me emailVerified and hasGoogle', () => {
  const me = async (token: string) => {
    const res = await supertest(app).get('/me').set(bearer(token));
    expect(res.status).toBe(200);
    return res.body.data as { emailVerified: unknown; hasGoogle: unknown };
  };

  it('email user, unverified: { false, false }', async () => {
    const u = await mk();
    const d = await me(await loginAs(u.email));
    expect(d.emailVerified).toBe(false);
    expect(d.hasGoogle).toBe(false);
  });

  it('email user, verified: { true, false }', async () => {
    const u = await mk({ emailVerified: true });
    const d = await me(await loginAs(u.email));
    expect(d.emailVerified).toBe(true);
    expect(d.hasGoogle).toBe(false);
  });

  it('Google user (authProvider google + googleId): hasGoogle true', async () => {
    const u = await mk({ authProvider: 'google', googleId: 'g-t223-me-1', emailVerified: false });
    const d = await me(await sessionFor(u));
    expect(d.hasGoogle).toBe(true);
    expect(d.emailVerified).toBe(false); // a boolean either way, never undefined
  });

  it('Google provider without a googleId: hasGoogle true', async () => {
    const u = await mk({ authProvider: 'google' });
    const d = await me(await sessionFor(u));
    expect(d.hasGoogle).toBe(true);
  });

  it('email user with a linked googleId: hasGoogle true, emailVerified still false', async () => {
    const u = await mk({ googleId: 'g-t223-me-2' });
    const d = await me(await loginAs(u.email));
    expect(d.hasGoogle).toBe(true);
    expect(d.emailVerified).toBe(false);
  });

  it('email user with an empty-string googleId: hasGoogle false', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $set: { googleId: '' } });
    const d = await me(await loginAs(u.email));
    expect(d.hasGoogle).toBe(false);
  });

  it('a user with no emailVerified field at all: emailVerified is the boolean false', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $unset: { emailVerified: 1 } });
    const d = await me(await loginAs(u.email));
    expect(d.emailVerified).toBe(false);
  });

  it('/me never exposes the googleId or the link fields', async () => {
    const u = await mk({ googleId: 'g-t223-me-3' });
    await mintToken(u._id).catch(() => undefined);
    const res = await supertest(app)
      .get('/me')
      .set(bearer(await loginAs(u.email)));
    expect(res.text).not.toContain('g-t223-me-3');
    expect(res.text).not.toContain('emailVerifyTokenHash');
  });
});

// ── End to end ──────────────────────────────────────────────────────────────

describe('T-223 end to end in auth: register -> mint -> verify -> /me', () => {
  it('register queues; the minted link verifies once; /me flips; bonus once', async () => {
    const reg = await supertest(app)
      .post('/register')
      .send({ email: 't223-e2e@example.com', password: PASSWORD, name: 'E2E Person' });
    expect(reg.status).toBe(201);
    const data = reg.body.data as { accessToken?: string; tokens?: { accessToken: string } };
    const access = (data.tokens?.accessToken ?? data.accessToken) as string;
    await waitFor(async () => enqueueMock.mock.calls.length === 1);

    const u = await User.findOne({ email: 't223-e2e@example.com' }).lean();
    const userId = String(u!._id);
    expect(enqueueMock).toHaveBeenCalledWith({ template: 'auth.verifyEmail', userId });

    // before: /me says unverified and no bonus
    const before = await supertest(app).get('/me').set(bearer(access));
    expect(before.body.data.emailVerified).toBe(false);
    expect(await bonusRows(u!._id)).toBe(0);

    // what the worker does: mint through the internal route
    const minted = await supertest(app)
      .post('/internal/verify-email/mint')
      .set('x-internal-secret', SECRET)
      .send({ userId });
    expect(minted.status).toBe(200);
    expect(minted.body.email).toBe('t223-e2e@example.com');
    const token = tokenOf(minted.body.link as string);
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    // the user opens the link
    const v = await verify({ token });
    expect(v.status).toBe(200);
    expect(v.body).toEqual({ status: 'verified' });

    const after = await supertest(app).get('/me').set(bearer(access));
    expect(after.body.data.emailVerified).toBe(true);
    expect(after.body.data.hasGoogle).toBe(false);
    expect(await bonusRows(u!._id)).toBe(1);

    // replay: 400, still one bonus; resend now says already verified
    expect((await verify({ token })).status).toBe(400);
    expect(await bonusRows(u!._id)).toBe(1);
    expect((await raw(u!._id)).inkTopup).toBe(10);
    const rs = await supertest(app).post('/verify-email/resend').set(bearer(access));
    expect(rs.status).toBe(409);

    // the token never reached a log
    expect(allLogged()).not.toContain(token);
    expect(allLogged()).not.toContain('t223-e2e@example.com');
  });

  it('a resend replaces the link: the first minted link dies, the second verifies', async () => {
    const u = await mk();
    const first = await supertest(app)
      .post('/internal/verify-email/mint')
      .set('x-internal-secret', SECRET)
      .send({ userId: String(u._id) });
    const second = await supertest(app)
      .post('/internal/verify-email/mint')
      .set('x-internal-secret', SECRET)
      .send({ userId: String(u._id) });
    const t1 = tokenOf(first.body.link as string);
    const t2 = tokenOf(second.body.link as string);
    expect((await verify({ token: t1 })).status).toBe(400);
    expect((await verify({ token: t2 })).status).toBe(200);
  });
});
