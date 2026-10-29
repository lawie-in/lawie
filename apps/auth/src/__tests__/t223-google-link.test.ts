/**
 * T-223 AC6: when an existing unverified email user links Google, linking also calls
 * grantSignupBonus once. A repeat link / sign-in grants nothing more.
 * Real oauth routes and the real passport verify callback (as t299-google does).
 */

import './setupEnv';

// T-587: a Google sign-up / link queues the welcome email; stub the client so nothing reaches Redis.
jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ jobId: 'j' }),
}));

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
          if (callback) return callback(err, user, info);
          if (err) return next(err);
          req.user = user;
          return next();
        });
      },
  },
}));

import './setupDb';

import crypto from 'crypto';

import express from 'express';
import mongoose from 'mongoose';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { challengeForVerifier } from '../services/oauth-state';

import { ledger, rawUsers, waitFor } from './t234-helpers';

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

async function googleSignIn(email: string, id: string) {
  const v = crypto.randomBytes(32).toString('base64url');
  const g = await supertest(server)
    .get('/google')
    .query({ challenge: challengeForVerifier(v) })
    .redirects(0);
  const state = new URL(g.headers.location as string).searchParams.get('state') as string;
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server).get('/google/callback').query({ state }).redirects(0);
}

// T-652: the earnedCredits signup grant is gone, so this must stay 0; the free Ink is `seeds`.
const signupRows = (id: unknown) =>
  mongoose.connection
    .db!.collection('creditledgers')
    .countDocuments({ userId: id, source: 'signup_bonus' });
const seeds = (id: unknown) => ledger().countDocuments({ userId: id, reason: 'free_seed' });

describe('T-223 AC6 Google link grants the sign-up bonus once', () => {
  it('unverified email user links Google: bonus granted once, then a repeat sign-in adds nothing', async () => {
    const u = await User.create({
      email: 't223-link@example.com',
      name: 'Linker',
      password: 'Passw0rdOk',
    });
    // before the link: unverified, nothing granted (T-351)
    expect(await seeds(u._id)).toBe(0);
    expect((await rawUsers().findOne({ _id: u._id }))!.emailVerified).not.toBe(true);

    const first = await googleSignIn('t223-link@example.com', 'g-t223-link');
    expect(first.status).toBe(302);
    expect((await rawUsers().findOne({ _id: u._id }))!.googleId).toBe('g-t223-link');

    await waitFor(async () => (await seeds(u._id)) === 1);
    const afterLink = (await rawUsers().findOne({ _id: u._id }))!;
    expect(await signupRows(u._id)).toBe(0); // T-652: no signup_bonus creditledger row
    expect(afterLink.inkTopup).toBe(10);
    expect(afterLink.signupBonusGrantedAt).toBeInstanceOf(Date);

    // repeat: the googleId branch signs in; no second grant
    const second = await googleSignIn('t223-link@example.com', 'g-t223-link');
    expect(second.status).toBe(302);
    await new Promise((r) => setTimeout(r, 200));
    const afterRepeat = (await rawUsers().findOne({ _id: u._id }))!;
    expect(await seeds(u._id)).toBe(1);
    expect(await signupRows(u._id)).toBe(0); // T-652: no signup_bonus creditledger row
    expect(afterRepeat.earnedCredits ?? 0).toBe(0);
    expect(afterLink.earnedCredits ?? 0).toBe(0);
    expect(afterRepeat.signupBonusGrantedAt).toEqual(afterLink.signupBonusGrantedAt);
    expect(afterRepeat.inkTopup).toBe(10);
  });

  it('an email user who already got the bonus (verified first) and then links gets no second grant', async () => {
    const u = await User.create({
      email: 't223-link2@example.com',
      name: 'Linker Two',
      password: 'Passw0rdOk',
      emailVerified: true,
    });
    const { grantSignupBonus } = await import('../services/credit-bonus.service');
    await grantSignupBonus(String(u._id));
    expect(await seeds(u._id)).toBe(1);

    const res = await googleSignIn('t223-link2@example.com', 'g-t223-link2');
    expect(res.status).toBe(302);
    await new Promise((r) => setTimeout(r, 200));
    expect(await seeds(u._id)).toBe(1);
    const doc = (await rawUsers().findOne({ _id: u._id }))!;
    expect(doc.googleId).toBe('g-t223-link2');
    expect(await signupRows(u._id)).toBe(0); // T-652: no signup_bonus creditledger row
    expect(doc.inkTopup).toBe(10);
  });
});

describe('T-652 Google callback sign-in accrues nothing', () => {
  it('repeat sign-ins of a legacy Google user (backdated claim, balance 6): no login_bonus row, balance and lastLoginBonusAt untouched', async () => {
    const old = new Date(Date.now() - 3 * 86_400_000);
    const u = await User.create({
      email: 't652-g@example.com',
      name: 'Google Legacy',
      authProvider: 'google',
      googleId: 'g-t652-legacy',
      emailVerified: true,
    });
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { earnedCredits: 6, lastLoginBonusAt: old, signupBonusGrantedAt: old } },
    );
    for (let i = 0; i < 2; i += 1) {
      const res = await googleSignIn('t652-g@example.com', 'g-t652-legacy');
      expect(res.status).toBe(302);
      await new Promise((r) => setTimeout(r, 250));
    }
    const doc = (await rawUsers().findOne({ _id: u._id }))!;
    expect(doc.earnedCredits).toBe(6);
    expect(doc.lastLoginBonusAt).toEqual(old);
    expect(
      await mongoose.connection.db!.collection('creditledgers').countDocuments({ userId: u._id }),
    ).toBe(0);
    expect(await seeds(u._id)).toBe(0); // marker already set: no second free Ink
    expect(doc.inkTopup ?? 0).toBe(0);
  });
});
