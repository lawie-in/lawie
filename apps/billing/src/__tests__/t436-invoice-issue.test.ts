import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { InvoiceCounter } from '../models/InvoiceCounter.model';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import * as inkLedger from '../services/ink-ledger.service';
import { issueInvoice, recordInvoiceForPayment } from '../services/invoice.service';
import { runInvoiceSweep } from '../services/invoice-sweep.service';

import {
  orderPaidPayload,
  paymentCapturedPayload,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  webhook,
  withGstEnv,
} from './t436-helpers';

// T-436 AC1 (one invoice per captured payment), AC2 (amount from the payment entity),
// AC4 (place of supply), AC5 (immutable), AC6 (missing config), AC11, AC13 — through the webhook.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

const invoices = () => Invoice.find({}).lean();
const SERIES = /^LAW\/\d{4}-\d{2}\/\d{4}$/;
const FUTURE = () => new Date(Date.now() + 5 * 60 * 1000);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('subscription.charged (AC1, AC2, AC11)', () => {
  it('issues one invoice for a monthly charge, amounts from the payment entity', async () => {
    const userId = await seedUser({ gstStateCode: '27', name: 'Asha Verma' });
    await seedSub(userId);
    const res = await webhook('subscription.charged', subPayload({ amount: 79900 }));
    expect(res.status).toBe(200);
    const rows = await invoices();
    expect(rows).toHaveLength(1);
    const inv = rows[0];
    expect(inv).toMatchObject({
      kind: 'invoice',
      state: 'issued',
      paymentId: 'pay_t436',
      price: 79900,
      taxable: 67712,
      cgst: 0,
      sgst: 0,
      igst: 12188,
      total: 79900,
    });
    expect(inv.number).toMatch(SERIES);
    expect(inv.number!.length).toBeLessThanOrEqual(16);
    expect(inv.seq).toBe(1);
    expect(inv.lines).toEqual([
      {
        description: 'Lawie subscription — Solo Monthly, 1 Mar 2026 to 31 Mar 2026',
        sac: '998319',
        ratePercent: 18,
        quantity: 1,
        taxable: 67712,
        amount: 79900,
      },
    ]);
    expect(inv.draft).toMatchObject({
      source: 'subscription.charged',
      razorpaySubscriptionId: 'sub_t436',
    });
    expect(inv.seller).toMatchObject({
      gstin: '20AAAAA0000A1Z5',
      stateCode: '20',
      stateName: 'Jharkhand',
    });
    expect(inv.customer).toMatchObject({ name: 'Asha Verma', stateCode: '27' });
    expect(String(inv.userId)).toBe(String(userId));
  });

  it('uses the amount on the payment (coupon), not the SKU price', async () => {
    const userId = await seedUser({ gstStateCode: '20' });
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ amount: 59900 }));
    const inv = (await invoices())[0];
    expect(inv.price).toBe(59900);
    expect(inv.total).toBe(59900);
    expect(inv.taxable! + inv.cgst! + inv.sgst! + inv.igst!).toBe(59900);
  });

  it('every monthly or yearly charge gets its own invoice (different payment ids)', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_m1', paidCount: 1 }));
    await webhook(
      'subscription.charged',
      subPayload({
        paymentId: 'pay_m2',
        paidCount: 2,
        start: '2026-03-31T00:00:00Z',
        end: '2026-04-30T00:00:00Z',
      }),
    );
    const rows = await Invoice.find({}).sort({ seq: 1 }).lean();
    expect(rows.map((r) => r.paymentId)).toEqual(['pay_m1', 'pay_m2']);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it('a yearly plan: description names the plan; amount is the yearly charge', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    await webhook(
      'subscription.charged',
      subPayload({ planId: 'pro_yearly', amount: 1_999_000, end: '2027-03-01T00:00:00Z' }),
    );
    const inv = (await invoices())[0];
    expect(inv.lines![0].description).toBe(
      'Lawie subscription — Pro Yearly, 1 Mar 2026 to 1 Mar 2027',
    );
    expect(inv.price).toBe(1_999_000);
  });

  it('a duplicate delivery of the same event leaves one invoice and one number', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    for (let i = 0; i < 3; i += 1) {
      expect((await webhook('subscription.charged', subPayload())).status).toBe(200);
    }
    expect(await Invoice.countDocuments({})).toBe(1);
    expect((await InvoiceCounter.findOne({ series: 'invoice' }).lean())!.seq).toBe(1);
  });

  it('still issues when the cycle was already granted (retry after a crash)', async () => {
    const userId = await seedUser();
    await seedSub(userId, 'sub_t436', {
      lastGrantedPaidCount: 1,
      lastGrantedPeriodStart: new Date('2026-03-01T00:00:00Z'),
      grantClaimState: 'granted',
    });
    const grant = jest.spyOn(inkLedger, 'grantSubscriptionInk');
    expect((await webhook('subscription.charged', subPayload())).status).toBe(200);
    expect(grant).not.toHaveBeenCalled();
    expect(await Invoice.countDocuments({ state: 'issued' })).toBe(1);
  });

  it('never issues on subscription.activated, even with a captured payment entity', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    expect((await webhook('subscription.activated', subPayload())).status).toBe(200);
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it('a subscription payment.captured event never issues (and the charge then issues once)', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    const captured = {
      payment: {
        entity: { id: 'pay_t436', amount: 79900, status: 'captured', created_at: 1_772_323_210 },
      },
    };
    expect((await webhook('payment.captured', captured)).status).toBe(200);
    expect(await Invoice.countDocuments({})).toBe(0);
    await webhook('subscription.charged', subPayload());
    await webhook('payment.captured', captured);
    expect(await Invoice.countDocuments({})).toBe(1);
  });

  it.each(['failed', 'refunded', 'authorized', 'created'])(
    'no invoice for a %s payment',
    async (status) => {
      const userId = await seedUser();
      await seedSub(userId);
      expect((await webhook('subscription.charged', subPayload({ status }))).status).toBe(200);
      expect(await Invoice.countDocuments({})).toBe(0);
    },
  );

  it('no invoice when the charge carries no payment entity, or a zero amount (Free Ink)', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ paymentId: null }));
    await webhook('subscription.charged', subPayload({ amount: 0, paidCount: 2 }));
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it('no invoice for a payment before GST_EFFECTIVE_FROM; one exactly at it (midnight IST)', async () => {
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '2026-10-01' });
    try {
      const userId = await seedUser();
      await seedSub(userId);
      await webhook(
        'subscription.charged',
        subPayload({ paymentId: 'pay_before', createdAt: '2026-09-30T18:29:59Z', paidCount: 1 }),
      );
      expect(await Invoice.countDocuments({})).toBe(0);
      await webhook(
        'subscription.charged',
        subPayload({
          paymentId: 'pay_at',
          createdAt: '2026-09-30T18:30:00Z',
          paidCount: 2,
          start: '2026-10-01T00:00:00Z',
          end: '2026-10-31T00:00:00Z',
        }),
      );
      const rows = await invoices();
      expect(rows.map((r) => r.paymentId)).toEqual(['pay_at']);
    } finally {
      restore();
    }
  });

  describe('plan in the line when the SKU is unknown (AC11)', () => {
    const run = async (notes: Record<string, unknown> | undefined) => {
      const userId = await seedUser();
      await seedSub(userId);
      const p = subPayload({ notes: notes ?? {} });
      expect((await webhook('subscription.charged', p)).status).toBe(200);
      return (await invoices())[0].lines![0].description;
    };

    it('takes tier/cycle from the charge notes when they name a plan we sell', async () => {
      expect(await run({ tier: 'solo', cycle: 'yearly' })).toBe(
        'Lawie subscription — Solo Yearly, 1 Mar 2026 to 31 Mar 2026',
      );
    });

    it('with unsellable or absent notes: exactly "Lawie subscription — {period}", never Pro', async () => {
      const a = await run({ tier: 'platinum', cycle: 'yearly' });
      expect(a).toBe('Lawie subscription — 1 Mar 2026 to 31 Mar 2026');
      await Invoice.deleteMany({});
      await Subscription.deleteMany({});
      const b = await run(undefined);
      expect(b).toBe('Lawie subscription — 1 Mar 2026 to 31 Mar 2026');
      expect(b).not.toMatch(/pro/i);
    });
  });
});

describe('top-ups (AC1, AC2, AC11)', () => {
  it('order.paid issues an invoice from the payment amount (coupon applied)', async () => {
    const userId = await seedUser({ gstStateCode: '20' });
    const res = await webhook(
      'order.paid',
      orderPaidPayload({ userId: String(userId), amount: 17900 }),
    );
    expect(res.status).toBe(200);
    const rows = await invoices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      price: 17900,
      state: 'issued',
      paymentId: 'pay_top_t436',
    });
    expect(rows[0].lines![0].description).toBe('Lawie Ink top-up — 10 Ink');
    expect(rows[0].draft).toMatchObject({ source: 'order.paid', razorpayOrderId: 'order_t436' });
    expect(rows[0].cgst! + rows[0].sgst! + rows[0].taxable!).toBe(17900);
  });

  it('order.paid and payment.captured for the same payment give one invoice (either order)', async () => {
    const userId = String(await seedUser());
    await webhook('order.paid', orderPaidPayload({ userId }));
    await webhook('payment.captured', paymentCapturedPayload({ userId }));
    await webhook('order.paid', orderPaidPayload({ userId }));
    expect(await Invoice.countDocuments({})).toBe(1);

    await Invoice.deleteMany({ state: 'issuing' });
    const other = String(await seedUser());
    await webhook(
      'payment.captured',
      paymentCapturedPayload({
        userId: other,
        orderId: 'order_b',
        paymentId: 'pay_b',
        skuId: 'topup_max',
        amount: 49900,
      }),
    );
    await webhook(
      'order.paid',
      orderPaidPayload({
        userId: other,
        orderId: 'order_b',
        paymentId: 'pay_b',
        skuId: 'topup_max',
        amount: 49900,
      }),
    );
    const rows = await Invoice.find({ paymentId: 'pay_b' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].lines![0].description).toBe('Lawie Ink top-up — 28 Ink');
    expect(rows[0].draft.source).toBe('payment.captured');
    expect(await Invoice.countDocuments({})).toBe(2);
  });

  it('issues even when the grant returns 0 (already granted: a retry after a crash)', async () => {
    const userId = String(await seedUser());
    expect(
      await inkLedger.grantTopupInk({
        userId,
        inkUnits: 20,
        amountInr: 199,
        razorpayOrderId: 'order_t436',
        razorpayPaymentId: 'pay_top_t436',
        topupSkuId: 'topup_mid',
      }),
    ).toBe(20);
    expect(await Invoice.countDocuments({})).toBe(0);
    await webhook('order.paid', orderPaidPayload({ userId }));
    expect(await Invoice.countDocuments({ state: 'issued' })).toBe(1);
  });

  it.each(['failed', 'refunded', 'authorized'])(
    'no invoice for a %s top-up payment',
    async (status) => {
      const userId = String(await seedUser());
      await webhook('order.paid', orderPaidPayload({ userId, status }));
      await webhook('payment.captured', paymentCapturedPayload({ userId, status }));
      expect(await Invoice.countDocuments({})).toBe(0);
    },
  );

  it('no invoice for an unknown SKU or a top-up before GST_EFFECTIVE_FROM', async () => {
    const userId = String(await seedUser());
    await webhook('order.paid', orderPaidPayload({ userId, skuId: 'topup_nope' }));
    expect(await Invoice.countDocuments({})).toBe(0);
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '2027-01-01' });
    try {
      await webhook('order.paid', orderPaidPayload({ userId }));
      expect(await Invoice.countDocuments({})).toBe(0);
    } finally {
      restore();
    }
  });

  it('a top-up for a user id that is not an ObjectId records nothing and does not 500', async () => {
    const res = await webhook('order.paid', orderPaidPayload({ userId: 'not-an-id' }));
    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({})).toBe(0);
  });
});

describe('record step guards', () => {
  const base = {
    paymentId: 'pay_g',
    amount: 100,
    paidAt: new Date('2026-03-01T00:00:00Z'),
    description: 'd',
    source: 'backfill' as const,
  };

  it('returns null for missing id, bad user, non-positive or fractional amounts', async () => {
    const userId = String(new mongoose.Types.ObjectId());
    expect(await recordInvoiceForPayment({ ...base, userId, paymentId: '' })).toBeNull();
    expect(await recordInvoiceForPayment({ ...base, userId: 'bad' })).toBeNull();
    expect(await recordInvoiceForPayment({ ...base, userId, amount: 0 })).toBeNull();
    expect(await recordInvoiceForPayment({ ...base, userId, amount: -5 })).toBeNull();
    expect(await recordInvoiceForPayment({ ...base, userId, amount: 10.5 })).toBeNull();
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it('is idempotent on the payment id; the second call returns the same row', async () => {
    const userId = String(new mongoose.Types.ObjectId());
    const a = await recordInvoiceForPayment({ ...base, userId });
    const b = await recordInvoiceForPayment({ ...base, userId });
    expect(String(a!._id)).toBe(String(b!._id));
    await issueInvoice(a!._id as mongoose.Types.ObjectId);
    const c = await recordInvoiceForPayment({ ...base, userId });
    expect(c!.state).toBe('issued');
    expect(await Invoice.countDocuments({})).toBe(1);
  });

  it('issueInvoice: not_found, already_issued', async () => {
    expect(await issueInvoice(new mongoose.Types.ObjectId())).toBe('not_found');
    const row = await recordInvoiceForPayment({
      ...base,
      userId: String(new mongoose.Types.ObjectId()),
    });
    expect(await issueInvoice(row!._id as mongoose.Types.ObjectId)).toBe('issued');
    expect(await issueInvoice(String(row!._id))).toBe('already_issued');
    expect((await InvoiceCounter.findOne({}).lean())!.seq).toBe(1);
  });
});

describe('place of supply (AC4)', () => {
  const charge = async (userFields: Record<string, unknown>, paymentId = 'pay_t436') => {
    const userId = await seedUser(userFields);
    await Subscription.deleteMany({});
    await seedSub(userId);
    await webhook('subscription.charged', subPayload({ paymentId }));
    return { userId, inv: (await Invoice.findOne({ paymentId }).lean())! };
  };

  it('reads users.gstStateCode: a valid other State gives source "user" and IGST', async () => {
    const { inv } = await charge({ gstStateCode: '27' });
    expect(inv.placeOfSupply).toEqual({ code: '27', name: 'Maharashtra', source: 'user' });
    expect(inv.igst).toBe(12188);
    expect(inv.cgst).toBe(0);
  });

  it('our own State (20) gives CGST+SGST, source "user"', async () => {
    const { inv } = await charge({ gstStateCode: '20' });
    expect(inv.placeOfSupply).toEqual({ code: '20', name: 'Jharkhand', source: 'user' });
    expect([inv.cgst, inv.sgst, inv.igst]).toEqual([6094, 6094, 0]);
  });

  it.each([
    ['missing', {}],
    ['empty string', { gstStateCode: '' }],
    ['Centre Jurisdiction 99', { gstStateCode: '99' }],
    ['Other Territory 97', { gstStateCode: '97' }],
    ['one digit', { gstStateCode: '7' }],
    ['a number', { gstStateCode: 27 }],
    ['a name, not a code', { gstStateCode: 'Maharashtra' }],
    ['the old free-text state field only', { state: 'Maharashtra' }],
  ])('falls back to our State when gstStateCode is %s (never guessed)', async (_n, fields) => {
    const { inv } = await charge(fields as Record<string, unknown>);
    expect(inv.placeOfSupply).toEqual({ code: '20', name: 'Jharkhand', source: 'fallback' });
    expect([inv.cgst, inv.sgst, inv.igst]).toEqual([6094, 6094, 0]);
  });

  it('snapshots the customer at issue: a later State/name change leaves the invoice alone', async () => {
    const { userId, inv } = await charge({ gstStateCode: '27', name: 'Asha Verma' });
    await User.updateOne({ _id: userId }, { $set: { gstStateCode: '33', name: 'Someone Else' } });
    const again = (await Invoice.findById(inv._id).lean())!;
    expect(again.placeOfSupply).toEqual(inv.placeOfSupply);
    expect(again.customer).toEqual(inv.customer);
    expect(again.customer!.name).toBe('Asha Verma');
    expect(again.igst).toBe(12188);
  });
});

describe('the issued row is immutable (AC5)', () => {
  async function issued() {
    const userId = await seedUser({ gstStateCode: '27' });
    await seedSub(userId);
    await webhook('subscription.charged', subPayload());
    return (await Invoice.findOne({}))!;
  }

  it('updates and deletes through the model do nothing to an issued row', async () => {
    const inv = await issued();
    const id = inv._id;
    expect((await Invoice.updateOne({ _id: id }, { $set: { price: 1 } })).modifiedCount).toBe(0);
    expect((await Invoice.updateMany({}, { $set: { price: 1 } })).modifiedCount).toBe(0);
    expect(await Invoice.findOneAndUpdate({ _id: id }, { $set: { price: 1 } })).toBeNull();
    expect(
      (await Invoice.replaceOne({ _id: id }, { kind: 'invoice' } as never)).modifiedCount,
    ).toBe(0);
    expect((await Invoice.deleteOne({ _id: id })).deletedCount).toBe(0);
    expect((await Invoice.deleteMany({})).deletedCount).toBe(0);
    expect(await Invoice.findOneAndDelete({ _id: id })).toBeNull();
    const after = (await Invoice.findById(id).lean())!;
    expect(after.price).toBe(79900);
    expect(after.state).toBe('issued');
  });

  it('save() on an existing row throws; so does a document deleteOne()', async () => {
    const inv = await issued();
    inv.price = 1;
    await expect(inv.save()).rejects.toThrow(/immutable/);
    await expect(inv.deleteOne()).rejects.toThrow(/never deleted/);
    expect((await Invoice.findById(inv._id).lean())!.price).toBe(79900);
  });

  it('no PDF is stored on the row', async () => {
    const inv = await issued();
    const raw = (await mongoose.connection.db!.collection('invoices').findOne({ _id: inv._id }))!;
    for (const key of Object.keys(raw)) expect(key).not.toMatch(/pdf|buffer|file|blob/i);
    expect(JSON.stringify(raw).length).toBeLessThan(5000);
  });

  it('an issuing row can still be updated and deleted (the sweep needs it)', async () => {
    const row = await recordInvoiceForPayment({
      paymentId: 'pay_issuing',
      userId: String(new mongoose.Types.ObjectId()),
      amount: 100,
      paidAt: new Date(),
      description: 'd',
      source: 'backfill',
    });
    expect(
      (await Invoice.updateOne({ _id: row!._id }, { $set: { 'draft.amount': 200 } })).modifiedCount,
    ).toBe(1);
    expect((await Invoice.deleteOne({ _id: row!._id })).deletedCount).toBe(1);
  });

  it('the unique indexes exist: paymentId (invoices), refundId, (kind, fy, number)', async () => {
    await Invoice.init();
    const idx = await Invoice.collection.indexes();
    const unique = idx.filter((i) => i.unique).map((i) => Object.keys(i.key).join(','));
    expect(unique).toEqual(expect.arrayContaining(['paymentId', 'refundId', 'kind,fy,number']));
  });
});

describe('seller config missing (AC6)', () => {
  const KEYS = [
    'GST_GSTIN',
    'GST_LEGAL_NAME',
    'GST_TRADE_NAME',
    'GST_ADDRESS',
    'GST_STATE_CODE',
  ] as const;

  it.each(KEYS)(
    '%s empty: webhook 200, capture recorded as issuing, sweep issues it once set',
    async (key) => {
      const userId = await seedUser({ gstStateCode: '27' });
      await seedSub(userId);
      const restore = withGstEnv({ [key]: '' });
      try {
        const res = await webhook('subscription.charged', subPayload());
        expect(res.status).toBe(200);
        const row = (await Invoice.findOne({}).lean())!;
        expect(row.state).toBe('issuing');
        expect(row.number).toBeUndefined();
        expect(row.draft.amount).toBe(79900);
        expect(await InvoiceCounter.countDocuments({})).toBe(0);
        // Sweep with the config still missing: nothing issued, nothing lost.
        const blocked = await runInvoiceSweep(FUTURE());
        expect(blocked.blockedByConfig).toBe(1);
        expect(blocked.issued).toBe(0);
        expect((await Invoice.findOne({}).lean())!.state).toBe('issuing');
      } finally {
        restore();
      }
      const counts = await runInvoiceSweep(FUTURE());
      expect(counts.issued).toBe(1);
      const done = (await Invoice.findOne({}).lean())!;
      expect(done.state).toBe('issued');
      expect(done.number).toMatch(SERIES);
      expect(done.seller!.gstin).toBe('20AAAAA0000A1Z5');
    },
  );

  it('an invalid GST_STATE_CODE counts as missing', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    const restore = withGstEnv({ GST_STATE_CODE: '99' });
    try {
      expect((await webhook('subscription.charged', subPayload())).status).toBe(200);
      expect((await Invoice.findOne({}).lean())!.state).toBe('issuing');
    } finally {
      restore();
    }
  });

  it('a top-up with the config missing also returns 200 and is recorded as issuing', async () => {
    const userId = String(await seedUser());
    const restore = withGstEnv({ GST_ADDRESS: '' });
    try {
      expect((await webhook('order.paid', orderPaidPayload({ userId }))).status).toBe(200);
      expect((await Invoice.findOne({}).lean())!.state).toBe('issuing');
    } finally {
      restore();
    }
  });

  it('GST_EFFECTIVE_FROM unset: recorded as issuing, not issued', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '' });
    try {
      expect((await webhook('subscription.charged', subPayload())).status).toBe(200);
      expect((await Invoice.findOne({}).lean())!.state).toBe('issuing');
    } finally {
      restore();
    }
  });

  it('the recording failing (database error) is a 500 so Razorpay retries', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    jest
      .spyOn(Invoice, 'findOneAndUpdate')
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'MongoNetworkError' }));
    expect((await webhook('subscription.charged', subPayload())).status).toBe(500);
    expect(await Invoice.countDocuments({})).toBe(0);
  });
});

describe('crash between allocating a number and writing it (AC3)', () => {
  it('the sweep finishes it with the same number; the next issue continues after it', async () => {
    const userId = await seedUser({ gstStateCode: '27' });
    await seedSub(userId);
    const spy = jest.spyOn(Invoice, 'updateOne').mockRejectedValueOnce(new Error('crash'));
    const res = await webhook('subscription.charged', subPayload());
    expect(res.status).toBe(200); // issue errors never fail the webhook
    spy.mockRestore();

    const row = (await Invoice.findOne({}).lean())!;
    expect(row.state).toBe('issuing');
    const counter = (await InvoiceCounter.findOne({ series: 'invoice' }).lean())!;
    expect(counter.seq).toBe(1);
    expect(String(counter.pendingInvoiceId)).toBe(String(row._id));

    // A younger counter is left to the live webhook.
    expect((await runInvoiceSweep(new Date())).issued).toBe(0);

    const counts = await runInvoiceSweep(FUTURE());
    expect(counts.issued).toBe(1);
    const done = (await Invoice.findById(row._id).lean())!;
    expect(done.state).toBe('issued');
    expect(done.seq).toBe(1);
    expect(done.number).toMatch(/\/0001$/);
    const after = (await InvoiceCounter.findOne({ series: 'invoice' }).lean())!;
    expect(after.seq).toBe(1);
    expect(after.pendingInvoiceId ?? null).toBeNull();

    // The next payment gets 0002.
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_next', paidCount: 2 }));
    expect((await Invoice.findOne({ paymentId: 'pay_next' }).lean())!.number).toMatch(/\/0002$/);
  });

  it('the next issue in the same series finishes the pending row first (no gap, no reuse)', async () => {
    const userId = await seedUser();
    await seedSub(userId);
    const spy = jest.spyOn(Invoice, 'updateOne').mockRejectedValueOnce(new Error('crash'));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_one', paidCount: 1 }));
    spy.mockRestore();
    expect((await Invoice.findOne({ paymentId: 'pay_one' }).lean())!.state).toBe('issuing');

    await webhook('subscription.charged', subPayload({ paymentId: 'pay_two', paidCount: 2 }));
    const one = (await Invoice.findOne({ paymentId: 'pay_one' }).lean())!;
    const two = (await Invoice.findOne({ paymentId: 'pay_two' }).lean())!;
    expect(one.state).toBe('issued');
    expect(two.state).toBe('issued');
    expect([one.seq, two.seq]).toEqual([1, 2]);
  });

  it('re-issuing the very row that holds the number uses that number', async () => {
    const row = await recordInvoiceForPayment({
      paymentId: 'pay_held',
      userId: String(new mongoose.Types.ObjectId()),
      amount: 100,
      paidAt: new Date('2026-03-01T00:00:00Z'),
      description: 'd',
      source: 'backfill',
    });
    const issuedAt = new Date('2026-06-01T00:00:00Z');
    await InvoiceCounter.create({
      fy: '2026-27',
      series: 'invoice',
      seq: 7,
      pendingInvoiceId: row!._id,
      pendingIssuedAt: issuedAt,
    });
    expect(await issueInvoice(row!._id as mongoose.Types.ObjectId)).toBe('issued');
    const done = (await Invoice.findById(row!._id).lean())!;
    expect(done.number).toBe('LAW/2026-27/0007');
    expect(done.issuedAt).toEqual(issuedAt);
    expect((await InvoiceCounter.findOne({}).lean())!.seq).toBe(7);
  });
});

describe('logs carry ids, counts and err.name only (AC13)', () => {
  it('no name, email, GSTIN or amount in any invoice log line, including failures', async () => {
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) => jest.spyOn(logger, l));
    const userId = await seedUser({
      name: 'Zorblax Quimby',
      email: 'zorblax.q@example.org',
      gstStateCode: '27',
    });
    await seedSub(userId);
    const AMOUNT = 123_457;
    const restore = withGstEnv({ GST_ADDRESS: '' });
    try {
      await webhook('subscription.charged', subPayload({ amount: AMOUNT }));
      await runInvoiceSweep(FUTURE());
    } finally {
      restore();
    }
    await runInvoiceSweep(FUTURE());
    await webhook('refund.processed', refundPayload({ refundId: 'rfnd_big', amount: AMOUNT * 2 }));
    await webhook(
      'refund.processed',
      refundPayload({ refundId: 'rfnd_none', paymentId: 'pay_unknown', amount: AMOUNT }),
    );
    const all = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(all).not.toContain('Zorblax');
    expect(all).not.toContain('zorblax');
    expect(all).not.toContain('20AAAAA0000A1Z5');
    expect(all).not.toContain('Test Proprietor');
    expect(all).not.toContain('Test Road');
    expect(all).not.toContain(String(AMOUNT));
    expect(all).not.toContain(String(AMOUNT * 2));
    // and something was in fact logged by the invoice code
    expect(all).toMatch(/invoice/i);
  });

  it('a failed issue logs the error class only', async () => {
    const errSpy = jest.spyOn(logger, 'error');
    const userId = await seedUser();
    await seedSub(userId);
    jest
      .spyOn(Invoice, 'updateOne')
      .mockRejectedValueOnce(
        Object.assign(new Error('SECRET-DETAIL-9 Zorblax'), { name: 'MongoServerError' }),
      );
    await webhook('subscription.charged', subPayload());
    const call = errSpy.mock.calls.find((c) => String(c[1]).includes('issue failed'));
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({ errName: 'MongoServerError' });
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('SECRET-DETAIL-9');
  });
});

describe('test env', () => {
  it('uses the fake GST values from setupEnv, never real ones', () => {
    expect(env.GST_GSTIN).toBe('20AAAAA0000A1Z5');
    expect(env.GST_STATE_CODE).toBe('20');
  });
});
