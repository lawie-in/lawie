import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { Invoice } from '../models/Invoice.model';
import { Payment } from '../models/Payment.model';
import { PaymentConcern } from '../models/PaymentConcern.model';
import { setConcernRateLimitRedis } from '../services/concern-rate-limit';
import * as Sentry from '@sentry/node';

import { headers, makeIssued, seedUser } from './t436-helpers';

// T-646 AC1/AC2: GET /payments. Real routes, in-memory Mongo.

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;

async function mkPayment(userId: mongoose.Types.ObjectId, over: Record<string, unknown> = {}) {
  const createdAt = (over.createdAt as Date) ?? new Date();
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

const get = (userId: unknown) =>
  request(app)
    .get('/payments')
    .set(headers(String(userId)));

beforeEach(() => {
  (Sentry.withScope as jest.Mock).mockImplementation((cb: (s: unknown) => void) =>
    cb({
      setFingerprint: jest.fn(),
      setSDKProcessingMetadata: jest.fn(),
      addEventProcessor: jest.fn(),
      setTags: jest.fn(),
      setExtras: jest.fn(),
    }),
  );
});
afterEach(() => {
  jest.clearAllMocks();
  setConcernRateLimitRedis(null);
});

describe('GET /payments', () => {
  it('needs the internal headers', async () => {
    expect((await request(app).get('/payments')).status).toBe(401);
  });

  it('is private and uncached', async () => {
    const u = await seedUser();
    const res = await get(u);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual({ payments: [] });
  });

  it('renders every visible status and hides order-only (created) rows', async () => {
    const u = await seedUser();
    const t = Date.now();
    for (const [i, status] of (
      ['processing', 'paid', 'failed', 'refunded', 'partly_refunded'] as const
    ).entries()) {
      await mkPayment(u, { status, createdAt: new Date(t - i * 1000) });
    }
    // An order row: status created, no payment id.
    await Payment.collection.insertOne({
      userId: u,
      kind: 'topup',
      status: 'created',
      razorpayOrderId: 'order_hidden',
      amountPaise: 100,
      refundedPaise: 0,
      inkUnits: 0,
      inkReversedUnits: 0,
      source: 'order',
      createdAt: new Date(t + 5000),
      updatedAt: new Date(),
    });
    // A status 'created' row that somehow has a payment id is hidden too.
    await mkPayment(u, { status: 'created', createdAt: new Date(t + 6000) });

    const res = await get(u);
    expect(res.status).toBe(200);
    expect(res.body.payments.map((p: { status: string }) => p.status)).toEqual([
      'processing',
      'paid',
      'failed',
      'refunded',
      'partly_refunded',
    ]);
  });

  it('returns the documented fields, newest first, with referenceTail of 8 chars', async () => {
    const u = await seedUser();
    const older = await mkPayment(u, {
      razorpayPaymentId: 'pay_ABCDEFGH12345678',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      kind: 'plan',
      amountPaise: 79900,
    });
    const newer = await mkPayment(u, {
      razorpayPaymentId: 'pay_zzzzzzzzQRSTUVWX',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    const res = await get(u);
    expect(res.body.payments.map((p: { id: string }) => p.id)).toEqual([
      String(newer._id),
      String(older._id),
    ]);
    expect(res.body.payments[0]).toEqual({
      id: String(newer._id),
      createdAt: '2026-10-01T00:00:00.000Z',
      kind: 'topup',
      amountPaise: 19900,
      status: 'paid',
      checking: false,
      refundedPaise: 0,
      inkDelta: 10,
      referenceTail: 'QRSTUVWX',
      invoiceId: null,
      concern: null,
    });
    expect(res.body.payments[1].referenceTail).toBe('12345678');
    expect(res.body.payments[1].referenceTail).toHaveLength(8);
    expect(res.body.payments[1].kind).toBe('plan');
    // The full Razorpay id is never returned.
    expect(JSON.stringify(res.body)).not.toContain('pay_ABCDEFGH');
  });

  it("returns only the caller's own payments", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const mine = await mkPayment(me);
    await mkPayment(other);
    const res = await get(me);
    expect(res.body.payments.map((p: { id: string }) => p.id)).toEqual([String(mine._id)]);
  });

  it('shows the issued invoice id for the payment, null otherwise', async () => {
    const u = await seedUser();
    const withInv = await mkPayment(u, { createdAt: new Date('2026-10-02T00:00:00Z') });
    const without = await mkPayment(u, { createdAt: new Date('2026-10-01T00:00:00Z') });
    const inv = await makeIssued(u, { seq: 1 });
    await Invoice.collection.updateOne(
      { _id: inv._id },
      { $set: { paymentId: withInv.razorpayPaymentId } },
    );
    const res = await get(u);
    const byId = Object.fromEntries(res.body.payments.map((p: { id: string }) => [p.id, p]));
    expect(byId[String(withInv._id)].invoiceId).toBe(String(inv._id));
    expect(byId[String(without._id)].invoiceId).toBeNull();
  });

  it('inkDelta is granted minus reversed units, halved; failed/processing add none', async () => {
    const u = await seedUser();
    await mkPayment(u, {
      status: 'partly_refunded',
      inkUnits: 20,
      inkReversedUnits: 6,
      createdAt: new Date(3000),
    });
    await mkPayment(u, { status: 'failed', inkUnits: 20, createdAt: new Date(2000) });
    await mkPayment(u, { status: 'processing', inkUnits: 20, createdAt: new Date(1000) });
    const res = await get(u);
    expect(res.body.payments.map((p: { inkDelta: number }) => p.inkDelta)).toEqual([7, 0, 0]);
    expect(res.body.payments[0].refundedPaise).toBe(0);
  });

  describe('24 h checking flag', () => {
    it('is false under 24h and true after, only for processing', async () => {
      const u = await seedUser();
      const young = await mkPayment(u, {
        status: 'processing',
        createdAt: new Date(Date.now() - 23 * HOUR),
      });
      const old = await mkPayment(u, {
        status: 'processing',
        createdAt: new Date(Date.now() - 25 * HOUR),
      });
      const paidOld = await mkPayment(u, {
        status: 'paid',
        createdAt: new Date(Date.now() - 48 * HOUR),
      });
      const res = await get(u);
      const byId = Object.fromEntries(res.body.payments.map((p: { id: string }) => [p.id, p]));
      expect(byId[String(young._id)].checking).toBe(false);
      expect(byId[String(old._id)].checking).toBe(true);
      expect(byId[String(paidOld._id)].checking).toBe(false);
    });

    it('raises one Sentry alert per payment, ids only, across repeated reads', async () => {
      const u = await seedUser();
      const old = await mkPayment(u, {
        status: 'processing',
        razorpayPaymentId: 'pay_stuck_1',
        createdAt: new Date(Date.now() - 30 * HOUR),
      });
      await get(u);
      await get(u);
      await get(u);
      // The on-read alert is fire-and-forget: wait for it to settle.
      await new Promise((r) => setTimeout(r, 200));
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const fresh = await Payment.findById(old._id).lean();
      expect(fresh!.checkingAlertedAt).toBeInstanceOf(Date);
    });
  });

  describe('concern on a row', () => {
    it("returns the note to its owner, never to another user's GET", async () => {
      const owner = await seedUser();
      const other = await seedUser();
      const pay = await mkPayment(owner);
      await mkPayment(other);
      await PaymentConcern.create({
        paymentId: pay._id,
        userId: owner,
        reason: 'other',
        note: 'SECRET-NOTE-TEXT my card ending 4242',
        status: 'open',
        reference: 'PC-AAAAAAAA',
        openKey: String(pay._id),
      });
      const mine = await get(owner);
      expect(mine.body.payments[0].concern).toEqual({
        id: expect.any(String),
        status: 'open',
        reference: 'PC-AAAAAAAA',
        note: 'SECRET-NOTE-TEXT my card ending 4242',
      });
      const theirs = await get(other);
      expect(theirs.status).toBe(200);
      expect(theirs.body.payments).toHaveLength(1);
      expect(theirs.body.payments[0].concern).toBeNull();
      expect(JSON.stringify(theirs.body)).not.toContain('SECRET-NOTE');
      expect(JSON.stringify(theirs.body)).not.toContain('PC-AAAAAAAA');
    });

    it('note is null when the concern has none', async () => {
      const u = await seedUser();
      const pay = await mkPayment(u);
      await PaymentConcern.create({
        paymentId: pay._id,
        userId: u,
        reason: 'charged_no_ink',
        note: '',
        status: 'in_review',
        reference: 'PC-BBBBBBBB',
        openKey: String(pay._id),
      });
      const res = await get(u);
      expect(res.body.payments[0].concern).toMatchObject({ status: 'in_review', note: null });
    });
  });

  it('caps the list at 500 rows', async () => {
    const u = await seedUser();
    const base = Date.now() - 1000 * 1000;
    const docs = Array.from({ length: 505 }, (_, i) => ({
      userId: u,
      kind: 'topup',
      status: 'paid',
      razorpayPaymentId: `pay_cap_${String(i).padStart(4, '0')}`,
      amountPaise: 100,
      refundedPaise: 0,
      inkUnits: 2,
      inkReversedUnits: 0,
      source: 'webhook',
      createdAt: new Date(base + i * 1000),
      updatedAt: new Date(),
    }));
    await Payment.collection.insertMany(docs);
    const res = await get(u);
    expect(res.body.payments).toHaveLength(500);
    expect(res.body.payments[0].referenceTail).toBe('cap_0504');
  });

  it('500s with a fixed body when the read fails', async () => {
    const u = await seedUser();
    jest.spyOn(Payment, 'find').mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await get(u);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to list payments' });
    jest.restoreAllMocks();
  });
});
