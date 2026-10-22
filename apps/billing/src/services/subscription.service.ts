import crypto from 'crypto';

import { addOneMonth } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import mongoose, { type HydratedDocument } from 'mongoose';

import { findPlanByRazorpayId, findSubscriptionPlan, findTopupSku } from '../config/credit-skus';
import { env } from '../config/env';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import {
  type ISubscription,
  isSubscriptionStatus,
  Subscription,
  type SubscriptionStatus,
} from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { SubscriptionReconcile } from '../models/SubscriptionReconcile.model';
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
 * T-518 / T-526 (Arjun): terminal statuses after which a new paid cycle is
 * unexpected, whether billing or Razorpay wrote them. A new paid cycle on one
 * is reported. completed is Razorpay's natural end of term and is excluded.
 */
const BILLING_TERMINAL_STATUSES: SubscriptionStatus[] = ['cancelled', 'expired'];
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
 *
 * T-518 (Arjun): reused, for the same 503, when the create-lock budget is
 * spent before the create (CREATE_LOCK_BUDGET_MS) and when an unfinished
 * checkout cannot be fetched (timeout, auth or other non-not-found error).
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
 * T-444c (Arjun): bound on each Razorpay fetch / cancel / create call. The SDK
 * (razorpay 2.9.6) passes no timeout to its axios client, so this is a
 * Promise.race: on timeout the call is treated as failed, but the HTTP request
 * itself is not aborted.
 *
 * T-518 (Arjun): one call is inside the 60 s create-lock TTL, but a degraded
 * path can chain four (fetch + cancel + fetch-after-throw + create = 60 s).
 * So the create is guarded by CREATE_LOCK_BUDGET_MS below: past 40 s since the
 * lock was taken, no create is started (503 try_again). The create itself is
 * then bounded at 15 s, so it ends by 55 s, before the TTL can free the lock
 * for a second caller.
 */
export const RAZORPAY_CALL_TIMEOUT_MS = 15_000;

/**
 * T-518 (Arjun): the latest point, measured from when the per-user create lock
 * was taken, at which razorpay.subscriptions.create may still start. 40 s plus
 * one bounded create (RAZORPAY_CALL_TIMEOUT_MS) stays inside the lock's 60 s
 * TTL. Past it, createSubscription throws SubscriptionCancelFailedError (503
 * try_again) and creates nothing.
 */
export const CREATE_LOCK_BUDGET_MS = 40_000;

export class RazorpayTimeoutError extends Error {
  constructor(op: string) {
    super(`razorpay_${op}_timeout`);
    this.name = 'RazorpayTimeoutError';
  }
}

/**
 * T-526 (Arjun, item 1): razorpay.subscriptions.create timed out, so a sub may
 * or may not exist at Razorpay. The route answers 503 `try_again`, and
 * createSubscription keeps the per-user create lock (its TTL expires it), so a
 * retry inside that window gets 409 subscription_in_progress rather than a
 * second sub.
 *
 * T-527 (Arjun): the real signal of a timed-out create is reportCreateTimeout
 * (error log + Sentry, user id only), not a webhook: a sub that went through
 * but stays 'created' (no checkout) fires no webhook at all, so
 * reportUnknownSub never sees it. The timeout also writes a
 * SubscriptionReconcile marker; the next subscribe and the reconcile sweep scan
 * Razorpay for that user and adopt or cancel what the create left behind
 * (reconcileRazorpaySubscriptions).
 */
export class SubscriptionCreateUnknownOutcomeError extends Error {
  constructor() {
    super('subscription_create_unknown_outcome');
    this.name = 'SubscriptionCreateUnknownOutcomeError';
  }
}

/**
 * T-527 round 3 (Arjun, option (a)): a webhook for an unknown sub could not
 * take the user's SubscriptionCreateLock (a subscribe or another adopt holds
 * it). Thrown out of handleWebhookEvent so the route answers 500 and Razorpay
 * retries the event once the lock is free.
 */
export class SubscriptionAdoptBusyError extends Error {
  constructor() {
    super('subscription_adopt_busy');
    this.name = 'SubscriptionAdoptBusyError';
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
 * T-526 (Arjun, item 1a): the create timed out, so its outcome at Razorpay is
 * unknown. One error log and a Sentry warning, the user id only.
 */
function reportCreateTimeout(userId: string): void {
  logger.error(
    { userId, marker: 'create_timeout_unknown_outcome' },
    'billing.subscription.create_timeout_unknown_outcome',
  );
  Sentry.withScope((scope) => {
    scope.setTag('userId', userId);
    scope.setTag('marker', 'create_timeout_unknown_outcome');
    Sentry.captureMessage('billing.subscription.create_timeout_unknown_outcome', 'warning');
  });
}

/**
 * T-526 (Arjun, item 1e): a subscription.* webhook for a Razorpay sub id with
 * no local Subscription row (e.g. a create that timed out but went through).
 * Never a silent drop: one error log and a Sentry warning, the subscription
 * id and event name only, no PII. The webhook's response is unchanged.
 */
function reportUnknownSub(razorpaySubscriptionId: string, event: string): void {
  logger.error({ subId: razorpaySubscriptionId, event }, 'billing.webhook.unknown_subscription');
  Sentry.withScope((scope) => {
    scope.setTag('razorpaySubscriptionId', razorpaySubscriptionId);
    scope.setExtra('event', event);
    Sentry.captureMessage('billing.webhook.unknown_subscription', 'warning');
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
    notFound: 'Lapsed subscription not found at Razorpay on resubscribe; treated as ended',
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
    notFound: 'Stale checkout not found at Razorpay for a different plan; treated as ended',
    failed: 'Razorpay cancel of stale checkout failed; not creating new subscription',
  });
}

/**
 * T-518 (Arjun): Razorpay says this subscription id does not exist. Matched
 * narrowly on the SDK's error shape ({ statusCode, error: { code, description } }):
 * HTTP 404, or a BAD_REQUEST_ERROR whose description says the id does not
 * exist. An auth failure (401/403) never counts as not-found.
 *
 * T-526 (Arjun, item 5): the description match needs statusCode === 400
 * exactly; an error with no statusCode is not not-found.
 */
export function isRazorpayNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (statusCode === 401 || statusCode === 403) return false;
  if (statusCode === 404) return true;
  if (statusCode !== 400) return false;
  const body = (err as { error?: unknown }).error;
  if (!body || typeof body !== 'object') return false;
  const { code, description } = body as { code?: unknown; description?: unknown };
  return (
    code === 'BAD_REQUEST_ERROR' &&
    typeof description === 'string' &&
    /\bdoes not exist\b/i.test(description)
  );
}

/**
 * T-518 (Arjun): fetch an unfinished checkout for createSubscription (plan
 * lookup or same-plan reuse). Never surfaces as a 500: null when Razorpay says
 * the id does not exist (the caller cancels the row locally and creates a new
 * sub); a timeout or any other error (auth, 5xx) throws
 * SubscriptionCancelFailedError (503 try_again). One log line per case, the
 * subscription id only.
 */
async function fetchCheckoutForCreate(
  razorpaySubscriptionId: string,
): Promise<Record<string, unknown> | null> {
  try {
    return (await withRazorpayTimeout(
      'fetch',
      razorpay.subscriptions.fetch(razorpaySubscriptionId),
    )) as unknown as Record<string, unknown>;
  } catch (err) {
    if (err instanceof RazorpayTimeoutError) {
      logger.warn(
        { subscriptionId: razorpaySubscriptionId },
        'billing.subscription.checkout_fetch_timeout',
      );
      throw new SubscriptionCancelFailedError();
    }
    if (isRazorpayNotFound(err)) {
      logger.warn(
        { subscriptionId: razorpaySubscriptionId },
        'billing.subscription.checkout_not_found',
      );
      return null;
    }
    logger.error(
      { subscriptionId: razorpaySubscriptionId },
      'billing.subscription.checkout_fetch_failed',
    );
    throw new SubscriptionCancelFailedError();
  }
}

/**
 * T-444c / T-516: the shared immediate cancel (cancel_at_cycle_end false).
 *
 * T-526 (Arjun, item 2): Razorpay saying the id does not exist
 * (isRazorpayNotFound), on the cancel or on the follow-up fetch, counts as
 * already ended: one warn, ids only, and return, so the caller does its
 * guarded local write and creates. A timeout, auth failure (401/403) or 5xx is
 * never not-found and still throws SubscriptionCancelFailedError.
 */
async function cancelNowAtRazorpay(
  userId: string,
  razorpaySubscriptionId: string,
  messages: { cancelled: string; alreadyEnded: string; notFound: string; failed: string },
): Promise<void> {
  try {
    await withRazorpayTimeout(
      'cancel',
      razorpay.subscriptions.cancel(razorpaySubscriptionId, false),
    );
    logger.info({ userId, subscriptionId: razorpaySubscriptionId }, messages.cancelled);
    return;
  } catch (cancelErr) {
    if (isRazorpayNotFound(cancelErr)) {
      logger.warn({ userId, subscriptionId: razorpaySubscriptionId }, messages.notFound);
      return;
    }
    let rzpStatus: unknown;
    let fetchErr: unknown;
    try {
      const rzpSub = (await withRazorpayTimeout(
        'fetch',
        razorpay.subscriptions.fetch(razorpaySubscriptionId),
      )) as unknown as Record<string, unknown>;
      rzpStatus = rzpSub.status;
    } catch (err) {
      fetchErr = err;
      rzpStatus = undefined;
    }
    if (fetchErr !== undefined && isRazorpayNotFound(fetchErr)) {
      logger.warn({ userId, subscriptionId: razorpaySubscriptionId }, messages.notFound);
      return;
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

// ─── T-527: reconcile before create (Arjun design (a), 21 Oct 2026) ─────────

/** T-527: Razorpay list page size (the SDK's maximum `count`). */
export const RECONCILE_PAGE_SIZE = 100;
/** T-527: pages read per scan; a full last page means the scan is incomplete. */
export const RECONCILE_MAX_PAGES = 3;
/** T-527: the scan starts this many seconds before the marker's lockCreatedAt. */
export const RECONCILE_WINDOW_SLACK_S = 300;

/** T-527: the fields of a Razorpay subscription the reconcile reads. */
interface RazorpaySubItem {
  id: string;
  status: string;
  userId: string;
  planId: string | undefined;
  shortUrl: string;
  createdAt: number;
}

/** T-527: what reconcileRazorpaySubscriptions found and did. */
export type ReconcileOutcome =
  | { kind: 'none' }
  | { kind: 'adopted_checkout'; subscriptionId: string; shortUrl: string; planId: string }
  | { kind: 'live'; row: HydratedDocument<ISubscription> };

function errNameOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 11000;
}

/**
 * T-527 (Arjun, design 1): upsert the user's reconcile marker after a create
 * timeout. One marker per user (unique userId); the earliest lockCreatedAt is
 * kept. A failure is logged (ids only) and swallowed: the caller still answers
 * 503 try_again.
 */
async function writeReconcileMarker(
  userId: string,
  lockCreatedAt: Date,
  planId: string,
): Promise<void> {
  const upsert = () =>
    SubscriptionReconcile.updateOne(
      { userId },
      { $min: { lockCreatedAt }, $setOnInsert: { planId, createdAt: new Date() } },
      { upsert: true },
    );
  try {
    // The unique index must exist before the upsert can keep one per user.
    await SubscriptionReconcile.init();
    try {
      await upsert();
    } catch (err) {
      // Two upserts raced on the insert; the second one now matches and updates.
      if (!isDuplicateKey(err)) throw err;
      await upsert();
    }
    logger.warn({ userId, planId }, 'billing.subscription.reconcile_marker_written');
  } catch (err) {
    logger.error(
      { userId, planId, errName: errNameOf(err) },
      'billing.subscription.reconcile_marker_write_failed',
    );
  }
}

/**
 * T-527: no Razorpay call is started past CREATE_LOCK_BUDGET_MS since the
 * per-user lock was taken (same budget as the create), so the scan and its
 * cancels stay inside the lock's TTL as far as one bounded call allows.
 */
function checkReconcileBudget(userId: string, lockedAt: number): void {
  const elapsedMs = Date.now() - lockedAt;
  if (elapsedMs > CREATE_LOCK_BUDGET_MS) {
    logger.warn({ userId, elapsedMs }, 'billing.subscription.reconcile_budget_exceeded');
    throw new SubscriptionCancelFailedError();
  }
}

/**
 * T-527 (Arjun, design 2): list Razorpay subscriptions created from
 * lockCreatedAt − 300 s to now and keep the ones whose notes.userId is this
 * user (Razorpay has no notes filter). At most RECONCILE_MAX_PAGES pages of
 * RECONCILE_PAGE_SIZE, each bounded by withRazorpayTimeout('list'). Throws
 * SubscriptionCancelFailedError on a list failure or timeout, and when the
 * last allowed page is full (the scan would be incomplete). Notes are only
 * compared, never logged.
 */
async function scanRazorpayForUser(
  userId: string,
  lockCreatedAt: Date,
  lockedAt: number,
): Promise<RazorpaySubItem[]> {
  const from = Math.floor(lockCreatedAt.getTime() / 1000) - RECONCILE_WINDOW_SLACK_S;
  const to = Math.floor(Date.now() / 1000);
  const matched: RazorpaySubItem[] = [];
  for (let page = 0; page < RECONCILE_MAX_PAGES; page += 1) {
    checkReconcileBudget(userId, lockedAt);
    let items: unknown[];
    try {
      const res = (await withRazorpayTimeout(
        'list',
        razorpay.subscriptions.all({
          from,
          to,
          count: RECONCILE_PAGE_SIZE,
          skip: page * RECONCILE_PAGE_SIZE,
        }),
      )) as unknown as { items?: unknown } | null | undefined;
      if (!Array.isArray(res?.items)) {
        // T-527 round 2: a null body or no items array is not an empty page.
        // The scan cannot be called complete: 503, the marker is kept.
        logger.error({ userId, page }, 'billing.subscription.reconcile_list_malformed');
        throw new SubscriptionCancelFailedError();
      }
      items = res.items;
    } catch (err) {
      if (err instanceof SubscriptionCancelFailedError) throw err;
      logger.error(
        { userId, page, errName: errNameOf(err) },
        'billing.subscription.reconcile_list_failed',
      );
      throw new SubscriptionCancelFailedError();
    }
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const notes = item.notes as Record<string, unknown> | null | undefined;
      if (!notes || typeof notes !== 'object' || notes.userId !== userId) continue;
      if (typeof item.id !== 'string' || typeof item.status !== 'string') continue;
      matched.push({
        id: item.id,
        status: item.status,
        userId,
        planId: typeof notes.planId === 'string' ? notes.planId : undefined,
        shortUrl: typeof item.short_url === 'string' ? item.short_url : '',
        createdAt: typeof item.created_at === 'number' ? item.created_at : 0,
      });
    }
    if (items.length < RECONCILE_PAGE_SIZE) return matched;
  }
  logger.error(
    { userId, pages: RECONCILE_MAX_PAGES },
    'billing.subscription.reconcile_scan_capped',
  );
  throw new SubscriptionCancelFailedError();
}

/**
 * T-527 (Arjun, design 3): a live Razorpay sub had no local row and was
 * adopted. One error log and a Sentry warning, ids and status only.
 */
function reportAdoptedLiveSub(
  userId: string,
  razorpaySubscriptionId: string,
  status: string,
): void {
  logger.error(
    { userId, subscriptionId: razorpaySubscriptionId, status },
    'billing.subscription.reconcile_adopted_live',
  );
  Sentry.withScope((scope) => {
    scope.setTag('userId', userId);
    scope.setTag('razorpaySubscriptionId', razorpaySubscriptionId);
    scope.setExtra('status', status);
    Sentry.captureMessage('billing.subscription.reconcile_adopted_live', 'warning');
  });
}

/**
 * T-527: write the local row for a Razorpay sub, as the normal create path
 * does (userId, razorpaySubscriptionId, status, planId), with Razorpay's
 * status. E11000 (a webhook wrote it meanwhile): the row is re-read and
 * returned as the existing local row.
 */
async function adoptRazorpaySub(
  userId: string,
  item: RazorpaySubItem,
): Promise<HydratedDocument<ISubscription>> {
  const planSku = item.planId ? findSubscriptionPlan(item.planId) : undefined;
  try {
    const row = await Subscription.create({
      userId,
      razorpaySubscriptionId: item.id,
      status: item.status,
      ...(planSku ? { planId: planSku.id } : {}),
    });
    logger.info(
      { userId, subscriptionId: item.id, status: item.status, planId: planSku?.id ?? null },
      'billing.subscription.reconcile_adopted',
    );
    return row;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const reread = await Subscription.findOne({ razorpaySubscriptionId: item.id });
    if (!reread) throw err;
    logger.info(
      { userId, subscriptionId: item.id, status: reread.status },
      'billing.subscription.reconcile_adopt_raced',
    );
    return reread;
  }
}

/**
 * T-527 round 3 (Arjun): Razorpay lists this sub as live but the local row is
 * still a checkout (its webhook not yet applied). One guarded update from the
 * checkout statuses to Razorpay's status, then the row is re-read. A row that
 * moved meanwhile is left as the webhook wrote it. Ids and status only.
 */
async function syncLocalToLive(
  userId: string,
  local: HydratedDocument<ISubscription>,
  rzpStatus: SubscriptionStatus,
): Promise<HydratedDocument<ISubscription>> {
  if (!CHECKOUT_STATUSES.includes(local.status)) return local;
  const synced = await Subscription.updateOne(
    { _id: local._id, status: { $in: CHECKOUT_STATUSES } },
    { $set: { status: rzpStatus } },
  );
  logger.warn(
    {
      userId,
      subscriptionId: local.razorpaySubscriptionId,
      priorStatus: local.status,
      status: rzpStatus,
      updated: synced.modifiedCount > 0,
    },
    'billing.subscription.reconcile_local_row_synced_live',
  );
  return (await Subscription.findById(local._id)) ?? local;
}

/**
 * T-527 (Arjun design (a), 21 Oct 2026): the one reconcile used by both the
 * subscribe path (createSubscriptionLocked, requestedPlanId set) and the
 * reconcile sweep (requestedPlanId unset). The caller holds the user's
 * SubscriptionCreateLock, taken at `lockedAt`.
 *
 * With no marker for the user: { kind: 'none' }, no Razorpay call. Otherwise
 * the user's Razorpay subs are scanned (scanRazorpayForUser). A sub whose
 * local row belongs to another user is skipped (logged, ids only). On
 * subscribe, a sub whose local row is this user's is handled by the row's
 * status (live: 409; checkout: reused when on the requested plan, else
 * cancelled at Razorpay and locally); the sweep leaves such subs alone.
 * A sub live at Razorpay is live whatever its local row says (round 3).
 * Every matching sub with no local row is handled:
 * - active / pending / halted / paused: adopted as a row with its status and
 *   reported (reportAdoptedLiveSub). Then { kind: 'live', row } (newest).
 * - created / authenticated: when requestedPlanId is set, no live sub was
 *   found and notes.planId is the requested plan, the newest such sub is
 *   adopted and returned ({ kind: 'adopted_checkout' }). Every other one is
 *   cancelled now at Razorpay (cancel(id, false)). With a live sub present no
 *   checkout is adopted, so a second live sub cannot follow from it.
 * - terminal statuses: ignored.
 * The marker is deleted only after a complete scan and successful handling;
 * a list failure, timeout, page cap, cancel failure or DB error throws
 * (SubscriptionCancelFailedError for Razorpay failures: 503 try_again) and
 * keeps it. Logs ids, status and counts only.
 */
export async function reconcileRazorpaySubscriptions(
  userId: string,
  opts: { requestedPlanId?: string; lockedAt: number },
): Promise<ReconcileOutcome> {
  const marker = await SubscriptionReconcile.findOne({ userId }).lean();
  if (!marker) return { kind: 'none' };

  const items = await scanRazorpayForUser(userId, marker.lockCreatedAt, opts.lockedAt);
  // Newest first, so "adopt the newest" is the first match.
  items.sort((a, b) => b.createdAt - a.createdAt);
  const subscribe = opts.requestedPlanId !== undefined;

  const liveRows: HydratedDocument<ISubscription>[] = [];
  // Unfinished checkouts of this user, newest first; `row` is set when the sub
  // already has a local row.
  const checkouts: { item: RazorpaySubItem; row?: HydratedDocument<ISubscription> }[] = [];
  for (const item of items) {
    if (!isSubscriptionStatus(item.status)) continue;
    const isLive = LIVE_STATUSES.includes(item.status);
    const isCheckout = CHECKOUT_STATUSES.includes(item.status);
    if (!isLive && !isCheckout) continue;
    const local = await Subscription.findOne({ razorpaySubscriptionId: item.id });
    if (local) {
      if (!local.userId.equals(userId)) {
        logger.warn(
          { userId, subscriptionId: item.id },
          'billing.subscription.reconcile_row_of_other_user',
        );
        continue;
      }
      // The sweep leaves subs that have a local row to the local rules.
      if (!subscribe) continue;
      // T-527 round 2: on subscribe, a row written after the local checks of
      // createSubscriptionLocked (e.g. a webhook adopt during the scan) is
      // never skipped.
      // A terminal local row is ignored (billing or a webhook ended it).
      if (!LIVE_STATUSES.includes(local.status) && !CHECKOUT_STATUSES.includes(local.status)) {
        continue;
      }
      // T-527 round 3 (Arjun): classified by the RAZORPAY status. Live there
      // means paid: the live result (409), never a cancel or a payment link,
      // whatever the local row says; the local row is brought up to date.
      // A local live row is live too (paid after the list was read).
      if (isLive) {
        liveRows.push(await syncLocalToLive(userId, local, item.status));
      } else if (LIVE_STATUSES.includes(local.status)) {
        liveRows.push(local);
      } else {
        checkouts.push({ item, row: local });
      }
      continue;
    }
    if (isCheckout) {
      checkouts.push({ item });
      continue;
    }
    const row = await adoptRazorpaySub(userId, item);
    if (row.userId.equals(userId) && LIVE_STATUSES.includes(row.status)) liveRows.push(row);
    reportAdoptedLiveSub(userId, item.id, item.status);
  }

  const planOf = (c: (typeof checkouts)[number]) => c.row?.planId ?? c.item.planId;
  const adoptTarget =
    liveRows.length === 0 && subscribe
      ? checkouts.find((c) => planOf(c) === opts.requestedPlanId)
      : undefined;

  let cancelled = 0;
  for (const c of checkouts) {
    if (c === adoptTarget) continue;
    checkReconcileBudget(userId, opts.lockedAt);
    await cancelNowAtRazorpay(userId, c.item.id, {
      cancelled: 'Orphan subscription cancelled at Razorpay on reconcile',
      alreadyEnded: 'Orphan subscription already ended at Razorpay on reconcile',
      notFound: 'Orphan subscription not found at Razorpay on reconcile; treated as ended',
      failed: 'Razorpay cancel of orphan subscription failed on reconcile; marker kept',
    });
    cancelled += 1;
    if (!c.row) continue;
    // A local row: the same guarded local cancel as a stale checkout. If it
    // turned live meanwhile it answers 409 (reported if it was paid).
    const localCancel = await Subscription.updateOne(
      { _id: c.row._id, status: { $in: CHECKOUT_STATUSES } },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
    );
    if (localCancel.matchedCount === 0) {
      const reread = await Subscription.findById(c.row._id);
      if (reread && LIVE_STATUSES.includes(reread.status)) {
        if (reread.status === 'active') reportCancelledPaidSub(c.item.id);
        liveRows.push(reread);
      }
    }
  }

  let adopted: ReconcileOutcome | undefined;
  if (adoptTarget) {
    // An existing local row is reused as is; otherwise the row is written now.
    const row = adoptTarget.row ?? (await adoptRazorpaySub(userId, adoptTarget.item));
    if (row.userId.equals(userId)) {
      if (LIVE_STATUSES.includes(row.status)) {
        // Paid meanwhile (a webhook wrote it live): answered like a live sub.
        liveRows.push(row);
      } else if (CHECKOUT_STATUSES.includes(row.status)) {
        adopted = {
          kind: 'adopted_checkout',
          subscriptionId: row.razorpaySubscriptionId,
          shortUrl: adoptTarget.item.shortUrl,
          planId: row.planId ?? opts.requestedPlanId ?? adoptTarget.item.planId ?? '',
        };
      }
    }
  }

  // Complete scan, everything handled: the marker has done its job. Deleted by
  // _id and the lockCreatedAt read, so an earlier timeout written meanwhile
  // ($min) is not lost. A failed delete is logged; the next scan finds only
  // rows that now exist locally.
  try {
    await SubscriptionReconcile.deleteOne({
      _id: marker._id,
      lockCreatedAt: marker.lockCreatedAt,
    });
  } catch (err) {
    logger.error(
      { userId, errName: errNameOf(err) },
      'billing.subscription.reconcile_marker_delete_failed',
    );
  }

  logger.info(
    {
      userId,
      matched: items.length,
      adoptedLive: liveRows.length,
      adoptedCheckout: adopted ? 1 : 0,
      cancelled,
    },
    'billing.subscription.reconcile_done',
  );

  if (liveRows.length > 0) return { kind: 'live', row: liveRows[0] };
  return adopted ?? { kind: 'none' };
}

/** T-527: a 24-hex-char ObjectId string (not any 12-byte string). */
function isObjectIdString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{24}$/i.test(value) &&
    mongoose.Types.ObjectId.isValid(value)
  );
}

/**
 * T-527 (Arjun, design 4): a subscription.* webhook for a sub with no local
 * row. When notes.userId is a valid ObjectId of an existing user (round 2)
 * and that user has no other live
 * or checkout row, the row is upserted (keyed by razorpaySubscriptionId,
 * userId from notes, planId from notes.planId when it is a known plan, status
 * 'created' so the normal event handling then moves it exactly as it would a
 * row written by createSubscription). Otherwise null (report only). Notes are
 * never logged; ids only.
 */
async function adoptUnknownSubFromWebhook(
  subId: string,
  subPayload: Record<string, unknown> | undefined,
): Promise<HydratedDocument<ISubscription> | null> {
  const notes = subPayload?.notes as Record<string, unknown> | null | undefined;
  const notesUserId = notes && typeof notes === 'object' ? notes.userId : undefined;
  if (!isObjectIdString(notesUserId)) return null;
  // T-527 round 2: only a user that exists gets a row; otherwise report only.
  if (!(await User.exists({ _id: notesUserId }))) {
    logger.warn({ subId, userId: notesUserId }, 'billing.webhook.unknown_subscription_no_user');
    return null;
  }
  // T-527 round 3 (Arjun, G1-G3 option (a)): the adopt runs under the same
  // per-user SubscriptionCreateLock as createSubscription, so it cannot
  // interleave with a subscribe (or another adopt) for this user. Held:
  // SubscriptionAdoptBusyError, the route answers 500 and Razorpay retries;
  // the adopt is idempotent on the sub id and lands after the create.
  await SubscriptionCreateLock.init();
  let lockId: unknown;
  try {
    const lock = await SubscriptionCreateLock.create({
      userId: notesUserId,
      createdAt: new Date(),
    });
    lockId = lock._id;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    logger.warn({ subId, userId: notesUserId }, 'billing.webhook.unknown_subscription_lock_busy');
    throw new SubscriptionAdoptBusyError();
  }
  try {
    return await adoptUnknownSubLocked(subId, notesUserId, notes);
  } finally {
    try {
      await SubscriptionCreateLock.deleteOne({ _id: lockId });
    } catch (releaseErr) {
      // The TTL index removes it within ~2 min.
      logger.error(
        { subId, userId: notesUserId, errName: errNameOf(releaseErr) },
        'billing.webhook.adopt_lock_release_failed',
      );
    }
  }
}

async function adoptUnknownSubLocked(
  subId: string,
  notesUserId: string,
  notes: Record<string, unknown> | null | undefined,
): Promise<HydratedDocument<ISubscription> | null> {
  const other = await Subscription.exists({
    userId: notesUserId,
    status: { $in: [...LIVE_STATUSES, ...CHECKOUT_STATUSES] },
  });
  if (other) {
    logger.warn({ subId, userId: notesUserId }, 'billing.webhook.unknown_subscription_not_adopted');
    return null;
  }
  const planSku =
    typeof notes?.planId === 'string' ? findSubscriptionPlan(notes.planId) : undefined;
  let row: HydratedDocument<ISubscription> | null;
  try {
    row = await Subscription.findOneAndUpdate(
      { razorpaySubscriptionId: subId },
      {
        $setOnInsert: {
          userId: notesUserId,
          status: 'created',
          ...(planSku ? { planId: planSku.id } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    row = await Subscription.findOne({ razorpaySubscriptionId: subId });
  }
  if (row) {
    logger.warn(
      { subId, userId: notesUserId, planId: planSku?.id ?? null },
      'billing.webhook.unknown_subscription_adopted',
    );
  }
  return row;
}

/**
 * T-527 round 3 (Arjun): a reported failure to cancel the duplicate sub the
 * post-create check found. One error log and a Sentry warning, ids only.
 */
function reportDuplicateCancelFailed(
  userId: string,
  newSubscriptionId: string,
  existingSubscriptionId: string,
): void {
  logger.error(
    { userId, subscriptionId: newSubscriptionId, existingSubscriptionId },
    'billing.subscription.post_create_duplicate_cancel_failed',
  );
  Sentry.withScope((scope) => {
    scope.setTag('userId', userId);
    scope.setTag('razorpaySubscriptionId', newSubscriptionId);
    scope.setExtra('existingSubscriptionId', existingSubscriptionId);
    Sentry.captureMessage('billing.subscription.post_create_duplicate_cancel_failed', 'warning');
  });
}

/**
 * T-527 round 3 (Arjun, option (a)): the post-create check found an earlier
 * non-terminal row for this user. The new sub is cancelled now at Razorpay
 * (cancel(id, false)) and, once that succeeds, its row is marked cancelled
 * (guarded on 'created'). A failed cancel is reported and the new row is left
 * as is (still uncancelled at Razorpay, so the row stays truthful); the
 * existing row is still the answer. A checkout answers with its link, as the
 * reuse path does (fetched; a failed fetch falls back to the 409); anything
 * else is the 409 via existsError.
 */
async function resolvePostCreateDuplicate(
  userId: string,
  newRow: HydratedDocument<ISubscription>,
  existing: HydratedDocument<ISubscription>,
  requestedPlanId: string,
  existsError: (s: HydratedDocument<ISubscription>) => Promise<SubscriptionExistsError>,
): Promise<{ subscriptionId: string; shortUrl: string; planId: string }> {
  logger.warn(
    {
      userId,
      subscriptionId: newRow.razorpaySubscriptionId,
      existingSubscriptionId: existing.razorpaySubscriptionId,
      existingStatus: existing.status,
    },
    'billing.subscription.post_create_duplicate',
  );
  let cancelled = false;
  try {
    await cancelNowAtRazorpay(userId, newRow.razorpaySubscriptionId, {
      cancelled: 'Duplicate subscription cancelled at Razorpay after create',
      alreadyEnded: 'Duplicate subscription already ended at Razorpay after create',
      notFound: 'Duplicate subscription not found at Razorpay after create; treated as ended',
      failed: 'Razorpay cancel of duplicate subscription failed after create',
    });
    cancelled = true;
  } catch {
    reportDuplicateCancelFailed(
      userId,
      newRow.razorpaySubscriptionId,
      existing.razorpaySubscriptionId,
    );
  }
  if (cancelled) {
    await Subscription.updateOne(
      { _id: newRow._id, status: 'created' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
    );
  }
  const current = (await Subscription.findById(existing._id)) ?? existing;
  if (CHECKOUT_STATUSES.includes(current.status)) {
    let rzpSub: Record<string, unknown> | null = null;
    try {
      rzpSub = await fetchCheckoutForCreate(current.razorpaySubscriptionId);
    } catch {
      rzpSub = null;
    }
    if (rzpSub) {
      return {
        subscriptionId: current.razorpaySubscriptionId,
        shortUrl: (rzpSub.short_url as string) ?? '',
        planId: current.planId ?? requestedPlanId,
      };
    }
  }
  throw await existsError(current);
}

/**
 * T-444c (Arjun ruling 1): one createSubscription per user at a time. The lock
 * is one insert into SubscriptionCreateLock (unique userId); E11000 means
 * another call holds it. The row is deleted in a finally, by its own _id, so a
 * call whose lock already timed out never deletes a newer caller's lock.
 *
 * T-526 (Arjun, item 1b): the one exception is a create timeout
 * (SubscriptionCreateUnknownOutcomeError). The lock is kept and its TTL
 * expires it, so no second sub can be created while the first may exist.
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
  // T-518 (Arjun): when the lock was taken; the create is checked against
  // CREATE_LOCK_BUDGET_MS from here.
  let lockedAt: number;
  try {
    // T-526 (Arjun, item 3): the budget clock is the lock's own createdAt.
    const createdAt = new Date();
    const lock = await SubscriptionCreateLock.create({ userId, createdAt });
    lockId = lock._id;
    lockedAt = createdAt.getTime();
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 11000) {
      throw new SubscriptionInProgressError();
    }
    throw err;
  }
  // T-526: set only when the create timed out; every other path releases.
  let keepLock = false;
  try {
    return await createSubscriptionLocked(userId, email, lockedAt, planId);
  } catch (err) {
    if (err instanceof SubscriptionCreateUnknownOutcomeError) keepLock = true;
    throw err;
  } finally {
    if (!keepLock) {
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
}

async function createSubscriptionLocked(
  userId: string,
  email: string,
  lockedAt: number,
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
  // T-527 round 2: the local live / checkout rules, run once before the
  // reconcile and once more when the reconcile adopted nothing and a row for
  // this user landed meanwhile. A result is a reused checkout;
  // undefined means nothing local stops a create.
  const runLocalChecks = async (): Promise<
    { subscriptionId: string; shortUrl: string; planId: string } | undefined
  > => {
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
      // T-518 (Arjun): either fetch below never 500s. A timeout or any other
      // error is 503 try_again; an id Razorpay says does not exist is cancelled
      // locally by the same guarded write as a stale checkout, then a new sub is
      // created.
      let rzpSub: Record<string, unknown> | undefined;
      let missingAtRazorpay = false;
      let existingPlanId = existing.planId ?? undefined;
      if (!existingPlanId) {
        const fetched = await fetchCheckoutForCreate(existing.razorpaySubscriptionId);
        if (fetched === null) {
          missingAtRazorpay = true;
        } else {
          rzpSub = fetched;
          const rzpNotes = rzpSub.notes as Record<string, unknown> | undefined;
          const rzpPlanId = typeof rzpSub.plan_id === 'string' ? rzpSub.plan_id : undefined;
          existingPlanId =
            (typeof rzpNotes?.planId === 'string' ? rzpNotes.planId : undefined) ??
            (rzpPlanId ? findPlanByRazorpayId(rzpPlanId)?.id : undefined);
        }
      }

      if (!missingAtRazorpay && existingPlanId === planSku.id) {
        if (!rzpSub) {
          const fetched = await fetchCheckoutForCreate(existing.razorpaySubscriptionId);
          if (fetched === null) missingAtRazorpay = true;
          else rzpSub = fetched;
        }
        if (rzpSub) {
          return {
            subscriptionId: existing.razorpaySubscriptionId,
            shortUrl: (rzpSub.short_url as string) ?? '',
            planId: existingPlanId,
          };
        }
      }

      // Different (or unknown) plan: a failed cancel throws (503 try_again)
      // before any local write or create. Not at Razorpay at all: nothing to
      // cancel there.
      if (!missingAtRazorpay) {
        await cancelStaleCheckoutAtRazorpay(userId, existing.razorpaySubscriptionId);
      }
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
          // Not reported when Razorpay had no such sub: nothing was cancelled.
          if (!missingAtRazorpay && reread._id.equals(existing._id) && reread.status === 'active') {
            reportCancelledPaidSub(existing.razorpaySubscriptionId);
          }
          throw await existsError(reread);
        }
      }
    }
    return undefined;
  };
  // Rows created from here on landed after the first local checks (belt below).
  const localChecksAt = new Date();
  const localResult = await runLocalChecks();
  if (localResult) return localResult;

  // T-527 (Arjun, design 2): a create for this user timed out earlier (marker),
  // so a sub may exist at Razorpay with no local row. Scan for it before any
  // new create: a same-plan checkout is adopted and returned, a live sub is
  // adopted and answered 409 like the live check above. A list failure,
  // timeout, page cap or handling error is 503 try_again and keeps the marker.
  // The scan's time counts against the budget checked just below.
  const reconciled = await reconcileRazorpaySubscriptions(userId, {
    requestedPlanId: planSku.id,
    lockedAt,
  });
  if (reconciled.kind === 'adopted_checkout') {
    return {
      subscriptionId: reconciled.subscriptionId,
      shortUrl: reconciled.shortUrl,
      planId: reconciled.planId,
    };
  }
  if (reconciled.kind === 'live') throw await existsError(reconciled.row);
  // T-527 round 2 (belt): nothing was adopted. If a live or checkout row for
  // this user was written after the first local checks began (e.g. a webhook
  // adopt during the scan), the same local rules run again before any create.
  // Only a new row triggers this, so rows the first pass already handled (an
  // older checkout T-516 leaves alone) are not handled twice.
  const landedMeanwhile = await Subscription.exists({
    userId,
    status: { $in: [...LIVE_STATUSES, ...CHECKOUT_STATUSES] },
    createdAt: { $gte: localChecksAt },
  });
  if (landedMeanwhile) {
    const afterReconcile = await runLocalChecks();
    if (afterReconcile) return afterReconcile;
  }

  // T-518 (Arjun): every path reaches the create through here. Past the
  // budget, a create could outlive the lock's TTL and race a second caller,
  // so nothing is created (503 try_again). The lock is still released by _id
  // in createSubscription's finally.
  const elapsedMs = Date.now() - lockedAt;
  if (elapsedMs > CREATE_LOCK_BUDGET_MS) {
    logger.warn({ userId, elapsedMs }, 'billing.subscription.create_lock_budget_exceeded');
    throw new SubscriptionCancelFailedError();
  }

  // T-444c: bounded; no local row is written on a timeout. T-526 (Arjun): a
  // timeout is an unknown outcome at Razorpay: reported, 503 try_again, and
  // the create lock is kept until its TTL (see createSubscription).
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
      reportCreateTimeout(userId);
      // T-527 (Arjun, design 1): a durable marker so the next subscribe and the
      // sweep reconcile what this create may have left at Razorpay. Never
      // changes the response (still 503).
      await writeReconcileMarker(userId, new Date(lockedAt), planSku.id);
      throw new SubscriptionCreateUnknownOutcomeError();
    }
    throw err;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const newRow = await Subscription.create({
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

  // T-527 round 3 (Arjun, G1-G3 option (a), belt): another non-terminal row
  // for this user may have been written while this call held the lock (e.g.
  // a webhook adopt that got past it). The earlier createdAt wins: the new
  // sub is cancelled and the existing row answered. Only rows created since
  // the lock was taken count: older rows were already ruled on by the local
  // checks (an older checkout T-516 leaves alone is not a duplicate).
  const earlier = await Subscription.findOne({
    userId,
    _id: { $ne: newRow._id },
    status: { $nin: TERMINAL_STATUSES },
    createdAt: { $gte: new Date(lockedAt), $lte: newRow.createdAt },
  }).sort({ createdAt: 1 });
  if (earlier) {
    return resolvePostCreateDuplicate(userId, newRow, earlier, planSku.id, existsError);
  }

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
      // T-540: the ledger records what was CHARGED (a coupon lowers it), not the
      // list price. Razorpay amounts are paise: the payment's amount, else the
      // order's amount_paid / amount; the list price only if neither carries one.
      const paiseOf = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
      const chargedPaise =
        paiseOf(paymentEntity?.amount) ??
        paiseOf(orderEntity?.amount_paid) ??
        paiseOf(orderEntity?.amount) ??
        sku.priceInr * 100;
      const granted = await grantTopupInk({
        userId: notes.user_id,
        inkUnits: sku.ink * 2, // 1 Ink = 2 ledger units
        amountInr: chargedPaise / 100,
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
          // T-540 (design point 6): a race for the last use between order and
          // capture is accepted where money was taken; log the overshoot. No PII.
          if (
            coupon &&
            coupon.maxUses !== null &&
            coupon.maxUses !== undefined &&
            coupon.uses > coupon.maxUses
          ) {
            logger.warn(
              { couponCode: notes.coupon_code, uses: coupon.uses, maxUses: coupon.maxUses },
              'Coupon uses went past maxUses on a paid top-up',
            );
          }
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

  let sub = await Subscription.findOne({ razorpaySubscriptionId: subId });
  if (!sub) {
    // T-526 (Arjun, item 1e): a subscription.* event with no local row is
    // reported, never silently dropped. The response stays a 200 as before.
    if (!event.startsWith('subscription.')) {
      logger.warn({ subId, event }, 'Webhook received for unknown subscription');
      return;
    }
    reportUnknownSub(subId, event);
    // T-527 (Arjun, design 4): adopt it when notes.userId is a user with no
    // other live/checkout row, then handle the event as for any known sub.
    // Otherwise the report above is all that happens.
    const adopted = await adoptUnknownSubFromWebhook(subId, subPayload);
    if (!adopted) return;
    sub = adopted;
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
      // T-518 (Arjun): set when the prior status was one billing itself writes
      // as terminal (cancelled, expired). Combined with isNewCycle below, the
      // charge is a paid cycle on a sub billing had ended (the late-webhook
      // window after a local cancel), and it is reported once.
      let priorBillingTerminal = false;
      const logIfTerminal = (before: { get(path: string): unknown } | null) => {
        const prior = before?.get('status');
        if (typeof prior === 'string' && (TERMINAL_STATUSES as string[]).includes(prior)) {
          logger.info(
            { subId, event, paidCount, status: prior },
            'Charge on a terminal subscription; status kept, paid cycle granted',
          );
          priorBillingTerminal = (BILLING_TERMINAL_STATUSES as string[]).includes(prior);
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

      // T-518 (Arjun): report-only. Reached only once this cycle's claim was
      // won and its grant (if any) went through, so a replay (lost claim, or a
      // Razorpay retry after a failed grant whose claim was rolled back)
      // reports nothing extra. Grant and paidThrough are unchanged.
      if (priorBillingTerminal && isNewCycle) {
        reportCancelledPaidSub(subId);
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
    // lazy settleYearlyDrip) downgrades and zeroes. A user's cancel is
    // cancel-at-cycle-end, razorpay.subscriptions.cancel(id, true) (T-508).
    // Billing cancels immediately, cancel(id, false), only for a lapsed sub on
    // resubscribe (T-444c) and an unpaid stale checkout for a different plan
    // (T-516).
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
