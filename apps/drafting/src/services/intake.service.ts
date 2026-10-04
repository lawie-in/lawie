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
import {
  buildFillUserPrompt,
  buildMatchUserPrompt,
  CatalogueEntry,
  FILL_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
} from './intake.prompts';
import { getModelRates, priceUsage } from './llm-usage';
import {
  evaluateShowIf,
  FormField,
  listTemplateConfigs,
  loadTemplateConfig,
  TemplateConfig,
} from './template-engine.service';

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

// ── Text matching helpers ───────────────────────────────────────────────────

export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function digitsOnly(s: string): string {
  return s.replace(/[^0-9.]/g, '');
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Dates a piece of text states, read by code (not by the model), in the
 * formats Indian users write: 15/03/2026, 15-03-2026, 15.03.2026 (day first),
 * 2026-03-15, 15 March 2026, 15th March, 2026, March 15, 2026.
 */
export function datesInText(text: string): string[] {
  const out = new Set<string>();
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) out.add(v);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const v = iso(+m[3], +m[2], +m[1]);
    if (v) out.add(v);
  }
  for (const m of t.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})[,]?\s+(\d{4})\b/g,
  )) {
    const mon = MONTHS[m[2]];
    if (mon) {
      const v = iso(+m[3], mon, +m[1]);
      if (v) out.add(v);
    }
  }
  for (const m of t.matchAll(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/g)) {
    const mon = MONTHS[m[1]];
    if (mon) {
      const v = iso(+m[3], mon, +m[2]);
      if (v) out.add(v);
    }
  }
  return [...out];
}

/** True when `value` (allowing "…" / "..." cuts) is the user's own words, in order. */
function isOwnWords(value: string, normDescription: string): boolean {
  const parts = normalise(value)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  let from = 0;
  for (const p of parts) {
    const at = normDescription.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

// ── JSON from the model ─────────────────────────────────────────────────────

export function parseModelJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(stripped.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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

  const decision = decideMatch(parseModelJson(text), allowed);
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
