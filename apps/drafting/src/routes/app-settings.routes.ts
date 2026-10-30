/**
 * App settings admin routes — runtime config.
 *
 *   GET   /admin/app-settings           — list all settings (founder-only)
 *   GET   /admin/app-settings/registry  — the known AI keys, no values (founder-only, T-684)
 *   PUT   /admin/app-settings/:key      — upsert one setting (founder-only)
 *
 * Currently used for AI model selection per role (ai.model.<role>,
 * ai.effort.<role>; T-684) but the model is generic — anything that should be
 * changeable without a deploy can live here.
 */
import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  AI_EFFORT_VALUES,
  getAppSettingsRegistry,
  listAppSettings,
  setAppSetting,
} from '../services/app-settings.service';

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

// ── GET /admin/app-settings/registry (T-684) ─────────────────────────────────
// Key names, labels and help text for the admin AI page. Never a value.

router.get(
  '/admin/app-settings/registry',
  authenticate,
  requireAdmin,
  (_req: Request, res: Response): void => {
    res.json({ entries: getAppSettingsRegistry() });
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
    // T-684: an effort key takes one of the SDK's effort values only, stored
    // trimmed and lower-cased (canonical, so the admin select matches it).
    const isEffortKey = key.toLowerCase().startsWith('ai.effort.');
    if (
      isEffortKey &&
      !(AI_EFFORT_VALUES as readonly string[]).includes(value.trim().toLowerCase())
    ) {
      res
        .status(400)
        .json({ error: `value for ${key} must be one of: ${AI_EFFORT_VALUES.join(', ')}` });
      return;
    }
    if (
      description !== undefined &&
      (typeof description !== 'string' || description.length > 500)
    ) {
      res.status(400).json({ error: 'description must be a string (max 500 chars)' });
      return;
    }

    const saved = await setAppSetting({
      key,
      value: isEffortKey ? value.trim().toLowerCase() : value,
      description: typeof description === 'string' ? description : undefined,
      updatedBy: req.jwtPayload?.sub,
    });

    res.json(saved);
  },
);

export default router;
