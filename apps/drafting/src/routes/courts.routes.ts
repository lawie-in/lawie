import { Router, Request, Response } from 'express';

import { Court } from '../models/Court.model';
import { consumerForum } from '../services/template-engine.service';

const router = Router();

/**
 * T-411: template-scoped court lists.
 *
 * Optional query params, accepted by GET /courts, GET /courts/types and GET /courts/states:
 *   - `template`: a template id. Only templates in TEMPLATE_COURT_FILTER narrow the list.
 *     A missing or unknown template (or one sent more than once) means no filter, i.e.
 *     exactly the pre-T-411 result. Templates' `court_levels` are NOT honoured in general:
 *     the packs use a free vocabulary for them ('transactional', 'magistrate', ...).
 *   - `level`: only read when `template` is in the map; ignored otherwise. For
 *     consumer_complaint one of `district` | `state` | `national` (anything else is a 400).
 *     Levels are classified with consumerForum() from the template engine, so the picker
 *     and the drafted document agree on what a District/State/National Commission is.
 *
 * consumer_complaint matches `courtType: 'consumer_commission'` OR `formattingRulesRef:
 * 'ncdrc'` (NCDRC is stored as courtType 'tribunal', stateId 'india', so a courtType filter
 * alone would miss it). In this mode `type` is ignored (the template decides the type) and,
 * for level=national, `state` is ignored too, so NCDRC is reachable without a state:
 *
 *   GET /courts?template=consumer_complaint&level=national
 *   GET /courts?template=consumer_complaint&level=district&state=bihar
 *   GET /courts?template=consumer_complaint&level=state&state=maharashtra
 *   GET /courts/states?template=consumer_complaint&level=state
 *
 * Responses keep today's shapes ({ courts }, { types }, { states }) and today's fields;
 * formattingRulesRef is read for classification and stripped before the response. No
 * court is ever marked as a default: the user always picks (ADR-021 rule 3).
 */
interface TemplateCourtFilter {
  /** Mongo filter ANDed with `isActive: true`. */
  filter: Record<string, unknown>;
  /** Allowed `level` values, in order. */
  levels: readonly string[];
  /** Levels whose courts are not tied to a state; `state` is ignored for them. */
  stateless: readonly string[];
  /** The court's level, or null if it has none. */
  levelOf: (court: {
    designation: string;
    courtType: string;
    formattingRulesRef: string;
  }) => string | null;
}

const TEMPLATE_COURT_FILTER: ReadonlyMap<string, TemplateCourtFilter> = new Map([
  [
    'consumer_complaint',
    {
      filter: { $or: [{ courtType: 'consumer_commission' }, { formattingRulesRef: 'ncdrc' }] },
      levels: ['district', 'state', 'national'],
      stateless: ['national'],
      levelOf: (court) =>
        consumerForum({
          designation: court.designation,
          courtType: court.courtType,
          formattingRulesRef: court.formattingRulesRef,
          city: '',
          caseNomenclature: '',
        }),
    },
  ],
]);

type TemplateScope =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'scoped'; spec: TemplateCourtFilter; level: string | null };

function templateScope(req: Request): TemplateScope {
  const { template, level } = req.query;
  if (typeof template !== 'string') return { kind: 'none' };
  const spec = TEMPLATE_COURT_FILTER.get(template);
  if (!spec) return { kind: 'none' };
  if (level === undefined || level === '') return { kind: 'scoped', spec, level: null };
  if (typeof level !== 'string' || !spec.levels.includes(level)) {
    return { kind: 'error', message: `level must be one of ${spec.levels.join('|')}` };
  }
  return { kind: 'scoped', spec, level };
}

/** Active courts in scope, sorted by name, with formattingRulesRef read but not returned. */
async function scopedCourts(
  spec: TemplateCourtFilter,
  level: string | null,
  state: unknown,
  fields: string,
) {
  const filter: Record<string, unknown> = { isActive: true, ...spec.filter };
  const stateless = level !== null && spec.stateless.includes(level);
  if (!stateless && typeof state === 'string' && state) {
    filter.stateId = state;
  }
  const courts = await Court.find(filter)
    .select(`${fields} designation courtType formattingRulesRef`)
    .sort({ name: 1 })
    .lean();
  const wanted = level === null ? courts : courts.filter((c) => spec.levelOf(c) === level);
  const requested = new Set(fields.split(/\s+/));
  return wanted.map((c) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === '_id' || requested.has(k)) out[k] = v;
    }
    return out as typeof c;
  });
}

/**
 * GET /courts/states[?template=<id>[&level=<level>]]
 * Returns distinct states that have active courts (in the template's scope, if any; see
 * TEMPLATE_COURT_FILTER above).
 */
router.get('/states', async (req: Request, res: Response): Promise<void> => {
  const scope = templateScope(req);
  if (scope.kind === 'error') {
    res.status(400).json({ error: scope.message });
    return;
  }
  const courts =
    scope.kind === 'scoped'
      ? await scopedCourts(scope.spec, scope.level, undefined, 'state stateId')
      : await Court.find({ isActive: true }).select('state stateId').lean();

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
 * GET /courts/types?state=<stateId>[&template=<id>[&level=<level>]]
 * Returns court types available in a given state. With a scoped template the types are
 * limited to the template's courts, and `state` is not required for a stateless level
 * (consumer_complaint&level=national). No label is added for consumer_commission or
 * tribunal: unknown types fall back to their id, and the UI hides this select in that mode.
 */
router.get('/types', async (req: Request, res: Response): Promise<void> => {
  const { state } = req.query;
  const scope = templateScope(req);
  if (scope.kind === 'error') {
    res.status(400).json({ error: scope.message });
    return;
  }
  const stateless =
    scope.kind === 'scoped' && scope.level !== null && scope.spec.stateless.includes(scope.level);
  if (!stateless && (!state || typeof state !== 'string')) {
    res.status(400).json({ error: 'state query parameter is required' });
    return;
  }

  const courts =
    scope.kind === 'scoped'
      ? await scopedCourts(scope.spec, scope.level, state, 'courtType')
      : await Court.find({ stateId: state, isActive: true }).select('courtType').lean();

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

const LIST_FIELDS =
  'courtId name designation courtType state stateId city caseNomenclature supportedLanguages';

/**
 * GET /courts?state=<stateId>&type=<courtType>[&template=<id>[&level=<level>]]
 * Returns courts matching state and court type filters.
 * All parameters optional — returns all active courts if none provided.
 * With a scoped template (see TEMPLATE_COURT_FILTER above) only that template's courts are
 * returned, `type` is ignored, and `state` is ignored for a stateless level, e.g.
 * /courts?template=consumer_complaint&level=national returns just NCDRC.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const scope = templateScope(req);
  if (scope.kind === 'error') {
    res.status(400).json({ error: scope.message });
    return;
  }
  if (scope.kind === 'scoped') {
    const courts = await scopedCourts(scope.spec, scope.level, req.query.state, LIST_FIELDS);
    res.json({ courts });
    return;
  }

  const filter: Record<string, unknown> = { isActive: true };

  if (req.query.state && typeof req.query.state === 'string') {
    filter.stateId = req.query.state;
  }
  if (req.query.type && typeof req.query.type === 'string') {
    filter.courtType = req.query.type;
  }

  const courts = await Court.find(filter).select(LIST_FIELDS).sort({ name: 1 }).lean();

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
