/**
 * T-628: a past date in the prayer of a temporary_injunction_o39 draft is a
 * blocking finding, code `past_date_in_prayer`.
 *
 * LEGAL CONTENT (Ajay, T-613 file §(k)4): handoff/legal/T-613-o39-injunction-signed.md
 * §(b), §(h), §(i)5, §(i)6 and §(k). Do not change a string or a rule here
 * without his sign-off.
 *
 * Rulings (§(k)):
 * 1. Only a clearly resolved date strictly before today (IST) blocks. A date
 *    `normalizeDate` does not resolve (ambiguous two-digit year, no year, a
 *    day that does not exist, a month name not on the lists) never blocks.
 *    Day-first numeric dates (03/12/2026 is 3 December) are resolved.
 * 5. (eb3506f5) A month and year with no day ("September 2026") blocks when
 *    the whole month has ended before today (IST); the current month and later
 *    pass. A four-digit year only.
 * 6. (410c3e34) The prayer is read with the `{subject_matter}` value left out:
 *    a deed or plot date there describes the property. The other filled slots
 *    and the fixed prayer wording are still read. The gate never asks a
 *    question whose answer cannot clear the block.
 * 2. What is read: `{restraint_sought}` plus the prayer section, whoever
 *    wrote it. Body paragraphs are never read: past dates belong there.
 * 3. English month names, Devanagari month names (nukta-insensitive, with the
 *    signed spelling variants) and digit dates, Devanagari digits included.
 * 4. The date found goes to the advocate only. It is never logged: callers
 *    log `keys=restraint_sought` only.
 *
 * Pure: no I/O, no clock. "Now" is an argument.
 */
import { normalizeDate } from '@lawie/shared';

/**
 * Signed (Ajay, T-613 §(h), 26 Oct 2026), byte for byte. `<date>` is the date
 * as written in the prayer, shown to the advocate only and never logged.
 * Only `en` is rendered (§(i)5: no Hindi is shown until the Hindi mechanism
 * ships; the same precedent as T-622 / T-616).
 */
export const PAST_DATE_IN_PRAYER_QUESTION = {
  en: 'The prayer refers to <date>, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?',
  hi: 'प्रार्थना में <date> का उल्लेख है, जो बीत चुकी है। निषेधाज्ञा केवल आगे होने वाले कार्यों पर रोक लगा सकती है। प्रतिवादी को किन कार्यों से रोका जाना है?',
} as const;

/** The pack the gate applies to (T-613 §(b)). */
export const PAST_DATE_GATE_PACK_ID = 'temporary_injunction_o39';

/** The field the answer replaces (T-613 §(h)): `restraint_sought`, never `acts_complained_of`. */
export const RESTRAINT_SOUGHT_KEY = 'restraint_sought';

/** The prayer slot left out of the scan (§(k)6). */
export const SUBJECT_MATTER_KEY = 'subject_matter';

/** Signed (Ajay, T-613 §(b)): the field's label, used only when the pack gives none. */
export const RESTRAINT_SOUGHT_LABEL = 'Acts the defendant should be restrained from';

/** The signed EN question with the date as written. Shown to the advocate only: never logged. */
export function pastDateInPrayerLine(date: string): string {
  // split/join, not replace: a `$` in the date is never read as a pattern.
  return PAST_DATE_IN_PRAYER_QUESTION.en.split('<date>').join(date);
}

/**
 * §(k)6: `text` with every literal occurrence of the subject_matter value
 * taken out (a string match, never a pattern). Each occurrence becomes `|`,
 * which no date reader reads across, so the words either side cannot join
 * into a date. An empty, blank or non-string value changes nothing.
 */
export function withoutSubjectMatter(text: string, subjectMatter: unknown): string {
  if (typeof subjectMatter !== 'string' || subjectMatter.trim() === '') return text;
  return text.split(subjectMatter).join('|');
}

/** Today's date in India (UTC+05:30, no DST), ISO `YYYY-MM-DD`. */
export function istToday(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

// ── Month names ─────────────────────────────────────────────────────────────

/** Nukta-insensitive form of a Devanagari word (§(k)3). */
function withoutNukta(word: string): string {
  return word.normalize('NFD').replace(/़/g, '').normalize('NFC');
}

/**
 * Signed (Ajay, T-613 §(k)3): the Devanagari month names with their spelling
 * variants. Keys are nukta-free; values are the English month `normalizeDate` reads.
 */
const DEVANAGARI_MONTHS: ReadonlyMap<string, string> = new Map(
  (
    [
      ['जनवरी', 'January'],
      ['फ़रवरी', 'February'],
      ['फरवरी', 'February'],
      ['मार्च', 'March'],
      ['अप्रैल', 'April'],
      ['मई', 'May'],
      ['जून', 'June'],
      ['जुलाई', 'July'],
      ['अगस्त', 'August'],
      ['सितंबर', 'September'],
      ['सितम्बर', 'September'],
      ['अक्टूबर', 'October'],
      ['अक्तूबर', 'October'],
      ['नवंबर', 'November'],
      ['नवम्बर', 'November'],
      ['दिसंबर', 'December'],
      ['दिसम्बर', 'December'],
    ] as const
  ).map(([hi, en]) => [withoutNukta(hi), en]),
);

/** English month names and the short forms `normalizeDate` reads. Longest first. */
const EN_MONTH =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';

/** The ordinal day words `normalizeDate` reads. */
const ORDINAL =
  'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|' +
  'thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth';

/** A digit, ASCII or Devanagari (`normalizeDate` reads Devanagari digits as ASCII). */
const D = '[0-9\\u0966-\\u096F]';
/** A Devanagari word: letters and signs, not the danda and not the digits. */
const DEVANAGARI_WORD = '[\\u0900-\\u0963\\u0971-\\u097F]+';

// ── Date mentions ───────────────────────────────────────────────────────────

interface Mention {
  /** Position in the text, for "the first date". */
  at: number;
  /** Length of the match in the text. */
  length: number;
  /** A full date, or a month and year with no day (§(k)5). */
  kind: 'date' | 'month';
  /** The date as written, shown in the question. */
  written: string;
  /** The span handed to normalizeDate. */
  span: string;
}

type Reader = {
  re: RegExp;
  span: (m: RegExpExecArray) => string | null;
  kind?: 'date' | 'month';
};

const READERS: readonly Reader[] = [
  // ISO, year first: 2026-10-20.
  {
    re: new RegExp(`(?<![\\p{L}\\p{N}])${D}{4}-${D}{1,2}-${D}{1,2}(?!\\p{N})`, 'gu'),
    span: (m) => m[0],
  },
  // Day first, one separator throughout: 20/10/2026, 20.10.26, २०-१०-२०२६.
  {
    re: new RegExp(
      `(?<![\\p{L}\\p{N}]|\\p{N}[./-])${D}{1,2}([/.-])${D}{1,2}\\1${D}{2,4}(?!\\p{N}|[./-]\\p{N})`,
      'gu',
    ),
    span: (m) => m[0],
  },
  // 20 October 2026, 20th Oct, 2026, 20th day of October 2026, 20-Oct-2026.
  {
    re: new RegExp(
      `(?<![\\p{L}\\p{N}])(${D}{1,2})(?:st|nd|rd|th)?(?:\\s+day\\s+of\\s+|\\s+of\\s+|[\\s.,/-]*)(${EN_MONTH})(?![\\p{L}])\\.?[\\s.,/-]*(${D}{2,4})(?!\\p{N})`,
      'giu',
    ),
    span: (m) => `${m[1]} ${m[2]} ${m[3]}`,
  },
  // October 20, 2026.
  {
    re: new RegExp(
      `(?<![\\p{L}])(${EN_MONTH})(?![\\p{L}])\\.?\\s+(${D}{1,2})(?:st|nd|rd|th)?,?\\s+(${D}{2,4})(?!\\p{N})`,
      'giu',
    ),
    span: (m) => `${m[1]} ${m[2]}, ${m[3]}`,
  },
  // the twentieth (day) of October 2026, twenty-first October 2026.
  {
    re: new RegExp(
      `(?<![\\p{L}])(?:(twenty|thirty)[\\s-]?)?(${ORDINAL})(?:\\s+day)?\\s+(?:of\\s+)?(${EN_MONTH})(?![\\p{L}])\\.?,?\\s+(${D}{2,4})(?!\\p{N})`,
      'giu',
    ),
    span: (m) => `${m[1] ? `${m[1]}-` : ''}${m[2]} ${m[3]} ${m[4]}`,
  },
  // 20 अक्टूबर 2026, २० अक्तूबर, २०२६ (§(k)3).
  {
    re: new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}])(${D}{1,2})\\s*(${DEVANAGARI_WORD})[\\s,]*(${D}{2,4})(?!\\p{N})`,
      'gu',
    ),
    span: (m) => {
      const month = DEVANAGARI_MONTHS.get(withoutNukta(m[2]));
      return month === undefined ? null : `${m[1]} ${month} ${m[3]}`;
    },
  },
  // §(k)5: a month and a four-digit year with no day: September 2026, Sept. 2026.
  // The span is the month's first day, so normalizeDate checks month and year.
  {
    kind: 'month',
    re: new RegExp(`(?<![\\p{L}])(${EN_MONTH})(?![\\p{L}])\\.?[\\s,]*(${D}{4})(?!\\p{N})`, 'giu'),
    span: (m) => `1 ${m[1]} ${m[2]}`,
  },
  // §(k)5: सितंबर 2026, अक्तूबर, २०२६ (nukta-insensitive, the signed list only).
  {
    kind: 'month',
    re: new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(${DEVANAGARI_WORD})[\\s,]*(${D}{4})(?!\\p{N})`, 'gu'),
    span: (m) => {
      const month = DEVANAGARI_MONTHS.get(withoutNukta(m[1]));
      return month === undefined ? null : `1 ${month} ${m[2]}`;
    },
  },
];

function mentionsIn(text: string): Mention[] {
  const found: Mention[] = [];
  for (const { re, span, kind = 'date' } of READERS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const s = span(m);
      if (s !== null) {
        found.push({ at: m.index, length: m[0].length, kind, written: m[0].trim(), span: s });
      }
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  // A month and year inside a full date ("20 September 2026") is that date, not a month.
  const dates = found.filter((f) => f.kind === 'date');
  return found
    .filter(
      (f) =>
        f.kind === 'date' || !dates.some((d) => d.at <= f.at && f.at + f.length <= d.at + d.length),
    )
    .sort((a, b) => a.at - b.at);
}

/**
 * The first clearly resolved date strictly before today (IST) in `texts`,
 * read in the order given, as written; null when there is none. Today and
 * later pass; a date that does not resolve never blocks (§(k)1).
 */
export function pastDateInPrayer(texts: readonly string[], now: Date): { date: string } | null {
  const today = istToday(now);
  const referenceYear = Number(today.slice(0, 4));
  for (const text of texts) {
    if (typeof text !== 'string' || text === '') continue;
    for (const mention of mentionsIn(text)) {
      const r = normalizeDate(mention.span, { referenceYear });
      if (!r.ok) continue;
      // A month blocks only once it has ended: its YYYY-MM is before today's.
      const past =
        mention.kind === 'month' ? r.value.slice(0, 7) < today.slice(0, 7) : r.value < today;
      if (past) return { date: mention.written };
    }
  }
  return null;
}

/**
 * §(k)2: the model's own prayer section, for a path with no system prayer:
 * from a line that is only a prayer heading ("PRAYER", "PRAYERS", "प्रार्थना",
 * an optional colon) to the end of the text. Null when there is no such
 * heading, so the body is never read.
 */
export function modelPrayerSection(body: string): string | null {
  const heading = /^[ \t]*(?:prayers?|प्रार्थना)[ \t]*:?[ \t]*$/imu.exec(body);
  return heading === null ? null : body.slice(heading.index);
}
