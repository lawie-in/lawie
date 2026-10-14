/**
 * T-423 - the brief seal (generate-from-brief, formInputsEnc).
 *
 * AC1: state is the Court row's display name ("Bihar"), not the picker id ("bihar"),
 *      and the Memo prints "State of Bihar".
 * AC2: only values the brief accepted (buildBrief items) are sealed, never raw request values.
 *
 * Same setup as t381-brief-party-fields.test.ts (B and C): Puppeteer mocked and
 * capturing the HTML, the model a fixture.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { storesState } from '../services/brief-party-fields';
import { loadRulePack } from '../services/rule-pack.service';
import { readFormInputs } from '../utils/case-details';
import { sdkAnswer } from './sdkStream';

// ── B, C, D: routes ─────────────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994393a1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-email': 'test@test.com',
    'x-user-id': userId,
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

interface MockPage {
  setContent: jest.Mock;
  pdf: jest.Mock;
}

let html = '';
let page: MockPage;

beforeEach(async () => {
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  page = (await (await puppeteer.launch()).newPage()) as MockPage;
  page.setContent.mockReset();
  page.pdf.mockReset();
  html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  page.pdf.mockResolvedValue(Buffer.from('%PDF'));

  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.template_civil_plaint', value: 'on' });
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

const rawDocs = () => mongoose.connection.db!.collection('documents');

/** The model's answer for a pack: a numbered body and the clause report. */
function drafterAnswer(packId: string, body: string): string {
  const ids = loadRulePack(packId)!.mandatoryClauses.map((c) => c.id);
  return `${body}\n\n${CLAUSES_MARKER}\n${ids.map((id) => `${id}: 1`).join('\n')}`;
}

const BAIL_VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'facts_narrative', value: 'A private narrative about the incident.' },
];
const BAIL_BODY = [
  '1. That the applicant Ram Kumar is a law-abiding citizen.',
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
].join('\n\n');

const PLAINT_VALUES = [
  { key: 'plaintiff_name', value: 'Jai Mehta' },
  { key: 'plaintiff_father_name', value: 'Shri Mehta Senior' },
  { key: 'plaintiff_age', value: '44' },
  { key: 'plaintiff_address', value: '12 Lake Road, Patna' },
  { key: 'defendant_name', value: 'Kiran Bose' },
  { key: 'defendant_address', value: '7 Hill Street, Gaya' },
  { key: 'principal_amount', value: '500000' },
  { key: 'address', value: 'GENERIC ADDRESS NOT FOR THE PLAINTIFF' },
];
const PLAINT_BODY = [
  '1. That the plaintiff Jai Mehta seeks recovery of the money from the defendant.',
  '2. That the cause of action arose within the jurisdiction of this Court.',
].join('\n\n');

async function generateFromBrief(
  kind: string,
  values: unknown[],
  body: string,
  court: Record<string, string> = COURT,
): Promise<string> {
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(drafterAnswer(kind, body), 4000, 800));
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind, values, court, paragraphs: 12 });
  expect(`${res.status} ${res.text.slice(0, 300)}`).toMatch(/^200 /);
  const block = res.text
    .split('\n\n')
    .filter((b) => b.startsWith('event: done\n'))
    .pop()!;
  return (JSON.parse(block.split('\ndata: ')[1]) as { docId: string }).docId;
}

const packPost = (id: string) => request(app).post(`/${id}/annexures-pack`).set(headers());

/** The HTML of the Memo of Parties (Annexure A). */
function memo(): string {
  const from = html.indexOf('<div class="annexure-label">ANNEXURE A</div>');
  expect(from).toBeGreaterThanOrEqual(0);
  return html.slice(from, html.indexOf('<div class="annexure-label">ANNEXURE B</div>', from));
}

async function sealed(docId: string) {
  const row = (await rawDocs().findOne({ _id: new mongoose.Types.ObjectId(docId) }))!;
  return readFormInputs(row as never)!;
}

describe('T-423 AC1: the sealed state is the display name', () => {
  it('bail_regular (a State row): state is "Bihar", not the picker id, and the Memo prints State of Bihar', async () => {
    expect(storesState('bail_regular')).toBe(true);
    const docId = await generateFromBrief('bail_regular', BAIL_VALUES, BAIL_BODY);
    const inputs = await sealed(docId);
    expect(inputs.state).toBe('Bihar');
    expect(inputs.state).not.toBe('bihar');

    const res = await packPost(docId);
    expect(res.status).toBe(200);
    expect(memo()).toContain('State of Bihar, through the concerned authority');
    expect(memo()).not.toContain('State of bihar');
  });

  it('plaint_recovery (storesState false): no state is sealed', async () => {
    expect(storesState('plaint_recovery')).toBe(false);
    const docId = await generateFromBrief('plaint_recovery', PLAINT_VALUES, PLAINT_BODY);
    expect(await sealed(docId)).not.toHaveProperty('state');
  });

  it('a Court row with no state: nothing is written, not the picker id', async () => {
    // The route reads the Court row by the court id the request names. A row with
    // no state name leaves courtData.state empty.
    await mongoose.connection
      .db!.collection('courts')
      .updateOne({ courtId: COURT_ID }, { $unset: { state: '' } });
    const docId = await generateFromBrief('bail_regular', BAIL_VALUES, BAIL_BODY);
    const inputs = await sealed(docId);
    expect(inputs).not.toHaveProperty('state');
    expect(inputs.court_type).toBe('sessions');
  });
});

describe('T-423 AC2: only values the brief accepted are sealed', () => {
  it('a raw party value that is not a brief item is not sealed; accepted items are', async () => {
    const docId = await generateFromBrief(
      'bail_regular',
      [
        ...BAIL_VALUES,
        { key: 'client_role', value: 'respondent' },
        { key: 'opposite_party_name', value: 'RAW OPPOSITE PARTY' },
        { key: 'respondent_name', value: 'RAW RESPONDENT' },
      ],
      BAIL_BODY,
    );
    const inputs = await sealed(docId);
    expect(inputs).toMatchObject({
      applicant_name: 'Ram Kumar',
      father_name: 'Shri Hari Kumar',
      applicant_age: '32',
      address: '123 Main St, Patna',
    });
    expect(inputs).not.toHaveProperty('client_role');
    expect(inputs).not.toHaveProperty('opposite_party_name');
    expect(inputs).not.toHaveProperty('respondent_name');
    expect(JSON.stringify(inputs)).not.toContain('RAW');
  });

  it('a plaint: the accepted defendant is sealed; a raw respondent_name is not', async () => {
    const docId = await generateFromBrief(
      'plaint_recovery',
      [...PLAINT_VALUES, { key: 'respondent_name', value: 'RAW RESPONDENT' }],
      PLAINT_BODY,
    );
    const inputs = await sealed(docId);
    expect(inputs).toMatchObject({ defendant_name: 'Kiran Bose', plaintiff_name: 'Jai Mehta' });
    expect(JSON.stringify(inputs)).not.toContain('RAW');
  });

  it('a value the brief rejects (an age that fails the check) is not sealed', async () => {
    const docId = await generateFromBrief(
      'bail_regular',
      BAIL_VALUES.map((v) => (v.key === 'applicant_age' ? { ...v, value: 'RAW-NOT-AN-AGE' } : v)),
      BAIL_BODY,
    );
    const inputs = await sealed(docId);
    expect(inputs).not.toHaveProperty('applicant_age');
    expect(JSON.stringify(inputs)).not.toContain('RAW');
    expect(inputs.applicant_name).toBe('Ram Kumar');
  });
});
