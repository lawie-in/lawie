import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { enforceFreeLimit } from '../middleware/enforceFreeLimit';

const router = Router();

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
