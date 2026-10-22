/**
 * T-451 - the documents routes alias a posted form at the entry point
 * (applyFieldAliases(form_data, template_id)): POST /preflight and POST /generate-from-template
 * hand preflightCheck, validateFormData and sealFormInputs the NEW key and option ids and no old
 * ones. Pack-scoped option ids: quashing_528_bnss and gpa map; fir_quashing and spa are untouched.
 * Services are spied, as in t375-documents-routes.test.ts; the model SDK is faked.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as preflight from '../services/preflight.service';
import { _resetToolSwitches } from '../services/feature-switches';
import * as engine from '../services/template-engine.service';
import * as caseDetails from '../utils/case-details';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const OLD_KEY = 'bhajan_lal_categories_invoked';
const NEW_KEY = 'quashing_categories_invoked';
const QUASH = 'quashing_528_bnss';
const GROUNDS = 'grounds_for_quashing';
const OLD_GROUND = 'express_legal_bar_bhajan_lal_cat_4';
const NEW_GROUND = 'express_legal_bar';
const GPA_FIELD = 'includes_power_to_sell';
const OLD_GPA = 'yes_flag_suraj_lamp_warning';
const NEW_GPA = 'yes_flag_title_warning';

const USER_ID = '507f1f77bcf86cd799439377';
const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'pro',
  'x-user-role': 'Client',
};

let preflightSpy: jest.SpyInstance;
let validateSpy: jest.SpyInstance;
let sealSpy: jest.SpyInstance;

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _resetToolSwitches();
  engine.clearConfigCache();
  await redis.flushall();
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  preflightSpy = jest
    .spyOn(preflight, 'preflightCheck')
    .mockResolvedValue({ verdict: 'pass', issues: [] } as never);
  validateSpy = jest.spyOn(engine, 'validateFormData');
  sealSpy = jest.spyOn(caseDetails, 'sealFormInputs');
});

afterEach(() => {
  jest.restoreAllMocks();
});

const preflightPost = (body: object) => request(app).post('/preflight').set(headers).send(body);
const generatePost = (body: object) =>
  request(app).post('/generate-from-template').set(headers).send(body);

const text = (o: unknown): string => JSON.stringify(o);

describe('T-451 POST /preflight aliases the posted form', () => {
  it('fir_quashing: preflightCheck gets the new key and not the old one', async () => {
    const res = await preflightPost({
      template_id: 'fir_quashing',
      form_data: { applicant_name: 'R', [OLD_KEY]: ['category_1_no_offence_disclosed'] },
    });
    expect(res.status).toBe(200);
    expect(preflightSpy).toHaveBeenCalledTimes(1);
    const [id, data] = preflightSpy.mock.calls[0];
    expect(id).toBe('fir_quashing');
    expect(data[NEW_KEY]).toEqual(['category_1_no_offence_disclosed']);
    expect(OLD_KEY in data).toBe(false);
  });

  it('quashing_528_bnss: old option ids reach preflightCheck as the new ids', async () => {
    await preflightPost({
      template_id: QUASH,
      form_data: { [GROUNDS]: [OLD_GROUND, 'compromise_compoundable_offence'] },
    });
    const data = preflightSpy.mock.calls[0][1];
    expect(data[GROUNDS]).toEqual([NEW_GROUND, 'compromise_compoundable_offence']);
    expect(text(data)).not.toContain('bhajan_lal');
  });

  it('fir_quashing: its category ids are not mapped, and a grounds_for_quashing there is left', async () => {
    await preflightPost({
      template_id: 'fir_quashing',
      form_data: { [GROUNDS]: [OLD_GROUND] },
    });
    expect(preflightSpy.mock.calls[0][1][GROUNDS]).toEqual([OLD_GROUND]);
  });

  it('gpa: the old option value maps; spa and other packs keep the same value', async () => {
    await preflightPost({ template_id: 'gpa', form_data: { [GPA_FIELD]: OLD_GPA } });
    expect(preflightSpy.mock.calls[0][1][GPA_FIELD]).toBe(NEW_GPA);
    for (const id of ['spa', 'default_bail']) {
      preflightSpy.mockClear();
      await preflightPost({ template_id: id, form_data: { [GPA_FIELD]: OLD_GPA } });
      expect(preflightSpy.mock.calls[0][1][GPA_FIELD]).toBe(OLD_GPA);
    }
  });

  it('joint_development_agreement: the old gpa_to_developer value maps; gpa keeps it', async () => {
    const old = 'yes_general_gpa_with_suraj_lamp_flag';
    await preflightPost({
      template_id: 'joint_development_agreement',
      form_data: { gpa_to_developer: old },
    });
    expect(preflightSpy.mock.calls[0][1].gpa_to_developer).toBe('yes_general_gpa_with_title_flag');
    preflightSpy.mockClear();
    await preflightPost({ template_id: 'gpa', form_data: { gpa_to_developer: old } });
    expect(preflightSpy.mock.calls[0][1].gpa_to_developer).toBe(old);
  });

  it('still 400s on a missing template_id or form_data', async () => {
    expect((await preflightPost({ form_data: {} })).status).toBe(400);
    expect((await preflightPost({ template_id: QUASH })).status).toBe(400);
    expect(preflightSpy).not.toHaveBeenCalled();
  });
});

describe('T-451 POST /generate-from-template aliases the posted form', () => {
  it('fir_quashing: a stale post is validated under the new key (no required error for it)', async () => {
    const res = await generatePost({
      template_id: 'fir_quashing',
      form_data: { [OLD_KEY]: ['category_1_no_offence_disclosed'] },
    });
    expect(validateSpy).toHaveBeenCalledTimes(1);
    const data = validateSpy.mock.calls[0][1];
    expect(data[NEW_KEY]).toEqual(['category_1_no_offence_disclosed']);
    expect(OLD_KEY in data).toBe(false);
    // Other required fields are missing, so 400; but none of the issues is about the renamed field.
    expect(res.status).toBe(400);
    const issues = text(res.body.issues);
    expect(issues).not.toContain(NEW_KEY);
    expect(issues).not.toContain('Grounds for quashing invoked');
  });

  it('control: without the key the same post does report it as required', async () => {
    const res = await generatePost({ template_id: 'fir_quashing', form_data: {} });
    expect(res.status).toBe(400);
    expect(text(res.body.issues)).toContain('Grounds for quashing invoked');
  });

  it('quashing_528_bnss: validateFormData gets the new option ids', async () => {
    await generatePost({
      template_id: QUASH,
      form_data: { [GROUNDS]: [OLD_GROUND] },
    });
    expect(validateSpy.mock.calls[0][1][GROUNDS]).toEqual([NEW_GROUND]);
  });

  it('gpa maps the old value; spa keeps it', async () => {
    await generatePost({ template_id: 'gpa', form_data: { [GPA_FIELD]: OLD_GPA } });
    expect(validateSpy.mock.calls[0][1][GPA_FIELD]).toBe(NEW_GPA);
    validateSpy.mockClear();
    await generatePost({ template_id: 'spa', form_data: { [GPA_FIELD]: OLD_GPA } });
    expect(validateSpy.mock.calls[0][1][GPA_FIELD]).toBe(OLD_GPA);
  });

  describe('a full run stores the new key and ids (sealFormInputs)', () => {
    beforeEach(async () => {
      _clearAppSettingsCache();
      await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
      await AppSetting.create({
        key: 'ai.rates.claude-sonnet-4-5-20250929',
        value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
      });
      validateSpy.mockReturnValue([]); // the schema check is covered above
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. The petitioner submits.', 500, 100));
    });

    it.each([
      [
        'fir_quashing',
        { [OLD_KEY]: ['category_1_no_offence_disclosed'] },
        NEW_KEY,
        ['category_1_no_offence_disclosed'],
      ],
      [QUASH, { [GROUNDS]: [OLD_GROUND] }, GROUNDS, [NEW_GROUND]],
      ['gpa', { [GPA_FIELD]: OLD_GPA }, GPA_FIELD, NEW_GPA],
    ])('%s', async (template_id, form_data, key, expected) => {
      const res = await generatePost({ template_id, form_data });
      expect(res.status).toBe(200);
      expect(sealSpy).toHaveBeenCalled();
      const sealed = sealSpy.mock.calls[0][0];
      expect(sealed.template_id).toBe(template_id);
      expect(sealed[key]).toEqual(expected);
      expect(text(sealed)).not.toContain('bhajan_lal');
      expect(text(sealed)).not.toContain(OLD_GPA);
      expect(OLD_KEY in sealed).toBe(false);
    });
  });
});
