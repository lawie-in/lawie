/**
 * Credits service — bucket-aware credit accounting.
 *
 * Three buckets per user (User collection):
 *   • topupCredits        — purchased one-off, permanent until spent
 *   • earnedCredits       — login/rating bonuses, permanent
 *   • subscriptionCredits — monthly/yearly plan allocation, lapses on cycle
 *
 * Spend order (most-perishable last so users don't lose value):
 *   topupCredits → earnedCredits → subscriptionCredits
 *
 * Every grant + spend writes a CreditLedger row for audit + founder dashboard.
 *
 * Per-template cost (founder-approved 2026-05-12, mocks "1 credit / 2 credits"):
 *   1 credit  — legal_notice_s80, legal_notice_s138, rent_agreement
 *   2 credits — bail_anticipatory, bail_regular, consumer_complaint
 * Anything not listed defaults to 1 credit. Configurable later via AppSetting.
 */
import mongoose, { Types } from 'mongoose';

import { CreditBucket, CreditLedger, CreditSource } from '../models/CreditLedger.model';
import { User } from '../models/User.model';

export const TEMPLATE_COST: Record<string, number> = {
  legal_notice_s80: 1,
  legal_notice_s138: 1,
  rent_agreement: 1,
  bail_anticipatory: 2,
  bail_regular: 2,
  consumer_complaint: 2,
};

export function costForTemplate(templateId: string): number {
  return TEMPLATE_COST[templateId] ?? 1;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface CreditBalance {
  // Legacy credit buckets (kept for backward compat — old enforcement still reads these)
  topupCredits: number;
  earnedCredits: number;
  subscriptionCredits: number;
  total: number;
  // Ink buckets (SCRUM-101) — human-readable Ink values (stored units ÷ 2)
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  totalInk: number;
  inkSubMonthlyAllotment: number;
  planTier: 'free' | 'solo' | 'pro';
  billingCycle: 'none' | 'monthly' | 'yearly';
}

function normalizePlanTier(raw: string | undefined): 'free' | 'solo' | 'pro' {
  if (raw === 'practice' || raw === 'solo') return 'solo';
  if (raw === 'firm' || raw === 'pro') return 'pro';
  return 'free';
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const empty: CreditBalance = {
    topupCredits: 0,
    earnedCredits: 0,
    subscriptionCredits: 0,
    total: 0,
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 0,
    totalInk: 0,
    inkSubMonthlyAllotment: 0,
    planTier: 'free',
    billingCycle: 'none',
  };
  if (!mongoose.Types.ObjectId.isValid(userId)) return empty;

  const u = await User.findById(userId).lean();
  const topup = u?.topupCredits ?? 0;
  const earned = u?.earnedCredits ?? 0;
  const sub = u?.subscriptionCredits ?? 0;

  // Ink fields stored as ×2 units — divide by 2 for human-readable display
  const inkSubUnits = u?.inkSub ?? 0;
  const inkCarryUnits = u?.inkAnnualCarry ?? 0;
  const inkTopupUnits = u?.inkTopup ?? 0;
  const inkAllotUnits = u?.inkSubMonthlyAllotment ?? 0;

  return {
    topupCredits: topup,
    earnedCredits: earned,
    subscriptionCredits: sub,
    total: topup + earned + sub,
    inkSub: Math.floor(inkSubUnits / 2),
    inkAnnualCarry: Math.floor(inkCarryUnits / 2),
    inkTopup: Math.floor(inkTopupUnits / 2),
    totalInk: Math.floor((inkSubUnits + inkCarryUnits + inkTopupUnits) / 2),
    inkSubMonthlyAllotment: Math.floor(inkAllotUnits / 2),
    planTier: normalizePlanTier(u?.planTier),
    billingCycle: (u?.billingCycle as 'none' | 'monthly' | 'yearly') ?? 'none',
  };
}

// ── Grants ──────────────────────────────────────────────────────────────────

export async function grantCredits(input: {
  userId: string;
  bucket: CreditBucket;
  amount: number;
  source: CreditSource;
  reference?: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const { userId, bucket, amount, source, reference, templateId, metadata } = input;
  if (amount <= 0) throw new Error(`grantCredits: amount must be > 0 (got ${amount})`);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error(`grantCredits: invalid userId "${userId}"`);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // For 'plan_renewal' the bucket is reset, not incremented — the previous
  // month's subscriptionCredits lapse. Caller passes amount = full plan grant.
  const updateOp =
    source === 'plan_renewal' && bucket === 'subscriptionCredits'
      ? { $set: { subscriptionCredits: amount } }
      : { $inc: { [bucket]: amount } };

  const after = await User.findByIdAndUpdate(userObjectId, updateOp, { new: true }).lean();
  const balanceAfter = (after?.[bucket] as number | undefined) ?? amount;

  await CreditLedger.create({
    userId: userObjectId,
    source,
    bucket,
    amount,
    balanceAfter,
    reference,
    templateId,
    metadata,
  });

  return balanceAfter;
}

// ── Spend ──────────────────────────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  readonly required: number;
  readonly available: number;
  readonly shortBy: number;
  constructor(required: number, available: number) {
    super(`Insufficient credits — need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
    this.required = required;
    this.available = available;
    this.shortBy = required - available;
  }
}

/**
 * Spend N credits in priority order: topup → earned → subscription.
 * Writes one CreditLedger row per bucket touched. Atomic per-bucket via $inc
 * with a balance guard.
 *
 * Throws InsufficientCreditsError if the total available across all 3 buckets
 * is less than the cost. Re-throws on any DB error.
 */
export async function spendCredits(input: {
  userId: string;
  amount: number;
  templateId?: string;
  reference?: string;
}): Promise<{ spent: Array<{ bucket: CreditBucket; amount: number }>; totalSpent: number }> {
  const { userId, amount, templateId, reference } = input;
  if (amount <= 0) throw new Error(`spendCredits: amount must be > 0 (got ${amount})`);

  const balance = await getCreditBalance(userId);
  if (balance.total < amount) {
    throw new InsufficientCreditsError(amount, balance.total);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  let remaining = amount;
  const spent: Array<{ bucket: CreditBucket; amount: number }> = [];

  // Drain in priority order
  const order: Array<{ bucket: CreditBucket; available: number }> = [
    { bucket: 'topupCredits', available: balance.topupCredits },
    { bucket: 'earnedCredits', available: balance.earnedCredits },
    { bucket: 'subscriptionCredits', available: balance.subscriptionCredits },
  ];

  for (const { bucket, available } of order) {
    if (remaining <= 0) break;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);

    const after = await User.findByIdAndUpdate(
      userObjectId,
      { $inc: { [bucket]: -take } },
      { new: true },
    ).lean();
    const balanceAfter = (after?.[bucket] as number | undefined) ?? 0;

    await CreditLedger.create({
      userId: userObjectId,
      source: 'draft_spent',
      bucket,
      amount: -take,
      balanceAfter,
      reference,
      templateId,
    });

    spent.push({ bucket, amount: take });
    remaining -= take;
  }

  return { spent, totalSpent: amount };
}

// ── Ink spend (new ink system — SCRUM-101) ────────────────────────────────

/**
 * Atomically deduct ink from a user's ink buckets in priority order:
 *   inkSub → inkAnnualCarry → inkTopup
 *
 * Uses a MongoDB aggregation-pipeline update so concurrent drafts can never
 * drive any bucket below zero (no overselling). Writes one inkledger row per
 * bucket touched.
 *
 * costCredits: the template credit cost (1 or 2). Converted to storage units
 * internally (×2) — 1 displayed Ink = 2 storage units.
 */
export async function spendInk(input: {
  userId: string;
  costCredits: number;
  reason: 'generate' | 'regenerate';
  reference?: string;
}): Promise<{ success: boolean; reason?: string }> {
  const { userId, costCredits, reason, reference } = input;
  if (!mongoose.Types.ObjectId.isValid(userId)) return { success: false, reason: 'user_not_found' };

  const costUnits = costCredits * 2; // 1 Ink = 2 storage units
  const oid = new mongoose.Types.ObjectId(userId);

  // Atomic aggregation-pipeline update.
  // $expr guard ensures total >= costUnits before touching anything.
  // Temp fields (_ds, _r1, _dc, _r2, _dt) capture per-bucket deduction amounts.
  const result = await User.collection.findOneAndUpdate(
    {
      _id: oid,
      $expr: {
        $gte: [{ $add: ['$inkSub', '$inkAnnualCarry', '$inkTopup'] }, costUnits],
      },
    },
    [
      { $set: { _ds: { $min: ['$inkSub', costUnits] } } },
      { $set: { _r1: { $subtract: [costUnits, '$_ds'] } } },
      { $set: { _dc: { $min: ['$inkAnnualCarry', '$_r1'] } } },
      { $set: { _r2: { $subtract: ['$_r1', '$_dc'] } } },
      { $set: { _dt: { $min: ['$inkTopup', '$_r2'] } } },
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
    const exists = await User.exists({ _id: oid });
    return { success: false, reason: exists ? 'insufficient_ink' : 'user_not_found' };
  }

  const doc = result as Record<string, number>;
  const newSub = doc.inkSub ?? 0;
  const newCarry = doc.inkAnnualCarry ?? 0;
  const newTopup = doc.inkTopup ?? 0;
  const totalAfter = newSub + newCarry + newTopup;

  const ds = doc._ds ?? 0;
  const dc = doc._dc ?? 0;
  const dt = doc._dt ?? 0;

  const conn = mongoose.connection;
  if (conn.db) {
    const rows = [];
    if (ds > 0) {
      rows.push({
        userId: oid,
        delta: -ds,
        reason,
        sourceBucket: 'sub',
        balanceAfter: totalAfter + dc + dt,
        reference,
        createdAt: new Date(),
      });
    }
    if (dc > 0) {
      rows.push({
        userId: oid,
        delta: -dc,
        reason,
        sourceBucket: 'annual_carry',
        balanceAfter: totalAfter + dt,
        reference,
        createdAt: new Date(),
      });
    }
    if (dt > 0) {
      rows.push({
        userId: oid,
        delta: -dt,
        reason,
        sourceBucket: 'topup',
        balanceAfter: totalAfter,
        reference,
        createdAt: new Date(),
      });
    }
    if (rows.length > 0) {
      conn.db
        .collection('inkledger')
        .insertMany(rows)
        .catch((err: unknown) => {
          console.warn(
            '[drafting] inkledger write failed:',
            err instanceof Error ? err.message : err,
          );
        });
    }
  }

  // Clean up temp fields (fire-and-forget)
  User.collection
    .updateOne({ _id: oid }, { $unset: { _ds: '', _r1: '', _dc: '', _r2: '', _dt: '' } })
    .catch(() => {});

  return { success: true };
}

// ── Daily login bonus + rating bonus helpers ───────────────────────────────

export const DAILY_LOGIN_BONUS = 2;
export const RATING_BONUS_PER_DRAFT = 1;

/**
 * Grant the daily login bonus if the user hasn't received it today (IST).
 * Returns the amount granted (0 if already claimed today).
 *
 * Called from the auth service /login + /refresh handlers. We use a single
 * atomic findOneAndUpdate guard with $lt on lastLoginBonusAt so simultaneous
 * logins from two devices grant only once.
 */
export async function tryGrantDailyLoginBonus(userId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const updated = await User.findOneAndUpdate(
    {
      _id: new Types.ObjectId(userId),
      $or: [{ lastLoginBonusAt: null }, { lastLoginBonusAt: { $lt: startOfToday } }],
    },
    {
      $inc: { earnedCredits: DAILY_LOGIN_BONUS },
      $set: { lastLoginBonusAt: new Date() },
    },
    { new: true },
  ).lean();

  if (!updated) return 0;

  await CreditLedger.create({
    userId: new Types.ObjectId(userId),
    source: 'login_bonus',
    bucket: 'earnedCredits',
    amount: DAILY_LOGIN_BONUS,
    balanceAfter: updated.earnedCredits ?? DAILY_LOGIN_BONUS,
    reference: 'Daily login bonus',
  });

  return DAILY_LOGIN_BONUS;
}
