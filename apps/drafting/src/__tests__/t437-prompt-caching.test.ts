/**
 * T-437 — prompt caching for the drafting calls, and the cost path for cache tokens
 * (handoff/tickets/T-437-prompt-caching-drafting.md; Arjun's rulings of 14 Oct, option A).
 *
 * Acceptance criteria covered here:
 *   AC1  the constant system prompt of a draft call goes as one block with one 1h
 *        cache_control; per-request text stays in messages; preflight is not cached.
 *   AC2  two renders of the system blocks for different users on the same pack are
 *        byte-identical.
 *   AC3  cache tokens are parsed, stored per call (Generation and LlmAuxCall), priced,
 *        counted by the spend cap and shown on the admin cost screen.
 * AC4 (measured on develop) is the lead's. AC5 (golden set unchanged) is the golden
 * suite's: this file never touches a snapshot.
 *
 * Every model answer is a fixture; the SDK is stubbed (no network).
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { spendCapCheck } from '../middleware/spendCap';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { User } from '../models/User.model';
import { recordGeneration } from '../routes/documents.routes';
import { cachedSystemBlocks, streamGenerateFromBrief } from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import {
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import {
  cacheCounts,
  effectiveCacheRates,
  hasUsage,
  ModelRate,
  parseAnthropicMessageUsage,
  parseAnthropicStreamEvent,
  priceCacheUsage,
  priceUsage,
  totalTokens,
  UsageMeter,
} from '../services/llm-usage';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { asyncIterable, expectCachedSystem } from './sdkStream';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

// ── The SDK, stubbed: stream (drafts), create (preflight), parse (D1) ───────

const mockStream = jest.fn();
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      stream: (...a: unknown[]) => mockStream(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  })),
}));

const MODEL = 'claude-sonnet-4-5-20250929';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439099';

/** Rate with every cache rate configured: write (1h price) 6, read 0.3. */
const FULL_RATE: ModelRate = {
  inputUsdPerMTok: 3,
  outputUsdPerMTok: 15,
  cacheWriteUsdPerMTok: 6,
  cacheReadUsdPerMTok: 0.3,
};
/** Rate with no cache rate: the fallbacks apply (write 2x = 6, read 0.1x = 0.3). */
const BARE_RATE: ModelRate = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };

async function setRate(rate: Record<string, number>, model = MODEL) {
  await AppSetting.create({ key: `ai.rates.${model}`, value: JSON.stringify(rate) });
}

beforeEach(async () => {
  _clearAppSettingsCache();
  mockStream.mockReset();
  mockCreate.mockReset();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// (1) Parsers
// ═════════════════════════════════════════════════════════════════════════════

describe('parsers read the cache fields (AC3)', () => {
  it('message_start: uncached input, cache writes, cache reads and the 1h/5m split', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 12,
            output_tokens: 1,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 7000,
            cache_creation: { ephemeral_1h_input_tokens: 3000, ephemeral_5m_input_tokens: 2000 },
          },
        },
      }),
    ).toEqual({
      inputTokens: 12,
      outputTokens: 1,
      cacheCreationInputTokens: 5000,
      cacheReadInputTokens: 7000,
      cacheCreation1hInputTokens: 3000,
      cacheCreation5mInputTokens: 2000,
    });
  });

  it('message_delta: cache counts read when present, null input left off', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_delta',
        usage: {
          input_tokens: null,
          output_tokens: 90,
          cache_creation_input_tokens: 5000,
          cache_read_input_tokens: 0,
        },
      }),
    ).toEqual({ outputTokens: 90, cacheCreationInputTokens: 5000, cacheReadInputTokens: 0 });
  });

  it('a usage object with no cache fields yields none (pre-T-437 shape unchanged)', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 20, output_tokens: 1 } },
      }),
    ).toEqual({ inputTokens: 20, outputTokens: 1 });
  });

  it('a null cache_creation split is ignored', () => {
    expect(
      parseAnthropicStreamEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, cache_creation: null } },
      }),
    ).toEqual({ inputTokens: 1 });
  });

  it('message/parse response: same fields from message.usage, never the content', () => {
    expect(
      parseAnthropicMessageUsage({
        content: [{ type: 'text', text: 'secret draft text' }],
        usage: {
          input_tokens: 40,
          output_tokens: 800,
          cache_creation_input_tokens: 6000,
          cache_read_input_tokens: 0,
          cache_creation: { ephemeral_1h_input_tokens: 6000, ephemeral_5m_input_tokens: 0 },
        },
      }),
    ).toEqual({
      inputTokens: 40,
      outputTokens: 800,
      cacheCreationInputTokens: 6000,
      cacheReadInputTokens: 0,
      cacheCreation1hInputTokens: 6000,
      cacheCreation5mInputTokens: 0,
    });
    expect(parseAnthropicMessageUsage(null)).toEqual({});
    expect(parseAnthropicMessageUsage({})).toEqual({});
  });

  it('hasUsage is true for a fragment with only a cache count, false for text only', () => {
    expect(hasUsage({ cacheReadInputTokens: 10 })).toBe(true);
    expect(hasUsage({ cacheCreationInputTokens: 10 })).toBe(true);
    expect(hasUsage({ text: 'x' })).toBe(false);
  });

  it('cacheCounts leaves off zero and absent counts', () => {
    expect(
      cacheCounts({
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 50,
        cacheCreation1hInputTokens: undefined,
      }),
    ).toEqual({ cacheReadInputTokens: 50 });
    expect(cacheCounts({})).toEqual({});
  });

  it('UsageMeter sums the cache counts over calls and omits them when all zero', () => {
    const m = new UsageMeter();
    m.record({
      sectionId: 'a',
      inputTokens: 10,
      outputTokens: 5,
      usageSource: 'provider',
      cacheCreationInputTokens: 100,
      cacheCreation1hInputTokens: 100,
    });
    m.record({
      sectionId: 'b',
      inputTokens: 20,
      outputTokens: 6,
      usageSource: 'provider',
      cacheReadInputTokens: 100,
    });
    expect(m.totals()).toMatchObject({
      inputTokens: 30,
      outputTokens: 11,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 100,
      cacheCreation1hInputTokens: 100,
    });
    const none = new UsageMeter();
    none.record({ sectionId: 'a', inputTokens: 1, outputTokens: 1, usageSource: 'provider' });
    const t = none.totals();
    expect(t).not.toHaveProperty('cacheCreationInputTokens');
    expect(t).not.toHaveProperty('cacheReadInputTokens');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (2) Pricing
// ═════════════════════════════════════════════════════════════════════════════

describe('priceCacheUsage (AC3)', () => {
  it('the 1h bucket is priced at the stored write rate', () => {
    const p = priceCacheUsage(
      { cacheCreationInputTokens: 100_000, cacheCreation1hInputTokens: 100_000 },
      FULL_RATE,
      'm-1h',
    );
    expect(p.cacheWriteUsd).toBeCloseTo(0.6, 9); // 0.1 MTok x $6
    expect(p.cacheReadUsd).toBe(0);
  });

  it('the 5m bucket is priced at 1.25x the input rate, the rest at the write rate', () => {
    const p = priceCacheUsage(
      {
        cacheCreationInputTokens: 100_000,
        cacheCreation1hInputTokens: 60_000,
        cacheCreation5mInputTokens: 40_000,
      },
      FULL_RATE,
      'm-split',
    );
    // 60k x $6 + 40k x ($3 x 1.25) = 0.36 + 0.15
    expect(p.cacheWriteUsd).toBeCloseTo(0.51, 9);
  });

  it('5m is 1.25x input even when no write rate is configured', () => {
    const p = priceCacheUsage(
      { cacheCreationInputTokens: 1_000_000, cacheCreation5mInputTokens: 1_000_000 },
      BARE_RATE,
      'm-5m-bare',
    );
    expect(p.cacheWriteUsd).toBeCloseTo(3.75, 9);
  });

  it('no split reported: the whole creation total is priced at the write rate', () => {
    const p = priceCacheUsage({ cacheCreationInputTokens: 100_000 }, FULL_RATE, 'm-nosplit');
    expect(p.cacheWriteUsd).toBeCloseTo(0.6, 9);
  });

  it('a 5m count larger than the creation total cannot price more than the total', () => {
    const p = priceCacheUsage(
      { cacheCreationInputTokens: 1_000_000, cacheCreation5mInputTokens: 5_000_000 },
      FULL_RATE,
      'm-clamp',
    );
    expect(p.cacheWriteUsd).toBeCloseTo(3.75, 9); // 1 MTok at 1.25 x $3, not 5 MTok
  });

  it('reads are priced at the read rate', () => {
    const p = priceCacheUsage({ cacheReadInputTokens: 1_000_000 }, FULL_RATE, 'm-read');
    expect(p.cacheReadUsd).toBeCloseTo(0.3, 9);
    expect(p.cacheWriteUsd).toBe(0);
  });

  it('no cache tokens: zero cost and no warning even with no cache rates', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(priceCacheUsage({}, BARE_RATE, 'm-none')).toEqual({ cacheWriteUsd: 0, cacheReadUsd: 0 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('configured cache rates: no warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    priceCacheUsage({ cacheReadInputTokens: 10 }, FULL_RATE, 'm-configured');
    expect(warn).not.toHaveBeenCalled();
  });

  it('missing cache rates fall back to write 2x and read 0.1x the input rate, and warn once per model', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = priceCacheUsage(
      { cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000 },
      BARE_RATE,
      'model-warn-once',
    );
    expect(first.cacheWriteUsd).toBeCloseTo(6, 9); // 2 x $3
    expect(first.cacheReadUsd).toBeCloseTo(0.3, 9); // 0.1 x $3
    priceCacheUsage({ cacheReadInputTokens: 5 }, BARE_RATE, 'model-warn-once');
    priceCacheUsage({ cacheCreationInputTokens: 5 }, BARE_RATE, 'model-warn-once');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('model-warn-once');
    // A different model warns again.
    priceCacheUsage({ cacheReadInputTokens: 5 }, BARE_RATE, 'model-warn-other');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('only one cache rate missing: that one falls back, the configured one is kept', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const writeOnly = effectiveCacheRates({ ...BARE_RATE, cacheWriteUsdPerMTok: 9 });
    expect(writeOnly.cacheWriteUsdPerMTok).toBe(9);
    expect(writeOnly.cacheReadUsdPerMTok).toBeCloseTo(0.3, 9);
    expect(writeOnly.fallback).toBe(true);
    expect(effectiveCacheRates({ ...BARE_RATE, cacheReadUsdPerMTok: 1 })).toEqual({
      cacheWriteUsdPerMTok: 6,
      cacheReadUsdPerMTok: 1,
      fallback: true,
    });
    expect(effectiveCacheRates(FULL_RATE).fallback).toBe(false);
  });
});

describe('priceUsage and totalTokens (AC3)', () => {
  it('priceUsage = uncached input + output + cache write + cache read', () => {
    const usage = {
      inputTokens: 1_000,
      outputTokens: 2_000,
      cacheCreationInputTokens: 100_000,
      cacheReadInputTokens: 400_000,
    };
    // 0.003 + 0.03 + 0.6 + 0.12
    expect(priceUsage(usage, FULL_RATE, 'm-price')).toBeCloseTo(0.753, 9);
  });

  it('priceUsage with no cache counts is exactly the pre-T-437 price', () => {
    expect(priceUsage({ inputTokens: 1000, outputTokens: 200 }, FULL_RATE)).toBeCloseTo(0.006, 9);
  });

  it('input_tokens stays uncached-only: cache tokens are not also priced as input', () => {
    const withCache = priceUsage(
      { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 },
      FULL_RATE,
    );
    expect(withCache).toBeCloseTo(0.3, 9); // at the read rate, not the $3 input rate
  });

  it('totalTokens counts uncached input, output, cache writes and cache reads', () => {
    expect(
      totalTokens({
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 1000,
        cacheReadInputTokens: 2000,
      }),
    ).toBe(3150);
    expect(totalTokens({ inputTokens: 100, outputTokens: 50 })).toBe(150);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (4) recordGeneration stores the cache counts, costs and rates
// ═════════════════════════════════════════════════════════════════════════════

function genInput(over: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    docType: 'petition' as const,
    status: 'completed' as const,
    aiModel: MODEL,
    transport: 'direct' as const,
    usage: {
      inputTokens: 1_000,
      outputTokens: 2_000,
      llmCalls: 1,
      usageSource: 'provider' as const,
      cacheCreationInputTokens: 100_000,
      cacheReadInputTokens: 400_000,
      cacheCreation1hInputTokens: 100_000,
    },
    paragraphCount: 3,
    durationMs: 100,
    runId: 'run-t437-a',
    runSequence: 1,
    runType: 'initial' as const,
    ...over,
  };
}

describe('recordGeneration with cache tokens (AC3)', () => {
  it('stores counts, split, cache costs and the cache rates; costUsd and tokensUsed include the cache', async () => {
    await setRate({
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_write_usd_per_mtok: 6,
      cache_read_usd_per_mtok: 0.3,
    });
    expect(await recordGeneration(genInput())).toEqual({ duplicate: false });
    const g = await Generation.findOne({ runId: 'run-t437-a' }).lean();
    expect(g).not.toBeNull();
    expect(g!.inputTokens).toBe(1_000);
    expect(g!.outputTokens).toBe(2_000);
    expect(g!.cacheCreationInputTokens).toBe(100_000);
    expect(g!.cacheReadInputTokens).toBe(400_000);
    expect(g!.cacheCreation1hInputTokens).toBe(100_000);
    expect(g!.tokensUsed).toBe(1_000 + 2_000 + 100_000 + 400_000);
    expect(g!.cacheWriteCostUsd).toBeCloseTo(0.6, 9);
    expect(g!.cacheReadCostUsd).toBeCloseTo(0.12, 9);
    expect(g!.costUsd).toBeCloseTo(0.003 + 0.03 + 0.6 + 0.12, 9);
    expect(g!.rateCacheWriteUsdPerMTok).toBe(6);
    expect(g!.rateCacheReadUsdPerMTok).toBe(0.3);
    expect(g!.rateInputUsdPerMTok).toBe(3);
    expect(g!.costStatus).toBe('priced');
  });

  it('with no cache rate configured it stores the fallback rates it priced with', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await setRate({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 });
    await recordGeneration(genInput({ runId: 'run-t437-fallback' }));
    const g = await Generation.findOne({ runId: 'run-t437-fallback' }).lean();
    expect(g!.rateCacheWriteUsdPerMTok).toBe(6);
    expect(g!.rateCacheReadUsdPerMTok).toBeCloseTo(0.3, 9);
    expect(g!.cacheWriteCostUsd).toBeCloseTo(0.6, 9);
    expect(g!.cacheReadCostUsd).toBeCloseTo(0.12, 9);
  });

  it('a 5m/1h split on the generation is priced per bucket', async () => {
    await setRate({
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_write_usd_per_mtok: 6,
      cache_read_usd_per_mtok: 0.3,
    });
    const base = genInput({ runId: 'run-t437-split' });
    await recordGeneration({
      ...base,
      usage: {
        ...base.usage,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 100_000,
        cacheCreation1hInputTokens: 60_000,
        cacheCreation5mInputTokens: 40_000,
      },
    });
    const g = await Generation.findOne({ runId: 'run-t437-split' }).lean();
    expect(g!.cacheCreation5mInputTokens).toBe(40_000);
    expect(g!.cacheWriteCostUsd).toBeCloseTo(0.51, 9);
  });

  it('a generation without cache activity is stored as before: zero cache fields, no cache rates', async () => {
    await setRate({
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_write_usd_per_mtok: 6,
      cache_read_usd_per_mtok: 0.3,
    });
    await recordGeneration(
      genInput({
        runId: 'run-t437-nocache',
        usage: { inputTokens: 1000, outputTokens: 200, llmCalls: 1, usageSource: 'provider' },
      }),
    );
    const g = await Generation.findOne({ runId: 'run-t437-nocache' }).lean();
    expect(g!.cacheCreationInputTokens).toBe(0);
    expect(g!.cacheReadInputTokens).toBe(0);
    expect(g!.cacheWriteCostUsd).toBe(0);
    expect(g!.cacheReadCostUsd).toBe(0);
    expect(g!.rateCacheWriteUsdPerMTok).toBeUndefined();
    expect(g!.tokensUsed).toBe(1200);
    expect(g!.costUsd).toBeCloseTo(0.006, 9);
  });

  it('rate missing: tokens are stored, cost is 0, cache costs are 0', async () => {
    await recordGeneration(genInput({ runId: 'run-t437-norate' }));
    const g = await Generation.findOne({ runId: 'run-t437-norate' }).lean();
    expect(g!.costStatus).toBe('rate_missing');
    expect(g!.costUsd).toBe(0);
    expect(g!.cacheWriteCostUsd).toBe(0);
    expect(g!.cacheCreationInputTokens).toBe(100_000);
    expect(g!.tokensUsed).toBe(503_000);
  });

  it('a failed generation still records the cache tokens it paid for', async () => {
    await setRate({
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_write_usd_per_mtok: 6,
      cache_read_usd_per_mtok: 0.3,
    });
    await recordGeneration(genInput({ runId: 'run-t437-failed', status: 'failed' }));
    const g = await Generation.findOne({ runId: 'run-t437-failed' }).lean();
    expect(g!.status).toBe('failed');
    expect(g!.costUsd).toBeGreaterThan(0.7);
  });

  it('the spend cap sees the cache cost: a draft that is over the cap only through cache tokens warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await setRate({
      input_usd_per_mtok: 3,
      output_usd_per_mtok: 15,
      cache_write_usd_per_mtok: 6,
      cache_read_usd_per_mtok: 0.3,
    });
    const req = (sub: string) =>
      ({ jwtPayload: { sub, email: '', name: '', role: 'Client', plan: 'free' } }) as never;
    const res = {} as never;

    // Uncached part is a few cents; 2M cache-write tokens add $12 (over the $6 per-user cap).
    const base = genInput({ runId: 'run-t437-cap' });
    await recordGeneration({
      ...base,
      usage: {
        ...base.usage,
        cacheCreationInputTokens: 2_000_000,
        cacheCreation1hInputTokens: 2_000_000,
        cacheReadInputTokens: 0,
      },
    });
    const next = jest.fn();
    await spendCapCheck(req(USER_ID), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('exceeded daily cap'))).toBe(true);

    // The same draft with no cache tokens is far under the cap.
    warn.mockClear();
    await Generation.deleteMany({});
    await recordGeneration({
      ...base,
      runId: 'run-t437-cap2',
      usage: { inputTokens: 1000, outputTokens: 2000, llmCalls: 1, usageSource: 'provider' },
    });
    await spendCapCheck(req(USER_ID), res, jest.fn());
    expect(warn.mock.calls.some((c) => String(c[0]).includes('exceeded daily cap'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (5) Preflight: recorded in LlmAuxCall, never cached
// ═════════════════════════════════════════════════════════════════════════════

const PREFLIGHT_FORM: Record<string, unknown> = {
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
const PREFLIGHT_MODEL = 'claude-haiku-4-5-20251001';
const GOOD_REPLY = JSON.stringify({ unusual: false, hard_block: false, findings: [] });
const PF_USER = '507f1f77bcf86cd799439011';

function haikuResponse(text: string, usage: Record<string, unknown>) {
  return { content: [{ type: 'text', text }], usage };
}

describe('preflight is recorded in LlmAuxCall and is not cached (AC1, Arjun ruling 2)', () => {
  beforeEach(async () => {
    await AppSetting.create({ key: 'ai.preflight_model', value: PREFLIGHT_MODEL });
    await setRate({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }, PREFLIGHT_MODEL);
  });

  it('a completed call writes one purpose=preflight row with tokens, cost, model and no intake id', async () => {
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, { input_tokens: 700, output_tokens: 40 }),
    );
    const result = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    expect(result._meta?.haiku_ran).toBe(true);

    const rows = await LlmAuxCall.find({ purpose: 'preflight' }).lean();
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.status).toBe('completed');
    expect(String(r.userId)).toBe(PF_USER);
    expect(r.aiModel).toBe(PREFLIGHT_MODEL);
    expect(r.transport).toBe('direct');
    expect(r.inputTokens).toBe(700);
    expect(r.outputTokens).toBe(40);
    expect(r.cacheCreationInputTokens).toBe(0);
    expect(r.cacheReadInputTokens).toBe(0);
    expect(r.usageSource).toBe('provider');
    expect(r.costStatus).toBe('priced');
    expect(r.costUsd).toBeCloseTo(0.0007 + 0.0002, 9);
    expect(r.intakeId).toBeUndefined();
    // Numbers and ids only: nothing of the form or the reply is stored.
    expect(JSON.stringify(r)).not.toContain('Ramesh');
    expect(JSON.stringify(r)).not.toContain('falsely implicated');
  });

  it('cache tokens on the preflight response are stored and priced', async () => {
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, {
        input_tokens: 100,
        output_tokens: 40,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      }),
    );
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    const r = (await LlmAuxCall.findOne({ purpose: 'preflight' }).lean())!;
    expect(r.cacheCreationInputTokens).toBe(1_000_000);
    expect(r.cacheReadInputTokens).toBe(1_000_000);
    // fallbacks on a $1 input rate: write $2/MTok, read $0.1/MTok
    expect(r.rateCacheWriteUsdPerMTok).toBe(2);
    expect(r.rateCacheReadUsdPerMTok).toBeCloseTo(0.1, 9);
    expect(r.costUsd).toBeCloseTo(0.0001 + 0.0002 + 2 + 0.1, 9);
  });

  it('a reply that is not JSON writes a failed row (the call was made and billed) and preflight still fails open', async () => {
    mockCreate.mockResolvedValue(
      haikuResponse('this is not json', { input_tokens: 650, output_tokens: 12 }),
    );
    const result = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    expect(result._meta?.haiku_ran).toBe(false);
    const rows = await LlmAuxCall.find({ purpose: 'preflight' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].inputTokens).toBe(650);
    expect(rows[0].outputTokens).toBe(12);
  });

  it('an API error writes no row (no usage to record) and preflight fails open', async () => {
    mockCreate.mockRejectedValue(new Error('503 service unavailable'));
    const result = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    expect(result._meta?.haiku_ran).toBe(false);
    expect(await LlmAuxCall.countDocuments({ purpose: 'preflight' })).toBe(0);
  });

  it('no userId, or an invalid one: the call runs, no row is written', async () => {
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, { input_tokens: 700, output_tokens: 40 }),
    );
    const a = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM);
    const b = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, 'not-an-object-id');
    expect(a._meta?.haiku_ran).toBe(true);
    expect(b._meta?.haiku_ran).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(await LlmAuxCall.countDocuments({})).toBe(0);
  });

  it('a failed row write does not break preflight', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(LlmAuxCall, 'create').mockRejectedValue(new Error('mongo down') as never);
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, { input_tokens: 700, output_tokens: 40 }),
    );
    const result = await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    expect(result._meta?.haiku_ran).toBe(true);
    expect(result.verdict).toBeDefined();
    expect(err.mock.calls.some((c) => String(c[0]).includes('[preflight]'))).toBe(true);
  });

  it('rate missing: the row is written with costStatus rate_missing and cost 0', async () => {
    await AppSetting.deleteOne({ key: `ai.rates.${PREFLIGHT_MODEL}` });
    _clearAppSettingsCache();
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, { input_tokens: 700, output_tokens: 40 }),
    );
    await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    const r = (await LlmAuxCall.findOne({ purpose: 'preflight' }).lean())!;
    expect(r.costStatus).toBe('rate_missing');
    expect(r.costUsd).toBe(0);
    expect(r.inputTokens).toBe(700);
  });

  it('the preflight request has a plain-string system prompt and no cache_control anywhere', async () => {
    mockCreate.mockResolvedValue(
      haikuResponse(GOOD_REPLY, { input_tokens: 700, output_tokens: 40 }),
    );
    await preflightCheck('bail_anticipatory', PREFLIGHT_FORM, PF_USER);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof params.system).toBe('string');
    expect(JSON.stringify(params)).not.toContain('cache_control');
  });

  it('LlmAuxCall still requires an intake id for every purpose except preflight', async () => {
    await expect(
      LlmAuxCall.create({
        userId: PF_USER,
        purpose: 'intake_reception',
        status: 'completed',
        costStatus: 'priced',
        usageSource: 'provider',
      }),
    ).rejects.toThrow(/intakeId/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (6) Admin cost screen
// ═════════════════════════════════════════════════════════════════════════════

function adminHeaders() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'admin@test.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'pro',
    'x-user-role': 'Admin',
  };
}

describe('admin cost screens show the cache (AC3)', () => {
  it('GET /admin/ai-usage: cache tokens, costs in USD and INR, net savings and hit share', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: '90' });
    await Generation.create([
      {
        userId: USER_ID,
        docType: 'bail_application',
        tokensUsed: 101_000,
        costUsd: 1,
        status: 'completed',
        inputTokens: 1_000,
        cacheCreationInputTokens: 10_000,
        cacheReadInputTokens: 90_000,
        rateInputUsdPerMTok: 3,
        cacheWriteCostUsd: 0.06, // 10k x $6
        cacheReadCostUsd: 0.027, // 90k x $0.3
      },
      // Failed rows count toward cost (we paid), as before.
      {
        userId: USER_ID,
        docType: 'bail_application',
        tokensUsed: 50,
        costUsd: 0.5,
        status: 'failed',
        inputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        rateInputUsdPerMTok: 3,
      },
    ]);
    // A row from before T-437: none of the cache fields at all.
    await mongoose.connection.collection('generations').insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      docType: 'bail_application',
      tokensUsed: 100,
      costUsd: 0.25,
      status: 'completed',
      inputTokens: 50,
      createdAt: new Date(),
    });

    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body.totalCostUsd).toBeCloseTo(1.75, 9);
    expect(res.body.cacheWriteTokens).toBe(10_000);
    expect(res.body.cacheReadTokens).toBe(90_000);
    expect(res.body.cacheWriteCostUsd).toBeCloseTo(0.06, 9);
    expect(res.body.cacheReadCostUsd).toBeCloseTo(0.027, 9);
    expect(res.body.cacheWriteCostInr).toBe(Math.round(0.06 * 90));
    expect(res.body.cacheReadCostInr).toBe(Math.round(0.027 * 90));
    // uncached equivalent: 100k tokens x $3/MTok = 0.30; saving = 0.30 - 0.06 - 0.027
    expect(res.body.cacheSavingsUsd).toBeCloseTo(0.213, 9);
    expect(res.body.cacheSavingsInr).toBe(Math.round(0.213 * 90));
    // read / (uncached input 1000 + 0 + 50 (old row) + write 10000 + read 90000) = 90000 / 101050
    expect(res.body.cacheHitSharePct).toBe(Math.round((90_000 / 101_050) * 1000) / 10);
    expect(res.body.cacheHitSharePct).toBeCloseTo(89.1, 5);
  });

  it('the saving is net of the write premium: a cache that was only written shows a negative saving', async () => {
    await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 10_000,
      costUsd: 0.06,
      status: 'completed',
      inputTokens: 0,
      cacheCreationInputTokens: 10_000,
      cacheReadInputTokens: 0,
      rateInputUsdPerMTok: 3,
      cacheWriteCostUsd: 0.06,
      cacheReadCostUsd: 0,
    });
    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());
    expect(res.body.cacheSavingsUsd).toBeCloseTo(0.03 - 0.06, 9);
    expect(res.body.cacheSavingsUsd).toBeLessThan(0);
    expect(res.body.cacheHitSharePct).toBe(0);
  });

  it('with no generations every cache figure is 0 (no NaN)', async () => {
    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());
    expect(res.status).toBe(200);
    for (const k of [
      'cacheWriteTokens',
      'cacheReadTokens',
      'cacheWriteCostUsd',
      'cacheReadCostUsd',
      'cacheWriteCostInr',
      'cacheReadCostInr',
      'cacheSavingsUsd',
      'cacheSavingsInr',
      'cacheHitSharePct',
    ]) {
      expect(res.body[k]).toBe(0);
    }
  });

  it('GET /admin/documents/analytics: the aiCache KPIs', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: '100' });
    await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 101_000,
      costUsd: 1,
      status: 'completed',
      inputTokens: 1_000,
      cacheCreationInputTokens: 10_000,
      cacheReadInputTokens: 90_000,
      rateInputUsdPerMTok: 3,
      cacheWriteCostUsd: 0.06,
      cacheReadCostUsd: 0.027,
    });
    const res = await request(app).get('/admin/documents/analytics').set(adminHeaders());
    expect(res.status).toBe(200);
    const k = res.body.kpis;
    expect(k.aiCacheWriteTokens).toBe(10_000);
    expect(k.aiCacheReadTokens).toBe(90_000);
    expect(k.aiCacheWriteCostInr).toBe(6);
    expect(k.aiCacheReadCostInr).toBe(3); // 0.027 x 100 = 2.7
    expect(k.aiCacheHitSharePct).toBe(Math.round((90_000 / 101_000) * 1000) / 10);
    expect(k.aiCostInr).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (7), (8) The calls themselves: AC1 and AC2
// ═════════════════════════════════════════════════════════════════════════════

function fakeRes() {
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  return res as unknown as Response;
}

const given = (values: Array<{ key: string; value: string | string[] }>): GivenValue[] =>
  values.map((v) => ({ source: 'user' as const, ...v }));

const BAIL = loadRulePack('bail_regular')!;
const GROUND = buildChecklist(BAIL).find((i) => i.key === 'grounds_for_bail')!.options![2];
const COURT = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };
const PATNA: CourtLookupData = {
  designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
  city: 'Patna',
  caseNomenclature: '',
  formattingRulesRef: 'bihar_district',
  courtType: 'sessions',
  courtRule: loadCourtRule('bihar_district') ?? undefined,
};

function bailValues(name: string, father: string, fir: string, narrative: string) {
  return given([
    { key: 'applicant_name', value: name },
    { key: 'father_name', value: father },
    { key: 'applicant_age', value: '34' },
    { key: 'address', value: 'Village Karmatand, PS Saraidhela, Dhanbad' },
    { key: 'fir_number', value: fir },
    { key: 'fir_date', value: '2026-09-10' },
    { key: 'police_station', value: 'Saraidhela' },
    { key: 'sections_charged', value: ['303'] },
    { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
    { key: 'custody_since', value: '2026-09-13' },
    { key: 'facts_narrative', value: narrative },
    { key: 'grounds_for_bail', value: [GROUND] },
  ]);
}

function clauseAnswer(body: string, overrides: Record<string, string> = {}) {
  const lines = BAIL.mandatoryClauses.map((c) => `${c.id}: ${overrides[c.id] ?? '1'}`).join('\n');
  return `${body}\n\n${CLAUSES_MARKER}\n${lines}`;
}

/** Stream events of one answer, with cache usage on message_start and message_delta. */
function cachedAnswer(text: string, usage: Record<string, unknown>) {
  return asyncIterable([
    { type: 'message_start', message: { usage: { output_tokens: 0, ...usage } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_delta', usage: { output_tokens: 300 } },
  ]);
}

async function briefRun(opts: {
  userId: string;
  name: string;
  father: string;
  fir: string;
  narrative: string;
  described: string;
  answers: Array<string | AsyncIterable<unknown>>;
}) {
  const brief = buildBrief({
    kind: { id: BAIL.id, name: BAIL.name, court_document: isCourtDocument(BAIL.id) },
    checklist: buildChecklist(BAIL),
    values: bailValues(opts.name, opts.father, opts.fir, opts.narrative),
    court: COURT,
  });
  if (!brief.can_confirm) throw new Error(`brief cannot be confirmed: ${brief.confirm_message}`);
  mockStream.mockReset();
  const sent: Array<Record<string, unknown>> = [];
  mockStream.mockImplementation(async (params: Record<string, unknown>) => {
    sent.push(params);
    const a = opts.answers[sent.length - 1];
    if (a === undefined) throw new Error('no more model answers');
    return typeof a === 'string'
      ? asyncIterable([
          { type: 'message_start', message: { usage: { input_tokens: 4000, output_tokens: 0 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: a } },
          { type: 'message_delta', usage: { output_tokens: 800 } },
        ])
      : a;
  });
  const result = await streamGenerateFromBrief(
    {
      pack: BAIL,
      templateConfig: loadTemplateConfig('bail_regular')!,
      brief,
      described: opts.described,
      language: 'en',
      targetParagraphs: 12,
      courtData: PATNA,
      advocateName: 'Test Advocate',
      userId: opts.userId,
      runId: `r-${opts.userId}`,
      runSequence: 1,
      runType: 'initial',
    },
    fakeRes(),
  );
  return { result, sent };
}

const BODY_ONE =
  '1. That FIR No. 214/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Ramesh Mahto, son of Shri Suresh Mahto. He is in custody and the grounds are submitted below.\n\n2. That the applicant undertakes that, if released on bail, he will not abscond, will not tamper with the evidence and will appear on every date fixed.';
const BODY_TWO =
  '1. That FIR No. 77/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Sunita Devi, son of Shri Mohan Lal. She is in custody and the grounds are submitted below.\n\n2. That the applicant undertakes that, if released on bail, she will not abscond, will not tamper with the evidence and will appear on every date fixed.';

function cacheControlCount(x: unknown): number {
  return (JSON.stringify(x).match(/cache_control/g) ?? []).length;
}

describe('AC1 + AC2: the draft call sends its constant system prompt as one cached block', () => {
  const userA = {
    userId: 'u-alpha',
    name: 'Ramesh Mahto',
    father: 'Shri Suresh Mahto',
    fir: '214/2026',
    narrative: 'He was arrested on 12.09.2026. He is lodged in Dhanbad Divisional Jail.',
    described:
      'My client Ramesh Mahto was arrested on 12.09.2026 in FIR No. 214/2026 at PS Saraidhela.',
  };
  const userB = {
    userId: 'u-beta',
    name: 'Sunita Devi',
    father: 'Shri Mohan Lal',
    fir: '77/2026',
    narrative: 'She was arrested on 11.09.2026. She is lodged in Gaya Central Jail.',
    described:
      'My client Sunita Devi was arrested on 11.09.2026 in FIR No. 77/2026 at PS Saraidhela.',
  };

  it('AC2: two users, same pack: the system blocks are byte-identical and carry one 1h cache_control; the messages differ', async () => {
    const a = await briefRun({ ...userA, answers: [clauseAnswer(BODY_ONE)] });
    const b = await briefRun({ ...userB, answers: [clauseAnswer(BODY_TWO)] });
    expect(a.sent.length).toBeGreaterThanOrEqual(1);
    expect(b.sent.length).toBeGreaterThanOrEqual(1);

    const sa = a.sent[0].system;
    const sb = b.sent[0].system;
    expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
    expect(Buffer.from(JSON.stringify(sa)).equals(Buffer.from(JSON.stringify(sb)))).toBe(true);
    expectCachedSystem(sa, DRAFTER_PACK_SYSTEM_PROMPT);
    expectCachedSystem(sb, DRAFTER_PACK_SYSTEM_PROMPT);

    // Per-request text is in messages, which differ, and carries no cache_control.
    const ma = JSON.stringify(a.sent[0].messages);
    const mb = JSON.stringify(b.sent[0].messages);
    expect(ma).not.toBe(mb);
    expect(ma).toContain('Ramesh Mahto');
    expect(mb).toContain('Sunita Devi');
    expect(ma).not.toContain('cache_control');
    expect(mb).not.toContain('cache_control');

    // Nothing of either user is in the static prefix.
    const prefix = JSON.stringify(sa);
    for (const s of ['Ramesh', 'Sunita', '214/2026', '77/2026', 'u-alpha', 'u-beta']) {
      expect(prefix).not.toContain(s);
    }
  });

  it('cachedSystemBlocks is pure: same text in, same bytes out, one block, one 1h breakpoint', () => {
    const x = cachedSystemBlocks('some constant prompt');
    expect(JSON.stringify(x)).toBe(JSON.stringify(cachedSystemBlocks('some constant prompt')));
    expect(x).toHaveLength(1);
    expect(cacheControlCount(x)).toBe(1);
    expect(x[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(x[0].text).toBe('some constant prompt');
  });

  it('the repair call is cached too, and every cached call has exactly one cache_control', async () => {
    const missing = BAIL.mandatoryClauses[0].id;
    const a = await briefRun({
      ...userA,
      answers: [clauseAnswer(BODY_ONE, { [missing]: '0' }), clauseAnswer(BODY_ONE)],
    });
    const b = await briefRun({
      ...userB,
      answers: [clauseAnswer(BODY_TWO, { [missing]: '0' }), clauseAnswer(BODY_TWO)],
    });
    expect(a.sent).toHaveLength(2);
    expect(b.sent).toHaveLength(2);
    expectCachedSystem(a.sent[0].system, DRAFTER_PACK_SYSTEM_PROMPT);
    expectCachedSystem(a.sent[1].system, DRAFTER_REPAIR_SYSTEM_PROMPT);
    for (const run of [a, b]) {
      for (const call of run.sent) {
        // exactly one breakpoint in the whole request, on the last (only) static block
        expect(cacheControlCount(call)).toBe(1);
        const sys = call.system as Array<{ cache_control?: unknown }>;
        expect(sys[sys.length - 1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
        expect(cacheControlCount(call.messages)).toBe(0);
      }
    }
    // The repair prefix is the same bytes for both users as well.
    expect(JSON.stringify(a.sent[1].system)).toBe(JSON.stringify(b.sent[1].system));
    expect(JSON.stringify(a.sent[1].messages)).not.toBe(JSON.stringify(b.sent[1].messages));
  });

  it('cache usage on the stream lands on the result, split by call, and is priced at the write/read rates', async () => {
    const first = cachedAnswer(clauseAnswer(BODY_ONE), {
      input_tokens: 300,
      cache_creation_input_tokens: 9_000,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_1h_input_tokens: 9_000, ephemeral_5m_input_tokens: 0 },
    });
    const a = await briefRun({ ...userA, answers: [first] });
    expect(a.result.usage.cacheCreationInputTokens).toBe(9_000);
    expect(a.result.usage.cacheCreation1hInputTokens).toBe(9_000);
    expect(a.result.usage).not.toHaveProperty('cacheReadInputTokens');
    expect(a.result.usage.inputTokens).toBe(300); // uncached only
    expect(a.result.usage.calls[0].cacheCreationInputTokens).toBe(9_000);

    const second = cachedAnswer(clauseAnswer(BODY_TWO), {
      input_tokens: 310,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 9_000,
    });
    const b = await briefRun({ ...userB, answers: [second] });
    expect(b.result.usage.cacheReadInputTokens).toBe(9_000);
    expect(b.result.usage).not.toHaveProperty('cacheCreationInputTokens');
    expect(priceUsage(b.result.usage, FULL_RATE, 'm-run')).toBeCloseTo(
      (310 / 1e6) * 3 + (b.result.usage.outputTokens / 1e6) * 15 + (9_000 / 1e6) * 0.3,
      9,
    );
  });
});

describe('the template pipeline is not cached (its system prompt varies per request)', () => {
  const FORM = {
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

  it('POST /generate-from-template sends system as a plain string with no cache_control; cost row has no cache cost', async () => {
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    await setRate(
      {
        input_usd_per_mtok: 3,
        output_usd_per_mtok: 15,
        cache_write_usd_per_mtok: 6,
        cache_read_usd_per_mtok: 0.3,
      },
      MODEL,
    );
    mockStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 1000, output_tokens: 0 } } },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: '1. Applicant seeks bail.' },
        },
        { type: 'message_delta', usage: { output_tokens: 200 } },
      ]),
    );
    const res = await request(app)
      .post('/generate-from-template')
      .set({
        'x-internal-secret': INTERNAL_SECRET,
        'x-user-id': USER_ID,
        'x-user-email': 'test@test.com',
        'x-user-name': 'Test',
        'x-user-plan': 'free',
        'x-user-role': 'Client',
      })
      .send({ template_id: 'bail_regular', form_data: FORM });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');

    expect(mockStream).toHaveBeenCalled();
    for (const c of mockStream.mock.calls) {
      const params = c[0] as Record<string, unknown>;
      expect(typeof params.system).toBe('string');
      expect(cacheControlCount(params)).toBe(0);
    }
    const g = await Generation.findOne({ userId: USER_ID }).lean();
    expect(g!.tokensUsed).toBe(1200);
    expect(g!.cacheWriteCostUsd).toBe(0);
    expect(g!.cacheReadCostUsd).toBe(0);
    expect(g!.costUsd).toBeCloseTo(0.006, 9);
  });
});
