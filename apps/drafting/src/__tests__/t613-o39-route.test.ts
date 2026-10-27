/**
 * T-613 F7 at route level: a real POST /generate-from-template for temporary_injunction_o39
 * (model stubbed, in-memory DB) records the Generation with docType 'injunction'.
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

const USER_ID = '507f1f77bcf86cd799439613';
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

const FORM = {
  state: 'bihar',
  court_name: 'bihar_civil_junior_patna',
  plaintiff_name: 'Ram Kumar',
  defendant_name: 'Shyam Lal',
  suit_number: 'Title Suit No. 245 of 2026',
  subject_matter: 'Plot 4, Patna',
  main_suit_relief: 'Declaration of title',
  type_of_injunction_sought: 'prohibitory_injunction_o39_r1',
  prima_facie_case: 'Title deed.',
  balance_of_convenience: 'Favours the plaintiff.',
  irreparable_injury: 'Loss of the plot.',
  acts_complained_of: 'Threat to build.',
  restraint_sought: 'raising any construction',
  ex_parte_sought: false,
  undertaking_offered: 'Yes.',
  supporting_documents: 'Sale deed.',
  advocate_name: 'Adv. A',
  advocate_enrollment: 'BR/1/2020',
  language: 'en',
};

async function run(courtType: string, courtName: string) {
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  mockMessagesStream.mockResolvedValue(sdkAnswer('1. Body.', 10, 5));
  return request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({
      template_id: 'temporary_injunction_o39',
      form_data: { ...FORM, court_type: courtType, court_name: courtName },
    });
}

describe('T-613 E (route): O.39 saved document and generation record', () => {
  it('stores docType "injunction" (not "petition") on the document and the Generation', async () => {
    const res = await run('civil_court', 'bihar_civil_junior_patna');
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    const docs = await LawieDocument.find({ userId: USER_ID }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].docType).toBe('injunction');
    const rows = await Generation.find({ userId: USER_ID }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].docType).toBe('injunction');
  });

  // FINDING (expected red): the chosen type is civil_court_junior, which COURT_TYPES in
  // packages/shared does not list, so Document.courtType rejects it and the draft is not saved.
  it('saves the draft when the court is the Junior Division record (court_type civil_court_junior)', async () => {
    const res = await run('civil_court_junior', 'bihar_civil_junior_patna');
    expect(res.status).toBe(200);
    const docs = await LawieDocument.find({ userId: USER_ID }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].docType).toBe('injunction');
    expect(docs[0].courtType).toBe('civil_court_junior');
  });
});
