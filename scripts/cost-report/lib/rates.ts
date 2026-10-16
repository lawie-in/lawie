/**
 * T-453 cost report — tokens + rates -> cost. Pure.
 *
 * Mirrors the drafting service's pricing (apps/drafting/src/services/llm-usage.ts:
 * modelSlug, getModelRates, effectiveCacheRates, priceCacheUsage, priceUsage,
 * getUsdInrRate). It is restated here rather than imported because importing
 * llm-usage pulls in the service's logger, Mongoose models and settings cache.
 * If the service's pricing changes, change this file with it.
 */
import { ModelRate, RateTable, TokenCounts } from './types';

export const CACHE_WRITE_1H_FALLBACK_MULTIPLIER = 2;
export const CACHE_READ_FALLBACK_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
/** The service's fallback when finance.usd_inr is unset or invalid. */
export const USD_INR_FALLBACK = 85;

export const RATE_KEY_PREFIX = 'ai.rates.';
export const USD_INR_KEY = 'finance.usd_inr';

/** Same as the service: lower-case, anything outside a-z 0-9 . _ - becomes -. */
export function modelSlug(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

/** Parses one `ai.rates.<slug>` value. Null when malformed or missing in/out rates. */
export function parseRateSetting(raw: string): ModelRate | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.input_usd_per_mtok !== 'number' || typeof p.output_usd_per_mtok !== 'number') {
    return null;
  }
  return {
    inputUsdPerMTok: p.input_usd_per_mtok,
    outputUsdPerMTok: p.output_usd_per_mtok,
    cacheWriteUsdPerMTok:
      typeof p.cache_write_usd_per_mtok === 'number' ? p.cache_write_usd_per_mtok : undefined,
    cacheReadUsdPerMTok:
      typeof p.cache_read_usd_per_mtok === 'number' ? p.cache_read_usd_per_mtok : undefined,
  };
}

/** Builds the rate table and USD->INR rate from AppSetting {key, value} pairs. */
export function ratesFromSettings(settings: Array<{ key: string; value: string }>): {
  rates: RateTable;
  usdInr: number;
  usdInrFallback: boolean;
} {
  const rates: RateTable = {};
  let usdInr = USD_INR_FALLBACK;
  let usdInrFallback = true;
  for (const s of settings) {
    if (typeof s.key !== 'string' || typeof s.value !== 'string') continue;
    if (s.key.startsWith(RATE_KEY_PREFIX)) {
      const rate = parseRateSetting(s.value);
      if (rate) rates[s.key.slice(RATE_KEY_PREFIX.length)] = rate;
    } else if (s.key === USD_INR_KEY) {
      const n = Number(s.value);
      if (Number.isFinite(n) && n > 0) {
        usdInr = n;
        usdInrFallback = false;
      }
    }
  }
  return { rates, usdInr, usdInrFallback };
}

export function rateFor(rates: RateTable, model: string | null): ModelRate | null {
  if (!model) return null;
  return rates[modelSlug(model)] ?? null;
}

/** Cost in USD of one row's tokens at a rate, cache tokens included. */
export function priceTokens(t: TokenCounts, rate: ModelRate): number {
  const cacheWriteRate =
    rate.cacheWriteUsdPerMTok ?? rate.inputUsdPerMTok * CACHE_WRITE_1H_FALLBACK_MULTIPLIER;
  const cacheReadRate =
    rate.cacheReadUsdPerMTok ?? rate.inputUsdPerMTok * CACHE_READ_FALLBACK_MULTIPLIER;
  const created = t.cacheCreationInputTokens;
  const fiveMin = Math.min(created, t.cacheCreation5mInputTokens);
  const atWriteRate = created - fiveMin;
  return (
    (t.inputTokens / 1_000_000) * rate.inputUsdPerMTok +
    (t.outputTokens / 1_000_000) * rate.outputUsdPerMTok +
    (atWriteRate / 1_000_000) * cacheWriteRate +
    (fiveMin / 1_000_000) * rate.inputUsdPerMTok * CACHE_WRITE_5M_MULTIPLIER +
    (t.cacheReadInputTokens / 1_000_000) * cacheReadRate
  );
}

export type RowCost =
  | { source: 'recorded'; usd: number }
  | { source: 'computed'; usd: number }
  | { source: 'unpriced'; usd: 0 };

/**
 * A row's cost. The recorded costUsd is used when the row says it was priced
 * (costStatus 'priced'), or when it has no costStatus but a positive costUsd
 * (older Generation rows). A row marked 'rate_missing', or one with no usable
 * costUsd, is re-priced from its tokens with today's ai.rates; with no rate
 * for its model it is 'unpriced' and counts as 0.
 */
export function costForRow(
  row: TokenCounts & { costUsd: number | null; costStatus: string | null; aiModel: string | null },
  rates: RateTable,
): RowCost {
  const recorded = typeof row.costUsd === 'number' && Number.isFinite(row.costUsd);
  if (recorded && row.costStatus === 'priced') return { source: 'recorded', usd: row.costUsd! };
  const noStatus = row.costStatus === null || row.costStatus === undefined;
  if (recorded && noStatus && row.costUsd! > 0) {
    return { source: 'recorded', usd: row.costUsd! };
  }
  const rate = rateFor(rates, row.aiModel);
  if (!rate) {
    // No tokens and no rate: nothing to price, nothing missing.
    const tokens =
      row.inputTokens + row.outputTokens + row.cacheCreationInputTokens + row.cacheReadInputTokens;
    if (tokens === 0) return { source: 'computed', usd: 0 };
    return { source: 'unpriced', usd: 0 };
  }
  return { source: 'computed', usd: priceTokens(row, rate) };
}
