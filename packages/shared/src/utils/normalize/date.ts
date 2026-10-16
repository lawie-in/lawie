/**
 * Dates (T-147a criteria 3 and 4). Day first, always: `12/3/26`, `12-3-26`,
 * `12.03.2026` and `12 March 2026` are all `2026-03-12`, shown as
 * `12 March 2026`, and `03/12/2026` is 3 December.
 *
 * Nothing is guessed. A day or month out of range, a month name we do not
 * know, a missing year, and a two-digit year that could be past or future
 * each return an `unresolved` reason. There is no default year, no default
 * month order and no closest match.
 *
 * Two-digit years: `yy` reads as `20yy` only when `20yy` is not after the
 * reference year the caller passes (the matter's "today"). `26` in 2026 is
 * 2026. `27` in 2026 could be a future 2027 or a past 1927, so it is
 * unresolved; so is any two-digit year when no reference year is given. The
 * reference year is an argument, not the clock, so the function stays pure.
 */
import {
  asText,
  compareWith,
  devanagariToArabic,
  Normalized,
  Comparison,
  unresolved,
} from './common';

export interface DateOptions {
  /** The four-digit year two-digit years are read against. Required to read `12/3/26`. */
  referenceYear?: number;
  /**
   * T-469: the ledger field the words are read for (a dotted key is matched
   * on its last segment). Only when it is given is a date after a leading
   * label read ("remand 4 June 2026", "FIR dated 12.03.2026"); see
   * `readAfterLabel`. Without it, and for any span that is a date on its own,
   * the reading is as before T-469.
   */
  fieldKey?: string;
  /**
   * T-469 (Ajay 604af4bd, condition 1): the date fields (keys) being asked in
   * the same reading, this one included. A label of fillers only ("on 4th
   * June, 2026", "Dated: 12.03.2026") is read only when exactly one is asked.
   * Not given: never read.
   */
  askedDateFields?: readonly string[];
  /**
   * T-469 (Ajay 604af4bd, condition 3): every date field (key) on the pack's
   * checklist. "order" is read only when exactly one of ORDER_DATE_FIELDS is
   * on it. Not given: never read.
   */
  packDateFields?: readonly string[];
  /**
   * T-469 (Ajay 604af4bd condition 5, narrowed by b37ed330 point 2): today,
   * ISO `YYYY-MM-DD`. With `fieldKey`, a date after today for a past-event
   * field (PAST_EVENT_DATE_FIELDS) is unresolved, whatever the digits of its
   * year. Without `today` or `fieldKey`: as before T-469.
   */
  today?: string;
}

export const MONTH_NAMES = [
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
] as const;

/** English month names and their usual short forms. Lower case. */
const MONTHS = new Map<string, number>();
MONTH_NAMES.forEach((name, i) => {
  const lower = name.toLowerCase();
  MONTHS.set(lower, i + 1);
  MONTHS.set(lower.slice(0, 3), i + 1);
});
MONTHS.set('sept', 9);

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** `12 March 2026`. */
export function formatIndianDate(year: number, month: number, day: number): string {
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function readYear(
  raw: string,
  referenceYear: number | undefined,
): { ok: true; year: number } | { ok: false; result: Normalized<string> } {
  if (raw.length === 4) return { ok: true, year: Number(raw) };
  if (raw.length !== 2) {
    return { ok: false, result: unresolved('unrecognised', 'The year is not two or four digits.') };
  }
  const ref = referenceYear;
  if (ref === undefined || !Number.isInteger(ref) || ref < 1000 || ref > 9999) {
    return {
      ok: false,
      result: unresolved(
        'two_digit_year_needs_reference',
        `The year "${raw}" has two digits and there is no reference year to read it against.`,
      ),
    };
  }
  const year = 2000 + Number(raw);
  if (year > ref) {
    return {
      ok: false,
      result: unresolved(
        'two_digit_year_ambiguous',
        `The year "${raw}" could be ${year} or ${year - 100}.`,
      ),
    };
  }
  return { ok: true, year };
}

function build(year: number, month: number, day: number): Normalized<string> {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return unresolved(
      'day_month_out_of_range',
      `Day ${day} of month ${month} in ${year} does not exist.`,
    );
  }
  return {
    ok: true,
    value: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    display: formatIndianDate(year, month, day),
  };
}

/** D/M/Y with one separator used throughout: `/`, `-` or `.`. */
const NUMERIC_DMY = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})$/;
/** ISO, year first: `2026-03-12`. Unambiguous because the year leads with four digits. */
const ISO_YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
/** `12 March 2026`, `12th Mar, 2026`, `12-Mar-2026`. */
const NAMED_DMY = /^(\d{1,2})(?:st|nd|rd|th)?[\s.,/-]*([\p{L}\p{M}]+)\.?[\s.,/-]*(\d{2,4})?$/u;
/** `March 12, 2026`. The month is named, so the order is not in doubt. */
const NAMED_MDY = /^([\p{L}\p{M}]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})?$/u;

/**
 * T-363 AC2: the day of the month as an ordinal word. The same words as
 * `datesAsWritten` in apps/drafting/src/services/intake-text.ts reads.
 */
const ORDINAL_DAYS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};
/**
 * `fifteenth September 2026`, `the thirty-first of January 2027`,
 * `twenty-second Sept, 2026`. Day, month and year as in `NAMED_DMY`.
 */
const ORDINAL_DMY = new RegExp(
  `^(?:the\\s+)?(?:(twenty|thirty)[\\s-]?)?(${Object.keys(ORDINAL_DAYS).join('|')})\\s+(?:of\\s+)?([\\p{L}\\p{M}]+)\\.?[\\s.,/-]*(\\d{2,4})?$`,
  'iu',
);

/** "twenty" + "first" is 21; "thirty" + "first" is 31. Null for words that are no day ("thirty-second"). */
function ordinalDay(tens: string | undefined, unit: string): number | null {
  const n = ORDINAL_DAYS[unit.toLowerCase()];
  if (n === undefined) return null;
  if (tens === undefined) return n;
  const t = tens.toLowerCase();
  if (n > 9) return null;
  if (t === 'twenty') return 20 + n;
  if (t === 'thirty' && n === 1) return 31;
  return null;
}

/**
 * Normalise a date to ISO `YYYY-MM-DD`. Total: junk, impossible dates and
 * anything ambiguous come back as an `unresolved` reason.
 */
export function normalizeDate(input: unknown, options?: DateOptions | null): Normalized<string> {
  // Null-safe: a null or non-object options argument means no reference year.
  const o: DateOptions = typeof options === 'object' && options !== null ? options : {};
  const today =
    typeof o.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.today) ? o.today : undefined;
  const refYear = o.referenceYear;
  const t = asText(input);
  if (!t.ok) return t;
  const s = devanagariToArabic(t.text).normalize('NFC').trim().replace(/\s+/g, ' ');

  const field =
    typeof o.fieldKey === 'string' && o.fieldKey !== '' ? lastKeySegment(o.fieldKey) : undefined;
  let r = matchDate(s, refYear);
  // T-469: a leading label, read only for a named ledger field.
  if (r === null && field !== undefined) {
    r = readAfterLabel(s, refYear, {
      field,
      asked: keyList(o.askedDateFields),
      pack: keyList(o.packDateFields),
    });
  }
  if (r === null) return unresolved('unrecognised', 'This is not a date format we read.');
  // T-469 (Ajay b37ed330, point 2): the date of a past event is never after
  // today, whatever the digits of its year. Forward-looking fields are exempt.
  const future = today !== undefined && r.ok && r.value > today;
  if (future && field !== undefined && isPastEventField(field)) {
    return unresolved(
      'unrecognised',
      'This date is after today, and it is the date of something that has already happened.',
    );
  }
  return r;
}

function lastKeySegment(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1);
}

/** The last segments of a list of keys; undefined when no list is given. */
function keyList(keys: unknown): string[] | undefined {
  if (!Array.isArray(keys)) return undefined;
  return keys.filter((k): k is string => typeof k === 'string').map(lastKeySegment);
}

/** The anchored patterns on one whole span. Null when none matches. */
function matchDate(s: string, referenceYear: number | undefined): Normalized<string> | null {
  const iso = ISO_YMD.exec(s);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const num = NUMERIC_DMY.exec(s);
  if (num) {
    const y = readYear(num[4], referenceYear);
    if (!y.ok) return y.result;
    return build(y.year, Number(num[3]), Number(num[1]));
  }

  // T-363 AC2: the day in words. Year required; a day that does not exist is unresolved.
  const ord = ORDINAL_DMY.exec(s);
  if (ord) {
    const [, tens, unit, monthRaw, yearRaw] = ord;
    const month = MONTHS.get(monthRaw.toLowerCase());
    if (month === undefined)
      return unresolved('unknown_month', `"${monthRaw}" is not a month name we know.`);
    const day = ordinalDay(tens, unit);
    if (day === null) {
      return unresolved('day_month_out_of_range', 'The day in words is not a day of a month.');
    }
    if (yearRaw === undefined) return unresolved('missing_year', 'The date has no year.');
    const y = readYear(yearRaw, referenceYear);
    if (!y.ok) return y.result;
    return build(y.year, month, day);
  }

  const dmy = NAMED_DMY.exec(s);
  const mdy = dmy ? null : NAMED_MDY.exec(s);
  const parts: [string, string, string | undefined] | null = dmy
    ? [dmy[1], dmy[2], dmy[3]]
    : mdy
      ? [mdy[2], mdy[1], mdy[3]]
      : null;
  if (parts) {
    const [dayRaw, monthRaw, yearRaw] = parts;
    const month = MONTHS.get(monthRaw.toLowerCase());
    if (month === undefined)
      return unresolved('unknown_month', `"${monthRaw}" is not a month name we know.`);
    if (yearRaw === undefined) return unresolved('missing_year', 'The date has no year.');
    const y = readYear(yearRaw, referenceYear);
    if (!y.ok) return y.result;
    return build(y.year, month, Number(dayRaw));
  }

  return null;
}

// ── T-469: a date after a neutral label ─────────────────────────────────────
//
// Ajay's rules (15 Oct 2026, T-245 file) and Arjun's scope (15 Oct 2026,
// 22:09 UTC). Allowlists, not denylists: a word on none of the lists below
// leaves the span unrecognised (a blank), never a guessed date. Ajay checks
// these lists at merge; do not add a word without his sign-off.

/**
 * Words that change what a date means: a bound, an estimate or a start. A
 * label with any of them is never read, whatever else it holds ("before",
 * "after", "by", "not later than", "around", "till", "on or about").
 */
export const DATE_LABEL_QUALIFIERS: ReadonlySet<string> = new Set([
  'before',
  'after',
  'by',
  'till',
  'until',
  'upto',
  'up',
  'around',
  'about',
  'approx',
  'approximately',
  'circa',
  'nearly',
  'roughly',
  'within',
  'not',
  'later',
  'earlier',
  'than',
  'prior',
  'or',
  'from',
  'since',
  'between',
  'latest',
  'earliest',
]);

/**
 * Fillers (Arjun's list, less "w.e.f" and "wef" by Ajay 604af4bd condition
 * 2): name no field. A label of fillers only is read only when one date field
 * is asked (condition 1).
 */
export const DATE_LABEL_FILLERS: ReadonlySet<string> = new Set([
  'on',
  'dated',
  'date',
  'of',
  'the',
  'dt',
]);

/**
 * Words that name a field, each with the field keys (last segment) it names.
 * A word fills only a field it names: "next" is next_hearing_date only.
 * Keys are the rule packs' own (apps/drafting/src/config).
 */
export const ORDER_DATE_FIELDS: readonly string[] = [
  'impugned_order_date',
  'original_order_date',
  'bail_order_date',
];

/**
 * Fields whose label must hold every one of these words (Ajay b37ed330 point
 * 1): "received" alone, or "memo" alone, leaves memo_received_date blank.
 */
const LABEL_NEEDS_ALL: ReadonlyMap<string, readonly string[]> = new Map([
  ['memo_received_date', ['memo', 'received']],
]);

/**
 * T-469 (Ajay b37ed330 point 2): fields that hold the date of a past event.
 * A date after today is never read for them. Keys ending `_order_date` are
 * past-event fields too (isPastEventField). Every other field is exempt,
 * among them the forward-looking ones: next_hearing_date, lease_end_date,
 * end_date, end_date_if_fixed, expiry_date, notice_expiry_date,
 * period_expiry_date, lease_start_date, license_start_date,
 * promised_possession_date, actual_possession_date, possession_date,
 * notice_sent_date (a notice may be dated ahead of sending),
 * due_date_of_filing, definitive_agreement_deadline.
 */
export const PAST_EVENT_DATE_FIELDS: ReadonlySet<string> = new Set([
  'fir_date',
  'arrest_date',
  'remand_date',
  'custody_since',
  'chargesheet_date',
  'cheque_date',
  'presentation_date',
  'dishonour_date',
  'memo_received_date',
  'legal_notice_date',
  'judgment_date',
  'original_judgment_date',
  'sentence_date',
  'marriage_date',
  'incident_date',
  'accident_date',
  'offence_date',
]);

function isPastEventField(field: string): boolean {
  return PAST_EVENT_DATE_FIELDS.has(field) || field.endsWith('_order_date');
}

/** Field words that are read only when the pack has exactly one field they name. */
const SOLE_IN_PACK_WORDS: ReadonlySet<string> = new Set(['order']);

export const DATE_LABEL_FIELDS: ReadonlyMap<string, readonly string[]> = new Map<
  string,
  readonly string[]
>([
  ['remand', ['remand_date']],
  ['remanded', ['remand_date']],
  ['fir', ['fir_date']],
  ['arrest', ['arrest_date']],
  ['arrested', ['arrest_date']],
  ['custody', ['custody_since']],
  ['chargesheet', ['chargesheet_date']],
  ['cheque', ['cheque_date']],
  ['presented', ['presentation_date']],
  ['deposited', ['presentation_date']],
  ['dishonour', ['dishonour_date', 'memo_received_date']],
  ['dishonoured', ['dishonour_date']],
  // Ajay b37ed330 point 1: only together, "return memo received on …"; see LABEL_NEEDS_ALL.
  ['return', ['memo_received_date']],
  ['memo', ['memo_received_date']],
  ['received', ['memo_received_date']],
  ['notice', ['legal_notice_date']],
  ['next', ['next_hearing_date']],
  ['hearing', ['next_hearing_date']],
  // Read only when the pack has exactly one order-date field (Ajay 604af4bd, condition 3).
  ['order', ORDER_DATE_FIELDS],
  ['judgment', ['judgment_date']],
  ['judgement', ['judgment_date']],
  ['marriage', ['marriage_date']],
  ['incident', ['incident_date']],
  ['accident', ['accident_date']],
  ['offence', ['offence_date']],
]);

/** The most words a leading label may have. */
const MAX_LABEL_WORDS = 6;
/** A label word: letters and the punctuation of `w.e.f.` or `dated:`, no digit. */
const LABEL_WORD = /^[\p{L}\p{M}.,:;]+$/u;
/** A month name and one run of three or more digits: `June 2026`. */
const MONTH_AND_YEAR = /^[\p{L}\p{M}]+\.?,?\s+\d{3,}$/u;

/** A label word as the lists hold it: lower case, trailing `.`, `,`, `:` or `;` removed. */
function labelWord(w: string): string | null {
  if (!LABEL_WORD.test(w)) return null;
  const k = w.toLowerCase().replace(/[.,:;]+$/, '');
  return k === '' ? null : k;
}

/**
 * True when the label may be read for `field`: no qualifier; every word a
 * filler or a word naming `field`; and the words naming it stand together,
 * once each, as one label ("next hearing on" is one label; "remand on remand"
 * is two). A word naming another field, or any other word, is false.
 */
interface LabelContext {
  /** The field read for: a key's last segment. */
  field: string;
  /** Date fields asked in the same reading; undefined when not known. */
  asked?: readonly string[];
  /** Date fields on the pack's checklist; undefined when not known. */
  pack?: readonly string[];
}

function labelAllowed(words: string[], ctx: LabelContext): boolean {
  const { field } = ctx;
  let runs = 0;
  let inRun = false;
  const seen = new Set<string>();
  for (const raw of words) {
    const w = labelWord(raw);
    if (w === null || DATE_LABEL_QUALIFIERS.has(w)) return false;
    if (DATE_LABEL_FILLERS.has(w)) {
      inRun = false;
      continue;
    }
    const fields = DATE_LABEL_FIELDS.get(w);
    if (fields === undefined || !fields.includes(field) || seen.has(w)) return false;
    if (SOLE_IN_PACK_WORDS.has(w)) {
      const named = (ctx.pack ?? []).filter((k) => fields.includes(k));
      if (ctx.pack === undefined || new Set(named).size !== 1) return false;
    }
    seen.add(w);
    if (!inRun) runs++;
    inRun = true;
  }
  if (runs > 1) return false;
  // Fillers only (Ajay 604af4bd, condition 1): exactly one date field asked, this one.
  if (runs === 0) {
    const asked = new Set(ctx.asked ?? []);
    return ctx.asked !== undefined && asked.size === 1 && asked.has(field);
  }
  // Ajay b37ed330 point 1: a field that needs several words has all of them.
  const needs = LABEL_NEEDS_ALL.get(field);
  return needs === undefined || needs.every((w) => seen.has(w));
}

/**
 * The span after a leading label of up to MAX_LABEL_WORDS words, read with
 * the same anchored patterns as a whole span. The label has no digit and no
 * month name (a month in the label could be a second date). The first tail
 * that is a date decides; a tail whose "month" is no month (a label word read
 * as one) does not count. Null when no tail is a date or its label may not be
 * read for `field` (the span then stays unrecognised, as before T-469).
 */
function readAfterLabel(
  s: string,
  referenceYear: number | undefined,
  ctx: LabelContext,
): Normalized<string> | null {
  const words = s.split(' ');
  const limit = Math.min(MAX_LABEL_WORDS, words.length - 1);
  for (let k = 1; k <= limit; k++) {
    const w = labelWord(words[k - 1]);
    if (w === null || MONTHS.has(w.replace(/[^\p{L}\p{M}]/gu, ''))) return null;
    const tail = words.slice(k).join(' ');
    // A month and a bare year ("June 2026") gives no day: NAMED_MDY would
    // split the year into a day and a two-digit year. Never read after a label.
    if (MONTH_AND_YEAR.test(tail)) return null;
    const r = matchDate(tail, referenceYear);
    if (r === null) continue;
    if (!r.ok && r.reason === 'unknown_month') continue;
    return labelAllowed(words.slice(0, k), ctx) ? r : null;
  }
  return null;
}

/** Equal when both normalise to the same calendar day. */
export function compareDates(a: unknown, b: unknown, options?: DateOptions | null): Comparison {
  return compareWith(
    (x) => normalizeDate(x, options),
    (v) => v,
    a,
    b,
  );
}
