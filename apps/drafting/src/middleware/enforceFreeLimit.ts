import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

import { BonusCredit } from '../models/BonusCredit.model';
import { Generation } from '../models/Generation.model';

// Free tier: 5 document generations per calendar month (Ajay/CLO — SCRUM-10)
export const FREE_TIER_MONTHLY_LIMIT = 5;

export async function enforceFreeLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const payload = req.jwtPayload;
  if (!payload) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  // Pro and Admin users have no limit
  if (payload.plan === 'pro' || payload.role === 'Admin') {
    next();
    return;
  }

  const userId = payload.sub;

  // ── SCRUM-71: deduct from bonus grant first ─────────────────────────────────
  if (mongoose.Types.ObjectId.isValid(userId)) {
    const bonus = await BonusCredit.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (bonus && bonus.granted - bonus.used > 0) {
      // Consume one bonus draft atomically
      await BonusCredit.updateOne(
        { userId: new mongoose.Types.ObjectId(userId), used: { $lt: bonus.granted } },
        { $inc: { used: 1 } },
      );
      next();
      return;
    }
  }

  // ── Standard trial monthly limit ────────────────────────────────────────────
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const count = await Generation.countDocuments({
    userId: payload.sub,
    createdAt: { $gte: startOfMonth },
  });

  if (count >= FREE_TIER_MONTHLY_LIMIT) {
    res.status(402).json({
      error: 'Free tier limit reached',
      message: `You have used ${count}/${FREE_TIER_MONTHLY_LIMIT} free documents this month. Upgrade to Pro for unlimited access.`,
      upgradeUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/settings/billing`,
      used: count,
      limit: FREE_TIER_MONTHLY_LIMIT,
    });
    return;
  }

  next();
}
