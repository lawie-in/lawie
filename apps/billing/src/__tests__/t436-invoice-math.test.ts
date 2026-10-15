import './setupEnv';

import { INVOICE_NUMBER_MAX_LENGTH } from '../config/gst';
import { SUBSCRIPTION_PLANS, TOPUP_SKUS } from '../config/credit-skus';
import {
  financialYear,
  formatInvoiceNumber,
  formatIstDate,
  formatIstDateTime,
  formatRupees,
  istMonthRange,
  istParts,
  paiseToRupees,
  splitGstInclusive,
} from '../services/invoice-math';
import {
  capturedPaymentEntity,
  fromUnix,
  planFromChargeNotes,
  subscriptionDescription,
  topupDescription,
} from '../services/invoice.service';

// T-436 AC2 amounts, AC3 numbering format and FY roll, AC11 descriptions.

const SKU_PRICES_PAISE = [
  ...SUBSCRIPTION_PLANS.map((p) => p.priceInr * 100),
  ...TOPUP_SKUS.map((t) => t.priceInr * 100),
];

describe('splitGstInclusive (AC2)', () => {
  it('covers all 7 SKUs', () => {
    expect(SKU_PRICES_PAISE).toHaveLength(7);
  });

  it('known values: 799.00 intra-state', () => {
    // 79900 / 1.18 = 67711.86 -> 67712; tax 12188; cgst 6094; sgst 6094
    expect(splitGstInclusive(79900, true)).toEqual({
      price: 79900,
      taxable: 67712,
      cgst: 6094,
      sgst: 6094,
      igst: 0,
      total: 79900,
    });
    expect(splitGstInclusive(79900, false)).toEqual({
      price: 79900,
      taxable: 67712,
      cgst: 0,
      sgst: 0,
      igst: 12188,
      total: 79900,
    });
  });

  it('odd tax: cgst = round(tax/2), sgst gets the rest', () => {
    // 6500: taxable round(5508.47)=5508, tax 992 even. Find an odd-tax SKU/amount.
    const s = splitGstInclusive(6501, true);
    expect(s.cgst + s.sgst).toBe(s.price - s.taxable);
    expect(s.cgst).toBe(Math.round((s.price - s.taxable) / 2));
    expect(s.sgst).toBe(s.price - s.taxable - s.cgst);
    const odd = splitGstInclusive(100, true); // taxable 85 (84.74), tax 15 -> cgst 8, sgst 7
    expect(odd).toMatchObject({ taxable: 85, cgst: 8, sgst: 7 });
  });

  it.each(SKU_PRICES_PAISE)('SKU price %i paise sums exactly, intra and inter', (price) => {
    const a = splitGstInclusive(price, true);
    const b = splitGstInclusive(price, false);
    expect(a.taxable + a.cgst + a.sgst + a.igst).toBe(price);
    expect(b.taxable + b.cgst + b.sgst + b.igst).toBe(price);
    expect(a.total).toBe(price);
    expect(a.taxable).toBe(b.taxable);
    expect(b.igst).toBe(price - b.taxable);
  });

  it('property: for every paise amount 0..300000 the parts sum exactly to the price', () => {
    for (let p = 0; p <= 300_000; p += 1) {
      const taxable = Math.round((p * 50) / 59); // = p / 1.18; never a tie, so exact
      const intra = splitGstInclusive(p, true);
      const inter = splitGstInclusive(p, false);
      if (intra.taxable !== taxable || inter.taxable !== taxable) {
        throw new Error(`taxable mismatch at ${p}`);
      }
      const tax = p - taxable;
      const cgst = Math.round(tax / 2);
      if (
        intra.cgst !== cgst ||
        intra.sgst !== tax - cgst ||
        intra.igst !== 0 ||
        intra.taxable + intra.cgst + intra.sgst !== p ||
        inter.igst !== tax ||
        inter.cgst !== 0 ||
        inter.sgst !== 0 ||
        inter.taxable + inter.igst !== p
      ) {
        throw new Error(`split mismatch at ${p}`);
      }
    }
  });

  it('property: large amounts are exact too', () => {
    for (const p of [1_000_000, 9_999_999, 123_456_789, 2_147_483_647]) {
      const s = splitGstInclusive(p, true);
      expect(s.taxable + s.cgst + s.sgst).toBe(p);
    }
  });

  it('rejects non-integers and negatives', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => splitGstInclusive(bad, true)).toThrow(RangeError);
    }
  });
});

describe('financial year (AC3)', () => {
  it('rolls on 1 April IST', () => {
    expect(financialYear(new Date('2027-03-31T18:29:59Z'))).toBe('2026-27'); // 23:59:59 IST
    expect(financialYear(new Date('2027-03-31T18:30:00Z'))).toBe('2027-28'); // 00:00 IST 1 Apr
    expect(financialYear(new Date('2026-03-31T18:30:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2026-10-14T00:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2026-01-15T00:00:00Z'))).toBe('2025-26');
    expect(financialYear(new Date('2099-04-01T00:00:00Z'))).toBe('2099-00');
  });
});

describe('invoice numbers (AC3)', () => {
  it('formats both series and stays within 16 characters', () => {
    expect(formatInvoiceNumber('invoice', '2026-27', 1)).toBe('LAW/2026-27/0001');
    expect(formatInvoiceNumber('credit_note', '2026-27', 1)).toBe('LCN/2026-27/0001');
    expect(formatInvoiceNumber('invoice', '2026-27', 9999)).toBe('LAW/2026-27/9999');
    for (const kind of ['invoice', 'credit_note'] as const) {
      expect(formatInvoiceNumber(kind, '2026-27', 9999).length).toBeLessThanOrEqual(
        INVOICE_NUMBER_MAX_LENGTH,
      );
      expect(formatInvoiceNumber(kind, '2026-27', 9999)).toMatch(/^[A-Za-z0-9/-]+$/);
    }
    expect(INVOICE_NUMBER_MAX_LENGTH).toBe(16);
  });
});

describe('IST helpers', () => {
  it('istParts / formatIstDate / formatIstDateTime', () => {
    const d = new Date('2026-09-30T19:00:05Z'); // 1 Oct 00:30:05 IST
    expect(istParts(d)).toMatchObject({
      year: 2026,
      month: 10,
      day: 1,
      hour: 0,
      minute: 30,
      second: 5,
    });
    expect(formatIstDate(d)).toBe('1 Oct 2026');
    expect(formatIstDateTime(d)).toBe('2026-10-01 00:30:05');
  });

  it('istMonthRange is the IST calendar month, null when malformed', () => {
    const r = istMonthRange('2026-10')!;
    expect(r.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(istMonthRange('2026-12')!.end.toISOString()).toBe('2026-12-31T18:30:00.000Z');
    for (const bad of ['', '2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', 'abcd-ef']) {
      expect(istMonthRange(bad)).toBeNull();
    }
  });

  it('paiseToRupees and formatRupees print "Rs." with Indian grouping', () => {
    expect(paiseToRupees(79900)).toBe('799.00');
    expect(paiseToRupees(5)).toBe('0.05');
    expect(paiseToRupees(-50)).toBe('-0.50');
    expect(paiseToRupees(0)).toBe('0.00');
    expect(formatRupees(79900)).toBe('Rs. 799.00');
    expect(formatRupees(199900)).toBe('Rs. 1,999.00');
    expect(formatRupees(1_999_000_00)).toBe('Rs. 19,99,000.00');
    expect(formatRupees(-1050)).toBe('-Rs. 10.50');
    expect(formatRupees(99)).toBe('Rs. 0.99');
  });
});

describe('descriptions (AC11)', () => {
  const start = new Date('2026-03-01T00:00:00Z');
  const end = new Date('2026-03-31T00:00:00Z');

  it('plan known: "Lawie subscription — Solo Yearly, {period}"', () => {
    expect(subscriptionDescription({ tier: 'solo', cycle: 'yearly' }, start, end)).toBe(
      'Lawie subscription — Solo Yearly, 1 Mar 2026 to 31 Mar 2026',
    );
    expect(subscriptionDescription({ tier: 'pro', cycle: 'monthly' }, start, end)).toBe(
      'Lawie subscription — Pro Monthly, 1 Mar 2026 to 31 Mar 2026',
    );
  });

  it('plan unknown: exactly "Lawie subscription — {period}", never a default plan', () => {
    expect(subscriptionDescription(null, start, end)).toBe(
      'Lawie subscription — 1 Mar 2026 to 31 Mar 2026',
    );
    expect(subscriptionDescription(null)).toBe('Lawie subscription — billing period');
    expect(subscriptionDescription(null, start, end)).not.toMatch(/pro/i);
  });

  it('top-up: "Lawie Ink top-up — {n} Ink"', () => {
    expect(topupDescription(10)).toBe('Lawie Ink top-up — 10 Ink');
    expect(topupDescription(3)).toBe('Lawie Ink top-up — 3 Ink');
  });

  it('planFromChargeNotes accepts only a plan we sell', () => {
    expect(planFromChargeNotes({ tier: 'solo', cycle: 'yearly' })).toEqual({
      tier: 'solo',
      cycle: 'yearly',
    });
    expect(planFromChargeNotes({ tier: 'pro', cycle: 'monthly' })).toEqual({
      tier: 'pro',
      cycle: 'monthly',
    });
    expect(planFromChargeNotes({ tier: 'enterprise', cycle: 'yearly' })).toBeNull();
    expect(planFromChargeNotes({ tier: 'solo', cycle: 'weekly' })).toBeNull();
    expect(planFromChargeNotes({ tier: 'solo' })).toBeNull();
    expect(planFromChargeNotes({ tier: 1, cycle: 2 })).toBeNull();
    expect(planFromChargeNotes({})).toBeNull();
    expect(planFromChargeNotes(undefined)).toBeNull();
  });
});

describe('payload helpers', () => {
  it('fromUnix', () => {
    expect(fromUnix(1_772_323_200).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    const fb = new Date('2020-01-01T00:00:00Z');
    for (const bad of [undefined, null, 0, -5, NaN, '123', {}]) expect(fromUnix(bad, fb)).toBe(fb);
    expect(fromUnix(undefined)).toBeInstanceOf(Date);
  });

  it('capturedPaymentEntity returns only a captured payment with an id and a numeric amount', () => {
    const ent = (e: Record<string, unknown>) => ({ payment: { entity: e } });
    const ok = capturedPaymentEntity(
      ent({ id: 'pay_1', amount: 100, status: 'captured', created_at: 1_772_323_200 }),
    );
    expect(ok).toMatchObject({ id: 'pay_1', amount: 100 });
    expect(ok!.createdAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(capturedPaymentEntity(ent({ id: 'p', amount: 1, status: 'failed' }))).toBeNull();
    expect(capturedPaymentEntity(ent({ id: 'p', amount: 1, status: 'refunded' }))).toBeNull();
    expect(capturedPaymentEntity(ent({ id: 'p', amount: 1, status: 'authorized' }))).toBeNull();
    expect(capturedPaymentEntity(ent({ id: '', amount: 1, status: 'captured' }))).toBeNull();
    expect(capturedPaymentEntity(ent({ amount: 1, status: 'captured' }))).toBeNull();
    expect(capturedPaymentEntity(ent({ id: 'p', amount: '1', status: 'captured' }))).toBeNull();
    expect(capturedPaymentEntity({})).toBeNull();
    expect(capturedPaymentEntity({ payment: {} })).toBeNull();
  });
});
