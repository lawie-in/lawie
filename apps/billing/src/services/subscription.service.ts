import crypto from 'crypto';

import { addOneMonth } from '@lawie/shared';

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

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * T-399: the update that puts `fields` back to their values in `before` (the
 * pre-claim Subscription): $set where a value existed, $unset where it did not.
 */
function restoreClaim(
  before: { get(path: string): unknown },
  fields: string[],
): Record<string, Record<string, unknown>> {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const f of fields) {
    const v = before.get(f);
    if (v === undefined || v === null) $unset[f] = '';
    else $set[f] = v;
  }
  return {
    ...(Object.keys($set).length ? { $set } : {}),
    ...(Object.keys($unset).length ? { $unset } : {}),
  };
}

export function verifyWebhookSignature(rawBody: Buffer, signature: unknown): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  // T-323: timingSafeEqual throws a RangeError on unequal lengths, and Buffer.from(_, 'hex')
  // silently truncates at the first non-hex character. Reject anything that is not a hex
  // string of the digest's length first; these checks depend only on the header's shape,
  // not on the secret, so the comparison below stays constant-time for valid-length input.
  if (
    typeof signature !== 'string' ||
    signature.length !== expectedSignature.length ||
    !HEX_RE.test(signature)
  ) {
    return false;
  }
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
      // T-399: current_end is the end of the paid period (paidThrough); Ink and
      // the yearly drip last until then.
      const currentStart = subPayload?.current_start as number | undefined;
      const currentEnd = subPayload?.current_end as number | undefined;
      const paidCount = subPayload?.paid_count as number | undefined;
      sub.status = 'active';
      sub.currentPeriodStart = new Date();
      if (chargeAt) sub.currentPeriodEnd = new Date(chargeAt * 1000);
      if (currentEnd) sub.paidThrough = new Date(currentEnd * 1000);

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
        sub.planId = planSku.id;
        sub.billingCycle = planSku.cycle;
      }
      await sub.save();

      // T-399 (Arjun): activated and charged both fire on the first payment, and
      // activated may carry no payment entity. Grant once per paid cycle: only
      // the call whose conditional update raises lastGrantedPaidCount (Razorpay
      // paid_count) grants; without paid_count, current_start against
      // lastGrantedPeriodStart. Absent fields match `$not: { $gte }`, so the
      // first cycle grants. With neither field, grant as before and warn.
      //
      // For a yearly plan the drip-state reset (month 1 is this grant;
      // settleYearlyDrip grants months 2–12 on anchor + n months) rides in the
      // same claim update, so nothing is written between the grant and the end
      // of the handler. Only the grant can fail after the claim, and a failed
      // grant writes nothing, so restoring the claim (drip fields included)
      // lets Razorpay's retry grant exactly once.
      const chargedAt = currentStart ? new Date(currentStart * 1000) : new Date();
      const dripReset =
        planSku?.cycle === 'yearly'
          ? { inkDripAnchor: chargedAt, inkDripNextAt: addOneMonth(chargedAt), inkDripCount: 0 }
          : {};
      const dripFields = Object.keys(dripReset);
      let isNewCycle = true;
      // How to undo the claim if the grant fails (so a Razorpay retry grants).
      let rollbackClaim: (() => Promise<{ matchedCount: number }>) | null = null;
      if (typeof paidCount === 'number') {
        const claimed = await Subscription.findOneAndUpdate(
          { _id: sub._id, lastGrantedPaidCount: { $not: { $gte: paidCount } } },
          {
            $set: {
              lastGrantedPaidCount: paidCount,
              ...(currentStart ? { lastGrantedPeriodStart: new Date(currentStart * 1000) } : {}),
              // paid_count 0 grants nothing, so it must not reset the drip.
              ...(paidCount > 0 ? dripReset : {}),
            },
          },
        );
        isNewCycle = paidCount > 0 && claimed !== null;
        if (claimed) {
          rollbackClaim = () =>
            Subscription.updateOne(
              { _id: sub._id, lastGrantedPaidCount: paidCount },
              restoreClaim(claimed, [
                'lastGrantedPaidCount',
                'lastGrantedPeriodStart',
                ...dripFields,
              ]),
            );
        }
      } else if (currentStart) {
        const periodStart = new Date(currentStart * 1000);
        const claimed = await Subscription.findOneAndUpdate(
          { _id: sub._id, lastGrantedPeriodStart: { $not: { $gte: periodStart } } },
          { $set: { lastGrantedPeriodStart: periodStart, ...dripReset } },
        );
        isNewCycle = claimed !== null;
        if (claimed) {
          rollbackClaim = () =>
            Subscription.updateOne(
              { _id: sub._id, lastGrantedPeriodStart: periodStart },
              restoreClaim(claimed, ['lastGrantedPeriodStart', ...dripFields]),
            );
        }
      } else {
        logger.warn(
          { subId, event },
          'subscription webhook has no paid_count or current_start; grant not deduplicated',
        );
        // No claim to ride on: reset the drip state here, before the grant.
        if (dripFields.length) await Subscription.updateOne({ _id: sub._id }, { $set: dripReset });
      }

      if (planSku && !isNewCycle) {
        logger.info(
          { subId, event, paidCount },
          'subscription cycle already granted, no second grant',
        );
      } else if (planSku) {
        try {
          await grantSubscriptionInk({
            userId: sub.userId.toString(),
            inkUnits: planSku.inkPerCycle * 2, // 1 Ink = 2 ledger units
            planTier: planSku.tier,
            billingCycle: planSku.cycle,
            planRenewsAt: chargeAt ? new Date(chargeAt * 1000) : undefined,
            razorpaySubscriptionId: subId,
            amountInr: planSku.priceInr,
          });
        } catch (err) {
          // T-399: undo the cycle claim so Razorpay's retry of this webhook
          // grants, then fail the webhook so Razorpay retries.
          if (rollbackClaim) {
            try {
              const restored = await rollbackClaim();
              // No match: another event changed the claim first, so nothing was
              // restored and this cycle may stay marked as granted.
              if (restored.matchedCount === 0) {
                logger.error(
                  { subId, event, errName: err instanceof Error ? err.name : 'unknown' },
                  'subscription grant claim rollback failed; this cycle needs a manual grant',
                );
              }
            } catch (rollbackErr) {
              logger.error(
                {
                  subId,
                  event,
                  errName: rollbackErr instanceof Error ? rollbackErr.name : 'unknown',
                },
                'subscription grant claim rollback failed; this cycle needs a manual grant',
              );
            }
          }
          throw err;
        }
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

    // T-399 (Arjun, Ajay): cancel stops the renewal only. The plan, its Ink and
    // the yearly drip stay until paidThrough; then the expired webhook (or the
    // lazy settleYearlyDrip) downgrades and zeroes. Billing makes no Razorpay
    // cancel call today. Any future cancel button MUST use
    // `cancel_at_cycle_end: 1`, never an immediate cancel.
    case 'subscription.cancelled': {
      sub.status = 'cancelled';
      sub.cancelledAt = new Date();
      await sub.save();
      logger.info({ userId: sub.userId, event }, 'Subscription cancelled; kept until paidThrough');
      break;
    }

    case 'subscription.expired': {
      sub.status = 'expired';
      sub.cancelledAt = new Date();
      await sub.save();
      // T-399: a cancelled sub still inside its paid period also keeps the
      // plan (same rule as the lazy expiry in settleYearlyDrip).
      const otherActive = await Subscription.findOne({
        userId: sub.userId,
        _id: { $ne: sub._id },
        $or: [{ status: 'active' }, { status: 'cancelled', paidThrough: { $gte: new Date() } }],
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
