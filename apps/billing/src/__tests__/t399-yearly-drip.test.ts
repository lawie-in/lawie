/**
 * T-399: yearly plans grant Ink every month (lazy drip), cancel at cycle end,
 * double grant on the first payment, ledger error logging.
 *
 * Time is injected: settleYearlyDrip takes `now`, and the webhook payloads carry
 * current_start / current_end, so no test depends on the wall clock except the
 * two getInkBalance tests, which build dates relative to Date.now().
 *
 * packages/shared has no test runner ("No tests for shared package"), so the
 * addOneMonth unit tests live here too.
 */
import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

import {
  addMonths,
  addOneMonth,
  nextDripAt,
  settleYearlyDrip,
  YEARLY_DRIP_MAX,
} from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import { getInkBalance, grantSubscriptionInk } from '../services/ink-ledger.service';
import * as inkLedger from '../services/ink-ledger.service';
import { handleWebhookEvent } from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

const SUB_ID = 'sub_t399';
const START = new Date('2026-01-15T10:00:00.000Z');
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const months = (from: Date, n: number) => {
  let d = from;
  for (let i = 0; i < n; i += 1) d = addOneMonth(d);
  return d;
};
const db = () => mongoose.connection.db!;
const ledger = (userId: mongoose.Types.ObjectId) =>
  db().collection('inkledger').find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray();
const dripRows = async (userId: mongoose.Types.ObjectId) =>
  (await ledger(userId)).filter((r) => r.reason === 'sub_drip');

async function seedUser(extra: Record<string, unknown> = {}) {
  const u = await User.create({ email: 't399@example.com', plan: 'free', ...extra });
  return u._id as mongoose.Types.ObjectId;
}

function payload(opts: {
  subId?: string;
  planId?: string;
  start?: Date;
  end?: Date;
  paidCount?: number;
  paymentId?: string;
}) {
  const entity: Record<string, unknown> = { id: opts.subId ?? SUB_ID };
  if (opts.planId) entity.notes = { planId: opts.planId };
  if (opts.start) entity.current_start = secs(opts.start);
  if (opts.end) entity.current_end = secs(opts.end);
  if (opts.paidCount !== undefined) entity.paid_count = opts.paidCount;
  const p: Record<string, unknown> = { subscription: { entity } };
  if (opts.paymentId) p.payment = { entity: { id: opts.paymentId } };
  return p;
}

async function buyYearly(userId: mongoose.Types.ObjectId, paidCount = 1, planId = 'solo_yearly') {
  await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
  await handleWebhookEvent(
    'subscription.charged',
    payload({ planId, start: START, end: months(START, 12), paidCount, paymentId: 'pay_1' }),
  );
}

async function inkOf(userId: mongoose.Types.ObjectId) {
  return (await User.findById(userId).lean())!;
}

describe('addOneMonth', () => {
  it('clamps Jan 31 to Feb 28 in a common year', () => {
    expect(addOneMonth(new Date('2026-01-31T09:30:00Z')).toISOString()).toBe(
      '2026-02-28T09:30:00.000Z',
    );
  });
  it('clamps Jan 31 to Feb 29 in a leap year, and Jan 30 / 29 likewise', () => {
    expect(addOneMonth(new Date('2028-01-31T00:00:00Z')).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(addOneMonth(new Date('2028-01-30T00:00:00Z')).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(addOneMonth(new Date('2026-01-29T00:00:00Z')).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
  it('Feb 29 (leap) goes to Mar 29; century non-leap 2100 clamps to Feb 28', () => {
    expect(addOneMonth(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe(
      '2028-03-29T00:00:00.000Z',
    );
    expect(addOneMonth(new Date('2100-01-31T00:00:00Z')).toISOString()).toBe(
      '2100-02-28T00:00:00.000Z',
    );
  });
  it('rolls the year in December and clamps 31 to a 30-day month', () => {
    expect(addOneMonth(new Date('2026-12-31T00:00:00Z')).toISOString()).toBe(
      '2027-01-31T00:00:00.000Z',
    );
    expect(addOneMonth(new Date('2026-03-31T00:00:00Z')).toISOString()).toBe(
      '2026-04-30T00:00:00.000Z',
    );
  });
  it('does not mutate its input', () => {
    const d = new Date('2026-01-31T00:00:00Z');
    addOneMonth(d);
    expect(d.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});

describe('T-399 AC1: behaviour before the fix', () => {
  // Honest scope: this does NOT run the old code (no stash, no checkout). The old
  // code's only grant path was the charge webhook. So: one yearly charge, then
  // reads over a year that do NOT call settleYearlyDrip (what the old reads did)
  // add no Ink. The test pins that the webhook alone grants once a year, which
  // is why the drip is needed.
  it('a yearly charge grants once; reads that do not settle never grant again', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    for (let m = 1; m <= 12; m += 1) {
      const u = await inkOf(userId); // month m, a plain read, as before the fix
      expect(u.inkSub).toBe(100);
    }
    const rows = await ledger(userId);
    expect(rows.map((r) => r.reason)).toEqual(['sub_renewal']);
  });
});

describe('T-399 AC2/AC3: yearly purchase across 12 months', () => {
  it('stores paidThrough from current_end, planId, billingCycle and the drip schedule', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.paidThrough).toEqual(months(START, 12));
    expect(sub.planId).toBe('solo_yearly');
    expect(sub.billingCycle).toBe('yearly');
    expect(sub.inkDripCount).toBe(0);
    expect(sub.inkDripNextAt).toEqual(addOneMonth(START));
  });

  it('12 monthly grants in total (charge + 11 drips), the 13th read grants nothing, no rollover', async () => {
    const userId = await seedUser({ inkAnnualCarry: 7 });
    await buyYearly(userId);
    let drips = 0;
    for (let m = 1; m <= 12; m += 1) {
      await User.updateOne({ _id: userId }, { $set: { inkSub: 10 } }); // spend most of it
      const r = await settleYearlyDrip({ db: db(), userId, now: months(START, m) });
      drips += r.granted;
      const u = await inkOf(userId);
      if (m <= YEARLY_DRIP_MAX) {
        expect(r.granted).toBe(1);
        expect(u.inkSub).toBe(100); // reset to the allotment, not 110
      } else {
        expect(r.granted).toBe(0); // month 12: cap of 11 drips
        expect(u.inkSub).toBe(10);
      }
      expect(u.inkAnnualCarry).toBe(7); // drips leave the carry alone
    }
    expect(drips).toBe(11);
    const rows = await ledger(userId);
    expect(rows.filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    expect(rows.filter((r) => r.reason === 'sub_drip')).toHaveLength(11);
    // 13th read, after the paid year: no grant (and the plan is wound up).
    const r13 = await settleYearlyDrip({ db: db(), userId, now: months(START, 13) });
    expect(r13.granted).toBe(0);
    expect((await dripRows(userId)).length).toBe(11);
  });

  it('ledger rows carry reference sub_drip:<id>:<cycle>:<n>, delta and balanceAfter', async () => {
    const userId = await seedUser({ inkTopup: 4 });
    await buyYearly(userId);
    await settleYearlyDrip({ db: db(), userId, now: months(START, 2) });
    const rows = await dripRows(userId);
    expect(rows.map((r) => r.reference)).toEqual([
      `sub_drip:${SUB_ID}:1:1`,
      `sub_drip:${SUB_ID}:1:2`,
    ]);
    expect(rows[0].delta).toBe(100);
    expect(rows[1].balanceAfter).toBe(100 + 4);
  });

  it('a read 3 months late grants 3 drips; the final inkSub is one allotment; a repeat grants nothing', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    const now = new Date(months(START, 3).getTime() + 3 * 86_400_000);
    const first = await settleYearlyDrip({ db: db(), userId, now });
    expect(first.granted).toBe(3);
    expect((await dripRows(userId)).map((r) => r.reference)).toEqual([
      `sub_drip:${SUB_ID}:1:1`,
      `sub_drip:${SUB_ID}:1:2`,
      `sub_drip:${SUB_ID}:1:3`,
    ]);
    expect((await inkOf(userId)).inkSub).toBe(100);
    const again = await settleYearlyDrip({ db: db(), userId, now });
    expect(again.granted).toBe(0);
    expect(await dripRows(userId)).toHaveLength(3);
  });

  it('5 concurrent settles produce exactly one grant per n', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    const now = months(START, 3);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => settleYearlyDrip({ db: db(), userId, now })),
    );
    expect(results.reduce((s, r) => s + r.granted, 0)).toBe(3);
    const refs = (await dripRows(userId)).map((r) => r.reference).sort();
    expect(refs).toEqual([
      `sub_drip:${SUB_ID}:1:1`,
      `sub_drip:${SUB_ID}:1:2`,
      `sub_drip:${SUB_ID}:1:3`,
    ]);
    const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.inkDripCount).toBe(3);
  });

  it('5 concurrent settles for a single due month grant once', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    const now = months(START, 1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => settleYearlyDrip({ db: db(), userId, now })),
    );
    expect(results.reduce((s, r) => s + r.granted, 0)).toBe(1);
    expect(await dripRows(userId)).toHaveLength(1);
  });
});

describe('T-399: cancel at cycle end (Ajay, Arjun)', () => {
  it('yearly cancel in month 4: plan and drips continue to paidThrough, then zero + free once', async () => {
    const userId = await seedUser({ inkTopup: 20 });
    await buyYearly(userId);
    for (let m = 1; m <= 3; m += 1) {
      await settleYearlyDrip({ db: db(), userId, now: months(START, m) });
    }
    await handleWebhookEvent('subscription.cancelled', payload({}));
    const cancelled = await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean();
    expect(cancelled!.status).toBe('cancelled');
    let u = await inkOf(userId);
    expect(u.plan).toBe('pro'); // not downgraded on cancel
    expect(u.inkSub).toBe(100);

    let granted = 0;
    for (let m = 4; m <= 12; m += 1) {
      await User.updateOne({ _id: userId }, { $set: { inkSub: 10 } });
      const r = await settleYearlyDrip({ db: db(), userId, now: months(START, m) });
      granted += r.granted;
      expect(r.expired).toBe(false);
    }
    expect(granted).toBe(8); // drips 4..11
    expect(await dripRows(userId)).toHaveLength(11);

    // The first read after paidThrough zeroes and downgrades; the topup survives.
    const after = new Date(months(START, 12).getTime() + 86_400_000);
    const r1 = await settleYearlyDrip({ db: db(), userId, now: after });
    expect(r1).toEqual({ granted: 0, expired: true });
    u = await inkOf(userId);
    expect(u.plan).toBe('free');
    expect(u.planTier).toBe('free');
    expect(u.inkSub).toBe(0);
    expect(u.inkAnnualCarry).toBe(0);
    expect(u.inkTopup).toBe(20);
    const rowsAfterFirst = (await ledger(userId)).length;

    // A second read does nothing.
    const r2 = await settleYearlyDrip({ db: db(), userId, now: after });
    expect(r2).toEqual({ granted: 0, expired: false });
    expect((await ledger(userId)).length).toBe(rowsAfterFirst);
    expect(await dripRows(userId)).toHaveLength(11);
  });

  it('monthly cancel mid-period keeps the balance and plan until paidThrough, then zeroes', async () => {
    const userId = await seedUser({ inkTopup: 6 });
    const end = months(START, 1);
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent(
      'subscription.charged',
      payload({ planId: 'solo_monthly', start: START, end, paidCount: 1 }),
    );
    await handleWebhookEvent('subscription.cancelled', payload({}));

    const mid = new Date(START.getTime() + 2 * 86_400_000);
    expect(await settleYearlyDrip({ db: db(), userId, now: mid })).toEqual({
      granted: 0,
      expired: false,
    });
    let u = await inkOf(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(100);

    const after = new Date(end.getTime() + 86_400_000);
    expect(await settleYearlyDrip({ db: db(), userId, now: after })).toEqual({
      granted: 0,
      expired: true,
    });
    u = await inkOf(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
    expect(u.inkTopup).toBe(6);
  });

  it('getInkBalance (real clock) keeps a cancelled plan inside paidThrough and zeroes it after', async () => {
    const keep = await seedUser({
      email: 'keep@example.com',
      plan: 'pro',
      planTier: 'solo',
      inkSub: 100,
    });
    await Subscription.create({
      userId: keep,
      razorpaySubscriptionId: 'sub_keep',
      status: 'cancelled',
      billingCycle: 'monthly',
      planId: 'solo_monthly',
      paidThrough: new Date(Date.now() + 5 * 86_400_000),
    });
    const gone = await seedUser({
      email: 'gone@example.com',
      plan: 'pro',
      planTier: 'solo',
      inkSub: 100,
    });
    await Subscription.create({
      userId: gone,
      razorpaySubscriptionId: 'sub_gone',
      status: 'cancelled',
      billingCycle: 'monthly',
      planId: 'solo_monthly',
      paidThrough: new Date(Date.now() - 86_400_000),
    });
    expect((await getInkBalance(keep.toString()))!.totalSpendable).toBe(100);
    expect((await getInkBalance(gone.toString()))!.totalSpendable).toBe(0);
    expect((await inkOf(gone)).plan).toBe('free');
  });

  it('getInkBalance settles a late yearly user (real clock)', async () => {
    const userId = await seedUser();
    const start = new Date(Date.now() - 75 * 86_400_000); // 2 drips due
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent(
      'subscription.charged',
      payload({
        planId: 'pro_yearly',
        start,
        end: months(start, 12),
        paidCount: 1,
      }),
    );
    await User.updateOne({ _id: userId }, { $set: { inkSub: 20 } });
    const bal = await getInkBalance(userId.toString());
    expect(bal!.totalSpendable).toBe(300);
    expect(await dripRows(userId)).toHaveLength(2);
  });

  it('subscription.expired webhook zeroes and downgrades, keeping the topup', async () => {
    const userId = await seedUser({
      plan: 'pro',
      planTier: 'solo',
      billingCycle: 'yearly',
      inkSub: 80,
      inkAnnualCarry: 30,
      inkTopup: 9,
    });
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    await handleWebhookEvent('subscription.expired', payload({}));
    const u = await inkOf(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
    expect(u.inkAnnualCarry).toBe(0);
    expect(u.inkTopup).toBe(9);
    expect((await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!.status).toBe(
      'expired',
    );
  });
});

describe('T-399: yearly renewal', () => {
  it('a renewal resets the counters, applies the annual carry once, and a redelivery grants nothing', async () => {
    const userId = await seedUser();
    await buyYearly(userId, 1);
    await settleYearlyDrip({ db: db(), userId, now: months(START, 5) }); // 5 drips
    await User.updateOne({ _id: userId }, { $set: { inkSub: 60 } }); // 60 left unspent

    const start2 = months(START, 12);
    const renewal = payload({
      planId: 'solo_yearly',
      start: start2,
      end: months(start2, 12),
      paidCount: 2,
      paymentId: 'pay_2',
    });
    await handleWebhookEvent('subscription.charged', renewal);
    await handleWebhookEvent('subscription.charged', renewal); // redelivery

    const u = await inkOf(userId);
    expect(u.inkSub).toBe(100);
    expect(u.inkAnnualCarry).toBe(30); // floor(60 * 0.5), once
    const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.inkDripCount).toBe(0);
    expect(sub.inkDripNextAt).toEqual(addOneMonth(start2));
    expect(sub.paidThrough).toEqual(months(start2, 12));
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(2);

    // The new year drips again.
    const r = await settleYearlyDrip({ db: db(), userId, now: addOneMonth(start2) });
    expect(r.granted).toBe(1);
    expect((await inkOf(userId)).inkAnnualCarry).toBe(30);
  });
});

describe('T-399: double grant on the first payment (paid_count)', () => {
  // NOTE: Arjun changed the key from lastPaymentId to the subscription entity's
  // paid_count (stored as lastGrantedPaidCount).
  async function setup() {
    const userId = await seedUser({ inkSub: 40 }); // yearly carry would be 20 on a first grant
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    return userId;
  }
  const evt = (paidCount?: number, withPayment = true) =>
    payload({
      planId: 'solo_yearly',
      start: START,
      end: months(START, 12),
      paidCount,
      paymentId: withPayment ? 'pay_x' : undefined,
    });

  it('activated (no payment entity, paid_count 1) then charged (paid_count 1) gives one grant', async () => {
    const userId = await setup();
    await handleWebhookEvent('subscription.activated', evt(1, false));
    await handleWebhookEvent('subscription.charged', evt(1, true));
    const rows = (await ledger(userId)).filter((r) => r.reason === 'sub_renewal');
    expect(rows).toHaveLength(1);
    const u = await inkOf(userId);
    expect(u.inkSub).toBe(100);
    expect(u.inkAnnualCarry).toBe(20); // carried once, not 20 + 50
  });

  it('charged with paid_count 2 gives a second grant', async () => {
    const userId = await setup();
    await handleWebhookEvent('subscription.charged', evt(1));
    await handleWebhookEvent('subscription.charged', evt(2));
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(2);
  });

  it('without paid_count it falls back to current_start: same start one grant, a later start a second', async () => {
    const userId = await setup();
    await handleWebhookEvent('subscription.activated', evt(undefined, false));
    await handleWebhookEvent('subscription.charged', evt(undefined, true));
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    const start2 = months(START, 12);
    await handleWebhookEvent(
      'subscription.charged',
      payload({ planId: 'solo_yearly', start: start2, end: months(start2, 12) }),
    );
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(2);
  });

  it('concurrent charged events with the same paid_count give one grant', async () => {
    const userId = await setup();
    await Promise.all(
      Array.from({ length: 4 }, () => handleWebhookEvent('subscription.charged', evt(1))),
    );
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    expect((await inkOf(userId)).inkAnnualCarry).toBe(20);
  });
});

describe('T-399: ledger insert errors are logged at error level, no PII', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a failing inkledger insert logs at error with reason and reference, not the driver message', async () => {
    const userId = await seedUser({ email: 'pii-person@example.com' });
    const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const real = db().collection.bind(db());
    jest.spyOn(db(), 'collection').mockImplementation(((name: string, ...rest: unknown[]) =>
      name === 'inkledger'
        ? {
            insertOne: () => Promise.reject(new Error('dup key pii-person@example.com Test Name')),
          }
        : (real as (...a: unknown[]) => unknown)(name, ...rest)) as never);

    await grantSubscriptionInk({
      userId: userId.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'monthly',
    });

    const failureCall = errSpy.mock.calls.find((c) =>
      String(c[1]).includes('ledger insert failed'),
    );
    expect(failureCall).toBeDefined();
    expect(failureCall![0]).toEqual(
      expect.objectContaining({ reason: 'sub_renewal', reference: 'solo monthly renewal' }),
    );
    const everything = JSON.stringify([errSpy.mock.calls, warnSpy.mock.calls]);
    expect(everything).not.toContain('pii-person');
    expect(everything).not.toContain('Test Name');
    expect(warnSpy.mock.calls.some((c) => String(c[1]).includes('ledger insert failed'))).toBe(
      false,
    );
    expect((await inkOf(userId)).inkSub).toBe(100); // the grant itself is not undone
  });

  it('a throwing settle in getInkBalance is logged (class only) and the read still returns', async () => {
    const userId = await seedUser({ inkSub: 12 });
    const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const real = db().collection.bind(db());
    jest.spyOn(db(), 'collection').mockImplementation(((name: string, ...rest: unknown[]) => {
      if (name === 'subscriptions') throw new Error('boom pii-person@example.com');
      return (real as (...a: unknown[]) => unknown)(name, ...rest);
    }) as never);
    const bal = await getInkBalance(userId.toString());
    expect(bal!.totalSpendable).toBe(12);
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('pii-person');
  });
});

describe('T-399: grant rollback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a grant that throws restores the claim, the webhook rejects, and the redelivery grants once', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    const evt = payload({
      planId: 'solo_yearly',
      start: START,
      end: months(START, 12),
      paidCount: 1,
    });
    jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));

    await expect(handleWebhookEvent('subscription.charged', evt)).rejects.toThrow('db down');
    let sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.lastGrantedPaidCount).toBeUndefined();
    expect(sub.lastGrantedPeriodStart).toBeUndefined();
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(0);

    await handleWebhookEvent('subscription.charged', evt); // Razorpay's retry
    await handleWebhookEvent('subscription.charged', evt); // and a duplicate
    sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.lastGrantedPaidCount).toBe(1);
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    expect(sub.inkDripCount).toBe(0);
  });

  it('a rollback restores the PREVIOUS paid_count of a renewal, not nothing', async () => {
    const userId = await seedUser();
    await buyYearly(userId, 1);
    const start2 = months(START, 12);
    const renewal = payload({
      planId: 'solo_yearly',
      start: start2,
      end: months(start2, 12),
      paidCount: 2,
    });
    jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
    await expect(handleWebhookEvent('subscription.charged', renewal)).rejects.toThrow();
    const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub.lastGrantedPaidCount).toBe(1);
    expect(sub.lastGrantedPeriodStart).toEqual(START);
    await handleWebhookEvent('subscription.charged', renewal);
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(2);
  });

  it('with neither paid_count nor current_start: one grant and one warn log', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await handleWebhookEvent('subscription.charged', payload({ planId: 'solo_monthly' }));
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    const dedupeWarns = warn.mock.calls.filter((c) => String(c[1]).includes('not deduplicated'));
    expect(dedupeWarns).toHaveLength(1);
  });
});

describe('T-399: expired webhook with a second, cancelled-but-paid subscription', () => {
  async function twoSubs(secondPaidThrough: Date) {
    const userId = await seedUser({
      plan: 'pro',
      planTier: 'solo',
      billingCycle: 'monthly',
      inkSub: 80,
      inkAnnualCarry: 10,
    });
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_second',
      status: 'cancelled',
      paidThrough: secondPaidThrough,
    });
    return userId;
  }

  it('does not downgrade or zero while the other sub is inside its paid period', async () => {
    const userId = await twoSubs(new Date(Date.now() + 10 * 86_400_000));
    await handleWebhookEvent('subscription.expired', payload({}));
    const u = await inkOf(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(80);
    expect(u.inkAnnualCarry).toBe(10);
  });

  it('downgrades and zeroes once the other cancelled sub is past its paid period', async () => {
    const userId = await twoSubs(new Date(Date.now() - 86_400_000));
    await handleWebhookEvent('subscription.expired', payload({}));
    const u = await inkOf(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
  });
});

describe('T-399: anchor-based drip dates (no drift)', () => {
  const iso = (d: Date | undefined) => d?.toISOString();

  it('addMonths / nextDripAt: anchor + n months, clamped each time; chaining without anchor', () => {
    const anchor = new Date('2026-01-31T10:00:00Z');
    expect(iso(addMonths(anchor, 1))).toBe('2026-02-28T10:00:00.000Z');
    expect(iso(addMonths(anchor, 2))).toBe('2026-03-31T10:00:00.000Z');
    expect(iso(addMonths(anchor, 3))).toBe('2026-04-30T10:00:00.000Z');
    expect(iso(addMonths(anchor, 12))).toBe('2027-01-31T10:00:00.000Z');
    expect(iso(nextDripAt(anchor, 1, new Date('2026-02-28T10:00:00Z')))).toBe(
      '2026-03-31T10:00:00.000Z',
    );
    expect(iso(nextDripAt(null, 1, new Date('2026-02-28T10:00:00Z')))).toBe(
      '2026-03-28T10:00:00.000Z',
    );
  });

  it('a Jan 31 yearly start drips Feb 28, Mar 31, Apr 30', async () => {
    const userId = await seedUser();
    const start = new Date('2026-01-31T10:00:00Z');
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent(
      'subscription.charged',
      payload({ planId: 'solo_yearly', start, end: addMonths(start, 12), paidCount: 1 }),
    );
    const nextAt = async () =>
      (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!.inkDripNextAt;
    const sub0 = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(sub0.inkDripAnchor).toEqual(start);
    expect(iso(await nextAt())).toBe('2026-02-28T10:00:00.000Z');

    const at = (s: string) => settleYearlyDrip({ db: db(), userId, now: new Date(s) });
    expect((await at('2026-02-27T10:00:00Z')).granted).toBe(0);
    expect((await at('2026-02-28T10:00:00Z')).granted).toBe(1);
    expect(iso(await nextAt())).toBe('2026-03-31T10:00:00.000Z'); // not Mar 28
    expect((await at('2026-03-30T10:00:00Z')).granted).toBe(0);
    expect((await at('2026-03-31T10:00:00Z')).granted).toBe(1);
    expect(iso(await nextAt())).toBe('2026-04-30T10:00:00.000Z');
    expect((await at('2026-04-30T10:00:00Z')).granted).toBe(1);
    expect(iso(await nextAt())).toBe('2026-05-31T10:00:00.000Z');
  });

  it('a leap-year Jan 31 start drips on Feb 29', async () => {
    const userId = await seedUser();
    const start = new Date('2028-01-31T10:00:00Z');
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent(
      'subscription.charged',
      payload({ planId: 'solo_yearly', start, end: addMonths(start, 12), paidCount: 1 }),
    );
    const r = await settleYearlyDrip({ db: db(), userId, now: new Date('2028-02-29T10:00:00Z') });
    expect(r.granted).toBe(1);
  });

  it('a subscription with no anchor still chains month by month', async () => {
    const userId = await seedUser({ plan: 'pro', planTier: 'solo' });
    await db()
      .collection('subscriptions')
      .insertOne({
        userId,
        razorpaySubscriptionId: SUB_ID,
        status: 'active',
        billingCycle: 'yearly',
        planId: 'solo_yearly',
        paidThrough: new Date('2027-01-31T10:00:00Z'),
        inkDripNextAt: new Date('2026-02-28T10:00:00Z'),
        inkDripCount: 0,
        createdAt: new Date(),
      });
    const r = await settleYearlyDrip({ db: db(), userId, now: new Date('2026-03-28T10:00:00Z') });
    expect(r.granted).toBe(2);
    const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
    expect(iso(sub.inkDripNextAt)).toBe('2026-04-28T10:00:00.000Z');
    const refs = (await dripRows(userId)).map((x) => x.reference);
    expect(refs).toEqual([`sub_drip:${SUB_ID}:none:1`, `sub_drip:${SUB_ID}:none:2`]);
  });
});

describe('T-399: ledger reference carries the paid cycle', () => {
  it('year 2 writes cycle 2 references, distinct from year 1', async () => {
    const userId = await seedUser();
    await buyYearly(userId, 1);
    await settleYearlyDrip({ db: db(), userId, now: months(START, 2) });
    const start2 = months(START, 12);
    await handleWebhookEvent(
      'subscription.charged',
      payload({
        planId: 'solo_yearly',
        start: start2,
        end: months(start2, 12),
        paidCount: 2,
      }),
    );
    await settleYearlyDrip({ db: db(), userId, now: months(start2, 2) });
    const rows = await dripRows(userId);
    const refs = rows.map((r) => r.reference);
    expect(refs).toEqual([
      `sub_drip:${SUB_ID}:1:1`,
      `sub_drip:${SUB_ID}:1:2`,
      `sub_drip:${SUB_ID}:2:1`,
      `sub_drip:${SUB_ID}:2:2`,
    ]);
    expect(new Set(refs).size).toBe(4);
    expect(rows.map((r) => (r.metadata as { cycle: string }).cycle)).toEqual(['1', '1', '2', '2']);
  });

  it('cycle falls back to the period start in unix seconds, then the anchor, then none', async () => {
    const mk = async (extra: Record<string, unknown>, id: string) => {
      const userId = await seedUser({ email: `${id}@example.com` });
      await db()
        .collection('subscriptions')
        .insertOne({
          userId,
          razorpaySubscriptionId: id,
          status: 'active',
          billingCycle: 'yearly',
          planId: 'solo_yearly',
          paidThrough: months(START, 12),
          inkDripNextAt: addOneMonth(START),
          inkDripCount: 0,
          createdAt: new Date(),
          ...extra,
        });
      await settleYearlyDrip({ db: db(), userId, now: addOneMonth(START) });
      return (await dripRows(userId))[0].reference;
    };
    const unix = secs(START);
    expect(await mk({ lastGrantedPeriodStart: START }, 'sub_a')).toBe(`sub_drip:sub_a:${unix}:1`);
    expect(await mk({ inkDripAnchor: START }, 'sub_b')).toBe(`sub_drip:sub_b:${unix}:1`);
    expect(await mk({}, 'sub_c')).toBe('sub_drip:sub_c:none:1');
  });
});

describe('T-399: yearly grant fails after the claim (drip reset is part of the claim)', () => {
  afterEach(() => jest.restoreAllMocks());

  const renewalEvt = () => {
    const start2 = months(START, 12);
    return payload({
      planId: 'solo_yearly',
      start: start2,
      end: months(start2, 12),
      paidCount: 2,
    });
  };
  const subOf = async () =>
    (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;

  async function yearOneThenSpend() {
    const userId = await seedUser();
    await buyYearly(userId, 1);
    await settleYearlyDrip({ db: db(), userId, now: months(START, 3) }); // drips 1..3
    await User.updateOne({ _id: userId }, { $set: { inkSub: 60 } }); // 60 units left
    return userId;
  }

  it('a failing renewal grant rejects and restores the claim and the drip fields', async () => {
    const userId = await yearOneThenSpend();
    const before = await subOf();
    expect(before.inkDripCount).toBe(3);
    jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));

    await expect(handleWebhookEvent('subscription.charged', renewalEvt())).rejects.toThrow(
      'db down',
    );

    const after = await subOf();
    expect(after.lastGrantedPaidCount).toBe(1);
    expect(after.lastGrantedPeriodStart).toEqual(START);
    expect(after.inkDripAnchor).toEqual(before.inkDripAnchor);
    expect(after.inkDripNextAt).toEqual(before.inkDripNextAt);
    expect(after.inkDripCount).toBe(3);
    // Nothing was granted or carried.
    const u = await inkOf(userId);
    expect(u.inkSub).toBe(60);
    expect(u.inkAnnualCarry).toBe(0);
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
  });

  it('the retry grants exactly once and the carry is applied once', async () => {
    const userId = await yearOneThenSpend();
    const evt = renewalEvt();
    const start2 = months(START, 12);
    jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
    await expect(handleWebhookEvent('subscription.charged', evt)).rejects.toThrow();

    await handleWebhookEvent('subscription.charged', evt); // Razorpay's retry
    await handleWebhookEvent('subscription.charged', evt); // and a duplicate

    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(2);
    const u = await inkOf(userId);
    expect(u.inkSub).toBe(100);
    expect(u.inkAnnualCarry).toBe(30); // floor(60 * 0.5), once
    const sub = await subOf();
    expect(sub.lastGrantedPaidCount).toBe(2);
    expect(sub.inkDripCount).toBe(0);
    expect(sub.inkDripAnchor).toEqual(start2);
    expect(sub.inkDripNextAt).toEqual(addOneMonth(start2));
  });

  it('a first purchase that fails once then retries grants once with the drip set', async () => {
    const userId = await seedUser({ inkSub: 40 });
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    const evt = payload({
      planId: 'solo_yearly',
      start: START,
      end: months(START, 12),
      paidCount: 1,
    });
    jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
    await expect(handleWebhookEvent('subscription.charged', evt)).rejects.toThrow();
    const failed = await subOf();
    expect(failed.lastGrantedPaidCount).toBeUndefined();
    expect(failed.inkDripCount).toBeUndefined();
    expect(failed.inkDripNextAt).toBeUndefined();

    await handleWebhookEvent('subscription.charged', evt);
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    expect((await inkOf(userId)).inkAnnualCarry).toBe(20);
    const sub = await subOf();
    expect(sub.inkDripCount).toBe(0);
    expect(sub.inkDripNextAt).toEqual(addOneMonth(START));
  });

  it('Subscription.updateOne is not called after a successful paid_count grant', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    const spy = jest.spyOn(Subscription, 'updateOne');
    await handleWebhookEvent(
      'subscription.charged',
      payload({
        planId: 'solo_yearly',
        start: START,
        end: months(START, 12),
        paidCount: 1,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    const sub = await subOf();
    expect(sub.inkDripAnchor).toEqual(START);
    expect(sub.inkDripNextAt).toEqual(addOneMonth(START));
    expect(sub.inkDripCount).toBe(0);
  });
});
