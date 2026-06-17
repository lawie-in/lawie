/**
 * Referral service — SCRUM-71
 *
 * Generates and manages founder-issued referral codes.
 * Each code carries its own bonusInk offer and optional expiresAt window.
 * On signup: increments code.uses, grants bonusInk Ink into user.inkTopup.
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
 * Apply a referral code to a newly created user.
 * - Atomically increments code.uses
 * - Links user.referredVia to the code
 * - Grants rc.bonusInk Ink into user.inkTopup + writes inkledger row
 * - Signals drafting service for legacy enforceFreeLimit compat
 *
 * Non-blocking — caller should not await if they don't want to delay the response.
 */
export async function applyReferralCode(userId: string, code: string): Promise<void> {
  const rc = await validateReferralCode(code);
  if (!rc) return; // code invalid/exhausted/expired — silently ignore

  // Atomically increment uses
  await ReferralCode.findOneAndUpdate({ _id: rc._id, isActive: true }, { $inc: { uses: 1 } });

  // Link referral on user record
  await User.findByIdAndUpdate(userId, { $set: { referredVia: rc._id } });

  // Grant Ink into inkTopup + set freeTierBonusGrant for legacy middleware
  await grantReferralInk(userId, rc.bonusInk ?? 5, rc.code);

  // Signal drafting service to pre-load BonusCredit grants (legacy enforceFreeLimit path)
  void signalDraftingBonus(userId, (rc.bonusInk ?? 5) * 5);
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
