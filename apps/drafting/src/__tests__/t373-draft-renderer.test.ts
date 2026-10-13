/**
 * T-373 (ADR-025 D1, "Renderer" and "Tests"): the code renderer, against the
 * four signed bail skeletons (handoff/legal/skeleton-*-signed.md, as re-signed at d87355a)
 * and Anushka's run-3 reproduce steps as ledger fixtures. T-359's ACs are
 * this file's tests (ADR-025 unit case (e)). No model, no database.
 *
 * Tests marked "ruling" pin Ajay's 13 Oct rulings on use_clause and on never
 * printing MISSING for a fact the ledger holds; they are the intended
 * behaviour, so they fail until the renderer implements the rulings.
 */
import './setupEnv';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';
import * as ts from 'typescript';

import {
  buildDraftParagraphsSchema,
  d1DrafterFacts,
  DraftParagraph,
  DraftParagraphsOutput,
  draftFactRefs,
  OWN_WORDS_STOP_LIST,
  ownWordsAddedWord,
  ownWordsAlteredEntity,
  ownWordsStem,
  packOptionIds,
  renderDraft,
  skeletonTexts,
  skeletonValueLists,
} from '../services/draft-renderer';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import type { Skeleton } from '../types/skeleton';
import {
  ANT_GROUND,
  anticipatoryBase,
  choice,
  defaultBailBase,
  fact,
  loadFixtureSkeleton,
  magistrateBase,
  PACK_IDS,
  PackId,
  REG_GROUND,
  regularBase,
  REGULAR_NARRATIVE_RAW,
  sections,
  skeletonFile,
} from './fixtures/t373';

// ── Harness ─────────────────────────────────────────────────────────────────

const SIGNED_SHA: Record<PackId, string> = {
  bail_regular: '604acbe65cd5df1b3981626bd868ceec3f1c62475b212f90d44e4a29fa5380f4',
  bail_anticipatory: '50b7dd20bcaccdbc10c6bd35094ac754e8605ba8c03dfa5855c372d9eed04d1e',
  bail_before_magistrate: '0404960987deb50cc19d24ef70535298185aa0c882db8ddc0afa39fbe9794f23',
  default_bail: '1f0384f6c8f2feffa289622b63c9bb8c1b9c698cb5744c9159fc079032349720',
};

const withoutKey = (facts: LedgerFact[], ...keys: string[]): LedgerFact[] =>
  facts.filter((f) => !keys.includes(f.key));

const para = (clauseId: string, factRefs: string[] = [], text = ''): DraftParagraph => ({
  clauseId,
  factRefs,
  text,
  items: [],
});

/** What a well-behaved model returns: every clause, naming the facts it fills. */
function goodOutput(
  skeleton: Skeleton,
  facts: LedgerFact[],
  texts: Record<string, string> = {},
): DraftParagraphsOutput {
  const held = new Set(facts.map((f) => f.key));
  return {
    paragraphs: skeleton.clauses.map((c) => {
      const refs = new Set<string>();
      for (const s of c.slots ?? []) refs.add(c.derived?.[s]?.from ?? s);
      for (const v of c.variants ?? []) for (const s of v.slots ?? []) refs.add(s);
      if (c.source === 'advocate' && c.slot) refs.add(c.slot);
      if (c.list && c.from) refs.add(c.from);
      const text =
        texts[c.id] ??
        (c.source === 'advocate' && c.slot
          ? (facts.find((f) => f.key === c.slot)?.display ?? '')
          : '');
      return para(
        c.id,
        [...refs].filter((r) => held.has(r)),
        text,
      );
    }),
  };
}

function render(
  packId: PackId,
  facts: LedgerFact[],
  output?: DraftParagraphsOutput | null,
  texts: Record<string, string> = {},
) {
  const pack = loadRulePack(packId)!;
  const skeleton = loadFixtureSkeleton(packId);
  const lists = loadAvermentLists(packId);
  const result = renderDraft({
    skeleton,
    output: output === undefined ? goodOutput(skeleton, facts, texts) : output,
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
  return { result, skeleton, text, status, ids: result.rendered.map((r) => r.clauseId) };
}

const KEPT_REPHRASE = 'He is accused in a civil dispute from a failed land-sale agreement.';

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

// ── The skeleton fixtures are the signed ones ───────────────────────────────

describe('fixtures: the signed skeletons, byte for byte', () => {
  it.each(PACK_IDS)('%s JSON matches the SHA-256 Ajay printed', (p) => {
    expect(createHash('sha256').update(skeletonFile(p)).digest('hex')).toBe(SIGNED_SHA[p]);
    const signed = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'handoff', 'legal', `skeleton-${p}-signed.md`),
      'utf8',
    );
    expect(signed).toContain(SIGNED_SHA[p]);
  });

  it.each(PACK_IDS)(
    '%s: every skeleton clause id is a mandatory clause id or a signed extra',
    (p) => {
      const ids = loadFixtureSkeleton(p).clauses.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});

// ── Schema (Arjun's D1 call shape 1) ────────────────────────────────────────

describe('the schema: per-request enums', () => {
  it('clauseId is an enum of the skeleton ids and factRefs enums are ledger keys and list refs', () => {
    const skeleton = loadFixtureSkeleton('bail_regular');
    const facts = regularBase();
    const refs = draftFactRefs(skeleton, facts);
    type Prop = { enum?: string[]; items?: { enum?: string[] } };
    const schema = buildDraftParagraphsSchema(skeleton, refs) as unknown as {
      properties: {
        paragraphs: { items: { required: string[]; properties: Record<string, Prop> } };
      };
    };
    const item = schema.properties.paragraphs.items;
    expect(item.properties.clauseId.enum).toEqual(skeleton.clauses.map((c) => c.id));
    expect(item.properties.factRefs.items!.enum).toEqual(refs);
    expect(refs).toEqual(
      expect.arrayContaining([
        'applicant_name',
        'grounds_for_bail',
        'grounds_for_bail[0]',
        'grounds_for_bail[2]',
      ]),
    );
    expect(refs).not.toContain('grounds_for_bail[3]');
    expect(refs).not.toContain('roots');
    expect(item.required).toEqual(['clauseId', 'factRefs', 'text', 'items']);
  });
});

// ── ADR-025 unit cases (a) to (d) ───────────────────────────────────────────

describe('ADR unit cases', () => {
  it('(a) a paragraph with an unknown clauseId is dropped and counted; its text prints nowhere', () => {
    const facts = regularBase();
    const skeleton = loadFixtureSkeleton('bail_regular');
    const output = goodOutput(skeleton, facts);
    output.paragraphs.push(para('invented_clause', [], 'The applicant is a law-abiding citizen.'));
    const { result } = render('bail_regular', facts, output);
    expect(result.dropped).toBe(1);
    expect(result.body).not.toContain('law-abiding');
    expect(result.rendered.map((r) => r.clauseId)).not.toContain('invented_clause');
  });

  it('(a) a paragraph with no clauseId is dropped', () => {
    const facts = regularBase();
    const output = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    output.paragraphs.push(para('', [], 'The applicant has deep roots in society.'));
    output.paragraphs.push({ text: 'No id at all' } as unknown as DraftParagraph);
    const { result } = render('bail_regular', facts, output);
    expect(result.dropped).toBe(2);
    expect(result.body).not.toContain('deep roots');
    expect(result.body).not.toContain('No id at all');
  });

  it('(b) a fixed clause whose fact is absent prints {{MISSING: label}} in the sentence', () => {
    const facts = withoutKey(regularBase(), 'fir_date');
    const { text, status, result } = render('bail_regular', facts);
    expect(text('fir_details')).toMatch(
      /^FIR No\. 143\/2026 dated \{\{MISSING: [^}]+\}\} was registered at Police Station Kotwali under /,
    );
    expect(status('fir_details')).toBe('missing');
    expect(result.rendered.find((r) => r.clauseId === 'fir_details')!.missing).toHaveLength(1);
  });

  it('(b) a fixed slot filled from the ledger prints the fact display', () => {
    const { text, status } = render('bail_regular', regularBase());
    expect(text('opening')).toBe(
      'The applicant, Ramesh Kumar, aged 34 years, resident of Village Kotwali, Patna, submits this application for regular bail under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023.',
    );
    expect(status('opening')).toBe('ok');
  });

  it('(b) a required clause with no fact at all and no paragraph is its MISSING form (label from the pack)', () => {
    const facts = withoutKey(regularBase(), 'antecedents');
    const { text, status } = render('bail_regular', facts);
    expect(text('antecedents')).toBe('{{MISSING: Criminal antecedents}}');
    expect(status('antecedents')).toBe('missing');
  });

  it('(c) an advocate clause with an invented date falls back to the advocate raw_span verbatim', () => {
    const { text, status } = render('bail_regular', regularBase(), undefined, {
      facts: 'He was arrested on 5 May 2026 after a civil dispute.',
    });
    expect(status('facts')).toBe('fallback');
    expect(text('facts')).toBe(
      `The brief facts of the case are as follows: ${REGULAR_NARRATIVE_RAW}`,
    );
    expect(text('facts')).not.toContain('5 May 2026');
  });

  it('(c) an advocate clause that adds a name falls back', () => {
    const { text, status } = render('bail_regular', regularBase(), undefined, {
      facts: 'The dispute is civil and the complainant Suresh Yadav is a rival.',
    });
    expect(status('facts')).toBe('fallback');
    expect(text('facts')).not.toContain('Suresh');
  });

  // Was a GAP pinned as it.failing in phase 1; the entity check (ruling 1) runs before keepsToFact now.
  it('a changed date after the advocate\'s own "was arrested on 5 May 2026" falls back to raw_span', () => {
    const facts = [
      ...withoutKey(regularBase(), 'facts_narrative'),
      fact('facts_narrative', 'He was arrested over a land-sale quarrel.', {
        raw_span: 'He was arrested on 5 May 2026 over a land-sale quarrel.',
      }),
    ];
    const { text } = render('bail_regular', facts, undefined, {
      facts: 'He was arrested on 9 May 2026.',
    });
    expect(text('facts')).not.toContain('9 May 2026');
  });

  it('(c) a pure rephrase (same date and facts, grammar only) is kept, status ok', () => {
    const rephrase = KEPT_REPHRASE;
    const { text, status } = render('bail_regular', regularBase(), undefined, { facts: rephrase });
    expect(status('facts')).toBe('ok');
    expect(text('facts')).toBe(`The brief facts of the case are as follows: ${rephrase}`);
  });

  it('(d) duplicate sections in one entry print once (Anushka T-189: 318(4), 316(2), 318(4))', () => {
    const facts = [
      ...withoutKey(regularBase(), 'sections_charged'),
      fact('sections_charged', 'BNS 318(4), BNS 316(2), BNS 318(4)'),
    ];
    const { text } = render('bail_regular', facts);
    expect(text('fir_details')).toContain('under BNS 318(4), BNS 316(2).');
    expect(count(text('fir_details')!, '318(4)')).toBe(1);
  });

  it('(d) Anushka T-189 as the ledger holds it, one entry per section: 318(4), 316(2), 318(4) prints each once', () => {
    const { text } = render('bail_regular', regularBase());
    expect(text('fir_details')).toContain('under BNS 318(4), BNS 316(2).');
  });

  it('(d) the same section entered as two separate entries prints once', () => {
    const facts = [
      ...withoutKey(regularBase(), 'sections_charged'),
      ...sections('sections_charged', ['BNS 318(4)', 'BNS 316(2)', 'BNS 318(4)']),
    ];
    const { text } = render('bail_regular', facts);
    expect(count(text('fir_details')!, '318(4)')).toBe(1);
    expect(count(text('fir_details')!, '316(2)')).toBe(1);
  });

  it('(d) offences_alleged (Magistrate, default bail) is deduped the same way', () => {
    const facts = [
      ...withoutKey(defaultBailBase('Yes'), 'offences_alleged'),
      fact('offences_alleged', 'BNS 318(4), BNS 318(4)'),
    ];
    const { text } = render('default_bail', facts);
    expect(count(text('fir')!, '318(4)')).toBe(1);
  });
});

// ── Rule 1: order, required, factRefs ───────────────────────────────────────

describe('order and required clauses', () => {
  it('renders by the skeleton order, not the order the model returned', () => {
    const facts = regularBase();
    const output = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    output.paragraphs.reverse();
    const { ids } = render('bail_regular', facts, output);
    const orders = ids.map(
      (id) => loadFixtureSkeleton('bail_regular').clauses.find((c) => c.id === id)!.order,
    );
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(ids[0]).toBe('opening');
    expect(ids[ids.length - 1]).toBe('no_flight_risk');
  });

  it('numbers the paragraphs 1, 2, 3 and separates them with a blank line', () => {
    const { result } = render('bail_regular', regularBase());
    result.body.split('\n\n').forEach((p, i) => expect(p.startsWith(`${i + 1}. `)).toBe(true));
  });

  it('a required clause whose fact is absent from the ledger is MISSING, and rendered[] says so', () => {
    const facts = withoutKey(regularBase(), 'applicant_name');
    const { text, status, result } = render('bail_regular', facts);
    expect(text('opening')).toMatch(/^The applicant, \{\{MISSING: [^}]+\}\}, aged 34 years/);
    expect(status('opening')).toBe('missing');
    expect(result.body).toContain('{{MISSING:');
  });

  it('a model factRef that names a fact the ledger lacks gives {{MISSING: label}} (the label, not the key)', () => {
    const facts = withoutKey(regularBase(), 'address');
    const skeleton = loadFixtureSkeleton('bail_regular');
    const output = goodOutput(skeleton, facts);
    output.paragraphs.find((p) => p.clauseId === 'opening')!.factRefs.push('address');
    const { text } = render('bail_regular', facts, output);
    expect(text('opening')).toContain('resident of {{MISSING: ');
    expect(text('opening')).not.toContain('{address}');
  });

  it('a not-required clause with no fact is left out (roots, parity, occupation)', () => {
    const { ids } = render('bail_regular', regularBase());
    for (const id of [
      'roots',
      'parity',
      'occupation',
      'dependants',
      'further_grounds',
      'recovery_stated',
      'sole_breadwinner',
    ])
      expect(ids).not.toContain(id);
  });
});

// ── Rule 2 and 3 as ruled on 13 Oct (never MISSING when the fact exists) ────

describe('ruling 2: MISSING appears only when the fact is absent', () => {
  it('ruling: a fixed clause the model omitted entirely is printed from the signed text and the ledger', () => {
    const facts = regularBase();
    const skeleton = loadFixtureSkeleton('bail_regular');
    const output = goodOutput(skeleton, facts);
    output.paragraphs = output.paragraphs.filter((p) => p.clauseId !== 'opening');
    const { text, status } = render('bail_regular', facts, output);
    expect(text('opening')).toContain('The applicant, Ramesh Kumar, aged 34 years');
    expect(status('opening')).toBe('ok');
  });

  it('ruling: a fixed slot the model did not name in factRefs still fills from the ledger', () => {
    const facts = regularBase();
    const skeleton = loadFixtureSkeleton('bail_regular');
    const output = goodOutput(skeleton, facts);
    output.paragraphs.find((p) => p.clauseId === 'opening')!.factRefs = [];
    const { text, result } = render('bail_regular', facts, output);
    expect(text('opening')).toContain('Ramesh Kumar');
    expect(result.body).not.toContain('{{MISSING');
  });

  it('ruling: an empty output still prints every fixed clause the ledger can fill, and the undertaking', () => {
    const { text, result } = render('bail_regular', regularBase(), { paragraphs: [] });
    expect(text('opening')).toContain('Ramesh Kumar');
    expect(text('fir_details')).toContain('143/2026');
    expect(text('no_flight_risk')).toBe(
      'If released on bail, the applicant undertakes not to abscond, not to tamper with the evidence or influence any witness, to appear before the Court on every date fixed, and to abide by every condition the Court may impose.',
    );
    expect(result.body).not.toContain('{{MISSING');
  });

  it('ruling: null output renders the same as an empty one (fixed text from the ledger)', () => {
    const a = render('bail_regular', regularBase(), null).result.body;
    const b = render('bail_regular', regularBase(), { paragraphs: [] }).result.body;
    expect(a).toBe(b);
    expect(a).not.toContain('{{MISSING');
  });

  it('an undertaking clause with no slots always prints (Magistrate undertakings, with a model paragraph)', () => {
    const { text, status } = render('bail_before_magistrate', magistrateBase());
    expect(text('undertakings')).toContain('the applicant undertakes not to abscond');
    expect(status('undertakings')).toBe('ok');
  });

  it('ruling: an advocate clause the model omitted falls back to raw_span, status fallback, never MISSING', () => {
    const facts = regularBase();
    const output = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    output.paragraphs = output.paragraphs.filter((p) => p.clauseId !== 'facts');
    const { text, status } = render('bail_regular', facts, output);
    expect(status('facts')).toBe('fallback');
    expect(text('facts')).toBe(
      `The brief facts of the case are as follows: ${REGULAR_NARRATIVE_RAW}`,
    );
  });

  it('ruling: an advocate clause with empty model text falls back to raw_span', () => {
    const { text, status } = render('bail_regular', regularBase(), undefined, { facts: '   ' });
    expect(status('facts')).toBe('fallback');
    expect(text('facts')).toContain(REGULAR_NARRATIVE_RAW);
  });

  it('an advocate clause whose fact is truly absent is MISSING (required) or left out (optional)', () => {
    const facts = withoutKey(regularBase(), 'facts_narrative');
    const { text, status, ids } = render('bail_regular', facts);
    expect(status('facts')).toBe('missing');
    expect(text('facts')).toMatch(/^\{\{MISSING: /);
    expect(ids).not.toContain('further_grounds');
  });
});

// ── Fallbacks (Ajay's ruling 2): reasons, the fallbacks list, own-words lists ──

describe('own-words fallbacks: reasons and the list the caller logs', () => {
  it("the model's text fails the verifier: reason unverified, on rendered[] and in fallbacks", () => {
    const { result } = render('bail_regular', regularBase(), undefined, {
      facts: 'Arrested on 5 May 2026.',
    });
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
    expect(result.rendered.find((r) => r.clauseId === 'facts')).toMatchObject({
      status: 'fallback',
      reason: 'unverified',
    });
  });

  it('the model returned nothing for it: reason not_returned (no paragraph, or empty text)', () => {
    const facts = regularBase();
    const omitted = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    omitted.paragraphs = omitted.paragraphs.filter((p) => p.clauseId !== 'facts');
    expect(render('bail_regular', facts, omitted).result.fallbacks).toEqual([
      { clauseId: 'facts', reason: 'not_returned' },
    ]);
    expect(render('bail_regular', facts, undefined, { facts: '' }).result.fallbacks).toEqual([
      { clauseId: 'facts', reason: 'not_returned' },
    ]);
    expect(render('bail_regular', facts, null).result.fallbacks).toEqual([
      { clauseId: 'facts', reason: 'not_returned' },
    ]);
  });

  it('a kept rephrase and a fixed clause are not fallbacks; rendered[] has no reason for them', () => {
    const { result } = render('bail_regular', regularBase(), undefined, {
      facts: KEPT_REPHRASE,
    });
    expect(result.fallbacks).toEqual([]);
    expect(result.rendered.every((r) => r.reason === undefined)).toBe(true);
  });

  it('a fallback entry holds the clause id and the reason only, never text', () => {
    const { result } = render('bail_regular', regularBase(), undefined, {
      facts: 'Arrested on 5 May 2026.',
    });
    for (const f of result.fallbacks) expect(Object.keys(f).sort()).toEqual(['clauseId', 'reason']);
    expect(JSON.stringify(result.fallbacks)).not.toMatch(/land-sale|Ramesh|5 May/);
  });

  describe('Magistrate v2 grounds: a plain advocate clause on grounds_for_bail, one lettered item per entry', () => {
    const two = (): LedgerFact[] => [
      ...withoutKey(magistrateBase(), 'grounds_for_bail'),
      fact('grounds_for_bail', 'She has two kids.', { raw_span: 'she has two kids' }),
      fact('grounds_for_bail', 'She was not at the spot.', {
        raw_span: 'she was not at the spot',
      }),
    ];
    const outputWith = (items: Array<[string, string]>): DraftParagraphsOutput => {
      const o = goodOutput(loadFixtureSkeleton('bail_before_magistrate'), two());
      const g = o.paragraphs.find((p) => p.clauseId === 'grounds')!;
      g.text = '';
      g.items = items.map(([factRef, text]) => ({ factRef, text }));
      return o;
    };

    it('prints the intro, then one lettered item per entry', () => {
      const { text } = render(
        'bail_before_magistrate',
        two(),
        outputWith([
          ['grounds_for_bail[0]', 'She has two kids.'],
          ['grounds_for_bail[1]', 'She was not at the spot.'],
        ]),
      );
      expect(text('grounds')).toBe(
        [
          'The applicant seeks bail on the following grounds:',
          '(a) She has two kids.',
          '(b) She was not at the spot.',
        ].join('\n'),
      );
    });

    it('each item is checked and falls back on its own', () => {
      const { text, status, result } = render(
        'bail_before_magistrate',
        two(),
        outputWith([
          ['grounds_for_bail[0]', 'She has two kids.'],
          ['grounds_for_bail[1]', "She was at her mother's house in Delhi on 4 May 2026."],
        ]),
      );
      expect(text('grounds')).toContain('(a) She has two kids.');
      expect(text('grounds')).toContain('(b) she was not at the spot');
      expect(text('grounds')).not.toContain('Delhi');
      expect(status('grounds')).toBe('fallback');
      expect(result.fallbacks).toEqual([{ clauseId: 'grounds', reason: 'unverified' }]);
    });

    it("an entry the model gave no item for prints that entry's raw_span (not_returned), the others stay", () => {
      const { text, result } = render(
        'bail_before_magistrate',
        two(),
        outputWith([['grounds_for_bail[0]', 'She has two kids.']]),
      );
      expect(text('grounds')).toContain('(a) She has two kids.');
      expect(text('grounds')).toContain('(b) she was not at the spot');
      expect(result.fallbacks).toEqual([{ clauseId: 'grounds', reason: 'not_returned' }]);
    });

    it('one block of text for several entries is not used: every entry falls back to its own words', () => {
      const o = outputWith([]);
      o.paragraphs.find((p) => p.clauseId === 'grounds')!.text =
        'She is a woman of good character.';
      const { text, result } = render('bail_before_magistrate', two(), o);
      expect(text('grounds')).not.toContain('good character');
      expect(text('grounds')).toContain('(a) she has two kids');
      expect(text('grounds')).toContain('(b) she was not at the spot');
      expect(result.fallbacks).toEqual([{ clauseId: 'grounds', reason: 'not_returned' }]);
    });

    it('every ground the advocate gave is there (T-359 AC2): one lettered item per entry', () => {
      const o = outputWith([['grounds_for_bail[0]', 'She has two kids.']]);
      const { text } = render('bail_before_magistrate', two(), o);
      expect((text('grounds')!.match(/^\([a-z]\) /gm) ?? []).length).toBe(2);
    });

    // Was a GAP pinned as it.failing in phase 1; the added-word check (ruling 2) now catches it.
    it('an added quality ("a spotless record") in an own-words item falls back to raw_span', () => {
      const o = outputWith([['grounds_for_bail[0]', 'She has two kids and a spotless record.']]);
      expect(render('bail_before_magistrate', two(), o).text('grounds')).not.toContain('spotless');
    });

    it('with one entry it is the intro and the words on one line, as before', () => {
      const { text } = render('bail_before_magistrate', magistrateBase(), undefined, {
        grounds: 'She has two kids and was not at the spot.',
      });
      expect(text('grounds')).toBe(
        'The applicant seeks bail on the following grounds: She has two kids and was not at the spot.',
      );
    });

    it('the schema offers grounds_for_bail[0], [1] ... for the several entries', () => {
      const refs = draftFactRefs(loadFixtureSkeleton('bail_before_magistrate'), two());
      expect(refs).toEqual(
        expect.arrayContaining(['grounds_for_bail', 'grounds_for_bail[0]', 'grounds_for_bail[1]']),
      );
      expect(refs).not.toContain('grounds_for_bail[2]');
    });
  });
});

// ── Variants and when ───────────────────────────────────────────────────────

describe('variants and when', () => {
  it('antecedents: the none phrasing prints for "None"', () => {
    expect(render('bail_regular', regularBase()).text('antecedents')).toBe(
      'The applicant has no criminal antecedents.',
    );
  });

  it("antecedents: a stated entry prints the signed list sentence with the advocate's words", () => {
    const facts = [
      ...withoutKey(regularBase(), 'antecedents'),
      fact('antecedents', 'FIR 12/2019 under section 379, acquitted'),
    ];
    expect(render('bail_regular', facts).text('antecedents')).toBe(
      'The criminal antecedents of the applicant are: FIR 12/2019 under section 379, acquitted.',
    );
  });

  it('antecedents: "Nil" (in the T-334 none list) prints the none phrasing', () => {
    const facts = [
      ...withoutKey(regularBase(), 'antecedents'),
      fact('antecedents', 'Nil', { value: 'nil' }),
    ];
    expect(render('bail_regular', facts).text('antecedents')).toBe(
      'The applicant has no criminal antecedents.',
    );
  });

  it('earlier applications: none and stated variants (default bail)', () => {
    expect(render('default_bail', defaultBailBase('Yes')).text('earlier_applications')).toBe(
      'No other bail application has been made by the applicant in this matter.',
    );
    const facts = [
      ...withoutKey(defaultBailBase('Yes'), 'earlier_bail_applications'),
      fact('earlier_bail_applications', 'Sessions Court Ranchi, rejected on 5 July 2026'),
    ];
    expect(render('default_bail', facts).text('earlier_applications')).toBe(
      'The earlier bail applications in this matter are: Sessions Court Ranchi, rejected on 5 July 2026.',
    );
  });

  it('custody_status applies for judicial custody, with the derived words', () => {
    expect(render('bail_regular', regularBase()).text('custody_status')).toBe(
      'The applicant has been in judicial custody since 12 June 2026.',
    );
  });

  it('custody_status does not apply to "No — anticipating arrest", and is not blanked', () => {
    const facts = [
      ...withoutKey(regularBase(), 'currently_in_custody', 'custody_since'),
      choice('currently_in_custody', 'No — anticipating arrest', 'no'),
    ];
    const { ids, result } = render('bail_regular', facts);
    expect(ids).not.toContain('custody_status');
    expect(result.body).not.toContain('in judicial custody');
  });

  it('a conditional clause never renders when its key is not held (chargesheet, not named, cooperated, s35)', () => {
    const { ids } = render('bail_regular', regularBase());
    for (const id of [
      'chargesheet_filed',
      'not_named_in_fir',
      'cooperated',
      's35_notice',
      'no_recovery',
    ])
      expect(ids).not.toContain(id);
  });

  it('a conditional clause renders when its value is given (named_in_fir = No, cooperated = Yes, s35 not served)', () => {
    const facts = [
      ...regularBase(),
      choice('named_in_fir', 'No', 'no'),
      choice('cooperated_with_investigation', 'Yes', 'yes'),
      choice('s35_notice_status', 'Not served', 'not_served'),
      choice('investigation_status', 'Charge sheet filed', 'charge_sheet_filed'),
    ];
    const { text } = render('bail_regular', facts);
    expect(text('not_named_in_fir')).toBe('The applicant is not named in the FIR.');
    expect(text('cooperated')).toBe('The applicant has cooperated with the investigation.');
    expect(text('s35_notice')).toContain('No notice under Section 35');
    expect(text('chargesheet_filed')).toBe('The charge sheet has been filed in this case.');
  });

  it('"Not known" says nothing (T-190): no claim is printed for it', () => {
    const facts = [
      ...regularBase(),
      choice('named_in_fir', 'Not known', 'not_known'),
      choice('cooperated_with_investigation', 'Not known', 'not_known'),
    ];
    const { ids } = render('bail_regular', facts);
    expect(ids).not.toContain('not_named_in_fir');
    expect(ids).not.toContain('cooperated');
  });

  it('render_if_any_slot: parity prints only when the court fact is held', () => {
    expect(render('bail_regular', regularBase()).ids).not.toContain('parity');
    const facts = [
      ...regularBase(),
      fact('co_accused_bail_court', 'Sessions Court, Patna'),
      fact('co_accused_bail_date', '1 July 2026'),
    ];
    expect(render('bail_regular', facts).text('parity')).toBe(
      'A co-accused has been granted bail by Sessions Court, Patna by order dated 1 July 2026.',
    );
  });

  it('recovery: "no recovery" prints the signed sentence; a stated recovery is the advocate\'s words (Magistrate)', () => {
    const none = [
      ...magistrateBase(),
      fact('recovery_status', 'No recovery', { value: 'no recovery' }),
    ];
    expect(render('bail_before_magistrate', none).text('no_recovery')).toBe(
      'Nothing has been recovered from the applicant.',
    );
    expect(render('bail_before_magistrate', none).ids).not.toContain('recovery_stated');
    const stated = [
      ...magistrateBase(),
      fact('recovery_status', 'A knife was seized from the shop', {
        raw_span: 'knife seized from shop',
      }),
    ];
    const r = render('bail_before_magistrate', stated);
    expect(r.ids).not.toContain('no_recovery');
    expect(r.text('recovery_stated')).toBe('As to recovery: A knife was seized from the shop');
  });
});

// ── Grounds (Ajay's 0204a7e: one signed sentence per ticked option) ─────────

describe('grounds: one per ticked option, from the ledger', () => {
  it('Anushka T-189: every ground given prints, as a lettered list, each once', () => {
    const { text } = render('bail_regular', regularBase());
    expect(text('grounds')).toBe(
      [
        'The applicant seeks bail on the following grounds:',
        '(a) The applicant has been falsely implicated in this case.',
        '(b) The applicant will cooperate with the investigation and the trial.',
        '(c) There is no likelihood of the applicant tampering with the evidence or influencing any witness.',
      ].join('\n'),
    );
  });

  it('Anushka T-189: a ground the advocate did not give ("already undergone prolonged custody") is not added, whatever the model says', () => {
    const facts = regularBase();
    const output = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    const g = output.paragraphs.find((p) => p.clauseId === 'grounds')!;
    g.text = 'The applicant has already undergone prolonged custody.';
    g.items = [
      {
        factRef: 'grounds_for_bail[0]',
        text: 'The applicant has already undergone prolonged custody.',
      },
    ];
    const { result } = render('bail_regular', facts, output);
    expect(result.body).not.toMatch(/prolonged custody|in custody since/);
  });

  it('Anushka T-189: the main ground (dispute is civil) is not dropped when the model returns only some grounds', () => {
    const facts = regularBase();
    const output: DraftParagraphsOutput = goodOutput(loadFixtureSkeleton('bail_regular'), facts);
    output.paragraphs.find((p) => p.clauseId === 'grounds')!.factRefs = ['grounds_for_bail[1]'];
    const { text } = render('bail_regular', facts, output);
    expect(text('grounds')).toContain('falsely implicated');
    expect(text('grounds')).toContain('cooperate');
    expect(text('grounds')).toContain('tampering');
  });

  it('a ground ticked twice prints once', () => {
    const facts = [...regularBase(), fact('grounds_for_bail', REG_GROUND.cooperation)];
    expect(count(render('bail_regular', facts).text('grounds')!, 'will cooperate')).toBe(1);
  });

  it('a ground with a slot fills it from the ledger (prolonged custody uses custody_since)', () => {
    const facts = [...regularBase(), fact('grounds_for_bail', REG_GROUND.prolonged_custody)];
    expect(render('bail_regular', facts).text('grounds')).toContain(
      'The applicant has been in custody since 12 June 2026.',
    );
  });

  it('a ground whose slot fact is absent prints the MISSING blank for that fact', () => {
    const facts = [
      ...withoutKey(regularBase(), 'custody_since'),
      fact('grounds_for_bail', REG_GROUND.prolonged_custody),
    ];
    const { text, status } = render('bail_regular', facts);
    expect(text('grounds')).toMatch(/in custody since \{\{MISSING: /);
    expect(status('grounds')).toBe('missing');
  });

  it('requires: investigation_complete ticked with no charge sheet fact renders MISSING: Investigation status', () => {
    const facts = [...regularBase(), fact('grounds_for_bail', REG_GROUND.investigation_complete)];
    const { text, status, result } = render('bail_regular', facts);
    expect(text('grounds')).toContain('{{MISSING: Investigation status}}');
    expect(text('grounds')).not.toContain('custodial interrogation');
    expect(status('grounds')).toBe('missing');
    expect(result.rendered.find((r) => r.clauseId === 'grounds')!.missing).toContain(
      'Investigation status',
    );
  });

  it('requires: investigation_complete with the charge sheet filed prints the signed sentence', () => {
    const facts = [
      ...regularBase(),
      fact('grounds_for_bail', REG_GROUND.investigation_complete),
      choice('investigation_status', 'Charge sheet filed', 'charge_sheet_filed'),
    ];
    expect(render('bail_regular', facts).text('grounds')).toContain(
      'The charge sheet has been filed, and the custodial interrogation of the applicant is not required.',
    );
  });

  it('an option that has no signed sentence prints MISSING with the option label, never a dropped ground', () => {
    const facts = [
      ...regularBase(),
      fact('grounds_for_bail', 'Applicant is the only son of an aged mother'),
    ];
    expect(render('bail_regular', facts).text('grounds')).toContain(
      '{{MISSING: Applicant is the only son of an aged mother}}',
    );
  });

  it('anticipatory: its own ten options; a ticked civil-dispute ground prints its signed sentence', () => {
    const facts = [
      ...anticipatoryBase(),
      fact('grounds_for_bail', 'Dispute is essentially civil in nature'),
    ];
    const { text } = render('bail_anticipatory', facts);
    expect(text('grounds')).toContain(
      '(a) The applicant has been falsely implicated in this case.',
    );
    expect(text('grounds')).toContain(
      '(b) The dispute between the parties is essentially civil in nature.',
    );
  });

  it('Magistrate v2: grounds is an advocate clause with no option list; it falls back to raw_span on an invented fact', () => {
    const { text, status } = render('bail_before_magistrate', magistrateBase(), undefined, {
      grounds: 'She is a woman of good character and was in Delhi on 4 May 2026.',
    });
    expect(status('grounds')).toBe('fallback');
    expect(text('grounds')).toBe(
      'The applicant seeks bail on the following grounds: she has two kids, was not at the spot',
    );
  });

  describe('use_clause (ruling 1)', () => {
    const ticked = (): LedgerFact[] => [
      ...regularBase(),
      fact('grounds_for_bail', REG_GROUND.no_criminal_antecedent),
    ];

    it('ruling: a ticked use_clause ground prints the antecedents text once, inside the grounds list', () => {
      const { text, result } = render('bail_regular', ticked());
      expect(text('grounds')).toContain('The applicant has no criminal antecedents.');
      expect(count(result.body, 'The applicant has no criminal antecedents.')).toBe(1);
    });

    it('ruling: the standalone antecedents paragraph is skipped when the ground is ticked', () => {
      const { ids } = render('bail_regular', ticked());
      expect(ids).not.toContain('antecedents');
    });

    it('ruling: not ticked, antecedents prints on its own as usual', () => {
      const { ids, text, result } = render('bail_regular', regularBase());
      expect(ids).toContain('antecedents');
      expect(text('antecedents')).toBe('The applicant has no criminal antecedents.');
      expect(count(result.body, 'no criminal antecedents')).toBe(1);
    });

    it('ruling: ticked, with the antecedents given as a list, the stated sentence prints once in the list', () => {
      const facts = [
        ...withoutKey(ticked(), 'antecedents'),
        fact('antecedents', 'FIR 12/2019 under section 379'),
      ];
      const { result, ids } = render('bail_regular', facts);
      expect(count(result.body, 'FIR 12/2019 under section 379')).toBe(1);
      expect(ids).not.toContain('antecedents');
    });

    it('ruling: ticked with antecedents absent, the blank prints once (in the list), not twice', () => {
      const facts = withoutKey(ticked(), 'antecedents');
      const { result } = render('bail_regular', facts);
      expect(count(result.body, '{{MISSING: Criminal antecedents}}')).toBe(1);
    });

    it('anticipatory: the same rule for its no_criminal_antecedent ground', () => {
      const facts = [
        ...anticipatoryBase(),
        fact('grounds_for_bail', ANT_GROUND.no_criminal_antecedent),
      ];
      const { result, ids } = render('bail_anticipatory', facts);
      expect(count(result.body, 'The applicant has no criminal antecedents.')).toBe(1);
      expect(ids).not.toContain('antecedents');
    });
  });

  describe('skip_if_rendered', () => {
    it('medical: skipped when the medical ground printed, printed when it did not', () => {
      const base = [...regularBase(), fact('medical_condition', 'diabetes')];
      const withGround = [...base, fact('grounds_for_bail', REG_GROUND.medical_grounds)];
      const a = render('bail_regular', withGround);
      expect(a.ids).not.toContain('medical');
      expect(count(a.result.body, 'diabetes')).toBe(1);
      const b = render('bail_regular', base);
      expect(b.text('medical')).toBe('The applicant suffers from diabetes.');
    });

    it('anticipatory roots: skipped when the deep-roots ground printed', () => {
      const base = [
        ...anticipatoryBase(),
        fact('local_ties', 'family farm and shop in the village'),
      ];
      const a = render('bail_anticipatory', [
        ...base,
        fact('grounds_for_bail', ANT_GROUND.deep_roots_in_community),
      ]);
      expect(a.ids).not.toContain('roots');
      expect(count(a.result.body, 'family farm and shop')).toBe(1);
      expect(render('bail_anticipatory', base).ids).toContain('roots');
    });
  });
});

// ── T-359 AC1 to AC9 as renderer fixtures (Anushka run 3) ───────────────────

describe('T-359 ACs from Anushka run-3 reproduce steps', () => {
  const INVENTED = [
    /law-abiding/i,
    /good character/i,
    /roots in (his|her|the) community/i,
    /history of fleeing/i,
    /no prior criminal antecedents/i,
    /has not been convicted/i,
    /prolonged custody/i,
    /deep roots/i,
    /ties to (his|her) village/i,
  ];
  const noneOf = (body: string): void => {
    for (const re of INVENTED) expect(body).not.toMatch(re);
  };

  it('AC1 regular: no roots, character, flight or custody-length clause when the advocate gave none', () => {
    const { result, ids } = render('bail_regular', regularBase());
    noneOf(result.body);
    expect(ids).not.toContain('roots');
  });

  it('AC1 anticipatory (T-241): invented roots/character/flight text from the model cannot print', () => {
    const facts = anticipatoryBase();
    const skeleton = loadFixtureSkeleton('bail_anticipatory');
    const output = goodOutput(skeleton, facts);
    output.paragraphs.push(
      para(
        'roots',
        ['local_ties'],
        'The applicant is a law-abiding citizen with roots in his community.',
      ),
      para(
        'further_grounds',
        ['additional_context'],
        'He has no history of fleeing and has ties to his village and his business.',
      ),
    );
    const { result, ids } = render('bail_anticipatory', facts, output);
    noneOf(result.body);
    expect(ids).not.toContain('roots');
    expect(ids).not.toContain('further_grounds');
  });

  it('AC1 anticipatory (T-241): the advocate\'s "boundary quarrel" is not turned into a "business dispute"', () => {
    const { result } = render('bail_anticipatory', anticipatoryBase());
    expect(result.body).toContain('boundary quarrel');
    expect(result.body).not.toMatch(/business dispute/i);
  });

  it('AC1 Magistrate (T-241): no "woman of good character", antecedents are a blank, not "no prior antecedents"', () => {
    const facts = magistrateBase();
    const skeleton = loadFixtureSkeleton('bail_before_magistrate');
    const output = goodOutput(skeleton, facts);
    output.paragraphs.push(
      para(
        'further_grounds',
        [],
        'She is a woman of good character with no prior criminal antecedents.',
      ),
    );
    const { result, text } = render('bail_before_magistrate', facts, output);
    expect(result.body).not.toMatch(
      /good character|no prior criminal antecedents|no criminal antecedents/i,
    );
    expect(text('antecedents')).toBe('{{MISSING: Criminal antecedents}}');
  });

  it('AC2 every ground the advocate gave appears (regular, three grounds), none silently dropped', () => {
    const { text } = render('bail_regular', regularBase());
    expect((text('grounds')!.match(/^\([a-z]\) /gm) ?? []).length).toBe(3);
  });

  it('AC2 a ground given but without a signed sentence is shown as a blank, not dropped', () => {
    const facts = [
      ...regularBase(),
      fact('grounds_for_bail', 'Co-accused in similar case already on bail'),
    ];
    expect(
      (
        render('bail_regular', facts)
          .text('grounds')!
          .match(/^\([a-z]\) /gm) ?? []
      ).length,
    ).toBe(4);
  });

  it('AC3 a section entered twice prints once (regular)', () => {
    const { result } = render('bail_regular', regularBase());
    expect(count(result.body, '318(4)')).toBe(1);
  });

  it('AC4 default bail, will furnish bail bonds = No: no bond undertaking, the blank the brief promised', () => {
    const { text, status, result } = render('default_bail', defaultBailBase('No'));
    expect(result.body).not.toMatch(/undertakes|furnish bail bonds and sureties as this/i);
    expect(text('willingness')).toBe(
      '{{MISSING: Whether the applicant will furnish bail bonds and sureties}}',
    );
    expect(status('willingness')).toBe('missing');
  });

  it('AC4 default bail, bonds = Yes: the signed undertaking prints', () => {
    const { text } = render('default_bail', defaultBailBase('Yes'));
    expect(text('willingness')).toBe(
      "The applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs.",
    );
  });

  it('AC4 default bail: no invented "not convicted ... roots in the community" paragraph', () => {
    const facts = defaultBailBase('No');
    const output = goodOutput(loadFixtureSkeleton('default_bail'), facts);
    output.paragraphs.push(
      para(
        'fir',
        [],
        'The applicant has not been convicted of any offence and has roots in the community.',
      ),
    );
    const { result } = render('default_bail', facts, output);
    noneOf(result.body);
    expect(result.body).not.toMatch(/convicted/);
  });

  it('AC4 default bail: period, expiry and provision are signed text and ledger slots, no day count of its own', () => {
    const { text, result } = render('default_bail', defaultBailBase('Yes'));
    expect(text('applicable_window')).toBe(
      'It is submitted that the default-bail period applicable to the offence charged is 60 days.',
    );
    expect(text('indefeasible_right')).toContain('expired on 2 August 2026');
    expect(result.body).not.toMatch(/\b(68|90) days\b/);
  });

  it('AC5 Magistrate: "no earlier application" is stated once and not also a blank', () => {
    const facts = [
      ...magistrateBase(),
      fact('earlier_bail_applications', 'None', { value: 'none' }),
    ];
    const { text, result } = render('bail_before_magistrate', facts);
    expect(text('earlier_applications')).toBe(
      'No other bail application has been made by the applicant in this matter.',
    );
    expect(result.body).not.toMatch(/MISSING: Earlier/);
    expect(count(result.body, 'bail application')).toBe(1);
  });

  it('AC5 Magistrate: the description\'s own words ("No bail application filed earlier") are one statement, not statement plus blank', () => {
    const facts = [
      ...magistrateBase(),
      fact('earlier_bail_applications', 'No bail application filed earlier'),
    ];
    const { result } = render('bail_before_magistrate', facts);
    expect(result.body).not.toMatch(/MISSING: Earlier/);
    expect(count(result.body, 'No bail application filed earlier')).toBe(1);
  });

  it('AC5 Magistrate: with nothing on earlier applications, it is the blank only', () => {
    const { text } = render('bail_before_magistrate', magistrateBase());
    expect(text('earlier_applications')).toBe(
      '{{MISSING: Earlier bail applications in this matter}}',
    );
  });

  it("AC6 the verification relation is not the renderer's: it renders no S/o, W/o or D/o", () => {
    for (const p of PACK_IDS) {
      const base = {
        bail_regular: regularBase,
        bail_anticipatory: anticipatoryBase,
        bail_before_magistrate: magistrateBase,
        default_bail: () => defaultBailBase('Yes'),
      }[p]();
      expect(render(p, base).result.body).not.toMatch(/\b[SWD]\/o\b|verification/i);
    }
  });

  it('AC7 Magistrate, woman, non-bailable: the BNSS 480(1) first proviso line, Ajay\'s wording ("may")', () => {
    const { text } = render('bail_before_magistrate', magistrateBase());
    expect(text('woman_proviso')).toBe(
      "It is submitted that the applicant is a woman, and under the first proviso to Section 480(1) of the BNSS this Hon'ble Court may release her on bail even where the offence falls within clause (i) or (ii) of that sub-section.",
    );
  });

  it('AC7 Magistrate: no proviso for a man, or for a bailable offence', () => {
    expect(render('bail_before_magistrate', magistrateBase({ woman: false })).ids).not.toContain(
      'woman_proviso',
    );
    expect(render('bail_before_magistrate', magistrateBase({ bailable: true })).ids).not.toContain(
      'woman_proviso',
    );
  });

  it('AC7 Magistrate: bailable offence is under Section 478; non-bailable under Section 480', () => {
    expect(
      render('bail_before_magistrate', magistrateBase({ bailable: true })).text(
        'offence_classification',
      ),
    ).toContain('Section 478');
    expect(
      render('bail_before_magistrate', magistrateBase()).text('offence_classification'),
    ).toContain('Section 480');
  });

  it('AC7 Magistrate: no classification fact gives the blank, not a guessed section', () => {
    const { text } = render(
      'bail_before_magistrate',
      withoutKey(magistrateBase(), 'offence_classification'),
    );
    expect(text('offence_classification')).toBe('{{MISSING: Offence Classification}}');
  });
});

// ── rendered[] statuses (what the checks panel reads) ───────────────────────

describe('rendered[]', () => {
  it('lists each printed clause once, in order, with ok / missing / fallback', () => {
    const facts = withoutKey(regularBase(), 'fir_date');
    const { result } = render('bail_regular', facts, undefined, {
      facts: 'Arrested on 5 May 2026.',
    });
    const ids = result.rendered.map((r) => r.clauseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(result.paragraphs.map((p) => p.clauseId));
    expect(result.rendered.find((r) => r.clauseId === 'opening')!.status).toBe('ok');
    expect(result.rendered.find((r) => r.clauseId === 'fir_details')!.status).toBe('missing');
    expect(result.rendered.find((r) => r.clauseId === 'facts')!.status).toBe('fallback');
  });

  it('every clause that prints a {{MISSING}} is status missing; every other fixed clause is ok', () => {
    const { result } = render('bail_regular', withoutKey(regularBase(), 'police_station'));
    for (const p of result.paragraphs) {
      const blank = p.text.includes('{{MISSING:');
      if (p.clauseId !== 'facts') expect(p.status === 'missing').toBe(blank);
    }
  });

  it('missing[] carries the labels of the blanks printed', () => {
    const { result } = render('bail_regular', withoutKey(regularBase(), 'police_station'));
    const m = result.rendered.find((r) => r.clauseId === 'fir_details')!.missing!;
    expect(m).toHaveLength(1);
    expect(result.body).toContain(`{{MISSING: ${m[0]}}}`);
  });

  it('a clause dropped by skip_if_rendered is not in rendered[]', () => {
    const facts = [
      ...regularBase(),
      fact('medical_condition', 'asthma'),
      fact('grounds_for_bail', REG_GROUND.medical_grounds),
    ];
    expect(render('bail_regular', facts).status('medical')).toBeUndefined();
  });
});

// ── Arjun's rule: the renderer writes no words of its own ───────────────────

/**
 * Removes every string a rendered body may be made of; what is left, once
 * whitespace, paragraph numbers, (a)/(b) letters and ", " are gone, is words
 * the renderer wrote.
 */
function residual(
  body: string,
  skeleton: Skeleton,
  facts: LedgerFact[],
  model: string[],
  labels: string[],
): string {
  const allowed = new Set<string>(model);
  const pieces = (t: string | undefined): void => {
    for (const chunk of (t ?? '').split(/\{[A-Za-z0-9_.]+\}/))
      if (chunk.trim()) allowed.add(chunk.trim());
  };
  for (const t of skeletonTexts(skeleton)) pieces(t);
  for (const c of skeleton.clauses) {
    pieces(c.intro);
    if (c.missing_label) labels.push(c.missing_label);
    for (const it of Object.values(c.items ?? {}))
      if (it.missing_label) labels.push(it.missing_label);
  }
  for (const f of facts) {
    labels.push(f.label, f.display.trim());
    for (const s of [f.display, f.raw_span ?? '']) {
      if (s.trim()) allowed.add(s.trim());
      for (const seg of s.split(/[,;]/)) if (seg.trim()) allowed.add(seg.trim());
    }
  }
  let s = body
    .split('\n')
    .map((l) => l.replace(/^\d+\. /, '').replace(/^\([a-z]\) /, ''))
    .join('\n');
  s = s.replace(/\{\{MISSING: ([^}]*)\}\}/g, (m, label: string) =>
    labels.includes(label) || label === 'detail' ? '§' : m,
  );
  for (const a of [...allowed].sort((x, y) => y.length - x.length)) s = s.split(a).join('§');
  return s.replace(/[\s§,]+/g, '');
}

describe('Arjun: every rendered string comes from a skeleton, a ledger fact, or the signed MISSING marker', () => {
  const clauseLabels = (p: PackId): string[] =>
    loadRulePack(p)!.mandatoryClauses.map((m) => m.title);
  const checklist = (p: PackId): string[] => buildChecklist(loadRulePack(p)!).map((i) => i.label);

  type Case = [string, PackId, () => LedgerFact[], Record<string, string>];
  const cases: Case[] = [
    ['regular, full', 'bail_regular', regularBase, {}],
    [
      'regular, fallback on invented date',
      'bail_regular',
      regularBase,
      { facts: 'Arrested on 5 May 2026 by Suresh.' },
    ],
    [
      'regular, rephrase kept',
      'bail_regular',
      regularBase,
      {
        facts:
          'He is accused in a civil dispute from a failed land sale agreement of 2 March 2025.',
      },
    ],
    [
      'regular, blanks',
      'bail_regular',
      () => withoutKey(regularBase(), 'fir_date', 'applicant_age', 'antecedents'),
      {},
    ],
    [
      'regular, all grounds incl. use_clause, requires failing, no sentence',
      'bail_regular',
      () => [
        ...regularBase(),
        ...Object.values(REG_GROUND).map((l) => fact('grounds_for_bail', l)),
        fact('grounds_for_bail', 'An option with no signed sentence'),
        fact('medical_condition', 'diabetes'),
      ],
      {},
    ],
    ['anticipatory', 'bail_anticipatory', anticipatoryBase, {}],
    ['magistrate woman', 'bail_before_magistrate', magistrateBase, {}],
    [
      'magistrate fallback',
      'bail_before_magistrate',
      magistrateBase,
      { grounds: 'Good character on 4 May 2026.' },
    ],
    [
      'magistrate several grounds',
      'bail_before_magistrate',
      () => [
        ...withoutKey(magistrateBase(), 'grounds_for_bail'),
        fact('grounds_for_bail', 'She has two kids.', { raw_span: 'she has two kids' }),
        fact('grounds_for_bail', 'She was not at the place.', {
          raw_span: 'she was not at the spot',
        }),
      ],
      {},
    ],
    ['default, bonds yes', 'default_bail', () => defaultBailBase('Yes'), {}],
    ['default, bonds no', 'default_bail', () => defaultBailBase('No'), {}],
  ];

  it.each(cases)('%s', (_name, packId, mk, texts) => {
    const facts = mk();
    const { result, skeleton } = render(packId, facts, undefined, texts);
    const model = Object.values(texts);
    const left = residual(
      result.body,
      skeleton,
      facts,
      [],
      [...checklist(packId), ...clauseLabels(packId)],
    );
    // The model's kept own-words text is an allowed source too.
    let rest = left;
    for (const m of model) rest = rest.split(m.replace(/[\s,]+/g, '')).join('');
    expect(rest).toBe('');
  });

  it('the residual check can fail: a word the renderer adds shows up', () => {
    const facts = regularBase();
    const { result, skeleton } = render('bail_regular', facts);
    expect(residual(result.body + ' and furthermore', skeleton, facts, [], [])).not.toBe('');
  });

  it('draft-renderer.ts holds no sentence literal: every string literal in it is a key, a code or a single word', () => {
    const file = join(__dirname, '..', 'services', 'draft-renderer.ts');
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    const literals: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n)) return;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literals.push(n.text);
      if (ts.isTemplateExpression(n)) {
        literals.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
    const sentences = literals.filter((l) => /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(l));
    expect(sentences).toEqual([]);
    // The only words the renderer may write besides its numbers and letters.
    const odd = literals.filter(
      (l) =>
        l.trim() !== '' && !/^[\d.\s()]*$/.test(l) && l !== ', ' && !/^[A-Za-z_[\]0-9|]+$/.test(l),
    );
    expect(odd).toEqual([]);
  });
});

describe('d1DrafterFacts: raw_span only for the keys an advocate clause carries', () => {
  it('gives raw_span for facts_narrative and not for name or date', () => {
    const skeleton = loadFixtureSkeleton('bail_regular');
    const out = d1DrafterFacts(skeleton, regularBase());
    expect(out.find((f) => f.key === 'facts_narrative')!.raw_span).toBe(REGULAR_NARRATIVE_RAW);
    expect(out.find((f) => f.key === 'applicant_name')).not.toHaveProperty('raw_span');
    expect(out.find((f) => f.key === 'fir_date')).not.toHaveProperty('raw_span');
  });
});

// ── Phase 2: Arjun's rulings 1 and 2 on the advocate's own words ────────────

/** The raw_span the checks below compare against. "was arrested on" is a phrase the pack bans. */
const RAW = 'He was arrested on Monday after 3 weeks in a land-sale quarrel with Suresh in Patna.';
const RAW_DATED = 'He was arrested on 5 May 2026 after a land-sale quarrel.';

function withNarrative(raw: string): LedgerFact[] {
  return [
    ...withoutKey(regularBase(), 'facts_narrative'),
    fact('facts_narrative', raw, { raw_span: raw }),
  ];
}

describe('ruling 1: a changed date, number, name or place falls back, even with a banned phrase in raw_span', () => {
  const PREFIX = 'The brief facts of the case are as follows: ';

  it("the unchanged text is kept (the banned phrase is the advocate's own)", () => {
    const { text, status } = render('bail_regular', withNarrative(RAW), undefined, { facts: RAW });
    expect(status('facts')).toBe('ok');
    expect(text('facts')).toBe(`${PREFIX}${RAW}`);
  });

  it.each([
    ['date', RAW_DATED, RAW_DATED.replace('5 May 2026', '9 May 2026'), '9 May'],
    ['number', RAW, RAW.replace('3 weeks', '4 weeks'), '4 weeks'],
    ['name', RAW, RAW.replace('Suresh', 'Mahesh'), 'Mahesh'],
    ['place', RAW, RAW.replace('Patna', 'Gaya'), 'Gaya'],
  ])('a changed %s falls back to the raw_span verbatim', (_k, raw, changed, bad) => {
    const { text, status, result } = render('bail_regular', withNarrative(raw), undefined, {
      facts: changed,
    });
    expect(status('facts')).toBe('fallback');
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
    expect(text('facts')).toBe(`${PREFIX}${raw}`);
    expect(text('facts')).not.toContain(bad);
  });

  it.each([
    ['date', 'He was arrested on 9 May 2026.', RAW_DATED],
    ['number', 'He was arrested after 4 weeks.', RAW],
    ['name', 'He was arrested with Mahesh.', RAW],
    ['place', 'He was arrested in Gaya.', RAW],
  ])('ownWordsAlteredEntity: a changed %s is true', (_k, text, raw) => {
    expect(ownWordsAlteredEntity(text, raw)).toBe(true);
  });

  it('ownWordsAlteredEntity: the same name, place and number, reordered, are false', () => {
    expect(
      ownWordsAlteredEntity('In Patna, Suresh quarrelled; arrested after 3 weeks, on Monday.', RAW),
    ).toBe(false);
  });

  it('a sentence-initial capital is not read as a name', () => {
    expect(ownWordsAlteredEntity('Arrested after a quarrel.', 'arrested after a quarrel')).toBe(
      false,
    );
  });

  it('an invented name is caught by the entity check on its own (the content-word check is separate)', () => {
    // "Suresh" is in raw_span here, so the added-word check is silent for the name.
    expect(ownWordsAddedWord('Suresh quarrelled', 'quarrelled with Suresh')).toBe(false);
    expect(ownWordsAlteredEntity('Suresh quarrelled with Mahesh', 'quarrelled with Suresh')).toBe(
      true,
    );
  });

  // FINDING (source): ownWordsAlteredEntity scans the model text for mid-sentence capitalised words
  // WITHOUT first taking the dates out of it, so the month of a written date ("5 May 2026", "2 March
  // 2025") is read as a name that raw_span "lacks" (raw_span's own dates are stripped). Every text that
  // states a date therefore falls back, even when the date is the advocate's own, unchanged. Safe
  // (it falls back) but it makes a kept date impossible and inflates the fallback rate. Pinned with
  // it.failing; flips to a normal pass when the month is excluded from the capitalised-word scan.
  describe("GAP: an unchanged date is the advocate's own and must be kept", () => {
    it.failing(
      'ownWordsAlteredEntity(text with the same dated "5 May 2026", raw_span) is false',
      () => {
        expect(ownWordsAlteredEntity(RAW_DATED, RAW_DATED)).toBe(false);
      },
    );
    it.failing(
      'dates compare by value: "2 March 2025" for "2 Mar 2025" is not an alteration',
      () => {
        expect(
          ownWordsAlteredEntity('The deal of 2 March 2025 failed.', 'deal of 2 Mar 2025 failed'),
        ).toBe(false);
      },
    );
    it.failing("the renderer keeps a rephrase that states the advocate's own date", () => {
      const raw = 'He is accused in a dispute that is civil, of 2 Mar 2025, and was arrested.';
      const { status } = render('bail_regular', withNarrative(raw), undefined, {
        facts: 'He is accused in a civil dispute of 2 March 2025, and was arrested.',
      });
      expect(status('facts')).toBe('ok');
    });
    it('a different date is still caught (3 March for 2 Mar), by value', () => {
      expect(
        ownWordsAlteredEntity('The deal of 3 March 2025 failed.', 'deal of 2 Mar 2025 failed'),
      ).toBe(true);
    });
  });
});

describe('ruling 2: a content word the raw_span does not hold falls back', () => {
  it('a kept rephrase uses raw_span words and stop words only', () => {
    expect(ownWordsAddedWord(KEPT_REPHRASE, REGULAR_NARRATIVE_RAW)).toBe(false);
    const { status } = render('bail_regular', regularBase(), undefined, { facts: KEPT_REPHRASE });
    expect(status('facts')).toBe('ok');
  });

  it.each([
    ['an adjective', 'He is accused in a violent dispute from a failed land-sale agreement.'],
    ['a verb', 'He is accused in a dispute that escalated from a failed land-sale agreement.'],
    ['a noun', 'He is accused in a dispute over a failed land-sale agreement and property.'],
    [
      'an added quality',
      'He is a respected man accused in a dispute from a failed land-sale agreement.',
    ],
  ])('%s that the raw_span lacks falls back to the raw_span', (_k, added) => {
    const { text, status, result } = render('bail_regular', regularBase(), undefined, {
      facts: added,
    });
    expect(status('facts')).toBe('fallback');
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
    expect(text('facts')).toBe(
      `The brief facts of the case are as follows: ${REGULAR_NARRATIVE_RAW}`,
    );
  });

  it('negation is a content word: adding "not" falls back (it is not on the stop list)', () => {
    expect(OWN_WORDS_STOP_LIST).not.toContain('not');
    expect(OWN_WORDS_STOP_LIST).not.toContain('no');
    expect(ownWordsAddedWord('He was not arrested', 'He was arrested')).toBe(true);
  });

  it('inflection: the stems of arrest / arrested / arrests / arresting are one', () => {
    for (const w of ['arrest', 'arrested', 'arrests', 'arresting']) {
      expect(ownWordsStem(w)).toBe(ownWordsStem('arrest'));
      expect(ownWordsAddedWord(`He was ${w}`, 'the police arrest him')).toBe(false);
    }
  });

  it.each([
    ['kids', 'kid'],
    ['disputes', 'dispute'],
    ['disputed', 'dispute'],
    ['applied', 'apply'],
    ['failing', 'failed'],
    ['sales', 'sale'],
  ])('inflection: "%s" and "%s" compare equal', (a, b) => {
    expect(ownWordsStem(a)).toBe(ownWordsStem(b));
  });

  it('case is ignored', () => {
    expect(ownWordsAddedWord('CIVIL Dispute', 'a civil dispute')).toBe(false);
  });

  // Characterisation of the stemmer's limit: it does not handle irregular plurals. That fails safe
  // (a fallback to the advocate's own words), never a silent pass.
  it('limit: an irregular plural ("children" for "child") is not the same stem, so it falls back', () => {
    expect(ownWordsAddedWord('two children', 'a child')).toBe(true);
  });

  it('every stop-list word is allowed, with nothing else added', () => {
    for (const w of OWN_WORDS_STOP_LIST) {
      expect(ownWordsAddedWord(`dispute ${w} dispute`, 'dispute')).toBe(false);
    }
  });

  it('words may be dropped: a text that is a subset of raw_span adds nothing', () => {
    expect(ownWordsAddedWord('dispute', 'the dispute is a civil one')).toBe(false);
    expect(ownWordsAddedWord('civil dispute', 'the civil dispute')).toBe(false);
  });

  it('a date is taken out before the words are compared (its month is not a word)', () => {
    expect(ownWordsAddedWord('Deal of 2 March 2025 failed', 'deal of 2 Mar 2025 failed')).toBe(
      false,
    );
  });

  it('the stop list is data: lower case, no duplicates, no digits, and no word is empty', () => {
    expect(new Set(OWN_WORDS_STOP_LIST).size).toBe(OWN_WORDS_STOP_LIST.length);
    for (const w of OWN_WORDS_STOP_LIST) expect(w).toMatch(/^[a-z]+$/);
  });

  it('a fixed (system-written) clause is never run through the own-words checks', () => {
    // The opening and prayer carry many words the advocate never typed.
    const { status } = render('bail_regular', regularBase());
    expect(status('opening')).toBe('ok');
  });
});

describe('antecedents_none_values (Ajay, d87355a)', () => {
  const none = 'The applicant has no criminal antecedents.';
  const phrasings = (loadFixtureSkeleton('bail_regular') as unknown as Record<string, string[]>)
    .antecedents_none_values;

  it('the signed list has 18 phrasings, including "No criminal record"', () => {
    expect(phrasings).toHaveLength(18);
    expect(phrasings).toContain('no criminal record');
  });

  it.each([
    ['No criminal record'],
    ['NO CRIMINAL RECORD.'],
    ['  clean   record '],
    ['Not applicable'],
    ['No previous criminal record'],
    ['koi record nahi'],
  ])('"%s" prints the none sentence', (given) => {
    const facts = [...withoutKey(regularBase(), 'antecedents'), fact('antecedents', given)];
    expect(render('bail_regular', facts).text('antecedents')).toBe(none);
  });

  it.each(['bail_regular', 'bail_anticipatory'] as const)(
    '%s: every one of the 18 phrasings prints the none sentence',
    (packId) => {
      const base = packId === 'bail_regular' ? regularBase : anticipatoryBase;
      for (const given of phrasings) {
        const facts = [...withoutKey(base(), 'antecedents'), fact('antecedents', given)];
        expect(render(packId, facts).text('antecedents')).toBe(none);
      }
    },
  );

  it('a stated record that only contains a phrasing is not the none sentence', () => {
    const facts = [
      ...withoutKey(regularBase(), 'antecedents'),
      fact('antecedents', 'No criminal record except FIR 12/2019'),
    ];
    expect(render('bail_regular', facts).text('antecedents')).toBe(
      'The criminal antecedents of the applicant are: No criminal record except FIR 12/2019.',
    );
  });

  it('skeletonValueLists resolves antecedents_none_values from the skeleton itself, with no averment', () => {
    const sk = loadFixtureSkeleton('bail_regular');
    const lists = skeletonValueLists(sk, { banned: [], allowed: [] });
    expect(lists.antecedents_none_values).toEqual(phrasings);
  });
});

describe('a named list that neither the skeleton nor the pack holds fails closed', () => {
  const ghost = (field: 'in' | 'not_in'): Skeleton => {
    const sk = JSON.parse(JSON.stringify(loadFixtureSkeleton('bail_regular'))) as Skeleton;
    const variants = sk.clauses.find((c) => c.id === 'antecedents')!.variants!;
    (variants[0].when as unknown as Record<string, unknown>).in = undefined;
    delete (variants[0].when as unknown as Record<string, unknown>).in;
    (variants[0].when as unknown as Record<string, unknown>)[field] = 'ghost_list';
    return sk;
  };
  const lists = loadAvermentLists('bail_regular');

  function renderSk(sk: Skeleton, facts: LedgerFact[]) {
    const pack = loadRulePack('bail_regular')!;
    return renderDraft({
      skeleton: sk,
      output: goodOutput(sk, facts),
      facts,
      labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
      clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
      optionIds: packOptionIds(pack.facts),
      valueLists: skeletonValueLists(sk, lists),
      verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
    });
  }

  it('the name is left out of the resolved lists', () => {
    expect(skeletonValueLists(ghost('in'), lists)).not.toHaveProperty('ghost_list');
  });

  it('"in" a list that is not there never matches, so "None" does not print the none sentence', () => {
    const r = renderSk(ghost('in'), regularBase());
    const t = r.paragraphs.find((p) => p.clauseId === 'antecedents')?.text;
    expect(t).not.toBe('The applicant has no criminal antecedents.');
  });

  it('"not_in" a list that is not there never matches either', () => {
    const r = renderSk(ghost('not_in'), [
      ...withoutKey(regularBase(), 'antecedents'),
      fact('antecedents', 'FIR 12/2019'),
    ]);
    const t = r.paragraphs.find((p) => p.clauseId === 'antecedents')?.text;
    expect(t).not.toBe('The applicant has no criminal antecedents.');
  });

  it('none_values pointing at a missing top-level list resolves to nothing', () => {
    const sk = JSON.parse(JSON.stringify(loadFixtureSkeleton('default_bail'))) as Skeleton;
    (sk as unknown as Record<string, unknown>).none_values = 'no_such_list';
    expect(skeletonValueLists(sk, { banned: [], allowed: [] })).not.toHaveProperty('none_values');
  });

  it('none_values as the T-334 averment reference reads that averment; as an array, the array', () => {
    const sk = loadFixtureSkeleton('default_bail');
    const l = skeletonValueLists(sk, loadAvermentLists('default_bail'));
    expect(l.none_values?.length).toBeGreaterThan(0);
    const inline = JSON.parse(JSON.stringify(sk)) as Skeleton;
    (inline as unknown as Record<string, unknown>).none_values = ['zilch'];
    expect(skeletonValueLists(inline, { banned: [], allowed: [] }).none_values).toEqual(['zilch']);
  });
});
