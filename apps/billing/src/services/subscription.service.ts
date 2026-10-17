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
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
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
  /**
   * T-516 (Arjun): set only when the existing sub is past_due: the live
   * Razorpay payment link, or null if it could not be fetched. Left undefined
   * for any other state, and the route then sends no shortUrl key.
   */
  readonly shortUrl?: string | null;

  constructor(existing: {
    status: SubscriptionStatus;
    planId: string | null;
    paidThrough: Date | null;
    shortUrl?: string | null;
  }) {
    super('subscription_exists');
    this.name = 'SubscriptionExistsError';
    this.status = existing.status;
    this.planId = existing.planId;
    this.paidThrough = existing.paidThrough;
    if (existing.shortUrl !== undefined) this.shortUrl = existing.shortUrl;
  }
}

/**
 * T-444c (Arjun ruling 1): another createSubscription for this user is in
 * flight (the per-user lock is held). The route answers 409
 * `subscription_in_progress`.
 */
export class SubscriptionInProgressError extends Error {
  constructor() {
    super('subscription_in_progress');
    this.name = 'SubscriptionInProgressError';
  }
}

/**
 * T-444c (Arjun ruling 2): the Razorpay cancel of a lapsed sub failed, so it was
 * not expired locally and no new sub was created. The route answers 503
 * `try_again`.
 */
export class SubscriptionCancelFailedError extends Error {
  constructor() {
    super('subscription_cancel_failed');
    this.name = 'SubscriptionCancelFailedError';
  }
}

/** T-444c: Razorpay statuses that mean the sub can no longer charge. */
const RAZORPAY_ENDED_STATUSES = ['cancelled', 'completed', 'expired'];

/**
 * T-444c (Arjun): bound on each Razorpay cancel / create call (and the status
 * fetch after a failed cancel), well inside the 60 s create lock. The SDK
 * (razorpay 2.9.6) passes no timeout to its axios client, so this is a
 * Promise.race: on timeout the call is treated as failed, but the HTTP request
 * itself is not aborted.
 */
export const RAZORPAY_CALL_TIMEOUT_MS = 15_000;

export class RazorpayTimeoutError extends Error {
  constructor(op: string) {
    super(`razorpay_${op}_timeout`);
    this.name = 'RazorpayTimeoutError';
  }
}

/**
 * T-516 (Arjun): bound on the live fetch of a past_due sub's payment link for
 * the 409 body. Short, because a failure only drops the link (null).
 */
export const PAST_DUE_LINK_TIMEOUT_MS = 2_000;

function withRazorpayTimeout<T>(
  op: string,
  call: Promise<T>,
  timeoutMs: number = RAZORPAY_CALL_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RazorpayTimeoutError(op)), timeoutMs);
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

/**
 * T-444c (Arjun): the lapsed sub was cancelled at Razorpay but now reads
 * active locally (a retry charge's webhook landed in between). One distinct
 * error log and a Sentry warning, the subscription id only; ops refunds by
 * hand. The caller answers 409 and changes nothing else.
 */
function reportCancelledPaidSub(razorpaySubscriptionId: string): void {
  logger.error(
    { subscriptionId: razorpaySubscriptionId },
    'billing.resubscribe.cancelled_paid_sub',
  );
  Sentry.withScope((scope) => {
    scope.setTag('razorpaySubscriptionId', razorpaySubscriptionId);
    Sentry.captureMessage('billing.resubscribe.cancelled_paid_sub', 'warning');
  });
}

/**
 * T-444c (Arjun ruling 2): cancel a lapsed sub at Razorpay now
 * (cancel_at_cycle_end false), so a Razorpay retry cannot charge it after the
 * user resubscribes. If the cancel throws, the sub is fetched: a Razorpay
 * status of cancelled, completed or expired means it is already ended, which
 * counts as success. This reads the status rather than matching the error's
 * text. Anything else (cancel and fetch both fail, or the sub is still live)
 * throws SubscriptionCancelFailedError.
 */
async function cancelLapsedAtRazorpay(
  userId: string,
  razorpaySubscriptionId: string,
): Promise<void> {
  return cancelNowAtRazorpay(userId, razorpaySubscriptionId, {
    cancelled: 'Lapsed subscription cancelled at Razorpay on resubscribe',
    alreadyEnded: 'Lapsed subscription already ended at Razorpay on resubscribe',
    failed: 'Razorpay cancel of lapsed subscription failed; not resubscribing',
  });
}

/**
 * T-516 (Arjun): cancel an unfinished checkout for a different plan before a
 * new sub is created for the plan asked for. Same semantics as the lapsed
 * cancel (T-444c): a throw is followed by a fetch, an already-ended Razorpay
 * status counts as success, anything else throws SubscriptionCancelFailedError.
 */
async function cancelStaleCheckoutAtRazorpay(
  userId: string,
  razorpaySubscriptionId: string,
): Promise<void> {
  return cancelNowAtRazorpay(userId, razorpaySubscriptionId, {
    cancelled: 'Stale checkout cancelled at Razorpay for a different plan',
    alreadyEnded: 'Stale checkout already ended at Razorpay for a different plan',
    failed: 'Razorpay cancel of stale checkout failed; not creating new subscription',
  });
}

/** T-444c / T-516: the shared immediate cancel (cancel_at_cycle_end false). */
async function cancelNowAtRazorpay(
  userId: string,
  razorpaySubscriptionId: string,
  messages: { cancelled: string; alreadyEnded: string; failed: string },
): Promise<void> {
  try {
    await withRazorpayTimeout(
      'cancel',
      razorpay.subscriptions.cancel(razorpaySubscriptionId, false),
    );
    logger.info({ userId, subscriptionId: razorpaySubscriptionId }, messages.cancelled);
    return;
  } catch (cancelErr) {
    let rzpStatus: unknown;
    try {
      const rzpSub = (await withRazorpayTimeout(
        'fetch',
        razorpay.subscriptions.fetch(razorpaySubscriptionId),
      )) as unknown as Record<string, unknown>;
      rzpStatus = rzpSub.status;
    } catch {
      rzpStatus = undefined;
    }
    if (typeof rzpStatus === 'string' && RAZORPAY_ENDED_STATUSES.includes(rzpStatus)) {
      logger.info(
        { userId, subscriptionId: razorpaySubscriptionId, rzpStatus },
        messages.alreadyEnded,
      );
      return;
    }
    logger.error(
      {
        userId,
        subscriptionId: razorpaySubscriptionId,
        rzpStatus: typeof rzpStatus === 'string' ? rzpStatus : null,
        errName: cancelErr instanceof Error ? cancelErr.name : typeof cancelErr,
      },
      messages.failed,
    );
    throw new SubscriptionCancelFailedError();
  }
}

/**
 * T-516 (Arjun): the live payment link of a past_due sub, fetched from Razorpay
 * each time (never cached, never stored). Any failure (timeout, throw, no
 * short_url) gives null and one ops log line with the subscription id only.
 */
async function fetchPastDueShortUrl(razorpaySubscriptionId: string): Promise<string | null> {
  try {
    const rzpSub = (await withRazorpayTimeout(
      'fetch',
      razorpay.subscriptions.fetch(razorpaySubscriptionId),
      PAST_DUE_LINK_TIMEOUT_MS,
    )) as unknown as Record<string, unknown> | null | undefined;
    const shortUrl = rzpSub?.short_url;
    if (typeof shortUrl === 'string' && shortUrl.length > 0) return shortUrl;
  } catch {
    // Falls through to the single log line below.
  }
  logger.warn(
    { subscriptionId: razorpaySubscriptionId },
    'billing.subscription.past_due_link_unavailable',
  );
  return null;
}

/**
 * T-444c (Arjun ruling 1): one createSubscription per user at a time. The lock
 * is one insert into SubscriptionCreateLock (unique userId); E11000 means
 * another call holds it. The row is deleted in a finally, by its own _id, so a
 * call whose lock already timed out never deletes a newer caller's lock.
 */
export async function createSubscription(
  userId: string,
  email: string,
  planId?: string,
): Promise<{
  subscriptionId: string;
  shortUrl: string;
  planId: string;
}> {
  // The unique index must exist before the insert can act as a lock.
  await SubscriptionCreateLock.init();
  let lockId: unknown;
  try {
    const lock = await SubscriptionCreateLock.create({ userId, createdAt: new Date() });
    lockId = lock._id;
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 11000) {
      throw new SubscriptionInProgressError();
    }
    throw err;
  }
  try {
    return await createSubscriptionLocked(userId, email, planId);
  } finally {
    try {
      await SubscriptionCreateLock.deleteOne({ _id: lockId });
    } catch (releaseErr) {
      // The TTL index removes it within ~2 min; the result stands.
      logger.error(
        { userId, errName: releaseErr instanceof Error ? releaseErr.name : typeof releaseErr },
        'Failed to release subscription create lock',
      );
    }
  }
}

async function createSubscriptionLocked(
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
  // T-516 (Arjun): a past_due sub's 409 also carries its live payment link
  // (or null). Any other state keeps the body as before (no shortUrl key).
  // Ownership: the sub was looked up by the authenticated userId.
  const existsError = async (
    s: NonNullable<Awaited<ReturnType<typeof findLive>>>,
  ): Promise<SubscriptionExistsError> => {
    const fields = {
      status: s.status,
      planId: s.planId ?? null,
      paidThrough: s.paidThrough ?? s.currentPeriodEnd ?? null,
    };
    if (subscriptionState(s, new Date()) !== 'past_due') {
      return new SubscriptionExistsError(fields);
    }
    return new SubscriptionExistsError({
      ...fields,
      shortUrl: await fetchPastDueShortUrl(s.razorpaySubscriptionId),
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
    if (!(LAPSABLE_STATUSES as string[]).includes(live.status)) throw await existsError(live);
    // T-444c (Arjun ruling 2): cancel at Razorpay before the local expire, and
    // only once the sub reads as lapsed (same filter as the write), so a sub
    // still paid is never cancelled. A failed cancel throws before any write.
    const now = new Date();
    const lapsedFilter = {
      _id: live._id,
      status: { $in: LAPSABLE_STATUSES, $ne: 'expired' },
      $nor: stillPaidFilter(now),
    };
    let cancelledAtRazorpay = false;
    if (await Subscription.exists(lapsedFilter)) {
      await cancelLapsedAtRazorpay(userId, live.razorpaySubscriptionId);
      cancelledAtRazorpay = true;
      // T-444c (Arjun): a retry charge may have landed between the lapsed
      // check and the cancel. If the sub is now active, it was paid and is now
      // cancelled: report it and answer 409; no local expire, no create.
      const afterCancel = await Subscription.findById(live._id);
      if (afterCancel?.status === 'active') {
        reportCancelledPaidSub(live.razorpaySubscriptionId);
        throw await existsError(afterCancel);
      }
    }
    const expired = await Subscription.updateOne(lapsedFilter, {
      $set: { status: 'expired' },
    });
    if (expired.matchedCount > 0) {
      logger.info(
        { userId, subscriptionId: live.razorpaySubscriptionId, priorStatus: live.status },
        'Lapsed subscription expired locally on resubscribe',
      );
    } else {
      // Still paid, or a race (the sub changed under us). Re-read and apply
      // the normal rules (live blocks with 409; else fall through to reuse).
      const reread = await findLive();
      if (reread) {
        // T-444c: same report if the sub we just cancelled turned active.
        if (cancelledAtRazorpay && reread._id.equals(live._id) && reread.status === 'active') {
          reportCancelledPaidSub(live.razorpaySubscriptionId);
        }
        throw await existsError(reread);
      }
    }
  }

  // Checkout not finished. T-516 (Arjun): for the same plan, hand back the
  // existing sub's link (no duplicate sub). For a different plan, cancel the
  // stale checkout at Razorpay, mark it cancelled locally, then create a new
  // sub for the plan asked for. Never subscriptions.update(plan_id).
  const existing = await Subscription.findOne({
    userId,
    status: { $in: CHECKOUT_STATUSES },
  }).sort({ createdAt: -1 });
  if (existing) {
    // A stored planId decides without a Razorpay call; older rows without one
    // fall back to the Razorpay notes / plan_id, as before.
    let rzpSub: Record<string, unknown> | undefined;
    let existingPlanId = existing.planId ?? undefined;
    if (!existingPlanId) {
      rzpSub = (await withRazorpayTimeout(
        'fetch',
        razorpay.subscriptions.fetch(existing.razorpaySubscriptionId),
      )) as unknown as Record<string, unknown>;
      const rzpNotes = rzpSub.notes as Record<string, unknown> | undefined;
      const rzpPlanId = typeof rzpSub.plan_id === 'string' ? rzpSub.plan_id : undefined;
      existingPlanId =
        (typeof rzpNotes?.planId === 'string' ? rzpNotes.planId : undefined) ??
        (rzpPlanId ? findPlanByRazorpayId(rzpPlanId)?.id : undefined);
    }

    if (existingPlanId === planSku.id) {
      rzpSub ??= (await withRazorpayTimeout(
        'fetch',
        razorpay.subscriptions.fetch(existing.razorpaySubscriptionId),
      )) as unknown as Record<string, unknown>;
      return {
        subscriptionId: existing.razorpaySubscriptionId,
        shortUrl: (rzpSub.short_url as string) ?? '',
        planId: existingPlanId,
      };
    }

    // Different (or unknown) plan: a failed cancel throws (503 try_again)
    // before any local write or create.
    await cancelStaleCheckoutAtRazorpay(userId, existing.razorpaySubscriptionId);
    const staleCancelled = await Subscription.updateOne(
      { _id: existing._id, status: { $in: CHECKOUT_STATUSES } },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
    );
    if (staleCancelled.matchedCount > 0) {
      logger.info(
        {
          userId,
          subscriptionId: existing.razorpaySubscriptionId,
          stalePlanId: existingPlanId ?? null,
          planId: planSku.id,
        },
        'Stale checkout cancelled locally; creating subscription for requested plan',
      );
    } else {
      // The checkout changed under us (a webhook landed). If it, or any sub,
      // is now live, no new sub is created (AC4); a checkout that turned
      // active was paid and is now cancelled at Razorpay: report it.
      const reread = await findLive();
      if (reread) {
        if (reread._id.equals(existing._id) && reread.status === 'active') {
          reportCancelledPaidSub(existing.razorpaySubscriptionId);
        }
        throw await existsError(reread);
      }
    }
  }

  // T-444c: bounded; a timeout throws (500), and no local row is written.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sub: any;
  try {
    sub = await withRazorpayTimeout<any>(
      'create',
      (razorpay.subscriptions.create as any)({
        plan_id: razorpayPlanId,
        customer_notify: 1,
        // TEMPORARY: perpetual subscriptions (no total_count, per SCRUM-102) are not enabled on
        // the Razorpay account yet (ticket raised). Until then, use Razorpay's max count, which
        // is 100 years either way. Remove once Razorpay enables perpetual subscriptions.
        total_count: planSku.cycle === 'yearly' ? 100 : 1200,
        callback_url: `${env.FRONTEND_URL}/dashboard/payment/success`,
        notes: { userId, email, planId: planSku.id, tier: planSku.tier, cycle: planSku.cycle },
      }),
    );
  } catch (err) {
    if (err instanceof RazorpayTimeoutError) {
      logger.warn({ userId }, 'billing.subscription.create_timeout');
    }
    throw err;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

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

/** T-508: the status card's view of a subscription. */
export type SubscriptionState = 'active' | 'past_due' | 'lapsed';

export interface SubscriptionStatusPayload {
  plan: string;
  status: string | null;
  currentPeriodEnd: Date | null;
  tier: 'free' | 'solo' | 'pro';
  renewsAt: Date | null;
  state: SubscriptionState;
  cancelAtCycleEnd: boolean;
}

/**
 * T-508: pure mapping of a sub to the status card's state, with `now` passed in.
 * The paid-through date is paidThrough, else currentPeriodEnd, else over;
 * for pending it is paidThrough only (as in stillPaidFilter).
 * - active: status active, or cancelled/completed still inside the paid period.
 * - past_due: pending/halted/paused still inside the paid period.
 * - lapsed: anything else (expired, past the paid period, an unfinished
 *   created/authenticated checkout, or no sub).
 */
export function subscriptionState(
  sub: {
    status?: string | null;
    paidThrough?: Date | null;
    currentPeriodEnd?: Date | null;
  } | null,
  now: Date,
): SubscriptionState {
  if (!sub?.status) return 'lapsed';
  if (sub.status === 'active') return 'active';
  // Same rule as stillPaidFilter: pending counts on paidThrough only; the
  // other statuses fall back to currentPeriodEnd when paidThrough is absent.
  const end =
    sub.status === 'pending'
      ? (sub.paidThrough ?? null)
      : (sub.paidThrough ?? sub.currentPeriodEnd ?? null);
  const stillPaid = end !== null && end.getTime() >= now.getTime();
  if (!stillPaid) return 'lapsed';
  if (sub.status === 'cancelled' || sub.status === 'completed') return 'active';
  if (sub.status === 'pending' || sub.status === 'halted' || sub.status === 'paused') {
    return 'past_due';
  }
  return 'lapsed';
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusPayload> {
  const user = await User.findById(userId).select('plan');
  // T-508: the newest sub that is live or still paid, so a newer unfinished
  // checkout (or a newer expired row) never hides the sub the user is paying
  // on. With none, the newest sub of any status, as before.
  const now = new Date();
  const sub =
    (await Subscription.findOne({
      userId,
      $or: [{ status: { $in: LIVE_STATUSES } }, ...stillPaidFilter(now)],
    }).sort({ createdAt: -1 })) ?? (await Subscription.findOne({ userId }).sort({ createdAt: -1 }));

  const plan = sub?.planId ? findSubscriptionPlan(sub.planId) : undefined;
  return {
    plan: user?.plan ?? 'free',
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    tier: plan?.tier ?? 'free',
    renewsAt: sub?.paidThrough ?? sub?.currentPeriodEnd ?? null,
    state: subscriptionState(sub, now),
    cancelAtCycleEnd: sub?.cancelAtCycleEnd === true,
  };
}

/**
 * T-508: the user has no live subscription to cancel. The route answers 409
 * `no_live_subscription`.
 */
export class NoLiveSubscriptionError extends Error {
  constructor() {
    super('no_live_subscription');
    this.name = 'NoLiveSubscriptionError';
  }
}

/**
 * T-508: cancel the user's newest live sub at the end of the current cycle.
 * T-399 rule: always cancel_at_cycle_end (true), never an immediate cancel.
 * Ink, the plan and the yearly drip are not touched: they run to paidThrough
 * and the subscription.cancelled / expired webhooks do the rest. The local
 * status is unchanged; only cancelAtCycleEnd is recorded.
 *
 * Idempotent: a sub already marked cancelAtCycleEnd returns the same payload
 * without calling Razorpay. If the Razorpay cancel throws, the sub is fetched;
 * a Razorpay status of cancelled/completed/expired counts as success (same
 * pattern as cancelLapsedAtRazorpay); anything else throws
 * SubscriptionCancelFailedError and nothing is written.
 */
export async function cancelSubscriptionAtCycleEnd(
  userId: string,
): Promise<SubscriptionStatusPayload> {
  const live = await Subscription.findOne({
    userId,
    status: { $in: LIVE_STATUSES },
  }).sort({ createdAt: -1 });
  if (!live) throw new NoLiveSubscriptionError();

  if (live.cancelAtCycleEnd === true) {
    return getSubscriptionStatus(userId);
  }

  const razorpaySubscriptionId = live.razorpaySubscriptionId;
  try {
    await withRazorpayTimeout(
      'cancel',
      razorpay.subscriptions.cancel(razorpaySubscriptionId, true),
    );
  } catch (cancelErr) {
    let rzpStatus: unknown;
    try {
      const rzpSub = (await withRazorpayTimeout(
        'fetch',
        razorpay.subscriptions.fetch(razorpaySubscriptionId),
      )) as unknown as Record<string, unknown>;
      rzpStatus = rzpSub.status;
    } catch {
      rzpStatus = undefined;
    }
    if (!(typeof rzpStatus === 'string' && RAZORPAY_ENDED_STATUSES.includes(rzpStatus))) {
      logger.error(
        {
          userId,
          subscriptionId: razorpaySubscriptionId,
          rzpStatus: typeof rzpStatus === 'string' ? rzpStatus : null,
          errName: cancelErr instanceof Error ? cancelErr.name : typeof cancelErr,
        },
        'billing.cancel.razorpay_failed',
      );
      throw new SubscriptionCancelFailedError();
    }
  }

  await Subscription.updateOne({ _id: live._id }, { $set: { cancelAtCycleEnd: true } });
  // Arjun: exactly one ops line on a real cancel; ids and paidThrough only.
  logger.info(
    {
      userId,
      subscriptionId: razorpaySubscriptionId,
      paidThrough: live.paidThrough ?? live.currentPeriodEnd ?? null,
    },
    'billing.cancel.scheduled',
  );
  return getSubscriptionStatus(userId);
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
