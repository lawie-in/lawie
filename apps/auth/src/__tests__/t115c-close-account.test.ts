/**
 * T-115c — DELETE /me and the auth side of the erase (Arjun's rulings 1-5; Ajay e13d474,
 * 8067679, ef06e89, fc0d74d). Real app, in-memory Mongo, ioredis-mock; drafting and billing
 * are a mocked global.fetch (no network).
 *
 * Covers: every branch of DELETE /me, no write before a 403/409/503, Google-only authAt
 * (fresh, stale, missing, future), a wrong email, Admin, the golden-set user, resume after a
 * failure at each stage, 202 on a drafting 500, the hard delete + stripped account_delete
 * audit row, the sweep, a locked account's login/refresh/Google, authAt at login/signup/refresh,
 * and Ajay's "nothing holds the email, name or referral code afterwards".
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import mongoose, { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { AuditLog } from '../models/AuditLog.model';
import { ReferralCode } from '../models/ReferralCode.model';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  ACCOUNT_ERASE_SWEEP_BATCH,
  GOLDEN_SET_USER_ID,
  REAUTH_WINDOW_MS,
  runAccountErase,
  runAccountEraseSweep,
  startAccountEraseSweep,
  stopAccountEraseSweep,
} from '../services/account-erase.service';
import { signAccessToken, signRefreshToken } from '../services/jwt.service';
import * as sessionService from '../services/session.service';
import { createSession, hashToken, validateSession } from '../services/session.service';

const PASSWORD = 'Passw0rdOk';
const EMAIL = 'close.me@example.com';
const NAME = 'Closing Person';
const SECRET = 'test-internal-secret-at-least-16';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// ── fetch mock: billing status, drafting erase, billing erase ────────────────

interface Call {
  url: string;
  method: string;
  secret: string | undefined;
  body: Record<string, unknown> | null;
}
type Plan = { status: number; body: unknown } | 'throw';
const calls: Call[] = [];
const plan: { sub: Plan; drafting: Plan; billing: Plan } = {
  sub: { status: 200, body: { active: false, status: 'none' } },
  drafting: { status: 200, body: { ok: true, counts: { documents: 2 } } },
  billing: { status: 200, body: { ok: true, counts: { couponUsages: 1 } } },
};
function resetPlan() {
  plan.sub = { status: 200, body: { active: false, status: 'none' } };
  plan.drafting = { status: 200, body: { ok: true, counts: { documents: 2 } } };
  plan.billing = { status: 200, body: { ok: true, counts: { couponUsages: 1 } } };
}
const callsTo = (needle: string) => calls.filter((c) => c.url.includes(needle));

beforeEach(async () => {
  await redis.flushall();
  calls.length = 0;
  resetPlan();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      secret: headers['x-internal-secret'],
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const u = String(url);
    const p = u.includes('/internal/subscription-status/')
      ? plan.sub
      : u.startsWith('http://localhost:4002')
        ? plan.drafting
        : plan.billing;
    if (p === 'throw') throw new Error('connect ECONNREFUSED');
    return { status: p.status, json: async () => p.body };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  stopAccountEraseSweep();
  jest.restoreAllMocks();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function seedPasswordUser(email = EMAIL, extra: Record<string, unknown> = {}) {
  const u = await User.create({ email, name: NAME, password: PASSWORD, ...extra });
  return String(u._id);
}
async function login(email = EMAIL) {
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const d = res.body.data as { tokens?: { accessToken: string; refreshToken: string } } & {
    accessToken?: string;
    refreshToken?: string;
  };
  return (d.tokens ?? d) as { accessToken: string; refreshToken: string };
}
async function seedGoogleUser(authAt: string | undefined, email = 'g.person@example.com') {
  const u = await User.create({
    email,
    name: 'Google Person',
    authProvider: 'google',
    googleId: 'g-12345',
  });
  const id = String(u._id);
  const claims = { sub: id, email, name: u.name, role: u.role, plan: u.plan } as Parameters<
    typeof signAccessToken
  >[0];
  const accessToken = signAccessToken(claims);
  const refreshToken = signRefreshToken(claims as Parameters<typeof signRefreshToken>[0]);
  await createSession(
    id,
    accessToken,
    refreshToken,
    { plan: u.plan, email, role: u.role, name: u.name },
    authAt ? { authAt } : {},
  );
  return { id, accessToken, refreshToken };
}
const del = (token: string, body: Record<string, unknown> = {}) =>
  supertest(app).delete('/me').set(bearer(token)).send(body);

async function expectUntouched(id: string, token: string) {
  const u = await User.findById(id).lean();
  expect(u).not.toBeNull();
  expect(u!.isActive).toBe(true);
  expect(u!.erasure).toBeUndefined();
  expect(await validateSession(id, hashToken(token))).not.toBeNull();
  expect(await Session.countDocuments({ userId: new Types.ObjectId(id) })).toBeGreaterThan(0);
  expect((await supertest(app).get('/me').set(bearer(token))).status).toBe(200);
  expect(callsTo('/internal/erase-user')).toHaveLength(0);
}
const stageOf = async (id: string) =>
  (await User.findById(id).lean())?.erasure?.stage as string | undefined;

async function seedAudit(id: string) {
  const uid = new Types.ObjectId(id);
  for (const eventType of [
    'login',
    'logout',
    'payment',
    'data_export',
    'plan_change',
    'password_change',
  ] as const) {
    await AuditLog.create({
      userId: uid,
      eventType,
      severity: 'warning',
      ipAddress: '203.0.113.9',
      metadata: { note: EMAIL, name: NAME },
    });
  }
}

// ── DELETE /me, refusals: nothing written ────────────────────────────────────

describe('DELETE /me — refusals write nothing', () => {
  it('401 without a token, with a bad token, and with a revoked session', async () => {
    expect((await supertest(app).delete('/me').send({ password: PASSWORD })).status).toBe(401);
    expect((await del('not-a-jwt', { password: PASSWORD })).status).toBe(401);
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await sessionService.deleteAllUserSessions(id);
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(401);
    expect(await User.findById(id)).not.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['wrong password', { password: 'Wr0ngPassword' }],
    ['no body', {}],
    ['empty password', { password: '' }],
    ['non-string password', { password: { $ne: '' } }],
    ['numeric password', { password: 12345678 }],
    ['password over 1024 chars', { password: 'a'.repeat(1025) }],
    ['an email instead of a password', { email: EMAIL }],
  ])('403 wrong_password (never 401) for %s; user and sessions unchanged', async (_n, body) => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    const res = await del(accessToken, body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'wrong_password' });
    expect(res.headers['cache-control']).toBe('no-store');
    await expectUntouched(id, accessToken);
    expect(callsTo('subscription-status')).toHaveLength(0);
  });

  it('403 not_closable for an Admin, even with the right password; nothing changes', async () => {
    const id = await seedPasswordUser('admin@example.com', { role: 'Admin' });
    const { accessToken } = await login('admin@example.com');
    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'not_closable' });
    await expectUntouched(id, accessToken);
    expect(calls).toHaveLength(0);
  });

  it('401 and no internal calls for the golden-set fixture user id', async () => {
    const claims = { sub: GOLDEN_SET_USER_ID, email: 'x@example.com', name: 'x', role: 'Lawyer' };
    const at = signAccessToken(claims as Parameters<typeof signAccessToken>[0]);
    const rt = signRefreshToken(claims as Parameters<typeof signRefreshToken>[0]);
    await createSession(
      GOLDEN_SET_USER_ID,
      at,
      rt,
      { plan: 'free', email: 'x@example.com', role: 'Lawyer', name: 'x' },
      { authAt: new Date().toISOString() },
    );
    const res = await del(at, { password: PASSWORD, email: 'x@example.com' });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(await validateSession(GOLDEN_SET_USER_ID, hashToken(at))).not.toBeNull();
  });

  it('401 for a user id with no User document', async () => {
    const ghost = new Types.ObjectId().toString();
    const claims = { sub: ghost, email: 'ghost@example.com', name: 'g', role: 'Lawyer' };
    const at = signAccessToken(claims as Parameters<typeof signAccessToken>[0]);
    const rt = signRefreshToken(claims as Parameters<typeof signRefreshToken>[0]);
    await createSession(ghost, at, rt, {
      plan: 'free',
      email: 'ghost@example.com',
      role: 'Lawyer',
      name: 'g',
    });
    expect((await del(at, { password: PASSWORD })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it.each(['active', 'authenticated', 'pending', 'halted', 'paused', 'some_new_status'])(
    '409 subscription_active when billing says %s; user and sessions unchanged',
    async (status) => {
      const id = await seedPasswordUser();
      const { accessToken } = await login();
      plan.sub = { status: 200, body: { active: true, status } };
      const res = await del(accessToken, { password: PASSWORD });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'subscription_active' });
      await expectUntouched(id, accessToken);
      expect(callsTo('subscription-status')).toHaveLength(1);
    },
  );

  it.each([
    ['billing unreachable', 'throw' as Plan],
    ['billing 500', { status: 500, body: { error: 'x' } } as Plan],
    ['billing 401 (secret mismatch)', { status: 401, body: {} } as Plan],
    ['billing answers a malformed body', { status: 200, body: { status: 'active' } } as Plan],
    ['billing answers a non-JSON body', { status: 200, body: null } as Plan],
  ])('503 billing_unavailable when %s; nothing changed', async (_n, p) => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.sub = p;
    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'billing_unavailable' });
    await expectUntouched(id, accessToken);
  });

  it('the subscription check is a GET to billing with the internal secret', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.sub = { status: 200, body: { active: true, status: 'active' } };
    await del(accessToken, { password: PASSWORD });
    const c = callsTo('subscription-status')[0];
    expect(c.method).toBe('GET');
    expect(c.url).toBe(`http://localhost:4003/internal/subscription-status/${id}`);
    expect(c.secret).toBe(SECRET);
  });
});

// ── Google-only re-proof ─────────────────────────────────────────────────────

describe('DELETE /me — Google-only (typed email + authAt under 15 minutes)', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('the window is 15 minutes', () => {
    expect(REAUTH_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('fresh authAt + typed email: 200 done and the user is gone', async () => {
    const g = await seedGoogleUser(ago(60_000));
    const res = await del(g.accessToken, { email: 'g.person@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'done' });
    expect(await User.findById(g.id)).toBeNull();
  });

  it('the typed email is trimmed and case-insensitive', async () => {
    const g = await seedGoogleUser(ago(1000));
    expect((await del(g.accessToken, { email: '  G.Person@Example.COM ' })).status).toBe(200);
  });

  it('just inside the window passes (14 min), just outside is reauth_required (16 min)', async () => {
    const inside = await seedGoogleUser(ago(14 * 60_000), 'in@example.com');
    expect((await del(inside.accessToken, { email: 'in@example.com' })).status).toBe(200);
    calls.length = 0;
    const outside = await seedGoogleUser(ago(16 * 60_000), 'out@example.com');
    const res = await del(outside.accessToken, { email: 'out@example.com' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'reauth_required' });
    await expectUntouched(outside.id, outside.accessToken);
  });

  it('missing authAt (a session from before T-115c): 403 reauth_required, nothing written', async () => {
    const g = await seedGoogleUser(undefined);
    const res = await del(g.accessToken, { email: 'g.person@example.com' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'reauth_required' });
    await expectUntouched(g.id, g.accessToken);
    expect(callsTo('subscription-status')).toHaveLength(0);
  });

  it('an authAt in the future or not a date: 403 reauth_required', async () => {
    const future = await seedGoogleUser(
      new Date(Date.now() + 3_600_000).toISOString(),
      'future@example.com',
    );
    expect((await del(future.accessToken, { email: 'future@example.com' })).body).toEqual({
      error: 'reauth_required',
    });
    const junk = await seedGoogleUser('not-a-date', 'junk@example.com');
    expect((await del(junk.accessToken, { email: 'junk@example.com' })).body).toEqual({
      error: 'reauth_required',
    });
  });

  it.each([
    ['a different email', { email: 'someone.else@example.com' }],
    ['no email', {}],
    ['a non-string email', { email: ['g.person@example.com'] }],
    ['an over-long email', { email: `${'a'.repeat(400)}@example.com` }],
    ['a password instead (there is none)', { password: PASSWORD }],
  ])('403 wrong_password for %s, even with a fresh authAt; nothing changes', async (_n, body) => {
    const g = await seedGoogleUser(ago(1000));
    const res = await del(g.accessToken, body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'wrong_password' });
    await expectUntouched(g.id, g.accessToken);
  });

  it('a wrong email on a password account is also wrong_password (the password is what counts)', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    const res = await del(accessToken, { email: EMAIL });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'wrong_password' });
    await expectUntouched(id, accessToken);
  });

  it('a Google account that also has a password is re-proved by the password', async () => {
    const id = await seedPasswordUser('both@example.com', { googleId: 'g-both' });
    const { accessToken } = await login('both@example.com');
    expect((await del(accessToken, { email: 'both@example.com' })).status).toBe(403);
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(200);
    expect(await User.findById(id)).toBeNull();
  });
});

// ── authAt is set at login, signup and carried through refresh ──────────────

describe('authAt on sessions', () => {
  it('login sets authAt (recent) on the session', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    const s = await validateSession(id, hashToken(accessToken));
    expect(Date.now() - Date.parse(s!.authAt!)).toBeLessThan(10_000);
  });

  it('the first login after a (neutral) register sets authAt on the session', async () => {
    const res = await supertest(app).post('/register').send({
      email: 'fresh.signup@example.com',
      password: PASSWORD,
      name: 'Fresh Signup',
      termsAccepted: true,
    });
    if (res.status !== 202) {
      // Registration payload shape is the existing contract; fail loudly with the reason.
      throw new Error(`register answered ${res.status}: ${JSON.stringify(res.body)}`);
    }
    // T-522: register gives no session. The first sign-in (login) sets authAt.
    const u = await User.findOne({ email: 'fresh.signup@example.com' }).lean();
    const token = (await login('fresh.signup@example.com')).accessToken;
    const s = await validateSession(String(u!._id), hashToken(token));
    expect(Date.now() - Date.parse(s!.authAt!)).toBeLessThan(10_000);
  });

  it('refresh keeps the OLD authAt (a refresh never makes it newer)', async () => {
    const id = await seedPasswordUser();
    const first = await login();
    // Age the stored authAt by rewriting both Redis keys.
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    const aKey = `session:${id}:${hashToken(first.accessToken)}`;
    const rKey = `session:refresh:${id}:${hashToken(first.refreshToken)}`;
    const a = JSON.parse((await redis.get(aKey))!);
    const r = JSON.parse((await redis.get(rKey))!);
    await redis.set(aKey, JSON.stringify({ ...a, authAt: old }), 'EX', 600);
    await redis.set(rKey, JSON.stringify({ ...r, authAt: old }), 'EX', 600);
    const res = await supertest(app).post('/refresh').send({ refreshToken: first.refreshToken });
    expect(res.status).toBe(200);
    const d = res.body.data as { accessToken?: string; tokens?: { accessToken: string } };
    const newAccess = (d.accessToken ?? d.tokens?.accessToken)!;
    const s = await validateSession(id, hashToken(newAccess));
    expect(s!.authAt).toBe(old);
  });

  it('a refreshed session of a Google-only user older than 15 minutes cannot close the account', async () => {
    const g = await seedGoogleUser(new Date(Date.now() - 20 * 60_000).toISOString());
    const res = await supertest(app).post('/refresh').send({ refreshToken: g.refreshToken });
    expect(res.status).toBe(200);
    const d = res.body.data as { accessToken?: string; tokens?: { accessToken: string } };
    const newAccess = (d.accessToken ?? d.tokens?.accessToken)!;
    const del2 = await del(newAccess, { email: 'g.person@example.com' });
    expect(del2.status).toBe(403);
    expect(del2.body).toEqual({ error: 'reauth_required' });
  });

  it('GET /me reports hasPassword true for a password account and false for Google-only', async () => {
    await seedPasswordUser();
    const { accessToken } = await login();
    expect((await supertest(app).get('/me').set(bearer(accessToken))).body.data.hasPassword).toBe(
      true,
    );
    const g = await seedGoogleUser(new Date().toISOString());
    const me = await supertest(app).get('/me').set(bearer(g.accessToken));
    expect(me.body.data.hasPassword).toBe(false);
    expect(me.body.data.hasGoogle).toBe(true);
  });
});

// ── The happy path ───────────────────────────────────────────────────────────

describe('DELETE /me — 200 done', () => {
  it('erases in order, hard-deletes the User, leaves a stripped account_delete row', async () => {
    const other = await seedPasswordUser('other@example.com');
    await seedAudit(other);
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await seedAudit(id);
    await redis.set(`auth:verify-email:min:${id}`, '1');
    await redis.set(`auth:verify-email:day:${id}`, '1');
    await redis.set(`rl:${id}`, '1');
    await redis.set(`rl:${other}`, '1');

    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'done' });

    // Order: status check, drafting, then billing.
    expect(calls.map((c) => `${c.method} ${c.url.replace('http://localhost:', '')}`)).toEqual([
      `GET 4003/internal/subscription-status/${id}`,
      'POST 4002/internal/erase-user',
      'POST 4003/internal/erase-user',
      // The race recheck: both erases once more, right before the User document goes.
      'POST 4002/internal/erase-user',
      'POST 4003/internal/erase-user',
    ]);
    expect(calls.every((c) => c.secret === SECRET)).toBe(true);
    expect(calls[3].body).toEqual({ userId: id, email: EMAIL });
    expect(calls[4].body).toEqual({ userId: id });
    expect(calls[1].body).toEqual({ userId: id, email: EMAIL });
    expect(calls[2].body).toEqual({ userId: id });

    // No User document (no placeholder), no sessions, no Redis keys of the user.
    expect(await User.collection.findOne({ _id: new Types.ObjectId(id) })).toBeNull();
    expect(await Session.countDocuments({ userId: new Types.ObjectId(id) })).toBe(0);
    const keys = await redis.keys('*');
    expect(keys.filter((k) => k.includes(id))).toEqual([]);
    expect(keys).toContain(`rl:${other}`);

    // Audit: payment + account_delete only, stripped to userId, type and time.
    const rows = await AuditLog.collection.find({ userId: new Types.ObjectId(id) }).toArray();
    expect(rows.map((r) => r.eventType).sort()).toEqual(['account_delete', 'payment']);
    for (const r of rows) {
      const k = Object.keys(r).filter((x) => x !== '_id' && x !== '__v');
      expect(k.sort()).toEqual(['createdAt', 'eventType', 'userId']);
      expect(r.createdAt).toBeInstanceOf(Date);
    }
    // Another user's audit rows are untouched.
    expect(await AuditLog.countDocuments({ userId: new Types.ObjectId(other) })).toBe(6);
    expect(await User.findById(other)).not.toBeNull();
  });

  it('the access token is dead afterwards, and the email can sign up again as a new user', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await del(accessToken, { password: PASSWORD });
    expect((await supertest(app).get('/me').set(bearer(accessToken))).status).toBe(401);
    expect(
      (await supertest(app).post('/login').send({ email: EMAIL, password: PASSWORD })).status,
    ).toBe(401);
    const again = await User.create({ email: EMAIL, name: 'New Person', password: PASSWORD });
    expect(String(again._id)).not.toBe(id);
  });

  it('a second DELETE with the same token is 401 and changes nothing', async () => {
    await seedPasswordUser();
    const { accessToken } = await login();
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(200);
    const n = calls.length;
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(401);
    expect(calls).toHaveLength(n);
  });

  it('logs no email, name or password (userId, stage and counts only)', async () => {
    const lines: string[] = [];
    for (const lvl of ['info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(logger, lvl).mockImplementation(((...a: unknown[]) => {
        lines.push(JSON.stringify(a));
      }) as never);
    }
    await seedPasswordUser();
    const { accessToken } = await login();
    plan.drafting = { status: 500, body: { error: 'x' } };
    await del(accessToken, { password: PASSWORD });
    plan.drafting = { status: 200, body: { ok: true, counts: {} } };
    await runAccountEraseSweep();
    const blob = lines.join('\n');
    expect(blob).not.toContain(EMAIL);
    expect(blob).not.toContain(NAME);
    expect(blob).not.toContain(PASSWORD);
  });
});

// ── Failure and resume ───────────────────────────────────────────────────────

describe('DELETE /me — 202 pending and resume at each stage', () => {
  it('drafting 500: 202, account locked at "locked", signed out, sweep finishes it', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.drafting = { status: 500, body: { ok: false, failedAt: 'redis' } };
    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'pending' });
    const u = await User.findById(id).lean();
    expect(u!.isActive).toBe(false);
    expect(u!.erasure!.stage).toBe('locked');
    expect(u!.erasure!.attempts).toBe(1);
    expect(await validateSession(id, hashToken(accessToken))).toBeNull();
    expect(callsTo('4003/internal/erase-user')).toHaveLength(0);

    resetPlan();
    const sweep = await runAccountEraseSweep();
    expect(sweep).toEqual({ found: 1, finished: 1, pending: 0 });
    expect(await User.findById(id)).toBeNull();
    expect(
      await AuditLog.exists({ userId: new Types.ObjectId(id), eventType: 'account_delete' }),
    ).toBeTruthy();
  });

  it('drafting unreachable (fetch throws) is also 202', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.drafting = 'throw';
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(202);
    expect(await stageOf(id)).toBe('locked');
  });

  it('drafting answering 200 without ok:true counts as a failure', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.drafting = { status: 200, body: { ok: false } };
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(202);
    expect(await stageOf(id)).toBe('locked');
  });

  it('billing failure: 202 at drafting_erased; resume does not call drafting again', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.billing = { status: 500, body: {} };
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(202);
    expect(await stageOf(id)).toBe('drafting_erased');
    const draftingCalls = callsTo('4002/internal/erase-user').length;
    expect(draftingCalls).toBe(1);

    plan.billing = { status: 200, body: { ok: true, counts: {} } };
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    // Only the recheck calls drafting again; the drafting step is not re-run.
    expect(callsTo('4002/internal/erase-user')).toHaveLength(draftingCalls + 1);
    expect(await User.findById(id)).toBeNull();
  });

  it('auth-data failure: 202 at billing_erased; resume skips both remote calls', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    const spy = jest
      .spyOn(sessionService, 'deleteAllUserSessions')
      .mockRejectedValue(new Error('redis down'));
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(202);
    expect(await stageOf(id)).toBe('billing_erased');
    expect((await User.findById(id).lean())!.isActive).toBe(false);
    spy.mockRestore();
    const before = calls.length;
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    // Neither remote STEP is re-run; only the final recheck calls each service once.
    expect(calls).toHaveLength(before + 2);
    expect(calls.slice(before).map((c) => c.url.replace('http://localhost:', ''))).toEqual([
      '4002/internal/erase-user',
      '4003/internal/erase-user',
    ]);
    expect(await Session.countDocuments({ userId: new Types.ObjectId(id) })).toBe(0);
    expect(await User.findById(id)).toBeNull();
  });

  it('audit failure: 202 at auth_data_erased; resume finishes with one account_delete row', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await seedAudit(id);
    const spy = jest
      .spyOn(AuditLog.collection, 'updateOne')
      .mockRejectedValueOnce(new Error('mongo hiccup'));
    expect((await del(accessToken, { password: PASSWORD })).status).toBe(202);
    expect(await stageOf(id)).toBe('auth_data_erased');
    expect(await User.findById(id)).not.toBeNull();
    spy.mockRestore();
    expect((await runAccountErase(id)).done).toBe(true);
    const rows = await AuditLog.collection.find({ userId: new Types.ObjectId(id) }).toArray();
    expect(rows.map((r) => r.eventType).sort()).toEqual(['account_delete', 'payment']);
  });

  it('final delete failure: 202 at audit_done with the user kept; resume deletes it', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    jest.spyOn(User, 'deleteOne').mockRejectedValueOnce(new Error('mongo hiccup') as never);
    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(202);
    expect(await stageOf(id)).toBe('audit_done');
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    expect(await User.findById(id)).toBeNull();
  });

  it('runAccountErase reports failedAt for each failing step', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    plan.drafting = { status: 500, body: {} };
    await del(accessToken, { password: PASSWORD });
    expect((await runAccountErase(id)).failedAt).toBe('drafting_erased');
    resetPlan();
    plan.billing = 'throw';
    expect((await runAccountErase(id)).failedAt).toBe('billing_erased');
  });

  it('runAccountErase never erases an account that was not locked', async () => {
    const id = await seedPasswordUser();
    const run = await runAccountErase(id);
    expect(run.done).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await User.findById(id)).not.toBeNull();
  });

  it('a finished erase run again is "done" (no User, account_delete row) and calls nothing', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await del(accessToken, { password: PASSWORD });
    const n = calls.length;
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    expect(calls).toHaveLength(n);
  });

  it('an unknown user with no account_delete row is notFound, not done', async () => {
    const run = await runAccountErase(new Types.ObjectId().toString());
    expect(run).toMatchObject({ done: false, notFound: true });
    expect((await runAccountErase('not-an-id')).done).toBe(false);
  });

  it('dry run reads counts from drafting and billing with dryRun:true and changes nothing', async () => {
    const id = await seedPasswordUser();
    await login();
    await seedAudit(id);
    const run = await runAccountErase(id, { dryRun: true });
    expect(run.done).toBe(true);
    expect(run.dryRun).toBe(true);
    expect(callsTo('4002/internal/erase-user')[0].body).toEqual({
      userId: id,
      email: EMAIL,
      dryRun: true,
    });
    expect(callsTo('4003/internal/erase-user')[0].body).toEqual({ userId: id, dryRun: true });
    expect(run.counts.auth).toMatchObject({
      users: 1,
      auditDeleted: 5,
      auditKept: 1,
      auditWritten: 1,
    });
    const u = await User.findById(id).lean();
    expect(u!.isActive).toBe(true);
    expect(u!.erasure).toBeUndefined();
    expect(await Session.countDocuments({ userId: new Types.ObjectId(id) })).toBeGreaterThan(0);
    expect(await AuditLog.countDocuments({ userId: new Types.ObjectId(id) })).toBe(6);
    expect(await AuditLog.exists({ eventType: 'account_delete' })).toBeNull();
  });
});

// ── The sweep ────────────────────────────────────────────────────────────────

describe('the erase sweep', () => {
  async function lockedUsers(n: number) {
    const docs = Array.from({ length: n }, (_v, i) => ({
      _id: new Types.ObjectId(),
      email: `locked${i}@example.com`,
      name: `Locked ${i}`,
      isActive: false,
      erasure: { requestedAt: new Date(2026, 9, 1, 0, i), stage: 'locked' },
    }));
    await User.collection.insertMany(docs);
    return docs.map((d) => String(d._id));
  }

  it('picks locked users, finishes them, and leaves unlocked users alone', async () => {
    const ids = await lockedUsers(3);
    const bystander = await seedPasswordUser('bystander@example.com');
    const sweep = await runAccountEraseSweep();
    expect(sweep).toEqual({ found: 3, finished: 3, pending: 0 });
    for (const id of ids) expect(await User.findById(id)).toBeNull();
    expect(await User.findById(bystander)).not.toBeNull();
    // Each user: the drafting step and the recheck.
    expect(callsTo('4002/internal/erase-user')).toHaveLength(6);
  });

  it('resumes from the stored stage', async () => {
    const [id] = await lockedUsers(1);
    await User.updateOne({ _id: id }, { $set: { 'erasure.stage': 'billing_erased' } });
    await runAccountEraseSweep();
    // No step re-run; only the recheck, drafting then billing.
    expect(calls.map((c) => c.url.replace('http://localhost:', ''))).toEqual([
      '4002/internal/erase-user',
      '4003/internal/erase-user',
    ]);
    expect(await User.findById(id)).toBeNull();
  });

  it('takes at most 50 users per run, oldest request first', async () => {
    expect(ACCOUNT_ERASE_SWEEP_BATCH).toBe(50);
    const ids = await lockedUsers(52);
    const sweep = await runAccountEraseSweep();
    expect(sweep.found).toBe(50);
    expect(await User.countDocuments({ 'erasure.requestedAt': { $exists: true } })).toBe(2);
    const left = await User.find({ 'erasure.requestedAt': { $exists: true } }).lean();
    expect(left.map((u) => String(u._id)).sort()).toEqual(ids.slice(50).sort());
  });

  it('counts a user that fails as pending and keeps it locked', async () => {
    const [id] = await lockedUsers(1);
    plan.billing = { status: 500, body: {} };
    const sweep = await runAccountEraseSweep();
    expect(sweep).toEqual({ found: 1, finished: 0, pending: 1 });
    expect(await User.findById(id)).not.toBeNull();
  });

  it('never throws, even when the user query fails', async () => {
    jest.spyOn(User, 'find').mockImplementation((() => {
      throw new Error('mongo down');
    }) as never);
    await expect(runAccountEraseSweep()).resolves.toEqual({ found: 0, finished: 0, pending: 0 });
  });

  it('start runs once at boot and again on the interval; a second start is a no-op; runs never overlap', async () => {
    await lockedUsers(1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('http://localhost:4002')) await gate;
      return inner(url, init);
    }) as unknown as typeof fetch;

    startAccountEraseSweep(20);
    startAccountEraseSweep(20); // no-op
    await new Promise((r) => setTimeout(r, 200)); // many intervals pass while the first run waits
    const stuckCalls = (global.fetch as jest.Mock).mock.calls.filter(([u]) =>
      String(u).startsWith('http://localhost:4002'),
    ).length;
    expect(stuckCalls).toBe(1); // no overlapping run started a second erase
    release();
    await new Promise((r) => setTimeout(r, 300));
    expect(await User.countDocuments({ 'erasure.requestedAt': { $exists: true } })).toBe(0);
    stopAccountEraseSweep();
  });
});

// ── A locked account cannot come back ────────────────────────────────────────

describe('a locked account cannot log in, refresh or use Google', () => {
  it('login with the right password is refused (403), no session is made', async () => {
    const id = await seedPasswordUser();
    const { accessToken, refreshToken } = await login();
    plan.drafting = { status: 500, body: {} };
    await del(accessToken, { password: PASSWORD });
    const res = await supertest(app).post('/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await Session.countDocuments({ userId: new Types.ObjectId(id) })).toBe(0);
    expect((await redis.keys('session:*')).filter((k) => k.includes(id))).toEqual([]);
    // The old refresh token is dead too.
    const rr = await supertest(app).post('/refresh').send({ refreshToken });
    expect(rr.status).toBe(401);
  });

  it('refresh for a locked user is 401 even if its refresh key survived', async () => {
    const id = await seedPasswordUser();
    const { refreshToken } = await login();
    await User.updateOne(
      { _id: id },
      { $set: { isActive: false, erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    const rr = await supertest(app).post('/refresh').send({ refreshToken });
    expect(rr.status).toBe(401);
  });

  it('a locked user cannot reach DELETE /me again', async () => {
    const id = await seedPasswordUser();
    const { accessToken } = await login();
    await User.updateOne(
      { _id: id },
      { $set: { isActive: false, erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    const res = await del(accessToken, { password: PASSWORD });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

// ── Ajay: nothing holds the email, name or referral code afterwards ─────────

describe('after erasure nothing under that userId holds the email, name or referral code', () => {
  it('scans every auth collection and every Redis key', async () => {
    const owner = new Types.ObjectId();
    const code = await ReferralCode.create({ code: 'AJAYCODE1', createdBy: owner, bonusInk: 3 });
    const id = await seedPasswordUser(EMAIL, { referredVia: code._id, phone: '+919999999999' });
    const { accessToken } = await login();
    await seedAudit(id);
    await redis.set(`auth:verify-email:min:${id}`, EMAIL);
    await AuditLog.create({
      userId: new Types.ObjectId(id),
      eventType: 'payment',
      metadata: { c: 'AJAYCODE1' },
    });

    expect((await del(accessToken, { password: PASSWORD })).status).toBe(200);

    const db = mongoose.connection.db!;
    const needles = [EMAIL, NAME, 'AJAYCODE1', '+919999999999'];
    for (const c of await db.collections()) {
      for (const doc of await c.find({}).toArray()) {
        const txt = JSON.stringify(doc);
        const mentionsUser = txt.includes(id);
        // Any doc that refers to the user, or the user's own data, must hold none of them. The
        // referral code collection is the campaign's, not the user's: it keeps its own code.
        if (c.collectionName === 'referralcodes') continue;
        for (const n of needles) {
          expect({ c: c.collectionName, mentionsUser, leaks: txt.includes(n) }).toMatchObject({
            leaks: false,
          });
        }
        if (mentionsUser) {
          expect(['auditlogs']).toContain(c.collectionName);
        }
      }
    }
    for (const k of await redis.keys('*')) {
      expect(k).not.toContain(id);
      expect(await redis.get(k)).not.toContain(EMAIL);
    }
  });
});
