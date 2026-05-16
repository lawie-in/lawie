import { Router, Request, Response } from 'express';

import { checkBailEligibility } from '../services/bail-check.service';
import {
  lookupOldToNew,
  lookupNewToOld,
  autoLookup,
  getAllMappings,
  getCodesMeta,
  convertOldReferencesInText,
  searchSections,
  getSectionDetail,
} from '../services/sections.service';
import { calculateTimeline } from '../services/timeline.service';

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
 * GET /sections/details?section=103&code=BNS
 *
 * Rich result-card payload for the Section Finder (SCRUM-83) — mapping,
 * statute, chapter, 4 metadata pills (bailable/cognizable/triable_by/
 * compoundable), punishment, ingredients (when CLO authors them), related
 * sections from the same chapter.
 */
router.get('/details', async (req: Request, res: Response): Promise<void> => {
  const { section, code } = req.query;
  if (typeof section !== 'string' || !section.trim()) {
    res.status(400).json({
      error: 'Missing "section" query parameter',
      usage: 'GET /sections/details?section=103&code=BNS',
    });
    return;
  }
  if (typeof code !== 'string' || !code.trim()) {
    res.status(400).json({
      error: 'Missing "code" query parameter',
      supported: ['BNS', 'BNSS', 'BSA', 'IPC', 'CrPC', 'IEA'],
    });
    return;
  }
  const detail = await getSectionDetail(section, code);
  if (!detail) {
    res
      .status(400)
      .json({ error: 'Unsupported code', supported: ['BNS', 'BNSS', 'BSA', 'IPC', 'CrPC', 'IEA'] });
    return;
  }
  res.json(detail);
});

/**
 * GET /sections/search?q=302&code=BNS
 *
 * Typeahead search within a single code. Matches by section-number prefix
 * (e.g., "302" finds 302, 302A, 302B) or title substring (e.g., "murder"
 * finds BNS 103). Returns up to 10 results.
 *
 * Powers the DynamicFormRenderer multi_select_search field when
 * `source: 'bns_mapping'` (SCRUM-85).
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const { q, code, limit: limitRaw } = req.query;

  if (typeof q !== 'string' || !q.trim()) {
    res.status(400).json({
      error: 'Missing "q" query parameter',
      usage: 'GET /sections/search?q=302&code=BNS',
    });
    return;
  }
  if (typeof code !== 'string' || !code.trim()) {
    res.status(400).json({
      error: 'Missing "code" query parameter',
      supported: ['BNS', 'BNSS', 'BSA', 'IPC', 'CrPC', 'IEA'],
    });
    return;
  }

  const parsedLimit = typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 25) : 10;

  const results = await searchSections(q, code, limit);
  res.json({ query: q, code, results, count: results.length });
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

/**
 * GET /sections/bail-check?sections=303,351
 * GET /sections/bail-check?sections=302-IPC,506-IPC
 *
 * Bail eligibility checker — free tool (SCRUM-47).
 * Accepts BNS section numbers or old IPC (auto-converts).
 * Returns per-section classification + summary with bail recommendation.
 */
router.get('/bail-check', async (req: Request, res: Response): Promise<void> => {
  const { sections } = req.query;

  if (!sections || typeof sections !== 'string' || !sections.trim()) {
    res.status(400).json({
      error: 'Missing "sections" query parameter',
      usage: 'GET /sections/bail-check?sections=303,351',
    });
    return;
  }

  const sectionList = sections
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (sectionList.length === 0) {
    res.status(400).json({ error: 'No valid sections provided' });
    return;
  }

  if (sectionList.length > 10) {
    res.status(400).json({ error: 'Maximum 10 sections per request' });
    return;
  }

  const result = await checkBailEligibility(sectionList);
  res.json(result);
});

/**
 * GET /sections/timeline?arrestDate=2026-03-01&sections=303,109
 *
 * BNSS investigation timeline tracker — free tool (SCRUM-48).
 * Computes custody limits, chargesheet deadline, and default bail date.
 */
router.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  const { arrestDate, sections } = req.query;

  if (!arrestDate || typeof arrestDate !== 'string' || !arrestDate.trim()) {
    res.status(400).json({
      error: 'Missing "arrestDate" query parameter',
      usage: 'GET /sections/timeline?arrestDate=2026-03-01&sections=303,109',
    });
    return;
  }

  if (!sections || typeof sections !== 'string' || !sections.trim()) {
    res.status(400).json({
      error: 'Missing "sections" query parameter',
      usage: 'GET /sections/timeline?arrestDate=2026-03-01&sections=303,109',
    });
    return;
  }

  // Validate date format
  const dateObj = new Date(arrestDate);
  if (isNaN(dateObj.getTime())) {
    res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    return;
  }

  const sectionList = sections
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (sectionList.length === 0) {
    res.status(400).json({ error: 'No valid sections provided' });
    return;
  }

  if (sectionList.length > 10) {
    res.status(400).json({ error: 'Maximum 10 sections per request' });
    return;
  }

  try {
    const result = calculateTimeline({ arrestDate: arrestDate.trim(), sections: sectionList });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Calculation failed' });
  }
});

export default router;
