import { Router, Request, Response } from 'express';

import { catalogueCategory } from '../config/catalogue';
import { authenticate } from '../middleware/authenticate';
import { Template } from '../models/Template.model';
import { hiddenTemplateIds } from '../services/feature-switches';
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

  const rows = await Template.find(filter)
    .select(
      'templateId slug displayName category catalogueCategory planAccess creditsCost icon supportedLanguages',
    )
    .lean();

  // T-385 (from T-375): a template hidden by its feature switch is not listed,
  // the same filter as GET /documents/template-configs. templateId and slug both
  // hold the catalogue template_id (template-seed.service); a pre-SCRUM-80 row
  // may have only slug, so either one matching hides the row.
  const hidden = await hiddenTemplateIds(req.jwtPayload!.sub);
  const templates = rows.filter((t) => !hidden.has(t.templateId) && !hidden.has(t.slug));

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
