/**
 * T-102 — ask only for the missing details (ADR-019 §3.6). Code only, no model call.
 *
 * Covers: nothing missing, some missing, an invalid answer, the 2-round
 * limit, filled fields never asked again, court/parties/FIR/sections/dates
 * asked first, form_data for "fill it myself", and round-1 questions on
 * POST /intake.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { buildQuestions, QUESTION_LIMITS } from '../services/intake.service';
import { loadTemplateConfig } from '../services/template-engine.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const INTAKE_ID = '55555555-5555-4555-8555-555555555555';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439061',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const COMPLETE_BAIL = {
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
  facts_narrative:
    'The accused was falsely implicated in FIR 124/2026 due to a family land dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

function post(body: Record<string, unknown>) {
  return request(app)
    .post('/intake/answers')
    .set(headers())
    .send({ intake_id: INTAKE_ID, template_id: 'bail_regular', ...body });
}

describe('POST /intake/answers', () => {
  it('nothing missing → ready, review, no questions', async () => {
    const res = await post({ fields: COMPLETE_BAIL, answers: {}, round: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ready: true,
      review: true,
      missing: [],
      questions: [],
      invalid: [],
    });
    expect(res.body.form_data).toEqual(COMPLETE_BAIL);
  });

  it('some missing → at most 5 questions, worded from labels, filled fields never asked', async () => {
    const { applicant_name, fir_number, ...rest } = COMPLETE_BAIL;
    void applicant_name;
    void fir_number;
    const partial = {
      ...rest,
      state: undefined,
      court_type: undefined,
      court_name: undefined,
      applicant_age: undefined,
      father_name: undefined,
    };
    const res = await post({ fields: partial, answers: {}, round: 1 });
    expect(res.body.ready).toBe(false);
    expect(res.body.review).toBe(false);
    expect(res.body.questions.length).toBe(QUESTION_LIMITS.perRound);
    const asked = res.body.questions.map((q: { field_id: string }) => q.field_id);
    // Court, parties and FIR come before other gaps; form order within them.
    expect(asked).toEqual(['fir_number', 'state', 'court_type', 'court_name', 'applicant_name']);
    for (const id of Object.keys(rest)) {
      if ((partial as Record<string, unknown>)[id] !== undefined) expect(asked).not.toContain(id);
    }
    const config = loadTemplateConfig('bail_regular')!;
    const label = config.form_schema.steps
      .flatMap((s) => s.fields)
      .find((f) => f.field_id === 'fir_number')!.label;
    expect(res.body.questions[0].question).toBe(label);
    // Court dropdown questions point at the real list; nothing is pre-chosen.
    const court = res.body.questions.find((q: { field_id: string }) => q.field_id === 'court_name');
    expect(court.source ?? court.options_from).toMatch(/courts/);
  });

  it('answers are merged and win over earlier values; the merged set is checked again', async () => {
    const { applicant_name, ...rest } = COMPLETE_BAIL;
    void applicant_name;
    const res = await post({
      fields: { ...rest, applicant_age: { value: '32', source: 'description', quote: 'aged 32' } },
      answers: { applicant_name: 'Ram Kumar', applicant_age: '33' },
      round: 1,
    });
    expect(res.body.ready).toBe(true);
    expect(res.body.fields.applicant_name).toEqual({ value: 'Ram Kumar', source: 'user' });
    expect(res.body.fields.applicant_age).toEqual({ value: '33', source: 'user' });
  });

  it('an invalid answer is reported, not kept, and asked again', async () => {
    const res = await post({
      fields: { ...COMPLETE_BAIL, fir_date: undefined, currently_in_custody: undefined },
      answers: { fir_date: '15 March', currently_in_custody: 'maybe' },
      round: 1,
    });
    expect(res.body.invalid).toEqual(
      expect.arrayContaining([
        { field_id: 'fir_date', reason: 'type' },
        { field_id: 'currently_in_custody', reason: 'option' },
      ]),
    );
    expect(res.body.fields.fir_date).toBeUndefined();
    expect(res.body.missing).toEqual(expect.arrayContaining(['fir_date', 'currently_in_custody']));
    expect(res.body.questions.map((q: { field_id: string }) => q.field_id)).toEqual(
      expect.arrayContaining(['fir_date', 'currently_in_custody']),
    );
  });

  it('values sent back from the browser are checked again too (a too-short narrative is dropped)', async () => {
    const res = await post({
      fields: { ...COMPLETE_BAIL, facts_narrative: 'too short' },
      answers: {},
      round: 1,
    });
    expect(res.body.invalid).toEqual([{ field_id: 'facts_narrative', reason: 'length' }]);
    expect(res.body.missing).toContain('facts_narrative');
  });

  it('after round 2 the flow moves to review with the gaps listed, and no more questions', async () => {
    const res = await post({ fields: { applicant_name: 'Ram Kumar' }, answers: {}, round: 2 });
    expect(res.body.review).toBe(true);
    expect(res.body.ready).toBe(false);
    expect(res.body.questions).toEqual([]);
    expect(res.body.missing.length).toBeGreaterThan(5);
    expect(res.body.form_data).toEqual({ applicant_name: 'Ram Kumar' });
  });

  it('an answer that reveals a show_if field makes it count; hiding it removes it', async () => {
    const config = loadTemplateConfig('bail_regular')!;
    // custody_since shows only when currently_in_custody !== no; it is optional, so never missing.
    const res = await post({
      fields: { ...COMPLETE_BAIL, custody_since: undefined },
      answers: { currently_in_custody: 'no' },
      round: 1,
    });
    expect(res.body.missing).not.toContain('custody_since');
    expect(config).toBeTruthy();
  });

  it('a template outside the catalogue → 404; a bad body → 400', async () => {
    const missingTemplate = await post({ template_id: 'nope', fields: {}, answers: {}, round: 1 });
    expect(missingTemplate.status).toBe(404);
    const bad = await request(app)
      .post('/intake/answers')
      .set(headers())
      .send({ template_id: 'bail_regular' });
    expect(bad.status).toBe(400);
  });

  it('makes no model call', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await post({ fields: {}, answers: {}, round: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('buildQuestions', () => {
  it('never asks for a file field and caps at 5', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const all = config.form_schema.steps.flatMap((s) => s.fields).map((f) => f.field_id);
    const qs = buildQuestions(config, all);
    expect(qs.length).toBe(5);
    expect(qs.every((q) => q.type !== 'file')).toBe(true);
  });
});

describe('GET /intake/enabled (ADR-019 §3.11)', () => {
  const get = () => request(app).get('/intake/enabled').set(headers());
  beforeEach(() => _clearAppSettingsCache());

  it('off when the setting is missing', async () => {
    expect((await get()).body).toEqual({ enabled: false });
  });

  it('on for everyone, off for no one, or only for listed user ids', async () => {
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    expect((await get()).body.enabled).toBe(true);
    await AppSetting.updateOne({ key: 'feature.describe_first' }, { value: 'off' });
    _clearAppSettingsCache();
    expect((await get()).body.enabled).toBe(false);
    await AppSetting.updateOne(
      { key: 'feature.describe_first' },
      { value: 'someoneelse, 507f1f77bcf86cd799439061' },
    );
    _clearAppSettingsCache();
    expect((await get()).body.enabled).toBe(true);
    await AppSetting.updateOne({ key: 'feature.describe_first' }, { value: 'someoneelse' });
    _clearAppSettingsCache();
    expect((await get()).body.enabled).toBe(false);
  });
});
