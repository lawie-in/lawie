import crypto from 'crypto';

import { findPlanByRazorpayId, findSubscriptionPlan, findTopupSku } from '../config/credit-skus';
import { env } from '../config/env';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

import { grantSubscriptionCredits, grantTopupCredits } from './credit-grant.service';

export async function createSubscription(
  userId: string,
  email: string,
  planId?: string,
): Promise<{
  subscriptionId: string;
  shortUrl: string;
  planId: string;
}> {
  // Resolve plan SKU → Razorpay plan id (from env per founder-controlled env keys).
  // Falls back to the legacy single-plan env var when planId is omitted.
  const resolvedPlanId = planId ?? 'practice_monthly';
  const planSku = findSubscriptionPlan(resolvedPlanId);
  if (!planSku) {
    throw new Error(`Unknown plan id "${resolvedPlanId}"`);
  }
  const razorpayPlanId = process.env[planSku.razorpayPlanIdEnvKey] ?? env.RAZORPAY_PLAN_ID;

  // Check for existing active subscription (regardless of plan — one active sub per user)
  const existing = await Subscription.findOne({
    userId,
    status: { $in: ['created', 'authenticated', 'active'] },
  });
  if (existing) {
    const rzpSub = await razorpay.subscriptions.fetch(existing.razorpaySubscriptionId);
    return {
      subscriptionId: existing.razorpaySubscriptionId,
      shortUrl: ((rzpSub as unknown as Record<string, unknown>).short_url as string) ?? '',
      planId: resolvedPlanId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = await (razorpay.subscriptions.create as any)({
    plan_id: razorpayPlanId,
    customer_notify: 1,
    total_count: planSku.cycle === 'yearly' ? 10 : 120, // 10 years for yearly, 120 months for monthly
    callback_url: `${env.FRONTEND_URL}/dashboard/payment/success`,
    notes: { userId, email, planId: planSku.id, tier: planSku.tier, cycle: planSku.cycle },
  });

  await Subscription.create({
    userId,
    razorpaySubscriptionId: sub.id,
    status: 'created',
  });

  logger.info({ userId, subscriptionId: sub.id, planId: planSku.id }, 'Razorpay subscription created');

  return {
    subscriptionId: sub.id,
    shortUrl: ((sub as unknown as Record<string, unknown>).short_url as string) ?? '',
    planId: planSku.id,
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
  // ── order.paid — one-off top-up purchase ────────────────────────────────────
  if (event === 'order.paid' || event === 'payment.captured') {
    const orderEntity = (payload.order as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;
    const paymentEntity = (payload.payment as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;

    // Both order.paid and payment.captured carry the notes; prefer order if present
    const notes =
      (orderEntity?.notes as Record<string, string> | undefined) ??
      (paymentEntity?.notes as Record<string, string> | undefined);

    if (notes?.userId && notes?.skuId) {
      const sku = findTopupSku(notes.skuId);
      if (!sku) {
        logger.warn({ skuId: notes.skuId }, 'Webhook: unknown top-up SKU');
        return;
      }
      await grantTopupCredits({
        userId: notes.userId,
        credits: sku.credits,
        amountInr: sku.priceInr,
        razorpayOrderId: (orderEntity?.id as string) ?? '',
        razorpayPaymentId: paymentEntity?.id as string | undefined,
        topupSkuId: sku.id,
      });
    }
    return;
  }

  // ── subscription events ────────────────────────────────────────────────────
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

      // Resolve which plan SKU this Razorpay plan id maps to → grant the
      // matching subscriptionCredits + set planTier/billingCycle.
      const razorpayPlanId =
        (subPayload?.plan_id as string | undefined) ??
        ((subPayload?.notes as Record<string, string> | undefined)?.planId as string | undefined);
      const planSku = razorpayPlanId
        ? findPlanByRazorpayId(razorpayPlanId) ??
          findSubscriptionPlan(
            (subPayload?.notes as Record<string, string> | undefined)?.planId ?? '',
          )
        : findSubscriptionPlan(
            (subPayload?.notes as Record<string, string> | undefined)?.planId ?? '',
          );

      if (planSku) {
        await grantSubscriptionCredits({
          userId: sub.userId.toString(),
          credits: planSku.creditsPerCycle,
          planTier: planSku.tier,
          billingCycle: planSku.cycle,
          planRenewsAt: chargeAt ? new Date(chargeAt * 1000) : undefined,
          razorpaySubscriptionId: subId,
          amountInr: planSku.priceInr,
        });
      } else {
        // Legacy: no plan mapping found — fall back to setting plan='pro' only
        await User.findByIdAndUpdate(sub.userId, { plan: 'pro' });
        logger.warn(
          { userId: sub.userId, razorpayPlanId },
          'subscription.charged with no matching SKU — granted plan=pro without credits',
        );
      }
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.expired': {
      sub.status = event === 'subscription.cancelled' ? 'cancelled' : 'expired';
      sub.cancelledAt = new Date();
      await sub.save();
      const otherActive = await Subscription.findOne({
        userId: sub.userId,
        _id: { $ne: sub._id },
        status: 'active',
      });
      if (!otherActive) {
        await User.findByIdAndUpdate(sub.userId, {
          $set: { plan: 'free', planTier: 'free', billingCycle: 'none' },
        });
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
