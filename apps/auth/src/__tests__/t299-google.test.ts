/**
 * T-299 Google sign-in (Arjun rulings 1, 5, 6):
 *  1. new Google accounts are authProvider 'google'; a linked password account keeps 'email';
 *  5. a deactivated account gets no session, no one-time code, redirect to account_deactivated,
 *     and nothing is written (no link, no unset, no Terms stamp);
 *  6. linking unsets the password, clears the reset token, revokes every earlier session, and the
 *     new Google session is created after the revoke.
 *
 * Real oauth routes, real passport verify callback (captured from the Strategy mock), real session
 * service. The passport stub honours the custom authenticate callback the route now uses.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
    FRONTEND_URL: 'http://localhost:3000',
    JWT_SECRET: 'test-jwt-secret-key-at-least-32-chars-long',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-at-least-32-chars',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}));

type Done = (err: unknown, user?: unknown, info?: unknown) => void;
type Verify = (
  req: unknown,
  at: string,
  rt: string,
  profile: Record<string, unknown>,
  done: Done,
) => Promise<void>;

let verify: Verify;
let nextProfile: Record<string, unknown>;

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: Verify) {
      verify = cb;
    }
  },
}));

jest.mock('passport', () => ({
  __esModule: true,
  default: {
    use: jest.fn(),
    initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authenticate:
      (
        _name: string,
        opts: { state?: string } = {},
        callback?: (err: unknown, user: unknown, info?: unknown) => void,
      ) =>
      (req: any, res: any, next: any) => {
        if (opts.state !== undefined) {
          const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          u.searchParams.set('state', opts.state);
          return res.redirect(u.toString());
        }
        return void verify(req, 'at', 'rt', nextProfile, (err, user, info) => {
          // Honour the custom callback exactly as passport does; fall back to failureRedirect.
          if (callback) return callback(err, user, info);
          if (err) return next(err);
          if (!user) return res.redirect('http://localhost:3000/login?error=oauth_failed');
          req.user = user;
          return next();
        });
      },
  },
}));

import './setupDb';

import express from 'express';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { challengeForVerifier } from '../services/oauth-state';
import { createSession, hashToken, validateSession } from '../services/session.service';
import * as sessionService from '../services/session.service';
import crypto from 'crypto';

import { rawUsers, waitForSeed } from './t234-helpers';

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

const PASSWORD = 'Passw0rdOk';
const FRONT = 'http://localhost:3000';

beforeAll(() => initPassport());
beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

const verifier = () => crypto.randomBytes(32).toString('base64url');

/** /google then /google/callback, with Google answering as the given profile. */
async function googleSignIn(email: string, id: string, v = verifier()) {
  const g = await supertest(server)
    .get('/google')
    .query({ challenge: challengeForVerifier(v) })
    .redirects(0);
  const state = new URL(g.headers.location as string).searchParams.get('state') as string;
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  const res = await supertest(server).get('/google/callback').query({ state }).redirects(0);
  return { res, verifier: v };
}

const codeOf = (res: supertest.Response) =>
  new URL(res.headers.location as string).searchParams.get('code');

/** A password-account session made the way login makes one. */
async function passwordSession(userId: string, email: string) {
  const accessToken = `access-${crypto.randomUUID()}`;
  const refreshToken = `refresh-${crypto.randomUUID()}`;
  await createSession(userId, accessToken, refreshToken, {
    plan: 'free',
    email,
    role: 'Lawyer',
    name: 'P',
  });
  return { accessToken, refreshToken };
}

describe('T-299 ruling 1 — authProvider', () => {
  it("a brand-new Google account is stored with authProvider 'google'", async () => {
    const { res } = await googleSignIn('gnew299@example.com', 'g-new-299');
    expect(res.status).toBe(302);
    const u = await User.findOne({ email: 'gnew299@example.com' }).lean();
    expect(u!.authProvider).toBe('google');
    expect((await rawUsers().findOne({ _id: u!._id }))!.googleId).toBe('g-new-299');
    await waitForSeed(u!._id);
  });

  it("a password account that links Google keeps authProvider 'email'", async () => {
    await User.create({ email: 'plink@example.com', name: 'P', password: PASSWORD });
    const { res } = await googleSignIn('plink@example.com', 'g-plink');
    expect(res.status).toBe(302);
    const u = await User.findOne({ email: 'plink@example.com' }).lean();
    expect(u!.authProvider).toBe('email');
    expect((await rawUsers().findOne({ _id: u!._id }))!.googleId).toBe('g-plink');
  });

  it('a returning Google user keeps authProvider google', async () => {
    await googleSignIn('gret299@example.com', 'g-ret-299');
    await googleSignIn('gret299@example.com', 'g-ret-299');
    expect((await User.findOne({ email: 'gret299@example.com' }).lean())!.authProvider).toBe(
      'google',
    );
  });
});

describe('T-299 ruling 5 — a deactivated account cannot sign in with Google', () => {
  const deactivatedUrl = `${FRONT}/login?error=account_deactivated`;

  async function expectRefused(res: supertest.Response, userId: unknown) {
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(deactivatedUrl);
    expect(res.headers.location).not.toMatch(/code=|token/i);
    expect(await redis.keys('oauth:code:*')).toEqual([]);
    expect(await redis.keys(`session:*${String(userId)}*`)).toEqual([]);
    expect(await Session.countDocuments({ userId })).toBe(0);
  }

  it('returning Google user (found by googleId): refused, nothing written', async () => {
    const u = await User.create({
      email: 'dg1@example.com',
      name: 'D',
      googleId: 'g-dg1',
      isActive: false,
    });
    const before = await rawUsers().findOne({ _id: u._id });
    const { res } = await googleSignIn('dg1@example.com', 'g-dg1');
    await expectRefused(res, u._id);
    // no Terms stamp for the empty acceptance either
    const after = await rawUsers().findOne({ _id: u._id });
    expect(after!.termsAcceptedAt ?? null).toBeNull();
    expect(after).toEqual(before);
  });

  it('deactivated password account with the same email: no link, password kept, no Terms stamp, sessions untouched', async () => {
    const u = await User.create({
      email: 'dg2@example.com',
      name: 'D',
      password: PASSWORD,
      isActive: false,
      passwordResetToken: 'a'.repeat(64),
      passwordResetExpires: new Date(Date.now() + 600_000),
    });
    const keep = await passwordSession(String(u._id), 'dg2@example.com');
    const revokeSpy = jest.spyOn(sessionService, 'deleteAllUserSessions');
    const before = await rawUsers().findOne({ _id: u._id });

    const { res } = await googleSignIn('dg2@example.com', 'g-dg2');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(deactivatedUrl);
    expect(await redis.keys('oauth:code:*')).toEqual([]);
    const after = await rawUsers().findOne({ _id: u._id });
    expect(after).toEqual(before); // googleId, password, reset token, terms: all unchanged
    expect(after!.googleId ?? null).toBeNull();
    expect(after!.password).toBeTruthy();
    expect(after!.termsAcceptedAt ?? null).toBeNull();
    // the link branch did not run, so nothing was revoked either
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(await validateSession(String(u._id), hashToken(keep.accessToken))).not.toBeNull();
  });

  it('a Google user locked in the middle of the flow (isActive false) (found by email) is refused and not linked', async () => {
    const u = await User.create({ email: 'dg3@example.com', name: 'D', isActive: false });
    const { res } = await googleSignIn('dg3@example.com', 'g-dg3');
    await expectRefused(res, u._id);
    expect((await rawUsers().findOne({ _id: u._id }))!.googleId ?? null).toBeNull();
  });

  it('the refusal is not an oauth_failed redirect, and an active user still gets a code', async () => {
    await User.create({ email: 'act@example.com', name: 'A', googleId: 'g-act' });
    const { res } = await googleSignIn('act@example.com', 'g-act');
    expect(res.headers.location).toContain('/auth/callback?code=');
    expect(codeOf(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('the handler itself refuses a deactivated user even if passport let one through', async () => {
    // Second line of defence: a stub that ignores the strategy and hands over an inactive user.
    const u = await User.create({ email: 'dg4@example.com', name: 'D', isActive: false });
    const orig = verify;
    verify = (async (_req, _at, _rt, _p, done) => done(null, await User.findById(u._id))) as Verify;
    try {
      const { res } = await googleSignIn('dg4@example.com', 'g-dg4');
      await expectRefused(res, u._id);
    } finally {
      verify = orig;
    }
  });

  it('a strategy error goes to next() (error handler), not to a redirect with a code', async () => {
    const orig = verify;
    verify = (async (_req, _at, _rt, _p, done) => done(new Error('boom'))) as Verify;
    try {
      const { res } = await googleSignIn('err@example.com', 'g-err');
      expect(res.headers.location ?? '').not.toContain('code=');
      expect(res.status).toBeGreaterThanOrEqual(300);
    } finally {
      verify = orig;
    }
  });

  it('logs no email or name for the refusal', async () => {
    const logger = (await import('../config/logger')).default;
    const spies = (['info', 'warn', 'error'] as const).map((l) =>
      jest.spyOn(logger, l).mockImplementation(() => undefined),
    );
    await User.create({
      email: 'pii299@example.com',
      name: 'Secret Name',
      googleId: 'g-pii',
      isActive: false,
    });
    await googleSignIn('pii299@example.com', 'g-pii');
    const text = JSON.stringify(spies.map((s) => s.mock.calls));
    expect(text).not.toContain('pii299@example.com');
    expect(text).not.toContain('Secret Name');
  });
});

describe('T-299 ruling 6 — linking Google to a password account', () => {
  it('unsets the password, clears the reset token and expiry, revokes every prior session', async () => {
    const u = await User.create({
      email: 'link6@example.com',
      name: 'V',
      password: PASSWORD,
      passwordResetToken: 'f'.repeat(64),
      passwordResetExpires: new Date(Date.now() + 600_000),
    });
    const uid = String(u._id);
    const a = await passwordSession(uid, 'link6@example.com');
    const b = await passwordSession(uid, 'link6@example.com');
    const other = await passwordSession('507f1f77bcf86cd799439099', 'other@example.com');

    const { res, verifier: v } = await googleSignIn('link6@example.com', 'g-link6');
    expect(res.status).toBe(302);

    const raw = await rawUsers().findOne({ _id: u._id });
    expect(raw!.password ?? null).toBeNull();
    expect(raw!.passwordResetToken ?? null).toBeNull();
    expect(raw!.passwordResetExpires ?? null).toBeNull();
    expect(raw!.googleId).toBe('g-link6');

    // every session made before the link is gone, access and refresh
    for (const s of [a, b]) {
      expect(await validateSession(uid, hashToken(s.accessToken))).toBeNull();
      expect(await redis.get(`session:refresh:${uid}:${hashToken(s.refreshToken)}`)).toBeNull();
    }
    // another user's session is untouched
    expect(
      await validateSession('507f1f77bcf86cd799439099', hashToken(other.accessToken)),
    ).not.toBeNull();

    // the new Google session was made after the revoke and works
    const ex = await supertest(server)
      .post('/oauth/exchange')
      .send({ code: codeOf(res), verifier: v });
    expect(ex.status).toBe(200);
    expect(await validateSession(uid, hashToken(ex.body.accessToken))).not.toBeNull();
    expect(
      await redis.get(`session:refresh:${uid}:${hashToken(ex.body.refreshToken)}`),
    ).not.toBeNull();
  });

  it('revokes before it creates: the Google session survives the revoke', async () => {
    const u = await User.create({ email: 'order6@example.com', name: 'V', password: PASSWORD });
    const order: string[] = [];
    const realDelete = sessionService.deleteAllUserSessions;
    const realCreate = sessionService.createSession;
    jest.spyOn(sessionService, 'deleteAllUserSessions').mockImplementation(async (id: string) => {
      order.push('revoke');
      await realDelete(id);
    });
    jest.spyOn(sessionService, 'createSession').mockImplementation(async (...args) => {
      order.push('create');
      return realCreate(...args);
    });
    const { res } = await googleSignIn('order6@example.com', 'g-order6');
    expect(res.status).toBe(302);
    expect(order).toEqual(['revoke', 'create']);
    expect(await redis.keys(`session:${String(u._id)}:*`)).toHaveLength(1);
  });

  it("the attacker's refresh token (password session made before the link) gets 401", async () => {
    // Attacker registers the victim's address with a password they know and logs in.
    const authApp = (await import('../app')).default;
    const reg = await supertest(authApp)
      .post('/register')
      .send({ email: 'victim6@example.com', password: PASSWORD, name: 'Attacker' });
    expect(reg.status).toBe(201);
    const login = await supertest(authApp)
      .post('/login')
      .send({ email: 'victim6@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const d = login.body.data as { tokens?: any; accessToken?: string; refreshToken?: string };
    const attacker = d.tokens ?? d;

    // The real owner then signs in with Google at the same address.
    const { res } = await googleSignIn('victim6@example.com', 'g-victim6');
    expect(res.status).toBe(302);

    const stolen = await supertest(authApp)
      .post('/refresh')
      .send({ refreshToken: attacker.refreshToken });
    expect(stolen.status).toBe(401);
    expect(stolen.body.message).toBe('Invalid or expired refresh token');
    // and the old password no longer works
    const again = await supertest(authApp)
      .post('/login')
      .send({ email: 'victim6@example.com', password: PASSWORD });
    expect(again.status).toBe(401);
    await waitForSeed((await User.findOne({ email: 'victim6@example.com' }).lean())!._id);
  });

  it('if the revoke throws, nothing is saved: googleId unset, password kept, no code; a retry links', async () => {
    const u = await User.create({ email: 'retry6@example.com', name: 'V', password: PASSWORD });
    const del = jest
      .spyOn(sessionService, 'deleteAllUserSessions')
      .mockRejectedValueOnce(new Error('redis down'));
    const first = await googleSignIn('retry6@example.com', 'g-retry6');
    expect(first.res.headers.location ?? '').not.toContain('code=');
    const mid = await rawUsers().findOne({ _id: u._id });
    expect(mid!.googleId ?? null).toBeNull();
    expect(mid!.password).toBeTruthy();

    const second = await googleSignIn('retry6@example.com', 'g-retry6');
    expect(second.res.headers.location).toContain('code=');
    expect(del).toHaveBeenCalledTimes(2);
    expect((await rawUsers().findOne({ _id: u._id }))!.password ?? null).toBeNull();
  });

  it('a returning Google user does not have sessions revoked at each sign-in', async () => {
    await googleSignIn('keep6@example.com', 'g-keep6');
    const u = (await User.findOne({ email: 'keep6@example.com' }).lean())!;
    const s = await passwordSession(String(u._id), 'keep6@example.com');
    await googleSignIn('keep6@example.com', 'g-keep6');
    expect(await validateSession(String(u._id), hashToken(s.accessToken))).not.toBeNull();
    await waitForSeed(u._id);
  });
});
