import { Router, Request, Response } from 'express';

import { Court } from '../models/Court.model';

const router = Router();

/**
 * GET /courts/states
 * Returns distinct states that have active courts.
 */
router.get('/states', async (_req: Request, res: Response): Promise<void> => {
  const courts = await Court.find({ isActive: true }).select('state stateId').lean();

  const stateMap = new Map<string, string>();
  for (const c of courts) {
    if (!stateMap.has(c.stateId)) {
      stateMap.set(c.stateId, c.state);
    }
  }

  const states = Array.from(stateMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ states });
});

/**
 * GET /courts/types?state=<stateId>
 * Returns court types available in a given state.
 */
router.get('/types', async (req: Request, res: Response): Promise<void> => {
  const { state } = req.query;
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'state query parameter is required' });
    return;
  }

  const courts = await Court.find({ stateId: state, isActive: true }).select('courtType').lean();

  const typeSet = new Set(courts.map((c) => c.courtType));

  const TYPE_LABELS: Record<string, string> = {
    high_court: 'High Court',
    sessions: 'Sessions Court',
    district_court: 'District Court',
    cjm: 'Chief Judicial Magistrate',
    jmfc: 'Judicial Magistrate First Class',
    civil_court: 'Civil Court (Senior Division)',
  };

  const types = Array.from(typeSet)
    .map((id) => ({ id, label: TYPE_LABELS[id] ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label));

  res.json({ types });
});

/**
 * GET /courts?state=<stateId>&type=<courtType>
 * Returns courts matching state and court type filters.
 * Both parameters optional — returns all active courts if none provided.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = { isActive: true };

  if (req.query.state && typeof req.query.state === 'string') {
    filter.stateId = req.query.state;
  }
  if (req.query.type && typeof req.query.type === 'string') {
    filter.courtType = req.query.type;
  }

  const courts = await Court.find(filter)
    .select(
      'courtId name designation courtType state stateId city caseNomenclature supportedLanguages',
    )
    .sort({ name: 1 })
    .lean();

  res.json({ courts });
});

/**
 * GET /courts/:courtId
 * Returns a single court with full details including formatting rules.
 */
router.get('/:courtId', async (req: Request, res: Response): Promise<void> => {
  const court = await Court.findOne({ courtId: req.params.courtId, isActive: true }).lean();

  if (!court) {
    res.status(404).json({ error: 'Court not found' });
    return;
  }

  // Load formatting rules
  let formattingRules = null;
  try {
    formattingRules = require(`../config/court-rules/${court.formattingRulesRef}.json`);
  } catch {
    // Formatting rules not found — return court without them
  }

  res.json({ court, formattingRules });
});

export default router;
