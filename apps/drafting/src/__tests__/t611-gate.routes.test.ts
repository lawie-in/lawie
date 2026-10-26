/**
 * T-611 — the delivery gate, end to end through POST /generate-from-brief on the
 * legacy (text-stream) path, and GET /documents/:id (Phase A).
 *
 * AC1  no {{MISSING}} token is ever served: GET returns [To be confirmed: label]
 * AC5  a draft with a blank for a fact the ledger holds is not delivered: one
 *      deterministic fill, one model repair, then the advocate is asked; no Ink
 *      is taken (hold released, failed Generation row, no settle, no done event)
 * P1   a held value under another label: repair, then fact_conflict (signed text)
 * P6   a blank for a fact the ledger does NOT hold is delivered as a blank
 *
 * The model is the Anthropic SDK stub; every answer is a fixture. Matters are
 * Anushka's fictional ones (handoff/quality/2026-10-26-prod-drafting-FAIL.md).
 */
import './setupDb';
import { DOC_TYPES } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { decrypt, encrypt } from '../utils/encryption';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

// The signed skeletons are on by default; these tests drive the legacy text stream.
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: () => null,
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994396a1';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
const START_INK = 2000;

const VALUES = [
  { key: 'applicant_name', value: 'Ramesh Kumar Yadav' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '412/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const CUES =
  ' He is in custody in FIR No. 412/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
const P1_ = `1. That the applicant Ramesh Kumar Yadav has approached this Hon'ble Court for regular bail.${CUES}`;
const P2_ = '2. That FIR No. 412/2026 was registered at PS Kotwali.';
const P3_ = '3. That the applicant is in judicial custody.';
const body = (...extra: string[]) => [P1_, P2_, P3_, ...extra].join('\n\n');

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}
const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');
const answer = (b: string) => `${b}\n\n${CLAUSES_MARKER}\n${report()}`;
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 4000, 800));
}
function callOf(n: number): { system: unknown; user: string } {
  const p = mockMessagesStream.mock.calls[n][0] as SdkStreamParams;
  return { system: p.system as unknown, user: p.messages[0].content };
}
function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}

function fact(key: string, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f_${key}_${display.length}`,
    key,
    label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
    ...extra,
  };
}
const baseFacts = () => [
  fact('applicant_name', 'Ramesh Kumar Yadav', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '412/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];
async function ledger(facts: Array<Record<string, unknown>>) {
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: 'bail_regular',
    runType: 'user',
    currentVersion: 1,
    versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
  });
  return String(doc._id);
}
const post = (ledgerId: string) =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: ledgerId });

async function rawUser() {
  return (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
}
const savedContent = async (docId: string) =>
  decrypt((await LawieDocument.findById(docId).lean())!.generatedContent as string);

/** Nothing was taken: balance as it began, no hold left, no ledger row, no document. */
async function expectNoInkTaken() {
  const u = await rawUser();
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
  expect(rows).toEqual([]);
  expect(await LawieDocument.countDocuments({})).toBe(0);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
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
    inkTopup: START_INK,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// P6: a blank for a fact the ledger holds
// ═════════════════════════════════════════════════════════════════════════════
describe('P6: a blank for a held fact is filled, repaired once, or the draft is withheld', () => {
  // The pack's own label for the held `address` fact. ("Police Station" is a generic label the
  // verifier writes itself, so a blank with it is never filled: see the report.)
  const ADDRESS_LABEL = CHECKLIST.find((i) => i.key === 'address')!.label;
  const BLANK_PARA = `3. That the applicant, resident of {{MISSING: ${ADDRESS_LABEL}}}, is in judicial custody.`;

  it('the deterministic fill: delivered with the held value, no model repair, no token saved', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body().replace(P3_, BLANK_PARA)));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1); // the fill needs no model repair
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(events(res.text, 'error')).toEqual([]);
    const saved = await savedContent(done[0].docId);
    expect(saved).toContain('resident of 123 Main St, Patna, is in judicial custody');
    expect(saved).not.toMatch(/\{\{MISSING/);
  });

  it('an unfillable held blank gets one model repair, and a repair that prints the value delivers', async () => {
    // Two police stations are held: code cannot pick one, so it is left to the repair.
    const id = await ledger([
      ...baseFacts(),
      fact('address', '45 Park Road, Gaya', { type: 'place_name', value: 'y' }),
    ]);
    mockModel(
      answer(body().replace(P3_, BLANK_PARA)),
      '[[P2]]\n3. That the applicant, resident of 123 Main St, Patna, is in judicial custody.',
    );
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(await savedContent(done[0].docId)).not.toMatch(/\{\{MISSING/);
  });

  it('still blank after the one repair: withheld with fact_needed and the exact signed text, no Ink taken', async () => {
    const id = await ledger([
      ...baseFacts(),
      fact('address', '45 Park Road, Gaya', { type: 'place_name', value: 'y' }),
    ]);
    mockModel(answer(body().replace(P3_, BLANK_PARA)), `[[P2]]\n${BLANK_PARA}`);
    const res = await post(id);
    // The held blank is sent to the model repair exactly once. (The verifier may make its own
    // call for the other held address left out of this short body; that is its own check.)
    const heldRepairs = mockMessagesStream.mock.calls.filter((_c, i) =>
      callOf(i).user.includes('has a blank for'),
    );
    expect(heldRepairs).toHaveLength(1);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'fact_needed',
      retryable: false,
      reason: `One detail is needed before the draft: ${ADDRESS_LABEL}.`,
      key: 'address',
    });
    expect(res.text).not.toContain('event: done');
    expect(res.text).not.toMatch(/\{\{MISSING/);
    // The hold is released, a failed row is saved, and nothing settled.
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    await expectNoInkTaken();
  });

  describe('Police Station (the pack label is also a generic word)', () => {
    const PS_BLANK =
      '3. That the applicant, produced by PS {{MISSING: Police Station}}, is in judicial custody.';

    it('bail_regular: a held police_station fills the blank, with no model repair', async () => {
      const id = await ledger(baseFacts());
      mockModel(answer(body().replace(P3_, PS_BLANK)));
      const res = await post(id);
      const done = events(res.text, 'done');
      expect(done).toHaveLength(1);
      const saved = await savedContent(done[0].docId);
      expect(saved).toContain('produced by PS Kotwali, is in judicial custody');
      expect(saved).not.toMatch(/\{\{MISSING: Police Station/);
      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    });

    it('two police stations held: one repair, still blank, withheld with fact_needed, no Ink taken', async () => {
      const id = await ledger([
        ...baseFacts(),
        fact('police_station', 'Sadar', { type: 'police_station' }),
      ]);
      mockModel(answer(body().replace(P3_, PS_BLANK)), `[[P2]]\n${PS_BLANK}`);
      const res = await post(id);
      const errs = events(res.text, 'error');
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({
        code: 'fact_needed',
        key: 'police_station',
        reason: 'One detail is needed before the draft: Police Station.',
      });
      expect(res.text).not.toContain('event: done');
      expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
        'failed',
      ]);
      await expectNoInkTaken();
    });
  });

  it('a blank for a fact the ledger does NOT hold is delivered as a blank', async () => {
    const id = await ledger(baseFacts());
    mockModel(
      answer(
        body().replace(P3_, '3. That the applicant works as {{MISSING: Applicant occupation}}.'),
      ),
    );
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(await savedContent(done[0].docId)).toContain('{{MISSING: Applicant occupation}}');
    // and the editor's GET serves it as the signed blank
    const got = await request(app).get(`/${done[0].docId}`).set(headers());
    expect(got.status).toBe(200);
    expect(got.body.content).toContain('[To be confirmed: Applicant occupation]');
    expect(got.body.content).not.toContain('{{MISSING');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P1 through the route
// ═════════════════════════════════════════════════════════════════════════════
describe('P1: a held value under another label is repaired once, then the advocate is asked', () => {
  const DATE = '12 March 2026';
  const WRONG = `2. That FIR No. 412/2026 dated ${DATE} was registered at PS Kotwali.`;
  const withArrest = () => [
    ...baseFacts(),
    fact('arrest_date', DATE, { type: 'date', value: '2026-03-12' }),
  ];
  const ARREST_LABEL = CHECKLIST.find((i) => i.key === 'arrest_date')!.label;
  const FIR_DATE_LABEL = CHECKLIST.find((i) => i.key === 'fir_date')!.label;

  it('still conflicting after the repair: fact_conflict with the signed question; no token, no Ink, no log of the value', async () => {
    const id = await ledger(withArrest());
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    mockModel(answer(body().replace(P2_, WRONG)), `[[P1]]\n${WRONG}`);
    const res = await post(id);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    // the repair request names both labels
    const repairPrompt = callOf(1).user;
    expect(repairPrompt).toContain(FIR_DATE_LABEL);
    expect(repairPrompt).toContain(ARREST_LABEL);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'fact_conflict', retryable: false });
    expect(errs[0].reason).toBe(
      `The draft gives ${DATE} as the ${FIR_DATE_LABEL}, but your facts give it as the ${ARREST_LABEL}. Which is right?`,
    );
    expect(errs[0].conflict).toMatchObject({ keyA: 'fir_date', keyB: 'arrest_date' });
    expect(res.text).not.toContain('event: done');
    expect(res.text).not.toMatch(/\{\{MISSING/);
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    await expectNoInkTaken();
    // value only to the advocate: it is in no log call
    const logged = logs
      .flatMap((s) => s.mock.calls)
      .map((c) => c.map(String).join(' '))
      .join('\n');
    expect(logged).not.toContain(DATE);
    expect(logged).not.toContain('Which is right');
  });

  it('a repair that gives the date under its own label delivers the draft', async () => {
    const id = await ledger(withArrest());
    const fixed = '2. That FIR No. 412/2026 dated 10 March 2026 was registered at PS Kotwali.';
    mockModel(answer(body().replace(P2_, WRONG)), `[[P1]]\n${fixed}`);
    const res = await post(id);
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    const saved = await savedContent(done[0].docId);
    expect(saved).toContain('dated 10 March 2026');
    expect(saved).not.toMatch(/\{\{MISSING/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase A: GET /documents/:id never serves a raw token
// ═════════════════════════════════════════════════════════════════════════════
describe('Phase A: GET /documents/:id serves [To be confirmed: x] for stored raw tokens', () => {
  const RAW =
    '1. That the cheque is for {{MISSING: Amount in Words}}.\n\n2. That it is dated {{missing: Cheque Date}} and the sale deed is dated {{MISSING:  Sale deed date }}.';

  async function seed(over: Record<string, unknown>) {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Regression',
      docType: DOC_TYPES.PETITION,
      generatedContent: encrypt('1. generated'),
      status: 'draft',
      ...over,
    });
    return String(doc._id);
  }

  it('generatedContent (no finalContent)', async () => {
    const id = await seed({ generatedContent: encrypt(RAW) });
    const res = await request(app).get(`/${id}`).set(headers());
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('[To be confirmed: Amount in Words]');
    expect(res.body.content).toContain('[To be confirmed: Cheque Date]');
    expect(res.body.content).toContain('[To be confirmed: Sale deed date]');
    expect(res.body.content).not.toMatch(/\{\{\s*MISSING/i);
    expect(JSON.stringify(res.body)).not.toMatch(/\{\{\s*MISSING/i);
  });

  it('finalContent (the saved edit) is served the same way and wins over generatedContent', async () => {
    const id = await seed({
      generatedContent: encrypt('{{MISSING: Old}}'),
      finalContent: encrypt(RAW),
    });
    const res = await request(app).get(`/${id}`).set(headers());
    expect(res.body.content).toContain('[To be confirmed: Amount in Words]');
    expect(res.body.content).not.toContain('Old');
    expect(res.body.content).not.toMatch(/\{\{\s*MISSING/i);
  });

  it('the stored text is untouched: only what is served changes', async () => {
    const id = await seed({ generatedContent: encrypt(RAW) });
    await request(app).get(`/${id}`).set(headers());
    expect(await savedContent(id)).toBe(RAW);
  });

  it('a draft with no token is served byte for byte', async () => {
    const plain = '1. That all is well. [To be confirmed: Cheque Date]';
    const id = await seed({ generatedContent: encrypt(plain) });
    const res = await request(app).get(`/${id}`).set(headers());
    expect(res.body.content).toBe(plain);
  });
});
