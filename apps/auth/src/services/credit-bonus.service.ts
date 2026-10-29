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

/**
 * T-351 (Priya, on the founder's delegation, 12 Oct 2026): no free Ink until the address is
 * verified. Google sign-in counts as verified. This filter goes inside each bonus's atomic
 * findOneAndUpdate, so the eligibility check and the grant are one write: an unverified email
 * user matches nothing, gets nothing, and has no idempotency marker (signupBonusGrantedAt)
 * stamped. Calling grantSignupBonus again after T-223 sets emailVerified
 * then grants it exactly once (the signupBonusGrantedAt guard still applies).
 */
export const VERIFIED_FOR_BONUS = {
  $or: [
    { authProvider: 'google' },
    { emailVerified: true },
    // T-351 (Priya, ruling A): a linked googleId counts as verified (pre-T-299 and linked accounts).
    { googleId: { $exists: true, $nin: [null, ''] } },
  ],
};

/** SCRUM-101 / T-657 — the free seed: 5 Ink, stored at 2 units per Ink. */
export const FREE_SEED_UNITS = 10;

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
 *
 * T-657 (Priya/Arjun/Ajay): the once-only marker and the Ink land in ONE atomic write.
 *  (a) One raw `users` pipeline findOneAndUpdate (like grantTestInk). Its filter is the guard:
 *      marker absent or null AND VERIFIED_FOR_BONUS. Its $set adds 10 units to inkTopup and
 *      stamps signupBonusGrantedAt and freeSeedAt ('$$NOW') together. Two parallel calls give
 *      exactly one +10: the loser matches nothing.
 *  (b) Then the inkledger row, keyed on the user (`_id: 'free_seed:<userId>'`), so it is written
 *      at most once; a duplicate key (E11000) counts as written.
 *  (c) Heal: if (a) matched nothing but the user has freeSeedAt (marked by THIS code, so the Ink
 *      did land) and the row is missing, (b) is retried. A marker set by older code (no
 *      freeSeedAt) is never healed here; the T-657 backfill script covers those.
 * Invariant: a marker set here means inkTopup was incremented. A failure in (a) writes nothing
 * and the next call retries; a failure in (b) is healed by the next call. Never marked without
 * the Ink.
 * freeSeedAt is raw-only (not in the Mongoose schema), like inkTopup.
 * Non-fatal — never throws. Logs carry userId and the error name only (no message, T-210).
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  const conn = mongoose.connection;
  if (!conn.db) return;
  const _id = new mongoose.Types.ObjectId(userId);
  const users = conn.db.collection('users');

  const seeded = await users
    .findOneAndUpdate(
      {
        _id,
        $and: [
          { $or: [{ signupBonusGrantedAt: { $exists: false } }, { signupBonusGrantedAt: null }] },
          // T-351: Google or verified email only. An unverified call matches nothing and leaves
          // signupBonusGrantedAt unset, so a call after verification still grants (once).
          VERIFIED_FOR_BONUS,
        ],
      },
      [
        {
          $set: {
            // T-298 (Arjun, ruling c): order-independent with the referral grant, which may
            // already have created inkTopup ($inc). So always $add 10, never $set 10, and only
            // fill the other ink fields if absent. The once-only guard is this same update's
            // filter (the marker), so only the winning call adds the 10.
            inkTopup: { $add: [{ $ifNull: ['$inkTopup', 0] }, FREE_SEED_UNITS] },
            inkSub: { $ifNull: ['$inkSub', 0] },
            inkAnnualCarry: { $ifNull: ['$inkAnnualCarry', 0] },
            inkSubMonthlyAllotment: { $ifNull: ['$inkSubMonthlyAllotment', 0] },
            signupBonusGrantedAt: '$$NOW',
            freeSeedAt: '$$NOW',
          },
        },
      ],
      { returnDocument: 'after' },
    )
    .catch((err: unknown) => {
      // Nothing was written (one atomic update); the next call retries.
      logger.warn({ userId, errName: errNameOf(err) }, 'Free Ink seed failed; nothing written');
      return undefined;
    });
  // undefined: the update threw (logged); null: it matched nothing.
  if (seeded === undefined) return;

  if (seeded) {
    await insertFreeSeedRow(userId, _id, seeded['inkTopup']);
    return;
  }

  // null → already granted, unverified email user (T-351), or user not found. Heal only a user
  // this code marked (freeSeedAt) whose ledger row is missing.
  try {
    const marked = await users.findOne(
      { _id, freeSeedAt: { $exists: true } },
      { projection: { _id: 1, inkTopup: 1 } },
    );
    if (!marked) return;
    const hasRow = await conn.db
      .collection<StringIdRow>('inkledger')
      .findOne({ _id: freeSeedLedgerId(userId) }, { projection: { _id: 1 } });
    if (hasRow) return;
    // balanceAfter here is approximate: the current inkTopup, which may have moved since the
    // seed (spends, referral Ink, top-ups).
    await insertFreeSeedRow(userId, _id, marked['inkTopup']);
  } catch (err) {
    logger.warn({ userId, errName: errNameOf(err) }, 'Free Ink seed ledger heal failed');
  }
}

/** T-657 — an inkledger row keyed by a string _id (the free_seed row). */
type StringIdRow = { _id: string; [key: string]: unknown };

/**
 * T-657 — the free_seed ledger row's deterministic _id: at most one per user. Normalised through
 * the ObjectId (lower-case hex), so an upper-case id string never misses the existing row.
 * LOCKSTEP: scripts/backfill-free-seed.ts has a copy (it cannot import this module: env init).
 */
export function freeSeedLedgerId(userId: string | mongoose.Types.ObjectId): string {
  // Callers validate first; a non-ObjectId input (never written) is lower-cased, not thrown on.
  const hex = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId).toHexString()
    : String(userId).toLowerCase();
  return `free_seed:${hex}`;
}

function errNameOf(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

/** Insert the free_seed row; a duplicate key means it is already there. Never throws. */
async function insertFreeSeedRow(
  userId: string,
  _id: mongoose.Types.ObjectId,
  balanceAfter: unknown,
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await db.collection<StringIdRow>('inkledger').insertOne({
      _id: freeSeedLedgerId(userId),
      userId: _id,
      delta: FREE_SEED_UNITS,
      reason: 'free_seed',
      sourceBucket: 'topup',
      balanceAfter,
      createdAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 11000) return;
    // The user already has the Ink and the marker; the next call heals the row.
    logger.warn({ userId, errName: errNameOf(err) }, 'Free Ink seed ledger insert failed');
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
