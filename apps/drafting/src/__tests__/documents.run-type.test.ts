/**
 * T-110 — every Generation row stores runType ('initial' | 'revision').
 *
 * Covers: a first draft, a failed draft, a retry (keeps the retried
 * attempt's runType), rows written before T-110 (read as 'initial'), the
 * Helicone-Property-Run-Type header, and the legacy /generate route.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { effectiveRunType, Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { resolveRun } from '../routes/documents.routes';
import { _clearAppSettingsCache } from '../services/app-settings.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439081';

function internalHeaders() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
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

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: new ReadableStream({
      pull(controller) {
        if (i < lines.length) controller.enqueue(encoder.encode(lines[i++] + '\n'));
        else controller.close();
      },
    }),
  };
}

function usageChunk(text: string, promptTokens: number, completionTokens: number): string[] {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } })}`,
    'data: [DONE]',
  ];
}

function headersOfCall(fetchMock: jest.Mock, n: number): Record<string, string> {
  const init = fetchMock.mock.calls[n][1] as { headers?: Record<string, string> };
  return init.headers ?? {};
}

beforeEach(async () => {
  _clearAppSettingsCache();
  env.HELICONE_API_KEY = 'test-helicone-key';
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  await AppSetting.create({
    key: 'ai.rates.claude-sonnet-4-5-20250929',
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
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
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('T-110 — runType on /generate-from-template', () => {
  it('a first draft writes runType initial and sends Helicone-Property-Run-Type', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sseResponse(usageChunk('1. Body.', 500, 100)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.status).toBe('completed');
    expect(gen!.runType).toBe('initial');

    expect(fetchMock).toHaveBeenCalled();
    for (let i = 0; i < fetchMock.mock.calls.length; i++) {
      expect(headersOfCall(fetchMock, i)['Helicone-Property-Run-Type']).toBe('initial');
    }
  });

  it('a failed draft writes runType initial on the failed row', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.text).toContain('event: error');
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.status).toBe('failed');
    expect(gen!.runType).toBe('initial');
  });

  it('a retry after a failure keeps runType and the run', async () => {
    const fetchMock = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });
    const runId = first.headers['x-run-id'];

    fetchMock.mockResolvedValueOnce(sseResponse(usageChunk('1. Body.', 500, 100)));
    const second = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA, run_id: runId });

    expect(second.headers['x-run-sequence']).toBe('2');
    const rows = await Generation.find({ runId }).sort({ runSequence: 1 }).lean();
    expect(rows.map((r) => [r.runSequence, r.status, r.runType])).toEqual([
      [1, 'failed', 'initial'],
      [2, 'completed', 'initial'],
    ]);
    expect(headersOfCall(fetchMock, 1)['Helicone-Property-Run-Type']).toBe('initial');
  });
});

describe('T-110 — runType on the legacy /generate route', () => {
  it('writes runType initial', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(sseResponse(usageChunk('1. The petitioner submits.', 400, 80)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app).post('/generate').set(internalHeaders()).send({
      docType: 'petition',
      courtName: 'Patna High Court',
      courtType: 'high_court',
      keyFacts: 'The petitioner was denied a ration card without reason.',
      reliefPrayer: 'Issue the ration card.',
    });

    expect(res.status).toBe(200);
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen).not.toBeNull();
    expect(gen!.runType).toBe('initial');
    expect(headersOfCall(fetchMock, 0)['Helicone-Property-Run-Type']).toBe('initial');
  });
});

describe('T-110 — rows written before this ticket', () => {
  it('effectiveRunType reads a row without runType as initial', () => {
    expect(effectiveRunType({})).toBe('initial');
    expect(effectiveRunType({ runType: undefined })).toBe('initial');
    expect(effectiveRunType({ runType: 'revision' })).toBe('revision');
  });

  it('a retry of a pre-T-110 failed row resolves to initial', async () => {
    await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      templateId: 'bail_regular',
      status: 'failed',
      tokensUsed: 0,
      runId: '11111111-1111-4111-8111-111111111111',
      runSequence: 1,
    });
    const r = await resolveRun(
      USER_ID,
      { templateId: 'bail_regular' },
      '11111111-1111-4111-8111-111111111111',
    );
    expect(r).toEqual({
      runId: '11111111-1111-4111-8111-111111111111',
      runSequence: 2,
      runType: 'initial',
    });
  });

  it('a retry keeps revision when the retried attempt was a revision', async () => {
    const runId = '22222222-2222-4222-8222-222222222222';
    await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      templateId: 'bail_regular',
      status: 'failed',
      tokensUsed: 0,
      runId,
      runSequence: 3,
      runType: 'revision',
    });
    const r = await resolveRun(USER_ID, { templateId: 'bail_regular' }, runId);
    expect(r).toEqual({ runId, runSequence: 4, runType: 'revision' });
  });

  it('rejects a runType outside initial and revision', async () => {
    await expect(
      Generation.create({
        userId: USER_ID,
        docType: 'petition',
        tokensUsed: 0,
        runType: 'review' as unknown as 'initial',
      }),
    ).rejects.toThrow();
  });
});
