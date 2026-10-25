import './setupDb';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

// Mock Razorpay SDK before importing the service
jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
      cancel: jest.fn(),
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

    describe('T-505: total_count on the subscriptions.create payload', () => {
      it.each([
        ['solo_monthly', 1200],
        ['pro_monthly', 1200],
        ['solo_yearly', 100],
        ['pro_yearly', 100],
      ])(
        'sends total_count for %s = %i, with callback_url and notes intact',
        async (planId, count) => {
          const userId = new mongoose.Types.ObjectId().toString();
          const email = 'user@example.com';
          (mockedRazorpay.subscriptions.create as jest.Mock).mockResolvedValue({
            id: `sub_${planId}`,
            short_url: 'https://rzp.io/test',
          });

          await createSubscription(userId, email, planId);

          expect(mockedRazorpay.subscriptions.create).toHaveBeenCalledTimes(1);
          const payload = (mockedRazorpay.subscriptions.create as jest.Mock).mock.calls[0][0];
          expect(payload.total_count).toBe(count);
          expect(payload.customer_notify).toBe(1);
          expect(payload.callback_url).toMatch(/\/dashboard\/payment\/success$/);
          expect(payload.notes).toEqual(expect.objectContaining({ userId, email, planId }));
        },
      );

      it('keeps the TEMPORARY comment in the source so it can be found and removed later', () => {
        const src = readFileSync(join(__dirname, '../services/subscription.service.ts'), 'utf8');
        expect(src).toContain(
          '// TEMPORARY: perpetual subscriptions (no total_count, per SCRUM-102) are not enabled on',
        );
        expect(src).toContain(
          "// the Razorpay account yet (ticket raised). Until then, use Razorpay's max count, which",
        );
        expect(src).toContain(
          '// is 100 years either way. Remove once Razorpay enables perpetual subscriptions.',
        );
      });
    });

    it('throws for an unrecognised plan id', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await expect(createSubscription(userId, 'test@example.com', 'invalid_plan')).rejects.toThrow(
        'Unknown plan id "invalid_plan"',
      );
    });

    it('T-444: throws SubscriptionExistsError (not a reuse) when the user already has an active one', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const paidThrough = new Date('2027-01-15T10:00:00.000Z');

      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_existing',
        status: 'active',
        planId: 'solo_monthly',
        paidThrough,
      });

      await expect(createSubscription(userId, 'user@example.com')).rejects.toMatchObject({
        name: 'SubscriptionExistsError',
        status: 'active',
        planId: 'solo_monthly',
        paidThrough,
      });
      expect(mockedRazorpay.subscriptions.create).not.toHaveBeenCalled();
      expect(mockedRazorpay.subscriptions.fetch).not.toHaveBeenCalled();
    });

    it('returns the existing short_url if the user has an unfinished (created) checkout for the same plan', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_existing',
        status: 'created',
        planId: 'solo_monthly',
      });
      (mockedRazorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
        id: 'sub_existing',
        short_url: 'https://rzp.io/existing',
      });

      const result = await createSubscription(userId, 'user@example.com');

      expect(result.subscriptionId).toBe('sub_existing');
      expect(result.shortUrl).toBe('https://rzp.io/existing');
      expect(mockedRazorpay.subscriptions.create).not.toHaveBeenCalled();
      expect(mockedRazorpay.subscriptions.cancel).not.toHaveBeenCalled();
    });

    // T-516 (Arjun): a checkout whose plan cannot be resolved (no stored planId,
    // no notes or plan_id from Razorpay) is treated as different: cancel, then create.
    it('cancels then creates when the unfinished checkout has an unknown plan (never planId "")', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      await Subscription.create({
        userId,
        razorpaySubscriptionId: 'sub_existing',
        status: 'created',
      });
      (mockedRazorpay.subscriptions.fetch as jest.Mock).mockResolvedValue({
        id: 'sub_existing',
        short_url: 'https://rzp.io/existing',
      });
      (mockedRazorpay.subscriptions.cancel as jest.Mock).mockResolvedValue({});
      (mockedRazorpay.subscriptions.create as jest.Mock).mockResolvedValue({
        id: 'sub_replacement',
        short_url: 'https://rzp.io/replacement',
      });

      const result = await createSubscription(userId, 'user@example.com');

      expect(mockedRazorpay.subscriptions.cancel).toHaveBeenCalledWith('sub_existing', false);
      expect(mockedRazorpay.subscriptions.create).toHaveBeenCalledTimes(1);
      const cancelOrder = (mockedRazorpay.subscriptions.cancel as jest.Mock).mock
        .invocationCallOrder[0];
      const createOrder = (mockedRazorpay.subscriptions.create as jest.Mock).mock
        .invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(createOrder);
      expect(result).toEqual({
        subscriptionId: 'sub_replacement',
        shortUrl: 'https://rzp.io/replacement',
        planId: 'solo_monthly',
      });
      expect((await Subscription.findOne({ razorpaySubscriptionId: 'sub_existing' }))!.status).toBe(
        'cancelled',
      );
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

    it('keeps the user on the plan on subscription.cancelled (downgrade happens on expired, T-399)', async () => {
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
      expect(updatedUser!.plan).toBe('pro'); // T-399: cancel at cycle end, not at once
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
