/**
 * T-683 strike 3: a candidate that carries a same-turn non-answer quote
 * ("not known, Ramesh") must not be kept as a fact, and the bridge must hold
 * the edit rather than write the non-answer text. Names that merely contain
 * non-answer letters (Nilesh, Narayan, Ram-Kumar) are kept. Pure; fictional data.
 */
import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import { editsFromV3 } from '../../services/v3/v2-bridge';
import { validateExtraction } from '../../services/v3/validate';

const checklist = buildChecklist(loadRulePack('bail_regular')!);
const KEY = 'father_name';

const run = (
  text: string,
  facts: string[],
  nonAnswers: Array<{ quote: string; turn: number }>,
  turns: Array<{ turn: number; text: string }> = [{ turn: 1, text }],
) =>
  validateExtraction(
    {
      facts: facts.map((v) => ({
        key: KEY,
        source: 'answer',
        turn: 1,
        quote: v,
        value: v,
        confidence: 0.97,
      })),
      non_answers: nonAnswers.map((n) => ({
        key: KEY,
        quote: n.quote,
        turn: n.turn,
        source: 'answer',
      })),
      unresolved: [],
    },
    {
      checklist,
      description: '',
      answers: turns.map((t) => ({ turn: t.turn, askedKeys: [KEY], text: t.text })),
      today: '2026-10-29',
    },
  );

describe('T-683 strike 3: candidate containing a non-answer', () => {
  it.each([
    ['not known, Ramesh', 'not known'],
    ['Ramesh, not known', 'not known'],
    ['Ramesh nil', 'nil'],
  ])('candidate-containing-non-answer-quote-loses: %s', (text, quote) => {
    const o = run(text, [text], [{ quote, turn: 1 }]);
    expect(o.result.candidates).toEqual([]);
    expect(o.dropped.contains_non_answer).toBe(1);
    expect(o.result.nonAnswers).toEqual([{ key: KEY, quote }]);
  });

  it('devanagari-partial-non-answer-candidate-dropped', () => {
    const text = 'पता नहीं, Ramesh';
    const o = run(text, [text], [{ quote: 'पता नहीं', turn: 1 }]);
    expect(o.result.candidates).toEqual([]);
    expect((o.dropped.bad_value ?? 0) + (o.dropped.contains_non_answer ?? 0)).toBe(1);
    expect(o.result.nonAnswers).toEqual([{ key: KEY, quote: 'पता नहीं' }]);
  });

  it('separate-clean-candidate-still-wins', () => {
    const o = run(
      'not known, Ramesh',
      ['not known, Ramesh', 'Ramesh'],
      [{ quote: 'not known', turn: 1 }],
    );
    expect(o.result.candidates.map((c) => c.value)).toEqual(['Ramesh']);
    expect(o.result.nonAnswers).toEqual([]);
  });

  it.each([
    ['Nilesh', 'Nil'],
    ['Narayan', 'Na'],
    ['Ram-Kumar', '-'],
  ])('names-containing-non-answer-words-are-kept: %s', (name, quote) => {
    const o = run(name, [name], [{ quote, turn: 1 }]);
    expect(o.result.candidates.map((c) => c.value)).toEqual([name]);
    expect(o.result.nonAnswers).toEqual([]);
    expect(o.dropped.non_answer).toBe(1);
    expect(o.dropped.contains_non_answer ?? 0).toBe(0);
  });

  it('non-answer-dedupe-keeps-per-turn-source', () => {
    const o = run(
      'पता नहीं',
      [],
      [
        { quote: 'पता नहीं', turn: 1 },
        { quote: 'पता नहीं', turn: 2 },
        { quote: 'पता नहीं', turn: 2 },
      ],
      [
        { turn: 1, text: 'पता नहीं' },
        { turn: 2, text: 'पता नहीं' },
      ],
    );
    expect(o.result.nonAnswers).toHaveLength(2);
  });
});

describe('T-683 strike 3: bridge', () => {
  const nonAns = (quote: string) => ({
    candidates: [],
    conflicts: [],
    unresolved: [],
    nonAnswers: [{ key: KEY, quote }],
  });
  const edit = (text: string) => [{ key: KEY, text, fromQuestion: true }];

  it('partial-non-answer-no-candidate-held', () => {
    const e = editsFromV3(edit('not known, Ramesh'), nonAns('not known'), checklist, 2026);
    expect(e.held).toEqual([0]);
    expect(e.edits).toEqual([]);
  });

  it('partial-non-answer-other-turn-does-not-hold-clean-answer', () => {
    const o = run(
      'Ramesh',
      [],
      [{ quote: 'not known', turn: 0 }],
      [
        { turn: 0, text: 'not known' },
        { turn: 1, text: 'Ramesh' },
      ],
    );
    expect(o.result.nonAnswers).toEqual([{ key: KEY, quote: 'not known' }]);
    const e = editsFromV3(edit('Ramesh'), o.result, checklist, 2026);
    expect(e.held).toEqual([]);
    expect(e.edits[0].text).toBe('Ramesh');
  });

  it('names-not-held-by-substring', () => {
    const e = editsFromV3(edit('Nilesh'), nonAns('Nil'), checklist, 2026);
    expect(e.held).toEqual([]);
    expect(e.edits[0].text).toBe('Nilesh');
  });

  it('devanagari end-to-end: validated then editsFromV3 holds the edit', () => {
    const text = 'पता नहीं, Ramesh';
    const o = run(text, [text], [{ quote: 'पता नहीं', turn: 1 }]);
    const e = editsFromV3(edit(text), o.result, checklist, 2026);
    expect(e.held).toEqual([0]);
    expect(e.edits).toEqual([]);
    expect(JSON.stringify(e.edits)).not.toContain('पता नहीं');
  });
});
