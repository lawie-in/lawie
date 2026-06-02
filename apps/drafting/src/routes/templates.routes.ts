import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { Template } from '../models/Template.model';

const router = Router();

/**
 * GET /templates
 * Returns all active templates accessible to the caller's plan.
 * Free users: planAccess='free' templates only.
 * Pro users: all templates.
 *
 * Reads from the Template collection — populated by syncTemplateRegistry()
 * at boot from the SCRUM-78 doc-rules registry. The in-memory registry is
 * the source of truth; this collection is a queryable view of it.
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const plan = req.jwtPayload!.plan;

  const filter: Record<string, unknown> = { isActive: true };
  if (plan !== 'pro') {
    filter.planAccess = 'free';
  }

  const templates = await Template.find(filter)
    .select(
      'templateId slug displayName category courtLevels description planAccess creditsCost icon supportedLanguages',
    )
    .sort({ category: 1, displayName: 1 })
    .lean();

  res.json({ templates, plan });
});

/**
 * GET /templates/:slug
 * Returns a single template if accessible to the caller's plan.
 * Slug is the doc-rule template_id (also the JSON filename without .json).
 */
router.get('/:slug', authenticate, async (req: Request, res: Response): Promise<void> => {
  const plan = req.jwtPayload!.plan;
  const { slug } = req.params;

  const template = await Template.findOne({ slug, isActive: true }).lean();

  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  if (template.planAccess === 'pro' && plan !== 'pro') {
    res.status(403).json({
      error: 'This template requires a Pro plan',
      upgradeUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/settings/billing`,
    });
    return;
  }

  res.json({ template });
});

export default router;
