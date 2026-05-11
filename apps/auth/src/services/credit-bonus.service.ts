/**
 * Auth-side credit-bonus helper.
 *
 * Drafting service owns the canonical credit accounting (CreditLedger collection,
 * spend/grant logic), but for **bonuses fired from auth events** (daily login,
 * referral signup) we write directly to the shared Mongo collections to avoid a
 * cross-service round-trip on the login hot path.
 *
 * The CreditLedger schema is duplicated here only to the extent of what we INSERT
 * — we do NOT register a Mongoose model for it (drafting will register the
 * canonical one). We just use `mongoose.connection.collection('creditledgers')`
 * directly.
 */
import mongoose from 'mongoose';

import { User } from '../models/User.model';

export const DAILY_LOGIN_BONUS = 2;
export const REFERRAL_SIGNUP_BONUS = 25;

/**
 * Grant the daily login bonus if the user hasn't received it today.
 * Returns the amount granted (0 if already claimed today).
 */
export async function tryGrantDailyLoginBonus(userId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Atomic guard — only one of two simultaneous logins grants.
  const updated = await User.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(userId),
      $or: [{ lastLoginBonusAt: { $exists: false } }, { lastLoginBonusAt: null }, { lastLoginBonusAt: { $lt: startOfToday } }],
    },
    {
      $inc: { earnedCredits: DAILY_LOGIN_BONUS },
      $set: { lastLoginBonusAt: new Date() },
    },
    { new: true },
  ).lean();

  if (!updated) return 0;

  await writeLedgerRow({
    userId,
    source: 'login_bonus',
    bucket: 'earnedCredits',
    amount: DAILY_LOGIN_BONUS,
    balanceAfter: updated.earnedCredits ?? DAILY_LOGIN_BONUS,
    reference: 'Daily login bonus',
  });

  return DAILY_LOGIN_BONUS;
}

/**
 * Grant the referral signup bonus to a freshly-created user.
 * Returns the amount granted (always REFERRAL_SIGNUP_BONUS or 0 on failure).
 */
export async function grantReferralSignupBonus(userId: string, referralCode: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;

  const updated = await User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(userId),
    { $inc: { earnedCredits: REFERRAL_SIGNUP_BONUS } },
    { new: true },
  ).lean();
  if (!updated) return 0;

  await writeLedgerRow({
    userId,
    source: 'signup_bonus',
    bucket: 'earnedCredits',
    amount: REFERRAL_SIGNUP_BONUS,
    balanceAfter: updated.earnedCredits ?? REFERRAL_SIGNUP_BONUS,
    reference: `Referral signup (${referralCode})`,
    metadata: { referralCode },
  });

  return REFERRAL_SIGNUP_BONUS;
}

// ── Internal — minimal ledger insert ────────────────────────────────────────

async function writeLedgerRow(row: {
  userId: string;
  source: string;
  bucket: string;
  amount: number;
  balanceAfter: number;
  reference?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const conn = mongoose.connection;
  if (!conn.db) return; // not connected — bonus accounting silently degraded
  try {
    await conn.db.collection('creditledgers').insertOne({
      userId: new mongoose.Types.ObjectId(row.userId),
      source: row.source,
      bucket: row.bucket,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      reference: row.reference,
      metadata: row.metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    // Never break a login due to ledger insert failure. We'll surface this
    // via Sentry once that's wired into auth.
    console.warn(
      '[auth] credit-bonus ledger insert failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
