import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { findSubscriptionPlan } from '../config/credit-skus';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { Payment } from '../models/Payment.model';
import { User } from '../models/User.model';

import {
  headers,
  paymentCapturedPayload,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  unix,
  webhook,
} from './t436-helpers';

// T-646 review round 2 (billing): Ink added / taken back shown separately (Vikram 3), the
// replay path writing the plan row, subscription payments with no subscription entity
// attributed via subscription_id / invoice_id, refund with no Payment row, the E11000 retry.

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn() },
    invoices: { fetch: jest.fn() },
  },
}));

const invoicesFetch = (razorpay as unknown as { invoices: { fetch: jest.Mock } }).invoices.fetch;
const payRow = (id: string) => Payment.findOne({ razorpayPaymentId: id }).lean();
const inkOf = async (id: unknown) => (await User.findById(id).lean())!;
const ledger = () => mongoose.connection.db!.collection('inkledger');
const get = (userId: unknown) =>
  request(app)
    .get('/payments')
    .set(headers(String(userId)));
const PLAN = findSubscriptionPlan('solo_monthly')!;
const PLAN_UNITS = PLAN.inkPerCycle * 2;

const SECRET = 'SECRET-RAZORPAY-DETAIL-xyz';
const logSpies = () =>
  (['debug', 'info', 'warn', 'error'] as const).map((l) =>
    jest.spyOn(logger, l).mockImplementation((() => logger) as never),
  );
const logged = (spies: jest.SpyInstance[]) => JSON.stringify(spies.flatMap((s) => s.mock.calls));

beforeEach(() => invoicesFetch.mockReset());
afterEach(() => jest.restoreAllMocks());

async function mkPayment(userId: mongoose.Types.ObjectId, over: Record<string, unknown> = {}) {
  const createdAt = new Date();
  return Payment.create({
    userId,
    kind: 'topup',
    status: 'paid',
    razorpayPaymentId: `pay_${Math.random().toString(36).slice(2, 14)}`,
    amountPaise: 19900,
    refundedPaise: 0,
    inkUnits: 20,
    inkReversedUnits: 0,
    source: 'webhook',
    createdAt,
    updatedAt: createdAt,
    ...over,
  });
}

/** A realistic subscription payment.failed / .authorized: no subscription entity. */
function subPaymentEvent(o: {
  paymentId: string;
  status: string;
  subscriptionId?: string;
  invoiceId?: string;
}) {
  return {
    payment: {
      entity: {
        id: o.paymentId,
        entity: 'payment',
        amount: 79900,
        currency: 'INR',
        status: o.status,
        order_id: 'order_sub_unknown',
        method: 'card',
        amount_refunded: 0,
        captured: false,
        email: 'asha@example.com',
        contact: '+919999999999',
        notes: [],
        created_at: unix('2026-10-01T10:00:00Z'),
        ...(o.invoiceId ? { invoice_id: o.invoiceId } : {}),
        ...(o.subscriptionId ? { subscription_id: o.subscriptionId } : {}),
      },
    },
  };
}

describe('GET /payments: Ink added and Ink taken back, separately (Vikram 3)', () => {
  it('paid / partly refunded / fully refunded / failed / processing rows', async () => {
    const u = await seedUser();
    const mk = (status: string, units: number, rev: number, at: number) =>
      mkPayment(u, {
        status,
        inkUnits: units,
        inkReversedUnits: rev,
        razorpayPaymentId: `pay_row_${status}`,
        createdAt: new Date(Date.UTC(2026, 9, 1) + at),
      });
    await mk('paid', 20, 0, 5);
    await mk('partly_refunded', 20, 5, 4);
    await mk('refunded', 20, 20, 3);
    await mk('failed', 0, 0, 2);
    await mk('processing', 0, 0, 1);
    const res = await get(u);
    const by = Object.fromEntries(
      res.body.payments.map((p: Record<string, unknown>) => [p.status, p]),
    );
    const pick = (s: string) => [by[s].inkAddedInk, by[s].inkReversedInk, by[s].inkDelta];
    expect(pick('paid')).toEqual([10, 0, 10]);
    expect(pick('partly_refunded')).toEqual([10, 2.5, 7.5]);
    expect(pick('refunded')).toEqual([10, 10, 0]);
    expect(pick('failed')).toEqual([0, 0, 0]);
    expect(pick('processing')).toEqual([0, 0, 0]);
  });

  it('a failed or processing row with stale Ink figures still shows 0, 0, 0', async () => {
    const u = await seedUser();
    await mkPayment(u, { status: 'failed', inkUnits: 20, inkReversedUnits: 6 });
    await mkPayment(u, { status: 'processing', inkUnits: 20, inkReversedUnits: 6 });
    for (const p of (await get(u)).body.payments) {
      expect([p.inkAddedInk, p.inkReversedInk, p.inkDelta]).toEqual([0, 0, 0]);
    }
  });

  it('inkDelta is always added minus reversed', async () => {
    const u = await seedUser();
    await mkPayment(u, { status: 'partly_refunded', inkUnits: 21, inkReversedUnits: 7 });
    const p = (await get(u)).body.payments[0];
    expect(p.inkAddedInk).toBe(10.5);
    expect(p.inkReversedInk).toBe(3.5);
    expect(p.inkDelta).toBe(p.inkAddedInk - p.inkReversedInk);
  });

  it('end to end: capture, partial then over-refund; reversed never exceeds added (Ajay M10)', async () => {
    const u = await seedUser();
    await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_m10' }),
    );
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_m10a', paymentId: 'pay_m10', amount: 5000 }),
    );
    let p = (await get(u)).body.payments[0];
    expect([p.status, p.inkAddedInk, p.inkReversedInk, p.inkDelta]).toEqual([
      'partly_refunded',
      10,
      2.5,
      7.5,
    ]);
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_m10b', paymentId: 'pay_m10', amount: 99999 }),
    );
    p = (await get(u)).body.payments[0];
    expect([p.status, p.inkAddedInk, p.inkReversedInk, p.inkDelta]).toEqual([
      'refunded',
      10,
      10,
      0,
    ]);
    expect(p.inkReversedInk).toBeLessThanOrEqual(p.inkAddedInk);
  });

  it('the API never returns reversed > added, even if the stored figures disagree (Ajay M10)', async () => {
    const u = await seedUser();
    await mkPayment(u, { status: 'refunded', inkUnits: 20, inkReversedUnits: 30 });
    const p = (await get(u)).body.payments[0];
    expect(p.inkReversedInk).toBeLessThanOrEqual(p.inkAddedInk);
    expect(p.inkDelta).toBeGreaterThanOrEqual(0);
  });
});

describe('subscription payment with no subscription entity (SHOULD b)', () => {
  it.each([
    ['payment.failed', 'failed', 'failed'],
    ['payment.authorized', 'authorized', 'processing'],
  ])(
    '%s with subscription_id on the payment -> %s plan row for the right user',
    async (event, rzpStatus, status) => {
      const other = await seedUser();
      await seedSub(other, 'sub_other', { planId: 'pro_monthly' });
      const u = await seedUser();
      await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
      const res = await webhook(
        event,
        subPaymentEvent({
          paymentId: 'pay_sf1',
          status: rzpStatus,
          subscriptionId: 'sub_t436',
          invoiceId: 'inv_ignored',
        }),
      );
      expect(res.status).toBe(200);
      const row = await payRow('pay_sf1');
      expect(row).toMatchObject({
        kind: 'plan',
        status,
        razorpaySubscriptionId: 'sub_t436',
        planId: 'solo_monthly',
        amountPaise: 79900,
        inkUnits: 0,
      });
      expect(String(row!.userId)).toBe(String(u));
      expect(invoicesFetch).not.toHaveBeenCalled();
      expect((await inkOf(u)).inkSub ?? 0).toBe(0);
      expect(await Payment.countDocuments({ userId: other })).toBe(0);
    },
  );

  it.each([
    ['payment.failed', 'failed', 'failed'],
    ['payment.authorized', 'authorized', 'processing'],
  ])(
    '%s with only invoice_id -> invoices.fetch -> %s plan row',
    async (event, rzpStatus, status) => {
      const u = await seedUser();
      await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
      invoicesFetch.mockResolvedValue({ id: 'inv_abc', subscription_id: 'sub_t436' });
      const res = await webhook(
        event,
        subPaymentEvent({ paymentId: 'pay_si1', status: rzpStatus, invoiceId: 'inv_abc' }),
      );
      expect(res.status).toBe(200);
      expect(invoicesFetch).toHaveBeenCalledTimes(1);
      expect(invoicesFetch).toHaveBeenCalledWith('inv_abc');
      const row = await payRow('pay_si1');
      expect(row).toMatchObject({ kind: 'plan', status, planId: 'solo_monthly' });
      expect(String(row!.userId)).toBe(String(u));
    },
  );

  it('a later capture of the same payment moves it to paid with the plan Ink on the row', async () => {
    const u = await seedUser();
    await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
    await webhook(
      'payment.failed',
      subPaymentEvent({ paymentId: 'pay_sfp', status: 'failed', subscriptionId: 'sub_t436' }),
    );
    expect((await payRow('pay_sfp'))!.status).toBe('failed');
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_sfp' }));
    expect(await payRow('pay_sfp')).toMatchObject({ status: 'paid', inkUnits: PLAN_UNITS });
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_sfp' })).toBe(1);
  });

  it('subscription_id of a subscription we do not hold -> skipped, 200', async () => {
    const res = await webhook(
      'payment.failed',
      subPaymentEvent({ paymentId: 'pay_nosub', status: 'failed', subscriptionId: 'sub_unknown' }),
    );
    expect(res.status).toBe(200);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it('invoice that resolves to no/unknown subscription -> skipped, 200', async () => {
    invoicesFetch.mockResolvedValue({ id: 'inv_x' });
    const r1 = await webhook(
      'payment.failed',
      subPaymentEvent({ paymentId: 'pay_n1', status: 'failed', invoiceId: 'inv_x' }),
    );
    invoicesFetch.mockResolvedValue({ id: 'inv_y', subscription_id: 'sub_unknown' });
    const r2 = await webhook(
      'payment.failed',
      subPaymentEvent({ paymentId: 'pay_n2', status: 'failed', invoiceId: 'inv_y' }),
    );
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it('invoices.fetch throwing -> payment skipped, 200, nothing from the error logged', async () => {
    const u = await seedUser();
    await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
    invoicesFetch.mockRejectedValue(
      Object.assign(new Error(SECRET), { statusCode: 500, error: { description: SECRET } }),
    );
    const spies = logSpies();
    const res = await webhook(
      'payment.failed',
      subPaymentEvent({ paymentId: 'pay_ifail', status: 'failed', invoiceId: 'inv_bad' }),
    );
    expect(res.status).toBe(200);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(logged(spies)).not.toContain(SECRET);
    expect(logged(spies)).not.toContain('asha@example.com');
  });

  it('invoices.fetch never answering -> gives up after about 5s, skipped, 200', async () => {
    const u = await seedUser();
    await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
    invoicesFetch.mockReturnValue(new Promise(() => undefined));
    const spies = logSpies();
    const t0 = Date.now();
    const res = await webhook(
      'payment.authorized',
      subPaymentEvent({ paymentId: 'pay_ihang', status: 'authorized', invoiceId: 'inv_hang' }),
    );
    const took = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(took).toBeGreaterThanOrEqual(4500);
    expect(took).toBeLessThan(9000);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(logged(spies)).not.toContain('inv_hang');
  }, 20000);
});

describe('refunded plan payment with no Payment row (grantedFor)', () => {
  async function seedPlanUser() {
    const u = await seedUser();
    await seedSub(u, 'sub_t436', { planId: 'solo_monthly' });
    await User.updateOne({ _id: u }, { $set: { inkSub: PLAN_UNITS } });
    return u;
  }
  const refundWithEntity = (entity: Record<string, unknown>, refundId: string, amount = 79900) => ({
    ...refundPayload({ refundId, paymentId: 'pay_norow', amount }),
    payment: {
      entity: {
        id: 'pay_norow',
        amount: 79900,
        status: 'captured',
        created_at: unix('2026-10-01T10:00:00Z'),
        ...entity,
      },
    },
  });

  it('via subscription_id: Ink is reversed', async () => {
    const u = await seedPlanUser();
    expect(await Payment.countDocuments({})).toBe(0);
    const res = await webhook(
      'refund.processed',
      refundWithEntity({ subscription_id: 'sub_t436' }, 'rfnd_nr1'),
    );
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await ledger().findOne({ _id: 'refund:rfnd_nr1' as never })).toMatchObject({
      reason: 'refund_reversal',
      state: 'done',
      delta: -PLAN_UNITS,
    });
    const p = (await get(u)).body.payments[0];
    expect([p.kind, p.status, p.inkAddedInk, p.inkReversedInk, p.inkDelta]).toEqual([
      'plan',
      'refunded',
      PLAN.inkPerCycle,
      PLAN.inkPerCycle,
      0,
    ]);
  });

  it('via invoice_id -> invoices.fetch: Ink is reversed', async () => {
    const u = await seedPlanUser();
    invoicesFetch.mockResolvedValue({ id: 'inv_r', subscription_id: 'sub_t436' });
    const res = await webhook(
      'refund.processed',
      refundWithEntity({ invoice_id: 'inv_r' }, 'rfnd_nr2'),
    );
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await ledger().countDocuments({ reason: 'refund_reversal', delta: -PLAN_UNITS })).toBe(
      1,
    );
  });

  it('partial refund is pro rata and a redelivery reverses once', async () => {
    const u = await seedPlanUser();
    const body = refundWithEntity({ subscription_id: 'sub_t436' }, 'rfnd_nr3', 39950);
    await webhook('refund.processed', body);
    await webhook('refund.processed', body);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS - Math.floor(PLAN_UNITS / 2));
    expect(await ledger().countDocuments({ reason: 'refund_reversal' })).toBe(1);
  });

  it('a payment that cannot be attributed reverses nothing', async () => {
    const u = await seedPlanUser();
    const res = await webhook(
      'refund.processed',
      refundWithEntity({ subscription_id: 'sub_unknown' }, 'rfnd_nr4'),
    );
    expect(res.status).toBe(200);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    expect(await ledger().countDocuments({ reason: 'refund_reversal' })).toBe(0);
  });
});

describe('plan row on the webhook replay path (SHOULD a)', () => {
  it('first delivery: Payment write throws; redelivery writes the row; Ink granted once', async () => {
    const u = await seedUser();
    await seedSub(u);
    const spy = jest
      .spyOn(Payment.collection, 'updateOne')
      .mockRejectedValue(new Error('write exploded'));
    expect(
      (await webhook('subscription.charged', subPayload({ paymentId: 'pay_replay' }))).status,
    ).toBe(200);
    expect(spy).toHaveBeenCalled();
    expect(await Payment.countDocuments({})).toBe(0);
    const afterFirst = (await inkOf(u)).inkSub ?? 0;
    expect(afterFirst).toBe(PLAN_UNITS);
    const grants = await ledger().countDocuments({ userId: u, delta: { $gt: 0 } });
    spy.mockRestore();

    expect(
      (await webhook('subscription.charged', subPayload({ paymentId: 'pay_replay' }))).status,
    ).toBe(200);
    const row = await payRow('pay_replay');
    expect(row).toMatchObject({
      kind: 'plan',
      status: 'paid',
      planId: 'solo_monthly',
      razorpaySubscriptionId: 'sub_t436',
      inkUnits: PLAN_UNITS,
    });
    expect(String(row!.userId)).toBe(String(u));
    expect((await inkOf(u)).inkSub ?? 0).toBe(afterFirst);
    expect(await ledger().countDocuments({ userId: u, delta: { $gt: 0 } })).toBe(grants);
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_replay' })).toBe(1);
  });
});

describe('E11000 on the Payment upsert', () => {
  const dup = () =>
    Object.assign(new Error('E11000 dup key SECRET-KEY-VALUE'), {
      code: 11000,
      name: 'MongoServerError',
    });

  it('first upsert E11000 -> retried once; the row ends paid with the right figures', async () => {
    const u = await seedUser();
    const spy = jest.spyOn(Payment.collection, 'updateOne');
    spy.mockImplementationOnce((() => Promise.reject(dup())) as never);
    const res = await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_dup1' }),
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await Payment.countDocuments({ razorpayPaymentId: 'pay_dup1' })).toBe(1);
    expect(await payRow('pay_dup1')).toMatchObject({ status: 'paid', inkUnits: 20, kind: 'topup' });
    expect((await inkOf(u)).inkTopup).toBe(20);
  });

  it('the retry does not undo a later status the winner already wrote', async () => {
    const u = await seedUser();
    const orig = Payment.collection.updateOne.bind(Payment.collection);
    await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_dup2' }),
    );
    const spy = jest.spyOn(Payment.collection, 'updateOne');
    spy.mockImplementationOnce((() => Promise.reject(dup())) as never);
    spy.mockImplementation(orig as never);
    await webhook('payment.failed', {
      payment: {
        entity: {
          id: 'pay_dup2',
          order_id: 'order_t436',
          amount: 19900,
          status: 'failed',
          notes: { sku_id: 'topup_mid', user_id: String(u) },
        },
      },
    });
    expect((await payRow('pay_dup2'))!.status).toBe('paid');
  });

  it('a second E11000 is swallowed, 200, grant intact, errName logged and not the message', async () => {
    const u = await seedUser();
    const err = jest.spyOn(logger, 'error').mockImplementation((() => logger) as never);
    const spy = jest.spyOn(Payment.collection, 'updateOne').mockRejectedValue(dup());
    const res = await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_dup3' }),
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await inkOf(u)).inkTopup).toBe(20);
    const out = JSON.stringify(err.mock.calls);
    expect(out).toContain('"errName":"MongoServerError"');
    expect(out).not.toContain('SECRET-KEY-VALUE');
  });

  it('a non-duplicate error is not retried', async () => {
    const u = await seedUser();
    const spy = jest.spyOn(Payment.collection, 'updateOne').mockRejectedValue(new Error('network'));
    const res = await webhook(
      'payment.captured',
      paymentCapturedPayload({ userId: String(u), paymentId: 'pay_dup4' }),
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
