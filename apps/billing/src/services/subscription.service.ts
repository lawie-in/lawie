import crypto from 'crypto';

import { findPlanByRazorpayId, findSubscriptionPlan, findTopupSku } from '../config/credit-skus';
import { env } from '../config/env';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

import { cancelSubscriptionInk, grantSubscriptionInk, grantTopupInk } from './ink-ledger.service';

export async function createSubscription(
  userId: string,
  email: string,
  planId?: string,
): Promise<{
  subscriptionId: string;
  shortUrl: string;
  planId: string;
}> {
  const resolvedPlanId = planId ?? 'solo_monthly';
  const planSku = findSubscriptionPlan(resolvedPlanId);
  if (!planSku) {
    throw new Error(`Unknown plan id "${resolvedPlanId}"`);
  }
  const razorpayPlanId = process.env[planSku.razorpayPlanIdEnvKey] ?? env.RAZORPAY_PLAN_ID;

  // Check for existing active subscription (one active sub per user)
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
    // No total_count — subscriptions auto-renew until cancelled (per SCRUM-102)
    callback_url: `${env.FRONTEND_URL}/dashboard/payment/success`,
    notes: { userId, email, planId: planSku.id, tier: planSku.tier, cycle: planSku.cycle },
  });

  await Subscription.create({
    userId,
    razorpaySubscriptionId: sub.id,
    status: 'created',
  });

  logger.info(
    { userId, subscriptionId: sub.id, planId: planSku.id },
    'Razorpay subscription created',
  );

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
  // ── order.paid / payment.captured — one-off top-up purchase ───────────────
  if (event === 'order.paid' || event === 'payment.captured') {
    const orderEntity = (payload.order as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;
    const paymentEntity = (payload.payment as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;

    // Both events carry the notes; prefer order notes when present
    const notes =
      (orderEntity?.notes as Record<string, string> | undefined) ??
      (paymentEntity?.notes as Record<string, string> | undefined);

    // Notes format: { sku_id, user_id, ink }
    if (notes?.user_id && notes?.sku_id) {
      const sku = findTopupSku(notes.sku_id);
      if (!sku) {
        logger.warn({ skuId: notes.sku_id }, 'Webhook: unknown top-up SKU');
        return;
      }
      const razorpayOrderId = (orderEntity?.id as string) ?? '';
      await grantTopupInk({
        userId: notes.user_id,
        inkUnits: sku.ink * 2, // 1 Ink = 2 ledger units
        amountInr: sku.priceInr,
        razorpayOrderId,
        razorpayPaymentId: paymentEntity?.id as string | undefined,
        topupSkuId: sku.id,
      });

      // Track coupon usage if one was applied to this order
      if (notes.coupon_code) {
        try {
          const coupon = await CouponCode.findOneAndUpdate(
            { code: notes.coupon_code },
            { $inc: { uses: 1 } },
            { new: true },
          );
          if (coupon) {
            await CouponUsage.create({
              couponId: coupon._id,
              userId: notes.user_id,
              orderId: razorpayOrderId,
            });
          }
        } catch (couponErr) {
          logger.error(
            { couponErr, couponCode: notes.coupon_code },
            'Failed to record coupon usage',
          );
        }
      }
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

      // Resolve plan SKU from Razorpay plan id → grant subscription ink
      const razorpayPlanId =
        (subPayload?.plan_id as string | undefined) ??
        ((subPayload?.notes as Record<string, string> | undefined)?.planId as string | undefined);
      const planSku = razorpayPlanId
        ? (findPlanByRazorpayId(razorpayPlanId) ??
          findSubscriptionPlan(
            (subPayload?.notes as Record<string, string> | undefined)?.planId ?? '',
          ))
        : findSubscriptionPlan(
            (subPayload?.notes as Record<string, string> | undefined)?.planId ?? '',
          );

      if (planSku) {
        await grantSubscriptionInk({
          userId: sub.userId.toString(),
          inkUnits: planSku.inkPerCycle * 2, // 1 Ink = 2 ledger units
          planTier: planSku.tier,
          billingCycle: planSku.cycle,
          planRenewsAt: chargeAt ? new Date(chargeAt * 1000) : undefined,
          razorpaySubscriptionId: subId,
          amountInr: planSku.priceInr,
        });
      } else {
        // Legacy fallback: no plan mapping — set plan=pro without ink grant
        await User.findByIdAndUpdate(sub.userId, { plan: 'pro' });
        logger.warn(
          { userId: sub.userId, razorpayPlanId },
          'subscription.charged with no matching SKU — granted plan=pro without ink',
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
        // Zero inkSub + inkAnnualCarry; inkTopup survives cancellation
        await cancelSubscriptionInk(sub.userId.toString());
        logger.info(
          { userId: sub.userId, event },
          'User downgraded to free, subscription ink zeroed',
        );
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
