/**
 * The brief (T-105, ADR-021 sections 3.2 to 3.4).
 *
 * One shape for every document: the kind of document, the court, the parties,
 * the facts, the dates with what each is the date of, the numbers, what is
 * asked for, and what is still unknown. The user confirms it before anything
 * is drafted.
 *
 * This file has no I/O: no model call, no database, no logging. It builds the
 * checklist from a rule pack, checks what the model read against the user's
 * own words, and works out what is still unknown and whether the brief can be
 * confirmed.
 *
 * LEGAL CONTENT: the rules here are Ajay's, signed in T-127
 * (`handoff/design/T-127-one-flow-rules-and-prompts.md`, sections 2, 6 and 7).
 * The lists are in `src/config/intake/`. Do not change either without his
 * sign-off.
 *
 * Privacy: nothing here logs. Reasons for dropping a value carry ids only.
 */
import courtDocuments from '../config/intake/court-documents.json';
import dateMeanings from '../config/intake/date-meanings.json';

import {
  isCustodyChoice,
  needsNotInCustodyWarning,
  REGULAR_BAIL_NOT_IN_CUSTODY_WARNING,
} from './bail-guard';
import { datesInText, iso, isOwnWords, normalise } from './intake-text';
import type { RulePack, RulePackFact } from './rule-pack.service';

// ── Shapes ──────────────────────────────────────────────────────────────────

export type BriefPart = 'parties' | 'facts' | 'dates' | 'numbers' | 'relief';

export type ValueKind =
  | 'text'
  | 'narrative'
  | 'date'
  | 'number'
  | 'amount'
  | 'choice'
  | 'choices'
  | 'list';

export interface ChecklistItem {
  key: string;
  label: string;
  part: BriefPart;
  kind: ValueKind;
  required: boolean;
  /** Allowed values for `choice` and `choices`. */
  options: string[];
  /** False when the model may never read this from the description. The user enters it. */
  modelReadable: boolean;
  /** True for the name of a party. On a court document these must be given to confirm. */
  partyName: boolean;
  /** For a date: the kind of date it is (T-127, section 6.3), or null when it is always asked. */
  dateKind: string | null;
}

export type ValueSource = 'description' | 'user';

export interface BriefItem {
  key: string;
  part: BriefPart;
  label: string;
  kind: ValueKind;
  required: boolean;
  options: string[];
  value: string | string[] | null;
  source: ValueSource | null;
  /** The user's words a value was read from. Only for values read from the description. */
  quote?: string;
  /**
   * True for a value read from the description: the user is asked to check it.
   * Also true on the custody field of a regular bail with the client not in
   * custody (T-150, Rule B), with `note` saying why.
   */
  please_check: boolean;
  /** Ajay's line shown with the "Please check" mark, when there is one (T-150, Rule B). */
  note?: string;
  /**
   * True for an empty fact whose earlier answer an edited description left
   * unclear (T-150, Rule A, `cleared`). It is asked again and shows its blank,
   * even when it is not required.
   */
  reask?: boolean;
  /** For a date: what it is the date of, as shown to the user. */
  meaning?: string;
  /** The blank the draft will show while this is not given. */
  placeholder: string;
  party_name: boolean;
}

export interface BriefCourt {
  state: string | null;
  court_type: string | null;
  court: string | null;
}

export interface Brief {
  kind: { id: string | null; name: string; court_document: boolean };
  /** Never filled by the model. The user chooses it from the courts data. */
  court: BriefCourt;
  items: BriefItem[];
  /**
   * Dates the description states that are not placed under any fact. `meaning`
   * is what the user's words say the date is the date of, when they say it, for
   * example "Date of arrest" on a document that has no such fact. With no
   * meaning the user is asked what it is the date of.
   */
  loose_dates: LooseDate[];
  /** Values that belong to no item of this kind of document. Kept so that a change of kind loses nothing. */
  unplaced: Array<{ label: string; value: string | string[] }>;
  still_unknown: Array<{ key: string; label: string; placeholder: string }>;
  can_confirm: boolean;
  confirm_blockers: Array<'court' | 'parties'>;
  /** The line shown under Confirm when it is off (T-127, section 7.2). */
  confirm_message: string | null;
}

export interface LooseDate {
  value: string;
  kind: string | null;
  meaning: string | null;
}

export interface BriefQuestion {
  key: string;
  question: string;
  round: 1 | 2;
  label: string;
  kind: ValueKind;
  options: string[];
}

export const QUESTION_LIMITS = { perRound: 5, rounds: 2 } as const;

const TEXT_MAX = 500;
const NARRATIVE_MAX = 6000;
const LIST_MAX = 30;

// ── Which packs are court documents (T-127, section 2.1) ────────────────────

const NOT_COURT = new Set<string>(courtDocuments.not_court_documents);

/** A pack is a court document unless Ajay has listed it as not one. */
export function isCourtDocument(packId: string): boolean {
  return !NOT_COURT.has(packId);
}

// ── Kinds of date (T-127, section 6) ────────────────────────────────────────

interface DateKind {
  id: string;
  label: string;
  subject: string[];
  tie?: string[];
  facts: string[];
}

const DATE_KINDS = dateMeanings.kinds as DateKind[];
const DATE_KIND_OF_FACT = new Map<string, DateKind>();
for (const kind of DATE_KINDS) for (const fact of kind.facts) DATE_KIND_OF_FACT.set(fact, kind);
const DATE_KIND_BY_ID = new Map(DATE_KINDS.map((k) => [k.id, k]));
const ALWAYS_ASKED_DATES = new Set<string>(dateMeanings.always_asked.facts);
const NOT_A_DATE = new Set<string>(dateMeanings.not_a_date.facts);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Latin-script cues match whole words only. Other scripts match as written. */
function hasCue(normText: string, cue: string): boolean {
  const c = normalise(cue);
  if (c.length === 0) return false;
  if (/^[\x20-\x7e]+$/.test(c)) {
    const body = escapeRegExp(c).replace(/ /g, ' +');
    return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`).test(normText);
  }
  return normText.includes(c);
}

/** True when the words carry a subject cue of this kind and, where it has them, a tie cue. */
export function carriesDateKind(words: string, kindId: string): boolean {
  const kind = DATE_KIND_BY_ID.get(kindId);
  if (!kind) return false;
  const text = normalise(words);
  if (!kind.subject.some((cue) => hasCue(text, cue))) return false;
  if (kind.tie && kind.tie.length > 0 && !kind.tie.some((cue) => hasCue(text, cue))) return false;
  return true;
}

/** Every kind of date these words carry a cue for. */
export function dateKindsIn(words: string): string[] {
  return DATE_KINDS.filter((k) => carriesDateKind(words, k.id)).map((k) => k.id);
}

export function dateKindLabel(kindId: string): string | null {
  return DATE_KIND_BY_ID.get(kindId)?.label ?? null;
}

export interface StatedDate {
  value: string;
  /** The kind of date the user's words give it, or null when they give none or more than one. */
  kind: string | null;
  /** The user's words around the date: one clause, holding this one date. */
  words: string;
}

/**
 * The dates a text states, read by code, each with the words around it.
 *
 * The text is cut into clauses. A clause that holds exactly one date and the
 * cues of exactly one kind gives that date its meaning. This is the same test
 * as T-127, section 6.2, with one more limit: no other kind's cue at all.
 * Anything else has no meaning here and is asked.
 */
export function statedDates(text: string): StatedDate[] {
  const clauses = text
    // A full stop ends a clause only before a letter, so "No. 124" and "15.03.2026" stay whole.
    // A comma ends one unless a year follows, so "15th March, 2026" stays whole.
    // "and", "but" and their Hindi forms end one, so "arrested on … and is in custody" is two.
    .split(
      /(?:;|\n|\u0964)+|\.\s+(?=[\u0900-\u097FA-Za-z])|,(?!\s*\d{4}(?!\d))\s*|\s+(?:and|but|aur|\u0914\u0930|\u0924\u0925\u093E)\s+/,
    )
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const byDate = new Map<string, StatedDate>();
  const twice = new Set<string>();
  for (const clause of clauses) {
    const dates = datesInText(clause);
    if (dates.length === 0) continue;
    const kinds = dates.length === 1 ? dateKindsIn(clause) : [];
    const kind = kinds.length === 1 ? kinds[0] : null;
    for (const value of dates) {
      const earlier = byDate.get(value);
      if (earlier && earlier.kind !== kind) twice.add(value);
      if (!earlier) byDate.set(value, { value, kind, words: clause });
    }
  }
  // Dates the splitter missed (a date cut in two by punctuation) still show, with no meaning.
  for (const value of datesInText(text)) {
    if (!byDate.has(value)) byDate.set(value, { value, kind: null, words: '' });
  }
  // The same date under two meanings in two places: the code does not choose.
  for (const value of twice) {
    const d = byDate.get(value) as StatedDate;
    byDate.set(value, { ...d, kind: null });
  }
  return [...byDate.values()].sort((a, b) => a.value.localeCompare(b.value));
}

// ── The checklist ───────────────────────────────────────────────────────────

/** Facts that name the court the document is filed in. The court picker covers them. */
const FORUM_FACTS = new Set([
  'court',
  'court_designation',
  'court_name',
  'court_type',
  'state',
  'state_of_filing',
  'district',
  'forum',
  'jurisdiction_court',
]);

/** ADR-019 rule 4.1.2: court, district, police station and the like are never read by the model. */
const COURT_LIKE = /(^|_)(court|courts|district|police_station|thana|bench|tribunal|forum)(_|$)/;

const PARTY_ROLE =
  /(^|[._])(applicant|petitioner|respondent|plaintiff|defendant|complainant|accused|appellant|opposite_party|opp_party|non_applicant|sender|recipient|noticee|addressee|landlord|tenant|lessor|lessee|licensor|licensee|deponent|client|husband|wife|buyer|seller|vendor|purchaser|vendee|employer|employee|donor|donee|testator|executor|beneficiary|mortgagor|mortgagee|borrower|lender|principal|attorney|agent|franchisor|franchisee|disclosing_party|receiving_party|first_party|second_party|party|parties|claimant|deceased|minor|guardian|detenu|company|promoter|allottee|drawer|payee|creditor|debtor|founder|founders|shareholder|shareholders|subscriber|subscribers|owner|developer|distributor|supplier|service_provider|releasor|releasee|informant|victim|convict|appointee)\d*([._]|$)/;

const RELIEF = /(^|[._])(relief|reliefs|prayer|prayers)([._]|$)/;

/** Details of a party, such as an age or an address. They sit with the parties. */
const PARTY_DETAIL =
  /(^|[._])(father|mother|spouse|parentage|address|age|occupation|residence)([._]|$)/;

const NUMBERS =
  /(^|_)(number|no|sections|section|offences|offence)(_|$)|(amount|value|fee|fees|rent|deposit|price|consideration|ctc|salary|capital|compensation|arrears)$/;

/** Taken from the request, never asked: the language of the document. */
const NOT_ASKED = new Set(['language', 'document_language']);

const NOT_A_PARTY_NAME =
  /(father|mother|husband|parent|guardian|bank|firm|witness|advocate)_?name$/;

const MULTI_TYPES = new Set([
  'multi_select_search',
  'checkbox_group',
  'checkbox_multi',
  'multi-select',
  'multiselect',
  'multi_select',
  'enum_set',
  'array',
  'list',
]);

const YES_NO = ['Yes', 'No'];

function valueKind(fact: RulePackFact): { kind: ValueKind; options: string[] } {
  const type = (fact.type ?? '').toLowerCase();
  const namedAsDate = DATE_KIND_OF_FACT.has(fact.name) || ALWAYS_ASKED_DATES.has(fact.name);
  if ((type === 'date' || namedAsDate) && !NOT_A_DATE.has(fact.name)) {
    return { kind: 'date', options: [] };
  }
  if (fact.options.length > 0) {
    return { kind: MULTI_TYPES.has(type) ? 'choices' : 'choice', options: [...fact.options] };
  }
  if (type === 'boolean' || type === 'bool' || type === 'checkbox') {
    return { kind: 'choice', options: YES_NO };
  }
  if (MULTI_TYPES.has(type)) return { kind: 'list', options: [] };
  if (type === 'textarea') return { kind: 'narrative', options: [] };
  if (['currency', 'money', 'rupees', 'inr'].includes(type)) return { kind: 'amount', options: [] };
  if (['number', 'integer', 'float', 'decimal'].includes(type)) {
    return { kind: 'number', options: [] };
  }
  return { kind: 'text', options: [] };
}

function partOf(key: string, name: string, kind: ValueKind): BriefPart {
  if (kind === 'date') return 'dates';
  if (RELIEF.test(name)) return 'relief';
  if (PARTY_DETAIL.test(name)) return 'parties';
  if (kind === 'amount' || NUMBERS.test(name)) return 'numbers';
  // A long text about a party, such as the defendant's response, is a fact.
  if (kind !== 'narrative' && PARTY_ROLE.test(key)) return 'parties';
  if (kind === 'number') return 'numbers';
  return 'facts';
}

/** The name of a party: `applicant_name`, `sender.name`, or a bare role such as `applicant`. */
function isPartyName(name: string, kind: ValueKind, part: BriefPart): boolean {
  if (part !== 'parties' || kind !== 'text') return false;
  if (/(^|_)name$/.test(name)) return !NOT_A_PARTY_NAME.test(name);
  // A bare role, with nothing after it: the fact is the party.
  return PARTY_ROLE.test(name) && !name.includes('_');
}

function placeholderFor(label: string): string {
  // Lower case, except for words written in capitals such as FIR.
  const lowered = label
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (/^[A-Z0-9./-]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
  return `[To be confirmed: ${lowered}]`;
}

export const FIXED_KEYS = {
  firstParty: 'fixed.first_party',
  otherParty: 'fixed.other_party',
  facts: 'fixed.facts',
  relief: 'fixed.relief',
} as const;

const FIXED_LABELS = {
  firstParty: 'The person the document is for',
  otherParty: 'The person or authority it is against or addressed to',
  facts: 'What happened, in order',
  /** For an agreement, a deed or an affidavit, where nothing "happened". */
  anythingElse: 'Anything else the document should say',
  relief: 'What is asked for',
} as const;

function fixedItem(
  key: string,
  label: string,
  part: BriefPart,
  kind: ValueKind,
  required: boolean,
): ChecklistItem {
  return {
    key,
    label,
    part,
    kind,
    required,
    options: [],
    modelReadable: true,
    partyName: part === 'parties',
    dateKind: null,
  };
}

/**
 * The facts a document needs: the pack's facts, then the fixed items the pack
 * does not already cover (T-127, section 2.2). On a court document the facts
 * that name the court are left out, because the court picker covers them.
 */
export function buildChecklist(pack: RulePack): ChecklistItem[] {
  const court = isCourtDocument(pack.id);
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();

  // Two date facts of one kind in a pack: the code cannot tell which a date
  // belongs to, so neither is read from the description (T-127, section 6.5).
  const perKind = new Map<string, number>();
  for (const fact of pack.facts) {
    const kind = DATE_KIND_OF_FACT.get(fact.name);
    if (kind) perKind.set(kind.id, (perKind.get(kind.id) ?? 0) + 1);
  }

  for (const fact of pack.facts) {
    if (seen.has(fact.key)) continue;
    seen.add(fact.key);
    if (court && FORUM_FACTS.has(fact.name)) continue;
    if (NOT_ASKED.has(fact.name)) continue;

    const { kind, options } = valueKind(fact);
    const part = partOf(fact.key, fact.name, kind);
    let dateKind: string | null = null;
    let modelReadable = true;
    if (kind === 'date') {
      const meaning = DATE_KIND_OF_FACT.get(fact.name);
      if (meaning && (perKind.get(meaning.id) ?? 0) === 1) dateKind = meaning.id;
      // A date with no kind, or one of two of the same kind, is always asked.
      modelReadable = dateKind !== null;
    } else if (COURT_LIKE.test(fact.name) && kind !== 'amount' && kind !== 'number') {
      modelReadable = false;
    }

    items.push({
      key: fact.key,
      label: fact.label,
      part,
      kind,
      required: fact.required,
      options,
      modelReadable,
      partyName: isPartyName(fact.name, kind, part),
      dateKind,
    });
  }

  if (!items.some((i) => i.part === 'parties')) {
    items.push(fixedItem(FIXED_KEYS.firstParty, FIXED_LABELS.firstParty, 'parties', 'text', true));
    items.push(fixedItem(FIXED_KEYS.otherParty, FIXED_LABELS.otherParty, 'parties', 'text', court));
  }
  // A court document or a notice tells a story and asks for something. An
  // agreement, a deed or an affidavit does not (T-127, section 2.2).
  const tellsAStory = court || pack.id.startsWith('legal_notice');
  if (!items.some((i) => i.part === 'facts' && i.kind === 'narrative')) {
    items.push(
      tellsAStory
        ? fixedItem(FIXED_KEYS.facts, FIXED_LABELS.facts, 'facts', 'narrative', true)
        : fixedItem(FIXED_KEYS.facts, FIXED_LABELS.anythingElse, 'facts', 'narrative', false),
    );
  }
  if (tellsAStory && !items.some((i) => i.part === 'relief') && pack.prayerTemplate === null) {
    items.push(fixedItem(FIXED_KEYS.relief, FIXED_LABELS.relief, 'relief', 'narrative', false));
  }
  return items;
}

/** The checklist for a request with no rule pack: the four fixed items. */
export function fixedChecklist(courtDocument: boolean): ChecklistItem[] {
  return [
    fixedItem(FIXED_KEYS.firstParty, FIXED_LABELS.firstParty, 'parties', 'text', true),
    fixedItem(FIXED_KEYS.otherParty, FIXED_LABELS.otherParty, 'parties', 'text', courtDocument),
    fixedItem(FIXED_KEYS.facts, FIXED_LABELS.facts, 'facts', 'narrative', true),
    fixedItem(FIXED_KEYS.relief, FIXED_LABELS.relief, 'relief', 'narrative', true),
  ];
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function modelKind(kind: ValueKind): string {
  if (kind === 'choices') return 'choice, one or more';
  return kind;
}

/** The lines given to the Reception model. Items the model may not read are left out. */
export function checklistLines(items: ChecklistItem[]): string[] {
  return items
    .filter((i) => i.modelReadable)
    .map((i) => {
      const meaning = i.kind === 'date' && i.dateKind ? dateKindLabel(i.dateKind) : null;
      const parts = [
        i.key,
        meaning ?? oneLine(i.label, 120),
        modelKind(i.kind),
        i.required ? 'required' : 'optional',
      ];
      if (i.options.length > 0) parts.push(i.options.map((o) => oneLine(o, 60)).join('; '));
      return parts.join(' | ');
    });
}

// ── Checking what the model read (T-127, sections 2.3 and 6.2) ───────────────

export interface ReadValue {
  value: string | string[];
  quote: string;
}

export interface ReadCheck {
  values: Map<string, ReadValue>;
  /** Why a value was not kept. Ids and reasons only, never the user's text. */
  dropped: Array<{ key: string; reason: string }>;
}

type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function wholeIn(normQuote: string, value: string): boolean {
  const nv = normalise(value);
  if (!nv) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(nv)}([^a-z0-9]|$)`).test(normQuote);
}

function matchOption(options: string[], value: string): string | null {
  const nv = normalise(value);
  return options.find((o) => normalise(o) === nv) ?? null;
}

function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return iso(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10)) !== null;
}

function isNumber(v: string): boolean {
  const digits = v.replace(/[^0-9.]/g, '');
  return digits !== '' && Number.isFinite(Number(digits));
}

function checkPlain(
  item: ChecklistItem,
  raw: unknown,
  quote: string,
  normText: string,
): Checked<string | string[]> {
  const normQuote = normalise(quote);
  let value = raw;
  // Models often send numbers as JSON numbers; read them as the digits written.
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);

  if (item.kind === 'choices' || item.kind === 'list') {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
    if (!list || list.length === 0 || list.length > LIST_MAX) return fail('type');
    if (!list.every((v) => typeof v === 'string' && v.trim() !== '')) return fail('type');
    const strings = (list as string[]).map((v) => v.trim());
    if (item.kind === 'choices') {
      const picked = strings.map((v) => matchOption(item.options, v));
      if (picked.some((p) => p === null)) return fail('option');
      return { ok: true, value: [...new Set(picked as string[])] };
    }
    // A free list, such as section numbers: each value must stand in the quote as written.
    if (!strings.every((v) => wholeIn(normQuote, v))) return fail('not_in_quote');
    return { ok: true, value: strings };
  }

  if (typeof value !== 'string' || value.trim() === '') return fail('type');
  const v = value.trim();

  switch (item.kind) {
    case 'choice': {
      const picked = matchOption(item.options, v);
      return picked === null ? fail('option') : { ok: true, value: picked };
    }
    case 'number':
    case 'amount': {
      if (!isNumber(v)) return fail('type');
      // The number must stand whole in the quote: "5" does not match "15".
      const want = v.replace(/[^0-9.]/g, '').replace(/\.0+$/, '');
      const inQuote = (quote.replace(/(\d),(?=\d)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map((n) =>
        n.replace(/\.0+$/, ''),
      );
      return inQuote.includes(want) ? { ok: true, value: v } : fail('not_in_quote');
    }
    case 'text':
    case 'narrative': {
      if (v.length > (item.kind === 'text' ? TEXT_MAX : NARRATIVE_MAX)) return fail('length');
      if (!isOwnWords(v, normText)) return fail('not_own_words');
      // The words must sit inside this fact's own quote, so that a name from
      // another sentence cannot land under the wrong fact (ADR-019 rule 4.1.3).
      if (!isOwnWords(v, normQuote)) return fail('not_in_quote');
      return { ok: true, value: v };
    }
    default:
      return fail('type');
  }
}

/**
 * The checks on a date (T-127, section 6.2). `usedQuotes` holds, for each date
 * already placed, the quotes it was placed from.
 */
function checkDate(
  item: ChecklistItem,
  raw: unknown,
  quote: string,
  otherKinds: string[],
  usedQuotes: Map<string, Set<string>>,
): Checked<string> {
  if (typeof raw !== 'string' || !isIsoDate(raw.trim())) return fail('type');
  const value = raw.trim();
  if (item.dateKind === null) return fail('always_asked');
  const inQuote = datesInText(quote);
  if (inQuote.length === 0) return fail('not_in_quote');
  if (inQuote.length > 1) return fail('two_dates_in_quote');
  if (inQuote[0] !== value) return fail('not_in_quote');
  if (!carriesDateKind(quote, item.dateKind)) return fail('no_meaning_in_quote');
  if (otherKinds.some((k) => carriesDateKind(quote, k))) return fail('two_meanings_in_quote');
  if (usedQuotes.get(value)?.has(normalise(quote))) return fail('date_used_twice');
  return { ok: true, value };
}

/**
 * Keep only what the user's own words support. `text` is the description. The
 * model's answer is never trusted on its own.
 */
export function checkRead(
  checklist: ChecklistItem[],
  text: string,
  parsed: Record<string, unknown> | null,
): ReadCheck {
  const result: ReadCheck = { values: new Map(), dropped: [] };
  const raw = parsed && Array.isArray(parsed.read) ? parsed.read : [];
  const byKey = new Map(checklist.map((i) => [i.key, i]));
  const normText = normalise(text);
  const drop = (key: string, reason: string): void => {
    if (!result.dropped.some((d) => d.key === key)) result.dropped.push({ key, reason });
  };

  // Two different values for one fact: neither is kept (ADR-019 rule 4.1.5).
  const conflicted = new Set<string>(
    parsed && Array.isArray(parsed.conflicts)
      ? parsed.conflicts.filter((c): c is string => typeof c === 'string')
      : [],
  );
  const firstValue = new Map<string, string>();
  for (const entry of raw) {
    const e = (entry ?? {}) as { id?: unknown; value?: unknown };
    if (typeof e.id !== 'string') continue;
    const asText = JSON.stringify(e.value);
    const earlier = firstValue.get(e.id);
    if (earlier !== undefined && earlier !== asText) conflicted.add(e.id);
    firstValue.set(e.id, asText);
  }

  const kindsOnChecklist = [
    ...new Set(checklist.map((i) => i.dateKind).filter((k): k is string => k !== null)),
  ];
  const usedQuotes = new Map<string, Set<string>>();

  for (const entry of raw) {
    const e = (entry ?? {}) as { id?: unknown; value?: unknown; quote?: unknown };
    if (typeof e.id !== 'string') continue;
    const key = e.id;
    if (result.values.has(key)) continue;
    const item = byKey.get(key);
    if (!item) {
      // The id is the model's own text, so it is not echoed.
      drop('(not on the checklist)', 'not_on_checklist');
      continue;
    }
    if (conflicted.has(key)) {
      drop(key, 'conflict');
      continue;
    }
    if (!item.modelReadable) {
      drop(key, 'not_readable');
      continue;
    }
    const quote = typeof e.quote === 'string' ? e.quote : '';
    if (normalise(quote).length < 2 || !normText.includes(normalise(quote))) {
      drop(key, 'no_matching_quote');
      continue;
    }

    if (item.kind === 'date') {
      const others = kindsOnChecklist.filter((k) => k !== item.dateKind);
      const checked = checkDate(item, e.value, quote, others, usedQuotes);
      if (!checked.ok) {
        drop(key, checked.reason);
        continue;
      }
      const quotes = usedQuotes.get(checked.value) ?? new Set<string>();
      quotes.add(normalise(quote));
      usedQuotes.set(checked.value, quotes);
      result.values.set(key, { value: checked.value, quote });
      continue;
    }

    const checked = checkPlain(item, e.value, quote, normText);
    if (!checked.ok) {
      drop(key, checked.reason);
      continue;
    }
    result.values.set(key, { value: checked.value, quote });
  }
  for (const key of conflicted) {
    if (byKey.has(key) && !result.values.has(key)) drop(key, 'conflict');
  }
  return result;
}

/**
 * Dates the model did not return, or returned with a quote that failed, are
 * read by code under the same rule: one clause, one date, one kind of cue. A
 * date is placed only on the one fact of that kind on the checklist, and only
 * when that fact is still empty and the date is not placed anywhere else.
 */
export function datesReadByCode(
  checklist: ChecklistItem[],
  text: string,
  already: Map<string, ReadValue>,
): Map<string, ReadValue> {
  const out = new Map<string, ReadValue>();
  const placedDates = new Set<string>();
  for (const [key, v] of already) {
    const item = checklist.find((i) => i.key === key);
    if (item?.kind === 'date' && typeof v.value === 'string') placedDates.add(v.value);
  }
  for (const stated of statedDates(text)) {
    if (stated.kind === null || stated.words === '' || placedDates.has(stated.value)) continue;
    const targets = checklist.filter((i) => i.modelReadable && i.dateKind === stated.kind);
    if (targets.length !== 1) continue;
    const [target] = targets;
    if (already.has(target.key) || out.has(target.key)) continue;
    out.set(target.key, { value: stated.value, quote: stated.words });
    placedDates.add(stated.value);
  }
  return out;
}

// ── Values the user typed ───────────────────────────────────────────────────

/** Null when the value is acceptable for this item, else a short reason. Never echoes the value. */
export function checkUserValue(item: ChecklistItem, value: unknown): string | null {
  if (item.kind === 'choices' || item.kind === 'list') {
    if (!Array.isArray(value) || value.length === 0) return 'Give at least one value.';
    if (value.length > LIST_MAX) return `Give at most ${LIST_MAX} values.`;
    const allText = value.every(
      (v) => typeof v === 'string' && v.trim() !== '' && v.length <= TEXT_MAX,
    );
    if (!allText) return 'Each value must be text.';
    if (item.kind === 'choices') {
      const allListed = value.every((v) => matchOption(item.options, v as string) !== null);
      if (!allListed) return 'Choose from the list.';
    }
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') return 'This cannot be empty.';
  const v = value.trim();
  switch (item.kind) {
    case 'date':
      return isIsoDate(v) ? null : 'Give the date as YYYY-MM-DD.';
    case 'choice':
      return matchOption(item.options, v) !== null ? null : 'Choose from the list.';
    case 'number':
    case 'amount':
      return isNumber(v) ? null : 'Give a number.';
    case 'narrative':
      return v.length <= NARRATIVE_MAX ? null : `Keep this under ${NARRATIVE_MAX} characters.`;
    default:
      return v.length <= TEXT_MAX ? null : `Keep this under ${TEXT_MAX} characters.`;
  }
}

function canonical(item: ChecklistItem, value: string | string[]): string | string[] {
  if (item.kind === 'choice' && typeof value === 'string') {
    return matchOption(item.options, value) ?? value.trim();
  }
  if (item.kind === 'choices' && Array.isArray(value)) {
    return [...new Set(value.map((v) => matchOption(item.options, v) ?? v.trim()))];
  }
  return Array.isArray(value) ? value.map((v) => v.trim()) : value.trim();
}

// ── Building the brief ──────────────────────────────────────────────────────

export interface GivenValue {
  key: string;
  value: string | string[];
  source: ValueSource;
  quote?: string;
  /** Shown when the value cannot be placed after a change of kind. */
  label?: string;
  /**
   * A typed name the edited description gives differently. The value stays; it
   * is marked "Please check" (T-150, AJ-2026-10-07-T150-diff). The web app sends
   * it back on later updates so the mark is not lost; it is dropped once the
   * advocate edits that field.
   */
  please_check?: boolean;
}

export interface BuildBriefInput {
  kind: { id: string | null; name: string; court_document: boolean };
  checklist: ChecklistItem[];
  /** What was read from the description and what the user typed. A later entry for a key wins. */
  values: GivenValue[];
  court?: Partial<BriefCourt> | null;
  /** When given, the dates in it that were not placed are listed as loose dates. */
  description?: string;
  /** Extra "still unknown" lines, for a request with no pack (the model's own list). */
  extraUnknowns?: string[];
  /** Keys an edited description left unclear (T-150): marked `reask` while empty. */
  reask?: readonly string[];
}

function clean(s: unknown): string | null {
  return typeof s === 'string' && s.trim() !== ''
    ? s.replace(/\s+/g, ' ').trim().slice(0, 200)
    : null;
}

function lastSegment(key: string): string {
  const at = key.lastIndexOf('.');
  return at < 0 ? key : key.slice(at + 1);
}

function isEmpty(v: string | string[] | null): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** "Applicant Name" -> "applicant". The party as it reads after "the name of the". */
function partyLabel(label: string): string {
  const stripped = label
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(full\s+)?name\b/gi, ' ')
    .replace(/[:/]+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return stripped.length > 0 ? stripped : 'party';
}

/**
 * Put the values on the checklist and work out what is still unknown and
 * whether the brief can be confirmed (ADR-021 decision D2).
 *
 * A value whose key is not on this checklist is carried over when exactly one
 * item has the same fact name. Otherwise it is kept under `unplaced`, so a
 * change of kind loses nothing.
 */
export function buildBrief(input: BuildBriefInput): Brief {
  const byKey = new Map(input.checklist.map((i) => [i.key, i]));
  const byName = new Map<string, ChecklistItem[]>();
  for (const item of input.checklist) {
    const name = lastSegment(item.key);
    byName.set(name, [...(byName.get(name) ?? []), item]);
  }

  const placed = new Map<string, GivenValue>();
  const unplaced = new Map<string, { label: string; value: string | string[] }>();
  for (const given of input.values) {
    if (isEmpty(given.value)) continue;
    let item = byKey.get(given.key);
    if (!item && !given.key.startsWith('fixed.')) {
      const sameName = byName.get(lastSegment(given.key)) ?? [];
      if (sameName.length === 1) item = sameName[0];
    }
    if (!item || checkUserValue(item, given.value) !== null) {
      const label = clean(given.label) ?? lastSegment(given.key).replace(/_/g, ' ');
      unplaced.set(given.key, { label, value: given.value });
      continue;
    }
    unplaced.delete(given.key);
    placed.set(item.key, { ...given, key: item.key, value: canonical(item, given.value) });
  }

  const items: BriefItem[] = input.checklist.map((item) => {
    const given = placed.get(item.key);
    const kindLabel = item.kind === 'date' && item.dateKind ? dateKindLabel(item.dateKind) : null;
    const meaning = item.kind === 'date' ? (kindLabel ?? item.label) : undefined;
    // T-150, Rule B: a regular bail for a client not in custody. Warn, never block.
    const custodyWarning =
      item.kind === 'choice' &&
      isCustodyChoice(item.options) &&
      needsNotInCustodyWarning(input.kind.id, given ? given.value : null);
    return {
      key: item.key,
      part: item.part,
      label: item.label,
      kind: item.kind,
      required: item.required,
      options: item.options,
      value: given ? given.value : null,
      source: given ? given.source : null,
      ...(given && given.source === 'description' && given.quote ? { quote: given.quote } : {}),
      please_check: given?.source === 'description' || given?.please_check === true || custodyWarning,
      ...(custodyWarning ? { note: REGULAR_BAIL_NOT_IN_CUSTODY_WARNING } : {}),
      ...(!given && input.reask?.includes(item.key) ? { reask: true } : {}),
      ...(meaning !== undefined ? { meaning } : {}),
      placeholder: placeholderFor(meaning ?? item.label),
      party_name: item.partyName,
    };
  });

  const court: BriefCourt = {
    state: clean(input.court?.state),
    court_type: clean(input.court?.court_type),
    court: clean(input.court?.court),
  };

  const still_unknown = items
    .filter((i) => i.required && isEmpty(i.value))
    .map((i) => ({ key: i.key, label: i.label, placeholder: i.placeholder }));
  (input.extraUnknowns ?? []).forEach((text, idx) => {
    const label = clean(text);
    if (label) {
      still_unknown.push({ key: `unknown.${idx + 1}`, label, placeholder: placeholderFor(label) });
    }
  });

  const blockers: Brief['confirm_blockers'] = [];
  let confirm_message: string | null = null;
  if (input.kind.court_document) {
    const courtChosen = court.state !== null && court.court_type !== null && court.court !== null;
    const missingParties = items.filter((i) => i.party_name && i.required && isEmpty(i.value));
    if (!courtChosen) blockers.push('court');
    if (missingParties.length > 0) blockers.push('parties');
    // The wording is Ajay's (T-127, section 7.2).
    if (!courtChosen && missingParties.length > 0) {
      confirm_message = 'Choose the court and add the parties to continue.';
    } else if (!courtChosen) {
      confirm_message = 'Choose the court to continue.';
    } else if (missingParties.length > 0) {
      confirm_message = `Add the name of the ${partyLabel(missingParties[0].label)} to continue.`;
    }
  }

  const placedDates = new Set(
    items
      .filter((i) => i.kind === 'date' && typeof i.value === 'string')
      .map((i) => i.value as string),
  );
  const loose_dates: LooseDate[] =
    input.description === undefined
      ? []
      : statedDates(input.description)
          .filter((d) => !placedDates.has(d.value))
          .map((d) => ({
            value: d.value,
            kind: d.kind,
            meaning: d.kind ? dateKindLabel(d.kind) : null,
          }));

  return {
    kind: input.kind,
    court,
    items,
    loose_dates,
    unplaced: [...unplaced.values()],
    still_unknown,
    can_confirm: blockers.length === 0,
    confirm_blockers: blockers,
    confirm_message,
  };
}

// ── An edited description (T-150, Rule A) ───────────────────────────────────
//
// LEGAL CONTENT: the rule is Ajay's, signed in AJ-2026-10-07-T150. Signed text:
// "When the advocate edits the description, an earlier answer that the new
// description clearly contradicts is replaced by the new description's reading
// of that fact, exactly as the description gives it, and marked "Please check".
// If the new description says nothing on that fact, the earlier answer stays
// unchanged and is not marked. If the new description gives two values for that
// fact, or is not clear on it, the existing conflict rule (ADR-019 4.1.5)
// applies: nothing is guessed."

/**
 * The kinds of fact where a different value is a contradiction. A name, a
 * list or a long text told again in other words is not, so those stay as the
 * advocate typed them.
 */
const SINGLE_VALUE_KINDS = new Set<ValueKind>(['choice', 'date', 'number', 'amount']);

/**
 * A name: a party's name or any other `..._name` text fact. A typed name is
 * never replaced, but when the edited description gives a different one it is
 * marked "Please check" (AJ-2026-10-07-T150-diff). The code does not pick
 * between two names.
 */
function isNameItem(item: ChecklistItem): boolean {
  return item.kind === 'text' && (item.partyName || /(^|_)name$/.test(lastSegment(item.key)));
}

/**
 * Why a reading was dropped that means the new description gives two values
 * for the fact, or is not clear on it. The fact is then left empty and asked:
 * neither the earlier answer nor a guess is kept (ADR-019 4.1.5).
 */
const UNCLEAR_READING = new Set([
  'conflict',
  'two_dates_in_quote',
  'two_meanings_in_quote',
  'date_used_twice',
]);

function sameValue(item: ChecklistItem, a: string | string[], b: string | string[]): boolean {
  const flat = (v: string | string[]): string => {
    const c = canonical(item, v);
    const s = Array.isArray(c) ? c.join('\n') : c;
    if (item.kind === 'number' || item.kind === 'amount') {
      return s.replace(/[^0-9.]/g, '').replace(/\.0+$/, '');
    }
    return normalise(s);
  };
  return flat(a) === flat(b);
}

export interface EditedDescriptionResult {
  /** The values for `buildBrief`: the new reading, then the earlier answers that still stand. */
  values: GivenValue[];
  /** Keys whose earlier answer the new description replaced. Ids only. */
  replaced: string[];
  /**
   * Keys whose earlier answer was taken out because the new description is not
   * clear on them. They are left empty, show their blank, and must be asked
   * again: pass them to `buildQuestions` as `alsoAsk`.
   */
  cleared: string[];
  /** Keys of typed names kept as typed but marked "Please check": the description gives another name. */
  nameDiffers: string[];
}

/**
 * Rule A. `read` is what the new description gives, already checked against
 * the user's words (`checkRead` and `datesReadByCode`); `dropped` is why other
 * readings were not kept. `earlier` is what the advocate typed before the edit.
 *
 * - The new description gives a different value: the reading replaces the
 *   earlier answer. It is a description value, so it is marked "Please check".
 * - It gives two values, or is not clear: the earlier answer is taken out and
 *   nothing is put in its place.
 * - It says nothing: the earlier answer stays, unmarked.
 * - A name is never replaced. When the description gives a different name, the
 *   typed name stays and is marked "Please check".
 *
 * Only an edited description comes here (`descriptionWasEdited`). A first
 * description has no earlier answers, so it never does.
 */
export function valuesAfterEditedDescription(
  checklist: ChecklistItem[],
  read: Map<string, ReadValue>,
  dropped: Array<{ key: string; reason: string }>,
  earlier: GivenValue[],
): EditedDescriptionResult {
  const byKey = new Map(checklist.map((i) => [i.key, i]));
  const byName = new Map<string, ChecklistItem[]>();
  for (const item of checklist) {
    const name = lastSegment(item.key);
    byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  const unclear = new Set(dropped.filter((d) => UNCLEAR_READING.has(d.reason)).map((d) => d.key));

  const replaced: string[] = [];
  const cleared: string[] = [];
  const nameDiffers: string[] = [];
  const kept: GivenValue[] = [];
  for (const given of earlier) {
    // The same lookup as `buildBrief`, so a value from another kind lands where it would.
    let item = byKey.get(given.key);
    if (!item && !given.key.startsWith('fixed.')) {
      const sameName = byName.get(lastSegment(given.key)) ?? [];
      if (sameName.length === 1) item = sameName[0];
    }
    if (item && isNameItem(item) && !isEmpty(given.value)) {
      const now = read.get(item.key);
      if (now && !isEmpty(now.value) && !sameValue(item, now.value, given.value)) {
        // Keep the typed name; the advocate must look at it (AJ-2026-10-07-T150-diff).
        kept.push({ ...given, please_check: true });
        if (!nameDiffers.includes(item.key)) nameDiffers.push(item.key);
      } else {
        kept.push(given);
      }
      continue;
    }
    if (!item || !SINGLE_VALUE_KINDS.has(item.kind) || isEmpty(given.value)) {
      kept.push(given);
      continue;
    }
    const now = read.get(item.key);
    if (now) {
      if (sameValue(item, now.value, given.value)) kept.push(given);
      else if (!replaced.includes(item.key)) replaced.push(item.key);
      continue;
    }
    if (unclear.has(item.key)) {
      if (!cleared.includes(item.key)) cleared.push(item.key);
      continue;
    }
    kept.push(given);
  }

  const values: GivenValue[] = [
    ...[...read].map(([key, v]) => ({
      key,
      value: v.value,
      quote: v.quote,
      source: 'description' as const,
    })),
    // An earlier answer that still stands comes last, so it wins over the reading.
    ...kept,
  ];
  return { values, replaced, cleared, nameDiffers };
}

// ── Questions (T-127, section 2.5) ──────────────────────────────────────────

/** Ajay's order. The names of the parties come first; a party's other details come last. */
const PART_ORDER: Record<BriefPart, number> = {
  numbers: 1,
  dates: 1,
  facts: 2,
  relief: 3,
  parties: 4,
};

function cleanQuestion(q: string | undefined): string | null {
  if (typeof q !== 'string') return null;
  const flat = q.replace(/\s+/g, ' ').trim();
  return flat.length >= 5 && flat.length <= 240 ? flat : null;
}

function fallbackQuestion(item: BriefItem): string {
  const what = item.kind === 'date' && item.meaning ? item.meaning : item.label;
  return `Please give: ${what.replace(/[?.:]+\s*$/, '')}.`;
}

/**
 * One question for each required fact that is missing, in Ajay's order: the
 * names of the parties, then the numbers and dates that identify the case, then
 * the facts and the grounds, then the rest. Five a round, two rounds, no more.
 *
 * The model words the questions. It does not decide which are asked: a
 * question about a fact that is not missing, or not on the checklist, is
 * dropped, and a missing fact with no question gets one written from its label.
 */
export function buildQuestions(
  brief: Brief,
  worded: Map<string, string>,
  /** Facts to ask even when not required: an answer an edited description left unclear (T-150). */
  alsoAsk: ReadonlySet<string> = new Set(),
): BriefQuestion[] {
  const missing = brief.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (item.required || alsoAsk.has(item.key)) && isEmpty(item.value))
    .sort((a, b) => {
      // A fact an edited description left unclear comes straight after the
      // party names, so the cap never leaves it unasked (T-150).
      const rank = (item: BriefItem): number =>
        item.party_name ? 0 : alsoAsk.has(item.key) ? 0.5 : PART_ORDER[item.part];
      const pa = rank(a.item);
      const pb = rank(b.item);
      return pa - pb || a.index - b.index;
    })
    .slice(0, QUESTION_LIMITS.perRound * QUESTION_LIMITS.rounds);

  return missing.map(({ item }, i) => ({
    key: item.key,
    question: cleanQuestion(worded.get(item.key)) ?? fallbackQuestion(item),
    round: i < QUESTION_LIMITS.perRound ? 1 : 2,
    label: item.label,
    kind: item.kind,
    options: item.options,
  }));
}

/** The model's questions, by checklist key. Anything that is not text is ignored. */
export function wordedQuestions(parsed: Record<string, unknown> | null): Map<string, string> {
  const out = new Map<string, string>();
  const raw = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  for (const q of raw) {
    const e = (q ?? {}) as { id?: unknown; question?: unknown };
    if (typeof e.id === 'string' && typeof e.question === 'string' && !out.has(e.id)) {
      out.set(e.id, e.question);
    }
  }
  return out;
}

// ── A request with no rule pack: the brief from T-107's Reception ────────────

export interface GuidedReading {
  values: GivenValue[];
  /** The source words of each fact that was kept, for reading dates. */
  sources: string[];
  unknowns: string[];
  /** How many things the model returned that the user's words did not support. */
  dropped: number;
}

function ownWords(value: unknown, normText: string, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === '' || v.length > max) return null;
  return isOwnWords(v, normText) ? v : null;
}

/**
 * Turn the brief that the T-107 Reception prompt returns into values for the
 * fixed checklist. `text` is the description and the answers together.
 *
 * Every fact needs its source words in the user's text, or it is dropped and
 * listed as unknown (T-107, section 5, server checks). A fact is kept as the
 * user's own source words, not as the model's wording of them. Names and
 * requests must be the user's own words. On a court document the court is
 * never taken from the model. Dates are not taken from the model's list
 * (T-127, section 3.1): see `guidedDates`.
 */
export function readGuidedBrief(
  rawBrief: unknown,
  text: string,
  courtDocument: boolean,
): GuidedReading {
  const brief = (
    rawBrief && typeof rawBrief === 'object' && !Array.isArray(rawBrief) ? rawBrief : {}
  ) as Record<string, unknown>;
  const normText = normalise(text);
  const values: GivenValue[] = [];
  const unknowns: string[] = [];
  let dropped = 0;

  const from = ownWords(brief.from, normText, TEXT_MAX);
  if (from) values.push({ key: FIXED_KEYS.firstParty, value: from, source: 'description' });
  else if (brief.from) dropped += 1;

  const to = ownWords(brief.to, normText, TEXT_MAX);
  if (to) values.push({ key: FIXED_KEYS.otherParty, value: to, source: 'description' });
  else if (brief.to) dropped += 1;

  // Not a court document: the office or authority may stand as the other party.
  if (!courtDocument && !to) {
    const authority = ownWords(brief.court_or_authority, normText, TEXT_MAX);
    if (authority) {
      values.push({ key: FIXED_KEYS.otherParty, value: authority, source: 'description' });
    }
  }

  const sources: string[] = [];
  for (const f of Array.isArray(brief.facts) ? brief.facts : []) {
    const e = (f ?? {}) as { text?: unknown; source?: unknown };
    const source = typeof e.source === 'string' ? e.source.trim() : '';
    if (normalise(source).length < 2 || !normText.includes(normalise(source))) {
      dropped += 1;
      continue;
    }
    if (!sources.includes(source)) sources.push(source);
  }
  if (dropped > 0) unknowns.push('a detail we could not find in your words');
  if (sources.length > 0) {
    values.push({
      key: FIXED_KEYS.facts,
      value: sources.join('\n').slice(0, NARRATIVE_MAX),
      source: 'description',
      quote: sources[0],
    });
  }

  const requests = (Array.isArray(brief.requests) ? brief.requests : [])
    .map((r) => ownWords(r, normText, NARRATIVE_MAX))
    .filter((r): r is string => r !== null);
  if (requests.length > 0) {
    values.push({ key: FIXED_KEYS.relief, value: requests.join('\n'), source: 'description' });
  }

  for (const u of Array.isArray(brief.unknowns) ? brief.unknowns : []) {
    const label = clean(u);
    if (label) unknowns.push(label);
  }

  return { values, sources, unknowns: [...new Set(unknowns)].slice(0, 20), dropped };
}

/** A checklist item for a date found in a request with no pack. */
export function guidedDateItem(kindId: string): ChecklistItem {
  return {
    key: `date.${kindId}`,
    label: dateKindLabel(kindId) ?? kindId,
    part: 'dates',
    kind: 'date',
    required: false,
    options: [],
    modelReadable: false,
    partyName: false,
    dateKind: kindId,
  };
}

// ── Court signals (T-107, sections 2 and 3) ─────────────────────────────────

const COURT_SIGNALS = [
  'court',
  'tribunal',
  'forum',
  'commission',
  'magistrate',
  'judge',
  'bench',
  "hon'ble",
  'fir',
  'crime number',
  'case number',
  'police station',
  'custody',
  'arrest',
  'bail',
  'petition',
  'plaint',
  'written statement',
  'suit',
  'appeal',
  'revision',
  'writ',
  'quashing',
  'injunction',
  'stay',
  'decree',
  'execution',
  'summons',
  'warrant',
  'charge sheet',
  'cognizance',
  'अदालत',
  'न्यायालय',
  'थाना',
  'प्राथमिकी',
  'जमानत',
  'याचिका',
  'अपील',
  'मुकदमा',
  'वाद',
  'गिरफ्तारी',
  'हिरासत',
];

const CODE_WITH_SECTION =
  /\b(bns|bnss|bsa|ipc|crpc|evidence act)\b[^.]{0,40}\d|\d[^.]{0,40}\b(bns|bnss|bsa|ipc|crpc|evidence act)\b/;

/** True when the description carries one of Ajay's court signals (T-107, section 2). */
export function hasCourtSignal(description: string): boolean {
  const text = normalise(description);
  return COURT_SIGNALS.some((s) => hasCue(text, s)) || CODE_WITH_SECTION.test(text);
}

const SUPREME_COURT = ['supreme court', 'apex court', 'सर्वोच्च न्यायालय', 'उच्चतम न्यायालय'];

/** T-107, section 3, item 1: nothing for the Supreme Court is drafted without a rule pack. */
export function namesSupremeCourt(description: string): boolean {
  const text = normalise(description);
  return SUPREME_COURT.some((s) => hasCue(text, s));
}
