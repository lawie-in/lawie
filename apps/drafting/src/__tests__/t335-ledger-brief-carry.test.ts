/**
 * T-335 — the fact ledger and the brief cannot disagree.
 *
 * AC1  an advocate's "Not known" survives a later re-read of the description.
 * AC2  a `keep` value carries into the new ledger after a description edit.
 * AC3  tests for both, plus Arjun's ledger == brief property test.
 *
 * Arjun's rulings (12 Oct 2026): the ledger mirrors the brief; only user-sourced
 * or asked_empty items are overlaid, never model-derived ones; "Not known"
 * stays until the advocate removes it; arrays are skipped; an unreadable keep
 * value writes nothing.
 *
 * Everything goes through the routes with the ledger on, as t147b / t190 do.
 * The model is the Anthropic SDK stub; every answer is a fixture. No legal
 * wording is retyped here: question text and labels are read from the packs.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists, resolveAverments } from '../services/averments';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { openVersion } from '../services/fact-ledger.service';
import { buildChecklist, foldAnswer } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

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
const PROTECTED = 'earlier_bail_applications';
const PACKS = [
  'bail_regular',
  'interim_bail',
  'bail_before_magistrate',
  'bail_anticipatory',
] as const;

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

type Given = { key: string; value: string | string[]; source?: 'user' | 'description' };
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
const storedFacts = async (id: string) => {
  const doc = (await FactLedgerModel.findById(id).lean())!;
  return openVersion(doc.versions[doc.currentVersion - 1]).facts;
};

const CL = buildChecklist(loadRulePack('bail_regular')!);
const labelOf = (key: string, cl = CL) => cl.find((i) => i.key === key)!.label;
const optionOf = (key: string, id: string, cl = CL) => {
  const o = cl
    .find((i) => i.key === key)!
    .options!.find((x) => /under invest/i.test(x) || x === id);
  return o ?? id;
};

const CLAUSE_IDS = loadRulePack('bail_regular')!.mandatoryClauses.map((c) => c.id);
function generate(ledgerId: string) {
  const body = `1. That the applicant Ram Kumar seeks bail.\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
  mockModel(body);
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      ledger_id: ledgerId,
      values: [
        { key: 'applicant_name', value: 'Ram Kumar' },
        { key: 'fir_number', value: '124/2026' },
      ],
    });
}
const promptUser = () =>
  (mockMessagesStream.mock.calls[0][0] as SdkStreamParams).messages[0].content as string;
const factsBlock = (user: string) =>
  JSON.parse(user.slice(user.indexOf('FACTS:\n') + 7).split('\n\n')[0]) as {
    facts: Array<{ key: string; display: string }>;
    missing: Array<{ key: string; label: string; write: string }>;
  };
const section = (prompt: string, from: string, to: string) =>
  prompt.slice(prompt.indexOf(from), prompt.indexOf(to));

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
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => jest.restoreAllMocks());

// ── the descriptions ────────────────────────────────────────────────────────
const D1 =
  'My client Ram Kumar, FIR No. 124/2026 at Kotwali police station. The matter is under investigation.';
const D2 =
  'My client Ram Kumar, FIR No. 124/2026 at Kotwali police station. Investigation is still going on.';
const F_NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
const F_FIR = { key: 'fir_number', span: '124/2026', confidence: 0.99 };
const R_NAME: [string, string, string] = ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'];

const UNDER = optionOf('investigation_status', 'Under investigation');
const NOT_KNOWN = 'Not known';
const F_INVEST_1 = {
  key: 'investigation_status',
  span: 'under investigation',
  option: UNDER,
  confidence: 0.99,
};
const F_INVEST_2 = {
  key: 'investigation_status',
  span: 'still going on',
  option: UNDER,
  confidence: 0.99,
};
const R_INVEST_1: [string, string, string] = [
  'investigation_status',
  UNDER,
  'The matter is under investigation',
];
const R_INVEST_2: [string, string, string] = [
  'investigation_status',
  UNDER,
  'Investigation is still going on',
];

/** First describe, then "Not known" through /update; returns the ledger id. */
async function firstThenNotKnown(
  key: string,
  desc: string,
  rec: [string, string, string],
  fact: Record<string, unknown>,
  pack = 'bail_regular',
) {
  mockModel(match(pack), reception([R_NAME, rec]), extraction(F_NAME, fact));
  const first = await describe_(desc);
  expect(first.status).toBe(200);
  expect(factOf(first, key)).toMatchObject({ source: 'user' }); // the description had filled it
  const id = first.body.ledger.ledger_id as string;
  const up = await update({
    ledger_id: id,
    ledger_edits: [{ key, text: NOT_KNOWN, from_question: true }],
    values: [{ key, value: NOT_KNOWN, source: 'user' }],
  });
  expect(up.status).toBe(200);
  expect(itemOf(up, key)).toMatchObject({ value: null, asked_empty: true });
  expect(factOf(up, key)).toBeUndefined();
  return { id: up.body.ledger.ledger_id as string };
}

// ═════════════════════════════════════════════════════════════════════════════
// AC1: "Not known" survives a re-read of the description
// ═════════════════════════════════════════════════════════════════════════════
describe('T-335 AC1: a dropdown "Not known" survives a re-read of the description', () => {
  it('description edit (no intake_id, no ledger_id): asked_empty, no fact, no unresolved, not asked, no blank in the Drafter prompt', async () => {
    await firstThenNotKnown('investigation_status', D1, R_INVEST_1, F_INVEST_1);

    mockModel(
      match('bail_regular'),
      reception([R_NAME, R_INVEST_2]),
      extraction(F_NAME, F_FIR, F_INVEST_2),
    );
    const res = await describe_(D2, {
      keep: [{ key: 'investigation_status', value: NOT_KNOWN, source: 'user' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(itemOf(res, 'investigation_status')).toMatchObject({ value: null, asked_empty: true });
    expect(factOf(res, 'investigation_status')).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).not.toContain('investigation_status');
    expect(questionKeys(res)).not.toContain('investigation_status');
    // the rest of the reading is still written
    expect(factOf(res, 'fir_number')).toBeDefined();

    const id = res.body.ledger.ledger_id as string;
    expect((await storedFacts(id)).map((f) => f.key)).not.toContain('investigation_status');
    expect((await generate(id)).status).toBe(200);
    const user = promptUser();
    const block = factsBlock(user);
    expect(block.facts.map((f) => f.key)).not.toContain('investigation_status');
    expect(block.missing.map((m) => m.key)).not.toContain('investigation_status');
    expect(user).not.toContain(`{{MISSING: ${labelOf('investigation_status')}}}`);
  });

  it('change-of-document path (kind + ledger_id, no intake_id): the same', async () => {
    const { id: earlier } = await firstThenNotKnown(
      'investigation_status',
      D1,
      R_INVEST_1,
      F_INVEST_1,
    );

    // no match call on a change of kind: Reception, then the extraction
    mockModel(reception([R_NAME, R_INVEST_2]), extraction(F_NAME, F_FIR, F_INVEST_2));
    const res = await describe_(D2, {
      kind: 'bail_regular',
      ledger_id: earlier,
      keep: [{ key: 'investigation_status', value: NOT_KNOWN, source: 'user' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(res.body.ledger.ledger_id).not.toBe(earlier); // a new ledger
    expect(itemOf(res, 'investigation_status')).toMatchObject({ value: null, asked_empty: true });
    expect(factOf(res, 'investigation_status')).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).not.toContain('investigation_status');
    expect(questionKeys(res)).not.toContain('investigation_status');

    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    const user = promptUser();
    expect(factsBlock(user).missing.map((m) => m.key)).not.toContain('investigation_status');
    expect(user).not.toContain(`{{MISSING: ${labelOf('investigation_status')}}}`);
  });

  it('change of document to another bail pack with the earlier ledger: still "Not known"', async () => {
    const { id: earlier } = await firstThenNotKnown(
      'investigation_status',
      D1,
      R_INVEST_1,
      F_INVEST_1,
    );
    mockModel(reception([R_NAME, R_INVEST_2]), extraction(F_NAME, F_INVEST_2));
    const res = await describe_(D2, {
      kind: 'bail_before_magistrate',
      ledger_id: earlier,
      keep: [{ key: 'investigation_status', value: NOT_KNOWN, source: 'user' }],
    });
    expect(res.body.outcome).toBe('brief');
    expect(itemOf(res, 'investigation_status')).toMatchObject({ value: null, asked_empty: true });
    expect(factOf(res, 'investigation_status')).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).not.toContain('investigation_status');
  });

  it('it stays until the advocate removes it: a second re-read still shows "Not known"', async () => {
    await firstThenNotKnown('investigation_status', D1, R_INVEST_1, F_INVEST_1);
    mockModel(
      match('bail_regular'),
      reception([R_NAME, R_INVEST_2]),
      extraction(F_NAME, F_INVEST_2),
    );
    const second = await describe_(D2, {
      keep: [{ key: 'investigation_status', value: NOT_KNOWN, source: 'user' }],
    });
    expect(itemOf(second, 'investigation_status')?.asked_empty).toBe(true);
    // the web sends the brief's "Not known" again on the next edit
    mockModel(
      match('bail_regular'),
      reception([R_NAME, R_INVEST_1]),
      extraction(F_NAME, F_INVEST_1),
    );
    const third = await describe_(D1, {
      keep: [{ key: 'investigation_status', value: NOT_KNOWN, source: 'user' }],
    });
    expect(itemOf(third, 'investigation_status')?.asked_empty).toBe(true);
    expect(factOf(third, 'investigation_status')).toBeUndefined();
  });

  it('when the advocate does not send it again (removed), the reading comes back as a fact', async () => {
    await firstThenNotKnown('investigation_status', D1, R_INVEST_1, F_INVEST_1);
    mockModel(
      match('bail_regular'),
      reception([R_NAME, R_INVEST_2]),
      extraction(F_NAME, F_INVEST_2),
    );
    const res = await describe_(D2, {
      keep: [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user' }],
    });
    expect(itemOf(res, 'investigation_status')?.asked_empty).toBeUndefined();
    expect(factOf(res, 'investigation_status')).toMatchObject({ source: 'user' });
  });
});

describe('T-335 AC1: a text-key "Not known" survives a re-read that states a value', () => {
  const CASES: Array<{ key: string; first: string; span1: string; second: string; span2: string }> =
    [
      {
        key: PROTECTED,
        first:
          'My client Ram Kumar. His earlier bail application was rejected by the JMFC, Dhanbad.',
        span1: 'rejected by the JMFC, Dhanbad',
        second:
          'My client Ram Kumar. His earlier bail application was rejected by the Sessions Judge, Patna.',
        span2: 'rejected by the Sessions Judge, Patna',
      },
      {
        key: 'medical_condition',
        first: 'My client Ram Kumar. He suffers from diabetes.',
        span1: 'suffers from diabetes',
        second: 'My client Ram Kumar. He is a heart patient.',
        span2: 'heart patient',
      },
    ];

  it.each(CASES)('$key', async ({ key, first, span1, second, span2 }) => {
    await firstThenNotKnown(key, first, [key, span1, span1], {
      key,
      span: span1,
      confidence: 0.99,
    });

    mockModel(
      match('bail_regular'),
      reception([R_NAME, [key, span2, span2]]),
      extraction(F_NAME, { key, span: span2, confidence: 0.99 }),
    );
    const res = await describe_(second, { keep: [{ key, value: NOT_KNOWN, source: 'user' }] });
    expect(res.status).toBe(200);
    expect(itemOf(res, key)).toMatchObject({ value: null, asked_empty: true });
    expect(factOf(res, key)).toBeUndefined();
    expect(unresolvedOf(res).map((u) => u.key)).not.toContain(key);
    expect(questionKeys(res)).not.toContain(key);
    expect((await storedFacts(res.body.ledger.ledger_id)).map((f) => f.key)).not.toContain(key);

    // and on the change-of-document path
    mockModel(
      reception([R_NAME, [key, span2, span2]]),
      extraction(F_NAME, { key, span: span2, confidence: 0.99 }),
    );
    const moved = await describe_(second, {
      kind: 'bail_regular',
      ledger_id: res.body.ledger.ledger_id,
      keep: [{ key, value: NOT_KNOWN, source: 'user' }],
    });
    expect(itemOf(moved, key)).toMatchObject({ value: null, asked_empty: true });
    expect(factOf(moved, key)).toBeUndefined();
    expect(unresolvedOf(moved).map((u) => u.key)).not.toContain(key);
    expect(questionKeys(moved)).not.toContain(key);
  });

  it('a "Not known" on a key the pack does not ask when empty is a plain value, not dropped (guard)', async () => {
    // police_station is required: "Not known" is a user value there, not asked_empty.
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_(D2, {
      keep: [{ key: 'police_station', value: 'Not known', source: 'user' }],
    });
    expect(itemOf(res, 'police_station')?.asked_empty).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2: a keep value carries into the new ledger
// ═════════════════════════════════════════════════════════════════════════════
describe('T-335 AC2: a keep value carries into the new ledger after a description edit', () => {
  it('police_station typed, the new description says nothing of it: an asked fact with that raw_span, and the Drafter FACTS use it', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME, F_FIR));
    const res = await describe_('My client Ram Kumar, FIR No. 124/2026.', {
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'user' }],
    });
    expect(res.status).toBe(200);
    expect(itemOf(res, 'police_station')).toMatchObject({ source: 'user' });
    const f = factOf(res, 'police_station')!;
    expect(f).toMatchObject({ source: 'asked', raw_span: 'Gandhi Maidan' });
    expect(f.display).toContain('Gandhi Maidan');
    // the other facts are still the description's
    expect(factOf(res, 'fir_number')).toMatchObject({ source: 'user' });

    const id = res.body.ledger.ledger_id as string;
    expect((await generate(id)).status).toBe(200);
    const block = factsBlock(promptUser());
    const shown = block.facts.find((x) => x.key === 'police_station')!;
    expect(shown.display).toBe(f.display);
    expect(shown.display).toContain('Gandhi Maidan');
    expect(block.missing.map((m) => m.key)).not.toContain('police_station');
  });

  it('the same on the change-of-document path (kind + ledger_id)', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const first = await describe_('My client Ram Kumar.');
    mockModel(reception([R_NAME]), extraction(F_NAME));
    const res = await describe_('My client Ram Kumar, FIR No. 124/2026.', {
      kind: 'bail_regular',
      ledger_id: first.body.ledger.ledger_id,
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'user' }],
    });
    expect(factOf(res, 'police_station')).toMatchObject({
      source: 'asked',
      raw_span: 'Gandhi Maidan',
    });
  });

  it('a typed name kept with "Please check" (the description gives another name) is an asked fact with the typed name', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_(D2, {
      keep: [{ key: 'applicant_name', value: 'Suresh Kumar', source: 'user' }],
    });
    const it_ = itemOf(res, 'applicant_name')!;
    expect(it_).toMatchObject({ value: 'Suresh Kumar', please_check: true });
    const f = factOf(res, 'applicant_name')!;
    expect(f).toMatchObject({ source: 'asked', raw_span: 'Suresh Kumar' });
    expect(f.display).toContain('Suresh Kumar');
    expect(f.display).not.toContain('Ram');
  });

  it('typed value equal to what the description says: one fact, no contradiction', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_(D2, {
      keep: [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user' }],
    });
    expect(factsOf(res).filter((f) => f.key === 'applicant_name')).toHaveLength(1);
  });

  it('a choice and a number typed by the advocate are carried', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_('My client Ram Kumar.', {
      keep: [
        { key: 'sole_earning_member', value: 'Yes', source: 'user' },
        { key: 'applicant_age', value: '32', source: 'user' },
      ],
    });
    expect(factOf(res, 'sole_earning_member')).toMatchObject({ source: 'asked', raw_span: 'Yes' });
    expect(factOf(res, 'applicant_age')).toMatchObject({ source: 'asked', raw_span: '32' });
  });

  it('police_station typed, the new description reads a different station: the typed value wins in the brief, and the ledger holds it as an asked fact, not the reading', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME, ['police_station', 'Kotwali', 'Kotwali police station']]),
      extraction(F_NAME, { key: 'police_station', span: 'Kotwali', confidence: 0.99 }),
    );
    const res = await describe_(D2, {
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'user' }],
    });
    expect(itemOf(res, 'police_station')).toMatchObject({ value: 'Gandhi Maidan', source: 'user' });
    const mine = factsOf(res).filter((f) => f.key === 'police_station');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ source: 'asked', raw_span: 'Gandhi Maidan' });
    expect(JSON.stringify(mine)).not.toContain('Kotwali');

    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    const shown = factsBlock(promptUser()).facts.find((x) => x.key === 'police_station')!;
    expect(shown.display).toContain('Gandhi Maidan');
    expect(shown.display).not.toContain('Kotwali');
  });

  describe('Rule A "replaced" is not overlaid', () => {
    it('currently_in_custody typed, the description contradicts it: the reading wins in the brief and the ledger, no asked fact for the typed value', async () => {
      const opts = CL.find((i) => i.key === 'currently_in_custody')!.options!;
      const [typed, read] = [opts[0], opts[2]];
      expect(typed).not.toBe(read);
      mockModel(
        reception([R_NAME, ['currently_in_custody', read, 'He has not been arrested']]),
        extraction(F_NAME, {
          key: 'currently_in_custody',
          span: 'He has not been arrested',
          option: read,
          confidence: 0.99,
        }),
      );
      const res = await describe_('My client Ram Kumar. He has not been arrested.', {
        kind: 'bail_regular',
        keep: [{ key: 'currently_in_custody', value: typed, source: 'user' }],
      });
      const it_ = itemOf(res, 'currently_in_custody')!;
      expect(it_.source).toBe('description');
      expect(it_.value).toBe(read);
      const mine = factsOf(res).filter((f) => f.key === 'currently_in_custody');
      expect(mine).toHaveLength(1);
      expect(mine[0].source).toBe('user'); // the description's, not the advocate's
      expect(mine[0].raw_span).toBe('He has not been arrested');
      expect(mine.map((f) => f.display).join()).not.toContain(typed);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Arjun's rulings
// ═════════════════════════════════════════════════════════════════════════════
describe('T-335 Arjun: model-derived brief items are never overlaid', () => {
  it('a keep entry marked source "description" is not written as an advocate fact', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_(D2, {
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'description' }],
    });
    expect(itemOf(res, 'police_station')).toMatchObject({ source: 'description' });
    expect(factOf(res, 'police_station')).toBeUndefined();
  });

  it('a value Reception read that the extraction pass did not write stays out of the ledger', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME, ['father_name', 'Hari Kumar', 'Hari Kumar']]),
      extraction(F_NAME),
    );
    const res = await describe_('My client Ram Kumar, son of Hari Kumar.', {
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'user' }],
    });
    expect(itemOf(res, 'father_name')).toMatchObject({ source: 'description' });
    expect(itemOf(res, 'father_name')?.value).toBeTruthy();
    expect(factOf(res, 'father_name')).toBeUndefined();
    // while the advocate's own value is written
    expect(factOf(res, 'police_station')?.source).toBe('asked');
  });

  it('a first describe with no keep: the ledger is the reading only, nothing laid over it', async () => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME, F_FIR));
    const res = await describe_(D2);
    expect(factsOf(res).map((f) => f.source)).toEqual(expect.not.arrayContaining(['asked']));
    expect(factsOf(res).length).toBeGreaterThan(0);
  });
});

describe('T-335 Arjun: arrays are skipped', () => {
  it.each([
    ['sections_charged', ['Section 379 IPC', 'Section 411 IPC']],
    ['grounds_for_bail', [CL.find((i) => i.key === 'grounds_for_bail')!.options![0]]],
  ])('a list or several-choices keep value for %s writes no ledger fact', async (key, value) => {
    mockModel(match('bail_regular'), reception([R_NAME]), extraction(F_NAME));
    const res = await describe_(D2, { keep: [{ key, value, source: 'user' }] });
    expect(res.status).toBe(200);
    expect(itemOf(res, key)?.value).toEqual(value); // the brief keeps it
    expect(factsOf(res).filter((f) => f.key === key)).toEqual([]);
  });
});

describe('T-335 Arjun: an unreadable keep value writes nothing', () => {
  it('applicant_age typed as words the normalizer cannot read: the description fact stays, no asked fact, no unresolved from the overlay', async () => {
    mockModel(
      match('bail_regular'),
      reception([R_NAME]),
      extraction(F_NAME, { key: 'applicant_age', span: '32', confidence: 0.99 }),
    );
    const res = await describe_('My client Ram Kumar is 32 years old.', {
      keep: [{ key: 'applicant_age', value: 'around thirty or so', source: 'user' }],
    });
    expect(res.status).toBe(200);
    const age = factsOf(res).filter((f) => f.key === 'applicant_age');
    expect(age).toHaveLength(1);
    expect(age[0]).toMatchObject({ source: 'user', raw_span: '32' }); // the description's fact
    expect(JSON.stringify(factsOf(res))).not.toContain('thirty');
    expect(unresolvedOf(res).filter((u) => u.key === 'applicant_age')).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T-190 / T-336 regression
// ═════════════════════════════════════════════════════════════════════════════
describe('T-335 keeps T-190 AC8 / T-336 working', () => {
  const DN =
    'My client Ram Kumar, FIR No. 124/2026 at Kotwali police station. Earlier bail applications: None.';
  const R_NONE: [string, string, string] = [PROTECTED, 'None', 'Earlier bail applications: None'];
  const F_NONE = { key: PROTECTED, span: 'None', confidence: 0.99 };

  it('first describe: a description-read "None" is held, confirm-asked first, and is no fact', async () => {
    mockModel(match('bail_regular'), reception([R_NAME, R_NONE]), extraction(F_NAME, F_NONE));
    const res = await describe_(DN);
    expect(itemOf(res, PROTECTED)).toMatchObject({ value: 'None', unconfirmed: true });
    expect(factOf(res, PROTECTED)).toBeUndefined();
    const q = res.body.questions as Q[];
    expect(q.find((x) => x.key === PROTECTED)).toMatchObject({ confirm: true });
  });

  it('description edit with other keep values: a description-read "None" is still held and confirm-asked', async () => {
    mockModel(match('bail_regular'), reception([R_NAME, R_NONE]), extraction(F_NAME, F_NONE));
    const res = await describe_(DN, {
      keep: [{ key: 'police_station', value: 'Gandhi Maidan', source: 'user' }],
    });
    expect(itemOf(res, PROTECTED)).toMatchObject({ value: 'None', unconfirmed: true });
    expect(factOf(res, PROTECTED)).toBeUndefined();
    expect((res.body.questions as Q[]).find((x) => x.key === PROTECTED)).toMatchObject({
      confirm: true,
    });
  });

  it.each(['/update', 'edit'])(
    'the advocate\'s own "None" (%s) becomes an asked fact and first_bail_application unlocks',
    async (via) => {
      let id: string;
      if (via === '/update') {
        mockModel(match('bail_regular'), reception([R_NAME, R_NONE]), extraction(F_NAME, F_NONE));
        const first = await describe_(DN);
        const up = await update({
          ledger_id: first.body.ledger.ledger_id,
          ledger_edits: [{ key: PROTECTED, text: 'None', from_question: true }],
        });
        expect(factOf(up, PROTECTED)).toMatchObject({ source: 'asked', raw_span: 'None' });
        id = up.body.ledger.ledger_id;
      } else {
        mockModel(match('bail_regular'), reception([R_NAME, R_NONE]), extraction(F_NAME, F_NONE));
        const res = await describe_(DN, {
          keep: [{ key: PROTECTED, value: 'None', source: 'user' }],
        });
        expect(itemOf(res, PROTECTED)?.unconfirmed).toBeUndefined();
        expect(factOf(res, PROTECTED)).toMatchObject({ source: 'asked', raw_span: 'None' });
        expect((res.body.questions as Q[]).some((x) => x.key === PROTECTED)).toBe(false);
        id = res.body.ledger.ledger_id;
      }
      const facts = await storedFacts(id);
      const out = resolveAverments(loadAvermentLists('bail_regular'), facts);
      expect(out.allowed.map((a) => a.id)).toContain('first_bail_application');
      expect((await generate(id)).status).toBe(200);
      const user = promptUser();
      expect(section(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS')).toMatch(
        /^- first_bail_application \|/m,
      );
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// Arjun's property: after /intake/brief, the ledger is the brief
// ═════════════════════════════════════════════════════════════════════════════
describe.each(PACKS)('T-335 property: ledger == brief on %s', (packId) => {
  const cl = buildChecklist(loadRulePack(packId)!);
  const has = (k: string) => cl.some((i) => i.key === k);
  const nameKey = has('applicant_name') ? 'applicant_name' : 'applicant_name';
  const desc =
    'My client Ram Kumar, aged 32, FIR No. 124/2026 at Kotwali police station. ' +
    'The matter is under investigation. He suffers from diabetes.';
  const reads: Array<[string, string, string]> = [
    [nameKey, 'Ram Kumar', 'My client Ram Kumar'],
    ['fir_number', '124/2026', 'FIR No. 124/2026'],
    ['police_station', 'Kotwali', 'Kotwali police station'],
    [
      'investigation_status',
      optionOf('investigation_status', 'Under investigation', cl),
      'The matter is under investigation',
    ],
    ['medical_condition', 'diabetes', 'suffers from diabetes'],
    ['applicant_age', '32', 'aged 32'],
  ].filter(([k]) => has(k)) as Array<[string, string, string]>;
  const facts = [
    { key: nameKey, span: 'Ram Kumar', confidence: 0.99 },
    { key: 'fir_number', span: '124/2026', confidence: 0.99 },
    { key: 'police_station', span: 'Kotwali', confidence: 0.99 },
    {
      key: 'investigation_status',
      span: 'under investigation',
      option: optionOf('investigation_status', 'Under investigation', cl),
      confidence: 0.99,
    },
    { key: 'medical_condition', span: 'suffers from diabetes', confidence: 0.99 },
    { key: 'applicant_age', span: '32', confidence: 0.99 },
  ].filter((f) => has(f.key));
  // a mix of the advocate's own: a "Not known", a "Not known" over a read, typed values, a replaced one, a list
  const keep: Given[] = (
    [
      { key: 'sole_earning_member', value: 'Not known' },
      { key: 'investigation_status', value: 'Not known' },
      { key: PROTECTED, value: 'Not known' },
      { key: 'medical_condition', value: 'Not known' },
      { key: 'applicant_occupation', value: 'Kirana shopkeeper' },
      { key: 'local_ties', value: 'Lives with his parents in Patna' },
      { key: 'named_in_fir', value: 'Yes' },
      { key: 'police_station', value: 'Gandhi Maidan' }, // contradicted: Rule A replaces it
      { key: 'applicant_name', value: 'Suresh Kumar' }, // a name: kept, Please check
      { key: 'sections_charged', value: ['Section 379 IPC'] }, // a list: skipped
    ] as Given[]
  ).filter((g) => has(g.key));

  it('every user scalar has an equal ledger fact; every asked_empty has no fact and no unresolved; no fact contradicts a user value', async () => {
    mockModel(match(packId), reception(reads), extraction(...facts));
    const res = await describe_(desc, {
      keep: keep.map((g) => ({ ...g, source: 'user' })),
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    const items = res.body.brief.items as Item[];
    const ledgerFacts = factsOf(res);
    const unresolved = unresolvedOf(res);
    const folded = (s: string) => foldAnswer(s);

    let userScalars = 0;
    let emptied = 0;
    for (const it_ of items) {
      const mine = ledgerFacts.filter((f) => f.key === it_.key);
      if (it_.asked_empty === true) {
        emptied += 1;
        expect(mine).toEqual([]);
        expect(unresolved.filter((u) => u.key === it_.key)).toEqual([]);
        continue;
      }
      if (it_.source === 'user' && typeof it_.value === 'string' && it_.value.trim() !== '') {
        userScalars += 1;
        expect(mine).toHaveLength(1);
        expect(mine[0].source).toBe('asked');
        expect(folded(mine[0].raw_span)).toBe(folded(it_.value));
      }
      // no fact the brief does not show: a user value or a null brief value
      if (mine.length > 0 && it_.source === 'user' && typeof it_.value === 'string') {
        for (const f of mine) expect(folded(f.raw_span)).toBe(folded(it_.value));
      }
      if (mine.length > 0 && it_.value === null) throw new Error(`fact for empty ${it_.key}`);
    }
    // the fixture really exercised the property
    expect(userScalars).toBeGreaterThanOrEqual(3);
    expect(emptied).toBeGreaterThanOrEqual(2);
    // the unresolved list never names an asked_empty key either (checked above), and a list is no fact
    if (has('sections_charged')) {
      expect(ledgerFacts.filter((f) => f.key === 'sections_charged')).toEqual([]);
    }
    // stored copy agrees with the returned one
    const stored = await storedFacts(res.body.ledger.ledger_id);
    expect(stored.map((f) => f.key).sort()).toEqual(ledgerFacts.map((f) => f.key).sort());
  });
});
