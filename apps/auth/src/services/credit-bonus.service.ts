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
// Free credits given to every new user on signup — change this to adjust the grant.
export const SIGNUP_BONUS_CREDITS = 10;

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
      $or: [
        { lastLoginBonusAt: { $exists: false } },
        { lastLoginBonusAt: null },
        { lastLoginBonusAt: { $lt: startOfToday } },
      ],
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
export async function grantReferralSignupBonus(
  userId: string,
  referralCode: string,
): Promise<number> {
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

/**
 * Grant SIGNUP_BONUS_CREDITS to a newly-registered user.
 * Writes to User.earnedCredits (billing display) + signals drafting's
 * BonusCredit collection so enforceFreeLimit can consume them.
 * Non-fatal — never throws.
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  const updated = await User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(userId),
    { $inc: { earnedCredits: SIGNUP_BONUS_CREDITS } },
    { new: true },
  ).lean();
  if (!updated) return;

  await writeLedgerRow({
    userId,
    source: 'signup_bonus',
    bucket: 'earnedCredits',
    amount: SIGNUP_BONUS_CREDITS,
    balanceAfter: updated.earnedCredits ?? SIGNUP_BONUS_CREDITS,
    reference: `Signup bonus (${SIGNUP_BONUS_CREDITS} free drafts)`,
  });

  // Signal drafting service so enforceFreeLimit can consume these as bonus drafts.
  const draftingUrl = process.env.DRAFTING_SERVICE_URL ?? 'http://localhost:4002';
  try {
    await fetch(`${draftingUrl}/internal/grant-bonus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
      },
      body: JSON.stringify({ userId, bonus: SIGNUP_BONUS_CREDITS }),
    });
  } catch {
    console.warn(`[auth] failed to signal drafting signup bonus for user ${userId}`);
  }
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
