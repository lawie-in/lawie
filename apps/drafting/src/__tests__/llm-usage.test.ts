/**
 * T-003 — llm-usage.ts. Pure parsers need no network; getModelRates/
 * getUsdInrRate need Mongo for AppSetting.
 */
import './setupEnv';
import './setupDb';

import { AppSetting } from '../models/AppSetting.model';
import {
  estimateOutputTokens,
  getModelRates,
  getUsdInrRate,
  modelSlug,
  parseAnthropicStreamEvent,
  parseOpenAIStreamLine,
  priceUsage,
  UsageMeter,
} from '../services/llm-usage';
import { _clearAppSettingsCache } from '../services/app-settings.service';

beforeEach(() => {
  _clearAppSettingsCache();
});

describe('parseAnthropicStreamEvent', () => {
  it('reads input/output tokens from message_start', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 20, output_tokens: 1 } },
      }),
    ).toEqual({ inputTokens: 20, outputTokens: 1 });
  });

  it('reads text from content_block_delta', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hi' },
      }),
    ).toEqual({ text: 'hi' });
  });

  it('ignores a non-text delta', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta' },
      }),
    ).toEqual({});
  });

  it('reads cumulative output_tokens from message_delta', () => {
    expect(
      parseAnthropicStreamEvent({ type: 'message_delta', usage: { output_tokens: 42 } }),
    ).toEqual({ outputTokens: 42 });
  });

  it('returns an empty fragment for an unknown event type', () => {
    expect(parseAnthropicStreamEvent({ type: 'content_block_stop' })).toEqual({});
    expect(parseAnthropicStreamEvent({})).toEqual({});
  });
});

describe('parseOpenAIStreamLine', () => {
  it('reads text from choices[0].delta.content', () => {
    expect(parseOpenAIStreamLine({ choices: [{ delta: { content: 'hello' } }] })).toEqual({
      text: 'hello',
    });
  });

  it('reads usage from the final include_usage chunk', () => {
    expect(
      parseOpenAIStreamLine({ choices: [], usage: { prompt_tokens: 200, completion_tokens: 55 } }),
    ).toEqual({ inputTokens: 200, outputTokens: 55 });
  });

  it('returns an empty fragment when neither is present', () => {
    expect(parseOpenAIStreamLine({ choices: [{ delta: {} }] })).toEqual({});
  });
});

describe('estimateOutputTokens', () => {
  it('estimates roughly 4 chars per token, minimum 1', () => {
    expect(estimateOutputTokens('')).toBe(1);
    expect(estimateOutputTokens('a'.repeat(400))).toBe(100);
  });
});

describe('modelSlug', () => {
  it('lower-cases and keeps a-z0-9._-', () => {
    expect(modelSlug('Claude-Sonnet-4-5-20250929')).toBe('claude-sonnet-4-5-20250929');
  });

  it('replaces a "/" in a Helicone-style model name', () => {
    expect(modelSlug('claude-sonnet-4/anthropic')).toBe('claude-sonnet-4-anthropic');
  });
});

describe('UsageMeter', () => {
  it('sums usage across calls and reports a single source', () => {
    const meter = new UsageMeter();
    meter.record({
      sectionId: 'body',
      inputTokens: 100,
      outputTokens: 20,
      usageSource: 'provider',
    });
    meter.record({
      sectionId: 'notes',
      inputTokens: 50,
      outputTokens: 10,
      usageSource: 'provider',
    });
    const totals = meter.totals();
    expect(totals).toMatchObject({
      inputTokens: 150,
      outputTokens: 30,
      llmCalls: 2,
      usageSource: 'provider',
    });
    expect(totals.calls).toHaveLength(2);
  });

  it('reports "mixed" when calls disagree on source', () => {
    const meter = new UsageMeter();
    meter.record({
      sectionId: 'body',
      inputTokens: 100,
      outputTokens: 20,
      usageSource: 'provider',
    });
    meter.record({
      sectionId: 'notes',
      inputTokens: 50,
      outputTokens: 12,
      usageSource: 'estimated',
    });
    expect(meter.totals().usageSource).toBe('mixed');
  });

  it('defaults to "provider" with zero calls', () => {
    expect(new UsageMeter().totals()).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      llmCalls: 0,
      usageSource: 'provider',
    });
  });
});

describe('getModelRates', () => {
  it('returns priced for a configured model', async () => {
    await AppSetting.create({
      key: 'ai.rates.claude-sonnet-4-5-20250929',
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    const result = await getModelRates('claude-sonnet-4-5-20250929');
    expect(result).toEqual({
      costStatus: 'priced',
      rate: {
        inputUsdPerMTok: 3,
        outputUsdPerMTok: 15,
        cacheWriteUsdPerMTok: undefined,
        cacheReadUsdPerMTok: undefined,
      },
    });
  });

  it('slugifies a model name with "/" before looking up the key', async () => {
    await AppSetting.create({
      key: 'ai.rates.claude-sonnet-4-anthropic',
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    const result = await getModelRates('claude-sonnet-4/anthropic');
    expect(result.costStatus).toBe('priced');
  });

  it('returns rate_missing (never throws) when the key is unset', async () => {
    await expect(getModelRates('claude-sonnet-4-5-20250929')).resolves.toEqual({
      costStatus: 'rate_missing',
      rate: null,
    });
  });

  it('returns rate_missing (never throws) for malformed JSON', async () => {
    await AppSetting.create({ key: 'ai.rates.claude-sonnet-4-5-20250929', value: 'not json' });
    await expect(getModelRates('claude-sonnet-4-5-20250929')).resolves.toEqual({
      costStatus: 'rate_missing',
      rate: null,
    });
  });

  it('returns rate_missing when fields are the wrong type', async () => {
    await AppSetting.create({
      key: 'ai.rates.claude-sonnet-4-5-20250929',
      value: JSON.stringify({ input_usd_per_mtok: '3', output_usd_per_mtok: 15 }),
    });
    await expect(getModelRates('claude-sonnet-4-5-20250929')).resolves.toEqual({
      costStatus: 'rate_missing',
      rate: null,
    });
  });
});

describe('priceUsage', () => {
  it('computes cost from tokens at per-million-token rates', () => {
    const cost = priceUsage(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
    );
    expect(cost).toBeCloseTo(10.5, 6);
  });
});

describe('getUsdInrRate', () => {
  it('returns the configured rate', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: '96.5' });
    await expect(getUsdInrRate()).resolves.toBe(96.5);
  });

  it('falls back to 85 when unset (never throws)', async () => {
    await expect(getUsdInrRate()).resolves.toBe(85);
  });

  it('falls back to 85 for an invalid value', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: 'abc' });
    await expect(getUsdInrRate()).resolves.toBe(85);
  });
});
