import { Request, Response, NextFunction } from 'express';

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

  // Pro users have no limit
  if (payload.plan === 'pro') {
    next();
    return;
  }

  // Count generations in the current calendar month
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
