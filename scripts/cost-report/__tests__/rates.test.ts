/**
 * Drift guard: scripts/cost-report/lib/rates.ts restates the pricing in
 * apps/drafting/src/services/llm-usage.ts. llm-usage imports a logger (env
 * validation) and app-settings (Mongoose model), so those two are mocked with
 * factories; the pricing functions under test are the real ones.
 */
jest.mock('../../../apps/drafting/src/config/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../apps/drafting/src/services/app-settings.service', () => ({
  APP_SETTING_KEYS: {},
  getAppSetting: jest.fn(),
  onAppSettingInvalidated: jest.fn(),
}));

import * as svc from '../../../apps/drafting/src/services/llm-usage';
import {
  CACHE_READ_FALLBACK_MULTIPLIER,
  CACHE_WRITE_1H_FALLBACK_MULTIPLIER,
  CACHE_WRITE_5M_MULTIPLIER,
  costForRow,
  modelSlug,
  priceTokens,
  ratesFromSettings,
  rateFor,
  USD_INR_FALLBACK,
} from '../lib/rates';
import { ModelRate, TokenCounts } from '../lib/types';

const tok = (p: Partial<TokenCounts> = {}): TokenCounts => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  ...p,
});

const FULL: ModelRate = {
  inputUsdPerMTok: 3,
  outputUsdPerMTok: 15,
  cacheWriteUsdPerMTok: 6,
  cacheReadUsdPerMTok: 0.3,
};
const NO_CACHE: ModelRate = { inputUsdPerMTok: 5, outputUsdPerMTok: 25 };
const ONLY_WRITE: ModelRate = { ...NO_CACHE, cacheWriteUsdPerMTok: 7 };

const SETS: Partial<TokenCounts>[] = [
  {},
  { inputTokens: 1000, outputTokens: 2000 },
  {
    inputTokens: 12345,
    outputTokens: 6789,
    cacheCreationInputTokens: 50000,
    cacheReadInputTokens: 80000,
  },
  {
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationInputTokens: 50000,
    cacheCreation5mInputTokens: 20000,
  },
  { cacheCreationInputTokens: 1000, cacheCreation5mInputTokens: 5000 }, // 5m > created: clamped
  { cacheCreationInputTokens: 1000, cacheCreation5mInputTokens: 1000, cacheReadInputTokens: 7 },
  { inputTokens: 1_500_000, outputTokens: 250_000, cacheReadInputTokens: 3_000_000 },
];

describe('rates: parity with apps/drafting llm-usage.ts', () => {
  it('constants match', () => {
    expect(CACHE_WRITE_1H_FALLBACK_MULTIPLIER).toBe(svc.CACHE_WRITE_1H_FALLBACK_MULTIPLIER);
    expect(CACHE_READ_FALLBACK_MULTIPLIER).toBe(svc.CACHE_READ_FALLBACK_MULTIPLIER);
    expect(CACHE_WRITE_5M_MULTIPLIER).toBe(svc.CACHE_WRITE_5M_MULTIPLIER);
  });

  it.each(['claude-sonnet-4-5', 'Claude Opus/4.1', 'x y:z', 'ABC_def.1-2'])(
    'modelSlug matches for %s',
    (m) => {
      expect(modelSlug(m)).toBe(svc.modelSlug(m));
    },
  );

  describe.each([
    ['full rate', FULL],
    ['no cache rates', NO_CACHE],
    ['only cache write', ONLY_WRITE],
  ])('priceTokens == priceUsage (%s)', (_n, rate) => {
    it.each(SETS.map((s, i) => [i, s] as const))('token set %i', (_i, s) => {
      const t = tok(s);
      expect(priceTokens(t, rate)).toBeCloseTo(svc.priceUsage(t, rate, 'm'), 12);
    });
  });
});

describe('rates: costForRow', () => {
  const rates = { 'claude-x': FULL };
  const base = { ...tok({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), aiModel: 'claude-x' };

  it('uses recorded cost when priced', () => {
    expect(costForRow({ ...base, costUsd: 1.23, costStatus: 'priced' }, rates)).toEqual({
      source: 'recorded',
      usd: 1.23,
    });
  });

  it('uses recorded cost when no status and costUsd > 0', () => {
    expect(costForRow({ ...base, costUsd: 0.5, costStatus: null }, rates)).toEqual({
      source: 'recorded',
      usd: 0.5,
    });
  });

  it('keeps a recorded 0 when status is priced', () => {
    expect(costForRow({ ...base, costUsd: 0, costStatus: 'priced' }, rates)).toEqual({
      source: 'recorded',
      usd: 0,
    });
  });

  it('re-prices rate_missing rows from tokens', () => {
    const c = costForRow({ ...base, costUsd: 0, costStatus: 'rate_missing' }, rates);
    expect(c.source).toBe('computed');
    expect(c.usd).toBeCloseTo(18, 10);
  });

  it('re-prices when no status and costUsd is 0 or null', () => {
    expect(costForRow({ ...base, costUsd: 0, costStatus: null }, rates).source).toBe('computed');
    expect(costForRow({ ...base, costUsd: null, costStatus: null }, rates).source).toBe('computed');
  });

  it('flags unpriced with $0 when the model has no rate', () => {
    expect(
      costForRow({ ...base, aiModel: 'unknown', costUsd: 0, costStatus: 'rate_missing' }, rates),
    ).toEqual({
      source: 'unpriced',
      usd: 0,
    });
    expect(
      costForRow({ ...base, aiModel: null, costUsd: null, costStatus: null }, rates).source,
    ).toBe('unpriced');
  });

  it('re-prices cache tokens with fallbacks (write 2x, read 0.1x, 5m 1.25x)', () => {
    const t = tok({
      cacheCreationInputTokens: 1_000_000,
      cacheCreation5mInputTokens: 400_000,
      cacheReadInputTokens: 1_000_000,
    });
    const c = costForRow(
      { ...t, aiModel: 'm', costUsd: null, costStatus: 'rate_missing' },
      { m: { inputUsdPerMTok: 10, outputUsdPerMTok: 50 } },
    );
    // 600k at 20 + 400k at 12.5 + 1M read at 1.0
    expect(c.usd).toBeCloseTo(12 + 5 + 1, 10);
  });

  it('rateFor slugs the model name', () => {
    expect(rateFor({ 'a-b': FULL }, 'A/B')).toBe(FULL);
    expect(rateFor({}, null)).toBeNull();
  });
});

describe('rates: ratesFromSettings / INR', () => {
  const rate = JSON.stringify({
    input_usd_per_mtok: 3,
    output_usd_per_mtok: 15,
    cache_read_usd_per_mtok: 0.3,
  });

  it('parses ai.rates.* and finance.usd_inr', () => {
    const r = ratesFromSettings([
      { key: 'ai.rates.claude-x', value: rate },
      { key: 'finance.usd_inr', value: '83.5' },
    ]);
    expect(r.rates['claude-x']).toEqual({
      inputUsdPerMTok: 3,
      outputUsdPerMTok: 15,
      cacheWriteUsdPerMTok: undefined,
      cacheReadUsdPerMTok: 0.3,
    });
    expect(r.usdInr).toBe(83.5);
    expect(r.usdInrFallback).toBe(false);
  });

  it('falls back to 85 when unset', () => {
    expect(USD_INR_FALLBACK).toBe(85);
    const r = ratesFromSettings([]);
    expect(r.usdInr).toBe(85);
    expect(r.usdInrFallback).toBe(true);
  });

  it.each(['abc', '0', '-3', '', 'NaN'])('falls back to 85 for invalid usd_inr %p', (v) => {
    const r = ratesFromSettings([{ key: 'finance.usd_inr', value: v }]);
    expect(r.usdInr).toBe(85);
    expect(r.usdInrFallback).toBe(true);
  });

  it('ignores malformed rate settings', () => {
    const r = ratesFromSettings([
      { key: 'ai.rates.bad', value: 'not json' },
      { key: 'ai.rates.partial', value: JSON.stringify({ input_usd_per_mtok: 1 }) },
      { key: 'ai.rates.nul', value: 'null' },
    ]);
    expect(r.rates).toEqual({});
  });
});
