/**
 * Auth-side credit-bonus helper.
 *
 * Drafting service owns the canonical credit accounting, but for **grants fired from auth
 * events** (signup, referral signup, the develop-only test account) we write directly to the
 * shared Mongo collections to avoid a cross-service round-trip on the sign-up path.
 *
 * SCRUM-101: grantSignupBonus seeds 5 Ink (10 units) into inkTopup.
 *
 * T-652 (Ajay AJ-646-M9b and AJ-646-M9c, 28 Oct 2026): every earnedCredits accrual is stopped.
 * The daily login bonus (+2, source `login_bonus`), the rating bonus (+1, `rating_bonus`, in
 * drafting) and the signup earnedCredits grant (+5, `signup_bonus`) are removed. Users were
 * never offered them, so the processing had no stated purpose (DPDP purpose limitation).
 * Signing in grants nothing and writes no creditledger row. The only signup effect left is the
 * advertised, spendable free Ink seed. Existing earnedCredits stay as they are: hidden,
 * unspendable, unmentioned. Any future bonus scheme's offer and terms go to Ajay first.
 */
import mongoose from 'mongoose';

import logger from '../config/logger';
import { User } from '../models/User.model';

/**
 * T-351 (Priya, on the founder's delegation, 12 Oct 2026): no free Ink until the address is
 * verified. Google sign-in counts as verified. This filter goes inside each bonus's atomic
 * findOneAndUpdate, so the eligibility check and the grant are one write: an unverified email
 * user matches nothing, gets nothing, and has no idempotency marker (signupBonusGrantedAt)
 * stamped. Calling grantSignupBonus again after T-223 sets emailVerified
 * then grants it exactly once (the signupBonusGrantedAt guard still applies).
 */
const VERIFIED_FOR_BONUS = {
  $or: [
    { authProvider: 'google' },
    { emailVerified: true },
    // T-351 (Priya, ruling A): a linked googleId counts as verified (pre-T-299 and linked accounts).
    { googleId: { $exists: true, $nin: [null, ''] } },
  ],
};

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
// T-522: fenced on VERIFIED_FOR_BONUS. An unverified user matches nothing and is credited 0;
// password sign-up therefore records the code only and verifyEmailToken grants on verification.
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
    // T-522 (Arjun ruling 2): and only for a Google or verified-email user, in the same atomic
    // filter, so no caller can grant referral Ink to an unverified address.
    {
      _id: new mongoose.Types.ObjectId(userId),
      referralInkGrantedAt: { $exists: false },
      ...VERIFIED_FOR_BONUS,
    },
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
 * Seed a newly-registered user's free Ink: 5 Ink (10 units) into inkTopup, plus one inkledger
 * row with reason 'free_seed'. T-652 (AJ-646-M9c): no earnedCredits, no creditledger row, no
 * drafting signal; the free Ink seed is the only effect.
 * T-351: grants nothing to an email user whose address is not verified yet; call again once
 * it is (T-223) and it grants then.
 * Idempotent — uses signupBonusGrantedAt as an atomic guard so retries,
 * double-taps, or supervisor restarts never seed the user twice.
 * Non-fatal — never throws.
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  const updated = await User.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(userId),
      $and: [
        { $or: [{ signupBonusGrantedAt: { $exists: false } }, { signupBonusGrantedAt: null }] },
        // T-351: Google or verified email only. An unverified call matches nothing and leaves
        // signupBonusGrantedAt unset, so a call after verification still grants (once).
        VERIFIED_FOR_BONUS,
      ],
    },
    // T-652 (AJ-646-M9c): only the once-only marker. No earnedCredits grant.
    { $set: { signupBonusGrantedAt: new Date() } },
    { new: true },
  ).lean();

  // null → already granted, unverified email user (T-351), or user not found. Skip the Ink seed.
  if (!updated) return;

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
}

/** T-563 — 30 Ink, stored at 2 units per Ink. */
export const TEST_GRANT_INK_UNITS = 60;
/** T-563 (AJ-563-M5) — internal ledger reason only; never shown to a user. */
export const TEST_GRANT_REASON = 'test_grant';

/**
 * T-563 (Arjun, default 5) — the test account's one Ink grant: +60 units (30 Ink) into
 * inkTopup and one inkledger row with reason 'test_grant'. Not the sign-up grant: no
 * creditledger row, no drafting grant-bonus signal, no referral. Once only: the atomic guard is
 * signupBonusGrantedAt (also set here, so the dashboard reads right and grantSignupBonus never
 * runs for this account), and only an isTestAccount user matches. Returns true when this call
 * granted. Non-fatal: never throws.
 */
export async function grantTestInk(userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;
  const conn = mongoose.connection;
  if (!conn.db) return false;
  const _id = new mongoose.Types.ObjectId(userId);
  try {
    const granted = await conn.db.collection('users').findOneAndUpdate(
      {
        _id,
        isTestAccount: true,
        $or: [{ signupBonusGrantedAt: { $exists: false } }, { signupBonusGrantedAt: null }],
      },
      [
        {
          $set: {
            inkTopup: { $add: [{ $ifNull: ['$inkTopup', 0] }, TEST_GRANT_INK_UNITS] },
            inkSub: { $ifNull: ['$inkSub', 0] },
            inkAnnualCarry: { $ifNull: ['$inkAnnualCarry', 0] },
            inkSubMonthlyAllotment: { $ifNull: ['$inkSubMonthlyAllotment', 0] },
            signupBonusGrantedAt: '$$NOW',
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (!granted) return false;
    await conn.db.collection('inkledger').insertOne({
      userId: _id,
      delta: TEST_GRANT_INK_UNITS,
      reason: TEST_GRANT_REASON,
      sourceBucket: 'topup',
      balanceAfter: granted['inkTopup'],
      createdAt: new Date(),
    });
    return true;
  } catch (err) {
    const errKind = err instanceof Error ? err.constructor.name : 'UnknownError';
    logger.warn({ userId, errKind }, 'Test account Ink grant failed');
    return false;
  }
}
