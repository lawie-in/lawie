import crypto from 'crypto';

import { env } from '../config/env';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

export async function createSubscription(
  userId: string,
  email: string,
): Promise<{
  subscriptionId: string;
  shortUrl: string;
}> {
  // Check for existing active subscription
  const existing = await Subscription.findOne({
    userId,
    status: { $in: ['created', 'authenticated', 'active'] },
  });
  if (existing) {
    // Re-fetch from Razorpay to get current payment link
    const rzpSub = await razorpay.subscriptions.fetch(existing.razorpaySubscriptionId);
    return {
      subscriptionId: existing.razorpaySubscriptionId,
      shortUrl: ((rzpSub as unknown as Record<string, unknown>).short_url as string) ?? '',
    };
  }

  const sub = await razorpay.subscriptions.create({
    plan_id: env.RAZORPAY_PLAN_ID,
    customer_notify: 1,
    total_count: 120, // 10 years max — effectively perpetual
    notes: { userId, email },
  });

  await Subscription.create({
    userId,
    razorpaySubscriptionId: sub.id,
    status: 'created',
  });

  logger.info({ userId, subscriptionId: sub.id }, 'Razorpay subscription created');

  return {
    subscriptionId: sub.id,
    shortUrl: ((sub as unknown as Record<string, unknown>).short_url as string) ?? '',
  };
}

export async function getSubscriptionStatus(userId: string): Promise<{
  plan: string;
  status: string | null;
  currentPeriodEnd: Date | null;
}> {
  const user = await User.findById(userId).select('plan');
  const sub = await Subscription.findOne({ userId }).sort({ createdAt: -1 });

  return {
    plan: user?.plan ?? 'free',
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  };
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

export async function handleWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const subPayload = (payload.subscription as Record<string, unknown> | undefined)?.entity as
    | Record<string, unknown>
    | undefined;
  const subId = subPayload?.id as string | undefined;

  if (!subId) return;

  const sub = await Subscription.findOne({ razorpaySubscriptionId: subId });
  if (!sub) {
    logger.warn({ subId, event }, 'Webhook received for unknown subscription');
    return;
  }

  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      const chargeAt = subPayload?.charge_at as number | undefined;
      sub.status = 'active';
      sub.currentPeriodStart = new Date();
      if (chargeAt) sub.currentPeriodEnd = new Date(chargeAt * 1000);
      await sub.save();
      await User.findByIdAndUpdate(sub.userId, { plan: 'pro' });
      logger.info({ userId: sub.userId, event }, 'User upgraded to pro');
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.expired': {
      sub.status = event === 'subscription.cancelled' ? 'cancelled' : 'expired';
      sub.cancelledAt = new Date();
      await sub.save();
      // Only downgrade if no other active subscription
      const otherActive = await Subscription.findOne({
        userId: sub.userId,
        _id: { $ne: sub._id },
        status: 'active',
      });
      if (!otherActive) {
        await User.findByIdAndUpdate(sub.userId, { plan: 'free' });
        logger.info({ userId: sub.userId, event }, 'User downgraded to free');
      }
      break;
    }

    case 'payment.failed': {
      logger.warn({ userId: sub.userId, subId }, 'Payment failed for subscription');
      break;
    }

    default:
      logger.debug({ event }, 'Unhandled webhook event');
  }
}
