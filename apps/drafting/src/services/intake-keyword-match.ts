/**
 * T-610: the keyword pass of the Matcher (ADR-drafting-v3 section 3 row B).
 *
 * A pure, code-only pass over the description, run before the MATCH model call.
 * It returns a ranked list of template ids. It never decides a match on its own,
 * never drafts and never spends Ink (rule 1): the ranking only orders the top-3
 * pick, and is the fallback pick when the model's answer is unusable.
 *
 * LEGAL CONTENT: the phrase table is Ajay's, signed 26 Oct 2026
 * (`handoff/legal/T-610-matcher-bail-rules-signed.md`, section B) and lives in
 * `src/config/intake/match-keywords.json`. The rules and tie rules below are
 * that document's code rules, by id. Do not change either without his sign-off.
 *
 * Privacy: nothing here logs or returns any text from the description.
 */
// Imported, not read from disk, so tsc emits it into dist with the code (the
// production image ships dist only; the build script copies no other intake file).
import keywordFile from '../config/intake/match-keywords.json';

/** The file's shape: `{ "<templateId>": ["phrase", ...] }`. File order is the tie order. */
export type MatchKeywordTable = Record<string, string[]>;

export interface KeywordCandidate {
  templateId: string;
  /** Distinct phrases of this template found in the description. */
  hits: number;
}

const BAIL_REGULAR = 'bail_regular';
const BAIL_ANTICIPATORY = 'bail_anticipatory';

// ── Normalising (rule 2) ────────────────────────────────────────────────────

const NUKTA = '़';
const JA = 'ज';

/**
 * Lower case, one space between words, the same quotes and hyphens throughout.
 * Rule 2: `s.`, `sec.`, `section`, `u/s` before a number are dropped, and
 * `CrPC`, `Cr.P.C.`, `Cr PC` all read `crpc`; so "s.483 BNSS", "Section 439
 * Cr.P.C." and "u/s 439 CrPC" read "483 bnss" / "439 crpc". The nukta on ज is
 * dropped, so ज़मानत and जमानत are the same word.
 */
export function normaliseForKeywords(text: string): string {
  return (
    text
      // NFKC splits the precomposed ज़ (U+095B) into ज + nukta.
      .normalize('NFKC')
      .split(JA + NUKTA)
      .join(JA)
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(/[‐-―]/g, '-')
      .toLowerCase()
      .replace(/(?<![a-z0-9])cr\s*\.?\s*p\s*\.?\s*c(?![a-z0-9])\.?/g, 'crpc')
      .replace(/(?<![a-z0-9])(?:u\s*\/\s*s|sections?|secs?|s)\s*\.?\s*(?=\d)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Latin-script phrases match whole words only. Other scripts match as written. */
function phrasePattern(phrase: string): RegExp {
  const body = escapeRegExp(phrase).replace(/ /g, ' +');
  return /^[\x20-\x7e]+$/.test(phrase)
    ? new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`)
    : new RegExp(body);
}

/** Rule 3: a phrase that is a section number, such as "483 bnss" or "187(3) bnss". */
function isSectionPhrase(phrase: string): boolean {
  return /^\d/.test(phrase);
}

/** Rule 3: the description says bail (जमानत; ज़मानत reads the same after normalising). */
const BAIL_WORD = /(?<![a-z0-9])bail|जमानत/;

/**
 * T610-T2: a bare `482`, or `482 crpc`, adds no weight to any bail pack (old
 * CrPC s.482 means quashing). "482 bnss" is an anticipatory phrase and counts.
 * T610-T6: the word `magistrate` alone is not a keyword.
 * Such entries are dropped from the table if they ever appear in it.
 */
function isIgnoredPhrase(phrase: string): boolean {
  return phrase === '482' || phrase === '482 crpc' || phrase === 'magistrate';
}

/** T610-T1: a Magistrate refused or rejected bail. The phrases are Ajay's, as signed. */
const MAGISTRATE_REFUSED = [
  'magistrate refused',
  'magistrate rejected',
  'rejected by the magistrate',
  'cjm rejected',
  'refused by the magistrate',
].map((p) => phrasePattern(normaliseForKeywords(p)));

// ── Loading ─────────────────────────────────────────────────────────────────

interface CompiledPhrase {
  pattern: RegExp;
  section: boolean;
}

interface CompiledEntry {
  templateId: string;
  phrases: CompiledPhrase[];
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[intake] ${message}`);
}

/**
 * Reads the table. Never throws: a value not in the `{ "<templateId>":
 * [phrases] }` shape gives an empty table and one warning per process.
 * Entries that are not a list of strings are skipped.
 */
export function parseMatchKeywords(raw: unknown): MatchKeywordTable {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnOnce('match-keywords.json is not an object of template ids; keyword pass is off');
    return {};
  }
  const out: MatchKeywordTable = {};
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const phrases = list.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
    if (phrases.length > 0) out[id] = phrases;
  }
  if (Object.keys(out).length === 0)
    warnOnce('match-keywords.json has no phrases; keyword pass is off');
  return out;
}

/** Ajay's signed table (T-610 section B), as shipped with the code. */
export function loadMatchKeywords(): MatchKeywordTable {
  return parseMatchKeywords(keywordFile as unknown);
}

function compile(table: MatchKeywordTable): CompiledEntry[] {
  return Object.entries(table).map(([templateId, list]) => {
    const seen = new Set<string>();
    const phrases: CompiledPhrase[] = [];
    for (const raw of list) {
      const phrase = normaliseForKeywords(raw);
      if (phrase === '' || seen.has(phrase) || isIgnoredPhrase(phrase)) continue;
      seen.add(phrase);
      phrases.push({ pattern: phrasePattern(phrase), section: isSectionPhrase(phrase) });
    }
    return { templateId, phrases };
  });
}

let compiled: CompiledEntry[] | null = null;

function defaultEntries(): CompiledEntry[] {
  if (compiled === null) compiled = compile(loadMatchKeywords());
  return compiled;
}

/** For tests: forget the loaded table and the warning, so the next call reads the file again. */
export function resetMatchKeywords(): void {
  compiled = null;
  warned = false;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

/**
 * The template ids the description points to, best first. Only ids in
 * `allowed` (when given) are returned. The caller takes the top 3.
 *
 * Score: the number of a template's distinct phrases found. Ties keep the
 * file's order. Then the tie rules, in order:
 * - T610-T1: a Magistrate refused or rejected bail → bail_regular first, even
 *   when a bail_before_magistrate phrase also matches. Only when the
 *   description says bail (rule 3's bail words).
 * - T610-T2: bare 482 / 482 crpc carry no weight (dropped at compile time).
 * - T610-T3: default_bail ranks first only on its own phrases, and
 * - T610-T4: bail_cancellation ranks first only on its own phrases: nothing
 *   here adds weight to either from any other cue ("chargesheet not filed" is
 *   not a keyword).
 * - T610-T5: anticipatory and regular phrases both found → neither is ranked
 *   here; the model decides (rule A, arrested vs not arrested). This applies
 *   after T1.
 * - T610-T6: "magistrate" alone is not a keyword (dropped at compile time).
 */
export function rankKeywordCandidates(
  description: string,
  allowed?: ReadonlySet<string>,
  table?: MatchKeywordTable,
): KeywordCandidate[] {
  return matchKeywords(description, allowed, table).candidates;
}

export interface KeywordMatch {
  /** The ranking, best first (as rankKeywordCandidates). */
  candidates: KeywordCandidate[];
  /**
   * T610-T5 (Ajay F2/F2a/F2b, 1bf3df1a, f0985461, edfe8645): when T5 removed both bail ids,
   * the pair, in this fixed order: [bail_regular, bail_anticipatory]. Only when
   * both are allowed (if `allowed` is given). Used only on the failure path,
   * when the model has failed twice; otherwise T5 leaves it to the model.
   */
  t5Pair: [string, string] | null;
}

/** rankKeywordCandidates, plus the pair T5 removed. */
export function matchKeywords(
  description: string,
  allowed?: ReadonlySet<string>,
  table?: MatchKeywordTable,
): KeywordMatch {
  const entries = table ? compile(table) : defaultEntries();
  if (entries.length === 0) return { candidates: [], t5Pair: null };
  const text = normaliseForKeywords(description);
  const saysBail = BAIL_WORD.test(text);

  const scored: KeywordCandidate[] = [];
  for (const entry of entries) {
    let hits = 0;
    for (const p of entry.phrases) {
      // Rule 3: a section number counts only when the description says bail.
      if (p.section && !saysBail) continue;
      if (p.pattern.test(text)) hits += 1;
    }
    if (hits > 0) scored.push({ templateId: entry.templateId, hits });
  }
  // Stable sort: equal scores keep the file's order.
  let ranked = scored.sort((a, b) => b.hits - a.hits);

  // T610-T1
  if (saysBail && MAGISTRATE_REFUSED.some((re) => re.test(text))) {
    const regular = ranked.find((c) => c.templateId === BAIL_REGULAR) ?? {
      templateId: BAIL_REGULAR,
      hits: 0,
    };
    ranked = [regular, ...ranked.filter((c) => c.templateId !== BAIL_REGULAR)];
  }

  // T610-T5: judged on phrases found, not on T1's cue.
  let t5Pair: [string, string] | null = null;
  const found = new Set(scored.filter((c) => c.hits > 0).map((c) => c.templateId));
  if (found.has(BAIL_REGULAR) && found.has(BAIL_ANTICIPATORY)) {
    ranked = ranked.filter(
      (c) => c.templateId !== BAIL_REGULAR && c.templateId !== BAIL_ANTICIPATORY,
    );
    // T610-T5 (Ajay F2/F2a/F2b, 1bf3df1a, f0985461, edfe8645): keep the pair for the failure-path fallback.
    if (!allowed || (allowed.has(BAIL_REGULAR) && allowed.has(BAIL_ANTICIPATORY))) {
      t5Pair = [BAIL_REGULAR, BAIL_ANTICIPATORY];
    }
  }

  return {
    candidates: allowed ? ranked.filter((c) => allowed.has(c.templateId)) : ranked,
    t5Pair,
  };
}
