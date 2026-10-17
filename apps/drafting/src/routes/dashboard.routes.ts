/**
 * T-506 — dashboard routes.
 *
 *   GET /dashboard/summary — signed-in user's current IST-month summary
 *
 * Reached through the gateway as GET /api/drafting/dashboard/summary
 * (the /api/drafting catch-all strips the prefix).
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { getDashboardSummary } from '../services/dashboard-summary.service';

const router = Router();

router.get(
  '/dashboard/summary',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.jwtPayload!.sub;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid user' });
      return;
    }
    try {
      res.json(await getDashboardSummary(userId));
    } catch (err) {
      // No request data, rows or error message in logs (T-506 AC5): only the error class.
      logger.error(
        { route: 'dashboard.summary', errorName: (err as Error)?.name },
        'Dashboard summary failed',
      );
      res.status(500).json({ error: 'Could not load dashboard summary' });
    }
  },
);

export default router;
