/**
 * T-629 AC8 (Ajay FR-1(b), FR-5, FR-5a; T-613 signed (g), (j)2, (j)3): the required-field and
 * non-answer block on POST /generate-from-template, temporary_injunction_o39 only.
 *
 * - unit: formRequiredFieldBlock
 * - route: 400 with the signed EN lines before any run, Ink hold or model call; it beats
 *   "Form validation failed"; a valid O.39 form and another template are unchanged.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { seedCourts } from './seedCourts';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { formRequiredFieldBlock } from '../services/form-ledger';
import { sdkAnswer } from './sdkStream';

// T-686: an id-shaped court with no active row stops the run, so the court is seeded.
seedCourts('bihar_civil_junior_patna');

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd799439629';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;
const O39 = 'temporary_injunction_o39';
const L1 = 'Add the relief sought in the main suit to continue.';
const L2 = 'Add the acts the defendant should be restrained from, to continue.';
const NON_ANSWERS = [
  'Not known',
  'unknown',
  'NA',
  'N/A',
  'nil',
  'none',
  '-',
  '?',
  'नहीं पता',
  'पता नहीं',
];

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const FORM: Record<string, unknown> = {
  state: 'bihar',
  court_type: 'civil_court',
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
const BODY = '1. That on 5 March 2026 the defendant threatened to build on Plot 4, Patna.';

const postO39 = (over: Record<string, unknown> = {}, drop: string[] = []) => {
  const form = { ...FORM, ...over };
  for (const k of drop) delete form[k];
  return request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({ template_id: O39, form_data: form });
};

async function expectNothingRan() {
  expect(mockMessagesStream).not.toHaveBeenCalled();
  expect(await Generation.countDocuments({})).toBe(0);
  expect(await LawieDocument.countDocuments({})).toBe(0);
  const u = (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID })
    .toArray();
  expect(rows).toEqual([]);
}

describe('T-629 AC8 unit: formRequiredFieldBlock', () => {
  // T-644: the parties are required too, so a "valid" form holds both (fictional names).
  const parties = { plaintiff_name: 'Ramesh Kumar Verma', defendant_name: 'Sunita Devi Agarwal' };
  const ok = {
    ...parties,
    main_suit_relief: 'Declaration of title',
    restraint_sought: 'raising construction',
  };

  it('valid values: null', () => {
    expect(formRequiredFieldBlock(O39, ok)).toBeNull();
  });

  it('both empty: both signed lines in (j)2 order, keys in the same order', () => {
    expect(
      formRequiredFieldBlock(O39, { ...parties, main_suit_relief: '', restraint_sought: '' }),
    ).toEqual({
      error: 'brief_not_confirmed',
      message: `${L1}\n${L2}`,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['main_suit_relief', 'restraint_sought'],
    });
  });

  it('both missing from form_data: both lines', () => {
    expect(formRequiredFieldBlock(O39, parties)).toMatchObject({
      message: `${L1}\n${L2}`,
      confirm_blocking_keys: ['main_suit_relief', 'restraint_sought'],
    });
  });

  it('only main_suit_relief blocks: one line, one key', () => {
    expect(formRequiredFieldBlock(O39, { ...ok, main_suit_relief: '' })).toEqual({
      error: 'brief_not_confirmed',
      message: L1,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['main_suit_relief'],
    });
  });

  it('only restraint_sought blocks: one line, one key', () => {
    expect(formRequiredFieldBlock(O39, { ...ok, restraint_sought: undefined })).toEqual({
      error: 'brief_not_confirmed',
      message: L2,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['restraint_sought'],
    });
  });

  it('whitespace only and null count as empty', () => {
    expect(
      formRequiredFieldBlock(O39, {
        ...parties,
        main_suit_relief: '   \n\t ',
        restraint_sought: null,
      })?.message,
    ).toBe(`${L1}\n${L2}`);
  });

  it.each(NON_ANSWERS)('non-answer %j blocks on each field', (na) => {
    expect(formRequiredFieldBlock(O39, { ...ok, main_suit_relief: na })?.message).toBe(L1);
    expect(formRequiredFieldBlock(O39, { ...ok, restraint_sought: na })?.message).toBe(L2);
  });

  it('non-answers are case-insensitive and trimmed', () => {
    for (const v of ['  NOT KNOWN ', 'Nil', 'NONE', ' n/a\n', 'UnKnown', 'na'])
      expect(formRequiredFieldBlock(O39, { ...ok, restraint_sought: v })?.message).toBe(L2);
  });

  it('a longer answer that contains a non-answer word is not blocked', () => {
    for (const v of [
      'none of the defendants may enter',
      'Not known to the plaintiff until 5 March 2026',
      'nil construction or any alienation',
      'unknown persons acting for the defendant',
    ])
      expect(
        formRequiredFieldBlock(O39, { ...parties, main_suit_relief: v, restraint_sought: v }),
      ).toBeNull();
  });

  const BAD_SHAPES: [string, unknown][] = [
    ['{}', {}],
    ['true', true],
    ['0', 0],
    ['[{}]', [{}]],
    ['[0]', [0]],
    ['[]', []],
    ["['N/A', ' ']", ['N/A', ' ']],
  ];
  it.each(BAD_SHAPES)('non-string / empty-array value %s blocks on each field', (_n, v) => {
    expect(formRequiredFieldBlock(O39, { ...ok, main_suit_relief: v })).toEqual({
      error: 'brief_not_confirmed',
      message: L1,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['main_suit_relief'],
    });
    expect(formRequiredFieldBlock(O39, { ...ok, restraint_sought: v })).toEqual({
      error: 'brief_not_confirmed',
      message: L2,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['restraint_sought'],
    });
  });

  it('an array of real strings is an answer', () => {
    const v = ['Declaration of title', 'Permanent injunction'];
    expect(
      formRequiredFieldBlock(O39, { ...parties, main_suit_relief: v, restraint_sought: v }),
    ).toBeNull();
  });

  it('other templates: null, even with empty required fields', () => {
    for (const t of ['bail_regular', 'bail_anticipatory', 'unknown_template', ''])
      expect(formRequiredFieldBlock(t, {})).toBeNull();
  });
});

describe('T-629 AC8 route: POST /generate-from-template', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
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
      inkTopup: START_INK,
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('empty main_suit_relief: 400 with the exact body, no run, no Ink, no model call', async () => {
    const res = await postO39({ main_suit_relief: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: L1,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['main_suit_relief'],
    });
    await expectNothingRan();
  });

  it('both fields empty: both lines in (j)2 order, and not "Form validation failed"', async () => {
    const res = await postO39({ main_suit_relief: '', restraint_sought: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: `${L1}\n${L2}`,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['main_suit_relief', 'restraint_sought'],
    });
    expect(JSON.stringify(res.body)).not.toContain('Form validation failed');
    await expectNothingRan();
  });

  it('fields absent from form_data: the signed lines, not the generic validation error', async () => {
    const res = await postO39({}, ['main_suit_relief', 'restraint_sought']);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(`${L1}\n${L2}`);
    await expectNothingRan();
  });

  it.each(NON_ANSWERS)(
    'non-answer %j in restraint_sought: 400 with the signed line',
    async (na) => {
      const res = await postO39({ restraint_sought: na });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'brief_not_confirmed',
        message: L2,
        blockers: ['required_fields'],
        confirm_blocking_keys: ['restraint_sought'],
      });
      await expectNothingRan();
    },
  );

  it('a padded, upper-case non-answer in main_suit_relief blocks', async () => {
    const res = await postO39({ main_suit_relief: '  N/A ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(L1);
    await expectNothingRan();
  });

  const SHAPES: [string, unknown][] = [
    ['{}', {}],
    ['true', true],
    ['0', 0],
    ['[{}]', [{}]],
    ['[0]', [0]],
    ['[]', []],
    ["['N/A', ' ']", ['N/A', ' ']],
  ];
  describe.each(['main_suit_relief', 'restraint_sought'])('non-string value in %s', (field) => {
    it.each(SHAPES)('%s: 400 with the exact body, nothing ran', async (_n, v) => {
      const res = await postO39({ [field]: v });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'brief_not_confirmed',
        message: field === 'main_suit_relief' ? L1 : L2,
        blockers: ['required_fields'],
        confirm_blocking_keys: [field],
      });
      await expectNothingRan();
    });
  });

  it('an array of real strings in both fields is delivered', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    const v = ['Declaration of title', 'Permanent injunction'];
    const res = await postO39({ main_suit_relief: v, restraint_sought: v });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('brief_not_confirmed');
    expect(res.text).toContain('event: done');
    expect(await LawieDocument.countDocuments({})).toBe(1);
  });

  it('valid O.39 form proceeds as before: delivered, Ink taken, no error event', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    const res = await postO39();
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('brief_not_confirmed');
    expect(res.text).not.toContain('event: error');
    expect(res.text).toContain('event: done');
    expect(await LawieDocument.countDocuments({})).toBe(1);
    const u = (await User.collection.findOne({ _id: OID })) as unknown as { inkTopup: number };
    expect(u.inkTopup).toBeLessThan(START_INK);
    const rows = await mongoose.connection
      .db!.collection('inkledger')
      .find({ userId: OID })
      .toArray();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a longer answer containing "none" is delivered', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    const res = await postO39({ restraint_sought: 'none of the defendants may build' });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('brief_not_confirmed');
  });

  it('another template is not blocked by this check: bail_regular with empty O.39 fields gets the usual validation, never brief_not_confirmed', async () => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({
        template_id: 'bail_regular',
        form_data: { main_suit_relief: '', restraint_sought: '' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Form validation failed');
    expect(JSON.stringify(res.body)).not.toContain('brief_not_confirmed');
    expect(res.text).not.toContain(L1);
    expect(res.text).not.toContain(L2);
  });
});
