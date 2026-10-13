/**
 * T-197 — the signed disclaimer goes with every finished draft, banner or not.
 *
 * Acceptance criteria covered here: AC3 (exact text, one constant) and AC5
 * (the API carries the disclaimer even when `factCheck` is absent). AC1, AC2,
 * AC4 are web behaviour and are checked by hand (apps/web has no tests).
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { FACT_CHECK_DISCLAIMER } from '../services/fact-verifier';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { encrypt } from '../utils/encryption';
import { sdkAnswer } from './sdkStream';

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const EXACT =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390c7';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

const VALUES = [
  {
    key: 'applicant_name',
    value: 'Ram Kumar',
    source: 'description',
    quote: 'My client Ram Kumar',
  },
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
    value:
      'The applicant was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

// Ledger off: the same body the brief route test uses for a draft that passes.
const BODY_PLAIN = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');

// Ledger on: a clean body, and one with a banned phrase that the repair cannot fix.
const BODY_CLEAN = [
  "1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.",
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');
const BODY_BAD = BODY_CLEAN.replace(
  'has approached',
  'is a law-abiding citizen and has approached',
);

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

const answer = (body: string) =>
  `${body}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;

function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  return blocks.length === 0 ? null : JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}

function fact(key: string, display: string, extra: Record<string, unknown> = {}) {
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
const baseFacts = () => [
  fact('applicant_name', 'Ram Kumar', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '124/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];
async function seedLedger() {
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: 'bail_regular',
    runType: 'user',
    currentVersion: 1,
    versions: [
      { version: 1, facts: baseFacts(), unresolved: [], createdAt: new Date(), reason: 'extract' },
    ],
  });
  return String(doc._id);
}

function postBrief(extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: VALUES, court, ...extra });
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
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
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-197 AC3: the text', () => {
  it('the one constant is exactly the signed sentence', () => {
    expect(FACT_CHECK_DISCLAIMER).toBe(EXACT);
  });
});

describe('T-197 AC5: POST /generate-from-brief', () => {
  it('a clean draft with the ledger off has no factCheck and still carries the disclaimer', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BODY_PLAIN), 4000, 800));
    const res = await postBrief({ paragraphs: 12 });
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done).toBeTruthy();
    expect(done.factCheck).toBeUndefined();
    expect(done.disclaimer).toBe(FACT_CHECK_DISCLAIMER);
    expect(done.disclaimer).toBe(EXACT);
  });

  it('ledger on, nothing to check: factCheck.banner is null and the top-level disclaimer is present', async () => {
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    const id = await seedLedger();
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BODY_CLEAN), 4000, 800));
    const res = await postBrief({ ledger_id: id });
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done.factCheck).toEqual({ banner: null });
    expect(done.disclaimer).toBe(EXACT);
  });

  it('ledger on, banner showing: the top-level disclaimer is present and the banner keeps its own', async () => {
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    const id = await seedLedger();
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(answer(BODY_BAD), 4000, 800))
      .mockResolvedValueOnce(sdkAnswer('Sorry, no.', 100, 10));
    const res = await postBrief({ ledger_id: id });
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done.factCheck.banner).toBeTruthy();
    expect(done.factCheck.banner.disclaimer).toBe(FACT_CHECK_DISCLAIMER);
    expect(done.disclaimer).toBe(EXACT);
  });
});

describe('T-197 AC5: the other finished-draft routes', () => {
  it('POST /generate-from-template done carries the disclaimer', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({
        template_id: 'bail_regular',
        form_data: {
          fir_number: '124/2026',
          fir_date: '2026-03-15',
          police_station: 'Kotwali, Patna',
          sections_charged: ['103'],
          currently_in_custody: 'yes_judicial',
          custody_since: '2026-03-15',
          state: 'bihar',
          court_type: 'sessions',
          court_name: COURT_ID,
          applicant_name: 'Ram Kumar',
          father_name: 'Shri Hari Kumar',
          applicant_age: '32',
          address: '123 Main St',
          language: 'en',
          facts_narrative:
            'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.disclaimer).toBe(EXACT);
  });

  it('legacy POST /generate done carries the disclaimer', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. The petitioner submits.', 400, 80));
    const res = await request(app).post('/generate').set(headers()).send({
      docType: 'petition',
      courtName: 'Patna High Court',
      courtType: 'high_court',
      keyFacts: 'The petitioner was denied a ration card without reason.',
      reliefPrayer: 'Issue the ration card.',
    });
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.disclaimer).toBe(EXACT);
  });
});

describe('T-197 AC2/AC5: GET /:id', () => {
  it('a saved document (no fact check of any kind) comes back with the disclaimer', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'T-197 doc',
      docType: 'bail_application',
      generatedContent: encrypt('Generated draft text.'),
    });
    const res = await request(app)
      .get(`/${String(doc._id)}`)
      .set(headers());
    expect(res.status).toBe(200);
    expect(res.body.disclaimer).toBe(EXACT);
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
