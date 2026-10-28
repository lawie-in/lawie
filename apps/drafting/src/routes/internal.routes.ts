/**
 * Internal routes — service-to-service only (SCRUM-71)
 *
 * Gated by x-internal-secret header (same secret shared across all Lawie services).
 * Never exposed through the public gateway.
 *
 * POST /internal/grant-bonus
 *   Called by the auth service after a referral code is applied at signup
 *   (referral.service.ts signalDraftingBonus). T-652: the only caller now; the signup bonus
 *   stopped sending its signal in T-652.
 *   Creates or increments the BonusCredit record for the user.
 *
 * POST /internal/erase-user { userId, email?, dryRun? }  (T-115c)
 *   Called by auth when an account is closed. Erases what drafting holds for
 *   the user (services/account-erase.service.ts). Idempotent; dryRun counts
 *   and changes nothing.
 *     200 { ok: true, dryRun, counts }
 *     400 bad body, 401 bad secret, 403 the golden-set fixture user
 *     500 { ok: false, error: 'erase_failed', failedAt, counts }: auth retries
 *   The email is used only to match ReviewToken.assignedEmail; never logged
 *   or echoed.
 */
import crypto from 'crypto';

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { BonusCredit } from '../models/BonusCredit.model';
import { eraseAccount } from '../services/account-erase.service';
import { isFixtureUser } from '../services/run-origin';

const router = Router();

/** Same as auth's limit for the address it sends (account-erase.service.ts, EMAIL_MAX_LENGTH). */
const EMAIL_MAX_LENGTH = 320;

/**
 * Constant-time, as auth's internalSecretMatches: both sides hashed to 32
 * bytes first, so the length does not leak either. False when no secret is
 * configured. Read at call time, as before (tests set it on process.env).
 */
export function internalSecretMatches(provided: unknown): boolean {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(secret, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  if (!internalSecretMatches(req.headers['x-internal-secret'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// POST /internal/grant-bonus
router.post(
  '/internal/grant-bonus',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, bonus } = req.body as { userId?: string; bonus?: number };

    if (!userId || typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    if (typeof bonus !== 'number' || bonus <= 0 || !Number.isInteger(bonus)) {
      res.status(400).json({ error: 'bonus must be a positive integer' });
      return;
    }

    await BonusCredit.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $inc: { granted: bonus } },
      { upsert: true, new: true },
    );

    res.status(200).json({ success: true, userId, bonus });
  },
);

// POST /internal/erase-user (T-115c)
router.post(
  '/internal/erase-user',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    const body = (req.body ?? {}) as { userId?: unknown; email?: unknown; dryRun?: unknown };
    const { userId, email, dryRun } = body;

    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    // A string "true" must never be read as false and erase for real.
    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      res.status(400).json({ error: 'dryRun must be a boolean' });
      return;
    }
    // Up to 320, auth's own limit: a 400 here would leave a locked account unerasable. An
    // address longer than ReviewToken's 200 cannot match a token; the service skips that match.
    if (email !== undefined && (typeof email !== 'string' || email.length > EMAIL_MAX_LENGTH)) {
      res.status(400).json({ error: 'email must be a string' });
      return;
    }
    if (isFixtureUser(userId)) {
      res.status(403).json({ error: 'refused' });
      return;
    }

    const normalisedEmail =
      typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : undefined;
    const result = await eraseAccount({ userId, email: normalisedEmail, dryRun: dryRun === true });

    if (!result.ok) {
      res.status(500).json({
        ok: false,
        error: 'erase_failed',
        failedAt: result.failedAt,
        counts: result.counts,
      });
      return;
    }
    res.status(200).json({ ok: true, dryRun: result.dryRun, counts: result.counts });
  },
);

export default router;
