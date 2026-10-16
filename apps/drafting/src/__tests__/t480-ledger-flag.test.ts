/**
 * T-480 step 2 — which drafting path ran is recorded as `ledger: 'on' | 'off'`
 * on the Generation row and in the SSE done event of POST /generate-from-brief.
 *
 * Additive: the flag is only a record. Every model answer is a fixture (the
 * Anthropic SDK stub); the setup mirrors t147c-drafter-contract.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390b1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const CHECKLIST = buildChecklist(PACK);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

// Sentinels carried in the brief and ledger fixtures (as in t147c).
const SENT_BRIEF = 'SENTBRIEFxq91';
const SENT_SPAN = 'SENTSPANxq93';
const SENT_VALUE = 'SENTVALUExq94';

const VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    value: `The applicant was wrongly named in the FIR and falsely implicated. ${SENT_BRIEF}`,
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const BODY = [
  "1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.",
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');

function report(overrides: Record<string, string> = {}): string {
  return CLAUSE_IDS.map((id) => `${id}: ${overrides[id] ?? '1'}`).join('\n');
}
function drafterAnswer(body = BODY, overrides: Record<string, string> = {}): string {
  return `${body}\n\n${CLAUSES_MARKER}\n${report(overrides)}`;
}
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 4000, 800));
  return mockMessagesStream;
}
function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}
function post(body: Record<string, unknown>, userId = USER_ID) {
  return request(app).post('/generate-from-brief').set(headers(userId)).send(body);
}

// ── ledger fixtures ──────────────────────────────────────────────────────────
function fact(
  key: string,
  display: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `f_${key}`,
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

/** Every required fact of a regular bail application the checklist asks for. */
function baseFacts(): Array<Record<string, unknown>> {
  return [
    fact('applicant_name', 'Ram Kumar', { type: 'person_name', raw_span: `Ram ${SENT_SPAN}` }),
    fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
    fact('applicant_age', '32'),
    fact('address', '123 Main St, Patna', { type: 'place_name', value: SENT_VALUE }),
    fact('fir_number', '124/2026', { type: 'case_number' }),
    fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
    fact('police_station', 'Kotwali', { type: 'police_station' }),
    fact('currently_in_custody', 'Judicial custody'),
    fact('facts_narrative', 'He was wrongly named in the FIR.'),
  ];
}

async function ledger(
  facts: Array<Record<string, unknown>>,
  opts: { userId?: string; kind?: string; unresolved?: Array<Record<string, unknown>> } = {},
): Promise<string> {
  const doc = await FactLedgerModel.create({
    userId: opts.userId ?? USER_ID,
    documentKind: opts.kind ?? 'bail_regular',
    runType: 'fixture',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        facts,
        unresolved: opts.unresolved ?? [],
        createdAt: new Date(),
        reason: 'extract',
      },
    ],
  });
  return String(doc._id);
}

function draft(ledgerId: string | undefined, extra: Record<string, unknown> = {}) {
  return post({
    kind: 'bail_regular',
    values: VALUES,
    court,
    ...(ledgerId ? { ledger_id: ledgerId } : {}),
    ...extra,
  });
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
  for (const id of [USER_ID]) {
    await User.create({
      _id: id,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  }
});
afterEach(() => {
  jest.restoreAllMocks();
});

const rowOf = async () => (await Generation.find({ userId: USER_ID }).lean())[0];

describe("T-480: the done event and the Generation row record the path as ledger 'on' | 'off'", () => {
  it("(a) with a ledger_id and the switch on: done.ledger and the row's ledger are 'on'", async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    const res = await draft(id);
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.ledger).toBe('on');
    const rows = await Generation.find({ userId: USER_ID }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].ledger).toBe('on');
  });

  it("(b) without a ledger_id: done.ledger and the row's ledger are 'off'", async () => {
    mockModel(drafterAnswer());
    const res = await draft(undefined);
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.ledger).toBe('off');
    expect((await rowOf()).ledger).toBe('off');
  });

  it("(b2) with a ledger_id but the switch off: the old path ran, so 'off' on both", async () => {
    const id = await ledger(baseFacts());
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(drafterAnswer());
    const res = await draft(id);
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.ledger).toBe('off');
    expect((await rowOf()).ledger).toBe('off');
  });
});

describe('T-480: the Generation schema for the ledger field', () => {
  const ledgerError = (v?: unknown) => {
    const doc = new Generation(v === undefined ? {} : { ledger: v });
    return doc.validateSync()?.errors?.ledger;
  };

  it('accepts a row with no ledger (rows written before T-480)', () => {
    expect(ledgerError()).toBeUndefined();
    expect(new Generation({}).ledger).toBeUndefined();
  });

  it.each(['on', 'off'])("accepts '%s'", (v) => {
    expect(ledgerError(v)).toBeUndefined();
  });

  it.each(['ON', 'yes', 'true', ''])('rejects %j', (v) => {
    expect(ledgerError(v)).toBeDefined();
  });

  it('rejects a boolean-looking non-string value that is not on/off', () => {
    expect(ledgerError({ x: 1 })).toBeDefined();
  });
});
