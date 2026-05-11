/**
 * Internal routes — service-to-service only (SCRUM-71)
 *
 * Gated by x-internal-secret header (same secret shared across all Lawie services).
 * Never exposed through the public gateway.
 *
 * POST /internal/grant-bonus
 *   Called by the auth service after a referral code is applied at signup.
 *   Creates or increments the BonusCredit record for the user.
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { BonusCredit } from '../models/BonusCredit.model';

const router = Router();

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret || req.headers['x-internal-secret'] !== secret) {
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

export default router;
