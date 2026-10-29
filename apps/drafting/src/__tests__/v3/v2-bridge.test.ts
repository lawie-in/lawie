/**
 * T-683 review round 1: services/v3/v2-bridge.ts on results built the way
 * production builds them (through validateExtraction, so each candidate
 * carries its provenance). Pure: no model, no DB. Fictional data only.
 */
import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import {
  bridgeable,
  briefReadsFromV3,
  countNonVerbatim,
  editsFromV3,
  v2ExtractionFromV3,
} from '../../services/v3/v2-bridge';
import type { ExtractResult } from '../../services/v3/types';
import { validateExtraction } from '../../services/v3/validate';

const REF_YEAR = 2026;
const checklist = buildChecklist(loadRulePack('bail_regular')!);
const item = (key: string) => checklist.find((i) => i.key === key)!;

interface MF {
  key: string;
  value: unknown;
  quote: string;
  source?: 'description' | 'answer';
  turn?: number;
}
function validated(
  facts: MF[],
  ctx: {
    description?: string;
    answers?: Array<{ turn: number; askedKeys: string[]; text: string }>;
    non_answers?: Array<{ key: string; quote: string; turn: number }>;
  } = {},
): ExtractResult {
  return validateExtraction(
    {
      facts: facts.map((f) => ({
        key: f.key,
        source: f.source ?? 'description',
        turn: f.turn ?? 0,
        quote: f.quote,
        value: f.value,
        confidence: 0.97,
      })),
      non_answers: (ctx.non_answers ?? []).map((n) => ({ ...n, source: 'answer' })),
      unresolved: [],
    },
    {
      checklist,
      description: ctx.description ?? '',
      answers: ctx.answers ?? [],
      today: '2026-10-29',
    },
  ).result;
}
const ans = (turn: number, key: string, text: string) => ({ turn, askedKeys: [key], text });

describe('bridge: a stale answer never overwrites a new one (round 1, finding 1)', () => {
  const stale = validated(
    [{ key: 'named_in_fir', value: 'No', quote: 'नहीं', source: 'answer', turn: 1 }],
    { answers: [ans(1, 'named_in_fir', 'नहीं')] },
  );

  it('the old reading itself is a No from "नहीं" (control)', () => {
    expect(stale.candidates).toHaveLength(1);
    expect(bridgeable(stale.candidates[0], 'नहीं', item('named_in_fir'), REF_YEAR, true)).toBe(
      'No',
    );
  });

  it('against a new edit "haan" the old No is not bridgeable', () => {
    expect(
      bridgeable(stale.candidates[0], 'haan', item('named_in_fir'), REF_YEAR, true),
    ).toBeNull();
  });

  it('editsFromV3: the old No is held, never written over the new "haan"', () => {
    const out = editsFromV3(
      [{ key: 'named_in_fir', text: 'haan', fromQuestion: true }],
      stale,
      checklist,
      REF_YEAR,
    );
    expect(out.held).toEqual([0]);
    expect(out.edits).toEqual([]);
    expect(out.replaced).toBe(0);
  });

  it('the same holds for every answer type: a text value whose quote is not in the edit', () => {
    const old = validated(
      [{ key: 'applicant_occupation', value: 'Mason', quote: 'Mason', source: 'answer', turn: 1 }],
      { answers: [ans(1, 'applicant_occupation', 'Mason')] },
    );
    expect(
      bridgeable(old.candidates[0], 'Welder', item('applicant_occupation'), REF_YEAR, true),
    ).toBeNull();
    expect(
      bridgeable(old.candidates[0], 'Mason', item('applicant_occupation'), REF_YEAR, true),
    ).toBe('Mason');
  });
});

describe('bridge: a partial non-answer does not empty the edit (round 1, finding 4)', () => {
  const nonAnswerOnly = validated([], {
    answers: [ans(1, 'father_name', 'पता नहीं, Ramesh')],
    non_answers: [{ key: 'father_name', quote: 'पता नहीं', turn: 1 }],
  });

  it('the validator keeps the non-answer for its quote', () => {
    expect(nonAnswerOnly.nonAnswers).toEqual([{ key: 'father_name', quote: 'पता नहीं' }]);
  });

  it('"पता नहीं, Ramesh" is not emptied: it goes in as typed, Ramesh kept', () => {
    const out = editsFromV3(
      [{ key: 'father_name', text: 'पता नहीं, Ramesh', fromQuestion: true }],
      nonAnswerOnly,
      checklist,
      REF_YEAR,
    );
    expect(out.nonAnswers).toBe(0);
    expect(out.held).toEqual([]);
    expect(out.edits).toEqual([
      { key: 'father_name', text: 'पता नहीं, Ramesh', fromQuestion: true },
    ]);
  });

  it('the whole edit as the non-answer ("पता नहीं") is still emptied (control)', () => {
    const whole = validated([], {
      answers: [ans(1, 'father_name', 'पता नहीं')],
      non_answers: [{ key: 'father_name', quote: 'पता नहीं', turn: 1 }],
    });
    const out = editsFromV3(
      [{ key: 'father_name', text: 'पता नहीं', fromQuestion: true }],
      whole,
      checklist,
      REF_YEAR,
    );
    expect(out.nonAnswers).toBe(1);
    expect(out.edits).toEqual([{ key: 'father_name', text: '', fromQuestion: true }]);
  });
});

describe('bridge: a value-only non-answer never wipes a real answer (round 1, finding 2)', () => {
  it('quote "Rahul Sharma", value "Not known": the edit is not emptied, the name goes in as typed', () => {
    const r = validated(
      [
        {
          key: 'applicant_name',
          value: 'Not known',
          quote: 'Rahul Sharma',
          source: 'answer',
          turn: 1,
        },
      ],
      { answers: [ans(1, 'applicant_name', 'Rahul Sharma')] },
    );
    expect(r.nonAnswers).toEqual([]);
    expect(r.unresolved).toEqual(['applicant_name']);
    const out = editsFromV3(
      [{ key: 'applicant_name', text: 'Rahul Sharma', fromQuestion: true }],
      r,
      checklist,
      REF_YEAR,
    );
    expect(out.nonAnswers).toBe(0);
    expect(out.held).toEqual([]);
    expect(out.edits).toEqual([
      { key: 'applicant_name', text: 'Rahul Sharma', fromQuestion: true },
    ]);
  });

  it('on the description: no candidate, no non-answer, the key is asked again (no read, no wipe of the text)', () => {
    const description = 'Bail for Rahul Sharma.';
    const r = validated([{ key: 'applicant_name', value: 'Not known', quote: 'Rahul Sharma' }], {
      description,
    });
    const v2 = v2ExtractionFromV3(r, description, checklist, REF_YEAR);
    expect(v2.facts).toEqual([]);
    const brief = briefReadsFromV3(r, v2.notBridged, v2.spans);
    expect(brief.ask.has('applicant_name')).toBe(true);
    expect(brief.noRead.has('applicant_name')).toBe(true);
    expect([...brief.values.values()].map((v) => String(v.value))).not.toContain('Not known');
  });
});

describe('bridge: raw Latin Hinglish is never bridged as verbatim (round 1, finding 5)', () => {
  it('a text value copied raw from a Latin Hinglish quote is held on an answer', () => {
    const text = 'Koi recovery nahi hui';
    const r = validated(
      [{ key: 'recovery_status', value: text, quote: text, source: 'answer', turn: 1 }],
      { answers: [ans(1, 'recovery_status', text)] },
    );
    expect(r.candidates).toHaveLength(1);
    expect(bridgeable(r.candidates[0], text, item('recovery_status'), REF_YEAR, true)).toBeNull();
    const out = editsFromV3(
      [{ key: 'recovery_status', text, fromQuestion: true }],
      r,
      checklist,
      REF_YEAR,
    );
    expect(out.held).toEqual([0]);
    expect(out.edits).toEqual([]);
  });

  it('on the description it is not bridged either: the key is asked, nothing is written', () => {
    const description = 'Koi recovery nahi hui is case mein.';
    const r = validated(
      [{ key: 'recovery_status', value: 'Koi recovery nahi hui', quote: 'Koi recovery nahi hui' }],
      { description },
    );
    const v2 = v2ExtractionFromV3(r, description, checklist, REF_YEAR);
    expect(v2.facts).toEqual([]);
    expect(v2.notBridged.has('recovery_status')).toBe(true);
    expect(countNonVerbatim(r, checklist, description, [], REF_YEAR)).toBe(1);
  });

  it('English prose with "no" is written as typed (control)', () => {
    const text = 'No recovery was made';
    const r = validated(
      [{ key: 'recovery_status', value: text, quote: text, source: 'answer', turn: 1 }],
      { answers: [ans(1, 'recovery_status', text)] },
    );
    expect(bridgeable(r.candidates[0], text, item('recovery_status'), REF_YEAR, true)).toBe(text);
  });
});

describe('bridge: brief and ledger hold the same characters (round 1, finding 7)', () => {
  it.each([
    ['applicant_name', 'RAMESH SHARMA', 'Bail for RAMESH SHARMA of Indore.', 'Ramesh Sharma'],
    ['applicant_name', 'ramesh sharma', 'Bail for ramesh sharma of Indore.', 'Ramesh Sharma'],
    ['applicant_occupation', 'MASON', 'The applicant works as MASON.', 'Mason'],
  ])(
    '%s: the brief shows the user span, as the ledger gets it, not the model case',
    (key, quote, description, modelValue) => {
      const r = validated([{ key, value: modelValue, quote }], { description });
      expect(r.candidates).toHaveLength(1);
      const v2 = v2ExtractionFromV3(r, description, checklist, REF_YEAR);
      expect(v2.notBridged.size).toBe(0);
      const ledgerSpan = v2.facts.find((f) => f.key === key)!.span;
      expect(ledgerSpan).toBe(quote);
      expect(description).toContain(ledgerSpan);
      const brief = briefReadsFromV3(r, v2.notBridged, v2.spans);
      expect(brief.values.get(key)!.value).toBe(ledgerSpan);
      expect(brief.values.get(key)!.value).not.toBe(modelValue);
    },
  );

  it('with no spans passed (an old caller) the brief falls back to the candidate value', () => {
    const description = 'Bail for RAMESH SHARMA of Indore.';
    const r = validated(
      [{ key: 'applicant_name', value: 'Ramesh Sharma', quote: 'RAMESH SHARMA' }],
      { description },
    );
    expect(briefReadsFromV3(r).values.get('applicant_name')!.value).toBe('Ramesh Sharma');
  });
});
