/**
 * Referral service — SCRUM-71
 *
 * Generates and manages founder-issued referral codes.
 * Each code carries its own bonusInk offer and optional expiresAt window.
 * On signup: claims the code once per user, increments code.uses, grants bonusInk Ink into
 * the raw users.inkTopup bucket (T-298).
 */
import crypto from 'crypto';

import mongoose from 'mongoose';

import logger from '../config/logger';
import { IReferralCode, ReferralCode } from '../models/ReferralCode.model';
import { User, type ReferralStatus } from '../models/User.model';

import { grantReferralInk, referralInkLanded } from './credit-bonus.service';

// ── Code generation ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 8-char uppercase alphanumeric code.
 * Retries up to 5 times on collision (astronomically unlikely).
 */
function randomCode(): string {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/1/O/0
  return Array.from({ length: 8 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
}

export async function generateReferralCode(
  founderId: string,
  options: {
    label?: string;
    maxUses?: number | null;
    bonusInk?: number;
    expiresAt?: Date | null;
  } = {},
): Promise<IReferralCode> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const created = await ReferralCode.create({
        code,
        label: options.label,
        createdBy: new mongoose.Types.ObjectId(founderId),
        maxUses: options.maxUses ?? null,
        bonusInk: options.bonusInk ?? 5,
        expiresAt: options.expiresAt ?? null,
      });
      return created;
    } catch (err: unknown) {
      // Duplicate key on `code` — retry
      if ((err as { code?: number }).code === 11000) continue;
      throw err;
    }
  }
  throw new Error('Failed to generate a unique referral code after 5 attempts');
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Validate a code: returns the ReferralCode if active, not exhausted, and not expired, else null.
 */
export async function validateReferralCode(code: string): Promise<IReferralCode | null> {
  const rc = await ReferralCode.findOne({ code: code.toUpperCase(), isActive: true }).lean();
  if (!rc) return null;
  if (rc.maxUses !== null && rc.uses >= rc.maxUses) return null;
  if (rc.expiresAt && rc.expiresAt < new Date()) return null;
  return rc as unknown as IReferralCode;
}

export async function listReferralCodes(): Promise<IReferralCode[]> {
  const docs = await ReferralCode.find().sort({ createdAt: -1 }).lean();
  return docs as unknown as IReferralCode[];
}

export async function disableReferralCode(code: string): Promise<IReferralCode | null> {
  const doc = await ReferralCode.findOneAndUpdate(
    { code: code.toUpperCase() },
    { $set: { isActive: false } },
    { new: true },
  ).lean();
  return doc as unknown as IReferralCode | null;
}

// ── Apply on signup ───────────────────────────────────────────────────────────

/**
 * Outcome of applyReferralCode (T-234 / T-298):
 * - 'applied'         this call claimed the code for the user and granted the Ink
 * - 'invalid'         the code is unknown, disabled, used up or expired right now
 * - 'already_applied' the user already has a referral (another call won) — nothing granted
 */
export type ReferralApplyResult = 'applied' | 'invalid' | 'already_applied';

/**
 * Apply a referral code to a newly created user.
 * - Re-validates the code at account creation (it may have expired since the page checked it)
 * - Claims the referral on the user atomically: only the call that wins
 *   findOneAndUpdate({ _id, referredVia: null }) continues (T-298 ruling d), so concurrent or
 *   repeated calls grant at most once
 * - Then takes a use slot on the code atomically (uses < maxUses checked in the same update as
 *   the $inc). If refused, the claim is undone and nothing is granted ('invalid').
 * - Only a winner of both steps grants Ink and signals drafting
 * - The slot filter re-checks expiresAt, so a code that expired after validation is refused
 *   and follows the rollback path (T-299)
 * - If the grant credits nothing or throws, and the Ink did not land, the slot and the claim
 *   are rolled back ('invalid'). If it did land (the reply was lost), the result is 'applied'
 *   (T-299; see grantReferralInk / referralInkLanded)
 * - Grants rc.bonusInk Ink into the raw inkTopup bucket + writes an inkledger row
 * - Signals drafting service for legacy enforceFreeLimit compat
 *
 * `referredVia` is `default: null` in the auth schema, so an unreferred user stores null.
 * `{ referredVia: null }` matches both null and a missing field; `$exists: false` alone would
 * never match a Mongoose-created user.
 */
export interface ApplyReferralOptions {
  /**
   * T-522 (Arjun ruling 2): record the referral (claim and use slot) but grant no Ink now. Used
   * by password sign-up, where the account is unverified; grantDeferredReferralInk grants it when
   * the address is verified. Google sign-up (already verified) does not set this.
   */
  deferInk?: boolean;
}

/** T-522: store the outcome GET /me reports as referralStatus. Never throws. */
async function recordReferralStatus(userId: string, status: ReferralStatus): Promise<void> {
  try {
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { referralStatus: status } },
    );
  } catch {
    logger.warn({ userId }, 'Referral status not recorded');
  }
}

export async function applyReferralCode(
  userId: string,
  code: string,
  opts: ApplyReferralOptions = {},
): Promise<ReferralApplyResult> {
  const outcome = await claimReferralCode(userId, code, opts);
  // T-522: 'already_applied' leaves the stored status as it was (another call recorded it).
  if (outcome === 'applied') await recordReferralStatus(userId, 'applied');
  if (outcome === 'invalid') await recordReferralStatus(userId, 'not_applied');
  return outcome;
}

async function claimReferralCode(
  userId: string,
  code: string,
  opts: ApplyReferralOptions,
): Promise<ReferralApplyResult> {
  const rc = await validateReferralCode(code);
  if (!rc) return 'invalid';

  // Exactly-once claim (T-298 d): only the winner grants Ink and bumps uses.
  const claimed = await User.findOneAndUpdate(
    // T-563 (Arjun): no referral in or out for a test account.
    { _id: new mongoose.Types.ObjectId(userId), referredVia: null, isTestAccount: { $ne: true } },
    { $set: { referredVia: rc._id } },
    { new: true },
  ).lean();
  if (!claimed) return 'already_applied';

  // Take a use slot atomically (T-298, Arjun round 1b): the cap check and the $inc are one
  // update, so concurrent sign-ups cannot overshoot maxUses. No cap condition when unset.
  // T-299: expiresAt is checked again here, in the same update, not only in validateReferralCode.
  const now = new Date();
  const slotFilter: Record<string, unknown> = {
    _id: rc._id,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
  };
  if (rc.maxUses !== null && rc.maxUses !== undefined) {
    slotFilter['$expr'] = { $lt: ['$uses', '$maxUses'] };
  }
  const slot = await ReferralCode.findOneAndUpdate(slotFilter, { $inc: { uses: 1 } });

  // Undo this call's own steps: give back the use slot (only if this call took it) and release
  // the claim (only while the user still points at this code). Never throws.
  const userOid = new mongoose.Types.ObjectId(userId);
  const rollback = async (tookSlot: boolean): Promise<void> => {
    try {
      if (tookSlot) {
        await ReferralCode.updateOne({ _id: rc._id, uses: { $gt: 0 } }, { $inc: { uses: -1 } });
      }
      await User.updateOne({ _id: userOid, referredVia: rc._id }, { $set: { referredVia: null } });
    } catch {
      logger.error({ userId, referralCodeId: String(rc._id) }, 'Referral rollback failed');
    }
  };

  if (!slot) {
    // Slot refused (used up, disabled or expired since validation): grant nothing.
    await rollback(false);
    return 'invalid';
  }

  // T-522: password sign-up records the referral now and grants the Ink on verification.
  if (opts.deferInk) return 'applied';

  // Grant Ink into inkTopup + set freeTierBonusGrant for legacy middleware.
  // 0 means this call credited nothing (no DB connection, user not found, already granted).
  // On 0 or a throw, ask whether the Ink is on the user (T-299): a throw can come after the $inc
  // landed. If it landed, keep the claim and the slot and report 'applied'. If it did not, or we
  // cannot tell, roll back the slot and the claim so the code is not consumed for Ink the user
  // never got (T-234 review). A later retry cannot double-credit: the grant is idempotent.
  let granted = 0;
  let grantThrew = false;
  try {
    granted = await grantReferralInk(userId, rc.bonusInk ?? 5, rc.code);
  } catch {
    grantThrew = true;
  }
  if (grantThrew || granted <= 0) {
    let landed = false;
    try {
      landed = await referralInkLanded(userId, rc.code);
    } catch {
      landed = false;
    }
    if (!landed) {
      logger.error(
        { userId, referralCodeId: String(rc._id) },
        grantThrew
          ? 'Referral Ink grant threw; rolling back the referral'
          : 'Referral Ink grant credited nothing; rolling back the referral',
      );
      await rollback(true);
      return 'invalid';
    }
    logger.warn(
      { userId, referralCodeId: String(rc._id) },
      'Referral Ink grant reported a failure but the Ink is on the user; keeping the referral',
    );
  }

  // Signal drafting service to pre-load BonusCredit grants (legacy enforceFreeLimit path)
  void signalDraftingBonus(userId, (rc.bonusInk ?? 5) * 5);

  return 'applied';
}

/**
 * T-522 (Arjun (b)) — the grant-time re-check: the same conditions as validateReferralCode
 * (active, not expired, not exhausted), except that this user's own use slot, taken at sign-up,
 * is already in `uses`: exhausted here means uses > maxUses, so the user holding the last slot of
 * a capped code is not refused for it.
 */
function referralCodeHonourableAtGrant(rc: {
  isActive?: boolean;
  expiresAt?: Date | null;
  maxUses?: number | null;
  uses?: number;
}): boolean {
  if (rc.isActive !== true) return false;
  if (rc.expiresAt && rc.expiresAt < new Date()) return false;
  if (rc.maxUses !== null && rc.maxUses !== undefined && (rc.uses ?? 0) > rc.maxUses) return false;
  return true;
}

/** T-522 — gives back the sign-up slot and releases the claim of a lapsed deferred referral. */
async function releaseDeferredReferral(
  userId: string,
  codeId: mongoose.Types.ObjectId,
): Promise<void> {
  try {
    const released = await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId), referredVia: codeId },
      { $set: { referredVia: null } },
    );
    if (released.modifiedCount > 0) {
      await ReferralCode.updateOne({ _id: codeId, uses: { $gt: 0 } }, { $inc: { uses: -1 } });
    }
  } catch {
    logger.error({ userId, referralCodeId: String(codeId) }, 'Deferred referral release failed');
  }
}

/**
 * T-522 (Arjun ruling 2): grants the referral Ink recorded at a password sign-up, once the
 * address is verified. Called by verifyEmailToken right after grantSignupBonus. No-op when the
 * user has no recorded referral or already has the Ink. grantReferralInk is fenced on
 * VERIFIED_FOR_BONUS and idempotent, so a repeat or early call credits nothing. The code is
 * re-checked here (Arjun (b)); a lapsed or exhausted code grants nothing and is recorded as
 * 'not_applied'. Called by verifyEmailToken and by the Google link path. Never throws; logs ids
 * only.
 */
export async function grantDeferredReferralInk(userId: string): Promise<void> {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) return;
    const user = await User.findById(userId, { referredVia: 1 }).lean();
    const referredVia = user?.referredVia;
    if (!user || !referredVia) return;
    const rc = await ReferralCode.findById(referredVia).lean();
    if (!rc) {
      logger.warn({ userId }, 'Deferred referral Ink not granted: code not found');
      await recordReferralStatus(userId, 'not_applied');
      return;
    }
    // Already credited (a repeat call): nothing to re-check, nothing to change.
    if (await referralInkLanded(userId, rc.code)) return;
    // T-522 (Arjun (b), confirmed 22 Oct 2026): re-check the code now, never grant on its
    // sign-up-time validity alone. Lapsed (disabled or expired) or exhausted: no grant, the slot
    // and the claim are given back, and referralStatus becomes 'not_applied'.
    if (!referralCodeHonourableAtGrant(rc)) {
      await releaseDeferredReferral(userId, rc._id);
      await recordReferralStatus(userId, 'not_applied');
      logger.info(
        { userId, referralCodeId: String(rc._id) },
        'Deferred referral Ink not granted: code lapsed or exhausted at verification',
      );
      return;
    }
    const bonusInk = rc.bonusInk ?? 5;
    const granted = await grantReferralInk(userId, bonusInk, rc.code);
    if (granted > 0) {
      void signalDraftingBonus(userId, bonusInk * 5);
      logger.info({ userId, referralCodeId: String(rc._id) }, 'Deferred referral Ink granted');
      return;
    }
    if (!(await referralInkLanded(userId, rc.code))) {
      logger.warn(
        { userId, referralCodeId: String(rc._id) },
        'Deferred referral Ink credited nothing',
      );
    }
  } catch {
    logger.error({ userId }, 'Deferred referral Ink grant failed');
  }
}

async function signalDraftingBonus(userId: string, bonus: number): Promise<void> {
  const draftingUrl = process.env.DRAFTING_INTERNAL_URL ?? 'http://localhost:4002';
  const secret = process.env.INTERNAL_SECRET ?? '';

  try {
    await fetch(`${draftingUrl}/internal/grant-bonus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ userId, bonus }),
    });
  } catch {
    // Non-fatal — bonus can be reconciled later; user record is already updated
    console.warn(`[referral] Failed to signal drafting bonus for user ${userId}`);
  }
}
