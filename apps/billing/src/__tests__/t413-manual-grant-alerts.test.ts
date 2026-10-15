import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import request from 'supertest';

import app from '../app';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import * as inkLedger from '../services/ink-ledger.service';

// T-413 (reviewer should-fix, Arjun a): every "paid but not granted / needs a human" outcome raises
// one scrubbed, fingerprinted Sentry message (reportManualGrant). Real handler through the route,
// in-memory Mongo; only @sentry/node's scope API is faked.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

type FakeScope = Record<
  | 'setFingerprint'
  | 'setSDKProcessingMetadata'
  | 'addEventProcessor'
  | 'setTags'
  | 'setTag'
  | 'setExtra'
  | 'setExtras'
  | 'setContext'
  | 'setUser',
  jest.Mock
>;
const newScope = (): FakeScope => ({
  setFingerprint: jest.fn(),
  setSDKProcessingMetadata: jest.fn(),
  addEventProcessor: jest.fn(),
  setTags: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  setExtras: jest.fn(),
  setContext: jest.fn(),
  setUser: jest.fn(),
});

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// The scope that was active when captureMessage ran, one entry per captureMessage call.
let messageScopes: FakeScope[] = [];

const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const ORDER = 'order_t413alert';
const SUB_ID = 'sub_t413alert';

const post = (body: string) =>
  request(app)
    .post('/webhook/razorpay')
    .type('json')
    .set('x-razorpay-signature', crypto.createHmac('sha256', SECRET).update(body).digest('hex'))
    .send(body);

const capturedCalls = () => (Sentry.captureMessage as jest.Mock).mock.calls;

const paymentCaptured = (userId: unknown, orderId: string | null = ORDER) =>
  JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_t413alert',
          ...(orderId === null ? {} : { order_id: orderId }),
          notes: { sku_id: 'topup_mini', user_id: String(userId) },
        },
      },
    },
  });

const subCharged = () =>
  JSON.stringify({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: SUB_ID,
          notes: { planId: 'solo_monthly' },
          current_start: 1_800_000_000,
          current_end: 1_802_600_000,
          paid_count: 1,
        },
      },
      payment: { entity: { id: 'pay_sub_t413alert' } },
    },
  });

async function mkUser() {
  return User.create({ email: 'alert413@example.com', plan: 'free' });
}
async function mkSub() {
  const user = await mkUser();
  await Subscription.create({
    userId: user._id,
    razorpaySubscriptionId: SUB_ID,
    status: 'created',
  });
  return user;
}

/** Asserts the one manual-grant signal: message, level, fingerprint, exact tags, scrubbing. */
function expectSignal(
  reason: string,
  level: 'error' | 'warning',
  idTag: { razorpayOrderId: string } | { razorpaySubscriptionId: string },
) {
  expect(capturedCalls()).toEqual([[`Billing: ${reason}`, level]]);
  expect(messageScopes).toHaveLength(1);
  const scope = messageScopes[0];
  const id = Object.values(idTag)[0];
  expect(scope.setFingerprint).toHaveBeenCalledTimes(1);
  expect(scope.setFingerprint).toHaveBeenCalledWith(['billing-manual-grant', reason, id]);
  expect(scope.setTags).toHaveBeenCalledTimes(1);
  expect(scope.setTags).toHaveBeenCalledWith({ reason, ...idTag });
  expect(scope.setSDKProcessingMetadata).toHaveBeenCalledWith({
    normalizedRequest: undefined,
    ipAddress: undefined,
  });
  // Nothing else is attached to the event.
  for (const k of ['setTag', 'setExtra', 'setExtras', 'setContext', 'setUser'] as const) {
    expect(scope[k]).not.toHaveBeenCalled();
  }
  expect(scope.addEventProcessor).toHaveBeenCalledTimes(1);
  const processor = scope.addEventProcessor.mock.calls[0][0] as (e: unknown) => unknown;
  expect(
    processor({
      message: 'keep',
      request: { data: 'BODY', headers: { 'x-razorpay-signature': 's' } },
      user: { ip_address: '1.2.3.4', email: 'a@b.c' },
    }),
  ).toEqual({ message: 'keep' });
}

describe('T-413 manual-grant Sentry signals', () => {
  beforeEach(() => {
    messageScopes = [];
    (Sentry.captureException as jest.Mock).mockReset();
    (Sentry.captureMessage as jest.Mock).mockReset().mockImplementation(() => 'id');
    let current: FakeScope | undefined;
    (Sentry.captureMessage as jest.Mock).mockImplementation(() => {
      messageScopes.push(current!);
      return 'id';
    });
    (Sentry.withScope as jest.Mock).mockReset().mockImplementation((cb: (s: FakeScope) => void) => {
      const s = newScope();
      current = s;
      return cb(s);
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('top-up', () => {
    it('topup-no-order-id: error, order id "", grant skipped, route 200', async () => {
      const user = await mkUser();
      const res = await post(paymentCaptured(user._id, null));
      expect(res.status).toBe(200);
      expectSignal('topup-no-order-id', 'error', { razorpayOrderId: '' });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('topup-unknown-user: error, per-order fingerprint, route 200', async () => {
      const ghost = new mongoose.Types.ObjectId();
      const res = await post(paymentCaptured(ghost));
      expect(res.status).toBe(200);
      expectSignal('topup-unknown-user', 'error', { razorpayOrderId: ORDER });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('topup-claim-rollback-failed: error, route 500 (plus the route capture, other fingerprint)', async () => {
      const user = await mkUser();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down ZZSECRET');
      }) as never);
      jest
        .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
        .mockRejectedValueOnce(new Error('ZZSECRET'));
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(500);
      expectSignal('topup-claim-rollback-failed', 'error', { razorpayOrderId: ORDER });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify([capturedCalls(), messageScopes.map((s) => s.setTags.mock.calls)]),
      ).not.toContain('ZZSECRET');
    });

    it('topup-mark-granted-failed: error level, grant stands, route 200', async () => {
      const user = await mkUser();
      jest
        .spyOn(mongoose.mongo.Collection.prototype, 'updateOne')
        .mockRejectedValueOnce(new Error('ZZSECRET'))
        .mockRejectedValueOnce(new Error('ZZSECRET'))
        .mockRejectedValueOnce(new Error('ZZSECRET')); // MARK_GRANTED_ATTEMPTS = 3
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect((await User.findById(user._id).lean())!.inkTopup).toBe(6);
      expectSignal('topup-mark-granted-failed', 'error', { razorpayOrderId: ORDER });
      expect(JSON.stringify(capturedCalls())).not.toContain('ZZSECRET');
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('tags carry no userId, amount, sku or email', async () => {
      const ghost = new mongoose.Types.ObjectId();
      await post(paymentCaptured(ghost));
      const tags = messageScopes[0].setTags.mock.calls[0][0] as Record<string, string>;
      expect(Object.keys(tags).sort()).toEqual(['razorpayOrderId', 'reason']);
      expect(JSON.stringify(tags)).not.toContain(String(ghost));
    });
  });

  describe('subscription', () => {
    it('subscription-claim-rollback-no-match: error, rethrow -> route 500', async () => {
      await mkSub();
      jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
      jest.spyOn(Subscription, 'updateOne').mockResolvedValueOnce({ matchedCount: 0 } as never);
      const res = await post(subCharged());
      expect(res.status).toBe(500);
      expectSignal('subscription-claim-rollback-no-match', 'error', {
        razorpaySubscriptionId: SUB_ID,
      });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('subscription-claim-rollback-failed: error, rethrow -> route 500', async () => {
      await mkSub();
      jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
      jest.spyOn(Subscription, 'updateOne').mockRejectedValueOnce(new Error('ZZSECRET'));
      const res = await post(subCharged());
      expect(res.status).toBe(500);
      expectSignal('subscription-claim-rollback-failed', 'error', {
        razorpaySubscriptionId: SUB_ID,
      });
      expect(JSON.stringify(capturedCalls())).not.toContain('ZZSECRET');
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('a clean rollback after a grant failure (500) raises no manual-grant signal', async () => {
      const user = await mkSub();
      jest.spyOn(inkLedger, 'grantSubscriptionInk').mockRejectedValueOnce(new Error('db down'));
      const body = subCharged();
      expect((await post(body)).status).toBe(500);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      // the retry then grants
      expect((await post(body)).status).toBe(200);
      expect((await User.findById(user._id).lean())!.inkSub).toBeGreaterThan(0);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('no signal on the happy path', () => {
    it('a normal top-up (and its duplicate) raises nothing', async () => {
      const user = await mkUser();
      const body = paymentCaptured(user._id);
      expect((await post(body)).status).toBe(200);
      expect((await post(body)).status).toBe(200);
      expect((await User.findById(user._id).lean())!.inkTopup).toBe(6);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });

    it('a normal subscription grant (and its duplicate) raises nothing', async () => {
      const user = await mkSub();
      const body = subCharged();
      expect((await post(body)).status).toBe(200);
      expect((await post(body)).status).toBe(200);
      expect((await User.findById(user._id).lean())!.inkSub).toBeGreaterThan(0);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });
  });
});
