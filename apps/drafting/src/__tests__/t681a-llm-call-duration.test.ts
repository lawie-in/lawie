/**
 * T-681a — every llm_call record carries duration_ms (whole ms, >= 0) and
 * started_at (ISO), on the streaming path (streamLLM), the non-streaming
 * paths (D1 messages.parse, preflight messages.create) and the intake call,
 * completed and failed. No queue_ms (there is no rate limiter). Timing is
 * controlled: Date.now is shifted by a test-owned offset that the stubbed SDK
 * advances, so no real waiting. run_id is out of scope (deferred).
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';

const mockStream = jest.fn();
const mockParse = jest.fn();
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      stream: (...a: unknown[]) => mockStream(...a),
      parse: (...a: unknown[]) => mockParse(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  })),
}));

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { streamGenerateFromBrief, streamLLM } from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { runIntake } from '../services/intake.service';
import {
  _clearAiEffortCache,
  LlmCallRecord,
  logLlmCall,
  setLlmCallListener,
  setLlmLogFixtureId,
} from '../services/llm-usage';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { loadFixtureSkeleton, regularBase } from './fixtures/t373';
import { asyncIterable } from './sdkStream';

const SECRET = 'ZZ-SECRET-T681A-Ramesh-Kumar';
const STEP = 250;

// ── controlled clock: real time plus an offset the stubs advance ────────────
const realNow = Date.now.bind(Date);
let offset = 0;
const advance = (ms: number) => {
  offset += ms;
};

let records: LlmCallRecord[] = [];

function expectTiming(r: LlmCallRecord, beforeMs: number, afterMs: number, minDuration: number) {
  expect(Number.isInteger(r.duration_ms)).toBe(true);
  expect(r.duration_ms).toBeGreaterThanOrEqual(minDuration);
  expect(typeof r.started_at).toBe('string');
  expect(r.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(new Date(r.started_at).toISOString()).toBe(r.started_at);
  // started_at is taken before the request: it cannot be later than the end.
  const started = Date.parse(r.started_at);
  expect(started).toBeGreaterThanOrEqual(beforeMs);
  expect(started + r.duration_ms).toBeLessThanOrEqual(afterMs);
  expect(r).not.toHaveProperty('queue_ms');
}

const okEvents = () => [
  { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: '{}' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
];

/** A stream whose last event arrives STEP ms after the request began. */
async function* slowEvents() {
  const evs = okEvents();
  for (let i = 0; i < evs.length; i++) {
    if (i === evs.length - 1) advance(STEP);
    yield evs[i];
  }
}

beforeEach(() => {
  offset = 0;
  records = [];
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  _clearAppSettingsCache();
  _clearAiEffortCache();
  mockStream.mockReset();
  mockParse.mockReset();
  mockCreate.mockReset();
  setLlmLogFixtureId(null);
  setLlmCallListener((r) => records.push(r));
});

afterEach(() => {
  setLlmCallListener(null);
  jest.restoreAllMocks();
});

describe('logLlmCall duration_ms / started_at (unit)', () => {
  const base = {
    stage: 'body',
    call: 'stream',
    model: 'm',
    effort: 'low',
    status: 'completed',
  } as const;
  const last = () => records[records.length - 1] as unknown as Record<string, unknown>;

  it('emits duration_ms and started_at, in the logger line and to the listener', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    logLlmCall({ ...base, startedAt: Date.UTC(2026, 9, 30, 1, 2, 3, 4), durationMs: 120 });
    const line = info.mock.calls[0][0] as Record<string, unknown>;
    expect(line.duration_ms).toBe(120);
    expect(line.started_at).toBe('2026-10-30T01:02:03.004Z');
    expect(last().duration_ms).toBe(120);
    expect(last().started_at).toBe('2026-10-30T01:02:03.004Z');
  });

  it('rounds to whole ms', () => {
    logLlmCall({ ...base, startedAt: 1000, durationMs: 12.4 });
    expect(last().duration_ms).toBe(12);
    logLlmCall({ ...base, startedAt: 1000, durationMs: 12.6 });
    expect(last().duration_ms).toBe(13);
  });

  it.each([[-5], [-0.4], [NaN], [Infinity], [-Infinity]])('duration %p becomes 0', (d) => {
    logLlmCall({ ...base, startedAt: 1000, durationMs: d });
    expect(last().duration_ms).toBe(0);
  });

  it('keeps 0 as 0', () => {
    logLlmCall({ ...base, startedAt: 1000, durationMs: 0 });
    expect(last().duration_ms).toBe(0);
  });

  it('never throws for a bad startedAt; started_at is still an ISO string', () => {
    for (const s of [NaN, Infinity, 8.64e15 + 1, -1e20]) {
      expect(() => logLlmCall({ ...base, startedAt: s, durationMs: 1 })).not.toThrow();
      const r = last();
      expect(typeof r.started_at).toBe('string');
      expect(new Date(r.started_at as string).toISOString()).toBe(r.started_at);
    }
  });

  it('has no queue_ms key and no content keys', () => {
    logLlmCall({
      ...base,
      startedAt: 1000,
      durationMs: 5,
      ...({ prompt: SECRET, draft: SECRET, queueMs: 9, queue_ms: 9 } as object),
    });
    const keys = Object.keys(last());
    expect(keys).not.toContain('queue_ms');
    expect(keys).not.toContain('queueMs');
    expect(keys).not.toContain('prompt');
    expect(keys).not.toContain('draft');
    expect(JSON.stringify(records)).not.toContain(SECRET);
  });
});

describe('streaming body path (streamLLM)', () => {
  beforeEach(async () => {
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
    _clearAppSettingsCache();
  });

  it('completed: duration spans request start to the final chunk', async () => {
    mockStream.mockImplementation(async () => slowEvents());
    const before = realNow() + offset;
    for await (const _ of streamLLM('s', SECRET, 100)) void _;
    const after = realNow() + offset;
    const r = records.filter((x) => x.stage === 'body' && x.call === 'stream');
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('completed');
    expectTiming(r[0], before, after, STEP);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('failed: duration and started_at are still set', async () => {
    mockStream.mockImplementation(async () => {
      advance(STEP);
      throw new Error('boom');
    });
    const before = realNow() + offset;
    await expect(
      (async () => {
        for await (const _ of streamLLM('s', 'u', 10)) void _;
      })(),
    ).rejects.toThrow('boom');
    const after = realNow() + offset;
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('failed');
    expectTiming(records[0], before, after, STEP);
  });

  it('the logger line (what prod reads) carries the same fields', async () => {
    const info = logger.info as unknown as jest.SpyInstance;
    mockStream.mockImplementation(async () => slowEvents());
    for await (const _ of streamLLM('s', 'u', 10)) void _;
    const line = info.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((o) => o?.event === 'llm_call')!;
    expect(Number.isInteger(line.duration_ms)).toBe(true);
    expect(line.duration_ms as number).toBeGreaterThanOrEqual(STEP);
    expect(typeof line.started_at).toBe('string');
    expect(line).not.toHaveProperty('queue_ms');
  });
});

describe('non-streaming paths', () => {
  const skeleton = loadFixtureSkeleton('bail_regular');
  const pack = loadRulePack('bail_regular')!;

  async function runD1() {
    const facts = regularBase();
    const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: facts.filter((f) => f.key !== 'grounds_for_bail').map((f) => u(f.key, f.display)),
    });
    const res = {
      setHeader: jest.fn(),
      write: jest.fn(() => true),
      end: jest.fn(),
      headersSent: false,
    };
    try {
      await streamGenerateFromBrief(
        {
          pack,
          templateConfig: loadTemplateConfig('bail_regular')!,
          brief,
          ledger: { facts, lists: loadAvermentLists('bail_regular') },
          language: 'en',
          targetParagraphs: 12,
          advocateName: 'Test Advocate',
          userId: 'u1',
          runId: 'run-77',
          runSequence: 1,
          runType: 'initial',
          loadSkeleton: () => skeleton,
        },
        res as unknown as Response,
      );
    } catch {
      // A null parsed_output ends in an error; only the logged call matters here.
    }
  }

  it('D1 (messages.parse) completed', async () => {
    mockParse.mockImplementation(async () => {
      advance(STEP);
      return {
        parsed_output: null,
        content: [],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 9, output_tokens: 4 },
      };
    });
    const before = realNow() + offset;
    await runD1();
    const after = realNow() + offset;
    const r = records.filter((x) => x.call === 'd1');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].status).toBe('completed');
    expectTiming(r[0], before, after, STEP);
  });

  it('D1 (messages.parse) failed', async () => {
    mockParse.mockImplementation(async () => {
      advance(STEP);
      throw new Error('api down');
    });
    const before = realNow() + offset;
    await runD1();
    const after = realNow() + offset;
    const r = records.filter((x) => x.call === 'd1');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].status).toBe('failed');
    expectTiming(r[0], before, after, STEP);
  });

  const PREFLIGHT_DATA: Record<string, unknown> = {
    court_name: 'patna_hc',
    applicant_name: 'Ramesh Kumar',
    father_name: 'Suresh Kumar',
    respondent_name: 'State of Bihar',
    applicant_age: 35,
    sections_charged: ['103', '109'],
    fir_number: '091/2024',
    fir_date: '15.06.2024',
    incident_date: '10.06.2024',
    facts_narrative:
      'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
  };

  beforeEach(async () => {
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
    await AppSetting.create({ key: 'ai.preflight_model', value: 'claude-haiku-4-5-20251001' });
    await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
    _clearAppSettingsCache();
  });

  it('preflight (messages.create) completed', async () => {
    mockCreate.mockImplementation(async () => {
      advance(STEP);
      return {
        content: [{ type: 'text', text: '{"unusual":false,"hard_block":false,"findings":[]}' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
      };
    });
    const before = realNow() + offset;
    await preflightCheck('bail_anticipatory', PREFLIGHT_DATA);
    const after = realNow() + offset;
    const r = records.filter((x) => x.stage === 'preflight');
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('completed');
    expectTiming(r[0], before, after, STEP);
  });

  it('preflight (messages.create) failed', async () => {
    mockCreate.mockImplementation(async () => {
      advance(STEP);
      throw new Error('boom');
    });
    const before = realNow() + offset;
    await preflightCheck('bail_anticipatory', PREFLIGHT_DATA).catch(() => undefined);
    const after = realNow() + offset;
    const r = records.filter((x) => x.stage === 'preflight');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].status).toBe('failed');
    expectTiming(r[0], before, after, STEP);
  });

  it('intake aux call completed', async () => {
    mockStream.mockImplementation(async () => slowEvents());
    const before = realNow() + offset;
    await runIntake({
      userId: '507f1f77bcf86cd799439081',
      plan: 'free',
      description: SECRET,
      intakeId: 'intake-681',
    });
    const after = realNow() + offset;
    const r = records.filter((x) => x.stage === 'intake');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].status).toBe('completed');
    expectTiming(r[0], before, after, STEP);
    expect(JSON.stringify(records)).not.toContain(SECRET);
  });

  it('intake aux call failed', async () => {
    mockStream.mockImplementation(async () => {
      advance(STEP);
      throw new Error('boom');
    });
    const before = realNow() + offset;
    await runIntake({
      userId: '507f1f77bcf86cd799439082',
      plan: 'free',
      description: 'x',
      intakeId: 'intake-682',
    }).catch(() => undefined);
    const after = realNow() + offset;
    const r = records.filter((x) => x.stage === 'intake');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].status).toBe('failed');
    expectTiming(r[0], before, after, STEP);
  });
});

void asyncIterable;
