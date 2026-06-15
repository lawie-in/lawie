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
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'ink-ledger: ledger insert failed',
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns { inkSub, inkAnnualCarry, inkTopup, totalSpendable } for a user,
 * or null if the user is not found.
 */
export async function getInkBalance(userId: string): Promise<InkBalance | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

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
 * - For annual plans: carries 50% of remaining inkSub into inkAnnualCarry,
 *   capped at 2× the new monthly allotment.
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

  // Read current balances for carry calc
  const current = await User.findById(oid).select('inkSub inkAnnualCarry').lean();
  if (!current) return 0;

  const currentInkSub = (current.inkSub as number | undefined) ?? 0;
  const currentAnnualCarry = (current.inkAnnualCarry as number | undefined) ?? 0;

  // Carry logic (annual plans only)
  let newAnnualCarry = currentAnnualCarry;
  if (billingCycle === 'yearly') {
    const carry = Math.floor(currentInkSub * 0.5); // 50% of remaining sub
    const cap = inkUnits * 2; // 2× new monthly allotment
    newAnnualCarry = Math.min(currentAnnualCarry + carry, cap);
  }

  const $set: Record<string, unknown> = {
    inkSub: inkUnits,
    inkSubMonthlyAllotment: inkUnits,
    inkAnnualCarry: newAnnualCarry,
    plan: 'pro' as const,
    planTier,
    billingCycle,
    ...(planRenewsAt ? { planRenewsAt } : {}),
  };

  const updated = await User.findByIdAndUpdate(oid, { $set }, { new: true }).lean();
  if (!updated) return 0;

  const newSub = (updated.inkSub as number | undefined) ?? inkUnits;
  const updatedCarry = (updated.inkAnnualCarry as number | undefined) ?? newAnnualCarry;
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
    { userId, inkUnits, planTier, billingCycle, newAnnualCarry },
    'subscription ink granted',
  );

  return newSub;
}

/**
 * Grant top-up ink. Increments inkTopup (non-expiring).
 * Idempotent on razorpayOrderId — skips if a ledger row with the same
 * reference already exists.
 * Writes a ledger row and returns the granted inkUnits (or 0 if skipped).
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

  // Idempotency check — if a ledger row for this order already exists, skip
  const conn = mongoose.connection;
  if (conn.db) {
    const existing = await conn.db
      .collection('inkledger')
      .findOne({ userId: oid, reference: razorpayOrderId, reason: 'topup_purchase' });
    if (existing) {
      logger.warn({ userId, razorpayOrderId }, 'ink-ledger: duplicate topup grant skipped');
      return 0;
    }
  }

  const updated = await User.findByIdAndUpdate(
    oid,
    { $inc: { inkTopup: inkUnits } },
    { new: true },
  ).lean();
  if (!updated) return 0;

  const newSub = (updated.inkSub as number | undefined) ?? 0;
  const newCarry = (updated.inkAnnualCarry as number | undefined) ?? 0;
  const newTopup = (updated.inkTopup as number | undefined) ?? inkUnits;
  const totalAfter = newSub + newCarry + newTopup;

  await writeInkLedgerRow({
    userId: oid,
    delta: inkUnits,
    reason: 'topup_purchase',
    sourceBucket: 'topup',
    balanceAfter: totalAfter,
    reference: razorpayOrderId,
    metadata: { razorpayPaymentId, amountInr, topupSkuId },
    createdAt: new Date(),
  });

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
 * On subscription cancellation: zero out inkSub and inkAnnualCarry.
 * inkTopup survives untouched.
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
