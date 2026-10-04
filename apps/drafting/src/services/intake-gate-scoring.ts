/**
 * T-113 — pure scoring for the intake gate (ADR-019 §5). No I/O, no env.
 * Used by scripts/intake-gate.ts and its tests. Lives in src/ so tsc builds it.
 */
import { normalise } from './intake.service';

export interface GateItem {
  id: string;
  description: string;
  expected: string;
  also_ok?: string[];
  court?: boolean;
  language?: string;
}

export interface ItemResult {
  id: string;
  expected: string;
  outcome: string;
  template_id?: string;
  choices?: string[];
  verdict: 'pass' | 'confident_wrong' | 'asked_choice' | 'wrong_outcome' | 'unavailable' | 'error';
  unquotedValues: string[];
  httpStatus: number;
}

const MIN = { total: 150, courtNoTemplate: 30, noMatch: 20 };

/** Composition rules from the ticket. Returns problems; empty means the set qualifies. */
export function checkComposition(items: GateItem[], templateIds: string[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const it of items) {
    if (!it.id || typeof it.description !== 'string' || !it.expected)
      problems.push(`item ${it.id ?? '?'}: id, description and expected are required`);
    if (ids.has(it.id)) problems.push(`duplicate id ${it.id}`);
    ids.add(it.id);
    const okExpected =
      ['guided_strict', 'guided_light', 'no_match'].includes(it.expected) ||
      templateIds.includes(it.expected);
    if (!okExpected)
      problems.push(`item ${it.id}: expected "${it.expected}" is not a template id or an outcome`);
  }
  if (items.length < MIN.total)
    problems.push(`${items.length} descriptions, need at least ${MIN.total}`);
  const covered = new Set(items.map((i) => i.expected));
  const uncovered = templateIds.filter((t) => !covered.has(t));
  if (uncovered.length > 0)
    problems.push(
      `${uncovered.length} templates have no description: ${uncovered.slice(0, 10).join(', ')}${uncovered.length > 10 ? ', …' : ''}`,
    );
  const courtNoTemplate = items.filter(
    (i) => i.expected === 'guided_strict' && i.court !== false,
  ).length;
  if (courtNoTemplate < MIN.courtNoTemplate)
    problems.push(
      `${courtNoTemplate} court requests with no template, need at least ${MIN.courtNoTemplate}`,
    );
  const noMatch = items.filter((i) => i.expected === 'no_match').length;
  if (noMatch < MIN.noMatch)
    problems.push(`${noMatch} not-legal-drafting descriptions, need at least ${MIN.noMatch}`);
  if (!items.some((i) => i.language === 'hi' || i.language === 'mixed'))
    problems.push('no Hindi or mixed-language descriptions');
  return problems;
}

/** Gate 3 — every value read from the description must carry a quote that is in the description. */
export function unquotedValues(
  description: string,
  fields: Record<string, { source?: string; quote?: string }> | undefined,
): string[] {
  if (!fields) return [];
  const d = normalise(description);
  return Object.entries(fields)
    .filter(([, v]) => v.source !== 'user')
    .filter(
      ([, v]) =>
        typeof v.quote !== 'string' ||
        normalise(v.quote).length < 2 ||
        !d.includes(normalise(v.quote)),
    )
    .map(([k]) => k);
}

export function judge(item: GateItem, status: number, body: Record<string, unknown>): ItemResult {
  const outcome = String(body.outcome ?? (status === 429 ? 'rate_limited' : 'error'));
  const template = typeof body.template_id === 'string' ? body.template_id : undefined;
  const choices = Array.isArray(body.choices)
    ? (body.choices as Array<{ template_id: string }>).map((c) => c.template_id)
    : undefined;
  const okTemplates = new Set([item.expected, ...(item.also_ok ?? [])]);
  const isTemplateExpected = !['guided_strict', 'guided_light', 'no_match'].includes(item.expected);

  let verdict: ItemResult['verdict'];
  if (status !== 200) verdict = 'error';
  else if (outcome === 'unavailable') verdict = 'unavailable';
  else if (outcome === 'matched')
    verdict = template && okTemplates.has(template) ? 'pass' : 'confident_wrong';
  else if (outcome === 'needs_choice')
    verdict =
      isTemplateExpected && choices?.some((c) => okTemplates.has(c))
        ? 'asked_choice'
        : 'wrong_outcome';
  else if (outcome === 'guided')
    verdict = item.expected.startsWith('guided') ? 'pass' : 'wrong_outcome';
  else if (outcome === 'no_match')
    verdict = item.expected === 'no_match' ? 'pass' : 'wrong_outcome';
  else verdict = 'error';

  return {
    id: item.id,
    expected: item.expected,
    outcome,
    template_id: template,
    choices,
    verdict,
    unquotedValues: unquotedValues(
      item.description,
      body.fields as Record<string, { source?: string; quote?: string }> | undefined,
    ),
    httpStatus: status,
  };
}

export function summarise(results: ItemResult[]) {
  const n = results.length || 1;
  const confidentWrong = results.filter((r) => r.verdict === 'confident_wrong').length;
  const unquoted = results.filter((r) => r.unquotedValues.length > 0).length;
  const gate1 = confidentWrong / n <= 0.02;
  const gate3 = unquoted === 0;
  return {
    items: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    askedChoice: results.filter((r) => r.verdict === 'asked_choice').length,
    confidentWrong,
    confidentWrongRate: Number((confidentWrong / n).toFixed(4)),
    wrongOutcome: results.filter((r) => r.verdict === 'wrong_outcome').length,
    unavailableOrError: results.filter((r) => r.verdict === 'unavailable' || r.verdict === 'error')
      .length,
    gates: {
      gate1_confident_wrong_at_most_2pct: gate1 ? 'pass' : 'fail',
      gate2_no_court_request_in_light_mode: 'not measurable until T-105 (modes do not exist yet)',
      gate3_no_value_without_matching_quote: gate3 ? 'pass' : 'fail',
      gate4_no_invented_facts_in_guided_drafts:
        'not measurable until T-106 (guided drafts do not exist yet)',
    },
    // Errors/unavailable mean the run itself is not a valid measurement.
    verdict:
      gate1 && gate3 && results.every((r) => r.verdict !== 'error' && r.verdict !== 'unavailable')
        ? 'gates 1 and 3 pass'
        : ('gate not passed' as string),
  };
}
