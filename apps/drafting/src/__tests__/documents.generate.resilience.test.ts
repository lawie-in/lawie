/**
 * T-003 — two correctness fixes found by an independent code-review pass:
 *
 * 1. A concurrent duplicate Generation.create() (same runId+runSequence,
 *    e.g. a double-sent retry) must not cause a double Ink spend.
 * 2. A non-GenerationFailedError failure (anything thrown outside the LLM
 *    call itself) must still save a failed Generation row, since a runId
 *    was already issued and handed to the client.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { recordGeneration } from '../routes/documents.routes';
import { _clearAppSettingsCache } from '../services/app-settings.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439095';

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

beforeEach(async () => {
  _clearAppSettingsCache();
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

describe('recordGeneration — duplicate (runId, runSequence)', () => {
  it('returns duplicate: true instead of throwing when another request already recorded this attempt', async () => {
    await Generation.create({
      userId: USER_ID,
      docType: 'petition',
      status: 'completed',
      tokensUsed: 10,
      runId: 'race-run-id',
      runSequence: 1,
    });

    const result = await recordGeneration({
      userId: USER_ID,
      docType: 'petition',
      status: 'completed',
      usage: { inputTokens: 5, outputTokens: 5, llmCalls: 1, usageSource: 'provider' },
      paragraphCount: 1,
      durationMs: 100,
      runId: 'race-run-id',
      runSequence: 1, // same pair as the row above — real unique-index collision
    });

    expect(result).toEqual({ duplicate: true });
    // Only the original row exists — the second insert was rejected, not silently duplicated.
    const rows = await Generation.find({ runId: 'race-run-id' }).lean();
    expect(rows).toHaveLength(1);
  });

  it('returns duplicate: false and saves normally for a non-conflicting pair', async () => {
    const result = await recordGeneration({
      userId: USER_ID,
      docType: 'petition',
      status: 'completed',
      usage: { inputTokens: 5, outputTokens: 5, llmCalls: 1, usageSource: 'provider' },
      paragraphCount: 1,
      durationMs: 100,
      runId: 'fresh-run-id',
      runSequence: 1,
    });
    expect(result).toEqual({ duplicate: false });
  });
});

describe('POST /generate-from-template — duplicate attempt does not double-spend Ink', () => {
  it('skips spendInk when the Generation insert collides with a concurrent request', async () => {
    env.HELICONE_API_KEY = 'test-helicone-key';
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });

    const encoder = new TextEncoder();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        pull(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: '1. Body.' } }] })}\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n`,
            ),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n'));
          controller.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Simulate the race directly: make this request's own Generation.create
    // call fail exactly like a real unique-index collision would when a
    // concurrent duplicate request wins first.
    const duplicateKeyError = Object.assign(
      new Error('E11000 duplicate key error collection: generations index: runId_1_runSequence_1'),
      { code: 11000 },
    );
    jest.spyOn(Generation, 'create').mockRejectedValueOnce(duplicateKeyError as never);

    const balanceBefore = (await User.findById(USER_ID).lean())!.inkTopup;

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({
        template_id: 'bail_regular',
        form_data: {
          fir_number: '1/2026',
          fir_date: '2026-01-01',
          police_station: 'Test PS',
          sections_charged: ['103'],
          currently_in_custody: 'no',
          state: 'bihar',
          court_type: 'sessions',
          court_name: 'test_court',
          applicant_name: 'Test Applicant',
          father_name: 'Test Father',
          applicant_age: '30',
          address: 'Test Address',
          language: 'en',
          facts_narrative:
            'The accused was falsely implicated due to a long-running family dispute.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');

    // No Generation row exists from this request (the insert "lost" the
    // race) and, crucially, no Ink was taken for it either.
    const balanceAfter = (await User.findById(USER_ID).lean())!.inkTopup;
    expect(balanceAfter).toBe(balanceBefore);
  });
});

describe('POST /generate-from-template — non-LLM failure still saves a failed Generation row', () => {
  it('saves a failed row with the issued runId when the pipeline throws a plain Error', async () => {
    const aiService = await import('../services/ai.service');
    jest
      .spyOn(aiService, 'streamGenerateFromTemplate')
      .mockRejectedValueOnce(new Error('template-config bug, not an LLM failure'));

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({
        template_id: 'bail_regular',
        form_data: {
          fir_number: '1/2026',
          fir_date: '2026-01-01',
          police_station: 'Test PS',
          sections_charged: ['103'],
          currently_in_custody: 'no',
          state: 'bihar',
          court_type: 'sessions',
          court_name: 'test_court',
          applicant_name: 'Test Applicant',
          father_name: 'Test Father',
          applicant_age: '30',
          address: 'Test Address',
          language: 'en',
          facts_narrative:
            'The accused was falsely implicated due to a long-running family dispute.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });

    const runId = res.headers['x-run-id'];
    expect(runId).toBeTruthy();

    const gen = await Generation.findOne({ runId }).lean();
    expect(gen).not.toBeNull();
    expect(gen!.status).toBe('failed');
    expect(gen!.tokensUsed).toBe(0);
    expect(gen!.runSequence).toBe(1);

    // No Ink should have been spent for a failure.
    const user = await User.findById(USER_ID).lean();
    expect(user!.inkTopup).toBe(2000);
  });
});
