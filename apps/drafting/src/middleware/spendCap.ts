/**
 * Spend-cap middleware — Phase 1 (permissive).
 *
 * Checks daily LLM spend per user and total across all users.
 * Phase 1: logs breaches, does NOT hard-block.
 * Phase 2: will return 429 when caps are exceeded.
 *
 * Thresholds (founder-approved):
 *   - Per-user: ₹500/day (~$6 USD)
 *   - Total:    ₹2,000/day (~$24 USD)
 */
import { Request, Response, NextFunction } from 'express';

import { Generation } from '../models/Generation.model';

const PER_USER_DAILY_CAP_USD = 6; // ~₹500
const TOTAL_DAILY_CAP_USD = 24; // ~₹2,000

export async function spendCapCheck(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.jwtPayload?.sub;
    if (!userId) {
      next();
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Aggregate daily spend for this user
    const [userSpend] = await Generation.aggregate([
      { $match: { userId, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, totalCost: { $sum: '$costUsd' } } },
    ]);

    const userDailyCost = userSpend?.totalCost ?? 0;

    if (userDailyCost >= PER_USER_DAILY_CAP_USD) {
      console.warn(
        `[spend-cap] User ${userId} exceeded daily cap: $${userDailyCost.toFixed(4)} (cap: $${PER_USER_DAILY_CAP_USD})`,
      );
      // Phase 1: log only, do not block
      // Phase 2: return res.status(429).json({ error: 'Daily generation limit reached' });
    }

    // Aggregate total daily spend across all users
    const [totalSpend] = await Generation.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, totalCost: { $sum: '$costUsd' } } },
    ]);

    const totalDailyCost = totalSpend?.totalCost ?? 0;

    if (totalDailyCost >= TOTAL_DAILY_CAP_USD) {
      console.warn(
        `[spend-cap] Total daily spend exceeded: $${totalDailyCost.toFixed(4)} (cap: $${TOTAL_DAILY_CAP_USD})`,
      );
    }
  } catch (err) {
    // Never block generation due to spend-cap check failure
    console.error('[spend-cap] Check failed:', err instanceof Error ? err.message : err);
  }

  next();
}
