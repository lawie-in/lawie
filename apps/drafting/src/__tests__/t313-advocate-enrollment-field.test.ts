/**
 * T-313 - an optional "Bar Council Enrollment No." field (advocate_enrollment) in
 * bail_regular, bail_anticipatory and consumer_complaint. Ajay's label; required false; the
 * last field of "Court & Parties". T-311's order applies: typed, else the profile number when
 * the advocate name is the profile's, else the blank. Empty never blocks the draft.
 * Puppeteer is mocked, as in t311.
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
import { readFileSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { seedCourts } from './seedCourts';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
  validateFormData,
} from '../services/template-engine.service';
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

const PACKS = ['bail_regular', 'bail_anticipatory', 'consumer_complaint'];
const REPO = join(__dirname, '..', '..', '..', '..');
const FILES: Array<[string, (id: string) => string]> = [
  ['override (docs/templates)', (id) => join(REPO, 'docs', 'templates', `${id}.json`)],
  [
    'document-rules twin',
    (id) => join(REPO, 'apps', 'drafting', 'src', 'config', 'document-rules', `${id}.json`),
  ],
];

interface Field {
  field_id: string;
  label?: string;
  required?: boolean;
  type?: string;
}
interface Step {
  title: string;
  fields: Field[];
}
type Pack = { form_schema: { steps: Step[] } };

/** Throws unless the pack has Ajay's field, optional, last in "Court & Parties". */
function assertEnrollmentField(pack: Pack): void {
  const matches = pack.form_schema.steps.flatMap((s) =>
    s.fields.filter((f) => f.field_id === 'advocate_enrollment'),
  );
  expect(matches).toHaveLength(1);
  const step = pack.form_schema.steps.find((s) => s.title === 'Court & Parties');
  expect(step).toBeDefined();
  const last = step!.fields[step!.fields.length - 1];
  expect(last.field_id).toBe('advocate_enrollment');
  expect(last.label).toBe('Bar Council Enrollment No.');
  expect(last.required).toBe(false);
  expect(last.type).toBe('text');
}

describe.each(PACKS)('T-313 %s: the field is declared', (id) => {
  it.each(FILES)('%s', (_l, path) => {
    assertEnrollmentField(JSON.parse(readFileSync(path(id), 'utf8')) as Pack);
  });

  it('the loaded config has it too', () => {
    assertEnrollmentField(loadTemplateConfig(id) as unknown as Pack);
  });
});

describe('T-313 mutation check: the structural test can fail', () => {
  const base = () => JSON.parse(readFileSync(FILES[0][1]('bail_regular'), 'utf8')) as Pack; // in-memory copy only
  const field = (p: Pack) =>
    p.form_schema.steps.flatMap((s) => s.fields).find((f) => f.field_id === 'advocate_enrollment')!;

  it('passes on the unmutated copy', () => {
    expect(() => assertEnrollmentField(base())).not.toThrow();
  });
  it('fails when required is flipped to true', () => {
    const p = base();
    field(p).required = true;
    expect(() => assertEnrollmentField(p)).toThrow();
  });
  it('fails when the label is renamed', () => {
    const p = base();
    field(p).label = 'Enrollment Number';
    expect(() => assertEnrollmentField(p)).toThrow();
  });
  it('fails when the field is not last in its step', () => {
    const p = base();
    const step = p.form_schema.steps.find((s) => s.title === 'Court & Parties')!;
    step.fields.push({ field_id: 'zzz_extra', label: 'x', required: false });
    expect(() => assertEnrollmentField(p)).toThrow();
  });
  it('fails when the field is missing', () => {
    const p = base();
    for (const s of p.form_schema.steps)
      s.fields = s.fields.filter((f) => f.field_id !== 'advocate_enrollment');
    expect(() => assertEnrollmentField(p)).toThrow();
  });
});

// ── Behaviour, bail_regular ──────────────────────────────────────────────────

const PROFILE_NAME = 'Adv. Profile Name';
const PROFILE_NUM = 'PROF/111/2010';
const TYPED_NUM = 'D/123/2020';
const TBC = '[To be confirmed: enrolment number]';
const DRAFT_BLANK = "[To be confirmed: advocate's enrolment number]";
const ANNEX_BLANK = '___________';
const BASE = { applicant_name: 'Ramesh Kumar' };

const cfg = loadTemplateConfig('bail_regular')!;
const advocateBlock = (ctx: Record<string, unknown>) => {
  const section = cfg.document_structure.sections.find((s) => s.section_id === 'advocate_block');
  if (!section) throw new Error('advocate_block missing');
  return renderTemplateSection(section, ctx as never).content;
};
const draft = (form: Record<string, unknown>, extra: object = {}) =>
  advocateBlock(buildPlaceholderContext(cfg, { ...BASE, ...form }, extra));

describe('T-313 bail_regular draft advocate block (T-311 order)', () => {
  const profile = { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM };

  it('typed value prints, not the profile number', () => {
    const t = draft({ advocate_enrollment: TYPED_NUM }, profile);
    expect(t).toContain(`Enrollment No. ${TYPED_NUM}`);
    expect(t).not.toContain(PROFILE_NUM);
  });
  it.each([
    ['empty', ''],
    ['whitespace', '  '],
    ['missing', undefined],
  ])('%s with the profile name: the profile number', (_l, v) => {
    const t = draft({ advocate_enrollment: v }, profile);
    expect(t).toContain(`Enrollment No. ${PROFILE_NUM}`);
  });
  it('empty with no profile: the blank', () => {
    expect(draft({}, {})).toContain(`Enrollment No. ${DRAFT_BLANK}`);
    expect(draft({}, { advocateName: PROFILE_NAME })).toContain(`Enrollment No. ${DRAFT_BLANK}`);
  });
  it('a "[To be confirmed: ...]" placeholder prints as typed', () => {
    const t = draft({ advocate_enrollment: TBC }, profile);
    expect(t).toContain(`Enrollment No. ${TBC}`);
    expect(t).not.toContain(PROFILE_NUM);
  });
});

async function annexuresHtml(
  formData: Record<string, unknown>,
  advocateName?: string,
  enrollmentNumber?: string,
): Promise<string> {
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
  let html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  await buildAnnexuresPack({ formData, bodyParaCount: 8, advocateName, enrollmentNumber });
  return html;
}

describe('T-313 bail_regular annexures', () => {
  const form = (extra: Record<string, unknown> = {}) => ({
    template_id: 'bail_regular',
    ...BASE,
    ...extra,
  });
  const count = (html: string, s: string) => html.split(s).length - 1;

  it('typed value prints in the annexures, not the profile number', async () => {
    const html = await annexuresHtml(
      form({ advocate_enrollment: TYPED_NUM }),
      PROFILE_NAME,
      PROFILE_NUM,
    );
    expect(count(html, TYPED_NUM)).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain(PROFILE_NUM);
  });
  it('empty with the profile name: the profile number', async () => {
    const html = await annexuresHtml(form({ advocate_enrollment: '' }), PROFILE_NAME, PROFILE_NUM);
    expect(count(html, PROFILE_NUM)).toBeGreaterThanOrEqual(2);
  });
  it('empty with no profile: the blank', async () => {
    const html = await annexuresHtml(form(), PROFILE_NAME);
    expect(html).toContain(`Bar Enrolment No.: ${ANNEX_BLANK}`);
  });
  it('a "[To be confirmed: ...]" placeholder prints as typed', async () => {
    const html = await annexuresHtml(form({ advocate_enrollment: TBC }), PROFILE_NAME, PROFILE_NUM);
    expect(html).toContain(TBC);
    expect(html).not.toContain(PROFILE_NUM);
  });
});

describe('T-313 optional: empty never blocks (validateFormData)', () => {
  const FULL = {
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
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['null', null],
  ])('%s: no error mentions the field', (_l, v) => {
    const errors = validateFormData(
      cfg,
      v === undefined ? { ...FULL } : { ...FULL, advocate_enrollment: v },
    );
    expect(errors.filter((e) => /enrol/i.test(e))).toEqual([]);
    expect(errors).toEqual([]);
  });
  it('the mutated copy (required: true) would block an empty field', () => {
    const copy = JSON.parse(JSON.stringify(cfg));
    for (const s of copy.form_schema.steps)
      for (const f of s.fields) if (f.field_id === 'advocate_enrollment') f.required = true;
    expect(validateFormData(copy, { ...FULL }).join(' ')).toMatch(/enrol/i);
  });
});

describe('T-313 POST /generate-from-template (bail_regular)', () => {
  const USER_ID = '507f1f77bcf86cd7994393b1';
  const MODEL = 'claude-sonnet-4-5-20250929';
  const headers = {
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': PROFILE_NAME,
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
  const gen = (extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/generate-from-template')
      .set(headers)
      .send({ template_id: 'bail_regular', form_data: { ...FORM, ...extra } });
  const setProfileNumber = (n: string) =>
    User.collection.updateOne(
      { _id: new (jest.requireActual('mongoose').Types.ObjectId)(USER_ID) },
      { $set: { enrollmentNumber: n } },
    );

  let spy: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    _clearAppSettingsCache();
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementation(async () =>
      sdkAnswer('1. The petitioner submits.', 1000, 200),
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
    spy = jest.spyOn(aiService, 'streamGenerateDocument');
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });
  afterEach(() => {
    spy.mockRestore();
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  const produced = (res: request.Response) => {
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    return (
      res.text + JSON.stringify(spy.mock.calls) + JSON.stringify(mockMessagesStream.mock.calls)
    );
  };

  it('typed value is accepted and prints; the profile number does not', async () => {
    await setProfileNumber(PROFILE_NUM);
    const all = produced(await gen({ advocate_enrollment: TYPED_NUM }));
    expect(all).toContain(`Enrollment No. ${TYPED_NUM}`);
    expect(all).not.toContain(PROFILE_NUM);
  });
  it.each([
    ['empty', ''],
    ['absent', undefined],
  ])(
    '%s with a profile number and the profile name: no 400, the profile number prints',
    async (_l, v) => {
      await setProfileNumber(PROFILE_NUM);
      const all = produced(await gen(v === undefined ? {} : { advocate_enrollment: v }));
      expect(all).toContain(`Enrollment No. ${PROFILE_NUM}`);
    },
  );
  it('empty with no profile number: no 400, the blank prints', async () => {
    const all = produced(await gen({ advocate_enrollment: '' }));
    expect(all).toContain(`Enrollment No. ${DRAFT_BLANK}`);
  });
  it('a "[To be confirmed: ...]" placeholder prints as typed', async () => {
    await setProfileNumber(PROFILE_NUM);
    const all = produced(await gen({ advocate_enrollment: TBC }));
    expect(all).toContain(`Enrollment No. ${TBC}`);
    expect(all).not.toContain(PROFILE_NUM);
  });
});
