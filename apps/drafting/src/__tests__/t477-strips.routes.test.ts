/**
 * T-477 (Priya granted the lines): POST /generate-from-template records how many echoed
 * "[only when: ...]" markers were stripped, as `onlyWhenStrips` (a count, never text).
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { sdkAnswer } from './sdkStream';
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439099';

function internalHeaders(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const VALID_BAIL_FORM_DATA = {
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

async function seedUser(userId: string) {
  await createVerifiedUser({
    _id: userId,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000, // 1000 Ink — far more than any one draft costs
  });
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  await AppSetting.create({
    key: 'ai.rates.claude-sonnet-4-5-20250929',
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await seedUser(USER_ID);
});

afterEach(() => {
  mockMessagesStream.mockReset();
  jest.restoreAllMocks();
});

describe('T-477: Generation.onlyWhenStrips', () => {
  const post = () =>
    request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });
  const latest = () => Generation.findOne({ userId: USER_ID }).sort({ createdAt: -1 }).lean();

  it.each([
    [1, '1. Applicant seeks bail [only when: the lender is outside India].'],
    [3, '1. A [only when: x] b [only when: y]\n\n2. C [only when: z] d.'],
  ])('a body that echoes %i marker(s): completed row has onlyWhenStrips %i', async (n, body) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(body, 1000, 200));
    const res = await post();
    expect(res.status).toBe(200);
    const gen = await latest();
    expect(gen!.status).toBe('completed');
    expect(gen!.onlyWhenStrips).toBe(n);
    // counts only: no marker text on the row or in the produced document
    expect(JSON.stringify(gen)).not.toMatch(/only when/i);
    const doc = await LawieDocument.findById(gen!.documentId).lean();
    expect(JSON.stringify(doc)).not.toMatch(/only when/i);
    const sections = res.text.split('\n\n').find((e) => e.startsWith('event: template_sections'))!;
    expect(sections).not.toMatch(/only when/i);
  });

  it('no marker: onlyWhenStrips is 0', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    await post();
    const gen = await latest();
    expect(gen!.status).toBe('completed');
    expect(gen!.onlyWhenStrips).toBe(0);
  });

  it('a failed row has no onlyWhenStrips field', async () => {
    mockMessagesStream.mockRejectedValue(new Error('503 service unavailable'));
    const res = await post();
    expect(res.text).toContain('event: error');
    const gen = await latest();
    expect(gen!.status).toBe('failed');
    expect(gen).not.toHaveProperty('onlyWhenStrips');
  });
});
