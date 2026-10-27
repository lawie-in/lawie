/**
 * T-637 (Arjun option B): POST /generate-from-brief with NO persisted ledger (feature.fact_ledger
 * off, no ledger_id), and one control with a persisted ledger.
 *
 * AC2  no text chunk streams on the no-ledger path; the body is in template_sections
 * AC8  flag off: a draft from Anushka's regular-bail matter is never delivered with a {{MISSING
 *      for a fact the brief holds: code fills it, or it is withheld with fact_needed
 * AC9  flag off: the Drafter's system and user prompt bytes are what the base code sends
 *      (exact snapshot of a fixed input; base buildDrafterUserPrompt / DRAFTER_PACK_SYSTEM_PROMPT
 *      are untouched by this change)
 * AC7  branch 1: with a persisted ledger the route behaves as before (T-611)
 *
 * The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';
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
import { decrypt } from '../utils/encryption';
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
const USER_ID = '507f1f77bcf86cd799439638';
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

const TEXT_CHUNK = /data: \{"text"/;
const ADDRESS_LABEL = CHECKLIST.find((i) => i.key === 'address')!.label;
const GROUNDS_LABEL = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.label;
const BLANK_PARA = `3. That the applicant, resident of {{MISSING: ${ADDRESS_LABEL}}}, is in judicial custody.`;
const GROUNDS_PARA = `3. That the applicant relies on {{MISSING: ${GROUNDS_LABEL}}}.`;

const postNoLedger = () =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: VALUES, court });
const postPersisted = (ledgerId: string) =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: ledgerId });
const sectionsText = (res: request.Response) =>
  JSON.stringify(events(res.text, 'template_sections')[0]);

describe('T-637 no-ledger brief route (feature.fact_ledger off, no ledger_id)', () => {
  it('a held fact left as {{MISSING: label}} is code-filled; never delivered as a token; no text chunk; no model repair', async () => {
    mockModel(answer(body().replace(P3_, BLANK_PARA)));
    const res = await postNoLedger();
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(res.text).not.toMatch(TEXT_CHUNK);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    const secs = sectionsText(res);
    expect(secs).toContain('resident of 123 Main St, Patna, is in judicial custody');
    expect(res.text).not.toMatch(/\{\{\s*MISSING/);
    expect(await savedContent(done[0].docId)).not.toMatch(/\{\{\s*MISSING/);
  });

  it('a held blank code cannot fill gets one repair; a repair that prints the value delivers', async () => {
    mockModel(
      answer(body().replace(P3_, GROUNDS_PARA)),
      '[[P2]]\n3. That the applicant relies on the ground of false implication.',
    );
    const res = await postNoLedger();
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(await savedContent(done[0].docId)).not.toMatch(/\{\{\s*MISSING/);
    expect(res.text).not.toMatch(TEXT_CHUNK);
  });

  it('still blank after the one repair: withheld with fact_needed and the signed line; no done, no document, failed row, Ink released', async () => {
    mockModel(answer(body().replace(P3_, GROUNDS_PARA)), `[[P2]]\n${GROUNDS_PARA}`);
    const res = await postNoLedger();
    const repairs = mockMessagesStream.mock.calls.filter((_c, i) =>
      callOf(i).user.includes('has a blank for'),
    );
    expect(repairs).toHaveLength(1);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'fact_needed',
      retryable: false,
      key: 'grounds_for_bail',
      reason: `One detail is needed before the draft: ${GROUNDS_LABEL}.`,
    });
    expect(res.text).not.toContain('event: done');
    expect(res.text).not.toMatch(TEXT_CHUNK);
    expect(res.text).not.toMatch(/\{\{\s*MISSING/);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'failed',
    ]);
    await expectNoInkTaken();
  });

  it('a blank for a fact the brief does NOT hold is delivered as a blank', async () => {
    mockModel(
      answer(
        body().replace(P3_, '3. That the applicant works as {{MISSING: Applicant occupation}}.'),
      ),
    );
    const res = await postNoLedger();
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(sectionsText(res)).toContain('{{MISSING: Applicant occupation}}');
  });

  it('AC9: the Drafter system and user prompt bytes are pinned (exact snapshot of a fixed input)', async () => {
    // The prompt carries today's date: fix the clock (only Date) so the pin does not drift.
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    jest.setSystemTime(new Date('2026-10-27T06:30:00Z'));
    mockModel(answer(body()));
    try {
      await postNoLedger();
    } finally {
      jest.useRealTimers();
    }
    const first = callOf(0);
    expect({ system: first.system, user: first.user }).toMatchSnapshot();
  });
});

describe('T-637 persisted-ledger brief route is unchanged (AC7, branch 1)', () => {
  it('with a persisted ledger: the T-611 fill delivers with the held value, no model repair', async () => {
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    _clearAppSettingsCache();
    const id = await ledger(baseFacts());
    mockModel(answer(body().replace(P3_, BLANK_PARA)));
    const res = await postPersisted(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    const saved = await savedContent(done[0].docId);
    expect(saved).toContain('resident of 123 Main St, Patna, is in judicial custody');
    expect(saved).not.toMatch(/\{\{\s*MISSING/);
  });
});
