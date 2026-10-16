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
}): Promise<number> {
  const {
    userId,
    inkUnits,
    planTier,
    billingCycle,
    planRenewsAt,
    razorpaySubscriptionId,
    amountInr,
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
    metadata: { razorpaySubscriptionId, amountInr, planTier, billingCycle },
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
