/**
 * Section references (T-147a criterion 7). `S.483 BNSS`, `Sec 483 BNSS`,
 * `u/s 483 BNSS`, `BNSS s. 483` and `Section 483 of the BNSS, 2023` all
 * normalise to `{ act: 'BNSS', section: '483' }`.
 *
 * One fact is one section of one act. A section with no act, an act we do not
 * know, a year that is not the act's year, and a run of sections
 * (`302, 307 IPC`) each return an `unresolved` reason. The act is never
 * guessed from the section number.
 */
import type { SectionRef } from '../../types/fact-ledger';
import { asText, compareWith, devanagariToArabic, Normalized, Comparison, unresolved } from './common';

interface ActEntry {
  id: string;
  year: number;
  /** Lower case, letters only. */
  keys: string[];
}

const ACTS: readonly ActEntry[] = [
  { id: 'BNSS', year: 2023, keys: ['bnss', 'bharatiyanagariksurakshasanhita', 'बीएनएसएस', 'भारतीयनागरिकसुरक्षासंहिता'] },
  { id: 'BNS', year: 2023, keys: ['bns', 'bharatiyanyayasanhita', 'बीएनएस', 'भारतीयन्यायसंहिता'] },
  // 'भारतीयसाक्ष्यअधिनियम' is the Hindi name of both the BSA and the IEA: see AMBIGUOUS_KEYS.
  { id: 'BSA', year: 2023, keys: ['bsa', 'bharatiyasakshyaadhiniyam', 'बीएसए'] },
  { id: 'IPC', year: 1860, keys: ['ipc', 'indianpenalcode', 'आईपीसी', 'भारतीयदंडसंहिता', 'भारतीयदण्डसंहिता'] },
  { id: 'CrPC', year: 1973, keys: ['crpc', 'codeofcriminalprocedure', 'सीआरपीसी', 'दंडप्रक्रियासंहिता', 'दण्डप्रक्रियासंहिता'] },
  { id: 'IEA', year: 1872, keys: ['iea', 'indianevidenceact', 'evidenceact'] },
  { id: 'CPC', year: 1908, keys: ['cpc', 'codeofcivilprocedure'] },
  { id: 'NI Act', year: 1881, keys: ['niact', 'negotiableinstrumentsact'] },
];
/**
 * Names that are the official name of more than one act (Ajay, T-147b): only
 * the year says which. `भारतीय साक्ष्य अधिनियम` is the Hindi name of both the
 * Bharatiya Sakshya Adhiniyam, 2023 and the Indian Evidence Act, 1872.
 */
const AMBIGUOUS_KEYS = new Map<string, readonly string[]>([
  ['भारतीयसाक्ष्यअधिनियम'.normalize('NFC'), ['BSA', 'IEA']],
]);

const ACT_BY_KEY = new Map<string, ActEntry>(
  ACTS.flatMap((a) => a.keys.map((k) => [k.normalize('NFC'), a] as [string, ActEntry])),
);

const MARKER = String.raw`(?:under\s+)?(?:u\s*\/\s*s|ss?|secs?|sections?|धारा)\s*\.?\s*`;
const SECNUM = String.raw`(\d+)(?:-?([a-z])(?![a-z\p{L}]))?((?:\s*\(\s*[0-9a-z]{1,4}\s*\))*)`;

/** Marker (optional) and section first, the act after: `S.483 BNSS`. Group 1 is the marker. */
const ACT_LAST = new RegExp(String.raw`^(${MARKER})?${SECNUM}(.*)$`, 'iu');
/**
 * Act first, then marker (optional) and section: `BNSS s. 483`, `BNSS की धारा 483`.
 * Group 2 is the marker, so a bare trailing year (`BNSS, 2023`) can be told apart.
 */
const ACT_FIRST = new RegExp(String.raw`^(.+?)[\s,]+(?:(?:की|के)\s+)?(${MARKER})?${SECNUM}$`, 'iu');
/** What says a second section follows: `302, 307`, `302/307`, `302 r/w 34`. */
const ANOTHER_SECTION = /^\s*(?:,|\/|&|and\b|or\b|r\s*\/\s*w|read\s+with|व\s|और\s|सपठित)/iu;

function canonicalSection(num: string, letter: string | undefined, clauses: string): string {
  return `${num.replace(/^0+(?=\d)/, '')}${(letter ?? '').toUpperCase()}${clauses.replace(/\s+/g, '').toLowerCase()}`;
}

function readAct(raw: string): Normalized<string> {
  let rest = raw.trim().replace(/^(?:of\s+)?(?:the\s+)?/iu, '');
  let year: number | undefined;
  const y = /[,\s]*(\d{4})\s*\.?$/u.exec(rest);
  if (y) {
    year = Number(y[1]);
    rest = rest.slice(0, y.index);
  }
  if (/\d/.test(rest)) return unresolved('multiple_sections', 'The reference names more than one section.');
  const key = rest.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}]+/gu, '');
  if (key === '') return unresolved('missing_act', 'The section has no act.');
  const shared = AMBIGUOUS_KEYS.get(key);
  if (shared) {
    const candidates = ACTS.filter((a) => shared.includes(a.id));
    // Ajay's wording (T-147b), for the one ambiguous name there is: BSA 2023 and IEA 1872.
    if (year === undefined) {
      return unresolved(
        'ambiguous_act',
        'This name is used for both the Bharatiya Sakshya Adhiniyam, 2023 and the Indian Evidence Act, 1872. Add the year to show which one you mean.',
      );
    }
    const byYear = candidates.find((a) => a.year === year);
    if (!byYear) {
      return unresolved(
        'act_year_mismatch',
        `This name is used for both the Bharatiya Sakshya Adhiniyam, 2023 and the Indian Evidence Act, 1872. The year given, ${year}, matches neither. Use 2023 or 1872.`,
      );
    }
    return { ok: true, value: byYear.id, display: byYear.id };
  }
  const act = ACT_BY_KEY.get(key);
  if (!act) return unresolved('unknown_act', `"${rest.trim()}" is not an act we know.`);
  if (year !== undefined && year !== act.year) {
    return unresolved('act_year_mismatch', `The ${act.id} is the Act of ${act.year}, not ${year}.`);
  }
  return { ok: true, value: act.id, display: act.id };
}

function done(act: string, section: string): Normalized<SectionRef> {
  return { ok: true, value: { act, section }, display: `Section ${section} ${act}` };
}

/**
 * Normalise one section reference to `{ act, section }`. Total: junk,
 * a missing or unknown act and runs of sections come back `unresolved`.
 */
export function normalizeSectionRef(input: unknown): Normalized<SectionRef> {
  const t = asText(input);
  if (!t.ok) return t;
  const s = devanagariToArabic(t.text).normalize('NFC').trim().replace(/\s+/g, ' ');

  const last = ACT_LAST.exec(s);
  if (last) {
    const tail = last[5];
    if (ANOTHER_SECTION.test(tail)) return unresolved('multiple_sections', 'The reference names more than one section.');
    const act = readAct(tail);
    if (!act.ok) return act;
    // No marker and a four-digit number before the act ("2023 BNSS", "1860 IPC"):
    // that is the act's year, not a section. Same rule as the act-first form.
    if (last[1] === undefined && last[2].length === 4) {
      return unresolved('missing_section', 'The reference names an act and a year but no section.');
    }
    return done(act.value, canonicalSection(last[2], last[3], last[4]));
  }

  const first = ACT_FIRST.exec(s);
  if (first) {
    const act = readAct(first[1]);
    if (!act.ok) return act;
    // No section marker and a four-digit number: that is the act's year
    // ("BNSS, 2023", "IPC 1860"), not a section. Every act's year has four digits.
    if (first[2] === undefined && first[3].length === 4) {
      return unresolved('missing_section', 'The reference names an act and a year but no section.');
    }
    return done(act.value, canonicalSection(first[3], first[4], first[5]));
  }

  return unresolved('unrecognised', 'This is not a section reference we read.');
}

/** Equal when both name the same section of the same act. */
export function compareSectionRefs(a: unknown, b: unknown): Comparison {
  return compareWith(normalizeSectionRef, (v) => `${v.act}|${v.section}`, a, b);
}
