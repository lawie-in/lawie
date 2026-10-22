/**
 * T-388 AC2 (server side) - the Ink cost shown is the Ink cost charged.
 *
 * For each of the three charging paths (POST /generate-from-template, POST /generate-from-brief
 * with a rule pack and with none; the legacy POST /generate is 410 since T-443) the amount held (holdInk's
 * costCredits), the amount the ledger then charges, and the number GET /template-configs shows the
 * web (credits_cost, guided_credits_cost) all come from costForTemplate. An id with no price is
 * refused before any hold. Fixtures follow t226-ink-holds.routes.test.ts; the model is the SDK stub.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import * as credits from '../services/credits.service';
import { costForTemplate } from '../services/credits.service';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import * as engine from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439388';
const OID = new mongoose.Types.ObjectId(USER_ID);
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

// ── Request bodies, one per generate path ───────────────────────────────────

const BAIL_FORM_DATA = {
  fir_number: '124/2026',
  fir_date: '2026-03-15',
  police_station: 'Kotwali, Patna',
  sections_charged: ['103'],
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  state: 'bihar',
  court_type: 'sessions',
  court_name: 'district_sessions_patna',
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St',
  language: 'en',
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];
const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
const PACK_VALUES = [
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
const PACK_BODY = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and no earlier bail application has been filed.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');
const PACK_ANSWER = `${PACK_BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;

const LETTER_VALUES = [
  { key: 'fixed.first_party', value: 'Sunita Devi', source: 'description', quote: 'Sunita Devi' },
  { key: 'fixed.other_party', value: 'Patna Municipal Corporation' },
  {
    key: 'fixed.facts',
    value: 'She owns shop no. 12 at Boring Road and wants to let it be used as a clinic.',
  },
  { key: 'fixed.relief', value: 'Consent to use the shop as a clinic.' },
];
const LETTER = [
  'Date: [To be confirmed: date]',
  'From:\nSunita Devi',
  'To:\nPatna Municipal Corporation',
  'Subject: Consent for use of premises',
  '1. That I, Sunita Devi, own shop no. 12 at Boring Road.',
  '2. That I consent to the shop being used as a clinic.',
  'Yours faithfully,\nSunita Devi',
].join('\n\n');

interface GenPath {
  name: string;
  url: string;
  /** The id the cost is priced under (enforceCredits). */
  priceId: string;
  body: (extra?: Record<string, unknown>) => Record<string, unknown>;
  answer: string;
}

const PATHS: GenPath[] = [
  {
    name: 'template',
    url: '/generate-from-template',
    priceId: 'bail_regular',
    body: (extra = {}) => ({ template_id: 'bail_regular', form_data: BAIL_FORM_DATA, ...extra }),
    answer: '1. Applicant seeks bail.',
  },
  {
    name: 'brief (rule pack)',
    url: '/generate-from-brief',
    priceId: 'bail_regular',
    body: (extra = {}) => ({ kind: 'bail_regular', values: PACK_VALUES, court: COURT, ...extra }),
    answer: PACK_ANSWER,
  },
  {
    name: 'brief (guided, no rule pack)',
    url: '/generate-from-brief',
    priceId: 'guided',
    body: (extra = {}) => ({
      kind: 'none',
      kind_name: 'consent letter for use of premises',
      values: LETTER_VALUES,
      ...extra,
    }),
    answer: LETTER,
  },
];

/** The number the web is shown for this path: GET /template-configs. */
async function shownCost(p: GenPath): Promise<number | undefined> {
  const res = await request(app).get('/template-configs').set(headers());
  expect(res.status).toBe(200);
  if (p.priceId === 'guided') return res.body.guided_credits_cost;
  const row = (res.body.templates as Array<{ template_id: string; credits_cost?: number }>).find(
    (t) => t.template_id === p.priceId,
  );
  return row?.credits_cost;
}

async function ledgerInk(): Promise<number> {
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
  // The ledger is in storage units: 1 Ink = 2 units.
  return rows.reduce((sum, r) => sum - (r.delta as number), 0) / 2;
}

async function inkLeft(): Promise<number> {
  const u = (await User.collection.findOne({ _id: OID })) as unknown as {
    inkSub: number;
    inkAnnualCarry: number;
    inkTopup: number;
  };
  return (u.inkSub + u.inkAnnualCarry + u.inkTopup) / 2;
}

const START_UNITS = 2000;
const START = START_UNITS / 2; // Ink

beforeEach(async () => {
  engine.clearConfigCache();
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
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
  jest.restoreAllMocks();
});

describe.each(PATHS)('T-388 AC2 - shown equals charged: $name', (p) => {
  it('holds costForTemplate(id), charges the same, and the list shows the same number', async () => {
    const expected = costForTemplate(p.priceId);
    expect(typeof expected).toBe('number');
    const holdSpy = jest.spyOn(credits, 'holdInk'); // calls through

    mockMessagesStream.mockImplementation(async () => sdkAnswer(p.answer, 1000, 200));
    const res = await request(app).post(p.url).set(headers()).send(p.body());
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    // T-545: the done event reports the settled Ink: the same number as held, charged and shown
    const doneBlock = res.text.split('\n\n').find((b) => b.startsWith('event: done\n')) ?? '';
    const done = JSON.parse(doneBlock.split('\ndata: ')[1]) as Record<string, unknown>;
    expect(done.inkDebited).toBe(expected);

    // held
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(holdSpy.mock.calls[0][0].costCredits).toBe(expected);
    // charged
    expect(await ledgerInk()).toBe(expected);
    expect(START - (await inkLeft())).toBe(expected);
    // shown (the web reads this)
    expect(await shownCost(p)).toBe(expected);
    expect(await shownCost(p)).toBe(holdSpy.mock.calls[0][0].costCredits);
  });

  it('an id with no price is refused before any hold: nothing held, no model call, no Ink spent', async () => {
    const real = credits.costForTemplate;
    jest
      .spyOn(credits, 'costForTemplate')
      .mockImplementation((id: string) => (id === p.priceId ? undefined : real(id)));
    const holdSpy = jest.spyOn(credits, 'holdInk');
    mockMessagesStream.mockImplementation(async () => sdkAnswer(p.answer, 1000, 200));

    const res = await request(app).post(p.url).set(headers()).send(p.body());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).not.toContain('event: done');
    expect(holdSpy).not.toHaveBeenCalled();
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await inkLeft()).toBe(START);
    expect(await ledgerInk()).toBe(0);
  });

  it('the list leaves the number out for the same unpriced id, so the web blocks rather than guesses', async () => {
    const real = credits.costForTemplate;
    jest
      .spyOn(credits, 'costForTemplate')
      .mockImplementation((id: string) => (id === p.priceId ? undefined : real(id)));
    expect(await shownCost(p)).toBeUndefined();
  });
});
