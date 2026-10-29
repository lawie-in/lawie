/**
 * T-300 round 2 - POST /generate-from-template stores the route's template_id, not a
 * client template_id sent inside form_data, so the annexures later apply the right pack's
 * advocate_name rule.
 */
import './setupEnv';
import './setupDb';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

/* eslint-disable import/order */
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { seedCourts } from './seedCourts';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { readFormInputs } from '../utils/case-details';
import { sdkAnswer } from './sdkStream';
/* eslint-enable import/order */

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// T-686: an id-shaped court with no active row stops the run, so the court is seeded.
seedCourts('district_sessions_patna');

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd7994393b2';
const MODEL = 'claude-sonnet-4-5-20250929';
const PROFILE = 'Adv. Profile Name';
const FORGED = 'Adv. Forged Typed Name';
const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': PROFILE,
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const FORM = {
  fir_number: '124/2026',
  fir_date: '2026-03-15',
  police_station: 'Kotwali, Patna',
  sections_charged: ['103'],
  state: 'bihar',
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St',
  language: 'en',
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  court_type: 'sessions',
  court_name: 'district_sessions_patna',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
};

beforeEach(async () => {
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async () =>
    sdkAnswer('1. Applicant seeks bail.', 1000, 200),
  );
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

async function generate(formData: Record<string, unknown>) {
  const res = await request(app)
    .post('/generate-from-template')
    .set(headers)
    .send({ template_id: 'bail_regular', form_data: formData });
  expect(res.status).toBe(200);
  expect(res.text).toContain('event: done');
  const doc = await LawieDocument.findOne({ userId: USER_ID }).sort({ createdAt: -1 });
  if (!doc) throw new Error('document not saved');
  return doc;
}

describe('T-300: the template route’s template_id wins over one inside form_data', () => {
  it('stores the route’s template_id', async () => {
    const doc = await generate({ ...FORM, template_id: 'default_bail' });
    expect(readFormInputs(doc)?.template_id).toBe('bail_regular');
  });

  it('without a client template_id the route’s id is stored as before', async () => {
    const doc = await generate(FORM);
    expect(readFormInputs(doc)?.template_id).toBe('bail_regular');
  });

  it('the annexures for that doc apply bail_regular’s rule: the profile name, not the typed one', async () => {
    const doc = await generate({ ...FORM, template_id: 'default_bail', advocate_name: FORGED });
    const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
    const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
    let html = '';
    page.setContent.mockImplementation((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    const res = await request(app)
      .post(`/${String(doc._id)}/annexures-pack`)
      .set(headers);
    expect(res.status).toBe(200);
    expect(html).toContain(PROFILE);
    expect(html).not.toContain(FORGED);
  });
});
