import './setupDb';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import * as subscriptionService from '../services/subscription.service';

// Mock Razorpay SDK
jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
    },
  },
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

/** Build internal headers that simulate gateway-forwarded requests */
function internalHeaders(payload: {
  sub: string;
  email: string;
  name: string;
  plan?: string;
  role?: string;
  /** T-343: the gateway sets this from the pv claim; POST /subscribe and /topup/order need the current one. */
  privacyVersion?: string;
}) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': payload.sub,
    'x-user-email': payload.email,
    'x-user-name': payload.name,
    'x-user-plan': payload.plan ?? 'free',
    'x-user-role': payload.role ?? 'Client',
    'x-user-privacy-version': payload.privacyVersion ?? CURRENT_PRIVACY_VERSION,
  };
}

/**
 * T-223 AC5: POST /subscribe and POST /topup/order need a verified user in the DB for the
 * x-user-id they send. Seeds one (emailVerified true) and returns its id.
 */
async function seedVerifiedUser(email: string): Promise<string> {
  const user = await User.create({ email, plan: 'free', emailVerified: true });
  return user._id.toString();
}

describe('Billing Routes', () => {
  // ─── Health ───────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('billing');
      expect(res.body.status).toBe('ok');
    });
  });

  // ─── GET /plans ──────────────────────────────────────────────────────

  describe('GET /plans', () => {
    it('returns subscription plans and topup SKUs', async () => {
      const res = await request(app).get('/plans');
      expect(res.status).toBe(200);
      expect(res.body.subscriptions).toHaveLength(4);
      expect(res.body.topups).toHaveLength(3);
      expect(res.body.subscriptions[0]).toHaveProperty('id');
      expect(res.body.subscriptions[0]).toHaveProperty('priceInr');
      expect(res.body.topups[0]).toHaveProperty('ink');
    });
  });

  // ─── GET /plan/:id ─────────────────────────────────────────────────

  describe('GET /plan/:id', () => {
    it('returns plan details for valid id', async () => {
      const res = await request(app).get('/plan/solo_monthly');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('solo_monthly');
      expect(res.body.tier).toBe('solo');
      expect(res.body.priceInr).toBe(799);
    });

    it('returns 404 for unknown plan id', async () => {
      const res = await request(app).get('/plan/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Plan not found');
    });
  });

  // ─── POST /topup/order ─────────────────────────────────────────────

  describe('POST /topup/order', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/topup/order').send({ skuId: 'topup_20' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for unknown SKU', async () => {
      const userId = await seedVerifiedUser('topup@test.com');
      const headers = internalHeaders({ sub: userId, email: 'topup@test.com', name: 'Test' });
      const res = await request(app).post('/topup/order').set(headers).send({ skuId: 'topup_999' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unknown top-up SKU');
    });

    it('creates a razorpay order for valid SKU', async () => {
      const userId = await seedVerifiedUser('topup@test.com');
      const headers = internalHeaders({ sub: userId, email: 'topup@test.com', name: 'Test' });

      // Mock razorpay.orders.create
      (razorpay as any).orders = {
        create: jest.fn().mockResolvedValue({ id: 'order_test123' }),
      };

      const res = await request(app).post('/topup/order').set(headers).send({ skuId: 'topup_max' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.orderId).toBe('order_test123');
      expect(res.body.data.ink).toBe(28);
      expect(res.body.data.amountInr).toBe(499);
    });

    it('returns 500 when razorpay order creation fails', async () => {
      const userId = await seedVerifiedUser('topup@test.com');
      const headers = internalHeaders({ sub: userId, email: 'topup@test.com', name: 'Test' });

      (razorpay as any).orders = {
        create: jest.fn().mockRejectedValue(new Error('Razorpay down')),
      };

      const res = await request(app)
        .post('/topup/order')
        .set(headers)
        .send({ skuId: 'topup_mini' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create top-up order');
    });
  });

  // ─── POST /subscribe ─────────────────────────────────────────────────

  describe('POST /subscribe', () => {
    it('returns 401 without internal secret', async () => {
      const res = await request(app).post('/subscribe');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong internal secret', async () => {
      const res = await request(app).post('/subscribe').set('x-internal-secret', 'wrong-secret');
      expect(res.status).toBe(401);
    });

    it('creates subscription and returns payment link with valid headers', async () => {
      const userId = await seedVerifiedUser('test@example.com');
      const headers = internalHeaders({ sub: userId, email: 'test@example.com', name: 'Test' });

      (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
        id: 'sub_route_test',
        short_url: 'https://rzp.io/route-test',
      });

      const res = await request(app).post('/subscribe').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.subscriptionId).toBe('sub_route_test');
      expect(res.body.data.shortUrl).toBe('https://rzp.io/route-test');
    });

    it.each(['active', 'pending', 'halted', 'paused'] as const)(
      'T-444: returns 409 subscription_exists for a %s sub, with the existing sub data',
      async (status) => {
        (razorpay.subscriptions.create as jest.Mock).mockClear();
        const userId = await seedVerifiedUser('live@example.com');
        const headers = internalHeaders({ sub: userId, email: 'live@example.com', name: 'Live' });
        const paidThrough = new Date('2027-01-15T10:00:00.000Z');
        await Subscription.create({
          userId,
          razorpaySubscriptionId: 'sub_live_route',
          status,
          planId: 'solo_monthly',
          paidThrough,
        });

        const res = await request(app).post('/subscribe').set(headers);

        expect(res.status).toBe(409);
        expect(res.body).toEqual({
          error: 'subscription_exists',
          status,
          planId: 'solo_monthly',
          paidThrough: paidThrough.toISOString(),
        });
        expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
      },
    );

    it('T-444: a created sub is reused (200) with its own planId', async () => {
      const userId = await seedVerifiedUser('created@example.com');
      const headers = internalHeaders({ sub: userId, email: 'created@example.com', name: 'C' });
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_created_route',
        status: 'created',
        planId: 'solo_monthly',
      });
      (razorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
        id: 'sub_created_route',
        short_url: 'https://rzp.io/created-route',
      });

      const res = await request(app).post('/subscribe').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        subscriptionId: 'sub_created_route',
        shortUrl: 'https://rzp.io/created-route',
        planId: 'solo_monthly',
      });
    });

    it('returns 500 when subscription creation throws', async () => {
      const userId = await seedVerifiedUser('test@example.com');
      const headers = internalHeaders({ sub: userId, email: 'test@example.com', name: 'Test' });
      (razorpay.subscriptions.create as jest.Mock).mockRejectedValueOnce(
        new Error('Razorpay down'),
      );
      const res = await request(app).post('/subscribe').set(headers);
      expect(res.status).toBe(500);
    });

    it('returns 401 when internal secret is present but x-user-id is missing', async () => {
      const res = await request(app)
        .post('/subscribe')
        .set('x-internal-secret', process.env.INTERNAL_SECRET!);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing user context');
    });
  });

  // ─── GET /status ──────────────────────────────────────────────────────

  describe('GET /status', () => {
    it('returns 401 without internal secret', async () => {
      const res = await request(app).get('/status');
      expect(res.status).toBe(401);
    });

    it('returns free plan for user with no subscription', async () => {
      const user = await User.create({ email: 'free@test.com', plan: 'free' });
      const headers = internalHeaders({
        sub: user._id.toString(),
        email: user.email ?? 'free@test.com',
        name: 'Free',
      });

      const res = await request(app).get('/status').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBe('free');
      expect(res.body.data.status).toBeNull();
    });

    it('returns 500 when status lookup throws', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const headers = internalHeaders({ sub: userId, email: 'err@test.com', name: 'Err' });
      jest
        .spyOn(subscriptionService, 'getSubscriptionStatus')
        .mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/status').set(headers);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get subscription status');
    });
  });

  // ─── POST /webhook/razorpay ───────────────────────────────────────────

  describe('POST /webhook/razorpay', () => {
    it('returns 400 when signature header is missing', async () => {
      const res = await request(app).post('/webhook/razorpay').type('json').send('{}');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing signature header');
    });

    it('returns 400 for invalid signature', async () => {
      const body = JSON.stringify({ event: 'subscription.activated', payload: {} });
      const fakeSignature = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');

      const res = await request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', fakeSignature)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('returns 500 when the handler rejects, so Razorpay retries', async () => {
      jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockRejectedValueOnce(new Error('handler boom'));

      const body = JSON.stringify({ event: 'subscription.activated', payload: {} });
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

      const res = await request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', signature)
        .send(body);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error' });
    });

    it('T-444: an unknown subscription event or status returns 200 and changes nothing', async () => {
      const user = await User.create({ email: 'unknown-ev@test.com', plan: 'free' });
      await Subscription.create({
        userId: user._id,
        razorpaySubscriptionId: 'sub_unknown_ev',
        status: 'active',
      });
      const body = JSON.stringify({
        event: 'subscription.frobnicated',
        payload: { subscription: { entity: { id: 'sub_unknown_ev', status: 'frobnicated' } } },
      });
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

      const res = await request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', signature)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(
        (await Subscription.findOne({ razorpaySubscriptionId: 'sub_unknown_ev' }))!.status,
      ).toBe('active');
    });

    it('returns 200 and processes valid webhook event', async () => {
      const user = await User.create({ email: 'webhook@test.com', plan: 'free' });
      await Subscription.create({
        userId: user._id,
        razorpaySubscriptionId: 'sub_webhook_test',
        status: 'created',
      });

      const body = JSON.stringify({
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: { id: 'sub_webhook_test' },
          },
        },
      });

      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

      const res = await request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', signature)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');

      // Give async handler time to process
      await new Promise((r) => setTimeout(r, 100));

      const updatedUser = await User.findById(user._id);
      expect(updatedUser!.plan).toBe('pro');
    });
  });

  // ─── 404 ──────────────────────────────────────────────────────────────

  describe('Unknown routes', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
