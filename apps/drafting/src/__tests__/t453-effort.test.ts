/**
 * T-453 — output_config.effort per stage, the llm_call log line, the stop_reason
 * read, and the preflight text-block fix. SDK stubbed; AppSetting on the
 * in-memory Mongo. No real model call.
 */
import './setupEnv';
import './setupDb';

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

import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { callAuxModel } from '../services/aux-llm';
import { streamLLM } from '../services/ai.service';
import { _clearAppSettingsCache, APP_SETTING_KEYS } from '../services/app-settings.service';
import { runIntake } from '../services/intake.service';
import {
  AI_EFFORT_DEFAULTS,
  getAiEffort,
  LlmCallRecord,
  logLlmCall,
  parseAnthropicStreamEvent,
  setLlmCallListener,
  setLlmLogFixtureId,
} from '../services/llm-usage';
import { preflightCheck } from '../services/preflight.service';
import { asyncIterable } from './sdkStream';

const SECRET_PROMPT = 'ZZ-SECRET-PROMPT-TEXT-Ramesh-Kumar-FIR-091';

async function setKey(key: string, value: string) {
  await AppSetting.create({ key, value });
  _clearAppSettingsCache();
}

function llmCallLines(spy: jest.SpyInstance): Record<string, unknown>[] {
  return spy.mock.calls
    .filter((c) => (c[0] as { event?: string })?.event === 'llm_call')
    .map((c) => c[0] as Record<string, unknown>);
}

function noForbiddenParams(params: Record<string, unknown>) {
  const s = JSON.stringify(params);
  expect(params).not.toHaveProperty('thinking');
  expect(params).not.toHaveProperty('budget_tokens');
  expect(s).not.toContain('budget_tokens');
  expect(s).not.toContain('"thinking"');
}

beforeEach(() => {
  _clearAppSettingsCache();
  mockStream.mockReset();
  mockParse.mockReset();
  mockCreate.mockReset();
  setLlmLogFixtureId(null);
  setLlmCallListener(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const okStream = (stop = 'end_turn') =>
  asyncIterable([
    {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 0,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 7,
        },
      },
    },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 55 } },
  ]);

// ── (a) getAiEffort ─────────────────────────────────────────────────────────

describe('getAiEffort', () => {
  it('returns the default per stage when the key is missing', async () => {
    expect(await getAiEffort('intake')).toBe('medium');
    expect(await getAiEffort('preflight')).toBe('low');
    expect(await getAiEffort('body')).toBe('medium');
    expect(AI_EFFORT_DEFAULTS).toEqual({ intake: 'medium', preflight: 'low', body: 'medium' });
  });

  it('returns the default when the settings read fails', async () => {
    const svc = jest.requireActual('../services/app-settings.service');
    jest.spyOn(AppSetting, 'findOne').mockImplementation(() => {
      throw new Error('db down');
    });
    _clearAppSettingsCache();
    expect(svc).toBeDefined();
    expect(await getAiEffort('body')).toBe('medium');
    expect(await getAiEffort('intake')).toBe('medium');
  });

  it('uses a valid value per stage', async () => {
    await setKey(APP_SETTING_KEYS.EFFORT_INTAKE, 'high');
    await setKey(APP_SETTING_KEYS.EFFORT_PREFLIGHT, 'max');
    await setKey(APP_SETTING_KEYS.EFFORT_BODY, 'xhigh');
    expect(await getAiEffort('intake')).toBe('high');
    expect(await getAiEffort('preflight')).toBe('max');
    expect(await getAiEffort('body')).toBe('xhigh');
  });

  it('falls back with a warn that names the key only when the value is invalid', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await setKey(APP_SETTING_KEYS.EFFORT_BODY, 'turbo-9000');
    expect(await getAiEffort('body')).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(1);
    const [payload, msg] = warn.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(payload).toEqual({ key: 'ai.effort.body' });
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('turbo-9000');
    expect(msg).not.toContain('turbo-9000');
  });
});

// ── (b) call sites send output_config.effort ────────────────────────────────

describe('call sites send output_config.effort', () => {
  it('aux-llm sends the effort it is given, and nothing else of thinking', async () => {
    mockStream.mockResolvedValue(okStream());
    await callAuxModel({ model: 'm', system: 's', user: 'u', maxTokens: 50, effort: 'high' });
    const p = mockStream.mock.calls[0][0];
    expect(p.output_config).toEqual({ effort: 'high' });
    noForbiddenParams(p);
  });

  it('aux-llm omits output_config when no effort is given', async () => {
    mockStream.mockResolvedValue(okStream());
    await callAuxModel({ model: 'm', system: 's', user: 'u', maxTokens: 50 });
    expect(mockStream.mock.calls[0][0]).not.toHaveProperty('output_config');
  });

  it('aux-llm returns cache counts and stop reason', async () => {
    mockStream.mockResolvedValue(okStream('max_tokens'));
    const r = await callAuxModel({ model: 'm', system: 's', user: 'u', maxTokens: 50 });
    expect(r.stopReason).toBe('max_tokens');
    expect(r.cacheReadInputTokens).toBe(30);
    expect(r.cacheCreationInputTokens).toBe(7);
    expect(r.outputTokens).toBe(55);
  });

  it('intake (runIntake) sends the ai.effort.intake value (default medium), logs llm_call with intake_id and no description text', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
    mockStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: '{}' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      ]),
    );
    const r = await runIntake({
      userId: '507f1f77bcf86cd799439071',
      plan: 'free',
      description: SECRET_PROMPT,
      intakeId: 'intake-xyz',
    });
    expect(r.intake_id).toBe('intake-xyz');
    expect(mockStream).toHaveBeenCalled();
    const p = mockStream.mock.calls[0][0];
    expect(p.output_config).toEqual({ effort: 'medium' });
    noForbiddenParams(p);
    const lines = llmCallLines(info);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toMatchObject({
      stage: 'intake',
      call: 'intake_match',
      effort: 'medium',
      status: 'completed',
      stop_reason: 'end_turn',
      intake_id: 'intake-xyz',
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(SECRET_PROMPT);
  });

  it('intake sends a configured effort', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
    await setKey(APP_SETTING_KEYS.EFFORT_INTAKE, 'medium');
    mockStream.mockResolvedValue(okStream());
    await runIntake({ userId: '507f1f77bcf86cd799439072', plan: 'free', description: 'x' });
    expect(mockStream.mock.calls[0][0].output_config).toEqual({ effort: 'medium' });
  });

  it('streamLLM sends the ai.effort.body value (default medium), and the configured one', async () => {
    await setKey('ai.drafting_model', 'claude-sonnet-4-5-20250929');
    mockStream.mockResolvedValue(okStream());
    for await (const _ of streamLLM('sys', 'usr', 100)) void _;
    expect(mockStream.mock.calls[0][0].output_config).toEqual({ effort: 'medium' });
    noForbiddenParams(mockStream.mock.calls[0][0]);

    await setKey(APP_SETTING_KEYS.EFFORT_BODY, 'high');
    mockStream.mockResolvedValue(okStream());
    for await (const _ of streamLLM('sys', 'usr', 100)) void _;
    expect(mockStream.mock.calls[1][0].output_config).toEqual({ effort: 'high' });
  });

  it('streamLLM logs one llm_call per call with stage body, call stream, stop reason and tokens', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await setKey('ai.drafting_model', 'claude-sonnet-4-5-20250929');
    mockStream.mockResolvedValue(okStream('max_tokens'));
    for await (const _ of streamLLM(SECRET_PROMPT, SECRET_PROMPT, 100)) void _;
    const lines = llmCallLines(info);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      stage: 'body',
      call: 'stream',
      model: 'claude-sonnet-4-5-20250929',
      effort: 'medium',
      status: 'completed',
      input_tokens: 100,
      output_tokens: 55,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 7,
      stop_reason: 'max_tokens',
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(SECRET_PROMPT);
  });

  it('streamLLM logs status failed when the stream throws', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await setKey('ai.drafting_model', 'claude-sonnet-4-5-20250929');
    mockStream.mockRejectedValue(new Error('boom'));
    await expect(
      (async () => {
        for await (const _ of streamLLM('s', 'u', 10)) void _;
      })(),
    ).rejects.toThrow('boom');
    expect(llmCallLines(info)[0]).toMatchObject({ stage: 'body', status: 'failed' });
  });

  it('preflight sends the ai.effort.preflight value (default low) and no thinking/budget_tokens', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await AppSetting.create({ key: 'ai.preflight_model', value: 'claude-haiku-4-5-20251001' });
    _clearAppSettingsCache();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"unusual":false,"hard_block":false,"findings":[]}' }],
      usage: { input_tokens: 5, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    await preflightCheck('bail_anticipatory', PREFLIGHT_DATA);
    expect(mockCreate.mock.calls[0][0].output_config).toEqual({ effort: 'low' });
    noForbiddenParams(mockCreate.mock.calls[0][0]);

    await setKey(APP_SETTING_KEYS.EFFORT_PREFLIGHT, 'medium');
    await preflightCheck('bail_anticipatory', PREFLIGHT_DATA);
    expect(mockCreate.mock.calls[1][0].output_config).toEqual({ effort: 'medium' });
  });
});

// ── (c) logLlmCall ──────────────────────────────────────────────────────────

describe('logLlmCall', () => {
  it('emits the documented fields on success', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    logLlmCall({
      stage: 'intake',
      call: 'intake_fill',
      model: 'm1',
      effort: 'low',
      status: 'completed',
      inputTokens: 1,
      outputTokens: 2,
      cacheReadInputTokens: 3,
      cacheCreationInputTokens: 4,
      stopReason: 'end_turn',
      intakeId: 'i-1',
    });
    expect(info.mock.calls[0][0]).toEqual({
      event: 'llm_call',
      stage: 'intake',
      call: 'intake_fill',
      model: 'm1',
      effort: 'low',
      status: 'completed',
      input_tokens: 1,
      output_tokens: 2,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 4,
      stop_reason: 'end_turn',
      intake_id: 'i-1',
    });
  });

  it('emits zeros and null stop_reason on failure with no usage; fixture id appears when set', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    setLlmLogFixtureId('fx-9');
    logLlmCall({
      stage: 'preflight',
      call: 'preflight',
      model: 'm',
      effort: null,
      status: 'failed',
    });
    expect(info.mock.calls[0][0]).toEqual({
      event: 'llm_call',
      stage: 'preflight',
      call: 'preflight',
      model: 'm',
      effort: null,
      status: 'failed',
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      stop_reason: null,
      fixture_id: 'fx-9',
    });
  });

  it('never carries text or a user id: keys are the allow-list and a known prompt string is absent', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const dirty = {
      stage: 'body',
      call: 'stream',
      model: 'm',
      effort: 'medium',
      status: 'completed',
      prompt: SECRET_PROMPT,
      draft: SECRET_PROMPT,
      userId: 'user-123',
    } as unknown as Parameters<typeof logLlmCall>[0];
    logLlmCall(dirty);
    const rec = info.mock.calls[0][0] as Record<string, unknown>;
    const allowed = [
      'event',
      'stage',
      'call',
      'model',
      'effort',
      'status',
      'input_tokens',
      'output_tokens',
      'cache_read_input_tokens',
      'cache_creation_input_tokens',
      'stop_reason',
      'intake_id',
      'run_id',
      'fixture_id',
    ];
    for (const k of Object.keys(rec)) expect(allowed).toContain(k);
    const s = JSON.stringify(info.mock.calls);
    expect(s).not.toContain(SECRET_PROMPT);
    expect(s).not.toContain('user-123');
    expect(s).not.toMatch(/user_?id/i);
  });

  it('never throws when the logger throws', () => {
    jest.spyOn(logger, 'info').mockImplementation(() => {
      throw new Error('x');
    });
    expect(() =>
      logLlmCall({ stage: 'body', call: 'd1', model: 'm', effort: 'low', status: 'completed' }),
    ).not.toThrow();
  });

  it('the listener receives a copy; a throwing listener is swallowed', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const got: LlmCallRecord[] = [];
    setLlmCallListener((r) => {
      got.push(r);
      r.model = 'mutated';
    });
    const c = {
      stage: 'body',
      call: 'd1',
      model: 'm',
      effort: 'low',
      status: 'completed',
    } as const;
    logLlmCall(c);
    logLlmCall(c);
    expect(got).toHaveLength(2);
    // The listener's mutation hit its own copy, not the record that was logged.
    expect(got[0]).not.toBe(info.mock.calls[0][0]);
    expect((info.mock.calls[0][0] as { model: string }).model).toBe('m');
    expect((info.mock.calls[1][0] as { model: string }).model).toBe('m');
    setLlmCallListener(() => {
      throw new Error('listener');
    });
    expect(() => logLlmCall(c)).not.toThrow();
  });
});

// ── (d) preflight text block ────────────────────────────────────────────────

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

describe('preflight reads the first text block', () => {
  const VERDICT = JSON.stringify({
    unusual: true,
    hard_block: true,
    findings: [{ rule_id: 'G2', question: 'Facts show the petitioner as aggressor?' }],
  });

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await AppSetting.create({ key: 'ai.preflight_model', value: 'claude-haiku-4-5-20251001' });
    _clearAppSettingsCache();
  });

  it('[thinking, text] parses the text block (no fail-open)', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'thinking', thinking: 'hmm', signature: 'sig' },
        { type: 'text', text: VERDICT },
      ],
      usage: { input_tokens: 5, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    const r = await preflightCheck('bail_anticipatory', PREFLIGHT_DATA);
    expect(r.verdict).toBe('hard');
    expect(r.questions).toContain('Facts show the petitioner as aggressor?');
  });

  it('only a thinking block falls back to rules-only as before', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'thinking', thinking: VERDICT, signature: 'sig' }],
      usage: { input_tokens: 5, output_tokens: 5 },
      stop_reason: 'max_tokens',
    });
    const r = await preflightCheck('bail_anticipatory', PREFLIGHT_DATA);
    expect(r.verdict).not.toBe('hard');
    expect(r.questions).not.toContain('Facts show the petitioner as aggressor?');
  });
});

// ── (e) stop_reason from message_delta ──────────────────────────────────────

describe('parseAnthropicStreamEvent stop_reason', () => {
  it('reads delta.stop_reason and usage from message_delta', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: { output_tokens: 9 },
      }),
    ).toEqual({ outputTokens: 9, stopReason: 'max_tokens' });
  });

  it('ignores a null or non-string stop_reason and other event types', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_delta',
        delta: { stop_reason: null },
        usage: { output_tokens: 1 },
      }),
    ).toEqual({ outputTokens: 1 });
    expect(parseAnthropicStreamEvent({ type: 'message_delta', delta: { stop_reason: 5 } })).toEqual(
      {},
    );
    expect(
      parseAnthropicStreamEvent({ type: 'message_start', delta: { stop_reason: 'end_turn' } }),
    ).toEqual({});
  });
});
