/**
 * T-298 (Arjun 12 Oct 2026) + T-234 Ajay merge gate, password side.
 *
 * Unit math: bonusInk N credits N*2 ledger units into the raw users.inkTopup bucket
 * (display = units / 2). The signup seed adds 10 units (5 Ink). So a referred new user ends
 * with inkTopup = 10 + 2N and two ledger rows (free_seed delta 10, referral_bonus delta 2N).
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import { registerUser } from '../services/auth.service';
import { grantSignupBonus } from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';

import { ledger, makeCode, rawUsers, waitFor, waitForSeed } from './t234-helpers';

const PASSWORD = 'Passw0rdOk';
const BONUS = 3; // Ink -> 6 units

beforeEach(() => {
  // signalDraftingBonus calls the drafting service over HTTP; never hit the network.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

const reg = (email: string, extra: Record<string, unknown> = {}) =>
  supertest(app)
    .post('/register')
    .send({ email, password: PASSWORD, name: 'Ref Person', ...extra });

async function mkUser(email = 'u@example.com') {
  return User.create({ email, name: 'U', password: PASSWORD, role: 'Lawyer' });
}

async function expectBalanceAndLedgerAgree(userId: unknown, expectedUnits: number, rows: number) {
  const raw = await rawUsers().findOne({ _id: userId as mongoose.Types.ObjectId });
  expect(raw!.inkTopup).toBe(expectedUnits);
  const rowsDocs = await ledger().find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray();
  expect(rowsDocs).toHaveLength(rows);
  const sum = rowsDocs.reduce((a, r) => a + (r.delta as number), 0);
  expect(sum).toBe(expectedUnits);
  // the last-written row (largest balanceAfter) must equal the real balance
  expect(Math.max(...rowsDocs.map((r) => r.balanceAfter as number))).toBe(expectedUnits);
  return rowsDocs;
}

describe('T-298 / Ajay gate — NEW email sign-up with a referral code credits top-up Ink', () => {
  it('register 201, referralApplied true; raw inkTopup = 10 + 2N, ledger agrees', async () => {
    await makeCode({ code: 'GATEPW1', bonusInk: BONUS });
    const res = await reg('gate-pw@example.com', { referralCode: 'gatepw1' });
    expect(res.status).toBe(201);
    expect(res.body.data.referralApplied).toBe(true);

    const u = await User.findOne({ email: 'gate-pw@example.com' }).lean();
    await waitForSeed(u!._id);
    const rows = await expectBalanceAndLedgerAgree(u!._id, 10 + BONUS * 2, 2);
    const ref = rows.find((r) => r.reason === 'referral_bonus')!;
    expect(ref.delta).toBe(BONUS * 2);
    expect(ref.sourceBucket).toBe('topup');
    expect(ref.reference).toBe('GATEPW1');
    expect(rows.filter((r) => r.reason === 'free_seed')).toHaveLength(1);

    const code = await ReferralCode.findOne({ code: 'GATEPW1' }).lean();
    expect(code!.uses).toBe(1);
    expect(String(u!.referredVia)).toBe(String(code!._id));
    expect(u!.role).toBe('Lawyer');
  });

  it('default bonus (5 Ink) -> inkTopup 20', async () => {
    await makeCode({ code: 'DEFAULT5', bonusInk: 5 });
    const res = await reg('def5@example.com', { referralCode: 'DEFAULT5' });
    expect(res.body.data.referralApplied).toBe(true);
    const u = await User.findOne({ email: 'def5@example.com' }).lean();
    await waitForSeed(u!._id);
    await expectBalanceAndLedgerAgree(u!._id, 20, 2);
  });

  it('the referral Ink lands exactly once even if the code is applied again', async () => {
    await makeCode({ code: 'ONCEONLY', bonusInk: BONUS });
    const res = await reg('once@example.com', { referralCode: 'ONCEONLY' });
    expect(res.body.data.referralApplied).toBe(true);
    const u = await User.findOne({ email: 'once@example.com' }).lean();
    await waitForSeed(u!._id);
    expect(await applyReferralCode(u!._id.toString(), 'ONCEONLY')).toBe('already_applied');
    await expectBalanceAndLedgerAgree(u!._id, 10 + BONUS * 2, 2);
    expect((await ReferralCode.findOne({ code: 'ONCEONLY' }).lean())!.uses).toBe(1);
  });

  it('legacy freeTierBonusGrant still set (bonus*5)', async () => {
    await makeCode({ code: 'LEGACY1', bonusInk: BONUS });
    await reg('legacy@example.com', { referralCode: 'LEGACY1' });
    const u = await User.findOne({ email: 'legacy@example.com' }).lean();
    expect(u!.freeTierBonusGrant).toBe(BONUS * 5);
  });
});

describe('T-298 d — exactly once under concurrency', () => {
  it('two concurrent applyReferralCode calls: one grant, uses +1', async () => {
    await makeCode({ code: 'RACE2', bonusInk: BONUS });
    const u = await mkUser('race2@example.com');
    const results = await Promise.all([
      applyReferralCode(u._id.toString(), 'RACE2'),
      applyReferralCode(u._id.toString(), 'RACE2'),
    ]);
    expect(results.filter((r) => r === 'applied')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_applied')).toHaveLength(1);
    expect((await ReferralCode.findOne({ code: 'RACE2' }).lean())!.uses).toBe(1);
    await expectBalanceAndLedgerAgree(u._id, BONUS * 2, 1);
  });

  it('ten concurrent calls: still one grant', async () => {
    await makeCode({ code: 'RACE10', bonusInk: BONUS });
    const u = await mkUser('race10@example.com');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => applyReferralCode(u._id.toString(), 'RACE10')),
    );
    expect(results.filter((r) => r === 'applied')).toHaveLength(1);
    expect((await ReferralCode.findOne({ code: 'RACE10' }).lean())!.uses).toBe(1);
    await expectBalanceAndLedgerAgree(u._id, BONUS * 2, 1);
  });

  it('a second, different code cannot be applied after the first', async () => {
    await makeCode({ code: 'FIRSTC', bonusInk: BONUS });
    await makeCode({ code: 'SECONDC', bonusInk: 9 });
    const u = await mkUser('twocodes@example.com');
    expect(await applyReferralCode(u._id.toString(), 'FIRSTC')).toBe('applied');
    expect(await applyReferralCode(u._id.toString(), 'SECONDC')).toBe('already_applied');
    expect((await ReferralCode.findOne({ code: 'SECONDC' }).lean())!.uses).toBe(0);
    await expectBalanceAndLedgerAgree(u._id, BONUS * 2, 1);
  });
});

describe('T-298 c — signup seed and referral are order-independent', () => {
  it('referral first, then seed: inkTopup = 10 + 2N, two rows, seed balanceAfter from returned doc', async () => {
    await makeCode({ code: 'ORDER1', bonusInk: BONUS });
    const u = await mkUser('order1@example.com');
    expect(await applyReferralCode(u._id.toString(), 'ORDER1')).toBe('applied');
    await grantSignupBonus(u._id.toString());
    const rows = await expectBalanceAndLedgerAgree(u._id, 10 + BONUS * 2, 2);
    const seed = rows.find((r) => r.reason === 'free_seed')!;
    expect(seed.balanceAfter).toBe(10 + BONUS * 2);
    const raw = await rawUsers().findOne({ _id: u._id });
    expect(raw).toMatchObject({ inkSub: 0, inkAnnualCarry: 0, inkSubMonthlyAllotment: 0 });
  });

  it('seed first, then referral: same final balance', async () => {
    await makeCode({ code: 'ORDER2', bonusInk: BONUS });
    const u = await mkUser('order2@example.com');
    await grantSignupBonus(u._id.toString());
    expect(await applyReferralCode(u._id.toString(), 'ORDER2')).toBe('applied');
    const rows = await expectBalanceAndLedgerAgree(u._id, 10 + BONUS * 2, 2);
    expect(rows.find((r) => r.reason === 'referral_bonus')!.balanceAfter).toBe(10 + BONUS * 2);
  });

  it('concurrent seed + referral (repeated): never loses the 5 free Ink', async () => {
    await makeCode({ code: 'ORDER3', bonusInk: BONUS });
    for (let i = 0; i < 8; i++) {
      const u = await mkUser(`order3-${i}@example.com`);
      await Promise.all([
        grantSignupBonus(u._id.toString()),
        applyReferralCode(u._id.toString(), 'ORDER3'),
      ]);
      await expectBalanceAndLedgerAgree(u._id, 10 + BONUS * 2, 2);
    }
  });

  it('seed alone is still once-only (second call adds nothing)', async () => {
    const u = await mkUser('seedonce@example.com');
    await grantSignupBonus(u._id.toString());
    await grantSignupBonus(u._id.toString());
    await expectBalanceAndLedgerAgree(u._id, 10, 1);
    expect((await User.findById(u._id).lean())!.earnedCredits).toBe(5);
  });

  it('plain register (no code): inkTopup 10, one ledger row, referralApplied absent', async () => {
    const res = await reg('nocode@example.com');
    expect(res.status).toBe(201);
    expect('referralApplied' in res.body.data).toBe(false);
    const u = await User.findOne({ email: 'nocode@example.com' }).lean();
    await waitForSeed(u!._id);
    await expectBalanceAndLedgerAgree(u!._id, 10, 1);
    expect(u!.role).toBe('Lawyer');
  });
});

describe('Ajay Addendum 1 — expired / used-up / unknown code at email sign-up', () => {
  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 60_000) }],
    ['used up', { maxUses: 1, uses: 1 }],
  ] as Array<[string, { expiresAt?: Date; maxUses?: number; uses?: number }]>)(
    '%s code: 201, referralApplied false, account created, no referral Ink',
    async (_l, opts) => {
      await makeCode({ code: 'DEADCODE', bonusInk: BONUS, ...opts });
      const res = await reg('dead@example.com', { referralCode: 'DEADCODE' });
      expect(res.status).toBe(201);
      expect(res.body.data.referralApplied).toBe(false);
      const u = await User.findOne({ email: 'dead@example.com' }).lean();
      expect(u).not.toBeNull();
      expect(u!.referredVia ?? null).toBeNull();
      await waitForSeed(u!._id);
      const rows = await expectBalanceAndLedgerAgree(u!._id, 10, 1);
      expect(rows[0].reason).toBe('free_seed');
      expect((await ReferralCode.findOne({ code: 'DEADCODE' }).lean())!.uses).toBe(opts.uses ?? 0);
    },
  );

  it('disabled and unknown codes: referralApplied false', async () => {
    await makeCode({ code: 'OFFCODE1', bonusInk: BONUS });
    await ReferralCode.updateOne({ code: 'OFFCODE1' }, { isActive: false });
    const a = await reg('off@example.com', { referralCode: 'OFFCODE1' });
    const b = await reg('nosuch@example.com', { referralCode: 'NOSUCHXX' });
    expect(a.status).toBe(201);
    expect(a.body.data.referralApplied).toBe(false);
    expect(b.status).toBe(201);
    expect(b.body.data.referralApplied).toBe(false);
  });
});

describe('T-298 / Arjun — maxUses can never be overshot', () => {
  it('maxUses 1, five concurrent sign-ups: one grant, uses = 1, four created with no Ink and referralApplied:false', async () => {
    await makeCode({ code: 'ONESLOT', bonusInk: BONUS, maxUses: 1 });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => reg(`slot${i}@example.com`, { referralCode: 'ONESLOT' })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const applied = results.filter((r) => r.body.data.referralApplied === true);
    const refused = results.filter((r) => r.body.data.referralApplied === false);
    expect(applied).toHaveLength(1);
    expect(refused).toHaveLength(4);

    const code = await ReferralCode.findOne({ code: 'ONESLOT' }).lean();
    expect(code!.uses).toBe(1);

    const users = await User.find({ email: /^slot\d@example.com$/ }).lean();
    expect(users).toHaveLength(5);
    for (const u of users) await waitForSeed(u._id);
    const referred = users.filter((u) => u.referredVia);
    const notReferred = users.filter((u) => !u.referredVia);
    expect(referred).toHaveLength(1);
    expect(notReferred).toHaveLength(4);
    expect(String(referred[0].referredVia)).toBe(String(code!._id));
    await expectBalanceAndLedgerAgree(referred[0]._id, 10 + BONUS * 2, 2);
    for (const u of notReferred) {
      await expectBalanceAndLedgerAgree(u._id, 10, 1);
      expect(u.freeTierBonusGrant).toBe(0);
    }
    expect(await ledger().countDocuments({ reason: 'referral_bonus' })).toBe(1);
  });

  it('maxUses 3, ten concurrent applications: exactly three grants', async () => {
    await makeCode({ code: 'THREESLOT', bonusInk: BONUS, maxUses: 3 });
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => mkUser(`three${i}@example.com`)),
    );
    const results = await Promise.all(
      users.map((u) => applyReferralCode(u._id.toString(), 'THREESLOT')),
    );
    expect(results.filter((r) => r === 'applied')).toHaveLength(3);
    expect(results.filter((r) => r === 'invalid')).toHaveLength(7);
    expect((await ReferralCode.findOne({ code: 'THREESLOT' }).lean())!.uses).toBe(3);
    expect(await ledger().countDocuments({ reason: 'referral_bonus' })).toBe(3);
    // a refused user's claim is released
    const refusedIds = users.filter((_, i) => results[i] === 'invalid').map((u) => u._id);
    const stillReferred = await User.countDocuments({
      _id: { $in: refusedIds },
      referredVia: { $ne: null },
    });
    expect(stillReferred).toBe(0);
  });

  it('unlimited code (maxUses null) has no cap', async () => {
    await makeCode({ code: 'NOCAP', bonusInk: BONUS, maxUses: null });
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => mkUser(`nocap${i}@example.com`)),
    );
    const results = await Promise.all(
      users.map((u) => applyReferralCode(u._id.toString(), 'NOCAP')),
    );
    expect(results.every((r) => r === 'applied')).toBe(true);
    expect((await ReferralCode.findOne({ code: 'NOCAP' }).lean())!.uses).toBe(6);
  });
});

describe('T-298 — role', () => {
  it.each(['Admin', 'admin', 'Client', { role: 'Admin' }])(
    'password register gives Lawyer even with body role %p',
    async (role) => {
      const email = `role-${Math.random().toString(36).slice(2)}@example.com`;
      const res = await reg(email, { role });
      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('Lawyer');
      expect((await User.findOne({ email }).lean())!.role).toBe('Lawyer');
    },
  );

  it('service level: registerUser sets Lawyer', async () => {
    const { user } = await registerUser({
      email: 'svcrole@example.com',
      password: PASSWORD,
      name: 'S',
    });
    expect(user.role).toBe('Lawyer');
  });

  it('schema default stays Client (least privilege) and existing users are untouched', async () => {
    const u = await User.create({ email: 'dflt@example.com', name: 'D', password: PASSWORD });
    expect(u.role).toBe('Client');
    await reg('someoneelse@example.com');
    expect((await User.findById(u._id).lean())!.role).toBe('Client');
  });
});

describe('T-298 — seed vs referral wait helper sanity', () => {
  it('waitFor times out when the condition never holds', async () => {
    await expect(waitFor(async () => false, 100)).rejects.toThrow('timed out');
  });
});
