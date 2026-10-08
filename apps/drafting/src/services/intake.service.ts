/**
 * Intake — describe-first: description → template + quote-backed field values.
 * ADR-019 §3.2–§3.10, §4.1, §4.2. Ticket T-101.
 *
 * Privacy rule (T-101): no description text, quote or field value is ever
 * logged, stored in a usage row, or put in an error message. Logs carry ids,
 * outcomes and counts only.
 */
import crypto from 'crypto';

import redis from '../config/redis';
import { Event } from '../models/Event.model';
import { LlmAuxCall, LlmAuxPurpose } from '../models/LlmAuxCall.model';
import { presentDescription } from '../utils/presentDescription';

import { AppSettingMissingError, APP_SETTING_KEYS, getAppSetting } from './app-settings.service';
import { AuxCallError, AuxCallUsage, callAuxModel } from './aux-llm';
import { applyBailGuard } from './bail-guard';
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
  namesSupremeCourt,
  QUESTION_LIMITS as BRIEF_QUESTION_LIMITS,
  readGuidedBrief,
  statedDates,
  valuesAfterEditedDescription,
  wordedQuestions,
} from './intake-brief';
import { readIntakeCache, writeIntakeCache } from './intake-cache';
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
  buildReceptionPackUserPrompt,
  CatalogueEntry,
  FILL_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
  RECEPTION_GUIDED_SYSTEM_PROMPT,
  RECEPTION_PACK_SYSTEM_PROMPT,
  ReceptionAnswer,
} from './intake.prompts';
import { getModelRates, priceUsage } from './llm-usage';
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

export const DESCRIBE_FIRST_SETTING = 'feature.describe_first';

/**
 * `feature.describe_first`: "on" for everyone, "off" or unset for no one, or a
 * comma-separated list of user ids (the founder's account first, per §3.11).
 * Never throws: any problem reading it means off, so the gallery shows.
 */
export async function isDescribeFirstEnabled(userId: string): Promise<boolean> {
  try {
    const raw = (await getAppSetting(DESCRIBE_FIRST_SETTING)).trim();
    if (raw === 'on') return true;
    if (raw === 'off' || raw === '') return false;
    return raw
      .split(',')
      .map((s) => s.trim())
      .includes(userId);
  } catch {
    return false;
  }
}

// ── Limits and caps (ADR-019 §3.8, founder D6) ──────────────────────────────

export const INTAKE_LIMITS = {
  burstMax: 10,
  burstWindowSeconds: 600,
  dailyFree: 40,
  dailyPaid: 150,
  matchMaxTokens: 300,
  fillMaxTokens: 1500,
  /** T-105: Reception reads up to 40 checklist lines and words up to 10 questions. */
  receptionMaxTokens: 3000,
  /** T-105: model-calling requests allowed for one intake after its first (rounds and changes of kind). */
  followUpsPerIntake: 6,
  answerMax: 2000,
  descriptionMin: 20,
  descriptionMax: 4000,
} as const;

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
    }))
    .sort((a, b) => a.template_id.localeCompare(b.template_id));
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
  label: string;
  category: string;
  isCourtDocument: boolean;
}

function cleanLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Server-side guard on top of the prompt: no digits, no long strings.
  return raw.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function decideMatch(
  parsed: Record<string, unknown> | null,
  allowed: Set<string>,
): MatchDecision {
  if (!parsed) {
    return {
      kind: 'no_match',
      noMatchReason: 'malformed',
      label: '',
      category: '',
      isCourtDocument: false,
    };
  }
  const label = cleanLabel(parsed.label);
  const category =
    typeof parsed.category === 'string' ? cleanLabel(parsed.category).slice(0, 30) : '';
  const isCourtDocument = parsed.is_court_document === true;
  const base = { label, category, isCourtDocument };

  if (parsed.is_legal_drafting === false) {
    return { kind: 'no_match', noMatchReason: 'not_legal_drafting', ...base };
  }
  const confidence = parsed.confidence;
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    return { kind: 'no_match', noMatchReason: 'malformed', ...base };
  }
  const primary = typeof parsed.template_id === 'string' ? parsed.template_id : null;
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.filter((a): a is string => typeof a === 'string')
    : [];

  if (confidence === 'low' || (primary === null && alternatives.length === 0)) {
    return { kind: 'guided', ...base };
  }
  if (confidence === 'high') {
    if (primary && allowed.has(primary)) return { kind: 'matched', templateId: primary, ...base };
    return { kind: 'no_match', noMatchReason: 'unknown_template', ...base };
  }
  // medium: always ask, never pick (§4.2.2)
  const named = [primary, ...alternatives].filter((x): x is string => !!x);
  const choices = [...new Set(named.filter((id) => allowed.has(id)))].slice(0, 3);
  if (choices.length === 0) return { kind: 'no_match', noMatchReason: 'unknown_template', ...base };
  return { kind: 'needs_choice', choices, ...base };
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
    .map((f) => ({
      field_id: f.field_id,
      question: f.label,
      type: f.type,
      ...(f.options && f.options.length > 0
        ? { options: f.options.map((o) => ({ id: o.id, label: o.label })) }
        : {}),
      ...(f.options_from ? { options_from: f.options_from } : {}),
      ...(f.source ? { source: f.source } : {}),
      ...(f.filtered_by ? { filtered_by: f.filtered_by } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      ...(f.help ? { help: f.help } : {}),
      ...(f.min_select ? { min_select: f.min_select } : {}),
    }));
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
        label: d.label || null,
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

const DATED_MODEL_ID = /-\d{8}$/;

function heliconeHeaders(
  userId: string,
  intakeId: string,
  purpose: LlmAuxPurpose,
): Record<string, string> {
  return {
    'Helicone-User-Id': userId,
    'Helicone-Property-Intake-Id': intakeId,
    'Helicone-Property-Purpose': purpose,
    // T-101: no description text in third-party tools. Asks Helicone not to
    // store request/response bodies (usage is still read from our stream).
    'Helicone-Omit-Request': 'true',
    'Helicone-Omit-Response': 'true',
  };
}

async function modelCall(
  req: { userId: string; intakeId: string; model: string },
  purpose: LlmAuxPurpose,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const started = Date.now();
  try {
    const r = await callAuxModel({
      model: req.model,
      system,
      user,
      maxTokens,
      heliconeHeaders: heliconeHeaders(req.userId, req.intakeId, purpose),
    });
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
 * (missing or undated model setting, Redis down, model error) is
 * `outcome: unavailable` — the gallery still works.
 */
export async function runIntake(req: IntakeRequest): Promise<IntakeResponse> {
  const intakeId = req.intakeId ?? crypto.randomUUID();

  let model: string;
  try {
    model = await getAppSetting(APP_SETTING_KEYS.INTAKE_MODEL);
  } catch (err) {
    if (err instanceof AppSettingMissingError) {
      console.error(`[intake] ${APP_SETTING_KEYS.INTAKE_MODEL} is not set (intakeId=${intakeId})`);
    }
    return { intake_id: intakeId, outcome: 'unavailable' };
  }
  if (!DATED_MODEL_ID.test(model)) {
    // T-003 spike: Helicone usage parsing breaks on bare aliases.
    console.error(
      `[intake] ${APP_SETTING_KEYS.INTAKE_MODEL} must be a full dated model id (intakeId=${intakeId})`,
    );
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
  const catalogue = getCatalogue();
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

  const matched = decideMatch(parseModelJson(text), allowed);
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
}

export interface BriefIntakeResponse {
  intake_id: string;
  outcome: 'brief' | 'questions' | 'needs_choice' | 'no_match' | 'unavailable';
  brief?: Brief;
  questions?: BriefQuestion[];
  /** With `questions` for a document with no rule pack: the round to send back with the answers. */
  next_round?: number;
  choices?: Array<{ kind: string; name: string }>;
  needs_upgrade?: boolean;
}

interface BriefContext {
  userId: string;
  intakeId: string;
  model: string;
  /** Counts the request against the limits, once, just before its first real model call. */
  spend: () => Promise<void>;
}

/**
 * A model call that is answered from the cache when this exact request was
 * made in the last 30 minutes. A cached answer costs nothing, so it is not
 * counted against the limits and no usage row is written for it.
 */
async function cachedModelCall(
  ctx: BriefContext,
  purpose: LlmAuxPurpose,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const cacheParts = [ctx.userId, purpose, ctx.model, system, user];
  const cached = await readIntakeCache(cacheParts);
  if (cached !== null) return cached;
  await ctx.spend();
  const text = await modelCall(ctx, purpose, system, user, maxTokens);
  if (text !== null) await writeIntakeCache(cacheParts, text);
  return text;
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

async function briefWithPack(
  ctx: BriefContext,
  pack: RulePack,
  req: BriefIntakeRequest,
): Promise<BriefIntakeResponse> {
  const checklist = buildChecklist(pack);
  const text = await cachedModelCall(
    ctx,
    'intake_reception',
    RECEPTION_PACK_SYSTEM_PROMPT,
    buildReceptionPackUserPrompt(pack.name, checklistLines(checklist), req.description),
    INTAKE_LIMITS.receptionMaxTokens,
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
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist,
    values,
    court: req.court,
    description: req.description,
    reask: [...alsoAsk],
  });
  console.info(
    `[intake] brief built (intakeId=${ctx.intakeId}, kind=${pack.id}, read=${read.values.size}, byCode=${byCode.size}, dropped=${read.dropped.length}, unknown=${brief.still_unknown.length}${edit})`,
  );
  const config = loadTemplateConfig(pack.id);
  return {
    intake_id: ctx.intakeId,
    outcome: 'brief',
    brief,
    questions: buildBriefQuestions(brief, wordedQuestions(parsed), alsoAsk),
    ...(config?.plan_access === 'pro' && req.plan !== 'pro' ? { needs_upgrade: true } : {}),
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
  const text = await cachedModelCall(
    ctx,
    'intake_reception',
    RECEPTION_GUIDED_SYSTEM_PROMPT,
    buildReceptionGuidedUserPrompt(req.description, answers, 'strict', round),
    INTAKE_LIMITS.receptionMaxTokens,
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
    model = await getAppSetting(APP_SETTING_KEYS.INTAKE_MODEL);
  } catch (err) {
    if (err instanceof AppSettingMissingError) {
      console.error(`[intake] ${APP_SETTING_KEYS.INTAKE_MODEL} is not set (intakeId=${intakeId})`);
    }
    return { intake_id: intakeId, outcome: 'unavailable' };
  }
  if (!DATED_MODEL_ID.test(model)) {
    console.error(
      `[intake] ${APP_SETTING_KEYS.INTAKE_MODEL} must be a full dated model id (intakeId=${intakeId})`,
    );
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
    const catalogue = getCatalogue();
    const allowed = new Set(catalogue.map((c) => c.template_id));

    // The user picked the kind, or changed it.
    if (req.kind !== undefined) {
      if (req.kind === 'none') return await briefWithNoPack(ctx, req, false);
      const pack = allowed.has(req.kind) ? loadRulePack(req.kind) : null;
      if (!pack) return { intake_id: intakeId, outcome: 'no_match' };
      return await briefWithPack(ctx, pack, req);
    }

    const text = await cachedModelCall(
      ctx,
      'intake_match',
      MATCH_SYSTEM_PROMPT,
      buildMatchUserPrompt(req.description, catalogue),
      INTAKE_LIMITS.matchMaxTokens,
    );
    if (text === null) return { intake_id: intakeId, outcome: 'unavailable' };

    const matched = decideMatch(parseModelJson(text), allowed);
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
    if (err instanceof IntakeLimitError) throw err;
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
    });
  }
  const allowed = new Set(getCatalogue().map((c) => c.template_id));
  const pack = allowed.has(req.kind) ? loadRulePack(req.kind) : null;
  if (!pack) return null;
  return buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: req.values,
    court: req.court,
    description: req.description,
  });
}
