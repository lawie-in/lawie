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
  const referenceYear =
    typeof options === 'object' && options !== null ? options.referenceYear : undefined;
  const t = asText(input);
  if (!t.ok) return t;
  const s = devanagariToArabic(t.text).normalize('NFC').trim().replace(/\s+/g, ' ');

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

  return unresolved('unrecognised', 'This is not a date format we read.');
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
