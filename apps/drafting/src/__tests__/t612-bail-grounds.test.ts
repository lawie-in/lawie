/**
 * T-612 step 2: the new bail grounds, the roots fallback and the medical "None" answer, rendered from the
 * real rule packs and real skeletons. Every expected string is read from Ajay's signed wording file
 * (handoff/legal/T-612-bail-grounds-wording-signed.md), not from the skeleton json under test.
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { packOptionIds, renderDraft, skeletonValueLists } from '../services/draft-renderer';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';

import { anticipatoryBase, choice, fact, regularBase } from './fixtures/t373';

const REPO = join(__dirname, '..', '..', '..', '..');
const SIGNED = readFileSync(
  join(REPO, 'handoff', 'legal', 'T-612-bail-grounds-wording-signed.md'),
  'utf-8',
);
const tick = (s: string): string[] => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const row = (start: string): string[] => {
  const line = SIGNED.split('\n').find((l) => l.startsWith(start));
  if (!line) throw new Error(`signed file has no row starting ${start}`);
  return line.split('|').map((c) => c.trim());
};

// ── The signed strings ──────────────────────────────────────────────────────

interface Ground {
  name: string;
  id: string;
  label: string;
  sentence: string | null;
}
const g1 = row('| G1');
const g2 = row('| G2');
const g3 = row('| G3');
const g4 = row('| G4');
const GROUNDS: Ground[] = [
  {
    name: 'G1',
    id: 'business_dispute_civil_in_nature',
    label: tick(g1[3])[0],
    sentence: tick(g1[4])[0],
  },
  { name: 'G2', id: 'amount_paid_or_deposited', label: tick(g2[3])[0], sentence: tick(g2[4])[0] },
  { name: 'G3', id: 'only_earning_member', label: tick(g3[3])[0], sentence: null },
  {
    name: 'G4',
    id: 'ready_to_furnish_bail_bond_and_sureties',
    label: tick(g4[3])[0],
    sentence: tick(g4[4])[0],
  },
];
const [G1, G2, G3, G4] = GROUNDS;
// the existing sole_breadwinner sentence, as the signed file quotes it in section (2)
const SOLE_SENTENCE = tick(
  SIGNED.split('\n').find(
    (l) => l.includes('sole_breadwinner') && l.includes('only earning member of the family.'),
  )!,
).find((t) => t.startsWith('The applicant is the only earning member'))!;
const G3_MISSING = `{{MISSING: ${/missing_label: "([^"]+)"/.exec(SIGNED)![1]}}}`;
const [ROOTS_TIES, ROOTS_ADDRESS, ROOTS_BARE] = [
  row('| local_ties held')[2],
  row('| local_ties empty, address held')[2],
  row('| both empty')[2],
].map((c) => tick(c)[0]);
const MEDICAL_QUESTION = tick(
  SIGNED.split('\n').find((l) => l.startsWith('Question, signed:'))!,
)[0];

it('the signed file was read as expected', () => {
  expect(G1.label).toBe('Dispute is essentially civil in nature');
  expect(G2.label).toBe('Amount in dispute paid or deposited (without admission)');
  expect(G3.label).toBe('Only earning member of the family');
  expect(G4.label).toBe('Ready to furnish a bail bond and sureties');
  expect(SOLE_SENTENCE).toBe('The applicant is the only earning member of the family.');
  expect(G3_MISSING).toBe(
    '{{MISSING: Whether the applicant is the only earning member of the family}}',
  );
  expect(ROOTS_TIES).toBe('The applicant has roots in society: {local_ties}.');
  expect(ROOTS_ADDRESS).toBe('The applicant resides at {address} and has roots in society.');
  expect(ROOTS_BARE).toBe('The applicant has roots in society.');
  expect(MEDICAL_QUESTION.startsWith('Does the applicant have any illness')).toBe(true);
});

// ── Harness ─────────────────────────────────────────────────────────────────

type PackId = 'bail_regular' | 'bail_anticipatory';
const PACKS: PackId[] = ['bail_regular', 'bail_anticipatory'];
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

const withoutKeys = (facts: LedgerFact[], ...keys: string[]): LedgerFact[] =>
  facts.filter((f) => !keys.includes(f.key));

function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node !== null && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));
const PACK_FILE = (p: PackId) => join(__dirname, '..', 'config', 'document-rules', `${p}.json`);
const TEMPLATE_FILE = (p: PackId) => join(REPO, 'docs', 'templates', `${p}.json`);

/** The options of the grounds_for_bail field in a pack or template json. */
function groundOptions(path: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  walk(readJson(path), (o) => {
    if (
      (o.field_id === 'grounds_for_bail' || o.id === 'grounds_for_bail') &&
      Array.isArray(o.options)
    ) {
      out.push(...(o.options as Array<{ id: string; label: string }>));
    }
  });
  return out;
}

/** The ledger facts for the ticked grounds: display is the option's label, value its id. */
function ticked(packId: PackId, ids: string[]): LedgerFact[] {
  const opts = groundOptions(PACK_FILE(packId));
  return ids.map((id) => {
    const o = opts.find((x) => x.id === id);
    if (!o) throw new Error(`${packId} has no grounds option ${id}`);
    return choice('grounds_for_bail', o.label, o.id);
  });
}

function baseOf(packId: PackId): LedgerFact[] {
  return withoutKeys(
    packId === 'bail_regular' ? regularBase() : anticipatoryBase(),
    'grounds_for_bail',
  );
}

function render(packId: PackId, facts: LedgerFact[]) {
  const pack = loadRulePack(packId)!;
  const skeleton = loadSkeleton(packId)!;
  const lists = loadAvermentLists(packId);
  const result = renderDraft({
    skeleton,
    output: null,
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  });
  const grounds = result.paragraphs.find((p) => p.clauseId === 'grounds')?.text ?? '';
  return { body: result.body, grounds, result };
}

const run = (packId: PackId, ids: string[], extra: LedgerFact[] = []) =>
  render(packId, [...baseOf(packId), ...ticked(packId, ids), ...extra]);

// ── Labels and ids ──────────────────────────────────────────────────────────

describe.each(PACKS)('T-612 %s: the new grounds options', (packId) => {
  const cases = packId === 'bail_regular' ? GROUNDS : GROUNDS.filter((g) => g.name !== 'G1');
  it.each(cases.map((g) => [g.name, g] as const))(
    '%s label and id are in the pack, byte for byte',
    (_n, g) => {
      for (const file of [PACK_FILE(packId), TEMPLATE_FILE(packId)]) {
        const o = groundOptions(file).filter((x) => x.id === g.id);
        expect(o).toHaveLength(1);
        expect(o[0].label).toBe(g.label);
      }
    },
  );

  it('anticipatory already carries G1 under the same id and label', () => {
    if (packId !== 'bail_anticipatory') return;
    const o = groundOptions(PACK_FILE(packId)).find((x) => x.id === G1.id);
    expect(o?.label).toBe(G1.label);
  });
});

// ── Each ground prints its signed sentence ──────────────────────────────────

describe.each(PACKS)('T-612 %s: a ticked ground prints its exact signed sentence', (packId) => {
  const cases = (
    packId === 'bail_regular' ? GROUNDS : GROUNDS.filter((g) => g.name !== 'G1')
  ).filter((g) => g.sentence !== null);
  it.each(cases.map((g) => [g.name, g] as const))('%s', (_n, g) => {
    const { body, grounds } = run(packId, [g.id]);
    expect(grounds).toContain(`) ${g.sentence}`);
    expect(count(body, g.sentence!)).toBe(1);
  });

  it('G2 keeps "without prejudice to the applicant\'s defence" and carries no amount or date', () => {
    const { grounds } = run(packId, [G2.id]);
    expect(grounds).toContain("without prejudice to the applicant's defence");
    const line = grounds.split('\n').find((l) => l.includes('amount in dispute'))!;
    expect(line).not.toMatch(/\d/);
    expect(line).not.toMatch(/₹|\bRs\b/);
  });
});

// ── G3: the sole earner ─────────────────────────────────────────────────────

describe.each(PACKS)('T-612 %s: G3 only earning member', (packId) => {
  const yes = choice('sole_earning_member', 'Yes', 'yes');
  const no = choice('sole_earning_member', 'No', 'no');

  it('ticked and Yes: the sentence prints once, inside the grounds', () => {
    const { body, grounds } = run(packId, [G3.id], [yes]);
    expect(count(body, SOLE_SENTENCE)).toBe(1);
    expect(count(grounds, SOLE_SENTENCE)).toBe(1);
    expect(body).not.toContain('{{MISSING: Whether the applicant is the only');
  });

  it('ticked and No: the signed blank, exactly, and no sentence', () => {
    const { body, grounds } = run(packId, [G3.id], [no]);
    expect(count(grounds, G3_MISSING)).toBe(1);
    expect(body).not.toContain(SOLE_SENTENCE);
  });

  it('ticked and not held: the signed blank, exactly', () => {
    const { body, grounds } = run(packId, [G3.id]);
    expect(count(grounds, G3_MISSING)).toBe(1);
    expect(body).not.toContain(SOLE_SENTENCE);
  });

  it('not ticked but Yes: the standalone line prints once, outside the grounds', () => {
    const { body, grounds } = run(packId, [G4.id], [yes]);
    expect(count(body, SOLE_SENTENCE)).toBe(1);
    expect(grounds).not.toContain(SOLE_SENTENCE);
  });
});

// ── Anticipatory: roots with an empty {local_ties} ──────────────────────────

describe('T-612 bail_anticipatory: deep_roots_in_community fallbacks', () => {
  const ROOTS = 'deep_roots_in_community';
  const TIES = 'Member of the village panchayat for ten years';
  const ADDRESS = 'Village Sherghati, Gaya';
  const noAddress = (f: LedgerFact[]) => withoutKeys(f, 'address');
  const rootsLines = (body: string) =>
    body.split('\n').filter((l) => l.includes('roots in society'));

  it('local_ties held: the signed sentence with the ties', () => {
    const { body } = render('bail_anticipatory', [
      ...baseOf('bail_anticipatory'),
      ...ticked('bail_anticipatory', [ROOTS]),
      fact('local_ties', TIES),
    ]);
    expect(count(body, ROOTS_TIES.replace('{local_ties}', TIES))).toBe(1);
    expect(rootsLines(body)).toHaveLength(1);
  });

  it('local_ties empty, address held: the signed address sentence', () => {
    const { body } = render('bail_anticipatory', [
      ...baseOf('bail_anticipatory'),
      ...ticked('bail_anticipatory', [ROOTS]),
    ]);
    expect(count(body, ROOTS_ADDRESS.replace('{address}', ADDRESS))).toBe(1);
    expect(rootsLines(body)).toHaveLength(1);
  });

  it('both empty: the bare signed sentence', () => {
    const { body } = render('bail_anticipatory', [
      ...noAddress(baseOf('bail_anticipatory')),
      ...ticked('bail_anticipatory', [ROOTS]),
    ]);
    expect(count(body, ROOTS_BARE)).toBe(1);
    expect(rootsLines(body)).toHaveLength(1);
    expect(body).not.toContain('{local_ties}');
    expect(body).not.toMatch(/roots in society: /);
  });

  it('not ticked: no roots paragraph', () => {
    // (a held local_ties has its own fixed roots clause, outside this ground; so none is held here)
    const { body } = render('bail_anticipatory', [
      ...baseOf('bail_anticipatory'),
      ...ticked('bail_anticipatory', ['false_implication']),
    ]);
    expect(body).not.toContain('roots in society');
  });
});

// ── Medical condition: "None" is answered and absent ────────────────────────

describe.each(PACKS)('T-612 %s: medical_condition', (packId) => {
  it.each(['None', 'none', 'no', 'नहीं', 'कोई नहीं'])('%s never prints as a condition', (none) => {
    const standalone = run(packId, [G4.id], [fact('medical_condition', none)]);
    expect(standalone.body).not.toMatch(/suffer(s|ing) from/);
    expect(standalone.body).not.toContain(`from ${none}`);

    const ticked_ = run(packId, ['medical_grounds'], [fact('medical_condition', none)]);
    expect(ticked_.body).not.toMatch(/suffer(s|ing) from/);
    expect(ticked_.grounds).toContain('{{MISSING: ');
    expect(ticked_.grounds).not.toContain(none === 'no' ? 'from no' : `from ${none}`);
  });

  it('Asthma prints once whether or not the ground is ticked', () => {
    const asked = run(packId, ['medical_grounds'], [fact('medical_condition', 'Asthma')]);
    expect(count(asked.body, 'Asthma')).toBe(1);
    expect(asked.grounds).toContain('Asthma');
    const alone = run(packId, [G4.id], [fact('medical_condition', 'Asthma')]);
    expect(count(alone.body, 'Asthma')).toBe(1);
    expect(alone.body).toContain('The applicant suffers from Asthma.');
  });

  it('the question is the signed string in the pack and the template', () => {
    for (const file of [PACK_FILE(packId), TEMPLATE_FILE(packId)]) {
      const questions: string[] = [];
      walk(readJson(file), (o) => {
        if (
          (o.field_id === 'medical_condition' || o.id === 'medical_condition') &&
          typeof o.question === 'string'
        ) {
          questions.push(o.question);
        }
      });
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) expect(q).toBe(MEDICAL_QUESTION);
    }
  });
});

describe.each(PACKS)('T-612 %s template: no "PS {police_station}"', (packId) => {
  it('the template text carries Police Station, not PS', () => {
    const text = readFileSync(TEMPLATE_FILE(packId), 'utf-8');
    expect(text).not.toContain('PS {police_station}');
    expect(text).toContain('Police Station {police_station}');
  });
});
