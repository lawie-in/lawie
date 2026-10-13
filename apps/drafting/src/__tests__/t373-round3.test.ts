/**
 * T-373 round 3 (commit 91a179b), the parts that need no database:
 *  - unchanged dates are kept, changed dates fall back (withoutDatesKeepCase, keepsToFact)
 *  - the stop list no longer holds causal, temporal or negating words
 *  - the Magistrate facts clause through the D1 renderer (pinned it.failing until T-365)
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
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import type { Skeleton } from '../types/skeleton';
import {
  fact,
  loadFixtureSkeleton,
  magistrateBase,
  PackId,
  regularBase,
  REGULAR_NARRATIVE_ABSOLUTE_RAW,
  REGULAR_NARRATIVE_RAW,
  regularBaseWithNarrative,
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
    const { status } = render(
      'bail_regular',
      regularBaseWithNarrative(REGULAR_NARRATIVE_ABSOLUTE_RAW),
      {
        facts:
          'He is accused in a civil dispute, but from a failed land-sale agreement of 2 March 2025, and was arrested.',
      },
    );
    expect(status('facts')).toBe('ok');
  });
});

// ── Magistrate facts clause (T-365 landed) ────────────────────────────────

describe('round 3: the Magistrate facts clause', () => {
  // Arjun option a: the withFactsNarrative copy was removed. Mahak's T-365 added a facts_narrative field to
  // the Magistrate pack (merged at b95b1bd), so the checklist has the item and the D1 facts clause prints.
  it('real bail_before_magistrate checklist has facts_narrative and the rendered facts clause is not blank', () => {
    const checklist = buildChecklist(loadRulePack('bail_before_magistrate')!);
    const hasItem = checklist.some((i) => i.key === 'facts_narrative');
    expect(hasItem).toBe(true);
    const facts = [
      ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      ...(hasItem
        ? [
            fact('facts_narrative', 'She was at home all day.', {
              raw_span: 'she was at home all day',
            }),
          ]
        : []),
    ];
    const { status, text } = render('bail_before_magistrate', facts);
    expect(status('facts')).not.toBe('missing');
    expect(text('facts')).not.toContain('{{MISSING');
  });
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
