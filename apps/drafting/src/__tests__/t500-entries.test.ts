/**
 * T-500 steps A and C (Ajay 088fc4f7, 2e536158, AJ-500-M1): the skeleton entry
 * format (entry_texts, entry_parse, missing_text), the entry parsers and the
 * bail_regular v5 draft rendered from Anushka's facts. Expectations are typed
 * by hand from handoff/legal/T-245-old-new-law-switch-signed.md ("T-499 /
 * T-500"), the leading "That " dropped per 2e536158. No model, no database.
 *
 * Runs on the real skeleton (loadSkeleton), not the fixture copy of the signed
 * v4 block, so it reads the v5 draft until Ajay issues it.
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  DraftParagraphsOutput,
  packOptionIds,
  renderDraft,
  skeletonValueLists,
} from '../services/draft-renderer';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack, loadSkeleton, validateSkeleton } from '../services/rule-pack.service';
import { entryParts } from '../services/skeleton-entries';
import type { Skeleton } from '../types/skeleton';
import { fact, regularBase } from './fixtures/t373';

// ── Harness ─────────────────────────────────────────────────────────────────

const without = (facts: LedgerFact[], ...keys: string[]): LedgerFact[] =>
  facts.filter((f) => !keys.includes(f.key));

function goodOutput(skeleton: Skeleton, facts: LedgerFact[]): DraftParagraphsOutput {
  const held = new Set(facts.map((f) => f.key));
  return {
    paragraphs: skeleton.clauses.map((c) => {
      const refs = new Set<string>();
      for (const s of c.slots ?? []) refs.add(c.derived?.[s]?.from ?? s);
      for (const v of c.variants ?? []) for (const s of v.slots ?? []) refs.add(s);
      if (c.source === 'advocate' && c.slot) refs.add(c.slot);
      if (c.list && c.from) refs.add(c.from);
      return {
        clauseId: c.id,
        factRefs: [...refs].filter((r) => held.has(r)),
        text:
          c.source === 'advocate' && c.slot
            ? (facts.find((f) => f.key === c.slot)?.display ?? '')
            : '',
        items: [],
      };
    }),
  };
}

function render(facts: LedgerFact[], skeleton: Skeleton = loadSkeleton('bail_regular')!) {
  const pack = loadRulePack('bail_regular')!;
  const lists = loadAvermentLists('bail_regular');
  const result = renderDraft({
    skeleton,
    output: goodOutput(skeleton, facts),
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  });
  const text = (id: string): string | undefined =>
    result.paragraphs.find((p) => p.clauseId === id)?.text;
  const status = (id: string): string | undefined =>
    result.rendered.find((r) => r.clauseId === id)?.status;
  return { result, text, status, all: result.paragraphs.map((p) => p.text).join('\n') };
}

/** Anushka's ordered grounds, as the advocate wrote them. */
const ANUSHKA_GROUNDS = [
  'the dispute is civil in nature, arising from a failed land-sale agreement',
  'there is no likelihood of tampering with the evidence',
  "the applicant's elderly mother depends on him",
];
const LEAD_IN =
  'The applicant seeks bail on the following grounds, among others, each without prejudice to the other:';

const withGrounds = (grounds: string[]): LedgerFact[] => [
  ...without(regularBase(), 'grounds_for_bail'),
  ...grounds.map((g) => fact('grounds_stated', g)),
];

// ── Grounds ─────────────────────────────────────────────────────────────────

describe("grounds_stated: each ground its own lettered line, in the advocate's order", () => {
  it('prints the signed lead-in and (a), (b), (c) in order, leading "That" dropped', () => {
    const r = render(withGrounds(ANUSHKA_GROUNDS));
    const t = r.text('grounds_stated')!;
    expect(t.split('\n')).toEqual([
      LEAD_IN,
      '(a) The dispute is civil in nature, arising from a failed land-sale agreement.',
      '(b) There is no likelihood of tampering with the evidence.',
      "(c) The applicant's elderly mother depends on him.",
    ]);
  });

  it('none dropped or merged: five grounds give five lines', () => {
    const five = ['one ground', 'two ground', 'three ground', 'four ground', 'five ground'];
    const lines = render(withGrounds(five)).text('grounds_stated')!.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.slice(1).map((l) => l.slice(0, 3))).toEqual(['(a)', '(b)', '(c)', '(d)', '(e)']);
  });

  it('one value written "(1) … (2) …" is split into one ground each, order kept', () => {
    const r = render(withGrounds(['(1) civil dispute (2) no tampering (3) mother depends on him']));
    expect(r.text('grounds_stated')!.split('\n')).toEqual([
      LEAD_IN,
      '(a) Civil dispute.',
      '(b) No tampering.',
      '(c) Mother depends on him.',
    ]);
  });

  it('the old grounds list and further_grounds are skipped when grounds_stated prints', () => {
    const facts = [
      ...withGrounds(ANUSHKA_GROUNDS),
      fact('grounds_for_bail', 'Will cooperate with investigation and trial', {
        value: 'cooperation',
      }),
      fact('additional_context', 'A stray additional context sentence.'),
    ];
    const r = render(facts);
    expect(r.text('grounds')).toBeUndefined();
    expect(r.text('further_grounds')).toBeUndefined();
    expect(r.all).not.toContain('will cooperate with the investigation');
    expect(r.all).not.toContain('stray additional context');
  });

  it('absent: the draft renders the old grounds list exactly as before', () => {
    const base = render(regularBase());
    expect(base.text('grounds_stated')).toBeUndefined();
    expect(base.text('grounds')).toBe(
      [
        'The applicant seeks bail on the following grounds:',
        '(a) The applicant has been falsely implicated in this case.',
        '(b) The applicant will cooperate with the investigation and the trial.',
        '(c) There is no likelihood of the applicant tampering with the evidence or influencing any witness.',
      ].join('\n'),
    );
  });

  it('further_grounds still prints when grounds_stated is absent', () => {
    const r = render([...regularBase(), fact('additional_context', 'He supports a large family.')]);
    expect(r.text('further_grounds')).toContain('He supports a large family.');
  });
});

// ── Antecedents ─────────────────────────────────────────────────────────────

describe('antecedents: three signed variants', () => {
  const NONE =
    'The applicant has no criminal antecedents and has not been accused in any other case.';

  it.each([
    'None',
    'Nil',
    'No criminal record',
    'no criminal antecedents',
    'clean record',
    'never been accused in any other case',
    'He has never been accused in any other case',
    'The applicant has never been accused in any other case',
    'not been accused in any other case',
    'has not been accused in any other case',
    'never been accused',
    'The applicant has never been accused',
    'never accused',
    'never accused in any other case',
  ])('"%s" prints the none sentence', (v) => {
    const r = render([...without(regularBase(), 'antecedents'), fact('antecedents', v)]);
    expect(r.text('antecedents')).toBe(NONE);
    expect(r.status('antecedents')).toBe('ok');
  });

  it('listed cases print as given', () => {
    const r = render([
      ...without(regularBase(), 'antecedents'),
      fact('antecedents', 'FIR 12/2019 PS Kotwali, acquitted in 2021'),
    ]);
    expect(r.text('antecedents')).toBe(
      "The applicant's criminal antecedents are as follows: FIR 12/2019 PS Kotwali, acquitted in 2021.",
    );
  });

  it('not given: the applicant [To be confirmed ...] form, status missing', () => {
    const r = render(without(regularBase(), 'antecedents'));
    expect(r.text('antecedents')).toBe(
      'The applicant {{MISSING: criminal antecedents of the applicant, if any}}.',
    );
    expect(r.status('antecedents')).toBe('missing');
  });

  it('with grounds_stated the antecedents print once, standalone (no use_clause loss)', () => {
    const r = render(withGrounds(ANUSHKA_GROUNDS));
    expect(r.text('antecedents')).toBe(NONE);
    expect(r.all.split(NONE)).toHaveLength(2);
  });
});

// ── Dependants ──────────────────────────────────────────────────────────────

describe('dependants: one clean sentence each', () => {
  const dep = (...values: string[]) => [
    ...regularBase(),
    ...values.map((v) => fact('dependants', v)),
  ];

  it('"elderly mother aged 72 who depends on him" is clean', () => {
    expect(render(dep('elderly mother aged 72 who depends on him')).text('dependants')).toBe(
      "The applicant's elderly mother, aged 72 years, is dependent on the applicant.",
    );
  });

  it('age forms: "aged N", "N years old", "(N)"', () => {
    expect(render(dep('mother aged 72')).text('dependants')).toBe(
      "The applicant's mother, aged 72 years, is dependent on the applicant.",
    );
    expect(render(dep('father, 80 years old')).text('dependants')).toBe(
      "The applicant's father, aged 80 years, is dependent on the applicant.",
    );
    expect(render(dep('wife (30)')).text('dependants')).toBe(
      "The applicant's wife, aged 30 years, is dependent on the applicant.",
    );
  });

  it('no age: ", aged {age} years," is dropped', () => {
    expect(render(dep('wife')).text('dependants')).toBe(
      "The applicant's wife is dependent on the applicant.",
    );
  });

  it('two dependants: one sentence each, the verb not repeated inside a sentence', () => {
    const t = render(dep('mother aged 72; wife')).text('dependants')!;
    expect(t).toBe(
      "The applicant's mother, aged 72 years, is dependent on the applicant. The applicant's wife is dependent on the applicant.",
    );
    expect(t.match(/dependent on the applicant/g)).toHaveLength(2);
  });

  it('two ledger entries also give one sentence each', () => {
    const t = render(dep('mother aged 72', 'wife aged 30')).text('dependants')!;
    expect(t).toBe(
      "The applicant's mother, aged 72 years, is dependent on the applicant. The applicant's wife, aged 30 years, is dependent on the applicant.",
    );
  });

  it('plural with ages: "aged {a} and {b} years respectively, are dependent"', () => {
    expect(render(dep('two children aged 4 and 7')).text('dependants')).toBe(
      "The applicant's two children, aged 4 and 7 years respectively, are dependent on the applicant.",
    );
  });

  it('plural with three ages: "a, b and c"', () => {
    expect(render(dep('three children aged 4, 7 and 9 years')).text('dependants')).toBe(
      "The applicant's three children, aged 4, 7 and 9 years respectively, are dependent on the applicant.",
    );
  });

  it('plural with no ages: "are dependent"', () => {
    expect(render(dep('two children')).text('dependants')).toBe(
      "The applicant's two children are dependent on the applicant.",
    );
    expect(render(dep('parents')).text('dependants')).toBe(
      "The applicant's parents are dependent on the applicant.",
    );
  });

  it('plural with one age: the age stays with the relation (pinned as built, flagged to Ajay)', () => {
    expect(render(dep('parents aged 70')).text('dependants')).toBe(
      "The applicant's parents aged 70 are dependent on the applicant.",
    );
  });

  it('"both parents" (pinned as built, flagged to Ajay)', () => {
    expect(render(dep('both parents')).text('dependants')).toBe(
      "The applicant's both parents are dependent on the applicant.",
    );
  });

  it('"wife aged 30 and 2 children" gives two sentences', () => {
    expect(render(dep('wife aged 30 and 2 children')).text('dependants')).toBe(
      "The applicant's wife, aged 30 years, is dependent on the applicant. The applicant's 2 children are dependent on the applicant.",
    );
  });

  it('none given: no sentence and no blank', () => {
    const r = render(regularBase());
    expect(r.text('dependants')).toBeUndefined();
    expect(r.all).not.toContain('dependent on the applicant');
  });
});

// ── Police station in the body (renderer para 2) ────────────────────────────

describe('police station in the FIR paragraph', () => {
  const fir = (ps: string) =>
    render([...without(regularBase(), 'police_station'), fact('police_station', ps)]).text(
      'fir_details',
    )!;

  it('prints "Police Station {name}" once', () => {
    expect(fir('PS Kadamkuan Police Station')).toContain(
      'registered at Police Station Kadamkuan under',
    );
    expect(fir('Kadamkuan P.S.')).toContain('registered at Police Station Kadamkuan under');
  });

  it('district marker written: ", District {district}"', () => {
    expect(fir('Kadamkuan Police Station, Distt. Patna')).toContain(
      'registered at Police Station Kadamkuan, District Patna under',
    );
  });

  it('no marker: the place as written, seat towns included', () => {
    expect(fir('Sakchi PS, Jamshedpur')).toContain(
      'registered at Police Station Sakchi, Jamshedpur under',
    );
    expect(fir('Kadamkuan Police Station, Patna')).toContain(
      'registered at Police Station Kadamkuan, Patna under',
    );
  });

  it('never "Police Station ... Police Station"', () => {
    expect(fir('Police Station Kadamkuan PS')).not.toMatch(/Police Station[^.]*Police Station/);
  });
});

// ── Entry parsers ───────────────────────────────────────────────────────────

describe('entryParts', () => {
  it('no entry_parse: the whole value is one entry, trailing punctuation tidied', () => {
    expect(entryParts(undefined, 'a ground; ')).toEqual([{ entry: 'a ground' }]);
    expect(entryParts(undefined, '   ')).toEqual([]);
  });

  it('enumerated: markers (1), (a), (i); a lead-in with a colon is not an entry', () => {
    expect(entryParts('enumerated', '(a) first (b) second')).toEqual([
      { entry: 'first' },
      { entry: 'second' },
    ]);
    expect(entryParts('enumerated', 'Grounds: (i) one (ii) two (iii) three')).toEqual([
      { entry: 'one' },
      { entry: 'two' },
      { entry: 'three' },
    ]);
    expect(entryParts('enumerated', 'single ground')).toEqual([{ entry: 'single ground' }]);
  });

  it('dependant: relation and age', () => {
    expect(entryParts('dependant', 'elderly mother aged 72 who depends on him')).toEqual([
      { relation: 'elderly mother', age: '72' },
    ]);
    expect(entryParts('dependant', 'wife; son aged 5')).toEqual([
      { relation: 'wife' },
      { relation: 'son', age: '5' },
    ]);
    expect(entryParts('dependant', '')).toEqual([]);
  });
});

// ── Skeleton format validation ──────────────────────────────────────────────

describe('validateSkeleton: entry_texts, entry_parse, missing_text (T-500 format)', () => {
  type Obj = Record<string, any>;
  const pack = loadRulePack('bail_regular');
  const errorsAfter = (mutate: (s: Obj) => void): string[] => {
    const s = JSON.parse(JSON.stringify(loadSkeleton('bail_regular'))) as Obj;
    mutate(s);
    return validateSkeleton(s, pack, 'bail_regular');
  };
  const clause = (s: Obj, id: string): Obj => s.clauses.find((c: Obj) => c.id === id);

  it('the shipped skeleton has no errors', () => {
    expect(errorsAfter(() => undefined)).toEqual([]);
  });

  it('valid: entry_parse enumerated and dependant with their placeholders; no parse with {entry}', () => {
    expect(
      errorsAfter((s) => {
        clause(s, 'grounds_stated').entry_texts = ['{entry}.', 'Also {entry}.'];
        clause(s, 'dependants').entry_texts = ["The applicant's {relation} is dependent."];
      }),
    ).toEqual([]);
    expect(
      errorsAfter((s) => {
        delete clause(s, 'grounds_stated').entry_parse;
      }),
    ).toEqual([]);
  });

  it('entry_texts empty', () => {
    expect(errorsAfter((s) => (clause(s, 'grounds_stated').entry_texts = [])).join('\n')).toMatch(
      /entry_texts is not a non-empty array/,
    );
  });

  it('entry_texts item not a string, or with no placeholder', () => {
    expect(errorsAfter((s) => (clause(s, 'grounds_stated').entry_texts = [''])).join('\n')).toMatch(
      /entry_texts\[0\]: not a non-empty string/,
    );
    expect(
      errorsAfter((s) => (clause(s, 'grounds_stated').entry_texts = ['fixed text'])).join('\n'),
    ).toMatch(/entry_texts\[0\]: has no placeholder/);
  });

  it('a placeholder the entry does not supply', () => {
    expect(
      errorsAfter((s) => (clause(s, 'grounds_stated').entry_texts = ['{relation}'])).join('\n'),
    ).toMatch(/placeholder 'relation' is not supplied by the entry/);
    expect(
      errorsAfter((s) => (clause(s, 'dependants').entry_texts = ['{entry}'])).join('\n'),
    ).toMatch(/placeholder 'entry' is not supplied by the entry/);
  });

  it('unknown entry_parse', () => {
    expect(
      errorsAfter((s) => (clause(s, 'grounds_stated').entry_parse = 'guess')).join('\n'),
    ).toMatch(/entry_parse is not a known reading/);
  });

  it('entry_parse without entry_texts', () => {
    expect(
      errorsAfter((s) => (clause(s, 'opening').entry_parse = 'enumerated')).join('\n'),
    ).toMatch(/entry_parse needs entry_texts/);
  });

  it('entry_texts on an advocate clause, without list, without from, or with text', () => {
    expect(
      errorsAfter((s) => (clause(s, 'grounds_stated').source = 'advocate')).join('\n'),
    ).toMatch(/entry_texts is only for fixed clauses/);
    expect(errorsAfter((s) => delete clause(s, 'grounds_stated').list).join('\n')).toMatch(
      /entry_texts needs list true/,
    );
    expect(errorsAfter((s) => delete clause(s, 'grounds_stated').from).join('\n')).toMatch(
      /entry_texts needs from/,
    );
    expect(errorsAfter((s) => (clause(s, 'grounds_stated').text = 'x')).join('\n')).toMatch(
      /has entry_texts and text, variants or items/,
    );
  });

  it('missing_text: valid with exactly one {missing}; invalid otherwise', () => {
    expect(
      errorsAfter((s) => (clause(s, 'antecedents').missing_text = 'The applicant {missing}.')),
    ).toEqual([]);
    for (const bad of ['no placeholder', 'The {missing} and {missing}', 'The {other}', '']) {
      expect(errorsAfter((s) => (clause(s, 'antecedents').missing_text = bad)).join('\n')).toMatch(
        /missing_text/,
      );
    }
    expect(errorsAfter((s) => (clause(s, 'antecedents').missing_text = 5)).join('\n')).toMatch(
      /missing_text is not a non-empty string/,
    );
  });
});
