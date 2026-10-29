/**
 * T-683: code validation of the v3 Extractor's answer (role C). Pure: no I/O,
 * no clock (the caller passes `today`), never throws.
 *
 * Ajay's rules (handoff/legal/run5-rulings-ajay.md, "T-683: v3 Extractor,
 * complete rule"), rule 1 and rule 4:
 *
 * - the quote is the user's exact words, at most 200 characters, found in the
 *   text it names (the description, or that turn's answer) after NFC on both
 *   sides and whitespace collapse only (Arjun, T-682 review condition 2). A
 *   quote that fails gives no fact;
 * - the value's type and range per field; ISO dates, and an ambiguous date
 *   gives no fact; rupee amounts read by code from the quote (P3); yes/no; police
 *   stations per T-612 (6)/(6a)/(6b); confidence below the floor means ask;
 * - a non-answer (§(j)3, AJ-668 M5–M6 for party names, T-190 condition 5)
 *   never becomes a fact, is never reassigned, and goes to `nonAnswers`;
 * - two different values for one key go to `conflicts`, never a guess.
 *
 * Every closed list is imported from its v2 module, never copied (Arjun,
 * T-682 review condition 3): the §(j)3 list and the party rule
 * (signed-confirm-messages.ts), the T-190 "none" rule (intake-brief
 * isNoFactAnswer), date meanings (intake-brief dateKindLabel, used by the
 * extractor's lines), the confidence floors (@lawie/shared), the station table
 * (police-station-name.ts), and the span finder (fact-ledger.service locateSpan).
 *
 * Nothing here logs. `dropped` carries reason codes and counts only.
 */
import {
  CONFIDENCE_FLOORS,
  devanagariToArabic,
  FactType,
  normalizeAmount,
  normalizeDate,
} from '@lawie/shared';

import {
  isEmptyOrNonAnswer,
  isPartyNameGuardedField,
  isPartyNonAnswer,
} from '../../config/intake/signed-confirm-messages';
import { CUSTODY_SINCE_DERIVED_KEY } from '../custody-since-derivation';
import { factTypeFor, isLedgerItem, locateSpan } from '../fact-ledger.service';
import type { ChecklistItem } from '../intake-brief';
import { isNoFactAnswer } from '../intake-brief';
import { stripStationMarkerOnce } from '../police-station-name';

import type { ExtractResult, LedgerCandidate, LedgerCandidateType, NonAnswer } from './types';

// ── Limits ──────────────────────────────────────────────────────────────────

/** Ajay rule 1: a quote is at most 200 characters. */
export const QUOTE_MAX = 200;
/** Ajay rule 1: confidence below 0.6 means ask. The v2 per-type floors apply on top when higher. */
export const ASK_BELOW_CONFIDENCE = 0.6;
/** Upper bounds on a value, so a runaway answer is not a fact. */
const TEXT_MAX = 2000;
const LIST_ITEM_MAX = 500;
const LIST_MAX_ITEMS = 50;

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface ValidateAnswer {
  turn: number;
  /** The keys this answer was asked for. A non-answer counts only for these. */
  askedKeys: string[];
  text: string;
}

export interface ValidateContext {
  /** The pack's checklist (buildChecklist), as the caller built it. */
  checklist: ChecklistItem[];
  /** The description, turn 0. */
  description: string;
  answers: ValidateAnswer[];
  /** Today, ISO YYYY-MM-DD (IST), so a past-event date after today gives no fact. */
  today?: string;
}

/** Why a model entry was not kept. Reason codes only, never a key or text. */
export type DropReason =
  | 'not_json'
  | 'bad_entry'
  | 'not_on_list'
  | 'no_source'
  | 'not_model_readable'
  | 'no_quote'
  | 'quote_too_long'
  | 'span_not_found'
  | 'bad_confidence'
  | 'low_confidence'
  | 'bad_value'
  | 'non_answer'
  | 'non_answer_not_asked'
  | 'not_a_non_answer';

export interface ValidateOutcome {
  result: ExtractResult;
  /** Counts by reason code. */
  dropped: Partial<Record<DropReason, number>>;
}

// ── Field specs ─────────────────────────────────────────────────────────────

interface FieldSpec {
  item: ChecklistItem;
  factType: FactType;
  type: LedgerCandidateType;
  yesNo: boolean;
  policeStation: boolean;
  partyName: boolean;
}

function fold(v: string): string {
  return v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isYesNoItem(item: ChecklistItem): boolean {
  return (
    item.kind === 'choice' &&
    item.options.length === 2 &&
    item.options.map(fold).sort().join('|') === 'no|yes'
  );
}

/** The candidate type of a checklist item (Arjun's six; T-682 maps them back). */
function candidateType(item: ChecklistItem, factType: FactType): LedgerCandidateType {
  if (item.kind === 'list' || item.kind === 'choices') return 'list';
  switch (factType) {
    case 'date':
      return 'date';
    case 'amount':
      return 'money';
    case 'person_name':
    case 'place_name':
    case 'police_station':
    case 'court':
      return 'name';
    case 'enum':
    case 'boolean':
      return 'choice';
    default:
      return 'text';
  }
}

// ── Derived keys (Arjun, T-683 answers §5 item 1) ───────────────────────────
//
// Derivation is T-682's derive() alone. A model value for a derived key is
// never a candidate: the key is off the field specs, so it is dropped as
// `not_on_list` (T-682 invariant 6) on every path.

/**
 * The derived key names (last key segment): the custody-since derivation's
 * key (imported), and `amount_in_words`, computed by code from cheque_amount
 * (T-611 P5, fact-ledger.service withAmountInWordsFact, which exports no
 * constant for the name).
 */
const DERIVED_KEY_NAMES: ReadonlySet<string> = new Set([
  CUSTODY_SINCE_DERIVED_KEY,
  'amount_in_words',
]);

/** True for a key code derives: never read from the model. */
export function isDerivedKey(key: string): boolean {
  return DERIVED_KEY_NAMES.has(key.slice(key.lastIndexOf('.') + 1));
}

export function fieldSpecs(checklist: ChecklistItem[]): Map<string, FieldSpec> {
  const out = new Map<string, FieldSpec>();
  for (const item of checklist) {
    if (!isLedgerItem(item) || isDerivedKey(item.key) || out.has(item.key)) continue;
    const factType = factTypeFor(item);
    out.set(item.key, {
      item,
      factType,
      type: candidateType(item, factType),
      yesNo: isYesNoItem(item),
      policeStation: factType === 'police_station',
      partyName: item.partyName || isPartyNameGuardedField(item.key),
    });
  }
  return out;
}

// ── The quote ───────────────────────────────────────────────────────────────

/**
 * The quote as it stands in the text, or null. Both sides NFC, then
 * whitespace collapse only (locateSpan). Never longer than QUOTE_MAX.
 */
export function findQuote(text: string, quote: string): string | null {
  const q = quote.normalize('NFC').trim();
  if (q === '' || q.length > QUOTE_MAX) return null;
  const found = locateSpan(text.normalize('NFC'), q);
  return found !== null && found.length <= QUOTE_MAX ? found : null;
}

// ── Non-answers ─────────────────────────────────────────────────────────────

/** Rule 4: a non-answer for this field, by the v2 rules (imported, never copied). */
export function isNonAnswerFor(spec: FieldSpec, words: string): boolean {
  if (isEmptyOrNonAnswer(words)) return true;
  if (spec.partyName && isPartyNonAnswer(words)) return true;
  return isNoFactAnswer(spec.item, words);
}

// ── Values ──────────────────────────────────────────────────────────────────

const DEVANAGARI = /[ऀ-ॿ]/u;

/** Every digit run of the value is a digit run of the quote: no number invented or changed. */
function digitsFromQuote(value: string, quote: string): boolean {
  const q = new Set(devanagariToArabic(quote).match(/\d+/g) ?? []);
  return (devanagariToArabic(value).match(/\d+/g) ?? []).every((d) => q.has(d));
}

/** An English value: no Devanagari left (rule 1, never copied raw), bounded. */
function englishText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (s === '' || s.length > max || DEVANAGARI.test(s)) return null;
  return s;
}

/** Two-digit-year numeric dates ("12/3/26"): ambiguous, so no fact (rule 1). */
const TWO_DIGIT_YEAR_DATE = /(?<!\d)\d{1,2}([/.-])\d{1,2}\1\d{2}(?!\d)/u;
const AMBIGUOUS_DATE_REASONS = new Set([
  'two_digit_year_needs_reference',
  'two_digit_year_ambiguous',
  'missing_year',
  'unknown_month',
  'day_month_out_of_range',
]);

function readDate(value: unknown, quote: string, key: string, today?: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const v = value.trim();
  // Range: a real calendar day; a past-event date after today is no fact.
  const own = normalizeDate(v, { fieldKey: key, ...(today ? { today } : {}) });
  if (!own.ok || own.value !== v) return null;
  const q = devanagariToArabic(quote);
  if (TWO_DIGIT_YEAR_DATE.test(q)) return null;
  // No reference year is passed, so a two-digit year never reads.
  const fromQuote = normalizeDate(quote);
  if (fromQuote.ok) return fromQuote.value === v ? v : null;
  if (AMBIGUOUS_DATE_REASONS.has(fromQuote.reason)) return null;
  // A quote with words around the date: its four-digit year must be in the quote.
  return q.includes(v.slice(0, 4)) ? v : null;
}

/** P3: the figure is read by code from the quote's words; the model's figure must match. */
function readMoney(value: unknown, quote: string): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER / 100) return null;
  const paise = Math.round(n * 100);
  if (Math.abs(paise - n * 100) > 1e-6) return null;
  const tokens = quote.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j <= Math.min(tokens.length, i + 8); j += 1) {
      const r = normalizeAmount(tokens.slice(i, j).join(' '));
      if (r.ok && Math.round(r.value * 100) === paise) return n;
    }
  }
  return null;
}

/** Ajay rule 1, yes/no words exactly as signed. */
const NO_WORDS = ['नहीं', 'nahi', 'nahin', 'koi nahi', 'no'];
const YES_WORDS = ['हाँ', 'haan', 'ji haan', 'yes'];

function hasWord(folded: string, word: string): boolean {
  const w = word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}])${w}(?![\\p{L}\\p{M}])`, 'u').test(folded);
}

/**
 * Yes/no from the quote. The signed words decide when only one side's words
 * are present; both sides, or a "not known" shape the code cannot rule out
 * (pata/maloom/malum/पता/मालूम next to a no-word: T-671's forms are not in
 * code yet), give no fact. English prose with none of the words: the model's
 * reading of the quote stands.
 */
function readYesNo(value: unknown, quote: string): 'yes' | 'no' | null {
  if (typeof value !== 'string') return null;
  const v = fold(value);
  if (v !== 'yes' && v !== 'no') return null;
  const q = fold(quote);
  const saysNo = NO_WORDS.some((w) => hasWord(q, w));
  const saysYes = YES_WORDS.some((w) => hasWord(q, w));
  if (saysNo && saysYes) return null;
  if (saysNo && /(?<![\p{L}\p{M}])(?:pata|maloom|malum|पता|मालूम)(?![\p{L}\p{M}])/u.test(q)) {
    return null;
  }
  if (saysNo) return v === 'no' ? 'no' : null;
  if (saysYes) return v === 'yes' ? 'yes' : null;
  return v;
}

function readChoice(item: ChecklistItem, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = fold(value);
  const i = item.options.findIndex((o) => fold(o) === v);
  if (i >= 0) return item.options[i];
  const j = (item.optionIds ?? []).findIndex((id) => fold(id) === v);
  return j >= 0 ? item.options[j] : null;
}

/** A name or place: carried over as given. With a Latin quote, the name is in it. */
function readName(spec: FieldSpec, value: unknown, quote: string): string | null {
  const s = englishText(value, LIST_ITEM_MAX);
  if (s === null) return null;
  const name = spec.policeStation ? stripStationMarkerOnce(s) : s;
  if (name === '' || !digitsFromQuote(name, quote)) return null;
  if (!DEVANAGARI.test(quote) && !fold(quote).includes(fold(name))) return null;
  return name;
}

function readValue(
  spec: FieldSpec,
  value: unknown,
  quote: string,
  today?: string,
): string | string[] | number | null {
  const { item } = spec;
  if (spec.type === 'list') {
    if (!Array.isArray(value) || value.length === 0 || value.length > LIST_MAX_ITEMS) return null;
    const out: string[] = [];
    for (const raw of value) {
      const s = item.kind === 'choices' ? readChoice(item, raw) : englishText(raw, LIST_ITEM_MAX);
      if (s === null || !digitsFromQuote(s, quote)) return null;
      if (!out.includes(s)) out.push(s);
    }
    return out;
  }
  switch (spec.type) {
    case 'date':
      return readDate(value, quote, item.key, today);
    case 'money':
      return readMoney(value, quote);
    case 'choice':
      if (spec.yesNo) {
        const yn = readYesNo(value, quote);
        return yn === null ? null : readChoice(item, yn);
      }
      return readChoice(item, value);
    case 'name':
      return readName(spec, value, quote);
    default: {
      if (item.kind === 'number') {
        const raw = typeof value === 'number' ? String(value) : value;
        const s = typeof raw === 'string' ? devanagariToArabic(raw).trim() : '';
        return /^\d{1,12}$/.test(s) && digitsFromQuote(s, quote) ? s : null;
      }
      const s = englishText(value, TEXT_MAX);
      return s !== null && digitsFromQuote(s, quote) ? s : null;
    }
  }
}

// ── The answer ──────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sameValue(a: LedgerCandidate['value'], b: LedgerCandidate['value']): boolean {
  const norm = (v: LedgerCandidate['value']): string =>
    Array.isArray(v)
      ? JSON.stringify(v.map((s) => fold(s)).sort())
      : typeof v === 'string'
        ? fold(v)
        : String(v);
  return norm(a) === norm(b);
}

/**
 * The model's parsed JSON → ExtractResult. Every value is checked by code;
 * anything that fails is no fact. `parsed` is whatever JSON.parse gave.
 */
export function validateExtraction(parsed: unknown, ctx: ValidateContext): ValidateOutcome {
  const dropped: Partial<Record<DropReason, number>> = {};
  const drop = (r: DropReason): void => {
    dropped[r] = (dropped[r] ?? 0) + 1;
  };
  const result: ExtractResult = { candidates: [], conflicts: [], nonAnswers: [], unresolved: [] };
  if (!isObj(parsed)) {
    drop('not_json');
    return { result, dropped };
  }

  const specs = fieldSpecs(ctx.checklist);
  const unresolved = new Set<string>();
  const nonAnswers: NonAnswer[] = [];
  const valid: LedgerCandidate[] = [];

  /** The source text an entry names, with the keys that answer was asked for. */
  const sourceOf = (
    e: Obj,
  ): {
    kind: 'description' | 'answer';
    turn: number;
    text: string;
    asked: string[] | null;
  } | null => {
    if (e.source === 'description') {
      return { kind: 'description', turn: 0, text: ctx.description, asked: null };
    }
    if (e.source !== 'answer' || typeof e.turn !== 'number') return null;
    const a = ctx.answers.find((x) => x.turn === e.turn);
    return a ? { kind: 'answer', turn: a.turn, text: a.text, asked: a.askedKeys } : null;
  };

  /** Common checks: key, source, quote. Null when dropped. */
  const locate = (e: unknown) => {
    if (!isObj(e) || typeof e.key !== 'string') {
      drop('bad_entry');
      return null;
    }
    const spec = specs.get(e.key);
    if (!spec) {
      drop('not_on_list');
      return null;
    }
    const src = sourceOf(e);
    if (!src) {
      drop('no_source');
      return null;
    }
    if (typeof e.quote !== 'string' || e.quote.trim() === '') {
      drop('no_quote');
      return null;
    }
    if (e.quote.normalize('NFC').trim().length > QUOTE_MAX) {
      drop('quote_too_long');
      return null;
    }
    const quote = findQuote(src.text, e.quote);
    if (quote === null) {
      drop('span_not_found');
      return null;
    }
    return { e, spec, src, quote };
  };

  /** Rule 4: kept for the key it was given for; an answer counts only for its asked keys. */
  const addNonAnswer = (spec: FieldSpec, src: { asked: string[] | null }, quote: string): void => {
    if (src.asked !== null && !src.asked.includes(spec.item.key)) {
      drop('non_answer_not_asked');
      return;
    }
    drop('non_answer');
    if (!nonAnswers.some((n) => n.key === spec.item.key && n.quote === quote)) {
      nonAnswers.push({ key: spec.item.key, quote });
    }
  };

  // Facts.
  for (const raw of Array.isArray(parsed.facts) ? parsed.facts : []) {
    const hit = locate(raw);
    if (!hit) continue;
    const { e, spec, src, quote } = hit;
    if (src.kind === 'description' && !spec.item.modelReadable) {
      // v2's rule: the court and the always-asked dates are never read from the description.
      drop('not_model_readable');
      continue;
    }
    if (
      isNonAnswerFor(spec, quote) ||
      (typeof e.value === 'string' && isNonAnswerFor(spec, e.value))
    ) {
      addNonAnswer(spec, src, quote);
      continue;
    }
    const c = e.confidence;
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) {
      drop('bad_confidence');
      continue;
    }
    if (c < Math.max(ASK_BELOW_CONFIDENCE, CONFIDENCE_FLOORS[spec.factType] ?? 0)) {
      drop('low_confidence');
      unresolved.add(spec.item.key);
      continue;
    }
    const value = readValue(spec, e.value, quote, ctx.today);
    if (value === null) {
      drop('bad_value');
      unresolved.add(spec.item.key);
      continue;
    }
    valid.push({
      key: spec.item.key,
      value,
      type: spec.type,
      source: { kind: src.kind, turn: src.turn, quote },
      confidence: c,
    });
  }

  // Non-answers the model named: only what code also reads as one.
  for (const raw of Array.isArray(parsed.non_answers) ? parsed.non_answers : []) {
    const hit = locate(raw);
    if (!hit) continue;
    if (isNonAnswerFor(hit.spec, hit.quote)) addNonAnswer(hit.spec, hit.src, hit.quote);
    else {
      drop('not_a_non_answer');
      unresolved.add(hit.spec.item.key);
    }
  }

  // Keys the model could not read.
  for (const k of Array.isArray(parsed.unresolved) ? parsed.unresolved : []) {
    if (typeof k === 'string' && specs.has(k)) unresolved.add(k);
  }

  // One value per key; two different values are a conflict, never a guess.
  const byKey = new Map<string, LedgerCandidate[]>();
  for (const c of valid) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  for (const [key, list] of byKey) {
    const distinct: LedgerCandidate[] = [];
    for (const c of list) {
      const same = distinct.findIndex((d) => sameValue(d.value, c.value));
      if (same < 0) distinct.push(c);
      else if (c.confidence > distinct[same].confidence) distinct[same] = c;
    }
    if (distinct.length === 1) result.candidates.push(distinct[0]);
    else result.conflicts.push({ key, values: distinct });
    unresolved.delete(key);
  }

  result.nonAnswers = nonAnswers;
  for (const n of nonAnswers) unresolved.delete(n.key);
  result.unresolved = [...unresolved];
  return { result, dropped };
}
