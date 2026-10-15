import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import mongoose from 'mongoose';
import request from 'supertest';

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));
import { enqueueEmail } from '@lawie/email-client';

import app from '../app';
import { env } from '../config/env';
import logger from '../config/logger';
import { Invoice, isEmailMarkerUpdate } from '../models/Invoice.model';
import { RefundCap } from '../models/RefundCap.model';
import {
  INVOICE_EMAIL_TEMPLATES,
  invoiceEmailJobId,
  queueInvoiceEmail,
} from '../services/invoice-email.service';
import {
  issueInvoice,
  recordCreditNoteForRefund,
  recordInvoiceForPayment,
} from '../services/invoice.service';
import { runInvoiceSweep } from '../services/invoice-sweep.service';

import { INTERNAL_SECRET, makeIssued, seedUser, withGstEnv } from './t436-helpers';

// T-436 (b)/(c), slice 1 (billing): Arjun (3) refund cap, (2) email once, (1) email-view,
// plus the plumbing. Mongo is in-memory; @lawie/email-client is mocked, so nothing here can
// reach a real queue, and env.REDIS_URL is a dummy where a test needs "configured".

const enq = enqueueEmail as jest.Mock;
const DUMMY_REDIS = 'redis://dummy.invalid:6379';
const later = () => new Date(Date.now() + 2 * 60 * 1000);

/** Run a test body with env.REDIS_URL set to a dummy (the email client is mocked). */
let restoreRedis: (() => void) | null = null;
function withRedis(): void {
  restoreRedis = withGstEnv({ REDIS_URL: DUMMY_REDIS });
}

beforeEach(() => {
  enq.mockReset();
  enq.mockResolvedValue({ jobId: 'x', queue: 'email-high', deduped: false });
});

afterEach(() => {
  restoreRedis?.();
  restoreRedis = null;
  jest.restoreAllMocks();
});

/** Resolves once `cond` holds (the issue-path enqueue is fire and forget). */
async function waitFor(cond: () => Promise<boolean> | boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitFor timed out');
}
const settle = () => new Promise((r) => setTimeout(r, 60));

async function recordAndIssue(opts: {
  paymentId?: string;
  amount?: number;
  source?: 'order.paid' | 'backfill';
  userFields?: Record<string, unknown>;
}) {
  const userId = await seedUser(opts.userFields);
  const row = await recordInvoiceForPayment({
    paymentId: opts.paymentId ?? `pay_${Math.random().toString(36).slice(2)}`,
    userId: String(userId),
    amount: opts.amount ?? 100000,
    paidAt: new Date(),
    description: 'Lawie Ink top-up',
    source: opts.source ?? 'order.paid',
  });
  expect(await issueInvoice(row!._id as mongoose.Types.ObjectId)).toBe('issued');
  return (await Invoice.findById(row!._id).lean())!;
}

const refund = (refundId: string, paymentId: string, amount: number) => ({
  refundId,
  paymentId,
  amount,
  processedAt: new Date(),
});

// ── AC1: refund cap ──────────────────────────────────────────────────────────

describe('refund cap (Arjun 3)', () => {
  it('4 concurrent 40000 refunds on a 100000 invoice: exactly 2 credit notes, cap never exceeded', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_cap' });
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => recordCreditNoteForRefund(refund(`rf${i}`, 'pay_cap', 40000))),
    );
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(2);
    const cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap.refundedTotal).toBe(80000);
    expect(cap.creditedRefundIds).toHaveLength(2);
    const cns = await Invoice.find({ kind: 'credit_note' }).lean();
    expect(cns.reduce((s, c) => s + c.draft.amount, 0)).toBeLessThanOrEqual(inv.draft.amount);
    expect(new Set(cns.map((c) => c.refundId))).toEqual(new Set(cap.creditedRefundIds));
  });

  it('4 concurrent refunds that exactly fit all pass and the cap lands on the invoice total', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_fit' });
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => recordCreditNoteForRefund(refund(`fit${i}`, 'pay_fit', 25000))),
    );
    expect(results.every(Boolean)).toBe(true);
    const cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap.refundedTotal).toBe(100000);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(4);
  });

  it('concurrent deliveries of the SAME refund: one count, one credit note', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_same' });
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => recordCreditNoteForRefund(refund('rf_same', 'pay_same', 40000))),
    );
    expect(results.every(Boolean)).toBe(true);
    expect(new Set(results.map((r) => String(r!._id))).size).toBe(1);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
    const cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap).toMatchObject({ refundedTotal: 40000, creditedRefundIds: ['rf_same'] });
  });

  it('the cap lives in its own collection keyed by the invoice id; the invoice row is untouched', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_sep' });
    await recordCreditNoteForRefund(refund('rf_sep', 'pay_sep', 1000));
    expect(RefundCap.collection.collectionName).not.toBe(Invoice.collection.collectionName);
    const cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(String(cap.originalInvoiceId)).toBe(String(inv._id));
    expect(await RefundCap.countDocuments({})).toBe(1);
    const after = (await Invoice.findById(inv._id).lean())!;
    expect(after.updatedAt.getTime()).toBe(inv.updatedAt.getTime());
    expect(after.total).toBe(inv.total);
    expect(after.number).toBe(inv.number);
    expect(after).not.toHaveProperty('refundedTotal');
    // one row per original invoice, enforced by a unique index
    await RefundCap.init();
    const idx = await RefundCap.collection.indexes();
    expect(idx.some((i) => i.unique && 'originalInvoiceId' in i.key)).toBe(true);
  });

  it('an idempotent retry returns the same credit note and does not count twice', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_idem' });
    const first = await recordCreditNoteForRefund(refund('rf_i', 'pay_idem', 30000));
    const again = await recordCreditNoteForRefund(refund('rf_i', 'pay_idem', 30000));
    expect(String(again!._id)).toBe(String(first!._id));
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
    expect((await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!.refundedTotal).toBe(
      30000,
    );
  });

  it('crash between the $inc and the credit note upsert: the retry makes one count and one credit note', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_crash' });
    // The credit note upsert dies once, after the cap has already counted the refund.
    jest.spyOn(Invoice, 'findOneAndUpdate').mockRejectedValueOnce(new Error('connection lost'));
    await expect(recordCreditNoteForRefund(refund('rf_crash', 'pay_crash', 40000))).rejects.toThrow(
      'connection lost',
    );
    let cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap).toMatchObject({ refundedTotal: 40000, creditedRefundIds: ['rf_crash'] });
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(0);

    const healed = await recordCreditNoteForRefund(refund('rf_crash', 'pay_crash', 40000));
    expect(healed?.refundId).toBe('rf_crash');
    // and a second retry after healing
    await recordCreditNoteForRefund(refund('rf_crash', 'pay_crash', 40000));
    cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap).toMatchObject({ refundedTotal: 40000, creditedRefundIds: ['rf_crash'] });
    expect(await Invoice.countDocuments({ kind: 'credit_note', refundId: 'rf_crash' })).toBe(1);
  });

  it('crash state seeded by hand (counted, no credit note) heals the same way', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_crash2' });
    await recordCreditNoteForRefund(refund('rf_a', 'pay_crash2', 40000));
    await RefundCap.updateOne(
      { originalInvoiceId: inv._id },
      { $inc: { refundedTotal: 10000 }, $addToSet: { creditedRefundIds: 'rf_lost' } },
    );
    const healed = await recordCreditNoteForRefund(refund('rf_lost', 'pay_crash2', 10000));
    expect(healed?.refundId).toBe('rf_lost');
    expect((await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!.refundedTotal).toBe(
      50000,
    );
  });

  it('a refund that would take the total over the invoice is rejected: null, error logged, nothing written', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_over' });
    await recordCreditNoteForRefund(refund('rf_ok', 'pay_over', 90000));
    const error = jest.spyOn(logger, 'error');
    expect(await recordCreditNoteForRefund(refund('rf_big', 'pay_over', 10001))).toBeNull();
    expect(await Invoice.countDocuments({ refundId: 'rf_big' })).toBe(0);
    const cap = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(cap.refundedTotal).toBe(90000);
    expect(cap.creditedRefundIds).toEqual(['rf_ok']);
    expect(error.mock.calls.some((c) => String(c[1]).includes('exceeds'))).toBe(true);
    // exactly the remainder is accepted
    expect(await recordCreditNoteForRefund(refund('rf_edge', 'pay_over', 10000))).not.toBeNull();
  });

  it('a single refund above the invoice total is rejected', async () => {
    await recordAndIssue({ paymentId: 'pay_one' });
    expect(await recordCreditNoteForRefund(refund('rf_x', 'pay_one', 100001))).toBeNull();
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(0);
  });

  it('the cap is seeded from credit notes that already exist (made before the cap)', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_seed' });
    await Invoice.create({
      kind: 'credit_note',
      state: 'issuing',
      paymentId: 'pay_seed',
      refundId: 'rf_old',
      userId: inv.userId,
      originalInvoiceId: inv._id,
      draft: { amount: 70000, description: 'd', paidAt: new Date(), source: 'refund.processed' },
    });
    expect(await RefundCap.countDocuments({})).toBe(0);
    // 70000 already credited: 40000 more does not fit, 30000 does.
    expect(await recordCreditNoteForRefund(refund('rf_new', 'pay_seed', 40000))).toBeNull();
    const seeded = (await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!;
    expect(seeded).toMatchObject({ refundedTotal: 70000, creditedRefundIds: ['rf_old'] });
    expect(await recordCreditNoteForRefund(refund('rf_new2', 'pay_seed', 30000))).not.toBeNull();
    // the pre-existing refund, retried, is not counted again
    const old = await recordCreditNoteForRefund(refund('rf_old', 'pay_seed', 70000));
    expect(old?.refundId).toBe('rf_old');
    expect((await RefundCap.findOne({ originalInvoiceId: inv._id }).lean())!.refundedTotal).toBe(
      100000,
    );
  });

  it('a refund with no original invoice writes no cap row', async () => {
    expect(await recordCreditNoteForRefund(refund('rf_n', 'pay_nobody', 100))).toBeNull();
    expect(await RefundCap.countDocuments({})).toBe(0);
  });
});

// ── AC2: the marker guard ────────────────────────────────────────────────────

describe('emailQueuedAt marker guard (Arjun 2)', () => {
  const stamp = { timestamps: false } as const;

  it('the marker can be set once on an issued row, then never again', async () => {
    const row = await makeIssued(await seedUser());
    const at = new Date('2026-10-06T00:00:00Z');
    const r1 = await Invoice.updateOne({ _id: row._id }, { $set: { emailQueuedAt: at } }, stamp);
    expect(r1.modifiedCount).toBe(1);
    const r2 = await Invoice.updateOne(
      { _id: row._id },
      { $set: { emailQueuedAt: new Date() } },
      stamp,
    );
    expect(r2.modifiedCount).toBe(0);
    const after = (await Invoice.findById(row._id).lean())!;
    expect(after.emailQueuedAt!.getTime()).toBe(at.getTime());
    // no updatedAt change: timestamps:false
    expect(after.updatedAt.getTime()).toBe(row.updatedAt.getTime());
  });

  it('findOneAndUpdate may set the marker once too', async () => {
    const row = await makeIssued(await seedUser());
    const hit = await Invoice.findOneAndUpdate(
      { _id: row._id },
      { $set: { emailQueuedAt: new Date() } },
      { ...stamp, new: true },
    );
    expect(hit?.emailQueuedAt).toBeInstanceOf(Date);
    const miss = await Invoice.findOneAndUpdate(
      { _id: row._id },
      { $set: { emailQueuedAt: new Date(0) } },
      stamp,
    );
    expect(miss).toBeNull();
  });

  it('the marker without timestamps:false is refused (Mongoose would add updatedAt)', async () => {
    const row = await makeIssued(await seedUser());
    const res = await Invoice.updateOne({ _id: row._id }, { $set: { emailQueuedAt: new Date() } });
    expect(res.modifiedCount).toBe(0);
    expect((await Invoice.findById(row._id).lean())!.emailQueuedAt ?? null).toBeNull();
  });

  it('any other write to an issued row is refused, with or without the marker', async () => {
    const row = await makeIssued(await seedUser());
    const attempts: Array<() => Promise<{ modifiedCount?: number; deletedCount?: number }>> = [
      () => Invoice.updateOne({ _id: row._id }, { $set: { number: 'X' } }),
      () => Invoice.updateOne({ _id: row._id }, { $set: { total: 1 } }, stamp),
      () =>
        Invoice.updateOne(
          { _id: row._id },
          { $set: { emailQueuedAt: new Date(), total: 1 } },
          stamp,
        ),
      () =>
        Invoice.updateOne(
          { _id: row._id },
          { $set: { emailQueuedAt: new Date() }, $unset: { number: 1 } },
          stamp,
        ),
      () => Invoice.updateOne({ _id: row._id }, { $set: { emailQueuedAt: null } }, stamp),
      () => Invoice.updateOne({ _id: row._id }, { $unset: { emailQueuedAt: 1 } }, stamp),
      () => Invoice.updateOne({ _id: row._id }, { $set: { state: 'issuing' } }, stamp),
      () => Invoice.updateMany({}, { $set: { emailQueuedAt: new Date() } }, stamp),
      () => Invoice.replaceOne({ _id: row._id }, { kind: 'invoice' } as never),
      () => Invoice.deleteOne({ _id: row._id }),
      () => Invoice.deleteMany({ _id: row._id }),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      expect((res.modifiedCount ?? 0) + (res.deletedCount ?? 0)).toBe(0);
    }
    const after = (await Invoice.findById(row._id).lean())!;
    expect(after.number).toBe(row.number);
    expect(after.total).toBe(row.total);
    expect(after.state).toBe('issued');
    expect(after.emailQueuedAt ?? null).toBeNull();
  });

  it('upsert with the marker never touches an existing issued row', async () => {
    const row = await makeIssued(await seedUser());
    // The guard filters the issued row out of the match; the upsert then collides on _id.
    await Invoice.updateOne(
      { _id: row._id },
      { $set: { emailQueuedAt: new Date() } },
      { timestamps: false, upsert: true },
    ).catch(() => undefined);
    const after = (await Invoice.findById(row._id).lean())!;
    expect(after.emailQueuedAt ?? null).toBeNull();
    expect(after.number).toBe(row.number);
    expect(after.state).toBe('issued');
    expect(await Invoice.countDocuments({ _id: row._id })).toBe(1);
  });

  it('the marker is not set on a row still issuing', async () => {
    const userId = await seedUser();
    const row = await recordInvoiceForPayment({
      paymentId: 'pay_issuing',
      userId: String(userId),
      amount: 100,
      paidAt: new Date(),
      description: 'd',
      source: 'order.paid',
    });
    const res = await Invoice.updateOne(
      { _id: row!._id },
      { $set: { emailQueuedAt: new Date() } },
      stamp,
    );
    expect(res.modifiedCount).toBe(0);
  });

  it('isEmailMarkerUpdate: only a lone $set of a Date on updateOne/findOneAndUpdate, no upsert', () => {
    const d = new Date();
    expect(isEmailMarkerUpdate('updateOne', { $set: { emailQueuedAt: d } }, {})).toBe(true);
    expect(isEmailMarkerUpdate('findOneAndUpdate', { $set: { emailQueuedAt: d } }, undefined)).toBe(
      true,
    );
    expect(isEmailMarkerUpdate('updateMany', { $set: { emailQueuedAt: d } }, {})).toBe(false);
    expect(isEmailMarkerUpdate('replaceOne', { $set: { emailQueuedAt: d } }, {})).toBe(false);
    expect(isEmailMarkerUpdate('updateOne', { $set: { emailQueuedAt: d } }, { upsert: true })).toBe(
      false,
    );
    expect(isEmailMarkerUpdate('updateOne', { $set: { emailQueuedAt: d, x: 1 } }, {})).toBe(false);
    expect(isEmailMarkerUpdate('updateOne', { $set: { emailQueuedAt: 1 } }, {})).toBe(false);
    expect(
      isEmailMarkerUpdate('updateOne', { $set: { emailQueuedAt: d }, $inc: { a: 1 } }, {}),
    ).toBe(false);
    expect(isEmailMarkerUpdate('updateOne', [{ $set: { emailQueuedAt: d } }], {})).toBe(false);
    expect(isEmailMarkerUpdate('updateOne', null, {})).toBe(false);
  });
});

// ── AC2: enqueue at issue ────────────────────────────────────────────────────

describe('email enqueued at issue (Arjun 2)', () => {
  it('invoice: one enqueue, ids only, template billing.taxInvoice, marker set', async () => {
    withRedis();
    const inv = await recordAndIssue({
      paymentId: 'pay_e1',
      amount: 123456,
      userFields: { name: 'Zainab Quraishi', email: 'zainab.q@example.com' },
    });
    await waitFor(
      async () => (await Invoice.findById(inv._id).lean())!.emailQueuedAt instanceof Date,
    );
    expect(enq).toHaveBeenCalledTimes(1);
    const job = enq.mock.calls[0][0];
    expect(job).toEqual({
      template: 'billing.taxInvoice',
      to: [],
      data: { userId: String(inv.userId), invoiceId: String(inv._id) },
      idempotencyKey: `invoice-${String(inv._id)}`,
    });
    expect(INVOICE_EMAIL_TEMPLATES).toEqual({
      invoice: 'billing.taxInvoice',
      credit_note: 'billing.creditNote',
    });
    expect(invoiceEmailJobId(inv._id)).toBe(`invoice-${String(inv._id)}`);
    expect(inv.customer!.name).toBe('Zainab Quraishi');
  });

  it('the job holds no name, email, number or amount anywhere', async () => {
    withRedis();
    const inv = await recordAndIssue({
      paymentId: 'pay_pii',
      amount: 123456,
      userFields: { name: 'Zainab Quraishi', email: 'zainab.q@example.com' },
    });
    await waitFor(() => enq.mock.calls.length === 1);
    const job = enq.mock.calls[0][0];
    expect(job.to).toEqual([]);
    expect(Object.keys(job.data).sort()).toEqual(['invoiceId', 'userId']);
    const wire = JSON.stringify(job);
    expect(inv.number).toBeTruthy();
    for (const secret of [
      'Zainab',
      'Quraishi',
      'zainab.q',
      '@example.com',
      inv.number!,
      '123456',
      '1234.56',
      inv.seller!.gstin,
      'Test Road',
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it('credit note: enqueued with billing.creditNote and its own id as the idempotency key', async () => {
    withRedis();
    const inv = await recordAndIssue({ paymentId: 'pay_cn' });
    await waitFor(() => enq.mock.calls.length === 1);
    enq.mockClear();
    const cn = await recordCreditNoteForRefund(refund('rf_cn', 'pay_cn', 10000));
    expect(await issueInvoice(cn!._id as mongoose.Types.ObjectId)).toBe('issued');
    await waitFor(() => enq.mock.calls.length === 1);
    expect(enq.mock.calls[0][0]).toEqual({
      template: 'billing.creditNote',
      to: [],
      data: { userId: String(inv.userId), invoiceId: String(cn!._id) },
      idempotencyKey: `invoice-${String(cn!._id)}`,
    });
    await waitFor(
      async () => (await Invoice.findById(cn!._id).lean())!.emailQueuedAt instanceof Date,
    );
  });

  it('the marker is set only after the enqueue resolves', async () => {
    withRedis();
    let release!: (v: unknown) => void;
    enq.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const inv = await recordAndIssue({ paymentId: 'pay_order' });
    await waitFor(() => enq.mock.calls.length === 1);
    await settle();
    expect((await Invoice.findById(inv._id).lean())!.emailQueuedAt ?? null).toBeNull();
    release({ jobId: 'x', queue: 'email-high', deduped: false });
    await waitFor(
      async () => (await Invoice.findById(inv._id).lean())!.emailQueuedAt instanceof Date,
    );
  });

  it('issuing is not delayed or failed by a hanging queue', async () => {
    withRedis();
    enq.mockImplementationOnce(() => new Promise(() => undefined));
    const inv = await recordAndIssue({ paymentId: 'pay_hang' });
    expect(inv.state).toBe('issued');
    expect(inv.emailQueuedAt ?? null).toBeNull();
  });

  it('with no REDIS_URL nothing is enqueued and the marker stays null', async () => {
    expect(env.REDIS_URL).toBe('');
    const warn = jest.spyOn(logger, 'warn');
    const inv = await recordAndIssue({ paymentId: 'pay_noredis' });
    await settle();
    expect(enq).not.toHaveBeenCalled();
    expect((await Invoice.findById(inv._id).lean())!.emailQueuedAt ?? null).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[1]).includes('REDIS_URL'))).toBe(true);
    expect(await queueInvoiceEmail(inv as never)).toBe('no_queue');
  });

  it('a failed enqueue leaves the marker null, logs only the error name, and the sweep retries once', async () => {
    withRedis();
    enq.mockRejectedValueOnce(
      Object.assign(new Error('redis://secret-host'), { name: 'ReplyError' }),
    );
    const error = jest.spyOn(logger, 'error');
    const inv = await recordAndIssue({ paymentId: 'pay_fail' });
    await waitFor(() => enq.mock.calls.length === 1);
    await settle();
    expect((await Invoice.findById(inv._id).lean())!.emailQueuedAt ?? null).toBeNull();
    expect(JSON.stringify(error.mock.calls)).toContain('ReplyError');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-host');

    const first = await runInvoiceSweep(later());
    expect(first.emailsQueued).toBe(1);
    expect(enq).toHaveBeenCalledTimes(2);
    expect(enq.mock.calls[1][0].idempotencyKey).toBe(`invoice-${String(inv._id)}`);
    expect((await Invoice.findById(inv._id).lean())!.emailQueuedAt).toBeInstanceOf(Date);

    const second = await runInvoiceSweep(later());
    expect(second.emailsQueued).toBe(0);
    expect(enq).toHaveBeenCalledTimes(2);
  });

  it('a failed marker write after a good enqueue leaves it null; the sweep re-enqueues with the same key', async () => {
    withRedis();
    const row = await makeIssued(await seedUser(), { issuedAt: new Date(Date.now() - 3 * 60_000) });
    jest.spyOn(Invoice, 'updateOne').mockRejectedValueOnce(new Error('write failed'));
    expect(await queueInvoiceEmail(row)).toBe('failed');
    expect(enq).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
    const counts = await runInvoiceSweep(later());
    expect(counts.emailsQueued).toBe(1);
    expect(enq).toHaveBeenCalledTimes(2);
    expect(enq.mock.calls[1][0].idempotencyKey).toBe(enq.mock.calls[0][0].idempotencyKey);
  });

  it('queueInvoiceEmail never throws and skips marked rows', async () => {
    withRedis();
    const row = await makeIssued(await seedUser(), { emailQueuedAt: new Date() });
    expect(await queueInvoiceEmail(row)).toBe('already_queued');
    expect(enq).not.toHaveBeenCalled();
    const issuing = await Invoice.create({
      kind: 'invoice',
      state: 'issuing',
      paymentId: 'pay_x',
      userId: row.userId,
      draft: { amount: 1, description: 'd', paidAt: new Date(), source: 'order.paid' },
    });
    expect(await queueInvoiceEmail(issuing)).toBe('not_emailed');
    expect(enq).not.toHaveBeenCalled();
  });

  it('backfilled invoices are emailed once at issue, with the same job shape (Addendum 7 #4b)', async () => {
    withRedis();
    const inv = await recordAndIssue({ paymentId: 'pay_bf_issue', source: 'backfill' });
    await waitFor(
      async () => (await Invoice.findById(inv._id).lean())!.emailQueuedAt instanceof Date,
    );
    expect(enq).toHaveBeenCalledTimes(1);
    expect(enq.mock.calls[0][0].template).toBe('billing.taxInvoice');
    // the sweep does not send it a second time
    expect((await runInvoiceSweep(later())).emailsQueued).toBe(0);
    expect(enq).toHaveBeenCalledTimes(1);
  });
});

// ── AC2: the sweep ───────────────────────────────────────────────────────────

describe('invoice sweep emails (Arjun 2)', () => {
  it('emails issued, unmarked rows older than 60 s, once; leaves younger ones alone', async () => {
    withRedis();
    const userId = await seedUser();
    const old = await makeIssued(userId, { seq: 1, issuedAt: new Date(Date.now() - 5 * 60_000) });
    const young = await makeIssued(userId, { seq: 2, issuedAt: new Date() });

    const counts = await runInvoiceSweep(new Date());
    expect(counts.emailsQueued).toBe(1);
    expect(enq).toHaveBeenCalledTimes(1);
    expect(enq.mock.calls[0][0].idempotencyKey).toBe(`invoice-${String(old._id)}`);
    expect((await Invoice.findById(young._id).lean())!.emailQueuedAt ?? null).toBeNull();

    // exactly at the 60 s boundary the row is still "young" (strictly older only)
    await runInvoiceSweep(new Date(young.issuedAt!.getTime() + 60_000));
    expect(enq).toHaveBeenCalledTimes(1);
    await runInvoiceSweep(new Date(young.issuedAt!.getTime() + 60_001));
    expect(enq).toHaveBeenCalledTimes(2);

    // nothing more on later runs
    expect((await runInvoiceSweep(later())).emailsQueued).toBe(0);
    expect(enq).toHaveBeenCalledTimes(2);
  });

  it('uses the credit-note template for credit notes and the invoice template for invoices', async () => {
    withRedis();
    const userId = await seedUser();
    const old = new Date(Date.now() - 5 * 60_000);
    const inv = await makeIssued(userId, { seq: 1, issuedAt: old });
    const cn = await makeIssued(userId, { kind: 'credit_note', seq: 1, issuedAt: old });
    await runInvoiceSweep(new Date());
    const byKey = new Map(enq.mock.calls.map((c) => [c[0].idempotencyKey, c[0].template]));
    expect(byKey.get(`invoice-${String(inv._id)}`)).toBe('billing.taxInvoice');
    expect(byKey.get(`invoice-${String(cn._id)}`)).toBe('billing.creditNote');
    expect(enq).toHaveBeenCalledTimes(2);
  });

  it('backfilled rows are emailed once by the sweep', async () => {
    withRedis();
    const userId = await seedUser();
    const row = await makeIssued(userId, {
      issuedAt: new Date(Date.now() - 5 * 60_000),
      draft: {
        amount: 79900,
        description: 'd',
        paidAt: new Date('2026-04-02T00:00:00Z'),
        source: 'backfill',
      },
    });
    expect((await runInvoiceSweep(new Date())).emailsQueued).toBe(1);
    expect(enq).toHaveBeenCalledTimes(1);
    expect(enq.mock.calls[0][0].data).toEqual({
      userId: String(userId),
      invoiceId: String(row._id),
    });
    expect((await Invoice.findById(row._id).lean())!.emailQueuedAt).toBeInstanceOf(Date);
    expect((await runInvoiceSweep(later())).emailsQueued).toBe(0);
    expect(enq).toHaveBeenCalledTimes(1);
  });

  it('does not email rows still issuing, or rows already marked', async () => {
    withRedis();
    const userId = await seedUser();
    await makeIssued(userId, { seq: 1, emailQueuedAt: new Date(), issuedAt: new Date(0) });
    await Invoice.create({
      kind: 'invoice',
      state: 'issuing',
      paymentId: 'pay_iss',
      userId,
      draft: { amount: 1, description: 'd', paidAt: new Date(), source: 'order.paid' },
    });
    // the issuing row would be issued by the sweep; make that impossible so only email logic runs
    const restore = withGstEnv({ GST_GSTIN: '' });
    try {
      await runInvoiceSweep(later());
    } finally {
      restore();
    }
    expect(enq).not.toHaveBeenCalled();
  });

  it('still runs while seller config blocks issuing', async () => {
    withRedis();
    const row = await makeIssued(await seedUser(), { issuedAt: new Date(Date.now() - 5 * 60_000) });
    const restore = withGstEnv({ GST_GSTIN: '' });
    try {
      const counts = await runInvoiceSweep(new Date());
      expect(counts.emailsQueued).toBe(1);
    } finally {
      restore();
    }
    expect((await Invoice.findById(row._id).lean())!.emailQueuedAt).toBeInstanceOf(Date);
  });

  it('with no REDIS_URL: nothing is enqueued, markers stay null, emailsPending counts the rows', async () => {
    const old = new Date(Date.now() - 5 * 60_000);
    const userId = await seedUser();
    await makeIssued(userId, { seq: 1, issuedAt: old });
    await makeIssued(userId, { seq: 2, issuedAt: old });
    const warn = jest.spyOn(logger, 'warn');
    const counts = await runInvoiceSweep(new Date());
    expect(counts).toMatchObject({ emailsQueued: 0, emailsPending: 2 });
    expect(enq).not.toHaveBeenCalled();
    expect(await Invoice.countDocuments({ emailQueuedAt: null })).toBe(2);
    expect(warn.mock.calls.some((c) => String(c[1]).includes('REDIS_URL'))).toBe(true);
  });

  it('a failing enqueue counts as pending and does not stop the rest of the run', async () => {
    withRedis();
    const old = new Date(Date.now() - 5 * 60_000);
    const userId = await seedUser();
    await makeIssued(userId, { seq: 1, issuedAt: new Date(old.getTime() - 1000) });
    await makeIssued(userId, { seq: 2, issuedAt: old });
    enq.mockRejectedValueOnce(new Error('down'));
    const counts = await runInvoiceSweep(new Date());
    expect(counts).toMatchObject({ emailsQueued: 1, emailsPending: 1 });
    expect(await Invoice.countDocuments({ emailQueuedAt: { $ne: null } })).toBe(1);
  });
});

// ── AC3: GET /internal/invoices/:id/email-view ───────────────────────────────

describe('GET /internal/invoices/:id/email-view (Arjun 1)', () => {
  const get = (id: string, secret: string | null = INTERNAL_SECRET) => {
    const r = request(app).get(`/internal/invoices/${id}/email-view`);
    return secret === null ? r : r.set('x-internal-secret', secret);
  };
  const EXACT_KEYS = [
    'customer',
    'downloadUrl',
    'invoiceId',
    'issuedAt',
    'kind',
    'number',
    'originalInvoiceNumber',
    'total',
    'userId',
  ];

  it('200 for an invoice: the exact field set, values from the row, original number null', async () => {
    const userId = await seedUser();
    const row = await makeIssued(userId, { seq: 7 });
    const res = await get(String(row._id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(EXACT_KEYS);
    expect(Object.keys(res.body.customer).sort()).toEqual(['email', 'name']);
    expect(res.body).toEqual({
      invoiceId: String(row._id),
      userId: String(userId),
      kind: 'invoice',
      number: 'LAW/2026-27/0007',
      issuedAt: row.issuedAt!.toISOString(),
      total: 79900,
      customer: { name: 'Asha Verma', email: 'asha@example.com' },
      originalInvoiceNumber: null,
      downloadUrl: `${env.FRONTEND_URL}/dashboard/settings`,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('200 for a credit note: carries originalInvoiceNumber', async () => {
    const userId = await seedUser();
    const cn = await makeIssued(userId, {
      kind: 'credit_note',
      seq: 3,
      total: 12000,
      originalInvoiceNumber: 'LAW/2026-27/0001',
    });
    const res = await get(String(cn._id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(EXACT_KEYS);
    expect(res.body).toMatchObject({
      kind: 'credit_note',
      number: 'LCN/2026-27/0003',
      total: 12000,
      originalInvoiceNumber: 'LAW/2026-27/0001',
    });
  });

  it('a real issued invoice and credit note round-trip through the view', async () => {
    const inv = await recordAndIssue({ paymentId: 'pay_rt', amount: 50000 });
    const cn = await recordCreditNoteForRefund(refund('rf_rt', 'pay_rt', 20000));
    await issueInvoice(cn!._id as mongoose.Types.ObjectId);
    const a = await get(String(inv._id));
    const b = await get(String(cn!._id));
    expect(a.body).toMatchObject({ kind: 'invoice', total: 50000, number: inv.number });
    expect(b.body).toMatchObject({
      kind: 'credit_note',
      total: 20000,
      originalInvoiceNumber: inv.number,
    });
  });

  it('carries no lines, tax split, seller details, case content or internal fields', async () => {
    const row = await makeIssued(await seedUser());
    const res = await get(String(row._id));
    const wire = JSON.stringify(res.body);
    for (const banned of [
      'lines',
      'cgst',
      'sgst',
      'igst',
      'taxable',
      'seller',
      'gstin',
      '20AAAAA0000A1Z5',
      'Test Road',
      'Test Proprietor',
      'sac',
      '998319',
      'placeOfSupply',
      'stateCode',
      'draft',
      'paymentId',
      'refundId',
      'emailQueuedAt',
      '_id',
      '__v',
      'Solo Monthly',
    ]) {
      expect(wire).not.toContain(banned);
    }
  });

  it('downloadUrl is FRONTEND_URL + /dashboard/settings, without a doubled slash', async () => {
    const row = await makeIssued(await seedUser());
    const restore = withGstEnv({ FRONTEND_URL: 'https://app.lawie.in/' });
    try {
      expect((await get(String(row._id))).body.downloadUrl).toBe(
        'https://app.lawie.in/dashboard/settings',
      );
    } finally {
      restore();
    }
  });

  it('401: no secret, wrong secret, right prefix, empty secret; the DB is not read', async () => {
    const id = String(new mongoose.Types.ObjectId());
    const find = jest.spyOn(Invoice, 'findById');
    expect((await get(id, null)).status).toBe(401);
    expect((await get(id, 'nope')).status).toBe(401);
    expect((await get(id, INTERNAL_SECRET.slice(0, -1))).status).toBe(401);
    expect((await get(id, `${INTERNAL_SECRET}x`)).status).toBe(401);
    expect(
      (await request(app).get(`/internal/invoices/${id}/email-view`).set('x-internal-secret', ''))
        .status,
    ).toBe(401);
    expect(find).not.toHaveBeenCalled();
    // the 401 comes before the id check
    expect((await get('not-an-id', 'nope')).status).toBe(401);
  });

  it('compares the secret in constant time (crypto.timingSafeEqual on equal-length digests)', async () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    await get(String(new mongoose.Types.ObjectId()), 'short');
    await get(String(new mongoose.Types.ObjectId()), 'x'.repeat(500));
    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls) {
      expect((a as Buffer).length).toBe(32);
      expect((b as Buffer).length).toBe(32);
    }
  });

  it('400 for an id that is not an ObjectId', async () => {
    expect((await get('nope')).status).toBe(400);
    expect((await get('123')).status).toBe(400);
  });

  it('404 for an id with no row', async () => {
    const res = await get(String(new mongoose.Types.ObjectId()));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('409 for a row that is not issued yet, and nothing of it is returned', async () => {
    const userId = await seedUser();
    const row = await recordInvoiceForPayment({
      paymentId: 'pay_409',
      userId: String(userId),
      amount: 100,
      paidAt: new Date(),
      description: 'd',
      source: 'order.paid',
    });
    const res = await get(String(row!._id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_issued' });
  });

  it('500 when the read fails, logging the error name only', async () => {
    const warn = jest.spyOn(logger, 'warn');
    jest.spyOn(Invoice, 'findById').mockImplementation(() => {
      throw Object.assign(new Error('mongodb://user:pw@host'), { name: 'MongoNetworkError' });
    });
    const res = await get(String(new mongoose.Types.ObjectId()));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'view_unavailable' });
    expect(JSON.stringify(warn.mock.calls)).toContain('MongoNetworkError');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user:pw');
  });

  it('is not reachable without the secret through the public invoice routes either', async () => {
    const row = await makeIssued(await seedUser());
    const res = await request(app)
      .get(`/internal/invoices/${String(row._id)}/email-view`)
      .set('x-user-id', String(row.userId))
      .set('x-user-role', 'Admin');
    expect(res.status).toBe(401);
  });
});

// ── AC4: plumbing (static) ───────────────────────────────────────────────────

describe('plumbing (static checks)', () => {
  const root = path.resolve(__dirname, '../../../..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('billing depends on @lawie/email-client', () => {
    const pkg = JSON.parse(read('apps/billing/package.json'));
    expect(pkg.dependencies['@lawie/email-client']).toBeDefined();
  });

  it('REDIS_URL is optional: the env schema defaults it to empty (this suite boots without it)', () => {
    expect(read('apps/billing/src/config/env.ts')).toMatch(
      /REDIS_URL:\s*z\.string\(\)\.default\(''\)/,
    );
    expect(env.REDIS_URL).toBe('');
  });

  it('ci.yml: the billing filter lists packages/email-client/** and Test - Billing builds email-client', () => {
    const ci = read('.github/workflows/ci.yml');
    const filter = ci.match(/\n\s+billing:\n((?:\s+- '.*'\n)+)/);
    expect(filter).not.toBeNull();
    expect(filter![1]).toContain("'apps/billing/**'");
    expect(filter![1]).toContain("'packages/email-client/**'");
    const job = ci.slice(
      ci.indexOf('yarn workspace @lawie/billing test') - 1500,
      ci.indexOf('yarn workspace @lawie/billing test'),
    );
    expect(job).toContain('yarn workspace @lawie/email-client build');
  });

  it('the Dockerfile copies, builds and ships email-client', () => {
    const d = read('apps/billing/Dockerfile');
    expect(d).toContain('COPY packages/email-client/package.json ./packages/email-client/');
    expect(d).toContain('COPY packages/email-client/ ./packages/email-client/');
    expect(d).toContain('yarn workspace @lawie/email-client build');
    expect(d).toContain('COPY --from=builder /app/packages/email-client/dist');
  });
});
