/**
 * T-003 — end-to-end route coverage for POST /generate-from-template:
 * real inputTokens/outputTokens/llmCalls/paragraphCount/costUsd/status on a
 * Generation row, the runId/runSequence system (new run, retry keeps the
 * run and bumps the sequence, a bad run_id silently starts a fresh run),
 * and that spendInk charges the same amount with or without run values.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { sdkAnswer } from './sdkStream';
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});


const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439099';
const OTHER_USER_ID = '507f1f77bcf86cd799439098';

function internalHeaders(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
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

async function seedUser(userId: string) {
  await User.create({
    _id: userId,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000, // 1000 Ink — far more than any one draft costs
  });
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  await AppSetting.create({
    key: 'ai.rates.claude-sonnet-4-5-20250929',
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await seedUser(USER_ID);
});

afterEach(() => {
  mockMessagesStream.mockReset();
  jest.restoreAllMocks();
});

describe('POST /generate-from-template — Generation row fields', () => {
  it('records real usage, status completed, aiModel/transport, and costUsd on success', async () => {
    const fetchMock = mockMessagesStream
      .mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    const runId = res.headers['x-run-id'];
    expect(runId).toBeTruthy();
    expect(res.headers['x-run-sequence']).toBe('1');
    expect(res.text).toContain(`"runId":"${runId}"`);

    const gen = await Generation.findOne({ userId: USER_ID }).sort({ createdAt: -1 }).lean();
    expect(gen).not.toBeNull();
    expect(gen!.status).toBe('completed');
    expect(gen!.templateId).toBe('bail_regular');
    expect(gen!.aiModel).toBe('claude-sonnet-4-5-20250929');
    expect(gen!.transport).toBe('direct');
    expect(gen!.inputTokens).toBe(1000);
    expect(gen!.outputTokens).toBe(200);
    expect(gen!.tokensUsed).toBe(1200);
    expect(gen!.llmCalls).toBe(1);
    expect(gen!.usageSource).toBe('provider');
    expect(gen!.costStatus).toBe('priced');
    expect(gen!.runId).toBe(runId);
    expect(gen!.runSequence).toBe(1);
    expect(gen!.documentId).toBeDefined();
    // (1000/1e6)*3 + (200/1e6)*15 = 0.003 + 0.003 = 0.006
    expect(gen!.costUsd).toBeCloseTo(0.006, 6);

    // The Document that was produced carries the same run — "from a saved
    // draft, find the run that made it" (design §3.8).
    const doc = await LawieDocument.findById(gen!.documentId).lean();
    expect(doc!.runId).toBe(runId);
    expect(doc!.runSequence).toBe(1);
  });

  it('records a failed row with costStatus rate_missing when no rate is configured, and spends no Ink', async () => {
    // A userId unique to this test — spendInk's inkledger write is
    // fire-and-forget (pre-existing, not a T-003 change), so a previous
    // test's write can still be landing when this one runs; sharing a user
    // id with another test would make this assertion racy.
    const freshUserId = '507f1f77bcf86cd799439090';
    await seedUser(freshUserId);
    await AppSetting.deleteOne({ key: 'ai.rates.claude-sonnet-4-5-20250929' });
    const fetchMock = mockMessagesStream
      .mockRejectedValue(new Error('503 service unavailable'));

    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders(freshUserId))
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');

    const gen = await Generation.findOne({ userId: freshUserId }).sort({ createdAt: -1 }).lean();
    expect(gen!.status).toBe('failed');
    expect(gen!.llmCalls).toBe(1);
    expect(gen!.costUsd).toBe(0);
    expect(gen!.costStatus).toBe('rate_missing');
    expect(gen!.paragraphCount).toBe(0);

    const inkRow = await mongoose.connection
      .db!.collection('inkledger')
      .findOne({ userId: new mongoose.Types.ObjectId(freshUserId) });
    expect(inkRow).toBeNull(); // no ink spent on a failed attempt

    const user = await User.findById(freshUserId).lean();
    expect(user!.inkTopup).toBe(2000); // unchanged
  });
});

describe('POST /generate-from-template — run id / run sequence (T-003 §3.8)', () => {
  it("a retry with the failed attempt's run_id gets the same runId and sequence 2", async () => {
    const fetchMock = mockMessagesStream;
    // Attempt 1: fails.
    fetchMock.mockRejectedValueOnce(new Error('503 service unavailable'));

    const first = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });
    const runId = first.headers['x-run-id'];
    expect(first.headers['x-run-sequence']).toBe('1');

    // Attempt 2: retry, sends run_id, succeeds.
    fetchMock.mockResolvedValueOnce(sdkAnswer('1. Body.', 500, 100));
    const second = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA, run_id: runId });

    expect(second.headers['x-run-id']).toBe(runId);
    expect(second.headers['x-run-sequence']).toBe('2');

    const rows = await Generation.find({ runId }).sort({ runSequence: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ runSequence: 1, status: 'failed' });
    expect(rows[1]).toMatchObject({ runSequence: 2, status: 'completed' });
  });

  it('a third attempt after a completed run starts a new run at sequence 1', async () => {
    const fetchMock = mockMessagesStream.mockResolvedValue(sdkAnswer('1. Body.', 500, 100));

    const first = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders())
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });
    const completedRunId = first.headers['x-run-id'];
    expect(first.headers['x-run-sequence']).toBe('1');

    // Re-sends the completed run's id — the run already has a completed
    // attempt, so the server quietly starts a brand new run at 1.
    const second = await request(app).post('/generate-from-template').set(internalHeaders()).send({
      template_id: 'bail_regular',
      form_data: VALID_BAIL_FORM_DATA,
      run_id: completedRunId,
    });

    expect(second.status).toBe(200);
    expect(second.headers['x-run-id']).not.toBe(completedRunId);
    expect(second.headers['x-run-sequence']).toBe('1');
  });

  it('an unknown run_id starts a new run at 1 without an error', async () => {
    const fetchMock = mockMessagesStream.mockResolvedValue(sdkAnswer('1. Body.', 500, 100));

    const res = await request(app).post('/generate-from-template').set(internalHeaders()).send({
      template_id: 'bail_regular',
      form_data: VALID_BAIL_FORM_DATA,
      run_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(res.status).toBe(200);
    expect(res.headers['x-run-id']).not.toBe('00000000-0000-4000-8000-000000000000');
    expect(res.headers['x-run-sequence']).toBe('1');
  });

  it("another user's run_id is rejected — starts a new run, never reuses someone else's run", async () => {
    await seedUser(OTHER_USER_ID);
    const fetchMock = mockMessagesStream;
    fetchMock.mockRejectedValueOnce(new Error('503 service unavailable'));

    const otherUsersFailedAttempt = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders(OTHER_USER_ID))
      .send({ template_id: 'bail_regular', form_data: VALID_BAIL_FORM_DATA });
    const otherUsersRunId = otherUsersFailedAttempt.headers['x-run-id'];

    fetchMock.mockResolvedValueOnce(sdkAnswer('1. Body.', 500, 100));
    const res = await request(app)
      .post('/generate-from-template')
      .set(internalHeaders(USER_ID))
      .send({
        template_id: 'bail_regular',
        form_data: VALID_BAIL_FORM_DATA,
        run_id: otherUsersRunId,
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-run-id']).not.toBe(otherUsersRunId);
    expect(res.headers['x-run-sequence']).toBe('1');
  });

  it('the browser cannot set the sequence — run_sequence in the body is ignored', async () => {
    const fetchMock = mockMessagesStream.mockResolvedValue(sdkAnswer('1. Body.', 500, 100));

    const res = await request(app).post('/generate-from-template').set(internalHeaders()).send({
      template_id: 'bail_regular',
      form_data: VALID_BAIL_FORM_DATA,
      run_sequence: 99, // not a real field — schema doesn't accept it
    });

    expect(res.status).toBe(200);
    expect(res.headers['x-run-sequence']).toBe('1');
  });
});

describe('spendInk — run id/sequence do not change the amount charged', () => {
  it('charges the same amount with and without runId/runSequence', async () => {
    const { spendInk } = await import('../services/credits.service');

    await seedUser('507f1f77bcf86cd799439097');
    const withoutRun = await spendInk({
      userId: '507f1f77bcf86cd799439097',
      costCredits: 2,
      reason: 'generate',
    });
    expect(withoutRun.success).toBe(true);
    const afterWithout = await User.findById('507f1f77bcf86cd799439097').lean();

    await seedUser('507f1f77bcf86cd799439096');
    const withRun = await spendInk({
      userId: '507f1f77bcf86cd799439096',
      costCredits: 2,
      reason: 'generate',
      runId: 'some-run-id',
      runSequence: 1,
    });
    expect(withRun.success).toBe(true);
    const afterWith = await User.findById('507f1f77bcf86cd799439096').lean();

    // Same starting balance (2000), same cost (2 Ink = 4 units) — same result.
    expect(afterWith!.inkTopup).toBe(afterWithout!.inkTopup);

    const rowWithRun = await mongoose.connection
      .db!.collection('inkledger')
      .findOne({ userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439096') });
    expect(rowWithRun!.runId).toBe('some-run-id');
    expect(rowWithRun!.runSequence).toBe(1);

    const rowWithoutRun = await mongoose.connection
      .db!.collection('inkledger')
      .findOne({ userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439097') });
    // The native MongoDB driver stores an explicit `undefined` field as BSON
    // null rather than omitting it — not absent, but still "no run value".
    expect(rowWithoutRun!.runId).toBeNull();
  });
});
