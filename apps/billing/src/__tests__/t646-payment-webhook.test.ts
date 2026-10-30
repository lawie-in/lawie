import './setupDb';
import './setupEnv';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import { Payment } from '../models/Payment.model';
import { User } from '../models/User.model';
import {
  alertStuckProcessingPayments,
  recordTopupOrderSafely,
} from '../services/payment-record.service';
import { refundDueUnits } from '../services/refund-ink.service';

import {
  orderPaidPayload,
  paymentCapturedPayload,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  unix,
  webhook,
} from './t436-helpers';

// T-646 AC1/AC4 (Arjun 3; Vikram 1, 2, 5): the webhook records the payment AFTER the grant, moves
// the status forward only, reverses Ink on refund pro rata, and alerts once at 24h.
// Real handleWebhookEvent through the route, in-memory Mongo.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;
const ledger = () => mongoose.connection.db!.collection('inkledger');
const payRow = (id: string) => Payment.findOne({ razorpayPaymentId: id }).lean();
const inkOf = async (id: unknown) => (await User.findById(id).lean())!;

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

/** A top-up payment entity event (payment.captured style: notes on the payment). */
function topupEvent(
  userId: unknown,
  o: {
    paymentId?: string;
    orderId?: string;
    status: string;
    amount?: number;
    notes?: boolean;
    refunded?: number;
  },
) {
  return {
    payment: {
      entity: {
        id: o.paymentId ?? 'pay_top1',
        order_id: o.orderId ?? 'order_top1',
        status: o.status,
        amount: o.amount ?? 19900,
        amount_refunded: o.refunded ?? 0,
        created_at: unix('2026-10-01T10:00:00Z'),
        ...(o.notes === false ? {} : { notes: { sku_id: 'topup_mid', user_id: String(userId) } }),
      },
    },
  };
}

describe('webhook -> Payment status', () => {
  it('payment.captured (top-up) -> paid, with user, kind, amount, ink units, time', async () => {
    const u = await seedUser();
    const res = await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_cap1' }),
    );
    expect(res.status).toBe(200);
    const row = await payRow('pay_cap1');
    expect(row).toMatchObject({
      kind: 'topup',
      status: 'paid',
      amountPaise: 19900,
      inkUnits: 20,
      inkReversedUnits: 0,
      refundedPaise: 0,
      topupSkuId: 'topup_mid',
      razorpayOrderId: 'order_t436',
    });
    expect(String(row!.userId)).toBe(String(u));
    expect(row!.createdAt.toISOString()).toBe('2026-03-01T00:00:10.000Z');
    expect((await inkOf(u)).inkTopup).toBe(20);
  });

  it('order.paid and payment.captured for the same payment -> one row', async () => {
    const u = await seedUser();
    await webhook('order.paid', orderPaidPayload({ userId: String(u), paymentId: 'pay_pair' }));
    await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_pair' }),
    );
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_pair' })).toBe(1);
    expect((await payRow('pay_pair'))!.status).toBe('paid');
    expect((await inkOf(u)).inkTopup).toBe(20);
  });

  it.each(['subscription.charged', 'subscription.activated'])(
    '%s -> paid plan payment',
    async (event) => {
      const u = await seedUser();
      await seedSub(u);
      const res = await webhook(event, subPayload({ paymentId: 'pay_plan1', amount: 79900 }));
      expect(res.status).toBe(200);
      const row = await payRow('pay_plan1');
      expect(row).toMatchObject({
        kind: 'plan',
        status: 'paid',
        amountPaise: 79900,
        razorpaySubscriptionId: 'sub_t436',
        planId: 'solo_monthly',
      });
      expect(String(row!.userId)).toBe(String(u));
      expect(row!.inkUnits).toBeGreaterThan(0);
    },
  );

  it('subscription.charged redelivered -> still one row', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_plan2' }));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_plan2' }));
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_plan2' })).toBe(1);
  });

  it('payment.failed on a plan (subscription path) -> failed', async () => {
    const u = await seedUser();
    await seedSub(u);
    const res = await webhook(
      'payment.failed',
      subPayload({ paymentId: 'pay_planfail', status: 'failed' }),
    );
    expect(res.status).toBe(200);
    expect(await payRow('pay_planfail')).toMatchObject({
      kind: 'plan',
      status: 'failed',
      inkUnits: 0,
    });
  });

  it('payment.failed on a top-up (early-return path, no subscription entity) -> failed, via notes', async () => {
    const u = await seedUser();
    const res = await webhook(
      'payment.failed',
      topupEvent(u, { paymentId: 'pay_tfail', status: 'failed' }),
    );
    expect(res.status).toBe(200);
    expect(await payRow('pay_tfail')).toMatchObject({
      kind: 'topup',
      status: 'failed',
      inkUnits: 0,
      amountPaise: 19900,
    });
    expect((await inkOf(u)).inkTopup ?? 0).toBe(0);
  });

  it('payment.failed on a top-up with no notes is attributed through the order row', async () => {
    const u = await seedUser();
    await recordTopupOrderSafely({
      userId: String(u),
      razorpayOrderId: 'order_known',
      amountPaise: 19900,
      topupSkuId: 'topup_mid',
      inkUnits: 20,
    });
    const res = await webhook(
      'payment.failed',
      topupEvent(u, {
        paymentId: 'pay_orderfail',
        orderId: 'order_known',
        status: 'failed',
        notes: false,
      }),
    );
    expect(res.status).toBe(200);
    const row = await payRow('pay_orderfail');
    expect(row).toMatchObject({ status: 'failed', kind: 'topup' });
    expect(String(row!.userId)).toBe(String(u));
    // The order row itself stays hidden and unchanged.
    expect(
      await Payment.countDocuments({ razorpayOrderId: 'order_known', status: 'created' }),
    ).toBe(1);
  });

  it('a payment nobody can be attributed to writes nothing and still 200s', async () => {
    const res = await webhook(
      'payment.failed',
      topupEvent(new mongoose.Types.ObjectId(), {
        paymentId: 'pay_ghost',
        status: 'failed',
        notes: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it('payment.authorized -> processing', async () => {
    const u = await seedUser();
    const res = await webhook(
      'payment.authorized',
      topupEvent(u, { paymentId: 'pay_auth', status: 'authorized' }),
    );
    expect(res.status).toBe(200);
    expect(await payRow('pay_auth')).toMatchObject({ status: 'processing', inkUnits: 0 });
  });

  describe('status only moves forward', () => {
    it('authorized -> failed -> captured -> authorized/failed again stays paid', async () => {
      const u = await seedUser();
      const id = 'pay_fwd';
      await webhook('payment.authorized', topupEvent(u, { paymentId: id, status: 'authorized' }));
      expect((await payRow(id))!.status).toBe('processing');
      await webhook('payment.failed', topupEvent(u, { paymentId: id, status: 'failed' }));
      expect((await payRow(id))!.status).toBe('failed');
      await webhook('payment.captured', topupEvent(u, { paymentId: id, status: 'captured' }));
      expect((await payRow(id))!.status).toBe('paid');
      await webhook('payment.authorized', topupEvent(u, { paymentId: id, status: 'authorized' }));
      expect((await payRow(id))!.status).toBe('paid');
      await webhook('payment.failed', topupEvent(u, { paymentId: id, status: 'failed' }));
      const row = await payRow(id);
      expect(row!.status).toBe('paid');
      expect(row!.inkUnits).toBe(20);
    });

    it('a late authorized after failed does not undo failed', async () => {
      const u = await seedUser();
      await webhook('payment.failed', topupEvent(u, { paymentId: 'pay_late', status: 'failed' }));
      await webhook(
        'payment.authorized',
        topupEvent(u, { paymentId: 'pay_late', status: 'authorized' }),
      );
      expect((await payRow('pay_late'))!.status).toBe('failed');
    });

    it('a refunded payment is not pulled back to paid by a redelivered capture', async () => {
      const u = await seedUser();
      await webhook(
        'payment.captured',
        paymentCapturedPayload({ userId: String(u), paymentId: 'pay_rf' }),
      );
      await webhook(
        'refund.processed',
        refundPayload({ refundId: 'rfnd_a', paymentId: 'pay_rf', amount: 19900 }),
      );
      expect((await payRow('pay_rf'))!.status).toBe('refunded');
      await webhook(
        'payment.captured',
        paymentCapturedPayload({ userId: String(u), paymentId: 'pay_rf' }),
      );
      expect((await payRow('pay_rf'))!.status).toBe('refunded');
    });
  });
});

describe('Payment write failing never changes the grant or the response (Arjun 3)', () => {
  it('top-up capture: the Ink is granted and the response is 200', async () => {
    const u = await seedUser();
    const spy = jest
      .spyOn(Payment.collection, 'updateOne')
      .mockRejectedValue(Object.assign(new Error('write exploded'), { name: 'MongoServerError' }));
    const res = await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_boom' }),
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    expect((await inkOf(u)).inkTopup).toBe(20);
    expect(await ledger().countDocuments({ userId: u, reason: 'topup_purchase' })).toBe(1);
    spy.mockRestore();
    expect(await Payment.countDocuments({})).toBe(0);
    // Razorpay's retry records it without granting again.
    expect(
      (
        await webhook(
          'payment.captured',
          paymentCapturedPayload({ userId: String(u), paymentId: 'pay_boom' }),
        )
      ).status,
    ).toBe(200);
    expect((await inkOf(u)).inkTopup).toBe(20);
    expect((await payRow('pay_boom'))!.status).toBe('paid');
  });

  it('subscription.charged: the plan Ink is granted and the response is 200', async () => {
    const u = await seedUser();
    await seedSub(u);
    jest.spyOn(Payment.collection, 'updateOne').mockRejectedValue(new Error('write exploded'));
    const res = await webhook('subscription.charged', subPayload({ paymentId: 'pay_boom2' }));
    expect(res.status).toBe(200);
    const after = await inkOf(u);
    expect(after.inkSub ?? 0).toBeGreaterThan(0);
  });

  it('payment.failed (top-up early return): 200 even when the write throws', async () => {
    const u = await seedUser();
    jest.spyOn(Payment.collection, 'updateOne').mockRejectedValue(new Error('write exploded'));
    const res = await webhook(
      'payment.failed',
      topupEvent(u, { paymentId: 'pay_boom3', status: 'failed' }),
    );
    expect(res.status).toBe(200);
  });

  it('the failure log carries the error class only', async () => {
    const logger = (await import('../config/logger')).default;
    const spy = jest.spyOn(logger, 'error').mockImplementation((() => logger) as never);
    const u = await seedUser();
    jest
      .spyOn(Payment.collection, 'updateOne')
      .mockRejectedValue(new Error('SECRET-DRIVER-MESSAGE'));
    await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_boom4' }),
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-DRIVER-MESSAGE');
    expect(JSON.stringify(spy.mock.calls)).toContain('errName');
  });
});

describe('refund.processed reverses Ink (Vikram 5)', () => {
  async function paidTopup(paymentId = 'pay_ref') {
    const u = await seedUser();
    await webhook('payment.captured', paymentCapturedPayload({ userId: String(u), paymentId }));
    return u;
  }

  it('full refund takes back everything the payment granted; row refunded; inkDelta 0', async () => {
    const u = await paidTopup();
    const res = await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_full', paymentId: 'pay_ref', amount: 19900 }),
    );
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkTopup).toBe(0);
    const row = await ledger().findOne({ _id: 'refund:rfnd_full' as never });
    expect(row).toMatchObject({ reason: 'refund_reversal', state: 'done', delta: -20 });
    expect(await payRow('pay_ref')).toMatchObject({
      status: 'refunded',
      refundedPaise: 19900,
      inkReversedUnits: 20,
    });
  });

  it('partial refund is pro rata, rounded down; row partly_refunded', async () => {
    const u = await paidTopup();
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_p1', paymentId: 'pay_ref', amount: 5000 }),
    );
    // floor(20 * 5000 / 19900) = 5
    expect((await inkOf(u)).inkTopup).toBe(15);
    expect(await payRow('pay_ref')).toMatchObject({
      status: 'partly_refunded',
      refundedPaise: 5000,
      inkReversedUnits: 5,
    });
  });

  it('several partial refunds add up to exactly the full grant', async () => {
    const u = await paidTopup();
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_s1', paymentId: 'pay_ref', amount: 9950 }),
    );
    expect((await inkOf(u)).inkTopup).toBe(10);
    // Razorpay's refund.processed carries the payment entity with its running amount_refunded.
    await webhook('refund.processed', {
      ...refundPayload({ refundId: 'rfnd_s2', paymentId: 'pay_ref', amount: 9950 }),
      ...topupEvent(u, { paymentId: 'pay_ref', status: 'captured', refunded: 19900 }),
    });
    expect((await inkOf(u)).inkTopup).toBe(0);
    expect(await payRow('pay_ref')).toMatchObject({
      status: 'refunded',
      refundedPaise: 19900,
      inkReversedUnits: 20,
    });
  });

  describe('refundedPaise accumulates across refunds (refund-only payloads)', () => {
    const refund = (id: string, amount: number, extra: Record<string, unknown> = {}) =>
      webhook('refund.processed', {
        ...refundPayload({ refundId: id, paymentId: 'pay_ref', amount }),
        ...extra,
      });

    it('two half refunds, refund-only payloads -> refunded / 19900', async () => {
      await paidTopup();
      await refund('rfnd_h1', 9950);
      expect(await payRow('pay_ref')).toMatchObject({
        status: 'partly_refunded',
        refundedPaise: 9950,
      });
      await refund('rfnd_h2', 9950);
      expect(await payRow('pay_ref')).toMatchObject({ status: 'refunded', refundedPaise: 19900 });
    });

    it('the same refund id redelivered is not double-counted', async () => {
      await paidTopup();
      await refund('rfnd_d1', 9950);
      await refund('rfnd_d1', 9950);
      await refund('rfnd_d1', 9950);
      expect(await payRow('pay_ref')).toMatchObject({
        status: 'partly_refunded',
        refundedPaise: 9950,
      });
    });

    it('mixed: refund-only, then one carrying the payment entity', async () => {
      const u = await paidTopup();
      await refund('rfnd_m1', 5000);
      expect(await payRow('pay_ref')).toMatchObject({
        status: 'partly_refunded',
        refundedPaise: 5000,
      });
      await refund(
        'rfnd_m2',
        4000,
        topupEvent(u, { paymentId: 'pay_ref', status: 'captured', refunded: 9000 }),
      );
      expect(await payRow('pay_ref')).toMatchObject({
        status: 'partly_refunded',
        refundedPaise: 9000,
      });
      // Never lowered by a later, smaller figure; capped at the amount.
      await refund('rfnd_m3', 99999);
      expect(await payRow('pay_ref')).toMatchObject({ status: 'refunded', refundedPaise: 19900 });
    });

    it("a different payment's entity amount_refunded is ignored", async () => {
      const u = await paidTopup();
      await refund(
        'rfnd_f1',
        5000,
        topupEvent(u, {
          paymentId: 'pay_other',
          orderId: 'order_other',
          status: 'captured',
          refunded: 19900,
        }),
      );
      expect(await payRow('pay_ref')).toMatchObject({
        status: 'partly_refunded',
        refundedPaise: 5000,
      });
      expect(await payRow('pay_other')).toBeNull();
    });
  });

  it('a refund over the amount never takes more than the grant', async () => {
    const u = await paidTopup();
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_over', paymentId: 'pay_ref', amount: 99999 }),
    );
    expect((await inkOf(u)).inkTopup).toBe(0);
    const row = await ledger().findOne({ _id: 'refund:rfnd_over' as never });
    expect(row!.delta).toBe(-20);
  });

  it('repeat delivery of the same refund id reverses once', async () => {
    const u = await paidTopup();
    const p = refundPayload({ refundId: 'rfnd_rep', paymentId: 'pay_ref', amount: 9950 });
    expect((await webhook('refund.processed', p)).status).toBe(200);
    expect((await webhook('refund.processed', p)).status).toBe(200);
    expect((await inkOf(u)).inkTopup).toBe(10);
    expect(await ledger().countDocuments({ reason: 'refund_reversal' })).toBe(1);
    expect((await payRow('pay_ref'))!.inkReversedUnits).toBe(10);
  });

  it('never below zero: already-spent Ink debits what is left, logs a shortfall to Sentry', async () => {
    const u = await paidTopup();
    await User.updateOne({ _id: u }, { $set: { inkTopup: 4 } });
    const res = await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_short', paymentId: 'pay_ref', amount: 19900 }),
    );
    expect(res.status).toBe(200);
    const after = await inkOf(u);
    expect(after.inkTopup).toBe(0);
    expect(after.inkSub ?? 0).toBeGreaterThanOrEqual(0);
    const row = await ledger().findOne({ _id: 'refund:rfnd_short' as never });
    expect(row).toMatchObject({ delta: -4, state: 'done' });
    expect((row!.metadata as Record<string, number>).shortfallUnits).toBe(16);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect((Sentry.captureMessage as jest.Mock).mock.calls[0][0]).toMatch(/refund-ink-shortfall/);
    const scope = scopes[0];
    expect(scope.setExtras).toHaveBeenCalledWith({
      dueUnits: 20,
      debitedUnits: 4,
      shortfallUnits: 16,
    });
    // ids and numbers only: no email or name anywhere on the scope
    expect(JSON.stringify(Object.values(scope).map((m) => m.mock.calls))).not.toMatch(
      /@example\.com|Asha/,
    );
  });

  it('no balance at all -> nothing debited, balance stays 0 (not negative)', async () => {
    const u = await paidTopup();
    await User.updateOne({ _id: u }, { $set: { inkTopup: 0 } });
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_zero', paymentId: 'pay_ref', amount: 19900 }),
    );
    expect((await inkOf(u)).inkTopup).toBe(0);
    expect((await ledger().findOne({ _id: 'refund:rfnd_zero' as never }))!.delta).toBe(-0);
  });

  it('a plan refund takes Ink back from the subscription bucket first', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_planref', amount: 79900 }));
    const granted = (await inkOf(u)).inkSub ?? 0;
    expect(granted).toBeGreaterThan(0);
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_plan', paymentId: 'pay_planref', amount: 79900 }),
    );
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect((await payRow('pay_planref'))!.status).toBe('refunded');
  });

  it('a refund for a payment with no known grant debits nothing, reports to Sentry, 200', async () => {
    const u = await seedUser();
    await User.updateOne({ _id: u }, { $set: { inkTopup: 10 } });
    const res = await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_unk', paymentId: 'pay_unknown', amount: 100 }),
    );
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkTopup).toBe(10);
    expect(await ledger().countDocuments({ reason: 'refund_reversal' })).toBe(0);
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('a fresh pending claim for the same refund -> 500 so Razorpay retries, no debit', async () => {
    const u = await paidTopup();
    await ledger().insertOne({
      _id: 'refund:rfnd_busy' as never,
      userId: u,
      delta: 0,
      reason: 'refund_reversal',
      state: 'pending',
      claimedAt: new Date(),
      claimToken: 'other',
      createdAt: new Date(),
    });
    const res = await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_busy', paymentId: 'pay_ref', amount: 19900 }),
    );
    expect(res.status).toBe(500);
    expect((await inkOf(u)).inkTopup).toBe(20);
  });
});

describe('refundDueUnits (pure)', () => {
  const base = { grantedUnits: 20, amountPaise: 19900, prevRefundPaise: 0, prevDueUnits: 0 };
  it('full refund -> the full grant', () => {
    expect(refundDueUnits({ ...base, refundPaise: 19900 })).toBe(20);
  });
  it('half -> half; rounds down', () => {
    expect(refundDueUnits({ ...base, refundPaise: 9950 })).toBe(10);
    expect(refundDueUnits({ ...base, refundPaise: 1 })).toBe(0);
    expect(refundDueUnits({ ...base, refundPaise: 5000 })).toBe(5);
  });
  it('cumulative parts sum to exactly the grant', () => {
    const g = 7;
    const a = 100;
    const r1 = refundDueUnits({
      grantedUnits: g,
      amountPaise: a,
      refundPaise: 33,
      prevRefundPaise: 0,
      prevDueUnits: 0,
    });
    const r2 = refundDueUnits({
      grantedUnits: g,
      amountPaise: a,
      refundPaise: 33,
      prevRefundPaise: 33,
      prevDueUnits: r1,
    });
    const r3 = refundDueUnits({
      grantedUnits: g,
      amountPaise: a,
      refundPaise: 34,
      prevRefundPaise: 66,
      prevDueUnits: r1 + r2,
    });
    expect([r1, r2, r3]).toEqual([2, 2, 3]);
    expect(r1 + r2 + r3).toBe(g);
  });
  it('caps at the amount and never goes negative', () => {
    expect(refundDueUnits({ ...base, refundPaise: 50000 })).toBe(20);
    expect(
      refundDueUnits({ ...base, refundPaise: 100, prevRefundPaise: 19900, prevDueUnits: 20 }),
    ).toBe(0);
    expect(refundDueUnits({ ...base, refundPaise: 100, prevDueUnits: 99 })).toBe(0);
  });
  it('zeroes on missing grant, amount or refund', () => {
    expect(refundDueUnits({ ...base, grantedUnits: 0, refundPaise: 100 })).toBe(0);
    expect(refundDueUnits({ ...base, amountPaise: 0, refundPaise: 100 })).toBe(0);
    expect(refundDueUnits({ ...base, refundPaise: 0 })).toBe(0);
    expect(refundDueUnits({ ...base, refundPaise: -5 })).toBe(0);
  });
});

describe('24h processing alert (Vikram 2)', () => {
  async function mk(status: string, ageHours: number, pid: string) {
    const createdAt = new Date(Date.now() - ageHours * HOUR);
    const u = new mongoose.Types.ObjectId();
    return Payment.create({
      userId: u,
      kind: 'topup',
      status,
      razorpayPaymentId: pid,
      amountPaise: 100,
      refundedPaise: 0,
      inkUnits: 0,
      inkReversedUnits: 0,
      source: 'webhook',
      createdAt,
      updatedAt: createdAt,
    });
  }

  it('alerts once per stuck payment, ids only; a second run alerts nobody', async () => {
    await mk('processing', 30, 'pay_s1');
    await mk('processing', 26, 'pay_s2');
    await mk('processing', 2, 'pay_young');
    await mk('paid', 40, 'pay_paid');
    await mk('failed', 40, 'pay_failed');
    expect(await alertStuckProcessingPayments()).toBe(2);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(await alertStuckProcessingPayments()).toBe(0);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    const tags = scopes.map((s) => s.setTags.mock.calls[0][0]);
    for (const t of tags) {
      expect(Object.keys(t).sort()).toEqual(['paymentId', 'razorpayPaymentId']);
    }
    expect(tags.map((t) => t.razorpayPaymentId).sort()).toEqual(['pay_s1', 'pay_s2']);
    expect((await payRow('pay_s1'))!.checkingAlertedAt).toBeInstanceOf(Date);
    expect((await payRow('pay_young'))!.checkingAlertedAt).toBeNull();
  });

  it('concurrent sweeps still alert once', async () => {
    await mk('processing', 30, 'pay_race');
    await Promise.all([alertStuckProcessingPayments(), alertStuckProcessingPayments()]);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a payment that settled before the sweep is not alerted', async () => {
    const p = await mk('processing', 30, 'pay_settled');
    await Payment.updateOne({ _id: p._id }, { $set: { status: 'paid' } });
    expect(await alertStuckProcessingPayments()).toBe(0);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('never throws when the read fails', async () => {
    jest.spyOn(Payment, 'find').mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(alertStuckProcessingPayments()).resolves.toBe(0);
  });
});
