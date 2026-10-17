/**
 * T-444: subscription lifecycle handlers (halted, paused, pending, resumed,
 * completed, authenticated, updated, unknown) and the createSubscription reuse
 * rules. Rules are Arjun's (T-444 ticket, 15 Oct 2026, rulings 1-8).
 *
 * Time is injected: settleYearlyDrip takes `now`, as in t399.
 */
import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

import { settleYearlyDrip } from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { User } from '../models/User.model';
import { handleWebhookEvent, createSubscription } from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn(), cancel: jest.fn() } },
}));

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) => cb({ setTag: jest.fn(), setExtra: jest.fn() }),
}));

import { razorpay } from '../config/razorpay';

const SUB_ID = 'sub_t444';
const START = new Date('2026-01-15T10:00:00.000Z');
const END = new Date('2027-01-15T10:00:00.000Z'); // paidThrough of the yearly charge
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const db = () => mongoose.connection.db!;
const settleAt = (userId: mongoose.Types.ObjectId, now: Date) =>
  settleYearlyDrip({ db: db(), userId, now });
const ledger = (userId: mongoose.Types.ObjectId) =>
  db().collection('inkledger').find({ userId }).toArray();
const getSub = (id = SUB_ID) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const getUser = async (userId: mongoose.Types.ObjectId) => (await User.findById(userId).lean())!;

const DAY_MS = 86_400_000;
const mockNewSub = () =>
  (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
    id: 'sub_new',
    short_url: 'https://rzp.io/new',
  });

function payload(opts: { subId?: string; status?: string; paidCount?: number; planId?: string }) {
  const entity: Record<string, unknown> = { id: opts.subId ?? SUB_ID };
  if (opts.status) entity.status = opts.status;
  if (opts.paidCount !== undefined) entity.paid_count = opts.paidCount;
  if (opts.planId) entity.notes = { planId: opts.planId };
  return { subscription: { entity } };
}

function chargePayload(planId: string, paidCount: number, start: Date, end: Date) {
  const p = payload({ planId, paidCount });
  Object.assign(p.subscription.entity, {
    current_start: secs(start),
    current_end: secs(end),
  });
  return p;
}

async function seedUser() {
  const u = await User.create({ email: 't444@example.com', plan: 'free', emailVerified: true });
  return u._id as mongoose.Types.ObjectId;
}

/** A yearly sub bought (one charge, paid_count 1) so the user is Pro until END. */
async function buyYearly(userId: mongoose.Types.ObjectId) {
  await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
  await handleWebhookEvent('subscription.charged', chargePayload('solo_yearly', 1, START, END));
}

/** A monthly sub bought (paid_count 1), so lastGrantedPaidCount = 1. */
async function buyMonthly(userId: mongoose.Types.ObjectId, paidCount = 1) {
  await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
  await handleWebhookEvent(
    'subscription.charged',
    chargePayload('solo_monthly', paidCount, START, new Date('2026-02-15T10:00:00.000Z')),
  );
}

beforeEach(() => {
  mockCaptureMessage.mockClear();
  (razorpay.subscriptions.create as jest.Mock).mockReset();
  (razorpay.subscriptions.fetch as jest.Mock).mockReset();
  (razorpay.subscriptions.cancel as jest.Mock).mockReset().mockResolvedValue({});
});

// ─── AC1: pending ────────────────────────────────────────────────────────────
describe('T-444 AC1: subscription.pending', () => {
  it.each(['active', 'halted', 'created'] as const)(
    'is a no-op on a %s sub (fresh paid_count)',
    async (status) => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status });
      await handleWebhookEvent(
        'subscription.pending',
        payload({ status: 'pending', paidCount: 1 }),
      );
      expect((await getSub())!.status).toBe(status);
    },
  );

  it('does not move a paid sub to pending', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent('subscription.pending', payload({ status: 'pending', paidCount: 1 }));
    expect((await getSub())!.status).toBe('active');
    expect((await getUser(userId)).plan).toBe('pro');
  });
});

// ─── AC2: halted and paused ──────────────────────────────────────────────────
describe.each([
  ['halted', 'subscription.halted'],
  ['paused', 'subscription.paused'],
] as const)('T-444 AC2: %s', (status, event) => {
  it('stores the status, keeps Pro and the paidThrough, and grants nothing', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    const rowsBefore = (await ledger(userId)).length;

    await handleWebhookEvent(event, payload({ status, paidCount: 1 }));

    const sub = await getSub();
    expect(sub!.status).toBe(status);
    expect(sub!.paidThrough!.toISOString()).toBe(END.toISOString());
    const u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(100);
    expect((await ledger(userId)).length).toBe(rowsBefore);
  });

  it(`user loses Pro at paidThrough and not before (${status})`, async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent(event, payload({ status, paidCount: 1 }));
    const rowsBefore = (await ledger(userId)).length;

    // paidThrough - 1s: keeps Pro and drips nothing (an active plan would drip here).
    const before = await settleAt(userId, new Date(END.getTime() - 1000));
    expect(before).toEqual({ granted: 0, expired: false });
    let u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(100);
    expect((await ledger(userId)).length).toBe(rowsBefore);

    // paidThrough + 1s: zeroed and downgraded once.
    const after = await settleAt(userId, new Date(END.getTime() + 1000));
    expect(after).toEqual({ granted: 0, expired: true });
    u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.planTier).toBe('free');
    expect(u.inkSub).toBe(0);
    const rowsAfter = (await ledger(userId)).length;

    // A second call is a no-op.
    const again = await settleAt(userId, new Date(END.getTime() + 2000));
    expect(again).toEqual({ granted: 0, expired: false });
    expect((await ledger(userId)).length).toBe(rowsAfter);
  });

  it('a stale event (paid_count < lastGrantedPaidCount) changes nothing', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    expect((await getSub())!.lastGrantedPaidCount).toBe(2);

    await handleWebhookEvent(event, payload({ status, paidCount: 1 }));

    expect((await getSub())!.status).toBe('active');
    expect((await getUser(userId)).plan).toBe('pro');
  });

  it('an event with paid_count equal to lastGrantedPaidCount is applied', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent(event, payload({ status, paidCount: 2 }));
    expect((await getSub())!.status).toBe(status);
  });

  it('a later event (paid_count > lastGrantedPaidCount) is applied', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent(event, payload({ status, paidCount: 3 }));
    expect((await getSub())!.status).toBe(status);
  });
});

describe('T-444 ruling 2: halted/paused/updated event with NO paid_count', () => {
  // Arjun ruled (15 Oct): an event with no entity.paid_count is APPLIED (the freshness
  // guard is skipped, with an info log). Only a present-and-lower paid_count is stale.
  it.each(['halted', 'paused'] as const)(
    'RULING: subscription.%s without paid_count on a granted sub is applied',
    async (status) => {
      const userId = await seedUser();
      await buyYearly(userId);
      await handleWebhookEvent(`subscription.${status}`, payload({ status }));
      expect((await getSub())!.status).toBe(status);
    },
  );

  it('RULING: subscription.updated without paid_count on a granted sub is applied', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent('subscription.updated', payload({ status: 'halted' }));
    expect((await getSub())!.status).toBe('halted');
  });

  it('RULING: a halted without paid_count on a never-granted sub is applied', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    await handleWebhookEvent('subscription.halted', payload({}));
    expect((await getSub())!.status).toBe('halted');
  });

  it('a present-and-lower paid_count is still stale (no-op)', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent('subscription.halted', payload({ status: 'halted', paidCount: 1 }));
    expect((await getSub())!.status).toBe('active');
  });
});

// ─── AC3: resumed ────────────────────────────────────────────────────────────
describe('T-444 AC3: subscription.resumed', () => {
  it('sets a paused sub active and grants nothing', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent('subscription.paused', payload({ status: 'paused', paidCount: 1 }));
    const u0 = await getUser(userId);
    const rowsBefore = (await ledger(userId)).length;

    await handleWebhookEvent('subscription.resumed', payload({ status: 'active', paidCount: 1 }));

    expect((await getSub())!.status).toBe('active');
    const u = await getUser(userId);
    expect(u.inkSub).toBe(u0.inkSub);
    expect(u.inkAnnualCarry).toBe(u0.inkAnnualCarry);
    expect((await ledger(userId)).length).toBe(rowsBefore);
  });
});

// ─── AC4: completed ──────────────────────────────────────────────────────────
describe('T-444 AC4: subscription.completed', () => {
  it('stores completed and keeps Pro (terminal, not immediate)', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent('subscription.completed', payload({ status: 'completed' }));
    expect((await getSub())!.status).toBe('completed');
    const u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(100);
  });

  it('user loses Pro at paidThrough and not before (completed, monthly: no drip)', async () => {
    const userId = await seedUser();
    await buyMonthly(userId);
    const monthEnd = new Date('2026-02-15T10:00:00.000Z');
    await handleWebhookEvent('subscription.completed', payload({ status: 'completed' }));
    const rowsBefore = (await ledger(userId)).length;

    expect(await settleAt(userId, new Date(monthEnd.getTime() - 1000))).toEqual({
      granted: 0,
      expired: false,
    });
    let u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect((await ledger(userId)).length).toBe(rowsBefore);

    expect(await settleAt(userId, new Date(monthEnd.getTime() + 1000))).toEqual({
      granted: 0,
      expired: true,
    });
    u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);

    expect(await settleAt(userId, new Date(monthEnd.getTime() + 2000))).toEqual({
      granted: 0,
      expired: false,
    });
  });

  // Arjun (15 Oct, ruling g), asked for by name.
  it('Completed yearly sub still drips month n before paidThrough', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    await handleWebhookEvent('subscription.completed', payload({ status: 'completed' }));
    const rowsBefore = (await ledger(userId)).length;

    const month2 = new Date('2026-02-20T10:00:00.000Z'); // after anchor + 1 month
    const r = await settleAt(userId, month2);

    expect(r).toEqual({ granted: 1, expired: false });
    expect((await ledger(userId)).length).toBe(rowsBefore + 1);
    const sub = await getSub();
    expect(sub!.status).toBe('completed');
    expect(sub!.inkDripCount).toBe(1);
    expect((await getUser(userId)).plan).toBe('pro');

    // Then it downgrades once at paidThrough.
    expect((await settleAt(userId, new Date(END.getTime() + 1000))).expired).toBe(true);
    expect((await getUser(userId)).plan).toBe('free');
  });

  it.each(['halted', 'paused'] as const)(
    'a %s yearly sub drips nothing (ruling g)',
    async (status) => {
      const userId = await seedUser();
      await buyYearly(userId);
      await handleWebhookEvent(`subscription.${status}`, payload({ status, paidCount: 1 }));
      const rowsBefore = (await ledger(userId)).length;
      expect(await settleAt(userId, new Date('2026-02-20T10:00:00.000Z'))).toEqual({
        granted: 0,
        expired: false,
      });
      expect((await ledger(userId)).length).toBe(rowsBefore);
    },
  );
});

// ─── AC5: authenticated and updated ──────────────────────────────────────────
describe('T-444 AC5: subscription.authenticated', () => {
  it('moves a created sub to authenticated', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent('subscription.authenticated', payload({ status: 'authenticated' }));
    expect((await getSub())!.status).toBe('authenticated');
  });

  it.each(['active', 'halted', 'paused', 'cancelled', 'completed', 'authenticated'] as const)(
    'is a no-op from %s',
    async (status) => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status });
      await expect(
        handleWebhookEvent('subscription.authenticated', payload({ status: 'authenticated' })),
      ).resolves.toBeUndefined();
      expect((await getSub())!.status).toBe(status);
    },
  );
});

describe('T-444 AC5: subscription.updated', () => {
  it('stores the entity status only (no grant, no plan change)', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'authenticated' });
    await handleWebhookEvent('subscription.updated', payload({ status: 'active', paidCount: 0 }));
    expect((await getSub())!.status).toBe('active');
    expect((await getUser(userId)).plan).toBe('free');
    expect(await ledger(userId)).toHaveLength(0);
  });

  it('a stale updated event (paid_count < lastGrantedPaidCount) changes nothing', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent('subscription.updated', payload({ status: 'halted', paidCount: 1 }));
    expect((await getSub())!.status).toBe('active');
  });

  it('an updated event with an unknown status is ignored and reported', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    await handleWebhookEvent('subscription.updated', payload({ status: 'frozen', paidCount: 1 }));
    expect((await getSub())!.status).toBe('active');
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.any(String), 'warning');
  });
});

// ─── Ruling 6: unknown status / event ────────────────────────────────────────
describe('T-444 ruling 6: unknown subscription status', () => {
  it('warns, counts in Sentry as a warning and does not throw (200, never a 500 loop)', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    await expect(
      handleWebhookEvent('subscription.frobnicated', payload({ status: 'frobnicated' })),
    ).resolves.toBeUndefined();

    expect((await getSub())!.status).toBe('active');
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.any(String), 'warning');
    const logged = warn.mock.calls.find((c) => JSON.stringify(c[0]).includes('frobnicated'));
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged![0])).toContain(SUB_ID);
    warn.mockRestore();
  });

  it('known events do not raise the unknown-status warning', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent('subscription.authenticated', payload({ status: 'authenticated' }));
    await handleWebhookEvent('subscription.pending', payload({ status: 'pending', paidCount: 0 }));
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// ─── Ruling 1: missing paidThrough ───────────────────────────────────────────
describe('T-444 ruling 1: missing paidThrough', () => {
  async function proUserWithSub(fields: Record<string, unknown>) {
    const u = await User.create({
      email: 't444-ruling1@example.com',
      plan: 'pro',
      planTier: 'solo',
      billingCycle: 'monthly',
      inkSub: 80,
    });
    await Subscription.create({
      userId: u._id,
      razorpaySubscriptionId: SUB_ID,
      ...fields,
    });
    return u._id as mongoose.Types.ObjectId;
  }
  const NOW = new Date('2026-06-01T00:00:00.000Z');

  it.each(['halted', 'paused', 'completed'] as const)(
    '%s: falls back to currentPeriodEnd (still ahead keeps Pro)',
    async (status) => {
      const userId = await proUserWithSub({
        status,
        currentPeriodEnd: new Date(NOW.getTime() + 86_400_000),
      });
      expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
      expect((await getUser(userId)).plan).toBe('pro');
    },
  );

  it.each(['halted', 'paused', 'completed'] as const)(
    '%s: falls back to currentPeriodEnd (already past expires)',
    async (status) => {
      const userId = await proUserWithSub({
        status,
        currentPeriodEnd: new Date(NOW.getTime() - 86_400_000),
      });
      expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
      const u = await getUser(userId);
      expect(u.plan).toBe('free');
      expect(u.inkSub).toBe(0);
    },
  );

  it.each(['halted', 'paused', 'completed'] as const)(
    '%s: with paidThrough and currentPeriodEnd both missing, expires on the next settle',
    async (status) => {
      const userId = await proUserWithSub({ status });
      expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
      expect((await getUser(userId)).plan).toBe('free');
      expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
    },
  );

  it('paidThrough wins over currentPeriodEnd when both are set', async () => {
    const userId = await proUserWithSub({
      status: 'halted',
      paidThrough: new Date(NOW.getTime() + 86_400_000),
      currentPeriodEnd: new Date(NOW.getTime() - 86_400_000),
    });
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
    expect((await getUser(userId)).plan).toBe('pro');
  });
});

// ─── Expired webhook with another halted sub ─────────────────────────────────
describe('T-444: expired webhook with another halted/paused/completed sub', () => {
  async function twoSubs(secondStatus: string, secondPaidThrough: Date) {
    const userId = (
      await User.create({
        email: 't444-two@example.com',
        plan: 'pro',
        planTier: 'solo',
        billingCycle: 'monthly',
        inkSub: 80,
        inkAnnualCarry: 10,
      })
    )._id;
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'active' });
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_second',
      status: secondStatus,
      paidThrough: secondPaidThrough,
    });
    return userId as mongoose.Types.ObjectId;
  }

  it.each(['halted', 'paused', 'completed'])(
    'does not downgrade while the other %s sub is inside paidThrough',
    async (status) => {
      const userId = await twoSubs(status, new Date(Date.now() + 10 * 86_400_000));
      await handleWebhookEvent('subscription.expired', payload({}));
      const u = await getUser(userId);
      expect(u.plan).toBe('pro');
      expect(u.inkSub).toBe(80);
      expect(u.inkAnnualCarry).toBe(10);
    },
  );

  it('downgrades once the other halted sub is past paidThrough', async () => {
    const userId = await twoSubs('halted', new Date(Date.now() - 86_400_000));
    await handleWebhookEvent('subscription.expired', payload({}));
    const u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
  });
});

// ─── Recovery ────────────────────────────────────────────────────────────────
describe('T-444 ruling 4: charged recovers a halted sub', () => {
  it('sets status active again, with the new paidThrough, and grants', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 1);
    await handleWebhookEvent('subscription.halted', payload({ status: 'halted', paidCount: 1 }));
    expect((await getSub())!.status).toBe('halted');

    const nextEnd = new Date('2026-03-15T10:00:00.000Z');
    await handleWebhookEvent(
      'subscription.charged',
      chargePayload('solo_monthly', 2, new Date('2026-02-15T10:00:00.000Z'), nextEnd),
    );

    const sub = await getSub();
    expect(sub!.status).toBe('active');
    expect(sub!.paidThrough!.toISOString()).toBe(nextEnd.toISOString());
    expect(sub!.lastGrantedPaidCount).toBe(2);
    expect((await getUser(userId)).plan).toBe('pro');
  });
});

// ─── AC6 / ruling 7: createSubscription reuse ────────────────────────────────
describe('T-444 AC6: createSubscription reuse rules', () => {
  it('halted user cannot start a second subscription (409 data of the existing sub)', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const paidThrough = new Date('2027-01-15T10:00:00.000Z');
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_halted',
      status: 'halted',
      planId: 'solo_monthly',
      paidThrough,
    });

    await expect(createSubscription(userId, 'a@example.com', 'solo_yearly')).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
      status: 'halted',
      planId: 'solo_monthly',
      paidThrough,
    });
    expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ userId })).toBe(1);
  });

  it.each(['active', 'pending', 'halted', 'paused'] as const)(
    '%s blocks a new subscription with the existing status and plan',
    async (status) => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_live',
        status,
        planId: 'solo_monthly',
        paidThrough: new Date(Date.now() + 10 * DAY_MS),
      });
      await expect(
        createSubscription(userId, 'a@example.com', 'solo_yearly'),
      ).rejects.toMatchObject({ name: 'SubscriptionExistsError', status, planId: 'solo_monthly' });
      expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
    },
  );

  it('paidThrough in the error falls back to currentPeriodEnd', async () => {
    const withEnd = new mongoose.Types.ObjectId().toString();
    const periodEnd = new Date(Date.now() + 30 * DAY_MS);
    await Subscription.create({
      userId: withEnd,
      razorpaySubscriptionId: 'sub_a',
      status: 'paused',
      planId: 'solo_monthly',
      currentPeriodEnd: periodEnd,
    });
    await expect(createSubscription(withEnd, 'a@example.com')).rejects.toMatchObject({
      status: 'paused',
      paidThrough: periodEnd,
    });
    expect((await getSub('sub_a'))!.status).toBe('paused');
  });

  it('a paused sub with neither date is lapsed: expired and a new sub is created', async () => {
    const neither = new mongoose.Types.ObjectId().toString();
    await Subscription.create({
      userId: neither,
      razorpaySubscriptionId: 'sub_b',
      status: 'paused',
    });
    mockNewSub();
    const r = await createSubscription(neither, 'a@example.com');
    expect(r.subscriptionId).toBe('sub_new');
    expect((await getSub('sub_b'))!.status).toBe('expired');
  });

  describe('T-444b: a lapsed halted/paused/pending sub does not block', () => {
    it.each(['halted', 'paused', 'pending'] as const)(
      'lapsed %s: old sub marked expired, new sub created',
      async (status) => {
        const userId = new mongoose.Types.ObjectId().toString();
        await Subscription.create({
          userId,
          razorpaySubscriptionId: 'sub_lapsed',
          status,
          planId: 'solo_monthly',
          paidThrough: new Date(Date.now() - DAY_MS),
        });
        mockNewSub();

        const r = await createSubscription(userId, 'a@example.com', 'solo_yearly');

        expect(r).toEqual({
          subscriptionId: 'sub_new',
          shortUrl: 'https://rzp.io/new',
          planId: 'solo_yearly',
        });
        expect(razorpay.subscriptions.create).toHaveBeenCalledTimes(1);
        expect((await getSub('sub_lapsed'))!.status).toBe('expired');
        expect((await getSub('sub_new'))!.status).toBe('created');
      },
    );

    it.each(['halted', 'paused', 'pending'] as const)(
      '%s before paidThrough stays 409 and is not expired',
      async (status) => {
        const userId = new mongoose.Types.ObjectId().toString();
        await Subscription.create({
          userId,
          razorpaySubscriptionId: 'sub_paid',
          status,
          paidThrough: new Date(Date.now() + DAY_MS),
        });
        await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
          name: 'SubscriptionExistsError',
          status,
        });
        expect((await getSub('sub_paid'))!.status).toBe(status);
        expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
      },
    );

    it('halted with no paidThrough and a future currentPeriodEnd gives 409, not expired', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_h',
        status: 'halted',
        currentPeriodEnd: new Date(Date.now() + DAY_MS),
      });
      await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
        name: 'SubscriptionExistsError',
        status: 'halted',
      });
      expect((await getSub('sub_h'))!.status).toBe('halted');
      expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
    });

    it('pending with no paidThrough but a future currentPeriodEnd is lapsed', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_p',
        status: 'pending',
        currentPeriodEnd: new Date(Date.now() + DAY_MS),
      });
      mockNewSub();
      const r = await createSubscription(userId, 'a@example.com');
      expect(r.subscriptionId).toBe('sub_new');
      expect((await getSub('sub_p'))!.status).toBe('expired');
    });

    it('an active sub still gives 409 even with a past paidThrough', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_act',
        status: 'active',
        paidThrough: new Date(Date.now() - DAY_MS),
      });
      await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
        name: 'SubscriptionExistsError',
        status: 'active',
      });
      expect((await getSub('sub_act'))!.status).toBe('active');
    });

    it.each(['halted', 'paused', 'pending'] as const)(
      'resubscribing over a lapsed %s sub leaves the User plan and Ink unchanged',
      async (status) => {
        const userId = await proUser(`t444b-${status}@example.com`);
        await addSub(userId, 'sub_lapsed', {
          status,
          paidThrough: new Date(Date.now() - DAY_MS),
        });
        const rowsBefore = (await ledger(userId)).length;
        mockNewSub();

        await createSubscription(userId.toString(), 'a@example.com');

        expect((await getSub('sub_lapsed'))!.status).toBe('expired');
        const u = await getUser(userId);
        expect(u.plan).toBe('pro');
        expect(u.planTier).toBe('solo');
        expect(u.inkSub).toBe(80);
        expect(u.inkAnnualCarry).toBe(10);
        expect((await ledger(userId)).length).toBe(rowsBefore);
      },
    );
  });

  it.each(['cancelled', 'completed', 'expired'] as const)(
    'a terminal %s sub does not block a new subscription',
    async (status) => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({ userId, razorpaySubscriptionId: 'sub_old', status });
      (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
        id: 'sub_new',
        short_url: 'https://rzp.io/new',
      });
      const r = await createSubscription(userId, 'a@example.com', 'solo_monthly');
      expect(r.subscriptionId).toBe('sub_new');
      expect(r.planId).toBe('solo_monthly');
    },
  );

  // T-516 (Priya approved rewriting the old assertion, which pinned the bug of
  // handing back another plan's checkout): the same plan is reused; a different
  // plan cancels the stale checkout and creates one for the plan asked for.
  it.each(['created', 'authenticated'] as const)(
    'a %s sub for the same plan is reused with its existing short_url and planId',
    async (status) => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_checkout',
        status,
        planId: 'solo_monthly',
      });
      (razorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
        id: 'sub_checkout',
        short_url: 'https://rzp.io/checkout',
      });

      const r = await createSubscription(userId, 'a@example.com', 'solo_monthly');

      expect(r).toEqual({
        subscriptionId: 'sub_checkout',
        shortUrl: 'https://rzp.io/checkout',
        planId: 'solo_monthly',
      });
      expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
      expect(razorpay.subscriptions.cancel).not.toHaveBeenCalled();
    },
  );

  it.each(['created', 'authenticated'] as const)(
    'a %s sub for a different plan is cancelled and replaced by one for the requested plan',
    async (status) => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_checkout',
        status,
        planId: 'solo_monthly',
      });
      mockNewSub();

      const r = await createSubscription(userId, 'a@example.com', 'solo_yearly');

      expect(r).toEqual({
        subscriptionId: 'sub_new',
        shortUrl: 'https://rzp.io/new',
        planId: 'solo_yearly',
      });
      expect(razorpay.subscriptions.cancel).toHaveBeenCalledWith('sub_checkout', false);
      expect((await getSub('sub_checkout'))!.status).toBe('cancelled');
    },
  );

  it('a legacy created sub with no stored planId uses the plan from the Razorpay notes (same plan: reused)', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_legacy',
      status: 'created',
    });
    (razorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
      id: 'sub_legacy',
      short_url: 'https://rzp.io/legacy',
      notes: { planId: 'solo_monthly' },
    });
    const r = await createSubscription(userId, 'a@example.com', 'solo_monthly');
    expect(r.planId).toBe('solo_monthly');
    expect(r.shortUrl).toBe('https://rzp.io/legacy');
    expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
  });

  it('a legacy created sub whose notes name another plan is cancelled and replaced', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_legacy',
      status: 'created',
    });
    (razorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
      id: 'sub_legacy',
      short_url: 'https://rzp.io/legacy',
      notes: { planId: 'solo_monthly' },
    });
    mockNewSub();
    const r = await createSubscription(userId, 'a@example.com', 'solo_yearly');
    expect(razorpay.subscriptions.cancel).toHaveBeenCalledWith('sub_legacy', false);
    expect(r.subscriptionId).toBe('sub_new');
    expect(r.planId).toBe('solo_yearly');
  });

  it('a new subscription stores the requested planId', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
      id: 'sub_fresh',
      short_url: 'https://rzp.io/fresh',
    });
    await createSubscription(userId, 'a@example.com', 'solo_yearly');
    expect((await getSub('sub_fresh'))!.planId).toBe('solo_yearly');
  });
});

// ─── Review round 2 rulings (c)-(g) ──────────────────────────────────────────
const NOW = new Date('2026-06-01T00:00:00.000Z');
const future = new Date(NOW.getTime() + DAY_MS);
const past = new Date(NOW.getTime() - DAY_MS);

async function proUser(email = 't444-r2@example.com') {
  const u = await User.create({
    email,
    plan: 'pro',
    planTier: 'solo',
    billingCycle: 'monthly',
    inkSub: 80,
    inkAnnualCarry: 10,
  });
  return u._id as mongoose.Types.ObjectId;
}
const addSub = (userId: mongoose.Types.ObjectId, id: string, fields: Record<string, unknown>) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, ...fields });

describe('T-444 ruling c: a stored pending sub', () => {
  it('with paidThrough in the future next to an ended sub: no downgrade on settle', async () => {
    const userId = await proUser();
    await addSub(userId, 'sub_ended', { status: 'expired', paidThrough: past });
    await addSub(userId, 'sub_pend', { status: 'pending', paidThrough: future });

    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
    const u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(80);
  });

  it('with paidThrough in the future: no downgrade on the expired webhook', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'active' });
    await addSub(userId, 'sub_pend', {
      status: 'pending',
      paidThrough: new Date(Date.now() + 10 * DAY_MS),
    });

    await handleWebhookEvent('subscription.expired', payload({}));

    const u = await getUser(userId);
    expect(u.plan).toBe('pro');
    expect(u.inkSub).toBe(80);
    expect(u.inkAnnualCarry).toBe(10);
  });

  it('with only a future currentPeriodEnd does NOT count as paid on the expired webhook', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'active' });
    await addSub(userId, 'sub_pend', {
      status: 'pending',
      currentPeriodEnd: new Date(Date.now() + 10 * DAY_MS),
    });

    await handleWebhookEvent('subscription.expired', payload({}));

    const u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
  });

  it('with only a future currentPeriodEnd does NOT count as paid next to an ended sub (settle)', async () => {
    const userId = await proUser();
    await addSub(userId, 'sub_ended', { status: 'expired', paidThrough: past });
    await addSub(userId, 'sub_pend', { status: 'pending', currentPeriodEnd: future });

    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
    expect((await getUser(userId)).plan).toBe('free');
  });

  it('past paidThrough: expires once', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'pending', paidThrough: past });

    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
    const u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
  });

  it('with paidThrough ahead: still paid, no expiry', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'pending', paidThrough: future });
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
    expect((await getUser(userId)).plan).toBe('pro');
  });

  it('with only currentPeriodEnd follows the ladder (ahead keeps Pro)', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'pending', currentPeriodEnd: future });
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
    expect((await getUser(userId)).plan).toBe('pro');
  });

  it('with only currentPeriodEnd follows the ladder (past expires once)', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'pending', currentPeriodEnd: past });
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
    expect((await getUser(userId)).plan).toBe('free');
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
  });

  it('with neither date ends on the next settle', async () => {
    const userId = await proUser();
    await addSub(userId, SUB_ID, { status: 'pending' });
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: true });
    expect((await getUser(userId)).plan).toBe('free');
    expect(await settleAt(userId, NOW)).toEqual({ granted: 0, expired: false });
  });
});

describe('T-444 ruling d: subscription.resumed', () => {
  it.each(['cancelled', 'completed', 'expired', 'active', 'created', 'pending'] as const)(
    'on a %s sub is a no-op',
    async (status) => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status });
      await expect(
        handleWebhookEvent('subscription.resumed', payload({ status: 'active', paidCount: 1 })),
      ).resolves.toBeUndefined();
      expect((await getSub())!.status).toBe(status);
      expect(await ledger(userId)).toHaveLength(0);
    },
  );

  it.each(['paused', 'halted'] as const)('moves a fresh %s sub to active', async (status) => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent(`subscription.${status}`, payload({ status, paidCount: 2 }));
    await handleWebhookEvent('subscription.resumed', payload({ status: 'active', paidCount: 2 }));
    expect((await getSub())!.status).toBe('active');
  });

  it('a stale resumed (paid_count < lastGrantedPaidCount) is a no-op', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 2);
    await handleWebhookEvent('subscription.paused', payload({ status: 'paused', paidCount: 2 }));
    await handleWebhookEvent('subscription.resumed', payload({ status: 'active', paidCount: 1 }));
    expect((await getSub())!.status).toBe('paused');
  });
});

describe('T-444 ruling e: subscription.updated', () => {
  it.each(['active', 'created', 'authenticated'] as const)(
    'to pending is a no-op on a %s sub',
    async (status) => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status });
      await handleWebhookEvent(
        'subscription.updated',
        payload({ status: 'pending', paidCount: 1 }),
      );
      expect((await getSub())!.status).toBe(status);
    },
  );

  it.each(['halted', 'paused'] as const)('to active on a %s sub is a no-op', async (status) => {
    const userId = await seedUser();
    await buyMonthly(userId, 1);
    await handleWebhookEvent(`subscription.${status}`, payload({ status, paidCount: 1 }));
    await handleWebhookEvent('subscription.updated', payload({ status: 'active', paidCount: 1 }));
    expect((await getSub())!.status).toBe(status);
  });

  it('to active from authenticated still applies', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'authenticated' });
    await handleWebhookEvent('subscription.updated', payload({ status: 'active', paidCount: 0 }));
    expect((await getSub())!.status).toBe('active');
  });
});

describe('T-444 ruling f: a late charged event on a terminal sub', () => {
  it.each(['completed', 'cancelled', 'expired'] as const)(
    'on a %s sub grants the cycle, sets paidThrough, keeps the status, then downgrades at the new paidThrough',
    async (status) => {
      const userId = await seedUser();
      await buyMonthly(userId, 1);
      await Subscription.updateOne({ razorpaySubscriptionId: SUB_ID }, { $set: { status } });
      const rowsBefore = (await ledger(userId)).length;
      const nextEnd = new Date('2026-03-15T10:00:00.000Z');

      await handleWebhookEvent(
        'subscription.charged',
        chargePayload('solo_monthly', 2, new Date('2026-02-15T10:00:00.000Z'), nextEnd),
      );

      const sub = await getSub();
      expect(sub!.status).toBe(status);
      expect(sub!.paidThrough!.toISOString()).toBe(nextEnd.toISOString());
      expect(sub!.lastGrantedPaidCount).toBe(2);
      expect((await ledger(userId)).length).toBeGreaterThan(rowsBefore);
      expect((await getUser(userId)).plan).toBe('pro');

      expect(await settleAt(userId, new Date(nextEnd.getTime() - 1000))).toEqual({
        granted: 0,
        expired: false,
      });
      expect((await getUser(userId)).plan).toBe('pro');
      expect(await settleAt(userId, new Date(nextEnd.getTime() + 1000))).toEqual({
        granted: 0,
        expired: true,
      });
      const u = await getUser(userId);
      expect(u.plan).toBe('free');
      expect(u.inkSub).toBe(0);
    },
  );

  it.each(['halted', 'paused', 'pending'] as const)(
    'on a %s sub still moves it to active',
    async (status) => {
      const userId = await seedUser();
      await buyMonthly(userId, 1);
      await Subscription.updateOne({ razorpaySubscriptionId: SUB_ID }, { $set: { status } });
      await handleWebhookEvent(
        'subscription.charged',
        chargePayload(
          'solo_monthly',
          2,
          new Date('2026-02-15T10:00:00.000Z'),
          new Date('2026-03-15T10:00:00.000Z'),
        ),
      );
      expect((await getSub())!.status).toBe('active');
    },
  );
});

// ─── Round 3: no status write outside the grant claim ────────────────────────
describe('T-444 round 3: charged and the claim own the status', () => {
  const NEXT_START = new Date('2026-02-15T10:00:00.000Z');
  const NEXT_END = new Date('2026-03-15T10:00:00.000Z');

  it.each(['halted', 'paused'] as const)(
    'a duplicate charged after %s leaves the sub %s and grants nothing',
    async (status) => {
      const userId = await seedUser();
      await buyMonthly(userId, 1);
      await handleWebhookEvent(`subscription.${status}`, payload({ status, paidCount: 1 }));
      const rowsBefore = (await ledger(userId)).length;
      const before = await getSub();

      await handleWebhookEvent(
        'subscription.charged',
        chargePayload('solo_monthly', 1, START, NEXT_START),
      );

      const after = await getSub();
      expect(after!.status).toBe(status);
      expect(after!.lastGrantedPaidCount).toBe(1);
      expect(after!.paidThrough).toEqual(before!.paidThrough);
      expect((await ledger(userId)).length).toBe(rowsBefore);
    },
  );

  it('halted n arriving before claim n+1: the sub ends active after the claim', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 1);
    // halted carries paid_count 2: newer than the last grant, so it is applied first
    await handleWebhookEvent('subscription.halted', payload({ status: 'halted', paidCount: 2 }));
    expect((await getSub())!.status).toBe('halted');
    const rowsBefore = (await ledger(userId)).length;

    await handleWebhookEvent(
      'subscription.charged',
      chargePayload('solo_monthly', 2, NEXT_START, NEXT_END),
    );

    const sub = await getSub();
    expect(sub!.status).toBe('active');
    expect(sub!.lastGrantedPaidCount).toBe(2);
    expect(sub!.paidThrough!.toISOString()).toBe(NEXT_END.toISOString());
    expect((await ledger(userId)).length).toBeGreaterThan(rowsBefore);
  });

  it.each(['cancelled', 'completed', 'expired'] as const)(
    'updated(active) on a %s sub is a no-op',
    async (status) => {
      const userId = await seedUser();
      await buyMonthly(userId, 1);
      await Subscription.updateOne({ razorpaySubscriptionId: SUB_ID }, { $set: { status } });
      const before = await getSub();

      await handleWebhookEvent('subscription.updated', payload({ status: 'active', paidCount: 1 }));

      const after = await getSub();
      expect(after!.status).toBe(status);
      expect(after!.paidThrough).toEqual(before!.paidThrough);
      expect(after!.lastGrantedPaidCount).toBe(before!.lastGrantedPaidCount);
    },
  );

  it('completed does not overwrite expired', async () => {
    const userId = await seedUser();
    await buyMonthly(userId, 1);
    await Subscription.updateOne(
      { razorpaySubscriptionId: SUB_ID },
      { $set: { status: 'expired' } },
    );

    await handleWebhookEvent('subscription.completed', payload({ status: 'completed' }));

    expect((await getSub())!.status).toBe('expired');
  });

  it('a late cancelled after expired leaves the sub expired: no drip, no access', async () => {
    const userId = await seedUser();
    await buyYearly(userId);
    // Move the paid period into the past, then Razorpay's expired webhook ends the sub.
    await Subscription.updateOne(
      { razorpaySubscriptionId: SUB_ID },
      { $set: { paidThrough: new Date('2026-02-01T00:00:00.000Z') } },
    );
    await handleWebhookEvent('subscription.expired', payload({}));
    expect((await getSub())!.status).toBe('expired');
    expect((await getUser(userId)).plan).toBe('free');
    const rowsBefore = (await ledger(userId)).length;
    const expiredAt = (await getSub())!.cancelledAt;

    await handleWebhookEvent('subscription.cancelled', payload({ status: 'cancelled' }));

    const sub = await getSub();
    expect(sub!.status).toBe('expired');
    expect(sub!.cancelledAt).toEqual(expiredAt); // the late cancel wrote nothing
    expect(await settleAt(userId, new Date(END.getTime() + 40 * 86_400_000))).toEqual({
      granted: 0,
      expired: false,
    });
    const u = await getUser(userId);
    expect(u.plan).toBe('free');
    expect(u.inkSub).toBe(0);
    expect((await ledger(userId)).length).toBe(rowsBefore);
  });

  it('charged on a created sub becomes active', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
    await handleWebhookEvent(
      'subscription.charged',
      chargePayload('solo_monthly', 1, START, NEXT_START),
    );
    const sub = await getSub();
    expect(sub!.status).toBe('active');
    expect(sub!.lastGrantedPaidCount).toBe(1);
    expect((await getUser(userId)).plan).toBe('pro');
  });

  describe('T-444b: charged with no paid_count and no current_start', () => {
    const unclaimed = () => payload({ planId: 'solo_monthly' });

    it('on a halted sub keeps it halted', async () => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'halted' });
      await handleWebhookEvent('subscription.charged', unclaimed());
      expect((await getSub())!.status).toBe('halted');
    });

    it.each(['cancelled', 'completed', 'expired'] as const)(
      'on a %s sub leaves the status unchanged',
      async (status) => {
        const userId = await seedUser();
        await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status });
        await handleWebhookEvent('subscription.charged', unclaimed());
        expect((await getSub())!.status).toBe(status);
      },
    );

    it('on a created sub becomes active', async () => {
      const userId = await seedUser();
      await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'created' });
      await handleWebhookEvent('subscription.charged', unclaimed());
      expect((await getSub())!.status).toBe('active');
    });
  });

  it('charged on a completed sub keeps completed and still grants Ink', async () => {
    const userId = await seedUser();
    await Subscription.create({ userId, razorpaySubscriptionId: SUB_ID, status: 'completed' });
    await handleWebhookEvent(
      'subscription.charged',
      chargePayload('solo_monthly', 1, START, NEXT_START),
    );
    const sub = await getSub();
    expect(sub!.status).toBe('completed');
    expect(sub!.paidThrough!.toISOString()).toBe(NEXT_START.toISOString());
    expect(sub!.lastGrantedPaidCount).toBe(1);
    expect((await ledger(userId)).filter((r) => r.reason === 'sub_renewal')).toHaveLength(1);
    expect((await getUser(userId)).inkSub).toBeGreaterThan(0);
  });
});

// ─── T-444c: one subscription per user, no double charge ─────────────────────
describe('T-444c: create lock and Razorpay cancel of a lapsed sub', () => {
  const cancelMock = () => razorpay.subscriptions.cancel as jest.Mock;
  const fetchMock = () => razorpay.subscriptions.fetch as jest.Mock;
  const createMock = () => razorpay.subscriptions.create as jest.Mock;
  const fetchMockForReuse = () =>
    fetchMock().mockResolvedValue({ id: 'sub_new', short_url: 'https://rzp.io/new' });
  const newUserId = () => new mongoose.Types.ObjectId().toString();
  const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
  const seedLapsed = (userId: string, status = 'halted', id = 'sub_lapsed') =>
    Subscription.create({
      userId,
      razorpaySubscriptionId: id,
      status,
      planId: 'solo_monthly',
      paidThrough: new Date(Date.now() - DAY_MS),
    });

  it('AC1: two parallel creates produce exactly one Razorpay create; the other gets in-progress', async () => {
    const userId = newUserId();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    createMock().mockImplementation(async () => {
      await gate;
      return { id: 'sub_new', short_url: 'https://rzp.io/new' };
    });

    const settled: string[] = [];
    const track = (p: Promise<unknown>) =>
      p.then(
        () => settled.push('ok'),
        (e: Error) => settled.push(e.name),
      );
    const p1 = createSubscription(userId, 'a@example.com');
    const p2 = createSubscription(userId, 'a@example.com');
    const all = Promise.all([track(p1), track(p2)]);

    // The loser fails while the winner is still inside the Razorpay call.
    for (let i = 0; i < 100 && settled.length === 0; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(settled).toEqual(['SubscriptionInProgressError']);
    release();
    await all;

    expect(settled.sort()).toEqual(['SubscriptionInProgressError', 'ok']);
    expect(createMock()).toHaveBeenCalledTimes(1);
    expect(await Subscription.countDocuments({ userId })).toBe(1);
  });

  it('a held lock gives SubscriptionInProgressError with no Razorpay call and no lock change', async () => {
    const userId = newUserId();
    await SubscriptionCreateLock.create({ userId });

    await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
      name: 'SubscriptionInProgressError',
    });

    expect(createMock()).not.toHaveBeenCalled();
    expect(cancelMock()).not.toHaveBeenCalled();
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(await lockCount(userId)).toBe(1); // the holder's lock is untouched
  });

  it('a lock for another user does not block', async () => {
    await SubscriptionCreateLock.create({ userId: newUserId() });
    mockNewSub();
    const r = await createSubscription(newUserId(), 'a@example.com');
    expect(r.subscriptionId).toBe('sub_new');
  });

  it('the lock is released after success', async () => {
    const userId = newUserId();
    mockNewSub();
    await createSubscription(userId, 'a@example.com');
    expect(await lockCount(userId)).toBe(0);
    // and a second sequential call is not blocked by it (it reuses the created sub)
    fetchMockForReuse();
    await expect(createSubscription(userId, 'a@example.com')).resolves.toMatchObject({
      subscriptionId: 'sub_new',
    });
    expect(await lockCount(userId)).toBe(0);
  });

  it('the lock is released when Razorpay create rejects', async () => {
    const userId = newUserId();
    createMock().mockRejectedValue(new Error('Razorpay down'));
    await expect(createSubscription(userId, 'a@example.com')).rejects.toThrow('Razorpay down');
    expect(await lockCount(userId)).toBe(0);
  });

  it('the lock is released on a SubscriptionExistsError', async () => {
    const userId = newUserId();
    await Subscription.create({
      userId,
      razorpaySubscriptionId: 'sub_live',
      status: 'active',
      paidThrough: new Date(Date.now() + DAY_MS),
    });
    await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
    });
    expect(await lockCount(userId)).toBe(0);
  });

  it.each(['halted', 'paused', 'pending'])(
    'AC2: lapsed %s: cancelled at Razorpay with (oldId, false), old expired, new created',
    async (status) => {
      const userId = newUserId();
      await seedLapsed(userId, status);
      mockNewSub();

      const r = await createSubscription(userId, 'a@example.com', 'solo_yearly');

      expect(cancelMock()).toHaveBeenCalledTimes(1);
      expect(cancelMock()).toHaveBeenCalledWith('sub_lapsed', false);
      expect(r.subscriptionId).toBe('sub_new');
      expect((await getSub('sub_lapsed'))!.status).toBe('expired');
      expect((await getSub('sub_new'))!.status).toBe('created');
      expect(await lockCount(userId)).toBe(0);
    },
  );

  it('AC2: the cancel happens before the local expire and before the new create', async () => {
    const userId = newUserId();
    await seedLapsed(userId);
    const order: string[] = [];
    cancelMock().mockImplementation(async () => {
      order.push(`cancel:${(await getSub('sub_lapsed'))!.status}`);
    });
    createMock().mockImplementation(async () => {
      order.push(`create:${(await getSub('sub_lapsed'))!.status}`);
      return { id: 'sub_new', short_url: 'https://rzp.io/new' };
    });
    await createSubscription(userId, 'a@example.com');
    expect(order).toEqual(['cancel:halted', 'create:expired']);
  });

  it.each([
    ['fetch rejects', () => fetchMock().mockRejectedValue(new Error('rzp down'))],
    [
      'fetch says halted',
      () => fetchMock().mockResolvedValue({ id: 'sub_lapsed', status: 'halted' }),
    ],
    [
      'fetch says active',
      () => fetchMock().mockResolvedValue({ id: 'sub_lapsed', status: 'active' }),
    ],
    ['fetch returns no status', () => fetchMock().mockResolvedValue({ id: 'sub_lapsed' })],
  ])(
    'AC3: cancel rejects and %s: fails closed, nothing changed, lock released',
    async (_n, arrange) => {
      const userId = newUserId();
      await seedLapsed(userId, 'halted');
      cancelMock().mockRejectedValue(new Error('rzp 500'));
      arrange();

      await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
        name: 'SubscriptionCancelFailedError',
      });

      expect(createMock()).not.toHaveBeenCalled();
      const old = await getSub('sub_lapsed');
      expect(old!.status).toBe('halted');
      expect(await Subscription.countDocuments({ userId })).toBe(1);
      expect(await lockCount(userId)).toBe(0);
    },
  );

  it.each(['cancelled', 'completed', 'expired'])(
    'cancel rejects but Razorpay says %s: counts as success and proceeds',
    async (rzpStatus) => {
      const userId = newUserId();
      await seedLapsed(userId, 'paused');
      cancelMock().mockRejectedValue(new Error('already cancelled'));
      fetchMock().mockResolvedValue({ id: 'sub_lapsed', status: rzpStatus });
      mockNewSub();

      const r = await createSubscription(userId, 'a@example.com');

      expect(fetchMock()).toHaveBeenCalledWith('sub_lapsed');
      expect(r.subscriptionId).toBe('sub_new');
      expect((await getSub('sub_lapsed'))!.status).toBe('expired');
      expect(createMock()).toHaveBeenCalledTimes(1);
      expect(await lockCount(userId)).toBe(0);
    },
  );

  it.each(['halted', 'paused', 'pending'])(
    'a still-paid %s sub is never cancelled at Razorpay (409, status unchanged)',
    async (status) => {
      const userId = newUserId();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_paid',
        status,
        paidThrough: new Date(Date.now() + DAY_MS),
      });
      await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
        name: 'SubscriptionExistsError',
      });
      expect(cancelMock()).not.toHaveBeenCalled();
      // T-516: a still-paid halted/paused/pending sub is past_due, so the 409
      // fetches its link (a read); nothing is cancelled or created.
      expect(createMock()).not.toHaveBeenCalled();
      expect((await getSub('sub_paid'))!.status).toBe(status);
    },
  );

  it('an active sub with a past paidThrough is never cancelled at Razorpay', async () => {
    const userId = newUserId();
    await seedLapsed(userId, 'active', 'sub_act');
    await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
    });
    expect(cancelMock()).not.toHaveBeenCalled();
  });

  it('Arjun: sub turns active during the cancel: 409, id-only error log, Sentry warning, no expire, no create', async () => {
    const userId = newUserId();
    await seedLapsed(userId, 'halted');
    cancelMock().mockImplementation(async () => {
      await Subscription.updateOne({ razorpaySubscriptionId: 'sub_lapsed' }, { status: 'active' });
    });
    const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(createSubscription(userId, 'a@example.com')).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
      status: 'active',
    });

    const call = errSpy.mock.calls.find((c) => c[1] === 'billing.resubscribe.cancelled_paid_sub');
    errSpy.mockRestore();
    expect(call).toBeDefined();
    expect(call![0]).toEqual({ subscriptionId: 'sub_lapsed' });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.resubscribe.cancelled_paid_sub',
      'warning',
    );
    expect(createMock()).not.toHaveBeenCalled();
    expect((await getSub('sub_lapsed'))!.status).toBe('active');
    expect(await Subscription.countDocuments({ userId })).toBe(1);
    expect(await lockCount(userId)).toBe(0);
  });

  describe('15 s Razorpay timeout', () => {
    // Only the 15 s timer is captured (the Mongo driver's own timers pass through), then fired by hand.
    let fire15s: () => void;
    let setTimeoutSpy: jest.SpyInstance;
    beforeEach(() => {
      fire15s = () => undefined;
      const real = global.setTimeout;
      setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
        fn: () => void,
        ms?: number,
        ...rest: unknown[]
      ) => {
        if (ms === 15_000) {
          fire15s = fn;
          return real(() => undefined, 0);
        }
        return real(fn, ms, ...rest);
      }) as unknown as typeof setTimeout);
    });
    afterEach(() => setTimeoutSpy.mockRestore());
    const waitFor15s = async () => {
      for (let i = 0; i < 200 && setTimeoutSpy.mock.calls.every((c) => c[1] !== 15_000); i++) {
        await new Promise((r) => setImmediate(r));
      }
    };

    it('a cancel that never resolves gives 503 (cancel-failed), status unchanged, lock released', async () => {
      const userId = newUserId();
      await seedLapsed(userId, 'halted');
      cancelMock().mockReturnValue(new Promise(() => undefined));
      fetchMock().mockRejectedValue(new Error('rzp down'));

      const p = createSubscription(userId, 'a@example.com');
      const settled = p.then(
        () => 'ok',
        (e: Error) => e.name,
      );
      await waitFor15s();
      fire15s();

      expect(await settled).toBe('SubscriptionCancelFailedError');
      expect(fetchMock()).toHaveBeenCalledWith('sub_lapsed');
      expect(createMock()).not.toHaveBeenCalled();
      expect((await getSub('sub_lapsed'))!.status).toBe('halted');
      expect(await lockCount(userId)).toBe(0);
    });

    it('a create that never resolves throws, leaves no local row, releases the lock', async () => {
      const userId = newUserId();
      createMock().mockReturnValue(new Promise(() => undefined));

      const settled = createSubscription(userId, 'a@example.com').then(
        () => 'ok',
        (e: Error) => e.name,
      );
      await waitFor15s();
      fire15s();

      expect(await settled).toBe('RazorpayTimeoutError');
      expect(await Subscription.countDocuments({ userId })).toBe(0);
      expect(await lockCount(userId)).toBe(0);
    });
  });

  it.each(['cancelled', 'completed', 'expired'])(
    'a terminal %s sub is not cancelled again at Razorpay',
    async (status) => {
      const userId = newUserId();
      await Subscription.create({ userId, razorpaySubscriptionId: 'sub_old', status });
      mockNewSub();
      await createSubscription(userId, 'a@example.com');
      expect(cancelMock()).not.toHaveBeenCalled();
    },
  );
});
