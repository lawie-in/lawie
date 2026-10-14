import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { InvoiceCounter } from '../models/InvoiceCounter.model';
import { recordCreditNoteForRefund } from '../services/invoice.service';
import { runInvoiceSweep } from '../services/invoice-sweep.service';

import {
  orderPaidPayload,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  webhook,
  withGstEnv,
} from './t436-helpers';

// T-436 AC7: credit note on refund.processed — own series, refers to the original number and
// date, same tax split, refundId unique; no original: warning and nothing; refund larger than
// the invoice: error and nothing.

afterEach(() => jest.restoreAllMocks());

async function invoiceFor(
  userFields: Record<string, unknown> = { gstStateCode: '27' },
  amount = 79900,
) {
  const userId = await seedUser(userFields);
  await seedSub(userId);
  await webhook('subscription.charged', subPayload({ amount }));
  return { userId, original: (await Invoice.findOne({ kind: 'invoice' }).lean())! };
}

describe('credit note on refund.processed (AC7)', () => {
  it('full refund, inter-state: LCN number, refers to the original, same split, IGST', async () => {
    const { userId, original } = await invoiceFor({ gstStateCode: '27' });
    const res = await webhook('refund.processed', refundPayload({ amount: 79900 }));
    expect(res.status).toBe(200);
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect(cn.state).toBe('issued');
    expect(cn.number).toMatch(/^LCN\/\d{4}-\d{2}\/0001$/);
    expect(cn.number!.length).toBeLessThanOrEqual(16);
    expect(cn.refundId).toBe('rfnd_t436');
    expect(cn.paymentId).toBe(original.paymentId);
    expect(String(cn.userId)).toBe(String(userId));
    expect(String(cn.originalInvoiceId)).toBe(String(original._id));
    expect(cn.originalInvoiceNumber).toBe(original.number);
    expect(cn.originalInvoiceDate).toEqual(original.issuedAt);
    expect(cn).toMatchObject({
      price: 79900,
      taxable: 67712,
      cgst: 0,
      sgst: 0,
      igst: 12188,
      total: 79900,
    });
    expect(cn.placeOfSupply).toEqual(original.placeOfSupply);
    expect(cn.customer).toEqual(original.customer);
    expect(cn.lines![0].description).toBe(original.lines![0].description);
    // The original is untouched.
    expect(await Invoice.countDocuments({ kind: 'invoice', number: original.number })).toBe(1);
  });

  it('intra-state original: the credit note splits into CGST+SGST', async () => {
    await invoiceFor({ gstStateCode: '20' });
    await webhook('refund.processed', refundPayload({ amount: 79900 }));
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect([cn.taxable, cn.cgst, cn.sgst, cn.igst]).toEqual([67712, 6094, 6094, 0]);
  });

  it("reverses at the original's split even if the customer's State changed since", async () => {
    const { userId } = await invoiceFor({ gstStateCode: '27' });
    await mongoose.connection
      .db!.collection('users')
      .updateOne({ _id: userId }, { $set: { gstStateCode: '20' } });
    await webhook('refund.processed', refundPayload({}));
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect(cn.igst).toBe(12188);
    expect(cn.cgst).toBe(0);
    expect(cn.placeOfSupply!.code).toBe('27');
  });

  it('a partial refund credits the refunded amount, parts summing exactly', async () => {
    await invoiceFor({ gstStateCode: '20' });
    await webhook('refund.processed', refundPayload({ amount: 12345 }));
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect(cn.price).toBe(12345);
    expect(cn.taxable! + cn.cgst! + cn.sgst! + cn.igst!).toBe(12345);
    expect(cn.igst).toBe(0);
  });

  it('a top-up refund works the same way', async () => {
    const userId = String(await seedUser({ gstStateCode: '27' }));
    await webhook('order.paid', orderPaidPayload({ userId, amount: 19900 }));
    await webhook('refund.processed', refundPayload({ paymentId: 'pay_top_t436', amount: 19900 }));
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect(cn.price).toBe(19900);
    expect(cn.lines![0].description).toBe('Lawie Ink top-up — 10 Ink');
  });

  it('refundId is unique: a redelivered event gives one credit note', async () => {
    await invoiceFor();
    for (let i = 0; i < 3; i += 1) {
      expect((await webhook('refund.processed', refundPayload({}))).status).toBe(200);
    }
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
    expect((await InvoiceCounter.findOne({ series: 'credit_note' }).lean())!.seq).toBe(1);
  });

  it('two different refunds of one payment get two credit notes, numbered in order', async () => {
    await invoiceFor();
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_a', amount: 10000 }));
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_b', amount: 20000 }));
    const cns = await Invoice.find({ kind: 'credit_note' }).sort({ seq: 1 }).lean();
    expect(cns.map((c) => [c.refundId, c.seq])).toEqual([
      ['rfnd_a', 1],
      ['rfnd_b', 2],
    ]);
  });

  it('refundId has a unique index', async () => {
    await Invoice.init();
    const idx = await Invoice.collection.indexes();
    expect(idx.some((i) => i.unique && 'refundId' in i.key)).toBe(true);
  });

  it('no original invoice: a warning and no credit note (and no number used)', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const res = await webhook(
      'refund.processed',
      refundPayload({ paymentId: 'pay_never_invoiced' }),
    );
    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({})).toBe(0);
    expect(await InvoiceCounter.countDocuments({})).toBe(0);
    expect(warn.mock.calls.some((c) => String(c[1]).includes('no invoice'))).toBe(true);
  });

  it('a payment from before GST_EFFECTIVE_FROM has no invoice, so no credit note', async () => {
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '2027-01-01' });
    try {
      const userId = await seedUser();
      await seedSub(userId);
      await webhook('subscription.charged', subPayload());
      expect(await Invoice.countDocuments({})).toBe(0);
      await webhook('refund.processed', refundPayload({}));
      expect(await Invoice.countDocuments({})).toBe(0);
    } finally {
      restore();
    }
  });

  it('refund larger than the invoice: an error is logged and nothing is recorded', async () => {
    await invoiceFor();
    const error = jest.spyOn(logger, 'error');
    const res = await webhook('refund.processed', refundPayload({ amount: 79901 }));
    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(0);
    expect(await InvoiceCounter.countDocuments({ series: 'credit_note' })).toBe(0);
    expect(error.mock.calls.some((c) => String(c[1]).includes('exceeds'))).toBe(true);
  });

  it('several partial refunds within the invoiced total all pass; one that would exceed it is rejected and nothing is recorded', async () => {
    await invoiceFor(); // 79900
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_p1', amount: 50000 }));
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_p2', amount: 29900 }));
    expect(await Invoice.countDocuments({ kind: 'credit_note', state: 'issued' })).toBe(2);
    const seqBefore = (await InvoiceCounter.findOne({ series: 'credit_note' }).lean())!.seq;
    const error = jest.spyOn(logger, 'error');
    const res = await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_p3', amount: 1 }),
    );
    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(2);
    expect(await Invoice.countDocuments({ refundId: 'rfnd_p3' })).toBe(0);
    expect((await InvoiceCounter.findOne({ series: 'credit_note' }).lean())!.seq).toBe(seqBefore);
    expect(error.mock.calls.some((c) => String(c[1]).includes('exceeds'))).toBe(true);
  });

  it('a partial refund whose cumulative total exceeds the invoice is rejected even though it alone is smaller', async () => {
    await invoiceFor();
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_q1', amount: 60000 }));
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_q2', amount: 30000 }));
    const credited = await Invoice.find({ kind: 'credit_note' }).lean();
    expect(credited.map((c) => c.refundId)).toEqual(['rfnd_q1']);
  });

  it('a retried refundId returns its existing credit note, even once the invoice is fully credited', async () => {
    await invoiceFor();
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_r1', amount: 79900 }));
    const first = (await Invoice.findOne({ refundId: 'rfnd_r1' }).lean())!;
    const rec = await recordCreditNoteForRefund({
      refundId: 'rfnd_r1',
      paymentId: 'pay_t436',
      amount: 79900,
      processedAt: new Date(),
    });
    expect(String(rec!._id)).toBe(String(first._id));
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
    expect((await webhook('refund.processed', refundPayload({ refundId: 'rfnd_r1' }))).status).toBe(
      200,
    );
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(1);
  });

  it('a refund that is not processed, or has no usable entity, records nothing', async () => {
    await invoiceFor();
    await webhook('refund.processed', refundPayload({ status: 'pending' }));
    await webhook('refund.processed', refundPayload({ status: 'failed' }));
    await webhook('refund.processed', {});
    await webhook('refund.processed', { refund: { entity: { id: 'rfnd_x', amount: 'lots' } } });
    await webhook('refund.processed', refundPayload({ amount: 0 }));
    expect(await Invoice.countDocuments({ kind: 'credit_note' })).toBe(0);
  });

  it('a credit note is immutable like an invoice', async () => {
    await invoiceFor();
    await webhook('refund.processed', refundPayload({}));
    const cn = (await Invoice.findOne({ kind: 'credit_note' }))!;
    expect((await Invoice.updateOne({ _id: cn._id }, { $set: { price: 1 } })).modifiedCount).toBe(
      0,
    );
    expect((await Invoice.deleteOne({ _id: cn._id })).deletedCount).toBe(0);
    cn.price = 1;
    await expect(cn.save()).rejects.toThrow(/immutable/);
  });

  it('the original still unissued (config missing): the credit note waits; the sweep issues invoice then credit note', async () => {
    const userId = await seedUser({ gstStateCode: '27' });
    await seedSub(userId);
    const restore = withGstEnv({ GST_GSTIN: '' });
    try {
      await webhook('subscription.charged', subPayload());
      await webhook('refund.processed', refundPayload({}));
      const rows = await Invoice.find({}).lean();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.state === 'issuing')).toBe(true);
    } finally {
      restore();
    }
    const counts = await runInvoiceSweep(new Date(Date.now() + 5 * 60 * 1000));
    expect(counts.issued).toBe(2);
    const inv = (await Invoice.findOne({ kind: 'invoice' }).lean())!;
    const cn = (await Invoice.findOne({ kind: 'credit_note' }).lean())!;
    expect(inv.state).toBe('issued');
    expect(cn.state).toBe('issued');
    expect(cn.originalInvoiceNumber).toBe(inv.number);
    expect(cn.originalInvoiceDate).toEqual(inv.issuedAt);
    expect(cn.igst).toBe(12188);
  });
});
