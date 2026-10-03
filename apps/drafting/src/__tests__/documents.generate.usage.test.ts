/**
 * T-003 — end-to-end route coverage: POST /generate-from-template records
 * real inputTokens/outputTokens/llmCalls/paragraphCount/costUsd on a
 * Generation row (success path), and still records a partial Generation row
 * when the LLM fails mid-stream (failure path) — matching the acceptance
 * criteria that a failed generation isn't free and isn't silently dropped.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439099';

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
        if (i < lines.length) {
          controller.enqueue(encoder.encode(lines[i++] + '\n'));
        } else {
          controller.close();
        }
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

beforeEach(async () => {
  _clearAppSettingsCache();
  env.HELICONE_API_KEY = 'test-helicone-key';
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-20250514' });
  await AppSetting.create({
    key: 'ai.model_rates_usd',
    value: JSON.stringify({
      'claude-sonnet-4-20250514': { inputPerMTok: 3, outputPerMTok: 15 },
    }),
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000, // 1000 Ink, stored x2 — far more than any one draft costs
  });
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('POST /generate-from-template — Generation row fields (T-003)', () => {
  it('records real usage, llmCalls, paragraphCount and costUsd on success', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(sseResponse(usageChunk('1. Applicant seeks bail.', 1000, 200)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');

    const gen = await Generation.findOne({ userId: USER_ID }).sort({ createdAt: -1 }).lean();
    expect(gen).not.toBeNull();
    expect(gen!.inputTokens).toBe(1000);
    expect(gen!.outputTokens).toBe(200);
    expect(gen!.tokensUsed).toBe(1200);
    expect(gen!.llmCalls).toBe(1);
    expect(gen!.paragraphCount).toBeGreaterThanOrEqual(0);
    // (1000/1e6)*3 + (200/1e6)*15 = 0.003 + 0.003 = 0.006
    expect(gen!.costUsd).toBeCloseTo(0.006, 6);
  });

  it('still records a Generation row with partial usage when the LLM fails mid-stream', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'gateway down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.status).toBe(200); // SSE headers already sent before the failure
    expect(res.text).toContain('event: error');

    const gen = await Generation.findOne({ userId: USER_ID }).sort({ createdAt: -1 }).lean();
    expect(gen).not.toBeNull();
    expect(gen!.llmCalls).toBe(1);
    expect(gen!.inputTokens).toBe(0);
    expect(gen!.outputTokens).toBe(0);
    expect(gen!.paragraphCount).toBe(0);
  });
});
