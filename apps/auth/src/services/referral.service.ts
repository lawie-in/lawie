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

import { IReferralCode, ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';

import { grantReferralInk } from './credit-bonus.service';

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
 * - Grants rc.bonusInk Ink into the raw inkTopup bucket + writes an inkledger row
 * - Signals drafting service for legacy enforceFreeLimit compat
 *
 * `referredVia` is `default: null` in the auth schema, so an unreferred user stores null.
 * `{ referredVia: null }` matches both null and a missing field; `$exists: false` alone would
 * never match a Mongoose-created user.
 */
export async function applyReferralCode(
  userId: string,
  code: string,
): Promise<ReferralApplyResult> {
  const rc = await validateReferralCode(code);
  if (!rc) return 'invalid';

  // Exactly-once claim (T-298 d): only the winner grants Ink and bumps uses.
  const claimed = await User.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(userId), referredVia: null },
    { $set: { referredVia: rc._id } },
    { new: true },
  ).lean();
  if (!claimed) return 'already_applied';

  // Take a use slot atomically (T-298, Arjun round 1b): the cap check and the $inc are one
  // update, so concurrent sign-ups cannot overshoot maxUses. No cap condition when unset.
  const slotFilter: Record<string, unknown> = { _id: rc._id, isActive: true };
  if (rc.maxUses !== null && rc.maxUses !== undefined) {
    slotFilter['$expr'] = { $lt: ['$uses', '$maxUses'] };
  }
  const slot = await ReferralCode.findOneAndUpdate(slotFilter, { $inc: { uses: 1 } });
  if (!slot) {
    // Slot refused (used up or disabled since validation): undo this call's claim, but only if
    // the user still points at this code, and grant nothing.
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId), referredVia: rc._id },
      { $set: { referredVia: null } },
    );
    return 'invalid';
  }

  // Grant Ink into inkTopup + set freeTierBonusGrant for legacy middleware
  await grantReferralInk(userId, rc.bonusInk ?? 5, rc.code);

  // Signal drafting service to pre-load BonusCredit grants (legacy enforceFreeLimit path)
  void signalDraftingBonus(userId, (rc.bonusInk ?? 5) * 5);

  return 'applied';
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
