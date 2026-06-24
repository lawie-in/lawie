import './setupDb';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

// Mock Razorpay SDK before importing the service
jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
    },
  },
}));

import { razorpay } from '../config/razorpay';
import {
  createSubscription,
  getSubscriptionStatus,
  verifyWebhookSignature,
  handleWebhookEvent,
} from '../services/subscription.service';

const mockedRazorpay = razorpay as jest.Mocked<typeof razorpay>;

describe('subscription.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── createSubscription ───────────────────────────────────────────────

  describe('createSubscription', () => {
    it('creates a new Razorpay subscription for a user without existing sub', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const email = 'user@example.com';

      (mockedRazorpay.subscriptions.create as jest.Mock).mockResolvedValue({
        id: 'sub_test123',
        short_url: 'https://rzp.io/test',
      });

      const result = await createSubscription(userId, email);

      expect(result.subscriptionId).toBe('sub_test123');
      expect(result.shortUrl).toBe('https://rzp.io/test');
      // createSubscription defaults to 'solo_monthly' and resolves the Razorpay
      // plan id via env (falls back to legacy RAZORPAY_PLAN_ID when unset).
      expect(mockedRazorpay.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_notify: 1,
          notes: expect.objectContaining({
            userId,
            email,
            planId: 'solo_monthly',
            tier: 'solo',
            cycle: 'monthly',
          }),
        }),
      );

      // Verify subscription was saved to DB
      const savedSub = await Subscription.findOne({ userId });
      expect(savedSub).not.toBeNull();
      expect(savedSub!.razorpaySubscriptionId).toBe('sub_test123');
      expect(savedSub!.status).toBe('created');
    });

    it('throws for an unrecognised plan id', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await expect(createSubscription(userId, 'test@example.com', 'invalid_plan')).rejects.toThrow(
        'Unknown plan id "invalid_plan"',
      );
    });

    it('returns existing subscription if user already has an active one', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const email = 'user@example.com';

      // Create an existing active subscription
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_existing',
        status: 'active',
      });

      (mockedRazorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
        id: 'sub_existing',
        short_url: 'https://rzp.io/existing',
      });

      const result = await createSubscription(userId, email);

      expect(result.subscriptionId).toBe('sub_existing');
      expect(result.shortUrl).toBe('https://rzp.io/existing');
      // Should NOT have called create
      expect(mockedRazorpay.subscriptions.create).not.toHaveBeenCalled();
    });
  });

  // ─── getSubscriptionStatus ────────────────────────────────────────────

  describe('getSubscriptionStatus', () => {
    it('returns free plan when user has no subscription', async () => {
      const user = await User.create({ email: 'free@example.com', plan: 'free' });

      const result = await getSubscriptionStatus(user._id.toString());

      expect(result.plan).toBe('free');
      expect(result.status).toBeNull();
      expect(result.currentPeriodEnd).toBeNull();
    });

    it('returns pro plan with active subscription details', async () => {
      const user = await User.create({ email: 'pro@example.com', plan: 'pro' });
      const periodEnd = new Date('2026-05-24');

      await Subscription.create({
        userId: user._id,
        razorpaySubscriptionId: 'sub_pro',
        status: 'active',
        currentPeriodEnd: periodEnd,
      });

      const result = await getSubscriptionStatus(user._id.toString());

      expect(result.plan).toBe('pro');
      expect(result.status).toBe('active');
      expect(result.currentPeriodEnd).toEqual(periodEnd);
    });
  });

  // ─── verifyWebhookSignature ───────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    it('returns true for a valid HMAC signature', () => {
      const body = Buffer.from('{"event":"subscription.activated"}');
      const signature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

      expect(verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const body = Buffer.from('{"event":"subscription.activated"}');
      const fakeSignature = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');

      expect(verifyWebhookSignature(body, fakeSignature)).toBe(false);
    });
  });

  // ─── handleWebhookEvent ───────────────────────────────────────────────

  describe('handleWebhookEvent', () => {
    let userId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      const user = await User.create({ email: 'webhook@example.com', plan: 'free' });
      userId = user._id as mongoose.Types.ObjectId;
    });

    function makePayload(subId: string, chargeAt?: number) {
      return {
        subscription: {
          entity: {
            id: subId,
            ...(chargeAt ? { charge_at: chargeAt } : {}),
          },
        },
      };
    }

    it('upgrades user to pro on subscription.activated', async () => {
      const sub = await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_activate',
        status: 'created',
      });

      await handleWebhookEvent('subscription.activated', makePayload('sub_activate'));

      const updatedSub = await Subscription.findById(sub._id);
      const updatedUser = await User.findById(userId);
      expect(updatedSub!.status).toBe('active');
      expect(updatedUser!.plan).toBe('pro');
    });

    it('upgrades user to pro on subscription.charged and updates period', async () => {
      const chargeAt = Math.floor(Date.now() / 1000) + 30 * 86400; // 30 days from now
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_charge',
        status: 'active',
      });

      await handleWebhookEvent('subscription.charged', makePayload('sub_charge', chargeAt));

      const updatedSub = await Subscription.findOne({ razorpaySubscriptionId: 'sub_charge' });
      const updatedUser = await User.findById(userId);
      expect(updatedSub!.status).toBe('active');
      expect(updatedSub!.currentPeriodEnd).toEqual(new Date(chargeAt * 1000));
      expect(updatedUser!.plan).toBe('pro');
    });

    it('downgrades user to free on subscription.cancelled', async () => {
      await User.findByIdAndUpdate(userId, { plan: 'pro' });
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_cancel',
        status: 'active',
      });

      await handleWebhookEvent('subscription.cancelled', makePayload('sub_cancel'));

      const updatedSub = await Subscription.findOne({ razorpaySubscriptionId: 'sub_cancel' });
      const updatedUser = await User.findById(userId);
      expect(updatedSub!.status).toBe('cancelled');
      expect(updatedSub!.cancelledAt).toBeDefined();
      expect(updatedUser!.plan).toBe('free');
    });

    it('keeps user as pro on cancellation if another active sub exists', async () => {
      await User.findByIdAndUpdate(userId, { plan: 'pro' });

      // Two subscriptions — one being cancelled, one still active
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_cancel2',
        status: 'active',
      });
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_still_active',
        status: 'active',
      });

      await handleWebhookEvent('subscription.cancelled', makePayload('sub_cancel2'));

      const updatedUser = await User.findById(userId);
      expect(updatedUser!.plan).toBe('pro');
    });

    it('downgrades user to free on subscription.expired', async () => {
      await User.findByIdAndUpdate(userId, { plan: 'pro' });
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_expire',
        status: 'active',
      });

      await handleWebhookEvent('subscription.expired', makePayload('sub_expire'));

      const updatedSub = await Subscription.findOne({ razorpaySubscriptionId: 'sub_expire' });
      const updatedUser = await User.findById(userId);
      expect(updatedSub!.status).toBe('expired');
      expect(updatedUser!.plan).toBe('free');
    });

    it('logs warning but makes no changes on payment.failed', async () => {
      await User.findByIdAndUpdate(userId, { plan: 'pro' });
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_failed',
        status: 'active',
      });

      await handleWebhookEvent('payment.failed', makePayload('sub_failed'));

      const updatedUser = await User.findById(userId);
      const updatedSub = await Subscription.findOne({ razorpaySubscriptionId: 'sub_failed' });
      expect(updatedUser!.plan).toBe('pro');
      expect(updatedSub!.status).toBe('active');
    });

    it('grants topup credits on order.paid with valid SKU in notes', async () => {
      const user = await User.create({ email: 'topup-wh@example.com', topupCredits: 0 });

      await handleWebhookEvent('order.paid', {
        order: {
          entity: {
            id: 'order_topup_test',
            notes: { user_id: user._id.toString(), sku_id: 'topup_max' },
          },
        },
        payment: { entity: { id: 'pay_topup_test' } },
      });

      const updated = await User.findById(user._id);
      // topup_max = 28 Ink; stored as 28 × 2 = 56 ledger units in inkTopup
      expect(updated!.inkTopup).toBe(56);
    });

    it('skips order.paid with unknown SKU', async () => {
      await handleWebhookEvent('order.paid', {
        order: {
          entity: {
            id: 'order_bad',
            // snake_case so the lookup runs and hits the unknown-SKU branch
            notes: { user_id: userId.toString(), sku_id: 'topup_unknown' },
          },
        },
      });
      // no crash, no credit change
      const user = await User.findById(userId);
      expect(user!.inkTopup ?? 0).toBe(0);
    });

    it('grants subscription credits when planId is in notes', async () => {
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_with_notes',
        status: 'created',
      });

      await handleWebhookEvent('subscription.charged', {
        subscription: {
          entity: {
            id: 'sub_with_notes',
            charge_at: Math.floor(Date.now() / 1000) + 30 * 86400,
            notes: { planId: 'pro_monthly' },
          },
        },
      });

      const updated = await User.findById(userId);
      // pro_monthly = 150 Ink; stored as 150 × 2 = 300 ledger units in inkSub
      expect(updated!.planTier).toBe('pro');
      expect(updated!.inkSub).toBe(300);
    });

    it('handles unrecognized event type gracefully', async () => {
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_unknown_event',
        status: 'active',
      });

      // Should not throw
      await handleWebhookEvent('some.unknown.event', {
        subscription: { entity: { id: 'sub_unknown_event' } },
      });

      const user = await User.findById(userId);
      expect(user!.plan).toBe('free'); // unchanged
    });

    it('returns early for unknown subscription ID', async () => {
      await handleWebhookEvent('subscription.activated', makePayload('sub_unknown'));

      // No errors thrown, no data changed
      const user = await User.findById(userId);
      expect(user!.plan).toBe('free');
    });
  });
});
