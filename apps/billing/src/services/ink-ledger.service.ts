/**
 * Ink Ledger Service — SCRUM-101
 *
 * Manages the Ink credit system. Ink is stored as integer units ×2
 * (1 Ink = 2 units, 0.5 Ink regeneration = 1 unit) so there are no floats.
 *
 * Bucket deduction order: inkSub → inkAnnualCarry → inkTopup
 * (most-expiring ink burns first).
 *
 * All writes go to the `inkledger` collection (NOT the old `creditledgers`).
 * Requires MongoDB 4.2+ for aggregation-pipeline updates.
 */
import { randomUUID } from 'crypto';

import { settleYearlyDrip } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import { User } from '../models/User.model';

// ── Types ──────────────────────────────────────────────────────────────────

interface InkBalance {
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  totalSpendable: number;
}

interface DeductResult {
  success: boolean;
  reason?: string;
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
}

interface InkLedgerRow {
  userId: mongoose.Types.ObjectId;
  delta: number; // signed units (negative for deducts, positive for grants)
  reason: string;
  sourceBucket: 'sub' | 'annual_carry' | 'topup';
  balanceAfter: number; // total spendable after this row
  reference?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function writeInkLedgerRow(row: InkLedgerRow): Promise<void> {
  const conn = mongoose.connection;
  if (!conn.db) return;
  try {
    await conn.db.collection('inkledger').insertOne(row);
  } catch (err) {
    // T-399: a lost audit row is an error, not a warning. Ids and the error
    // class only (no driver message, no PII).
    logger.error(
      {
        errName: err instanceof Error ? err.name : 'unknown',
        reason: row.reason,
        reference: row.reference,
      },
      'ink-ledger: ledger insert failed',
    );
  }
}

/**
 * T-413: a "paid but not granted / needs a human" outcome. pino reaches nobody, so
 * each of these also raises one fixed-message Sentry event, grouped per reason and
 * per Razorpay id. Scrubbed like the webhook route: no request body, headers, IP or
 * user. Tags are the reason and the Razorpay id only; no userId, amounts or errors.
 */
export function reportManualGrant(
  reason: string,
  ids: { razorpayOrderId: string } | { razorpaySubscriptionId: string },
  level: 'error' | 'warning' = 'error',
): void {
  const id = 'razorpayOrderId' in ids ? ids.razorpayOrderId : ids.razorpaySubscriptionId;
  Sentry.withScope((scope) => {
    scope.setSDKProcessingMetadata({ normalizedRequest: undefined, ipAddress: undefined });
    scope.addEventProcessor((event) => {
      delete event.request;
      delete event.user;
      return event;
    });
    scope.setFingerprint(['billing-manual-grant', reason, id]);
    scope.setTags({ reason, ...ids });
    Sentry.captureMessage(`Billing: ${reason}`, level);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns { inkSub, inkAnnualCarry, inkTopup, totalSpendable } for a user,
 * or null if the user is not found.
 */
export async function getInkBalance(userId: string): Promise<InkBalance | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

  // T-399: grant any yearly-plan months that have come due (and zero a plan
  // past its paid period) before reading. Best effort: never blocks the read.
  const db = mongoose.connection.db;
  if (db) {
    try {
      await settleYearlyDrip({ db, userId: new mongoose.Types.ObjectId(userId) });
    } catch (err) {
      logger.error(
        { userId, errName: err instanceof Error ? err.name : 'unknown' },
        'ink-ledger: settleYearlyDrip failed',
      );
    }
  }

  const user = await User.findById(new mongoose.Types.ObjectId(userId))
    .select('inkSub inkAnnualCarry inkTopup')
    .lean();

  if (!user) return null;

  const inkSub = (user.inkSub as number | undefined) ?? 0;
  const inkAnnualCarry = (user.inkAnnualCarry as number | undefined) ?? 0;
  const inkTopup = (user.inkTopup as number | undefined) ?? 0;

  return {
    inkSub,
    inkAnnualCarry,
    inkTopup,
    totalSpendable: inkSub + inkAnnualCarry + inkTopup,
  };
}

/**
 * Atomic ordered deduction using a MongoDB aggregation pipeline update.
 * A single findOneAndUpdate with $expr ensures concurrent calls can never
 * drive the balance below 0 (no overselling).
 *
 * Deduction order: inkSub first → inkAnnualCarry second → inkTopup third.
 *
 * Returns { success: true, ... } on success, or
 *         { success: false, reason: 'insufficient_ink' | 'user_not_found', ... }
 *
 * Writes one ledger row per bucket touched (skips buckets with delta 0).
 */
export async function deductInk(input: {
  userId: string;
  costUnits: number;
  reason: 'generate' | 'regenerate';
}): Promise<DeductResult> {
  const { userId, costUnits, reason } = input;

  const zero: DeductResult = { success: false, inkSub: 0, inkAnnualCarry: 0, inkTopup: 0 };

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { ...zero, reason: 'user_not_found' };
  }

  const oid = new mongoose.Types.ObjectId(userId);

  // Atomic aggregation-pipeline update.
  // The $expr filter ensures total balance >= costUnits before we touch anything.
  // Temp fields (_ds, _r1, _dc, _r2, _dt) capture per-bucket deduction amounts
  // so we can write ledger rows after the update.
  const result = await User.collection.findOneAndUpdate(
    {
      _id: oid,
      $expr: {
        $gte: [{ $add: ['$inkSub', '$inkAnnualCarry', '$inkTopup'] }, costUnits],
      },
    },
    [
      // Stage 1: how much to take from inkSub
      { $set: { _ds: { $min: ['$inkSub', costUnits] } } },
      // Stage 2: remainder after sub
      { $set: { _r1: { $subtract: [costUnits, '$_ds'] } } },
      { $set: { _dc: { $min: ['$inkAnnualCarry', '$_r1'] } } },
      // Stage 3: remainder after carry
      { $set: { _r2: { $subtract: ['$_r1', '$_dc'] } } },
      { $set: { _dt: { $min: ['$inkTopup', '$_r2'] } } },
      // Stage 4: apply deductions
      {
        $set: {
          inkSub: { $subtract: ['$inkSub', '$_ds'] },
          inkAnnualCarry: { $subtract: ['$inkAnnualCarry', '$_dc'] },
          inkTopup: { $subtract: ['$inkTopup', '$_dt'] },
        },
      },
    ],
    { returnDocument: 'after' },
  );

  if (!result) {
    // Either user not found or insufficient balance — distinguish by checking existence
    const exists = await User.exists({ _id: oid });
    return {
      ...zero,
      reason: exists ? 'insufficient_ink' : 'user_not_found',
    };
  }

  const doc = result as Record<string, number>;
  const newSub = doc.inkSub ?? 0;
  const newCarry = doc.inkAnnualCarry ?? 0;
  const newTopup = doc.inkTopup ?? 0;
  const totalAfter = newSub + newCarry + newTopup;

  // Per-bucket amounts deducted (temp fields left in the doc by the pipeline)
  const ds = doc._ds ?? 0; // from sub
  const dc = doc._dc ?? 0; // from annual carry
  const dt = doc._dt ?? 0; // from topup

  // Write one ledger row per bucket touched (skip zero-delta buckets)
  const ledgerPromises: Promise<void>[] = [];

  if (ds > 0) {
    ledgerPromises.push(
      writeInkLedgerRow({
        userId: oid,
        delta: -ds,
        reason,
        sourceBucket: 'sub',
        balanceAfter: totalAfter + dc + dt, // balance after this bucket deduction
        createdAt: new Date(),
      }),
    );
  }
  if (dc > 0) {
    ledgerPromises.push(
      writeInkLedgerRow({
        userId: oid,
        delta: -dc,
        reason,
        sourceBucket: 'annual_carry',
        balanceAfter: totalAfter + dt, // balance after sub + carry deductions
        createdAt: new Date(),
      }),
    );
  }
  if (dt > 0) {
    ledgerPromises.push(
      writeInkLedgerRow({
        userId: oid,
        delta: -dt,
        reason,
        sourceBucket: 'topup',
        balanceAfter: totalAfter,
        createdAt: new Date(),
      }),
    );
  }

  await Promise.all(ledgerPromises);

  // Clean up temp fields (fire-and-forget — don't await)
  User.collection
    .updateOne({ _id: oid }, { $unset: { _ds: '', _r1: '', _dc: '', _r2: '', _dt: '' } })
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        'ink-ledger: temp field cleanup failed',
      );
    });

  logger.info({ userId, costUnits, reason, newSub, newCarry, newTopup }, 'ink deducted');

  return { success: true, inkSub: newSub, inkAnnualCarry: newCarry, inkTopup: newTopup };
}

/**
 * Grant subscription ink on billing renewal.
 * - Resets inkSub to the new allotment.
 * - No carry on any plan, yearly included (T-433): unspent plan Ink expires.
 *   inkAnnualCarry is not written; an existing value is left as it is.
 * - Writes a ledger row.
 * Returns the new inkSub value.
 */
export async function grantSubscriptionInk(input: {
  userId: string;
  inkUnits: number;
  planTier: 'solo' | 'pro';
  billingCycle: 'monthly' | 'yearly';
  planRenewsAt?: Date;
  razorpaySubscriptionId?: string;
  amountInr?: number;
  /**
   * T-646 (Arjun final, 3b): the charge that won this cycle's claim. Stored as
   * metadata.razorpayPaymentId so a refund of THAT charge (and only it) can find this grant.
   */
  razorpayPaymentId?: string;
  /**
   * T-646 (Arjun, 3b g): the cycle key the claim used, so a lost-claim charge can find THIS
   * cycle's grant row: Razorpay paid_count, else current_start. metadata.paidCount /
   * metadata.periodStart.
   */
  paidCount?: number;
  periodStart?: Date;
}): Promise<number> {
  const {
    userId,
    inkUnits,
    planTier,
    billingCycle,
    planRenewsAt,
    razorpaySubscriptionId,
    amountInr,
    razorpayPaymentId,
    paidCount,
    periodStart,
  } = input;

  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
  const oid = new mongoose.Types.ObjectId(userId);

  // T-433: no carry. inkAnnualCarry is deliberately left out of $set so a grant
  // never creates or increases it, and never zeroes an existing balance.
  const $set: Record<string, unknown> = {
    inkSub: inkUnits,
    inkSubMonthlyAllotment: inkUnits,
    plan: 'pro' as const,
    planTier,
    billingCycle,
    ...(planRenewsAt ? { planRenewsAt } : {}),
  };

  const updated = await User.findByIdAndUpdate(oid, { $set }, { new: true }).lean();
  if (!updated) return 0;

  const newSub = (updated.inkSub as number | undefined) ?? inkUnits;
  const updatedCarry = (updated.inkAnnualCarry as number | undefined) ?? 0;
  const updatedTopup = (updated.inkTopup as number | undefined) ?? 0;
  const totalAfter = newSub + updatedCarry + updatedTopup;

  await writeInkLedgerRow({
    userId: oid,
    delta: inkUnits,
    reason: 'sub_renewal',
    sourceBucket: 'sub',
    balanceAfter: totalAfter,
    reference: `${planTier} ${billingCycle} renewal`,
    metadata: {
      razorpaySubscriptionId,
      amountInr,
      planTier,
      billingCycle,
      ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      ...(typeof paidCount === 'number' ? { paidCount } : {}),
      ...(periodStart ? { periodStart } : {}),
    },
    createdAt: new Date(),
  });

  logger.info(
    { userId, inkUnits, planTier, billingCycle, inkAnnualCarry: updatedCarry },
    'subscription ink granted',
  );

  return newSub;
}

/** T-413: the ledger row _id that is the claim for one Razorpay order's top-up grant. */
export function topupClaimId(razorpayOrderId: string): string {
  return `topup:${razorpayOrderId}`;
}

/**
 * T-415 (Arjun): a grant claim still `pending` after this long is presumed dead
 * (process crash, or an attempt that outlived Razorpay's timeout) and a retry may
 * re-claim it by CAS. Shared by the top-up and subscription claims.
 */
export const CLAIM_STALE_MS = 60_000;

/** T-415: one id per claim / re-claim, so only the attempt that owns the claim marks it. */
export function newClaimToken(): string {
  return randomUUID();
}

/** T-415: attempts at the mark-granted write before a manual-grant signal. */
export const MARK_GRANTED_ATTEMPTS = 3;

/**
 * T-415: run `fn`, retrying immediately (no sleep) when it throws, up to
 * MARK_GRANTED_ATTEMPTS calls in total; rethrows the last error. A resolved
 * result (including matchedCount 0) is returned as is, never retried.
 */
export async function retryOnThrow<R>(fn: () => Promise<R>): Promise<R> {
  let lastErr: unknown;
  for (let i = 0; i < MARK_GRANTED_ATTEMPTS; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * T-415: thrown when a retry finds a grant claim `pending` and younger than
 * CLAIM_STALE_MS. Another attempt owns it and may still fail, so the webhook
 * returns 500 and Razorpay retries later (then: granted -> no-op, or stale -> re-claim)
 * rather than a 200 that would end Razorpay's retries while the grant is unsettled.
 */
export class GrantClaimBusyError extends Error {
  constructor() {
    super('grant claim is pending in another attempt');
    this.name = 'GrantClaimBusyError';
  }
}

/**
 * Grant top-up ink. Increments inkTopup (non-expiring).
 *
 * T-413 (Arjun): claim first, then grant. The claim is the ledger row itself,
 * inserted BEFORE the $inc with the deterministic `_id` `topup:<razorpayOrderId>`.
 * `_id` is always unique in MongoDB, so this is a compare-and-set with no new
 * index: order.paid and payment.captured for the same order (and any Razorpay
 * retry) race on the same insert and exactly one wins. If the $inc throws, the
 * claim row is deleted and the error is rethrown, so the webhook returns 500 and
 * Razorpay's retry grants once. A failed claim insert (other than a duplicate) is
 * NOT swallowed: it throws, nothing was granted, and the retry grants.
 *
 * T-415 (Arjun): the claim row carries `state` ('pending' on claim, 'granted'
 * after the $inc), `claimedAt` and `claimToken`. A loser of the insert reads the row:
 * - no state (pre-T-415 row) or 'granted' -> no-op, returns 0;
 * - 'pending', claimedAt older than CLAIM_STALE_MS -> re-claim by CAS on the
 *   token and claimedAt it read (new token, new claimedAt); only the winner grants;
 * - 'pending' and fresh -> throws GrantClaimBusyError (route 500, Razorpay retries).
 * Rollback and the mark-granted step match on this attempt's token, so a slow
 * attempt never deletes or marks a claim another attempt has re-claimed.
 *
 * Returns the granted inkUnits, or 0 if nothing was granted (already granted,
 * invalid or unknown user, no order id). Callers gate per-order side effects
 * (coupon usage) on a non-zero return.
 */
export async function grantTopupInk(input: {
  userId: string;
  inkUnits: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  topupSkuId: string;
  amountInr: number;
}): Promise<number> {
  const { userId, inkUnits, razorpayOrderId, razorpayPaymentId, topupSkuId, amountInr } = input;

  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
  const oid = new mongoose.Types.ObjectId(userId);

  if (!razorpayOrderId) {
    // No key to claim on, so a grant could not be deduplicated.
    logger.error({ userId, topupSkuId }, 'ink-ledger: topup has no order id; not granted');
    reportManualGrant('topup-no-order-id', { razorpayOrderId: '' });
    return 0;
  }

  const db = mongoose.connection.db;
  if (!db) throw new Error('ink-ledger: database not connected');
  const ledger = db.collection<{ _id: string } & Record<string, unknown>>('inkledger');

  // Rows written before T-413 have an ObjectId _id; they still block a re-grant.
  const legacy = await ledger.findOne({
    _id: { $ne: topupClaimId(razorpayOrderId) },
    userId: oid,
    reference: razorpayOrderId,
    reason: 'topup_purchase',
  });
  if (legacy) {
    logger.warn({ userId, razorpayOrderId }, 'ink-ledger: duplicate topup grant skipped');
    return 0;
  }

  const claimId = topupClaimId(razorpayOrderId);
  const claimToken = newClaimToken();
  try {
    await ledger.insertOne({
      _id: claimId,
      userId: oid,
      delta: inkUnits,
      reason: 'topup_purchase',
      sourceBucket: 'topup',
      reference: razorpayOrderId,
      metadata: { razorpayPaymentId, amountInr, topupSkuId },
      state: 'pending',
      claimedAt: new Date(),
      claimToken,
      createdAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 11000) throw err;
    const existing = await ledger.findOne({ _id: claimId });
    // Gone between the insert and the read: a rollback just freed it. Retry later.
    if (!existing) throw new GrantClaimBusyError();
    if (existing.state !== 'pending') {
      // 'granted', or a T-413 row with no state: counts as granted.
      logger.warn({ userId, razorpayOrderId }, 'ink-ledger: duplicate topup grant skipped');
      return 0;
    }
    const claimedAt = existing.claimedAt as Date | undefined;
    const now = new Date();
    if (claimedAt instanceof Date && now.getTime() - claimedAt.getTime() <= CLAIM_STALE_MS) {
      logger.warn({ userId, razorpayOrderId }, 'ink-ledger: topup claim pending elsewhere; retry');
      throw new GrantClaimBusyError();
    }
    const reclaimed = await ledger.updateOne(
      { _id: claimId, state: 'pending', claimedAt, claimToken: existing.claimToken },
      { $set: { claimedAt: now, claimToken } },
    );
    if (reclaimed.matchedCount === 0) {
      // Another retry re-claimed it (or it was granted) between the read and the CAS.
      throw new GrantClaimBusyError();
    }
    logger.warn({ userId, razorpayOrderId }, 'ink-ledger: stale topup claim re-claimed');
  }

  const rollbackClaim = async (errName: string): Promise<void> => {
    try {
      // Only this attempt's claim; a re-claimer's claim is not ours to free.
      await ledger.deleteOne({ _id: claimId, state: 'pending', claimToken });
    } catch (rollbackErr) {
      logger.error(
        {
          userId,
          razorpayOrderId,
          errName,
          rollbackErrName: rollbackErr instanceof Error ? rollbackErr.name : 'unknown',
        },
        'ink-ledger: topup claim rollback failed; this order needs a manual grant',
      );
      reportManualGrant('topup-claim-rollback-failed', { razorpayOrderId });
    }
  };

  let updated;
  try {
    updated = await User.findByIdAndUpdate(
      oid,
      { $inc: { inkTopup: inkUnits } },
      { new: true },
    ).lean();
  } catch (err) {
    await rollbackClaim(err instanceof Error ? err.name : 'unknown');
    throw err;
  }
  if (!updated) {
    await rollbackClaim('UserNotFound');
    logger.warn({ userId, razorpayOrderId }, 'ink-ledger: topup for unknown user; not granted');
    reportManualGrant('topup-unknown-user', { razorpayOrderId });
    return 0;
  }

  const newSub = (updated.inkSub as number | undefined) ?? 0;
  const newCarry = (updated.inkAnnualCarry as number | undefined) ?? 0;
  const newTopup = (updated.inkTopup as number | undefined) ?? inkUnits;
  const totalAfter = newSub + newCarry + newTopup;

  // T-415: mark granted, only if this attempt still owns the claim.
  try {
    // A pending claim left behind would be re-claimed and granted again, so retry.
    const marked = await retryOnThrow(() =>
      ledger.updateOne(
        { _id: claimId, claimToken },
        { $set: { state: 'granted', grantedAt: new Date(), balanceAfter: totalAfter } },
      ),
    );
    if (marked.matchedCount === 0) {
      // This attempt was slower than CLAIM_STALE_MS and a retry re-claimed the order:
      // both may have granted. Needs a human check.
      logger.error(
        { userId, razorpayOrderId },
        'ink-ledger: topup claim was re-claimed during this grant; check for a double grant',
      );
      reportManualGrant('topup-grant-superseded', { razorpayOrderId });
    }
  } catch (err) {
    // The grant stood, but the claim is still pending: once stale, a retry could
    // re-claim and grant again. Ids and error class only.
    logger.error(
      { userId, razorpayOrderId, errName: err instanceof Error ? err.name : 'unknown' },
      'ink-ledger: topup granted but ledger balanceAfter update failed; claim left pending',
    );
    reportManualGrant('topup-mark-granted-failed', { razorpayOrderId });
  }

  logger.info({ userId, inkUnits, razorpayOrderId }, 'topup ink granted');

  return inkUnits;
}

/** T-540 round 2: a pending free-grant claim older than this may be re-claimed. */
export const COUPON_CLAIM_STALE_MS = 120_000;

/** T-540: the ledger key (and CouponUsage.orderId) of a user's n-th free grant of a coupon. */
export function couponGrantKey(couponId: string, userId: string, n: number): string {
  return `coupon:${couponId}:${userId}:${n}`;
}

export type CouponGrantResult =
  | { ok: true; inkUnits: number; ledgerKey: string; n: number }
  | { ok: false; reason: 'per_user_limit' | 'usage_limit' | 'user_not_found' };

/**
 * T-540 (Vikram's ruling, option a): grant top-up Ink for a ₹0 quote (a 100%
 * coupon) with no Razorpay order. Not a sale: reason 'coupon_grant' (never
 * 'topup_purchase', so top-up revenue is not inflated), no amountInr, no invoice.
 *
 * Counted atomically at the grant, with single-document compare-and-sets only
 * (no multi-document transaction):
 * 1. Per-user claim: n = this user's CouponUsage count + 1 (refused past
 *    maxUsesPerUser), then insert the ledger row with `_id`
 *    coupon:<couponId>:<userId>:<n>, state 'pending'. `_id` is unique, so two
 *    concurrent grants of the same n collide and exactly one wins.
 * 2. Global count: CouponCode.findOneAndUpdate({ _id, isActive, not expired,
 *    uses < maxUses }, { $inc: { uses: 1 } }). No match = the last use was taken.
 * 3. CouponUsage row, orderId = the ledger key.
 * 4. $inc inkTopup, then mark the claim 'granted'.
 * Any failure before the Ink lands undoes the earlier steps, so a lost race
 * grants nothing and counts nothing.
 *
 * Stale claims (T-540 round 2): a claim row still 'pending' after
 * COUPON_CLAIM_STALE_MS (a crashed attempt) is re-claimed by a CAS on the
 * claimedAt and claimToken read, with a new token; a fresh pending claim is a
 * lost race. No double grant is possible: a crash after the CouponUsage row was
 * written moves the count past this n, so only a crash before step 3 leaves a
 * claim that can collide. A crash between steps 2 and 3 leaves `uses` one high
 * after the re-claim (fails closed: the coupon runs out one use early).
 *
 * Logs carry couponCode, skuId and n only (never the userId or ledger key).
 */
export async function grantCouponInk(input: {
  userId: string;
  couponId: string;
  couponCode: string;
  maxUsesPerUser: number | null;
  skuId: string;
  inkUnits: number;
  listPaise: number;
  now?: Date;
}): Promise<CouponGrantResult> {
  const { userId, couponId, couponCode, maxUsesPerUser, skuId, inkUnits, listPaise } = input;
  const now = input.now ?? new Date();

  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(couponId)) {
    return { ok: false, reason: 'user_not_found' };
  }
  const userOid = new mongoose.Types.ObjectId(userId);
  const couponOid = new mongoose.Types.ObjectId(couponId);

  const db = mongoose.connection.db;
  if (!db) throw new Error('ink-ledger: database not connected');
  const ledger = db.collection<{ _id: string } & Record<string, unknown>>('inkledger');

  // 1. Per-user claim.
  const used = await CouponUsage.countDocuments({ couponId: couponOid, userId: userOid });
  const n = used + 1;
  if (maxUsesPerUser && n > maxUsesPerUser) return { ok: false, reason: 'per_user_limit' };

  const ledgerKey = couponGrantKey(couponId, userId, n);
  const claimToken = newClaimToken();
  try {
    await ledger.insertOne({
      _id: ledgerKey,
      userId: userOid,
      delta: inkUnits,
      reason: 'coupon_grant',
      sourceBucket: 'topup',
      reference: ledgerKey,
      metadata: { couponId, couponCode, skuId, listPaise, provider: 'coupon' },
      state: 'pending',
      claimedAt: now,
      claimToken,
      createdAt: now,
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 11000) throw err;
    // T-540 round 2: a claim left 'pending' by a crashed attempt is taken over
    // once stale (T-415's pattern): CAS on the claimedAt and token we read, so
    // only one re-claimer wins. Anything else is a lost race.
    const existing = await ledger.findOne({ _id: ledgerKey });
    const claimedAt = existing?.claimedAt as Date | undefined;
    const stale =
      existing?.state === 'pending' &&
      claimedAt instanceof Date &&
      now.getTime() - claimedAt.getTime() > COUPON_CLAIM_STALE_MS;
    if (!existing || !stale) {
      logger.warn({ couponCode, skuId, n }, 'ink-ledger: coupon grant lost the per-user claim');
      return { ok: false, reason: 'per_user_limit' };
    }
    const reclaimed = await ledger.updateOne(
      { _id: ledgerKey, state: 'pending', claimedAt, claimToken: existing.claimToken },
      { $set: { claimedAt: now, claimToken } },
    );
    if (reclaimed.matchedCount === 0) {
      logger.warn({ couponCode, skuId, n }, 'ink-ledger: coupon grant lost the stale re-claim');
      return { ok: false, reason: 'per_user_limit' };
    }
    logger.warn({ couponCode, skuId, n }, 'ink-ledger: stale coupon grant claim re-claimed');
  }

  let usesCounted = false;
  let usageWritten = false;
  const rollback = async (errName: string): Promise<void> => {
    try {
      if (usageWritten) await CouponUsage.deleteOne({ couponId: couponOid, orderId: ledgerKey });
      if (usesCounted) await CouponCode.updateOne({ _id: couponOid }, { $inc: { uses: -1 } });
      await ledger.deleteOne({ _id: ledgerKey, state: 'pending', claimToken });
    } catch (rollbackErr) {
      logger.error(
        {
          couponCode,
          skuId,
          n,
          errName,
          rollbackErrName: rollbackErr instanceof Error ? rollbackErr.name : 'unknown',
        },
        'ink-ledger: coupon grant rollback failed; check the coupon uses count and claim row',
      );
    }
  };

  // 2. Global count, compare-and-set on the coupon document.
  let counted;
  try {
    counted = await CouponCode.findOneAndUpdate(
      {
        _id: couponOid,
        isActive: true,
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
          { $or: [{ maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] },
        ],
      },
      { $inc: { uses: 1 } },
      { new: true },
    ).lean();
  } catch (err) {
    await rollback(err instanceof Error ? err.name : 'unknown');
    throw err;
  }
  if (!counted) {
    await rollback('CouponNoLongerAvailable');
    logger.warn({ couponCode, skuId }, 'ink-ledger: coupon grant lost the usage count');
    return { ok: false, reason: 'usage_limit' };
  }
  usesCounted = true;

  // 3. Usage row (the per-user count reads these).
  try {
    await CouponUsage.create({ couponId: couponOid, userId: userOid, orderId: ledgerKey });
    usageWritten = true;
  } catch (err) {
    await rollback(err instanceof Error ? err.name : 'unknown');
    throw err;
  }

  // 4. The Ink.
  let updated;
  try {
    updated = await User.findByIdAndUpdate(
      userOid,
      { $inc: { inkTopup: inkUnits } },
      { new: true },
    ).lean();
  } catch (err) {
    await rollback(err instanceof Error ? err.name : 'unknown');
    throw err;
  }
  if (!updated) {
    await rollback('UserNotFound');
    return { ok: false, reason: 'user_not_found' };
  }

  const totalAfter =
    ((updated.inkSub as number | undefined) ?? 0) +
    ((updated.inkAnnualCarry as number | undefined) ?? 0) +
    ((updated.inkTopup as number | undefined) ?? inkUnits);

  try {
    await retryOnThrow(() =>
      ledger.updateOne(
        { _id: ledgerKey, claimToken },
        { $set: { state: 'granted', grantedAt: new Date(), balanceAfter: totalAfter } },
      ),
    );
  } catch (err) {
    // The Ink stood; the claim stays 'pending', which still blocks this n.
    logger.error(
      { couponCode, skuId, n, errName: err instanceof Error ? err.name : 'unknown' },
      'ink-ledger: coupon grant done but the claim was not marked granted',
    );
  }

  return { ok: true, inkUnits, ledgerKey, n };
}

/**
 * Seed free ink on signup. 5 Ink = 10 units into inkTopup.
 * Idempotent: only seeds if all three ink buckets are 0 (first time).
 * Called by auth service on new user creation.
 */
export async function seedFreeInk(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  const oid = new mongoose.Types.ObjectId(userId);

  const updated = await User.findOneAndUpdate(
    {
      _id: oid,
      $expr: {
        $eq: [{ $add: ['$inkTopup', '$inkSub', '$inkAnnualCarry'] }, 0],
      },
    },
    {
      $set: {
        inkTopup: 10,
        inkSub: 0,
        inkAnnualCarry: 0,
        inkSubMonthlyAllotment: 0,
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    // Already seeded or user not found — both are fine
    return;
  }

  await writeInkLedgerRow({
    userId: oid,
    delta: 10,
    reason: 'free_seed',
    sourceBucket: 'topup',
    balanceAfter: 10,
    createdAt: new Date(),
  });

  logger.info({ userId }, 'free ink seeded (10 units = 5 Ink)');
}

/**
 * On subscription expiry (end of the paid period): zero out inkSub and
 * inkAnnualCarry. inkTopup survives untouched. T-399: NOT called on cancel; a
 * cancelled plan keeps its Ink (and yearly drip) until paidThrough.
 */
export async function cancelSubscriptionInk(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  const oid = new mongoose.Types.ObjectId(userId);

  const updated = await User.findByIdAndUpdate(
    oid,
    { $set: { inkSub: 0, inkAnnualCarry: 0 } },
    { new: true },
  ).lean();

  if (!updated) return;

  const newTopup = (updated.inkTopup as number | undefined) ?? 0;

  await writeInkLedgerRow({
    userId: oid,
    delta: 0,
    reason: 'sub_cancelled',
    sourceBucket: 'sub',
    balanceAfter: newTopup,
    createdAt: new Date(),
  });

  logger.info({ userId }, 'subscription ink cancelled (inkSub + inkAnnualCarry zeroed)');
}

// ── T-646: refund reversal (Vikram 5) ─────────────────────────────────────────

/** T-646: the inkledger reason for Ink taken back by a refund. Kept on account erase. */
export const REFUND_REVERSAL_REASON = 'refund_reversal';

/** T-646 (Vikram 5): the ledger row _id, and idempotency key, for one Razorpay refund. */
export function refundReversalId(refundId: string): string {
  return `refund:${refundId}`;
}

/** CAS attempts at the balance debit before the reversal gives up (and the webhook retries). */
export const REFUND_DEBIT_ATTEMPTS = 5;

type InkBucketField = 'inkSub' | 'inkAnnualCarry' | 'inkTopup';
const BUCKET_OF: Record<InkBucketField, InkLedgerRow['sourceBucket']> = {
  inkSub: 'sub',
  inkAnnualCarry: 'annual_carry',
  inkTopup: 'topup',
};

/** Thrown when the balance kept changing under the debit; the webhook returns 500 and retries. */
export class RefundDebitContendedError extends Error {
  constructor() {
    super('refund Ink debit lost every compare-and-set attempt');
    this.name = 'RefundDebitContendedError';
  }
}

export type RefundReversalResult =
  | { status: 'reversed'; dueUnits: number; debitedUnits: number; shortfallUnits: number }
  | { status: 'already_reversed' }
  | { status: 'stale_claim' }
  | { status: 'user_not_found' };

/**
 * T-646 (Vikram 5): take back `dueUnits` of Ink for one Razorpay refund, never
 * below zero. Idempotent on `refund:<refundId>` (the ledger row _id), on the
 * T-413 claim pattern:
 *
 * 1. Insert the claim row (state 'pending', delta 0). A duplicate means another
 *    attempt got here first: 'done' -> no-op; 'pending' and fresh -> throws
 *    GrantClaimBusyError (the webhook 500s and Razorpay retries); 'pending' and
 *    stale -> 'stale_claim' (the earlier attempt may or may not have debited, so
 *    nothing is debited again; the caller reports it for a manual check).
 * 2. Debit by compare-and-set on the three balances: the payment's own bucket
 *    first (`preferBucket`), then the others. Takes min(due, balance); the rest
 *    is the shortfall (spent Ink, Vikram 5).
 * 3. Mark the row 'done' with the signed delta, balance after and the figures.
 *
 * A failed debit deletes this attempt's claim and rethrows, so a retry reverses
 * once. Logs carry ids and numbers only.
 */
export async function reverseRefundInk(input: {
  userId: string;
  refundId: string;
  razorpayPaymentId: string;
  refundPaise: number;
  dueUnits: number;
  preferBucket: 'sub' | 'topup';
  /**
   * Arjun option B (round 3b): the inkledger row this refund reverses against, and the
   * payment that resolved to it. Written to metadata.grantLedgerId / metadata.grantPaymentId.
   */
  grant?: { ledgerId: string; paymentId: string };
  /**
   * Arjun review (condition 2): run AFTER this refund's claim row is inserted (so concurrent
   * refunds see each other's pending claims) and before the debit. Returns the most this
   * refund may still take; the claim's dueUnits is lowered to it. Concurrent refunds of one
   * grant can then only under-reverse, never over-reverse.
   */
  capAfterClaim?: (dueUnits: number) => Promise<number>;
}): Promise<RefundReversalResult> {
  const { userId, refundId, razorpayPaymentId, refundPaise, preferBucket } = input;
  const grantMeta = input.grant
    ? { grantLedgerId: input.grant.ledgerId, grantPaymentId: input.grant.paymentId }
    : {};
  let dueUnits = Math.max(0, Math.floor(input.dueUnits));
  if (!mongoose.Types.ObjectId.isValid(userId)) return { status: 'user_not_found' };
  const oid = new mongoose.Types.ObjectId(userId);

  const db = mongoose.connection.db;
  if (!db) throw new Error('ink-ledger: database not connected');
  const ledger = db.collection<{ _id: string } & Record<string, unknown>>('inkledger');

  const claimId = refundReversalId(refundId);
  const claimToken = newClaimToken();
  const order: InkBucketField[] =
    preferBucket === 'topup'
      ? ['inkTopup', 'inkSub', 'inkAnnualCarry']
      : ['inkSub', 'inkAnnualCarry', 'inkTopup'];

  try {
    await ledger.insertOne({
      _id: claimId,
      userId: oid,
      delta: 0,
      reason: REFUND_REVERSAL_REASON,
      sourceBucket: BUCKET_OF[order[0]],
      reference: razorpayPaymentId,
      metadata: { razorpayPaymentId, refundId, refundPaise, dueUnits, ...grantMeta },
      state: 'pending',
      claimedAt: new Date(),
      claimToken,
      createdAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 11000) throw err;
    const existing = await ledger.findOne({ _id: claimId });
    if (!existing) throw new GrantClaimBusyError();
    if (existing.state !== 'pending') return { status: 'already_reversed' };
    const claimedAt = existing.claimedAt as Date | undefined;
    if (claimedAt instanceof Date && Date.now() - claimedAt.getTime() <= CLAIM_STALE_MS) {
      logger.warn({ refundId }, 'ink-ledger: refund reversal pending elsewhere; retry');
      throw new GrantClaimBusyError();
    }
    logger.error({ refundId }, 'ink-ledger: stale refund reversal claim; needs a manual check');
    return { status: 'stale_claim' };
  }

  const rollbackClaim = async (errName: string): Promise<void> => {
    try {
      await ledger.deleteOne({ _id: claimId, state: 'pending', claimToken });
    } catch (rollbackErr) {
      logger.error(
        {
          refundId,
          errName,
          rollbackErrName: rollbackErr instanceof Error ? rollbackErr.name : 'unknown',
        },
        'ink-ledger: refund reversal claim rollback failed',
      );
    }
  };

  if (input.capAfterClaim) {
    try {
      const cap = Math.max(0, Math.floor(await input.capAfterClaim(dueUnits)));
      if (cap < dueUnits) {
        dueUnits = cap;
        await ledger.updateOne(
          { _id: claimId, claimToken, state: 'pending' },
          { $set: { 'metadata.dueUnits': dueUnits } },
        );
      }
    } catch (err) {
      await rollbackClaim(err instanceof Error ? err.name : 'unknown');
      throw err;
    }
  }

  let debited: Record<InkBucketField, number> = { inkSub: 0, inkAnnualCarry: 0, inkTopup: 0 };
  let totalAfter = 0;
  try {
    let done = false;
    for (let i = 0; i < REFUND_DEBIT_ATTEMPTS && !done; i += 1) {
      const user = await User.findById(oid).select('inkSub inkAnnualCarry inkTopup').lean();
      if (!user) {
        await rollbackClaim('UserNotFound');
        logger.warn({ refundId }, 'ink-ledger: refund reversal for unknown user; nothing debited');
        return { status: 'user_not_found' };
      }
      const before: Record<InkBucketField, number> = {
        inkSub: Math.max(0, (user.inkSub as number | undefined) ?? 0),
        inkAnnualCarry: Math.max(0, (user.inkAnnualCarry as number | undefined) ?? 0),
        inkTopup: Math.max(0, (user.inkTopup as number | undefined) ?? 0),
      };
      const take: Record<InkBucketField, number> = { inkSub: 0, inkAnnualCarry: 0, inkTopup: 0 };
      let left = dueUnits;
      for (const f of order) {
        take[f] = Math.min(before[f], left);
        left -= take[f];
      }
      const totalBefore = before.inkSub + before.inkAnnualCarry + before.inkTopup;
      const takenTotal = take.inkSub + take.inkAnnualCarry + take.inkTopup;
      if (takenTotal === 0) {
        debited = take;
        totalAfter = totalBefore;
        done = true;
        break;
      }
      const $inc: Record<string, number> = {};
      for (const f of order) if (take[f] > 0) $inc[f] = -take[f];
      // Compare-and-set: only if no balance moved since the read.
      const res = await User.collection.updateOne(
        {
          _id: oid,
          $expr: {
            $and: (['inkSub', 'inkAnnualCarry', 'inkTopup'] as InkBucketField[]).map((f) => ({
              $eq: [{ $ifNull: [`$${f}`, 0] }, (user[f] as number | undefined) ?? 0],
            })),
          },
        },
        { $inc },
      );
      if (res.modifiedCount === 1) {
        debited = take;
        totalAfter = totalBefore - takenTotal;
        done = true;
      }
    }
    if (!done) throw new RefundDebitContendedError();
  } catch (err) {
    await rollbackClaim(err instanceof Error ? err.name : 'unknown');
    throw err;
  }

  const debitedUnits = debited.inkSub + debited.inkAnnualCarry + debited.inkTopup;
  const shortfallUnits = dueUnits - debitedUnits;
  try {
    await retryOnThrow(() =>
      ledger.updateOne(
        { _id: claimId, claimToken },
        {
          $set: {
            state: 'done',
            delta: -debitedUnits,
            balanceAfter: totalAfter,
            doneAt: new Date(),
            metadata: {
              razorpayPaymentId,
              refundId,
              refundPaise,
              dueUnits,
              ...grantMeta,
              debitedUnits,
              shortfallUnits,
              buckets: {
                sub: debited.inkSub,
                annual_carry: debited.inkAnnualCarry,
                topup: debited.inkTopup,
              },
            },
          },
        },
      ),
    );
  } catch (err) {
    // The debit stood; the row stays 'pending' and a retry will see a stale claim, not debit again.
    logger.error(
      { refundId, debitedUnits, errName: err instanceof Error ? err.name : 'unknown' },
      'ink-ledger: refund reversal debited but ledger row not marked done',
    );
  }

  logger.info(
    { refundId, razorpayPaymentId, dueUnits, debitedUnits, shortfallUnits },
    'refund ink reversed',
  );
  return { status: 'reversed', dueUnits, debitedUnits, shortfallUnits };
}
