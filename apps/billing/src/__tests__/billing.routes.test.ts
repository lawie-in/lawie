import './setupDb';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';

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
}) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': payload.sub,
    'x-user-email': payload.email,
    'x-user-name': payload.name,
    'x-user-plan': payload.plan ?? 'free',
    'x-user-role': payload.role ?? 'Client',
  };
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
      const userId = new mongoose.Types.ObjectId().toString();
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
        email: user.email,
        name: 'Free',
      });

      const res = await request(app).get('/status').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBe('free');
      expect(res.body.data.status).toBeNull();
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
