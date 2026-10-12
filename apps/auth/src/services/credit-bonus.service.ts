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
 *
 * SCRUM-101: grantSignupBonus also seeds 5 Ink (10 units) into inkTopup.
 */
import mongoose from 'mongoose';

import logger from '../config/logger';
import { User } from '../models/User.model';

export const DAILY_LOGIN_BONUS = 2;
// Free credits given to every new user on signup — change this to adjust the grant.
// Flipped 10 → 5 per founder direction 2026-05-26 (SCRUM-100). Second 5 unlocks
// after user submits a review (SCRUM-101).
export const SIGNUP_BONUS_CREDITS = 5;

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
 * Grant referral Ink to a newly-signed-up user.
 * Grants bonusInk × 2 ledger units into inkTopup (non-expiring).
 * Also sets freeTierBonusGrant = bonusInk × 5 for legacy enforceFreeLimit compat.
 * Returns ink units granted (0 on failure).
 *
 * T-298 (Arjun, ruling b): inkTopup is not in the auth User schema, and Mongoose strict mode
 * strips unknown paths from updates, so this writes through the raw `users` collection (like
 * the signup seed). balanceAfter comes from the document the update returns. Do NOT add
 * inkTopup to the auth schema (a default would break $exists guards elsewhere).
 * The once-per-user guard is the referredVia claim in applyReferralCode.
 *
 * T-299 (from T-234): the grant is also idempotent per user on its own. The $inc only matches a
 * user with no referralInkGrantedAt ($exists: false, Arjun), and the same update stamps referralInkGrantedAt and
 * referralInkCode, so the marker and the Ink land together or not at all. A retry credits
 * nothing (returns 0), and referralInkLanded() can tell, after a throw, whether this grant landed.
 * The marker sits on the user document, not in inkledger, because the ledger insert is a second
 * write that can fail on its own (swallowed below) after the $inc has landed.
 */
export async function grantReferralInk(
  userId: string,
  bonusInk: number,
  referralCode: string,
): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;

  const conn = mongoose.connection;
  if (!conn.db) return 0;

  const inkUnits = bonusInk * 2;
  const freeTierBonus = bonusInk * 5;

  const updated = await conn.db.collection('users').findOneAndUpdate(
    // T-299 (Arjun): no match means already granted (or no such user); credit nothing.
    { _id: new mongoose.Types.ObjectId(userId), referralInkGrantedAt: { $exists: false } },
    {
      $inc: { inkTopup: inkUnits },
      $set: {
        freeTierBonusGrant: freeTierBonus,
        referralInkGrantedAt: new Date(),
        referralInkCode: referralCode,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) return 0;

  try {
    await conn.db.collection('inkledger').insertOne({
      userId: new mongoose.Types.ObjectId(userId),
      delta: inkUnits,
      reason: 'referral_bonus',
      sourceBucket: 'topup',
      balanceAfter: updated['inkTopup'],
      reference: referralCode,
      metadata: { referralCode, bonusInk },
      createdAt: new Date(),
    });
  } catch {
    // T-299 (Arjun): best effort, logged without PII, never retried into a second $inc.
    // userId only: the error text can echo document values (T-210 no-PII rule).
    logger.warn({ userId }, 'Referral Ink ledger insert failed; Ink was credited');
  }

  return inkUnits;
}

/**
 * T-299 — true if grantReferralInk has credited this user for this code (the marker it sets in
 * the same update as the $inc is present). Used after a throw to tell a lost reply from a lost
 * write. Throws if the database cannot be read; the caller decides what that means.
 */
export async function referralInkLanded(userId: string, referralCode: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;
  const conn = mongoose.connection;
  if (!conn.db) return false;
  const row = await conn.db.collection('users').findOne(
    {
      _id: new mongoose.Types.ObjectId(userId),
      referralInkGrantedAt: { $exists: true },
      referralInkCode: referralCode,
    },
    { projection: { _id: 1 } },
  );
  return row !== null;
}

/**
 * Grant SIGNUP_BONUS_CREDITS to a newly-registered user.
 * Idempotent — uses signupBonusGrantedAt as an atomic guard so retries,
 * double-taps, or supervisor restarts never credit the user twice.
 * Non-fatal — never throws.
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  const updated = await User.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(userId),
      $or: [{ signupBonusGrantedAt: { $exists: false } }, { signupBonusGrantedAt: null }],
    },
    {
      $inc: { earnedCredits: SIGNUP_BONUS_CREDITS },
      $set: { signupBonusGrantedAt: new Date() },
    },
    { new: true },
  ).lean();

  // null → already granted (or user not found). Skip ledger + drafting signal.
  if (!updated) return;

  await writeLedgerRow({
    userId,
    source: 'signup_bonus',
    bucket: 'earnedCredits',
    amount: SIGNUP_BONUS_CREDITS,
    balanceAfter: updated.earnedCredits ?? SIGNUP_BONUS_CREDITS,
    reference: `Signup bonus (${SIGNUP_BONUS_CREDITS} free drafts)`,
  });

  // Seed 5 Ink (10 units) into inkTopup — one-time free tier (SCRUM-101).
  // T-298 (Arjun, ruling c): order-independent with the referral grant, which may already have
  // created inkTopup. The once-only guard is signupBonusGrantedAt above (we only get here on
  // the winning call), so this always adds 10 and only fills the other ink fields if absent.
  // Pipeline update = one atomic write. balanceAfter comes from the returned document.
  const conn = mongoose.connection;
  if (conn.db) {
    try {
      const inkSeeded = await conn.db.collection('users').findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(userId) },
        [
          {
            $set: {
              inkTopup: { $add: [{ $ifNull: ['$inkTopup', 0] }, 10] },
              inkSub: { $ifNull: ['$inkSub', 0] },
              inkAnnualCarry: { $ifNull: ['$inkAnnualCarry', 0] },
              inkSubMonthlyAllotment: { $ifNull: ['$inkSubMonthlyAllotment', 0] },
            },
          },
        ],
        { returnDocument: 'after' },
      );
      if (inkSeeded) {
        await conn.db.collection('inkledger').insertOne({
          userId: new mongoose.Types.ObjectId(userId),
          delta: 10,
          reason: 'free_seed',
          sourceBucket: 'topup',
          balanceAfter: inkSeeded['inkTopup'],
          createdAt: new Date(),
        });
      }
    } catch (err) {
      console.warn('[auth] ink seed failed:', err instanceof Error ? err.message : err);
    }
  }

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
