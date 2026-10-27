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
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';

import { anticipatoryBase, fact, regularBase } from './fixtures/t373';

const REPO = join(__dirname, '..', '..', '..', '..');
const YEAR = 2026;
type PackId = 'bail_regular' | 'bail_anticipatory';
const PACKS: PackId[] = ['bail_regular', 'bail_anticipatory'];

const SPELLINGS = [
  'PS Kotwali',
  'P.S. Kotwali',
  'Police Station Kotwali',
  'थाना Kotwali',
  'Kotwali PS',
  'Kotwali P.S.',
  'Kotwali Police Station',
  'Kotwali थाना',
];

const stationItem = () =>
  buildChecklist(loadRulePack('bail_regular')!).find((i) => i.key === 'police_station')!;

describe('T-612 (6) normalizeForItem stores the bare station name', () => {
  it.each(SPELLINGS)('%s -> display Kotwali, value kotwali', (text) => {
    const n = normalizeForItem(stationItem(), text, YEAR);
    expect(n).toMatchObject({ ok: true, display: 'Kotwali', value: 'kotwali' });
  });

  it.each([
    ['Psalm Nagar', 'Psalm Nagar'],
    ['KotwaliPS', 'KotwaliPS'],
    ['Kotwali', 'Kotwali'],
    ['Thana Bhawan PS', 'Thana Bhawan'],
  ])('%s -> %s', (text, display) => {
    const n = normalizeForItem(stationItem(), text, YEAR);
    expect(n).toMatchObject({ ok: true, display });
  });

  it.each(SPELLINGS)('an answer "%s" keeps the typed words as raw_span', (text) => {
    const out = applyEdit(
      { facts: [], unresolved: [] },
      stationItem(),
      { key: 'police_station', text },
      YEAR,
    );
    const f = out.next!.facts.find((x) => x.key === 'police_station')!;
    expect(f.display).toBe('Kotwali');
    expect(f.value).toBe('kotwali');
    expect(f.raw_span).toBe(text);
    expect(out.result).toMatchObject({ status: 'saved', display: 'Kotwali' });
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

describe('T-612 (6) stripPoliceStationPrefix reads an old ledger', () => {
  it.each(SPELLINGS)('%s -> Kotwali', (raw) => {
    expect(stripPoliceStationPrefix(raw)).toBe('Kotwali');
  });
  it('the bare name stays', () => {
    expect(stripPoliceStationPrefix('Kotwali')).toBe('Kotwali');
  });
  it('existing behaviour holds: Thana-Kotwali loses its prefix, Psalm Nagar does not', () => {
    expect(stripPoliceStationPrefix('Thana-Kotwali')).toBe('Kotwali');
    expect(stripPoliceStationPrefix('Psalm Nagar')).toBe('Psalm Nagar');
  });
  it('a trailing marker on a longer name goes', () => {
    expect(stripPoliceStationPrefix('Thana Bhawan PS')).toBe('Thana Bhawan');
  });
});

// ── Draft: exactly one prefix ───────────────────────────────────────────────

function render(packId: PackId, station: string) {
  const pack = loadRulePack(packId)!;
  const skeleton = loadSkeleton(packId)!;
  const lists = loadAvermentLists(packId);
  const base = (packId === 'bail_regular' ? regularBase() : anticipatoryBase()).filter(
    (f) => f.key !== 'police_station',
  );
  const facts: LedgerFact[] = [
    ...base,
    fact('police_station', station, { type: 'police_station' }),
  ];
  return renderDraft({
    skeleton,
    output: null,
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  }).body;
}
const count = (h: string, n: string) => h.split(n).length - 1;

describe.each(PACKS)('T-612 (6) %s prints one "Police Station Kotwali"', (packId) => {
  // old ledgers hold the advocate's words; new ones the bare name
  it.each([...SPELLINGS, 'Kotwali'])('ledger display "%s"', (display) => {
    const body = render(packId, display);
    expect(count(body, 'Police Station Kotwali')).toBe(1);
    expect(body).not.toMatch(/\bPS\b|P\.S\.|थाना/u);
    expect(body).not.toMatch(/Police Station\s+(?:Police Station|PS|P\.S\.|थाना)/u);
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
