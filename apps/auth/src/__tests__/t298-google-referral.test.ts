/**
 * Ajay merge gate, Google side + T-298: a NEW Google sign-up with a referral code credits
 * the top-up Ink; an expired/used-up code redirects with referral=not_applied.
 * Exercises the real passport verify callback and the real /google/callback route handler
 * (passport.authenticate is replaced by a stub that runs the captured verify function).
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
    // Stub of passport.authenticate('google'): run the captured verify, set req.user.
    authenticate: () => (req: any, res: any, next: any) => {
      void verify(req, 'at', 'rt', nextProfile, (err, user) => {
        if (err || !user) return res.redirect('http://localhost:3000/login?error=oauth_failed');
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
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';

import { ledger, makeCode, rawUsers, waitForSeed } from './t234-helpers';

const BONUS = 3;
const server = express();
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

function callback(email: string, id: string, state?: string) {
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server)
    .get('/google/callback')
    .query(state ? { state } : {})
    .redirects(0);
}

describe('Ajay gate — NEW Google sign-up with a referral code credits top-up Ink', () => {
  it('inkTopup = 10 + 2N, ledger agrees, uses +1, redirect has tokens and no referral flag', async () => {
    await makeCode({ code: 'GATEGOOG', bonusInk: BONUS });
    const res = await callback('ggate@example.com', 'g-gate', 'gategoog');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('accessToken')).toBeTruthy();
    expect(url.searchParams.has('referral')).toBe(false);

    const u = await User.findOne({ email: 'ggate@example.com' }).lean();
    await waitForSeed(u!._id);
    const raw = await rawUsers().findOne({ _id: u!._id });
    expect(raw!.inkTopup).toBe(10 + BONUS * 2);
    const rows = await ledger().find({ userId: u!._id }).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.reduce((a, r) => a + (r.delta as number), 0)).toBe(10 + BONUS * 2);
    expect(rows.find((r) => r.reason === 'referral_bonus')!.delta).toBe(BONUS * 2);
    expect((await ReferralCode.findOne({ code: 'GATEGOOG' }).lean())!.uses).toBe(1);
    expect(u!.role).toBe('Lawyer');
    expect(u!.acceptedVia).toBe('google');
  });

  it('signing in again with the code in state does not grant a second time', async () => {
    await makeCode({ code: 'AGAINGOOG', bonusInk: BONUS });
    await callback('gagain@example.com', 'g-again', 'AGAINGOOG');
    const u = await User.findOne({ email: 'gagain@example.com' }).lean();
    await waitForSeed(u!._id);
    await callback('gagain@example.com', 'g-again', 'AGAINGOOG');
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10 + BONUS * 2);
    expect(await ledger().countDocuments({ userId: u!._id })).toBe(2);
    expect((await ReferralCode.findOne({ code: 'AGAINGOOG' }).lean())!.uses).toBe(1);
  });

  it('an existing (email-linked) user is not a new user: no referral Ink', async () => {
    await makeCode({ code: 'LINKGOOG', bonusInk: BONUS });
    await User.create({ email: 'glinked@example.com', name: 'L', password: 'Passw0rdOk' });
    const res = await callback('glinked@example.com', 'g-linked', 'LINKGOOG');
    expect(res.status).toBe(302);
    const u = await User.findOne({ email: 'glinked@example.com' }).lean();
    expect(u!.referredVia ?? null).toBeNull();
    expect((await ReferralCode.findOne({ code: 'LINKGOOG' }).lean())!.uses).toBe(0);
  });
});

describe('Ajay Addendum 1 — Google redirect carries referral=not_applied', () => {
  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 60_000) }],
    ['used up', { maxUses: 1, uses: 1 }],
  ])('%s code on a new Google sign-up', async (_l, opts) => {
    await makeCode({ code: 'DEADGOOG', bonusInk: BONUS, ...opts });
    const res = await callback('gdead@example.com', `g-dead-${_l}`, 'DEADGOOG');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('referral')).toBe('not_applied');
    expect(url.searchParams.get('accessToken')).toBeTruthy();

    const u = await User.findOne({ email: 'gdead@example.com' }).lean();
    expect(u).not.toBeNull();
    await waitForSeed(u!._id);
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10);
    expect(await ledger().countDocuments({ userId: u!._id, reason: 'referral_bonus' })).toBe(0);
  });

  it('no code: no referral param', async () => {
    const res = await callback('gnocode@example.com', 'g-nocode');
    const url = new URL(res.headers.location);
    expect(url.searchParams.has('referral')).toBe(false);
    const u = await User.findOne({ email: 'gnocode@example.com' }).lean();
    await waitForSeed(u!._id);
  });

  it('unknown code: not_applied; the flag is per request (next request without code has none)', async () => {
    const a = await callback('gunk@example.com', 'g-unk', 'NOSUCHCODE');
    expect(new URL(a.headers.location).searchParams.get('referral')).toBe('not_applied');
    const b = await callback('gunk2@example.com', 'g-unk2');
    expect(new URL(b.headers.location).searchParams.has('referral')).toBe(false);
  });

  it('maxUses 1, two new Google users race: one applied, the other redirected with not_applied', async () => {
    await makeCode({ code: 'SLOTGOOG', bonusInk: BONUS, maxUses: 1 });
    // verify uses a shared nextProfile, so drive verify directly for the race
    const run = (email: string, id: string) =>
      new Promise<unknown>((resolve) => {
        const req: Record<string, unknown> = { query: { state: 'SLOTGOOG' } };
        void verify(req, 'at', 'rt', { id, displayName: 'x', emails: [{ value: email }] }, () =>
          resolve(req['lawieReferralNotApplied']),
        );
      });
    const flags = await Promise.all([run('s1@example.com', 'g-s1'), run('s2@example.com', 'g-s2')]);
    expect(flags.filter((f) => f === true)).toHaveLength(1);
    expect((await ReferralCode.findOne({ code: 'SLOTGOOG' }).lean())!.uses).toBe(1);
    expect(await ledger().countDocuments({ reason: 'referral_bonus' })).toBe(1);
  });
});

describe('T-234 review R1 — existing account via Google with a code: referral=existing_account', () => {
  const grantedRows = (userId: unknown) =>
    ledger().countDocuments({ userId, reason: 'referral_bonus' });

  it('existing user found by googleId: param set, no Ink, uses and referredVia unchanged', async () => {
    await makeCode({ code: 'EXISTGID', bonusInk: BONUS, uses: 2 });
    const first = await callback('gexist@example.com', 'g-exist');
    expect(new URL(first.headers.location).searchParams.has('referral')).toBe(false);
    const u = await User.findOne({ email: 'gexist@example.com' }).lean();
    await waitForSeed(u!._id);

    const res = await callback('gexist@example.com', 'g-exist', 'EXISTGID');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('referral')).toBe('existing_account');
    expect(url.searchParams.get('accessToken')).toBeTruthy();

    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10);
    expect(await grantedRows(u!._id)).toBe(0);
    expect((await ReferralCode.findOne({ code: 'EXISTGID' }).lean())!.uses).toBe(2);
    expect((await User.findOne({ _id: u!._id }).lean())!.referredVia ?? null).toBeNull();
  });

  it('existing email-linked user: param set, no Ink, uses and referredVia unchanged', async () => {
    await makeCode({ code: 'EXISTLNK', bonusInk: BONUS });
    const existing = await User.create({
      email: 'glinked2@example.com',
      name: 'L',
      password: 'Passw0rdOk',
    });
    const res = await callback('glinked2@example.com', 'g-linked2', 'EXISTLNK');
    const url = new URL(res.headers.location);
    expect(url.searchParams.get('referral')).toBe('existing_account');
    expect(url.searchParams.get('accessToken')).toBeTruthy();
    expect(await grantedRows(existing._id)).toBe(0);
    expect((await ReferralCode.findOne({ code: 'EXISTLNK' }).lean())!.uses).toBe(0);
    expect((await User.findOne({ _id: existing._id }).lean())!.referredVia ?? null).toBeNull();
  });

  it('existing user with a bogus code still gets existing_account (never not_applied)', async () => {
    await callback('gexist3@example.com', 'g-exist3');
    const u = await User.findOne({ email: 'gexist3@example.com' }).lean();
    await waitForSeed(u!._id);
    const res = await callback('gexist3@example.com', 'g-exist3', 'NOSUCHCODE');
    expect(new URL(res.headers.location).searchParams.get('referral')).toBe('existing_account');
  });

  it('existing user with no code: no referral param', async () => {
    await callback('gexist4@example.com', 'g-exist4');
    const u = await User.findOne({ email: 'gexist4@example.com' }).lean();
    await waitForSeed(u!._id);
    const res = await callback('gexist4@example.com', 'g-exist4');
    expect(new URL(res.headers.location).searchParams.has('referral')).toBe(false);
  });

  it('new user + invalid code is still not_applied; new user + valid code has no param', async () => {
    const bad = await callback('gnewbad@example.com', 'g-newbad', 'NOSUCHCODE');
    expect(new URL(bad.headers.location).searchParams.get('referral')).toBe('not_applied');
    await makeCode({ code: 'NEWVALID', bonusInk: BONUS });
    const ok = await callback('gnewok@example.com', 'g-newok', 'NEWVALID');
    expect(new URL(ok.headers.location).searchParams.has('referral')).toBe(false);
    const u = await User.findOne({ email: 'gnewok@example.com' }).lean();
    await waitForSeed(u!._id);
  });
});
