/**
 * T-683 phase 1: services/v3/extractor.service.ts with the model, Redis, the
 * settings, the usage log and the logger all mocked. No real Anthropic call,
 * no Redis, no Mongo. Fictional data only.
 */
import '../setupEnv';

import mongoose from 'mongoose';

const mockExec = jest.fn();
const mockZrem = jest.fn();
const mockCall = jest.fn();
const mockSetting = jest.fn();
const mockLogLlmCall = jest.fn();

jest.mock('../../config/redis', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['zremrangebyscore', 'zadd', 'zcard', 'pexpire']) chain[m] = () => chain;
  chain.exec = (...a: unknown[]) => mockExec(...a);
  return {
    __esModule: true,
    default: { multi: () => chain, zrem: (...a: unknown[]) => mockZrem(...a) },
  };
});

jest.mock('../../services/aux-llm', () => ({
  ...jest.requireActual('../../services/aux-llm'),
  callAuxModel: (...a: unknown[]) => mockCall(...a),
}));

jest.mock('../../services/app-settings.service', () => ({
  ...jest.requireActual('../../services/app-settings.service'),
  getAppSetting: (...a: unknown[]) => mockSetting(...a),
}));

jest.mock('../../services/llm-usage', () => ({
  ...jest.requireActual('../../services/llm-usage'),
  logLlmCall: (...a: unknown[]) => mockLogLlmCall(...a),
}));

jest.mock('../../config/logger', () => {
  const l = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  };
  l.child.mockReturnValue(l);
  return { __esModule: true, default: l };
});

import logger from '../../config/logger';
import { V3_EXTRACTOR_SYSTEM_PROMPT } from '../../config/prompts/v3-extractor';
import {
  AppSettingMissingError,
  _clearAppSettingsCache,
} from '../../services/app-settings.service';
import { AuxCallError } from '../../services/aux-llm';
import { _clearAiEffortCache } from '../../services/llm-usage';
import { buildChecklist, ChecklistItem } from '../../services/intake-brief';
import { loadRulePack, RulePack } from '../../services/rule-pack.service';
import {
  _resetExtractorState,
  EXTRACTOR_V3_EFFORT_KEYS,
  extractorV3Effort,
  EXTRACTOR_LIMITS,
  estimateInputTokens,
  extractorLines,
  ExtractInput,
  extractTurn,
  parseExtractorJson,
} from '../../services/v3/extractor.service';

const TODAY = '2026-10-29';
const SECRET_DESC = 'Sample Person Zed 9981 was arrested on 05.03.2026 at ZZKotwaliZZ station.';
const SECRET_QUOTE = 'arrested on 05.03.2026';
const SECRET_VALUE = '2026-03-05';

function pack(id: string): RulePack {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return p;
}

let runCounter = 0;
function input(over: Partial<ExtractInput> = {}): ExtractInput {
  const p = pack('bail_regular');
  runCounter += 1;
  return {
    userId: '64b000000000000000000001',
    runId: `run-${runCounter}`,
    turn: 0,
    pack: p,
    checklist: buildChecklist(p),
    description: SECRET_DESC,
    answers: [],
    today: TODAY,
    ...over,
  };
}

const goodReply = JSON.stringify({
  facts: [
    {
      key: 'arrest_date',
      source: 'description',
      turn: 0,
      quote: SECRET_QUOTE,
      value: SECRET_VALUE,
      confidence: 0.97,
    },
  ],
  non_answers: [],
  unresolved: ['fir_number'],
});

const okResult = (text = goodReply, stopReason = 'end_turn') => ({
  text,
  inputTokens: 900,
  outputTokens: 80,
  usageSource: 'provider' as const,
  transport: 'direct' as const,
  cacheReadInputTokens: 700,
  cacheCreationInputTokens: 0,
  stopReason,
});

/** Redis count of the 24 h window after this call is added. */
const redisCount = (n: number) => [
  [null, 0],
  [null, 1],
  [null, n],
  [null, 1],
];

const loggerCalls = (): unknown[][] =>
  (['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const).flatMap(
    (k) => (logger[k] as jest.Mock).mock.calls,
  );

/** Settings by key; any other key is missing (AppSettingMissingError), as in production. */
function setSettings(m: Record<string, string>): void {
  mockSetting.mockImplementation(async (k: string) => {
    if (k in m) return m[k];
    throw new AppSettingMissingError(k);
  });
}

let mongoSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  _resetExtractorState();
  mockExec.mockResolvedValue(redisCount(1));
  mockZrem.mockResolvedValue(1);
  mockCall.mockResolvedValue(okResult());
  _clearAiEffortCache();
  // T-684: the model is read through resolveModel('extractor'); no code default.
  setSettings({ 'ai.model.extractor': 'claude-extractor-test' });
  mongoSpies = [
    jest.spyOn(mongoose.Model, 'create'),
    jest.spyOn(mongoose.Model.prototype, 'save'),
    jest.spyOn(mongoose.Query.prototype, 'exec'),
    jest.spyOn(mongoose, 'connect'),
  ];
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('extractTurn: the ok path', () => {
  it('one model call: description + answer in, validated candidates out', async () => {
    const out = await extractTurn(input());
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.result.candidates.map((c) => [c.key, c.value])).toEqual([
      ['arrest_date', '2026-03-05'],
    ]);
    expect(out.result.unresolved).toEqual(['fir_number']);
    expect(out.usage).toMatchObject({
      model: 'claude-extractor-test',
      effort: 'medium',
      status: 'completed',
    });
    expect(out.usage.usage.inputTokens).toBe(900);
  });

  it('sends the constant system prompt, the description and the answers, max_tokens 1500, 20 s signal, cached system', async () => {
    const abort = jest.spyOn(AbortSignal, 'timeout');
    await extractTurn(
      input({
        turn: 1,
        answers: [{ turn: 1, askedKeys: ['police_station'], text: 'थाना Govindpura' }],
      }),
    );
    const [req, opts] = mockCall.mock.calls[0] as [
      { model: string; system: string; user: string; maxTokens: number; effort: string },
      { signal: AbortSignal; cacheSystem: boolean },
    ];
    expect(req.system).toBe(V3_EXTRACTOR_SYSTEM_PROMPT);
    expect(req.user).toContain(SECRET_DESC);
    expect(req.user).toContain('थाना Govindpura');
    expect(req.user).toContain('turn="1"');
    expect(req.maxTokens).toBe(EXTRACTOR_LIMITS.maxTokens);
    expect(EXTRACTOR_LIMITS.maxTokens).toBe(1500);
    expect(req.effort).toBe('medium');
    expect(opts.cacheSystem).toBe(true);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(abort).toHaveBeenCalledWith(20_000);
  });

  it('accepts a reply wrapped in a code fence', async () => {
    mockCall.mockResolvedValue(okResult('```json\n' + goodReply + '\n```'));
    const out = await extractTurn(input());
    expect(out.status).toBe('ok');
  });

  it('a reply whose every entry fails validation is still ok, with the reasons counted', async () => {
    mockCall.mockResolvedValue(
      okResult(
        JSON.stringify({
          facts: [
            {
              key: 'arrest_date',
              source: 'description',
              turn: 0,
              quote: 'not in the text',
              value: SECRET_VALUE,
              confidence: 0.99,
            },
          ],
        }),
      ),
    );
    const out = await extractTurn(input());
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.span_not_found).toBe(1);
  });
});

describe('extractTurn: the model setting (T-684 resolveModel, no code default)', () => {
  const settings = setSettings;

  it('uses ai.model.extractor when set', async () => {
    settings({ 'ai.model.extractor': 'claude-extractor-x', 'ai.intake_model': 'claude-intake-y' });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].model).toBe('claude-extractor-x');
  });

  it('falls back to ai.intake_model when ai.model.extractor is missing', async () => {
    settings({ 'ai.intake_model': 'claude-intake-y' });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].model).toBe('claude-intake-y');
  });

  it('no code default: neither set gives degraded model_unset, no Redis slot, no model call (v2 runs)', async () => {
    settings({});
    const out = await extractTurn(input());
    expect(out).toEqual({ status: 'degraded', reason: 'model_unset' });
    expect(mockCall).not.toHaveBeenCalled();
    // The model is resolved before the per-user slot, so an unset model spends none.
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('a blank ai.model.extractor is no model: degraded model_unset', async () => {
    settings({ 'ai.model.extractor': '   ', 'ai.intake_model': 'claude-intake-y' });
    const out = await extractTurn(input());
    expect(out).toEqual({ status: 'degraded', reason: 'model_unset' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('a settings read error other than "missing" also degrades (never throws)', async () => {
    mockSetting.mockRejectedValue(new Error('mongo down'));
    const out = await extractTurn(input());
    expect(out).toMatchObject({ status: 'degraded' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  // Arjun 5e493930 section 8: ai.effort.extractor_v3, then ai.effort.extractor, then MEDIUM.
  it('the v3 effort key ai.effort.extractor_v3 wins over ai.effort.extractor', async () => {
    setSettings({
      'ai.model.extractor': 'm',
      'ai.effort.extractor_v3': 'low',
      'ai.effort.extractor': 'high',
    });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].effort).toBe('low');
  });

  it('falls back to ai.effort.extractor when the v3 key is missing', async () => {
    setSettings({ 'ai.model.extractor': 'm', 'ai.effort.extractor': 'high' });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].effort).toBe('high');
  });

  it('is medium when neither is set', async () => {
    setSettings({ 'ai.model.extractor': 'm' });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].effort).toBe('medium');
  });

  it('a bad v3 value moves on to ai.effort.extractor', async () => {
    setSettings({
      'ai.model.extractor': 'm',
      'ai.effort.extractor_v3': 'turbo',
      'ai.effort.extractor': 'high',
    });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].effort).toBe('high');
  });

  it("setting the v3 key never changes v2's effort (getRoleEffort('extractor'))", async () => {
    const { getRoleEffort } = jest.requireActual(
      '../../services/llm-usage',
    ) as typeof import('../../services/llm-usage');
    setSettings({ 'ai.model.extractor': 'm', 'ai.effort.extractor_v3': 'max' });
    _clearAiEffortCache();
    expect(await getRoleEffort('extractor')).toBe('medium');
    setSettings({
      'ai.model.extractor': 'm',
      'ai.effort.extractor_v3': 'max',
      'ai.effort.extractor': 'low',
    });
    _clearAiEffortCache();
    expect(await getRoleEffort('extractor')).toBe('low');
  });
});

describe('extractorV3Effort (Arjun 5e493930 section 8)', () => {
  const keysRead = () => mockSetting.mock.calls.map((c) => c[0] as string);

  it('the chain is ai.effort.extractor_v3, then ai.effort.extractor', () => {
    expect([...EXTRACTOR_V3_EFFORT_KEYS]).toEqual([
      'ai.effort.extractor_v3',
      'ai.effort.extractor',
    ]);
  });

  it('the v3 key wins and stops the chain', async () => {
    setSettings({ 'ai.effort.extractor_v3': 'High', 'ai.effort.extractor': 'low' });
    expect(await extractorV3Effort()).toBe('high');
    expect(keysRead()).toEqual(['ai.effort.extractor_v3']);
  });

  it('falls back to ai.effort.extractor, then medium', async () => {
    setSettings({ 'ai.effort.extractor': 'low' });
    expect(await extractorV3Effort()).toBe('low');
    _resetExtractorState();
    setSettings({});
    expect(await extractorV3Effort()).toBe('medium');
  });

  it('ai.effort.intake is never read, even when it is the only key set', async () => {
    setSettings({ 'ai.effort.intake': 'max' });
    expect(await extractorV3Effort()).toBe('medium');
    expect(keysRead()).not.toContain('ai.effort.intake');
  });

  it('a bad value falls through to the next key, and a failed read does too', async () => {
    setSettings({ 'ai.effort.extractor_v3': 'turbo', 'ai.effort.extractor': 'low' });
    expect(await extractorV3Effort()).toBe('low');
    _resetExtractorState();
    mockSetting.mockImplementation(async (k: string) => {
      if (k === 'ai.effort.extractor_v3') throw new Error('mongo down');
      return 'high';
    });
    expect(await extractorV3Effort()).toBe('high');
    _resetExtractorState();
    setSettings({ 'ai.effort.extractor_v3': 'turbo', 'ai.effort.extractor': '' });
    expect(await extractorV3Effort()).toBe('medium');
  });

  it('a bad value warns with the key name only, never the value', async () => {
    setSettings({ 'ai.effort.extractor_v3': 'SECRET-BAD' });
    await extractorV3Effort();
    const all = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(all).toContain('ai.effort.extractor_v3');
    expect(all).not.toContain('SECRET-BAD');
  });

  it('is cached for 60 s, and the cache clears on a settings invalidation', async () => {
    setSettings({ 'ai.effort.extractor_v3': 'low' });
    expect(await extractorV3Effort()).toBe('low');
    setSettings({ 'ai.effort.extractor_v3': 'high' });
    expect(await extractorV3Effort()).toBe('low');
    expect(mockSetting).toHaveBeenCalledTimes(1);
    _clearAppSettingsCache(); // notifies the invalidation listeners
    expect(await extractorV3Effort()).toBe('high');
  });

  it('expires after 60 s', async () => {
    setSettings({ 'ai.effort.extractor_v3': 'low' });
    const now = jest.spyOn(Date, 'now').mockReturnValue(5_000_000);
    expect(await extractorV3Effort()).toBe('low');
    setSettings({ 'ai.effort.extractor_v3': 'high' });
    now.mockReturnValue(5_000_000 + 60_001);
    expect(await extractorV3Effort()).toBe('high');
  });

  it('never throws, and the turn uses it: the call carries the v3 effort', async () => {
    setSettings({ 'ai.model.extractor': 'm', 'ai.effort.extractor_v3': 'xhigh' });
    await extractTurn(input());
    expect(mockCall.mock.calls[0][0].effort).toBe('xhigh');
  });
});

describe('extractTurn: the per-user cap (Redis, 60 per rolling 24 h)', () => {
  it('60 in the window is allowed', async () => {
    mockExec.mockResolvedValue(redisCount(60));
    const out = await extractTurn(input());
    expect(out.status).toBe('ok');
    expect(mockZrem).not.toHaveBeenCalled();
  });

  it('the 61st gives degraded user_cap, no model call, and the refused call is not counted', async () => {
    mockExec.mockResolvedValue(redisCount(61));
    const out = await extractTurn(input());
    expect(out).toEqual({ status: 'degraded', reason: 'user_cap' });
    expect(mockCall).not.toHaveBeenCalled();
    expect(mockZrem).toHaveBeenCalledTimes(1);
    expect(EXTRACTOR_LIMITS.callsPerUserPerDay).toBe(60);
    expect(EXTRACTOR_LIMITS.windowMs).toBe(24 * 60 * 60 * 1000);
  });

  it('a Redis error gives degraded rate_check_failed (v2 for this turn), no model call', async () => {
    mockExec.mockRejectedValue(new Error('ECONNREFUSED'));
    const out = await extractTurn(input());
    expect(out).toEqual({ status: 'degraded', reason: 'rate_check_failed' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('an aborted transaction (null) and a failed command inside it also degrade', async () => {
    mockExec.mockResolvedValueOnce(null);
    expect(await extractTurn(input())).toEqual({ status: 'degraded', reason: 'rate_check_failed' });
    mockExec.mockResolvedValueOnce([
      [new Error('WRONGTYPE'), null],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);
    expect(await extractTurn(input())).toEqual({ status: 'degraded', reason: 'rate_check_failed' });
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('extractTurn: the per-run cap (6 calls)', () => {
  it('the 7th call in a run gives reused: the last good result, no model call', async () => {
    const runId = 'run-cap-1';
    let last: unknown;
    for (let t = 0; t < EXTRACTOR_LIMITS.callsPerRun; t += 1) {
      const out = await extractTurn(input({ runId, turn: t }));
      expect(out.status).toBe('ok');
      if (out.status === 'ok') last = out.result;
    }
    expect(mockCall).toHaveBeenCalledTimes(6);
    const seventh = await extractTurn(input({ runId, turn: 6 }));
    expect(seventh.status).toBe('reused');
    if (seventh.status === 'reused') expect(seventh.result).toEqual(last);
    expect(mockCall).toHaveBeenCalledTimes(6);
    // Redis was not charged for the reused turn.
    expect(mockExec).toHaveBeenCalledTimes(6);
  });

  it('another run is not affected by this run being capped', async () => {
    const runId = 'run-cap-2';
    for (let t = 0; t < 7; t += 1) await extractTurn(input({ runId, turn: t }));
    const other = await extractTurn(input({ runId: 'run-cap-3', turn: 0 }));
    expect(other.status).toBe('ok');
  });

  it('over the cap with no good result to reuse gives degraded run_cap', async () => {
    const runId = 'run-cap-4';
    mockCall.mockResolvedValue(okResult('not json at all'));
    for (let t = 0; t < 6; t += 1) {
      const out = await extractTurn(input({ runId, turn: t }));
      expect(out).toMatchObject({ status: 'degraded', reason: 'bad_json' });
    }
    expect(await extractTurn(input({ runId, turn: 6 }))).toEqual({
      status: 'degraded',
      reason: 'run_cap',
    });
    expect(mockCall).toHaveBeenCalledTimes(6);
  });
});

describe('extractTurn: failures degrade, never throw, never retry', () => {
  it('the timeout (a fake AbortSignal) gives degraded timeout', async () => {
    const ctrl = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(ctrl.signal);
    mockCall.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          opts.signal.addEventListener('abort', () =>
            rej(
              new AuxCallError('This operation was aborted', {
                inputTokens: 0,
                outputTokens: 0,
                usageSource: 'estimated',
                transport: 'direct',
              }),
            ),
          );
        }),
    );
    const p = extractTurn(input());
    // The timer fires while the model call is in flight.
    while (mockCall.mock.calls.length === 0) await new Promise((r) => setImmediate(r));
    ctrl.abort();
    const out = await p;
    expect(out).toMatchObject({ status: 'degraded', reason: 'timeout' });
    if (out.status === 'degraded') expect(out.usage?.status).toBe('failed');
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('a transport error with the timer not fired gives call_failed', async () => {
    mockCall.mockRejectedValue(
      new AuxCallError('overloaded', {
        inputTokens: 5,
        outputTokens: 0,
        usageSource: 'estimated',
        transport: 'direct',
      }),
    );
    const out = await extractTurn(input());
    expect(out).toMatchObject({ status: 'degraded', reason: 'call_failed' });
    if (out.status === 'degraded') expect(out.usage?.usage.inputTokens).toBe(5);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('an error that is not an AuxCallError is call_failed too', async () => {
    mockCall.mockRejectedValue(new Error('boom'));
    expect(await extractTurn(input())).toMatchObject({ status: 'degraded', reason: 'call_failed' });
  });

  it('bad JSON gives bad_json', async () => {
    mockCall.mockResolvedValue(okResult('Sure! Here are the facts: arrest on 5 March'));
    expect(await extractTurn(input())).toMatchObject({ status: 'degraded', reason: 'bad_json' });
  });

  it('a JSON array and truncated JSON give bad_json', async () => {
    mockCall.mockResolvedValue(okResult('[1,2,3]'));
    expect(await extractTurn(input())).toMatchObject({ status: 'degraded', reason: 'bad_json' });
    mockCall.mockResolvedValue(okResult('{"facts": [{"key": "arrest_da'));
    expect(await extractTurn(input())).toMatchObject({ status: 'degraded', reason: 'bad_json' });
  });

  it('a cut-off reply (stop_reason max_tokens) gives max_tokens', async () => {
    mockCall.mockResolvedValue(okResult('{"facts": [{"key": "arrest_da', 'max_tokens'));
    expect(await extractTurn(input())).toMatchObject({ status: 'degraded', reason: 'max_tokens' });
  });

  it('input over 8,000 tokens gives input_too_large: no Redis slot, no model call', async () => {
    const big = 'The applicant is a resident of the same locality. '.repeat(800);
    const out = await extractTurn(input({ description: big }));
    expect(out).toEqual({ status: 'degraded', reason: 'input_too_large' });
    expect(mockCall).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
    expect(EXTRACTOR_LIMITS.inputTokens).toBe(8000);
  });

  it('Devanagari counts one token a character, so 8,000 Devanagari characters are too large', async () => {
    const dev = 'थाना कोतवाली में रिपोर्ट दर्ज '.repeat(400);
    expect(estimateInputTokens(dev)).toBeGreaterThan(8000);
    const out = await extractTurn(input({ description: dev }));
    expect(out).toEqual({ status: 'degraded', reason: 'input_too_large' });
  });

  it('a degraded turn logs one llm_call line: stage extract, status degraded, a reason, no text', async () => {
    mockCall.mockRejectedValue(new Error('boom'));
    await extractTurn(input({ intakeId: 'intake-1' }));
    const lines = mockLogLlmCall.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((o) => o.status === 'degraded');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      stage: 'extract',
      call: 'v3_extract',
      status: 'degraded',
      reason: 'call_failed',
      intakeId: 'intake-1',
    });
    for (const v of Object.values(lines[0]))
      expect(typeof v === 'string' ? v.length < 80 : true).toBe(true);
    // The old v3_extract_degraded logger line is gone.
    expect(JSON.stringify(loggerCalls())).not.toContain('v3_extract_degraded');
  });

  it('a model_unset turn logs a degraded line with reason model_unset and an empty model', async () => {
    setSettings({});
    await extractTurn(input());
    expect(mockLogLlmCall).toHaveBeenCalledTimes(1);
    expect(mockLogLlmCall.mock.calls[0][0]).toMatchObject({
      stage: 'extract',
      status: 'degraded',
      reason: 'model_unset',
    });
  });

  it('a completed turn carries no reason', async () => {
    await extractTurn(input());
    const rec = mockLogLlmCall.mock.calls[0][0] as Record<string, unknown>;
    expect(rec.status).toBe('completed');
    expect(rec).not.toHaveProperty('reason');
  });
});

describe('extractTurn: one call in flight per runId + turn', () => {
  it('two concurrent calls make one model call and share the outcome', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockCall.mockImplementation(() => new Promise((res) => (release = res)));
    const a = extractTurn(input({ runId: 'run-dedupe', turn: 2 }));
    const b = extractTurn(input({ runId: 'run-dedupe', turn: 2 }));
    await new Promise((r) => setImmediate(r));
    release(okResult());
    const [oa, ob] = await Promise.all([a, b]);
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(oa.status).toBe('ok');
    expect(ob).toBe(oa);
  });

  it('a different turn of the same run is its own call', async () => {
    await Promise.all([
      extractTurn(input({ runId: 'run-dedupe-2', turn: 1 })),
      extractTurn(input({ runId: 'run-dedupe-2', turn: 2 })),
    ]);
    expect(mockCall).toHaveBeenCalledTimes(2);
  });

  it('after the first finishes, the same runId + turn is a new call', async () => {
    await extractTurn(input({ runId: 'run-dedupe-3', turn: 1 }));
    await extractTurn(input({ runId: 'run-dedupe-3', turn: 1 }));
    expect(mockCall).toHaveBeenCalledTimes(2);
  });
});

describe('extractTurn: nothing sensitive is logged, and Mongo is never touched', () => {
  const secrets = [
    'ZZKotwaliZZ',
    'Sample Person Zed 9981',
    SECRET_QUOTE,
    SECRET_VALUE,
    '05.03.2026',
    'थाना Govindpura',
    'Govindpura',
  ];

  async function runAll() {
    const base = input({
      turn: 1,
      answers: [{ turn: 1, askedKeys: ['police_station'], text: 'थाना Govindpura' }],
    });
    // ok, then dropped entry, then a degraded call, so every log site is hit.
    await extractTurn(base);
    mockCall.mockResolvedValueOnce(
      okResult(
        JSON.stringify({
          facts: [
            {
              key: 'arrest_date',
              source: 'description',
              turn: 0,
              quote: 'ZZKotwaliZZ not a quote',
              value: SECRET_VALUE,
              confidence: 0.9,
            },
            {
              key: 'police_station',
              source: 'answer',
              turn: 1,
              quote: 'थाना Govindpura',
              value: 'Govindpura',
              confidence: 0.9,
            },
          ],
        }),
      ),
    );
    await extractTurn({ ...base, turn: 2 });
    mockCall.mockRejectedValueOnce(new Error(`failed with prompt ${SECRET_DESC}`));
    await extractTurn({ ...base, turn: 3 });
    mockCall.mockResolvedValueOnce(okResult(`garbage ${SECRET_QUOTE} ${SECRET_VALUE}`));
    await extractTurn({ ...base, turn: 4 });
  }

  it('no log line (logger or llm_call) holds the prompt, the output, a quote or a value', async () => {
    await runAll();
    const all = JSON.stringify([...loggerCalls(), ...mockLogLlmCall.mock.calls]);
    expect(loggerCalls().length).toBeGreaterThan(0);
    for (const s of secrets) expect(all).not.toContain(s);
    // Nor any text of the constant system prompt.
    expect(all).not.toContain(V3_EXTRACTOR_SYSTEM_PROMPT.slice(0, 40));
    expect(all).not.toContain('FACT LIST');
    expect(all).not.toContain('"facts"');
  });

  it('the validated line holds counts and reason codes only', async () => {
    await extractTurn(input({ intakeId: 'intake-9' }));
    const line = loggerCalls()
      .map((c) => c[0] as Record<string, unknown>)
      .find((o) => o?.event === 'v3_extract_validated');
    expect(line).toEqual({
      event: 'v3_extract_validated',
      run_id: expect.any(String),
      intake_id: 'intake-9',
      turn: 0,
      candidates: 1,
      conflicts: 0,
      non_answers: 0,
      unresolved: 1,
      dropped: {},
    });
  });

  it('9a: bridge_skipped_non_verbatim counts the held candidates on the extract line, a number only', async () => {
    const prose = JSON.stringify({
      facts: [
        {
          key: 'arrest_date',
          source: 'description',
          turn: 0,
          quote: SECRET_QUOTE,
          value: SECRET_VALUE,
          confidence: 0.97,
        },
        {
          key: 'recovery_status',
          source: 'answer',
          turn: 1,
          quote: 'Koi recovery nahi hui',
          value: 'No recovery was made from the applicant.',
          confidence: 0.97,
        },
      ],
    });
    mockCall.mockResolvedValue(okResult(prose));
    await extractTurn(
      input({
        turn: 1,
        answers: [{ turn: 1, askedKeys: ['recovery_status'], text: 'Koi recovery nahi hui' }],
      }),
    );
    const rec = mockLogLlmCall.mock.calls[0][0] as Record<string, unknown>;
    expect(rec.bridgeSkippedNonVerbatim).toBe(1);
    // A count only: no text of the prose or the quote is on the line.
    expect(JSON.stringify(rec)).not.toContain('No recovery was made');
    expect(JSON.stringify(rec)).not.toContain('nahi hui');
  });

  it('9a: all-verbatim candidates are held back for none', async () => {
    await extractTurn(input());
    const rec = mockLogLlmCall.mock.calls[0][0] as Record<string, unknown>;
    expect(rec.bridgeSkippedNonVerbatim).toBe(0);
  });

  it('the llm_call line carries ids, model, effort and token counts, purpose v3_extract, and no text', async () => {
    await extractTurn(input({ intakeId: 'intake-9' }));
    expect(mockLogLlmCall).toHaveBeenCalledTimes(1);
    const rec = mockLogLlmCall.mock.calls[0][0] as Record<string, unknown>;
    expect(rec).toMatchObject({
      call: 'v3_extract',
      model: 'claude-extractor-test',
      effort: 'medium',
      status: 'completed',
      inputTokens: 900,
      outputTokens: 80,
      intakeId: 'intake-9',
    });
    for (const v of Object.values(rec)) {
      expect(typeof v === 'string' ? v.length < 80 : true).toBe(true);
    }
  });

  it('never touches Mongo: no create, no save, no query, no connection, on any path', async () => {
    await runAll();
    mockExec.mockRejectedValueOnce(new Error('redis down'));
    await extractTurn(input());
    for (const spy of mongoSpies) expect(spy).not.toHaveBeenCalled();
    expect(mongoose.connection.readyState).toBe(0);
  });
});

describe('extractorLines: the FACT LIST', () => {
  it('derived keys are not on the FACT LIST (amount_in_words on s.138)', () => {
    const p = pack('legal_notice_s138');
    const cl = buildChecklist(p);
    expect(cl.some((i) => i.key === 'amount_in_words' && i.modelReadable)).toBe(true);
    const keys = extractorLines(p, cl, []).map((l) => l.key);
    expect(keys).not.toContain('amount_in_words');
    expect(keys).toContain('cheque_amount');
    // Not even when an answer was asked for it.
    const asked = extractorLines(p, cl, [{ turn: 1, askedKeys: ['amount_in_words'], text: 'x' }]);
    expect(asked.map((l) => l.key)).not.toContain('amount_in_words');
  });

  it('custody_since_derived is not on the FACT LIST, asked or not; custody_since is', () => {
    const p = pack('bail_regular');
    const base = buildChecklist(p);
    const synthetic: ChecklistItem = {
      ...base.find((i) => i.key === 'custody_since')!,
      key: 'custody_since_derived',
    };
    const cl = [...base, synthetic];
    const keys = extractorLines(p, cl, []).map((l) => l.key);
    expect(keys).not.toContain('custody_since_derived');
    expect(keys).toContain('custody_since');
    const asked = extractorLines(p, cl, [
      { turn: 1, askedKeys: ['custody_since_derived'], text: 'x' },
    ]);
    expect(asked.map((l) => l.key)).not.toContain('custody_since_derived');
  });

  it('the user message the model sees does not name a derived key', async () => {
    const p = pack('legal_notice_s138');
    await extractTurn(
      input({
        pack: p,
        checklist: buildChecklist(p),
        description: 'Cheque for Rs 3,00,000 bounced.',
      }),
    );
    const user = mockCall.mock.calls[0][0].user as string;
    expect(user).toContain('cheque_amount |');
    expect(user).not.toContain('amount_in_words');
  });

  it('a key the model may not read from the description is listed only when an answer asked for it', () => {
    const p = pack('bail_regular');
    const cl = buildChecklist(p);
    const closed = cl.find((i) => !i.modelReadable)!;
    expect(extractorLines(p, cl, []).map((l) => l.key)).not.toContain(closed.key);
    expect(
      extractorLines(p, cl, [{ turn: 1, askedKeys: [closed.key], text: 'x' }]).map((l) => l.key),
    ).toContain(closed.key);
  });

  it('the pack hint rides on its own line, exactly as the pack writes it, and on no other', () => {
    const p = pack('temporary_injunction_o39');
    const lines = extractorLines(p, buildChecklist(p), []);
    const hinted = lines.filter((l) => l.hint !== undefined);
    expect(hinted.map((l) => l.key)).toEqual(['restraint_sought']);
    expect(hinted[0].hint).toBe(p.facts.find((f) => f.key === 'restraint_sought')!.extract_hint);
  });

  it('the hint reaches the model message once, whole', async () => {
    const p = pack('temporary_injunction_o39');
    await extractTurn(
      input({ pack: p, checklist: buildChecklist(p), description: 'A suit about a plot of land.' }),
    );
    const user = mockCall.mock.calls[0][0].user as string;
    const hint = p.facts.find((f) => f.key === 'restraint_sought')!.extract_hint!;
    expect(user.split(hint).length - 1).toBe(1);
  });
});

describe('parseExtractorJson', () => {
  it('reads the whole reply, a fenced reply, and an object with chatter around it', () => {
    expect(parseExtractorJson('{"facts":[]}')).toEqual({ facts: [] });
    expect(parseExtractorJson('```json\n{"facts":[]}\n```')).toEqual({ facts: [] });
    expect(parseExtractorJson('```\n{"facts":[]}\n```')).toEqual({ facts: [] });
    expect(parseExtractorJson('Here: {"facts":[]} done')).toEqual({ facts: [] });
  });

  it('gives null for anything else', () => {
    for (const bad of ['', 'no json', '[1]', '{', '{"a":', '}{', '"str"', '12']) {
      expect(parseExtractorJson(bad)).toBeNull();
    }
  });
});
