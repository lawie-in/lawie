/**
 * llm-usage — token usage accounting for a generation (T-003).
 *
 * Kept separate from ai.service.ts (legal content — prompt builders only) so
 * this file, which never touches a prompt string, can be reviewed and
 * changed independently. See handoff/design/T-003-token-usage-design.md.
 */
import logger from '../config/logger';

import {
  APP_SETTING_KEYS,
  AppSettingMissingError,
  effortKeyChain,
  getAppSetting,
  MODEL_ROLE_REGISTRY,
  MODEL_ROLES,
  ModelRole,
  modelKeyChain,
  onAppSettingInvalidated,
  roleForLegacyModelKey,
} from './app-settings.service';
import { currentRunContext } from './run-context';

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

// Arjun, 15 Oct 2026 (after golden run 61): intake back to medium; low on
// Haiku 5.5 cost quality.
export const AI_EFFORT_DEFAULTS: Record<LlmStage, AiEffort> = {
  intake: 'medium',
  preflight: 'low',
  body: 'medium',
};

/**
 * T-684: each stage reads the effort of the model role that runs it. The
 * stage names stay as they are (they mirror the llm_call log enum).
 */
const STAGE_ROLE: Record<LlmStage, ModelRole> = {
  intake: 'extractor',
  preflight: 'fact_checker',
  body: 'drafter',
};

/**
 * T-684: the default effort per role when no key in its chain is set. The
 * three stage roles keep the T-453 stage defaults; legal_reviewer medium and
 * language low (ADR-drafting-v3 §4); matcher follows the extractor.
 */
export const ROLE_EFFORT_DEFAULTS: Readonly<Record<ModelRole, AiEffort>> = Object.freeze({
  matcher: AI_EFFORT_DEFAULTS.intake,
  extractor: AI_EFFORT_DEFAULTS.intake,
  drafter: AI_EFFORT_DEFAULTS.body,
  fact_checker: AI_EFFORT_DEFAULTS.preflight,
  legal_reviewer: 'medium',
  language: 'low',
});

function isAiEffort(v: string): v is AiEffort {
  return (AI_EFFORTS as readonly string[]).includes(v);
}

/**
 * The resolved effort per role, defaults included, for 60 s (as
 * getAppSetting's own cache). getAppSetting never caches a missing key, so
 * without this every call would read Mongo while no ai.effort.* row exists,
 * and an invalid value would warn on every call. Cleared with the settings
 * cache (setAppSetting for any effort key in the role's chain, _clearAppSettingsCache).
 */
const AI_EFFORT_TTL_MS = 60_000;
const effortCache = new Map<ModelRole, { value: AiEffort; expiresAt: number }>();

/** Test helper — clear the effort cache. NOT called in production paths. */
export function _clearAiEffortCache(): void {
  effortCache.clear();
}

/** T-684: the legacy model keys already warned about in this process (key names only). */
const warnedLegacyModelKeys = new Set<string>();

// Guarded: a test that replaces app-settings.service wholesale may not provide it.
if (typeof onAppSettingInvalidated === 'function') {
  onAppSettingInvalidated((key) => {
    if (key === null) {
      effortCache.clear();
      intakeCapCache.clear();
      warnedLegacyModelKeys.clear();
      return;
    }
    for (const kind of Object.keys(INTAKE_CAP_KEYS) as IntakeCapKind[])
      if (INTAKE_CAP_KEYS[kind] === key) intakeCapCache.delete(kind);
    for (const role of MODEL_ROLES)
      if (effortKeyChain(role).includes(key)) effortCache.delete(role);
  });
}

async function resolveRoleEffort(role: ModelRole): Promise<AiEffort> {
  // Role key, then (matcher) the extractor's chain, then the T-453 stage key.
  for (const key of effortKeyChain(role)) {
    let raw: string;
    try {
      raw = await getAppSetting(key);
    } catch {
      continue; // missing, or the read failed: try the next key
    }
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (isAiEffort(v)) return v;
    // Once per key per cache period: the result is cached below.
    logger.warn({ key }, `[llm-usage] ${key} is not a valid effort; using the default`);
  }
  return ROLE_EFFORT_DEFAULTS[role];
}

/**
 * T-684: `ai.effort.<role>`, then the old stage key (drafter ai.effort.body,
 * extractor ai.effort.intake, fact_checker ai.effort.preflight; matcher the
 * extractor's chain), then ROLE_EFFORT_DEFAULTS. Never throws: a missing key
 * (or a settings read that fails) moves to the next key; a value outside
 * low|medium|high|xhigh|max warns with the key name only, never the value, and
 * moves to the next key. Cached 60 s per role, defaults included.
 */
export async function getRoleEffort(role: ModelRole): Promise<AiEffort> {
  const now = Date.now();
  const hit = effortCache.get(role);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await resolveRoleEffort(role);
  effortCache.set(role, { value, expiresAt: now + AI_EFFORT_TTL_MS });
  return value;
}

/**
 * The effort for a stage: getRoleEffort of the stage's role (intake extractor,
 * preflight fact_checker, body drafter). Never throws. Missing everywhere, it is
 * AI_EFFORT_DEFAULTS[stage].
 */
export async function getAiEffort(stage: LlmStage): Promise<AiEffort> {
  return getRoleEffort(STAGE_ROLE[stage]);
}

// ── Model per role (T-684) ──────────────────────────────────────────────────
//
// Lives here, not in app-settings.service.ts, so it reads through the
// module's exported getAppSetting: tests that mock getAppSetting (spread over
// the real module) then still resolve.

export type ModelSource = 'new' | 'legacy';

export interface ResolvedModel {
  model: string;
  /** The key the value came from. */
  key: string;
  /** 'new' for an ai.model.* key, 'legacy' for a pre-T-684 key. */
  source: ModelSource;
}

function isMissingSettingError(err: unknown): boolean {
  return (
    (typeof AppSettingMissingError === 'function' && err instanceof AppSettingMissingError) ||
    (err instanceof Error && err.name === 'AppSettingMissingError')
  );
}

/**
 * T-684: the model id for a role, from the DB only (founder rule 2026-05-11:
 * no env or code default). Order: `ai.model.<role>`, then (matcher only) the
 * extractor's chain, then the legacy key (drafter ai.drafting_model, extractor
 * ai.intake_model, fact_checker ai.preflight_model). A value from a legacy key
 * logs one deprecation warn per legacy key per process (key names only).
 *
 * Throws AppSettingMissingError naming `ai.model.<role>` when no key in the
 * chain is set. Any other read error propagates unchanged, as getAppSetting's did.
 */
export async function resolveModelWithSource(role: ModelRole): Promise<ResolvedModel> {
  for (const key of modelKeyChain(role)) {
    let model: string;
    try {
      model = await getAppSetting(key);
    } catch (err) {
      if (isMissingSettingError(err)) continue;
      throw err;
    }
    const legacyRole = roleForLegacyModelKey(key);
    if (legacyRole === undefined) return { model, key, source: 'new' };
    if (!warnedLegacyModelKeys.has(key)) {
      warnedLegacyModelKeys.add(key);
      const replacedBy = MODEL_ROLE_REGISTRY[legacyRole].modelKey;
      logger.warn({ key, replacedBy }, `Deprecated AppSetting ${key} in use; set ${replacedBy}`);
    }
    return { model, key, source: 'legacy' };
  }
  throw new AppSettingMissingError(MODEL_ROLE_REGISTRY[role].modelKey);
}

/** T-684: resolveModelWithSource(role).model. Same order and errors. */
export async function resolveModel(role: ModelRole): Promise<string> {
  return (await resolveModelWithSource(role)).model;
}

// ── intake max_tokens caps (T-453 follow-up) ────────────────────────────────
//
// Arjun, 15 Oct 2026: intake_extract hit its 1500 cap on golden fixtures
// 21-24 (thinking counts against max_tokens), so the cap is config:
// ai.cap.intake_extract, default 3000. Arjun, 15 Oct 2026 (golden run 64,
// fixture 22 hit reception's 3000 cap): ai.cap.intake_reception, default 4000,
// same range rule. match (300) and fill (1500) stay in code.

export type IntakeCapKind = 'reception' | 'extract';

export const INTAKE_CAP_MIN = 500;
export const INTAKE_CAP_MAX = 8000;

export const INTAKE_EXTRACT_CAP_DEFAULT = 3000;
export const INTAKE_EXTRACT_CAP_MIN = INTAKE_CAP_MIN;
export const INTAKE_EXTRACT_CAP_MAX = INTAKE_CAP_MAX;

export const INTAKE_RECEPTION_CAP_DEFAULT = 4000;
export const INTAKE_RECEPTION_CAP_MIN = INTAKE_CAP_MIN;
export const INTAKE_RECEPTION_CAP_MAX = INTAKE_CAP_MAX;

const INTAKE_CAP_KEYS: Record<IntakeCapKind, string> = {
  reception: APP_SETTING_KEYS.CAP_INTAKE_RECEPTION,
  extract: APP_SETTING_KEYS.CAP_INTAKE_EXTRACT,
};

const INTAKE_CAP_DEFAULTS: Record<IntakeCapKind, number> = {
  reception: INTAKE_RECEPTION_CAP_DEFAULT,
  extract: INTAKE_EXTRACT_CAP_DEFAULT,
};

const intakeCapCache = new Map<IntakeCapKind, { value: number; expiresAt: number }>();

/** Test helper — clear the intake_extract cap cache. NOT called in production paths. */
export function _clearIntakeExtractCapCache(): void {
  intakeCapCache.delete('extract');
}

/** Test helper — clear the intake_reception cap cache. NOT called in production paths. */
export function _clearIntakeReceptionCapCache(): void {
  intakeCapCache.delete('reception');
}

async function resolveIntakeCap(kind: IntakeCapKind): Promise<number> {
  const key = INTAKE_CAP_KEYS[kind];
  const fallback = INTAKE_CAP_DEFAULTS[kind];
  let raw: string;
  try {
    raw = await getAppSetting(key);
  } catch {
    return fallback;
  }
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (n >= INTAKE_CAP_MIN && n <= INTAKE_CAP_MAX) return n;
  }
  // Once per cache period: the fallback is cached below. Key only, never the value.
  logger.warn(
    { key },
    `[llm-usage] ${key} is not an integer in ${INTAKE_CAP_MIN}-${INTAKE_CAP_MAX}; using the default`,
  );
  return fallback;
}

/**
 * `ai.cap.intake_<kind>`: max_tokens for that intake call. Never throws: a
 * missing key (or a failed settings read) is the default (reception 4000,
 * extract 3000); a value that is not a whole number in 500-8000 is the default
 * with a warn that names the key only. Cached 60 s per kind, defaults included.
 */
export async function getIntakeCap(kind: IntakeCapKind): Promise<number> {
  const now = Date.now();
  const hit = intakeCapCache.get(kind);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await resolveIntakeCap(kind);
  intakeCapCache.set(kind, { value, expiresAt: now + AI_EFFORT_TTL_MS });
  return value;
}

/** `ai.cap.intake_extract` (default 3000). See getIntakeCap. */
export function getIntakeExtractCap(): Promise<number> {
  return getIntakeCap('extract');
}

/** `ai.cap.intake_reception` (default 4000). See getIntakeCap. */
export function getIntakeReceptionCap(): Promise<number> {
  return getIntakeCap('reception');
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

/**
 * T-683: the stage on an llm_call line. The effort stages, plus 'extract' for
 * the v3 Extractor (role C), which reads its effort per role (getRoleEffort).
 */
export type LlmLogStage = LlmStage | 'extract';

/**
 * T-683: 'degraded' is a v3 Extractor turn that fell back to v2 (Arjun,
 * T-683 answers §4 item 6). It carries a reason code, never text.
 */
export type LlmCallStatus = 'completed' | 'failed' | 'degraded';

/** The fields of one llm_call line, as logged. Ids and counts only. */
export interface LlmCallRecord {
  event: 'llm_call';
  stage: LlmLogStage;
  call: string;
  model: string;
  effort: AiEffort | null;
  status: LlmCallStatus;
  /** T-683: the reason code of a 'degraded' line. Absent otherwise. */
  reason?: string;
  /** T-683 (Arjun §9): v3 candidates not bridged into the v2 ledger. A count; extract lines only. */
  bridge_skipped_non_verbatim?: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  stop_reason: string | null;
  /** Request start to final chunk or response, whole ms, >= 0 (T-681a). Completed and failed calls. */
  duration_ms: number;
  /** When the request started, ISO 8601 UTC (T-681a). */
  started_at: string;
  intake_id?: string;
  run_id?: string;
  /** T-681a: the attempt within the run, from the run context. */
  run_sequence?: number;
  /** T-681a: the run's template or rule pack id, from the run context. */
  template_id?: string;
  fixture_id?: string;
  /** T-705 (Vikram): a revision attempt's call, free or paid. Absent on every other call. */
  revision?: 'free' | 'paid';
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
  stage: LlmLogStage;
  /** Which call within the stage (intake_match, preflight, stream, d1, ...). A code label, never text. */
  call: string;
  model: string;
  effort: AiEffort | null;
  status: LlmCallStatus;
  /** T-683: a reason code for a 'degraded' line (e.g. 'timeout'). A code label, never text. */
  reason?: string;
  /** T-683 (Arjun §9): how many v3 candidates were not bridged (not verbatim). A count, never text. */
  bridgeSkippedNonVerbatim?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  stopReason?: string | null;
  /** Request start, epoch ms (Date.now()) taken just before the provider call (T-681a). */
  startedAt: number;
  /** Request start to final chunk or response, ms (Date.now() delta), on completed and failed calls (T-681a). */
  durationMs: number;
  /** The intake id, where the stage has one. */
  intakeId?: string;
  /**
   * The generation run id, where the stage has one. When unset, the current
   * run context (run-context.ts) gives it (T-681a); an explicit one wins.
   */
  runId?: string;
}

/** T-681a: whole ms, never negative; 0 for a non-finite value. */
function wholeMs(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** T-681a: epoch ms as ISO 8601; the epoch for a value Date cannot hold, so it never throws. */
function isoAt(ms: number): string {
  const d = new Date(Number.isFinite(ms) ? ms : 0);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/**
 * One Pino line per model call (T-453, Arjun ruling 2). Ids and counts only:
 * no prompt, no draft, no user content and no user id, because logs go to
 * third parties. Never throws.
 */
export function logLlmCall(c: LlmCallLog): void {
  // T-681a: the run this call belongs to, when there is one. Ids and counts
  // only. Sequence and template are taken only for the context's own run.
  const ctx = currentRunContext();
  const runId = c.runId || ctx?.runId;
  const inRun = ctx && ctx.runId === runId ? ctx : undefined;
  const record: LlmCallRecord = {
    event: 'llm_call',
    stage: c.stage,
    call: c.call,
    model: c.model,
    effort: c.effort,
    status: c.status,
    ...(c.status === 'degraded' && c.reason ? { reason: c.reason } : {}),
    ...(typeof c.bridgeSkippedNonVerbatim === 'number'
      ? { bridge_skipped_non_verbatim: c.bridgeSkippedNonVerbatim }
      : {}),
    input_tokens: c.inputTokens ?? 0,
    output_tokens: c.outputTokens ?? 0,
    cache_read_input_tokens: c.cacheReadInputTokens ?? 0,
    cache_creation_input_tokens: c.cacheCreationInputTokens ?? 0,
    stop_reason: c.stopReason ?? null,
    duration_ms: wholeMs(c.durationMs),
    started_at: isoAt(c.startedAt),
    ...(c.intakeId ? { intake_id: c.intakeId } : {}),
    ...(runId ? { run_id: runId } : {}),
    ...(inRun ? { run_sequence: inRun.runSequence } : {}),
    ...(inRun?.templateId ? { template_id: inRun.templateId } : {}),
    ...(inRun?.revision ? { revision: inRun.revision } : {}),
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
