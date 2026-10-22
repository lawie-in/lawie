/**
 * T-372 — route level: POST /generate-from-brief (the route OneFlow uses) with a successful settle
 * ends with an SSE `done` event that carries balance.totalInk, the user's Ink after the charge.
 * Real route (supertest + in-memory Mongo), stubbed model. withInkHold itself is covered in
 * t372-done-balance.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { costForTemplate, getCreditBalance } from '../services/credits.service';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const USER_ID = '507f1f77bcf86cd799439085';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

const headers = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const PACK = loadRulePack('bail_regular') as NonNullable<ReturnType<typeof loadRulePack>>;
const FIRST_GROUND =
  buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')?.options[0] ?? '';
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
const BODY = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and no earlier bail application has been filed.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');
const BRIEF_ANSWER = `${BODY}\n\n${CLAUSES_MARKER}\n${PACK.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n')}`;

function blocks(text: string) {
  return text.split('\n\n').filter((b) => b.length > 0);
}

function event(text: string, name: string): Record<string, unknown> | null {
  const found = blocks(text).filter((b) => b.startsWith(`event: ${name}\n`));
  if (found.length === 0) return null;
  return JSON.parse(found[found.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}

beforeEach(async () => {
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
  mockMessagesStream.mockReset();
});

describe('POST /generate-from-brief done balance', () => {
  it('carries balance.totalInk equal to the user balance after the charge', async () => {
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () => sdkAnswer(BRIEF_ANSWER, 4000, 800));
    const before = (await getCreditBalance(USER_ID)).totalInk;
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });

    expect(res.status).toBe(200);
    const done = event(res.text, 'done');
    expect(done).not.toBeNull();
    const after = (await getCreditBalance(USER_ID)).totalInk;
    const cost = costForTemplate('bail_regular') as number;
    expect(after).toBe(before - cost);
    expect(done?.balance).toEqual({ totalInk: after });
    // T-545: the Ink actually settled, flat on done (not under cost), equal to the charge
    expect(done?.inkDebited).toBe(cost);
    expect(done?.inkDebited).toBe(before - after);
    expect(done).not.toHaveProperty('cost');
    // the existing done fields are still there
    expect(typeof done?.docId).toBe('string');
    expect(done?.rulePack).toBe(true);
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen?.status).toBe('completed');
  });
});
