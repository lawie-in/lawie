/**
 * T-667: server balance `total` removal and credit amount hardening.
 *
 * AC1  getCreditBalance, GET /credits/balance and the 402 body carry no `total` (it summed
 *      earnedCredits in); earnedCredits stays as a named bucket; totalInk is the balance.
 * AC2  spendCredits and grantCredits refuse NaN / Infinity / -Infinity / <= 0 / non-number amounts
 *      with InvalidCreditAmountError before any read or write, with the earned flag on and off.
 * AC3  the T-653 source scan walks apps/<pkg>/scripts (the scan itself lives in t653; a small
 *      check here pins that script files are in its input set).
 */
import './setupEnv';
import './setupDb';
import fs from 'fs';
import path from 'path';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { CreditLedger } from '../models/CreditLedger.model';
import { User } from '../models/User.model';
import {
  EarnedCreditsSpendDisabledError,
  InsufficientCreditsError,
  InvalidCreditAmountError,
  getCreditBalance,
  grantCredits,
  spendCredits,
} from '../services/credits.service';

const USER_ID = '507f1f77bcf86cd7994396c7';
const OID = new mongoose.Types.ObjectId(USER_ID);
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16';
const AUTH = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 't667@example.com',
  'x-user-role': 'Client',
  'x-user-plan': 'free',
  'x-user-name': 'T667',
};

type Buckets = { topup?: number; earned?: number; sub?: number };

const originalFlag = env.EARNED_CREDITS_SPEND_ENABLED;
const setFlag = (on: boolean) => {
  env.EARNED_CREDITS_SPEND_ENABLED = on;
};

async function seed(b: Buckets = {}, extra: Record<string, unknown> = {}) {
  await User.collection.insertOne({
    _id: OID,
    email: 't667@example.com',
    name: 'T667',
    emailVerified: true,
    topupCredits: b.topup ?? 0,
    earnedCredits: b.earned ?? 0,
    subscriptionCredits: b.sub ?? 0,
    ...extra,
  });
}

const raw = async () =>
  (await User.collection.findOne({ _id: OID })) as unknown as {
    topupCredits: number;
    earnedCredits: number;
    subscriptionCredits: number;
  };
const rowCount = () => CreditLedger.countDocuments({});

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject');
}

/** Every numeric value in a JSON body, with its dotted path. */
function numbersIn(value: unknown, at = ''): Array<[string, number]> {
  if (typeof value === 'number') return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${at}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, at ? `${at}.${k}` : k));
  }
  return [];
}

function keysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysIn);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysIn(v)]);
  }
  return [];
}

afterEach(() => {
  env.EARNED_CREDITS_SPEND_ENABLED = originalFlag;
  jest.restoreAllMocks();
});

// ── AC1: no earned-inclusive `total` in any server balance ─────────────────────────────────────

const BALANCE_KEYS = [
  'billingCycle',
  'earnedCredits',
  'inkAnnualCarry',
  'inkSub',
  'inkSubMonthlyAllotment',
  'inkTopup',
  'planTier',
  'subscriptionCredits',
  'topupCredits',
  'totalInk',
];

describe('T-667 AC1: getCreditBalance has no total', () => {
  it('a user with topup, earned and sub credits: no `total` key, buckets and totalInk intact', async () => {
    // stored Ink units are x2: 4 + 2 + 6 units = 12 units = 6 Ink
    await seed(
      { topup: 3, earned: 50, sub: 7 },
      { inkSub: 4, inkAnnualCarry: 2, inkTopup: 6, planTier: 'free' },
    );
    const b = await getCreditBalance(USER_ID);
    expect(b).not.toHaveProperty('total');
    expect(Object.keys(b).sort()).toEqual(BALANCE_KEYS);
    expect(b.topupCredits).toBe(3);
    expect(b.earnedCredits).toBe(50);
    expect(b.subscriptionCredits).toBe(7);
    expect(b.inkSub).toBe(2);
    expect(b.inkAnnualCarry).toBe(1);
    expect(b.inkTopup).toBe(3);
    expect(b.totalInk).toBe(6);
    // no value anywhere offers the earned-inclusive sum (3 + 50 + 7)
    expect(numbersIn(b).filter(([, n]) => n === 60)).toEqual([]);
  });

  it('a user that does not exist: the empty result has no `total` either', async () => {
    const b = await getCreditBalance(USER_ID);
    expect(b).not.toHaveProperty('total');
    expect(Object.keys(b).sort()).toEqual(BALANCE_KEYS);
    expect(b.earnedCredits).toBe(0);
    expect(b.totalInk).toBe(0);
  });

  it('a malformed user id: the empty result has no `total`', async () => {
    const b = await getCreditBalance('not-an-id');
    expect(b).not.toHaveProperty('total');
    expect(Object.keys(b).sort()).toEqual(BALANCE_KEYS);
  });
});

describe('T-667 AC1: HTTP responses', () => {
  const EARNED_INCLUSIVE_SUM = 60;
  const seedEarned = () =>
    seed(
      { topup: 3, earned: 50, sub: 7 },
      { inkSub: 0, inkAnnualCarry: 0, inkTopup: 0, planTier: 'free' },
    );

  it('GET /credits/balance: no `total`, earnedCredits is the bucket figure, totalInk is a number', async () => {
    await seedEarned();
    const res = await supertest(app).get('/credits/balance').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('total');
    expect(Object.keys(res.body).sort()).toEqual(BALANCE_KEYS);
    expect(res.body.earnedCredits).toBe(50);
    expect(typeof res.body.totalInk).toBe('number');
    expect(numbersIn(res.body).filter(([, n]) => n === EARNED_INCLUSIVE_SUM)).toEqual([]);
  });

  it('402 from enforceCredits (earned credits, too little Ink): no `total` anywhere, no earned-inclusive figure', async () => {
    await seedEarned();
    const res = await supertest(app)
      .post('/generate-from-template')
      .set(AUTH)
      .send({ template_id: 'bail_anticipatory', form_data: { applicant_name: 'Test' } });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Insufficient Ink');
    expect(res.body.balance).not.toHaveProperty('total');
    expect(keysIn(res.body)).not.toContain('total');
    expect(Object.keys(res.body.balance).sort()).toEqual(BALANCE_KEYS);
    expect(Object.keys(res.body).sort()).toEqual(
      ['balance', 'cost', 'error', 'message', 'needsTopUp', 'needsUpgrade', 'upgradeUrl'].sort(),
    );
    expect(res.body.balance.earnedCredits).toBe(50);
    expect(res.body.balance.totalInk).toBe(0);
    expect(numbersIn(res.body).filter(([, n]) => n === EARNED_INCLUSIVE_SUM)).toEqual([]);
    expect(res.body.message).not.toContain(String(EARNED_INCLUSIVE_SUM));
  });
});

// ── AC2: amount hardening ──────────────────────────────────────────────────────────────────────

const BAD_AMOUNTS: Array<[string, unknown]> = [
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
  ['-1', -1],
  ['0', 0],
  ['-0', -0],
  ["'5'", '5'],
  ['undefined', undefined],
];

const FLAGS: Array<[string, boolean]> = [
  ['off', false],
  ['on', true],
];

function expectedMessage(op: string, amount: unknown): string {
  return typeof amount === 'number' && Number.isFinite(amount)
    ? `${op}: amount must be > 0 (got ${amount})`
    : `${op}: amount must be a finite number`;
}

describe('T-667 AC2: invalid amounts are refused before any read or write', () => {
  describe.each(FLAGS)('earned flag %s', (_flagLabel, on) => {
    it.each(BAD_AMOUNTS)(
      'spendCredits amount %s: InvalidCreditAmountError, no read, no write',
      async (_label, amount) => {
        setFlag(on);
        await seed({ topup: 5, earned: 5, sub: 5 });
        const find = jest.spyOn(User, 'findById');
        const foau = jest.spyOn(User, 'findOneAndUpdate');
        const fbau = jest.spyOn(User, 'findByIdAndUpdate');
        const create = jest.spyOn(CreditLedger, 'create');

        const err = await caught(spendCredits({ userId: USER_ID, amount: amount as number }));

        expect(err).toBeInstanceOf(InvalidCreditAmountError);
        const typed = err as InvalidCreditAmountError;
        expect(typed.name).toBe('InvalidCreditAmountError');
        expect(typed.code).toBe('invalid_credit_amount');
        expect(typed.operation).toBe('spendCredits');
        expect(typed.message).toBe(expectedMessage('spendCredits', amount));
        expect(typed.message).not.toContain(USER_ID);
        expect(find).not.toHaveBeenCalled();
        expect(foau).not.toHaveBeenCalled();
        expect(fbau).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(await raw()).toMatchObject({
          topupCredits: 5,
          earnedCredits: 5,
          subscriptionCredits: 5,
        });
        expect(await rowCount()).toBe(0);
      },
    );

    it.each(BAD_AMOUNTS)(
      'grantCredits amount %s (topup bucket): InvalidCreditAmountError, no read, no write',
      async (_label, amount) => {
        setFlag(on);
        await seed({ topup: 5, earned: 5, sub: 5 });
        const find = jest.spyOn(User, 'findById');
        const fbau = jest.spyOn(User, 'findByIdAndUpdate');
        const create = jest.spyOn(CreditLedger, 'create');

        const err = await caught(
          grantCredits({
            userId: USER_ID,
            bucket: 'topupCredits',
            amount: amount as number,
            source: 'admin_grant',
          }),
        );

        expect(err).toBeInstanceOf(InvalidCreditAmountError);
        const typed = err as InvalidCreditAmountError;
        expect(typed.code).toBe('invalid_credit_amount');
        expect(typed.operation).toBe('grantCredits');
        expect(typed.message).toBe(expectedMessage('grantCredits', amount));
        expect(typed.message).not.toContain(USER_ID);
        expect(find).not.toHaveBeenCalled();
        expect(fbau).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(await raw()).toMatchObject({
          topupCredits: 5,
          earnedCredits: 5,
          subscriptionCredits: 5,
        });
        expect(await rowCount()).toBe(0);
      },
    );

    it.each(BAD_AMOUNTS)(
      'grantCredits amount %s to earnedCredits: the amount error comes BEFORE the earned-flag refusal',
      async (_label, amount) => {
        setFlag(on);
        await seed({ earned: 5 });
        const fbau = jest.spyOn(User, 'findByIdAndUpdate');
        const err = await caught(
          grantCredits({
            userId: USER_ID,
            bucket: 'earnedCredits',
            amount: amount as number,
            source: 'admin_grant',
          }),
        );
        expect(err).toBeInstanceOf(InvalidCreditAmountError);
        expect(err).not.toBeInstanceOf(EarnedCreditsSpendDisabledError);
        expect(fbau).not.toHaveBeenCalled();
        expect(await raw()).toMatchObject({ earnedCredits: 5 });
        expect(await rowCount()).toBe(0);
      },
    );

    it('grantCredits invalid amount with a malformed userId: the amount error still comes first', async () => {
      setFlag(on);
      const err = await caught(
        grantCredits({
          userId: 'not-an-id',
          bucket: 'topupCredits',
          amount: Number.NaN,
          source: 'admin_grant',
        }),
      );
      expect(err).toBeInstanceOf(InvalidCreditAmountError);
      expect((err as Error).message).not.toContain('not-an-id');
    });
  });

  it('the error is its own class: not Insufficient, not the earned-spend refusal', () => {
    const e = new InvalidCreditAmountError('spendCredits', Number.NaN);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(InsufficientCreditsError);
    expect(e).not.toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(new EarnedCreditsSpendDisabledError()).not.toBeInstanceOf(InvalidCreditAmountError);
    expect(new InsufficientCreditsError(1, 0)).not.toBeInstanceOf(InvalidCreditAmountError);
  });

  it('a non-integer positive amount (0.5) is still accepted', async () => {
    setFlag(false);
    await seed({ topup: 5 });
    const res = await spendCredits({ userId: USER_ID, amount: 0.5 });
    expect(res.totalSpent).toBe(0.5);
    expect(await raw()).toMatchObject({ topupCredits: 4.5 });
    expect(
      await grantCredits({
        userId: USER_ID,
        bucket: 'topupCredits',
        amount: 0.5,
        source: 'admin_grant',
      }),
    ).toBe(5);
  });

  it('isolated module load with the flag on: an invalid amount is refused with no DB access', async () => {
    const saved = process.env.EARNED_CREDITS_SPEND_ENABLED;
    process.env.EARNED_CREDITS_SPEND_ENABLED = 'true';
    try {
      let mod = {} as typeof import('../services/credits.service');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mod = require('../services/credits.service');
      });
      expect(mod.isEarnedSpendEnabled()).toBe(true);
      const err = await caught(mod.spendCredits({ userId: USER_ID, amount: Number.NaN }));
      expect((err as Error).name).toBe('InvalidCreditAmountError');
      expect((err as { code?: string }).code).toBe('invalid_credit_amount');
    } finally {
      if (saved === undefined) delete process.env.EARNED_CREDITS_SPEND_ENABLED;
      else process.env.EARNED_CREDITS_SPEND_ENABLED = saved;
    }
  });
});

describe('T-667 AC2: earned-flag behaviour with a VALID amount is unchanged', () => {
  it('flag off, valid grant to earnedCredits: still EarnedCreditsSpendDisabledError, nothing written', async () => {
    setFlag(false);
    await seed({ earned: 5 });
    const err = await caught(
      grantCredits({ userId: USER_ID, bucket: 'earnedCredits', amount: 2, source: 'admin_grant' }),
    );
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(err).not.toBeInstanceOf(InvalidCreditAmountError);
    expect(await raw()).toMatchObject({ earnedCredits: 5 });
    expect(await rowCount()).toBe(0);
  });

  it('flag off, valid spend that would touch earned: still EarnedCreditsSpendDisabledError, nothing written', async () => {
    setFlag(false);
    await seed({ topup: 0, earned: 5, sub: 10 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 3 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(err).not.toBeInstanceOf(InvalidCreditAmountError);
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 5,
      subscriptionCredits: 10,
    });
    expect(await rowCount()).toBe(0);
  });

  it('flag on, valid grant to earnedCredits still works', async () => {
    setFlag(true);
    await seed({ earned: 5 });
    expect(
      await grantCredits({
        userId: USER_ID,
        bucket: 'earnedCredits',
        amount: 2,
        source: 'admin_grant',
      }),
    ).toBe(7);
  });
});

describe('T-667 AC2: spendCredits after dropping balance.total (T-653 behaviour unchanged)', () => {
  it('flag off, all buckets too small: Insufficient with available = topup + sub (earned excluded)', async () => {
    setFlag(false);
    await seed({ topup: 2, earned: 4, sub: 3 });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 100 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.required).toBe(100);
    expect(err.available).toBe(5);
    expect(err.shortBy).toBe(95);
    expect(await raw()).toMatchObject({
      topupCredits: 2,
      earnedCredits: 4,
      subscriptionCredits: 3,
    });
    expect(await rowCount()).toBe(0);
  });

  it('flag on, all buckets too small: Insufficient with available = topup + earned + sub', async () => {
    setFlag(true);
    await seed({ topup: 2, earned: 4, sub: 3 });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 100 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.available).toBe(9);
  });

  it('flag off, topup + sub cover the amount (earned 0): plans normally, topup then sub', async () => {
    setFlag(false);
    await seed({ topup: 2, earned: 0, sub: 10 });
    const res = await spendCredits({ userId: USER_ID, amount: 5 });
    expect(res).toEqual({
      spent: [
        { bucket: 'topupCredits', amount: 2 },
        { bucket: 'subscriptionCredits', amount: 3 },
      ],
      totalSpent: 5,
    });
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 0,
      subscriptionCredits: 7,
    });
    expect(await rowCount()).toBe(2);
  });

  it('flag off, earned > 0 sits between topup and sub: the original order still refuses (T-653)', async () => {
    setFlag(false);
    await seed({ topup: 0, earned: 5, sub: 10 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 3 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
  });

  it('flag on, spend spans topup, earned and sub', async () => {
    setFlag(true);
    await seed({ topup: 2, earned: 3, sub: 5 });
    const res = await spendCredits({ userId: USER_ID, amount: 7 });
    expect(res.spent).toEqual([
      { bucket: 'topupCredits', amount: 2 },
      { bucket: 'earnedCredits', amount: 3 },
      { bucket: 'subscriptionCredits', amount: 2 },
    ]);
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 0,
      subscriptionCredits: 3,
    });
  });
});

// ── AC3: the T-653 scan covers scripts ─────────────────────────────────────────────────────────

describe('T-667 AC3: the T-653 source scan covers apps/*/scripts', () => {
  it('t653 scans <pkg>/scripts, and real script files exist for it to read', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    for (const rel of [
      'apps/billing/scripts/backfill-invoices.ts',
      'apps/auth/scripts/backfill-free-seed.ts',
      'apps/drafting/scripts/seed-app-setting.ts',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, rel))).toBe(true);
    }
    const scan = fs.readFileSync(path.join(__dirname, 't653-earned-credits-guard.test.ts'), 'utf8');
    expect(scan).toMatch(/\['src', 'scripts'\]/);
    expect(scan).toContain("expect(files).toContain('apps/billing/scripts/backfill-invoices.ts')");
  });
});
