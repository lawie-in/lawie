/**
 * T-200 — the missing-clause check looks at the clause, not only its
 * paragraph number. Rule R0 to R3 and the per-pack cue map, signed by Ajay
 * (CLO) on 11 and 12 Oct 2026.
 *
 * Pure tests of findMissingClauses; the end-to-end test is in
 * t200-repair-end-to-end.test.ts.
 */
import { createHash } from 'crypto';

import {
  CLAUSES_MARKER,
  findMissingClauses,
  paragraphTexts,
  splitDrafterOutput,
} from '../services/brief-drafter';
import {
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import type { Brief } from '../services/intake-brief';
import { loadRulePack, RulePack, RulePackClause } from '../services/rule-pack.service';

function clause(id: string, extra: Partial<RulePackClause> = {}): RulePackClause {
  return {
    id,
    title: `Title of ${id}`,
    detail: null,
    fixedText: null,
    required: true,
    appliesWhen: null,
    statutoryBasis: null,
    parts: [],
    extra: {},
    ...extra,
  };
}

const BASE = loadRulePack('bail_regular') as RulePack;
const packOf = (id: string, clauses: RulePackClause[]): RulePack => ({
  ...BASE,
  id,
  mandatoryClauses: clauses,
});

/** A draft: paragraphs by number, and the report lines. */
function draft(paras: Record<number, string>, lines: string) {
  const body = Object.entries(paras)
    .map(([n, t]) => `${n}. ${t}`)
    .join('\n\n');
  return splitDrafterOutput(`${body}\n\n${CLAUSES_MARKER}\n${lines}`);
}

const briefWithFir = (value: string): Brief =>
  ({ items: [{ key: 'fir_number', value }], still_unknown: [] }) as unknown as Brief;
const BRIEF = briefWithFir('124/2026');

/** The reasons for one clause on a one-clause pack. */
function reasons(
  packId: string,
  id: string,
  text: string,
  context: Parameters<typeof findMissingClauses>[3] = {},
  report = '1',
  extra: Record<number, string> = {},
) {
  const out = draft({ 1: text, ...extra }, `${id}: ${report}`);
  return findMissingClauses(packOf(packId, [clause(id)]), out, [], context).map((m) => m.reason);
}

describe('T-200 AC2, AC3: a reported paragraph that exists but no longer carries the clause', () => {
  const earlier = clause('earlier_applications');
  const pack = packOf('bail_regular', [earlier]);
  const FILLER = (n: number) => `That the applicant has deep roots in society (${n}).`;
  const body = (five: string) => ({
    1: FILLER(1),
    2: FILLER(2),
    3: FILLER(3),
    4: FILLER(4),
    5: five,
  });

  it('earlier_applications at paragraph 5, with its cue words: present', () => {
    const out = draft(
      body('That no earlier bail application has been filed.'),
      'earlier_applications: 5',
    );
    expect(findMissingClauses(pack, out, [])).toEqual([]);
  });

  it('earlier_applications at paragraph 5, paragraph 5 replaced by other text: missing, clause_not_in_paragraph', () => {
    const out = draft(
      body('That the applicant is the only earning member.'),
      'earlier_applications: 5',
    );
    expect(findMissingClauses(pack, out, [])).toEqual([
      {
        id: 'earlier_applications',
        title: 'Title of earlier_applications',
        reason: 'clause_not_in_paragraph',
      },
    ]);
  });

  it('grounds at paragraph 5, paragraph 5 replaced: missing, clause_not_in_paragraph', () => {
    const p = packOf('bail_regular', [clause('grounds')]);
    const has = draft(body('That the grounds are set out below.'), 'grounds: 5');
    expect(findMissingClauses(p, has, [])).toEqual([]);
    const replaced = draft(body('That the applicant is the only earning member.'), 'grounds: 5');
    expect(findMissingClauses(p, replaced, []).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('a clause with fixed wording at paragraph 5, paragraph 5 replaced: missing, clause_not_in_paragraph', () => {
    const fixed = clause('recital', {
      fixedText: 'The parties agree to keep information secret {{x}} and shall never disclose it.',
    });
    const p = packOf('nda', [fixed]);
    const whole =
      'The parties agree to keep information secret for ever and shall never disclose it.';
    expect(findMissingClauses(p, draft({ 1: FILLER(1), 5: whole }, 'recital: 5'), [])).toEqual([]);
    // paragraph 5 replaced; the first half of the wording survives elsewhere, so it is only partly found
    const replaced = draft(
      {
        1: FILLER(1),
        2: 'The parties agree to keep information secret.',
        5: 'Other text altogether.',
      },
      'recital: 5',
    );
    expect(findMissingClauses(p, replaced, []).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
    // paragraph 5 replaced and the wording nowhere: wording_not_found
    const gone = draft({ 1: FILLER(1), 5: 'Other text altogether.' }, 'recital: 5');
    expect(findMissingClauses(p, gone, []).map((m) => m.reason)).toEqual(['wording_not_found']);
  });

  it('paragraphTexts gives the text of each paragraph without its number', () => {
    const t = paragraphTexts('1. First one.\n\n2. Second one,\nover two lines.\n\n3. Third.');
    expect([...t.keys()]).toEqual([1, 2, 3]);
    expect(t.get(2)?.trim()).toBe('Second one,\nover two lines.');
  });
});

describe('T-200 R1: clauses with fixed wording', () => {
  const FIXED =
    'The Receiving Party shall hold the Confidential Information {{scope}} and shall not disclose it to anyone.';
  const A = 'The Receiving Party shall hold the Confidential Information';
  const B = 'and shall not disclose it to anyone.';
  const p = packOf('nda', [clause('conf', { fixedText: FIXED })]);
  const run = (paras: Record<number, string>, report: string, ctx = {}) =>
    findMissingClauses(p, draft(paras, `conf: ${report}`), [], ctx).map((m) => m.reason);

  it('R1.2: the wording in the reported paragraph is present', () => {
    expect(run({ 1: 'Intro.', 2: `${A} in strict confidence ${B}` }, '2')).toEqual([]);
  });

  it('R1.2: the wording read across several reported paragraphs together is present', () => {
    expect(run({ 1: A, 2: B }, '1, 2')).toEqual([]);
  });

  it('R1.3: complete and in order in one other paragraph: re-pointed, present, no repair', () => {
    expect(run({ 1: 'Intro paragraph here.', 2: `${A} in confidence ${B}` }, '1')).toEqual([]);
  });

  it('R1.4: the wording is nowhere in the body: wording_not_found', () => {
    expect(run({ 1: 'The parties want to work together.' }, '1')).toEqual(['wording_not_found']);
  });

  it('R1.5: found only in part: clause_not_in_paragraph', () => {
    expect(run({ 1: 'Intro paragraph here.', 2: `${A} in confidence.` }, '1')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('R1.5: split across paragraphs that were not reported: clause_not_in_paragraph', () => {
    expect(run({ 1: 'Intro paragraph here.', 2: A, 3: B }, '1')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('R1.5: the stretches in the wrong order: clause_not_in_paragraph', () => {
    expect(run({ 1: 'Intro paragraph here.', 2: `${B} then ${A}` }, '1')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('R1.6: wording with no stretch of 12 characters falls to R2, no longer an automatic pass', () => {
    const short = packOf('nda', [clause('tiny', { fixedText: 'Short {{x}} text' })]);
    const recorded = new Map<string, string>();
    const first = draft({ 1: 'Anything at all.' }, 'tiny: 1');
    expect(findMissingClauses(short, first, [], { recorded })).toEqual([]);
    expect(recorded.has('tiny')).toBe(true);
    const later = draft({ 1: 'Something else entirely.' }, 'tiny: 1');
    expect(findMissingClauses(short, later, [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('R1.7: a draft that is not in English is not tested for the wording; R2 applies and the clause is listed', () => {
    for (const language of ['hi', 'bilingual'] as const) {
      const notChecked = new Map<string, string>();
      const recorded = new Map<string, string>();
      const out = draft({ 1: 'पक्षकार गोपनीयता बनाए रखेंगे।' }, 'conf: 1');
      expect(findMissingClauses(p, out, [], { language, notChecked, recorded })).toEqual([]);
      expect([...notChecked]).toEqual([['conf', 'Title of conf']]);
      // R2b: the second check sees a changed paragraph
      const changed = draft({ 1: 'कुछ और पाठ।' }, 'conf: 1');
      expect(
        findMissingClauses(p, changed, [], { language, notChecked, recorded }).map((m) => m.reason),
      ).toEqual(['clause_not_in_paragraph']);
    }
  });

  it('R1.7: English drafts list nothing in notChecked', () => {
    const notChecked = new Map<string, string>();
    run({ 1: `${A} in confidence ${B}` }, '1', { language: 'en', notChecked });
    expect(notChecked.size).toBe(0);
  });
});

describe('T-200 R2a: cues', () => {
  const earlier = (text: string) => reasons('bail_regular', 'earlier_applications', text);

  it('all: the bail list and the earlier list must each be met', () => {
    expect(earlier('No earlier bail application has been filed.')).toEqual([]);
    expect(earlier('The earlier matter was heard.')).toEqual(['clause_not_in_paragraph']);
    expect(earlier('The applicant seeks bail.')).toEqual(['clause_not_in_paragraph']);
  });

  it('the word "first" alone is not a cue (T-136 B4)', () => {
    expect(earlier('This is the first bail application of the applicant.')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('any: one entry of the list is enough', () => {
    for (const w of ['custody', 'arrest', 'jail']) {
      expect(reasons('bail_regular', 'custody_status', `He is in ${w}.`)).toEqual([]);
    }
    expect(reasons('bail_regular', 'custody_status', 'He is a free man.')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('the cue may be in any one of several reported paragraphs', () => {
    const out = draft({ 1: 'Nothing here.', 2: 'The grounds are these.' }, 'grounds: 1, 2');
    expect(findMissingClauses(packOf('bail_regular', [clause('grounds')]), out, [])).toEqual([]);
  });

  it('Hindi cues match, including both spellings of गिरफ्तार', () => {
    const nukta = 'आवेदक को गिरफ़्तार किया गया।';
    const plain = 'आवेदक को गिरफ्तार किया गया।';
    expect(reasons('bail_regular', 'custody_status', nukta)).toEqual([]);
    expect(reasons('bail_regular', 'custody_status', plain)).toEqual([]);
    expect(reasons('bail_regular', 'custody_status', 'हिरासत में है।')).toEqual([]);
    expect(reasons('bail_regular', 'grounds', 'निवेदन है कि जमानत दी जाए।')).toEqual([]);
    expect(reasons('bail_regular', 'no_flight_risk', 'आवेदक आश्वासन देता है।')).toEqual([]);
    expect(
      reasons('bail_regular', 'earlier_applications', 'पूर्व में कोई जमानत आवेदन नहीं।'),
    ).toEqual([]);
    expect(reasons('bail_regular', 'custody_status', 'आवेदक एक नागरिक है।')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('{{fir_number}} resolves from the brief', () => {
    const text = 'That FIR No. 124/2026 was registered at PS Kotwali.';
    expect(reasons('bail_regular', 'fir_details', text, { brief: BRIEF })).toEqual([]);
    expect(
      reasons('bail_regular', 'fir_details', 'That FIR No. 999/2026 was registered.', {
        brief: BRIEF,
      }),
    ).toEqual(['clause_not_in_paragraph']);
  });

  it('{{fir_number}} with no brief, or an empty value, never matches', () => {
    const text = 'That FIR No. 124/2026 was registered at PS Kotwali.';
    expect(reasons('bail_regular', 'fir_details', text)).toEqual(['clause_not_in_paragraph']);
    expect(reasons('bail_regular', 'fir_details', 'FIR No. ', { brief: briefWithFir('') })).toEqual(
      ['clause_not_in_paragraph'],
    );
    expect(
      reasons('bail_regular', 'fir_details', 'Any text at all.', { brief: briefWithFir('   ') }),
    ).toEqual(['clause_not_in_paragraph']);
  });
});

describe('T-200 R2b and R3: clauses without cues', () => {
  const p = packOf('bail_regular', [clause('not_cued')]);
  const check = (paras: Record<number, string>, report: string, recorded: Map<string, string>) =>
    findMissingClauses(p, draft(paras, `not_cued: ${report}`), [], { recorded }).map(
      (m) => m.reason,
    );

  it('the first check passes and records the text of the reported paragraphs', () => {
    const recorded = new Map<string, string>();
    expect(check({ 1: 'The urgency is described here.' }, '1', recorded)).toEqual([]);
    expect(recorded.get('not_cued')).toContain('urgency is described here');
  });

  it('a later check with the paragraph changed: clause_not_in_paragraph', () => {
    const recorded = new Map<string, string>();
    check({ 1: 'The urgency is described here.' }, '1', recorded);
    expect(check({ 1: 'Something quite different.' }, '1', recorded)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('a later check with the same text renumbered: still present', () => {
    const recorded = new Map<string, string>();
    check({ 1: 'The urgency is described here.' }, '1', recorded);
    expect(
      check({ 1: 'A new paragraph.', 2: 'The urgency is described here.' }, '2', recorded),
    ).toEqual([]);
  });

  it('R3: the recorded text is in a paragraph that was not reported: missing, never re-pointed', () => {
    const recorded = new Map<string, string>();
    check({ 1: 'The urgency is described here.' }, '1', recorded);
    expect(
      check({ 1: 'A new paragraph.', 2: 'The urgency is described here.' }, '1', recorded),
    ).toEqual(['clause_not_in_paragraph']);
  });

  it('a clause is recorded only when no map is given nothing is kept, so a lone check passes (known gap)', () => {
    expect(reasons('bail_regular', 'not_cued', 'Whatever text.')).toEqual([]);
  });
});

describe('T-200: the (pack, clause id) → cue map, ruled by Ajay on 12 Oct 2026', () => {
  /** A cue-less clause passes a first check on any text, and fails a second on changed text. */
  function hasNoCue(packId: string, id: string) {
    const recorded = new Map<string, string>();
    const q = packOf(packId, [clause(id)]);
    // text with every cue word in it: if there were a cue, the changed text would pass
    const rich =
      'FIR No. 124/2026 custody arrest grounds submitted undertaking earlier bail application';
    const first = findMissingClauses(q, draft({ 1: 'Original words.' }, `${id}: 1`), [], {
      recorded,
      brief: BRIEF,
    });
    const second = findMissingClauses(q, draft({ 1: rich }, `${id}: 1`), [], {
      recorded,
      brief: BRIEF,
    });
    return [first.length, second.map((m) => m.reason)];
  }

  it.each([
    ['bail_anticipatory', 'no_flight_risk'],
    ['interim_bail', 'no_flight_risk'],
    ['interim_bail', 'urgency'],
    ['interim_bail', 'main_application_reference'],
    ['interim_bail', 'duration_sought'],
    ['bail_before_magistrate', 'offence_classification'],
    ['bail_before_magistrate', 'triple_test'],
    ['bail_anticipatory', 'grounds'],
    ['interim_bail', 'grounds'],
    ['nda', 'grounds'],
  ])('%s %s has no cue (R2b), and there is no fallback by id', (packId, id) => {
    expect(hasNoCue(packId, id)).toEqual([0, ['clause_not_in_paragraph']]);
  });

  it.each([
    ['bail_regular', 'fir_details', 'FIR No. 124/2026 registered.', 'Nothing relevant.'],
    ['bail_regular', 'custody_status', 'He is in custody.', 'Nothing relevant.'],
    ['bail_regular', 'grounds', 'The grounds are these.', 'Nothing relevant.'],
    ['bail_regular', 'no_flight_risk', 'He gives an undertaking.', 'Nothing relevant.'],
    ['bail_anticipatory', 'fir_details', 'FIR No. 124/2026 registered.', 'Nothing relevant.'],
    ['interim_bail', 'undertakings', 'He gives an undertaking.', 'Nothing relevant.'],
    ['bail_before_magistrate', 'fir_particulars', 'FIR No. 124/2026 registered.', 'Nothing.'],
    ['bail_before_magistrate', 'custody', 'He is in custody.', 'Nothing relevant.'],
    ['bail_before_magistrate', 'grounds', 'The grounds are these.', 'Nothing relevant.'],
    ['bail_before_magistrate', 'undertakings', 'He gives an undertaking.', 'Nothing relevant.'],
  ])('%s %s is cued: the cue passes a first check, other text fails it', (packId, id, yes, no) => {
    expect(reasons(packId, id, yes, { brief: BRIEF })).toEqual([]);
    expect(reasons(packId, id, no, { brief: BRIEF })).toEqual(['clause_not_in_paragraph']);
  });

  it('the cue sets are the 11 Oct ones: the undertaking cue is in Hindi too, on interim_bail', () => {
    expect(reasons('interim_bail', 'undertakings', 'आवेदक वचन देता है।')).toEqual([]);
  });

  it('the real packs have the clause ids the map names', () => {
    const ids = (p: string) => (loadRulePack(p)?.mandatoryClauses ?? []).map((c) => c.id);
    expect(ids('bail_anticipatory')).toEqual(
      expect.arrayContaining(['fir_details', 'no_flight_risk']),
    );
    expect(ids('interim_bail')).toEqual(expect.arrayContaining(['undertakings', 'no_flight_risk']));
    expect(ids('bail_before_magistrate')).toEqual(
      expect.arrayContaining(['fir_particulars', 'custody', 'grounds', 'undertakings']),
    );
  });
});

describe('T-200 AC6: no prompt text changes', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  it('the Drafter pack prompt and the two repair prompts are as they were', () => {
    expect(sha(DRAFTER_PACK_SYSTEM_PROMPT)).toBe(
      '2db4baabd467aaece3f56bf2e6fff4c79cfbcfeda5a18e7f755299bab8218065',
    );
    expect(sha(DRAFTER_REPAIR_SYSTEM_PROMPT)).toBe(
      '42aab92426027f010dd5368d6b5870f7635cf0b118600c6a78c6299c33f0b928',
    );
    expect(sha(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT)).toBe(
      '302353e51ece0ccc69432c45175898e27b540a25ab8db20d61ee8222ca32ed68',
    );
  });
});
