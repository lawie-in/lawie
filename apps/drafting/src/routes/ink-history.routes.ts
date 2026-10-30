/**
 * T-646 — Ink history routes.
 *
 *   GET /credits/history?limit=&cursor= — the signed-in user's own Ink history,
 *   newest first (services/ink-history.service.ts).
 *
 * Reached through the gateway as GET /api/credits/history (the existing
 * /api/credits proxy prepends /credits/), so no gateway change. The user is
 * the authenticated one only; there is no userId parameter.
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import { clampLimit, getInkHistory, InvalidCursorError } from '../services/ink-history.service';

const router = Router();

router.get('/credits/history', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.jwtPayload!.sub;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: 'Invalid user' });
    return;
  }
  const rawCursor = req.query.cursor;
  if (rawCursor !== undefined && (typeof rawCursor !== 'string' || rawCursor.length > 64)) {
    res.status(400).json({ error: 'Invalid cursor' });
    return;
  }
  try {
    const page = await getInkHistory(userId, {
      limit: clampLimit(req.query.limit),
      cursor: rawCursor || null,
    });
    res.set('Cache-Control', 'no-store');
    res.json(page);
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
    // AJ-646-M5: no titles, rows or error message in logs, only the error class.
    logger.error(
      { route: 'credits.history', errorName: (err as Error)?.name },
      'Ink history failed',
    );
    res.status(500).json({ error: 'Could not load Ink history' });
  }
});

export default router;
