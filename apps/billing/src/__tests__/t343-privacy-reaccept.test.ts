/**
 * T-343 — requireCurrentPrivacy on billing, with the real middleware.
 * Ajay (signed, Addendum 1): only user-started payments are blocked (POST /subscribe and
 * POST /topup/order). Razorpay-started renewals (the webhook) are NOT blocked. Never block
 * without a signed summary.
 */
import './setupDb';
import crypto from 'crypto';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import * as privacyConstants from '@lawie/shared/dist/constants/privacy';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { razorpay } from '../config/razorpay';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn() },
    orders: { create: jest.fn() },
  },
}));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET as string;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET as string;

function headers(privacyVersion?: string, userId = new mongoose.Types.ObjectId().toString()) {
  const h: Record<string, string> = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 't343@example.com',
    'x-user-name': 'T343',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
  if (privacyVersion !== undefined) h['x-user-privacy-version'] = privacyVersion;
  return h;
}

const BLOCKED = { error: 'privacy_reaccept_required' };

/** T-223 AC5: a request that reaches the handler needs a verified user for its x-user-id. */
async function seedVerifiedUser(): Promise<string> {
  const user = await User.create({ email: 't343@example.com', plan: 'free', emailVerified: true });
  return user._id.toString();
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

describe('T-343 billing: user-started payments need the current privacy version', () => {
  describe.each([
    ['/subscribe', { planId: 'practice_monthly' }],
    ['/topup/order', { skuId: 'topup_max' }],
  ])('POST %s', (path, body) => {
    it('403 privacy_reaccept_required when the header is missing', async () => {
      const res = await request(app).post(path).set(headers()).send(body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(BLOCKED);
    });

    it('403 for an older version', async () => {
      const res = await request(app).post(path).set(headers('2026-10-11')).send(body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(BLOCKED);
    });

    it('does not call Razorpay or touch the database when blocked', async () => {
      await request(app).post(path).set(headers('2026-10-11')).send(body);
      expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
      expect(razorpay.orders.create).not.toHaveBeenCalled();
      expect(await Subscription.countDocuments()).toBe(0);
    });

    it('still 401s without the gateway secret before looking at the version', async () => {
      const h = headers(CURRENT_PRIVACY_VERSION);
      delete (h as Partial<typeof h>)['x-internal-secret'];
      const res = await request(app).post(path).set(h).send(body);
      expect(res.status).toBe(401);
    });

    it('is not blocked when the current version has no signed summary', async () => {
      jest.spyOn(privacyConstants, 'getPrivacyVersionSummary').mockReturnValue(undefined);
      const res = await request(app)
        .post(path)
        .set(headers(undefined, await seedVerifiedUser()))
        .send(body);
      expect(res.body).not.toEqual(BLOCKED);
      expect(res.status).not.toBe(403);
    });
  });

  it('POST /topup/order with the current version reaches the handler and creates the order', async () => {
    (razorpay.orders.create as jest.Mock).mockResolvedValue({ id: 'order_343' });
    const res = await request(app)
      .post('/topup/order')
      .set(headers(CURRENT_PRIVACY_VERSION, await seedVerifiedUser()))
      .send({ skuId: 'topup_max' });
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe('order_343');
  });

  it('POST /subscribe with the current version reaches the handler and creates the subscription', async () => {
    (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
      id: 'sub_343',
      short_url: 'https://rzp.io/343',
    });
    const res = await request(app)
      .post('/subscribe')
      .set(headers(CURRENT_PRIVACY_VERSION, await seedVerifiedUser()));
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe('sub_343');
  });
});

describe('T-343 billing: nothing else is blocked, and the webhook (auto-renewal) is not', () => {
  it('Razorpay webhook with no privacy header is processed and the plan upgrades', async () => {
    const user = await User.create({ email: 'renew343@test.com', plan: 'free' });
    await Subscription.create({
      userId: user._id,
      razorpaySubscriptionId: 'sub_renew_343',
      status: 'created',
    });
    const body = JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_renew_343' } } },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await User.findById(user._id))?.plan).toBe('pro');
  });

  it('webhook with a stale privacy header is processed too', async () => {
    const body = JSON.stringify({ event: 'subscription.charged', payload: {} });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', signature)
      .set('x-user-privacy-version', '2026-10-11')
      .send(body);
    expect(res.status).toBe(200);
  });

  it('read-only routes work with a stale version: /plans, /plan/:id, /status', async () => {
    const stale = headers('2026-10-11');
    expect((await request(app).get('/plans')).status).toBe(200);
    expect((await request(app).get('/plan/practice_monthly')).status).not.toBe(403);
    const status = await request(app).get('/status').set(stale);
    expect(status.status).toBe(200);
  });
});
