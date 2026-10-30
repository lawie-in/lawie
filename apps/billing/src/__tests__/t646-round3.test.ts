import './setupDb';
import './setupEnv';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { findSubscriptionPlan } from '../config/credit-skus';
import { Payment } from '../models/Payment.model';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import {
  confirmedPlanGrantUnits,
  upsertPaymentFromEntity,
  PLAN_GRANT_MATCH_AFTER_MS,
  PLAN_GRANT_MATCH_BEFORE_MS,
} from '../services/payment-record.service';

import { headers, refundPayload, seedSub, seedUser, unix, webhook } from './t436-helpers';

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
