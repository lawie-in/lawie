/**
 * T-683: the golden-set cassettes 29-38 (scripts/golden-set/fixtures).
 *
 * Each cassette holds a description (and the answers typed on the questions
 * step), the v3 Extractor's recorded replies (one per extraction call: the
 * description turn, then the answers) and the expected ledger. `golden:set
 * --dry-run --stub v3_extract` drives them end to end (phase 2). This test
 * replays each recorded reply through the real validate.ts on the real pack
 * and compares the outcome with the cassette's v3 expectations. No model
 * call. Fictional data only.
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
  /** expect.ledger holds the v2 display forms (what golden:set compares). */
  expect: { ledger: Array<{ key: string; display?: string; unresolved?: boolean }> };
  v3_expect: {
    non_answers?: Array<{ key: string; quote: string }>;
    absent_keys: string[];
    unresolved: string[];
    dropped: Record<string, number>;
    /** key -> the v3 candidate's own form (dates DD.MM.YYYY, money as rupees, lists joined by ', '). */
    values: Record<string, string>;
  };
  recorded: Record<string, { reception: string; extract: string | string[]; drafter: string }>;
}

const files = readdirSync(DIR)
  .filter((n) => /^(29|3[0-8])-.*\.json$/.test(n))
  .sort();
const cassettes: Cassette[] = files.map(
  (n) => JSON.parse(readFileSync(join(DIR, n), 'utf8')) as Cassette,
);
const each = cassettes.map((c) => [c.id, c] as const);

/** The one recorded variant: v3_extract, or v3_extract_blocked (38: Confirm is blocked, which golden:set cannot yet expect). */
const variantOf = (c: Cassette) => Object.values(c.recorded)[0];
const repliesOf = (c: Cassette): string[] => {
  const e = variantOf(c).extract;
  return Array.isArray(e) ? e : [e];
};

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
  const answers = (c.v3_answers ?? []).map((a) => ({
    turn: a.turn,
    askedKeys: a.asked,
    text: a.text,
  }));
  const ctx = { checklist, description: c.description, answers, today: TODAY };
  // One recorded reply per extraction call: the description turn, then the answers.
  const outs = repliesOf(c).map((r) => validateExtraction(parseExtractorJson(r), ctx));
  const candidates = outs.flatMap((o) => o.result.candidates);
  const candKeys = new Set(candidates.map((x) => x.key));
  const dropped: Record<string, number> = {};
  for (const o of outs) {
    for (const [k, n] of Object.entries(o.dropped)) dropped[k] = (dropped[k] ?? 0) + (n ?? 0);
  }
  return {
    pack,
    checklist,
    answers,
    result: {
      candidates,
      nonAnswers: outs.flatMap((o) => o.result.nonAnswers),
      unresolved: [...new Set(outs.flatMap((o) => o.result.unresolved))].filter(
        (k) => !candKeys.has(k),
      ),
      conflicts: outs.flatMap((o) => o.result.conflicts),
    },
    dropped,
  };
}

describe('golden-set cassettes 29-38 (T-683)', () => {
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

  it.each(each)('%s: shape', (_id, c) => {
    expect(c.v3_stage).toBe(1);
    expect(loadRulePack(c.pack)).not.toBeNull();
    const r = variantOf(c);
    expect(typeof r.reception).toBe('string');
    expect(typeof r.drafter).toBe('string');
    for (const reply of repliesOf(c)) expect(parseExtractorJson(reply)).not.toBeNull();
    // One variant, never `clean`: the default dry run skips these cassettes.
    expect(Object.keys(c.recorded)).toHaveLength(1);
    expect(['v3_extract', 'v3_extract_blocked']).toContain(Object.keys(c.recorded)[0]);
    // Only 38 is not run by `--stub v3_extract`: its Confirm is blocked (the signed behaviour).
    expect(Object.keys(c.recorded)[0] === 'v3_extract_blocked').toBe(c.id.startsWith('38-'));
  });

  it.each(each)('%s: recorded replies give the expected candidates', (_id, c) => {
    const { result } = replay(c);
    const want = c.v3_expect.values;
    const got = new Map(result.candidates.map((x) => [x.key, display(x.value, x.type)]));
    for (const [key, value] of Object.entries(want)) {
      expect({ key, value: got.get(key) }).toEqual({ key, value });
    }
    // No candidate beyond the expected ones: nothing invented.
    expect([...got.keys()].sort()).toEqual(Object.keys(want).sort());
    // Every expected value has its harness (v2 display) expectation too.
    expect(
      c.expect.ledger
        .filter((l) => l.display !== undefined)
        .map((l) => l.key)
        .sort(),
    ).toEqual(Object.keys(want).sort());
  });

  it.each(each)('%s: unresolved, non-answers, absent keys and drop counts', (_id, c) => {
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
  });

  it.each(each)('%s: every quote is in the text it names, at most 200 characters', (_id, c) => {
    const { result } = replay(c);
    const texts = new Map<number, string>([[0, c.description]]);
    // Answers are asked once each (turn = edit index + 1): one key per turn.
    for (const a of c.v3_answers ?? []) {
      expect(a.asked).toHaveLength(1);
      texts.set(a.turn, a.text);
    }
    for (const n of result.nonAnswers) expect(n.quote.length).toBeLessThanOrEqual(200);
    for (const x of result.candidates) {
      expect(x.source.quote.length).toBeLessThanOrEqual(200);
      expect(texts.get(x.source.turn)!.normalize('NFC')).toContain(x.source.quote);
      expect(String(x.value)).not.toMatch(/[ऀ-ॿ]/u);
    }
  });

  it.each(each)('%s: no derived key is expected or asked of the model', (_id, c) => {
    const { pack, checklist, answers } = replay(c);
    const keys = extractorLines(pack, checklist, answers).map((l) => l.key);
    expect(keys).not.toContain('amount_in_words');
    expect(keys).not.toContain('custody_since_derived');
    for (const l of c.expect.ledger) {
      expect(['amount_in_words', 'custody_since_derived']).not.toContain(l.key);
    }
  });

  it('phase 2: the harness drives v3 (run.ts sets the fixture stage); 38 is the one cassette it cannot yet express', () => {
    const run = readFileSync(join(DIR, '..', 'run.ts'), 'utf8');
    expect(run).toContain('setFixtureV3Stage');
    // The harness has no "expected: Confirm blocked" assertion, so 38's recording is the v3_extract_blocked variant.
    const c38 = cassettes.find((c) => c.id.startsWith('38-'))!;
    expect(Object.keys(c38.recorded)).toEqual(['v3_extract_blocked']);
  });
});
