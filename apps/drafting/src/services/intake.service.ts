/**
 * Intake — describe-first: description → template + quote-backed field values.
 * ADR-019 §3.2–§3.10, §4.1, §4.2. Ticket T-101.
 *
 * Privacy rule (T-101): no description text, quote or field value is ever
 * logged, stored in a usage row, or put in an error message. Logs carry ids,
 * outcomes and counts only.
 */
import crypto from 'crypto';

import { DOC_TYPE_ALIASES } from '../config/catalogue/aliases';
import redis from '../config/redis';
import { Event } from '../models/Event.model';
import type { IFactLedger } from '../models/FactLedger.model';
import { LlmAuxCall, LlmAuxPurpose } from '../models/LlmAuxCall.model';
import { presentDescription } from '../utils/presentDescription';
import { PublicFormFieldKey, publicFormField } from '../utils/publicTemplateConfig';

import { AppSettingMissingError } from './app-settings.service';
import { AuxCallError, AuxCallUsage, callAuxModel } from './aux-llm';
import { loadAvermentLists } from './averments';
import { applyBailGuard } from './bail-guard';
import { ledgerCustodyInputs } from './custody-since-derivation';
import {
  applyEdits,
  carryOver,
  createLedger,
  currentState,
  extractLines,
  FACT_LEDGER_SETTING,
  holdDescriptionNone,
  LedgerEdit,
  LedgerEditResult,
  LedgerView,
  ledgerView,
  loadOwnLedger,
  overlayBrief,
  readExtraction,
  referenceYear,
} from './fact-ledger.service';
import { DESCRIBE_FIRST_SETTING, hiddenTemplateIds, isSwitchOn } from './feature-switches';
import {
  Brief,
  BriefCourt,
  BriefQuestion,
  buildBrief,
  buildChecklist,
  buildQuestions as buildBriefQuestions,
  checklistLines,
  checkRead,
  ChecklistItem,
  datesReadByCode,
  fixedChecklist,
  GivenValue,
  guidedDateItem,
  hasCourtSignal,
  isCourtDocument,
  ledgerGivenKeys,
  namesSupremeCourt,
  PROTECTED_QUESTION_KEY,
  QUESTION_LIMITS as BRIEF_QUESTION_LIMITS,
  readGuidedBrief,
  statedDates,
  valuesAfterEditedDescription,
  withoutLedgerGiven,
  wordedQuestions,
} from './intake-brief';
import { readIntakeCache, writeIntakeCache } from './intake-cache';
import { matchKeywords, rankKeywordCandidates } from './intake-keyword-match';
import {
  datesInText,
  digitsOnly,
  iso,
  isOwnWords,
  normalise,
  parseModelJson,
  withAmountInWords,
} from './intake-text';
import {
  buildFillUserPrompt,
  buildMatchUserPrompt,
  buildReceptionGuidedUserPrompt,
  buildExtractUserPrompt,
  buildReceptionPackUserPrompt,
  CatalogueEntry,
  EXTRACT_SYSTEM_PROMPT,
  FILL_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
  RECEPTION_GUIDED_SYSTEM_PROMPT,
  RECEPTION_PACK_SYSTEM_PROMPT,
  ReceptionAnswer,
} from './intake.prompts';
import {
  getAiEffort,
  getIntakeExtractCap,
  getIntakeReceptionCap,
  getModelRates,
  INTAKE_EXTRACT_CAP_DEFAULT,
  INTAKE_RECEPTION_CAP_DEFAULT,
  logLlmCall,
  priceUsage,
  resolveModel,
} from './llm-usage';
import { loadRulePack, RulePack } from './rule-pack.service';
import {
  evaluateShowIf,
  FormField,
  listTemplateConfigs,
  loadTemplateConfig,
  TemplateConfig,
} from './template-engine.service';

// The text helpers live in intake-text.ts. They are re-exported here so existing imports keep working.
export { datesInText, normalise, parseModelJson } from './intake-text';

// ── Switch (ADR-019 §3.11) ──────────────────────────────────────────────────

// T-375: the reader and DESCRIBE_FIRST_SETTING live in feature-switches.ts.
export { DESCRIBE_FIRST_SETTING };

/**
 * `feature.describe_first`: the admin setting is "on" (everyone) or "off" (no
 * one, the kill switch). T-356: the user-id list form is retired. No
 * AppSetting doc, or any other value (a legacy list, a typo), falls back to
 * FEATURE_DEFAULT_DESCRIBE_FIRST (default on). Never throws: any other problem
 * reading it means off, so the gallery shows.
 */
export async function isDescribeFirstEnabled(userId: string): Promise<boolean> {
  return isSwitchOn(DESCRIBE_FIRST_SETTING, userId);
}

/**
 * T-147b: `feature.fact_ledger`, read the same way as `feature.describe_first`.
 * No AppSetting doc, or a value other than "on"/"off": falls back to
 * FEATURE_DEFAULT_FACT_LEDGER (default off until T-356 part 2). Off: the brief
 * works exactly as before, with no extraction call and no ledger. On: the
 * extraction pass runs and the ledger is written.
 */
export async function isFactLedgerEnabled(userId: string): Promise<boolean> {
  return isSwitchOn(FACT_LEDGER_SETTING, userId);
}

// ── Limits and caps (ADR-019 §3.8, founder D6) ──────────────────────────────

export const INTAKE_LIMITS = {
  burstMax: 10,
  burstWindowSeconds: 600,
  dailyFree: 40,
  dailyPaid: 150,
  matchMaxTokens: 300,
  /**
   * T-610 (Arjun, 26 Oct 2026): the one retry of the MATCH call, after a
   * malformed, truncated or off-list answer, has a larger cap. The first call stays at 300.
   */
  matchRetryMaxTokens: 600,
  fillMaxTokens: 1500,
  /**
   * T-105: Reception reads up to 40 checklist lines and words up to 10 questions.
   * T-453 follow-up (golden run 64): the default only; the cap in use is
   * ai.cap.intake_reception (getIntakeReceptionCap, 500-8000, default 4000).
   */
  receptionMaxTokens: INTAKE_RECEPTION_CAP_DEFAULT,
  /**
   * T-147b: the extraction pass returns one short span per fact, for up to 40 facts.
   * T-453 follow-up: the default only; the cap in use is ai.cap.intake_extract
   * (getIntakeExtractCap, 500-8000, default 3000).
   */
  extractMaxTokens: INTAKE_EXTRACT_CAP_DEFAULT,
  /** T-147b: versions one fact ledger may hold. One `/intake/brief/update` request writes at most one. */
  maxLedgerVersions: 100,
  /** T-105: model-calling requests allowed for one intake after its first (rounds and changes of kind). */
  followUpsPerIntake: 6,
  answerMax: 2000,
  descriptionMin: 20,
  descriptionMax: 4000,
} as const;

/** T-147b: a ledger id that does not exist or is not this user's. Always a 404. */
export class LedgerNotFoundError extends Error {
  constructor() {
    super('ledger not found');
    this.name = 'LedgerNotFoundError';
  }
}

/** T-147b: the most versions one fact ledger holds. */
export const MAX_LEDGER_VERSIONS = INTAKE_LIMITS.maxLedgerVersions;

export class IntakeLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly scope: 'burst' | 'daily';
  constructor(scope: 'burst' | 'daily', retryAfterSeconds: number) {
    super(`intake ${scope} limit reached`);
    this.name = 'IntakeLimitError';
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Calendar day in India, so the daily quota resets at midnight IST. */
function istDayKey(now: Date): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 10).replace(/-/g, '');
}

function secondsToIstMidnight(now: Date): number {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const next = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - ist.getTime()) / 1000));
}

/**
 * Hard block, counted in Redis (ADR §3.8). Counts one per model-calling
 * intake request. A rejected request is not counted. Throws IntakeLimitError.
 * Any Redis failure propagates — the caller treats that as `unavailable`,
 * so no model call is ever made without the guard.
 */
export async function consumeIntakeQuota(
  userId: string,
  plan: string,
  now = new Date(),
): Promise<void> {
  const burstKey = `intake:burst:${userId}`;
  const dayKey = `intake:day:${userId}:${istDayKey(now)}`;
  const dailyMax = plan === 'free' ? INTAKE_LIMITS.dailyFree : INTAKE_LIMITS.dailyPaid;

  const burst = await redis.incr(burstKey);
  if (burst === 1) await redis.expire(burstKey, INTAKE_LIMITS.burstWindowSeconds);
  if (burst > INTAKE_LIMITS.burstMax) {
    await redis.decr(burstKey);
    const ttl = await redis.ttl(burstKey);
    throw new IntakeLimitError('burst', ttl > 0 ? ttl : INTAKE_LIMITS.burstWindowSeconds);
  }

  const day = await redis.incr(dayKey);
  if (day === 1) await redis.expire(dayKey, 2 * 24 * 3600);
  if (day > dailyMax) {
    await redis.decr(dayKey);
    await redis.decr(burstKey);
    throw new IntakeLimitError('daily', secondsToIstMidnight(now));
  }
}

// ── Catalogue (the allowlist) ───────────────────────────────────────────────

/**
 * The allowlist is the active template catalogue: only an id in this list
 * can be matched (ADR §3.4, §4.2.3). Anything else is no match.
 */
export function getCatalogue(): CatalogueEntry[] {
  return listTemplateConfigs()
    .map((t) => ({
      template_id: t.template_id,
      display_name: t.display_name,
      category: t.category,
      description: presentDescription(t.description),
      ...(t.match_terms ? { match_terms: t.match_terms } : {}),
    }))
    .sort((a, b) => a.template_id.localeCompare(b.template_id));
}

/**
 * T-375: the catalogue less every template a feature switch hides (the civil
 * plaints while `feature.template_civil_plaint` is off), so describe-first
 * never offers one. The fixture user sees them all (T-356 reader).
 */
export async function getEnabledCatalogue(userId: string): Promise<CatalogueEntry[]> {
  const hidden = await hiddenTemplateIds(userId);
  const all = getCatalogue();
  return hidden.size === 0 ? all : all.filter((c) => !hidden.has(c.template_id));
}

// ── Fields the model may never fill (ADR §3.5, §4.1.2) ───────────────────────

const COURT_LIKE_ID = /(^|_)(court|courts|district|police_station|thana|bench|tribunal)(_|$)/;

export function isModelFillable(field: FormField): boolean {
  if (field.type === 'file') return false;
  const src = `${field.options_from ?? ''} ${field.source ?? ''}`;
  if (/courts/i.test(src)) return false; // choices from the courts data
  if (field.options_from === 'supported_languages') return false; // taken from the request
  if (COURT_LIKE_ID.test(field.field_id) && field.type !== 'currency' && field.type !== 'number') {
    return false;
  }
  return true;
}

export function allFields(config: TemplateConfig): FormField[] {
  return config.form_schema.steps.flatMap((s) => s.fields);
}

// ── Match result ────────────────────────────────────────────────────────────

export interface MatchDecision {
  kind: 'matched' | 'needs_choice' | 'guided' | 'no_match';
  templateId?: string;
  choices?: string[];
  /** Why no_match, for the demand signal: not legal drafting, or the model named an unknown id / was malformed. */
  noMatchReason?: 'not_legal_drafting' | 'unknown_template' | 'malformed';
  /**
   * T610-T5 (Ajay F2/F2a/F2b, 1bf3df1a, f0985461, edfe8645): the two bail cards shown
   * after the model failed twice. Never cached. The bail guard still runs on them: it
   * only reorders on the T-127 cues (arrested: bail_regular first; expects:
   * bail_anticipatory first; both or none: the F2 order), never adds or removes one.
   */
  t5Fallback?: boolean;
  // T-115e (Ajay, 12 Oct 2026): the model's matter label is not kept. It can
  // carry party names, and a demand signal holds no personal data.
  category: string;
  isCourtDocument: boolean;
}

/**
 * T-115e (Ajay, 12 Oct 2026): the demand-signal category is a fixed value from
 * this list, never model or user text. The list is the one the match prompt
 * names (intake.prompts.ts); anything else is stored as 'other'.
 */
export const DEMAND_CATEGORIES = [
  'criminal',
  'civil',
  'family',
  'property',
  'consumer',
  'corporate',
  'labour',
  'notice',
  'affidavit',
  'agreement',
  'other',
] as const;
export type DemandCategory = (typeof DEMAND_CATEGORIES)[number];

function demandCategory(raw: unknown): DemandCategory {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (DEMAND_CATEGORIES as readonly string[]).includes(v) ? (v as DemandCategory) : 'other';
}

function cleanLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Server-side guard on top of the prompt: no digits, no long strings.
  return raw.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ── T-610: reading the MATCH answer, the threshold and the top-3 pick ───────

/**
 * T-610 (ADR-drafting-v3 3B): at or above this, the top candidate is matched.
 * Below it the user picks from up to 3. Start value; tuned later on logged intakes.
 */
export const MATCH_PICK_THRESHOLD = 0.75;

/**
 * T-610: today's MATCH answer gives confidence as a word (the prompt is Ajay's
 * and keeps that shape). Code maps it to a number for the threshold. The named
 * alternatives never score above medium, so only the primary can be matched.
 */
export const LEGACY_MATCH_CONFIDENCE = { high: 0.9, medium: 0.6, low: 0.3 } as const;

/** The most choices a needs_choice offers. */
export const MAX_MATCH_CHOICES = 3;

export interface MatchCandidate {
  templateId: string;
  confidence: number;
}

/**
 * The MATCH answer, read. `problem` is set when the answer cannot be used as
 * given (worth one retry): `malformed` (unparseable, truncated, or no valid
 * confidence) or `off_list` (it names ids, and none is in the catalogue).
 */
export interface MatchAnswer {
  problem?: 'malformed' | 'off_list';
  isLegalDrafting: boolean;
  /** Allowed ids only, after alias resolution, deduped, in the model's order. */
  candidates: MatchCandidate[];
  category: string;
  isCourtDocument: boolean;
}

function idKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * T-610: an id the model named, as a catalogue id. Exact, then simple
 * normalisation (case, spaces, hyphens, quotes), then DOC_TYPE_ALIASES
 * (bail_application → bail_regular), then the display name. Null when none is allowed.
 */
export function resolveTemplateId(
  raw: string,
  allowed: ReadonlySet<string>,
  displayNames?: ReadonlyMap<string, string>,
): string | null {
  if (allowed.has(raw)) return raw;
  const key = idKey(raw);
  if (allowed.has(key)) return key;
  const alias = DOC_TYPE_ALIASES[key];
  if (alias && allowed.has(alias)) return alias;
  const byName = displayNames?.get(key);
  if (byName && allowed.has(byName)) return byName;
  return null;
}

/** Display name (as an id key) → template id, for resolveTemplateId. */
export function displayNameIndex(catalogue: CatalogueEntry[]): Map<string, string> {
  return new Map(catalogue.map((c) => [idKey(c.display_name), c.template_id]));
}

export function readMatchAnswer(
  parsed: Record<string, unknown> | null,
  allowed: ReadonlySet<string>,
  displayNames?: ReadonlyMap<string, string>,
): MatchAnswer {
  if (!parsed) {
    return {
      problem: 'malformed',
      isLegalDrafting: true,
      candidates: [],
      category: '',
      isCourtDocument: false,
    };
  }
  const base = {
    isLegalDrafting: parsed.is_legal_drafting !== false,
    category: demandCategory(parsed.category),
    isCourtDocument: parsed.is_court_document === true,
  };
  if (!base.isLegalDrafting) return { ...base, candidates: [] };

  const word = parsed.confidence;
  if (word !== 'high' && word !== 'medium' && word !== 'low') {
    return { ...base, problem: 'malformed', candidates: [] };
  }
  const primary = typeof parsed.template_id === 'string' ? parsed.template_id : null;
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.filter((a): a is string => typeof a === 'string')
    : [];
  const top = LEGACY_MATCH_CONFIDENCE[word];
  const rest = Math.min(top, LEGACY_MATCH_CONFIDENCE.medium);
  const named: Array<[string, number]> = [
    ...(primary ? [[primary, top] as [string, number]] : []),
    ...alternatives.map((a) => [a, rest] as [string, number]),
  ];

  const candidates: MatchCandidate[] = [];
  for (const [raw, confidence] of named) {
    const id = resolveTemplateId(raw, allowed, displayNames);
    if (id && !candidates.some((c) => c.templateId === id)) {
      candidates.push({ templateId: id, confidence });
    }
  }
  // Ids named and none in the catalogue. "low" means no template fits, so it is not a bad answer.
  const offList = named.length > 0 && candidates.length === 0 && word !== 'low';
  return { ...base, candidates, ...(offList ? { problem: 'off_list' as const } : {}) };
}

/**
 * T-610: the decision from a read answer and the keyword ranking (allowed ids, best first).
 *
 * - Not legal drafting: the T5 pair (T610-E1), else the keyword candidates as a pick,
 *   or no_match when there are none.
 * - A problem answer (after the caller's one retry): the keyword candidates
 *   as a pick, or no_match when there are none.
 * - Top candidate at or above MATCH_PICK_THRESHOLD: matched.
 * - Otherwise up to 3 choices: model confidence, then keyword rank, then the
 *   model's order; keyword-only ids after. None at all: guided.
 *
 * Keywords never give 'matched' on their own.
 */
export function decideFromAnswer(
  answer: MatchAnswer,
  keywordIds: readonly string[] = [],
  t5Pair: readonly string[] | null = null,
): MatchDecision {
  const base = { category: answer.category, isCourtDocument: answer.isCourtDocument };
  const keywords = [...new Set(keywordIds)];
  if (!answer.isLegalDrafting) {
    // T610-E1 (Ajay, ca507e9b): both bail phrase sets matched, so it is legal drafting
    // whatever the model said: the F2 fallback (exactly the two cards, unranked; the
    // bail guard orders them as F2b), not no_match. Not cached; nothing drafted or charged.
    if (t5Pair && t5Pair.length === 2) {
      return { kind: 'needs_choice', choices: [...t5Pair], t5Fallback: true, ...base };
    }
    // A description with catalogue keywords is never "not found" (ADR-drafting-v3 3B); gibberish has none.
    if (keywords.length > 0) {
      return { kind: 'needs_choice', choices: keywords.slice(0, MAX_MATCH_CHOICES), ...base };
    }
    return { kind: 'no_match', noMatchReason: 'not_legal_drafting', ...base };
  }
  if (answer.problem) {
    // T610-T5 (Ajay F2/F2a/F2b, 1bf3df1a, f0985461, edfe8645): anticipatory and regular phrases both
    // found and the model failed twice: exactly these two cards, bail_regular then
    // bail_anticipatory, never no_match. Nothing is drafted or charged until the user picks.
    if (t5Pair && t5Pair.length === 2) {
      return { kind: 'needs_choice', choices: [...t5Pair], t5Fallback: true, ...base };
    }
    if (keywords.length > 0) {
      return { kind: 'needs_choice', choices: keywords.slice(0, MAX_MATCH_CHOICES), ...base };
    }
    return {
      kind: 'no_match',
      noMatchReason: answer.problem === 'off_list' ? 'unknown_template' : 'malformed',
      ...base,
    };
  }
  const rank = (id: string) => {
    const i = keywords.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = answer.candidates
    .map((c, i) => ({ ...c, i }))
    .sort(
      (a, b) => b.confidence - a.confidence || rank(a.templateId) - rank(b.templateId) || a.i - b.i,
    );
  const top = ordered[0];
  if (top && top.confidence >= MATCH_PICK_THRESHOLD) {
    return { kind: 'matched', templateId: top.templateId, ...base };
  }
  const choices = [...new Set([...ordered.map((c) => c.templateId), ...keywords])].slice(
    0,
    MAX_MATCH_CHOICES,
  );
  if (choices.length === 0) return { kind: 'guided', ...base };
  return { kind: 'needs_choice', choices, ...base };
}

/** The MATCH answer as one decision, with no retry. `keywordIds` are allowed ids, best first. */
export function decideMatch(
  parsed: Record<string, unknown> | null,
  allowed: Set<string>,
  keywordIds: readonly string[] = [],
  displayNames?: ReadonlyMap<string, string>,
): MatchDecision {
  return decideFromAnswer(readMatchAnswer(parsed, allowed, displayNames), keywordIds);
}

// ── Fill result ─────────────────────────────────────────────────────────────

export interface FilledValue {
  value: string | string[];
  source: 'description' | 'user';
  quote?: string;
}

export interface FillCheck {
  fields: Record<string, FilledValue>;
  dropped: Array<{ field_id: string; reason: string }>;
}

function optionIds(field: FormField): Set<string> {
  return new Set((field.options ?? []).map((o) => o.id));
}

function checkOne(
  field: FormField,
  value: unknown,
  quote: string,
  normDesc: string,
): string | null {
  const isList = field.type === 'checkbox_group' || field.type === 'multi_select_search';
  if (isList) {
    if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string')) {
      return 'type';
    }
    if (field.options && field.options.length > 0) {
      const ids = optionIds(field);
      if (!value.every((v) => ids.has(v))) return 'option';
      return null;
    }
    // Free list (e.g. section numbers): each value must be in the quote as written.
    const nq = normalise(quote);
    for (const v of value as string[]) {
      const nv = normalise(v);
      if (!nv) return 'type';
      const re = new RegExp(
        `(^|[^a-z0-9])${nv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
      );
      if (!re.test(nq)) return 'not_in_quote';
    }
    return null;
  }

  // Models often send numbers as JSON numbers; read them as the digits written.
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string' || value.trim() === '') return 'type';
  const v = value.trim();

  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (!isOwnWords(v, normDesc)) return 'not_own_words';
      // Rule 4.1.3: the words must sit inside this field's own quote, so a name
      // from another sentence cannot land in the wrong field (Ajay, T-101).
      if (!isOwnWords(v, normalise(quote))) return 'not_in_quote';
      if (field.min_length && v.length < field.min_length) return 'length';
      if (field.max_length && v.length > field.max_length) return 'length';
      if (field.validation_pattern) {
        try {
          if (!new RegExp(field.validation_pattern).test(v)) return 'pattern';
        } catch {
          // a broken pattern in config is not the user's problem
        }
      }
      return null;
    }
    case 'number':
    case 'currency': {
      const d = digitsOnly(v);
      if (!d || !Number.isFinite(Number(d))) return 'type';
      // The number must stand as a whole number in the quote: "5" does not match "15".
      const want = d.replace(/\.0+$/, '');
      const numbersInQuote = (
        quote.replace(/(\d),(?=\d)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []
      ).map((n) => n.replace(/\.0+$/, ''));
      if (!numbersInQuote.includes(want)) return 'not_in_quote';
      return null;
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !iso(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10))) {
        return 'type';
      }
      if (!datesInText(quote).includes(v)) return 'not_in_quote';
      return null;
    }
    case 'dropdown':
    case 'dropdown_search': {
      if (!field.options || field.options.length === 0) return 'not_fillable';
      return optionIds(field).has(v) ? null : 'option';
    }
    default:
      return 'not_fillable';
  }
}

/**
 * Server-side checks on the fill call's output (ADR §3.5, §4.1). Only values
 * that pass every check are kept. The rest are dropped and end up missing.
 */
export function checkFilledValues(
  config: TemplateConfig,
  description: string,
  parsed: Record<string, unknown> | null,
): FillCheck {
  const result: FillCheck = { fields: {}, dropped: [] };
  const raw = parsed && Array.isArray(parsed.fields) ? parsed.fields : [];
  const byId = new Map(allFields(config).map((f) => [f.field_id, f]));
  const normDesc = normalise(description);

  // §4.1.5 — the same field twice with different values: leave it empty.
  const seen = new Map<string, string>();
  const contradicted = new Set<string>();
  for (const entry of raw) {
    const e = entry as { field_id?: unknown; value?: unknown };
    if (typeof e.field_id !== 'string') continue;
    const key = JSON.stringify(e.value);
    const prev = seen.get(e.field_id);
    if (prev !== undefined && prev !== key) contradicted.add(e.field_id);
    seen.set(e.field_id, key);
  }

  for (const entry of raw) {
    const e = entry as { field_id?: unknown; value?: unknown; quote?: unknown };
    if (typeof e.field_id !== 'string') continue;
    const id = e.field_id;
    if (result.fields[id]) continue;
    const field = byId.get(id);
    if (!field) {
      result.dropped.push({ field_id: id, reason: 'unknown_field' });
      continue;
    }
    if (contradicted.has(id)) {
      if (!result.dropped.some((d) => d.field_id === id))
        result.dropped.push({ field_id: id, reason: 'contradiction' });
      continue;
    }
    if (!isModelFillable(field)) {
      result.dropped.push({ field_id: id, reason: 'not_fillable' });
      continue;
    }
    const quote = typeof e.quote === 'string' ? e.quote : '';
    if (normalise(quote).length < 2 || !normDesc.includes(normalise(quote))) {
      result.dropped.push({ field_id: id, reason: 'no_matching_quote' });
      continue;
    }
    const problem = checkOne(field, e.value, quote, normDesc);
    if (problem) {
      result.dropped.push({ field_id: id, reason: problem });
      continue;
    }
    const value = Array.isArray(e.value) ? (e.value as string[]) : String(e.value).trim();
    result.fields[id] = { value, source: 'description', quote };
  }
  return result;
}

/** Required fields still empty, skipping fields hidden by show_if (as the form does). */
export function missingRequired(
  config: TemplateConfig,
  fields: Record<string, FilledValue>,
): string[] {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) values[k] = v.value;
  const missing: string[] = [];
  for (const f of allFields(config)) {
    const cond = f.show_if ?? f.depends_on;
    if (cond && !evaluateShowIf(cond, values)) continue;
    if (!f.required) continue;
    const v = values[f.field_id];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
      missing.push(f.field_id);
  }
  return missing;
}

// ── Follow-up questions (T-102, ADR §3.6) — code only, no model call ────────

export const QUESTION_LIMITS = { perRound: 5, rounds: 2 } as const;

export interface IntakeQuestion {
  field_id: string;
  /** Worded from the form_schema label. */
  question: string;
  type: FormField['type'];
  options?: Array<{ id: string; label: string }>;
  /** For dropdowns the web loads from data (e.g. the courts list), as the form does. */
  options_from?: string;
  source?: string;
  filtered_by?: string[];
  placeholder?: string;
  help?: string;
  min_select?: number;
}

/**
 * Ajay's rule (T-102): court, parties, FIR number, sections and dates come
 * first when missing. Everything else keeps form order, which also keeps
 * cascades (state → court type → court) in the right order.
 */
function questionPriority(f: FormField): number {
  const id = f.field_id;
  const src = `${f.options_from ?? ''} ${f.source ?? ''}`;
  if (/courts/i.test(src) || COURT_LIKE_ID.test(id)) return 0;
  if (
    /(^|_)(applicant|accused|petitioner|respondent|complainant|opposite_party|party|plaintiff|defendant|appellant|client|tenant|landlord|deponent)(_|$)/.test(
      id,
    ) &&
    /name/.test(id)
  ) {
    return 0;
  }
  if (/(^|_)fir(_|$)/.test(id)) return 0;
  if (/section/.test(id)) return 0;
  if (f.type === 'date') return 0;
  return 1;
}

/**
 * T-405: the public field keys an intake question carries besides field_id,
 * question (the label) and type. A subset of the shared PUBLIC_FORM_FIELD_KEYS
 * (checked by `satisfies`), and the key order of the JSON it sends.
 */
const INTAKE_QUESTION_FIELD_KEYS = [
  'options',
  'options_from',
  'source',
  'filtered_by',
  'placeholder',
  'help',
  'min_select',
] as const satisfies readonly (PublicFormFieldKey & keyof IntakeQuestion)[];

export function buildQuestions(config: TemplateConfig, missing: string[]): IntakeQuestion[] {
  const order = new Map(allFields(config).map((f, i) => [f.field_id, i]));
  const byId = new Map(allFields(config).map((f) => [f.field_id, f]));
  return missing
    .map((id) => byId.get(id))
    .filter((f): f is FormField => !!f && f.type !== 'file')
    .sort(
      (a, b) =>
        questionPriority(a) - questionPriority(b) ||
        order.get(a.field_id)! - order.get(b.field_id)!,
    )
    .slice(0, QUESTION_LIMITS.perRound)
    .map((f) => {
      // T-405: the value projection (and the options' {id,label} shape) comes
      // from the shared public-field helper; intake picks which of those keys
      // it sends, in this order, and only when set (options: non-empty).
      const pub = publicFormField(f);
      const question: IntakeQuestion = { field_id: f.field_id, question: f.label, type: f.type };
      const extra = question as unknown as Record<string, unknown>;
      for (const key of INTAKE_QUESTION_FIELD_KEYS) {
        const value = pub[key];
        if (key === 'options' ? Array.isArray(value) && value.length > 0 : value) {
          extra[key] = value;
        }
      }
      return question;
    });
}

/**
 * Checks a value the user typed or picked (no quote needed — it is their
 * own input). Returns a reason when invalid, null when fine.
 */
export function checkUserValue(field: FormField, value: unknown): string | null {
  if (field.type === 'file') return 'not_supported';
  if (field.type === 'checkbox_group' || field.type === 'multi_select_search') {
    if (!Array.isArray(value) || value.length === 0) return 'type';
    if (!value.every((v) => typeof v === 'string' && v.trim() !== '')) return 'type';
    if (field.options && field.options.length > 0) {
      const ids = optionIds(field);
      if (!value.every((v) => ids.has(v as string))) return 'option';
    }
    if (field.min_select && value.length < field.min_select) return 'min_select';
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string' || value.trim() === '') return 'type';
  const v = value.trim();
  switch (field.type) {
    case 'text':
    case 'textarea':
      if (field.min_length && v.length < field.min_length) return 'length';
      if (field.max_length && v.length > field.max_length) return 'length';
      if (field.validation_pattern) {
        try {
          if (!new RegExp(field.validation_pattern).test(v)) return 'pattern';
        } catch {
          // broken pattern in config — not the user's problem
        }
      }
      return null;
    case 'number':
    case 'currency':
      return /^\d[\d,]*(\.\d+)?$/.test(v.replace(/^(₹|rs\.?)\s*/i, '')) ? null : 'type';
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10))
        ? null
        : 'type';
    case 'dropdown':
    case 'dropdown_search':
      if (field.options && field.options.length > 0)
        return optionIds(field).has(v) ? null : 'option';
      if (field.options_from === 'supported_languages') return null; // checked by the caller
      return null; // data-backed list (courts): the web offers only real entries; generation re-checks
    default:
      return 'not_supported';
  }
}

export interface AnswersRequest {
  templateId: string;
  intakeId: string;
  fields: Record<string, unknown>;
  answers: Record<string, unknown>;
  round: number;
}

export interface AnswersResponse {
  intake_id: string;
  template_id: string;
  fields: Record<string, FilledValue>;
  /** Plain values, ready to prefill the existing form ("fill it myself"). */
  form_data: Record<string, string | string[]>;
  missing: string[];
  invalid: Array<{ field_id: string; reason: string }>;
  questions: IntakeQuestion[];
  ready: boolean;
  /** True when the flow moves to the review screen (nothing missing, or the round limit reached). */
  review: boolean;
  round: number;
}

export function toFormData(fields: Record<string, FilledValue>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = v.value;
  return out;
}

function asFilled(raw: unknown): FilledValue | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
    const r = raw as { value: unknown; source?: unknown; quote?: unknown };
    const source = r.source === 'description' ? 'description' : 'user';
    return {
      value: r.value as string | string[],
      source,
      ...(source === 'description' && typeof r.quote === 'string' ? { quote: r.quote } : {}),
    };
  }
  return { value: raw as string | string[], source: 'user' };
}

/**
 * One answers round (T-102). The server keeps no session (ADR §3.3): the
 * browser sends everything back and every value is checked again. Returns
 * null when the template is not in the catalogue.
 */
export function applyAnswers(req: AnswersRequest): AnswersResponse | null {
  const allowed = new Set(getCatalogue().map((c) => c.template_id));
  const config = allowed.has(req.templateId) ? loadTemplateConfig(req.templateId) : null;
  if (!config) return null;
  const byId = new Map(allFields(config).map((f) => [f.field_id, f]));

  const fields: Record<string, FilledValue> = {};
  const invalid: AnswersResponse['invalid'] = [];

  const accept = (id: string, filled: FilledValue | null, isAnswer: boolean) => {
    const field = byId.get(id);
    if (!field || !filled) return;
    let value: unknown = filled.value;
    if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (isAnswer) delete fields[id]; // the user cleared it
      return;
    }
    let problem = checkUserValue(field, value);
    if (
      !problem &&
      field.options_from === 'supported_languages' &&
      !config.supported_languages.includes(String(value))
    ) {
      problem = 'option';
    }
    if (problem) {
      invalid.push({ field_id: id, reason: problem });
      delete fields[id];
      return;
    }
    const clean = Array.isArray(value)
      ? (value as string[]).map((s) => s.trim())
      : String(value).trim();
    fields[id] = { ...filled, value: clean };
  };

  for (const [id, raw] of Object.entries(req.fields ?? {})) accept(id, asFilled(raw), false);
  // Answers are the user's own input and win over anything read earlier.
  for (const [id, raw] of Object.entries(req.answers ?? {})) {
    accept(id, { value: raw as string | string[], source: 'user' }, true);
  }

  const missing = missingRequired(config, fields);
  const round = Math.max(1, Math.floor(req.round || 1));
  const review = missing.length === 0 || round >= QUESTION_LIMITS.rounds;
  return {
    intake_id: req.intakeId,
    template_id: config.template_id,
    fields,
    form_data: toFormData(fields),
    missing,
    invalid,
    questions: review ? [] : buildQuestions(config, missing),
    ready: missing.length === 0,
    review,
    round,
  };
}

// ── Usage rows (ADR §3.7) ───────────────────────────────────────────────────

async function recordAuxCall(args: {
  intakeId: string;
  userId: string;
  purpose: LlmAuxPurpose;
  status: 'completed' | 'failed';
  model: string;
  usage: AuxCallUsage;
  durationMs: number;
}): Promise<void> {
  try {
    const rate = await getModelRates(args.model);
    const costUsd = rate.costStatus === 'priced' ? priceUsage(args.usage, rate.rate) : 0;
    await LlmAuxCall.create({
      intakeId: args.intakeId,
      userId: args.userId,
      purpose: args.purpose,
      status: args.status,
      aiModel: args.model,
      transport: args.usage.transport,
      inputTokens: args.usage.inputTokens,
      outputTokens: args.usage.outputTokens,
      imageCount: 0,
      costUsd,
      costStatus: rate.costStatus,
      usageSource: args.usage.usageSource,
      rateInputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.inputUsdPerMTok : undefined,
      rateOutputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.outputUsdPerMTok : undefined,
      durationMs: args.durationMs,
    });
  } catch (err) {
    console.error(
      `[intake] failed to record LlmAuxCall (intakeId=${args.intakeId}, purpose=${args.purpose}):`,
      err instanceof Error ? err.message : 'unknown error',
    );
  }
}

async function recordDemand(
  userId: string,
  intakeId: string,
  type: string,
  d: MatchDecision,
  reason?: string,
) {
  try {
    await Event.create({
      userId,
      type,
      metadata: {
        intakeId,
        category: d.category || null,
        isCourtDocument: d.isCourtDocument,
        ...(reason ? { reason } : {}),
      },
    });
  } catch (err) {
    console.error(
      `[intake] failed to record ${type} (intakeId=${intakeId}):`,
      err instanceof Error ? err.message : 'unknown',
    );
  }
}

// ── The intake itself ───────────────────────────────────────────────────────

export interface IntakeRequest {
  userId: string;
  plan: string;
  description: string;
  language?: string;
  /** Set when the user picked one of the needs_choice options: skips the match call. */
  templateId?: string;
  intakeId?: string;
}

export interface IntakeResponse {
  intake_id: string;
  outcome: 'matched' | 'needs_choice' | 'guided' | 'no_match' | 'unavailable';
  template_id?: string;
  display_name?: string;
  fields?: Record<string, FilledValue>;
  missing?: string[];
  questions?: IntakeQuestion[];
  form_data?: Record<string, string | string[]>;
  choices?: Array<{ template_id: string; display_name: string }>;
  needs_upgrade?: boolean;
}

async function modelCall(
  req: { userId: string; intakeId: string; model: string },
  purpose: LlmAuxPurpose,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const started = Date.now();
  // T-453: effort per stage from ai.effort.intake (default medium). Never throws.
  const effort = await getAiEffort('intake');
  const log = (status: 'completed' | 'failed', u: AuxCallUsage) =>
    logLlmCall({
      stage: 'intake',
      call: purpose,
      model: req.model,
      effort: effort ?? null,
      status,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadInputTokens: u.cacheReadInputTokens,
      cacheCreationInputTokens: u.cacheCreationInputTokens,
      stopReason: u.stopReason,
      intakeId: req.intakeId,
    });
  try {
    const r = await callAuxModel({
      model: req.model,
      system,
      user,
      maxTokens,
      effort,
    });
    log('completed', r);
    await recordAuxCall({
      ...req,
      purpose,
      status: 'completed',
      usage: r,
      durationMs: Date.now() - started,
    });
    return r.text;
  } catch (err) {
    const usage: AuxCallUsage =
      err instanceof AuxCallError
        ? err.usage
        : { inputTokens: 0, outputTokens: 0, usageSource: 'estimated', transport: 'direct' };
    log('failed', usage);
    await recordAuxCall({
      ...req,
      purpose,
      status: 'failed',
      usage,
      durationMs: Date.now() - started,
    });
    console.error(
      `[intake] ${purpose} call failed (intakeId=${req.intakeId}):`,
      err instanceof Error ? err.message : 'unknown',
    );
    return null;
  }
}

async function fillTemplate(
  ctx: { userId: string; intakeId: string; model: string },
  config: TemplateConfig,
  req: IntakeRequest,
): Promise<IntakeResponse> {
  const fillable = allFields(config).filter(isModelFillable);
  const text = await modelCall(
    ctx,
    'intake_fill',
    FILL_SYSTEM_PROMPT,
    buildFillUserPrompt(req.description, fillable),
    INTAKE_LIMITS.fillMaxTokens,
  );
  if (text === null) return { intake_id: ctx.intakeId, outcome: 'unavailable' };

  const check = checkFilledValues(config, req.description, parseModelJson(text));
  const langField = allFields(config).find((f) => f.options_from === 'supported_languages');
  if (langField && req.language && config.supported_languages.includes(req.language)) {
    check.fields[langField.field_id] = { value: req.language, source: 'user' };
  }

  console.info(
    `[intake] matched (intakeId=${ctx.intakeId}, template=${config.template_id}, kept=${Object.keys(check.fields).length}, dropped=${check.dropped.length})`,
  );
  const missing = missingRequired(config, check.fields);
  return {
    intake_id: ctx.intakeId,
    outcome: 'matched',
    template_id: config.template_id,
    display_name: config.display_name,
    fields: check.fields,
    missing,
    // T-102 — round 1 questions, built by code from the form labels.
    questions: buildQuestions(config, missing),
    form_data: toFormData(check.fields),
    ...(config.plan_access === 'pro' && req.plan !== 'pro' ? { needs_upgrade: true } : {}),
  };
}

/**
 * Runs one intake. Throws IntakeLimitError for a 429. Every other failure
 * (missing model setting, Redis down, model error) is
 * `outcome: unavailable` — the gallery still works.
 */
export async function runIntake(req: IntakeRequest): Promise<IntakeResponse> {
  const intakeId = req.intakeId ?? crypto.randomUUID();

  let model: string;
  try {
    // T-684: the extractor role (ai.model.extractor, else ai.intake_model).
    model = await resolveModel('extractor');
  } catch (err) {
    if (err instanceof AppSettingMissingError) {
      console.error(`[intake] ${err.key} is not set (intakeId=${intakeId})`);
    }
    return { intake_id: intakeId, outcome: 'unavailable' };
  }
  try {
    await consumeIntakeQuota(req.userId, req.plan);
  } catch (err) {
    if (err instanceof IntakeLimitError) throw err;
    console.error(
      `[intake] quota check failed, refusing the model call (intakeId=${intakeId}):`,
      err instanceof Error ? err.message : 'unknown',
    );
    return { intake_id: intakeId, outcome: 'unavailable' };
  }

  const ctx = { userId: req.userId, intakeId, model };
  const catalogue = await getEnabledCatalogue(req.userId);
  const allowed = new Set(catalogue.map((c) => c.template_id));

  // The user picked one of the needs_choice options.
  if (req.templateId) {
    const config = allowed.has(req.templateId) ? loadTemplateConfig(req.templateId) : null;
    if (!config) return { intake_id: intakeId, outcome: 'no_match' };
    return fillTemplate(ctx, config, req);
  }

  const text = await modelCall(
    ctx,
    'intake_match',
    MATCH_SYSTEM_PROMPT,
    buildMatchUserPrompt(req.description, catalogue),
    INTAKE_LIMITS.matchMaxTokens,
  );
  if (text === null) return { intake_id: intakeId, outcome: 'unavailable' };

  // T-610: alias resolution, the threshold and the keyword ranking apply here too (no retry on this older path).
  const keywordIds = rankKeywordCandidates(req.description, allowed).map((c) => c.templateId);
  const matched = decideMatch(
    parseModelJson(text),
    allowed,
    keywordIds,
    displayNameIndex(catalogue),
  );
  // T-122: the bail guard. It can turn a single match into a choice, or reorder
  // a choice. It never picks a document. The log line carries no description text.
  const guard = applyBailGuard(matched, req.description, allowed);
  const decision: MatchDecision = guard.changed
    ? { ...matched, kind: 'needs_choice', templateId: undefined, choices: guard.choices }
    : matched;
  if (guard.changed) {
    console.info(
      `[intake] bail guard changed the match (intakeId=${intakeId}, from=${matched.kind}, cue=${guard.cue})`,
    );
  }
  console.info(`[intake] match decided (intakeId=${intakeId}, outcome=${decision.kind})`);

  switch (decision.kind) {
    case 'matched': {
      const config = loadTemplateConfig(decision.templateId!);
      if (!config) return { intake_id: intakeId, outcome: 'no_match' };
      return fillTemplate(ctx, config, req);
    }
    case 'needs_choice': {
      const byId = new Map(catalogue.map((c) => [c.template_id, c.display_name]));
      return {
        intake_id: intakeId,
        outcome: 'needs_choice',
        choices: decision.choices!.map((id) => ({ template_id: id, display_name: byId.get(id)! })),
      };
    }
    case 'guided':
      // ADR §3.10: a demand signal for every request no template fits.
      await recordDemand(req.userId, intakeId, 'demand.no_template', decision);
      return { intake_id: intakeId, outcome: 'guided', questions: [] };
    case 'no_match':
    default:
      if (decision.noMatchReason !== 'not_legal_drafting') {
        await recordDemand(
          req.userId,
          intakeId,
          'demand.no_match',
          decision,
          decision.noMatchReason,
        );
      }
      return { intake_id: intakeId, outcome: 'no_match' };
  }
}

// ── The brief (T-105, ADR-021 sections 3.2 to 3.4) ──────────────────────────
//
// One path for every document: pick the rule pack, read the description
// against the pack's checklist, and return a brief with questions for what is
// missing. Nothing is drafted here and nothing the user wrote is stored or
// logged. The rules and both Reception prompts are Ajay's (T-127 and T-107).

export interface BriefIntakeRequest {
  userId: string;
  plan: string;
  description: string;
  language?: string;
  /**
   * Set when the user picked a kind, or changed it: a rule-pack id, or `none`
   * for a document with no rule pack. Skips the match call.
   */
  kind?: string;
  intakeId?: string;
  /** What the user typed so far. It is kept across a change of kind and wins over what is read. */
  keep?: GivenValue[];
  court?: Partial<BriefCourt>;
  /** No rule pack only: 2 or 3, sent with the answers so far. */
  round?: number;
  answers?: ReceptionAnswer[];
  /**
   * T-147b, on a change of document: the ledger shown so far. The facts the
   * advocate answered or edited on it are carried to the new ledger.
   */
  ledgerId?: string;
  /** For tests: the moment two-digit years are read against. */
  now?: Date;
}

export interface BriefIntakeResponse {
  intake_id: string;
  outcome: 'brief' | 'questions' | 'needs_choice' | 'no_match' | 'unavailable';
  brief?: Brief;
  questions?: BriefQuestion[];
  /** With `questions` for a document with no rule pack: the round to send back with the answers. */
  next_round?: number;
  choices?: Array<{ kind: string; name: string }>;
  /**
   * T-610 / T-622: only on the T610-T5 two-card fallback (Ajay F2/F2a/F2b,
   * 1bf3df1a, f0985461, edfe8645): the choices are not ranked, so the web pre-selects none. Absent on
   * every other needs_choice.
   */
  unranked?: true;
  needs_upgrade?: boolean;
  /** T-147b, only while `feature.fact_ledger` is on for the user: the ledger written for this brief. */
  ledger?: LedgerView;
}

interface BriefContext {
  userId: string;
  intakeId: string;
  model: string;
  /** Counts the request against the limits, once, just before its first real model call. */
  spend: () => Promise<void>;
  /** True once this request has counted against the limits. */
  hasSpent: () => boolean;
  /** T-147b: whether to write a ledger, and the earlier ledger on a change of document. */
  ledger: { enabled: boolean; earlier: IFactLedger | null };
}

function intakeCacheParts(
  ctx: BriefContext,
  purpose: LlmAuxPurpose,
  system: string,
  user: string,
): string[] {
  return [ctx.userId, purpose, ctx.model, system, user];
}

/**
 * A model call that is answered from the cache when this exact request was
 * made in the last 30 minutes. A cached answer costs nothing, so it is not
 * counted against the limits and no usage row is written for it.
 *
 * T-610: an answer that cannot be parsed is never cached. `write: false`
 * leaves the write to the caller (the MATCH call caches only a final match);
 * `fresh: true` skips the cache read (the one MATCH retry).
 */
async function cachedModelCall(
  ctx: BriefContext,
  purpose: LlmAuxPurpose,
  system: string,
  user: string,
  maxTokens: number,
  opts: { write?: boolean; fresh?: boolean } = {},
): Promise<{ text: string | null; fromCache: boolean }> {
  const cacheParts = intakeCacheParts(ctx, purpose, system, user);
  if (!opts.fresh) {
    const cached = await readIntakeCache(cacheParts);
    if (cached !== null) return { text: cached, fromCache: true };
  }
  await ctx.spend();
  const text = await modelCall(ctx, purpose, system, user, maxTokens);
  if (text !== null && opts.write !== false && parseModelJson(text) !== null) {
    await writeIntakeCache(cacheParts, text);
  }
  return { text, fromCache: false };
}

/**
 * T-147b: the extraction pass. Its own call and its own prompt, cached like
 * the others. It never counts against the limits on its own: one request is
 * one unit, and the pass rides on the unit this request has already spent. A
 * request answered wholly from the cache spent nothing, so it makes no new
 * extraction call either (the ledger is then empty and the brief asks as before).
 */
async function extractCall(ctx: BriefContext, user: string): Promise<string | null> {
  const cacheParts = [ctx.userId, 'intake_extract', ctx.model, EXTRACT_SYSTEM_PROMPT, user];
  const cached = await readIntakeCache(cacheParts);
  if (cached !== null) return cached;
  if (!ctx.hasSpent()) return null;
  // T-453 follow-up: the cap is config (ai.cap.intake_extract). Never throws.
  const maxTokens = await getIntakeExtractCap();
  const text = await modelCall(ctx, 'intake_extract', EXTRACT_SYSTEM_PROMPT, user, maxTokens);
  if (text !== null) await writeIntakeCache(cacheParts, text);
  return text;
}

/**
 * Run the extraction pass and write the ledger's first version. Any failure
 * gives no ledger (a failed call gives an empty one); the brief is built as
 * before either way. T-335: the advocate's own values on the brief just built
 * are laid over the reading, so the ledger matches the brief. Logs ids and
 * counts only.
 */
async function writeReceptionLedger(
  ctx: BriefContext,
  pack: RulePack,
  checklist: ChecklistItem[],
  req: BriefIntakeRequest,
  brief: Brief,
): Promise<LedgerView | undefined> {
  try {
    const lines = extractLines(checklist);
    const text =
      lines.length === 0
        ? null
        : await extractCall(ctx, buildExtractUserPrompt(lines, req.description));
    const refYear = referenceYear(req.now ?? new Date());
    const read = readExtraction(
      checklist,
      req.description,
      text === null ? null : parseModelJson(text),
      refYear,
    );
    // T-190 AC8: a "none" read from the description for earlier bail
    // applications waits for the advocate to confirm it (Ajay, 12 Oct 2026).
    const { state: fresh, held } = holdDescriptionNone(
      { facts: read.facts, unresolved: read.unresolved },
      PROTECTED_QUESTION_KEY,
      firstApplicationValues(pack.id),
    );
    const earlier = ctx.ledger.earlier ? currentState(ctx.ledger.earlier) : null;
    // T-335 (Arjun, 12 Oct 2026, option B): the ledger mirrors the brief.
    const { state, counts: overlay } = overlayBrief(
      carryOver(fresh, earlier, checklist),
      brief,
      checklist,
      refYear,
    );
    const doc = await createLedger({
      userId: ctx.userId,
      documentKind: pack.id,
      intakeId: ctx.intakeId,
      state,
    });
    const count = (r: string) => read.dropped.filter((d) => d.reason === r).length;
    console.info(
      `[intake] ledger written (intakeId=${ctx.intakeId}, ledgerId=${String(doc.id)}, kind=${pack.id}, called=${text !== null}, facts=${state.facts.length}, unresolved=${state.unresolved.length}, droppedNotOnList=${count('not_on_list')}, droppedNoSpan=${count('no_span')}, droppedSpanNotFound=${count('span_not_found')}, droppedNoFact=${count('no_fact_answer')}, heldForConfirm=${held}, overlayAskedEmpty=${overlay.askedEmpty}, overlayWritten=${overlay.written}, overlayUnreadable=${overlay.unreadable})`,
    );
    return ledgerView(doc, checklist);
  } catch (err) {
    console.error(
      `[intake] ledger not written (intakeId=${ctx.intakeId}):`,
      err instanceof Error ? err.name : 'unknown',
    );
    return undefined;
  }
}

/**
 * T-190 AC8: the values that unlock "no other bail application has been made"
 * in this pack's averment list (`first_bail_application`). Empty when the pack
 * has no such entry, or its list cannot be read.
 */
function firstApplicationValues(packId: string): string[] {
  try {
    const entry = loadAvermentLists(packId).allowed.find((a) => a.id === 'first_bail_application');
    const c = entry?.requires;
    if (!c || 'all_of' in c || c.key !== PROTECTED_QUESTION_KEY || c.equals === undefined) {
      return [];
    }
    return (Array.isArray(c.equals) ? c.equals : [c.equals]).map(String);
  } catch {
    return [];
  }
}

/**
 * T-190 AC8: earlier bail applications is asked to confirm when the brief shows
 * a value for it but the ledger holds no fact (a "none" read from the
 * description is held until confirmed). T-336: with the ledger off, it is asked
 * to confirm while the brief marks that value `unconfirmed`.
 */
function confirmKeys(
  brief: Brief,
  checklist: ChecklistItem[],
  ledger: LedgerView | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const item of checklist) {
    if (!item.askWhenEmpty || item.key.split('.').pop() !== PROTECTED_QUESTION_KEY) continue;
    if (!ledger) {
      if (brief.items.some((i) => i.key === item.key && i.unconfirmed === true)) out.add(item.key);
      continue;
    }
    if (ledger.facts.some((f) => f.key === item.key)) continue;
    const shown = brief.items.find((i) => i.key === item.key);
    const value = shown?.value;
    const empty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (shown && !empty) out.add(item.key);
  }
  return out;
}

/** After the first request of an intake, later ones are capped per intake, not per user. */
async function consumeFollowUp(intakeId: string): Promise<void> {
  const key = `intake:followups:${intakeId}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 2 * 3600);
  if (n > INTAKE_LIMITS.followUpsPerIntake) {
    const ttl = await redis.ttl(key);
    throw new IntakeLimitError('burst', ttl > 0 ? ttl : INTAKE_LIMITS.burstWindowSeconds);
  }
}

/**
 * True when this request reads an edited description against what the
 * advocate had already typed. The web app starts a new intake for a new
 * description (no `intake_id`) and sends what was typed as `keep`; a change of
 * kind or a round of answers carries the intake's id.
 */
function descriptionWasEdited(req: BriefIntakeRequest): boolean {
  return req.intakeId === undefined && (req.keep?.length ?? 0) > 0;
}

function userValues(keep: GivenValue[] | undefined): GivenValue[] {
  return (keep ?? []).map((k) => ({
    ...k,
    source: k.source === 'description' ? 'description' : 'user',
  }));
}

/**
 * The pack's checklist, with the s.138 drawer flagged (T-471, Ajay (a)): only
 * legal_notice_s138's respondent_name is read as the drawer as named.
 */
function checklistFor(pack: RulePack): ChecklistItem[] {
  const items = buildChecklist(pack);
  if (pack.id !== 'legal_notice_s138') return items;
  return items.map((i) => (i.key === 'respondent_name' ? { ...i, drawerAsNamed: true } : i));
}

async function briefWithPack(
  ctx: BriefContext,
  pack: RulePack,
  req: BriefIntakeRequest,
): Promise<BriefIntakeResponse> {
  const checklist = checklistFor(pack);
  // T-453 follow-up: the cap is config (ai.cap.intake_reception). Never throws.
  const maxTokens = await getIntakeReceptionCap();
  const { text } = await cachedModelCall(
    ctx,
    'intake_reception',
    RECEPTION_PACK_SYSTEM_PROMPT,
    buildReceptionPackUserPrompt(pack.name, checklistLines(checklist), req.description),
    maxTokens,
  );
  if (text === null) return { intake_id: ctx.intakeId, outcome: 'unavailable' };

  // A malformed answer reads as "nothing read". The brief is still returned,
  // with the dates the code can read and questions written from the labels.
  const parsed = parseModelJson(text);
  if (parsed?.outcome === 'not_legal' || parsed?.outcome === 'refused') {
    console.info(
      `[intake] reception declined (intakeId=${ctx.intakeId}, outcome=${parsed.outcome})`,
    );
    return { intake_id: ctx.intakeId, outcome: 'no_match' };
  }

  const read = checkRead(checklist, req.description, parsed);
  const byCode = datesReadByCode(checklist, req.description, read.values);
  const readValues = new Map([...read.values, ...byCode]);
  // AJ-2026-10-08-T139 part 4: the words of a checked amount are derived, not asked.
  read.dropped.push(
    ...withAmountInWords(
      checklist.map((i) => i.key),
      readValues,
    ),
  );
  let values: GivenValue[];
  let edit = '';
  let alsoAsk: ReadonlySet<string> = new Set();
  if (descriptionWasEdited(req)) {
    // T-150, Rule A: an earlier answer the new description contradicts gives way to it.
    const after = valuesAfterEditedDescription(
      checklist,
      readValues,
      read.dropped,
      userValues(req.keep),
    );
    values = after.values;
    // A fact the new description is not clear on is asked again, never dropped.
    alsoAsk = new Set(after.cleared);
    edit = `, replaced=${after.replaced.length}, cleared=${after.cleared.length}, nameDiffers=${after.nameDiffers.length}`;
  } else {
    values = [
      ...[...readValues].map(([key, v]) => ({
        key,
        value: v.value,
        quote: v.quote,
        source: 'description' as const,
      })),
      // What the user typed comes last, so it wins over what was read.
      ...userValues(req.keep),
    ];
  }
  const briefInput = {
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist,
    values,
    court: req.court,
    description: req.description,
    reask: [...alsoAsk],
    holdNone: firstApplicationValues(pack.id),
  };
  const firstBrief = buildBrief(briefInput);
  console.info(
    `[intake] brief built (intakeId=${ctx.intakeId}, kind=${pack.id}, read=${read.values.size}, byCode=${byCode.size}, dropped=${read.dropped.length}, unknown=${firstBrief.still_unknown.length}${edit})`,
  );
  // T-147b: what the normalizer could not read is always asked, through the same
  // questions, even when the brief already holds a value for it. The value stays.
  const ledger = ctx.ledger.enabled
    ? await writeReceptionLedger(ctx, pack, checklist, req, firstBrief)
    : undefined;
  // T-660: the first brief is built before the ledger exists, so a custody
  // date it derived (T-638 R1) is checked again against the ledger's own
  // wording, as generation reads it. A derived value has source null and is
  // never written to the ledger, so the ledger is the same either way. No
  // model call: buildBrief again, with the ledger's part of the rule.
  const brief =
    ledger && firstBrief.items.some((i) => i.derived_from !== undefined)
      ? buildBrief({
          ...briefInput,
          ledgerCustody: ledgerCustodyInputs(ledger.facts, ledger.unresolved),
        })
      : firstBrief;
  const always: ReadonlySet<string> = new Set(
    ledger
      ? ledger.unresolved
          .filter((u) => !ledger.facts.some((f) => f.key === u.key))
          .map((u) => u.key)
      : [],
  );
  // T-498: a fact the ledger holds shows on its row, so it is given: not asked
  // as missing and not listed as still unknown, even where Reception placed no
  // value. With the ledger off this is empty and nothing changes.
  const ledgerGiven = ledger ? ledgerGivenKeys(ledger.facts) : new Set<string>();
  const config = loadTemplateConfig(pack.id);
  return {
    intake_id: ctx.intakeId,
    outcome: 'brief',
    brief: withoutLedgerGiven(brief, ledgerGiven),
    questions: buildBriefQuestions(brief, wordedQuestions(parsed), alsoAsk, always, {
      checklist,
      confirm: confirmKeys(brief, checklist, ledger),
      ledgerGiven,
    }),
    ...(config?.plan_access === 'pro' && req.plan !== 'pro' ? { needs_upgrade: true } : {}),
    ...(ledger ? { ledger } : {}),
  };
}

function answersText(answers: ReceptionAnswer[]): string {
  return answers.map((a) => a.answer).join('\n');
}

async function briefWithNoPack(
  ctx: BriefContext,
  req: BriefIntakeRequest,
  modelSaysCourt: boolean,
): Promise<BriefIntakeResponse> {
  // T-107, section 3: nothing for the Supreme Court is drafted without a rule pack.
  if (namesSupremeCourt(req.description)) {
    console.info(`[intake] never-draft list (intakeId=${ctx.intakeId}, reason=supreme_court)`);
    return { intake_id: ctx.intakeId, outcome: 'no_match' };
  }
  const round = req.round === 2 || req.round === 3 ? req.round : 1;
  const answers = round === 1 ? [] : (req.answers ?? []);
  // Light mode is not used yet (T-127, section 3.1). Strict is always the safe mode.
  // T-453 follow-up: the cap is config (ai.cap.intake_reception). Never throws.
  const maxTokens = await getIntakeReceptionCap();
  const { text } = await cachedModelCall(
    ctx,
    'intake_reception',
    RECEPTION_GUIDED_SYSTEM_PROMPT,
    buildReceptionGuidedUserPrompt(req.description, answers, 'strict', round),
    maxTokens,
  );
  if (text === null) return { intake_id: ctx.intakeId, outcome: 'unavailable' };
  const parsed = parseModelJson(text);
  if (!parsed) return { intake_id: ctx.intakeId, outcome: 'unavailable' };

  if (parsed.outcome === 'not_legal' || parsed.outcome === 'refused') {
    console.info(
      `[intake] reception declined (intakeId=${ctx.intakeId}, outcome=${parsed.outcome})`,
    );
    return { intake_id: ctx.intakeId, outcome: 'no_match' };
  }

  if (parsed.outcome === 'questions') {
    // Two rounds and no more. In round 3 the model is told not to ask; if it still does, we stop.
    if (round >= 3) {
      console.error(`[intake] reception asked in round 3 (intakeId=${ctx.intakeId})`);
      return { intake_id: ctx.intakeId, outcome: 'unavailable' };
    }
    const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions: BriefQuestion[] = [];
    for (const q of raw) {
      const e = (q ?? {}) as { id?: unknown; question?: unknown; about?: unknown };
      if (typeof e.question !== 'string' || e.question.trim().length < 5) continue;
      questions.push({
        key: typeof e.id === 'string' && e.id.length <= 20 ? e.id : `q${questions.length + 1}`,
        question: e.question.replace(/\s+/g, ' ').trim().slice(0, 240),
        round: round === 1 ? 1 : 2,
        label: typeof e.about === 'string' ? e.about.slice(0, 20) : 'fact',
        kind: 'narrative',
        options: [],
      });
      if (questions.length === BRIEF_QUESTION_LIMITS.perRound) break;
    }
    if (questions.length === 0) return { intake_id: ctx.intakeId, outcome: 'unavailable' };
    return { intake_id: ctx.intakeId, outcome: 'questions', questions, next_round: round + 1 };
  }

  if (parsed.outcome !== 'brief') return { intake_id: ctx.intakeId, outcome: 'unavailable' };

  // Either the code or the model saying "court" is enough (T-107, section 2).
  const courtDocument =
    modelSaysCourt || parsed.court_document === true || hasCourtSignal(req.description);
  const allText = [req.description, answersText(answers)].filter((t) => t.length > 0).join('\n');
  const reading = readGuidedBrief(parsed.brief, allText, courtDocument);

  // Dates are read by code, each with the meaning the user's own words give it.
  const dated = statedDates(allText).filter((d) => d.kind !== null);
  const seenKinds = new Set<string>();
  const dateItems: ChecklistItem[] = [];
  const dateValues: GivenValue[] = [];
  for (const d of dated) {
    const kind = d.kind as string;
    if (seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    const item = guidedDateItem(kind);
    dateItems.push(item);
    dateValues.push({ key: item.key, value: d.value, quote: d.words, source: 'description' });
  }

  const brief = buildBrief({
    kind: {
      id: null,
      name: cleanLabel(parsed.document_kind) || 'Document',
      court_document: courtDocument,
    },
    checklist: [...fixedChecklist(courtDocument), ...dateItems],
    values: [...reading.values, ...dateValues, ...userValues(req.keep)],
    court: req.court,
    description: allText,
    extraUnknowns: reading.unknowns,
  });
  console.info(
    `[intake] brief built (intakeId=${ctx.intakeId}, kind=none, round=${round}, read=${reading.values.length}, dropped=${reading.dropped}, unknown=${brief.still_unknown.length})`,
  );
  return { intake_id: ctx.intakeId, outcome: 'brief', brief, questions: [] };
}

/**
 * Describe, and get a brief back. Throws IntakeLimitError for a 429. Every
 * other failure is `outcome: unavailable`.
 */
export async function runBriefIntake(req: BriefIntakeRequest): Promise<BriefIntakeResponse> {
  const intakeId = req.intakeId ?? crypto.randomUUID();

  let model: string;
  try {
    // T-684: the extractor role (ai.model.extractor, else ai.intake_model).
    model = await resolveModel('extractor');
  } catch (err) {
    if (err instanceof AppSettingMissingError) {
      console.error(`[intake] ${err.key} is not set (intakeId=${intakeId})`);
    }
    return { intake_id: intakeId, outcome: 'unavailable' };
  }
  // A first request counts against the user's limits. A later one for the same
  // intake (a round of answers, a change of kind) counts against that intake,
  // but only when this user did start it: an id nobody started is a first request.
  const ownerKey = `intake:owner:${intakeId}`;
  const claimsFollowUp =
    req.intakeId !== undefined && (req.kind !== undefined || (req.round ?? 1) > 1);
  let spent = false;
  const ctx: BriefContext = {
    userId: req.userId,
    intakeId,
    model,
    hasSpent: () => spent,
    ledger: { enabled: false, earlier: null },
    spend: async () => {
      if (spent) return;
      spent = true;
      if (claimsFollowUp && (await redis.get(ownerKey)) === req.userId) {
        await consumeFollowUp(intakeId);
        return;
      }
      await consumeIntakeQuota(req.userId, req.plan);
      await redis.set(ownerKey, req.userId, 'EX', 2 * 3600);
    },
  };

  try {
    // T-147b: the ledger, only while the switch is on. An earlier ledger must be this user's.
    if (await isFactLedgerEnabled(req.userId)) {
      ctx.ledger.enabled = true;
      if (req.ledgerId !== undefined) {
        ctx.ledger.earlier = await loadOwnLedger(req.ledgerId, req.userId);
        if (!ctx.ledger.earlier) throw new LedgerNotFoundError();
      }
    }

    const catalogue = await getEnabledCatalogue(req.userId);
    const allowed = new Set(catalogue.map((c) => c.template_id));

    // The user picked the kind, or changed it.
    if (req.kind !== undefined) {
      if (req.kind === 'none') return await briefWithNoPack(ctx, req, false);
      const pack = allowed.has(req.kind) ? loadRulePack(req.kind) : null;
      if (!pack) return { intake_id: intakeId, outcome: 'no_match' };
      return await briefWithPack(ctx, pack, req);
    }

    // T-610: the keyword pass (Ajay's table), allowed ids only. It ranks; it never matches alone.
    const keywords = matchKeywords(req.description, allowed);
    const keywordIds = keywords.candidates.map((c) => c.templateId);
    const displayNames = displayNameIndex(catalogue);
    const matchUser = buildMatchUserPrompt(req.description, catalogue);
    const first = await cachedModelCall(
      ctx,
      'intake_match',
      MATCH_SYSTEM_PROMPT,
      matchUser,
      INTAKE_LIMITS.matchMaxTokens,
      { write: false },
    );
    if (first.text === null) return { intake_id: intakeId, outcome: 'unavailable' };

    let answerText = first.text;
    let answer = readMatchAnswer(parseModelJson(answerText), allowed, displayNames);
    const firstProblem = answer.problem;
    // T-610: a malformed, truncated or off-list answer gets one fresh retry, with
    // the larger cap. A failed retry keeps the first answer (then the keyword pick).
    if (firstProblem) {
      const retry = await cachedModelCall(
        ctx,
        'intake_match',
        MATCH_SYSTEM_PROMPT,
        matchUser,
        INTAKE_LIMITS.matchRetryMaxTokens,
        { write: false, fresh: true },
      );
      if (retry.text !== null) {
        const again = readMatchAnswer(parseModelJson(retry.text), allowed, displayNames);
        if (!again.problem || answer.problem === 'malformed') {
          answer = again;
          answerText = retry.text;
        }
      }
    }

    // T610-T5 (Ajay F2/F2a/F2b, 1bf3df1a, f0985461, edfe8645): the pair is used only when the answer is
    // still a problem after the retry, or (T610-E1, Ajay, ca507e9b) says not legal drafting;
    // a good answer leaves T5 to the model.
    const matched = decideFromAnswer(answer, keywordIds, keywords.t5Pair);
    // F2b: the guard runs on the T5 pair too (it reorders the two, never adds or drops one);
    // the spread below keeps t5Fallback, so the response stays unranked.
    const guard = applyBailGuard(matched, req.description, allowed);
    const decision: MatchDecision = guard.changed
      ? { ...matched, kind: 'needs_choice', templateId: undefined, choices: guard.choices }
      : matched;
    if (guard.changed) {
      console.info(
        `[intake] bail guard changed the match (intakeId=${intakeId}, from=${matched.kind}, cue=${guard.cue})`,
      );
    }
    // Ids, counts and reasons only: never description text.
    console.info(
      `[intake] match decided (intakeId=${intakeId}, outcome=${decision.kind}, noMatchReason=${decision.noMatchReason ?? 'none'}, answer=${firstProblem ?? 'ok'}, retried=${firstProblem !== undefined}, retryAnswer=${firstProblem ? (answer.problem ?? 'ok') : 'none'}, keywordCandidates=${keywordIds.length}, t5Fallback=${decision.t5Fallback === true}, top=${decision.templateId ?? decision.choices?.[0] ?? 'none'})`,
    );
    // T-610 (Arjun, 26 Oct 2026): only a deliberate model answer is cached: matched or guided.
    // Never a malformed, truncated or off-list answer, a no_match, or a keyword (fallback) pick.
    const deliberate = decision.kind === 'matched' || decision.kind === 'guided';
    if (deliberate && !(first.fromCache && answerText === first.text)) {
      await writeIntakeCache(
        intakeCacheParts(ctx, 'intake_match', MATCH_SYSTEM_PROMPT, matchUser),
        answerText,
      );
    }

    switch (decision.kind) {
      case 'matched': {
        const pack = loadRulePack(decision.templateId ?? '');
        if (!pack) return await briefWithNoPack(ctx, req, decision.isCourtDocument);
        return await briefWithPack(ctx, pack, req);
      }
      case 'needs_choice': {
        const byId = new Map(catalogue.map((c) => [c.template_id, c.display_name]));
        return {
          intake_id: intakeId,
          outcome: 'needs_choice',
          choices: (decision.choices ?? []).map((id) => ({ kind: id, name: byId.get(id) ?? id })),
          ...(decision.t5Fallback ? { unranked: true as const } : {}),
        };
      }
      case 'guided': {
        // A demand signal for every request no rule pack fits (ADR-019 §3.10).
        const result = await briefWithNoPack(ctx, req, decision.isCourtDocument);
        if (result.outcome !== 'unavailable' && (req.round ?? 1) === 1) {
          await recordDemand(req.userId, intakeId, 'demand.no_template', decision);
        }
        return result;
      }
      case 'no_match':
      default:
        if (decision.noMatchReason !== 'not_legal_drafting') {
          await recordDemand(
            req.userId,
            intakeId,
            'demand.no_match',
            decision,
            decision.noMatchReason,
          );
        }
        return { intake_id: intakeId, outcome: 'no_match' };
    }
  } catch (err) {
    if (err instanceof IntakeLimitError || err instanceof LedgerNotFoundError) throw err;
    console.error(
      `[intake] brief failed, no further model call made (intakeId=${intakeId}):`,
      err instanceof Error ? err.name : 'unknown',
    );
    return { intake_id: intakeId, outcome: 'unavailable' };
  }
}

export interface BriefUpdateRequest {
  /** A rule-pack id, or `none`. */
  kind: string;
  /** For `none`: the name shown for the document, and whether it is a court document. */
  kindName?: string;
  courtDocument?: boolean;
  values: GivenValue[];
  court?: Partial<BriefCourt>;
  /** When sent, the dates in it that are not placed are listed again. It is not stored. */
  description?: string;
  /**
   * T-498: the fact ledger just updated (switch on, /intake/brief/update only).
   * A key it holds a fact for is not still unknown and does not block Confirm.
   * The draft path does not send it.
   */
  ledger?: Pick<LedgerView, 'facts'> & Partial<Pick<LedgerView, 'unresolved'>>;
  /** T-629 (§(i)2): facts the advocate was asked and left blank (`buildBrief`'s `askedKeys`). */
  askedKeys?: readonly string[];
}

/**
 * Work the brief out again after the user typed, chose the court or changed
 * the kind. No model call, no limits, no cost. Returns null for an unknown kind.
 */
export function updateBrief(req: BriefUpdateRequest): Brief | null {
  if (req.kind === 'none') {
    // T-107, section 2: a court signal in the user's own words makes it a court
    // document, whatever the browser sent. Either one saying "court" is enough.
    const said = [
      cleanLabel(req.kindName),
      ...req.values.flatMap((v) => (Array.isArray(v.value) ? v.value : [v.value])),
    ].join('\n');
    const courtDocument = req.courtDocument === true || hasCourtSignal(said);
    const dateItems: ChecklistItem[] = [];
    for (const v of req.values) {
      if (!v.key.startsWith('date.')) continue;
      const item = guidedDateItem(v.key.slice('date.'.length));
      if (item.label !== item.dateKind && !dateItems.some((d) => d.key === item.key)) {
        dateItems.push(item);
      }
    }
    return buildBrief({
      kind: {
        id: null,
        name: cleanLabel(req.kindName) || 'Document',
        court_document: courtDocument,
      },
      checklist: [...fixedChecklist(courtDocument), ...dateItems],
      values: req.values,
      court: req.court,
      description: req.description,
      askedKeys: req.askedKeys,
    });
  }
  const allowed = new Set(getCatalogue().map((c) => c.template_id));
  const pack = allowed.has(req.kind) ? loadRulePack(req.kind) : null;
  if (!pack) return null;
  return buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: checklistFor(pack),
    values: req.values,
    court: req.court,
    description: req.description,
    holdNone: firstApplicationValues(pack.id),
    askedKeys: req.askedKeys,
    ...(req.ledger
      ? {
          ledgerGiven: ledgerGivenKeys(req.ledger.facts),
          // T-660: the ledger's wording too, so the brief derives custody_since
          // (T-638 R1) only when generation will.
          ledgerCustody: ledgerCustodyInputs(req.ledger.facts, req.ledger.unresolved ?? []),
        }
      : {}),
  });
}

export interface LedgerUpdateRequest {
  userId: string;
  ledgerId: string;
  /** The rule-pack id of the brief. The ledger must be for the same one. */
  kind: string;
  edits: LedgerEdit[];
  now?: Date;
}

/**
 * T-147b: answers and edits on the brief, written to the ledger as new
 * versions. No model call. Throws LedgerNotFoundError for a ledger that is
 * not this user's, or not for this document. Logs ids and counts only.
 */
export async function updateLedger(
  req: LedgerUpdateRequest,
): Promise<{ ledger: LedgerView; results: LedgerEditResult[] }> {
  const doc = await loadOwnLedger(req.ledgerId, req.userId);
  if (!doc || doc.documentKind !== req.kind) throw new LedgerNotFoundError();
  const allowed = new Set((await getEnabledCatalogue(req.userId)).map((c) => c.template_id));
  const pack = allowed.has(req.kind) ? loadRulePack(req.kind) : null;
  if (!pack) throw new LedgerNotFoundError();
  const checklist = checklistFor(pack);
  const { doc: after, results } = await applyEdits(
    doc,
    checklist,
    req.edits,
    INTAKE_LIMITS.maxLedgerVersions,
    req.now,
  );
  console.info(
    `[intake] ledger updated (ledgerId=${req.ledgerId}, version=${after.currentVersion}, edits=${req.edits.length}, saved=${results.filter((r) => r.status === 'saved').length}, unreadable=${results.filter((r) => r.status === 'unreadable').length})`,
  );
  return { ledger: ledgerView(after, checklist), results };
}
