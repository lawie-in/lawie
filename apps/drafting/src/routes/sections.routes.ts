import { Router, Request, Response } from 'express';

import {
  lookupOldToNew,
  lookupNewToOld,
  autoLookup,
  getAllMappings,
  getCodesMeta,
  convertOldReferencesInText,
} from '../services/sections.service';

const router = Router();

/**
 * GET /sections/map?old=302-IPC
 * GET /sections/map?new=103-BNS
 * GET /sections/map?section=302&code=IPC
 *
 * Bidirectional section lookup. Accepts old→new or new→old.
 * Old codes: IPC, CrPC, IEA
 * New codes: BNS, BNSS, BSA
 */
router.get('/map', async (req: Request, res: Response): Promise<void> => {
  const { old: oldQuery, new: newQuery, section, code } = req.query;

  // Format 1: ?old=302-IPC
  if (typeof oldQuery === 'string' && oldQuery.trim()) {
    const result = await lookupOldToNew(oldQuery);
    if (!result) {
      res.status(404).json({ error: 'Section mapping not found', query: oldQuery });
      return;
    }
    res.json({ direction: 'old_to_new', result });
    return;
  }

  // Format 2: ?new=103-BNS
  if (typeof newQuery === 'string' && newQuery.trim()) {
    const results = await lookupNewToOld(newQuery);
    if (!results) {
      res.status(404).json({ error: 'Section mapping not found', query: newQuery });
      return;
    }
    res.json({ direction: 'new_to_old', results });
    return;
  }

  // Format 3: ?section=302&code=IPC (auto-detect direction)
  if (typeof section === 'string' && typeof code === 'string') {
    const result = await autoLookup(section, code);
    if (!result) {
      res.status(404).json({ error: 'Section mapping not found', section, code });
      return;
    }
    res.json(result);
    return;
  }

  res.status(400).json({
    error: 'Missing query parameter',
    usage: {
      old_to_new: 'GET /sections/map?old=302-IPC',
      new_to_old: 'GET /sections/map?new=103-BNS',
      auto_detect: 'GET /sections/map?section=302&code=IPC',
    },
  });
});

/**
 * POST /sections/convert
 * Body: { text: "charged under Section 302 IPC and Section 154 CrPC" }
 *
 * Auto-converts all old-law section references in the text to new-law references.
 */
router.post('/convert', async (req: Request, res: Response): Promise<void> => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "text" field in request body' });
    return;
  }

  const { converted, conversions } = await convertOldReferencesInText(text);
  res.json({ original: text, converted, conversions, count: conversions.length });
});

/**
 * GET /sections/codes
 * Returns metadata for all supported code mappings.
 */
router.get('/codes', async (_req: Request, res: Response): Promise<void> => {
  const codes = await getCodesMeta();
  res.json({ codes });
});

/**
 * GET /sections/all/:code
 * Returns all mappings for a given code (IPC, CrPC, IEA, BNS, BNSS, BSA).
 * Useful for building the full conversion table UI.
 */
router.get('/all/:code', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const data = await getAllMappings(code);

  if (!data) {
    res.status(404).json({
      error: 'Code not found',
      supported: ['IPC', 'CrPC', 'IEA', 'BNS', 'BNSS', 'BSA'],
    });
    return;
  }

  res.json({
    meta: data.meta,
    mappings: data.mappings,
    new_provisions: data.newProvisions,
    total_mapped: data.meta.mapped_sections,
  });
});

export default router;
