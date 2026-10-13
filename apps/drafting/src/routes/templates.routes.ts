import { Router, Request, Response } from 'express';

import { catalogueCategory } from '../config/catalogue';
import { authenticate } from '../middleware/authenticate';
import { Template } from '../models/Template.model';
import { publicTemplateRow } from '../utils/publicTemplateConfig';

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
      'templateId slug displayName category catalogueCategory planAccess creditsCost icon supportedLanguages',
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

  // T-385: card keys only, through the shared allowlist projection.
  res.json({ templates: templates.map(publicTemplateRow), plan });
});

export default router;
