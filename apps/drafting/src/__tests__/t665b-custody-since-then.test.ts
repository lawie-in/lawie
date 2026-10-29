/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-665b: "Arrested on <date> and in judicial custody since then" gives custody_since = the arrest date
 * (Ajay 6cac06e3, in the T-612 file: a CLOSED list of back-references to the arrest). Fictional data only.
 *
 * The recorded reply (section A) is the extractor's answer for the logged wording: it yields NO custody_since
 * fact and an unresolved custody_since entry whose span is "since then". Sections B to E run one ledger
 * through BOTH paths (updateBrief for the brief, withCustodySinceDerived for the draft).
 */
import './setupDb';
import request from 'supertest';

import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { FactLedgerModel } from '../models/FactLedger.model';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  CUSTODY_SINCE_BACK_REFERENCES,
  custodySinceDerivesFromLedger,
  isCustodySinceBackReference,
  ledgerCustodyInputs,
  withCustodySinceDerived,
} from '../services/custody-since-derivation';
import { createLedger, currentState, ledgerView } from '../services/fact-ledger.service';
import { packOptionIds, renderDraft, skeletonValueLists } from '../services/draft-renderer';
import { buildChecklist, buildQuestions, ledgerGivenKeys } from '../services/intake-brief';
import type { Brief } from '../services/intake-brief';
import { updateBrief } from '../services/intake.service';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';
import { fact, regularBase } from './fixtures/t373';
import { sdkAnswer } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const B2 = 'Since what date has the applicant been in custody (the date of arrest or surrender)?';
const TBC = '[To be confirmed: in custody since]';
const DERIVED_LINE =
  'The applicant was arrested on 10 October 2026 and is now in judicial custody.';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ANUSHKA = 'Test Applicant A was arrested on 10.10.2026 and in judicial custody since then.';
const arrest = (): LedgerFact =>
  fact('arrest_date', '10 October 2026', { type: 'date', value: '2026-10-10' });
/** A ledger as the extraction leaves it for the logged wording: custody and arrest held, no custody_since. */
const base = (): LedgerFact[] => [
  ...regularBase().filter(
    (f) => !['custody_since', 'facts_narrative', 'grounds_for_bail', 'arrest_date'].includes(f.key),
  ),
  fact('facts_narrative', 'He is accused in a cheating case.', { raw_span: 'cheating case' }),
  arrest(),
];
const unresolvedOf = (
  key: string,
  raw_span: string,
  reason = 'unrecognised',
): LedgerUnresolvedFact =>
  ({
    id: `u-${key}`,
    key,
    label: key,
    type: 'date',
    raw_span,
    source: 'user',
    reason,
    detail: 'x',
  }) as unknown as LedgerUnresolvedFact;
const then = (span = 'since then') => [unresolvedOf('custody_since', span)];

const TYPICAL: Record<string, string | string[]> = {
  applicant_name: 'Test Applicant A',
  father_name: 'Test Father B',
  applicant_parentage: 'Test Father B',
  applicant_age: '32',
  address: '123 Test Street, Patna',
  applicant_address: '123 Test Street, Patna',
  fir_number: '124/2026',
  fir_date: '2026-03-10',
  police_station: 'Kotwali',
  sections_charged: ['318'],
  offences_alleged: '318(4) BNS',
};
const VALUES = [
  ...Object.entries(TYPICAL).map(([key, value]) => ({
    key,
    value,
    source: 'description' as const,
  })),
  { key: 'currently_in_custody', value: 'Yes — Judicial custody', source: 'description' as const },
  { key: 'arrest_date', value: '2026-10-10', source: 'description' as const },
];

/** The brief, as the update route builds it with this ledger. */
function briefOf(
  facts: LedgerFact[],
  unresolved: LedgerUnresolvedFact[],
  description = ANUSHKA,
  values: unknown[] = VALUES,
): Brief {
  return updateBrief({
    kind: 'bail_regular',
    values: values as any,
    description,
    court: { state: 'bihar', court_type: 'sessions', court: 'patna' },
    ledger: { facts: facts as any, unresolved: unresolved as any },
  }) as Brief;
}
const since = (b: Brief) => b.items.find((i) => i.key === 'custody_since')!;
const generated = (
  facts: LedgerFact[],
  unresolved: LedgerUnresolvedFact[],
  description = ANUSHKA,
) => withCustodySinceDerived(facts, 'bail_regular', description, unresolved);
const generationDerives = (...a: Parameters<typeof generated>) =>
  generated(...a).some((f) => f.key === 'custody_since_derived');

/** Both paths on one ledger: [brief derives, generation derives]. */
function both(facts: LedgerFact[], unresolved: LedgerUnresolvedFact[], description = ANUSHKA) {
  const b = briefOf(facts, unresolved, description);
  return {
    brief: since(b).derived_from === 'arrest_date' && since(b).value === '2026-10-10',
    generation: generationDerives(facts, unresolved, description),
    b,
  };
}
const asksB2 = (b: Brief, facts: LedgerFact[]) =>
  buildQuestions(b, new Map(), new Set(), new Set(), {
    checklist: buildChecklist(loadRulePack('bail_regular')!),
    ledgerGiven: ledgerGivenKeys(facts as any),
  }).find((x) => x.key === 'custody_since')?.question === B2;

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

// ── A. The recorded reply, end to end ───────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439665';
const MODEL = 'claude-haiku-4-5-20251001';
const INTAKE_ID = '77777777-7777-4777-8777-777777777777';
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await createVerifiedUser({ _id: USER_ID, plan: 'free', planTier: 'free' });
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

/** The recorded Reception read, then the recorded extraction (custody_since is "since then"). */
function recorded(extractFacts: Array<Record<string, unknown>>) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(
    sdkAnswer(
      JSON.stringify({
        outcome: 'read',
        read: [
          {
            id: 'currently_in_custody',
            value: 'Yes — Judicial custody',
            quote: 'in judicial custody',
          },
          { id: 'arrest_date', value: '2026-10-10', quote: '10.10.2026' },
        ],
        conflicts: [],
        questions: [],
      }),
      900,
      120,
    ),
  );
  mockMessagesStream.mockResolvedValueOnce(
    sdkAnswer(JSON.stringify({ facts: extractFacts }), 900, 120),
  );
}
const RECORDED_FACTS = [
  { key: 'arrest_date', span: '10.10.2026', confidence: 0.99 },
  {
    key: 'currently_in_custody',
    span: 'in judicial custody',
    option: 'Yes — Judicial custody',
    confidence: 0.99,
  },
  { key: 'custody_since', span: 'since then', confidence: 0.9 },
];
const describe_ = (description = ANUSHKA) =>
  request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description, intake_id: INTAKE_ID, kind: 'bail_regular' });

describe("T-665b A: the recorded reply for Anushka's wording (fictional)", () => {
  it('the STORED ledger holds no custody_since fact and an unresolved custody_since "since then"; the response view hides the entry', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(res.body.ledger.facts.map((f: any) => f.key)).not.toContain('custody_since');
    const stored = currentState((await FactLedgerModel.findById(res.body.ledger.ledger_id))!);
    expect(stored.unresolved.find((x) => x.key === 'custody_since')?.raw_span).toBe('since then');
    // the response is the read-time view (Ajay 2e119150): the entry is not shown
    expect(res.body.ledger.unresolved.map((x: any) => x.key)).not.toContain('custody_since');
  });

  it('the brief: custody_since = 10 October 2026, derived from the arrest date, not flagged for checking', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_();
    const item = res.body.brief.items.find((i: any) => i.key === 'custody_since');
    expect(item.value).toBe('2026-10-10');
    expect(item.derived_from).toBe('arrest_date');
    expect(item.please_check).toBe(false);
  });

  it('the first response asks no B2 question for "since then" (the view drops the entry)', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_();
    expect(res.body.questions.map((q: any) => q.question)).not.toContain(B2);
  });

  it('the draft: the derived line prints and there is no "[To be confirmed: in custody since]"', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_();
    // generation reads the STORED ledger
    const stored = currentState((await FactLedgerModel.findById(res.body.ledger.ledger_id))!);
    const facts = withCustodySinceDerived(stored.facts, 'bail_regular', ANUSHKA, stored.unresolved);
    const r = render(facts);
    expect(r.body.split(DERIVED_LINE).length - 1).toBe(1);
    expect(r.body).not.toContain(TBC);
    expect(r.body).not.toContain('custody_since');
    expect(r.rendered.map((c) => c.clauseId)).not.toContain('custody_status');
  });

  it('control: the same reply with "surrendered" in the words does not derive', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_(
      'Test Applicant A was arrested on 10.10.2026, surrendered and is in judicial custody since then.',
    );
    expect(res.status).toBe(200);
    const item = res.body.brief.items.find((i: any) => i.key === 'custody_since');
    expect(item.derived_from).toBeUndefined();
  });
});

// ── B. The closed list ──────────────────────────────────────────────────────

const LIST = [
  'since then',
  'since that date',
  'since that day',
  'from then',
  'since the arrest',
  'since arrest',
  'tab se',
  'तब से',
  'usi din se',
  'उसी दिन से',
];

describe('T-665b B: each signed back-reference derives, on both paths', () => {
  it('the list in the code is the signed one, nothing added', () => {
    expect([...CUSTODY_SINCE_BACK_REFERENCES]).toEqual(LIST);
  });

  it.each(LIST)('"%s": the brief and the draft both derive', (phrase) => {
    const r = both(base(), then(phrase));
    expect(r.brief).toBe(true);
    expect(r.generation).toBe(true);
    expect(r.b.items.find((i) => i.key === 'custody_since')!.please_check).toBe(false);
  });

  it.each([
    ['upper case', 'SINCE THEN'],
    ['mixed case', 'Since Then'],
    ['padded', '   since then   '],
    ['full stop', 'since then.'],
    ['danda', 'तब से।'],
    ['danda with space', ' उसी दिन से । '],
    ['exclamation and padding', '  tab se! '],
    ['collapsed inner spaces', 'since   that  date'],
    ['comma', 'since the arrest,'],
  ])('variant (%s) "%s" derives on both paths', (_n, span) => {
    const r = both(base(), then(span));
    expect(r.brief).toBe(true);
    expect(r.generation).toBe(true);
  });

  it('isCustodySinceBackReference: exact whole-span match only', () => {
    for (const p of LIST) expect(isCustodySinceBackReference(p)).toBe(true);
    expect(isCustodySinceBackReference('  Since Then. ')).toBe(true);
    expect(isCustodySinceBackReference('तब से।')).toBe(true);
    for (const bad of ['', '   ', '.', null, undefined, 'since', 'then']) {
      expect(isCustodySinceBackReference(bad as any)).toBe(false);
    }
  });
});

// ── C. Near-misses still ask ────────────────────────────────────────────────

describe('T-665b C: near-misses are not back-references, so the brief and the draft ask', () => {
  it.each([
    'since that time',
    'us din se',
    'in custody since then',
    'since then 2026',
    'since then onwards',
    'since then, 12 June',
    'ever since then',
    'since then and before',
    'तब से लेकर',
    'since the arrest date',
  ])('"%s": neither derives', (span) => {
    expect(isCustodySinceBackReference(span)).toBe(false);
    const facts = base();
    const r = both(facts, then(span));
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
    expect(since(r.b).derived_from).toBeUndefined();
    expect(asksB2(r.b, facts)).toBe(true);
  });
});

// ── D. Everything else still asks ───────────────────────────────────────────

describe('T-665b D: unchanged behaviour (T-638 / T-660)', () => {
  it('two distinct arrest dates: neither derives', () => {
    const facts = [
      ...base(),
      fact('arrest_date', '12 October 2026', { type: 'date', value: '2026-10-12' }),
    ];
    const r = both(facts, then());
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
  });

  it.each([
    [
      'surrendered',
      'Test Applicant A was arrested on 10.10.2026, surrendered, and is in judicial custody since then.',
    ],
    [
      'surrender',
      'Test Applicant A was arrested on 10.10.2026 after his surrender, in judicial custody since then.',
    ],
    [
      'remanded',
      'Test Applicant A was arrested on 10.10.2026, remanded, and is in judicial custody since then.',
    ],
    ['remand', 'Arrested on 10.10.2026 and sent on remand, in judicial custody since then.'],
    [
      're-arrested',
      'Test Applicant A was arrested on 10.10.2026, re-arrested later, in judicial custody since then.',
    ],
    [
      'rearrested',
      'Test Applicant A was arrested on 10.10.2026, rearrested later, in judicial custody since then.',
    ],
    [
      'Devanagari surrender',
      'आवेदक ने 10.10.2026 को आत्मसमर्पण किया, तब से न्यायिक हिरासत में है।',
    ],
    ['Devanagari remand', 'आवेदक रिमांड पर है, तब से न्यायिक हिरासत में है।'],
  ])('%s wording with "since then": neither derives, the brief asks B2', (_n, description) => {
    const facts = base();
    const r = both(facts, then(), description);
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
    expect(asksB2(r.b, facts)).toBe(true);
  });

  it('an unresolved remand_date alongside "since then": neither derives', () => {
    const facts = base();
    const unresolved = [...then(), unresolvedOf('remand_date', 'sometime in October')];
    const r = both(facts, unresolved);
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
    expect(asksB2(r.b, facts)).toBe(true);
  });

  it('a remand_date fact alongside "since then": neither derives', () => {
    const facts = [
      ...base(),
      fact('remand_date', '14 October 2026', { type: 'date', value: '2026-10-14' }),
    ];
    const r = both(facts, then());
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
  });

  it('an unresolved custody_since whose span holds a real date is another custody date (B5)', () => {
    const facts = base();
    for (const span of ['12 October 2026', 'since 12 October 2026', 'since then 12.10.2026']) {
      const r = both(facts, then(span));
      expect(r.brief).toBe(false);
      expect(r.generation).toBe(false);
    }
  });

  it('a stored custody_since fact stays held, whatever any entry says', () => {
    const facts = [
      ...base(),
      fact('custody_since', '12 October 2026', { type: 'date', value: '2026-10-12' }),
    ];
    const r = both(facts, then());
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
    // also when the stored fact's own words are a back-reference
    const odd = [
      ...base(),
      fact('custody_since', 'since then', {
        type: 'date',
        value: '2026-10-10',
        raw_span: 'since then',
      }),
    ];
    const o = both(odd, []);
    expect(o.brief).toBe(false);
    expect(o.generation).toBe(false);
  });

  it('only a custody_since entry is excused: the same words on another key still count', () => {
    const facts = base();
    const r = both(facts, [unresolvedOf('remand_date', 'since then')]);
    expect(r.brief).toBe(false);
    expect(r.generation).toBe(false);
  });
});

// ── E. ledgerCustodyInputs ──────────────────────────────────────────────────

describe('T-665b E: ledgerCustodyInputs', () => {
  it('an unresolved custody_since back-reference is no other custody date; a real one is', () => {
    expect(ledgerCustodyInputs(base(), then()).otherCustodyDate).toBe(false);
    expect(ledgerCustodyInputs(base(), then('12 October 2026')).otherCustodyDate).toBe(true);
    expect(ledgerCustodyInputs(base(), then('since that time')).otherCustodyDate).toBe(true);
  });

  it('the stored-fact B5 flag does not depend on the span', () => {
    const held = [
      ...base(),
      fact('custody_since', 'since then', { type: 'date', value: '2026-10-10' }),
    ];
    expect(ledgerCustodyInputs(held, []).custodySinceHeld).toBe(true);
    expect(ledgerCustodyInputs(base(), then()).custodySinceHeld).toBe(false);
  });

  it("the B1 word scan still reads the entry's words", () => {
    const out = ledgerCustodyInputs(base(), [unresolvedOf('custody_since', 'since then')]);
    expect(out.texts).toContain('since then');
  });
});

// ── F. The read-time view (Ajay 2e119150, Priya option a: ledger only) ───────

const CHECKLIST = buildChecklist(loadRulePack('bail_regular')!);
const keysOfUnresolved = (v: { unresolved: Array<{ key: string }> }) =>
  v.unresolved.map((u) => u.key);
const GAP_DESC =
  'Test Applicant A was arrested on 10.10.2026, surrendered, and is in judicial custody since then.';

async function storeLedger(
  facts: LedgerFact[],
  unresolved: LedgerUnresolvedFact[],
  documentKind = 'bail_regular',
) {
  return createLedger({
    userId: USER_ID,
    documentKind,
    intakeId: INTAKE_ID,
    state: { facts, unresolved },
  });
}

describe('T-665b F: the response view drops the entry on both routes', () => {
  it('/intake/brief: the entry is gone, the item is derived, no B2', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_();
    expect(keysOfUnresolved(res.body.ledger)).not.toContain('custody_since');
    const item = res.body.brief.items.find((i: any) => i.key === 'custody_since');
    expect(item.derived_from).toBe('arrest_date');
    expect(res.body.questions.map((q: any) => q.question)).not.toContain(B2);
  });

  it('/intake/brief/update: the entry is gone from the returned ledger, and the brief stays derived', async () => {
    recorded(RECORDED_FACTS);
    const first = await describe_();
    const res = await request(app).post('/intake/brief/update').set(headers()).send({
      kind: 'bail_regular',
      values: VALUES,
      description: ANUSHKA,
      ledger_id: first.body.ledger.ledger_id,
    });
    expect(res.status).toBe(200);
    expect(keysOfUnresolved(res.body.ledger)).not.toContain('custody_since');
    const item = res.body.brief.items.find((i: any) => i.key === 'custody_since');
    expect(item.derived_from).toBe('arrest_date');
  });
});

describe('T-665b F: the stored ledger is untouched by the view', () => {
  it('the stored state, the sealed bytes and the version are equal before and after ledgerView', async () => {
    const doc = await storeLedger(base(), then());
    const before = JSON.stringify(currentState(doc));
    const bytesBefore = doc.versions[doc.versions.length - 1].factsEnc;
    const versionBefore = doc.currentVersion;
    const view = ledgerView(doc, CHECKLIST);
    expect(keysOfUnresolved(view)).not.toContain('custody_since');
    expect(JSON.stringify(currentState(doc))).toBe(before);
    expect(JSON.parse(before).unresolved.map((u: any) => u.key)).toContain('custody_since');
    expect(doc.versions[doc.versions.length - 1].factsEnc).toBe(bytesBefore);
    expect(doc.currentVersion).toBe(versionBefore);
    // and the database copy is the same
    const fresh = (await FactLedgerModel.findById(doc._id))!;
    expect(JSON.stringify(currentState(fresh))).toBe(before);
    expect(fresh.versions[fresh.versions.length - 1].factsEnc).toBe(bytesBefore);
    expect(fresh.currentVersion).toBe(versionBefore);
  });

  it('the view array is a copy: changing it changes nothing stored or shown next time', async () => {
    const doc = await storeLedger(base(), then());
    const view = ledgerView(doc, CHECKLIST);
    const stored = currentState(doc).unresolved;
    expect(view.unresolved).not.toBe(stored);
    expect(view.unresolved.length).toBe(stored.length - 1);
    view.unresolved.push(unresolvedOf('remand_date', 'x'));
    expect(currentState(doc).unresolved.map((u) => u.key)).toEqual(['custody_since']);
    expect(keysOfUnresolved(ledgerView(doc, CHECKLIST))).toEqual([]);
  });
});

describe('T-665b F: the view KEEPS the entry when R1 would not derive', () => {
  const kept = async (
    facts: LedgerFact[],
    unresolved: LedgerUnresolvedFact[],
    documentKind = 'bail_regular',
  ) => keysOfUnresolved(ledgerView(await storeLedger(facts, unresolved, documentKind), CHECKLIST));

  it('two arrest dates', async () => {
    const facts = [
      ...base(),
      fact('arrest_date', '12 October 2026', { type: 'date', value: '2026-10-12' }),
    ];
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('an unresolved remand_date', async () => {
    expect(await kept(base(), [...then(), unresolvedOf('remand_date', 'sometime')])).toEqual(
      expect.arrayContaining(['custody_since', 'remand_date']),
    );
  });
  it('a stored remand_date', async () => {
    const facts = [
      ...base(),
      fact('remand_date', '14 October 2026', { type: 'date', value: '2026-10-14' }),
    ];
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('a B1 word in a fact raw_span', async () => {
    const facts = [
      ...base().filter((f) => f.key !== 'facts_narrative'),
      fact('facts_narrative', 'x', { raw_span: 'he surrendered to the police' }),
    ];
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('a B1 word in a fact display', async () => {
    const facts = [
      ...base().filter((f) => f.key !== 'facts_narrative'),
      fact('facts_narrative', 'He was re-arrested later.', { raw_span: 'cheating case' }),
    ];
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('a held custody_since', async () => {
    const facts = [
      ...base(),
      fact('custody_since', '12 October 2026', { type: 'date', value: '2026-10-12' }),
    ];
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('no custody fact', async () => {
    const facts = base().filter((f) => f.key !== 'currently_in_custody');
    expect(await kept(facts, then())).toContain('custody_since');
  });
  it('a span that is not on the closed list', async () => {
    for (const span of [
      'since that time',
      'in custody since then',
      'since then 2026',
      '12 October 2026',
    ]) {
      expect(await kept(base(), then(span))).toContain('custody_since');
    }
  });
  it('a back-reference on a ledger that is not bail_regular', async () => {
    expect(await kept(base(), then(), 'bail_anticipatory')).toContain('custody_since');
  });
  it('no entry at all: the stored array is what the view shows', async () => {
    expect(await kept(base(), [])).toEqual([]);
  });
});

describe('T-665b F: the documented gap (the description is not stored)', () => {
  it('a B1 word only in the description, calm ledger: the view drops the entry; the brief and generation refuse; B2 is asked', async () => {
    recorded(RECORDED_FACTS);
    const res = await describe_(GAP_DESC);
    expect(res.status).toBe(200);
    const stored = currentState((await FactLedgerModel.findById(res.body.ledger.ledger_id))!);
    // the stored ledger holds the entry; the view cannot see the description, so it drops it
    expect(stored.unresolved.map((u) => u.key)).toContain('custody_since');
    expect(keysOfUnresolved(res.body.ledger)).not.toContain('custody_since');
    // the brief sees the description and refuses
    const item = res.body.brief.items.find((i: any) => i.key === 'custody_since');
    expect(item.derived_from).toBeUndefined();
    // B2 is still asked (the pack asks custody_since when empty)
    const via = briefOf(stored.facts, stored.unresolved, GAP_DESC);
    expect(asksB2(via, stored.facts)).toBe(true);
    // generation, given the description, does not derive
    expect(generationDerives(stored.facts, stored.unresolved, GAP_DESC)).toBe(false);
  });
});

describe("T-665b F: custodySinceDerivesFromLedger is generation's decision", () => {
  const two = [
    ...base(),
    fact('arrest_date', '12 October 2026', { type: 'date', value: '2026-10-12' }),
  ];
  const heldSince = [
    ...base(),
    fact('custody_since', '12 October 2026', { type: 'date', value: '2026-10-12' }),
  ];
  const rows: Array<[string, LedgerFact[], LedgerUnresolvedFact[], string]> = [
    ['calm, since then', base(), then(), ANUSHKA],
    ['calm, no entry', base(), [], ANUSHKA],
    ...LIST.map((p): [string, LedgerFact[], LedgerUnresolvedFact[], string] => [
      `list "${p}"`,
      base(),
      then(p),
      ANUSHKA,
    ]),
    ['near-miss', base(), then('since that time'), ANUSHKA],
    ['real date span', base(), then('12 October 2026'), ANUSHKA],
    ['two arrest dates', two, then(), ANUSHKA],
    ['held custody_since', heldSince, then(), ANUSHKA],
    ['unresolved remand_date', base(), [...then(), unresolvedOf('remand_date', 'x')], ANUSHKA],
    [
      'stored remand_date',
      [...base(), fact('remand_date', '14 October 2026', { type: 'date', value: '2026-10-14' })],
      then(),
      ANUSHKA,
    ],
    ['no custody fact', base().filter((f) => f.key !== 'currently_in_custody'), then(), ANUSHKA],
    ['surrender in the description', base(), then(), GAP_DESC],
    [
      'custody No',
      [
        ...base().filter((f) => f.key !== 'currently_in_custody'),
        fact('currently_in_custody', 'No — apprehends arrest', { type: 'enum', value: 'no' }),
      ],
      then(),
      ANUSHKA,
    ],
  ];
  it.each(rows)("%s: same answer as the draft's marker", (_n, facts, unresolved, description) => {
    const viaView = custodySinceDerivesFromLedger(facts, unresolved, 'bail_regular', description);
    expect(viaView).toBe(generationDerives(facts, unresolved, description));
  });

  it('other packs never derive', () => {
    expect(custodySinceDerivesFromLedger(base(), then(), 'bail_anticipatory', ANUSHKA)).toBe(false);
  });
});
