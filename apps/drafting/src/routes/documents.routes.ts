import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { enforceFreeLimit, FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { Generation } from '../models/Generation.model';

const router = Router();

// GET /documents/usage — return this month's generation count + limit for the caller
router.get('/usage', authenticate, async (req: Request, res: Response): Promise<void> => {
  const payload = req.jwtPayload!;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const used = await Generation.countDocuments({
    userId: payload.sub,
    createdAt: { $gte: startOfMonth },
  });

  if (payload.plan === 'pro') {
    res.json({ used, limit: null, remaining: null, plan: 'pro' });
    return;
  }

  res.json({
    used,
    limit: FREE_TIER_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_TIER_MONTHLY_LIMIT - used),
    plan: 'free',
  });
});

// GET /documents — list user's documents (no limit check needed for reads)
router.get('/', authenticate, (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Document listing coming in SCRUM-36 (AI provider)' });
});

// POST /documents/generate — generate a new document (free-tier gated)
// authenticate → enforceFreeLimit → handler
router.post('/generate', authenticate, enforceFreeLimit, (_req: Request, res: Response) => {
  // AI generation implemented in SCRUM-36 — blocked until AI provider decision
  res.status(501).json({ message: 'AI generation coming in SCRUM-36' });
});

export default router;
