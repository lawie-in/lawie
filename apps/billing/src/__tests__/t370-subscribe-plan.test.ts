/**
 * T-370 — POST /subscribe buys the plan named in the body. {planId:'pro_monthly'} creates the
 * Pro Razorpay subscription (Pro plan id, Pro notes), never Solo. An empty body still defaults
 * to solo_monthly (the old behaviour that made "Upgrade to Pro" buy Solo); the web app now
 * always sends a planId.
 */
import './setupDb';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import { Types } from 'mongoose';
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
const SOLO_PLAN = 'plan_t370_solo_m';
const PRO_PLAN = 'plan_t370_pro_m';

function headers(userId: string) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 't370@example.com',
    'x-user-name': 'T370',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}

/** T-223 AC5: /subscribe needs a verified user in the DB for the x-user-id it gets. */
async function seedVerifiedUser(): Promise<string> {
  const user = await User.create({
    email: `t370-${new Types.ObjectId()}@example.com`,
    plan: 'free',
    emailVerified: true,
  });
  return user._id.toString();
}

const create = razorpay.subscriptions.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_PLAN_SOLO_MONTHLY = SOLO_PLAN;
  process.env.RAZORPAY_PLAN_PRO_MONTHLY = PRO_PLAN;
  create.mockResolvedValue({ id: 'sub_t370', short_url: 'https://rzp.io/t370' });
});

afterEach(() => {
  delete process.env.RAZORPAY_PLAN_SOLO_MONTHLY;
  delete process.env.RAZORPAY_PLAN_PRO_MONTHLY;
});

describe('T-370 billing: POST /subscribe honours planId', () => {
  it('{planId:"pro_monthly"} creates the Pro subscription, not Solo', async () => {
    const userId = await seedVerifiedUser();
    const res = await request(app)
      .post('/subscribe')
      .set(headers(userId))
      .send({ planId: 'pro_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      subscriptionId: 'sub_t370',
      shortUrl: 'https://rzp.io/t370',
      planId: 'pro_monthly',
    });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.plan_id).toBe(PRO_PLAN);
    expect(arg.plan_id).not.toBe(SOLO_PLAN);
    expect(arg.notes).toMatchObject({ planId: 'pro_monthly', tier: 'pro', cycle: 'monthly' });
    expect(await Subscription.countDocuments({ userId })).toBe(1);
  });

  it('{planId:"solo_monthly"} still creates Solo', async () => {
    const res = await request(app)
      .post('/subscribe')
      .set(headers(await seedVerifiedUser()))
      .send({ planId: 'solo_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.data.planId).toBe('solo_monthly');
    expect(create.mock.calls[0][0].plan_id).toBe(SOLO_PLAN);
    expect(create.mock.calls[0][0].notes).toMatchObject({ planId: 'solo_monthly', tier: 'solo' });
  });

  it('an empty body defaults to Solo, which is why the web app must send a planId', async () => {
    const res = await request(app)
      .post('/subscribe')
      .set(headers(await seedVerifiedUser()))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.planId).toBe('solo_monthly');
    expect(create.mock.calls[0][0].plan_id).toBe(SOLO_PLAN);
  });

  it('an unknown planId is rejected and nothing is created', async () => {
    const res = await request(app)
      .post('/subscribe')
      .set(headers(await seedVerifiedUser()))
      .send({ planId: 'unlimited_999' });

    expect(res.status).toBe(500);
    // T-526 (Arjun): the 500 body is fixed; the thrown message never reaches it.
    expect(res.body).toEqual({ error: 'Failed to create subscription' });
    expect(JSON.stringify(res.body)).not.toContain('Unknown plan id');
    expect(create).not.toHaveBeenCalled();
  });
});
