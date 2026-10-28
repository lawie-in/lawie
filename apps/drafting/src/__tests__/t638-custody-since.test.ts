/**
 * T-638 Part B: "in custody since" derived from the date of arrest on a regular bail.
 * Ajay R1 (T-611 policy) and the T-638 rulings B1-B5 (handoff/legal/T-612-bail-grounds-wording-signed.md,
 * 28 Oct 2026). The expected sentences and the word list are the signed ones, not read from the code.
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  deriveCustodySince,
  mentionsSurrenderOrRemand,
  withCustodySinceDerived,
  type CustodySinceInput,
} from '../services/custody-since-derivation';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { packOptionIds, renderDraft, skeletonValueLists } from '../services/draft-renderer';
import { overlayBrief } from '../services/fact-ledger.service';
import { briefLedgerValues } from '../services/form-ledger';
import { buildBrief, buildChecklist, buildQuestions } from '../services/intake-brief';
import type { Brief, BriefQuestion } from '../services/intake-brief';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';

import { choice, fact, regularBase } from './fixtures/t373';

const B2 = 'Since what date has the applicant been in custody (the date of arrest or surrender)?';

// ── (1)-(3) The leaf rule, pure ─────────────────────────────────────────────

const base = (over: Partial<CustodySinceInput> = {}): CustodySinceInput => ({
  packId: 'bail_regular',
  custody: 'yes_judicial',
  arrestDates: ['2026-06-12'],
  custodySinceHeld: false,
  otherCustodyDate: false,
  texts: ['Arrested for a cheating FIR and sent to jail.'],
  ...over,
});

describe('T-638 B (1) deriveCustodySince: derived', () => {
  it.each(['yes_judicial', 'yes_police', 'Yes — Judicial custody', 'Yes — Police custody'])(
    'in custody (%s) with one arrest date: custody_since is the date of arrest',
    (custody) => {
      const out = deriveCustodySince(base({ custody }));
      expect(out).toEqual({ derived: { value: '2026-06-12', display: '12 June 2026' } });
    },
  );

  it('the same date twice is one date', () => {
    expect(
      'derived' in deriveCustodySince(base({ arrestDates: ['2026-06-12', '2026-06-12'] })),
    ).toBe(true);
  });

  it('whole-word Latin: "surrenders" and "arrested" do not trigger the ask', () => {
    for (const t of [
      'The surrenders of the property; he was arrested on 12 June 2026.',
      'arrested',
    ]) {
      expect('derived' in deriveCustodySince(base({ texts: [t] }))).toBe(true);
    }
  });
});

describe('T-638 B (2) deriveCustodySince: not derivable, so ask', () => {
  const WORDS = [
    'surrender',
    'surrendered',
    'आत्मसमर्पण',
    'remand',
    'remanded',
    'रिमांड',
    're-arrest',
    're arrest',
    're-arrested',
    'rearrested',
    're-arrested',
  ];
  it.each(WORDS)('the word "%s" in the description asks', (w) => {
    expect(deriveCustodySince(base({ texts: [`He ${w} on that day.`] }))).toEqual({ ask: true });
  });

  it.each(WORDS.map((w) => w.toUpperCase()))('upper case "%s" asks', (w) => {
    expect(deriveCustodySince(base({ texts: [w] }))).toEqual({ ask: true });
  });

  it('a Devanagari word inside a sentence asks (a suffix may follow)', () => {
    expect(deriveCustodySince(base({ texts: ['उसने आत्मसमर्पण किया था'] }))).toEqual({ ask: true });
    expect(deriveCustodySince(base({ texts: ['रिमांड पर भेजा गया'] }))).toEqual({ ask: true });
  });

  it('another custody or remand date asks', () => {
    expect(deriveCustodySince(base({ otherCustodyDate: true }))).toEqual({ ask: true });
  });

  it('two arrest dates, or none, ask', () => {
    expect(deriveCustodySince(base({ arrestDates: ['2026-06-12', '2026-06-14'] }))).toEqual({
      ask: true,
    });
    expect(deriveCustodySince(base({ arrestDates: [] }))).toEqual({ ask: true });
  });

  it('an arrest date that is not an ISO date asks', () => {
    expect(deriveCustodySince(base({ arrestDates: ['12 June 2026'] }))).toEqual({ ask: true });
  });

  it('mentionsSurrenderOrRemand: only the signed words', () => {
    expect(mentionsSurrenderOrRemand('he was remanded to judicial custody')).toBe(true);
    expect(mentionsSurrenderOrRemand('surrenders')).toBe(false);
    expect(mentionsSurrenderOrRemand('premand')).toBe(false);
    expect(mentionsSurrenderOrRemand('')).toBe(false);
  });
});

describe('T-638 B (3) deriveCustodySince: none', () => {
  it('not in custody', () => {
    for (const custody of ['no', 'No — apprehends arrest', null, '']) {
      expect(deriveCustodySince(base({ custody }))).toEqual({ none: true });
    }
  });

  it('another pack', () => {
    for (const packId of ['bail_anticipatory', 'bail_before_magistrate', 'default_bail', null]) {
      expect(deriveCustodySince(base({ packId }))).toEqual({ none: true });
    }
  });

  it('custody_since held, including one equal to the date of arrest (B5)', () => {
    expect(deriveCustodySince(base({ custodySinceHeld: true }))).toEqual({ none: true });
    expect(
      deriveCustodySince(base({ custodySinceHeld: true, arrestDates: ['2026-06-12'] })),
    ).toEqual({ none: true });
  });
});

// ── (4) withCustodySinceDerived ─────────────────────────────────────────────

const arrestFact = (iso: string, display: string): LedgerFact =>
  fact('arrest_date', display, { type: 'date', value: iso });
const REG_NO_CUSTODY_DATE = (): LedgerFact[] =>
  regularBase().filter((f) => f.key !== 'custody_since');
const keysOf = (fs: LedgerFact[], k: string) => fs.filter((f) => f.key === k);

describe('T-638 B (4) withCustodySinceDerived', () => {
  it('adds the computed custody_since (the arrest date as the ledger prints it) and the marker', () => {
    const facts = [...REG_NO_CUSTODY_DATE(), arrestFact('2026-06-12', '12 June 2026')];
    const out = withCustodySinceDerived(facts, 'bail_regular', 'Arrested for a cheating FIR.');
    const since = keysOf(out, 'custody_since');
    expect(since).toHaveLength(1);
    expect(since[0]).toMatchObject({
      value: '2026-06-12',
      display: '12 June 2026',
      source: 'computed',
    });
    expect(keysOf(out, 'custody_since_derived')).toHaveLength(1);
    expect(out.slice(0, facts.length)).toEqual(facts);
  });

  it('drops a stored marker and a stored computed custody_since first', () => {
    const stale = [
      fact('custody_since_derived', 'arrest_date', { type: 'boolean', value: true as never }),
      {
        ...fact('custody_since', '1 January 2020', { type: 'date', value: '2020-01-01' }),
        source: 'computed' as const,
      },
    ];
    const out = withCustodySinceDerived(
      [...REG_NO_CUSTODY_DATE(), arrestFact('2026-06-12', '12 June 2026'), ...stale],
      'bail_regular',
      'x',
    );
    expect(keysOf(out, 'custody_since')).toHaveLength(1);
    expect(keysOf(out, 'custody_since')[0].value).toBe('2026-06-12');
    expect(keysOf(out, 'custody_since_derived')).toHaveLength(1);
  });

  it('a stored marker is dropped even when nothing is derived', () => {
    const stale = fact('custody_since_derived', 'arrest_date', {
      type: 'boolean',
      value: true as never,
    });
    const out = withCustodySinceDerived([...REG_NO_CUSTODY_DATE(), stale], 'bail_regular', 'x');
    expect(keysOf(out, 'custody_since_derived')).toEqual([]);
    expect(keysOf(out, 'custody_since')).toEqual([]);
  });

  it('adds nothing when custody_since is given, equal to the arrest date or not (B5)', () => {
    for (const given of ['2026-06-12', '2026-06-20']) {
      const facts = [
        ...REG_NO_CUSTODY_DATE(),
        arrestFact('2026-06-12', '12 June 2026'),
        fact('custody_since', given, { type: 'date', value: given }),
      ];
      const out = withCustodySinceDerived(facts, 'bail_regular', 'x');
      expect(out).toEqual(facts);
    }
  });

  it('adds nothing for a surrender word, a remand date, an unresolved remand date, or two arrest dates', () => {
    const arrest = arrestFact('2026-06-12', '12 June 2026');
    const none = (
      facts: LedgerFact[],
      described: string,
      unresolved: Array<{ key: string; raw_span: string }> = [],
    ) =>
      expect(
        keysOf(
          withCustodySinceDerived(facts, 'bail_regular', described, unresolved),
          'custody_since',
        ),
      ).toEqual([]);
    none([...REG_NO_CUSTODY_DATE(), arrest], 'He surrendered before the court.');
    none(
      [
        ...REG_NO_CUSTODY_DATE(),
        arrest,
        fact('remand_date', '14 June 2026', { type: 'date', value: '2026-06-14' }),
      ],
      'x',
    );
    none([...REG_NO_CUSTODY_DATE(), arrest], 'x', [{ key: 'remand_date', raw_span: 'sometime' }]);
    none([...REG_NO_CUSTODY_DATE(), arrest, arrestFact('2026-06-14', '14 June 2026')], 'x');
  });

  it('adds nothing when not in custody', () => {
    const facts = [
      ...REG_NO_CUSTODY_DATE().filter((f) => f.key !== 'currently_in_custody'),
      choice('currently_in_custody', 'No — apprehends arrest', 'no'),
      arrestFact('2026-06-12', '12 June 2026'),
    ];
    expect(withCustodySinceDerived(facts, 'bail_regular', 'x')).toEqual(facts);
  });

  it.each(['bail_anticipatory', 'bail_before_magistrate', 'default_bail'])(
    '%s: the facts are returned unchanged',
    (packId) => {
      const facts = [...REG_NO_CUSTODY_DATE(), arrestFact('2026-06-12', '12 June 2026')];
      expect(withCustodySinceDerived(facts, packId, 'x')).toEqual(facts);
    },
  );
});

// ── (5) The renderer, v7 skeleton ───────────────────────────────────────────

const count = (h: string, n: string) => h.split(n).length - 1;

function render(facts: LedgerFact[]) {
  const pack = loadRulePack('bail_regular')!;
  const skeleton = loadSkeleton('bail_regular')!;
  const lists = loadAvermentLists('bail_regular');
  return renderDraft({
    skeleton,
    output: null,
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  });
}
const prolonged = choice('grounds_for_bail', 'Already in prolonged custody', 'prolonged_custody');

describe('T-638 B (5) the v7 skeleton prints the derived line', () => {
  const DERIVED = 'The applicant was arrested on 12 June 2026 and is now in judicial custody.';
  const ORIGINAL = 'The applicant has been in judicial custody since 12 June 2026.';
  const withoutGrounds = (fs: LedgerFact[]) => fs.filter((f) => f.key !== 'grounds_for_bail');

  it('derived: the exact sentence prints once; custody_status and arrested_on are absent', () => {
    const facts = withCustodySinceDerived(
      [...withoutGrounds(REG_NO_CUSTODY_DATE()), arrestFact('2026-06-12', '12 June 2026')],
      'bail_regular',
      'Arrested for a cheating FIR.',
    );
    const r = render(facts);
    expect(count(r.body, DERIVED)).toBe(1);
    expect(r.body).not.toContain('has been in judicial custody since');
    expect(r.body).not.toContain('The applicant was arrested on 12 June 2026.');
    const ids = r.rendered.map((c) => c.clauseId);
    expect(ids).toContain('custody_status_derived');
    expect(ids).not.toContain('custody_status');
    expect(ids).not.toContain('arrested_on');
  });

  it('derived with police custody reads "police custody"', () => {
    const facts = withCustodySinceDerived(
      [
        ...withoutGrounds(REG_NO_CUSTODY_DATE()).filter((f) => f.key !== 'currently_in_custody'),
        choice('currently_in_custody', 'Yes — Police custody', 'yes_police'),
        arrestFact('2026-06-12', '12 June 2026'),
      ],
      'bail_regular',
      'x',
    );
    expect(
      count(
        render(facts).body,
        'The applicant was arrested on 12 June 2026 and is now in police custody.',
      ),
    ).toBe(1);
  });

  it('derived, prolonged_custody ticked: the ground prints the date, and the date line prints once', () => {
    const facts = withCustodySinceDerived(
      [
        ...withoutGrounds(REG_NO_CUSTODY_DATE()),
        arrestFact('2026-06-12', '12 June 2026'),
        prolonged,
      ],
      'bail_regular',
      'x',
    );
    const r = render(facts);
    expect(count(r.body, DERIVED)).toBe(1);
    expect(count(r.body, 'The applicant has been in custody since 12 June 2026.')).toBe(1);
  });

  it('given and equal to the arrest date: the original line and arrested_on print (B5)', () => {
    const facts = withCustodySinceDerived(
      [
        ...withoutGrounds(REG_NO_CUSTODY_DATE()),
        arrestFact('2026-06-12', '12 June 2026'),
        fact('custody_since', '12 June 2026', { type: 'date', value: '2026-06-12' }),
      ],
      'bail_regular',
      'x',
    );
    const r = render(facts);
    expect(count(r.body, ORIGINAL)).toBe(1);
    expect(count(r.body, 'The applicant was arrested on 12 June 2026.')).toBe(1);
    expect(r.body).not.toContain(DERIVED);
    expect(r.rendered.map((c) => c.clauseId)).not.toContain('custody_status_derived');
  });

  it('a stored marker without the derivation is not enough: an arrest date and no custody_since still needs the service marker', () => {
    // withCustodySinceDerived is what adds the marker; with the stored one dropped and nothing derived,
    // the original clause stands (and asks for the missing date as before).
    const stale = fact('custody_since_derived', 'arrest_date', {
      type: 'boolean',
      value: true as never,
    });
    const facts = withCustodySinceDerived(
      [...withoutGrounds(REG_NO_CUSTODY_DATE()), arrestFact('2026-06-12', '12 June 2026'), stale],
      'bail_regular',
      'He surrendered.',
    );
    const r = render(facts);
    expect(r.body).not.toContain(DERIVED);
  });
});

// ── (6) buildBrief ──────────────────────────────────────────────────────────

const KIND = (id: string) => ({ id, name: id, court_document: true });
function briefOf(
  values: Array<{ key: string; value: string | string[] }>,
  opts: { description?: string; ledgerGiven?: ReadonlySet<string>; pack?: string } = {},
): Brief {
  const pack = opts.pack ?? 'bail_regular';
  const cl = buildChecklist(loadRulePack(pack)!);
  return buildBrief({
    kind: KIND(pack),
    checklist: cl,
    values: values.map((v) => ({ ...v, quote: '', source: 'description' as const })),
    description: opts.description,
    ledgerGiven: opts.ledgerGiven,
  }) as Brief;
}
const since = (b: Brief) => b.items.find((i) => i.key === 'custody_since')!;
// the brief holds a choice by its label
const IN_CUSTODY = { key: 'currently_in_custody', value: 'Yes — Judicial custody' };
const ARREST = { key: 'arrest_date', value: '2026-06-12' };
const DESC = 'Arrested for a cheating FIR on 12 June 2026 and sent to jail.';

describe('T-638 B (6) buildBrief derives custody_since', () => {
  it('derives it, marks derived_from, and does not ask the advocate to check it', () => {
    const it_ = since(briefOf([IN_CUSTODY, ARREST], { description: DESC }));
    expect(it_.value).toBe('2026-06-12');
    expect(it_.derived_from).toBe('arrest_date');
    expect(it_.please_check).toBe(false);
  });

  it('derives nothing without a description', () => {
    expect(since(briefOf([IN_CUSTODY, ARREST])).value).toBeNull();
    expect(since(briefOf([IN_CUSTODY, ARREST])).derived_from).toBeUndefined();
  });

  it.each([
    'He surrendered before the court on 12 June 2026.',
    'He was remanded on 12 June 2026.',
    'उसने आत्मसमर्पण किया',
  ])('none for a surrender or remand word: %s', (description) => {
    const it_ = since(briefOf([IN_CUSTODY, ARREST], { description }));
    expect(it_.value).toBeNull();
    expect(it_.derived_from).toBeUndefined();
  });

  it('none when the description states a different custody date', () => {
    const it_ = since(
      briefOf([IN_CUSTODY, ARREST], {
        description: 'Arrested on 12 June 2026. In custody since 14 June 2026.',
      }),
    );
    expect(it_.value).toBeNull();
  });

  it('a custody date equal to the arrest date still derives', () => {
    const it_ = since(
      briefOf([IN_CUSTODY, ARREST], {
        description: 'Arrested on 12 June 2026. In custody since 12 June 2026.',
      }),
    );
    expect(it_.value).toBe('2026-06-12');
    expect(it_.derived_from).toBe('arrest_date');
  });

  it('none when the ledger holds custody_since or remand_date (bail_regular has no remand_date item of its own)', () => {
    for (const k of ['custody_since', 'remand_date']) {
      const it_ = since(
        briefOf([IN_CUSTODY, ARREST], { description: DESC, ledgerGiven: new Set([k]) }),
      );
      expect(it_.derived_from).toBeUndefined();
    }
  });

  it('a given value is kept and is not derived', () => {
    const it_ = since(
      briefOf([IN_CUSTODY, ARREST, { key: 'custody_since', value: '2026-06-20' }], {
        description: DESC,
      }),
    );
    expect(it_.value).toBe('2026-06-20');
    expect(it_.derived_from).toBeUndefined();
  });

  it('none when not in custody, with no arrest date, or on another pack', () => {
    expect(
      since(
        briefOf([{ key: 'currently_in_custody', value: 'No — apprehends arrest' }, ARREST], {
          description: DESC,
        }),
      ).derived_from,
    ).toBeUndefined();
    expect(since(briefOf([IN_CUSTODY], { description: DESC })).derived_from).toBeUndefined();
    const anticipatory = briefOf(
      [{ key: 'currently_in_custody', value: 'No — apprehends arrest' }, ARREST],
      {
        description: DESC,
        pack: 'bail_anticipatory',
      },
    );
    expect(anticipatory.items.find((i) => i.key === 'custody_since')?.derived_from).toBeUndefined();
  });
});

// ── (7) the question (B2) ───────────────────────────────────────────────────

const TYPICAL: Record<string, string | string[]> = {
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_parentage: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St, Patna',
  applicant_address: '123 Main St, Patna',
  fir_number: '124/2026',
  fir_date: '2026-03-10',
  police_station: 'Kotwali',
  sections_charged: ['318'],
  offences_alleged: '318(4) BNS',
};
function questionsFor(
  extra: Array<{ key: string; value: string }>,
  description?: string,
): BriefQuestion[] {
  const cl = buildChecklist(loadRulePack('bail_regular')!);
  const values = [
    ...Object.entries(TYPICAL).map(([key, value]) => ({ key, value })),
    IN_CUSTODY,
    ...extra,
  ];
  const brief = briefOf(values, { description });
  return buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
}

describe('T-638 B (7) the custody_since question (B2)', () => {
  it('asked, as written, when it cannot be derived', () => {
    const q = questionsFor([], DESC).find((x) => x.key === 'custody_since');
    expect(q).toBeDefined();
    expect(q!.question).toBe(B2);
    expect(q!.source).toBe('pack');
  });

  it('asked when the description says a surrender', () => {
    const q = questionsFor([ARREST], 'He surrendered on 12 June 2026.').find(
      (x) => x.key === 'custody_since',
    );
    expect(q?.question).toBe(B2);
  });

  it('not asked when it is derived', () => {
    expect(questionsFor([ARREST], DESC).map((x) => x.key)).not.toContain('custody_since');
  });
});

// ── Review round 1: what the brief scans, several arrest dates, source null ──

interface Given {
  key: string;
  value: string | string[];
  quote?: string;
}
function briefWith(
  values: Given[],
  opts: { description?: string; checklist?: ReturnType<typeof buildChecklist> } = {},
): Brief {
  const cl = opts.checklist ?? buildChecklist(loadRulePack('bail_regular')!);
  return buildBrief({
    kind: KIND('bail_regular'),
    checklist: cl,
    values: values.map((v) => ({ quote: '', ...v, source: 'description' as const })),
    description: opts.description ?? DESC,
  }) as Brief;
}
const BASE: Given[] = [IN_CUSTODY, ARREST];

describe('T-638 B review (1): a B1 word anywhere on the brief stops the derivation', () => {
  const WORD = 'He surrendered before the court.';
  const CASES: Array<[string, Given[]]> = [
    ['an answer value', [{ key: 'facts_narrative', value: WORD }]],
    ['an item quote', [{ key: 'facts_narrative', value: 'Cheating FIR.', quote: WORD }]],
    ['an unplaced value', [{ key: 'fixed.notes', value: WORD }]],
  ];

  it.each(CASES)('%s: no value, no derived_from, and B2 is asked as written', (_n, extra) => {
    const brief = briefWith([...BASE, ...extra]);
    expect(since(brief).value).toBeNull();
    expect(since(brief).derived_from).toBeUndefined();
    const cl = buildChecklist(loadRulePack('bail_regular')!);
    const q = buildQuestions(
      briefWith([
        ...Object.entries(TYPICAL).map(([key, value]) => ({ key, value })),
        ...BASE,
        ...extra,
      ]),
      new Map(),
      new Set(),
      new Set(),
      { checklist: cl },
    ).find((x) => x.key === 'custody_since');
    expect(q?.question).toBe(B2);
  });

  it.each(CASES)('%s: the same input without the word derives', (_n, extra) => {
    const calm = extra.map((g) => ({
      ...g,
      value: 'Cheating FIR.',
      ...(g.quote !== undefined ? { quote: 'cheating FIR' } : {}),
    }));
    const brief = briefWith([...BASE, ...calm]);
    expect(since(brief).value).toBe('2026-06-12');
    expect(since(brief).derived_from).toBe('arrest_date');
  });
});

describe('T-638 B review (2): several arrest_date items', () => {
  const cl = () => {
    const base = buildChecklist(loadRulePack('bail_regular')!);
    const arrest = base.find((i) => i.key === 'arrest_date')!;
    return [...base, { ...arrest, key: 'group.arrest_date' }];
  };
  it('two different dates: no derivation', () => {
    const brief = briefWith(
      [IN_CUSTODY, ARREST, { key: 'group.arrest_date', value: '2026-06-14' }],
      { checklist: cl() },
    );
    expect(since(brief).value).toBeNull();
    expect(since(brief).derived_from).toBeUndefined();
  });
  it('the same date twice: derives', () => {
    const brief = briefWith(
      [IN_CUSTODY, ARREST, { key: 'group.arrest_date', value: '2026-06-12' }],
      { checklist: cl() },
    );
    expect(since(brief).value).toBe('2026-06-12');
    expect(since(brief).derived_from).toBe('arrest_date');
  });
});

describe("T-638 B review (3): a derived item is the code's, not the description's", () => {
  const derivedBrief = () => briefWith(BASE);

  it('its source is null', () => {
    expect(since(derivedBrief()).source).toBeNull();
    expect(since(derivedBrief()).derived_from).toBe('arrest_date');
  });

  it('briefLedgerValues has no custody_since, and still has the arrest date', () => {
    const keys = briefLedgerValues(derivedBrief()).map((v) => v.key);
    expect(keys).not.toContain('custody_since');
    expect(keys).toContain('arrest_date');
  });

  it('overlayBrief writes no custody_since fact', () => {
    const cl = buildChecklist(loadRulePack('bail_regular')!);
    const { state } = overlayBrief({ facts: [], unresolved: [] }, derivedBrief(), cl, 2026);
    expect(state.facts.map((f) => f.key)).not.toContain('custody_since');
  });
});

describe('T-638 B review (4): no description', () => {
  it('buildBrief without a description sets no derived_from', () => {
    const cl = buildChecklist(loadRulePack('bail_regular')!);
    const brief = buildBrief({
      kind: KIND('bail_regular'),
      checklist: cl,
      values: BASE.map((v) => ({ ...v, quote: '', source: 'description' as const })),
    }) as Brief;
    expect(since(brief).derived_from).toBeUndefined();
    expect(since(brief).value).toBeNull();
  });
});
