/**
 * T-540: the pure quote (computeTopupQuote) and its helpers. No database: this is the one place a
 * top-up price is worked out, so the table here is the source of truth for both routes.
 *
 * The routes' view of the same table (validate and order byte-identical) is in
 * t540-topup-coupon.test.ts; the loader (quoteTopup) is covered there too.
 */
import { TOPUP_SKUS } from '../config/credit-skus';
import {
  MIN_CHARGE_PAISE,
  QUOTE_REASONS,
  applyMinimumCharge,
  computeDiscountPaise,
  computeTopupQuote,
  couponCanReachFree,
  inrToPaise,
  normaliseCouponCode,
  paiseToInr,
  quoteView,
  resolveQuoteItem,
  type QuoteCoupon,
  type QuoteItem,
  type TopupQuote,
} from '../services/topup-quote.service';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const PAST = new Date('2026-10-22T09:59:59.000Z');
const FUTURE = new Date('2026-12-01T00:00:00.000Z');

function mkCoupon(over: Partial<QuoteCoupon> = {}): QuoteCoupon {
  return {
    _id: 'c_1',
    code: 'SAVE10',
    label: 'Save',
    discountType: 'percent',
    discountValue: 10,
    applicablePlans: [],
    maxUses: null,
    maxUsesPerUser: 1,
    uses: 0,
    isActive: true,
    expiresAt: null,
    razorpayOfferId: null,
    ...over,
  };
}

function quote(
  skuId: string,
  coupon: QuoteCoupon | null,
  over: {
    userUses?: number | null;
    freeGrantEnabled?: boolean;
    item?: QuoteItem | null;
    couponCode?: string | null;
  } = {},
): TopupQuote {
  return computeTopupQuote({
    skuId,
    item: over.item === undefined ? resolveQuoteItem(skuId) : over.item,
    couponCode: over.couponCode === undefined ? (coupon ? coupon.code : '') : over.couponCode,
    coupon,
    userUses: over.userUses === undefined ? 0 : over.userUses,
    freeGrantEnabled: over.freeGrantEnabled ?? true,
    now: NOW,
  });
}

function okQuote(q: TopupQuote) {
  if (!q.ok) throw new Error(`expected ok quote, got refusal: ${q.reason}`);
  return q;
}

describe('T-540 computeTopupQuote: the quote table (paise)', () => {
  // [name, coupon over, expected {discountPaise, finalPaise} per SKU]
  type Row = [
    string,
    Partial<QuoteCoupon>,
    Record<string, { discountPaise: number; finalPaise: number }>,
  ];
  const rows: Row[] = [
    [
      'percent 10 (rounds to whole rupees: 10% of 199 is 20 off)',
      { discountType: 'percent', discountValue: 10 },
      {
        topup_mini: { discountPaise: 700, finalPaise: 5800 }, // 6.5 -> 7
        topup_mid: { discountPaise: 2000, finalPaise: 17900 }, // 19.9 -> 20
        topup_max: { discountPaise: 5000, finalPaise: 44900 }, // 49.9 -> 50
      },
    ],
    [
      'percent 50',
      { discountType: 'percent', discountValue: 50 },
      {
        topup_mini: { discountPaise: 3300, finalPaise: 3200 }, // 32.5 -> 33
        topup_mid: { discountPaise: 10000, finalPaise: 9900 }, // 99.5 -> 100
        topup_max: { discountPaise: 25000, finalPaise: 24900 }, // 249.5 -> 250
      },
    ],
    [
      'percent 99 on the smallest item leaves exactly 1 rupee',
      { discountType: 'percent', discountValue: 99 },
      {
        topup_mini: { discountPaise: 6400, finalPaise: 100 },
        topup_mid: { discountPaise: 19700, finalPaise: 200 },
        topup_max: { discountPaise: 49400, finalPaise: 500 },
      },
    ],
    [
      'percent 100 (free)',
      { discountType: 'percent', discountValue: 100 },
      {
        topup_mini: { discountPaise: 6500, finalPaise: 0 },
        topup_mid: { discountPaise: 19900, finalPaise: 0 },
        topup_max: { discountPaise: 49900, finalPaise: 0 },
      },
    ],
    [
      'fixed 50',
      { discountType: 'fixed', discountValue: 50 },
      {
        topup_mini: { discountPaise: 5000, finalPaise: 1500 },
        topup_mid: { discountPaise: 5000, finalPaise: 14900 },
        topup_max: { discountPaise: 5000, finalPaise: 44900 },
      },
    ],
    [
      'fixed 64 leaves 1 rupee on the smallest item',
      { discountType: 'fixed', discountValue: 64 },
      {
        topup_mini: { discountPaise: 6400, finalPaise: 100 },
        topup_mid: { discountPaise: 6400, finalPaise: 13500 },
        topup_max: { discountPaise: 6400, finalPaise: 43500 },
      },
    ],
    [
      'fixed 500 (more than every price: capped at the price, free)',
      { discountType: 'fixed', discountValue: 500 },
      {
        topup_mini: { discountPaise: 6500, finalPaise: 0 },
        topup_mid: { discountPaise: 19900, finalPaise: 0 },
        topup_max: { discountPaise: 49900, finalPaise: 0 },
      },
    ],
    [
      'applicablePlans lists this SKU or "all"',
      { applicablePlans: ['topup_mini', 'topup_mid', 'topup_max', 'all'], discountValue: 10 },
      {
        topup_mini: { discountPaise: 700, finalPaise: 5800 },
        topup_mid: { discountPaise: 2000, finalPaise: 17900 },
        topup_max: { discountPaise: 5000, finalPaise: 44900 },
      },
    ],
  ];

  describe.each(rows)('%s', (_name, over, expected) => {
    it.each(TOPUP_SKUS.map((s) => s.id))('%s', (skuId) => {
      const q = okQuote(quote(skuId, mkCoupon(over)));
      const sku = TOPUP_SKUS.find((s) => s.id === skuId)!;
      expect(q.originalPaise).toBe(sku.priceInr * 100);
      expect({ discountPaise: q.discountPaise, finalPaise: q.finalPaise }).toEqual(expected[skuId]);
      expect(q.discountPaise + q.finalPaise!).toBe(q.originalPaise);
    });
  });

  it('10% of the 199 rupee pack is 20 off, 179 to pay', () => {
    const q = okQuote(quote('topup_mid', mkCoupon()));
    expect(q.originalPaise).toBe(19900);
    expect(q.discountPaise).toBe(2000);
    expect(q.finalPaise).toBe(17900);
    expect(paiseToInr(q.finalPaise!)).toBe(179);
  });

  it('every percent 1..100 and fixed 1..600 on every SKU gives integer paise, whole rupees, 0 or >= 100', () => {
    for (const sku of TOPUP_SKUS) {
      const cases: Array<Partial<QuoteCoupon>> = [];
      for (let p = 1; p <= 100; p++) cases.push({ discountType: 'percent', discountValue: p });
      for (let f = 1; f <= 600; f++) cases.push({ discountType: 'fixed', discountValue: f });
      for (const over of cases) {
        const q = okQuote(quote(sku.id, mkCoupon(over)));
        expect(Number.isInteger(q.discountPaise)).toBe(true);
        expect(Number.isInteger(q.finalPaise!)).toBe(true);
        expect(q.finalPaise! % 100).toBe(0);
        expect(q.finalPaise === 0 || q.finalPaise! >= MIN_CHARGE_PAISE).toBe(true);
        expect(q.discountPaise).toBeGreaterThanOrEqual(0);
        expect(q.discountPaise + q.finalPaise!).toBe(q.originalPaise);
      }
    }
  });

  it('does not mutate the coupon it is given', () => {
    const coupon = Object.freeze(mkCoupon()) as QuoteCoupon;
    expect(() => quote('topup_mid', coupon)).not.toThrow();
  });
});

describe('T-540 computeTopupQuote: refusals, in the documented order', () => {
  it('no coupon row -> not found', () => {
    expect(quote('topup_mid', null, { couponCode: 'NOPE' })).toEqual({
      ok: false,
      reason: QUOTE_REASONS.notFound,
    });
  });

  it('a deactivated coupon -> the same not found reason', () => {
    expect(quote('topup_mid', mkCoupon({ isActive: false }))).toEqual({
      ok: false,
      reason: 'Coupon not found or inactive.',
    });
  });

  it('an expired coupon -> expired; expiry exactly now counts as expired', () => {
    expect(quote('topup_mid', mkCoupon({ expiresAt: PAST }))).toEqual({
      ok: false,
      reason: 'Coupon has expired.',
    });
    expect(quote('topup_mid', mkCoupon({ expiresAt: NOW }))).toEqual({
      ok: false,
      reason: QUOTE_REASONS.expired,
    });
    expect(quote('topup_mid', mkCoupon({ expiresAt: FUTURE })).ok).toBe(true);
  });

  it('wrong plan -> does not apply; empty list and "all" apply to everything', () => {
    expect(quote('topup_mid', mkCoupon({ applicablePlans: ['topup_max'] }))).toEqual({
      ok: false,
      reason: 'This coupon does not apply to the selected item.',
    });
    expect(quote('topup_mid', mkCoupon({ applicablePlans: [] })).ok).toBe(true);
    expect(quote('topup_mid', mkCoupon({ applicablePlans: ['all'] })).ok).toBe(true);
    expect(quote('topup_mid', mkCoupon({ applicablePlans: ['topup_mid'] })).ok).toBe(true);
  });

  it('used up -> usage limit (uses >= maxUses); one use left is fine', () => {
    expect(quote('topup_mid', mkCoupon({ maxUses: 3, uses: 3 }))).toEqual({
      ok: false,
      reason: 'Coupon has reached its usage limit.',
    });
    expect(quote('topup_mid', mkCoupon({ maxUses: 3, uses: 4 })).ok).toBe(false);
    expect(quote('topup_mid', mkCoupon({ maxUses: 3, uses: 2 })).ok).toBe(true);
    expect(quote('topup_mid', mkCoupon({ maxUses: 0, uses: 0 })).ok).toBe(false);
  });

  it('per-user limit -> already used; below the limit is fine; null limit means no limit', () => {
    expect(quote('topup_mid', mkCoupon({ maxUsesPerUser: 2 }), { userUses: 2 })).toEqual({
      ok: false,
      reason: 'You have already used this coupon.',
    });
    expect(quote('topup_mid', mkCoupon({ maxUsesPerUser: 2 }), { userUses: 1 }).ok).toBe(true);
    expect(quote('topup_mid', mkCoupon({ maxUsesPerUser: null }), { userUses: 99 }).ok).toBe(true);
  });

  it('no user known (userUses null) skips the per-user check and says so', () => {
    const q = okQuote(quote('topup_mid', mkCoupon({ maxUsesPerUser: 1 }), { userUses: null }));
    expect(q.perUserChecked).toBe(false);
    const known = okQuote(quote('topup_mid', mkCoupon({ maxUsesPerUser: 1 }), { userUses: 0 }));
    expect(known.perUserChecked).toBe(true);
  });

  it('check order: inactive beats expired beats wrong plan beats used up beats per-user', () => {
    const everything = {
      isActive: false,
      expiresAt: PAST,
      applicablePlans: ['topup_max'],
      maxUses: 1,
      uses: 1,
      maxUsesPerUser: 1,
    };
    const reason = (over: Partial<QuoteCoupon>) => {
      const q = quote('topup_mid', mkCoupon({ ...everything, ...over }), { userUses: 1 });
      return q.ok ? null : q.reason;
    };
    expect(reason({})).toBe(QUOTE_REASONS.notFound);
    expect(reason({ isActive: true })).toBe(QUOTE_REASONS.expired);
    expect(reason({ isActive: true, expiresAt: null })).toBe(QUOTE_REASONS.notApplicable);
    expect(reason({ isActive: true, expiresAt: null, applicablePlans: [] })).toBe(
      QUOTE_REASONS.usedUp,
    );
    expect(reason({ isActive: true, expiresAt: null, applicablePlans: [], maxUses: null })).toBe(
      QUOTE_REASONS.perUser,
    );
  });
});

describe('T-540 computeTopupQuote: no coupon, no item, unknown item', () => {
  it('no coupon code: list price, no discount, no coupon', () => {
    const q = okQuote(quote('topup_mid', null, { couponCode: '' }));
    expect(q).toMatchObject({ originalPaise: 19900, discountPaise: 0, finalPaise: 19900 });
    expect(q.coupon).toBeUndefined();
  });

  it('a whitespace-only code counts as no code', () => {
    const q = okQuote(quote('topup_mid', mkCoupon(), { couponCode: '   ' }));
    expect(q.discountPaise).toBe(0);
    expect(q.coupon).toBeUndefined();
  });

  it('a coupon with no item named: valid, null prices, no discount', () => {
    const q = okQuote(quote('', mkCoupon(), { item: null }));
    expect(q).toMatchObject({
      sku: null,
      originalPaise: null,
      discountPaise: 0,
      finalPaise: null,
    });
    expect(q.coupon?.code).toBe('SAVE10');
  });

  it('a coupon with an unknown item: valid, null prices', () => {
    const q = okQuote(quote('not_a_sku', mkCoupon(), { item: resolveQuoteItem('not_a_sku') }));
    expect(q.originalPaise).toBeNull();
    expect(q.finalPaise).toBeNull();
  });

  it('a plan SKU is priced like any item (validate only)', () => {
    const q = okQuote(quote('solo_monthly', mkCoupon({ discountValue: 50 })));
    expect(q.originalPaise).toBe(79900);
    expect(q.discountPaise).toBe(40000); // 399.5 -> 400
    expect(q.finalPaise).toBe(39900);
  });
});

describe('T-540 computeTopupQuote: the free-grant switch (a 0 quote)', () => {
  const free = mkCoupon({ discountValue: 100 });

  it('switch off: a 0 quote is refused with the fixed reason', () => {
    expect(quote('topup_mid', free, { freeGrantEnabled: false })).toEqual({
      ok: false,
      reason: 'This coupon cannot be applied to this item.',
    });
  });

  it('switch on: a 0 quote is ok with finalPaise 0 and the full discount', () => {
    const q = okQuote(quote('topup_mid', free, { freeGrantEnabled: true }));
    expect(q.finalPaise).toBe(0);
    expect(q.discountPaise).toBe(19900);
  });

  it('switch off does not affect a non-zero quote', () => {
    expect(quote('topup_mid', mkCoupon(), { freeGrantEnabled: false }).ok).toBe(true);
  });

  it('refusals earlier in the order still win over the switch reason', () => {
    const q = quote('topup_mid', { ...free, isActive: false }, { freeGrantEnabled: false });
    expect(q).toEqual({ ok: false, reason: QUOTE_REASONS.notFound });
  });
});

describe('T-540 the sub-1-rupee guard (0 < final < 100 rounds to 1 rupee)', () => {
  // Whole-rupee prices cannot reach this today; the guard is unit-tested on an item that can.
  const item = (priceInr: number): QuoteItem => ({ id: 'odd', kind: 'topup', priceInr });

  it('applyMinimumCharge: 50 paise left on a 150 paise item is cut to 100, discount follows', () => {
    expect(applyMinimumCharge(150, 100)).toEqual({ discountPaise: 50, finalPaise: 100 });
  });

  it('applyMinimumCharge: 99 paise left is cut to 100; 100 is left alone; 0 stays 0', () => {
    expect(applyMinimumCharge(199, 100)).toEqual({ discountPaise: 99, finalPaise: 100 });
    expect(applyMinimumCharge(200, 100)).toEqual({ discountPaise: 100, finalPaise: 100 });
    expect(applyMinimumCharge(150, 150)).toEqual({ discountPaise: 150, finalPaise: 0 });
    expect(applyMinimumCharge(150, 0)).toEqual({ discountPaise: 0, finalPaise: 150 });
  });

  it('applyMinimumCharge: an item that costs less than 1 rupee is not raised', () => {
    expect(applyMinimumCharge(50, 0)).toEqual({ discountPaise: 0, finalPaise: 50 });
    expect(applyMinimumCharge(99, 10)).toEqual({ discountPaise: 10, finalPaise: 89 });
  });

  it('through computeTopupQuote: percent 50 on 1.50 rupees charges 1 rupee, discount adjusted', () => {
    const q = okQuote(
      quote('odd', mkCoupon({ discountType: 'percent', discountValue: 50 }), { item: item(1.5) }),
    );
    expect(q.originalPaise).toBe(150);
    expect(q.finalPaise).toBe(100);
    expect(q.discountPaise).toBe(50);
  });

  it('through computeTopupQuote: fixed 1 rupee off 1.99 charges 1 rupee, not 99 paise', () => {
    const q = okQuote(
      quote('odd', mkCoupon({ discountType: 'fixed', discountValue: 1 }), { item: item(1.99) }),
    );
    expect(q.originalPaise).toBe(199);
    expect(q.finalPaise).toBe(100);
    expect(q.discountPaise).toBe(99);
  });

  it('through computeTopupQuote: a full discount stays 0 (the free path), not 1 rupee', () => {
    const q = okQuote(
      quote('odd', mkCoupon({ discountType: 'percent', discountValue: 100 }), { item: item(1.5) }),
    );
    expect(q.finalPaise).toBe(0);
  });

  it('the guard never leaves an amount strictly between 0 and 100 for any discount', () => {
    for (const original of [150, 199, 250, 6500]) {
      for (let raw = 0; raw <= original; raw++) {
        const { discountPaise, finalPaise } = applyMinimumCharge(original, raw);
        expect(finalPaise === 0 || finalPaise >= MIN_CHARGE_PAISE).toBe(true);
        expect(discountPaise + finalPaise).toBe(original);
      }
    }
  });
});

describe('T-540 helpers', () => {
  it('computeDiscountPaise: percent rounds to whole rupees; fixed is capped at the price', () => {
    expect(computeDiscountPaise('percent', 10, 19900)).toBe(2000);
    expect(computeDiscountPaise('percent', 100, 6500)).toBe(6500);
    expect(computeDiscountPaise('fixed', 50, 19900)).toBe(5000);
    expect(computeDiscountPaise('fixed', 500, 6500)).toBe(6500);
  });

  it('computeDiscountPaise never goes below 0 or above the price', () => {
    expect(computeDiscountPaise('fixed', -5, 6500)).toBe(0);
    expect(computeDiscountPaise('percent', 250, 6500)).toBe(6500);
  });

  it('couponCanReachFree: only a full percent or a fixed amount of the smallest price or more', () => {
    expect(couponCanReachFree('percent', 100)).toBe(true);
    expect(couponCanReachFree('percent', 99)).toBe(false);
    expect(couponCanReachFree('percent', 10)).toBe(false);
    expect(couponCanReachFree('fixed', 65)).toBe(true);
    expect(couponCanReachFree('fixed', 500)).toBe(true);
    expect(couponCanReachFree('fixed', 64)).toBe(false);
    expect(couponCanReachFree('fixed', 1)).toBe(false);
  });

  it('inrToPaise rounds float noise away; paiseToInr is the inverse for whole paise', () => {
    expect(inrToPaise(19.99)).toBe(1999);
    expect(inrToPaise(1.005)).toBe(100);
    expect(Number.isInteger(inrToPaise(0.29))).toBe(true);
    expect(paiseToInr(17900)).toBe(179);
  });

  it('normaliseCouponCode trims and upper-cases, and gives "" for non-strings', () => {
    expect(normaliseCouponCode('  save10 ')).toBe('SAVE10');
    expect(normaliseCouponCode(undefined)).toBe('');
    expect(normaliseCouponCode(5)).toBe('');
    expect(normaliseCouponCode({})).toBe('');
  });

  it('resolveQuoteItem: top-up, plan, unknown', () => {
    expect(resolveQuoteItem('topup_mid')).toMatchObject({ kind: 'topup', priceInr: 199 });
    expect(resolveQuoteItem('solo_monthly')).toMatchObject({ kind: 'plan', priceInr: 799 });
    expect(resolveQuoteItem('nope')).toBeNull();
  });

  it('quoteView: the public view has paise, rupees and the code, and no internal coupon fields', () => {
    const q = okQuote(quote('topup_mid', mkCoupon()));
    expect(quoteView(q)).toEqual({
      skuId: 'topup_mid',
      originalPaise: 19900,
      discountPaise: 2000,
      finalPaise: 17900,
      originalAmountInr: 199,
      discountInr: 20,
      amountInr: 179,
      couponCode: 'SAVE10',
    });
    const plain = okQuote(quote('topup_mid', null, { couponCode: '' }));
    expect(quoteView(plain).couponCode).toBeNull();
    const none = okQuote(quote('', mkCoupon(), { item: null }));
    expect(quoteView(none)).toMatchObject({
      originalPaise: null,
      finalPaise: null,
      originalAmountInr: null,
      amountInr: null,
    });
  });
});
