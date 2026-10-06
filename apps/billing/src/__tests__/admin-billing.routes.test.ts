/**
 * T-130 — admin billing routes (subscriptions list, detail, sync with
 * Razorpay, revenue). These shipped on 17 June with no tests.
 *
 * Razorpay is a stub. No test here talks to it.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

import app from '../app';
import { razorpay } from '../config/razorpay';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const ADMIN_ID = '507f1f77bcf86cd799439011';
const SOLO_MONTHLY_PLAN = 'plan_test_solo_monthly';

function headers(role: 'Admin' | 'Client' = 'Admin') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': ADMIN_ID,
    'x-user-email': 'admin@test.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'free',
    'x-user-role': role,
  };
}

const fetchMock = razorpay.subscriptions.fetch as unknown as jest.Mock;

async function user(name: string, email: string) {
  // The billing copy of the user schema is loose; name is one of the auth fields.
  const doc = await User.create({ name, email } as Record<string, unknown>);
  return doc._id as mongoose.Types.ObjectId;
}

async function sub(over: Record<string, unknown>) {
  return Subscription.create({
    userId: new mongoose.Types.ObjectId(),
    razorpaySubscriptionId: 'sub_default',
    status: 'active',
    ...over,
  });
}

beforeAll(() => {
  process.env.RAZORPAY_PLAN_SOLO_MONTHLY = SOLO_MONTHLY_PLAN;
});

afterAll(() => {
  delete process.env.RAZORPAY_PLAN_SOLO_MONTHLY;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('Admin billing — who may call it', () => {
  const calls: Array<[string, 'get' | 'post', string]> = [
    ['list', 'get', '/admin/billing/subscriptions'],
    ['detail', 'get', '/admin/billing/subscriptions/sub_1'],
    ['sync', 'post', '/admin/billing/subscriptions/sub_1/sync'],
    ['revenue', 'get', '/admin/billing/revenue'],
  ];

  it.each(calls)('%s: 401 without the internal secret', async (_name, method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it.each(calls)('%s: 403 for a user who is not an admin', async (_name, method, path) => {
    const res = await request(app)[method](path).set(headers('Client'));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /admin/billing/subscriptions', () => {
  async function seedThree() {
    const asha = await user('Asha Verma', 'asha@test.com');
    const ravi = await user('Ravi Singh', 'ravi@test.com');
    await sub({
      userId: asha,
      razorpaySubscriptionId: 'sub_asha',
      razorpayPlanId: SOLO_MONTHLY_PLAN,
      status: 'active',
      createdAt: new Date('2026-03-01'),
    });
    await sub({
      userId: ravi,
      razorpaySubscriptionId: 'sub_ravi',
      razorpayPlanId: 'plan_old',
      planType: 'annual',
      amount: 699900,
      status: 'cancelled',
      cancelledAt: new Date('2026-02-15'),
      createdAt: new Date('2026-02-01'),
    });
    // A subscription whose user no longer exists, with no plan id.
    await sub({
      razorpaySubscriptionId: 'sub_orphan',
      status: 'active',
      createdAt: new Date('2026-01-01'),
    });
  }

  it('lists subscriptions newest first, with the user and the plan in words', async () => {
    await seedThree();
    const res = await request(app).get('/admin/billing/subscriptions').set(headers());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.limit).toBe(50);
    expect(res.body.skip).toBe(0);
    expect(
      res.body.subscriptions.map(
        (s: { razorpaySubscriptionId: string }) => s.razorpaySubscriptionId,
      ),
    ).toEqual(['sub_asha', 'sub_ravi', 'sub_orphan']);

    const [asha, ravi, orphan] = res.body.subscriptions;
    expect(asha).toMatchObject({
      userName: 'Asha Verma',
      userEmail: 'asha@test.com',
      planLabel: 'solo / monthly',
      planType: 'monthly',
      amount: 79900,
      amountInr: 799,
      currency: 'INR',
      status: 'active',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null,
    });
    // A plan id we do not sell any more is shown as it is.
    expect(ravi).toMatchObject({
      userName: 'Ravi Singh',
      planLabel: 'plan_old',
      planType: 'annual',
      amountInr: 6999,
      status: 'cancelled',
    });
    expect(ravi.cancelledAt).toBe('2026-02-15T00:00:00.000Z');
    expect(orphan).toMatchObject({ userName: '', userEmail: '', planLabel: 'unknown' });
  });

  it('filters by status', async () => {
    await seedThree();
    const res = await request(app)
      .get('/admin/billing/subscriptions?status=cancelled')
      .set(headers());
    expect(res.body.total).toBe(1);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].razorpaySubscriptionId).toBe('sub_ravi');
  });

  it.each([
    ['a name', 'asha', 'sub_asha'],
    ['an email', 'RAVI@TEST', 'sub_ravi'],
    ['a Razorpay id', 'orphan', 'sub_orphan'],
  ])('searches by %s, whatever the capitals', async (_name, q, expected) => {
    await seedThree();
    const res = await request(app).get(`/admin/billing/subscriptions?q=${q}`).set(headers());
    expect(
      res.body.subscriptions.map(
        (s: { razorpaySubscriptionId: string }) => s.razorpaySubscriptionId,
      ),
    ).toEqual([expected]);
  });

  it('a search that matches nothing gives an empty list', async () => {
    await seedThree();
    const res = await request(app).get('/admin/billing/subscriptions?q=nobody').set(headers());
    expect(res.body.subscriptions).toEqual([]);
  });

  it('takes a page with limit and skip, and never more than 200 at a time', async () => {
    await seedThree();
    const page = await request(app)
      .get('/admin/billing/subscriptions?limit=1&skip=1')
      .set(headers());
    expect(page.body.limit).toBe(1);
    expect(page.body.skip).toBe(1);
    expect(page.body.total).toBe(3);
    expect(page.body.subscriptions).toHaveLength(1);
    expect(page.body.subscriptions[0].razorpaySubscriptionId).toBe('sub_ravi');

    const big = await request(app).get('/admin/billing/subscriptions?limit=5000').set(headers());
    expect(big.body.limit).toBe(200);
  });

  it('gives an empty list when there are none', async () => {
    const res = await request(app).get('/admin/billing/subscriptions').set(headers());
    expect(res.body).toMatchObject({ subscriptions: [], total: 0 });
  });
});

describe('GET /admin/billing/subscriptions/:id', () => {
  it('404 for a subscription we do not have', async () => {
    const res = await request(app).get('/admin/billing/subscriptions/sub_nope').set(headers());
    expect(res.status).toBe(404);
  });

  it('gives the subscription, its user and the last 10 payments, newest first, in rupees', async () => {
    const asha = await user('Asha Verma', 'asha@test.com');
    const payments = Array.from({ length: 12 }, (_v, i) => ({
      paymentId: `pay_${i + 1}`,
      amount: 79900,
      status: i === 11 ? 'failed' : 'captured',
      paidAt: new Date(Date.UTC(2026, 0, i + 1)),
    }));
    await sub({
      userId: asha,
      razorpaySubscriptionId: 'sub_asha',
      razorpayPlanId: SOLO_MONTHLY_PLAN,
      currentPeriodStart: new Date('2026-03-01'),
      currentPeriodEnd: new Date('2026-04-01'),
      paymentHistory: payments,
    });
    const res = await request(app).get('/admin/billing/subscriptions/sub_asha').set(headers());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userName: 'Asha Verma',
      userEmail: 'asha@test.com',
      razorpaySubscriptionId: 'sub_asha',
      razorpayPlanId: SOLO_MONTHLY_PLAN,
      planLabel: 'solo / monthly',
      amountInr: 799,
      status: 'active',
      currentPeriodStart: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: '2026-04-01T00:00:00.000Z',
      cancelledAt: null,
    });
    expect(res.body.paymentHistory).toHaveLength(10);
    expect(res.body.paymentHistory[0]).toEqual({
      paymentId: 'pay_12',
      amount: 799,
      status: 'failed',
      paidAt: '2026-01-12T00:00:00.000Z',
    });
    expect(res.body.paymentHistory[9].paymentId).toBe('pay_3');
  });

  it('a subscription whose user is gone, with no payments', async () => {
    await sub({ razorpaySubscriptionId: 'sub_orphan' });
    const res = await request(app).get('/admin/billing/subscriptions/sub_orphan').set(headers());
    expect(res.body).toMatchObject({
      userName: '',
      userEmail: '',
      planLabel: 'unknown',
      paymentHistory: [],
      currentPeriodStart: null,
    });
  });
});

describe('POST /admin/billing/subscriptions/:id/sync', () => {
  it('502 when Razorpay cannot be reached, and nothing is changed', async () => {
    await sub({ razorpaySubscriptionId: 'sub_1', status: 'active' });
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const res = await request(app).post('/admin/billing/subscriptions/sub_1/sync').set(headers());
    expect(res.status).toBe(502);
    expect((await Subscription.findOne({ razorpaySubscriptionId: 'sub_1' }))!.status).toBe(
      'active',
    );
  });

  it('404 when Razorpay has it and we do not', async () => {
    fetchMock.mockResolvedValueOnce({ status: 'active' });
    const res = await request(app)
      .post('/admin/billing/subscriptions/sub_nope/sync')
      .set(headers());
    expect(res.status).toBe(404);
  });

  it('copies the status and the period from Razorpay', async () => {
    await sub({ razorpaySubscriptionId: 'sub_1', status: 'active' });
    fetchMock.mockResolvedValueOnce({
      status: 'cancelled',
      current_start: 1767225600, // 1 Jan 2026 00:00 UTC
      current_end: 1769904000, // 1 Feb 2026 00:00 UTC
    });
    const res = await request(app).post('/admin/billing/subscriptions/sub_1/sync').set(headers());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: 'cancelled' });
    expect(fetchMock).toHaveBeenCalledWith('sub_1');
    const saved = (await Subscription.findOne({ razorpaySubscriptionId: 'sub_1' }))!;
    expect(saved.status).toBe('cancelled');
    expect(saved.currentPeriodStart!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.currentPeriodEnd!.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('keeps the period it has when Razorpay sends none', async () => {
    await sub({
      razorpaySubscriptionId: 'sub_1',
      status: 'created',
      currentPeriodStart: new Date('2026-03-01'),
      currentPeriodEnd: new Date('2026-04-01'),
    });
    fetchMock.mockResolvedValueOnce({ status: 'authenticated' });
    const res = await request(app).post('/admin/billing/subscriptions/sub_1/sync').set(headers());
    expect(res.body).toEqual({ ok: true, status: 'authenticated' });
    const saved = (await Subscription.findOne({ razorpaySubscriptionId: 'sub_1' }))!;
    expect(saved.currentPeriodStart!.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(saved.currentPeriodEnd!.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('GET /admin/billing/revenue', () => {
  it('is all zeros, with six months of trend, when nothing has been sold', async () => {
    const res = await request(app).get('/admin/billing/revenue').set(headers());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mrr: 0,
      arr: 0,
      activeCount: 0,
      topupRevenueThisMonth: 0,
      arpu: 0,
      planMix: {},
    });
    expect(res.body.trend).toHaveLength(6);
    for (const month of res.body.trend) {
      expect(month).toMatchObject({ subInr: 0, topupInr: 0 });
      expect(typeof month.month).toBe('string');
    }
  });

  it('counts active plans only, spreads a yearly plan over 12 months, and adds this month', async () => {
    const now = new Date();
    const asha = new mongoose.Types.ObjectId();
    const ravi = new mongoose.Types.ObjectId();
    // Monthly, active, paid this month: ₹799 a month.
    await sub({
      userId: asha,
      razorpaySubscriptionId: 'sub_monthly',
      razorpayPlanId: SOLO_MONTHLY_PLAN,
      planType: 'monthly',
      amount: 79900,
      paymentHistory: [
        { paymentId: 'pay_1', amount: 79900, status: 'captured', paidAt: now },
        // A failed payment is not revenue.
        { paymentId: 'pay_2', amount: 79900, status: 'failed', paidAt: now },
      ],
    });
    // Yearly, active, on a plan id we do not know: ₹6,999 a year is ₹583.25 a month.
    await sub({
      userId: ravi,
      razorpaySubscriptionId: 'sub_yearly',
      razorpayPlanId: 'plan_old',
      planType: 'annual',
      amount: 699900,
    });
    // Active, with no plan id at all. It must not be counted under a plan we sell.
    await sub({ userId: ravi, razorpaySubscriptionId: 'sub_noplan', amount: 0 });
    // Cancelled: not counted.
    await sub({
      userId: ravi,
      razorpaySubscriptionId: 'sub_gone',
      status: 'cancelled',
      amount: 79900,
    });
    // Two top-ups this month, one a long time ago, and one ledger row that is not a purchase.
    await mongoose.connection.db!.collection('inkledger').insertMany([
      { reason: 'topup_purchase', createdAt: now, metadata: { amountInr: 199 } },
      { reason: 'topup_purchase', createdAt: now, metadata: { amountInr: 65 } },
      { reason: 'topup_purchase', createdAt: now, metadata: {} },
      { reason: 'topup_purchase', createdAt: new Date('2020-01-01'), metadata: { amountInr: 499 } },
      { reason: 'generate', createdAt: now, metadata: { amountInr: 1000 } },
    ]);

    const res = await request(app).get('/admin/billing/revenue').set(headers());
    expect(res.status).toBe(200);
    // 79900 + round(699900 / 12) = 138225 paise, which is ₹1,382 after rounding.
    expect(res.body).toMatchObject({
      mrr: 1382,
      arr: 16584,
      activeCount: 3,
      topupRevenueThisMonth: 264,
      arpu: 691,
      planMix: { solo_monthly: 1, unknown: 2 },
    });
    expect(res.body.trend).toHaveLength(6);
    expect(res.body.trend[5]).toMatchObject({ subInr: 799, topupInr: 264 });
    for (const month of res.body.trend.slice(0, 5)) {
      expect(month).toMatchObject({ subInr: 0, topupInr: 0 });
    }
  });
});
