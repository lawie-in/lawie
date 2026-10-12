/**
 * T-338 (Ajay): an optional ledger key the ledger holds as unresolved, with no
 * fact, reaches the Drafter as a visible {{MISSING: label}} blank.
 * Carried from T-190: merely EMPTY optional items get no blank; "Not known"
 * gets no forced blank; earlier_bail_applications is not doubled.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER, ledgerDrafterFacts, missingPlaceholder } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const PROTECTED = 'earlier_bail_applications';

// ── unit: ledgerDrafterFacts ────────────────────────────────────────────────
const CHECKLIST = [
  { key: 'applicant_name', label: 'Applicant name', required: true },
  { key: 'medical_condition', label: 'Medical condition', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
  { key: PROTECTED, label: 'Earlier bail applications', required: false },
];
const fact = (key: string, display: string) =>
  ({
    id: `f-${key}`,
    key,
    label: key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'asked',
    confidence: 1,
    required_in_draft: false,
  }) as never;
const missingKeys = (r: { missing: Array<{ key: string }> }) => r.missing.map((m) => m.key);

describe('T-338 ledgerDrafterFacts', () => {
  it('AC1: an unresolved optional key with no fact is a {{MISSING: label}} blank', () => {
    const r = ledgerDrafterFacts([], CHECKLIST, null, false, ['medical_condition']);
    const m = r.missing.find((x) => x.key === 'medical_condition');
    expect(m).toEqual({
      key: 'medical_condition',
      label: 'Medical condition',
      write: '{{MISSING: Medical condition}}',
    });
    expect(m!.write).toBe(missingPlaceholder('Medical condition'));
  });

  it('T-190: an optional key that is merely empty (not unresolved) gets no blank', () => {
    const r = ledgerDrafterFacts([], CHECKLIST, null, false, ['remarks']);
    expect(missingKeys(r)).not.toContain('medical_condition');
  });

  it('AC3: an unresolved key that has a fact is not missing and its value is printed', () => {
    const r = ledgerDrafterFacts(
      [fact('medical_condition', ' Diabetes ')],
      CHECKLIST,
      null,
      false,
      ['medical_condition'],
    );
    expect(missingKeys(r)).not.toContain('medical_condition');
    expect(r.facts).toEqual([
      { key: 'medical_condition', label: 'medical_condition', type: 'text', display: 'Diabetes' },
    ]);
  });

  it('required behaviour is unchanged (blank when no fact, none when held)', () => {
    expect(missingKeys(ledgerDrafterFacts([], CHECKLIST, null, false, []))).toEqual([
      'applicant_name',
    ]);
    expect(
      missingKeys(ledgerDrafterFacts([fact('applicant_name', 'Ram')], CHECKLIST, null, false, [])),
    ).toEqual([]);
    // unresolved + required: still one blank, not doubled
    expect(missingKeys(ledgerDrafterFacts([], CHECKLIST, null, false, ['applicant_name']))).toEqual(
      ['applicant_name'],
    );
  });

  it('earlier_bail_applications unresolved is not a blank here (its clause prints the B4 blank)', () => {
    const r = ledgerDrafterFacts([], CHECKLIST, null, false, [PROTECTED]);
    expect(missingKeys(r)).not.toContain(PROTECTED);
  });

  it('the default argument gives the old behaviour', () => {
    expect(ledgerDrafterFacts([], CHECKLIST, null, false)).toEqual(
      ledgerDrafterFacts([], CHECKLIST, null, false, []),
    );
    expect(missingKeys(ledgerDrafterFacts([], CHECKLIST, null, false))).toEqual(['applicant_name']);
  });

  it('an unresolved key not on the checklist adds nothing', () => {
    expect(missingKeys(ledgerDrafterFacts([], CHECKLIST, null, false, ['nope']))).toEqual([
      'applicant_name',
    ]);
  });
});

// ── routes ──────────────────────────────────────────────────────────────────
const CL = buildChecklist(loadRulePack('bail_regular')!);
const MED = CL.find((i) => i.key === 'medical_condition')!;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391b1';
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
const MATCH_BAIL = JSON.stringify({
  template_id: 'bail_regular',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'legal document',
  category: 'other',
});
const reception = JSON.stringify({
  outcome: 'read',
  read: [{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }],
  conflicts: [],
  questions: [],
});
const extraction = (...facts: Array<Record<string, unknown>>) => JSON.stringify({ facts });
const F_NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
const LOW_MED = { key: 'medical_condition', span: 'unwell', confidence: 0.1 };
const DESC = 'My client Ram Kumar is unwell. Please prepare a bail application.';

function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
const describe_ = () =>
  request(app).post('/intake/brief').set(headers()).send({ description: DESC });
const update = (body: Record<string, unknown>) =>
  request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({ kind: 'bail_regular', ...body });
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
type FactsBlock = {
  facts: Array<{ key: string; display: string }>;
  missing: Array<{ key: string; label: string; write: string }>;
};
const promptFacts = () => {
  const p = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  const user = p.messages[0].content as string;
  return {
    user,
    facts: JSON.parse(user.slice(user.indexOf('FACTS:\n') + 7).split('\n\n')[0]) as FactsBlock,
  };
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

describe('T-338 through the routes', () => {
  it('the checklist item is optional (premise)', () => {
    expect(MED.required).toBe(false);
  });

  it('AC1+AC2: an unresolved, unanswered optional key is a {{MISSING: label}} in the Drafter FACTS', async () => {
    mockModel(MATCH_BAIL, reception, extraction(F_NAME, LOW_MED));
    const res = await describe_();
    expect(res.status).toBe(200);
    const unresolved = (res.body.ledger.unresolved as Array<{ key: string }>).map((u) => u.key);
    expect(unresolved).toContain('medical_condition');
    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    const { user, facts } = promptFacts();
    const m = facts.missing.find((x) => x.key === 'medical_condition');
    expect(m).toBeDefined();
    expect(m!.write).toBe(`{{MISSING: ${MED.label}}}`);
    expect(user).toContain(`{{MISSING: ${MED.label}}}`);
    expect(facts.facts.map((f) => f.key)).not.toContain('medical_condition');
  });

  it('AC3: the same key answered is printed as a fact and is not a blank', async () => {
    mockModel(MATCH_BAIL, reception, extraction(F_NAME, LOW_MED));
    const id = (await describe_()).body.ledger.ledger_id as string;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'medical_condition', text: 'Type 2 diabetes', from_question: true }],
    });
    expect(up.status).toBe(200);
    expect((await generate(id)).status).toBe(200);
    const { facts } = promptFacts();
    expect(facts.missing.map((x) => x.key)).not.toContain('medical_condition');
    expect(facts.facts.find((f) => f.key === 'medical_condition')?.display).toBe('Type 2 diabetes');
  });

  it('T-190: "Not known" on the key gives no fact and no forced blank', async () => {
    mockModel(MATCH_BAIL, reception, extraction(F_NAME, LOW_MED));
    const id = (await describe_()).body.ledger.ledger_id as string;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'medical_condition', text: 'Not known', from_question: true }],
    });
    expect(up.status).toBe(200);
    expect((await generate(id)).status).toBe(200);
    const { user, facts } = promptFacts();
    expect(facts.missing.map((x) => x.key)).not.toContain('medical_condition');
    expect(facts.facts.map((f) => f.key)).not.toContain('medical_condition');
    expect(user).not.toContain(`{{MISSING: ${MED.label}}}`);
  });

  it('T-190: an optional key never read (empty, not unresolved) gets no blank', async () => {
    mockModel(MATCH_BAIL, reception, extraction(F_NAME));
    const res = await describe_();
    const unresolved = (res.body.ledger.unresolved as Array<{ key: string }>).map((u) => u.key);
    expect(unresolved).not.toContain('medical_condition');
    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    expect(promptFacts().facts.missing.map((x) => x.key)).not.toContain('medical_condition');
  });

  it('T-190: earlier_bail_applications is not doubled in FACTS.missing when unresolved', async () => {
    mockModel(
      MATCH_BAIL,
      reception,
      extraction(F_NAME, { key: PROTECTED, span: 'unwell', confidence: 0.1 }),
    );
    const res = await describe_();
    expect(res.status).toBe(200);
    const unresolved = (res.body.ledger.unresolved as Array<{ key: string }>).map((u) => u.key);
    expect(unresolved).toContain(PROTECTED); // premise: it really is unresolved
    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    expect(promptFacts().facts.missing.map((x) => x.key)).not.toContain(PROTECTED);
  });
});
