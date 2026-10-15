import crypto from 'crypto';

import { addOneMonth } from '@lawie/shared';
import * as Sentry from '@sentry/node';

import { findPlanByRazorpayId, findSubscriptionPlan, findTopupSku } from '../config/credit-skus';
import { env } from '../config/env';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import {
  isSubscriptionStatus,
  Subscription,
  type SubscriptionStatus,
} from '../models/Subscription.model';
import { User } from '../models/User.model';

import {
  CLAIM_STALE_MS,
  cancelSubscriptionInk,
  GrantClaimBusyError,
  grantSubscriptionInk,
  grantTopupInk,
  newClaimToken,
  reportManualGrant,
  retryOnThrow,
} from './ink-ledger.service';
import {
  capturedPaymentEntity,
  fromUnix,
  issueCreditNoteOnRefund,
  issueInvoiceOnCapture,
  planFromChargeNotes,
  subscriptionDescription,
  topupDescription,
} from './invoice.service';

/** T-444: statuses whose checkout is unfinished; createSubscription reuses them. */
const CHECKOUT_STATUSES: SubscriptionStatus[] = ['created', 'authenticated'];
/** T-444: live statuses; createSubscription refuses a second sub (409). */
const LIVE_STATUSES: SubscriptionStatus[] = ['active', 'pending', 'halted', 'paused'];
/**
 * T-444: statuses that keep access until the paid period ends (paidThrough,
 * else currentPeriodEnd, else already over: Arjun ruling 1).
 */
const PAID_THROUGH_STATUSES: SubscriptionStatus[] = ['cancelled', 'halted', 'paused', 'completed'];
/** T-444: terminal statuses; a charge never moves a sub out of them. */
const TERMINAL_STATUSES: SubscriptionStatus[] = ['cancelled', 'completed', 'expired'];
/**
 * T-444b: live statuses that stop blocking createSubscription once paidThrough
 * has passed (they are then written expired locally).
 */
const LAPSABLE_STATUSES: SubscriptionStatus[] = ['halted', 'paused', 'pending'];
/**
 * T-444b (Arjun must-fix): on the charge path with no paid_count and no
 * current_start (no claim), only these statuses may be moved to active.
 */
const UNCLAIMED_ACTIVE_FROM: SubscriptionStatus[] = ['created', 'authenticated', 'active'];

/**
 * T-444 (Arjun ruling 7): the user already has a live subscription. The route
 * answers 409 `subscription_exists` with these fields of the existing sub.
 */
export class SubscriptionExistsError extends Error {
  readonly status: SubscriptionStatus;
  readonly planId: string | null;
  readonly paidThrough: Date | null;

  constructor(existing: {
    status: SubscriptionStatus;
    planId: string | null;
    paidThrough: Date | null;
  }) {
    super('subscription_exists');
    this.name = 'SubscriptionExistsError';
    this.status = existing.status;
    this.planId = existing.planId;
    this.paidThrough = existing.paidThrough;
  }
}

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

  // T-444 (Arjun ruling 7): one non-terminal sub per user. A live sub (paid, or
  // in payment trouble) blocks a new one; the user fixes or cancels it first.
  const findLive = () =>
    Subscription.findOne({
      userId,
      status: { $in: LIVE_STATUSES },
    }).sort({ createdAt: -1 });
  const refuse = (s: NonNullable<Awaited<ReturnType<typeof findLive>>>): never => {
    throw new SubscriptionExistsError({
      status: s.status,
      planId: s.planId ?? null,
      paidThrough: s.paidThrough ?? s.currentPeriodEnd ?? null,
    });
  };
  const live = await findLive();
  if (live) {
    // T-444b (Arjun): a halted/paused/pending sub that is no longer paid, by
    // the same stillPaidFilter the lazy expiry uses, no longer blocks. It is
    // written expired locally (one guarded terminal write whose filter is the
    // negation of stillPaidFilter) and a new sub is created. The user's plan
    // and Ink are left to the lazy expiry. The write itself decides lapsed, so
    // the 409 and the lazy expiry share one definition.
    if (!(LAPSABLE_STATUSES as string[]).includes(live.status)) refuse(live);
    const expired = await Subscription.updateOne(
      {
        _id: live._id,
        status: { $in: LAPSABLE_STATUSES, $ne: 'expired' },
        $nor: stillPaidFilter(new Date()),
      },
      { $set: { status: 'expired' } },
    );
    if (expired.matchedCount > 0) {
      logger.info(
        { userId, subscriptionId: live.razorpaySubscriptionId, priorStatus: live.status },
        'Lapsed subscription expired locally on resubscribe',
      );
    } else {
      // Still paid, or a race (the sub changed under us). Re-read and apply
      // the normal rules (live blocks with 409; else fall through to reuse).
      const reread = await findLive();
      if (reread) refuse(reread);
    }
  }

  // Checkout not finished: hand back the existing sub's link and its own plan,
  // never the requested one.
  const existing = await Subscription.findOne({
    userId,
    status: { $in: CHECKOUT_STATUSES },
  }).sort({ createdAt: -1 });
  if (existing) {
    const rzpSub = (await razorpay.subscriptions.fetch(
      existing.razorpaySubscriptionId,
    )) as unknown as Record<string, unknown>;
    const rzpNotes = rzpSub.notes as Record<string, unknown> | undefined;
    const rzpPlanId = typeof rzpSub.plan_id === 'string' ? rzpSub.plan_id : undefined;
    const existingPlanId =
      existing.planId ??
      (typeof rzpNotes?.planId === 'string' ? rzpNotes.planId : undefined) ??
      (rzpPlanId ? findPlanByRazorpayId(rzpPlanId)?.id : undefined) ??
      '';
    return {
      subscriptionId: existing.razorpaySubscriptionId,
      shortUrl: (rzpSub.short_url as string) ?? '',
      planId: existingPlanId,
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
    // T-444: so a checkout reuse can return this sub's own plan.
    planId: planSku.id,
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
      // T-413: payment.captured carries no order entity, only payment.order_id. Both
      // siblings must key on the same order id, or each would claim separately.
      const razorpayOrderId =
        (orderEntity?.id as string | undefined) ??
        (paymentEntity?.order_id as string | undefined) ??
        '';
      // T-413: grantTopupInk claims the order before granting; it returns 0 when
      // the order was already granted (a retry or the sibling event).
      const granted = await grantTopupInk({
        userId: notes.user_id,
        inkUnits: sku.ink * 2, // 1 Ink = 2 ledger units
        amountInr: sku.priceInr,
        razorpayOrderId,
        razorpayPaymentId: paymentEntity?.id as string | undefined,
        topupSkuId: sku.id,
      });

      // Track coupon usage if one was applied to this order. T-413: behind the
      // grant's claim, so a retry or the sibling event never counts it twice.
      if (granted > 0 && notes.coupon_code) {
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
            {
              // T-323 rule: error class only (a duplicate-key message carries the value).
              errName: couponErr instanceof Error ? couponErr.name : 'unknown',
              couponCode: notes.coupon_code,
            },
            'Failed to record coupon usage',
          );
        }
      }

      // T-436: one GST invoice per captured top-up payment, keyed on the payment
      // id (order.paid and payment.captured carry the same one). Issued even when
      // the grant returned 0, so a retry after a crash finishes it. The amount is
      // what Razorpay charged (coupons change it), never the SKU price.
      const captured = capturedPaymentEntity(payload);
      if (captured) {
        await issueInvoiceOnCapture({
          paymentId: captured.id,
          userId: notes.user_id,
          amount: captured.amount,
          paidAt: captured.createdAt,
          description: topupDescription(sku.ink),
          source: event as 'order.paid' | 'payment.captured',
          ...(razorpayOrderId ? { razorpayOrderId } : {}),
        });
      }
    }
    return;
  }

  // ── refund.processed — T-436: credit note against the original invoice ────
  // Refunds are founder-run only (policy: no refunds). A refund of a payment
  // with no invoice (e.g. before GST_EFFECTIVE_FROM) gets no credit note.
  if (event === 'refund.processed') {
    const refund = (payload.refund as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;
    if (
      refund &&
      typeof refund.id === 'string' &&
      typeof refund.payment_id === 'string' &&
      typeof refund.amount === 'number' &&
      (refund.status === undefined || refund.status === 'processed')
    ) {
      await issueCreditNoteOnRefund({
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount,
        processedAt: fromUnix(refund.created_at),
      });
    } else {
      logger.warn({ event }, 'Webhook: refund.processed without a usable refund entity');
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
      // T-415: the claim carries a state, a timestamp and this attempt's token.
      // A claim on the same cycle that is still 'pending' after CLAIM_STALE_MS (its
      // attempt died) is re-claimed by the same conditional update; 'granted', or
      // no state (pre-T-415), never is.
      const claimToken = newClaimToken();
      const claimNow = new Date();
      // T-444 (Arjun, round 3): the period, plan and status ride in the claim
      // update, so a duplicate that loses the claim changes nothing. Status is
      // active from any non-terminal prior status (ruling 4: created,
      // authenticated, halted, paused and pending included); a terminal sub
      // (cancelled/completed/expired) keeps its status but still gets the grant
      // and paidThrough, and the lazy expiry drops the user at paidThrough.
      // An update pipeline, so the status condition sits in the same atomic
      // write as the claim without being part of the claim's filter.
      const chargeFields = {
        currentPeriodStart: claimNow,
        ...(chargeAt ? { currentPeriodEnd: new Date(chargeAt * 1000) } : {}),
        ...(currentEnd ? { paidThrough: new Date(currentEnd * 1000) } : {}),
        ...(planSku ? { planId: planSku.id, billingCycle: planSku.cycle } : {}),
      };
      // `activeFrom` (T-444b): when given, only those prior statuses become
      // active and every other status is kept; else the terminal rule above.
      const chargeUpdate = (fields: Record<string, unknown>, activeFrom?: SubscriptionStatus[]) => [
        {
          $set: {
            ...Object.fromEntries(
              Object.entries({ ...chargeFields, ...fields }).map(([k, v]) => [k, { $literal: v }]),
            ),
            status: activeFrom
              ? { $cond: [{ $in: ['$status', activeFrom] }, 'active', '$status'] }
              : { $cond: [{ $in: ['$status', TERMINAL_STATUSES] }, '$status', 'active'] },
          },
        },
      ];
      const logIfTerminal = (before: { get(path: string): unknown } | null) => {
        const prior = before?.get('status');
        if (typeof prior === 'string' && (TERMINAL_STATUSES as string[]).includes(prior)) {
          logger.info(
            { subId, event, paidCount, status: prior },
            'Charge on a terminal subscription; status kept, paid cycle granted',
          );
        }
      };
      const staleBefore = new Date(claimNow.getTime() - CLAIM_STALE_MS);
      const claimFields = ['grantClaimState', 'grantClaimedAt', 'grantClaimToken'];
      const pendingClaim = (grants: boolean) => ({
        grantClaimState: grants ? 'pending' : 'granted',
        grantClaimedAt: claimNow,
        grantClaimToken: claimToken,
      });
      const staleOn = (field: string, value: unknown) => ({
        [field]: value,
        grantClaimState: 'pending',
        grantClaimedAt: { $lt: staleBefore },
      });
      // After a lost claim: is the same cycle still pending in another attempt?
      const pendingElsewhere = async (field: string, value: unknown): Promise<boolean> =>
        (await Subscription.exists({
          _id: sub._id,
          [field]: value,
          grantClaimState: 'pending',
        })) !== null;
      let isNewCycle = true;
      // How to undo the claim if the grant fails (so a Razorpay retry grants).
      let rollbackClaim: (() => Promise<{ matchedCount: number }>) | null = null;
      if (typeof paidCount === 'number') {
        const claimed = await Subscription.findOneAndUpdate(
          {
            _id: sub._id,
            $or: [
              { lastGrantedPaidCount: { $not: { $gte: paidCount } } },
              staleOn('lastGrantedPaidCount', paidCount),
            ],
          },
          chargeUpdate({
            lastGrantedPaidCount: paidCount,
            ...(currentStart ? { lastGrantedPeriodStart: new Date(currentStart * 1000) } : {}),
            // paid_count 0 grants nothing, so it must not reset the drip.
            ...(paidCount > 0 ? dripReset : {}),
            ...pendingClaim(paidCount > 0 && !!planSku),
          }),
        );
        logIfTerminal(claimed);
        isNewCycle = paidCount > 0 && claimed !== null;
        if (claimed) {
          rollbackClaim = () =>
            Subscription.updateOne(
              { _id: sub._id, lastGrantedPaidCount: paidCount, grantClaimToken: claimToken },
              restoreClaim(claimed, [
                'lastGrantedPaidCount',
                'lastGrantedPeriodStart',
                ...dripFields,
                ...claimFields,
              ]),
            );
        } else if (
          planSku &&
          paidCount > 0 &&
          (await pendingElsewhere('lastGrantedPaidCount', paidCount))
        ) {
          throw new GrantClaimBusyError();
        }
      } else if (currentStart) {
        const periodStart = new Date(currentStart * 1000);
        const claimed = await Subscription.findOneAndUpdate(
          {
            _id: sub._id,
            $or: [
              { lastGrantedPeriodStart: { $not: { $gte: periodStart } } },
              staleOn('lastGrantedPeriodStart', periodStart),
            ],
          },
          chargeUpdate({
            lastGrantedPeriodStart: periodStart,
            ...dripReset,
            ...pendingClaim(!!planSku),
          }),
        );
        logIfTerminal(claimed);
        isNewCycle = claimed !== null;
        if (claimed) {
          rollbackClaim = () =>
            Subscription.updateOne(
              { _id: sub._id, lastGrantedPeriodStart: periodStart, grantClaimToken: claimToken },
              restoreClaim(claimed, ['lastGrantedPeriodStart', ...dripFields, ...claimFields]),
            );
        } else if (planSku && (await pendingElsewhere('lastGrantedPeriodStart', periodStart))) {
          throw new GrantClaimBusyError();
        }
      } else {
        logger.warn(
          { subId, event },
          'subscription webhook has no paid_count or current_start; grant not deduplicated',
        );
        // No claim to ride on: one unconditional write of the period, plan,
        // status and drip reset, before the grant. T-444b (Arjun must-fix):
        // status becomes active only from created/authenticated/active; any
        // other status (terminal, halted, paused, pending) is kept as is.
        const before = await Subscription.findOneAndUpdate(
          { _id: sub._id },
          chargeUpdate(dripReset, UNCLAIMED_ACTIVE_FROM),
        );
        logIfTerminal(before);
        const prior = before?.get('status');
        if (typeof prior === 'string' && (LAPSABLE_STATUSES as string[]).includes(prior)) {
          logger.info(
            { subId, event, status: prior },
            'Unclaimed charge on a halted/paused/pending subscription; status kept',
          );
        }
      }

      if (planSku && !isNewCycle) {
        logger.info(
          { subId, event, paidCount },
          'subscription cycle already granted, no second grant',
        );
      } else if (planSku) {
        let grantFailed = false;
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
          grantFailed = true;
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
                reportManualGrant('subscription-claim-rollback-no-match', {
                  razorpaySubscriptionId: subId,
                });
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
              reportManualGrant('subscription-claim-rollback-failed', {
                razorpaySubscriptionId: subId,
              });
            }
          }
          throw err;
        }
        // T-415: mark the claim granted, only if this attempt still owns it.
        if (!grantFailed && rollbackClaim) {
          try {
            // A pending claim left behind would be re-claimed and granted again, so retry.
            const marked = await retryOnThrow(() =>
              Subscription.updateOne(
                { _id: sub._id, grantClaimToken: claimToken },
                { $set: { grantClaimState: 'granted' } },
              ).exec(),
            );
            if (marked.matchedCount === 0) {
              logger.error(
                { subId, event, paidCount },
                'subscription grant claim was re-claimed during this grant; check for a double grant',
              );
              reportManualGrant('subscription-grant-superseded', { razorpaySubscriptionId: subId });
            }
          } catch (markErr) {
            // The grant stood; do not 500 (a retry could grant again once the claim is stale).
            logger.error(
              { subId, event, errName: markErr instanceof Error ? markErr.name : 'unknown' },
              'subscription granted but claim not marked granted; claim left pending',
            );
            reportManualGrant('subscription-mark-granted-failed', {
              razorpaySubscriptionId: subId,
            });
          }
        }
      } else {
        // Legacy fallback: no plan mapping — set plan=pro without ink grant
        await User.findByIdAndUpdate(sub.userId, { plan: 'pro' });
        logger.warn(
          { userId: sub.userId, razorpayPlanId },
          'subscription.charged with no matching SKU — granted plan=pro without ink',
        );
      }

      // T-436: one GST invoice per captured subscription charge (every monthly
      // or yearly charge), from subscription.charged only, never .activated.
      // Reached after a grant, on the "cycle already granted" branch and on the
      // no-SKU branch, so a Razorpay retry after a crash still issues it.
      if (event === 'subscription.charged') {
        const captured = capturedPaymentEntity(payload);
        if (captured) {
          await issueInvoiceOnCapture({
            paymentId: captured.id,
            userId: sub.userId.toString(),
            amount: captured.amount,
            paidAt: captured.createdAt,
            // No SKU (legacy branch): the plan from the charge record's notes,
            // else no plan in the line (Ajay 3325466), never a default.
            description: subscriptionDescription(
              planSku
                ? { tier: planSku.tier, cycle: planSku.cycle }
                : planFromChargeNotes(subPayload?.notes as Record<string, unknown> | undefined),
              currentStart ? new Date(currentStart * 1000) : undefined,
              currentEnd ? new Date(currentEnd * 1000) : undefined,
            ),
            source: 'subscription.charged',
            razorpaySubscriptionId: subId,
          });
        }
      }
      break;
    }

    // T-399 (Arjun, Ajay): cancel stops the renewal only. The plan, its Ink and
    // the yearly drip stay until paidThrough; then the expired webhook (or the
    // lazy settleYearlyDrip) downgrades and zeroes. Billing makes no Razorpay
    // cancel call today. Any future cancel button MUST use
    // `cancel_at_cycle_end: 1`, never an immediate cancel.
    case 'subscription.cancelled': {
      // T-444 (Arjun): atomic, and never overwrites expired.
      const cancelled = await Subscription.updateOne(
        { _id: sub._id, status: { $ne: 'expired' } },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
      );
      if (cancelled.matchedCount === 0) {
        logger.info({ subId, event }, 'Subscription already expired; cancelled not stored');
        break;
      }
      logger.info({ userId: sub.userId, event }, 'Subscription cancelled; kept until paidThrough');
      break;
    }

    case 'subscription.expired': {
      sub.status = 'expired';
      sub.cancelledAt = new Date();
      await sub.save();
      // T-399: a cancelled sub still inside its paid period also keeps the
      // plan (same rule as the lazy expiry in settleYearlyDrip).
      // T-444: halted, paused and completed count the same way as cancelled.
      const otherActive = await Subscription.findOne({
        userId: sub.userId,
        _id: { $ne: sub._id },
        $or: stillPaidFilter(new Date()),
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

    // T-444 (Arjun ruling 2): halted, paused, pending and updated are applied
    // only if they are not older than the last granted charge. Halted and
    // paused keep access until paidThrough and drip nothing (yearly-drip.ts).
    case 'subscription.halted':
    case 'subscription.paused': {
      const status = event === 'subscription.halted' ? 'halted' : 'paused';
      await applyIfFresh(sub, subPayload, event, status, {
        status: { $nin: TERMINAL_STATUSES },
      });
      break;
    }

    // AC1: Razorpay retries a pending charge, so nothing changes; stale or not
    // is logged for the trail.
    case 'subscription.pending': {
      const fresh = isFreshEvent(sub, subPayload);
      logger.info(
        { subId, event, paidCount: subPayload?.paid_count, fresh },
        'Subscription pending; no change (Razorpay retries)',
      );
      break;
    }

    // AC5: store the status only, from the entity.
    case 'subscription.updated': {
      const rawStatus = subPayload?.status;
      if (!isSubscriptionStatus(rawStatus)) {
        reportUnknownStatus(subId, event, rawStatus);
        break;
      }
      // Review fix: updated never writes pending (AC1: a webhook no-op), and
      // never moves halted/paused to active (only charged or resumed do).
      if (rawStatus === 'pending') {
        logger.info(
          { subId, event, status: rawStatus },
          'Subscription updated to pending; no change',
        );
        break;
      }
      await applyIfFresh(sub, subPayload, event, rawStatus, {
        status: {
          $nin:
            rawStatus === 'active' ? ['halted', 'paused', ...TERMINAL_STATUSES] : TERMINAL_STATUSES,
        },
      });
      break;
    }

    // Ruling 2: authenticated moves a sub only from created.
    case 'subscription.authenticated': {
      const moved = await Subscription.updateOne(
        { _id: sub._id, status: 'created' },
        { $set: { status: 'authenticated' } },
      );
      if (moved.matchedCount === 0) {
        logger.info(
          { subId, event, status: sub.status },
          'Subscription authenticated from a status other than created; no change',
        );
      }
      break;
    }

    // Ruling 3: active again, no grant; the next charged grants.
    case 'subscription.resumed': {
      // Review fix: only from paused or halted, and only if not stale.
      await applyIfFresh(sub, subPayload, event, 'active', {
        status: { $in: ['paused', 'halted'] },
      });
      break;
    }

    // Ruling 5: terminal like cancelled; access until paidThrough, then the
    // lazy expiry in settleYearlyDrip downgrades.
    case 'subscription.completed': {
      // Round 3: never overwrites expired.
      const done = await Subscription.updateOne(
        { _id: sub._id, status: { $ne: 'expired' } },
        { $set: { status: 'completed' } },
      );
      if (done.matchedCount === 0) {
        logger.info({ subId, event }, 'Subscription already expired; completed not stored');
        break;
      }
      logger.info({ subId, event }, 'Subscription completed; kept until paidThrough');
      break;
    }

    case 'payment.failed': {
      logger.warn({ userId: sub.userId, subId }, 'Payment failed for subscription');
      break;
    }

    default:
      // Ruling 6: an unseen subscription event is a 200 with a warning, never a 500.
      if (event.startsWith('subscription.')) {
        reportUnknownStatus(subId, event, subPayload?.status);
      } else {
        logger.debug({ event }, 'Unhandled webhook event');
      }
  }
}

/**
 * T-444 (Arjun ruling 1): a sub keeps access while its paid period runs:
 * active, or a paid-through status with paidThrough >= now (else, with no
 * paidThrough, currentPeriodEnd >= now; with neither, the period is over).
 * A pending sub counts on paidThrough >= now only.
 */
function stillPaidFilter(now: Date): Record<string, unknown>[] {
  return [
    { status: 'active' },
    { status: { $in: PAID_THROUGH_STATUSES }, paidThrough: { $gte: now } },
    { status: { $in: PAID_THROUGH_STATUSES }, paidThrough: null, currentPeriodEnd: { $gte: now } },
    // Review fix: pending only on paidThrough, never the currentPeriodEnd fallback.
    { status: 'pending', paidThrough: { $gte: now } },
  ];
}

/**
 * T-444 (Arjun ruling 2, and his 15 Oct follow-up): an event is stale only if
 * it carries a paid_count lower than the sub's lastGrantedPaidCount. With no
 * lastGrantedPaidCount nothing was granted, so any event is fresh; with no
 * paid_count on the event, the guard is skipped and the event is applied.
 */
function freshFilter(subPayload: Record<string, unknown> | undefined): Record<string, unknown> {
  const paidCount = subPayload?.paid_count;
  return typeof paidCount === 'number'
    ? { lastGrantedPaidCount: { $not: { $gt: paidCount } } }
    : {};
}

function isFreshEvent(
  sub: { lastGrantedPaidCount?: number },
  subPayload: Record<string, unknown> | undefined,
): boolean {
  const paidCount = subPayload?.paid_count;
  if (typeof sub.lastGrantedPaidCount !== 'number' || typeof paidCount !== 'number') return true;
  return paidCount >= sub.lastGrantedPaidCount;
}

/**
 * Store `status` if the event is fresh and the sub matches `statusFilter`
 * (one conditional update); else log and no-op.
 */
async function applyIfFresh(
  sub: { _id: unknown; status?: string; lastGrantedPaidCount?: number },
  subPayload: Record<string, unknown> | undefined,
  event: string,
  status: SubscriptionStatus,
  statusFilter: Record<string, unknown> = {},
): Promise<void> {
  const subId = subPayload?.id;
  if (typeof subPayload?.paid_count !== 'number') {
    logger.info({ subId, event, status }, 'Stale-event guard skipped: event has no paid_count');
  }
  const applied = await Subscription.updateOne(
    { _id: sub._id, ...statusFilter, ...freshFilter(subPayload) },
    { $set: { status } },
  );
  if (applied.matchedCount === 0) {
    logger.info(
      {
        subId,
        event,
        status: sub.status,
        paidCount: subPayload?.paid_count,
        lastGrantedPaidCount: sub.lastGrantedPaidCount,
      },
      'Subscription event not applied (stale, or not allowed from the current status); no change',
    );
    return;
  }
  logger.info({ subId, event, status }, 'Subscription status stored');
}

/** Ruling 6: warn and count in Sentry; the subscription id only, no PII. */
function reportUnknownStatus(subId: string, event: string, rawStatus: unknown): void {
  const status = typeof rawStatus === 'string' ? rawStatus.slice(0, 64) : typeof rawStatus;
  logger.warn({ subId, event, status }, 'Webhook: unknown subscription status or event; ignored');
  Sentry.withScope((scope) => {
    scope.setTag('razorpaySubscriptionId', subId);
    scope.setExtra('event', event);
    scope.setExtra('status', status);
    Sentry.captureMessage('Billing: unknown subscription status', 'warning');
  });
}
