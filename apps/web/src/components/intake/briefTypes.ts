/**
 * The one drafting flow (T-125, ADR-021): what the brief API returns and the
 * small pure helpers the screens share. Nothing here talks to the network and
 * nothing here is stored in the browser.
 *
 * Shapes follow apps/drafting/src/services/intake-brief.ts (T-105) and the
 * `generate-from-brief` route (T-106).
 */

export type ValueKind =
  | 'text'
  | 'narrative'
  | 'date'
  | 'number'
  | 'amount'
  | 'choice'
  | 'choices'
  | 'list';

export type BriefPart = 'parties' | 'facts' | 'dates' | 'numbers' | 'relief';

export type Value = string | string[];

export interface BriefItem {
  key: string;
  part: BriefPart;
  label: string;
  kind: ValueKind;
  required: boolean;
  options: string[];
  value: Value | null;
  source: 'description' | 'user' | null;
  quote?: string;
  /** True for a value read from the description, or with a `note` to read. */
  please_check: boolean;
  /** The service's line shown with "Please check" (T-150). Shown as sent. */
  note?: string;
  /** An empty fact an edited description left unclear: asked again, shows its blank (T-150). */
  reask?: boolean;
  /** For a date: what it is the date of. */
  meaning?: string;
  /** The blank the draft shows while this is not given. */
  placeholder: string;
  party_name: boolean;
}

export interface BriefCourt {
  state: string | null;
  court_type: string | null;
  court: string | null;
}

export interface LooseDate {
  value: string;
  kind: string | null;
  meaning: string | null;
}

export interface Brief {
  kind: { id: string | null; name: string; court_document: boolean };
  court: BriefCourt;
  items: BriefItem[];
  loose_dates: LooseDate[];
  unplaced: Array<{ label: string; value: Value }>;
  still_unknown: Array<{ key: string; label: string; placeholder: string }>;
  can_confirm: boolean;
  confirm_blockers: Array<'court' | 'parties'>;
  confirm_message: string | null;
}

export interface BriefQuestion {
  key: string;
  question: string;
  round: 1 | 2;
  label: string;
  kind: ValueKind;
  options: string[];
}

/** One thing the user gave, as the API takes it. */
export interface GivenValue {
  key: string;
  value: Value;
  source: 'description' | 'user';
  quote?: string;
  label?: string;
  /** A typed name the edited description gives differently (T-150). Sent back so the mark stays. */
  please_check?: boolean;
}

export interface BriefResponse {
  intake_id?: string;
  outcome: 'brief' | 'questions' | 'needs_choice' | 'no_match' | 'unavailable';
  brief?: Brief;
  questions?: BriefQuestion[];
  /** With `questions` for a document with no rule pack: the round to send back. */
  next_round?: number;
  choices?: Array<{ kind: string; name: string }>;
  needs_upgrade?: boolean;
}

/** A row of the documents list (GET /api/documents/template-configs). */
export interface KindSummary {
  template_id: string;
  display_name: string;
  category: string;
  description: string;
  plan_access: 'free' | 'pro';
}

export interface Finding {
  type: string;
  message: string;
}

/** What the draft-ready screen shows. Every line of text in it comes from the service. */
export interface DraftResult {
  docId: string | null;
  name: string;
  /** False when the document has no rule pack. */
  rulePack: boolean;
  startingDraft: boolean;
  startingDraftLabel: string | null;
  labelReason: string | null;
  missingClauses: Array<{ id: string; title: string }>;
  findings: Finding[];
  blanks: number;
}

/** The id the API uses for a document with no rule pack. */
export const NO_RULE_PACK = 'none';

export const TEXT_MAX = 500;
export const NARRATIVE_MAX = 6000;
export const LIST_MAX = 30;

export function isEmptyValue(v: Value | null | undefined): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function sameValue(a: Value, b: Value): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What the page holds after the service answers: every value the brief placed,
 * and every earlier value the brief could not place (so that a change of
 * document loses nothing). The service does not send keys for the values it
 * could not place, so those are matched by their value.
 */
export function valuesAfter(brief: Brief, previous: GivenValue[]): GivenValue[] {
  const placed: GivenValue[] = [];
  const emptyKeys = new Set<string>();
  const itemKeys = new Set<string>();
  for (const item of brief.items) {
    itemKeys.add(item.key);
    if (isEmptyValue(item.value)) {
      emptyKeys.add(item.key);
      continue;
    }
    placed.push({
      key: item.key,
      value: item.value as Value,
      source: item.source ?? 'user',
      ...(item.quote ? { quote: item.quote } : {}),
      label: item.label,
      // T-150: keep the mark on a typed name. A mark with a note (Rule B) is
      // worked out again by the service, so it is not carried.
      ...(item.source === 'user' && item.please_check && !item.note ? { please_check: true } : {}),
    });
  }
  const kept = previous.filter(
    (v) =>
      !isEmptyValue(v.value) &&
      (!itemKeys.has(v.key) || emptyKeys.has(v.key)) &&
      brief.unplaced.some((u) => sameValue(u.value, v.value)),
  );
  return [...placed, ...kept];
}

/** Set, replace or clear one value the user typed. The new value carries no "Please check" mark. */
export function withValue(
  values: GivenValue[],
  key: string,
  value: Value,
  label: string,
): GivenValue[] {
  const rest = values.filter((v) => v.key !== key);
  return isEmptyValue(value) ? rest : [...rest, { key, value, source: 'user', label }];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 2026-08-25 -> 25 August 2026. Anything else is returned as written. */
export function dateInWords(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

const BLANK =
  /\[To be confirmed: [^\]]*\]|\[Section — verify before filing\]|\[Authority — add if relied upon\]/g;

/** A run of underscores left for the user, such as "Case No. _____". */
const UNDERSCORE_BLANK = /_{3,}/g;

/** A line of underscores only: the line a signature goes on, not a blank. */
const SIGNATURE_LINE = /^[ \t]*_{3,}[ \t]*$/gm;

/** The verification's signing date, "___ day of __________, 20___": one blank. */
const SIGNING_DATE_BLANK = /_{3,} day of _{3,}, 20_{3,}/g;

/**
 * How many visible blanks the draft carries (T-107, section 4). T-146: a run of
 * three or more underscores inside a line (a case number, a date) is a blank too.
 * The signing date's three underscore runs count as one blank.
 */
export function countBlanks(text: string): number {
  const marked = (text.match(BLANK) ?? []).length;
  const rest = text.replace(SIGNATURE_LINE, '');
  const signingDates = (rest.match(SIGNING_DATE_BLANK) ?? []).length;
  const underscores = (rest.replace(SIGNING_DATE_BLANK, ' ').match(UNDERSCORE_BLANK) ?? [])
    .length;
  return marked + signingDates + underscores;
}

/** The words after "[To be confirmed: " in a blank, for showing it. */
export function describeValue(v: Value): string {
  return Array.isArray(v) ? v.join(', ') : v;
}

export const PART_TITLES: Record<BriefPart, string> = {
  parties: 'Parties',
  facts: 'Facts',
  dates: 'Dates',
  numbers: 'Numbers',
  relief: 'What is asked for',
};

/** The order the brief shows its parts in (T-126, B1). The court comes before these. */
export const PART_ORDER: BriefPart[] = ['parties', 'facts', 'dates', 'numbers', 'relief'];
