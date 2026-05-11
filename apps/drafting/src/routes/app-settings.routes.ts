/**
 * App settings admin routes — runtime config.
 *
 *   GET   /admin/app-settings           — list all settings (founder-only)
 *   PUT   /admin/app-settings/:key      — upsert one setting (founder-only)
 *
 * Currently used for AI model selection (ai.drafting_model, ai.preflight_model)
 * but the model is generic — anything that should be changeable without a
 * deploy can live here.
 */
import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { listAppSettings, setAppSetting } from '../services/app-settings.service';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── GET /admin/app-settings ───────────────────────────────────────────────────

router.get(
  '/admin/app-settings',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const settings = await listAppSettings();
    res.json({ settings });
  },
);

// ── PUT /admin/app-settings/:key ──────────────────────────────────────────────

router.put(
  '/admin/app-settings/:key',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { key } = req.params;
    const { value, description } = req.body as { value?: unknown; description?: unknown };

    // Validate key shape — mirror the model schema
    if (!key || !/^[a-z][a-z0-9_.-]*$/i.test(key) || key.length > 120) {
      res.status(400).json({ error: 'Invalid key format' });
      return;
    }
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
      res.status(400).json({ error: 'value must be a non-empty string (max 500 chars)' });
      return;
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      res.status(400).json({ error: 'description must be a string (max 500 chars)' });
      return;
    }

    const saved = await setAppSetting({
      key,
      value,
      description: typeof description === 'string' ? description : undefined,
      updatedBy: req.jwtPayload?.sub,
    });

    res.json(saved);
  },
);

export default router;
