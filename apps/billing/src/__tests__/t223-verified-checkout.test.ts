/**
 * T-223 AC5: Razorpay order creation refuses an unverified email user with a clear error code.
 * POST /subscribe and POST /topup/order only. Verified (emailVerified, google provider,
 * googleId) users pass; the webhook (auto-renewal) is untouched; billing never writes the
 * fields it reads.
 */
import './setupDb';
import crypto from 'crypto';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
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
const CODE = { error: 'email_verification_required' };

function headers(userId: string) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 't223@example.com',
    'x-user-name': 'T223',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}

const ROUTES: Array<[string, Record<string, unknown>]> = [
  ['/subscribe', {}],
  ['/topup/order', { skuId: 'topup_max' }],
];

const rawUser = (id: string) =>
  mongoose.connection.db!.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });

async function seed(fields: Record<string, unknown>): Promise<string> {
  const u = await User.create({ email: 't223@example.com', plan: 'free', ...fields });
  return u._id.toString();
}

beforeEach(() => {
  jest.clearAllMocks();
  (razorpay.subscriptions.create as jest.Mock).mockResolvedValue({
    id: 'sub_223',
    short_url: 'https://rzp.io/223',
  });
  (razorpay.orders.create as jest.Mock).mockResolvedValue({ id: 'order_223' });
});

describe.each(ROUTES)('T-223 AC5 POST %s', (path, body) => {
  describe.each([
    ['unverified email user (defaults)', { authProvider: 'email' }],
    ['emailVerified explicitly false', { authProvider: 'email', emailVerified: false }],
    ['empty-string googleId', { emailVerified: false, googleId: '' }],
    ['null googleId', { emailVerified: false, googleId: null }],
  ])('refuses: %s', (_l, fields) => {
    it('403 email_verification_required, no Razorpay call, nothing written', async () => {
      const id = await seed(fields);
      const before = await rawUser(id);
      const res = await request(app).post(path).set(headers(id)).send(body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(CODE);
      expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
      expect(razorpay.orders.create).not.toHaveBeenCalled();
      expect(await Subscription.countDocuments()).toBe(0);
      expect(await rawUser(id)).toEqual(before);
    });
  });

  it('refuses a user id that is not in the database (fails closed)', async () => {
    const res = await request(app)
      .post(path)
      .set(headers(new mongoose.Types.ObjectId().toString()))
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(CODE);
    expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it('refuses a malformed user id (fails closed)', async () => {
    const res = await request(app).post(path).set(headers('not-an-object-id')).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(CODE);
  });

  it.each([
    ['emailVerified true', { emailVerified: true }],
    ['google provider', { authProvider: 'google', emailVerified: false }],
    [
      'googleId set (linked or pre-T-299 Google user)',
      { authProvider: 'email', googleId: 'g-223' },
    ],
  ])('passes through: %s', async (_l, fields) => {
    const id = await seed(fields);
    const res = await request(app).post(path).set(headers(id)).send(body);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    if (path === '/subscribe') expect(razorpay.subscriptions.create).toHaveBeenCalledTimes(1);
    else expect(razorpay.orders.create).toHaveBeenCalledTimes(1);
  });

  it('a verified user is not written to (billing only reads those fields)', async () => {
    const id = await seed({ emailVerified: true, authProvider: 'email' });
    const before = await rawUser(id);
    await request(app).post(path).set(headers(id)).send(body);
    const after = await rawUser(id);
    expect(after!.emailVerified).toBe(true);
    expect(after!.authProvider).toBe(before!.authProvider);
    expect(after!.googleId).toBe(before!.googleId);
  });

  it('a database error on the check is a 503, not a pass', async () => {
    const id = await seed({ emailVerified: true });
    jest.spyOn(User, 'findById').mockImplementationOnce((() => {
      throw new Error('db down');
    }) as never);
    const res = await request(app).post(path).set(headers(id)).send(body);
    expect(res.status).toBe(503);
    expect(razorpay.subscriptions.create).not.toHaveBeenCalled();
    expect(razorpay.orders.create).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('401 (no gateway secret) and the privacy gate still come first', async () => {
    const id = await seed({ emailVerified: false });
    const h = headers(id) as Record<string, string>;
    delete h['x-internal-secret'];
    expect((await request(app).post(path).set(h).send(body)).status).toBe(401);

    const stale = { ...headers(id), 'x-user-privacy-version': '2026-10-11' };
    const res = await request(app).post(path).set(stale).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
  });
});

describe('T-223 AC5 everything else is unaffected', () => {
  it('the webhook (auto-renewal) processes for an unverified email user', async () => {
    const user = await User.create({
      email: 'renew223@test.com',
      plan: 'free',
      emailVerified: false,
    });
    await Subscription.create({
      userId: user._id,
      razorpaySubscriptionId: 'sub_renew_223',
      status: 'created',
    });
    const payload = JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_renew_223' } } },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', signature)
      .send(payload);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect((await User.findById(user._id))?.plan).toBe('pro');
  });

  it('read-only routes work for an unverified user: /plans and /status', async () => {
    const id = await seed({ emailVerified: false });
    expect((await request(app).get('/plans')).status).toBe(200);
    expect((await request(app).get('/status').set(headers(id))).status).toBe(200);
  });
});
