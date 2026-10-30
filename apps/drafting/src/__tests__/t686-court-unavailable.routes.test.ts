/**
 * T-686 — a raw court id must never reach a draft (fail closed).
 *
 * An id-shaped court value that does not resolve to an active Court row (inactive, not found, or
 * the lookup throwing twice) stops POST /generate-from-template before the Ink hold and before
 * any model call: HTTP 503 court_unavailable, a failed zero-usage Generation, a log line with the
 * court id / reason / kind / run id. A typed court name and an empty court behave as before.
 * The annexures pack fails closed the same way. Unit tests for resolveFormCourt at the end.
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
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createActiveCourt } from './seedCourts';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  COURT_ID_SHAPE,
  courtUnavailableBody,
  resolveFormCourt,
} from '../services/court-resolve.service';
import {
  evaluateShowIf,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';
/* eslint-enable import/order */

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd799439686';
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;
const COURT_ID = 'district_sessions_patna';
const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const BAIL_FORM = {
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
  court_name: COURT_ID,
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
};

/** Every visible required field of a template filled with a plausible value (court set by caller). */
function fillRequired(templateId: string, courtType: string, courtName: string) {
  const config = loadTemplateConfig(templateId)!;
  const data: Record<string, unknown> = { state: 'bihar', court_type: courtType, language: 'en' };
  for (let pass = 0; pass < 3; pass += 1) {
    for (const step of config.form_schema.steps) {
      for (const f of step.fields) {
        if (data[f.field_id] !== undefined) continue;
        if (f.show_if && !evaluateShowIf(f.show_if, data)) continue;
        if (!f.required) continue;
        if (f.type === 'date') data[f.field_id] = '2026-03-15';
        else if (f.type === 'number' || f.type === 'currency') data[f.field_id] = '5000';
        else if (f.type === 'dropdown' && f.options?.length) data[f.field_id] = f.options[0].id;
        else if (f.type === 'checkbox_group' || f.type === 'multi_select_search')
          data[f.field_id] = f.options?.length
            ? f.options.slice(0, Math.max(1, f.min_select ?? 1)).map((o) => o.id)
            : ['103'];
        else data[f.field_id] = 'x'.repeat(Math.max(f.min_length ?? 0, 60));
      }
    }
  }
  return { ...data, court_name: courtName };
}

/** A Court.findOne whose lean() query rejects (the 5 s cap, or a dropped connection). */
function failingFind() {
  return {
    maxTimeMS: () => ({ lean: () => Promise.reject(new Error('operation exceeded time limit')) }),
  };
}

let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async () =>
    sdkAnswer('1. Applicant seeks bail.', 1000, 200),
  );
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
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

function generate(templateId: string, formData: Record<string, unknown>) {
  return request(app)
    .post('/generate-from-template')
    .set(headers)
    .send({ template_id: templateId, form_data: formData });
}

/** AC1-AC3: the refusal, with nothing taken and nothing sent to the model. */
async function expectRefusal(
  res: request.Response,
  opts: { courtId: string; reason: string; kind: string },
) {
  expect(res.status).toBe(503);
  expect(res.headers['content-type']).toMatch(/json/);
  const runId = res.headers['x-run-id'];
  expect(runId).toBeTruthy();
  expect(res.body).toEqual({
    error: 'court_unavailable',
    code: 'court_unavailable',
    reason: 'Court unavailable, try again',
    retryable: true,
    runId,
  });

  // Zero Ink: balance untouched, no hold left.
  const u = await User.findById(USER_ID).lean();
  expect(u!.inkTopup).toBe(START_INK);
  expect(u!.inkSub).toBe(0);
  expect(u!.inkAnnualCarry).toBe(0);
  expect(u!.inkHolds ?? []).toHaveLength(0);

  // No model call, no saved draft.
  expect(mockMessagesStream).not.toHaveBeenCalled();
  expect(await LawieDocument.countDocuments({ userId: USER_ID })).toBe(0);

  // A failed Generation with zero usage.
  const gens = await Generation.find({ userId: USER_ID }).lean();
  expect(gens).toHaveLength(1);
  expect(gens[0].status).toBe('failed');
  expect(gens[0].templateId).toBe(opts.kind);
  expect(gens[0].runId).toBe(runId);
  expect(gens[0].inputTokens).toBe(0);
  expect(gens[0].outputTokens).toBe(0);
  expect(gens[0].tokensUsed).toBe(0);
  expect(gens[0].llmCalls).toBe(0);
  expect(gens[0].documentId ?? null).toBeNull();

  // The log line: id, reason, kind, run id; no draft content.
  const lines = errorSpy.mock.calls
    .map((c) => c.map(String).join(' '))
    .filter((l) => l.includes('court unavailable'));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(`courtId=${opts.courtId}`);
  expect(lines[0]).toContain(`reason=${opts.reason}`);
  expect(lines[0]).toContain(`kind=${opts.kind}`);
  expect(lines[0]).toContain(`runId=${runId}`);
  expect(lines[0]).not.toContain('Ram Kumar');
  expect(lines[0]).not.toContain('falsely implicated');
}

describe('T-686 AC1-3: POST /generate-from-template fails closed on an unresolved court id', () => {
  it('inactive court row: 503, zero Ink, no model call, failed Generation, logged', async () => {
    await createActiveCourt(COURT_ID, { isActive: false });
    const res = await generate('bail_regular', BAIL_FORM);
    await expectRefusal(res, { courtId: COURT_ID, reason: 'inactive', kind: 'bail_regular' });
  });

  it('no court row (not_found): 503 with the same guarantees', async () => {
    const res = await generate('bail_regular', BAIL_FORM);
    await expectRefusal(res, { courtId: COURT_ID, reason: 'not_found', kind: 'bail_regular' });
  });

  it('lookup throws twice (timeout): 503, and the lookup was tried exactly twice', async () => {
    await createActiveCourt(COURT_ID);
    const find = jest.spyOn(Court, 'findOne').mockImplementation(failingFind as never);
    const res = await generate('bail_regular', BAIL_FORM);
    await expectRefusal(res, { courtId: COURT_ID, reason: 'timeout', kind: 'bail_regular' });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('lookup throws once then succeeds: generation proceeds and the court is looked up once more, not again', async () => {
    await createActiveCourt(COURT_ID);
    const realFind = Court.findOne.bind(Court);
    const find = jest
      .spyOn(Court, 'findOne')
      .mockImplementationOnce(failingFind as never)
      .mockImplementation(((...args: Parameters<typeof realFind>) => realFind(...args)) as never);
    const res = await generate('bail_regular', BAIL_FORM);
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    expect(mockMessagesStream).toHaveBeenCalled();
    expect(
      errorSpy.mock.calls.some((c) => c.map(String).join(' ').includes('court unavailable')),
    ).toBe(false);
    // AC5: one failed try + one good try in the route; generation does not look the court up again.
    expect(find).toHaveBeenCalledTimes(2);
    for (const call of find.mock.calls) expect(call[0]).toEqual({ courtId: COURT_ID });
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.status).toBe('completed');
  });

  it('AC5: an active court is looked up once for the whole run, by the route, with no isActive filter', async () => {
    await createActiveCourt(COURT_ID);
    const find = jest.spyOn(Court, 'findOne');
    const res = await generate('bail_regular', BAIL_FORM);
    expect(res.status).toBe(200);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]).toEqual({ courtId: COURT_ID });
  });

  it('an active court: the response stream never carries the raw court id', async () => {
    await createActiveCourt(COURT_ID);
    const res = await generate('bail_regular', BAIL_FORM);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(COURT_ID);
  });
});

describe('T-686 AC1: the required templates, each with an unknown court id', () => {
  const UNKNOWN = 'no_such_court_zzz';
  const cases: Array<[string, string]> = [
    ['bail_regular', 'sessions'],
    ['bail_anticipatory', 'sessions'],
    ['consumer_complaint', 'consumer_commission'],
  ];

  it.each(cases)('%s: refused, zero Ink, no model call', async (templateId, courtType) => {
    const form = fillRequired(templateId, courtType, UNKNOWN);
    const res = await generate(templateId, form);
    // A form that fails its own validation would be a 400 and prove nothing about the court.
    expect(res.status).toBe(503);
    await expectRefusal(res, { courtId: UNKNOWN, reason: 'not_found', kind: templateId });
  });
});

describe('T-686 AC4: a typed court name and an empty court behave as before', () => {
  it('typed free-text court name: generation runs, looked up as before (active filter), no refusal', async () => {
    const typed = 'District and Sessions Court, Patna';
    const find = jest.spyOn(Court, 'findOne');
    const res = await generate('bail_regular', { ...BAIL_FORM, court_name: typed });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    expect(mockMessagesStream).toHaveBeenCalled();
    // The route does not look a typed name up; the draft path does, once, as it always did.
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]).toEqual({ courtId: typed, isActive: true });
    expect(
      errorSpy.mock.calls.some((c) => c.map(String).join(' ').includes('court unavailable')),
    ).toBe(false);
    const u = await User.findById(USER_ID).lean();
    expect(u!.inkTopup).toBeLessThan(START_INK);
  });

  it('typed name that is a single word is not id-shaped: not refused', async () => {
    const res = await generate('bail_regular', { ...BAIL_FORM, court_name: 'Patna' });
    expect(res.status).toBe(200);
  });

  it('empty court: the same 400 validation answer as before, no court lookup, no 503', async () => {
    const find = jest.spyOn(Court, 'findOne');
    const res = await generate('bail_regular', { ...BAIL_FORM, court_name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Form validation failed');
    expect(find).not.toHaveBeenCalled();
    expect(mockMessagesStream).not.toHaveBeenCalled();
    const u = await User.findById(USER_ID).lean();
    expect(u!.inkTopup).toBe(START_INK);
  });
});

describe('T-686 AC6: the annexures pack fails closed the same way', () => {
  async function draftThenBreakCourt(how: 'inactive' | 'deleted') {
    await createActiveCourt(COURT_ID);
    const made = await generate('bail_regular', BAIL_FORM);
    expect(made.status).toBe(200);
    const doc = await LawieDocument.findOne({ userId: USER_ID }).sort({ createdAt: -1 });
    if (!doc) throw new Error('document not saved');
    if (how === 'inactive') await Court.updateOne({ courtId: COURT_ID }, { isActive: false });
    else await Court.deleteOne({ courtId: COURT_ID });
    return doc;
  }

  function pageStub() {
    const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
    return puppeteer
      .launch()
      .then((b: { newPage: () => Promise<{ setContent: jest.Mock }> }) => b.newPage());
  }

  it.each([
    ['inactive', 'inactive'],
    ['deleted', 'not_found'],
  ] as const)('court %s: 503 court_unavailable, nothing rendered', async (how, reason) => {
    const doc = await draftThenBreakCourt(how);
    const page = await pageStub();
    page.setContent.mockClear();
    errorSpy.mockClear();

    const res = await request(app)
      .post(`/${String(doc._id)}/annexures-pack`)
      .set(headers);

    expect(res.status).toBe(503);
    expect(res.body).toEqual(courtUnavailableBody(res.body.runId));
    expect(res.body.error).toBe('court_unavailable');
    expect(res.body.reason).toBe('Court unavailable, try again');
    expect(res.body.retryable).toBe(true);
    expect(page.setContent).not.toHaveBeenCalled();
    const lines = errorSpy.mock.calls
      .map((c) => c.map(String).join(' '))
      .filter((l) => l.includes('court unavailable'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`courtId=${COURT_ID}`);
    expect(lines[0]).toContain(`reason=${reason}`);
    expect(lines[0]).toContain('kind=bail_regular');
    expect(lines[0]).toContain('runId=');
  });

  it('lookup throws twice: 503 (timeout)', async () => {
    const doc = await draftThenBreakCourt('inactive');
    errorSpy.mockClear();
    jest.spyOn(Court, 'findOne').mockImplementation(failingFind as never);
    const res = await request(app)
      .post(`/${String(doc._id)}/annexures-pack`)
      .set(headers);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('court_unavailable');
    expect(
      errorSpy.mock.calls.some((c) => c.map(String).join(' ').includes('reason=timeout')),
    ).toBe(true);
  });

  it('an active court still produces the pack', async () => {
    await createActiveCourt(COURT_ID);
    const made = await generate('bail_regular', BAIL_FORM);
    expect(made.status).toBe(200);
    const doc = await LawieDocument.findOne({ userId: USER_ID }).sort({ createdAt: -1 });
    const res = await request(app)
      .post(`/${String(doc!._id)}/annexures-pack`)
      .set(headers);
    expect(res.status).toBe(200);
  });
});

describe('T-686: resolveFormCourt (unit)', () => {
  it.each([undefined, null, '', '   ', 42, {}])('%p is none', async (v) => {
    const find = jest.spyOn(Court, 'findOne');
    expect(await resolveFormCourt(v)).toEqual({ status: 'none' });
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    'District and Sessions Court, Patna',
    'Patna',
    'Patna_HC',
    'patna__hc',
    '_patna_hc',
    'patna_hc_',
    'patna hc',
  ])('%p is typed (not id-shaped), no lookup', async (v) => {
    const find = jest.spyOn(Court, 'findOne');
    expect(await resolveFormCourt(v)).toEqual({ status: 'typed' });
    expect(find).not.toHaveBeenCalled();
  });

  it('COURT_ID_SHAPE accepts lower-case words joined by underscores', () => {
    for (const ok of ['district_sessions_patna', 'patna_hc', 'a1_b2', 'bihar_civil_junior_patna'])
      expect(COURT_ID_SHAPE.test(ok)).toBe(true);
    for (const no of ['patna', 'Patna_HC', 'patna-hc', 'patna hc', '', '_a_b'])
      expect(COURT_ID_SHAPE.test(no)).toBe(false);
  });

  it('an active row is resolved with the data generation needs', async () => {
    await createActiveCourt('bihar_civil_junior_patna');
    const r = await resolveFormCourt('bihar_civil_junior_patna');
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') return;
    expect(r.court.designation).toBe('IN THE COURT OF CIVIL JUDGE (JUNIOR DIVISION), PATNA');
    expect(r.court.city).toBe('Patna');
    expect(r.court.courtType).toBe('civil_court_junior');
    expect(r.court.formattingRulesRef).toBe('district_court_generic');
    expect(r.court.courtRule).toEqual(loadCourtRule('district_court_generic') ?? undefined);
  });

  it('the id is trimmed before the lookup', async () => {
    await createActiveCourt(COURT_ID);
    const r = await resolveFormCourt(`  ${COURT_ID}\n`);
    expect(r.status).toBe('resolved');
  });

  it('inactive row', async () => {
    await createActiveCourt(COURT_ID, { isActive: false });
    expect(await resolveFormCourt(COURT_ID)).toEqual({ status: 'unavailable', reason: 'inactive' });
  });

  it('no row: not_found, and no retry', async () => {
    const find = jest.spyOn(Court, 'findOne');
    expect(await resolveFormCourt(COURT_ID)).toEqual({
      status: 'unavailable',
      reason: 'not_found',
    });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('one throw then a row: retried, resolved', async () => {
    await createActiveCourt(COURT_ID);
    const realFind = Court.findOne.bind(Court);
    const find = jest
      .spyOn(Court, 'findOne')
      .mockImplementationOnce(failingFind as never)
      .mockImplementation(((...args: Parameters<typeof realFind>) => realFind(...args)) as never);
    expect((await resolveFormCourt(COURT_ID)).status).toBe('resolved');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('one throw then no row: not_found, not timeout', async () => {
    const realFind = Court.findOne.bind(Court);
    jest
      .spyOn(Court, 'findOne')
      .mockImplementationOnce(failingFind as never)
      .mockImplementation(((...args: Parameters<typeof realFind>) => realFind(...args)) as never);
    expect(await resolveFormCourt(COURT_ID)).toEqual({
      status: 'unavailable',
      reason: 'not_found',
    });
  });

  it('two throws: timeout, after exactly two tries', async () => {
    const find = jest.spyOn(Court, 'findOne').mockImplementation(failingFind as never);
    expect(await resolveFormCourt(COURT_ID)).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('the lookup carries the 5 s cap and no isActive filter', async () => {
    const maxTimeMS = jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) });
    const find = jest.spyOn(Court, 'findOne').mockImplementation((() => ({ maxTimeMS })) as never);
    await resolveFormCourt(COURT_ID);
    expect(find).toHaveBeenCalledWith({ courtId: COURT_ID });
    expect(maxTimeMS).toHaveBeenCalledWith(5000);
  });

  it('courtUnavailableBody carries the runId (or null)', () => {
    expect(courtUnavailableBody('r1')).toEqual({
      error: 'court_unavailable',
      code: 'court_unavailable',
      reason: 'Court unavailable, try again',
      retryable: true,
      runId: 'r1',
    });
    expect(courtUnavailableBody(null).runId).toBeNull();
  });
});
