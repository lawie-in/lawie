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

import logger from '../config/logger';
import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import * as bonus from '../services/credit-bonus.service';
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

describe('T-657 Google callback: signup bonus caught, and the free-Ink self-heal', () => {
  const rawOne = async (email: string) => (await rawUsers().findOne({ email }))!;

  it('a rejecting grantSignupBonus never fails the callback, leaves no unhandledRejection, logs nothing but errName in the callback', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const grant = jest
      .spyOn(bonus, 'grantSignupBonus')
      .mockRejectedValue(new Error('leak t657-new@example.com G User'));
    try {
      const res = await googleSignIn('t657-new@example.com', 'g-t657-new');
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toContain('error');
      await new Promise((r) => setTimeout(r, 300));
      const u = await rawOne('t657-new@example.com');
      expect(u).toBeTruthy();
      // two calls: the passport strategy's (new user) and the callback's heal
      expect(grant).toHaveBeenCalledTimes(2);
      expect(grant).toHaveBeenNthCalledWith(1, String(u._id));
      expect(grant).toHaveBeenNthCalledWith(2, String(u._id));
      expect(unhandled).not.toHaveBeenCalled();
      const calls = warn.mock.calls.filter((c) => c[1] === 'Signup bonus failed');
      expect(calls).toHaveLength(2);
      // the callback's warn has only { errName }; passport's carries the userId
      expect(calls.some((c) => JSON.stringify(c[0]) === JSON.stringify({ errName: 'Error' }))).toBe(
        true,
      );
      for (const c of calls) {
        expect(Object.keys(c[0] as object).every((k) => ['userId', 'errName'].includes(k))).toBe(
          true,
        );
        expect((c[0] as { errName: string }).errName).toBe('Error');
      }
      // every logger.warn argument is free of the email and the display name
      const dump = JSON.stringify(warn.mock.calls);
      expect(dump).not.toContain('t657-new@example.com');
      expect(dump).not.toContain('G User');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('the real grant on a new Google user, called twice (passport + callback): 10 Ink once, one string-id row, marker + freeSeedAt', async () => {
    const grant = jest.spyOn(bonus, 'grantSignupBonus');
    const res = await googleSignIn('t657-real@example.com', 'g-t657-real');
    expect(res.status).toBe(302);
    const u = await rawOne('t657-real@example.com');
    await waitFor(async () => (await seeds(u._id)) === 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(grant.mock.calls.length).toBeGreaterThanOrEqual(2);
    const d = (await rawUsers().findOne({ _id: u._id }))!;
    expect(d.inkTopup).toBe(10);
    expect(d.freeSeedAt).toBeInstanceOf(Date);
    expect(d.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(d.earnedCredits ?? 0).toBe(0);
    expect(await signupRows(u._id)).toBe(0);
    const rows = await ledger().find({ userId: u._id, reason: 'free_seed' }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(`free_seed:${String(u._id)}`);
  });

  it('a returning verified Google user whose marker is null IS healed at the callback: 10 Ink, one string-id row, freeSeedAt, no earnedCredits, no creditledger row', async () => {
    const u = await User.create({
      email: 't657-ret@example.com',
      name: 'Ret',
      authProvider: 'google',
      googleId: 'g-t657-ret',
      emailVerified: true,
    });
    expect((await rawUsers().findOne({ _id: u._id }))!.signupBonusGrantedAt ?? null).toBeNull();
    const res = await googleSignIn('t657-ret@example.com', 'g-t657-ret');
    expect(res.status).toBe(302);
    await waitFor(async () => (await seeds(u._id)) === 1);
    await new Promise((r) => setTimeout(r, 300));
    const d = (await rawUsers().findOne({ _id: u._id }))!;
    expect(d.inkTopup).toBe(10);
    expect(d.freeSeedAt).toBeInstanceOf(Date);
    expect(d.earnedCredits ?? 0).toBe(0);
    const rows = await ledger().find({ userId: u._id, reason: 'free_seed' }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(`free_seed:${String(u._id)}`);
    expect(
      await mongoose.connection.db!.collection('creditledgers').countDocuments({ userId: u._id }),
    ).toBe(0);
    // a second sign-in adds nothing
    await googleSignIn('t657-ret@example.com', 'g-t657-ret');
    await new Promise((r) => setTimeout(r, 300));
    expect((await rawUsers().findOne({ _id: u._id }))!.inkTopup).toBe(10);
    expect(await seeds(u._id)).toBe(1);
  });

  it('an old-code marker user (marker set, no freeSeedAt) is not healed by the callback: nothing granted', async () => {
    const marker = new Date(Date.now() - 5 * 86_400_000);
    const u = await User.create({
      email: 't657-old@example.com',
      name: 'Old',
      authProvider: 'google',
      googleId: 'g-t657-old',
      emailVerified: true,
    });
    await rawUsers().updateOne({ _id: u._id }, { $set: { signupBonusGrantedAt: marker } });
    const res = await googleSignIn('t657-old@example.com', 'g-t657-old');
    expect(res.status).toBe(302);
    await new Promise((r) => setTimeout(r, 400));
    const d = (await rawUsers().findOne({ _id: u._id }))!;
    expect(d.inkTopup ?? 0).toBe(0);
    expect(d.freeSeedAt).toBeUndefined();
    expect(d.signupBonusGrantedAt).toEqual(marker);
    expect(await seeds(u._id)).toBe(0);
  });

  it('a test account never triggers the heal at the callback (grantSignupBonus not called for it)', async () => {
    const u = await User.create({
      email: 't657-testacct@example.com',
      name: 'Tester',
      authProvider: 'google',
      googleId: 'g-t657-testacct',
      emailVerified: true,
    });
    await rawUsers().updateOne({ _id: u._id }, { $set: { isTestAccount: true } });
    const grant = jest.spyOn(bonus, 'grantSignupBonus');
    const res = await googleSignIn('t657-testacct@example.com', 'g-t657-testacct');
    expect(res.status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(grant).not.toHaveBeenCalled();
    const d = (await rawUsers().findOne({ _id: u._id }))!;
    expect(d.inkTopup ?? 0).toBe(0);
    expect(await seeds(u._id)).toBe(0);
  });

  it('the callback does not wait for a hanging grant (redirect within 5 s)', async () => {
    const u = await User.create({
      email: 't657-hang@example.com',
      name: 'Hang',
      authProvider: 'google',
      googleId: 'g-t657-hang',
      emailVerified: true,
    });
    const grant = jest
      .spyOn(bonus, 'grantSignupBonus')
      .mockImplementation(() => new Promise<void>(() => undefined) as never);
    const started = Date.now();
    const res = await Promise.race([
      googleSignIn('t657-hang@example.com', 'g-t657-hang'),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('callback waited for the grant')), 5000),
      ),
    ]);
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toContain('error');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(grant).toHaveBeenCalledWith(String(u._id));
  });
});
