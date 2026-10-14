import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

type FakeableAPI = NonNullable<
  NonNullable<Parameters<typeof jest.useFakeTimers>[0]> extends infer C
    ? C extends { doNotFake?: infer D }
      ? D extends Array<infer E>
        ? E
        : never
      : never
    : never
>;

import { Invoice } from '../models/Invoice.model';
import { InvoiceCounter } from '../models/InvoiceCounter.model';
import {
  InvoiceSeriesExhaustedError,
  MAX_INVOICE_SEQ,
  issueInvoice,
  recordInvoiceForPayment,
} from '../services/invoice.service';
import { runInvoiceSweep } from '../services/invoice-sweep.service';

import { refundPayload, seedSub, seedUser, subPayload, webhook } from './t436-helpers';

// T-436 AC3: per-FY sequential numbers, no gaps, no reuse, FY rolls on 1 April IST,
// allocated only on a confirmed payment.

const FAKE_DATE_ONLY: { doNotFake: FakeableAPI[] } = {
  doNotFake: [
    'nextTick',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
    'queueMicrotask',
    'performance',
    'hrtime',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
  ],
};

async function record(paymentId: string, paidAt = new Date('2026-03-01T00:00:00Z')) {
  const row = await recordInvoiceForPayment({
    paymentId,
    userId: String(new mongoose.Types.ObjectId()),
    amount: 79900,
    paidAt,
    description: 'd',
    source: 'backfill',
  });
  return row!._id as mongoose.Types.ObjectId;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('invoice numbers', () => {
  it('are LAW/{fy}/{4 digits}, sequential from 0001 within a financial year', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: new Date('2026-10-14T06:00:00Z') });
    for (let i = 1; i <= 5; i += 1) {
      await issueInvoice(await record(`pay_${i}`));
    }
    const rows = await Invoice.find({}).sort({ seq: 1 }).lean();
    expect(rows.map((r) => r.number)).toEqual([
      'LAW/2026-27/0001',
      'LAW/2026-27/0002',
      'LAW/2026-27/0003',
      'LAW/2026-27/0004',
      'LAW/2026-27/0005',
    ]);
    expect(rows.every((r) => r.fy === '2026-27' && r.number!.length <= 16)).toBe(true);
  });

  it('roll on 1 April IST: the last second of March is the old FY, midnight IST is a new series at 0001', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: new Date('2027-03-31T18:29:59Z') });
    const a = await record('pay_a');
    await issueInvoice(a);
    jest.setSystemTime(new Date('2027-03-31T18:30:00Z'));
    const b = await record('pay_b');
    await issueInvoice(b);
    jest.setSystemTime(new Date('2027-04-02T00:00:00Z'));
    const c = await record('pay_c');
    await issueInvoice(c);
    const rows = await Invoice.find({}).sort({ paymentId: 1 }).lean();
    expect(rows.map((r) => r.number)).toEqual([
      'LAW/2026-27/0001',
      'LAW/2027-28/0001',
      'LAW/2027-28/0002',
    ]);
    expect(await InvoiceCounter.countDocuments({ series: 'invoice' })).toBe(2);
  });

  it('the credit note series is separate (LCN) and has its own sequence', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_cn' }));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_cn2', paidCount: 2 }));
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_1', paymentId: 'pay_cn2' }));
    const inv = await Invoice.find({ kind: 'invoice' }).sort({ seq: 1 }).lean();
    const cn = await Invoice.find({ kind: 'credit_note' }).lean();
    expect(inv.map((r) => r.seq)).toEqual([1, 2]);
    expect(cn).toHaveLength(1);
    expect(cn[0].seq).toBe(1);
    expect(cn[0].number).toMatch(/^LCN\/\d{4}-\d{2}\/0001$/);
    expect(cn[0].number!.length).toBeLessThanOrEqual(16);
  });

  it('are only allocated for a confirmed payment: failed ones leave no gap', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_1', paidCount: 1 }));
    await webhook(
      'subscription.charged',
      subPayload({ paymentId: 'pay_f1', status: 'failed', paidCount: 2 }),
    );
    await webhook(
      'subscription.charged',
      subPayload({ paymentId: 'pay_f2', status: 'refunded', paidCount: 2 }),
    );
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_2', paidCount: 2 }));
    const rows = await Invoice.find({}).sort({ seq: 1 }).lean();
    expect(rows.map((r) => [r.paymentId, r.seq])).toEqual([
      ['pay_1', 1],
      ['pay_2', 2],
    ]);
    expect((await InvoiceCounter.findOne({ series: 'invoice' }).lean())!.seq).toBe(2);
  });

  it('a recorded but unissued payment (config missing) consumes no number', async () => {
    await record('pay_unissued');
    expect(await InvoiceCounter.countDocuments({})).toBe(0);
  });

  it('concurrent issues never duplicate a number; after the sweep they are exactly 1..N', async () => {
    const N = 8;
    const ids: mongoose.Types.ObjectId[] = [];
    for (let i = 0; i < N; i += 1) {
      ids.push(await record(`pay_c${i}`, new Date(Date.UTC(2026, 2, 1, 0, i))));
    }
    const results = await Promise.allSettled(ids.map((id) => issueInvoice(id)));
    // Contention may leave some for the sweep (InvoiceSeriesBusyError), never a duplicate.
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as Error).name).toBe('InvoiceSeriesBusyError');
    }
    await runInvoiceSweep(new Date(Date.now() + 5 * 60 * 1000));
    await runInvoiceSweep(new Date(Date.now() + 5 * 60 * 1000));
    const rows = await Invoice.find({ state: 'issued' }).lean();
    expect(rows).toHaveLength(N);
    const seqs = rows.map((r) => r.seq!).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(new Set(rows.map((r) => r.number)).size).toBe(N);
    const counter = (await InvoiceCounter.findOne({ series: 'invoice' }).lean())!;
    expect(counter.seq).toBe(N);
    expect(counter.pendingInvoiceId ?? null).toBeNull();
  });

  it('the (kind, fy, number) unique index refuses a reused number', async () => {
    await Invoice.init();
    const a = await record('pay_x');
    const b = await record('pay_y');
    await issueInvoice(a);
    const first = (await Invoice.findById(a).lean())!;
    await expect(
      mongoose.connection
        .db!.collection('invoices')
        .updateOne({ _id: b }, { $set: { number: first.number, fy: first.fy, state: 'issued' } }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('stops at 9999 per series per FY rather than make a 17-character number', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: new Date('2026-10-14T06:00:00Z') });
    await InvoiceCounter.create({ fy: '2026-27', series: 'invoice', seq: MAX_INVOICE_SEQ });
    const id = await record('pay_full');
    await expect(issueInvoice(id)).rejects.toBeInstanceOf(InvoiceSeriesExhaustedError);
    const row = (await Invoice.findById(id).lean())!;
    expect(row.state).toBe('issuing');
    expect(row.number).toBeUndefined();
    // The last number, 9999, was a valid 16-character number.
    await InvoiceCounter.updateOne({ fy: '2026-27' }, { $set: { seq: MAX_INVOICE_SEQ - 1 } });
    await issueInvoice(id);
    expect((await Invoice.findById(id).lean())!.number).toBe('LAW/2026-27/9999');
  });
});

describe('the pending counter (crash between allocating and writing)', () => {
  it('blocks any other allocation until the held row is finished, then continues after the same number', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: new Date('2026-10-14T06:00:00Z') });
    const held = await record('pay_held', new Date('2026-03-01T00:00:00Z'));
    const other = await record('pay_other', new Date('2026-03-02T00:00:00Z'));
    await InvoiceCounter.create({
      fy: '2026-27',
      series: 'invoice',
      seq: 3,
      pendingInvoiceId: held,
      pendingIssuedAt: new Date('2026-10-14T05:00:00Z'),
    });
    expect(await issueInvoice(other)).toBe('issued');
    const h = (await Invoice.findById(held).lean())!;
    const o = (await Invoice.findById(other).lean())!;
    expect(h.number).toBe('LAW/2026-27/0003');
    expect(h.issuedAt).toEqual(new Date('2026-10-14T05:00:00Z'));
    expect(o.number).toBe('LAW/2026-27/0004');
  });

  it('a pending number whose invoice row is gone is released, not reused (logged for a human)', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: new Date('2026-10-14T06:00:00Z') });
    await InvoiceCounter.create({
      fy: '2026-27',
      series: 'invoice',
      seq: 5,
      pendingInvoiceId: new mongoose.Types.ObjectId(),
      pendingIssuedAt: new Date('2026-10-14T05:00:00Z'),
    });
    const id = await record('pay_after');
    expect(await issueInvoice(id)).toBe('issued');
    expect((await Invoice.findById(id).lean())!.number).toBe('LAW/2026-27/0006');
  });
});
