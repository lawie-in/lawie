/**
 * T-683 phase 1: the golden-set cassettes 29-38 (scripts/golden-set/fixtures).
 *
 * Each cassette holds a description (and answers), the v3 Extractor's recorded
 * reply (`recorded.v3_extract.extract`) and the expected ledger candidates.
 * Intake is not wired to v3 until phase 2, so `golden:set` cannot drive them
 * yet. This test replays each recorded reply through the real validate.ts on
 * the real pack and compares the outcome with the cassette's expectations.
 * No model call. Fictional data only.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import { extractorLines, parseExtractorJson } from '../../services/v3/extractor.service';
import { validateExtraction } from '../../services/v3/validate';

const DIR = join(__dirname, '../../../../../scripts/golden-set/fixtures');
const TODAY = '2026-10-29';

interface Cassette {
  id: string;
  pack: string;
  description: string;
  v3_stage?: number;
  v3_answers?: Array<{ turn: number; asked: string[]; text: string }>;
  expect: { ledger: Array<{ key: string; display?: string; unresolved?: boolean }> };
  v3_expect: {
    non_answers?: Array<{ key: string; quote: string }>;
    absent_keys: string[];
    unresolved: string[];
    dropped: Record<string, number>;
  };
  recorded: { v3_extract: { reception: string; extract: string; drafter: string } };
}

const files = readdirSync(DIR)
  .filter((n) => /^(29|3[0-8])-.*\.json$/.test(n))
  .sort();
const cassettes: Cassette[] = files.map(
  (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8')) as Cassette,
);

/** The display the harness compares: dates DD.MM.YYYY, money as rupees, lists joined by ', '. */
function display(value: string | string[] | number, type: string): string {
  if (type === 'date') {
    const [y, m, d] = String(value).split('-');
    return `${d}.${m}.${y}`;
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function replay(c: Cassette) {
  const pack = loadRulePack(c.pack)!;
  const checklist = buildChecklist(pack);
  const parsed = parseExtractorJson(c.recorded.v3_extract.extract);
  const out = validateExtraction(parsed, {
    checklist,
    description: c.description,
    answers: (c.v3_answers ?? []).map((a) => ({ turn: a.turn, askedKeys: a.asked, text: a.text })),
    today: TODAY,
  });
  return { pack, checklist, parsed, ...out };
}

describe('golden-set cassettes 29-38 (T-683 phase 1)', () => {
  it('there are exactly ten, 29 to 38, and the T-675/T-679 cases come first', () => {
    expect(files.map((f) => f.slice(0, 2))).toEqual([
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
    ]);
    expect(files.slice(0, 5).every((f) => /^(29|30)-t675|^(31|32|33)-t679/.test(f))).toBe(true);
  });

  it.each(cassettes.map((c) => [c.id, c] as const))('%s: shape', (_id, c) => {
    expect(c.v3_stage).toBe(1);
    expect(loadRulePack(c.pack)).not.toBeNull();
    const r = c.recorded.v3_extract;
    expect(typeof r.reception).toBe('string');
    expect(typeof r.extract).toBe('string');
    expect(typeof r.drafter).toBe('string');
    expect(parseExtractorJson(r.extract)).not.toBeNull();
    // Only the v3_extract variant: the default dry run skips these cassettes.
    expect(Object.keys(c.recorded)).toEqual(['v3_extract']);
  });

  it.each(cassettes.map((c) => [c.id, c] as const))(
    '%s: recorded reply gives the expected candidates',
    (_id, c) => {
      const { result } = replay(c);
      const want = c.expect.ledger.filter((l) => l.display !== undefined);
      const got = new Map(result.candidates.map((x) => [x.key, display(x.value, x.type)]));
      for (const l of want)
        expect({ key: l.key, display: got.get(l.key) }).toEqual({ key: l.key, display: l.display });
      // No candidate beyond the expected ones: nothing invented.
      expect([...got.keys()].sort()).toEqual(want.map((l) => l.key).sort());
    },
  );

  it.each(cassettes.map((c) => [c.id, c] as const))(
    '%s: unresolved, non-answers, absent keys and drop counts',
    (_id, c) => {
      const { result, dropped } = replay(c);
      const wantUnresolved = c.expect.ledger.filter((l) => l.unresolved).map((l) => l.key);
      expect([...result.unresolved].sort()).toEqual([...wantUnresolved].sort());
      expect([...result.unresolved].sort()).toEqual([...c.v3_expect.unresolved].sort());
      expect(result.nonAnswers).toEqual(c.v3_expect.non_answers ?? []);
      for (const k of c.v3_expect.absent_keys) {
        expect(result.candidates.find((x) => x.key === k)).toBeUndefined();
      }
      expect(dropped).toEqual(c.v3_expect.dropped);
      expect(result.conflicts).toEqual([]);
    },
  );

  it.each(cassettes.map((c) => [c.id, c] as const))(
    '%s: every quote is in the text it names and is at most 200 characters',
    (_id, c) => {
      const { result } = replay(c);
      const texts = new Map<number, string>([[0, c.description]]);
      for (const a of c.v3_answers ?? []) texts.set(a.turn, a.text);
      for (const x of [
        ...result.candidates,
        ...result.nonAnswers.map((n) => ({ key: n.key, source: { turn: -1, quote: n.quote } })),
      ]) {
        expect(x.source.quote.length).toBeLessThanOrEqual(200);
      }
      for (const x of result.candidates) {
        expect(texts.get(x.source.turn)!.normalize('NFC')).toContain(x.source.quote);
        expect(String(x.value)).not.toMatch(/[ऀ-ॿ]/u);
      }
    },
  );

  it.each(cassettes.map((c) => [c.id, c] as const))(
    '%s: no derived key is expected or asked of the model',
    (_id, c) => {
      const { pack, checklist } = replay(c);
      const lines = extractorLines(
        pack,
        checklist,
        (c.v3_answers ?? []).map((a) => ({ turn: a.turn, askedKeys: a.asked, text: a.text })),
      );
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain('amount_in_words');
      expect(keys).not.toContain('custody_since_derived');
      for (const l of c.expect.ledger) {
        expect(['amount_in_words', 'custody_since_derived']).not.toContain(l.key);
      }
    },
  );

  it('what a cassette cannot show until phase 2: the harness does not drive v3 yet (v3_stage is inert)', () => {
    // run.ts does not call setFixtureV3Stage, so v3_stage on a fixture changes nothing today.
    const run = readFileSync(join(DIR, '..', 'run.ts'), 'utf8');
    expect(run).not.toContain('setFixtureV3Stage');
  });
});
