/**
 * T-498: the question rounds and "Still unknown" do not ask or list a fact the
 * fact ledger already holds (ledger on).
 *
 * Anushka's bail re-run (16 Oct 2026, handoff/quality/2026-10-16-bail-rerun-ledger-on-FAIL.md):
 * the brief was filled from the ledger's facts, but the questions and "Still
 * unknown" were built from the strict Reception reader's items only.
 *
 * Everything goes through the real routes with the Anthropic SDK stubbed (as
 * t335 / t147b do); every model answer is a fixture. The description is hers,
 * word for word. Spans are copied word for word from it.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import {
  buildBrief,
  buildChecklist,
  buildQuestions,
  ledgerGivenKeys,
  withoutLedgerGiven,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

// T-373: these tests drive the legacy (text-stream) path. The signed skeletons are on by default, so the
// loader is pinned to null here; every lookup is counted so the last test can show the mock was reached.
const mockSkeletonLookups: string[] = [];
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: (packId: string) => {
    mockSkeletonLookups.push(packId);
    return null;
  },
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994393a5';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const DRAFT_MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

// ── fixtures ────────────────────────────────────────────────────────────────
const match = (id: string) =>
  JSON.stringify({
    template_id: id,
    confidence: 'high',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: true,
    label: 'legal document',
    category: 'other',
  });
const reception = (items: Array<[string, string, string]>) =>
  JSON.stringify({
    outcome: 'read',
    read: items.map(([id, value, quote]) => ({ id, value, quote })),
    conflicts: [],
    questions: [],
  });
const extraction = (...facts: Array<Record<string, unknown>>) => JSON.stringify({ facts });
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}

type Item = {
  key: string;
  value: string | string[] | null;
  source: string | null;
  asked_empty?: boolean;
  please_check?: boolean;
  unconfirmed?: boolean;
  label: string;
};
type LFact = { key: string; value: unknown; display: string; raw_span: string; source: string };
type LUnresolved = { key: string; reason: string; raw_span: string };
type Q = { key: string; confirm?: boolean };

const describe_ = (description: string, body: Record<string, unknown> = {}) =>
  request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description, ...body });
const update = (body: Record<string, unknown>) =>
  request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({ kind: 'bail_regular', ...body });

const itemOf = (res: request.Response, key: string) =>
  (res.body.brief.items as Item[]).find((i) => i.key === key);
const factsOf = (res: request.Response) => res.body.ledger.facts as LFact[];
const unresolvedOf = (res: request.Response) => res.body.ledger.unresolved as LUnresolved[];
const factOf = (res: request.Response, key: string) => factsOf(res).find((f) => f.key === key);
const questionKeys = (res: request.Response) => (res.body.questions as Q[]).map((q) => q.key);
const CL = buildChecklist(loadRulePack('bail_regular')!);
const optionOf = (key: string, id: string, cl = CL) => {
  const o = cl
    .find((i) => i.key === key)!
    .options!.find((x) => /under invest/i.test(x) || x === id);
  return o ?? id;
};

const CLAUSE_IDS = loadRulePack('bail_regular')!.mandatoryClauses.map((c) => c.id);
const promptUser = () =>
  (mockMessagesStream.mock.calls[0][0] as SdkStreamParams).messages[0].content as string;
const factsBlock = (user: string) =>
  JSON.parse(user.slice(user.indexOf('FACTS:\n') + 7).split('\n\n')[0]) as {
    facts: Array<{ key: string; display: string }>;
    missing: Array<{ key: string; label: string; write: string }>;
  };

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
  await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  for (const m of [INTAKE_MODEL, DRAFT_MODEL]) {
    await AppSetting.create({
      key: `ai.rates.${m}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  }
  await Court.create({
    courtId: COURT_ID,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => jest.restoreAllMocks());

// ── her description, word for word ──────────────────────────────────────────
const D =
  'Regular bail before the Sessions Court, Patna. My client Ramesh Kumar Yadav (34, son of Suresh Yadav, resident of Mohalla Kadamkuan, Patna) was arrested on 20 September 2026 in FIR No. 412/2026 of Kadamkuan Police Station under BNS 318(4) and BNS 316(2), and BNS 318(4) again. He is in judicial custody at Beur Central Jail since 21 September 2026. Complainant Manoj Sinha alleges Ramesh took Rs. 4,50,000 for a land deal and did not return it. Grounds for bail: (1) the dispute is purely civil, a failed land sale agreement dated 2 March 2025; (2) the entire evidence is documentary and already seized by police, so no tampering is possible; (3) he has an elderly mother aged 72 who depends on him. Earlier bail applications: None. The applicant has never been accused in any other case.';
const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

const CUSTODY_OPTION = optionOf('currently_in_custody', 'Yes — Judicial custody');
const FACTS_SPAN =
  'Complainant Manoj Sinha alleges Ramesh took Rs. 4,50,000 for a land deal and did not return it';
const GROUNDS_SPAN = 'the entire evidence is documentary and already seized by police';
const GROUNDS_OPTION = 'No possibility of tampering with evidence';
const CUSTODY_SENTENCE = 'He is in judicial custody at Beur Central Jail since 21 September 2026';

const F = {
  applicant_name: { key: 'applicant_name', span: 'Ramesh Kumar Yadav', confidence: 0.95 },
  father_name: { key: 'father_name', span: 'Suresh Yadav', confidence: 0.95 },
  fir_number: { key: 'fir_number', span: '412/2026', confidence: 0.95 },
  sections_charged: {
    key: 'sections_charged',
    span: 'BNS 318(4) and BNS 316(2)',
    confidence: 0.95,
  },
  police_station: { key: 'police_station', span: 'Kadamkuan Police Station', confidence: 0.95 },
  currently_in_custody: {
    key: 'currently_in_custody',
    span: 'judicial custody',
    option: CUSTODY_OPTION,
    confidence: 0.95,
  },
  custody_since: { key: 'custody_since', span: '21 September 2026', confidence: 0.95 },
  applicant_age: { key: 'applicant_age', span: '34', confidence: 0.95 },
  address: { key: 'address', span: 'Mohalla Kadamkuan, Patna', confidence: 0.95 },
  facts_narrative: { key: 'facts_narrative', span: FACTS_SPAN, confidence: 0.95 },
  grounds_for_bail: {
    key: 'grounds_for_bail',
    span: GROUNDS_SPAN,
    option: GROUNDS_OPTION,
    confidence: 0.95,
  },
};
/** The 11 checklist keys of regular bail that her description states. */
const GIVEN_KEYS = Object.keys(F);
const ALL_FACTS = Object.values(F);

const R_NAME2: [string, string, string] = [
  'applicant_name',
  'Ramesh Kumar Yadav',
  'My client Ramesh Kumar Yadav',
];
const stillUnknownKeys = (res: request.Response) =>
  (res.body.brief.still_unknown as Array<{ key: string }>).map((u) => u.key);

describe('T-498 case A: her description, Reception reads little, the extractor reads all 11', () => {
  it('no key that holds a ledger fact is asked, and none is listed as still unknown', async () => {
    mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...ALL_FACTS));
    const res = await describe_(D);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');

    // the set-up is what she saw: every one of the 11 holds a fact
    const held = GIVEN_KEYS.filter((k) => factOf(res, k) !== undefined);
    expect(held).toEqual(GIVEN_KEYS);
    // ... while Reception left most brief items empty (the strict reader)
    for (const k of ['fir_number', 'police_station', 'sections_charged', 'father_name']) {
      expect(itemOf(res, k)?.value ?? null).toBeNull();
    }

    const asked = questionKeys(res);
    for (const k of held) expect(asked).not.toContain(k);
    const unknown = stillUnknownKeys(res);
    for (const k of held) expect(unknown).not.toContain(k);

    // what the description does not state is still asked (earlier bail is a confirm/pack question)
    expect(asked).toContain('earlier_bail_applications');
    // the brief rows themselves still show the ledger facts (not changed by the fix)
    expect(res.body.brief.items.length).toBeGreaterThan(20);
  });

  it('still-unknown names only keys that are truly missing: nothing the ledger holds', async () => {
    mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...ALL_FACTS));
    const res = await describe_(D);
    const heldKeys = new Set(factsOf(res).map((f) => f.key));
    for (const k of stillUnknownKeys(res)) expect(heldKeys.has(k)).toBe(false);
  });

  it('round 1 and round 2 are both free of the held keys (the whole question list)', async () => {
    mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...ALL_FACTS));
    const res = await describe_(D);
    const qs = res.body.questions as Array<{ key: string; round: number }>;
    expect(qs.some((q) => q.round === 1)).toBe(true);
    for (const q of qs) expect(GIVEN_KEYS).not.toContain(q.key);
  });

  it('a held key whose fact has an empty display is not given and is asked as before', async () => {
    // a fact the extractor drops (span not in the description) writes no fact: the key stays asked
    mockModel(
      match('bail_regular'),
      reception([R_NAME2]),
      extraction(F.applicant_name, { key: 'fir_number', span: '999/2030', confidence: 0.95 }),
    );
    const res = await describe_(D);
    expect(factOf(res, 'fir_number')).toBeUndefined();
    expect(questionKeys(res)).toContain('fir_number');
    expect(stillUnknownKeys(res)).toContain('fir_number');
    expect(questionKeys(res)).not.toContain('applicant_name');
  });
});

describe('T-498 case B: ledger off, the brief-only questions as before', () => {
  it('Reception reads one item: the rest are asked and listed, nothing is taken off', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(match('bail_regular'), reception([R_NAME2]));
    const res = await describe_(D);
    expect(res.status).toBe(200);
    expect(res.body.ledger).toBeUndefined();
    const asked = questionKeys(res);
    for (const k of [
      'fir_number',
      'police_station',
      'sections_charged',
      'currently_in_custody',
      'father_name',
      'applicant_age',
      'address',
      'facts_narrative',
      'grounds_for_bail',
    ]) {
      expect(asked).toContain(k);
      expect(stillUnknownKeys(res)).toContain(k);
    }
    expect(asked).not.toContain('applicant_name');
  });

  it('buildBrief / buildQuestions without ledgerGiven are the same as with an empty set', () => {
    const pack = loadRulePack('bail_regular')!;
    const checklist = buildChecklist(pack);
    const kind = { id: pack.id, name: pack.name, court_document: true };
    const values = [
      { key: 'applicant_name', value: 'Ramesh Kumar Yadav', source: 'user' as const },
    ];
    const plain = buildBrief({ kind, checklist, values });
    const empty = buildBrief({ kind, checklist, values, ledgerGiven: new Set() });
    // T-655: with a ledger (even an empty given set) the brief says so: ledger_given_keys: [].
    // Without a ledger the field is absent, so the web counts nothing as given.
    expect(empty).toEqual({ ...plain, ledger_given_keys: [] });
    expect('ledger_given_keys' in plain).toBe(false);
    expect(withoutLedgerGiven(plain, new Set())).toEqual({ ...plain, ledger_given_keys: [] });
    expect(buildQuestions(plain, new Map(), new Set(), new Set(), { checklist })).toEqual(
      buildQuestions(plain, new Map(), new Set(), new Set(), {
        checklist,
        ledgerGiven: new Set(),
      }),
    );
  });
});

describe('T-498 case C: what is still asked although the ledger holds the key', () => {
  it('a key unresolved WITHOUT a fact stays asked even when the brief holds a value (alwaysAsk, T-147b AC5)', async () => {
    mockModel(
      match('bail_regular'),
      reception([
        R_NAME2,
        ['police_station', 'Kadamkuan Police Station', 'of Kadamkuan Police Station'],
      ]),
      extraction(F.applicant_name, F.fir_number, { ...F.police_station, confidence: 0.1 }),
    );
    const res = await describe_(D);
    expect(factOf(res, 'police_station')).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).toContain('police_station');
    expect(itemOf(res, 'police_station')?.value).toBeTruthy();
    expect(questionKeys(res)).toContain('police_station');
    // the fact it did hold is not asked
    expect(questionKeys(res)).not.toContain('fir_number');
  });

  it('an unresolved required key with no brief value stays asked and listed (currently_in_custody: not an option)', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME2]),
      extraction(F.applicant_name, { ...F.currently_in_custody, option: 'Judicial custody' }),
    );
    const res = await describe_(D);
    expect(factOf(res, 'currently_in_custody')).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).toContain('currently_in_custody');
    expect(questionKeys(res)).toContain('currently_in_custody');
    expect(stillUnknownKeys(res)).toContain('currently_in_custody');
  });

  it('a reask (T-150 alsoAsk) key stays asked although given; without reask it is not', () => {
    const pack = loadRulePack('bail_regular')!;
    const checklist = buildChecklist(pack);
    const kind = { id: pack.id, name: pack.name, court_document: true };
    const b = buildBrief({ kind, checklist, values: [], reask: ['offence_date'] });
    const given = new Set(['offence_date', 'fir_number', 'police_station']);
    const keys = (also: string[]) =>
      buildQuestions(b, new Map(), new Set(also), new Set(), { checklist, ledgerGiven: given }).map(
        (q) => q.key,
      );
    expect(keys(['offence_date'])).toContain('offence_date');
    expect(keys([])).not.toContain('offence_date');
    // a required given key is never asked
    expect(keys([])).not.toContain('fir_number');
    expect(keys([])).not.toContain('police_station');
  });

  it('an alwaysAsk key stays asked even if (by mistake) it is also given', () => {
    const pack = loadRulePack('bail_regular')!;
    const checklist = buildChecklist(pack);
    const kind = { id: pack.id, name: pack.name, court_document: true };
    const b = buildBrief({
      kind,
      checklist,
      values: [{ key: 'custody_since', value: '2026-09-21', source: 'description' }],
    });
    const q = buildQuestions(b, new Map(), new Set(), new Set(['custody_since']), {
      checklist,
      ledgerGiven: new Set(['custody_since']),
    });
    expect(q.map((x) => x.key)).toContain('custody_since');
  });

  it('a confirm question stays asked, with confirm true (T-190 AC8)', () => {
    const pack = loadRulePack('bail_regular')!;
    const checklist = buildChecklist(pack);
    const kind = { id: pack.id, name: pack.name, court_document: true };
    const b = buildBrief({
      kind,
      checklist,
      values: [{ key: 'earlier_bail_applications', value: 'None', source: 'description' }],
    });
    for (const given of [new Set<string>(), new Set(['earlier_bail_applications'])]) {
      const q = buildQuestions(b, new Map(), new Set(), new Set(), {
        checklist,
        confirm: new Set(['earlier_bail_applications']),
        ledgerGiven: given,
      }).find((x) => x.key === 'earlier_bail_applications');
      expect(q).toMatchObject({ confirm: true });
    }
  });

  it('through the route: "None" read from the description with no fact is asked to confirm', async () => {
    mockModel(
      match('bail_regular'),
      reception([
        R_NAME2,
        ['earlier_bail_applications', 'None', 'Earlier bail applications: None'],
      ]),
      extraction(...ALL_FACTS),
    );
    const res = await describe_(D);
    expect(factOf(res, 'earlier_bail_applications')).toBeUndefined();
    const q = (res.body.questions as Q[]).find((x) => x.key === 'earlier_bail_applications');
    expect(q).toMatchObject({ confirm: true });
  });
});

describe('T-498 case D: a "No" on an undertaking box is not given (T-251)', () => {
  const fact = (key: string, display: string, value: unknown = display) => ({
    key,
    display,
    value,
  });
  it('ledgerGivenKeys: "No" / false on willingness_to_furnish_bond is not given; "Yes" is', () => {
    expect(ledgerGivenKeys([fact('willingness_to_furnish_bond', 'No')]).size).toBe(0);
    expect(ledgerGivenKeys([fact('willingness_to_furnish_bond', 'no', false)]).size).toBe(0);
    expect(
      ledgerGivenKeys([fact('willingness_to_furnish_bond', 'Yes')]).has(
        'willingness_to_furnish_bond',
      ),
    ).toBe(true);
    // an ordinary yes/no key is given whatever the answer
    expect(ledgerGivenKeys([fact('sole_earning_member', 'No')]).has('sole_earning_member')).toBe(
      true,
    );
    // an empty display is not a fact
    expect(ledgerGivenKeys([fact('fir_number', '   ')]).size).toBe(0);
  });

  it('the bond stays asked and unknown with a "No" fact, and is dropped with a "Yes" fact', () => {
    const pack = loadRulePack('default_bail')!;
    const checklist = buildChecklist(pack);
    const kind = { id: pack.id, name: pack.name, court_document: true };
    const b = buildBrief({ kind, checklist, values: [] });
    const run = (given: Set<string>) => ({
      asked: buildQuestions(b, new Map(), new Set(), new Set(), {
        checklist,
        ledgerGiven: given,
      }).map((q) => q.key),
      unknown: withoutLedgerGiven(b, given).still_unknown.map((u) => u.key),
    });
    const no = run(ledgerGivenKeys([fact('willingness_to_furnish_bond', 'No')]));
    expect(no.asked).toContain('willingness_to_furnish_bond');
    expect(no.unknown).toContain('willingness_to_furnish_bond');
    const yes = run(ledgerGivenKeys([fact('willingness_to_furnish_bond', 'Yes')]));
    expect(yes.asked).not.toContain('willingness_to_furnish_bond');
    expect(yes.unknown).not.toContain('willingness_to_furnish_bond');
  });
});

describe('T-498 case E: sections Reception drops, the extractor keeps', () => {
  it("act-first 'BNS 318(4)' (act_unclear): the brief item is empty, a fact exists, so sections are not asked", async () => {
    const quote = 'under BNS 318(4) and BNS 316(2), and BNS 318(4) again';
    mockModel(
      match('bail_regular'),
      JSON.stringify({
        outcome: 'read',
        read: [
          {
            id: 'applicant_name',
            value: 'Ramesh Kumar Yadav',
            quote: 'My client Ramesh Kumar Yadav',
          },
          { id: 'sections_charged', value: ['BNS 318(4)'], quote },
        ],
        conflicts: [],
        questions: [],
      }),
      extraction(F.applicant_name, F.sections_charged),
    );
    const res = await describe_(D);
    expect(res.status).toBe(200);
    expect(itemOf(res, 'sections_charged')?.value ?? null).toBeNull(); // Reception dropped it
    expect(factOf(res, 'sections_charged')).toBeDefined(); // the extractor wrote it
    expect(questionKeys(res)).not.toContain('sections_charged');
    expect(stillUnknownKeys(res)).not.toContain('sections_charged');
  });
});

describe('T-498 case F: /intake/brief/update after the round answers', () => {
  async function first(facts: Array<Record<string, unknown>> = ALL_FACTS) {
    mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...facts));
    const res = await describe_(D);
    expect(res.status).toBe(200);
    return res.body.ledger.ledger_id as string;
  }
  const answered = [{ key: 'earlier_bail_applications', value: 'None', source: 'user' }];

  it('with ledger_id: given keys are out of still_unknown; without it they stay (the brief alone)', async () => {
    const id = await first();
    const withLedger = await update({
      ledger_id: id,
      ledger_edits: [],
      values: answered,
      court: COURT,
    });
    expect(withLedger.status).toBe(200);
    const keys = stillUnknownKeys(withLedger);
    for (const k of GIVEN_KEYS) expect(keys).not.toContain(k);

    const without = await update({ values: answered, court: COURT });
    expect(without.status).toBe(200);
    for (const k of ['fir_number', 'police_station', 'father_name', 'applicant_name']) {
      expect(stillUnknownKeys(without)).toContain(k);
    }
  });

  it('a party name held only by the ledger does not block can_confirm; without the ledger it does', async () => {
    const id = await first();
    const with_ = await update({ ledger_id: id, ledger_edits: [], values: answered, court: COURT });
    expect(with_.body.brief.confirm_blockers).toEqual([]);
    expect(with_.body.brief.can_confirm).toBe(true);
    expect(with_.body.brief.confirm_message).toBeNull();

    const without = await update({ values: answered, court: COURT });
    expect(without.body.brief.confirm_blockers).toContain('parties');
    expect(without.body.brief.can_confirm).toBe(false);
  });

  it('a party the ledger does not hold still blocks, with the court chosen', async () => {
    // only the father is held; the applicant name is neither typed nor in the ledger
    const id = await first([F.father_name]);
    const up = await update({ ledger_id: id, ledger_edits: [], values: answered, court: COURT });
    expect(up.body.brief.can_confirm).toBe(false);
    expect(up.body.brief.confirm_blockers).toContain('parties');
    expect(up.body.brief.confirm_message).toMatch(/^Add the name of the /);
  });

  it('court not chosen: the court still blocks whatever the ledger holds', async () => {
    const id = await first();
    const up = await update({ ledger_id: id, ledger_edits: [], values: answered });
    expect(up.body.brief.can_confirm).toBe(false);
    expect(up.body.brief.confirm_blockers).toContain('court');
    expect(up.body.brief.confirm_blockers).not.toContain('parties');
    expect(up.body.brief.confirm_message).toBe('Choose the court to continue.');
  });

  it('the switch off: ledger_id is ignored and nothing is taken off', async () => {
    const id = await first();
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const up = await update({ ledger_id: id, ledger_edits: [], values: answered, court: COURT });
    expect(up.status).toBe(200);
    expect(stillUnknownKeys(up)).toContain('fir_number');
    expect(up.body.brief.can_confirm).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// custody_since: Arjun's v1 ruling. "In custody since" STAYS asked when the
// extractor could not settle it (AC5 of T-147b stands); the brief keeps the
// date Reception placed. Calibrated confidence is T-470. These pin that ruling.
// ═════════════════════════════════════════════════════════════════════════════
describe('T-498 custody_since four-case matrix (Arjun v1 ruling: stays asked, AC5 stands; T-470)', () => {
  const R_SINCE: [string, string, string] = ['custody_since', '2026-09-21', CUSTODY_SENTENCE];
  const base = [F.applicant_name, F.currently_in_custody];

  it('control: a fact is written (0.95), custody_since is NOT asked', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME2, R_SINCE]),
      extraction(...base, F.custody_since),
    );
    const res = await describe_(D);
    expect(factOf(res, 'custody_since')).toBeDefined();
    expect(unresolvedOf(res).map((u) => u.key)).not.toContain('custody_since');
    expect(questionKeys(res)).not.toContain('custody_since');
  });

  it('the same without Reception placing it: the code-read date still shows, and it is not asked', async () => {
    mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...base, F.custody_since));
    const res = await describe_(D);
    expect(itemOf(res, 'custody_since')).toMatchObject({
      value: '2026-09-21',
      source: 'description',
    });
    expect(factOf(res, 'custody_since')).toBeDefined();
    expect(questionKeys(res)).not.toContain('custody_since');
  });

  const ASKED: Array<{ name: string; entries: Array<Record<string, unknown>>; reason: string }> = [
    {
      name: 'below the floor (0.85)',
      entries: [{ ...F.custody_since, confidence: 0.85 }],
      reason: 'low_confidence',
    },
    {
      name: 'conflicting (21 and 20 September, both 0.99)',
      entries: [
        { key: 'custody_since', span: '21 September 2026', confidence: 0.99 },
        { key: 'custody_since', span: '20 September 2026', confidence: 0.99 },
      ],
      reason: 'conflicting_values',
    },
    {
      name: "'since' copied into the span (0.99)",
      entries: [{ key: 'custody_since', span: 'since 21 September 2026', confidence: 0.99 }],
      reason: 'unrecognised',
    },
  ];

  it.each(ASKED)(
    '$name: unresolved, no fact, ASKED, the brief keeps 2026-09-21',
    async ({ entries, reason }) => {
      mockModel(
        match('bail_regular'),
        reception([R_NAME2, R_SINCE]),
        extraction(...base, ...entries),
      );
      const res = await describe_(D);
      expect(res.status).toBe(200);
      expect(questionKeys(res)).toContain('custody_since');
      expect(itemOf(res, 'custody_since')).toMatchObject({
        value: '2026-09-21',
        source: 'description',
      });
      const un = unresolvedOf(res).find((u) => u.key === 'custody_since');
      expect(un).toBeDefined();
      expect(un!.reason).toBe(reason);
      expect(factOf(res, 'custody_since')).toBeUndefined();
      // the other fact it did settle is not asked
      expect(questionKeys(res)).not.toContain('currently_in_custody');
    },
  );

  it.each(ASKED)(
    '$name, Reception silent: the code-read date is the value and it is still asked',
    async ({ entries }) => {
      mockModel(match('bail_regular'), reception([R_NAME2]), extraction(...base, ...entries));
      const res = await describe_(D);
      expect(questionKeys(res)).toContain('custody_since');
      expect(itemOf(res, 'custody_since')).toMatchObject({
        value: '2026-09-21',
        source: 'description',
      });
      expect(factOf(res, 'custody_since')).toBeUndefined();
    },
  );
});

describe('T-498 documents route: the check reads the ledger, the Drafter does not', () => {
  const VALUES = [{ key: 'fir_number', value: '124/2026' }]; // no party name typed

  it('a party name held only by the ledger passes brief_not_confirmed', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME2]),
      extraction(F.applicant_name, F.father_name),
    );
    const first = await describe_(D);
    const id = first.body.ledger.ledger_id as string;
    expect(factOf(first, 'applicant_name')).toBeDefined();

    const body = `1. That the applicant seeks bail.\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
    mockModel(body);
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'bail_regular', court: COURT, ledger_id: id, values: VALUES });
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalled();
  });

  it('with no ledger the check is unchanged: no party name is a 400 with the parties blocker', async () => {
    mockModel();
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'bail_regular', court: COURT, values: VALUES });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'brief_not_confirmed', blockers: ['parties'] });
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it('with a ledger that does not hold the party, the check still blocks', async () => {
    mockModel(match('bail_regular'), reception([]), extraction(F.father_name));
    const first = await describe_(D);
    mockModel();
    const res = await request(app).post('/generate-from-brief').set(headers()).send({
      kind: 'bail_regular',
      court: COURT,
      ledger_id: first.body.ledger.ledger_id,
      values: VALUES,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.blockers).toContain('parties');
  });

  it('the brief handed to the Drafter is not changed: a ledger-held key is still a "missing" line / not removed from its still-unknown', async () => {
    // The ledger holds facts for keys the sent values do not carry. The check above reads the
    // ledger; the Drafter's brief is worked out from the values alone, exactly as before T-498.
    mockModel(
      match('bail_regular'),
      reception([R_NAME2]),
      extraction(F.applicant_name, F.police_station, F.father_name),
    );
    const first = await describe_(D);
    const id = first.body.ledger.ledger_id as string;
    const body = `1. That the applicant seeks bail.\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
    mockModel(body);
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        court: COURT,
        ledger_id: id,
        values: [
          { key: 'applicant_name', value: 'Ramesh Kumar Yadav' },
          { key: 'father_name', value: 'Suresh Yadav' },
        ],
      });
    expect(res.status).toBe(200);
    const user = promptUser();
    const block = factsBlock(user);
    // police_station is a ledger fact: the Drafter has it as a fact ...
    expect(block.facts.map((f) => f.key)).toContain('police_station');
    // ... and the keys the ledger does not hold are still the Drafter's "missing" lines.
    expect(block.missing.map((m) => m.key)).toEqual(
      expect.arrayContaining(['fir_number', 'sections_charged']),
    );
    expect(block.missing.map((m) => m.key)).not.toContain('police_station');
  });
});
