/**
 * T-652 (Ajay AJ-646-M9b/M9c/M9d, 28 Oct 2026): nothing accrues silently into earnedCredits.
 *
 *  - no sign-in path (password login, signin verify link, test-signup bypass) writes a
 *    login_bonus creditledger row, moves earnedCredits or stamps lastLoginBonusAt, however many
 *    times or on whatever "day" (lastLoginBonusAt is backdated, which used to make a login eligible)
 *  - grantSignupBonus writes no signup_bonus row, leaves earnedCredits alone (a legacy balance is
 *    hidden and untouched), and never calls drafting's /internal/grant-bonus
 *  - M9d, both ways: the advertised free 5 Ink (inkTopup +10, inkledger 'free_seed') is still
 *    given once and only once (never twice, never lost), guarded by signupBonusGrantedAt
 * The Google callback is covered in t223-google-link.test.ts (it needs that file's passport mock).
 */
import './setupEnv';
import './t563-bypass-env';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { grantSignupBonus } from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';
import { mintVerifyLink, verifyEmailToken } from '../services/verify-email.service';

import { ledger, makeCode, rawUsers } from './t234-helpers';

jest.setTimeout(60_000);

const PASSWORD = 'Passw0rdOk';
const SECRET = process.env.TEST_SIGNUP_BYPASS_SECRET as string;
const DAY = 86_400_000;
const settle = () => new Promise((r) => setTimeout(r, 250));

let fetchMock: jest.Mock;
beforeEach(async () => {
  await redis.flushall();
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

let n = 0;
const mk = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t652-${n}@example.com`,
    name: 'No Accrual',
    password: PASSWORD,
    ...fields,
  });
};
const raw = async (id: unknown) =>
  (await rawUsers().findOne({
    _id: new mongoose.Types.ObjectId(String(id)),
  }))!;
const creditRows = (id: unknown, source?: string) =>
  mongoose.connection
    .db!.collection('creditledgers')
    .countDocuments(source ? { userId: id, source } : { userId: id });
const seeds = (id: unknown) => ledger().find({ userId: id, reason: 'free_seed' }).toArray();
const grantBonusCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('grant-bonus'));

async function expectNoAccrual(id: unknown, legacy: number, lastLogin: Date | null) {
  const u = await raw(id);
  expect(u.earnedCredits ?? 0).toBe(legacy);
  expect(u.lastLoginBonusAt ?? null).toEqual(lastLogin);
  expect(await creditRows(id)).toBe(0);
  expect(await creditRows(id, 'login_bonus')).toBe(0);
  expect(grantBonusCalls()).toHaveLength(0);
}

describe('T-652 AC1/AC4 sign-in grants nothing', () => {
  it.each([
    ['no prior claim, no legacy balance', null, 0],
    ['claimed 2 days ago (eligible again under the old rule)', 2 * DAY, 0],
    ['claimed 40 days ago, legacy balance 9 stays hidden and untouched', 40 * DAY, 9],
  ])('password login x3 (%s)', async (_l, ago, legacy) => {
    const old = ago === null ? null : new Date(Date.now() - ago);
    const u = await mk({ emailVerified: true });
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { earnedCredits: legacy, ...(old ? { lastLoginBonusAt: old } : {}) } },
    );
    for (let i = 0; i < 3; i += 1) {
      const res = await supertest(app).post('/login').send({ email: u.email, password: PASSWORD });
      expect(res.status).toBe(200);
      await settle(); // the old grant was fire-and-forget: give it time to (not) land
    }
    await expectNoAccrual(u._id, legacy, old);
  });

  it('password login of an unverified user and a Google-provider user also writes nothing', async () => {
    const a = await mk();
    const b = await mk({ authProvider: 'google', googleId: 'g-t652' });
    for (const u of [a, b]) {
      const res = await supertest(app).post('/login').send({ email: u.email, password: PASSWORD });
      expect(res.status).toBe(200);
    }
    await settle();
    await expectNoAccrual(a._id, 0, null);
    await expectNoAccrual(b._id, 0, null);
  });

  it('signin verify link (verifies and signs in): no login_bonus, no earnedCredits, no lastLoginBonusAt', async () => {
    const u = await mk();
    const r = await mintVerifyLink(String(u._id), { linkKind: 'signin' });
    if (r.kind !== 'minted') throw new Error('not minted');
    const token = new URL(r.link).searchParams.get('token');
    const res = await supertest(app).post('/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string'); // it really signed in
    await settle();
    await expectNoAccrual(u._id, 0, null);
  });

  it('signin link on an already-verified legacy user (backdated claim) writes nothing', async () => {
    const old = new Date(Date.now() - 3 * DAY);
    const u = await mk();
    const r = await mintVerifyLink(String(u._id), { linkKind: 'signin' });
    if (r.kind !== 'minted') throw new Error('not minted');
    // verified after the link was sent (the link then signs in an already-verified account)
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { emailVerified: true, earnedCredits: 4, lastLoginBonusAt: old } },
    );
    const token = new URL(r.link).searchParams.get('token');
    const res = await supertest(app).post('/verify-email').send({ token });
    expect(res.status).toBe(200);
    await settle();
    await expectNoAccrual(u._id, 4, old);
  });

  it('test-signup bypass (signs in on register) and later logins: nothing but the test_grant Ink', async () => {
    const res = await supertest(app)
      .post('/register')
      .set('X-Forwarded-For', '203.0.113.77')
      .set({ 'bypass-test': 'true', 'bypass-password': SECRET })
      .send({ email: 'TEST_t652@example.com', password: PASSWORD, name: 'TEST_t652' });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.accessToken).toBe('string');
    for (let i = 0; i < 2; i += 1) {
      const login = await supertest(app)
        .post('/login')
        .send({ email: 'test_t652@example.com', password: PASSWORD });
      expect(login.status).toBe(200);
    }
    await settle();
    const u = (await rawUsers().findOne({ email: 'test_t652@example.com' }))!;
    await expectNoAccrual(u._id, 0, null);
    expect(u.inkTopup).toBe(60);
    expect(await ledger().countDocuments({ userId: u._id })).toBe(1);
  });

  it('the legacy fields stay in the schema (history is kept, just never written)', () => {
    expect(User.schema.path('earnedCredits')).toBeDefined();
    expect(User.schema.path('lastLoginBonusAt')).toBeDefined();
  });
});

describe('T-652 AC1 grantSignupBonus: no credits, no ledger row, no drafting call', () => {
  it('verified user: earnedCredits stays 0, zero creditledger rows, no grant-bonus fetch', async () => {
    const u = await mk({ emailVerified: true });
    await grantSignupBonus(String(u._id));
    await expectNoAccrual(u._id, 0, null);
    expect(await creditRows(u._id, 'signup_bonus')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('legacy balance N is hidden and untouched by the signup path', async () => {
    const u = await mk({ emailVerified: true });
    await rawUsers().updateOne({ _id: u._id }, { $set: { earnedCredits: 12 } });
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    await expectNoAccrual(u._id, 12, null);
    expect((await raw(u._id)).inkTopup).toBe(10); // the Ink is a separate, spendable bucket
  });

  it('log lines for the signup path carry no email or name (T-210)', async () => {
    const spies = [
      jest.spyOn(console, 'log').mockImplementation(() => undefined),
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    const u = await mk({
      email: 'priv-t652@example.com',
      name: 'Priv Name T652',
      emailVerified: true,
    });
    await grantSignupBonus(String(u._id));
    const all = [logger.info, logger.warn, logger.error].map((f) => f as unknown as jest.Mock);
    for (const m of [...all, ...spies]) {
      const text = JSON.stringify(m.mock.calls);
      expect(text).not.toContain('priv-t652@example.com');
      expect(text).not.toContain('Priv Name T652');
    }
  });
});

describe('T-652 M9d (i) the free Ink is never given twice', () => {
  async function expectInkOnce(id: unknown, units = 10) {
    const u = await raw(id);
    expect(u.inkTopup).toBe(units);
    expect(u.signupBonusGrantedAt).toBeInstanceOf(Date);
    const rows = await seeds(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: 10, reason: 'free_seed', sourceBucket: 'topup' });
  }

  it('repeat, parallel x8, then a retry: exactly 10 units, one free_seed row, marker set once', async () => {
    const u = await mk({ emailVerified: true });
    const id = String(u._id);
    await grantSignupBonus(id);
    const stamp = (await raw(id)).signupBonusGrantedAt as Date;
    await Promise.all(Array.from({ length: 8 }, () => grantSignupBonus(id)));
    await grantSignupBonus(id); // a retry
    await expectInkOnce(u._id);
    expect((await raw(id)).signupBonusGrantedAt).toEqual(stamp); // not re-stamped
  });

  it('parallel x8 on a fresh user (no earlier call) still seeds once', async () => {
    const u = await mk({ emailVerified: true });
    await Promise.all(Array.from({ length: 8 }, () => grantSignupBonus(String(u._id))));
    await expectInkOnce(u._id);
  });

  it('verify-email path and a direct (Google-style) call together: still 10', async () => {
    const u = await mk();
    const r = await mintVerifyLink(String(u._id));
    if (r.kind !== 'minted') throw new Error('not minted');
    const token = new URL(r.link).searchParams.get('token') as string;
    await Promise.all([
      verifyEmailToken(token),
      grantSignupBonus(String(u._id)), // may run before or after the verify; unverified => nothing
    ]);
    await grantSignupBonus(String(u._id)); // the Google link path calling it after verification
    await grantSignupBonus(String(u._id));
    await expectInkOnce(u._id);
  });

  it('a Google user hit by the signup path twice (new sign-up, then link) gets 10', async () => {
    const u = await mk({ authProvider: 'google', googleId: 'g-t652-twice' });
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    await expectInkOnce(u._id);
  });

  it.each(['seed first', 'referral first', 'parallel'])(
    'with a referral grant present (%s): the seed adds exactly 10, order-independent',
    async (order) => {
      await makeCode({ code: `T652${order.length}`, bonusInk: 3 });
      const u = await mk({ emailVerified: true });
      const id = String(u._id);
      const code = `T652${order.length}`;
      if (order === 'seed first') {
        await grantSignupBonus(id);
        await applyReferralCode(id, code);
      } else if (order === 'referral first') {
        await applyReferralCode(id, code);
        await grantSignupBonus(id);
      } else {
        await Promise.all([grantSignupBonus(id), applyReferralCode(id, code)]);
      }
      await grantSignupBonus(id);
      const doc = await raw(id);
      expect(doc.inkTopup).toBe(10 + 6);
      expect(await seeds(u._id)).toHaveLength(1);
      expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
      expect(doc.earnedCredits ?? 0).toBe(0);
    },
  );
});

describe('T-652 M9d (ii) the free Ink is not lost', () => {
  it('verified email user: inkTopup 10, a free_seed row, marker set', async () => {
    const u = await mk({ emailVerified: true });
    await grantSignupBonus(String(u._id));
    const d = await raw(u._id);
    expect(d.inkTopup).toBe(10);
    expect(d.signupBonusGrantedAt).toBeInstanceOf(Date);
    const rows = await seeds(u._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(10);
    expect(rows[0].balanceAfter).toBe(10);
  });

  it('Google user: inkTopup 10, a free_seed row, marker set', async () => {
    const u = await mk({ authProvider: 'google', googleId: 'g-t652-new' });
    await grantSignupBonus(String(u._id));
    const d = await raw(u._id);
    expect(d.inkTopup).toBe(10);
    expect(d.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(await seeds(u._id)).toHaveLength(1);
  });

  it('unverified password user: nothing and the marker stays unset; after verification, 10 Ink once', async () => {
    const u = await mk();
    await grantSignupBonus(String(u._id));
    const before = await raw(u._id);
    expect(before.inkTopup ?? 0).toBe(0);
    expect(before.signupBonusGrantedAt ?? null).toBeNull();
    expect(await seeds(u._id)).toHaveLength(0);

    const r = await mintVerifyLink(String(u._id));
    if (r.kind !== 'minted') throw new Error('not minted');
    const token = new URL(r.link).searchParams.get('token') as string;
    expect((await verifyEmailToken(token)).kind).toBe('verified');
    const after = await raw(u._id);
    expect(after.inkTopup).toBe(10);
    expect(after.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(await seeds(u._id)).toHaveLength(1);
    expect(after.earnedCredits ?? 0).toBe(0);
  });

  it('a user whose signupBonusGrantedAt is already set gets nothing more', async () => {
    const stamp = new Date(Date.now() - 5 * DAY);
    const u = await mk({ emailVerified: true });
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { signupBonusGrantedAt: stamp, inkTopup: 4 } },
    );
    await grantSignupBonus(String(u._id));
    const d = await raw(u._id);
    expect(d.inkTopup).toBe(4);
    expect(d.signupBonusGrantedAt).toEqual(stamp);
    expect(await seeds(u._id)).toHaveLength(0);
    expect(await creditRows(u._id)).toBe(0);
  });

  it('a legacy user whose marker is null (not missing) is still seeded once', async () => {
    const u = await mk({ emailVerified: true });
    await rawUsers().updateOne({ _id: u._id }, { $set: { signupBonusGrantedAt: null } });
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    expect((await raw(u._id)).inkTopup).toBe(10);
    expect(await seeds(u._id)).toHaveLength(1);
  });
});
