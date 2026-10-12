/**
 * T-285 — Ajay's condition: the keep-alive line never reaches the draft text, the stored draft or
 * what the route returns. Real routes (supertest + in-memory Mongo), stubbed model that is slow
 * enough for the heartbeat to fire several times mid-generation. The 15 s interval is shortened
 * to 5 ms here (real timers: the Mongo memory server must not run on fake ones); the helper's
 * own timing is covered in t285-sse-keepalive.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Same helper, 5 ms beat instead of 15 s.
jest.mock('../utils/sse-keepalive', () => {
  const actual = jest.requireActual('../utils/sse-keepalive');
  return {
    ...actual,
    startSseKeepAlive: (res: unknown) => actual.startSseKeepAlive(res, 5),
  };
});

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439085';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const MODEL_DELAY_MS = 150;

const headers = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const PACK = loadRulePack('bail_regular')!;
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];
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

const TEMPLATE_FORM = {
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
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

/** The model takes a while to answer, so the heartbeat fires during generation. */
function slowAnswer(text: string) {
  mockMessagesStream.mockReset().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, MODEL_DELAY_MS));
    return sdkAnswer(text, 4000, 800);
  });
}

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

describe.each([
  {
    route: '/generate-from-brief',
    send: { kind: 'bail_regular', values: VALUES, court, paragraphs: 12 },
    answer: BRIEF_ANSWER,
  },
  {
    route: '/generate-from-template',
    send: { template_id: 'bail_regular', form_data: TEMPLATE_FORM },
    answer: BODY,
  },
])('POST $route with a heartbeat firing during generation', ({ route, send, answer }) => {
  it('streams ": keep-alive" comment lines, ends with done, and keep-alive is nowhere in the draft, the done payload or the saved document', async () => {
    slowAnswer(answer);
    const res = await request(app).post(route).set(headers).send(send);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');

    // the heartbeat did fire, more than once, as comment lines only
    const beats = res.text.split('\n').filter((l) => l.includes('keep-alive'));
    expect(beats.length).toBeGreaterThanOrEqual(2);
    expect(beats.every((l) => l === ': keep-alive')).toBe(true);
    const commentBlocks = blocks(res.text).filter((b) => b.includes('keep-alive'));
    expect(commentBlocks.every((b) => b === ': keep-alive')).toBe(true);

    // still ends with done, and no heartbeat after it
    const done = event(res.text, 'done');
    expect(done).not.toBeNull();
    const afterDone = res.text.slice(res.text.lastIndexOf('event: done'));
    expect(afterDone).not.toContain('keep-alive');

    // every event/data payload is clean
    for (const b of blocks(res.text)) {
      if (b === ': keep-alive') continue;
      expect(b).not.toContain('keep-alive');
    }
    expect(JSON.stringify(done)).not.toContain('keep-alive');

    // the text the browser assembles from the data events
    const streamed = blocks(res.text)
      .filter((b) => b.startsWith('data: '))
      .map((b) => (JSON.parse(b.slice(6)) as { text?: string }).text ?? '')
      .join('');
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed).not.toContain('keep-alive');

    // the saved document
    const doc = await LawieDocument.findById(done!.docId as string).lean();
    expect(doc).not.toBeNull();
    expect(decrypt(doc!.generatedContent)).not.toContain('keep-alive');
    expect(JSON.stringify({ ...doc, generatedContent: undefined, brief: undefined })).not.toContain(
      'keep-alive',
    );
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.status).toBe('completed');
  });
});
