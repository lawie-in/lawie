/**
 * T-612 step 2, item (6) (Ajay, 26 Oct 2026): the ledger and the display hold the bare station name
 * ("Kotwali"); the template carries "Police Station". Each draft prints exactly one prefix, whether the
 * ledger is new (bare) or old (the advocate's words).
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  packOptionIds,
  renderDraft,
  skeletonValueLists,
  stripPoliceStationPrefix,
} from '../services/draft-renderer';
import { applyEdit, normalizeForItem } from '../services/fact-ledger.service';
import { buildChecklist } from '../services/intake-brief';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
  replacePlaceholders,
} from '../services/template-engine.service';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';

import { anticipatoryBase, fact, regularBase } from './fixtures/t373';

const REPO = join(__dirname, '..', '..', '..', '..');
const YEAR = 2026;
type PackId = 'bail_regular' | 'bail_anticipatory';
const PACKS: PackId[] = ['bail_regular', 'bail_anticipatory'];

const stationItem = () =>
  buildChecklist(loadRulePack('bail_regular')!).find((i) => i.key === 'police_station')!;

// Ajay T-612 (6a), 27 Oct 2026: one table for storing and rendering.
const KOTWALI_PS = [
  'PS Kotwali',
  'P.S. Kotwali',
  'P S Kotwali',
  'Police Station Kotwali',
  'Kotwali PS',
  'Kotwali P.S.',
  'Kotwali Police Station',
];
const THANA_BHAWAN_MARKED = [
  'PS Thana Bhawan',
  'P.S. Thana Bhawan',
  'Police Station Thana Bhawan',
  'Thana Bhawan PS',
];
/** Typed -> stored display. */
const TABLE: Array<[string, string]> = [
  ...KOTWALI_PS.map((t): [string, string] => [t, 'Kotwali']),
  ...THANA_BHAWAN_MARKED.map((t): [string, string] => [t, 'Thana Bhawan']),
  ['Thana Bhawan', 'Thana Bhawan'],
  ['Thana: Kotwali', 'Kotwali'],
  ['Thana-Kotwali', 'Kotwali'],
  ['थाना - कोतवाली', 'कोतवाली'],
  ['थाना कोतवाली', 'थाना कोतवाली'],
  ['थाना Kotwali', 'थाना Kotwali'],
  // (6b): a trailing Thana/थाना (the last word, a name before it) is stripped once
  ['Kotwali थाना', 'Kotwali'],
  ['Kotwali Thana', 'Kotwali'],
  ['Bhawan thana', 'Bhawan'],
  ['Psalm Nagar', 'Psalm Nagar'],
  ['KotwaliPS', 'KotwaliPS'],
  ['Kotwali', 'Kotwali'],
];

describe('T-612 (6a) normalizeForItem stores the station name with one marker removed', () => {
  it.each(TABLE)('%s -> %s', (text, display) => {
    expect(normalizeForItem(stationItem(), text, YEAR)).toMatchObject({ ok: true, display });
  });

  it.each(TABLE)('an answer "%s" keeps the typed words as raw_span', (text, display) => {
    const out = applyEdit(
      { facts: [], unresolved: [] },
      stationItem(),
      { key: 'police_station', text },
      YEAR,
    );
    const f = out.next!.facts.find((x) => x.key === 'police_station')!;
    expect(f).toMatchObject({ display, raw_span: text });
    expect(out.result).toMatchObject({ status: 'saved', display });
  });

  it('a question answer (from_question) keeps raw_span too', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] },
      stationItem(),
      { key: 'police_station', text: 'Kotwali P.S.', fromQuestion: true },
      YEAR,
    );
    const f = out.next!.facts.find((x) => x.key === 'police_station')!;
    expect(f).toMatchObject({ display: 'Kotwali', raw_span: 'Kotwali P.S.' });
  });
});

describe('T-612 (6b) a marker alone is not a name', () => {
  it.each(['Thana', 'थाना'])('%s is never stripped to nothing', (text) => {
    const n = normalizeForItem(stationItem(), text, YEAR);
    if (n.ok) expect(n.display).toBe(text);
    expect(stripPoliceStationPrefix(text)).toBe(text);
  });
});

describe('T-612 (6a) stripPoliceStationPrefix applies the same table', () => {
  it.each(TABLE)('%s -> %s', (raw, want) => {
    expect(stripPoliceStationPrefix(raw)).toBe(want);
  });
  it('a value already stored bare is left as it is', () => {
    expect(stripPoliceStationPrefix('Thana Bhawan')).toBe('Thana Bhawan');
    expect(stripPoliceStationPrefix('Kotwali')).toBe('Kotwali');
  });
});

// ── Draft: exactly one prefix ───────────────────────────────────────────────

const count = (h: string, n: string) => h.split(n).length - 1;

// ── A new ledger fact, end to end: normalize, store, render ─────────────────

/** The fact a new answer writes: the normalizer's display and value, the typed words as raw_span. */
function storedFact(text: string): LedgerFact {
  const n = normalizeForItem(stationItem(), text, YEAR);
  if (!n.ok) throw new Error(`unreadable: ${text}`);
  return fact('police_station', n.display, {
    type: 'police_station',
    value: n.value as never,
    raw_span: text,
  });
}
function renderFact(packId: PackId, f: LedgerFact): string {
  const pack = loadRulePack(packId)!;
  const skeleton = loadSkeleton(packId)!;
  const lists = loadAvermentLists(packId);
  const base = (packId === 'bail_regular' ? regularBase() : anticipatoryBase()).filter(
    (x) => x.key !== 'police_station',
  );
  return renderDraft({
    skeleton,
    output: null,
    facts: [...base, f],
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  }).body;
}

const TEMPLATE_DATA = {
  currently_in_custody: 'yes_judicial',
  fir_number: '124/2026',
  fir_date: '15/03/2026',
  sections_charged: 'BNS 103',
  facts_narrative: 'Facts.',
  grounds_for_bail: ['false_implication'],
  applicant_name: 'Ram Kumar',
  father_name: 'Shyam Kumar',
  bail_section: '480',
  bail_type_label: 'Regular Bail',
};
/** The prayer section and the AI prompt, filled the way the template path fills them. */
function templateTexts(packId: PackId, station: string): string[] {
  const config = loadTemplateConfig(packId)!;
  const ctx = buildPlaceholderContext(config, { ...TEMPLATE_DATA, police_station: station });
  const out: string[] = [];
  for (const sec of config.document_structure.sections) {
    if (sec.section_id === 'prayer') out.push(renderTemplateSection(sec, ctx).content);
    const prompt = (sec as { prompt_context?: string }).prompt_context;
    if (prompt?.includes('{police_station}')) out.push(replacePlaceholders(prompt, ctx));
  }
  return out;
}

const D1_ONCE: Array<[string, string]> = [
  ...KOTWALI_PS.map((t): [string, string] => [t, 'Police Station Kotwali']),
  ['Thana: Kotwali', 'Police Station Kotwali'],
  ['Thana-Kotwali', 'Police Station Kotwali'],
  ...THANA_BHAWAN_MARKED.map((t): [string, string] => [t, 'Police Station Thana Bhawan']),
  ['Thana Bhawan', 'Police Station Thana Bhawan'],
  ['Kotwali थाना', 'Police Station Kotwali'],
  ['Kotwali Thana', 'Police Station Kotwali'],
  ['Bhawan thana', 'Police Station Bhawan'],
];
const noStrayMarker = (body: string) => {
  expect(body).not.toMatch(/\bPS\b|P\.S\./u);
  expect(body).not.toMatch(/Police Station\s+(?:Police Station|PS|P\.S\.)/u);
};

describe.each(PACKS)('T-612 (6a) %s: D1 prints one prefix', (packId) => {
  it.each(D1_ONCE)('new fact from "%s" prints "%s" once', (text, want) => {
    const body = renderFact(packId, storedFact(text));
    expect(count(body, want)).toBe(1);
    noStrayMarker(body);
  });

  it.each(D1_ONCE)('old-ledger value "%s" prints "%s" once', (text, want) => {
    const body = renderFact(packId, fact('police_station', text, { type: 'police_station' }));
    expect(count(body, want)).toBe(1);
    noStrayMarker(body);
  });

  it('Thana Bhawan never loses its first word', () => {
    for (const t of [...THANA_BHAWAN_MARKED, 'Thana Bhawan']) {
      expect(renderFact(packId, storedFact(t))).not.toContain('Police Station Bhawan');
    }
  });

  it.each(['थाना Kotwali'])(
    'old-ledger "%s" prints "Police Station थाना Kotwali" (accepted by 6a, no migration)',
    (text) => {
      const body = renderFact(packId, fact('police_station', text, { type: 'police_station' }));
      expect(count(body, 'Police Station थाना Kotwali')).toBe(1);
    },
  );

  it.each(['Psalm Nagar', 'KotwaliPS', 'Kotwali'])('"%s" is stored unchanged', (text) => {
    expect(storedFact(text).display).toBe(text);
  });

  // The template path (template-engine.service.ts) still applies the older T-139 rules to RAW values;
  // only stored values are pinned here. Edge cases such as "Thana: Kotwali" or "P S Kotwali" on that
  // path wait for T-638.
  it.todo('template path, raw values (Thana: Kotwali, P S Kotwali, bare Thana Bhawan): T-638');

  it.each([
    ...KOTWALI_PS.filter((t) => t !== 'P S Kotwali').map((t): [string, string] => [
      t,
      'Police Station Kotwali',
    ]),
    ...THANA_BHAWAN_MARKED.map((t): [string, string] => [t, 'Police Station Thana Bhawan']),
  ])('template path, stored value from "%s": prayer and prompt read "%s" once', (text, want) => {
    const texts = templateTexts(packId, storedFact(text).display);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    for (const t of texts) {
      expect(count(t, want)).toBe(1);
      expect(t).not.toMatch(/\bPS\b|P\.S\./u);
    }
  });
});

describe.each(PACKS)('T-612 (6) %s template reads "Police Station {police_station}"', (packId) => {
  const text = readFileSync(join(REPO, 'docs', 'templates', `${packId}.json`), 'utf-8');
  const strings: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') strings.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') Object.values(n).forEach(walk);
  };
  walk(JSON.parse(text));
  const sections = (JSON.parse(text) as { sections?: unknown }).sections;
  void sections;

  it('no string carries "PS {police_station}"', () => {
    expect(strings.filter((s) => s.includes('PS {police_station}'))).toEqual([]);
  });

  it('the prayer and the prompt read "Police Station Kotwali" once filled', () => {
    const withSlot = strings.filter((s) => s.includes('{police_station}'));
    expect(withSlot.length).toBeGreaterThanOrEqual(2);
    const filled = withSlot.filter((s) => s.includes('PRAYER') || s.includes('Generate '));
    expect(filled.length).toBeGreaterThanOrEqual(2);
    for (const s of filled) {
      const out = s.replace(/\{police_station\}/g, 'Kotwali');
      expect(out).toContain('Police Station Kotwali');
      expect(out).not.toMatch(/\bPS Kotwali|P\.S\. Kotwali/);
    }
  });
});
