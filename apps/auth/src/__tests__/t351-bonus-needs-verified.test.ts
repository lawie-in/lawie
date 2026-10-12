/**
 * T-351 (RELEASE GATE): no free Ink / credits for an unverified email sign-up.
 *
 * Eligible = authProvider 'google' OR emailVerified true OR googleId set (non-null, non-empty)
 * (Priya, ruling A: covers Google users created before T-299, stored as 'email', and email
 * accounts that linked Google). Everyone else gets nothing and no idempotency marker, so a call
 * after verification still grants exactly once.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { User } from '../models/User.model';
import {
  DAILY_LOGIN_BONUS,
  SIGNUP_BONUS_CREDITS,
  grantSignupBonus,
  tryGrantDailyLoginBonus,
} from '../services/credit-bonus.service';

import { ledger, rawUsers, waitFor } from './t234-helpers';

const PASSWORD = 'Passw0rdOk';

let fetchMock: jest.Mock;
let logSpies: jest.SpyInstance[];

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof fetch;
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

type Fields = Record<string, unknown>;
let n = 0;
const mk = (fields: Fields = {}) => {
  n += 1;
  return User.create({
    email: `t351-${n}@example.com`,
    name: 'Bonus Person',
    password: PASSWORD,
    ...fields,
  });
};

const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;

async function expectNothingGranted(id: unknown) {
  const u = await raw(id);
  expect(u.earnedCredits ?? 0).toBe(0);
  expect(u.inkTopup ?? 0).toBe(0);
  expect(u.signupBonusGrantedAt ?? null).toBeNull();
  expect(u.lastLoginBonusAt ?? null).toBeNull();
  expect(await ledger().countDocuments({ userId: id })).toBe(0);
  expect(
    await mongoose.connection.db!.collection('creditledgers').countDocuments({ userId: id }),
  ).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
}

async function expectSignupBonusOnce(id: unknown) {
  const u = await raw(id);
  expect(u.earnedCredits).toBe(SIGNUP_BONUS_CREDITS);
  expect(u.inkTopup).toBe(10);
  expect(u.signupBonusGrantedAt).toBeInstanceOf(Date);
  const seed = await ledger().find({ userId: id, reason: 'free_seed' }).toArray();
  expect(seed).toHaveLength(1);
  expect(seed[0].delta).toBe(10);
  expect(
    await mongoose.connection
      .db!.collection('creditledgers')
      .countDocuments({ userId: id, source: 'signup_bonus' }),
  ).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
}

/** Eligible cases, shared by the sign-up and daily bonus. */
const ELIGIBLE: Array<[string, Fields]> = [
  ['Google (authProvider google)', { authProvider: 'google', googleId: 'g-t351-a' }],
  ['Google provider without a googleId', { authProvider: 'google' }],
  ['verified email', { emailVerified: true }],
  [
    "pre-T-299 Google user: authProvider 'email' with a googleId, unverified",
    { authProvider: 'email', googleId: 'g-t351-b', emailVerified: false },
  ],
  ['email account that linked Google (googleId set)', { googleId: 'g-t351-c' }],
];

const INELIGIBLE: Array<[string, Fields]> = [
  ['unverified email (defaults)', {}],
  ['unverified email, explicit false', { authProvider: 'email', emailVerified: false }],
  ['email with an empty-string googleId', { googleId: '' }],
];

describe('T-351 AC1/AC3/AC4 — grantSignupBonus', () => {
  it.each(INELIGIBLE)('%s: grants nothing and stamps no marker', async (_l, fields) => {
    const u = await mk(fields);
    await grantSignupBonus(String(u._id));
    await expectNothingGranted(u._id);
  });

  it('email user with googleId explicitly null in the DB: grants nothing', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $set: { googleId: null } });
    await grantSignupBonus(String(u._id));
    await expectNothingGranted(u._id);
  });

  it.each(ELIGIBLE)('%s: grants 5 credits and the 10-unit Ink seed once', async (_l, fields) => {
    const u = await mk(fields);
    await grantSignupBonus(String(u._id));
    await expectSignupBonusOnce(u._id);
    await grantSignupBonus(String(u._id));
    await expectSignupBonusOnce(u._id);
  });

  it('unverified, then verified: grants exactly once; a further call grants nothing', async () => {
    const u = await mk();
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    await expectNothingGranted(u._id);

    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    await grantSignupBonus(String(u._id));
    await expectSignupBonusOnce(u._id);

    await grantSignupBonus(String(u._id));
    await expectSignupBonusOnce(u._id);
  });

  it('two concurrent calls after verification still grant once', async () => {
    const u = await mk({ emailVerified: true });
    await Promise.all([grantSignupBonus(String(u._id)), grantSignupBonus(String(u._id))]);
    await expectSignupBonusOnce(u._id);
  });

  it('invalid and unknown ids still resolve without throwing', async () => {
    await expect(grantSignupBonus('nope')).resolves.toBeUndefined();
    await expect(
      grantSignupBonus(new mongoose.Types.ObjectId().toString()),
    ).resolves.toBeUndefined();
  });
});

describe('T-351 AC1/AC3/AC4 — tryGrantDailyLoginBonus', () => {
  it.each(INELIGIBLE)('%s: returns 0, no credits, no marker, no ledger row', async (_l, fields) => {
    const u = await mk(fields);
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(0);
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(0);
    await expectNothingGranted(u._id);
  });

  it.each(ELIGIBLE)('%s: grants the daily bonus once per day', async (_l, fields) => {
    const u = await mk(fields);
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(DAILY_LOGIN_BONUS);
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(0);
    const r = await raw(u._id);
    expect(r.earnedCredits).toBe(DAILY_LOGIN_BONUS);
    expect(r.lastLoginBonusAt).toBeInstanceOf(Date);
    expect(
      await mongoose.connection
        .db!.collection('creditledgers')
        .countDocuments({ userId: u._id, source: 'login_bonus' }),
    ).toBe(1);
  });

  it('unverified, then verified: the daily bonus is granted that same day, once', async () => {
    const u = await mk();
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(0);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(DAILY_LOGIN_BONUS);
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(0);
    expect((await raw(u._id)).earnedCredits).toBe(DAILY_LOGIN_BONUS);
  });

  it('a verified user who already claimed before today can claim again today', async () => {
    const u = await mk({ emailVerified: true });
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { lastLoginBonusAt: new Date(Date.now() - 2 * 86_400_000) } },
    );
    expect(await tryGrantDailyLoginBonus(String(u._id))).toBe(DAILY_LOGIN_BONUS);
  });

  it('invalid id returns 0', async () => {
    expect(await tryGrantDailyLoginBonus('nope')).toBe(0);
  });
});

describe('T-351 AC2/AC3 — through the real register and login routes', () => {
  const settle = () => new Promise((r) => setTimeout(r, 300));

  it('password register: 201, no Ink, no credits, no seed; login also gives no daily bonus', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'e2e-unverified@example.com', password: PASSWORD, name: 'E2E Person' });
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: 'e2e-unverified@example.com' }).lean();
    await settle(); // register fires the grant with `void`; give it time to (not) land
    await expectNothingGranted(u!._id);

    const login = await supertest(app)
      .post('/login')
      .send({ email: 'e2e-unverified@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    await settle();
    await expectNothingGranted(u!._id);
  });

  it('after the address is verified, the next grant call seeds once; login gives the daily bonus', async () => {
    await supertest(app)
      .post('/register')
      .send({ email: 'e2e-verified@example.com', password: PASSWORD, name: 'E2E Person' });
    const u = await User.findOne({ email: 'e2e-verified@example.com' }).lean();
    await settle();
    await rawUsers().updateOne({ _id: u!._id }, { $set: { emailVerified: true } });
    await grantSignupBonus(String(u!._id));
    await waitFor(async () => ledger().findOne({ userId: u!._id, reason: 'free_seed' }));
    await expectSignupBonusOnce(u!._id);

    const login = await supertest(app)
      .post('/login')
      .send({ email: 'e2e-verified@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await raw(u!._id)).earnedCredits).toBe(SIGNUP_BONUS_CREDITS + DAILY_LOGIN_BONUS);
  });
});

describe('T-351 AC5 — logs keep the user id only, never the address', () => {
  it('skip path (signup and daily) writes no log line containing the email', async () => {
    const u = await mk({ email: 'secret-addr@example.com', name: 'Secret Name' });
    await grantSignupBonus(String(u._id));
    await tryGrantDailyLoginBonus(String(u._id));
    for (const spy of logSpies) {
      for (const call of spy.mock.calls) {
        const text = JSON.stringify(call);
        expect(text).not.toContain('secret-addr@example.com');
        expect(text).not.toContain('Secret Name');
      }
    }
  });

  it('grant path also writes no email into any log line', async () => {
    const u = await mk({ email: 'secret-grant@example.com', emailVerified: true });
    await grantSignupBonus(String(u._id));
    await tryGrantDailyLoginBonus(String(u._id));
    for (const spy of logSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('secret-grant@example.com');
      }
    }
  });
});
