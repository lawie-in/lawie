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
    'Mad LJ',
    'MLJ',
    'All LJ',
    'ALJ',
    'ALR',
    'AWC',
    'BLJR',
    'PLJR',
    'PLJ',
    'DLT',
    'DRJ',
    'AD',
    'Bom LR',
    'Bom CR',
    'BCR',
    'Mh LJ',
    'Cal LJ',
    'CLJ',
    'CHN',
    'Cal WN',
    'CWN',
    'Ker LT',
    'KLT',
    'KLJ',
    'Kar LJ',
    'Guj LR',
    'GLR',
    'GLH',
    'RLW',
    'RLR',
    'Raj LW',
    'Ori LR',
    'OLR',
    'MPLJ',
    'MPJR',
    'MPHT',
    'ALT',
    'ALD',
    'APLJ',
    'CTC',
    'LW',
    'PLR',
    'RCR',
    'Cr LJ',
    'CrLJ',
    'Crimes',
    'Gau LT',
    'GLT',
    'JLJ',
    'JCR',
    'HLR',
    'SLR',
    'SLJ',
    'LLJ',
    'FLR',
    'Lab IC',
    'LIC',
    'ACJ',
    'TAC',
    'ACC',
    'CCR',
    'JT',
    'SCALE',
    'Scale',
    'SCJ',
    'ITR',
    'Taxman',
    'Comp Cas',
    'CompCas',
    'ELT',
    'STC',
    'CTR',
    'Arb LR',
    'MAC',
    'UJ',
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

/*
 * How a case name is found (T-263, Ajay's rule AJ-2026-10-12-T263, its
 * addendum of 12 Oct 2026, c765ae7, and Addendum 2, 0e452b6).
 *
 * Rule 1: the citation is anchored on the nearest versus word before the
 * reporter in the same sentence (Addendum 2, Q2). Versus words are decided by
 * `isVersusAt` (Addendum 4, Q5); sentence ends by `endsSentenceAt` (rule 4,
 * Addendum 4, Q6).
 * Rule 2: the second party is everything between the versus word and the
 * reporter: commas, line breaks, and full stops that do not end a sentence
 * under rule 4 ("Ltd.,", "Dept. (2016)"). Rule 3: the first party is found by
 * walking back from the versus word over name tokens. Rule 4: sentence ends,
 * which stop that walk, are decided by `endsSentenceAt`. Rule 5: if no name
 * token stands before the versus word, the blank is cut back to the nearer of
 * the previous sentence end or ten tokens.
 */

/**
 * Rule 1: a candidate versus word, with whitespace on both sides, so "(v)" and
 * words containing "vs" are not anchors. Any case (Addendum 4, Q5); a capital
 * "V" or "V." is then checked by `isVersusAt`.
 */
const VERSUS_CANDIDATE = /(?<=\s)(?:versus|vs\.?|v\/s|v\.?)(?=\s)/gi;
/**
 * Addendum 4, Q5: v, v., vs, vs., versus and v/s are versus words in any case
 * ("Vs.", "VS", "Versus", "VERSUS", "V/s", "V/S"). A capital "V" or "V." is one
 * too, unless the word before it is an initial or a title (`isVersusAt`).
 */
const VERSUS_ANY_CASE = /^(?:v|v\.|vs|vs\.|versus|v\/s)$/i;
/** Addendum 4, Q5: after one of these titles, a capital "V" or "V." is an initial: "Dr. V. Rao". */
const TITLES_BEFORE_INITIAL = new Set([
  'Dr',
  'Smt',
  'Shri',
  'Sri',
  'Md',
  'Mr',
  'Mrs',
  'Ms',
  'Prof',
  'Kum',
]);
/** Addendum 4, Q6: these marks end a sentence when a space or the end of the text follows. */
const SENTENCE_END_MARKS = new Set(['?', '!', '\u0964', '\u0965']);
/**
 * How far before the reporter the versus word may stand, in characters. With
 * the blank-line stop, approved by Ajay (Addendum 2, Q1): the search back from
 * a reporter for the versus word stops at a blank line or 250 characters.
 */
const VERSUS_LOOKBACK = 250;
/** Rule 3: the first party has at most ten tokens. */
const MAX_PARTY1_TOKENS = 10;

/** Rule 3 name tokens. A capitalised word, an initial or a title: "Arnesh", "M.", "K.M.", "Dr.", "D'Souza", "Ltd.,". */
const CAP_TOKEN = /^[A-Z][A-Za-z0-9'’.&-]*,?$/;
/** Rule 3 name tokens. A bracket such as "(I)" or "(NCT of Delhi)". */
const BRACKET_TOKEN = /^\([^()\n]{1,40}\),?$/;
/**
 * Rule 3 joining words. The last seven ("de" to "binti") are kept from T-148's
 * name matching; they only ever widen a name, never narrow it.
 */
const JOIN_TOKENS = new Set([
  'of',
  'and',
  'the',
  'for',
  'through',
  'alias',
  '@',
  '&',
  'Anr.',
  'Ors.',
  'de',
  'da',
  'del',
  'von',
  'van',
  'bin',
  'binti',
]);
/** One token of the text before the versus word: a bracket group, or a run of non-space characters. */
const TOKEN = /\([^()\n]{1,40}\),?|\S+/g;

/** Words that open a sentence before a case name and are not part of it: "See", "In", "Accordingly". */
const LEAD_WORD = String.raw`(?:See|In|Also|Cf|Per|As|Vide|Following|Applying|Relying|Reliance|Relied|Further|Similarly|Thus|Hence|Likewise|The|Hon'ble|Hon’ble|Accordingly|Therefore|Moreover|However|Furthermore|Additionally|Consequently|Notably|Indeed|Again|Here|Since|Where|Whereas|While|Under|By|Then|Finally|Lastly|Thereafter|This|That|Learned|Ld)\b`;
/** A whole token that is a lead word, case as written: "The" is a lead word, "the" is a joining word. */
const LEAD_TOKEN = new RegExp(String.raw`^${LEAD_WORD},?$`);

/**
 * Rule 4 (addendum, c765ae7): words after which a full stop never ends a
 * sentence. Ajay's list, case as written. "Hon’ble" with a curly apostrophe
 * is read as "Hon'ble" (see `endsSentenceAt`).
 */
const NOT_A_SENTENCE_END_ABBREVIATIONS = new Set([
  'Ltd',
  'Pvt',
  'Ors',
  'Anr',
  'Dept',
  'Govt',
  'Co',
  'Corp',
  'Corpn',
  'Inc',
  'Bros',
  'Assn',
  'Secy',
  'Comm',
  'Commr',
  'Addl',
  'Dy',
  'Dist',
  "Hon'ble",
  'No',
  'Nos',
  'Smt',
  'Shri',
  'Sri',
  'Dr',
  'Mr',
  'Mrs',
  'Ms',
  'Md',
  'Prof',
  'Kum',
  'etc',
]);
/** Rule 4: single or double capital letters, with or without full stops: "M", "K.M", "KM", "A.K". */
const INITIALS = /^[A-Z]\.?[A-Z]?$/;
/** Rule 4: after the full stop, a space and then a word starting with a capital letter. */
const NEXT_WORD_CAPITAL = /\s+[A-Z]/y;

/** The whitespace-separated word that ends before `at`, skipping whitespace: "" at the start of the text. */
function wordBefore(text: string, at: number): string {
  let i = at - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  const end = i + 1;
  while (i >= 0 && !/\s/.test(text[i])) i -= 1;
  return text.slice(i + 1, end);
}

/**
 * Addendum 4, Q5: is `word`, which starts at `text[at]`, a versus word? Any
 * case form of v, v., vs, vs., versus or v/s is. A capital "V" or "V." is not
 * when the word before it is an initial or a title (one or two capital
 * letters, or Dr, Smt, Shri, Sri, Md, Mr, Mrs, Ms, Prof, Kum): "K. V. Rao" and
 * "Dr. V. Rao" keep V as an initial, while "Ram V. Shyam" is a case name.
 */
function isVersusAt(text: string, at: number, word: string): boolean {
  if (!VERSUS_ANY_CASE.test(word)) return false;
  if (word !== 'V' && word !== 'V.') return true;
  const before = wordBefore(text, at)
    .replace(/^[("“‘'[]+/, '')
    .replace(/\.$/, '');
  return !(INITIALS.test(before) || TITLES_BEFORE_INITIAL.has(before));
}

/**
 * Does the character at `text[i]` end a sentence?
 * - "?", "!", "।" or "॥" (Addendum 4, Q6): yes, when a space or the end of
 *   the text follows. Rule 4's abbreviation exceptions do not apply to them.
 * - A full stop (rule 4, addendum c765ae7; Addendum 2, Q3): only when the
 *   word before it is not an abbreviation, initials or a versus word, AND the
 *   next word starts with a capital letter after a space. So a full stop
 *   followed by "(", a digit or a comma never ends a sentence.
 * Used for the first party's walk and, per Addendum 2 Q2, to keep the search
 * for the versus word inside the reporter's sentence.
 */
function endsSentenceAt(text: string, i: number): boolean {
  if (SENTENCE_END_MARKS.has(text[i])) return i + 1 >= text.length || /\s/.test(text[i + 1]);
  if (text[i] !== '.') return false;
  NEXT_WORD_CAPITAL.lastIndex = i + 1;
  if (!NEXT_WORD_CAPITAL.test(text)) return false;
  const wordStart =
    Math.max(
      text.lastIndexOf(' ', i - 1),
      text.lastIndexOf('\n', i - 1),
      text.lastIndexOf('\t', i - 1),
    ) + 1;
  const word = text
    .slice(wordStart, i)
    .replace(/^[("“‘'[]+/, '')
    .replace(/’/g, "'");
  if (NOT_A_SENTENCE_END_ABBREVIATIONS.has(word)) return false;
  if (INITIALS.test(word)) return false;
  if (VERSUS_ANY_CASE.test(word)) return false;
  return true;
}

/** Where the sentence that holds `hi` begins, looking back no further than `lo` (rule 4, Addendum 4 Q6). */
function sentenceStart(text: string, lo: number, hi: number): number {
  for (let i = hi - 1; i >= lo; i -= 1) if (endsSentenceAt(text, i)) return i + 1;
  return lo;
}

/** Where the paragraph that holds `at` begins: after the last blank line before it. */
function paragraphStart(text: string, at: number): number {
  let start = 0;
  for (const m of text.slice(0, at).matchAll(/\n[ \t]*\n/g)) start = (m.index ?? 0) + m[0].length;
  return start;
}

/**
 * Addendum 5, Q7: "?", "!", ",", ";" or ":" glued between two words with no
 * space ("Shyam?Mohan") is a word break inside one whitespace-separated word.
 */
const GLUED_MARK = /(?<=[\p{L}\p{N}])[?!,;:](?=[\p{L}\p{N}])/gu;
const isGluedAt = (text: string, i: number): boolean =>
  i > 0 &&
  i + 1 < text.length &&
  /[\p{L}\p{N}]/u.test(text[i - 1]) &&
  /[\p{L}\p{N}]/u.test(text[i + 1]);

/**
 * Rule 3: the hard limit for the first party, walking back from `versusStart`
 * no further than `lo`: the end of the previous sentence (rule 4, Addendum 4 Q6), a
 * semicolon, a colon, an opening quotation mark, or a line start. A semicolon
 * or colon glued between two words is a word break, not a limit (Addendum 5, Q7).
 */
function party1Limit(text: string, lo: number, versusStart: number): number {
  for (let i = versusStart - 1; i >= lo; i -= 1) {
    const ch = text[i];
    if ((ch === ';' || ch === ':') && !isGluedAt(text, i)) return i + 1;
    if (ch === '\n' || ch === '“' || ch === '‘') return i + 1;
    if ((ch === '"' || ch === "'") && (i === 0 || /\s/.test(text[i - 1]))) return i + 1;
    if (endsSentenceAt(text, i)) return i + 1;
  }
  return lo;
}

/**
 * A token the first party's walk goes over. A versus word is one (Addendum 2,
 * Q3): with two names and a reporter only on the second, both names go, so no
 * versus word is left standing directly before the blank.
 */
interface Token {
  t: string;
  at: number;
  /** Where the whitespace-separated word holding this token starts. */
  wordAt: number;
  /** True if a glued mark joins this token to the next one (Addendum 5, Q7). */
  glued: boolean;
}

/** The tokens of `text[from, to)`, with each glued word split at its glued marks (Addendum 5, Q7). */
function tokensOf(text: string, from: number, to: number): Token[] {
  const out: Token[] = [];
  for (const m of text.slice(from, to).matchAll(TOKEN)) {
    const wordAt = from + (m.index ?? 0);
    const word = m[0];
    let partAt = 0;
    // A bracket group such as "(NCT of Delhi)" is one token, glued marks and all.
    for (const g of BRACKET_TOKEN.test(word) ? [] : word.matchAll(GLUED_MARK)) {
      const gi = g.index ?? 0;
      out.push({ t: word.slice(partAt, gi), at: wordAt + partAt, wordAt, glued: true });
      partAt = gi + 1;
    }
    out.push({ t: word.slice(partAt), at: wordAt + partAt, wordAt, glued: false });
  }
  return out;
}
const isNameToken = (text: string, { t, at }: Token): boolean =>
  CAP_TOKEN.test(t) || BRACKET_TOKEN.test(t) || JOIN_TOKENS.has(t) || isVersusAt(text, at, t);
/** Party 1 never starts with a joining word, a bracket or a versus word, so "and" or "(a)" before it stays in the text. */
const isEdgeToken = (text: string, { t, at }: Token): boolean =>
  BRACKET_TOKEN.test(t) || JOIN_TOKENS.has(t) || isVersusAt(text, at, t);

/**
 * Rules 3 and 5: where the first party begins, walking back from the versus
 * word. Returns the start offset in `text`; equal to `versusStart` only if
 * nothing at all stands before the versus word within the limit.
 *
 * Addendum 5, Q7: no part of a name may stand beside a blank. If the walk
 * would stop inside a glued word ("shyam?Mohan Rao v. ..."), where party 1
 * begins cannot be told, and rule 5's cut-back applies. A glued edge token is
 * not trimmed off, for the same reason.
 */
function party1Start(text: string, lo: number, versusStart: number): number {
  const limit = party1Limit(text, lo, versusStart);
  const tokens = tokensOf(text, limit, versusStart);
  const kept: Token[] = [];
  let splitsWord = false;
  for (let k = tokens.length - 1; k >= 0; k -= 1) {
    const stop =
      kept.length >= MAX_PARTY1_TOKENS ||
      LEAD_TOKEN.test(tokens[k].t) ||
      !isNameToken(text, tokens[k]);
    if (stop) {
      splitsWord = tokens[k].glued;
      break;
    }
    kept.unshift(tokens[k]);
  }
  while (kept.length > 0 && !kept[0].glued && isEdgeToken(text, kept[0])) kept.shift();
  if (kept.length > 0 && !splitsWord) return kept[0].at;
  // Rule 5: no name token before the versus word, or the walk stopped inside
  // a glued word (Addendum 5, Q7), so where party 1 begins cannot be told.
  // Cut back to the nearer of the limit (the previous sentence end) or ten
  // tokens, always at the start of a whole word.
  const back = tokens.slice(-MAX_PARTY1_TOKENS);
  return back.length > 0 ? back[0].wordAt : versusStart;
}

/**
 * Ajay's Q4 (12 Oct 2026; Addendum 3, ac4dcae), in its general form: after
 * any cut, no versus word may stand directly before a blank unless the
 * advocate wrote that name. Whenever the text just before the blank ends in a
 * versus word, whatever stopped the walk for party 1 (the ten-token limit, a
 * line start or anything else), the cut goes back to the start of the
 * sentence (rule 4). It is bounded only by `bound`, the previous citation's
 * end or the paragraph start, not by VERSUS_LOOKBACK: the walk can already
 * stand further back than that, and a wider blank is safe. T-148 (b) is
 * unchanged: `trimLead` still gives back the words before a name the advocate
 * wrote.
 */
function cutBackPastVersusWord(text: string, bound: number, start: number): number {
  if (start <= bound) return start;
  // The last word before the blank, if it lies wholly after `bound`.
  let end = start;
  while (end > bound && /\s/.test(text[end - 1])) end -= 1;
  let at = end;
  while (at > bound && !/\s/.test(text[at - 1])) at -= 1;
  if (at === end || !isVersusAt(text, at, text.slice(at, end))) return start;
  let cut = sentenceStart(text, bound, start);
  while (cut < start && /\s/.test(text[cut])) cut += 1;
  return cut;
}

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
    // Rules 1 and 2: the nearest versus word before the reporter. A comma or
    // a line break does not end the name. The search stops at the previous
    // citation, a blank line or VERSUS_LOOKBACK characters (Addendum 2, Q1),
    // and at the end of the previous sentence under rule 4 (Addendum 2, Q2).
    const lo = Math.max(from, paragraphStart(text, reporterStart), reporterStart - VERSUS_LOOKBACK);
    let versus: { start: number; end: number } | null = null;
    VERSUS_CANDIDATE.lastIndex = sentenceStart(text, lo, reporterStart);
    for (
      let v = VERSUS_CANDIDATE.exec(text);
      v && v.index < reporterStart;
      v = VERSUS_CANDIDATE.exec(text)
    ) {
      if (v.index + v[0].length <= reporterStart && isVersusAt(text, v.index, v[0]))
        versus = { start: v.index, end: v.index + v[0].length };
    }
    // A year-volume-page form with an unknown abbreviation is a citation only after a case name.
    if (
      other !== undefined &&
      !versus &&
      !KNOWN_OTHER_REPORTERS.has(other.toLowerCase().replace(/[.\s]+/g, ''))
    ) {
      continue;
    }
    const end = reporterStart + m[0].length;
    if (!versus) {
      // Rule 7: no versus word, reporter present, unchanged: the reporter alone.
      out.push({
        start: reporterStart,
        end,
        name: null,
        parties: [],
        reporter: m[0],
        reporterStart,
      });
      from = end;
      continue;
    }
    // Rule 3: party 1 is walked back from the versus word, no further than the previous citation.
    const party1Bound = Math.max(from, paragraphStart(text, versus.start));
    const walked = party1Start(text, party1Bound, versus.start);
    const start = cutBackPastVersusWord(text, party1Bound, walked);
    const party1 = text.slice(start, versus.start).replace(/\s+$/, '');
    const party2 = text
      .slice(versus.end, reporterStart)
      .replace(/^\s+/, '')
      .replace(/[\s,]+$/, '');
    out.push({
      start,
      end,
      name: text.slice(start, reporterStart).replace(/[\s,]+$/, ''),
      parties: [party1, party2],
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
