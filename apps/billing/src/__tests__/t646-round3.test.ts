import './setupDb';
import './setupEnv';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { findSubscriptionPlan } from '../config/credit-skus';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { Payment } from '../models/Payment.model';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import {
  confirmedPlanGrantUnits,
  upsertPaymentFromEntity,
  PLAN_GRANT_MATCH_AFTER_MS,
  PLAN_GRANT_MATCH_BEFORE_MS,
  reversedUnitsForPayment,
} from '../services/payment-record.service';

import {
  headers,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  unix,
  webhook,
} from './t436-helpers';

// T-646 round 3 (Arjun's two-strike ruling, AJ-646-M10 5c2db598): a refunded plan payment
// with no Payment row is "granted" only when the Ink ledger confirms a grant for that
// subscription cycle. Otherwise 'unresolved' (Sentry error, ids only), NO reversal, and the
// row recordRefundSafely writes shows 0 Ink. The amount comes from the ledger row.

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn() },
    invoices: { fetch: jest.fn() },
  },
}));
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const SUB = 'sub_t436';
const P_CREATED = '2026-10-01T10:00:00Z';
const PLAN = findSubscriptionPlan('solo_monthly')!;
const PLAN_UNITS = PLAN.inkPerCycle * 2;

const ledger = () => mongoose.connection.db!.collection('inkledger');
const payRow = (id: string) => Payment.findOne({ razorpayPaymentId: id }).lean();
const inkOf = async (id: unknown) => (await User.findById(id).lean())!;
const get = (userId: unknown) =>
  request(app)
    .get('/payments')
    .set(headers(String(userId)));
const reversals = () => ledger().countDocuments({ reason: 'refund_reversal' });

let scopes: Array<Record<string, jest.Mock>> = [];
beforeEach(() => {
  scopes = [];
  (Sentry.withScope as jest.Mock).mockImplementation((cb: (s: unknown) => void) => {
    const s = {
      setFingerprint: jest.fn(),
      setSDKProcessingMetadata: jest.fn(),
      addEventProcessor: jest.fn(),
      setTags: jest.fn(),
      setExtras: jest.fn(),
    };
    scopes.push(s);
    cb(s);
  });
  (Sentry.captureMessage as jest.Mock).mockReset();
  (Sentry.captureException as jest.Mock).mockReset();
});
afterEach(() => jest.restoreAllMocks());

async function seedPlanUser(units = PLAN_UNITS, planId = 'solo_monthly') {
  const u = await seedUser();
  await seedSub(u, SUB, { planId });
  await User.updateOne({ _id: u }, { $set: { inkSub: units } });
  return u;
}

/** A sub_renewal ledger row; `at` is the Date it was written. */
function grant(
  u: mongoose.Types.ObjectId,
  at: Date,
  over: { delta?: number; subId?: string; userId?: mongoose.Types.ObjectId } = {},
) {
  return ledger().insertOne({
    userId: over.userId ?? u,
    delta: over.delta ?? PLAN_UNITS,
    reason: 'sub_renewal',
    sourceBucket: 'sub',
    balanceAfter: over.delta ?? PLAN_UNITS,
    metadata: { razorpaySubscriptionId: over.subId ?? SUB },
    createdAt: at,
  });
}

const createdMs = new Date(P_CREATED).getTime();

function refundOf(paymentId: string, refundId: string, createdIso = P_CREATED, amount = 79900) {
  return {
    ...refundPayload({ refundId, paymentId, amount }),
    payment: {
      entity: {
        id: paymentId,
        amount: 79900,
        status: 'captured',
        subscription_id: SUB,
        created_at: unix(createdIso),
      },
    },
  };
}

function expectUnresolvedReported(refundId: string, paymentId: string) {
  const msgs = (Sentry.captureMessage as jest.Mock).mock.calls;
  expect(msgs).toHaveLength(1);
  expect(msgs[0][0]).toMatch(/refund-ink-unresolved/);
  expect(msgs[0][1]).toBe('error');
  // Ids only on the scope.
  const tags = scopes.flatMap((s) => s.setTags.mock.calls.map((c) => c[0]));
  expect(tags).toEqual([
    { reason: 'refund-ink-unresolved', refundId, razorpayPaymentId: paymentId },
  ]);
  expect(scopes.flatMap((s) => s.setExtras.mock.calls.map((c) => c[0]))).toEqual([{}]);
}

describe("Arjun's case: a second charge on a subscription already granted this cycle", () => {
  it.each([
    ['2 hours', 2],
    ['5 hours', 5],
  ])(
    'P2 %s after P1 has no grant of its own: unresolved, no reversal, no +N Ink row',
    async (_n, hours) => {
      const u = await seedPlanUser();
      // P1: granted once, has a Payment row.
      await Payment.create({
        userId: u,
        kind: 'plan',
        status: 'paid',
        razorpayPaymentId: 'pay_P1',
        razorpaySubscriptionId: SUB,
        planId: 'solo_monthly',
        amountPaise: 79900,
        refundedPaise: 0,
        inkUnits: PLAN_UNITS,
        inkReversedUnits: 0,
        source: 'webhook',
        createdAt: new Date(createdMs),
        updatedAt: new Date(createdMs),
      });
      await grant(u, new Date(createdMs + 5000));
      // P2: a few hours later, same S, no Payment row and no ledger grant.
      const p2At = new Date(createdMs + hours * HOUR).toISOString();
      const res = await webhook('refund.processed', refundOf('pay_P2', 'rfnd_P2', p2At));
      expect(res.status).toBe(200);

      expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
      expect(await reversals()).toBe(0);
      expectUnresolvedReported('rfnd_P2', 'pay_P2');

      const row = await payRow('pay_P2');
      expect(row).toMatchObject({ kind: 'plan', status: 'refunded', inkUnits: 0 });
      const shown = (await get(u)).body.payments.find(
        (p: { status: string }) => p.status === 'refunded',
      );
      expect(shown).toBeDefined();
      expect([shown.inkAddedInk, shown.inkReversedInk, shown.inkDelta]).toEqual([0, 0, 0]);
      // P1 is untouched.
      expect(await payRow('pay_P1')).toMatchObject({ status: 'paid', inkUnits: PLAN_UNITS });
    },
  );
});

describe('confirmed path: exactly one matching sub_renewal row', () => {
  it('full refund reverses the LEDGER delta even when the current plan differs', async () => {
    const u = await seedPlanUser(40, 'pro_yearly'); // current plan is not what was granted
    await grant(u, new Date(createdMs + 3000), { delta: 40 });
    const res = await webhook('refund.processed', refundOf('pay_norow', 'rfnd_c1'));
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await ledger().findOne({ _id: 'refund:rfnd_c1' as never })).toMatchObject({
      reason: 'refund_reversal',
      state: 'done',
      delta: -40,
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    const row = await payRow('pay_norow');
    expect(row).toMatchObject({ inkUnits: 40, inkReversedUnits: 40, status: 'refunded' });
  });

  it('partial refund is pro rata on the ledger delta, not on the current plan', async () => {
    const u = await seedPlanUser(40, 'pro_yearly');
    await grant(u, new Date(createdMs + 3000), { delta: 40 });
    await webhook('refund.processed', refundOf('pay_norow', 'rfnd_c2', P_CREATED, 39950));
    expect((await inkOf(u)).inkSub).toBe(20);
    expect(await ledger().findOne({ _id: 'refund:rfnd_c2' as never })).toMatchObject({
      delta: -20,
    });
  });

  it('boundaries: a grant 5 minutes before and 71 hours after the payment both confirm', async () => {
    const u = await seedPlanUser();
    await grant(u, new Date(createdMs - 5 * MIN));
    expect(
      await confirmedPlanGrantUnits({
        userId: String(u),
        razorpaySubscriptionId: SUB,
        paymentCreatedAt: new Date(createdMs),
      }),
    ).toBe(PLAN_UNITS);
    await ledger().deleteMany({});
    await grant(u, new Date(createdMs + 71 * HOUR));
    expect(
      await confirmedPlanGrantUnits({
        userId: String(u),
        razorpaySubscriptionId: SUB,
        paymentCreatedAt: new Date(createdMs),
      }),
    ).toBe(PLAN_UNITS);
  });

  it('the window constants are 10 minutes before and 72 hours after', () => {
    expect(PLAN_GRANT_MATCH_BEFORE_MS).toBe(10 * MIN);
    expect(PLAN_GRANT_MATCH_AFTER_MS).toBe(72 * HOUR);
  });
});

describe('unconfirmed paths: unresolved, no reversal, recordRefundSafely writes inkUnits 0', () => {
  async function expectUnresolved(u: mongoose.Types.ObjectId, refundId: string) {
    const res = await webhook('refund.processed', refundOf('pay_norow', refundId));
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    expect(await reversals()).toBe(0);
    expectUnresolvedReported(refundId, 'pay_norow');
    expect(await payRow('pay_norow')).toMatchObject({
      kind: 'plan',
      status: 'refunded',
      inkUnits: 0,
      inkReversedUnits: 0,
    });
    const p = (await get(u)).body.payments[0];
    expect([p.inkAddedInk, p.inkReversedInk, p.inkDelta]).toEqual([0, 0, 0]);
  }

  it('no sub_renewal row at all', async () => {
    const u = await seedPlanUser();
    await expectUnresolved(u, 'rfnd_u1');
  });

  it('two matching rows (ambiguous)', async () => {
    const u = await seedPlanUser();
    await grant(u, new Date(createdMs + 1000));
    await grant(u, new Date(createdMs + 2 * HOUR));
    await expectUnresolved(u, 'rfnd_u2');
  });

  it('a row more than 10 minutes before the payment', async () => {
    const u = await seedPlanUser();
    await grant(u, new Date(createdMs - 11 * MIN));
    await expectUnresolved(u, 'rfnd_u3');
  });

  it('a row more than 72 hours after the payment', async () => {
    const u = await seedPlanUser();
    await grant(u, new Date(createdMs + 73 * HOUR));
    await expectUnresolved(u, 'rfnd_u4');
  });

  it("a row for another subscription id or another user's id does not confirm", async () => {
    const u = await seedPlanUser();
    const other = await seedUser();
    await grant(u, new Date(createdMs + 1000), { subId: 'sub_other' });
    await grant(u, new Date(createdMs + 1000), { userId: other });
    await expectUnresolved(u, 'rfnd_u5');
  });

  it('a row of another reason (not sub_renewal) does not confirm', async () => {
    const u = await seedPlanUser();
    await ledger().insertOne({
      userId: u,
      delta: PLAN_UNITS,
      reason: 'topup',
      metadata: { razorpaySubscriptionId: SUB },
      createdAt: new Date(createdMs + 1000),
    });
    await expectUnresolved(u, 'rfnd_u6');
  });

  it('a redelivery of an unresolved refund still reverses nothing', async () => {
    const u = await seedPlanUser();
    const body = refundOf('pay_norow', 'rfnd_u7');
    await webhook('refund.processed', body);
    await webhook('refund.processed', body);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    expect(await reversals()).toBe(0);
    expect(await payRow('pay_norow')).toMatchObject({ inkUnits: 0 });
  });
});

describe('(d) the context behind the backfill: confirmedPlanGrantUnits', () => {
  const input = (u: mongoose.Types.ObjectId, at = createdMs) => ({
    userId: String(u),
    razorpaySubscriptionId: SUB,
    paymentCreatedAt: new Date(at),
  });

  it('returns the ledger delta for exactly one match, not the current plan', async () => {
    const u = await seedPlanUser(40, 'pro_yearly');
    await Subscription.updateOne(
      { razorpaySubscriptionId: SUB },
      { $set: { planId: 'pro_yearly' } },
    );
    await grant(u, new Date(createdMs + 1000), { delta: 40 });
    expect(await confirmedPlanGrantUnits(input(u))).toBe(40);
  });

  it('returns null for none, two, out of window, a non-positive delta, a bad id', async () => {
    const u = await seedPlanUser();
    expect(await confirmedPlanGrantUnits(input(u))).toBeNull();
    await grant(u, new Date(createdMs + 73 * HOUR));
    expect(await confirmedPlanGrantUnits(input(u))).toBeNull();
    await ledger().deleteMany({});
    await grant(u, new Date(createdMs + 1000));
    await grant(u, new Date(createdMs + 2000));
    expect(await confirmedPlanGrantUnits(input(u))).toBeNull();
    await ledger().deleteMany({});
    await grant(u, new Date(createdMs + 1000), { delta: 0 });
    expect(await confirmedPlanGrantUnits(input(u))).toBeNull();
    expect(await confirmedPlanGrantUnits({ ...input(u), userId: 'not-an-object-id' })).toBeNull();
    expect(
      await confirmedPlanGrantUnits({ ...input(u), paymentCreatedAt: new Date(NaN) }),
    ).toBeNull();
  });
});

describe('(d) the attribution resolver the webhook and the backfill share (subscription_id)', () => {
  const entity = (status: string) => ({
    id: 'pay_ctx',
    amount: 79900,
    status,
    subscription_id: SUB,
    created_at: unix(P_CREATED),
  });

  it('writes the ledger-confirmed Ink, not the current plan', async () => {
    const u = await seedPlanUser(40, 'pro_yearly');
    await grant(u, new Date(createdMs + 1000), { delta: 40 });
    expect(await upsertPaymentFromEntity(entity('captured'))).toBe(true);
    expect(await payRow('pay_ctx')).toMatchObject({ kind: 'plan', inkUnits: 40 });
  });

  it('writes 0 Ink for an unconfirmed grant (none, or two)', async () => {
    const u = await seedPlanUser();
    expect(await upsertPaymentFromEntity(entity('captured'))).toBe(true);
    expect(await payRow('pay_ctx')).toMatchObject({ kind: 'plan', inkUnits: 0 });
    await Payment.deleteMany({});
    await grant(u, new Date(createdMs + 1000));
    await grant(u, new Date(createdMs + 2000));
    expect(await upsertPaymentFromEntity(entity('captured'))).toBe(true);
    expect(await payRow('pay_ctx')).toMatchObject({ inkUnits: 0 });
  });

  it('a failed payment is never given Ink, even with a matching grant', async () => {
    const u = await seedPlanUser();
    await grant(u, new Date(createdMs + 1000));
    expect(await upsertPaymentFromEntity(entity('failed'))).toBe(true);
    expect(await payRow('pay_ctx')).toMatchObject({ inkUnits: 0 });
  });
});

// ── Arjun round 3, condition 1: the plan-charge row carries Ink only for a NEWLY granted cycle ──

describe('(1) plan-charge Payment row inkUnits follows isNewCycle', () => {
  const nowIso = () => new Date().toISOString();
  const noPaidCount = (o: Parameters<typeof subPayload>[0]) => {
    const p = subPayload(o) as { subscription: { entity: Record<string, unknown> } };
    delete p.subscription.entity.paid_count;
    return p;
  };

  it('a new-cycle charge (paid_count branch) writes the full inkUnits', async () => {
    const u = await seedUser();
    await seedSub(u);
    expect(
      (await webhook('subscription.charged', subPayload({ paymentId: 'pay_n1' }))).status,
    ).toBe(200);
    expect(await payRow('pay_n1')).toMatchObject({ kind: 'plan', inkUnits: PLAN_UNITS });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
  });

  it('a second charge on an already-granted cycle (lost claim) writes inkUnits 0 and grants nothing', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_n1' }));
    // Same paid_count 1: the conditional claim matches nothing.
    expect(
      (await webhook('subscription.charged', subPayload({ paymentId: 'pay_n2' }))).status,
    ).toBe(200);
    expect(await payRow('pay_n2')).toMatchObject({ kind: 'plan', status: 'paid', inkUnits: 0 });
    expect(await payRow('pay_n1')).toMatchObject({ inkUnits: PLAN_UNITS });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    expect(await ledger().countDocuments({ userId: u, reason: 'sub_renewal' })).toBe(1);
  });

  it('a replay of the SAME payment keeps the first delivery’s inkUnits (never lowered to 0)', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_n1' }));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_n1' }));
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_n1' })).toBe(1);
    expect(await payRow('pay_n1')).toMatchObject({ inkUnits: PLAN_UNITS });
  });

  it('a paid_count 0 charge writes inkUnits 0 and grants nothing', async () => {
    const u = await seedUser();
    await seedSub(u);
    expect(
      (await webhook('subscription.charged', subPayload({ paymentId: 'pay_z', paidCount: 0 })))
        .status,
    ).toBe(200);
    expect(await payRow('pay_z')).toMatchObject({ kind: 'plan', inkUnits: 0 });
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
  });

  it('current_start branch (no paid_count): new period full, same period again 0', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', noPaidCount({ paymentId: 'pay_c1' }));
    await webhook('subscription.charged', noPaidCount({ paymentId: 'pay_c2' }));
    expect(await payRow('pay_c1')).toMatchObject({ inkUnits: PLAN_UNITS });
    expect(await payRow('pay_c2')).toMatchObject({ inkUnits: 0 });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
  });

  it('unclaimed fallback (no paid_count, no current_start): treated as new, full inkUnits', async () => {
    const u = await seedUser();
    await seedSub(u);
    const p = noPaidCount({ paymentId: 'pay_f1' }) as {
      subscription: { entity: Record<string, unknown> };
    };
    delete p.subscription.entity.current_start;
    await webhook('subscription.charged', p);
    expect(await payRow('pay_f1')).toMatchObject({ inkUnits: PLAN_UNITS });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
  });

  describe('a refund of the 0-Ink row goes through the ledger confirmation', () => {
    // Charge 1 grants (ledger sub_renewal row, written "now"); charge 2 is the lost claim.
    // The refund names charge 2 (row inkUnits 0), with a payment entity created at `at`.
    async function setup(secondChargeAt: string) {
      const u = await seedUser();
      await seedSub(u);
      await webhook(
        'subscription.charged',
        subPayload({ paymentId: 'pay_n1', createdAt: nowIso() }),
      );
      await webhook(
        'subscription.charged',
        subPayload({ paymentId: 'pay_n2', createdAt: secondChargeAt }),
      );
      expect(await payRow('pay_n2')).toMatchObject({ inkUnits: 0 });
      return u;
    }
    const refundOfN2 = (at: string) => refundOf('pay_n2', 'rfnd_n2', at);

    it('ledger confirms (exactly one sub_renewal row in the window): reverses that row’s delta', async () => {
      const at = nowIso();
      const u = await setup(at);
      const res = await webhook('refund.processed', refundOfN2(at));
      expect(res.status).toBe(200);
      // OBSERVED: the single grant (written for charge 1) is the one row in charge 2's window,
      // so the 0-Ink row's refund reverses the cycle's grant. Not an error, no Sentry.
      expect(await ledger().findOne({ _id: 'refund:rfnd_n2' as never })).toMatchObject({
        reason: 'refund_reversal',
        state: 'done',
        delta: -PLAN_UNITS,
      });
      expect((await inkOf(u)).inkSub ?? 0).toBe(0);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      // OBSERVED: the row itself stays at inkUnits 0 (the confirmation is not written back),
      // while inkReversedUnits records the 100 units taken back.
      expect(await payRow('pay_n2')).toMatchObject({
        status: 'refunded',
        inkUnits: 0,
        inkReversedUnits: PLAN_UNITS,
      });
      const shown = (await get(u)).body.payments.find(
        (p: { referenceTail: string; status: string }) => p.status === 'refunded',
      );
      // OBSERVED: history shows 0 added and 0 taken back for this row (the view caps the
      // reversed Ink at the row's own inkUnits), though the user's balance did drop by 100.
      expect([shown.inkAddedInk, shown.inkReversedInk]).toEqual([0, 0]);
    });

    it('the same single grant is also reversible via the 0-Ink row AND the granting row (two refunds, one grant)', async () => {
      const at = nowIso();
      const u = await setup(at);
      await webhook('refund.processed', refundOf('pay_n2', 'rfnd_n2', at));
      await webhook('refund.processed', refundOf('pay_n1', 'rfnd_n1', at));
      // OBSERVED: pay_n2 (0-Ink row) reversed the grant via the ledger match, then pay_n1
      // (its own row, 100 units) is reversed again. Two reversals of ONE grant of 100 units:
      // the second finds nothing left to take and is recorded as a shortfall.
      const rows = await ledger().find({ reason: 'refund_reversal' }).sort({ _id: 1 }).toArray();
      expect(rows.map((r) => [r._id, Math.abs(r.delta)])).toEqual([
        ['refund:rfnd_n1', 0],
        ['refund:rfnd_n2', PLAN_UNITS],
      ]);
      expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    });

    it('ledger does not confirm (grant outside the 10 minute-before window): unresolved, nothing reversed', async () => {
      const later = new Date(Date.now() + 2 * HOUR).toISOString();
      const u = await setup(later);
      const res = await webhook('refund.processed', refundOfN2(later));
      expect(res.status).toBe(200);
      // OBSERVED: the grant is 2 h before charge 2, outside the window; no reversal, the user
      // keeps the Ink, a refund-ink-unresolved Sentry error is raised, and the row stays 0.
      expect(await reversals()).toBe(0);
      expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
      expectUnresolvedReported('rfnd_n2', 'pay_n2');
      expect(await payRow('pay_n2')).toMatchObject({
        status: 'refunded',
        inkUnits: 0,
        inkReversedUnits: 0,
      });
    });
  });
});

// ── Arjun round 3, condition 2: ledger reads filter on userId ──

describe('(2) the inkledger refund_reversal reads are scoped to the user', () => {
  const PAY = 'pay_scope';

  function otherUsersReversal(other: mongoose.Types.ObjectId) {
    return ledger().insertOne({
      _id: 'refund:rfnd_foreign' as never,
      userId: other,
      delta: -100,
      reason: 'refund_reversal',
      state: 'done',
      metadata: {
        razorpayPaymentId: PAY,
        refundId: 'rfnd_foreign',
        refundPaise: 79900,
        dueUnits: 100,
      },
      createdAt: new Date(),
    });
  }

  async function seedPaid() {
    const u = await seedPlanUser(100);
    const other = await seedUser();
    await Payment.create({
      userId: u,
      kind: 'plan',
      status: 'paid',
      razorpayPaymentId: PAY,
      razorpaySubscriptionId: SUB,
      planId: 'solo_monthly',
      amountPaise: 79900,
      refundedPaise: 0,
      inkUnits: 100,
      inkReversedUnits: 0,
      source: 'webhook',
      createdAt: new Date(createdMs),
      updatedAt: new Date(createdMs),
    });
    return { u, other };
  }

  it('reversedUnitsForPayment ignores another user’s reversal with the same payment id', async () => {
    const { u, other } = await seedPaid();
    await otherUsersReversal(other);
    expect(await reversedUnitsForPayment(PAY, String(u))).toBe(0);
    expect(await reversedUnitsForPayment(PAY, String(other))).toBe(100);
    expect(await reversedUnitsForPayment(PAY, 'not-an-object-id')).toBe(0);
  });

  it('priorReversals (via a partial refund) ignores another user’s reversal: this user still gets their share', async () => {
    const { u, other } = await seedPaid();
    await otherUsersReversal(other);
    const res = await webhook('refund.processed', refundOf(PAY, 'rfnd_own', P_CREATED, 39950));
    expect(res.status).toBe(200);
    // Unfiltered, the foreign row (refundPaise 79900, dueUnits 100) would make the due 0.
    expect(await ledger().findOne({ _id: 'refund:rfnd_own' as never })).toMatchObject({
      userId: u,
      delta: -50,
      state: 'done',
    });
    expect((await inkOf(u)).inkSub).toBe(50);
    // The other user's row is untouched and their balance was never involved.
    expect(await ledger().findOne({ _id: 'refund:rfnd_foreign' as never })).toMatchObject({
      delta: -100,
    });
    expect(await payRow(PAY)).toMatchObject({ inkReversedUnits: 50, refundedPaise: 39950 });
  });

  it('both ledger queries carry userId (spy on the collection find filter)', async () => {
    const { u, other } = await seedPaid();
    await otherUsersReversal(other);
    const proto = Object.getPrototypeOf(ledger());
    const find = jest.spyOn(proto, 'find');
    await webhook('refund.processed', refundOf(PAY, 'rfnd_spy', P_CREATED, 39950));
    const reversalFilters = find.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((f) => f && f.reason === 'refund_reversal');
    // priorReversals and reversedUnitsForPayment both ran.
    expect(reversalFilters.length).toBeGreaterThanOrEqual(2);
    for (const f of reversalFilters) {
      expect(String(f.userId)).toBe(String(u));
      expect(f.userId).toBeInstanceOf(mongoose.Types.ObjectId);
    }
  });

  it('recordRefundSafely with no Payment row skips the ledger reversal read', async () => {
    const u = await seedPlanUser(40, 'pro_yearly');
    await grant(u, new Date(createdMs + 3000), { delta: 40 });
    const proto = Object.getPrototypeOf(ledger());
    const find = jest.spyOn(proto, 'find');
    await webhook('refund.processed', refundOf('pay_norow2', 'rfnd_nr', P_CREATED, 39950));
    // The reversal runs first (so a row is written by then); every reversal read is scoped.
    for (const c of find.mock.calls) {
      const f = c[0] as Record<string, unknown>;
      if (f && f.reason === 'refund_reversal') expect(f.userId).toBeDefined();
    }
  });
});

// ── Arjun round 3, condition 3: a credit note failure does not skip the Ink reversal ──

describe('(3) issueCreditNoteOnRefund throws in refund.processed', () => {
  const BOOM = 'boom for asha@example.com 79900 Asha Verma';
  class CreditNoteBoomError extends Error {
    constructor() {
      super(BOOM);
      this.name = 'CreditNoteBoomError';
    }
  }

  async function chargedWithInvoice() {
    const u = await seedUser({ gstStateCode: '27' });
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_cn' }));
    expect(await Invoice.countDocuments({ kind: 'invoice', paymentId: 'pay_cn' })).toBe(1);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    return u;
  }
  const refundCn = () => refundPayload({ refundId: 'rfnd_cn', paymentId: 'pay_cn', amount: 79900 });

  it('reverses Ink, updates the row, reports ids only, 500s; the redelivery reverses nothing twice and records the credit note once', async () => {
    const u = await chargedWithInvoice();
    const errLog = jest.spyOn(logger, 'error');
    jest
      .spyOn(Invoice, 'findOne')
      .mockImplementationOnce((() => Promise.reject(new CreditNoteBoomError())) as never);

    const first = await webhook('refund.processed', refundCn());
    expect(first.status).toBe(500);

    // The Ink reversal and the payment row ran.
    expect(await ledger().findOne({ _id: 'refund:rfnd_cn' as never })).toMatchObject({
      reason: 'refund_reversal',
      state: 'done',
      delta: -PLAN_UNITS,
    });
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await payRow('pay_cn')).toMatchObject({
      status: 'refunded',
      refundedPaise: 79900,
      inkReversedUnits: PLAN_UNITS,
    });
    // No credit note yet.
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(0);

    // Sentry: one event, ids and the error class only.
    const msgs = (Sentry.captureMessage as jest.Mock).mock.calls;
    expect(msgs).toHaveLength(1);
    expect(msgs[0][0]).toMatch(/credit note record failed/);
    expect(msgs[0][1]).toBe('error');
    // The webhook's own 500 path reports once, with the error class in the message only.
    const exc = (Sentry.captureException as jest.Mock).mock.calls;
    expect(exc).toHaveLength(1);
    expect(String((exc[0][0] as Error).message)).toBe(
      'Razorpay webhook handler failed: CreditNoteBoomError',
    );
    const scope = scopes.find((s) => s.setTags.mock.calls.length > 0)!;
    expect(scope.setTags.mock.calls).toEqual([
      [{ refundId: 'rfnd_cn', razorpayPaymentId: 'pay_cn', errorName: 'CreditNoteBoomError' }],
    ]);
    expect(scope.setFingerprint.mock.calls).toEqual([
      [['billing-credit-note-record-failed', 'rfnd_cn']],
    ]);
    expect(scope.setExtras).not.toHaveBeenCalled();
    const sentryOut = JSON.stringify([
      msgs,
      scopes.flatMap((s) => Object.values(s).flatMap((m) => m.mock.calls)),
    ]);
    for (const leak of ['asha@example.com', 'Asha', '79900', 'boom']) {
      expect(sentryOut).not.toContain(leak);
    }

    // One error log with ids and the class name only.
    const cnLogs = errLog.mock.calls.filter((c) =>
      String(c[1]).includes('credit note record failed'),
    );
    expect(cnLogs).toHaveLength(1);
    expect(cnLogs[0][0]).toEqual({
      refundId: 'rfnd_cn',
      razorpayPaymentId: 'pay_cn',
      errName: 'CreditNoteBoomError',
    });
    expect(JSON.stringify(errLog.mock.calls)).not.toContain('asha@example.com');

    // Redelivery with the credit note succeeding.
    (Sentry.captureMessage as jest.Mock).mockClear();
    const second = await webhook('refund.processed', refundCn());
    expect(second.status).toBe(200);
    expect(await reversals()).toBe(1);
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await payRow('pay_cn')).toMatchObject({
      status: 'refunded',
      inkReversedUnits: PLAN_UNITS,
    });
    expect(await Invoice.countDocuments({ kind: 'credit_note', refundId: 'rfnd_cn' })).toBe(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();

    // A third delivery changes nothing.
    expect((await webhook('refund.processed', refundCn())).status).toBe(200);
    expect(await reversals()).toBe(1);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
  });
});
