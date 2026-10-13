import { Router, Request, Response } from 'express';

import { catalogueCategory } from '../config/catalogue';
import { authenticate } from '../middleware/authenticate';
import { Template } from '../models/Template.model';
import { cardDescriptionFor } from '../utils/cardDescription';

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
      'templateId slug displayName category catalogueCategory courtLevels planAccess creditsCost icon supportedLanguages',
    )
    .lean();

  // T-240: catalogue (T-239) order, then title. A row with no catalogue
  // category yet sorts last.
  const order = (id: unknown) =>
    (typeof id === 'string' && catalogueCategory(id)?.order) || Number.MAX_SAFE_INTEGER;
  templates.sort(
    (a, b) =>
      order(a.catalogueCategory) - order(b.catalogueCategory) ||
      a.displayName.localeCompare(b.displayName),
  );

  res.json({
    templates: templates.map((template) => ({
      ...template,
      // T-365 AC6: the signed card line only; '' when the pack has none.
      description: cardDescriptionFor(template.templateId),
    })),
    plan,
  });
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

  // T-365 AC6: drop the stored (internal) description before the spread, then
  // set the signed card line, so the old text cannot come back through the spread.
  const { description: _internalDescription, ...rest } = template;
  void _internalDescription;
  res.json({ template: { ...rest, description: cardDescriptionFor(template.templateId) } });
});

export default router;
