/**
 * T-522 (Arjun (b)) - the Google link path grants the deferred referral. A password sign-up with a
 * referral code is unverified; when the real owner then signs in with Google at that address the
 * googleId counts as verified, so the sign-up Ink AND the recorded referral Ink are granted
 * (re-checked at that moment). A new Google account with a code is verified already and is
 * granted at once.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('../config/env', () => {
  const actual = jest.requireActual('../config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
    },
  };
});

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
import { createOAuthState } from '../services/oauth-state';
import { applyReferralCode } from '../services/referral.service';

import { ledger, makeCode, rawUsers, waitFor } from './t234-helpers';

const BONUS = 3;
const server = express();
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

const CHALLENGE = 'A'.repeat(43);
function callback(email: string, id: string, referral?: string) {
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server)
    .get('/google/callback')
    .query({ state: createOAuthState(CHALLENGE, referral) })
    .redirects(0);
}

describe('T-522 Google link of an unverified password account with a recorded referral', () => {
  it('grants the sign-up Ink and the referral Ink after the link (once)', async () => {
    await makeCode({ code: 'GLINK001', bonusInk: BONUS });
    const u = await User.create({ email: 'glink1@example.com', name: 'P', password: 'Passw0rdOk' });
    expect(await applyReferralCode(String(u._id), 'GLINK001', { deferInk: true })).toBe('applied');
    expect(await ledger().countDocuments({ userId: u._id })).toBe(0);

    const res = await callback('glink1@example.com', 'g-glink1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=');

    await waitFor(async () => ledger().findOne({ userId: u._id, reason: 'referral_bonus' }));
    const doc = await rawUsers().findOne({ _id: u._id });
    expect(doc!['inkTopup']).toBe(10 + BONUS * 2);
    expect(doc!['referralInkCode']).toBe('GLINK001');
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
  });

  it('a second Google sign-in grants nothing more', async () => {
    await makeCode({ code: 'GLINK002', bonusInk: BONUS });
    const u = await User.create({ email: 'glink2@example.com', name: 'P', password: 'Passw0rdOk' });
    await applyReferralCode(String(u._id), 'GLINK002', { deferInk: true });
    await callback('glink2@example.com', 'g-glink2');
    await waitFor(async () => ledger().findOne({ userId: u._id, reason: 'referral_bonus' }));
    await callback('glink2@example.com', 'g-glink2');
    await new Promise((r) => setTimeout(r, 150));
    expect(await ledger().countDocuments({ userId: u._id })).toBe(2);
    expect((await ReferralCode.findOne({ code: 'GLINK002' }).lean())!.uses).toBe(1);
  });

  it('a code that lapsed before the link: no referral Ink, not_applied, slot freed; sign-up Ink still granted', async () => {
    await makeCode({ code: 'GLINK003', bonusInk: BONUS });
    const u = await User.create({ email: 'glink3@example.com', name: 'P', password: 'Passw0rdOk' });
    await applyReferralCode(String(u._id), 'GLINK003', { deferInk: true });
    await ReferralCode.updateOne({ code: 'GLINK003' }, { isActive: false });
    await callback('glink3@example.com', 'g-glink3');
    await waitFor(async () => {
      const d = await rawUsers().findOne({ _id: u._id });
      return d!['referralStatus'] === 'not_applied' ? d : null;
    });
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(0);
    expect((await ReferralCode.findOne({ code: 'GLINK003' }).lean())!.uses).toBe(0);
    expect((await rawUsers().findOne({ _id: u._id }))!['inkTopup']).toBe(10);
  });
});

describe('T-522 a NEW Google account with a code is verified already: granted at once', () => {
  it('the referral Ink lands with the sign-up Ink, without any verify step', async () => {
    await makeCode({ code: 'GNEW0001', bonusInk: BONUS });
    const res = await callback('gnew1@example.com', 'g-gnew1', 'gnew0001');
    expect(res.status).toBe(302);
    const u = await User.findOne({ email: 'gnew1@example.com' }).lean();
    await waitFor(async () => ledger().findOne({ userId: u!._id, reason: 'referral_bonus' }));
    expect((await rawUsers().findOne({ _id: u!._id }))!['inkTopup']).toBe(10 + BONUS * 2);
  });
});
