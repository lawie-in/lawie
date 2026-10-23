/**
 * T-577 (AJ-577-M7) - the skeleton `when` evaluator was moved out of renderDraft into
 * module-level skeletonWhenHolds / skeletonOptionIdOf with no change of behaviour.
 *
 *  1. renderDraft's output is byte-identical to the pre-extraction renderer (a frozen copy
 *     of services/draft-renderer.ts at f767ac85~1, fixtures/t577/draft-renderer.pre-t577.ts)
 *     over the four signed skeletons and a matrix of fact sets that exercise every
 *     condition form the skeletons use (when / variants / requires / in / not_in /
 *     all_of / present, inline lists and named lists).
 *  2. Direct unit tests of skeletonWhenHolds and skeletonOptionIdOf.
 *
 * No model, no database, no file under handoff/ is read by this file.
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import { factEntriesByKey, loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  DraftParagraphsOutput,
  DraftRenderInput,
  packOptionIds,
  renderDraft,
  skeletonOptionIdOf,
  SkeletonWhenContext,
  skeletonValueLists,
  skeletonWhenHolds,
} from '../services/draft-renderer';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';
import type { Skeleton, SkeletonCondition } from '../types/skeleton';
import { renderDraft as renderDraftBefore } from './fixtures/t577/draft-renderer.pre-t577';
import {
  anticipatoryBase,
  choice,
  defaultBailBase,
  fact,
  magistrateBase,
  PACK_IDS,
  PackId,
  regularBase,
} from './fixtures/t373';

const BASES: Record<PackId, () => LedgerFact[]> = {
  bail_regular: regularBase,
  bail_anticipatory: anticipatoryBase,
  bail_before_magistrate: () => magistrateBase(),
  default_bail: () => defaultBailBase('Yes'),
};

/** Every ledger key a skeleton's conditions read. */
function conditionKeysOf(skeleton: Skeleton): string[] {
  const keys = new Set<string>();
  const walk = (c: SkeletonCondition | undefined): void => {
    if (!c) return;
    if ('all_of' in c) c.all_of.forEach(walk);
    else keys.add(c.key);
  };
  for (const c of skeleton.clauses) {
    walk(c.when);
    for (const v of c.variants ?? []) walk(v.when);
    for (const i of Object.values(c.items ?? {})) walk(i.requires);
  }
  return [...keys];
}

/** What a well-behaved model returns: every clause, naming the facts it fills. */
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

function inputFor(packId: PackId, facts: LedgerFact[]): DraftRenderInput {
  const pack = loadRulePack(packId)!;
  const skeleton = loadSkeleton(packId)!;
  const lists = loadAvermentLists(packId);
  return {
    skeleton,
    output: goodOutput(skeleton, facts),
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  };
}

/** The fact sets for one pack: the base, and each condition key removed or set to each plausible value. */
function matrix(packId: PackId): Array<{ name: string; facts: LedgerFact[] }> {
  const pack = loadRulePack(packId)!;
  const skeleton = loadSkeleton(packId)!;
  const optionIds = packOptionIds(pack.facts);
  const base = BASES[packId]();
  const cases = [{ name: 'base', facts: base }];
  for (const key of conditionKeysOf(skeleton)) {
    const without = base.filter((f) => f.key !== key);
    cases.push({ name: `${key}: absent`, facts: without });
    const values = new Set<string>([
      ...Object.keys(optionIds[key] ?? {}),
      ...Object.values(optionIds[key] ?? {}),
      'yes',
      'no',
      'none',
      'nil',
      'charge_sheet_filed',
      'not_served',
      'no_recovery',
      'Not applicable',
    ]);
    for (const v of values) {
      cases.push({ name: `${key}: ${v}`, facts: [...without, fact(key, v)] });
    }
    // two entries for one key (a list fact), one matching and one not
    cases.push({
      name: `${key}: two entries`,
      facts: [...without, fact(key, 'yes'), fact(key, 'x')],
    });
    // an empty display is not held
    cases.push({ name: `${key}: blank`, facts: [...without, fact(key, '   ')] });
  }
  // choice facts by id and by label
  if (packId === 'bail_regular') {
    for (const [label, id] of [
      ['Yes — Judicial custody', 'yes_judicial'],
      ['Yes — Police custody', 'yes_police'],
      ['No — anticipating arrest', 'no'],
    ]) {
      cases.push({
        name: `custody ${id}`,
        facts: [
          ...base.filter((f) => f.key !== 'currently_in_custody'),
          choice('currently_in_custody', label, id),
        ],
      });
    }
  }
  return cases;
}

describe('renderDraft is byte-identical to the pre-extraction renderer (T-577 AJ-577-M7)', () => {
  it.each(PACK_IDS)(
    '%s: every fact set renders the same text, statuses and fallbacks',
    (packId) => {
      const cases = matrix(packId);
      expect(cases.length).toBeGreaterThan(15);
      const outputs = new Set<string>();
      for (const c of cases) {
        const input = inputFor(packId, c.facts);
        const after = renderDraft(input);
        const before = renderDraftBefore(input);
        // byte-identical: the serialised results are the same string
        expect({ name: c.name, out: JSON.stringify(after) }).toEqual({
          name: c.name,
          out: JSON.stringify(before),
        });
        outputs.add(JSON.stringify(after.rendered));
      }
      // the matrix is not trivial: the conditions change what is rendered
      expect(outputs.size).toBeGreaterThan(2);
    },
  );

  it('the signed skeletons reach every condition form but an inline not_in (all_of, present, named not_in, in, requires, variants, named lists)', () => {
    const seen = new Set<string>();
    for (const id of PACK_IDS) {
      const sk = loadSkeleton(id)!;
      const walk = (c: SkeletonCondition | undefined, where: string): void => {
        if (!c) return;
        if ('all_of' in c) {
          seen.add('all_of');
          c.all_of.forEach((x) => walk(x, where));
          return;
        }
        if (c.present) seen.add('present');
        if (c.not_in !== undefined)
          seen.add(typeof c.not_in === 'string' ? 'not_in:named' : 'not_in');
        if (c.in !== undefined) seen.add(typeof c.in === 'string' ? 'in:named' : 'in');
        seen.add(where);
      };
      for (const c of sk.clauses) {
        walk(c.when, 'when');
        for (const v of c.variants ?? []) walk(v.when, 'variants');
        for (const i of Object.values(c.items ?? {})) walk(i.requires, 'requires');
      }
    }
    for (const form of [
      'all_of',
      'present',
      'not_in:named',
      'in',
      'in:named',
      'when',
      'variants',
      'requires',
    ]) {
      expect(seen.has(form)).toBe(true);
    }
  });

  it('a synthetic skeleton adds the forms no signed one uses (inline not_in, all_of over not_in, requires with not_in), identically', () => {
    const base = loadSkeleton('bail_regular')!;
    const skeleton: Skeleton = {
      ...base,
      clauses: [
        ...base.clauses,
        {
          id: 'syn_notin',
          order: 990,
          required: false,
          source: 'fixed',
          text: 'Synthetic one for {applicant_name}.',
          slots: ['applicant_name'],
          when: { key: 'currently_in_custody', not_in: ['no'] },
        },
        {
          id: 'syn_allof',
          order: 991,
          required: false,
          source: 'fixed',
          text: 'Synthetic two for {applicant_name}.',
          slots: ['applicant_name'],
          when: {
            all_of: [
              { key: 'currently_in_custody', not_in: ['yes_police'] },
              { key: 'fir_number', present: true },
              { key: 'police_station', in: ['kotwali'] },
            ],
          },
        },
      ],
    };
    const sets = [
      regularBase(),
      regularBase().filter((f) => f.key !== 'currently_in_custody'),
      [
        ...regularBase().filter((f) => f.key !== 'currently_in_custody'),
        choice('currently_in_custody', 'No — anticipating arrest', 'no'),
      ],
      [
        ...regularBase().filter((f) => f.key !== 'currently_in_custody'),
        choice('currently_in_custody', 'Yes — Police custody', 'yes_police'),
      ],
    ];
    const printed: boolean[] = [];
    for (const facts of sets) {
      const input = { ...inputFor('bail_regular', facts), skeleton };
      input.output = goodOutput(skeleton, facts);
      const after = renderDraft(input);
      expect(JSON.stringify(after)).toBe(JSON.stringify(renderDraftBefore(input)));
      printed.push(after.rendered.some((r) => r.clauseId === 'syn_notin'));
    }
    // judicial prints it; no custody fact does not; "no" does not; police does
    expect(printed).toEqual([true, false, false, true]);
  });

  it('bail_regular D1 render with custody changes the clauses printed, identically before and after', () => {
    const judicial = regularBase();
    const none = [
      ...regularBase().filter((f) => !['currently_in_custody', 'custody_since'].includes(f.key)),
      choice('currently_in_custody', 'No — anticipating arrest', 'no'),
    ];
    const a = renderDraft(inputFor('bail_regular', judicial));
    const b = renderDraft(inputFor('bail_regular', none));
    expect(a.rendered.map((r) => r.clauseId)).toContain('custody_status');
    expect(b.rendered.map((r) => r.clauseId)).not.toContain('custody_status');
    expect(JSON.stringify(a)).toBe(
      JSON.stringify(renderDraftBefore(inputFor('bail_regular', judicial))),
    );
    expect(JSON.stringify(b)).toBe(
      JSON.stringify(renderDraftBefore(inputFor('bail_regular', none))),
    );
  });
});

// ── skeletonWhenHolds / skeletonOptionIdOf, directly ─────────────────────────

const ctxOf = (
  facts: LedgerFact[],
  optionIds: SkeletonWhenContext['optionIds'] = {},
  valueLists: SkeletonWhenContext['valueLists'] = {},
): SkeletonWhenContext => ({ held: factEntriesByKey(facts), optionIds, valueLists });

describe('skeletonWhenHolds (direct)', () => {
  it('in: an inline list matches the value, folded for case, spacing and punctuation', () => {
    const ctx = ctxOf([fact('k', ' Yes — JUDICIAL  custody ', { value: 'x' })]);
    expect(skeletonWhenHolds({ key: 'k', in: ['yes judicial custody'] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', in: ['no'] }, ctx)).toBe(false);
  });

  it('in: matches either the value or the display of an entry', () => {
    const ctx = ctxOf([fact('k', 'Shown text', { value: 'machine_value' })]);
    expect(skeletonWhenHolds({ key: 'k', in: ['machine value'] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', in: ['shown text'] }, ctx)).toBe(true);
  });

  it('in: a label resolves to its option id through optionIds', () => {
    const optionIds = { k: { 'yes judicial custody': 'yes_judicial' } };
    const ctx = ctxOf([choice('k', 'Yes — Judicial custody', 'ignored_id')], optionIds);
    expect(skeletonWhenHolds({ key: 'k', in: ['yes_judicial'] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', in: ['yes_police'] }, ctx)).toBe(false);
  });

  it('in: numbers and booleans in the list are compared as text', () => {
    const ctx = ctxOf([fact('k', '5')]);
    expect(skeletonWhenHolds({ key: 'k', in: [5] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', in: [true] }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ key: 'b', in: [true] }, ctxOf([fact('b', 'true')]))).toBe(true);
  });

  it('in: a named list is read from valueLists; an unknown name fails closed', () => {
    const ctx = ctxOf([fact('k', 'None')], {}, { none_values: ['none', 'nil'] });
    expect(skeletonWhenHolds({ key: 'k', in: 'none_values' }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', in: 'missing_list' }, ctx)).toBe(false);
  });

  it('not_in: held, and no entry is in the list', () => {
    const ctx = ctxOf([fact('k', 'recovered')], {}, { l: ['no recovery'] });
    expect(skeletonWhenHolds({ key: 'k', not_in: 'l' }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', not_in: ['recovered'] }, ctx)).toBe(false);
  });

  it('not_in: every entry must be outside the list; one entry inside makes it false', () => {
    const ctx = ctxOf([fact('k', 'a'), fact('k', 'b')]);
    expect(skeletonWhenHolds({ key: 'k', not_in: ['c'] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', not_in: ['b'] }, ctx)).toBe(false);
  });

  it('not_in: an unknown name fails closed (false), as does a key the ledger does not hold', () => {
    const ctx = ctxOf([fact('k', 'a')]);
    expect(skeletonWhenHolds({ key: 'k', not_in: 'nope' }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ key: 'absent', not_in: ['x'] }, ctx)).toBe(false);
  });

  it('not_in: an entry whose text folds to nothing is not "outside the list"', () => {
    const ctx = ctxOf([fact('k', '—', { value: '—' })]);
    expect(skeletonWhenHolds({ key: 'k', not_in: ['x'] }, ctx)).toBe(false);
  });

  it('present: held with a non-empty folded text', () => {
    expect(skeletonWhenHolds({ key: 'k', present: true }, ctxOf([fact('k', 'x')]))).toBe(true);
    expect(skeletonWhenHolds({ key: 'k', present: true }, ctxOf([]))).toBe(false);
    // a blank display is not held at all (factEntriesByKey drops it)
    expect(skeletonWhenHolds({ key: 'k', present: true }, ctxOf([fact('k', '  ')]))).toBe(false);
  });

  it('a key the ledger does not hold never satisfies a condition', () => {
    const ctx = ctxOf([]);
    expect(skeletonWhenHolds({ key: 'k', in: ['x'] }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ key: 'k', not_in: ['x'] }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ key: 'k', present: true }, ctx)).toBe(false);
  });

  it('a condition with none of in / not_in / present does not hold', () => {
    expect(skeletonWhenHolds({ key: 'k' }, ctxOf([fact('k', 'x')]))).toBe(false);
    expect(skeletonWhenHolds({ key: 'k', present: false }, ctxOf([fact('k', 'x')]))).toBe(false);
  });

  it('all_of: every inner condition must hold; an empty list never holds; nested works', () => {
    const ctx = ctxOf([fact('a', 'yes'), fact('b', 'x')]);
    const a: SkeletonCondition = { key: 'a', in: ['yes'] };
    const b: SkeletonCondition = { key: 'b', present: true };
    const c: SkeletonCondition = { key: 'c', present: true };
    expect(skeletonWhenHolds({ all_of: [a, b] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ all_of: [a, c] }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ all_of: [] }, ctx)).toBe(false);
    expect(skeletonWhenHolds({ all_of: [{ all_of: [a, b] }, a] }, ctx)).toBe(true);
    expect(skeletonWhenHolds({ all_of: [{ all_of: [a, c] }, a] }, ctx)).toBe(false);
  });

  it('a list fact (several entries) matches when any entry is in the list', () => {
    const ctx = ctxOf([fact('g', 'one'), fact('g', 'two')]);
    expect(skeletonWhenHolds({ key: 'g', in: ['two'] }, ctx)).toBe(true);
  });
});

describe('skeletonOptionIdOf (direct)', () => {
  const optionIds = {
    k: { 'yes judicial custody': 'yes_judicial', 'yes judicial': 'yes_judicial' },
  };
  const ctx = ctxOf([], optionIds);

  it('maps the display, else the string value, through the pack option ids', () => {
    expect(skeletonOptionIdOf(ctx, 'k', fact('k', 'Yes — Judicial custody'))).toBe('yes_judicial');
    expect(skeletonOptionIdOf(ctx, 'k', fact('k', '??', { value: 'yes_judicial' }))).toBe(
      'yes_judicial',
    );
  });

  it('is undefined for a key the pack does not map, or a label it does not know', () => {
    expect(
      skeletonOptionIdOf(ctx, 'other', fact('other', 'Yes — Judicial custody')),
    ).toBeUndefined();
    expect(skeletonOptionIdOf(ctx, 'k', fact('k', 'Something else'))).toBeUndefined();
  });

  it('does not read a non-string value', () => {
    expect(
      skeletonOptionIdOf(ctx, 'k', fact('k', 'zz', { value: 5 as unknown as string })),
    ).toBeUndefined();
  });
});
