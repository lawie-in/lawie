/**
 * T-567 item 41 (Ajay AJ-539-M2, Arjun option 1): every server failure before `done` shows
 * only "The draft did not finish."; the server detail is logged, never sent; no emitter says
 * the Ink was released (inkReleased is never true); the pre-stream 500 is the route's generic
 * body, not the raw error message. Driven through the real routes with a failing model stub.
 */
import './setupDb';
import type { Response } from 'express';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994392c1';
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
  /** How a retry finds the failed attempt it continues (resolveRun's match). */
  match: { templateId: string } | { docType: string };
  docType: string;
  body: (extra?: Record<string, unknown>) => Record<string, unknown>;
  answer: string;
  /** The ai.service function the route calls (for a plain-Error throw). */
  pipeline: 'streamGenerateFromTemplate' | 'streamGenerateFromBrief' | 'streamGenerateGuided';
}

const PATHS: GenPath[] = [
  {
    name: 'template',
    url: '/generate-from-template',
    priceId: 'bail_regular',
    match: { templateId: 'bail_regular' },
    docType: 'bail_application',
    body: (extra = {}) => ({ template_id: 'bail_regular', form_data: BAIL_FORM_DATA, ...extra }),
    answer: '1. Applicant seeks bail.',
    pipeline: 'streamGenerateFromTemplate',
  },
  {
    name: 'brief (rule pack)',
    url: '/generate-from-brief',
    priceId: 'bail_regular',
    match: { templateId: 'bail_regular' },
    docType: 'bail_application',
    body: (extra = {}) => ({ kind: 'bail_regular', values: PACK_VALUES, court: COURT, ...extra }),
    answer: PACK_ANSWER,
    pipeline: 'streamGenerateFromBrief',
  },
  {
    name: 'brief (guided, no rule pack)',
    url: '/generate-from-brief',
    priceId: 'guided',
    match: { templateId: 'guided' },
    docType: 'guided',
    body: (extra = {}) => ({
      kind: 'none',
      kind_name: 'consent letter for use of premises',
      values: LETTER_VALUES,
      ...extra,
    }),
    answer: LETTER,
    pipeline: 'streamGenerateGuided',
  },
];

function post(p: GenPath, extra: Record<string, unknown> = {}) {
  return request(app).post(p.url).set(headers()).send(p.body(extra));
}

beforeEach(async () => {
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

const SIGNED = 'The draft did not finish.';
const BANNED = [
  'No Ink was used',
  'inputs are saved',
  'brief is kept',
  'Try shortening',
  'founder must set',
  'contact support',
  'rate-limited',
  'ai.drafting_model',
  'admin/ai-config',
];

function errorEvents(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('event: error\n'))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}

function failingModel(err: () => Error) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async () => {
    throw err();
  });
}

const FAILURES: Array<[string, () => Error]> = [
  ['a 503', () => new Error('503 service unavailable')],
  ['a rate limit', () => new Error('Rate limit exceeded, slow down')],
  ['a network drop', () => new Error('socket hang up')],
  ['an unknown error', () => new Error('secret-config-detail something odd')],
];

describe.each(PATHS)('T-567 item 41 - $name', (p) => {
  it.each(FAILURES)(
    '%s: error event is the signed text, no inkReleased, no banned text',
    async (_n, mk) => {
      failingModel(mk);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await post(p);
      const events = errorEvents(res.text);
      expect(events.length).toBeGreaterThanOrEqual(1);
      for (const e of events) {
        expect(e.reason).toBe(SIGNED);
        expect(e.inkReleased).not.toBe(true);
        expect(typeof e.code).toBe('string');
        expect(typeof e.retryable).toBe('boolean');
      }
      for (const b of BANNED) expect(res.text).not.toContain(b);
      expect(res.text).not.toContain('secret-config-detail');
      expect(res.text).not.toContain('503 service');
      expect(res.text).not.toContain('socket hang up');
      expect(res.text).not.toContain('event: done');
    },
  );

  it('a plain Error thrown by the pipeline: no raw message anywhere in the response, present in the log', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(aiService, p.pipeline)
      .mockRejectedValueOnce(new Error('secret-driver-text sk-ant-FAKE internal path /srv/x'));
    const res = await post(p);
    expect(res.text).not.toContain('secret-driver-text');
    expect(res.text).not.toContain('sk-ant-FAKE');
    for (const e of errorEvents(res.text)) {
      expect(e.reason).toBe(SIGNED);
      expect(e.code).toBe('unknown');
      expect(e.inkReleased).not.toBe(true);
    }
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Generation failed' });
    expect(res.text).not.toContain('message');
    if (p.url === '/generate-from-template') {
      // The form path logs the raw message (server side only).
      expect(errSpy.mock.calls.flat().map(String).join(' ')).toContain('secret-driver-text');
    }
  });

  it('a plain Error after the stream has started: SSE error is the signed text, code unknown, no inkReleased, raw message only in the log', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(aiService, p.pipeline).mockImplementationOnce((async (
      _input: unknown,
      res: Response,
    ) => {
      res.write('data: {"text":"1. "}\n\n'); // headers are now sent
      throw new Error('secret-driver-text sk-ant-FAKE');
    }) as never);
    const res = await post(p);
    expect(res.status).toBe(200);
    const events = errorEvents(res.text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: SIGNED, code: 'unknown', retryable: true });
    expect(events[0].inkReleased).not.toBe(true);
    expect(res.text).not.toContain('secret-driver-text');
    expect(res.text).not.toContain('sk-ant-FAKE');
    for (const b of BANNED) expect(res.text).not.toContain(b);
    if (p.url === '/generate-from-template') {
      expect(errSpy.mock.calls.flat().map(String).join(' ')).toContain('secret-driver-text');
    }
  });
});
