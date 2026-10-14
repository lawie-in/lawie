/**
 * llm-usage — token usage accounting for a generation (T-003).
 *
 * Kept separate from ai.service.ts (legal content — prompt builders only) so
 * this file, which never touches a prompt string, can be reviewed and
 * changed independently. See handoff/design/T-003-token-usage-design.md.
 */
import { getAppSetting } from './app-settings.service';

// ── Pure stream-event parsers ────────────────────────────────────────────────
// Take one already-JSON-parsed event/line and return whatever fragment of
// text/usage it carries. No I/O, no network — testable with plain objects.

export interface ParsedStreamFragment {
  text?: string;
  /** Uncached input only (T-437): Anthropic reports cache tokens separately. */
  inputTokens?: number;
  outputTokens?: number;
  /** T-437: tokens written to the prompt cache on this call (all TTLs). */
  cacheCreationInputTokens?: number;
  /** T-437: tokens read from the prompt cache on this call. */
  cacheReadInputTokens?: number;
  /** T-437: the 1h / 5m split of cacheCreationInputTokens, when the API reports it. */
  cacheCreation1hInputTokens?: number;
  cacheCreation5mInputTokens?: number;
}

/** The numeric fields of an Anthropic `usage` object we read. Everything else is ignored. */
interface AnthropicUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation?: {
    ephemeral_1h_input_tokens?: unknown;
    ephemeral_5m_input_tokens?: unknown;
  } | null;
}

/**
 * Copies the counts present on one Anthropic `usage` object onto a fragment.
 * A field that is absent or null (message_delta sends null for input on some
 * models) is left off, so the caller keeps the last value it saw.
 */
function readUsage(usage: AnthropicUsage | null | undefined, out: ParsedStreamFragment): void {
  if (!usage) return;
  const num = (v: unknown): v is number => typeof v === 'number';
  if (num(usage.input_tokens)) out.inputTokens = usage.input_tokens;
  if (num(usage.output_tokens)) out.outputTokens = usage.output_tokens;
  if (num(usage.cache_creation_input_tokens))
    out.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  if (num(usage.cache_read_input_tokens)) out.cacheReadInputTokens = usage.cache_read_input_tokens;
  const split = usage.cache_creation;
  if (split && num(split.ephemeral_1h_input_tokens))
    out.cacheCreation1hInputTokens = split.ephemeral_1h_input_tokens;
  if (split && num(split.ephemeral_5m_input_tokens))
    out.cacheCreation5mInputTokens = split.ephemeral_5m_input_tokens;
}

/** One event from the Anthropic SDK's message stream (message_start / content_block_delta / message_delta / ...). */
export function parseAnthropicStreamEvent(event: unknown): ParsedStreamFragment {
  const e = event as {
    type?: string;
    message?: { usage?: AnthropicUsage };
    delta?: { type?: string; text?: string };
    usage?: AnthropicUsage;
  };

  if (e.type === 'message_start') {
    const out: ParsedStreamFragment = {};
    readUsage(e.message?.usage, out);
    return out;
  }
  if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
    return { text: e.delta.text };
  }
  if (e.type === 'message_delta' && e.usage) {
    const out: ParsedStreamFragment = {};
    readUsage(e.usage, out);
    return out;
  }
  return {};
}

/**
 * T-373: the usage of a non-streamed call (`messages.create` / `messages.parse`,
 * the D1 structured-output call). The response carries the final counts on
 * `usage`; there are no stream events, so nothing reaches parseAnthropicStreamEvent.
 * Numbers only: the message content is never read here.
 */
export function parseAnthropicMessageUsage(message: unknown): ParsedStreamFragment {
  const usage = (message as { usage?: AnthropicUsage } | null)?.usage;
  const out: ParsedStreamFragment = {};
  readUsage(usage, out);
  return out;
}

/** True when a fragment carries any token count (not just text). */
export function hasUsage(f: ParsedStreamFragment): boolean {
  return (
    f.inputTokens !== undefined ||
    f.outputTokens !== undefined ||
    f.cacheCreationInputTokens !== undefined ||
    f.cacheReadInputTokens !== undefined
  );
}

/** T-437: the cache counts of one call. All optional: a call with no cache activity has none. */
export interface CacheUsage {
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  cacheCreation5mInputTokens?: number;
}

const CACHE_KEYS = [
  'cacheCreationInputTokens',
  'cacheReadInputTokens',
  'cacheCreation1hInputTokens',
  'cacheCreation5mInputTokens',
] as const;

/**
 * The non-zero cache counts of `from`, as an object to spread into a usage
 * record. Zero and absent are both left off, so a call with no cache activity
 * looks exactly as it did before T-437.
 */
export function cacheCounts(from: CacheUsage): CacheUsage {
  const out: CacheUsage = {};
  for (const k of CACHE_KEYS) {
    const v = from[k];
    if (typeof v === 'number' && v > 0) out[k] = v;
  }
  return out;
}

// ── Estimation fallback (D5) ─────────────────────────────────────────────────
//
// Used only when a provider reports no usage at all for a call. Rows priced
// from an estimate are marked `usageSource: 'estimated'` and excluded from
// the T-004 cost check. Rough ~4 chars/token average for English; worse for
// Hindi/bilingual drafts, which is exactly why it's excluded there.

export function estimateOutputTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ── UsageMeter — collects usage for every model call in one request ─────────

export type UsageSource = 'provider' | 'estimated';

export interface CallUsage extends CacheUsage {
  sectionId: string;
  /** Uncached input only; cache reads and writes are in the CacheUsage fields. */
  inputTokens: number;
  outputTokens: number;
  usageSource: UsageSource;
}

/** The cache fields are present only when non-zero (see cacheCounts). */
export interface UsageTotals extends CacheUsage {
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
  usageSource: UsageSource | 'mixed';
  calls: CallUsage[];
}

export class UsageMeter {
  private calls: CallUsage[] = [];

  record(call: CallUsage): void {
    this.calls.push(call);
  }

  totals(): UsageTotals {
    const inputTokens = this.calls.reduce((sum, c) => sum + c.inputTokens, 0);
    const outputTokens = this.calls.reduce((sum, c) => sum + c.outputTokens, 0);
    const sources = new Set(this.calls.map((c) => c.usageSource));
    const usageSource: UsageTotals['usageSource'] =
      sources.size === 0 ? 'provider' : sources.size === 1 ? [...sources][0]! : 'mixed';
    const cache: CacheUsage = {};
    for (const k of CACHE_KEYS) cache[k] = this.calls.reduce((sum, c) => sum + (c[k] ?? 0), 0);
    return {
      inputTokens,
      outputTokens,
      ...cacheCounts(cache),
      llmCalls: this.calls.length,
      usageSource,
      calls: [...this.calls],
    };
  }
}

// ── Model rates (AppSetting: ai.rates.<model-slug>, finance.usd_inr) ────────

/**
 * `<model-slug>` is the exact text of the configured model id, lower-cased,
 * with any character outside a-z 0-9 . _ - replaced by -. A model name can
 * contain "/", which an AppSetting key cannot.
 */
export function modelSlug(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

export interface ModelRate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheWriteUsdPerMTok?: number;
  cacheReadUsdPerMTok?: number;
}

export type RateLookup =
  | { costStatus: 'priced'; rate: ModelRate }
  | { costStatus: 'rate_missing'; rate: null };

/**
 * Reads `ai.rates.<model-slug>`. Never throws — a missing key or malformed
 * JSON both mean "rate missing", logged by the caller, cost 0, draft
 * unaffected (design 3.5/3.6).
 */
export async function getModelRates(model: string): Promise<RateLookup> {
  const key = `ai.rates.${modelSlug(model)}`;
  try {
    const raw = await getAppSetting(key);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.input_usd_per_mtok !== 'number' ||
      typeof parsed.output_usd_per_mtok !== 'number'
    ) {
      return { costStatus: 'rate_missing', rate: null };
    }
    return {
      costStatus: 'priced',
      rate: {
        inputUsdPerMTok: parsed.input_usd_per_mtok,
        outputUsdPerMTok: parsed.output_usd_per_mtok,
        cacheWriteUsdPerMTok:
          typeof parsed.cache_write_usd_per_mtok === 'number'
            ? parsed.cache_write_usd_per_mtok
            : undefined,
        cacheReadUsdPerMTok:
          typeof parsed.cache_read_usd_per_mtok === 'number'
            ? parsed.cache_read_usd_per_mtok
            : undefined,
      },
    };
  } catch {
    return { costStatus: 'rate_missing', rate: null };
  }
}

/**
 * T-437: what a cache rate falls back to when `ai.rates.<model>` has none.
 * Anthropic's published multipliers: a 1h cache write is 2x the input rate,
 * a cache read 0.1x. A 5-minute write is always 1.25x the input rate (the
 * stored cache_write rate is the 1h price, Arjun 14 Oct).
 */
export const CACHE_WRITE_1H_FALLBACK_MULTIPLIER = 2;
export const CACHE_READ_FALLBACK_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;

export interface EffectiveCacheRates {
  cacheWriteUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
  /** True when either rate came from the fallback multipliers, not the config. */
  fallback: boolean;
}

/** The cache rates to price with: the configured ones, else the fallback multipliers of the input rate. */
export function effectiveCacheRates(rate: ModelRate): EffectiveCacheRates {
  const write = rate.cacheWriteUsdPerMTok;
  const read = rate.cacheReadUsdPerMTok;
  return {
    cacheWriteUsdPerMTok: write ?? rate.inputUsdPerMTok * CACHE_WRITE_1H_FALLBACK_MULTIPLIER,
    cacheReadUsdPerMTok: read ?? rate.inputUsdPerMTok * CACHE_READ_FALLBACK_MULTIPLIER,
    fallback: write === undefined || read === undefined,
  };
}

/** Models already warned about a missing cache rate in this process (warn once each). */
const warnedMissingCacheRate = new Set<string>();

export interface PricedUsage extends CacheUsage {
  inputTokens: number;
  outputTokens: number;
}

/** T-437: the cost of the cache tokens alone, split into write and read. */
export function priceCacheUsage(
  usage: CacheUsage,
  rate: ModelRate,
  model?: string,
): { cacheWriteUsd: number; cacheReadUsd: number } {
  const created = usage.cacheCreationInputTokens ?? 0;
  const read = usage.cacheReadInputTokens ?? 0;
  if (created <= 0 && read <= 0) return { cacheWriteUsd: 0, cacheReadUsd: 0 };
  const rates = effectiveCacheRates(rate);
  if (rates.fallback) {
    const key = model ?? '(unknown model)';
    if (!warnedMissingCacheRate.has(key)) {
      warnedMissingCacheRate.add(key);
      console.warn(
        `[llm-usage] ai.rates for ${key} has no cache_write_usd_per_mtok and/or cache_read_usd_per_mtok; ` +
          `pricing cache tokens at ${CACHE_WRITE_1H_FALLBACK_MULTIPLIER}x (write) / ${CACHE_READ_FALLBACK_MULTIPLIER}x (read) the input rate`,
      );
    }
  }
  // A 5m write is 1.25x input; everything else written (the 1h bucket, or the
  // whole total when the API gives no split) is at the stored 1h write rate.
  const fiveMin = Math.min(created, usage.cacheCreation5mInputTokens ?? 0);
  const atWriteRate = created - fiveMin;
  const cacheWriteUsd =
    (atWriteRate / 1_000_000) * rates.cacheWriteUsdPerMTok +
    (fiveMin / 1_000_000) * rate.inputUsdPerMTok * CACHE_WRITE_5M_MULTIPLIER;
  const cacheReadUsd = (read / 1_000_000) * rates.cacheReadUsdPerMTok;
  return { cacheWriteUsd, cacheReadUsd };
}

/**
 * Cost of one call or one generation's totals. `inputTokens` is uncached
 * input only and is priced at the input rate; cache writes and reads are
 * priced by priceCacheUsage. `model` is only used to name the model in the
 * once-per-model warning when a cache rate is missing.
 */
export function priceUsage(usage: PricedUsage, rate: ModelRate, model?: string): number {
  const cache = priceCacheUsage(usage, rate, model);
  return (
    (usage.inputTokens / 1_000_000) * rate.inputUsdPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputUsdPerMTok +
    cache.cacheWriteUsd +
    cache.cacheReadUsd
  );
}

/** T-437: every token a call processed — uncached input, output, cache writes and cache reads. */
export function totalTokens(usage: PricedUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.cacheCreationInputTokens ?? 0) +
    (usage.cacheReadInputTokens ?? 0)
  );
}

/** `finance.usd_inr` — falls back to 85 (today's hardcoded value) if unset or invalid. Never throws. */
export async function getUsdInrRate(): Promise<number> {
  try {
    const raw = await getAppSetting('finance.usd_inr');
    const rate = Number(raw);
    return Number.isFinite(rate) && rate > 0 ? rate : 85;
  } catch {
    return 85;
  }
}
