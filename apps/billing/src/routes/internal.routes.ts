/**
 * Internal routes — service-to-service only (T-115c). Called by auth, never
 * by a browser: guarded by INTERNAL_SECRET with a constant-time compare, and
 * the gateway refuses every path containing /internal/.
 *
 * POST /internal/erase-user { userId, dryRun? }
 *   Erases what billing holds for the user (services/account-erase.service.ts).
 *   Idempotent; dryRun counts and changes nothing.
 *     200 { ok: true, dryRun, counts }
 *     400 bad body, 401 bad secret
 *     500 { ok: false, error: 'erase_failed', failedAt, counts }: auth retries
 *
 * GET /internal/subscription-status/:userId
 *   For auth's close-account gate (Arjun, T-115c ruling 4).
 *     200 { active: boolean, status: string }  (status 'none' when no subscription)
 *     400 bad userId, 401 bad secret, 500 read failed
 */
import crypto from 'crypto';

import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { eraseBillingAccount, subscriptionStatusFor } from '../services/account-erase.service';

const router = Router();

/** Constant-time: both sides hashed to 32 bytes first, so length does not leak either. */
export function internalSecretMatches(provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(env.INTERNAL_SECRET, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  res.set('Cache-Control', 'no-store');
  if (!internalSecretMatches(req.headers['x-internal-secret'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.post(
  '/internal/erase-user',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, dryRun } = (req.body ?? {}) as { userId?: unknown; dryRun?: unknown };
    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    // A string "true" must never be read as false and erase for real.
    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      res.status(400).json({ error: 'dryRun must be a boolean' });
      return;
    }

    const result = await eraseBillingAccount({ userId, dryRun: dryRun === true });
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

router.get(
  '/internal/subscription-status/:userId',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    try {
      res.status(200).json(await subscriptionStatusFor(userId));
    } catch (err) {
      logger.warn(
        { userId, errName: err instanceof Error ? err.name : 'UnknownError' },
        'subscription-status read failed',
      );
      res.status(500).json({ error: 'status_unavailable' });
    }
  },
);

export default router;
