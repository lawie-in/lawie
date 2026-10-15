/**
 * llm-usage — token usage accounting for a generation (T-003).
 *
 * Kept separate from ai.service.ts (legal content — prompt builders only) so
 * this file, which never touches a prompt string, can be reviewed and
 * changed independently. See handoff/design/T-003-token-usage-design.md.
 */
import logger from '../config/logger';

import { APP_SETTING_KEYS, getAppSetting } from './app-settings.service';

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
  /** T-453: why the model stopped (message_delta.delta.stop_reason). Never text. */
  stopReason?: string;
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
    delta?: { type?: string; text?: string; stop_reason?: unknown };
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
  if (e.type === 'message_delta') {
    const out: ParsedStreamFragment = {};
    readUsage(e.usage, out);
    if (typeof e.delta?.stop_reason === 'string') out.stopReason = e.delta.stop_reason;
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

// ── Effort per stage and the per-call log line (T-453) ──────────────────────
//
// Arjun, 15 Oct 2026: both 5.5 models think by default and thinking counts as
// output and against max_tokens. Each stage sends output_config.effort, read
// from AppSettings (getAppSetting's 60 s cache) so the budget is config, not a
// redeploy. budget_tokens and thinking:{type:'disabled'} are never sent (400 on
// these models).

export type LlmStage = 'intake' | 'preflight' | 'body';

/** The effort values the installed SDK's OutputConfig accepts (0.91.0: low..max). */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const AI_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const AI_EFFORT_DEFAULTS: Record<LlmStage, AiEffort> = {
  intake: 'low',
  preflight: 'low',
  body: 'medium',
};

const AI_EFFORT_KEYS: Record<LlmStage, string> = {
  intake: APP_SETTING_KEYS.EFFORT_INTAKE,
  preflight: APP_SETTING_KEYS.EFFORT_PREFLIGHT,
  body: APP_SETTING_KEYS.EFFORT_BODY,
};

function isAiEffort(v: string): v is AiEffort {
  return (AI_EFFORTS as readonly string[]).includes(v);
}

/**
 * `ai.effort.<stage>`. Never throws: a missing key (or a settings read that
 * fails) is the default; a value outside low|medium|high|xhigh|max is the
 * default with a warn that names the key only, never the value.
 */
export async function getAiEffort(stage: LlmStage): Promise<AiEffort> {
  const key = AI_EFFORT_KEYS[stage];
  let raw: string;
  try {
    raw = await getAppSetting(key);
  } catch {
    return AI_EFFORT_DEFAULTS[stage];
  }
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (isAiEffort(v)) return v;
  logger.warn({ key }, `[llm-usage] ${key} is not a valid effort; using the default`);
  return AI_EFFORT_DEFAULTS[stage];
}

/**
 * Golden set only (scripts/golden-set): the fixture running now, carried on
 * every llm_call line until cleared. Fixtures run one at a time. Production
 * never sets it.
 */
let currentFixtureId: string | null = null;

export function setLlmLogFixtureId(id: string | null): void {
  currentFixtureId = id;
}

/** The fields of one llm_call line, as logged. Ids and counts only. */
export interface LlmCallRecord {
  event: 'llm_call';
  stage: LlmStage;
  call: string;
  model: string;
  effort: AiEffort | null;
  status: 'completed' | 'failed';
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  stop_reason: string | null;
  intake_id?: string;
  run_id?: string;
  fixture_id?: string;
}

/**
 * Golden set only: an in-process listener that gets each llm_call record
 * (a copy) as it is logged, so the harness can report per stage without
 * reading log output. Production never sets one. A throwing listener is ignored.
 */
let llmCallListener: ((r: LlmCallRecord) => void) | null = null;

export function setLlmCallListener(fn: ((r: LlmCallRecord) => void) | null): void {
  llmCallListener = fn;
}

export interface LlmCallLog {
  stage: LlmStage;
  /** Which call within the stage (intake_match, preflight, stream, d1, ...). A code label, never text. */
  call: string;
  model: string;
  effort: AiEffort | null;
  status: 'completed' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  stopReason?: string | null;
  /** The intake id, where the stage has one. */
  intakeId?: string;
  /** The generation run id, where the stage has one. */
  runId?: string;
}

/**
 * One Pino line per model call (T-453, Arjun ruling 2). Ids and counts only:
 * no prompt, no draft, no user content and no user id, because logs go to
 * third parties. Never throws.
 */
export function logLlmCall(c: LlmCallLog): void {
  const record: LlmCallRecord = {
    event: 'llm_call',
    stage: c.stage,
    call: c.call,
    model: c.model,
    effort: c.effort,
    status: c.status,
    input_tokens: c.inputTokens ?? 0,
    output_tokens: c.outputTokens ?? 0,
    cache_read_input_tokens: c.cacheReadInputTokens ?? 0,
    cache_creation_input_tokens: c.cacheCreationInputTokens ?? 0,
    stop_reason: c.stopReason ?? null,
    ...(c.intakeId ? { intake_id: c.intakeId } : {}),
    ...(c.runId ? { run_id: c.runId } : {}),
    ...(currentFixtureId ? { fixture_id: currentFixtureId } : {}),
  };
  try {
    logger.info(record, 'llm_call');
  } catch {
    // Logging must never fail a model call.
  }
  if (llmCallListener) {
    try {
      llmCallListener({ ...record });
    } catch {
      // A listener must never fail a model call.
    }
  }
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
      logger.warn(
        {
          model: key,
          cacheWriteFallbackMultiplier: CACHE_WRITE_1H_FALLBACK_MULTIPLIER,
          cacheReadFallbackMultiplier: CACHE_READ_FALLBACK_MULTIPLIER,
        },
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
