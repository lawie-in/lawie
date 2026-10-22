/**
 * T-540: the top-up coupon quote through the two routes.
 *
 * - The quote table over every SKU: GET /validate-coupon and POST /topup/order return the same
 *   integer paise, and the Razorpay order is created for exactly that amount.
 * - Order 409s (coupon_invalid, price_changed), 400 for a bad expectedAmountPaise, no order made.
 * - Validate's optional auth (internal secret + x-user-id) and the dropped userId query param.
 * - quoteTopup's loader, admin create (whole-rupee fixed, limits on a coupon that can be free),
 *   and the webhook's ledger amount.
 *
 * The free-grant path (switch on) is in t540-free-grant.test.ts. Razorpay is mocked.
 */
import './setupDb';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import logger from '../config/logger';
import { TOPUP_SKUS } from '../config/credit-skus';
import { AppSetting } from '../models/AppSetting.model';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import { User } from '../models/User.model';
import { clearAppSettingsCache } from '../services/app-settings.service';
import { handleWebhookEvent } from '../services/subscription.service';
import { QUOTE_REASONS, quoteTopup } from '../services/topup-quote.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn(), cancel: jest.fn() },
    orders: { create: jest.fn() },
  },
}));

import { razorpay } from '../config/razorpay';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const ordersCreate = (razorpay as unknown as { orders: { create: jest.Mock } }).orders.create;

const SWITCH_KEY = 'feature.coupon_free_grant';
const SKU_IDS = TOPUP_SKUS.map((s) => s.id);
const oid = () => new mongoose.Types.ObjectId();

function userHeaders(userId: string, extra: Record<string, string> = {}) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'buyer@test.com',
    'x-user-name': 'Buyer',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
    ...extra,
  };
}

async function seedUser(extra: Record<string, unknown> = {}): Promise<string> {
  const u = await User.create({
    email: `u${oid().toString()}@test.com`,
    emailVerified: true,
    ...extra,
  });
  return u._id.toString();
}

async function mkCoupon(over: Record<string, unknown> = {}) {
  return CouponCode.create({
    code: 'SAVE10',
    label: 'Offer',
    discountType: 'percent',
    discountValue: 10,
    ...over,
  });
}

async function switchOn(): Promise<void> {
  await AppSetting.create({ key: SWITCH_KEY, value: 'true' });
  clearAppSettingsCache();
}

const validate = (code: string, skuId: string | undefined, userId?: string) => {
  const req = request(app).get(`/validate-coupon/${code}${skuId ? `?skuId=${skuId}` : ''}`);
  return userId ? req.set(userHeaders(userId)) : req;
};

const order = (userId: string, body: Record<string, unknown>) =>
  request(app).post('/topup/order').set(userHeaders(userId)).send(body);

beforeAll(async () => {
  await CouponCode.init();
});

beforeEach(() => {
  clearAppSettingsCache();
  delete (env as { FEATURE_DEFAULT_COUPON_FREE_GRANT?: string }).FEATURE_DEFAULT_COUPON_FREE_GRANT;
  ordersCreate.mockReset();
  ordersCreate.mockResolvedValue({ id: 'order_t540' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── The quote table: validate and order agree, for every SKU ─────────────────

describe('T-540 AC1/AC4/AC5: validate and order return the same amounts for every table row', () => {
  const accepted: Array<[string, Record<string, unknown>, { priorUsage?: boolean }]> = [
    ['percent 10', { discountType: 'percent', discountValue: 10 }, {}],
    ['percent 50', { discountType: 'percent', discountValue: 50 }, {}],
    ['percent 99 (1 rupee left on the smallest pack)', { discountValue: 99 }, {}],
    ['fixed 50', { discountType: 'fixed', discountValue: 50 }, {}],
    [
      'fixed 64 (1 rupee left on the smallest pack)',
      { discountType: 'fixed', discountValue: 64 },
      {},
    ],
    ['plan list names the SKU too', { applicablePlans: [...SKU_IDS] }, {}],
    ['plan list is "all"', { applicablePlans: ['all'] }, {}],
    ['uses left (maxUses 5, uses 4)', { maxUses: 5, uses: 4 }, {}],
    ['future end date', { expiresAt: new Date(Date.now() + 86_400_000) }, {}],
    ['per-user limit 2, one used', { maxUsesPerUser: 2 }, { priorUsage: true }],
  ];

  describe.each(accepted)('%s', (_name, over, opts) => {
    it.each(SKU_IDS)('%s: same integer paise from both routes', async (skuId) => {
      const userId = await seedUser();
      const c = await mkCoupon(over);
      if (opts.priorUsage) {
        await CouponUsage.create({ couponId: c._id, userId, orderId: 'prior_1' });
      }

      const v = await validate('SAVE10', skuId, userId);
      expect(v.status).toBe(200);
      expect(v.body.valid).toBe(true);
      expect(v.body.perUserChecked).toBe(true);

      const o = await order(userId, {
        skuId,
        couponCode: 'SAVE10',
        expectedAmountPaise: v.body.amountPaise,
      });
      expect(o.status).toBe(200);
      expect(o.body.status).toBe('success');

      // Razorpay was asked for exactly the quoted paise (an integer).
      expect(ordersCreate).toHaveBeenCalledTimes(1);
      const arg = ordersCreate.mock.calls[0][0];
      expect(Number.isInteger(arg.amount)).toBe(true);
      expect(arg.amount).toBe(v.body.finalPaise);
      expect(arg.currency).toBe('INR');
      expect(arg.notes).toMatchObject({ sku_id: skuId, user_id: userId, coupon_code: 'SAVE10' });

      // Byte-identical amounts in both responses.
      const fromValidate = {
        amountPaise: v.body.amountPaise,
        finalPaise: v.body.finalPaise,
        amountInr: v.body.finalPriceInr,
        originalAmountInr: v.body.originalPriceInr,
      };
      const fromOrder = {
        amountPaise: o.body.data.amountPaise,
        finalPaise: o.body.data.finalPaise,
        amountInr: o.body.data.amountInr,
        originalAmountInr: o.body.data.originalAmountInr,
      };
      expect(JSON.stringify(fromOrder)).toBe(JSON.stringify(fromValidate));
      expect(JSON.stringify(fromOrder)).toBe(
        JSON.stringify({
          amountPaise: arg.amount,
          finalPaise: arg.amount,
          amountInr: arg.amount / 100,
          originalAmountInr: TOPUP_SKUS.find((s) => s.id === skuId)!.priceInr,
        }),
      );
      expect(o.body.data.couponApplied).toBe('SAVE10');
      // original - discount = final, all integer paise
      expect(v.body.originalPaise - v.body.discountPaise).toBe(v.body.finalPaise);
      expect(Number.isInteger(v.body.discountPaise)).toBe(true);
    });
  });

  it('10% of the 199 rupee pack: both routes say 179 rupees (17900 paise)', async () => {
    const userId = await seedUser();
    await mkCoupon();
    const v = await validate('SAVE10', 'topup_mid', userId);
    expect(v.body).toMatchObject({
      originalPriceInr: 199,
      discountInr: 20,
      finalPriceInr: 179,
      amountPaise: 17900,
      originalPaise: 19900,
      discountPaise: 2000,
    });
    const o = await order(userId, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(o.body.data).toMatchObject({
      amountInr: 179,
      amountPaise: 17900,
      originalAmountInr: 199,
    });
    expect(ordersCreate.mock.calls[0][0].amount).toBe(17900);
  });

  it('no coupon: the order charges the list price in paise and reports couponApplied null', async () => {
    const userId = await seedUser();
    const o = await order(userId, { skuId: 'topup_max' });
    expect(o.status).toBe(200);
    expect(o.body.data).toMatchObject({
      amountInr: 499,
      amountPaise: 49900,
      finalPaise: 49900,
      originalAmountInr: 499,
      couponApplied: null,
      ink: 28,
      skuId: 'topup_max',
    });
    expect(ordersCreate.mock.calls[0][0].amount).toBe(49900);
    expect(ordersCreate.mock.calls[0][0].notes.coupon_code).toBeUndefined();
  });

  it('a lower-case coupon code with spaces is matched like the web would send it', async () => {
    const userId = await seedUser();
    await mkCoupon();
    const o = await order(userId, { skuId: 'topup_mid', couponCode: '  save10 ' });
    expect(o.status).toBe(200);
    expect(o.body.data.couponApplied).toBe('SAVE10');
    expect(o.body.data.amountPaise).toBe(17900);
  });
});

describe('T-540 AC2/AC3: a refused coupon is refused the same way by both routes, and no order is created', () => {
  type Refusal = {
    name: string;
    over?: Record<string, unknown>;
    code?: string;
    priorUsage?: boolean;
    reason: string;
    beforeOrder?: () => Promise<void>;
  };
  const refusals: Refusal[] = [
    { name: 'a code that does not exist', code: 'NOPE', reason: QUOTE_REASONS.notFound },
    { name: 'deactivated', over: { isActive: false }, reason: 'Coupon not found or inactive.' },
    {
      name: 'expired',
      over: { expiresAt: new Date(Date.now() - 60_000) },
      reason: 'Coupon has expired.',
    },
    {
      name: 'used up',
      over: { maxUses: 2, uses: 2 },
      reason: 'Coupon has reached its usage limit.',
    },
    {
      name: 'wrong plan',
      over: { applicablePlans: ['solo_monthly'] },
      reason: 'This coupon does not apply to the selected item.',
    },
    {
      name: 'per-user limit reached',
      over: { maxUsesPerUser: 1 },
      priorUsage: true,
      reason: 'You have already used this coupon.',
    },
    {
      name: 'free (100%) while the switch is off',
      over: { discountValue: 100, maxUses: 5, maxUsesPerUser: 1 },
      reason: 'This coupon cannot be applied to this item',
    },
  ];

  describe.each(refusals)('$name', (r) => {
    it.each(SKU_IDS)(
      '%s: validate valid:false, order 409 coupon_invalid, no Razorpay order',
      async (skuId) => {
        const userId = await seedUser();
        const c = await mkCoupon(r.over);
        if (r.priorUsage) await CouponUsage.create({ couponId: c._id, userId, orderId: 'prior_1' });
        const code = r.code ?? 'SAVE10';

        const v = await validate(code, skuId, userId);
        expect(v.body).toEqual({ valid: false, reason: r.reason });

        const o = await order(userId, { skuId, couponCode: code });
        expect(o.status).toBe(409);
        expect(o.body).toEqual({ error: 'coupon_invalid', reason: r.reason });
        expect(ordersCreate).not.toHaveBeenCalled();
      },
    );
  });

  it('a coupon valid at Apply but turned off before Buy: 409, never a silent full price', async () => {
    const userId = await seedUser();
    await mkCoupon();
    const v = await validate('SAVE10', 'topup_mid', userId);
    expect(v.body.valid).toBe(true);
    await CouponCode.updateOne({ code: 'SAVE10' }, { isActive: false });
    const o = await order(userId, {
      skuId: 'topup_mid',
      couponCode: 'SAVE10',
      expectedAmountPaise: v.body.amountPaise,
    });
    expect(o.status).toBe(409);
    expect(o.body.error).toBe('coupon_invalid');
    expect(o.body.data).toBeUndefined();
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('a coupon that expires or runs out between Apply and Buy: 409 for each', async () => {
    const userId = await seedUser();
    await mkCoupon({ maxUses: 5, uses: 4 });
    await CouponCode.updateOne({ code: 'SAVE10' }, { uses: 5 });
    const a = await order(userId, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(a.status).toBe(409);
    await CouponCode.updateOne(
      { code: 'SAVE10' },
      { uses: 0, expiresAt: new Date(Date.now() - 1000) },
    );
    const b = await order(userId, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(b.status).toBe(409);
    expect(b.body.reason).toBe('Coupon has expired.');
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('applicablePlans is enforced in the order route (a coupon for another pack)', async () => {
    const userId = await seedUser();
    await mkCoupon({ applicablePlans: ['topup_max'] });
    const wrong = await order(userId, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(wrong.status).toBe(409);
    expect(wrong.body.reason).toBe(QUOTE_REASONS.notApplicable);
    const right = await order(userId, { skuId: 'topup_max', couponCode: 'SAVE10' });
    expect(right.status).toBe(200);
    expect(right.body.data.amountPaise).toBe(44900);
  });

  it('maxUsesPerUser is enforced in the order route, per user', async () => {
    const used = await seedUser();
    const other = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 1 });
    await CouponUsage.create({ couponId: c._id, userId: used, orderId: 'prior_1' });
    const blocked = await order(used, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual({ error: 'coupon_invalid', reason: QUOTE_REASONS.perUser });
    const free = await order(other, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(free.status).toBe(200);
  });

  it('a failure while quoting is a 500 and creates no order', async () => {
    const userId = await seedUser();
    await mkCoupon();
    jest.spyOn(CouponCode, 'findOne').mockImplementation(() => {
      throw new Error('db down');
    });
    const o = await order(userId, { skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(o.status).toBe(500);
    expect(o.body).toEqual({ error: 'Failed to create top-up order' });
    expect(ordersCreate).not.toHaveBeenCalled();
  });
});

describe('T-540 order body: expectedAmountPaise and skuId', () => {
  it('409 price_changed when the expected amount differs, with the quote view and no order', async () => {
    const userId = await seedUser();
    await mkCoupon();
    const o = await order(userId, {
      skuId: 'topup_mid',
      couponCode: 'SAVE10',
      expectedAmountPaise: 19900,
    });
    expect(o.status).toBe(409);
    expect(o.body).toEqual({
      error: 'price_changed',
      quote: {
        skuId: 'topup_mid',
        originalPaise: 19900,
        discountPaise: 2000,
        finalPaise: 17900,
        originalAmountInr: 199,
        discountInr: 20,
        amountInr: 179,
        couponCode: 'SAVE10',
      },
    });
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('409 price_changed with no coupon when the expected amount is not the list price', async () => {
    const userId = await seedUser();
    const o = await order(userId, { skuId: 'topup_mid', expectedAmountPaise: 17900 });
    expect(o.status).toBe(409);
    expect(o.body.error).toBe('price_changed');
    expect(o.body.quote.finalPaise).toBe(19900);
    expect(o.body.quote.couponCode).toBeNull();
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('a matching expectedAmountPaise goes through; a missing or null one is not checked', async () => {
    const userId = await seedUser();
    expect((await order(userId, { skuId: 'topup_mid', expectedAmountPaise: 19900 })).status).toBe(
      200,
    );
    expect((await order(userId, { skuId: 'topup_mid', expectedAmountPaise: null })).status).toBe(
      200,
    );
    expect((await order(userId, { skuId: 'topup_mid' })).status).toBe(200);
    expect(ordersCreate).toHaveBeenCalledTimes(3);
  });

  it('expectedAmountPaise 0 does not match a paid quote (409), it is not read as "not given"', async () => {
    const userId = await seedUser();
    const o = await order(userId, { skuId: 'topup_mid', expectedAmountPaise: 0 });
    expect(o.status).toBe(409);
    expect(o.body.error).toBe('price_changed');
  });

  it.each([
    ['a fraction', 179.5],
    ['a string', '17900'],
    ['a boolean', true],
    ['an object', { v: 1 }],
    ['an array', [17900]],
  ])('400 when expectedAmountPaise is %s, before any quote or order', async (_n, bad) => {
    const userId = await seedUser();
    const findOne = jest.spyOn(CouponCode, 'findOne');
    const o = await order(userId, { skuId: 'topup_mid', expectedAmountPaise: bad });
    expect(o.status).toBe(400);
    expect(o.body).toEqual({ error: 'expectedAmountPaise must be an integer' });
    expect(ordersCreate).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['a number', 5],
    ['an object', { code: 'SAVE10' }],
    ['an array', ['SAVE10']],
    ['a boolean', true],
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
  ])('400 invalid_coupon_code when couponCode is %s: no quote, no order', async (_n, bad) => {
    const userId = await seedUser();
    await mkCoupon();
    const findOne = jest.spyOn(CouponCode, 'findOne');
    const o = await order(userId, { skuId: 'topup_mid', couponCode: bad });
    expect(o.status).toBe(400);
    expect(o.body).toEqual({ error: 'invalid_coupon_code' });
    expect(ordersCreate).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('a missing or null couponCode is a normal full-price order', async () => {
    const userId = await seedUser();
    await mkCoupon();
    for (const body of [{ skuId: 'topup_mid' }, { skuId: 'topup_mid', couponCode: null }]) {
      ordersCreate.mockClear();
      const o = await order(userId, body);
      expect(o.status).toBe(200);
      expect(o.body.data).toMatchObject({ amountPaise: 19900, couponApplied: null });
      expect(ordersCreate).toHaveBeenCalledTimes(1);
      expect(ordersCreate.mock.calls[0][0].amount).toBe(19900);
    }
  });

  it('an unknown SKU is still a 400 and a razorpay failure is still a 500', async () => {
    const userId = await seedUser();
    const bad = await order(userId, { skuId: 'topup_999', couponCode: 'SAVE10' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Unknown top-up SKU');
    ordersCreate.mockRejectedValueOnce(new Error('Razorpay down'));
    const down = await order(userId, { skuId: 'topup_mini' });
    expect(down.status).toBe(500);
    expect(down.body).toEqual({ error: 'Failed to create top-up order' });
  });

  it('a Razorpay order is never created with a 0 or sub-100-paise amount', async () => {
    const userId = await seedUser();
    for (const over of [
      { discountType: 'fixed', discountValue: 64 },
      { discountValue: 99 },
      { discountValue: 50 },
    ]) {
      await CouponCode.deleteMany({});
      await mkCoupon(over);
      for (const skuId of SKU_IDS) {
        ordersCreate.mockClear();
        await order(userId, { skuId, couponCode: 'SAVE10' });
        expect(ordersCreate.mock.calls[0][0].amount).toBeGreaterThanOrEqual(100);
      }
    }
  });
});

// ─── validate-coupon: optional auth ───────────────────────────────────────────

describe('T-540 validate-coupon optional auth', () => {
  it('with the internal secret and x-user-id: perUserChecked true and the limit is enforced', async () => {
    const userId = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 1 });
    const before = await validate('SAVE10', 'topup_mid', userId);
    expect(before.body.valid).toBe(true);
    expect(before.body.perUserChecked).toBe(true);
    await CouponUsage.create({ couponId: c._id, userId, orderId: 'o1' });
    const after = await validate('SAVE10', 'topup_mid', userId);
    expect(after.body).toEqual({ valid: false, reason: 'You have already used this coupon.' });
  });

  it('anonymous: no auth needed, perUserChecked false, the per-user limit is not checked', async () => {
    const userId = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 1 });
    await CouponUsage.create({ couponId: c._id, userId, orderId: 'o1' });
    const res = await validate('SAVE10', 'topup_mid');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.perUserChecked).toBe(false);
    expect(res.body.amountPaise).toBe(17900);
  });

  it('the old userId query param is ignored (anonymous stays unchecked, authed uses the header)', async () => {
    const used = await seedUser();
    const fresh = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 1 });
    await CouponUsage.create({ couponId: c._id, userId: used, orderId: 'o1' });

    const anon = await request(app).get(`/validate-coupon/SAVE10?skuId=topup_mid&userId=${used}`);
    expect(anon.body.valid).toBe(true);
    expect(anon.body.perUserChecked).toBe(false);

    // Authed as the fresh user, the query param naming the used user changes nothing.
    const authed = await request(app)
      .get(`/validate-coupon/SAVE10?skuId=topup_mid&userId=${used}`)
      .set(userHeaders(fresh));
    expect(authed.body.valid).toBe(true);
    expect(authed.body.perUserChecked).toBe(true);

    // And authed as the used user, a query param naming the fresh user does not hide the use.
    const usedAuthed = await request(app)
      .get(`/validate-coupon/SAVE10?skuId=topup_mid&userId=${fresh}`)
      .set(userHeaders(used));
    expect(usedAuthed.body.valid).toBe(false);
  });

  it('a wrong internal secret is anonymous, not an error and not trusted', async () => {
    const used = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 1 });
    await CouponUsage.create({ couponId: c._id, userId: used, orderId: 'o1' });
    const res = await request(app)
      .get('/validate-coupon/SAVE10?skuId=topup_mid')
      .set(userHeaders(used, { 'x-internal-secret': 'not-the-secret-at-all-xx' }));
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.perUserChecked).toBe(false);
  });

  it.each([
    ['no x-user-id', undefined],
    ['an x-user-id that is not an ObjectId', 'not-an-object-id'],
  ])('the secret with %s is anonymous', async (_n, idHeader) => {
    await mkCoupon();
    const headers: Record<string, string> = { 'x-internal-secret': INTERNAL_SECRET };
    if (idHeader) headers['x-user-id'] = idHeader;
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.perUserChecked).toBe(false);
  });

  it('no SKU and an unknown SKU still answer valid with null price fields, plus the new fields', async () => {
    const userId = await seedUser();
    await mkCoupon();
    for (const sku of [undefined, 'not_a_sku']) {
      const res = await validate('SAVE10', sku, userId);
      expect(res.body).toMatchObject({
        valid: true,
        originalPriceInr: null,
        discountInr: 0,
        finalPriceInr: null,
        originalPaise: null,
        discountPaise: 0,
        finalPaise: null,
        amountPaise: null,
        perUserChecked: true,
      });
    }
  });

  it('a plan SKU is priced in integer paise too', async () => {
    await mkCoupon({ discountValue: 50 });
    const res = await validate('SAVE10', 'solo_monthly');
    expect(res.body).toMatchObject({
      originalPaise: 79900,
      discountPaise: 40000,
      finalPaise: 39900,
      amountPaise: 39900,
      finalPriceInr: 399,
    });
  });
});

// ─── The loader ───────────────────────────────────────────────────────────────

describe('T-540 quoteTopup (the loader)', () => {
  it("counts only this user's CouponUsage rows", async () => {
    const a = await seedUser();
    const b = await seedUser();
    const c = await mkCoupon({ maxUsesPerUser: 2 });
    await CouponUsage.create({ couponId: c._id, userId: a, orderId: 'o1' });
    await CouponUsage.create({ couponId: c._id, userId: a, orderId: 'o2' });
    await CouponUsage.create({ couponId: c._id, userId: b, orderId: 'o3' });
    expect(await quoteTopup({ skuId: 'topup_mid', couponCode: 'SAVE10', userId: a })).toEqual({
      ok: false,
      reason: QUOTE_REASONS.perUser,
    });
    const qb = await quoteTopup({ skuId: 'topup_mid', couponCode: 'SAVE10', userId: b });
    expect(qb).toMatchObject({ ok: true, finalPaise: 17900, perUserChecked: true });
  });

  it('no userId, or a userId that is not an ObjectId, is unchecked (not an error)', async () => {
    await mkCoupon();
    for (const userId of [undefined, null, '', 'garbage']) {
      const q = await quoteTopup({ skuId: 'topup_mid', couponCode: 'save10 ', userId });
      expect(q).toMatchObject({ ok: true, perUserChecked: false, finalPaise: 17900 });
    }
  });

  it('does not touch the database for a coupon when no code is given', async () => {
    const find = jest.spyOn(CouponCode, 'findOne');
    const q = await quoteTopup({ skuId: 'topup_mid' });
    expect(q).toMatchObject({ ok: true, finalPaise: 19900, discountPaise: 0 });
    expect(find).not.toHaveBeenCalled();
  });

  it('reads the free-grant switch only when the quote comes to 0', async () => {
    const find = jest.spyOn(AppSetting, 'findOne');
    await mkCoupon({ discountValue: 50 });
    await quoteTopup({ skuId: 'topup_mid', couponCode: 'SAVE10' });
    await quoteTopup({ skuId: 'topup_mid' });
    expect(find).not.toHaveBeenCalled();

    await CouponCode.deleteMany({});
    await mkCoupon({ discountValue: 100, maxUses: 1 });
    const off = await quoteTopup({ skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(off).toEqual({ ok: false, reason: QUOTE_REASONS.cannotApply });
    expect(find).toHaveBeenCalledTimes(1);

    await switchOn();
    const on = await quoteTopup({ skuId: 'topup_mid', couponCode: 'SAVE10' });
    expect(on).toMatchObject({ ok: true, finalPaise: 0, discountPaise: 19900 });
  });
});

// ─── Admin create ─────────────────────────────────────────────────────────────

describe('T-540 admin create rules', () => {
  const adminHeaders = () => userHeaders(oid().toString(), { 'x-user-role': 'Admin' });
  const create = (body: Record<string, unknown>) =>
    request(app)
      .post('/admin/coupons')
      .set(adminHeaders())
      .send({ label: 'x', ...body });

  it.each([
    ['fixed 50.5', { discountType: 'fixed', discountValue: 50.5 }],
    ['fixed "50.5" as text', { discountType: 'fixed', discountValue: '50.5' }],
    ['fixed 1.5', { discountType: 'fixed', discountValue: 1.5 }],
  ])('400 for a fractional fixed discount (%s)', async (_n, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('whole number of rupees');
    expect(await CouponCode.countDocuments()).toBe(0);
  });

  it('a fractional percent is allowed (the quote rounds to whole rupees)', async () => {
    const res = await create({ discountType: 'percent', discountValue: 12.5 });
    expect(res.status).toBe(201);
    const userId = await seedUser();
    const v = await validate(res.body.code, 'topup_mid', userId);
    // 12.5% of 199 = 24.875 -> 25
    expect(v.body).toMatchObject({ discountPaise: 2500, finalPaise: 17400 });
    expect(Number.isInteger(v.body.finalPaise)).toBe(true);
  });

  it('the model refuses a fractional fixed discount too (not only the route)', async () => {
    await expect(mkCoupon({ discountType: 'fixed', discountValue: 2.5 })).rejects.toThrow(
      /whole number of rupees/,
    );
    await expect(mkCoupon({ discountType: 'fixed', discountValue: 2 })).resolves.toBeDefined();
  });

  describe('a coupon that can make some top-up free needs maxUses and maxUsesPerUser', () => {
    const freeKinds: Array<[string, Record<string, unknown>]> = [
      ['percent 100', { discountType: 'percent', discountValue: 100 }],
      ['fixed 65 (the smallest price)', { discountType: 'fixed', discountValue: 65 }],
      ['fixed 500', { discountType: 'fixed', discountValue: 500 }],
    ];
    describe.each(freeKinds)('%s', (_n, base) => {
      it.each([
        ['no limits', {}],
        ['only maxUses', { maxUses: 10 }],
        ['only maxUsesPerUser', { maxUsesPerUser: 1 }],
        ['maxUses 0', { maxUses: 0, maxUsesPerUser: 1 }],
        ['maxUsesPerUser 0', { maxUses: 10, maxUsesPerUser: 0 }],
        ['maxUses null', { maxUses: null, maxUsesPerUser: 1 }],
        ['maxUses fractional', { maxUses: 2.5, maxUsesPerUser: 1 }],
        ['maxUses negative', { maxUses: -1, maxUsesPerUser: 1 }],
        ['maxUses not a number', { maxUses: 'lots', maxUsesPerUser: 1 }],
      ])('400 with %s, nothing created', async (_m, limits) => {
        const res = await create({ ...base, ...limits });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maxUses and maxUsesPerUser');
        expect(await CouponCode.countDocuments()).toBe(0);
      });

      it('201 with both limits above zero (numbers or numeric text)', async () => {
        const a = await create({ ...base, code: 'FREEA', maxUses: 10, maxUsesPerUser: 1 });
        expect(a.status).toBe(201);
        expect(a.body).toMatchObject({ maxUses: 10, maxUsesPerUser: 1 });
        const b = await create({ ...base, code: 'FREEB', maxUses: '5', maxUsesPerUser: '2' });
        expect(b.status).toBe(201);
        expect(b.body).toMatchObject({ maxUses: 5, maxUsesPerUser: 2 });
      });
    });

    it.each([
      ['percent 99', { discountType: 'percent', discountValue: 99 }],
      ['percent 10', { discountType: 'percent', discountValue: 10 }],
      ['fixed 64', { discountType: 'fixed', discountValue: 64 }],
    ])('%s cannot be free, so no limits are demanded', async (_n, body) => {
      const res = await create(body);
      expect(res.status).toBe(201);
      expect(res.body.maxUses).toBeNull();
    });
  });
});

// ─── Webhook: the ledger records what was charged ─────────────────────────────

describe('T-540 webhook top-up branch', () => {
  const ledger = () => mongoose.connection.db!.collection('inkledger');

  function payload(
    userId: string,
    orderId: string,
    parts: { paymentAmount?: unknown; orderAmountPaid?: unknown; orderAmount?: unknown },
    notes: Record<string, string> = {},
  ): Record<string, unknown> {
    const payment: Record<string, unknown> = { id: `pay_${orderId}`, order_id: orderId };
    if (parts.paymentAmount !== undefined) payment.amount = parts.paymentAmount;
    const orderEntity: Record<string, unknown> = {
      id: orderId,
      notes: { sku_id: 'topup_mid', user_id: userId, ...notes },
    };
    if (parts.orderAmountPaid !== undefined) orderEntity.amount_paid = parts.orderAmountPaid;
    if (parts.orderAmount !== undefined) orderEntity.amount = parts.orderAmount;
    return { order: { entity: orderEntity }, payment: { entity: payment } };
  }

  const amountInrOf = async (orderId: string) =>
    ((await ledger().findOne({ reference: orderId }))?.metadata as { amountInr: number }).amountInr;

  it('a coupon-priced payment is recorded at the charged amount (179), not the list price (199)', async () => {
    const userId = await seedUser();
    await handleWebhookEvent('order.paid', payload(userId, 'order_w1', { paymentAmount: 17900 }));
    expect(await amountInrOf('order_w1')).toBe(179);
  });

  it('falls back: order.amount_paid, then order.amount, then the list price', async () => {
    const userId = await seedUser();
    await handleWebhookEvent('order.paid', payload(userId, 'order_w2', { orderAmountPaid: 17900 }));
    expect(await amountInrOf('order_w2')).toBe(179);
    await handleWebhookEvent('order.paid', payload(userId, 'order_w3', { orderAmount: 9900 }));
    expect(await amountInrOf('order_w3')).toBe(99);
    await handleWebhookEvent('order.paid', payload(userId, 'order_w4', {}));
    expect(await amountInrOf('order_w4')).toBe(199);
  });

  it('payment.amount wins over the order amounts; junk amounts are skipped', async () => {
    const userId = await seedUser();
    await handleWebhookEvent(
      'order.paid',
      payload(userId, 'order_w5', { paymentAmount: 17900, orderAmountPaid: 100, orderAmount: 100 }),
    );
    expect(await amountInrOf('order_w5')).toBe(179);
    await handleWebhookEvent(
      'order.paid',
      payload(userId, 'order_w6', { paymentAmount: 'x', orderAmountPaid: -5, orderAmount: 8900 }),
    );
    expect(await amountInrOf('order_w6')).toBe(89);
  });

  it('the Ink granted is unchanged by the amount (10 Ink = 20 units for topup_mid)', async () => {
    const userId = await seedUser();
    await handleWebhookEvent('order.paid', payload(userId, 'order_w7', { paymentAmount: 17900 }));
    expect((await User.findById(userId).lean())!.inkTopup).toBe(20);
    expect((await ledger().findOne({ reference: 'order_w7' }))!.reason).toBe('topup_purchase');
  });

  it('counts the coupon use and writes CouponUsage once for a paid top-up', async () => {
    const userId = await seedUser();
    const c = await mkCoupon({ maxUses: 5 });
    const p = payload(userId, 'order_w8', { paymentAmount: 17900 }, { coupon_code: 'SAVE10' });
    await handleWebhookEvent('order.paid', p);
    await handleWebhookEvent('order.paid', p);
    expect((await CouponCode.findById(c._id).lean())!.uses).toBe(1);
    expect(await CouponUsage.countDocuments({ couponId: c._id, orderId: 'order_w8' })).toBe(1);
  });

  describe('overshoot of maxUses on a paid top-up', () => {
    it('warns with the coupon code, uses and maxUses, and no user id', async () => {
      const userId = await seedUser();
      await mkCoupon({ maxUses: 1, uses: 1 });
      const warn = jest.spyOn(logger, 'warn');
      await handleWebhookEvent(
        'order.paid',
        payload(userId, 'order_w9', { paymentAmount: 17900 }, { coupon_code: 'SAVE10' }),
      );
      const call = warn.mock.calls.find((c) => String(c[1]).includes('past maxUses'));
      expect(call).toBeDefined();
      expect(call![0]).toEqual({ couponCode: 'SAVE10', uses: 2, maxUses: 1 });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(userId);
      // Money was taken, so the Ink is still granted.
      expect((await User.findById(userId).lean())!.inkTopup).toBe(20);
    });

    it.each([
      ['uses reach maxUses exactly', { maxUses: 2, uses: 1 }],
      ['no maxUses', { maxUses: null, uses: 50 }],
    ])('no warning when %s', async (_n, over) => {
      const userId = await seedUser();
      await mkCoupon(over);
      const warn = jest.spyOn(logger, 'warn');
      await handleWebhookEvent(
        'order.paid',
        payload(userId, 'order_w10', { paymentAmount: 17900 }, { coupon_code: 'SAVE10' }),
      );
      expect(warn.mock.calls.some((c) => String(c[1]).includes('past maxUses'))).toBe(false);
    });
  });
});
