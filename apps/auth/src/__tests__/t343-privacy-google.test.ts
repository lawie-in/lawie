/**
 * T-343 — the Google paths. Ajay §4 and Addendum 1:
 *  - a brand-new Google account records via 'signup' and one history row, and sees no prompt;
 *  - a linked or returning Google account whose T-234 stamp sets privacyVersion also gets
 *    privacyAcceptedAt, via 'signin' and one history row (Ajay, round 5); no row if the version was
 *    already current, and no backfill for accounts that already have a terms record;
 *  - the OAuth exchange hands out tokens that carry the `pv` claim.
 * The passport verify callback is captured from a mocked strategy (as in t234-google-terms).
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

type Verify = (
  req: unknown,
  at: string,
  rt: string,
  profile: Record<string, unknown>,
  done: (err: unknown, user?: unknown) => void,
) => Promise<void>;

let verify: Verify;

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: Verify) {
      verify = cb;
    }
  },
}));

// The stubbed passport.authenticate puts the user the test chose on req.user.
let signedInUser: unknown;
jest.mock('passport', () => ({
  __esModule: true,
  default: {
    use: jest.fn(),
    authenticate: () => (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = signedInUser;
      next();
    },
  },
}));

jest.mock('../services/session.service', () => ({
  ...jest.requireActual('../services/session.service'),
  createSession: jest.fn().mockResolvedValue(undefined),
  deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/credit-bonus.service', () => ({
  tryGrantDailyLoginBonus: jest.fn().mockResolvedValue(undefined),
  grantSignupBonus: jest.fn().mockResolvedValue(undefined),
}));

import './setupDb';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import crypto from 'crypto';

import express from 'express';
import mongoose from 'mongoose';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { challengeForVerifier, createOAuthState } from '../services/oauth-state';
import { verifyAccessToken, verifyRefreshToken } from '../services/jwt.service';

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

function runVerify(req: unknown, profile: Record<string, unknown>) {
  return new Promise<{ err: unknown; user: Record<string, unknown> | undefined }>((resolve) => {
    void verify(req, 'at', 'rt', profile, (err, user) =>
      resolve({ err, user: user as Record<string, unknown> | undefined }),
    );
  });
}
const profile = (id: string, email: string) => ({
  id,
  displayName: 'G User',
  emails: [{ value: email }],
});

async function exchangeFor(user: unknown) {
  signedInUser = user;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const state = createOAuthState(challengeForVerifier(verifier));
  const cb = await supertest(server).get('/google/callback').query({ state }).redirects(0);
  const code = new URL(cb.headers.location as string).searchParams.get('code') ?? '';
  const res = await supertest(server).post('/oauth/exchange').send({ code, verifier });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string };
}

beforeAll(() => initPassport());
beforeEach(async () => {
  await redis.flushall();
});

describe('T-343 — new Google account', () => {
  it('records privacyVersion, via "signup", the time and exactly one history row', async () => {
    const before = Date.now();
    const { err } = await runVerify({ query: {} }, profile('g-new', 'gnew343@example.com'));
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'gnew343@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('signup');
    expect(u?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyAcceptedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(u?.privacyHistory).toHaveLength(1);
    expect(Object.keys(u?.privacyHistory?.[0] ?? {}).sort()).toEqual([
      'acceptedAt',
      'version',
      'via',
    ]);
    expect(u?.privacyHistory?.[0]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'signup',
    });
  });

  it('ignores client-sent privacy values in the query, body and profile', async () => {
    await runVerify(
      {
        query: { privacyVersion: '1999', privacyAcceptedVia: 'reaccept' },
        body: { privacyVersion: '1999', privacyHistory: [{ version: 'x' }] },
      },
      { ...profile('g-spoof', 'gspoof343@example.com'), privacyVersion: '1999' },
    );
    const u = await User.findOne({ email: 'gspoof343@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('signup');
    expect(u?.privacyHistory).toHaveLength(1);
  });

  it('stores no IP address or user agent', async () => {
    await runVerify(
      { query: {}, ip: '203.0.113.9', headers: { 'user-agent': 'UA-343' } },
      profile('g-noip', 'gnoip343@example.com'),
    );
    const raw = JSON.stringify(
      await mongoose.connection.db?.collection('users').findOne({ email: 'gnoip343@example.com' }),
    );
    expect(raw).not.toContain('203.0.113.9');
    expect(raw).not.toContain('UA-343');
  });
});

describe('T-343 — linked and returning Google accounts (Ajay, Addendum 1)', () => {
  it('a linked password account gets the T-234 stamping plus one signin row (Ajay, round 5)', async () => {
    await User.create({ email: 'link343@example.com', name: 'L', password: 'Passw0rdOk' });
    const { err } = await runVerify({ query: {} }, profile('g-link', 'link343@example.com'));
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'link343@example.com' }).select('+googleId').lean();
    expect(u?.googleId).toBe('g-link');
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyAcceptedVia).toBe('signin');
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyHistory?.[0]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'signin',
    });
    expect(u?.privacyHistory?.[0].acceptedAt).toEqual(u?.privacyAcceptedAt);
  });

  it('a linked account whose privacyVersion is already current gets no row and no new fields', async () => {
    await User.create({
      email: 'link-cur343@example.com',
      name: 'L',
      password: 'Passw0rdOk',
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    const { err } = await runVerify(
      { query: {} },
      profile('g-link-cur', 'link-cur343@example.com'),
    );
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'link-cur343@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyHistory).toBeUndefined();
    expect(u?.privacyAcceptedAt).toBeUndefined();
    expect(u?.privacyAcceptedVia).toBeUndefined();
  });

  it('a linked account that already has a terms record is not stamped or backfilled', async () => {
    await User.create({
      email: 'link-nobf343@example.com',
      name: 'L',
      password: 'Passw0rdOk',
      termsAcceptedAt: new Date('2026-01-01'),
    });
    await runVerify({ query: {} }, profile('g-link-nobf', 'link-nobf343@example.com'));
    const u = await User.findOne({ email: 'link-nobf343@example.com' }).lean();
    expect(u?.privacyVersion).toBeUndefined();
    expect(u?.privacyHistory).toBeUndefined();
    expect(u?.privacyAcceptedAt).toBeUndefined();
    expect(u?.privacyAcceptedVia).toBeUndefined();
  });

  it('a returning Google user with no terms record gets T-234 stamping plus one signin row', async () => {
    await User.collection.insertOne({
      email: 'ret343@example.com',
      name: 'R',
      googleId: 'g-ret',
      authProvider: 'google',
      role: 'Lawyer',
      plan: 'free',
      isActive: true,
    });
    const { err } = await runVerify({ query: {} }, profile('g-ret', 'ret343@example.com'));
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'ret343@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyAcceptedVia).toBe('signin');
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyHistory?.[0]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'signin',
    });
  });

  it('a returning user with no terms record but a current privacyVersion gets no row', async () => {
    await User.collection.insertOne({
      email: 'ret-cur343@example.com',
      name: 'R',
      googleId: 'g-ret-cur',
      authProvider: 'google',
      role: 'Lawyer',
      plan: 'free',
      isActive: true,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    await runVerify({ query: {} }, profile('g-ret-cur', 'ret-cur343@example.com'));
    const u = await User.findOne({ email: 'ret-cur343@example.com' }).lean();
    expect(u?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyHistory).toBeUndefined();
    expect(u?.privacyAcceptedAt).toBeUndefined();
    expect(u?.privacyAcceptedVia).toBeUndefined();
  });

  it('a returning user who already has a terms record is not backfilled', async () => {
    await User.collection.insertOne({
      email: 'ret-nobf343@example.com',
      name: 'R',
      googleId: 'g-ret-nobf',
      authProvider: 'google',
      role: 'Lawyer',
      plan: 'free',
      isActive: true,
      termsAcceptedAt: new Date('2026-01-01'),
    });
    await runVerify({ query: {} }, profile('g-ret-nobf', 'ret-nobf343@example.com'));
    const u = await User.findOne({ email: 'ret-nobf343@example.com' }).lean();
    expect(u?.privacyVersion).toBeUndefined();
    expect(u?.privacyHistory).toBeUndefined();
    expect(u?.privacyAcceptedAt).toBeUndefined();
  });

  it('the User model accepts via "signin" on the field and on a history row, and rejects others', () => {
    const ok = new User({
      email: 'enum343@example.com',
      name: 'E',
      privacyAcceptedVia: 'signin',
      privacyHistory: [{ version: CURRENT_PRIVACY_VERSION, acceptedAt: new Date(), via: 'signin' }],
    });
    expect(ok.validateSync()?.errors['privacyAcceptedVia']).toBeUndefined();
    expect(ok.validateSync()?.errors['privacyHistory.0.via']).toBeUndefined();
    const bad = new User({ email: 'enum2343@example.com', name: 'E', privacyAcceptedVia: 'bogus' });
    expect(bad.validateSync()?.errors['privacyAcceptedVia']).toBeDefined();
  });

  it('a returning user with an older stored version is left as is, so they see the prompt', async () => {
    await User.create({
      email: 'ret-old343@example.com',
      name: 'R',
      googleId: 'g-ret-old',
      authProvider: 'google',
      termsAcceptedAt: new Date('2026-01-01'),
      termsVersion: '2026-01-01',
      privacyVersion: '2026-01-01',
      acceptedVia: 'google',
    });
    await runVerify({ query: {} }, profile('g-ret-old', 'ret-old343@example.com'));
    const u = await User.findOne({ email: 'ret-old343@example.com' }).lean();
    expect(u?.privacyVersion).toBe('2026-01-01');
    expect(u?.privacyHistory).toBeUndefined();
  });
});

describe('T-343 — OAuth exchange tokens carry pv', () => {
  it('new Google account: pv is the current version on access and refresh token', async () => {
    const { user } = await runVerify({ query: {} }, profile('g-ex-new', 'exnew343@example.com'));
    const tokens = await exchangeFor(user);
    expect(verifyAccessToken(tokens.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);
    expect(verifyRefreshToken(tokens.refreshToken).pv).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('older stored version: pv is the older version', async () => {
    const u = await User.create({
      email: 'exold343@example.com',
      name: 'O',
      googleId: 'g-ex-old',
      authProvider: 'google',
      termsAcceptedAt: new Date('2026-01-01'),
      privacyVersion: '2026-01-01',
    });
    const tokens = await exchangeFor(u);
    expect(verifyAccessToken(tokens.accessToken).pv).toBe('2026-01-01');
  });

  it('missing stored version: the token has no pv claim', async () => {
    const u = await User.create({
      email: 'exnone343@example.com',
      name: 'N',
      googleId: 'g-ex-none',
      authProvider: 'google',
      termsAcceptedAt: new Date('2026-01-01'),
    });
    const tokens = await exchangeFor(u);
    const claims = verifyAccessToken(tokens.accessToken);
    expect(claims.pv).toBeUndefined();
    expect(claims).not.toHaveProperty('pv');
  });
});

describe('T-115c — a Google sign-in proves the user now (authAt)', () => {
  it('the OAuth callback creates the session with a fresh authAt', async () => {
    const { createSession } = jest.requireMock('../services/session.service') as {
      createSession: jest.Mock;
    };
    createSession.mockClear();
    const u = await User.create({
      email: 'authat115c@example.com',
      name: 'A',
      googleId: 'g-authat',
      authProvider: 'google',
      termsAcceptedAt: new Date('2026-01-01'),
    });
    await exchangeFor(u);
    const meta = createSession.mock.calls[0][4] as { authAt?: string };
    expect(Date.now() - Date.parse(meta.authAt!)).toBeLessThan(10_000);
  });
});
