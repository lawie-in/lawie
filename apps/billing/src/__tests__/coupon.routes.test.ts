/**
 * T-130 — coupon routes. These shipped on 17 June with no tests, which took
 * the service under its coverage bar and turned CI red on `develop`.
 *
 * Covers: who may manage coupons, what a coupon must have, and what the public
 * check returns for each reason a coupon is refused and for each kind of
 * discount.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const ADMIN_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function headers(role: 'Admin' | 'Client' = 'Admin') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': role === 'Admin' ? ADMIN_ID : USER_ID,
    'x-user-email': 'someone@test.com',
    'x-user-name': 'Someone',
    'x-user-plan': 'free',
    'x-user-role': role,
  };
}

const TEN_PERCENT = { label: 'Launch offer', discountType: 'percent', discountValue: 10 };

async function coupon(over: Record<string, unknown> = {}) {
  return CouponCode.create({
    code: 'SAVE10',
    label: 'Launch offer',
    discountType: 'percent',
    discountValue: 10,
    ...over,
  });
}

// The unique index on `code` must exist before the duplicate test runs.
beforeAll(async () => {
  await CouponCode.init();
});

describe('Coupons — who may manage them', () => {
  const adminCalls: Array<[string, 'post' | 'get' | 'patch', string]> = [
    ['create', 'post', '/admin/coupons'],
    ['list', 'get', '/admin/coupons'],
    ['edit', 'patch', '/admin/coupons/SAVE10'],
    ['disable', 'patch', '/admin/coupons/SAVE10/disable'],
  ];

  it.each(adminCalls)('%s: 401 without the internal secret', async (_name, method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(adminCalls)('%s: 403 for a user who is not an admin', async (_name, method, path) => {
    const res = await request(app)[method](path).set(headers('Client')).send(TEN_PERCENT);
    expect(res.status).toBe(403);
    expect(await CouponCode.countDocuments()).toBe(0);
  });
});

describe('POST /admin/coupons', () => {
  it('creates a coupon with the code in capitals and the defaults', async () => {
    const res = await request(app)
      .post('/admin/coupons')
      .set(headers())
      .send({ ...TEN_PERCENT, code: '  save10 ', label: '  Launch offer  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code: 'SAVE10',
      label: 'Launch offer',
      discountType: 'percent',
      discountValue: 10,
      applicablePlans: [],
      maxUses: null,
      maxUsesPerUser: 1,
      uses: 0,
      isActive: true,
      expiresAt: null,
      razorpayOfferId: null,
    });
  });

  it('makes up a code of 8 characters when none is given', async () => {
    const res = await request(app).post('/admin/coupons').set(headers()).send(TEN_PERCENT);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('keeps the limits, the plans, the end date and the Razorpay offer', async () => {
    const res = await request(app)
      .post('/admin/coupons')
      .set(headers())
      .send({
        code: 'FLAT50',
        label: 'Flat fifty',
        discountType: 'fixed',
        discountValue: '50',
        applicablePlans: ['topup_mid'],
        maxUses: 100,
        maxUsesPerUser: 2,
        expiresAt: '2030-01-01T00:00:00.000Z',
        razorpayOfferId: 'offer_123',
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code: 'FLAT50',
      discountType: 'fixed',
      discountValue: 50,
      applicablePlans: ['topup_mid'],
      maxUses: 100,
      maxUsesPerUser: 2,
      expiresAt: '2030-01-01T00:00:00.000Z',
      razorpayOfferId: 'offer_123',
    });
  });

  it.each([
    ['no label', { discountType: 'percent', discountValue: 10 }, 'label is required'],
    ['a label that is not text', { ...TEN_PERCENT, label: 5 }, 'label is required'],
    ['an unknown kind of discount', { ...TEN_PERCENT, discountType: 'half' }, 'discountType'],
    ['no discount value', { label: 'x', discountType: 'fixed' }, 'discountValue'],
    ['a discount of zero', { ...TEN_PERCENT, discountValue: 0 }, 'discountValue'],
    ['a negative discount', { ...TEN_PERCENT, discountValue: -5 }, 'discountValue'],
    ['more than 100 percent', { ...TEN_PERCENT, discountValue: 101 }, 'cannot exceed 100'],
  ])('400 for %s', async (_name, body, message) => {
    const res = await request(app).post('/admin/coupons').set(headers()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
    expect(await CouponCode.countDocuments()).toBe(0);
  });

  it('a fixed discount may be more than 100', async () => {
    const res = await request(app)
      .post('/admin/coupons')
      .set(headers())
      .send({ label: 'Big', discountType: 'fixed', discountValue: 500 });
    expect(res.status).toBe(201);
    expect(res.body.discountValue).toBe(500);
  });

  it('409 when the code already exists, whatever the capitals', async () => {
    await coupon();
    const res = await request(app)
      .post('/admin/coupons')
      .set(headers())
      .send({ ...TEN_PERCENT, code: 'save10' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('SAVE10');
    expect(await CouponCode.countDocuments()).toBe(1);
  });
});

describe('GET /admin/coupons', () => {
  it('lists every coupon, newest first', async () => {
    await coupon({ code: 'OLDER', createdAt: new Date('2026-01-01') });
    await coupon({ code: 'NEWER', createdAt: new Date('2026-02-01') });
    const res = await request(app).get('/admin/coupons').set(headers());
    expect(res.status).toBe(200);
    expect(res.body.coupons.map((c: { code: string }) => c.code)).toEqual(['NEWER', 'OLDER']);
  });

  it('gives an empty list when there are none', async () => {
    const res = await request(app).get('/admin/coupons').set(headers());
    expect(res.body).toEqual({ coupons: [] });
  });
});

describe('PATCH /admin/coupons/:code', () => {
  it('changes the label, the end date and the Razorpay offer, and nothing else', async () => {
    await coupon();
    const res = await request(app).patch('/admin/coupons/save10').set(headers()).send({
      label: '  Diwali offer ',
      expiresAt: '2030-06-01T00:00:00.000Z',
      razorpayOfferId: 'offer_9',
      discountValue: 90,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code: 'SAVE10',
      label: 'Diwali offer',
      expiresAt: '2030-06-01T00:00:00.000Z',
      razorpayOfferId: 'offer_9',
      discountValue: 10,
    });
  });

  it('an empty end date or offer clears it', async () => {
    await coupon({ expiresAt: new Date('2030-01-01'), razorpayOfferId: 'offer_1' });
    const res = await request(app)
      .patch('/admin/coupons/SAVE10')
      .set(headers())
      .send({ expiresAt: null, razorpayOfferId: '' });
    expect(res.status).toBe(200);
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.razorpayOfferId).toBeNull();
    expect(res.body.label).toBe('Launch offer');
  });

  it('400 when there is nothing to change', async () => {
    await coupon();
    const res = await request(app)
      .patch('/admin/coupons/SAVE10')
      .set(headers())
      .send({ discountValue: 90 });
    expect(res.status).toBe(400);
  });

  it('404 for a code that does not exist', async () => {
    const res = await request(app).patch('/admin/coupons/NOPE').set(headers()).send({ label: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /admin/coupons/:code/disable', () => {
  it('switches the coupon off', async () => {
    await coupon();
    const res = await request(app).patch('/admin/coupons/save10/disable').set(headers());
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect((await CouponCode.findOne({ code: 'SAVE10' }))!.isActive).toBe(false);
  });

  it('404 for a code that does not exist', async () => {
    const res = await request(app).patch('/admin/coupons/NOPE/disable').set(headers());
    expect(res.status).toBe(404);
  });
});

describe('GET /validate-coupon/:code — refused', () => {
  it('a code that does not exist', async () => {
    const res = await request(app).get('/validate-coupon/NOPE?skuId=topup_mid');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: 'Coupon not found or inactive.' });
  });

  it('a coupon that was switched off', async () => {
    await coupon({ isActive: false });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body).toEqual({ valid: false, reason: 'Coupon not found or inactive.' });
  });

  it('a coupon past its end date', async () => {
    await coupon({ expiresAt: new Date(Date.now() - 60_000) });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body).toEqual({ valid: false, reason: 'Coupon has expired.' });
  });

  it('a coupon that has been used as often as it allows', async () => {
    await coupon({ maxUses: 2, uses: 2 });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body).toEqual({ valid: false, reason: 'Coupon has reached its usage limit.' });
  });

  it('a user who has already used it', async () => {
    const c = await coupon();
    await CouponUsage.create({ couponId: c._id, userId: USER_ID, orderId: 'order_1' });
    const res = await request(app).get(`/validate-coupon/SAVE10?skuId=topup_mid&userId=${USER_ID}`);
    expect(res.body).toEqual({ valid: false, reason: 'You have already used this coupon.' });
  });

  it('an item the coupon is not for', async () => {
    await coupon({ applicablePlans: ['pro_monthly'] });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body).toEqual({
      valid: false,
      reason: 'This coupon does not apply to the selected item.',
    });
  });
});

describe('GET /validate-coupon/:code — accepted', () => {
  it('a percent discount on a top-up, rounded to the rupee', async () => {
    await coupon({ razorpayOfferId: 'offer_1' });
    // topup_mid is ₹199. 10% is 19.9, rounded to 20.
    const res = await request(app).get('/validate-coupon/save10?skuId=topup_mid');
    expect(res.body).toEqual({
      valid: true,
      code: 'SAVE10',
      label: 'Launch offer',
      discountType: 'percent',
      discountValue: 10,
      razorpayOfferId: 'offer_1',
      originalPriceInr: 199,
      discountInr: 20,
      finalPriceInr: 179,
    });
  });

  it('a percent discount on a subscription plan', async () => {
    await coupon({ discountValue: 50 });
    // solo_monthly is ₹799. Half is 399.5, rounded to 400.
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=solo_monthly');
    expect(res.body).toMatchObject({
      valid: true,
      originalPriceInr: 799,
      discountInr: 400,
      finalPriceInr: 399,
    });
  });

  it('a fixed discount is never more than the price', async () => {
    await coupon({ discountType: 'fixed', discountValue: 100 });
    // topup_mini is ₹65.
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mini');
    expect(res.body).toMatchObject({
      valid: true,
      originalPriceInr: 65,
      discountInr: 65,
      finalPriceInr: 0,
    });
  });

  it('a fixed discount smaller than the price', async () => {
    await coupon({ discountType: 'fixed', discountValue: 50 });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body).toMatchObject({ originalPriceInr: 199, discountInr: 50, finalPriceInr: 149 });
  });

  it('a 100 percent coupon makes the item free', async () => {
    await coupon({ discountValue: 100 });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_max');
    expect(res.body).toMatchObject({ originalPriceInr: 499, discountInr: 499, finalPriceInr: 0 });
  });

  it('a coupon for one item is accepted for that item', async () => {
    await coupon({ applicablePlans: ['topup_mid'] });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body.valid).toBe(true);
  });

  it('a coupon marked "all" is accepted for any item', async () => {
    await coupon({ applicablePlans: ['all'] });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=pro_yearly');
    expect(res.body).toMatchObject({ valid: true, originalPriceInr: 19990, discountInr: 1999 });
  });

  it('with no item named, it is valid and no price is worked out', async () => {
    await coupon({ applicablePlans: ['topup_mid'] });
    const res = await request(app).get('/validate-coupon/SAVE10');
    expect(res.body).toMatchObject({
      valid: true,
      originalPriceInr: null,
      discountInr: 0,
      finalPriceInr: null,
    });
  });

  it('an item that does not exist gets no price', async () => {
    await coupon();
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=not_a_sku');
    expect(res.body).toMatchObject({ valid: true, originalPriceInr: null, finalPriceInr: null });
  });

  it('a coupon with uses left and a future end date', async () => {
    await coupon({ maxUses: 5, uses: 4, expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await request(app).get('/validate-coupon/SAVE10?skuId=topup_mid');
    expect(res.body.valid).toBe(true);
  });

  it('a user under the per-user limit, and another user, are both accepted', async () => {
    const c = await coupon({ maxUsesPerUser: 2 });
    await CouponUsage.create({ couponId: c._id, userId: USER_ID, orderId: 'order_1' });
    const same = await request(app).get(
      `/validate-coupon/SAVE10?skuId=topup_mid&userId=${USER_ID}`,
    );
    expect(same.body.valid).toBe(true);
    const other = await request(app).get(
      `/validate-coupon/SAVE10?skuId=topup_mid&userId=${new mongoose.Types.ObjectId().toString()}`,
    );
    expect(other.body.valid).toBe(true);
  });
});
