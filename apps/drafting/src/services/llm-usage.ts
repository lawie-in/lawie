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
  inputTokens?: number;
  outputTokens?: number;
}

/** One event from the Anthropic SDK's message stream (message_start / content_block_delta / message_delta / ...). */
export function parseAnthropicStreamEvent(event: unknown): ParsedStreamFragment {
  const e = event as {
    type?: string;
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    delta?: { type?: string; text?: string };
    usage?: { input_tokens?: number | null; output_tokens?: number };
  };

  if (e.type === 'message_start') {
    const out: ParsedStreamFragment = {};
    if (typeof e.message?.usage?.input_tokens === 'number')
      out.inputTokens = e.message.usage.input_tokens;
    if (typeof e.message?.usage?.output_tokens === 'number')
      out.outputTokens = e.message.usage.output_tokens;
    return out;
  }
  if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
    return { text: e.delta.text };
  }
  if (e.type === 'message_delta' && e.usage) {
    const out: ParsedStreamFragment = {};
    if (typeof e.usage.output_tokens === 'number') out.outputTokens = e.usage.output_tokens;
    if (typeof e.usage.input_tokens === 'number') out.inputTokens = e.usage.input_tokens;
    return out;
  }
  return {};
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

export interface CallUsage {
  sectionId: string;
  inputTokens: number;
  outputTokens: number;
  usageSource: UsageSource;
}

export interface UsageTotals {
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
    return {
      inputTokens,
      outputTokens,
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

export function priceUsage(
  usage: { inputTokens: number; outputTokens: number },
  rate: ModelRate,
): number {
  return (
    (usage.inputTokens / 1_000_000) * rate.inputUsdPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputUsdPerMTok
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
