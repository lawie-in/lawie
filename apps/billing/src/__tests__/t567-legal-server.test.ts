/**
 * T-567 (Ajay, signed 22 Oct): item 23 - POST /cancel has no privacy gate (a user who chose
 * "Not now" can still cancel); /subscribe and /topup/order stay blocked (T-343).
 * Item 52 - no `badge` on the top-up SKUs or in GET /plans.
 */
import './setupDb';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { razorpay } from '../config/razorpay';
import { TOPUP_SKUS } from '../config/credit-skus';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn(), cancel: jest.fn() },
    orders: { create: jest.fn() },
  },
}));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET as string;
const cancelMock = razorpay.subscriptions.cancel as unknown as jest.Mock;

function headers(userId: string, privacyVersion?: string) {
  const h: Record<string, string> = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 't567@example.com',
    'x-user-name': 'T567',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
  if (privacyVersion !== undefined) h['x-user-privacy-version'] = privacyVersion;
  return h;
}

const BLOCKED = { error: 'privacy_reaccept_required' };

beforeEach(() => {
  jest.clearAllMocks();
  cancelMock.mockResolvedValue({});
});

describe('T-567 item 23: /cancel is not behind the privacy gate', () => {
  async function seedLiveSub(): Promise<string> {
    const user = await User.create({ email: 't567@example.com', plan: 'pro', emailVerified: true });
    await Subscription.create({
      userId: user._id,
      razorpaySubscriptionId: `sub_t567_${user._id}`,
      status: 'active',
      planId: 'solo_monthly',
    });
    return user._id.toString();
  }

  it.each([
    ['a missing header', undefined],
    ['a stale version', '2026-10-11'],
    ['the current version', CURRENT_PRIVACY_VERSION],
  ])('POST /cancel with %s is not blocked and cancels', async (_label, version) => {
    const userId = await seedLiveSub();
    const res = await request(app).post('/cancel').set(headers(userId, version)).send({});
    expect(res.status).toBe(200);
    expect(res.body).not.toEqual(BLOCKED);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it('with a stale version and no live subscription, /cancel answers 409 (handler reached), not 403', async () => {
    const res = await request(app)
      .post('/cancel')
      .set(headers(new mongoose.Types.ObjectId().toString(), '2026-10-11'))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'no_live_subscription' });
  });

  it('/cancel still needs the gateway secret', async () => {
    const h = headers(new mongoose.Types.ObjectId().toString());
    delete (h as Partial<typeof h>)['x-internal-secret'];
    const res = await request(app).post('/cancel').set(h).send({});
    expect(res.status).toBe(401);
  });

  it.each([
    ['/subscribe', { planId: 'practice_monthly' }],
    ['/topup/order', { skuId: 'topup_max' }],
  ])('POST %s with a stale version is still blocked', async (path, body) => {
    const res = await request(app)
      .post(path)
      .set(headers(new mongoose.Types.ObjectId().toString(), '2026-10-11'))
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });

  it.each([
    ['/subscribe', { planId: 'practice_monthly' }],
    ['/topup/order', { skuId: 'topup_max' }],
  ])('POST %s with no header is still blocked', async (path, body) => {
    const res = await request(app)
      .post(path)
      .set(headers(new mongoose.Types.ObjectId().toString()))
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(BLOCKED);
  });
});

describe('T-567 item 52: no badge', () => {
  it('no top-up SKU has a badge', () => {
    for (const sku of TOPUP_SKUS) expect(sku).not.toHaveProperty('badge');
  });

  it('GET /plans has no badge anywhere in the body, and still lists the top-ups', async () => {
    const res = await request(app).get('/plans');
    expect(res.status).toBe(200);
    expect(res.body.topups.length).toBe(TOPUP_SKUS.length);
    for (const t of res.body.topups) expect(t).not.toHaveProperty('badge');
    expect(JSON.stringify(res.body)).not.toMatch(/badge|POPULAR/i);
  });
});
