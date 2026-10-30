/**
 * T-683 strike 3: a candidate that carries a same-turn non-answer quote
 * ("not known, Ramesh") must not be kept as a fact, and the bridge must hold
 * the edit rather than write the non-answer text. Names that merely contain
 * non-answer letters (Nilesh, Narayan, Ram-Kumar) are kept. Pure; fictional data.
 */
import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import { COURTESY_TAIL_WORDS } from '../../config/intake/signed-confirm-messages';
import { editsFromV3 } from '../../services/v3/v2-bridge';
import {
  carriesNonAnswer,
  fieldSpecs,
  isNonAnswerFor,
  validateExtraction,
} from '../../services/v3/validate';

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

  it('devanagari-partial-non-answer-candidate-dropped-as-bad-value', () => {
    const text = 'पता नहीं, Ramesh';
    const o = run(text, [text], [{ quote: 'पता नहीं', turn: 1 }]);
    expect(o.result.candidates).toEqual([]);
    expect(o.dropped.bad_value).toBe(1);
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
    expect(o.dropped.not_a_non_answer).toBe(1);
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

describe('T-683 round 2: signed tails, courtesy words, lists, not-asked keys', () => {
  it.each([
    ['ramesh, Not known', 'Not known.'],
    ['ramesh, nil', 'nil.'],
  ])('punctuated-quote-still-carries: %s', (value, quote) => {
    // carriesNonAnswer trims the quote's edge punctuation. (The pipeline refuses
    // a model quote that still has its full stop as not_a_non_answer: reported.)
    expect(carriesNonAnswer(value, quote)).toBe(true);
    const bare = quote.replace(/\.$/, '');
    const o2 = run(value, [value], [{ quote: bare, turn: 1 }]);
    expect(o2.result.candidates).toEqual([]);
    expect(o2.dropped.contains_non_answer).toBe(1);
  });

  it.each([
    ['Nil-Kanth', 'Nil'],
    ['Na-Young Kim', 'Na'],
    ['Na. Muthukumar', 'Na'],
    ['Not Known Traders', 'not known'],
  ])('signed-names-not-carrying: %s', (name, quote) => {
    const o = run(name, [name], [{ quote, turn: 1 }]);
    expect(o.result.candidates.map((c) => c.value)).toEqual([name]);
    expect(o.dropped.contains_non_answer ?? 0).toBe(0);
    // Bridge, no candidate: written as typed, not held.
    const r = { candidates: [], conflicts: [], unresolved: [], nonAnswers: [{ key: KEY, quote }] };
    const e = editsFromV3([{ key: KEY, text: name, fromQuestion: true }], r, checklist, 2026);
    expect(e.held).toEqual([]);
    expect(e.edits.map((x) => x.text)).toEqual([name]);
  });

  describe('courtesy-tail-non-answers', () => {
    const spec = fieldSpecs(checklist).get(KEY)!;
    it.each([
      'Not known bhai.',
      'पता नहीं जी',
      'not known sir',
      'Not known, sir!',
      "unknown ma'am",
      'nil ok',
      'not known yet',
      'पता नहीं अभी तक',
      'Not known as of now.',
      'unknown as of now',
    ])('isNonAnswerFor true: %s', (t) => {
      expect(isNonAnswerFor(spec, t)).toBe(true);
    });
    it.todo('T-671: Latin Hinglish non-answers (pata nahi) not on the O39 list yet');
    it.each(['Ramesh Bhai', 'Ji Ram', 'Sir', 'Ramesh Kumar', 'Not Known Traders'])(
      'isNonAnswerFor false: %s',
      (t) => {
        expect(isNonAnswerFor(spec, t)).toBe(false);
      },
    );
    it('bridge: "not known sir" is emptied, nothing raw written', () => {
      const text = 'not known sir';
      const o = run(text, [], [{ quote: 'not known', turn: 1 }]);
      const e = editsFromV3([{ key: KEY, text, fromQuestion: true }], o.result, checklist, 2026);
      expect(e.edits.every((x) => x.text === '')).toBe(true);
      expect(JSON.stringify(e.edits)).not.toContain('sir');
    });
    it('bridge: "Ramesh Bhai" is written as typed', () => {
      const o = run('Ramesh Bhai', [], []);
      const e = editsFromV3(
        [{ key: KEY, text: 'Ramesh Bhai', fromQuestion: true }],
        o.result,
        checklist,
        2026,
      );
      expect(e.held).toEqual([]);
      expect(e.edits.map((x) => x.text)).toEqual(['Ramesh Bhai']);
    });
  });

  it('courtesy-list-byte-exact', () => {
    // AJ-683-M2 (handoff/legal/T-511-copy-rulings-ajay.md on origin/develop_staging,
    // not on this branch): hard-coded here (AJ-683-M2: 22 Latin then 9 Devanagari, 31 words; then AJ-671-M2: 8 Latin, 2 Devanagari), in signed order.
    expect([...COURTESY_TAIL_WORDS]).toEqual([
      'sir',
      'sirji',
      'ji',
      'jee',
      'madam',
      "ma'am",
      'maam',
      'mam',
      'saab',
      'saheb',
      'sahab',
      'sahib',
      'bhai',
      'bhaiya',
      'bhaiyya',
      'didi',
      'please',
      'pls',
      'plz',
      'yaar',
      'ok',
      'okay',
      'जी',
      'सर',
      'साहब',
      'साहेब',
      'मैडम',
      'भाई',
      'भैया',
      'दीदी',
      'कृपया',
      // AJ-671-M2 temporal fillers, appended in signed order.
      'yet',
      'as yet',
      'abhi',
      'abhi tak',
      'as of now',
      'at present',
      'currently',
      'for now',
      'अभी',
      'अभी तक',
    ]);
    expect(COURTESY_TAIL_WORDS).toHaveLength(41);
  });

  it('list-candidate-carrying-non-answer-held', () => {
    const LIST = 'sections_charged';
    const go = (text: string, items: string[]) => {
      const o = validateExtraction(
        {
          facts: [
            { key: LIST, source: 'answer', turn: 1, quote: text, value: items, confidence: 0.97 },
          ],
          non_answers: [],
          unresolved: [],
        },
        {
          checklist,
          description: '',
          answers: [{ turn: 1, askedKeys: [LIST], text }],
          today: '2026-10-29',
        },
      );
      expect(o.result.candidates).toHaveLength(1);
      return editsFromV3([{ key: LIST, text, fromQuestion: true }], o.result, checklist, 2026);
    };
    const held = go('not known, Ramesh, Suresh', ['Ramesh', 'Suresh']);
    expect(held.held).toEqual([0]);
    expect(held.edits).toEqual([]);
    const clean = go('Ramesh, Suresh', ['Ramesh', 'Suresh']);
    expect(clean.held).toEqual([]);
    expect(clean.edits).toHaveLength(1);
  });

  it('containment-only-not-asked-key', () => {
    const other = checklist.find((i) => i.key !== KEY)!.key;
    const text = 'not known, Ramesh';
    const o = validateExtraction(
      {
        facts: [
          { key: KEY, source: 'answer', turn: 1, quote: text, value: text, confidence: 0.97 },
        ],
        non_answers: [{ key: KEY, quote: 'not known', turn: 1, source: 'answer' }],
        unresolved: [],
      },
      {
        checklist,
        description: '',
        answers: [{ turn: 1, askedKeys: [other], text }],
        today: '2026-10-29',
      },
    );
    expect(o.result.candidates).toEqual([]);
    expect(o.result.nonAnswers).toEqual([]);
    expect(o.dropped.non_answer_not_asked).toBe(1);
    expect(o.dropped.contains_non_answer).toBe(1);
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
