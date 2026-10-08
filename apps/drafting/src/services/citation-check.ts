/**
 * No case law on its own (T-148, Ajay's sign-off AJ-2026-10-07-T148).
 *
 * After the Drafter writes, every case citation in its text is checked
 * against what the advocate gave: the confirmed brief and their own words
 * under "described". Rule-pack text is never a source. This file has no I/O.
 *
 * - A citation the advocate gave is kept exactly as the advocate wrote it.
 *   It is never completed or "corrected", even if it looks wrong.
 * - A case the advocate named without a reporter keeps its name; any reporter,
 *   year or volume the model added is replaced by the blank, and any party
 *   the model added is stripped (AJ-2026-10-07-T148-2 (b)):
 *   "Arnesh Kumar v. State of Bihar (2014) 8 SCC 273", with only "Arnesh
 *   Kumar" given, prints "Arnesh Kumar [Authority — add if relied upon]".
 * - Any other citation is replaced by the blank in full.
 *
 * A "case citation" (criterion 3): a "v." party name with SCC, AIR, SCR,
 * SCC OnLine, Cri LJ or a year-volume-page reporter. A reporter with no name
 * before it is a citation too, except that a year-volume-page form whose
 * abbreviation is not a known reporter ("(2019) 5 Bigha 3 Katha") counts only
 * with a "v." name before it. A bare "A v. B" with no reporter is not read
 * here: the Drafter's rule 7 covers it.
 */
import type { ValidationWarning } from './validator';

export const AUTHORITY_BLANK = '[Authority — add if relied upon]';

/** Criterion 3, approved word for word by Ajay. */
export const CITATION_REMOVED_MESSAGE =
  'We removed a case citation you did not give. Add your own authority if you rely on one.';

const KNOWN_REPORTER = String.raw`(?:SCC\s+OnLine\s+[A-Z][A-Za-z]*|S\.?C\.?C\.?|S\.?C\.?R\.?|Cri\.?\s*L\.?\s*J\.?)`;
/** Any other reporter abbreviation, in a year-volume-page citation: "(2010) 2 Mad LJ 45". */
const OTHER_REPORTER = String.raw`(?!(?:Sections?|Sec|Para|No|Nos|Rule|Order|Article|Art)\b)[A-Z][A-Za-z.]{0,9}(?:\s+(?!\d)[A-Z][A-Za-z.]{0,9}){0,2}`;
const SUPP = String.raw`(?:\(?Supp\.?\)?\s*)`;

/**
 * Year-volume-page reporters that count as a citation even with no case name
 * before them. Any other capitalised word in that form ("(2024) 3 Acres 10")
 * counts only after a "v." name. Keys are lower case, no dots or spaces.
 */
const KNOWN_OTHER_REPORTERS = new Set(
  [
    'Mad LJ', 'MLJ', 'All LJ', 'ALJ', 'ALR', 'AWC', 'BLJR', 'PLJR', 'PLJ', 'DLT', 'DRJ', 'AD',
    'Bom LR', 'Bom CR', 'BCR', 'Mh LJ', 'Cal LJ', 'CLJ', 'CHN', 'Cal WN', 'CWN', 'Ker LT', 'KLT',
    'KLJ', 'Kar LJ', 'Guj LR', 'GLR', 'GLH', 'RLW', 'RLR', 'Raj LW', 'Ori LR', 'OLR', 'MPLJ',
    'MPJR', 'MPHT', 'ALT', 'ALD', 'APLJ', 'CTC', 'LW', 'PLR', 'RCR', 'Cr LJ', 'CrLJ', 'Crimes',
    'Gau LT', 'GLT', 'JLJ', 'JCR', 'HLR', 'SLR', 'SLJ', 'LLJ', 'FLR', 'Lab IC', 'LIC', 'ACJ',
    'TAC', 'ACC', 'CCR', 'JT', 'SCALE', 'Scale', 'SCJ', 'ITR', 'Taxman', 'Comp Cas', 'CompCas',
    'ELT', 'STC', 'CTR', 'Arb LR', 'MAC', 'UJ',
  ].map((r) => r.toLowerCase().replace(/[.\s]+/g, '')),
);

/** The reporter part of a citation. Every form is anchored on a four-digit year. */
const REPORTER_SOURCE = [
  // (2020) 5 SCC 1 · [2020] 3 SCR 12 · (1990) Supp SCC 727 · (2010) 2 Mad LJ 45 · (2020) SCC OnLine SC 1
  String.raw`[(\[](?:1[89]|20)\d{2}[)\]]\s*${SUPP}?(?:\d{1,4}\s*)?${KNOWN_REPORTER}\s*\d+`,
  String.raw`[(\[](?:1[89]|20)\d{2}[)\]]\s*${SUPP}?\d{1,4}\s+(?<other>${OTHER_REPORTER})\s+\d+`,
  // AIR 1955 SC 481 · AIR 2014 Pat 12
  String.raw`\bAIR\s+(?:1[89]|20)\d{2}\s+[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)?\s+\d+`,
  // 2021 SCC OnLine SC 123 · 2014 Cri LJ 3870 · 1990 (Supp) SCC 727 · 2019 (9) SCC 24
  String.raw`\b(?:1[89]|20)\d{2}\s+(?:\(\d{1,4}\)\s*|${SUPP})?${KNOWN_REPORTER}\s*\d+`,
].join('|');

function reporterPattern(): RegExp {
  return new RegExp(REPORTER_SOURCE, 'g');
}

/** A capitalised word or an initial: "Arnesh", "M.", "D'Souza". */
const CAP_WORD = String.raw`[A-Z][A-Za-z0-9'’.&-]*`;
/** One word of a party's name after its first: a capitalised word, or a bracket such as "(NCT of Delhi)". */
const NAME_WORD = String.raw`(?:${CAP_WORD}|\([^()\n]{1,40}\))`;
const NAME_JOIN = String.raw`(?:of|and|the|for|through|de|da|del|von|van|bin|binti)`;
/** Words that open a sentence before a case name and are not part of it: "See", "In", "Accordingly". */
const LEAD_WORD = String.raw`(?:See|In|Also|Cf|Per|As|Vide|Following|Applying|Relying|Reliance|Relied|Further|Similarly|Thus|Hence|Likewise|The|Hon'ble|Hon’ble|Accordingly|Therefore|Moreover|However|Furthermore|Additionally|Consequently|Notably|Indeed|Again|Here|Since|Where|Whereas|While|Under|By|Then|Finally|Lastly|Thereafter|This|That|Learned|Ld)\b`;
/**
 * A party's name. Its first word is a capitalised word, never a bracket, so a
 * sub-point marker such as "(a)" stays out of the name (review T-148 round 1).
 */
const PARTY = String.raw`(?<![A-Za-z0-9'’.&-])(?!${LEAD_WORD})${CAP_WORD}(?:\s+(?:${NAME_WORD}|${NAME_JOIN}))*?`;
/** The case name that ends where the reporter begins, with an optional comma between. */
const CASE_NAME_BEFORE = new RegExp(
  String.raw`(${PARTY})\s+(?:v\.?|vs\.?|versus)\s+(${PARTY})[\s,]*$`,
);

/** Public parties that appear in many briefs; on their own they do not show the advocate named the case. */
const GENERIC_PARTY =
  /^(?:the\s+)?(?:state|union of india|govt|government|directorate|central bureau|cbi|commissioner|municipal|nct|enforcement|ed)\b/i;

/** Lower case words, no punctuation: "(2020) 5 S.C.C. 1" and "(2020) 5 SCC 1" read alike. */
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

/** As `words`, with "vs" and "versus" read as "v", so "A vs. B" and "A v. B" match. */
function caseWords(text: string): string {
  return words(text).replace(/\b(?:vs|versus)\b/g, 'v');
}

function reporterKey(text: string): string {
  return words(text).replace(/\s+/g, '');
}

export interface CitationCheckResult {
  /** The text with every citation the advocate did not give replaced. */
  text: string;
  /** How many citations were replaced or cut back. */
  removed: number;
}

interface Found {
  start: number;
  end: number;
  name: string | null;
  parties: string[];
  reporter: string;
  reporterStart: number;
}

/**
 * Where each word of `party` begins that could begin a name on its own: a
 * capitalised word, not a bracket or a joining word. The first is always 0.
 */
function wordStarts(party: string): number[] {
  const starts = [0];
  for (const m of party.matchAll(/\s+(?=[A-Z])/g)) starts.push((m.index ?? 0) + m[0].length);
  return starts;
}

function findCitations(text: string): Found[] {
  const out: Found[] = [];
  let from = 0;
  for (const m of text.matchAll(reporterPattern())) {
    const reporterStart = m.index ?? 0;
    const other = m.groups?.other;
    // Look back no further than the line, the previous citation, or 250 characters.
    const lineStart = text.lastIndexOf('\n', reporterStart - 1) + 1;
    const lookFrom = Math.max(from, lineStart, reporterStart - 250);
    const before = text.slice(lookFrom, reporterStart);
    const named = CASE_NAME_BEFORE.exec(before);
    // A year-volume-page form with an unknown abbreviation is a citation only after a case name.
    if (other !== undefined && !named && !KNOWN_OTHER_REPORTERS.has(other.toLowerCase().replace(/[.\s]+/g, ''))) {
      continue;
    }
    const start = named ? lookFrom + (named.index ?? 0) : reporterStart;
    const end = reporterStart + m[0].length;
    out.push({
      start,
      end,
      name: named ? before.slice(named.index ?? 0).replace(/[\s,]+$/, '') : null,
      parties: named ? [named[1], named[2]] : [],
      reporter: m[0],
      reporterStart,
    });
    from = end;
  }
  return out;
}

/**
 * Replace every case citation the advocate did not give (criteria 3 and 4).
 * `given` is everything the advocate wrote: the brief's values and the
 * description. Nothing from the rule pack, the court rules or a model.
 */
export function removeUngivenCitations(text: string, given: string[]): CitationCheckResult {
  // The reporters the advocate wrote, by their key, each exactly as written.
  const givenReporters = new Map<string, string>();
  for (const g of given) {
    for (const m of g.matchAll(reporterPattern())) {
      const key = reporterKey(m[0]);
      if (!givenReporters.has(key)) givenReporters.set(key, m[0]);
    }
  }
  const givenWords = ` ${caseWords(given.join('\n'))} `;
  const partyGiven = (party: string): boolean => {
    const w = words(party);
    return w.length > 0 && !GENERIC_PARTY.test(w) && givenWords.includes(` ${w} `);
  };
  /**
   * The case name in the advocate's own words, and nothing more
   * (AJ-2026-10-07-T148-2 (b)). The whole "A v. B" stays only if the advocate
   * wrote it; otherwise only the party the advocate named is kept, and any
   * party the model added ("v. State of Bihar") is stripped.
   */
  const nameGivenInFull = (name: string): boolean => {
    const w = caseWords(name);
    return w.length > 0 && givenWords.includes(` ${w} `);
  };
  /**
   * Leading words the lookback took into party 1 that are not part of the
   * name ("Accordingly Arnesh Kumar") are given back to the text: drop them
   * one at a time until the name, or party 1, is one the advocate wrote
   * (review T-148 round 1). A cut-down party 1 must keep two words or more,
   * so a common surname on its own ("Kumar") does not count as given.
   */
  const trimLead = (c: Found): Found => {
    if (c.name === null) return c;
    const party1 = c.parties[0];
    for (const at of wordStarts(party1)) {
      const suffix = party1.slice(at);
      if (at > 0 && suffix.trim().split(/\s+/).length < 2) break;
      const name = c.name.slice(at);
      if (nameGivenInFull(name) || partyGiven(suffix)) {
        return at === 0 ? c : { ...c, start: c.start + at, name, parties: [suffix, c.parties[1]] };
      }
    }
    return c;
  };
  const givenName = (c: Found): string => {
    const name = c.name ?? '';
    const w = caseWords(name);
    if (w.length > 0 && givenWords.includes(` ${w} `)) return name;
    const party = c.parties.find(partyGiven);
    return party ?? name;
  };

  let out = '';
  let at = 0;
  let removed = 0;
  for (const c of findCitations(text).map(trimLead)) {
    out += text.slice(at, c.start);
    at = c.end;
    const asGiven = givenReporters.get(reporterKey(c.reporter));
    const nameGiven = c.parties.some(partyGiven);
    if (asGiven !== undefined && c.name === null) {
      // A reporter the advocate gave, with no name before it.
      out += asGiven;
    } else if (asGiven !== undefined && nameGiven) {
      // Given by the advocate: their name and their reporter, in their own form.
      const name = givenName(c);
      if (name === c.name) {
        out += text.slice(c.start, c.reporterStart) + asGiven;
      } else {
        out += `${name} ${asGiven}`;
        removed += 1;
      }
    } else if (c.name !== null && nameGiven) {
      // The advocate named the case but did not give this reporter.
      out += `${givenName(c)} ${AUTHORITY_BLANK}`;
      removed += 1;
    } else {
      out += AUTHORITY_BLANK;
      removed += 1;
    }
  }
  out += text.slice(at);
  return { text: out, removed };
}

/** The finding shown on the result page when a citation was removed. One line, however many. */
export function citationWarnings(removed: number): ValidationWarning[] {
  if (removed === 0) return [];
  return [{ type: 'case_citation', message: CITATION_REMOVED_MESSAGE }];
}
