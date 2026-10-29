/**
 * T-683: the v3 Extractor (role C, handoff/design/ADR-drafting-v3.md §3).
 *
 * One aux model call per intake turn: description + answers so far → ledger
 * candidates, validated by code (validate.ts). Returns an ExtractResult only:
 * it never writes Mongo, never asks the user and never picks the pack.
 * Behind feature.drafting_v3_stage ≥ 1 (stage.ts); the caller checks the stage.
 *
 * Guards (Arjun, handoff/design/T-683-extractor-answers.md §2 and §4):
 * - input ≤ 8,000 tokens (estimated): the description, the answers so far, the
 *   pack's checklist keys and per-field hints; no prior drafts;
 * - max_tokens 1,500, JSON only; the constant system prompt as one cached block (1h);
 * - ≤ 6 calls per run: beyond that the last good result is re-used;
 * - 60 calls per user per rolling 24 h (Redis); over the cap, or Redis
 *   unreadable, the turn is degraded and the caller uses v2;
 * - a 20 s timeout (AbortSignal);
 * - one call in flight per runId+turn: a second caller shares the first's outcome;
 * - on failure, timeout, a cap or bad JSON: no retry, `degraded` with a reason code.
 *
 * Not Ink-charged: it spends no intake quota and no Ink (intake is free).
 * Logs ids, counts and reason codes only: never the prompt, the output or a quote.
 */
import { randomUUID } from 'crypto';

import logger from '../../config/logger';
import {
  buildV3ExtractUserPrompt,
  V3_EXTRACTOR_SYSTEM_PROMPT,
  V3ExtractAnswer,
  V3ExtractLine,
} from '../../config/prompts/v3-extractor';
import redis from '../../config/redis';
import {
  AI_EFFORT_VALUES,
  APP_SETTING_KEYS,
  getAppSetting,
  MODEL_ROLE_REGISTRY,
  onAppSettingInvalidated,
} from '../app-settings.service';
import { AuxCallError, AuxCallUsage, callAuxModel } from '../aux-llm';
import { factTypeFor, isLedgerItem } from '../fact-ledger.service';
import { ChecklistItem, dateKindLabel } from '../intake-brief';
import { AiEffort, logLlmCall, resolveModel } from '../llm-usage';
import type { RulePack } from '../rule-pack.service';

import type { ExtractResult } from './types';
import { DropReason, isDerivedKey, validateExtraction } from './validate';

// ── Limits (Arjun §2) ───────────────────────────────────────────────────────

export const EXTRACTOR_LIMITS = {
  inputTokens: 8000,
  maxTokens: 1500,
  callsPerRun: 6,
  callsPerUserPerDay: 60,
  windowMs: 24 * 60 * 60 * 1000,
  timeoutMs: 20_000,
} as const;

/**
 * Arjun §5 item 3: the model ai.model.extractor is to be set to in Phase 1.
 * A documented value only, never a code fallback (founder rule 2026-05-11):
 * an unset model degrades the turn ('model_unset').
 */
export const EXTRACTOR_DEFAULT_MODEL = 'claude-haiku-5-5';

/** The llm_call label and the LlmAuxCall purpose of this call. */
export const EXTRACTOR_CALL = 'v3_extract' as const;

// ── Input / output ──────────────────────────────────────────────────────────

export interface ExtractInput {
  userId: string;
  /** The run this intake belongs to (until T-685: the intake id is fine). */
  runId: string;
  intakeId?: string;
  /** 0 for the description, then one per answer turn. */
  turn: number;
  pack: RulePack;
  /** buildChecklist(pack), as the caller built it. */
  checklist: ChecklistItem[];
  description: string;
  /** Every answer so far, oldest first. */
  answers: V3ExtractAnswer[];
  /** Today, ISO YYYY-MM-DD (IST). */
  today?: string;
}

export type DegradedReason =
  /** T-684: neither ai.model.extractor nor ai.intake_model is set (no code default). */
  | 'model_unset'
  | 'input_too_large'
  | 'user_cap'
  | 'rate_check_failed'
  | 'run_cap'
  | 'timeout'
  | 'call_failed'
  | 'max_tokens'
  | 'bad_json';

/** What the caller needs to write the LlmAuxCall row (purpose 'v3_extract'). Counts only. */
export interface ExtractUsage {
  model: string;
  effort: AiEffort;
  usage: AuxCallUsage;
  durationMs: number;
  status: 'completed' | 'failed';
}

export type ExtractOutcome =
  | {
      status: 'ok';
      result: ExtractResult;
      dropped: Partial<Record<DropReason, number>>;
      usage: ExtractUsage;
    }
  /** Over the per-run cap: the last good result of this run, no model call. */
  | { status: 'reused'; result: ExtractResult }
  /** The caller uses the v2 path for this turn. `usage` is set when a call was made. */
  | { status: 'degraded'; reason: DegradedReason; usage?: ExtractUsage };

// ── Per-run state (in process; T-685 persists run state) ────────────────────

interface RunState {
  calls: number;
  last: ExtractResult | null;
  touchedAt: number;
}

const RUN_STATE_MAX = 5000;
const RUN_STATE_TTL_MS = 6 * 60 * 60 * 1000;
const runs = new Map<string, RunState>();
const inFlight = new Map<string, Promise<ExtractOutcome>>();

function runState(runId: string, now: number): RunState {
  let s = runs.get(runId);
  if (s && now - s.touchedAt > RUN_STATE_TTL_MS) {
    runs.delete(runId);
    s = undefined;
  }
  if (!s) {
    if (runs.size >= RUN_STATE_MAX) {
      const oldest = runs.keys().next().value;
      if (oldest !== undefined) runs.delete(oldest);
    }
    s = { calls: 0, last: null, touchedAt: now };
    runs.set(runId, s);
  }
  s.touchedAt = now;
  return s;
}

/** Test helper: forget every run's state. NOT called in production paths. */
export function _resetExtractorState(): void {
  runs.clear();
  inFlight.clear();
  effortCached = null;
}

// ── Settings (T-684; Arjun, T-683 answers §8) ───────────────────────────────
//
// The model is the extractor role's: ai.model.extractor, else ai.intake_model
// for one release (resolveModel). No code default (founder rule 2026-05-11):
// unset everywhere, the turn is degraded with 'model_unset'.
//
// The effort has its own chain (§8 item 1): ai.effort.extractor_v3, then
// ai.effort.extractor, then medium. Never ai.effort.intake, so the v2 intake
// chain (getRoleEffort('extractor'): extractor, intake, medium) is unchanged
// and setting the v3 key never moves v2.

/** §8 item 1: the effort when neither key in the v3 chain holds a valid value. */
export const EXTRACTOR_V3_EFFORT_DEFAULT: AiEffort = 'medium';

/** The v3 effort keys, in order. */
export const EXTRACTOR_V3_EFFORT_KEYS: readonly string[] = Object.freeze([
  APP_SETTING_KEYS.EFFORT_EXTRACTOR_V3,
  MODEL_ROLE_REGISTRY.extractor.effortKey,
]);

const EFFORT_TTL_MS = 60_000;
let effortCached: { value: AiEffort; expiresAt: number } | null = null;

// Guarded: a test that replaces app-settings.service wholesale may not provide it.
if (typeof onAppSettingInvalidated === 'function') {
  onAppSettingInvalidated((key) => {
    if (key === null || EXTRACTOR_V3_EFFORT_KEYS.includes(key)) effortCached = null;
  });
}

/**
 * The v3 Extractor's effort. A missing key, a failed read or a value outside
 * the SDK's efforts moves to the next key (an invalid value warns with the key
 * name only). Cached 60 s, the default included. Never throws.
 */
export async function extractorV3Effort(): Promise<AiEffort> {
  const now = Date.now();
  if (effortCached && effortCached.expiresAt > now) return effortCached.value;
  let value: AiEffort = EXTRACTOR_V3_EFFORT_DEFAULT;
  for (const key of EXTRACTOR_V3_EFFORT_KEYS) {
    let raw: unknown;
    try {
      raw = await getAppSetting(key);
    } catch {
      continue;
    }
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if ((AI_EFFORT_VALUES as readonly string[]).includes(v)) {
      value = v as AiEffort;
      break;
    }
    logger.warn({ key }, `[v3-extractor] ${key} is not a valid effort; trying the next key`);
  }
  effortCached = { value, expiresAt: now + EFFORT_TTL_MS };
  return value;
}

/** Test helper: forget the cached effort. NOT called in production paths. */
export function _clearExtractorEffortCache(): void {
  effortCached = null;
}

// ── The prompt ──────────────────────────────────────────────────────────────

const KIND_WORDS: Record<ReturnType<typeof factTypeFor>, string> = {
  amount: 'amount',
  date: 'date',
  person_name: 'person name',
  place_name: 'place',
  police_station: 'police station',
  court: 'court',
  section_ref: 'section',
  case_number: 'case number',
  text: 'text',
  enum: 'choice',
  boolean: 'yes/no',
};

function kindWord(item: ChecklistItem): string {
  if (item.kind === 'list') return 'list';
  if (item.kind === 'choices') return 'list of choices';
  if (item.kind === 'number' && factTypeFor(item) === 'text') return 'number';
  if (
    item.kind === 'choice' &&
    item.options.length === 2 &&
    item.options
      .map((o) => o.trim().toLowerCase())
      .sort()
      .join('|') === 'no|yes'
  ) {
    return 'yes/no';
  }
  return KIND_WORDS[factTypeFor(item)];
}

/**
 * The FACT LIST: every ledger item the model may read from the description,
 * plus any item an answer was asked for. The hint is the pack's signed
 * `extract_hint`, read through rule-pack.service only.
 */
export function extractorLines(
  pack: RulePack,
  checklist: ChecklistItem[],
  answers: V3ExtractAnswer[],
): V3ExtractLine[] {
  const asked = new Set(answers.flatMap((a) => a.askedKeys));
  const hints = new Map<string, string>();
  for (const f of pack.facts) if (f.extract_hint) hints.set(f.key, f.extract_hint);
  return (
    checklist
      // Arjun §5: derived keys are never asked of the model (T-682 derive() only).
      .filter(
        (i) => isLedgerItem(i) && !isDerivedKey(i.key) && (i.modelReadable || asked.has(i.key)),
      )
      .map((i) => {
        const hint = hints.get(i.key);
        return {
          key: i.key,
          what: (i.kind === 'date' && i.dateKind ? dateKindLabel(i.dateKind) : null) ?? i.label,
          kind: kindWord(i),
          options: i.kind === 'choice' || i.kind === 'choices' ? i.options : [],
          ...(hint ? { hint } : {}),
        };
      })
  );
}

/**
 * A conservative token estimate: about 4 Latin characters a token, and one
 * token for every other character (Devanagari tokenises far worse).
 */
export function estimateInputTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4) + other;
}

/** The model's JSON object: the whole reply, or the one object inside a code fence. */
export function parseExtractorJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(t);
  const body = fenced ? fenced[1] : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(body.slice(start, end + 1));
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ── The per-user cap (Redis, rolling 24 h) ──────────────────────────────────

function userKey(userId: string): string {
  return `v3:extract:user:${userId}`;
}

/** True when this call is within the cap (and counts it). Throws when Redis cannot be read. */
async function takeUserSlot(userId: string, now: number): Promise<boolean> {
  const key = userKey(userId);
  const member = `${now}:${randomUUID()}`;
  const res = await redis
    .multi()
    .zremrangebyscore(key, 0, now - EXTRACTOR_LIMITS.windowMs)
    .zadd(key, now, member)
    .zcard(key)
    .pexpire(key, EXTRACTOR_LIMITS.windowMs)
    .exec();
  if (!res) throw new Error('redis multi aborted');
  for (const [err] of res) if (err) throw err;
  const count = Number(res[2][1]);
  if (count > EXTRACTOR_LIMITS.callsPerUserPerDay) {
    // A refused call does not count against the window.
    await redis.zrem(key, member).catch(() => undefined);
    return false;
  }
  return true;
}

// ── Logging (ids, counts, reason codes only) ────────────────────────────────

/** The llm_call line: stage 'extract'; 'degraded' carries the reason code. Never text. */
function logCall(
  input: ExtractInput,
  status: 'completed' | 'degraded',
  call: { model: string; effort: AiEffort | null; usage?: AuxCallUsage },
  reason?: DegradedReason,
): void {
  const u = call.usage;
  logLlmCall({
    stage: 'extract',
    call: EXTRACTOR_CALL,
    model: call.model,
    effort: call.effort,
    status,
    ...(status === 'degraded' && reason ? { reason } : {}),
    ...(u
      ? {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadInputTokens: u.cacheReadInputTokens,
          cacheCreationInputTokens: u.cacheCreationInputTokens,
          stopReason: u.stopReason,
        }
      : {}),
    ...(input.intakeId ? { intakeId: input.intakeId } : {}),
    runId: input.runId,
  });
}

function logValidated(
  input: ExtractInput,
  result: ExtractResult,
  dropped: Partial<Record<DropReason, number>>,
): void {
  try {
    logger.info(
      {
        event: 'v3_extract_validated',
        run_id: input.runId,
        ...(input.intakeId ? { intake_id: input.intakeId } : {}),
        turn: input.turn,
        candidates: result.candidates.length,
        conflicts: result.conflicts.length,
        non_answers: result.nonAnswers.length,
        unresolved: result.unresolved.length,
        dropped,
      },
      'v3_extract_validated',
    );
  } catch {
    // Logging must never fail a turn.
  }
}

// ── The call ────────────────────────────────────────────────────────────────

async function runExtract(input: ExtractInput): Promise<ExtractOutcome> {
  // Set once the model is known, so a degraded line names it ('' before).
  let model = '';
  let effort: AiEffort | null = null;
  const degraded = (reason: DegradedReason, usage?: ExtractUsage): ExtractOutcome => {
    logCall(input, 'degraded', { model, effort, ...(usage ? { usage: usage.usage } : {}) }, reason);
    return usage ? { status: 'degraded', reason, usage } : { status: 'degraded', reason };
  };

  const now = Date.now();
  const state = runState(input.runId, now);
  if (state.calls >= EXTRACTOR_LIMITS.callsPerRun) {
    return state.last ? { status: 'reused', result: state.last } : degraded('run_cap');
  }

  const lines = extractorLines(input.pack, input.checklist, input.answers);
  const user = buildV3ExtractUserPrompt(lines, input.description, input.answers);
  if (estimateInputTokens(V3_EXTRACTOR_SYSTEM_PROMPT + user) > EXTRACTOR_LIMITS.inputTokens) {
    return degraded('input_too_large');
  }

  // Before the per-user slot, so an unset model never spends one.
  try {
    model = (await resolveModel('extractor')).trim();
  } catch {
    return degraded('model_unset');
  }
  // resolveModel returns the first key that exists, even blank: a blank id is no model.
  if (model === '') return degraded('model_unset');
  effort = await extractorV3Effort();

  try {
    if (!(await takeUserSlot(input.userId, now))) return degraded('user_cap');
  } catch {
    // Fail open to v2: never 503 the user for intake.
    return degraded('rate_check_failed');
  }

  state.calls += 1;
  const started = Date.now();
  const signal = AbortSignal.timeout(EXTRACTOR_LIMITS.timeoutMs);

  let text: string;
  let usage: ExtractUsage;
  try {
    const r = await callAuxModel(
      {
        model,
        system: V3_EXTRACTOR_SYSTEM_PROMPT,
        user,
        maxTokens: EXTRACTOR_LIMITS.maxTokens,
        effort,
      },
      { signal, cacheSystem: true },
    );
    text = r.text;
    usage = { model, effort, usage: r, durationMs: Date.now() - started, status: 'completed' };
  } catch (err) {
    const u: AuxCallUsage =
      err instanceof AuxCallError
        ? err.usage
        : { inputTokens: 0, outputTokens: 0, usageSource: 'estimated', transport: 'direct' };
    const failed: ExtractUsage = {
      model,
      effort,
      usage: u,
      durationMs: Date.now() - started,
      status: 'failed',
    };
    return degraded(signal.aborted ? 'timeout' : 'call_failed', failed);
  }

  const parsed = parseExtractorJson(text);
  if (parsed === null) {
    return degraded(usage.usage.stopReason === 'max_tokens' ? 'max_tokens' : 'bad_json', usage);
  }

  logCall(input, 'completed', { model, effort, usage: usage.usage });
  const { result, dropped } = validateExtraction(parsed, {
    checklist: input.checklist,
    description: input.description,
    answers: input.answers,
    ...(input.today ? { today: input.today } : {}),
  });
  logValidated(input, result, dropped);
  state.last = result;
  return { status: 'ok', result, dropped, usage };
}

/**
 * One Extractor turn. Never throws: any failure is `degraded` with a reason
 * code, and the caller runs the v2 path for this turn. A second call for the
 * same runId+turn while one is in flight gets the same outcome.
 */
export function extractTurn(input: ExtractInput): Promise<ExtractOutcome> {
  const key = `${input.runId}:${input.turn}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = runExtract(input)
    .catch((): ExtractOutcome => {
      logCall(input, 'degraded', { model: '', effort: null }, 'call_failed');
      return { status: 'degraded', reason: 'call_failed' };
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}
