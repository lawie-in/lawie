import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import { User } from '../models/User.model';
import { grantTopupInk, topupClaimId } from '../services/ink-ledger.service';

// T-413 (Arjun b) — top-up grants are claim-first: the inkledger row with _id topup:<orderId> is
// inserted before the $inc, so a retry, or the order.paid / payment.captured pair, grants once.
// Real handleWebhookEvent through the route, in-memory Mongo, no hosted services.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const ORDER = 'order_t413';
const UNITS = 6; // topup_mini: 3 Ink x 2 ledger units

const post = (body: string) =>
  request(app)
    .post('/webhook/razorpay')
    .type('json')
    .set('x-razorpay-signature', crypto.createHmac('sha256', SECRET).update(body).digest('hex'))
    .send(body);

const ledger = () => mongoose.connection.db!.collection('inkledger');

async function mkUser() {
  return User.create({ email: 'topup413@example.com', plan: 'free' });
}

const notesFor = (userId: unknown, extra: Record<string, string> = {}) => ({
  sku_id: 'topup_mini',
  user_id: String(userId),
  ...extra,
});

const orderPaid = (userId: unknown, extra: Record<string, string> = {}, orderId = ORDER) =>
  JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: orderId, notes: notesFor(userId, extra) } },
      payment: { entity: { id: 'pay_t413', order_id: orderId } },
    },
  });

// payment.captured has no order entity: the order id is only payment.order_id.
const paymentCaptured = (userId: unknown, extra: Record<string, string> = {}, orderId = ORDER) =>
  JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: 'pay_t413', order_id: orderId, notes: notesFor(userId, extra) } },
    },
  });

const topup = async (id: unknown) => (await User.findById(id).lean())!.inkTopup ?? 0;

describe('T-413 top-up claim-first', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('same event delivered twice', () => {
    it('payment.captured twice -> one grant, both 200, one claim row', async () => {
      const user = await mkUser();
      const body = paymentCaptured(user._id);
      const first = await post(body);
      const second = await post(body);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      const rows = await ledger().find({ userId: user._id }).toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]._id).toBe(topupClaimId(ORDER));
      expect(rows[0]).toMatchObject({
        delta: UNITS,
        reason: 'topup_purchase',
        sourceBucket: 'topup',
        reference: ORDER,
        balanceAfter: UNITS,
      });
    });

    it('payment.captured keys on payment.order_id, not an empty string', async () => {
      const user = await mkUser();
      await post(paymentCaptured(user._id));
      expect(await ledger().findOne({ _id: 'topup:' as never })).toBeNull();
      expect(await ledger().findOne({ _id: topupClaimId(ORDER) as never })).not.toBeNull();
    });

    it('concurrent duplicate deliveries still grant once', async () => {
      const user = await mkUser();
      const body = paymentCaptured(user._id);
      const results = await Promise.all([post(body), post(body), post(body)]);
      // T-415: a loser that sees the winner's claim still pending gets 500 (Razorpay
      // retries); one that sees it granted gets 200. Never a second grant.
      expect(results.every((r) => r.status === 200 || r.status === 500)).toBe(true);
      expect(results.some((r) => r.status === 200)).toBe(true);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);
    });
  });

  describe('order.paid + payment.captured pair', () => {
    it.each([
      ['order.paid first', 'op'],
      ['payment.captured first', 'pc'],
    ])('%s -> one grant, both 200', async (_n, first) => {
      const user = await mkUser();
      const a = orderPaid(user._id);
      const b = paymentCaptured(user._id);
      const [one, two] = first === 'op' ? [a, b] : [b, a];
      expect((await post(one)).status).toBe(200);
      expect((await post(two)).status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);
    });

    it('the pair delivered concurrently grants once', async () => {
      const user = await mkUser();
      const res = await Promise.all([post(orderPaid(user._id)), post(paymentCaptured(user._id))]);
      // T-415: the loser may see the claim pending and get 500; still exactly one grant.
      expect(res.every((r) => r.status === 200 || r.status === 500)).toBe(true);
      expect(res.some((r) => r.status === 200)).toBe(true);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);
      // The retry of whichever lost is a no-op once the winner marked granted.
      expect((await post(paymentCaptured(user._id))).status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
    });

    it('different orders are separate grants', async () => {
      const user = await mkUser();
      await post(paymentCaptured(user._id, {}, 'order_a'));
      await post(paymentCaptured(user._id, {}, 'order_b'));
      expect(await topup(user._id)).toBe(UNITS * 2);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(2);
    });
  });

  describe('grant failure and retry', () => {
    it('$inc fails once -> 500, claim rolled back, retry -> 200 with exactly one grant', async () => {
      const user = await mkUser();
      const spy = jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      const body = paymentCaptured(user._id);

      const first = await post(body);
      expect(first.status).toBe(500);
      expect(first.body).toEqual({ error: 'Internal Server Error' });
      expect(await topup(user._id)).toBe(0);
      expect(await ledger().findOne({ _id: topupClaimId(ORDER) as never })).toBeNull();

      const second = await post(body);
      expect(second.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);

      const third = await post(body);
      expect(third.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
    });

    it('$inc fails and the rollback fails too -> logs "manual grant" at error, still 500', async () => {
      const user = await mkUser();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      const errSpy = jest.spyOn(logger, 'error');
      const del = jest
        .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
        .mockRejectedValueOnce(new Error('ZZSECRET'));
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(500);
      expect(del).toHaveBeenCalled();
      expect(errSpy.mock.calls.some((c) => String(c[1]).includes('needs a manual grant'))).toBe(
        true,
      );
      expect(JSON.stringify(errSpy.mock.calls)).not.toContain('ZZSECRET');
    });

    it('claim insert fails with a non-duplicate error -> 500, nothing granted, retry grants', async () => {
      const user = await mkUser();
      jest
        .spyOn(mongoose.mongo.Collection.prototype, 'insertOne')
        .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 91 }));
      const body = paymentCaptured(user._id);
      expect((await post(body)).status).toBe(500);
      expect(await topup(user._id)).toBe(0);
      expect((await post(body)).status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
    });

    it('mark-granted update fails after a good $inc -> error log, grant stands, 200; claim left pending', async () => {
      const user = await mkUser();
      const errSpy = jest.spyOn(logger, 'error');
      jest
        .spyOn(mongoose.mongo.Collection.prototype, 'updateOne')
        .mockRejectedValueOnce(new Error('ZZSECRET'))
        .mockRejectedValueOnce(new Error('ZZSECRET'))
        .mockRejectedValueOnce(new Error('ZZSECRET')); // MARK_GRANTED_ATTEMPTS = 3
      const body = paymentCaptured(user._id);
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      expect(
        errSpy.mock.calls.some((c) => String(c[1]).includes('balanceAfter update failed')),
      ).toBe(true);
      expect(JSON.stringify(errSpy.mock.calls)).not.toContain('ZZSECRET');
      expect(await ledger().findOne({ _id: topupClaimId(ORDER) as never })).toMatchObject({
        state: 'pending',
      });
      // T-415: an immediate retry sees the claim pending and fresh: 500, Ink granted once.
      expect((await post(body)).status).toBe(500);
      expect(await topup(user._id)).toBe(UNITS);
    });
  });

  describe('coupon usage is gated on the claim', () => {
    it('a duplicate delivery counts the coupon once (uses 1, one CouponUsage)', async () => {
      const user = await mkUser();
      const coupon = await CouponCode.create({
        code: 'T413',
        label: 't413',
        discountType: 'percent',
        discountValue: 10,
      });
      const body = paymentCaptured(user._id, { coupon_code: 'T413' });
      expect((await post(body)).status).toBe(200);
      expect((await post(body)).status).toBe(200);
      expect((await post(orderPaid(user._id, { coupon_code: 'T413' }))).status).toBe(200);
      expect((await CouponCode.findById(coupon._id).lean())!.uses).toBe(1);
      const usages = await CouponUsage.find({ couponId: coupon._id }).lean();
      expect(usages).toHaveLength(1);
      expect(usages[0].orderId).toBe(ORDER);
      expect(await topup(user._id)).toBe(UNITS);
    });

    it('a failed grant (500) does not touch the coupon; the retry counts it once', async () => {
      const user = await mkUser();
      const coupon = await CouponCode.create({
        code: 'T413B',
        label: 't413',
        discountType: 'percent',
        discountValue: 10,
      });
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      const body = paymentCaptured(user._id, { coupon_code: 'T413B' });
      expect((await post(body)).status).toBe(500);
      expect((await CouponCode.findById(coupon._id).lean())!.uses).toBe(0);
      expect(await CouponUsage.countDocuments({ couponId: coupon._id })).toBe(0);
      expect((await post(body)).status).toBe(200);
      expect((await CouponCode.findById(coupon._id).lean())!.uses).toBe(1);
      expect(await CouponUsage.countDocuments({ couponId: coupon._id })).toBe(1);
    });

    it('a coupon error logs the error class only, and the grant still acks 200', async () => {
      const user = await mkUser();
      await CouponCode.create({
        code: 'T413C',
        label: 't413',
        discountType: 'percent',
        discountValue: 10,
      });
      jest
        .spyOn(CouponCode, 'findOneAndUpdate')
        .mockRejectedValueOnce(new Error('E11000 ZZSECRET') as never);
      const errSpy = jest.spyOn(logger, 'error');
      const res = await post(paymentCaptured(user._id, { coupon_code: 'T413C' }));
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      const call = errSpy.mock.calls.find((c) => c[1] === 'Failed to record coupon usage');
      expect(call![0]).toEqual({ errName: 'Error', couponCode: 'T413C' });
      expect(JSON.stringify(errSpy.mock.calls)).not.toContain('ZZSECRET');
    });
  });

  describe('grantTopupInk edge cases', () => {
    const base = (userId: string, razorpayOrderId: string) => ({
      userId,
      inkUnits: UNITS,
      amountInr: 65,
      razorpayOrderId,
      topupSkuId: 'topup_mini',
    });

    it('empty order id -> no grant, error log; the route still acks 200', async () => {
      const user = await mkUser();
      const errSpy = jest.spyOn(logger, 'error');
      expect(await grantTopupInk(base(String(user._id), ''))).toBe(0);
      expect(errSpy.mock.calls.some((c) => String(c[1]).includes('no order id'))).toBe(true);

      const body = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_x', notes: notesFor(user._id) } } },
      });
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(0);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(0);
    });

    it('invalid userId -> 0, nothing written', async () => {
      expect(await grantTopupInk(base('not-an-id', ORDER))).toBe(0);
      expect(await ledger().countDocuments({})).toBe(0);
    });

    it('unknown user -> 0, claim rolled back, no ledger row', async () => {
      const ghost = new mongoose.Types.ObjectId().toString();
      expect(await grantTopupInk(base(ghost, ORDER))).toBe(0);
      expect(await ledger().findOne({ _id: topupClaimId(ORDER) as never })).toBeNull();
    });

    it('a pre-T-413 ledger row (ObjectId _id, same reference) blocks a re-grant', async () => {
      const user = await mkUser();
      await ledger().insertOne({
        userId: user._id,
        delta: UNITS,
        reason: 'topup_purchase',
        sourceBucket: 'topup',
        reference: ORDER,
        createdAt: new Date(),
      });
      expect(await grantTopupInk(base(String(user._id), ORDER))).toBe(0);
      expect(await topup(user._id)).toBe(0);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);
    });

    it('returns the granted units on success', async () => {
      const user = await mkUser();
      expect(await grantTopupInk(base(String(user._id), ORDER))).toBe(UNITS);
      expect(await grantTopupInk(base(String(user._id), ORDER))).toBe(0);
    });

    it('database not connected -> throws (nothing granted), so the route would 500', async () => {
      const user = await mkUser();
      const conn = mongoose.connection as unknown as Record<string, unknown>;
      const realDb = conn.db;
      conn.db = undefined;
      try {
        await expect(grantTopupInk(base(String(user._id), ORDER))).rejects.toThrow(/not connected/);
      } finally {
        conn.db = realDb;
      }
      expect(await topup(user._id)).toBe(0);
    });
  });
});
