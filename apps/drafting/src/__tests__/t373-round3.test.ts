/**
 * T-373 round 3 (commit 91a179b), the parts that need no database:
 *  - unchanged dates are kept, changed dates fall back (withoutDatesKeepCase, keepsToFact)
 *  - the stop list no longer holds causal, temporal or negating words
 *  - withFactsNarrative (fact-ledger.service) and the Magistrate facts clause through the D1 renderer
 *  - the top-level list name pattern (`<prefix>_none_values`)
 * The ledger-write and FactDiff `path` tests are in t373-round3-ledger.test.ts (they need a database).
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  DraftParagraphsOutput,
  OWN_WORDS_STOP_LIST,
  ownWordsAddedWord,
  ownWordsAlteredEntity,
  packOptionIds,
  renderDraft,
  skeletonValueLists,
} from '../services/draft-renderer';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  FACTS_NARRATIVE_KEY,
  ledgerView,
  overlayBrief,
  withFactsNarrative,
} from '../services/fact-ledger.service';
import { buildChecklist, fixedChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import type { Skeleton } from '../types/skeleton';
import {
  fact,
  loadFixtureSkeleton,
  magistrateBase,
  PackId,
  regularBase,
  REGULAR_NARRATIVE_RAW,
} from './fixtures/t373';

function render(
  packId: PackId,
  facts: LedgerFact[],
  texts: Record<string, string> = {},
  skeletonOverride?: Skeleton,
) {
  const pack = loadRulePack(packId)!;
  const skeleton = skeletonOverride ?? loadFixtureSkeleton(packId);
  const lists = loadAvermentLists(packId);
  const held = new Set(facts.map((f) => f.key));
  const output: DraftParagraphsOutput = {
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
          texts[c.id] ??
          (c.source === 'advocate' && c.slot
            ? (facts.find((f) => f.key === c.slot)?.display ?? '')
            : ''),
        items: [],
      };
    }),
  };
  const result = renderDraft({
    skeleton,
    output,
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  });
  const status = (id: string): string | undefined =>
    result.rendered.find((r) => r.clauseId === id)?.status;
  const text = (id: string): string | undefined =>
    result.paragraphs.find((p) => p.clauseId === id)?.text;
  return { result, status, text, skeleton };
}

const withNarrative = (raw: string, display = raw): LedgerFact[] => [
  ...regularBase().filter((f) => f.key !== 'facts_narrative'),
  fact('facts_narrative', display, { raw_span: raw }),
];

// ── Dates ───────────────────────────────────────────────────────────────────

describe('round 3: an unchanged date is kept, a changed date falls back', () => {
  const RAW = 'He was arrested on 5 May 2026 after a land-sale quarrel.';

  it.each([
    ['the same words', 'He was arrested on 5 May 2026 after a land-sale quarrel.'],
    [
      'month in full for the short month',
      'He was arrested on 5 May 2026 after a land-sale quarrel.',
    ],
    ['an ordinal day', 'He was arrested on 5th May 2026 after a land-sale quarrel.'],
    ['month first', 'He was arrested on May 5, 2026 after a land-sale quarrel.'],
    ['numeric day-month-year', 'He was arrested on 05/05/2026 after a land-sale quarrel.'],
    ['numeric with dashes', 'He was arrested on 5-5-2026 after a land-sale quarrel.'],
  ])('%s: ownWordsAlteredEntity is false', (_k, text) => {
    expect(ownWordsAlteredEntity(text, RAW)).toBe(false);
  });

  it('a short month in the raw_span and the full month in the text compare by value', () => {
    expect(
      ownWordsAlteredEntity('The deal of 2 March 2025 failed.', 'the deal of 2 Mar 2025 failed'),
    ).toBe(false);
  });

  it.each([
    ['another day', 'He was arrested on 6 May 2026 after a land-sale quarrel.'],
    ['another month', 'He was arrested on 5 June 2026 after a land-sale quarrel.'],
    ['another year', 'He was arrested on 5 May 2025 after a land-sale quarrel.'],
    [
      'a date the raw_span does not state',
      'He was arrested on 5 May 2026 after a land-sale quarrel of 1 January 2024.',
    ],
  ])('%s: ownWordsAlteredEntity is true', (_k, text) => {
    expect(ownWordsAlteredEntity(text, RAW)).toBe(true);
  });

  it('a name next to a kept date is still caught (the month is blanked, the name is not)', () => {
    expect(
      ownWordsAlteredEntity(
        'He was arrested on 5 May 2026 after a quarrel with Suresh.',
        'He was arrested on 5 May 2026 after a quarrel.',
      ),
    ).toBe(true);
  });

  it("end to end: the renderer keeps a rephrase with the advocate's own date", () => {
    const raw = 'He is accused in a dispute that is civil, of 2 Mar 2025, and was arrested.';
    const { status, result } = render('bail_regular', withNarrative(raw), {
      facts: 'He is accused in a civil dispute of 2 March 2025, and was arrested.',
    });
    expect(status('facts')).toBe('ok');
    expect(result.fallbacks).toEqual([]);
  });

  it('end to end: a changed date falls back to the raw_span, verbatim', () => {
    const raw = 'He is accused in a dispute that is civil, of 2 Mar 2025, and was arrested.';
    const { status, text, result } = render('bail_regular', withNarrative(raw), {
      facts: 'He is accused in a civil dispute of 3 March 2025, and was arrested.',
    });
    expect(status('facts')).toBe('fallback');
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
    expect(text('facts')).toContain(raw);
    expect(text('facts')).not.toContain('3 March 2025');
  });
});

// ── Stop list ───────────────────────────────────────────────────────────────

describe('round 3: the stop list holds no causal, temporal or negating word', () => {
  const BASE = 'He was arrested in a land sale quarrel';
  const removed = [
    // causal
    'because',
    'therefore',
    'thus',
    'hence',
    'so',
    'if',
    // temporal
    'after',
    'before',
    'since',
    'until',
    'till',
    'during',
    'while',
    'whilst',
    'when',
    'then',
    'yet',
    // negating
    'without',
    'against',
    'nor',
    'neither',
  ];

  it.each(removed)('"%s" is not on the list', (w) => {
    expect(OWN_WORDS_STOP_LIST).not.toContain(w);
  });

  it.each(removed)('adding "%s" that the raw_span lacks makes ownWordsAddedWord true', (w) => {
    expect(ownWordsAddedWord(`${BASE} ${w} the police came`, `${BASE} and the police came`)).toBe(
      true,
    );
  });

  it.each(removed)('a raw_span that holds "%s" allows it (the advocate said it)', (w) => {
    const raw = `${BASE} ${w} the police came`;
    expect(ownWordsAddedWord(raw, raw)).toBe(false);
  });

  it.each(['because', 'after', 'without', 'when'])(
    'end to end: "%s" added to the facts rephrase falls back to the raw_span',
    (w) => {
      const added = `He is accused in a civil dispute ${w} a failed land-sale agreement.`;
      const { status, result, text } = render('bail_regular', regularBase(), { facts: added });
      expect(status('facts')).toBe('fallback');
      expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
      expect(text('facts')).toContain(REGULAR_NARRATIVE_RAW);
    },
  );

  it.each(['but', 'although', 'though', 'however'])('contrast word "%s" stays on the list', (w) => {
    expect(OWN_WORDS_STOP_LIST).toContain(w);
    expect(ownWordsAddedWord(`${BASE} ${w} the police came`, `${BASE} the police came`)).toBe(
      false,
    );
  });

  it('end to end: a contrast word in the rephrase is kept', () => {
    const { status } = render('bail_regular', regularBase(), {
      facts: 'He is accused in a civil dispute, but from a failed land-sale agreement.',
    });
    expect(status('facts')).toBe('ok');
  });
});

// ── withFactsNarrative ──────────────────────────────────────────────────────

describe('round 3: withFactsNarrative copies fixed.facts to facts_narrative', () => {
  const ADVOCATE = 'she was at home all day, the complaint is a property fight';
  const NARR = 'She was at home all day and the complaint is a property dispute.';
  const fixedFacts = (): LedgerFact => fact('fixed.facts', NARR, { raw_span: ADVOCATE });
  // The packs' own checklist never holds fixed.facts for the Magistrate pack (see the FINDING below),
  // so the function's contract is tested with the fixed item added, as fixedChecklist makes it.
  const factsItem = fixedChecklist(true).find((i) => i.key === 'fixed.facts')!;
  const magChecklist = [...buildChecklist(loadRulePack('bail_before_magistrate')!), factsItem];

  it('copies each fixed.facts fact: key facts_narrative, source user, same raw_span, fixed.facts unchanged', () => {
    const f = fixedFacts();
    const out = withFactsNarrative({ facts: [f], unresolved: [] }, magChecklist);
    const copy = out.facts.find((x) => x.key === FACTS_NARRATIVE_KEY)!;
    expect(copy).toBeDefined();
    expect(copy.source).toBe('user');
    expect(copy.raw_span).toBe(ADVOCATE);
    expect(copy.display).toBe(NARR);
    expect(copy.id).not.toBe(f.id);
    expect(out.facts.filter((x) => x.key === 'fixed.facts')).toEqual([f]);
  });

  it('replaces an earlier copy and an unresolved entry on the key', () => {
    const stale = fact(FACTS_NARRATIVE_KEY, 'old words', { raw_span: 'old words' });
    const out = withFactsNarrative(
      {
        facts: [fixedFacts(), stale],
        unresolved: [
          { key: FACTS_NARRATIVE_KEY, label: 'x', reason: 'unreadable', raw_span: 'y' } as never,
        ],
      },
      magChecklist,
    );
    const copies = out.facts.filter((x) => x.key === FACTS_NARRATIVE_KEY);
    expect(copies).toHaveLength(1);
    expect(copies[0].raw_span).toBe(ADVOCATE);
    expect(out.unresolved.filter((u) => u.key === FACTS_NARRATIVE_KEY)).toEqual([]);
  });

  it('drops a copy when fixed.facts has gone', () => {
    const stale = fact(FACTS_NARRATIVE_KEY, 'old words', { raw_span: 'old words' });
    const out = withFactsNarrative({ facts: [stale], unresolved: [] }, magChecklist);
    expect(out.facts.filter((x) => x.key === FACTS_NARRATIVE_KEY)).toEqual([]);
  });

  it('a pack with its own facts_narrative item (bail_regular) is returned unchanged', () => {
    const state = { facts: [fixedFacts(), ...regularBase()], unresolved: [] };
    const checklist = [...buildChecklist(loadRulePack('bail_regular')!), factsItem];
    expect(withFactsNarrative(state, checklist)).toBe(state);
  });

  it('a checklist with no fixed.facts item (bail_regular, default_bail) is returned unchanged', () => {
    const state = { facts: [fixedFacts()], unresolved: [] };
    for (const p of ['bail_regular', 'default_bail']) {
      expect(withFactsNarrative(state, buildChecklist(loadRulePack(p)!))).toBe(state);
    }
  });

  it('nothing to copy and nothing to remove returns the same state', () => {
    const state = {
      facts: magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      unresolved: [],
    };
    expect(withFactsNarrative(state, magChecklist)).toBe(state);
  });

  it('overlayBrief writes the copy: facts_narrative source user, raw_span the advocate text', () => {
    const { state } = overlayBrief(
      { facts: [], unresolved: [] },
      { items: [{ key: 'fixed.facts', value: ADVOCATE, source: 'user' }] },
      magChecklist,
      2026,
    );
    const fixed = state.facts.find((f) => f.key === 'fixed.facts')!;
    const copy = state.facts.find((f) => f.key === FACTS_NARRATIVE_KEY)!;
    expect(fixed).toBeDefined();
    expect(copy.source).toBe('user');
    expect(copy.raw_span).toBe(fixed.raw_span);
    expect(copy.raw_span).toBe(ADVOCATE);
  });

  it('bail_regular through overlayBrief: no facts_narrative copy, its own item is untouched', () => {
    const checklist = buildChecklist(loadRulePack('bail_regular')!);
    const { state } = overlayBrief(
      { facts: [], unresolved: [] },
      { items: [{ key: 'facts_narrative', value: ADVOCATE, source: 'user' }] },
      checklist,
      2026,
    );
    expect(state.facts.filter((f) => f.key === FACTS_NARRATIVE_KEY)).toHaveLength(1);
    expect(state.facts.some((f) => f.key === 'fixed.facts')).toBe(false);
  });

  it('ledgerView hides the copy on a Magistrate-style checklist and shows facts_narrative on bail_regular', () => {
    const stateWithCopy = withFactsNarrative(
      { facts: [fixedFacts()], unresolved: [] },
      magChecklist,
    );
    const doc = (state: { facts: LedgerFact[]; unresolved: never[] }) =>
      ({
        id: 'l1',
        runType: 'user',
        documentKind: 'x',
        versions: [{ version: 1, createdAt: new Date(), reason: 'extract', ...state }],
      }) as never;
    const mag = ledgerView(doc({ ...stateWithCopy, unresolved: [] }), magChecklist);
    expect(mag.facts.map((f) => f.key)).toEqual(['fixed.facts']);
    const regChecklist = buildChecklist(loadRulePack('bail_regular')!);
    const reg = ledgerView(doc({ facts: regularBase(), unresolved: [] }), regChecklist);
    expect(reg.facts.some((f) => f.key === FACTS_NARRATIVE_KEY)).toBe(true);
  });

  it('the Magistrate facts clause, via the D1 renderer, prints the advocate words and is not blank', () => {
    const { state } = overlayBrief(
      { facts: [], unresolved: [] },
      { items: [{ key: 'fixed.facts', value: ADVOCATE, source: 'user' }] },
      magChecklist,
      2026,
    );
    const facts = [
      ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      ...state.facts.filter((f) => f.key === FACTS_NARRATIVE_KEY),
    ];
    const { status, text } = render('bail_before_magistrate', facts);
    expect(status('facts')).not.toBe('missing');
    expect(text('facts')).not.toContain('{{MISSING');
    expect(text('facts')).toContain(ADVOCATE);
  });

  it('without the copy the Magistrate facts clause is blank (MISSING), which is what the copy prevents', () => {
    const facts = magistrateBase().filter((f) => f.key !== 'facts_narrative');
    const { status, text } = render('bail_before_magistrate', facts);
    expect(status('facts')).toBe('missing');
    expect(text('facts')).toContain('{{MISSING');
  });

  // FINDING (source): buildChecklist(bail_before_magistrate) holds no `fixed.facts` item, because the pack's
  // own narrative facts (earlier_bail_applications, antecedents, ...) are part "facts", so intake-brief.ts
  // does not add the fixed one. withFactsNarrative, overlayBrief and applyEdits all get that checklist
  // (intake.service.ts:1192 and :1704), so in production the copy is never made and the Magistrate facts
  // clause is still blank. Pinned with it.failing; it flips to a pass when the copy happens on the real checklist.
  it.failing(
    'FINDING: on the real bail_before_magistrate checklist an advocate fixed.facts is copied',
    () => {
      const real = buildChecklist(loadRulePack('bail_before_magistrate')!);
      const out = withFactsNarrative({ facts: [fixedFacts()], unresolved: [] }, real);
      expect(out.facts.some((f) => f.key === FACTS_NARRATIVE_KEY)).toBe(true);
    },
  );
});

// ── Top-level list names ────────────────────────────────────────────────────

describe('round 3: a skeleton top-level list is resolved only for a `<prefix>_none_values` name', () => {
  const base = loadFixtureSkeleton('bail_regular');
  const lists = loadAvermentLists('bail_regular');
  const withClause = (listName: string, extra: Record<string, unknown>): Skeleton =>
    ({
      ...base,
      ...extra,
      clauses: [
        ...base.clauses,
        {
          id: 'probe',
          order: 999,
          required: false,
          source: 'fixed',
          variants: [{ when: { key: 'antecedents', in: listName }, text: 'PROBE-TEXT' }],
        },
      ],
    }) as unknown as Skeleton;

  it.each(['antecedents_none_values', 'a1_b2_none_values', 'none_values', 'x_y_z_none_values'])(
    'the name %s matches and resolves from the skeleton',
    (name) => {
      const sk = withClause(
        name,
        name === 'none_values' ? { none_values: ['zero'] } : { [name]: ['zero'] },
      );
      expect(skeletonValueLists(sk, lists)[name]).toEqual(['zero']);
    },
  );

  it.each([
    'custom_values',
    'none_values_extra',
    'Antecedents_none_values',
    'antecedents-none-values',
    'none',
  ])(
    'the name %s does not match: it is not resolved from the skeleton, so it is left out',
    (name) => {
      const sk = withClause(name, { [name]: ['zero'] });
      expect(skeletonValueLists(sk, lists)[name]).toBeUndefined();
    },
  );

  it('a name that is not a `_none_values` name falls through to the averments: `no_recovery.equals`', () => {
    const sk = withClause('no_recovery.equals', { 'no_recovery.equals': ['skeleton-only'] });
    const out = skeletonValueLists(sk, lists)['no_recovery.equals'];
    // The averment's signed list wins; the skeleton's own top-level array of that name is ignored.
    expect(out).toContain('no recovery');
    expect(out).not.toContain('skeleton-only');
  });

  it('an `<id>.equals` name for an averment that does not exist fails closed (left out)', () => {
    const sk = withClause('no_such_averment.equals', {});
    expect(skeletonValueLists(sk, lists)['no_such_averment.equals']).toBeUndefined();
  });

  it('a name that resolves nowhere fails closed: the variant is never chosen', () => {
    const sk = withClause('custom_values', { custom_values: ['None'] });
    const facts = [
      ...regularBase().filter((f) => f.key !== 'antecedents'),
      fact('antecedents', 'None', { value: 'none' }),
    ];
    const { text } = render('bail_regular', facts, {}, sk);
    expect(text('probe') ?? '').not.toContain('PROBE-TEXT');
  });

  it('a matching name is chosen when the value is in the list', () => {
    const sk = withClause('probe_none_values', { probe_none_values: ['none'] });
    const { text } = render('bail_regular', regularBase(), {}, sk);
    expect(text('probe')).toContain('PROBE-TEXT');
  });

  it('a list holding a non-scalar is not a value list', () => {
    const sk = withClause('probe_none_values', { probe_none_values: [{ a: 1 }] });
    expect(skeletonValueLists(sk, lists)['probe_none_values']).toBeUndefined();
  });
});
