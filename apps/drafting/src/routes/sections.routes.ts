import { normalizeDate } from '@lawie/shared';
import { Router, Request, Response } from 'express';

import { checkBailEligibility, readBailInputs } from '../services/bail-check.service';
import {
  getAllMappings,
  getCodesMeta,
  convertReferencesForTool,
  searchSections,
  getSectionDetail,
  mapNewForTool,
  mapOldForTool,
  mapQueryForTool,
  readToolSections,
  TABLE_CODE,
} from '../services/sections.service';
import { calculateTimeline } from '../services/timeline.service';

const router = Router();

/** T-371: most characters POST /sections/convert accepts (413 above this). */
export const CONVERT_MAX_CHARS = 20_000;

/** "302-IPC" / "302 IPC" → ["302", "IPC"] (same split lookupOldToNew uses). */
function splitQuery(q: string, allowBrackets: boolean): [string, string] | null {
  const re = allowBrackets ? /^([\w./\s()]+?)[\s-]+(.+)$/ : /^([\w./\s]+?)[\s-]+(.+)$/;
  const m = q.trim().match(re);
  return m ? [m[1].trim(), m[2]] : null;
}

/**
 * GET /sections/map?q=BNS 318(4)
 * GET /sections/map?old=302-IPC
 * GET /sections/map?new=103-BNS
 * GET /sections/map?section=302&code=IPC
 *
 * Bidirectional section lookup, from the signed tables in memory (T-371).
 * Old codes: IPC, CrPC, IEA. New codes: BNS, BNSS, BSA.
 * `q` is free text read with the tools' reader (T-277): "302 IPC", "IPC 302",
 * "65B Evidence Act". A section with no row answers 200 with `found: false` and
 * Ajay's "Not verified — check the Gazette" label (T-360); 404 only for an
 * unknown code.
 */
router.get('/map', async (req: Request, res: Response): Promise<void> => {
  const { q, old: oldQuery, new: newQuery, section, code } = req.query;

  // Format 0: ?q=BNS 318(4)
  if (typeof q === 'string' && q.trim()) {
    const out = mapQueryForTool(q);
    if ('error' in out) {
      res.status(400).json({ error: out.error, query: q });
      return;
    }
    res.json(out);
    return;
  }

  // Format 1: ?old=302-IPC
  if (typeof oldQuery === 'string' && oldQuery.trim()) {
    const parts = splitQuery(oldQuery, true);
    const result = parts ? mapOldForTool(parts[0], parts[1]) : null;
    if (!result) {
      res.status(404).json({ error: 'Unsupported code', query: oldQuery });
      return;
    }
    res.json({ direction: 'old_to_new', result });
    return;
  }

  // Format 2: ?new=103-BNS
  if (typeof newQuery === 'string' && newQuery.trim()) {
    const parts = splitQuery(newQuery, true);
    const results = parts ? mapNewForTool(parts[0], parts[1]) : null;
    if (!results) {
      res.status(404).json({ error: 'Unsupported code', query: newQuery });
      return;
    }
    res.json({ direction: 'new_to_old', results });
    return;
  }

  // Format 3: ?section=302&code=IPC (auto-detect direction)
  if (typeof section === 'string' && typeof code === 'string') {
    const forward = mapOldForTool(section, code);
    if (forward) {
      res.json({ direction: 'old_to_new', results: [forward] });
      return;
    }
    const reverse = mapNewForTool(section, code);
    if (reverse) {
      res.json({ direction: 'new_to_old', results: reverse });
      return;
    }
    res.status(404).json({ error: 'Unsupported code', section, code });
    return;
  }

  res.status(400).json({
    error: 'Missing query parameter',
    usage: {
      free_text: 'GET /sections/map?q=302 IPC',
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
 *
 * triable_by (T-289) is the court printed in the BNSS First Schedule, from the
 * signed config/bns-triable-by.json; null means the Schedule gives no single
 * court. It is never inferred from the maximum term.
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
 * Body: { text: "charged under Sections 420, 406 and 120B IPC and Section 154 CrPC" }
 *
 * The bulk converter (free tool only; drafts keep convertOldReferencesInText). Reads
 * lists and "Evidence Act", converts what the signed tables map, and returns a label
 * for every reference, converted or not (T-371 / T-360).
 */
router.post('/convert', async (req: Request, res: Response): Promise<void> => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "text" field in request body' });
    return;
  }

  // T-371 (reviewer): a public route, so the pasted text is capped.
  if (text.length > CONVERT_MAX_CHARS) {
    res.status(413).json({ error: 'Text is too long. Paste up to 20,000 characters at a time.' });
    return;
  }

  const { converted, conversions, references } = convertReferencesForTool(text);
  res.json({ original: text, converted, conversions, references, count: conversions.length });
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

  // T-371: read with the tools' reader (T-277), not split(',').
  const sectionList = readBailInputs(sections);

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

  // Validate date format. T-496: the shared reader, so a partial date
  // ("June 2026", "2026-06") is no date and nothing is computed.
  if (!normalizeDate(arrestDate).ok) {
    res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    return;
  }

  // T-371: read with the tools' reader (T-277), not split(','). Each entry goes to
  // the timeline as "BNS 318(4)", "IPC 420", a bare "318(4)" (BNS in this tool), or
  // "3 of another Act" for an Act the tables do not cover.
  const sectionList = readToolSections(sections).map((e) => {
    if (e.code === null) return e.number;
    const code = TABLE_CODE[e.code];
    return code ? `${code} ${e.number}` : `${e.number} of another Act`;
  });

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
