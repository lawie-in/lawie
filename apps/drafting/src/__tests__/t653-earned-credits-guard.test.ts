/**
 * T-653 (Ajay AJ-646-M9c): spendCredits (and grantCredits) refuse the legacy earnedCredits bucket
 * unless EARNED_CREDITS_SPEND_ENABLED is exactly 'true'. The flag is off by default.
 *
 * AC1  refusal unless the flag is on: flag parsing table, refusal tests, grant refusal.
 * AC2  a spend that would touch earnedCredits is refused and nothing is written; other buckets
 *      are unaffected.
 * AC3  (process rule, no code) any future scheme's offer goes to Ajay: nothing to test; the source
 *      scan below pins that no other file writes earnedCredits and nothing calls spendCredits.
 *
 * Deliberate consequence pinned here: with the flag off the ORIGINAL order (topup, earned, sub)
 * is kept, so topup 0 / earned 5 / sub 10, spend 3 is refused even though topup + sub would cover it.
 */
import './setupDb';
import fs from 'fs';
import path from 'path';

import mongoose from 'mongoose';

import { env } from '../config/env';
import { enforceCredits } from '../middleware/enforceCredits';
import { CreditLedger } from '../models/CreditLedger.model';
import { User } from '../models/User.model';
import {
  EarnedCreditsSpendDisabledError,
  InsufficientCreditsError,
  InvalidCreditAmountError,
  grantCredits,
  isEarnedSpendEnabled,
  spendCredits,
} from '../services/credits.service';

const USER_ID = '507f1f77bcf86cd7994396b1';
const OID = new mongoose.Types.ObjectId(USER_ID);
const FIXED_MESSAGE = 'The earnedCredits bucket cannot be spent: no signed bonus scheme is active.';

type Buckets = { topup?: number; earned?: number; sub?: number };
type Raw = { topupCredits: number; earnedCredits: number; subscriptionCredits: number };

const originalFlag = env.EARNED_CREDITS_SPEND_ENABLED;
const setFlag = (on: boolean) => {
  env.EARNED_CREDITS_SPEND_ENABLED = on;
};

async function seed(b: Buckets = {}, extra: Record<string, unknown> = {}) {
  await User.collection.insertOne({
    _id: OID,
    email: 't653@example.com',
    name: 'T653',
    emailVerified: true,
    topupCredits: b.topup ?? 0,
    earnedCredits: b.earned ?? 0,
    subscriptionCredits: b.sub ?? 0,
    ...extra,
  });
}

async function raw(): Promise<Raw> {
  return (await User.collection.findOne({ _id: OID })) as unknown as Raw;
}

const rows = () => CreditLedger.find({ userId: OID }).sort({ createdAt: 1, _id: 1 }).lean();
const rowCount = () => CreditLedger.countDocuments({});

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject');
}

afterEach(() => {
  env.EARNED_CREDITS_SPEND_ENABLED = originalFlag;
  jest.restoreAllMocks();
});

// ── (5) the flag and how it is parsed ───────────────────────────────────────────────────────────

describe('T-653 flag: EARNED_CREDITS_SPEND_ENABLED', () => {
  const NAME = 'EARNED_CREDITS_SPEND_ENABLED';

  function loadWith(value: string | undefined): { enabled: unknown; exited: boolean } {
    const saved = process.env[NAME];
    if (value === undefined) delete process.env[NAME];
    else process.env[NAME] = value;
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const errLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let enabled: unknown;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        enabled = require('../config/env').env.EARNED_CREDITS_SPEND_ENABLED;
      });
      return { enabled, exited: exit.mock.calls.length > 0 };
    } finally {
      if (saved === undefined) delete process.env[NAME];
      else process.env[NAME] = saved;
      exit.mockRestore();
      errLog.mockRestore();
    }
  }

  it('is off in the test environment by default (the real loaded env)', () => {
    expect(originalFlag).toBe(false);
    expect(isEarnedSpendEnabled()).toBe(false);
  });

  it("only the exact string 'true' turns it on", () => {
    expect(loadWith('true')).toEqual({ enabled: true, exited: false });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['TRUE', 'TRUE'],
    ['True', 'True'],
    ['1', '1'],
    ['yes', 'yes'],
    ['leading space', ' true'],
    ['trailing space', 'true '],
    ['on', 'on'],
    ['garbage', 'maybe-later'],
  ])('%s is off, and loading neither throws nor exits', (_label, value) => {
    expect(loadWith(value)).toEqual({ enabled: false, exited: false });
  });

  it('isEarnedSpendEnabled reads the env object at call time', () => {
    expect(isEarnedSpendEnabled()).toBe(false);
    setFlag(true);
    expect(isEarnedSpendEnabled()).toBe(true);
    setFlag(false);
    expect(isEarnedSpendEnabled()).toBe(false);
  });
});

// ── (1) the typed error ─────────────────────────────────────────────────────────────────────────

describe('T-653 flag off: a spend that needs earnedCredits is refused, nothing is written', () => {
  it('topup 0, earned 5, sub 0, spend 3: typed error with the fixed message; earned still 5; no ledger row', async () => {
    await seed({ earned: 5 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 3 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(InsufficientCreditsError);
    const e = err as EarnedCreditsSpendDisabledError;
    expect(e.name).toBe('EarnedCreditsSpendDisabledError');
    expect(e.code).toBe('earned_credits_spend_disabled');
    expect(e.message).toBe(FIXED_MESSAGE);
    // no id, amount or balance in the message
    expect(e.message).not.toContain(USER_ID);
    expect(e.message).not.toMatch(/\d/);
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 5,
      subscriptionCredits: 0,
    });
    expect(await rowCount()).toBe(0);
  });

  it('topup 2 + earned 5, spend 4 (spills into earned): refused, topup NOT debited, no rows', async () => {
    await seed({ topup: 2, earned: 5 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 4 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(await raw()).toMatchObject({
      topupCredits: 2,
      earnedCredits: 5,
      subscriptionCredits: 0,
    });
    expect(await rowCount()).toBe(0);
  });

  it('makes no User write at all when it refuses', async () => {
    await seed({ topup: 2, earned: 5 });
    const foau = jest.spyOn(User, 'findOneAndUpdate');
    const fbu = jest.spyOn(User, 'findByIdAndUpdate');
    const create = jest.spyOn(CreditLedger, 'create');
    await caught(spendCredits({ userId: USER_ID, amount: 4 }));
    expect(foau).not.toHaveBeenCalled();
    expect(fbu).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('pins the deliberate consequence: topup 0, earned 5, sub 10, spend 3 is refused (original order kept)', async () => {
    await seed({ earned: 5, sub: 10 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 3 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 5,
      subscriptionCredits: 10,
    });
    expect(await rowCount()).toBe(0);
  });

  it('topup 1 + sub 1 + earned 100, spend 5: total covers it, plan reaches earned, so refused', async () => {
    await seed({ topup: 1, sub: 1, earned: 100 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 5 }));
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect(await raw()).toMatchObject({
      topupCredits: 1,
      earnedCredits: 100,
      subscriptionCredits: 1,
    });
    expect(await rowCount()).toBe(0);
  });
});

// ── (3) other buckets unaffected while off ──────────────────────────────────────────────────────

describe('T-653 flag off: spends that never reach earnedCredits work as before', () => {
  it('fully covered by topup (earned > 0 in the document): earned untouched, one row, right shape', async () => {
    await seed({ topup: 10, earned: 7, sub: 4 });
    const res = await spendCredits({
      userId: USER_ID,
      amount: 4,
      templateId: 'nda',
      reference: 'NDA draft',
    });
    expect(res).toEqual({ spent: [{ bucket: 'topupCredits', amount: 4 }], totalSpent: 4 });
    expect(await raw()).toMatchObject({
      topupCredits: 6,
      earnedCredits: 7,
      subscriptionCredits: 4,
    });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      source: 'draft_spent',
      bucket: 'topupCredits',
      amount: -4,
      balanceAfter: 6,
      templateId: 'nda',
      reference: 'NDA draft',
    });
  });

  it('topup 0, earned 0, sub 10, spend 3: succeeds from subscriptionCredits', async () => {
    await seed({ sub: 10 });
    const res = await spendCredits({ userId: USER_ID, amount: 3 });
    expect(res).toEqual({ spent: [{ bucket: 'subscriptionCredits', amount: 3 }], totalSpent: 3 });
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 0,
      subscriptionCredits: 7,
    });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bucket: 'subscriptionCredits', amount: -3, balanceAfter: 7 });
  });

  it('topup + sub spill with earned 0: both debited in order, one row each, negative amounts', async () => {
    await seed({ topup: 2, sub: 10 });
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
    const r = await rows();
    expect(r.map((x) => [x.bucket, x.amount, x.balanceAfter, x.source])).toEqual([
      ['topupCredits', -2, 0, 'draft_spent'],
      ['subscriptionCredits', -3, 7, 'draft_spent'],
    ]);
  });
});

// ── (4) rule 1: insufficient ────────────────────────────────────────────────────────────────────

describe('T-653 insufficient credits: what `available` reports', () => {
  it('flag off: topup 1 + sub 1 + earned 100, spend 200: available is 2 (earned excluded)', async () => {
    await seed({ topup: 1, sub: 1, earned: 100 });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 200 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.required).toBe(200);
    expect(err.available).toBe(2);
    expect(err.shortBy).toBe(198);
    expect(await raw()).toMatchObject({
      topupCredits: 1,
      earnedCredits: 100,
      subscriptionCredits: 1,
    });
    expect(await rowCount()).toBe(0);
  });

  it('flag off: a short balance is reported as insufficient before the earned refusal (topup 1, sub 1, earned 1, spend 5)', async () => {
    await seed({ topup: 1, sub: 1, earned: 1 });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 5 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.available).toBe(2);
  });

  it('flag on: same case, available is 102 (earned included)', async () => {
    setFlag(true);
    await seed({ topup: 1, sub: 1, earned: 100 });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 200 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.available).toBe(102);
    expect(err.shortBy).toBe(98);
    expect(await rowCount()).toBe(0);
  });
});

// ── (6) flag on: behaviour unchanged ────────────────────────────────────────────────────────────

describe("T-653 flag on (exactly 'true'): spendCredits behaves as before", () => {
  beforeEach(() => setFlag(true));

  it('spends topup -> earned -> sub in order, one negative row per bucket, correct balanceAfter', async () => {
    await seed({ topup: 2, earned: 3, sub: 10 });
    const res = await spendCredits({
      userId: USER_ID,
      amount: 7,
      templateId: 'nda',
      reference: 'r',
    });
    expect(res).toEqual({
      spent: [
        { bucket: 'topupCredits', amount: 2 },
        { bucket: 'earnedCredits', amount: 3 },
        { bucket: 'subscriptionCredits', amount: 2 },
      ],
      totalSpent: 7,
    });
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 0,
      subscriptionCredits: 8,
    });
    const r = await rows();
    expect(r.map((x) => [x.bucket, x.amount, x.balanceAfter, x.source])).toEqual([
      ['topupCredits', -2, 0, 'draft_spent'],
      ['earnedCredits', -3, 0, 'draft_spent'],
      ['subscriptionCredits', -2, 8, 'draft_spent'],
    ]);
    expect(r.every((x) => x.templateId === 'nda' && x.reference === 'r')).toBe(true);
  });

  it('topup 0, earned 5, sub 10, spend 3 debits earnedCredits', async () => {
    await seed({ earned: 5, sub: 10 });
    const res = await spendCredits({ userId: USER_ID, amount: 3 });
    expect(res).toEqual({ spent: [{ bucket: 'earnedCredits', amount: 3 }], totalSpent: 3 });
    expect(await raw()).toMatchObject({
      topupCredits: 0,
      earnedCredits: 2,
      subscriptionCredits: 10,
    });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bucket: 'earnedCredits', amount: -3, balanceAfter: 2 });
  });
});

// ── (7) the guarded debit and the undo ──────────────────────────────────────────────────────────

describe('T-653 guarded debit: a concurrent drain undoes this call and writes no ledger rows', () => {
  const realFindOneAndUpdate = User.findOneAndUpdate.bind(User) as unknown as (...a: unknown[]) => {
    lean: () => Promise<unknown>;
  };

  type Action = 'pass' | 'null' | Error;
  /** Intercepts only the debits (a negative $inc); the undo and the re-read pass through. */
  function spyDebits(handler: (index: number) => Promise<Action> | Action) {
    let index = 0;
    return jest.spyOn(User, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
      const update = args[1] as { $inc?: Record<string, number> } | undefined;
      const isDebit = Object.values(update?.$inc ?? {}).some((v) => v < 0);
      if (!isDebit) return realFindOneAndUpdate(...args);
      const i = index++;
      return {
        lean: async () => {
          const action = await handler(i);
          if (action === 'null') return null;
          if (action instanceof Error) throw action;
          return realFindOneAndUpdate(...args).lean();
        },
      };
    }) as never);
  }

  it('the real filter is guarded: each debit matches only a bucket that still holds the amount', async () => {
    setFlag(true);
    await seed({ topup: 2, earned: 3 });
    const spy = spyDebits(() => 'pass');
    await spendCredits({ userId: USER_ID, amount: 5 });
    const filters = spy.mock.calls.map((c) => c[0]);
    expect(filters).toEqual([
      { _id: OID, topupCredits: { $gte: 2 } },
      { _id: OID, earnedCredits: { $gte: 3 } },
    ]);
  });

  it('second bucket drained between the debits: first debit re-credited, Insufficient thrown, no rows', async () => {
    setFlag(true);
    await seed({ topup: 3, earned: 5 });
    spyDebits(async (i): Promise<Action> => {
      if (i === 1) await User.collection.updateOne({ _id: OID }, { $set: { earnedCredits: 0 } });
      return 'pass';
    });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 6 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.required).toBe(6);
    expect(err.available).toBe(3);
    // topup was debited by 3 and put back; earned is as the other spender left it; never negative
    expect(await raw()).toMatchObject({
      topupCredits: 3,
      earnedCredits: 0,
      subscriptionCredits: 0,
    });
    expect(await rowCount()).toBe(0);
  });

  it('flag off: `available` after a drain still excludes earnedCredits', async () => {
    await seed({ topup: 2, sub: 4 });
    spyDebits(async (i): Promise<Action> => {
      if (i === 1) {
        await User.collection.updateOne(
          { _id: OID },
          { $set: { subscriptionCredits: 0, earnedCredits: 40 } },
        );
      }
      return 'pass';
    });
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 6 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.available).toBe(2);
    expect(await raw()).toMatchObject({
      topupCredits: 2,
      earnedCredits: 40,
      subscriptionCredits: 0,
    });
    expect(await rowCount()).toBe(0);
  });

  it('a debit that matches nothing on the very first bucket: nothing to undo, nothing written', async () => {
    await seed({ topup: 5 });
    spyDebits(() => 'null');
    const err = await caught(spendCredits({ userId: USER_ID, amount: 2 }));
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(await raw()).toMatchObject({ topupCredits: 5 });
    expect(await rowCount()).toBe(0);
  });

  it('a real drain through the guard: the bucket never goes negative', async () => {
    setFlag(true);
    await seed({ topup: 1, earned: 5 });
    spyDebits(async (i): Promise<Action> => {
      if (i === 1) await User.collection.updateOne({ _id: OID }, { $set: { earnedCredits: 1 } });
      return 'pass';
    });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 4 }));
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    const u = await raw();
    expect(u.earnedCredits).toBe(1);
    expect(u.topupCredits).toBe(1);
  });

  it('a DB error on the second debit: first debit re-credited, the same error rethrown, no rows', async () => {
    setFlag(true);
    await seed({ topup: 3, earned: 5 });
    const boom = new Error('connection reset');
    spyDebits((i) => (i === 1 ? boom : 'pass'));
    const err = await caught(spendCredits({ userId: USER_ID, amount: 6 }));
    expect(err).toBe(boom);
    expect(await raw()).toMatchObject({
      topupCredits: 3,
      earnedCredits: 5,
      subscriptionCredits: 0,
    });
    expect(await rowCount()).toBe(0);
  });

  it('a failed undo logs only the error name: no ids, amounts or driver text', async () => {
    setFlag(true);
    await seed({ topup: 3, earned: 5 });
    spyDebits((i) => (i === 1 ? 'null' : 'pass'));
    const driverErr = Object.assign(
      new Error(`write failed for user ${USER_ID} amount 3 secret-text`),
      {
        name: 'MongoNetworkError',
      },
    );
    jest
      .spyOn(User, 'findByIdAndUpdate')
      .mockImplementation((() => Promise.reject(driverErr)) as never);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = await caught(spendCredits({ userId: USER_ID, amount: 6 }));
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(log).toHaveBeenCalledWith('[drafting] spendCredits undo failed:', 'MongoNetworkError');
    const printed = JSON.stringify(log.mock.calls);
    expect(printed).not.toContain(USER_ID);
    expect(printed).not.toContain('secret-text');
    expect(printed).not.toContain('amount 3');
    expect(await rowCount()).toBe(0);
  });

  it('a successful multi-bucket spend writes its rows only after all debits landed', async () => {
    setFlag(true);
    await seed({ topup: 2, earned: 3 });
    const seen: number[] = [];
    jest.spyOn(CreditLedger, 'create').mockImplementation((async (doc: unknown) => {
      seen.push((await raw()).earnedCredits);
      return doc;
    }) as never);
    await spendCredits({ userId: USER_ID, amount: 5 });
    // both create calls ran after the earned debit had already landed
    expect(seen).toEqual([0, 0]);
  });
});

// ── (8) argument checks and the original user-id behaviour ─────────────────────────────────────

describe('T-653 spendCredits argument checks', () => {
  it.each([0, -1, -0.5])(
    'amount %p throws InvalidCreditAmountError (T-667) before any read or write',
    async (amount) => {
      await seed({ topup: 5, earned: 5, sub: 5 });
      const find = jest.spyOn(User, 'findById');
      const foau = jest.spyOn(User, 'findOneAndUpdate');
      const err = await caught(spendCredits({ userId: USER_ID, amount }));
      expect(err).toBeInstanceOf(InvalidCreditAmountError);
      expect((err as InvalidCreditAmountError).code).toBe('invalid_credit_amount');
      expect((err as InvalidCreditAmountError).operation).toBe('spendCredits');
      expect(err).not.toBeInstanceOf(InsufficientCreditsError);
      expect(err).not.toBeInstanceOf(EarnedCreditsSpendDisabledError);
      expect((err as Error).message).toBe(`spendCredits: amount must be > 0 (got ${amount})`);
      expect(find).not.toHaveBeenCalled();
      expect(foau).not.toHaveBeenCalled();
      expect(await raw()).toMatchObject({
        topupCredits: 5,
        earnedCredits: 5,
        subscriptionCredits: 5,
      });
      expect(await rowCount()).toBe(0);
    },
  );

  it('the amount check comes first: it wins over the earned refusal', async () => {
    await seed({ earned: 5 });
    const err = await caught(spendCredits({ userId: USER_ID, amount: 0 }));
    expect(err).not.toBeInstanceOf(EarnedCreditsSpendDisabledError);
  });

  it('NaN is rejected by the amount check (T-667) with InvalidCreditAmountError, no read, no write', async () => {
    await seed({ topup: 5, earned: 5, sub: 5 });
    const find = jest.spyOn(User, 'findById');
    const foau = jest.spyOn(User, 'findOneAndUpdate');
    const err = await caught(spendCredits({ userId: USER_ID, amount: Number.NaN }));
    expect(err).toBeInstanceOf(InvalidCreditAmountError);
    expect((err as InvalidCreditAmountError).code).toBe('invalid_credit_amount');
    expect((err as InvalidCreditAmountError).operation).toBe('spendCredits');
    expect((err as Error).message).toBe('spendCredits: amount must be a finite number');
    expect(find).not.toHaveBeenCalled();
    expect(foau).not.toHaveBeenCalled();
    expect(await raw()).toMatchObject({
      topupCredits: 5,
      earnedCredits: 5,
      subscriptionCredits: 5,
    });
    expect(await rowCount()).toBe(0);
  });

  it.each([false, true])(
    'malformed userId (flag %p): Insufficient with available 0, as before',
    async (on) => {
      setFlag(on);
      const err = (await caught(
        spendCredits({ userId: 'not-an-id', amount: 3 }),
      )) as InsufficientCreditsError;
      expect(err).toBeInstanceOf(InsufficientCreditsError);
      expect(err.available).toBe(0);
    },
  );

  it('a well-formed userId with no user: Insufficient with available 0', async () => {
    const err = (await caught(
      spendCredits({ userId: USER_ID, amount: 3 }),
    )) as InsufficientCreditsError;
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.available).toBe(0);
    expect(await rowCount()).toBe(0);
  });
});

// ── (9) grantCredits ────────────────────────────────────────────────────────────────────────────

describe('T-653 grantCredits', () => {
  it("flag off: grant to 'earnedCredits' is refused with the typed error, no write, no row", async () => {
    await seed({ earned: 5 });
    const err = await caught(
      grantCredits({ userId: USER_ID, bucket: 'earnedCredits', amount: 2, source: 'admin_grant' }),
    );
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
    expect((err as Error).message).toBe(FIXED_MESSAGE);
    expect(await raw()).toMatchObject({ earnedCredits: 5 });
    expect(await rowCount()).toBe(0);
  });

  it('flag off: the refusal comes before the userId check', async () => {
    const err = await caught(
      grantCredits({
        userId: 'not-an-id',
        bucket: 'earnedCredits',
        amount: 2,
        source: 'admin_grant',
      }),
    );
    expect(err).toBeInstanceOf(EarnedCreditsSpendDisabledError);
  });

  it('flag on: grant to earnedCredits works, with a ledger row', async () => {
    setFlag(true);
    await seed({ earned: 5 });
    const after = await grantCredits({
      userId: USER_ID,
      bucket: 'earnedCredits',
      amount: 2,
      source: 'admin_grant',
    });
    expect(after).toBe(7);
    expect(await raw()).toMatchObject({ earnedCredits: 7 });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bucket: 'earnedCredits', amount: 2, balanceAfter: 7 });
  });

  it.each([false, true])(
    'flag %p: topupCredits and subscriptionCredits grants are unaffected',
    async (on) => {
      setFlag(on);
      await seed({ topup: 1, sub: 2, earned: 9 });
      expect(
        await grantCredits({
          userId: USER_ID,
          bucket: 'topupCredits',
          amount: 4,
          source: 'topup_purchase',
        }),
      ).toBe(5);
      expect(
        await grantCredits({
          userId: USER_ID,
          bucket: 'subscriptionCredits',
          amount: 30,
          source: 'plan_renewal',
        }),
      ).toBe(30);
      expect(await raw()).toMatchObject({
        topupCredits: 5,
        subscriptionCredits: 30,
        earnedCredits: 9,
      });
      expect((await rows()).map((x) => [x.bucket, x.amount])).toEqual([
        ['topupCredits', 4],
        ['subscriptionCredits', 30],
      ]);
    },
  );

  it.each([false, true])(
    'flag %p: amount <= 0 is rejected first, with InvalidCreditAmountError (T-667)',
    async (on) => {
      setFlag(on);
      await seed({ earned: 5 });
      const foau = jest.spyOn(User, 'findByIdAndUpdate');
      const err = await caught(
        grantCredits({
          userId: USER_ID,
          bucket: 'earnedCredits',
          amount: 0,
          source: 'admin_grant',
        }),
      );
      expect(err).toBeInstanceOf(InvalidCreditAmountError);
      expect(err).not.toBeInstanceOf(EarnedCreditsSpendDisabledError);
      expect((err as InvalidCreditAmountError).code).toBe('invalid_credit_amount');
      expect((err as InvalidCreditAmountError).operation).toBe('grantCredits');
      expect((err as Error).message).toBe('grantCredits: amount must be > 0 (got 0)');
      expect(foau).not.toHaveBeenCalled();
      expect(await raw()).toMatchObject({ earnedCredits: 5 });
      expect(await rowCount()).toBe(0);
    },
  );

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ["'5'", '5' as unknown as number],
    ['undefined', undefined as unknown as number],
    ['null', null as unknown as number],
  ])(
    'amount %s: InvalidCreditAmountError (finite-number message), no read, no write, no row',
    async (_label, amount) => {
      setFlag(true);
      await seed({ topup: 1, earned: 5 });
      const foau = jest.spyOn(User, 'findByIdAndUpdate');
      const find = jest.spyOn(User, 'findById');
      const create = jest.spyOn(CreditLedger, 'create');
      const err = await caught(
        grantCredits({ userId: USER_ID, bucket: 'topupCredits', amount, source: 'admin_grant' }),
      );
      expect(err).toBeInstanceOf(InvalidCreditAmountError);
      expect((err as InvalidCreditAmountError).operation).toBe('grantCredits');
      expect((err as Error).message).toBe('grantCredits: amount must be a finite number');
      expect(foau).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(await raw()).toMatchObject({ topupCredits: 1, earnedCredits: 5 });
      expect(await rowCount()).toBe(0);
    },
  );
});

// ── (11) the live gate ignores earnedCredits ────────────────────────────────────────────────────

describe('T-653 enforceCredits (the live Ink gate) ignores earnedCredits', () => {
  it.each([false, true])(
    'earnedCredits 50 and zero Ink (flag %p): 402 insufficient Ink, totalInk 0',
    async (on) => {
      setFlag(on);
      await seed({ earned: 50 }, { inkSub: 0, inkAnnualCarry: 0, inkTopup: 0, planTier: 'free' });
      const req = { jwtPayload: { sub: USER_ID }, body: { template_id: 'nda' } } as never;
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const next = jest.fn();
      await enforceCredits(req, { status, json } as never, next);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(402);
      const body = json.mock.calls[0][0] as { error: string; balance: { totalInk: number } };
      expect(body.error).toBe('Insufficient Ink');
      expect(body.balance.totalInk).toBe(0);
      expect(await raw()).toMatchObject({ earnedCredits: 50 });
      expect(await rowCount()).toBe(0);
    },
  );
});

// ── (10) source scan ────────────────────────────────────────────────────────────────────────────

describe('T-653 source scan: only credits.service writes earnedCredits', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const SERVICE = 'apps/drafting/src/services/credits.service.ts';

  function stripComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .split('\n')
      .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
      .join('\n');
  }

  function walk(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.next', '__tests__', 'coverage'].includes(entry.name))
          continue;
        walk(path.join(dir, entry.name), out);
      } else if (
        /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
        !/\.(test|spec|d)\.(ts|tsx|js)$/.test(entry.name)
      ) {
        out.push(path.join(dir, entry.name));
      }
    }
  }

  function sourceFiles(): string[] {
    const files: string[] = [];
    for (const group of ['apps', 'packages']) {
      const base = path.join(repoRoot, group);
      for (const pkg of fs.readdirSync(base, { withFileTypes: true })) {
        // T-667: also walk <pkg>/scripts (backfills and seeds can write balances too).
        for (const sub of ['src', 'scripts']) {
          const dir = path.join(base, pkg.name, sub);
          if (pkg.isDirectory() && fs.existsSync(dir)) walk(dir, files);
        }
      }
    }
    return files.map((f) => path.relative(repoRoot, f));
  }

  /**
   * Every non-comment line outside credits.service that mentions earnedCredits must be one of these:
   * schema or type declarations, the enum, the admin KPI read, and the read-only UI.
   */
  const ALLOWED_LINES: Record<string, RegExp[]> = {
    'apps/auth/src/models/User.model.ts': [
      /^earnedCredits: number;/,
      /^earnedCredits: \{ type: Number, default: 0, min: 0 \},$/,
    ],
    'apps/billing/src/models/User.model.ts': [
      /^earnedCredits\?: number;$/,
      /^earnedCredits: \{ type: Number, default: 0 \},$/,
    ],
    'apps/drafting/src/models/User.model.ts': [
      /^earnedCredits\?: number;$/,
      /^earnedCredits: \{ type: Number, default: 0 \},$/,
    ],
    'apps/drafting/src/models/CreditLedger.model.ts': [
      /^export type CreditBucket = 'subscriptionCredits' \| 'earnedCredits' \| 'topupCredits';$/,
      /^enum: \['subscriptionCredits', 'earnedCredits', 'topupCredits'\],$/,
    ],
    'apps/drafting/src/routes/credits.routes.ts': [
      /^earned: \{ \$sum: '\$earnedCredits' \},$/,
      /^earnedCredits: circulatingAgg\[0\]\?\.earned \?\? 0,$/,
    ],
    'apps/web/src/hooks/useCredits.ts': [/^earnedCredits: number;$/, /^earnedCredits: 0,$/],
    'apps/web/src/app/admin/credit-ledger/page.tsx': [
      /^earnedCredits: number;$/,
      /^bucket: 'subscriptionCredits' \| 'earnedCredits' \| 'topupCredits';$/,
      /^earnedCredits: 'bg-green-100 text-green-700',$/,
      /kpis\.bucketSums\.earnedCredits/,
      /^label="earnedCredits"$/,
      /^title="earnedCredits"$/,
    ],
  };

  const WRITE_NEAR_EARNED =
    /\$(?:inc|set|unset|min|max|mul|rename|push|pull|addToSet|setOnInsert|currentDate|bit)\b[\s\S]{0,300}?earnedCredits|earnedCredits[\s\S]{0,120}?\$(?:inc|set|unset|min|max|mul|rename|push|pull|addToSet|setOnInsert)\b/;

  it('walks a plausible set of files (the scan is not vacuous)', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(SERVICE);
    expect(files).toContain('apps/auth/src/models/User.model.ts');
    expect(files.some((f) => f.includes('__tests__'))).toBe(false);
  });

  it('T-667: the scan also walks apps/*/scripts (real script files are in the list)', () => {
    const files = sourceFiles();
    expect(files).toContain('apps/billing/scripts/backfill-invoices.ts');
    expect(files).toContain('apps/auth/scripts/backfill-free-seed.ts');
    expect(files).toContain('apps/drafting/scripts/seed-app-setting.ts');
    expect(files.filter((f) => /^apps\/[^/]+\/scripts\//.test(f)).length).toBeGreaterThanOrEqual(
      10,
    );
  });

  it('no other file contains an earnedCredits write', () => {
    const offenders = sourceFiles()
      .filter((f) => f !== SERVICE)
      .filter((f) =>
        WRITE_NEAR_EARNED.test(stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8'))),
      );
    expect(offenders).toEqual([]);
  });

  it('every code mention outside credits.service is on the allow-list (declarations and reads)', () => {
    const unexpected: string[] = [];
    for (const f of sourceFiles()) {
      if (f === SERVICE) continue;
      const lines = stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('earnedCredits')) return;
        const trimmed = line.trim();
        const ok = (ALLOWED_LINES[f] ?? []).some((re) => re.test(trimmed));
        if (!ok) unexpected.push(`${f}:${i + 1}: ${trimmed}`);
      });
    }
    expect(unexpected).toEqual([]);
  });

  it('nothing calls spendCredits or grantCredits outside credits.service', () => {
    const callers = sourceFiles()
      .filter((f) => f !== SERVICE)
      .filter((f) =>
        /\b(?:spendCredits|grantCredits)\b/.test(
          stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8')),
        ),
      );
    expect(callers).toEqual([]);
  });

  it('the scan catches a write (self-check of the patterns)', () => {
    expect(WRITE_NEAR_EARNED.test('User.updateOne({ _id }, { $inc: { earnedCredits: 2 } })')).toBe(
      true,
    );
    expect(
      WRITE_NEAR_EARNED.test('User.updateOne({ _id }, { $set: { a: 1, earnedCredits: 0 } })'),
    ).toBe(true);
    expect(WRITE_NEAR_EARNED.test('{ earnedCredits: 1 }, { $inc: { x: 1 } }')).toBe(true);
    expect(WRITE_NEAR_EARNED.test("earned: { $sum: '$earnedCredits' }")).toBe(false);
  });

  it('enforceCredits.ts never references earnedCredits (code, not comments)', () => {
    const text = fs.readFileSync(
      path.join(repoRoot, 'apps/drafting/src/middleware/enforceCredits.ts'),
      'utf8',
    );
    expect(stripComments(text)).not.toMatch(/earned/i);
  });

  it('the Ink code in credits.service (spendInk, holdInk, settleInk, releaseInk, ...) never references earnedCredits', () => {
    const text = fs.readFileSync(path.join(repoRoot, SERVICE), 'utf8');
    const marker = '// ── Ink spend (new ink system';
    const start = text.indexOf(marker);
    expect(start).toBeGreaterThan(0);
    const inkCode = stripComments(text.slice(start));
    expect(inkCode).toContain('export async function spendInk');
    expect(inkCode).toContain('export async function holdInk');
    expect(inkCode).toContain('export async function settleInk');
    expect(inkCode).not.toMatch(/earned/i);
    // and the price/quote half above spendCredits
    const priceCode = stripComments(text.slice(0, text.indexOf('// ── Reads')));
    expect(priceCode).not.toMatch(/earnedCredits/);
  });
});

// ── (12) .env.example ───────────────────────────────────────────────────────────────────────────

describe('T-653 .env.example', () => {
  it('has EARNED_CREDITS_SPEND_ENABLED exactly once, with the value false', () => {
    const text = fs.readFileSync(path.resolve(__dirname, '../../../../.env.example'), 'utf8');
    const lines = text
      .split('\n')
      .filter((l) => /^\s*#?\s*EARNED_CREDITS_SPEND_ENABLED\s*=/.test(l));
    expect(lines).toEqual(['EARNED_CREDITS_SPEND_ENABLED=false']);
  });
});
