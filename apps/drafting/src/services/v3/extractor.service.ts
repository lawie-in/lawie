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
import { APP_SETTING_KEYS, getAppSetting } from '../app-settings.service';
import { AuxCallError, AuxCallUsage, callAuxModel } from '../aux-llm';
import { factTypeFor, isLedgerItem } from '../fact-ledger.service';
import { ChecklistItem, dateKindLabel } from '../intake-brief';
import { AiEffort, logLlmCall } from '../llm-usage';
import type { RulePack } from '../rule-pack.service';

import type { ExtractResult } from './types';
import { DropReason, validateExtraction } from './validate';

// ── Limits (Arjun §2) ───────────────────────────────────────────────────────

export const EXTRACTOR_LIMITS = {
  inputTokens: 8000,
  maxTokens: 1500,
  callsPerRun: 6,
  callsPerUserPerDay: 60,
  windowMs: 24 * 60 * 60 * 1000,
  timeoutMs: 20_000,
} as const;

/** T-684 adds these keys to APP_SETTING_KEYS; read by name until it merges. */
export const EXTRACTOR_MODEL_SETTING = 'ai.model.extractor';
export const EXTRACTOR_EFFORT_SETTING = 'ai.effort.extractor';
/** Arjun §2: the Phase 1 default when neither setting is readable. */
export const EXTRACTOR_DEFAULT_MODEL = 'claude-haiku-5-5';
export const EXTRACTOR_DEFAULT_EFFORT: AiEffort = 'low';

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
}

// ── Settings ────────────────────────────────────────────────────────────────

const EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

async function readSetting(key: string): Promise<string | null> {
  try {
    const v = (await getAppSetting(key)).trim();
    return v === '' ? null : v;
  } catch {
    return null;
  }
}

/** ai.model.extractor, else ai.intake_model (one release, ADR §4), else the Phase 1 default. */
export async function extractorModel(): Promise<string> {
  return (
    (await readSetting(EXTRACTOR_MODEL_SETTING)) ??
    (await readSetting(APP_SETTING_KEYS.INTAKE_MODEL)) ??
    EXTRACTOR_DEFAULT_MODEL
  );
}

/** ai.effort.extractor, default low. Any other value is the default. */
export async function extractorEffort(): Promise<AiEffort> {
  const v = (await readSetting(EXTRACTOR_EFFORT_SETTING))?.toLowerCase();
  return v !== undefined && (EFFORTS as readonly string[]).includes(v)
    ? (v as AiEffort)
    : EXTRACTOR_DEFAULT_EFFORT;
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
  return checklist
    .filter((i) => isLedgerItem(i) && (i.modelReadable || asked.has(i.key)))
    .map((i) => {
      const hint = hints.get(i.key);
      return {
        key: i.key,
        what: (i.kind === 'date' && i.dateKind ? dateKindLabel(i.dateKind) : null) ?? i.label,
        kind: kindWord(i),
        options: i.kind === 'choice' || i.kind === 'choices' ? i.options : [],
        ...(hint ? { hint } : {}),
      };
    });
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

function logDegraded(input: ExtractInput, reason: DegradedReason): void {
  // TODO(T-683 phase 2, after T-684): llm-usage.ts has no 'extract' stage and no
  // 'degraded' status yet; log it as an llm_call line with stage 'extract',
  // status 'degraded' and this reason once llm-usage.ts is granted.
  try {
    logger.warn(
      {
        event: 'v3_extract_degraded',
        reason,
        run_id: input.runId,
        ...(input.intakeId ? { intake_id: input.intakeId } : {}),
        turn: input.turn,
      },
      'v3_extract_degraded',
    );
  } catch {
    // Logging must never fail a turn.
  }
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
  const degraded = (reason: DegradedReason, usage?: ExtractUsage): ExtractOutcome => {
    logDegraded(input, reason);
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

  try {
    if (!(await takeUserSlot(input.userId, now))) return degraded('user_cap');
  } catch {
    // Fail open to v2: never 503 the user for intake.
    return degraded('rate_check_failed');
  }

  state.calls += 1;
  const [model, effort] = await Promise.all([extractorModel(), extractorEffort()]);
  const started = Date.now();
  const signal = AbortSignal.timeout(EXTRACTOR_LIMITS.timeoutMs);
  // TODO(T-683 phase 2, after T-684): stage 'extract' (llm-usage.ts LlmStage) and its
  // cost line against ai.cost_cap_paise_per_ink. Until then the intake stage carries it.
  const log = (status: 'completed' | 'failed', u: AuxCallUsage): void =>
    logLlmCall({
      stage: 'intake',
      call: EXTRACTOR_CALL,
      model,
      effort,
      status,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadInputTokens: u.cacheReadInputTokens,
      cacheCreationInputTokens: u.cacheCreationInputTokens,
      stopReason: u.stopReason,
      ...(input.intakeId ? { intakeId: input.intakeId } : {}),
      runId: input.runId,
    });

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
    log('completed', r);
    text = r.text;
    usage = { model, effort, usage: r, durationMs: Date.now() - started, status: 'completed' };
  } catch (err) {
    const u: AuxCallUsage =
      err instanceof AuxCallError
        ? err.usage
        : { inputTokens: 0, outputTokens: 0, usageSource: 'estimated', transport: 'direct' };
    log('failed', u);
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
      logDegraded(input, 'call_failed');
      return { status: 'degraded', reason: 'call_failed' };
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}
