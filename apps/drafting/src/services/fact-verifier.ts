/**
 * The fact verifier (T-147d, ADR-022 section 2C).
 *
 * Every draft written from the fact ledger is checked against that ledger in
 * code, after the parts the system writes are rendered and before the
 * advocate sees anything. No LLM call is made by the checks. Four checks:
 *
 * 1. Unsupported entity. A number, amount, date (relative-time expressions
 *    included), proper noun, police station, court, case number or section in
 *    the Drafter's text must match a ledger `value` or `display` (normalized),
 *    this draft's code-rendered skeleton, or the generic boilerplate allowlist
 *    built from the pack's own static text. Courts, police stations and
 *    sections are checked against the ledger and the skeleton only.
 * 2. Dropped fact. Every fact with `required_in_draft` must appear somewhere
 *    in the printed document (normalized: `Rs 3,00,000` satisfies 300000).
 * 3. Mutation. A date, amount, name or police station that is close to a
 *    ledger fact but not equal to it after normalization; a value bound to the
 *    wrong fact; a value asserted for a key the ledger holds as `unresolved`.
 * 4. Banned phrase. A phrase of a still-banned assertion (`resolveAverments`),
 *    matched exactly as a substring, ignoring case and spacing. Its sentence or
 *    clause is stripped and `{{MISSING: <label of the unlocking fact>}}` put in
 *    its place. A match inside a ledger display printed verbatim is skipped.
 *
 * Flow (`verifyAndRepair`): verify; on failure one targeted repair of the
 * offending paragraphs only; verify again; anything still wrong becomes
 * `{{MISSING: label}}`, and the draft is delivered with a banner. A draft that
 * passes is returned unchanged. Nothing here logs, and nothing here reads the
 * advocate's description.
 *
 * Ajay's ruling: all of this file except the banner wording
 * (`factCheckBannerText`) is legal content (Ajay, 15 Oct 2026, T-116). See
 * `.claude/docs/legal-content-paths.md`. Any change to it needs his signed text.
 * The repair prompt is in `drafter.prompts.ts` (signed: Ajay (CLO), 13 Oct 2026,
 * handoff/legal/T-397-ledger-prompts-signed.md, 86f9d9c). The banner wording
 * is a plain functional string awaiting Priya, Madhuri and Rajesh.
 */
import { createHash } from 'crypto';

import {
  nameKey,
  normalizeAmount,
  normalizeCaseNumber,
  normalizeDate,
  normalizePoliceStation,
  normalizeSectionRef,
} from '@lawie/shared';
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import { conditionHolds, factEntriesByKey, factsByKey, resolveAverments } from './averments';
import type { AvermentCondition, AvermentLists, BannedEntry, ResolvedBan } from './averments';
import { DRAFTER_FACT_REPAIR_SYSTEM_PROMPT } from './drafter.prompts';
import { loadRulePack } from './rule-pack.service';

// ── Versions recorded with every fact-diff row ──────────────────────────────

/** Bump when a check changes what it flags. */
export const VERIFIER_VERSION = 't488-1';

/** First 12 hex characters of the SHA-256 of the repair prompt. */
export const REPAIR_PROMPT_VERSION = createHash('sha256')
  .update(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT)
  .digest('hex')
  .slice(0, 12);

// ── Banner and disclaimer ───────────────────────────────────────────────────
// `factCheckBannerText` is plain functional wording (Priya, Madhuri and Rajesh to word it).
// `FACT_CHECK_DISCLAIMER` is legal content, like all of this file except the banner wording
// (`factCheckBannerText`) (Ajay, 15 Oct 2026, T-116).

export const FACT_CHECK_DISCLAIMER =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';

export function factCheckBannerText(n: number): string {
  return `Please check before you file: ${n} ${n === 1 ? 'item needs' : 'items need'} your attention.`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type FactCheck = 'unsupported' | 'dropped' | 'mutation' | 'banned';
export type FactEntityType =
  | 'date'
  | 'amount'
  | 'name'
  | 'police_station'
  | 'court'
  | 'case_no'
  | 'section'
  | 'phrase';
export type FactResolution = 'repaired' | 'placeholdered' | 'stripped' | 'flagged';
export type FactPhase = 'initial' | 'after_repair';

/** Why a value fails, in the verifier's own terms. Never shown as is. */
export type ViolationReason =
  | 'not_in_facts'
  | 'differs'
  | 'wrong_fact'
  | 'unresolved'
  | 'left_out'
  | 'banned';

export interface FactViolation {
  check: FactCheck;
  entityType: FactEntityType;
  reason: ViolationReason;
  /** The ledger key the value belongs to, or null for a value with no fact. */
  ledgerKey: string | null;
  /** The ledger label, or a plain word for a value with no fact ("date"). */
  label: string;
  /** Index of the body paragraph (blocks separated by a blank line), from 0. */
  paragraphIndex: number;
  /** Start of the value (or of the stripped sentence, for `banned`) in that paragraph. */
  charOffset: number;
  /** Length of the span that a placeholder replaces. 0 for `dropped`. */
  length: number;
  /** The ledger's display for the key, if any. */
  ledgerValue: string | null;
  /** The value as the draft has it. Null for `dropped`; the phrase for `banned`. */
  draftValue: string | null;
  /** Check 4 only. */
  bannedEntryId?: string;
  /** What is wrong, in plain words, for the repair prompt. No legal conclusion. */
  what: string;
}

export interface FactDiffDraft {
  check: FactCheck;
  entityType: FactEntityType;
  bannedEntryId: string | null;
  ledgerKey: string | null;
  label: string;
  paragraphIndex: number;
  charOffset: number;
  ledgerValue: string | null;
  draftValue: string | null;
  resolution: FactResolution;
  phase: FactPhase;
}

export interface FactBannerItem {
  check: FactCheck;
  label: string;
  /** Plain words: "not in your facts". Never "error", never a legal conclusion. */
  note: string;
}

export interface FactBanner {
  text: string;
  items: FactBannerItem[];
  disclaimer: string;
}

export interface VerifierInput {
  /** The Drafter's text: the body only, as it will go into the document. */
  body: string;
  /** The ledger's current facts. */
  facts: readonly LedgerFact[];
  /** The ledger's current unresolved items. */
  unresolved: readonly LedgerUnresolvedFact[];
  /** The pack's averment lists (`loadAvermentLists`). */
  lists: Pick<AvermentLists, 'banned' | 'allowed'>;
  /** This draft's code-rendered parts (cause title, prayer, verification ...) and court line. */
  skeleton: readonly string[];
  /** The pack's static text (`packTexts`), the source of the generic allowlist. */
  packText: readonly string[];
  /** The rule-pack id, for the few section references one pack may state (PACK_SECTION_SCOPE). */
  packId?: string;
}

/**
 * T-471 (Ajay, 15 and 16 Oct 2026): section references a pack's own signed
 * relevantActs hold, accepted for that pack only. No general whitelist. For
 * each pack: the act (as `normalizeSectionRef` names it) and the sections
 * Ajay ruled on; every entry of the pack's relevantActs under one of those
 * sections (144(1) to 144(5), 145) is read from the pack itself.
 */
const PACK_SECTION_SCOPE: Readonly<Record<string, { act: string; sections: readonly string[] }>> = {
  maintenance_bnss_144: { act: 'BNSS', sections: ['144', '145'] },
};

const packSectionKeyCache = new Map<string, readonly string[]>();

/** The `act|section` keys PACK_SECTION_SCOPE allows for this pack, from its relevantActs. */
function packSectionKeys(packId: string | undefined): readonly string[] {
  if (!packId) return [];
  const scope = PACK_SECTION_SCOPE[packId];
  if (!scope) return [];
  const cached = packSectionKeyCache.get(packId);
  if (cached) return cached;
  const keys = new Set<string>();
  for (const act of loadRulePack(packId)?.relevantActs ?? []) {
    for (const sec of act.sections) {
      // "144(1) Proviso" -> "144(1)": the section and its sub-sections only.
      const m = /^\s*(\d+[A-Z]?)((?:\s*\(\s*[0-9a-z]{1,4}\s*\))*)/i.exec(sec.number);
      if (!m || !scope.sections.includes(m[1].toUpperCase())) continue;
      // "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023": the name without its bracket.
      const actName = act.act.replace(/\s*\([^)]*\)/g, '');
      const ref = normalizeSectionRef(`Section ${m[1]}${m[2]} of the ${actName}`);
      if (!ref.ok || ref.value.act !== scope.act) continue;
      keys.add(`${scope.act}|${m[1].toUpperCase()}`);
      keys.add(`${ref.value.act}|${ref.value.section}`);
    }
  }
  const list = [...keys];
  packSectionKeyCache.set(packId, list);
  return list;
}

export interface FactCheckOutcome {
  /** The body to deliver. Identical to the input when the draft passed. */
  body: string;
  /** True when the first verification found nothing. */
  passed: boolean;
  repairRan: boolean;
  /** True when the repair ran and the second verification found nothing. */
  repairFixed: boolean;
  initial: FactViolation[];
  afterRepair: FactViolation[] | null;
  /** One row per violation per phase, for the fact-diff log. */
  records: FactDiffDraft[];
  /** Null when nothing needs the advocate's attention. */
  banner: FactBanner | null;
  /** `{{MISSING: ...}}` placeholders the verifier itself put in. */
  placeholdersAdded: number;
}

/** The repair call: system prompt and user prompt in, the model's text out (null if it failed). */
export type FactRepairCall = (system: string, user: string) => Promise<string | null>;

// ── Text helpers ────────────────────────────────────────────────────────────

/** Lower case, letters and digits only, one space between words. */
export function fold(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

/** A set of texts that a folded word sequence can be looked up in. */
class Corpus {
  private readonly text: string;
  constructor(texts: readonly string[]) {
    this.text = ` ${texts
      .map(fold)
      .filter((t) => t !== '')
      .join(' \n ')} `;
  }
  has(needle: string): boolean {
    const n = fold(needle);
    return n !== '' && this.text.includes(` ${n} `);
  }
  hasFolded(n: string): boolean {
    return n !== '' && this.text.includes(` ${n} `);
  }
}

/** The blanks the system and the Drafter write. Never an entity, never a fact. */
const MARKER_BLANK_RE = /\{\{\s*MISSING\s*:[^}]*\}\}|\[To be confirmed:[^\]]*\]/gi;
const FIXED_BLANK_RE =
  /\[Section — verify before filing\]|\[Authority — add if relied upon\]|_{3,}/g;

/** Words that end in a full stop without ending a sentence. */
const ABBREVIATIONS = new Set([
  'rs',
  'no',
  'nos',
  's',
  'sec',
  'ss',
  'vs',
  'v',
  'mr',
  'mrs',
  'ms',
  'dr',
  'smt',
  'sh',
  'shri',
  'st',
  'ltd',
  'co',
  'pvt',
  'hon',
  'addl',
  'cr',
  'crl',
  'misc',
  'govt',
  'dist',
  'distt',
  'ps',
  'p',
  'r',
  'u',
  'w',
  'd',
  'o',
  'i',
  'e',
  'g',
  'viz',
  'para',
  'paras',
  'art',
  'cl',
  'ch',
  'km',
  'sr',
  'jr',
  'inr',
  'appl',
  'crpc',
  'ipc',
  'bns',
  'bnss',
]);

/** True when `text[j]` ends a sentence or a clause. */
function isBoundary(text: string, j: number): boolean {
  const ch = text[j];
  if (ch === '\n' || ch === ';' || ch === '!' || ch === '?') return true;
  if (ch !== '.') return false;
  const next = text[j + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  const before = /([\p{L}]+)$/u.exec(text.slice(0, j));
  if (before) {
    const w = before[1].toLowerCase();
    if (ABBREVIATIONS.has(w)) return false;
    if (before[1].length === 1) return false;
  }
  // "1." at the start of a numbered paragraph is a number, not an end.
  if (/(?:^|\n)\s*\(?\d{1,3}$/.test(text.slice(0, j))) return false;
  return true;
}

/** The sentence or clause around `at`: [start, end) with the end mark left out. */
function sentenceAround(text: string, at: number, endAt: number): [number, number] {
  let start = 0;
  for (let j = at - 1; j >= 0; j -= 1) {
    if (isBoundary(text, j)) {
      start = j + 1;
      break;
    }
  }
  while (start < text.length && /\s/.test(text[start])) start += 1;
  let end = text.length;
  for (let j = Math.max(endAt, at); j < text.length; j += 1) {
    if (isBoundary(text, j)) {
      end = j;
      break;
    }
  }
  return [start, end];
}

/** True when `at` is the first word of its sentence. */
function atSentenceStart(text: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && /[\s"'(“‘]/.test(text[j])) j -= 1;
  if (j < 0) return true;
  if (isBoundary(text, j) || text[j] === ':') return true;
  // After a paragraph number: "1. That ..."
  return /(?:^|\n)\s*(?:\d{1,3}\.|\(\w{1,3}\)|[a-z]\))\s*$/.test(text.slice(0, at));
}

interface Paragraph {
  text: string;
  start: number;
}

/** The body's paragraphs: blocks separated by a blank line. */
export function splitParagraphs(body: string): Paragraph[] {
  const out: Paragraph[] = [];
  const sep = /\n[ \t]*\n\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(body)) !== null) {
    out.push({ text: body.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  out.push({ text: body.slice(last), start: last });
  return out;
}

/** The body with some paragraphs replaced, every separator kept as it was. */
function replaceParagraphs(body: string, replaced: ReadonlyMap<number, string>): string {
  const paras = splitParagraphs(body);
  let out = '';
  let cursor = 0;
  paras.forEach((p, i) => {
    out += body.slice(cursor, p.start);
    out += replaced.has(i) ? replaced.get(i)! : p.text;
    cursor = p.start + p.text.length;
  });
  return out + body.slice(cursor);
}

function humanise(id: string): string {
  const s = id
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function placeholder(label: string): string {
  const flat = label.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  return `{{MISSING: ${flat || 'detail'}}}`;
}

// ── The generic allowlist ───────────────────────────────────────────────────

/**
 * Words that are never a proper noun of the matter: function words that open
 * a sentence, and the generic vocabulary of Indian court documents. A
 * capitalised span is split at these words; what is left is checked.
 */
const COMMON_WORDS = new Set(
  `a about above accordingly act acts ad addl additional address addressee adhiniyam advocate advocates affidavit after
  afterwards aged agreement all allow allowed also an and annexed annexure annexures any applicant applicants application
  applications are article as at attention authority bail bailable bank banker bar be because before being below bench
  bharatiya bns bnss bond bonds branch bsa but by can case cases chamber charge chargesheet cheque cheques chief civil
  clause client clients code cognizable cognizance complainant complaint compoundable concerned condition conditions
  constitution copy correct could council counsel court courts cr crime criminal crl crpc custody date dated dates day
  days delivery demand deponent despite did district do does draft drawee drawer during e each electronic email
  english enrolment enrollment events every evidence ex exhibit facie fact facts father fide fine fir first following
  for from fundamental further furthermore government grant granted ground grounds had hand has have having he hence her
  here hereby herein hereinafter high him hindi his hon honble honour honourable humbly husband i if imprisonment in
  index india indian information inspector instructed instructions instruments interim investigating investigation io
  ipc is it its jail judge judicial justice kind kindly kumari km lakh late learned legal liberty list magistrate
  may me memo mentioned metropolitan might month months moreover most mother mr mrs ms must my named nagarik negotiable
  ni no non not notice noticee now number nyaya of offence offences office officer on only opposite or order orders our
  para paragraph parte party parties payee payment pending penal per personal petition petitioner place please police
  post prayer prima prison procedure punishable re record records reference registered registrar registry regular
  rejected release released rent report resident respectfully respondent respondents return right rights rs rule rules
  rupees said sakshya sanhita schedule section sections sender session sessions sh shall sheet sheweth showeth shri
  should signature signed since sir smt so son speed sri state statement statements station sub subject submission
  submissions submits submitted such supreme surety sureties suraksha synopsis tenant than that the their them then there
  thereafter therefore these they this those through thus to trial true u under undertaking undertakes union until upon
  us v verification verified versus vs was we week weeks were what when where whereas which while who whom whose why
  wife will with without witness witnesses would year years yes you your yours january february march april june july
  august september october november december monday tuesday wednesday thursday friday saturday sunday lawie starting
  dishonour dishonoured holder account encashment demand notice legally enforceable debt liability
  shall thereupon hereunder aforesaid above-named abovenamed respectful respectfully pray prays prayed hon'ble`
    .split(/\s+/)
    .map(fold)
    .filter((w) => w !== ''),
);

/** Generic boilerplate, act titles and court-format words. Never a fact of the matter. */
const GENERIC_ALLOW = [
  "Hon'ble Court",
  'learned Magistrate',
  'learned Sessions Judge',
  'Bharatiya Nagarik Suraksha Sanhita',
  'Bharatiya Nyaya Sanhita',
  'Bharatiya Sakshya Adhiniyam',
  'Indian Penal Code',
  'Code of Criminal Procedure',
  'Code of Civil Procedure',
  'Indian Evidence Act',
  'Negotiable Instruments Act',
  'Constitution of India',
  'Supreme Court of India',
  'Registered Post A.D.',
  'Speed Post',
  'Public Prosecutor',
  'Investigating Officer',
  'Station House Officer',
];

/**
 * The pack's static text with every sample value taken out: text inside a
 * placeholder, a bracket or quotes, and what follows "e.g." or "for example".
 * Only what is left can allow a proper noun.
 */
function withoutSamples(text: string): string {
  return text
    .replace(/\{\{[^}]*\}\}|\{[^}]*\}|\[[^\]]*\]|<[^>]*>/g, ' ')
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, ' ')
    .replace(
      /\b(?:e\.\s?g\.|eg\.|for example|for instance|such as|example:|examples:|i\.\s?e\.)[^.;)\n]*/gi,
      ' ',
    )
    .replace(/\([^)]*\d[^)]*\)/g, ' ');
}

// ── Entities ────────────────────────────────────────────────────────────────

interface Entity {
  type: FactEntityType;
  text: string;
  start: number;
  end: number;
  /** The relative-time expressions are dates with no calendar value. */
  relative?: boolean;
  /** For a court: the place it names. For a police station: its name. */
  name?: string;
  /** For a bare number with a time unit ("15 days"). */
  period?: boolean;
}

const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;

/**
 * Relative-time expressions. A date said this way is a date the draft gives
 * without the ledger giving it, unless a ledger display has the same words.
 * Kept in code (T-147d decision 3.1).
 */
export const RELATIVE_TIME_PATTERNS: readonly RegExp[] = [
  /\b(?:in|within|during|over)\s+the\s+(?:same\s+)?(?:week|month|fortnight|days?)\s+(?:following|after|before|preceding)\s+(?:the\s+|its\s+|his\s+|her\s+)?[\p{L}-]+(?:\s+of\s+the\s+[\p{L}-]+)?/giu,
  /\b(?:on\s+)?the\s+(?:next|following|previous|preceding|same)\s+(?:day|week|month|fortnight|morning|evening|night)\b/giu,
  /\b(?:a|one|two|three|four|five|six|seven|few|some|several|\d{1,3})\s+(?:days?|weeks?|months?|years?)\s+(?:later|afterwards|thereafter|earlier|ago|back)\b/giu,
  /\b(?:last|this|next|previous)\s+(?:week|month|year|fortnight)\b/giu,
  /\b(?:the\s+)?day\s+before\s+yesterday\b|\byesterday\b|\btomorrow\b/giu,
  /\b(?:soon|shortly|immediately)\s+(?:thereafter|afterwards)\b/giu,
  /\bpichh?le\s+(?:hafte|haftey|mahine|saal|din)\b/giu,
  /\bagle\s+(?:din|hafte|haftey|mahine|saal)\b/giu,
  /\b(?:ek|do|teen|char|kuch|\d{1,3})\s+(?:din|hafte|mahine|saal)\s+(?:baad|pehle|pahle)\b/giu,
  /पिछले\s+(?:हफ्ते|हफ़्ते|सप्ताह|महीने|साल)|अगले\s+(?:दिन|हफ्ते|सप्ताह|महीने)/gu,
];

const AMOUNT_RES: readonly RegExp[] = [
  // T-478: the lookbehind keeps "rs"/"inr" inside a word ("Orders 100") from being an amount.
  /(?<![\p{L}\p{N}])(?:Rs\.?|INR|₹|Rupees)\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:lakhs?|lacs?|crores?|thousand))?(?:\s*\/-)?/giu,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?)\b/giu,
];

const DATE_RES: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})\b/g,
  new RegExp(
    String.raw`\b\d{1,2}(?:st|nd|rd|th)?(?:\s+day\s+of)?[\s-]+${MONTH}\.?,?[\s-]+\d{4}\b`,
    'gi',
  ),
  new RegExp(String.raw`\b${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b`, 'gi'),
];

const ACT_NAMES = String.raw`(?:BNSS|BNS|BSA|IPC|Cr\.?\s?P\.?\s?C\.?|CPC|N\.?\s?I\.?\s?Act|Negotiable\s+Instruments\s+Act|Bharatiya\s+Nagarik\s+Suraksha\s+Sanhita|Bharatiya\s+Nyaya\s+Sanhita|Bharatiya\s+Sakshya\s+Adhiniyam|Indian\s+Penal\s+Code|Code\s+of\s+Criminal\s+Procedure|Code\s+of\s+Civil\s+Procedure|Indian\s+Evidence\s+Act)(?:,?\s*\d{4})?`;
const SECNUM = String.raw`\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*`;
const SECTION_RE = new RegExp(
  String.raw`\b(?:Sections?|Secs?\.?|S\.|Ss\.|u\/s\.?|धारा)\s*(${SECNUM}(?:\s*(?:,|and|&|\/|r\/w|read\s+with)\s*${SECNUM})*)(?:\s+(?:of\s+)?(?:the\s+)?(${ACT_NAMES}))?`,
  'giu',
);

const CASE_RE =
  /\b(?:FIR|F\.I\.R\.?|Crime|Case|Complaint|C\.C\.|Cr\.?\s?Case|Misc\.?\s?Case|Bail\s+Application|Cheque)\s*(?:No\.?|Number|#)\s*[:.]?\s*([A-Z0-9][\w-]*(?:\/[\w-]+)*)/giu;

const PS_NAME = String.raw`\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2}`;
const PS_RES: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:P\.\s?S\.|PS|Police\s+Station|Thana)\s+(${PS_NAME})`, 'gu'),
  new RegExp(String.raw`\b(${PS_NAME})\s+(?:Police\s+Station|P\.\s?S\.?|PS|Thana)\b`, 'gu'),
];

const COURT_RE = new RegExp(
  String.raw`\b(?:(?:Additional|Addl\.?)\s+)?(?:Chief\s+Judicial\s+Magistrate|Judicial\s+Magistrate(?:\s+First\s+Class)?|District\s+(?:and|&)\s+Sessions\s+Judge|Sessions\s+Judge|District\s+Judge|Sessions\s+Court|Metropolitan\s+Magistrate|Family\s+Court|High\s+Court|CJM|ACJM|JMFC)\b(?:\s*(?:,|at|of)\s*(\p{Lu}[\p{L}]+(?:\s+\p{Lu}[\p{L}]+)?))?`,
  'gu',
);

const PERIOD_RE = /\b(\d{1,3})\s*(days?|weeks?|months?|years?)\b/giu;
const BARE_NUMBER_RE = /\b\d{3,}\b/g;

/**
 * T-478 (Ajay's ruling 1, T-245 file 7d42b105): a number directly after
 * Article / Art. / Section / S. / s. / Order / O. / Rule / r. / Schedule / Para
 * is a legal reference, never a case number, so it is never blanked. The whole
 * match (prefix + number) is claimed with no entity before the bare-number
 * pass, so neither the number nor the prefix word ("Art", "Articles" as
 * proper nouns) is blanked. For every prefix, the lookbehind blocks a match
 * that starts after a letter, digit or dot, i.e. inside a word ("Mr. 1234",
 * "Rs. 500" stay as they are). A number must follow the prefix directly, so
 * "Order No. 123456" is still a case/order number.
 * Ajay's policy edges (ref 1a3cc988): the first number is capped at 4 digits
 * plus an optional letter (21A, 323A), so "Rule 123456" is not protected; a
 * listed further number ("Articles 226 and 227") is capped at 3 digits, so a
 * real case number later in the sentence is not swallowed. The full words are
 * case-insensitive (LEGAL_REF_WORD_RE); the short prefixes are case-exact
 * (LEGAL_REF_SHORT_RE: "S." / "s.", "O." only, "r." only), and need their dot.
 * JS has no inline (?i:...), hence two regexes with one number grammar.
 */
const LEGAL_REF_FIRST = String.raw`\d{1,4}[A-Za-z]?(?!\d)(?:\s*\(\s*[0-9a-zA-Z]{1,4}\s*\))*`;
const LEGAL_REF_NUM = String.raw`\d{1,3}[A-Za-z]?(?!\d)(?:\s*\(\s*[0-9a-zA-Z]{1,4}\s*\))*`;
const LEGAL_REF_NUMS = String.raw`(${LEGAL_REF_FIRST}(?:\s*(?:,|&|\/|\band\b|\bor\b|\bto\b)\s*${LEGAL_REF_NUM})*)`;
const LEGAL_REF_WORD_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}.])(?:Articles?|Art|Sections?|Orders?|Rules?|Schedules?|Paras?)\b\.?\s*${LEGAL_REF_NUMS}`,
  'giu',
);
const LEGAL_REF_SHORT_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}.])(?:[Ss]|O|r)\.\s*${LEGAL_REF_NUMS}`,
  'gu',
);

/** Every entity in one paragraph, longest kind first, with no overlap. */
function extractEntities(text: string): Entity[] {
  const claimed = new Uint8Array(text.length);
  const out: Entity[] = [];
  const free = (s: number, e: number): boolean => {
    for (let i = s; i < e; i += 1) if (claimed[i]) return false;
    return true;
  };
  const claim = (s: number, e: number): void => {
    for (let i = s; i < e; i += 1) claimed[i] = 1;
  };
  const add = (en: Entity): void => {
    if (en.end <= en.start || !free(en.start, en.end)) return;
    claim(en.start, en.end);
    out.push(en);
  };
  for (const re of [MARKER_BLANK_RE, FIXED_BLANK_RE]) {
    for (const m of text.matchAll(re)) claim(m.index!, m.index! + m[0].length);
  }

  for (const re of RELATIVE_TIME_PATTERNS) {
    for (const m of text.matchAll(re)) {
      add({
        type: 'date',
        text: m[0],
        start: m.index!,
        end: m.index! + m[0].length,
        relative: true,
      });
    }
  }
  for (const re of AMOUNT_RES) {
    for (const m of text.matchAll(re)) {
      const t = m[0].replace(/[\s,]+$/, '');
      add({ type: 'amount', text: t, start: m.index!, end: m.index! + t.length });
    }
  }
  for (const re of DATE_RES) {
    for (const m of text.matchAll(re)) {
      add({ type: 'date', text: m[0], start: m.index!, end: m.index! + m[0].length });
    }
  }
  for (const m of text.matchAll(SECTION_RE)) {
    add({ type: 'section', text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(CASE_RE)) {
    if (!/\d/.test(m[1])) continue;
    const numAt = m.index! + m[0].lastIndexOf(m[1]);
    add({ type: 'case_no', text: m[1], start: numAt, end: numAt + m[1].length });
  }
  for (const re of PS_RES) {
    for (const m of text.matchAll(re)) {
      const name = stripCommonEdges(m[1]);
      if (!name) continue;
      add({
        type: 'police_station',
        text: m[0],
        start: m.index!,
        end: m.index! + m[0].length,
        name,
      });
    }
  }
  for (const m of text.matchAll(COURT_RE)) {
    // A court with no place named is generic ("the learned Sessions Judge").
    if (!m[1]) continue;
    add({ type: 'court', text: m[0], start: m.index!, end: m.index! + m[0].length, name: m[1] });
  }
  for (const m of text.matchAll(PERIOD_RE)) {
    add({ type: 'date', text: m[0], start: m.index!, end: m.index! + m[0].length, period: true });
  }
  // T-478: a legal reference (prefix word + number) is claimed with no entity,
  // so neither the number (bare-number pass) nor the prefix word ("Art",
  // "Articles": proper-noun pass) is blanked.
  for (const re of [LEGAL_REF_WORD_RE, LEGAL_REF_SHORT_RE]) {
    for (const m of text.matchAll(re)) claim(m.index!, m.index! + m[0].length);
  }
  for (const m of text.matchAll(BARE_NUMBER_RE)) {
    add({ type: 'case_no', text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  for (const en of properNouns(text, claimed)) add(en);
  return out.sort((a, b) => a.start - b.start);
}

/** The station or place words, with generic words taken off both ends. */
function stripCommonEdges(span: string): string {
  const words = span.split(/\s+/).filter((w) => w !== '');
  while (words.length > 0 && COMMON_WORDS.has(fold(words[0]))) words.shift();
  while (words.length > 0 && COMMON_WORDS.has(fold(words[words.length - 1]))) words.pop();
  return words.join(' ');
}

/**
 * Capitalised spans that are not common words: the proper-noun candidates.
 * A single word that opens a sentence is not a candidate (too many false
 * positives); a span of two or more words is.
 */
function properNouns(text: string, claimed: Uint8Array): Entity[] {
  const out: Entity[] = [];
  const tokens = [...text.matchAll(/[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’.&-]*/gu)].map((m) => {
    const raw = m[0].replace(/[.'’-]+$/, '');
    return { raw, start: m.index!, end: m.index! + raw.length };
  });
  let run: typeof tokens = [];
  const flush = (): void => {
    if (run.length > 0) {
      const start = run[0].start;
      const end = run[run.length - 1].end;
      const letters = text.slice(start, end).replace(/[^\p{L}]/gu, '');
      const single = run.length === 1;
      if (letters.length >= 2 && !(single && atSentenceStart(text, start))) {
        out.push({ type: 'name', text: text.slice(start, end), start, end });
      }
    }
    run = [];
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const isCap = /^\p{Lu}/u.test(t.raw) && !/^\d/.test(t.raw);
    let isClaimed = false;
    for (let k = t.start; k < t.end; k += 1) {
      if (claimed[k]) {
        isClaimed = true;
        break;
      }
    }
    const prev = run[run.length - 1];
    const joined = prev ? /^\s{1,2}$/.test(text.slice(prev.end, t.start)) : true;
    if (!isCap || isClaimed || COMMON_WORDS.has(fold(t.raw)) || !joined) {
      flush();
      if (isCap && !isClaimed && !COMMON_WORDS.has(fold(t.raw))) run.push(t);
      continue;
    }
    run.push(t);
  }
  flush();
  return out;
}

// ── Facts, keyed for the checks ─────────────────────────────────────────────

interface Sources {
  /** Every held entry, each its own fact: several for a list or several choices (T-189). */
  facts: LedgerFact[];
  byKey: Map<string, LedgerFact>;
  /** Every held entry by key, for averment conditions (T-189, Ajay's rule R3). */
  entries: Map<string, LedgerFact[]>;
  unresolved: LedgerUnresolvedFact[];
  ledger: Corpus;
  skeleton: Corpus;
  allow: Corpus;
  /** Ledger displays and skeleton text, folded, for relative expressions. */
  verbatim: Corpus;
  amounts: Map<string, LedgerFact[]>;
  dates: Map<string, LedgerFact[]>;
  referenceYear: number | undefined;
  stationKeys: Map<string, LedgerFact>;
  courtCorpus: Corpus;
  sectionKeys: Set<string>;
  sectionNumbers: Set<string>;
  /** T-471: the section keys this pack alone may state (PACK_SECTION_SCOPE); empty for every other pack. */
  packSectionKeys: ReadonlySet<string>;
  /** Cue word stems of each date, amount and station key (facts and unresolved). */
  cues: Array<{ key: string; type: string; stems: Set<string>; unresolved: boolean }>;
  personNames: Array<{ fact: LedgerFact; words: string[] }>;
  skeletonText: string;
}

const CUE_STOP = new Set(
  `date dated of the a an to in on at by for as per name number no details detail applicant accused whether is was has
  any if bank court case amount rs and or from with this that its his her their party when where which what who
  given full`.split(/\s+/),
);

function stem(w: string): string {
  return w.length >= 6 ? w.slice(0, 6) : w;
}

function cueStems(label: string, key: string): Set<string> {
  const words = fold(`${label} ${key.replace(/[._]/g, ' ')}`).split(' ');
  return new Set(words.filter((w) => w.length >= 3 && !CUE_STOP.has(w)).map(stem));
}

/**
 * T-488 (Ajay 971d2685, b37ed330): the s.138 date labels. A date is judged
 * only against the field its own label names. These keys take their cues from
 * this table, not from their label words. Words are folded.
 */
const S138_DATE_KEYS = new Set([
  'cheque_date',
  'presentation_date',
  'dishonour_date',
  'memo_received_date',
  'notice_sent_date',
]);
/** "dated X" is the date of the nearest of these nouns before it. Date words take precedence. */
const DATE_WORDS = new Set(['dated', 'dt', 'dinank', 'दिनांक']);
const DATED_NOUN: ReadonlyMap<string, string> = new Map([
  ['cheque', 'cheque_date'],
  ['chek', 'cheque_date'],
  ['चेक', 'cheque_date'],
  ['notice', 'notice_sent_date'],
  ['notis', 'notice_sent_date'],
  ['नोटिस', 'notice_sent_date'],
  ['memo', 'dishonour_date'],
  ['मेमो', 'dishonour_date'],
]);
const PRESENTED_WORDS = new Set([
  'presented',
  'presenting',
  'presentation',
  'deposited',
  'depositing',
  'deposit',
  'jama',
  'जमा',
  'प्रस्तुत',
]);
const DISHONOUR_WORDS = new Set([
  'returned',
  'dishonoured',
  'dishonored',
  'dishonour',
  'dishonor',
  'bounced',
  'bounce',
  'unpaid',
  'anadrit',
  'अनादरित',
]);
/** The return memo: its date, or with a received word the date it was received. */
const MEMO_WORDS = new Set(['memo', 'मेमो', 'return']);
/** "received" alone is no cue (b37ed330): it names the memo receipt only with a memo word. */
const RECEIVED_WORDS = new Set(['received', 'receipt', 'recd', 'prapt', 'प्राप्त', 'mila', 'मिला']);
const NOTICE_WORDS = new Set(['notice', 'notis', 'नोटिस']);
/** "sent" names the notice date only with a notice word. */
const SENT_WORDS = new Set(['sent', 'dispatched', 'despatched', 'bheja', 'bheji', 'भेजा', 'भेजी']);
/** Never a date label on its own: the instrument nearly every s.138 sentence names. */
const DATE_CUE_NOT = new Set(['cheque', 'chek', 'चेक']);

/**
 * The s.138 keys these words label, with how near the cue stands (0 = the
 * word just before the date). `segment` is the clause from the previous date
 * on, folded; a cue word stands in its last `near` words, its companion word
 * ("memo" for "received", "notice" for "sent", the noun of "dated") anywhere
 * in it. A "dated" with a noun decides alone.
 */
function s138Labels(
  segment: readonly string[],
  near: number,
): Array<{ key: string; at: number; memoOnly?: boolean }> {
  const n = segment.length;
  const from = Math.max(0, n - near);
  for (let i = n - 1; i >= from; i -= 1) {
    if (!DATE_WORDS.has(segment[i])) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      const key = DATED_NOUN.get(segment[j]);
      if (key) return [{ key, at: n - 1 - i }];
    }
  }
  const nearest = (set: ReadonlySet<string>, lo: number): number => {
    for (let i = n - 1; i >= lo; i -= 1) if (set.has(segment[i])) return n - 1 - i;
    return -1;
  };
  const out: Array<{ key: string; at: number; memoOnly?: boolean }> = [];
  const received = nearest(RECEIVED_WORDS, from);
  if (received >= 0 && nearest(MEMO_WORDS, 0) >= 0) {
    out.push({ key: 'memo_received_date', at: received });
  }
  const presented = nearest(PRESENTED_WORDS, from);
  if (presented >= 0) out.push({ key: 'presentation_date', at: presented });
  const returned = nearest(DISHONOUR_WORDS, from);
  if (returned >= 0) out.push({ key: 'dishonour_date', at: returned });
  const memo = nearest(MEMO_WORDS, from);
  if (memo >= 0) out.push({ key: 'dishonour_date', at: memo, memoOnly: true });
  const sent = nearest(SENT_WORDS, from);
  if (sent >= 0 && nearest(NOTICE_WORDS, 0) >= 0) out.push({ key: 'notice_sent_date', at: sent });
  return out;
}

function amountKey(v: number): string {
  return String(Math.round(v * 100));
}

function sectionKeyOf(text: string): { key: string | null; number: string | null } {
  const n = normalizeSectionRef(text);
  if (n.ok) return { key: `${n.value.act}|${n.value.section}`, number: n.value.section };
  const m = /(\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*)/i.exec(text);
  return { key: null, number: m ? m[1].replace(/\s+/g, '').toUpperCase() : null };
}

function displayOf(f: LedgerFact): string {
  return typeof f.display === 'string' ? f.display.trim() : '';
}

function buildSources(input: VerifierInput): Sources {
  const byKey = factsByKey(input.facts);
  // T-189 (Ajay's rule R2): every held entry feeds every source, on its own.
  const entries = factEntriesByKey(input.facts);
  const facts = [...entries.values()].flat();
  const skeletonText = input.skeleton
    .map((s) => s.replace(MARKER_BLANK_RE, ' ').replace(FIXED_BLANK_RE, ' '))
    .join('\n');
  const ledgerTexts = facts.flatMap((f) => [
    displayOf(f),
    typeof f.value === 'string' ? f.value : '',
  ]);
  const dates = new Map<string, LedgerFact[]>();
  const amounts = new Map<string, LedgerFact[]>();
  const stationKeys = new Map<string, LedgerFact>();
  const sectionKeys = new Set<string>();
  const sectionNumbers = new Set<string>();
  let referenceYear: number | undefined;
  for (const f of facts) {
    if (f.type === 'date' && typeof f.value === 'string') {
      const list = dates.get(f.value) ?? [];
      list.push(f);
      dates.set(f.value, list);
      const y = Number(f.value.slice(0, 4));
      if (Number.isInteger(y)) referenceYear = Math.max(referenceYear ?? 0, y);
    } else if (f.type === 'amount' && typeof f.value === 'number') {
      const k = amountKey(f.value);
      const list = amounts.get(k) ?? [];
      list.push(f);
      amounts.set(k, list);
    } else if (f.type === 'police_station') {
      const k = normalizePoliceStation(displayOf(f));
      if (k.ok) stationKeys.set(k.value, f);
    } else if (f.type === 'section_ref' && typeof f.value === 'object' && f.value !== null) {
      sectionKeys.add(`${f.value.act}|${f.value.section}`);
      sectionNumbers.add(f.value.section.toUpperCase());
    }
    // Sections given as text ("318(4) BNS", ["318"]) on a section-like key.
    if (/section|offence|charged/i.test(f.key) && f.type !== 'section_ref') {
      for (const m of displayOf(f).matchAll(/\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*/gi)) {
        sectionNumbers.add(m[0].replace(/\s+/g, '').toUpperCase());
      }
      const ref = normalizeSectionRef(displayOf(f));
      if (ref.ok) sectionKeys.add(`${ref.value.act}|${ref.value.section}`);
    }
  }
  // T-471: the sections this pack's signed text holds, for this pack only.
  for (const k of packSectionKeys(input.packId)) sectionKeys.add(k);
  // Sections the skeleton states for this draft (the provision follows the court).
  for (const m of skeletonText.matchAll(SECTION_RE)) {
    const s = sectionKeyOf(m[0]);
    if (s.key) sectionKeys.add(s.key);
    for (const n of m[1].matchAll(/\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*/gi)) {
      sectionNumbers.add(n[0].replace(/\s+/g, '').toUpperCase());
    }
  }
  const cues: Sources['cues'] = [];
  for (const f of facts) {
    if (['date', 'amount', 'police_station'].includes(f.type)) {
      cues.push({ key: f.key, type: f.type, stems: cueStems(f.label, f.key), unresolved: false });
    }
  }
  for (const u of input.unresolved) {
    if (byKey.has(u.key)) continue;
    cues.push({ key: u.key, type: u.type, stems: cueStems(u.label, u.key), unresolved: true });
  }
  return {
    facts,
    byKey,
    entries,
    unresolved: [...input.unresolved],
    ledger: new Corpus(ledgerTexts),
    skeleton: new Corpus([skeletonText]),
    allow: new Corpus([...input.packText.map(withoutSamples), ...GENERIC_ALLOW]),
    verbatim: new Corpus([
      ...facts.map(displayOf),
      skeletonText,
      ...input.packText.map(withoutSamples),
    ]),
    amounts,
    dates,
    referenceYear,
    stationKeys,
    courtCorpus: new Corpus([
      ...facts.filter((f) => f.type === 'court').map(displayOf),
      skeletonText,
    ]),
    sectionKeys,
    sectionNumbers,
    packSectionKeys: new Set(packSectionKeys(input.packId)),
    cues,
    personNames: facts
      .filter((f) => f.type === 'person_name' || f.type === 'place_name')
      .map((f) => ({
        fact: f,
        words: fold(displayOf(f))
          .split(' ')
          .filter((w) => w !== ''),
      })),
    skeletonText,
  };
}

/** The keys a value in this clause is said to be, nearest cue first. */
function cuedKeys(
  src: Sources,
  text: string,
  at: number,
  types: readonly string[],
): Array<{ key: string; unresolved: boolean }> {
  const [clauseStart] = sentenceAround(text, at, at);
  const forDate = types.includes('date');
  let from = clauseStart;
  if (forDate) {
    // T-488: a date's label is in the words after the previous date of its sentence.
    const clause = text.slice(clauseStart, at);
    for (const re of DATE_RES) {
      for (const m of clause.matchAll(re)) {
        from = Math.max(from, clauseStart + m.index! + m[0].length);
      }
    }
  }
  const segment = fold(text.slice(from, at))
    .split(' ')
    .filter((w) => w !== '');
  const words = segment.slice(-8).reverse();
  const bare = (k: string): string => k.slice(k.lastIndexOf('.') + 1);
  const tabled = (c: Sources['cues'][number]): boolean =>
    c.type === 'date' && S138_DATE_KEYS.has(bare(c.key));
  const found: Array<{ key: string; unresolved: boolean; at: number }> = [];
  const seen = new Set<string>();
  words.forEach((w, i) => {
    const s = stem(w);
    for (const c of src.cues) {
      if (!types.includes(c.type) || seen.has(c.key) || tabled(c)) continue;
      if (c.type === 'date' && DATE_CUE_NOT.has(s)) continue;
      if (c.stems.has(s)) {
        seen.add(c.key);
        found.push({ key: c.key, unresolved: c.unresolved, at: i });
      }
    }
  });
  if (forDate) {
    const byName = new Map(src.cues.filter(tabled).map((c) => [bare(c.key), c]));
    let labels = s138Labels(segment, 8);
    // "return memo received": the memo words name the receipt, not the dishonour.
    if (byName.has('memo_received_date') && labels.some((l) => l.key === 'memo_received_date')) {
      labels = labels.filter((l) => !l.memoOnly);
    }
    for (const l of [...labels].sort((a, b) => a.at - b.at)) {
      const c = byName.get(l.key);
      if (!c || seen.has(c.key)) continue;
      seen.add(c.key);
      found.push({ key: c.key, unresolved: c.unresolved, at: l.at });
    }
  }
  return found.sort((a, b) => a.at - b.at).map(({ key, unresolved }) => ({ key, unresolved }));
}

function labelOfKey(src: Sources, key: string): string {
  return (
    src.byKey.get(key)?.label ?? src.unresolved.find((u) => u.key === key)?.label ?? humanise(key)
  );
}

function ledgerValueOf(src: Sources, key: string | null): string | null {
  if (key === null) return null;
  const f = src.byKey.get(key);
  if (f) return displayOf(f);
  const u = src.unresolved.find((x) => x.key === key);
  return u ? u.raw_span : null;
}

const GENERIC_LABEL: Record<FactEntityType, string> = {
  date: 'date',
  amount: 'amount',
  name: 'name',
  police_station: 'police station',
  court: 'court',
  case_no: 'case or FIR number',
  section: 'section',
  phrase: 'statement',
};

// ── Bank roles: a value bound to the wrong fact ─────────────────────────────

/**
 * A drawee-bank fact used where the draft says where the cheque was
 * presented or deposited, with nothing in the clause saying "drawn on" or
 * "drawee". Karol Bagh, the drawee branch, given as the presenting branch.
 */
const ROLE_RULES: ReadonlyArray<{ key: RegExp; wrong: RegExp; right: RegExp; what: string }> = [
  {
    key: /^drawee_branch$/,
    wrong:
      /\b(?:present(?:ed|s|ing)?|deposit(?:ed|s|ing)?|collecting\s+bank|presenting\s+bank|banker)\b/i,
    right:
      /\b(?:drawn\s+on|drawee|maintained\s+(?:by|with|at)|account\s+of\s+the\s+drawer|your\s+account)\b/i,
    what: 'is used as the bank or branch where the cheque was presented; your facts give it as the branch the cheque was drawn on',
  },
];

// ── The four checks ─────────────────────────────────────────────────────────

function checkEntities(src: Sources, paragraphs: Paragraph[]): FactViolation[] {
  const out: FactViolation[] = [];
  paragraphs.forEach((p, pi) => {
    for (const en of extractEntities(p.text)) {
      const v = judgeEntity(src, p.text, en);
      if (v)
        out.push({ ...v, paragraphIndex: pi, charOffset: en.start, length: en.end - en.start });
    }
  });
  return out;
}

type Judged = Omit<FactViolation, 'paragraphIndex' | 'charOffset' | 'length'>;

function unsupported(en: Entity, what?: string): Judged {
  return {
    check: 'unsupported',
    entityType: en.type,
    reason: 'not_in_facts',
    ledgerKey: null,
    label: GENERIC_LABEL[en.type],
    ledgerValue: null,
    draftValue: en.text,
    what: what ?? `the draft gives "${en.text}", which is not in FACTS`,
  };
}

function mutation(
  src: Sources,
  en: Entity,
  key: string,
  reason: 'differs' | 'wrong_fact' | 'unresolved',
  what?: string,
): Judged {
  const label = labelOfKey(src, key);
  const said =
    reason === 'unresolved'
      ? `the draft gives "${en.text}" for ${label}, which FACTS does not give`
      : reason === 'wrong_fact'
        ? `the draft gives "${en.text}" for ${label}, but in FACTS that value is a different fact`
        : `the draft gives "${en.text}" for ${label}, which differs from FACTS`;
  return {
    check: 'mutation',
    entityType: en.type,
    reason,
    ledgerKey: key,
    label,
    ledgerValue: ledgerValueOf(src, key),
    draftValue: en.text,
    what: what ?? said,
  };
}

function judgeEntity(src: Sources, text: string, en: Entity): Judged | null {
  switch (en.type) {
    case 'date':
      return judgeDate(src, text, en);
    case 'amount':
      return judgeAmount(src, text, en);
    case 'section': {
      const s = sectionKeyOf(en.text);
      if (s.key && src.sectionKeys.has(s.key)) return null;
      // Several sections in one reference: each number must be held.
      const numbersPart = en.text.replace(new RegExp(ACT_NAMES, 'giu'), ' ');
      const nums = [...numbersPart.matchAll(/\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*/gi)].map(
        (m) => m[0].replace(/\s+/g, '').toUpperCase(),
      );
      if (nums.length > 0 && nums.every((n) => src.sectionNumbers.has(n))) return null;
      if (packSectionNear(src, text, en)) return null;
      return unsupported(en);
    }
    case 'case_no': {
      const k = normalizeCaseNumber(en.text);
      const key = k.ok ? fold(k.value) : fold(en.text);
      if (src.ledger.hasFolded(key) || src.skeleton.hasFolded(key)) return null;
      // T-471: "144(2) of the BNSS" in a scoped pack is a section, not a case number.
      if (packSectionNear(src, text, en)) return null;
      // A year of an act ("Sanhita, 2023") the pack's static text states.
      if (/^(?:18|19|20)\d{2}$/.test(en.text) && src.allow.has(en.text)) return null;
      return unsupported(en);
    }
    case 'police_station': {
      const k = normalizePoliceStation(en.name ?? en.text);
      if (k.ok && src.stationKeys.has(k.value)) return null;
      const name = en.name ?? '';
      if (src.skeleton.has(name)) return null;
      const stationFact = src.facts.find((f) => f.type === 'police_station');
      if (stationFact) return mutation(src, en, stationFact.key, 'differs');
      const u = src.unresolved.find((x) => x.type === 'police_station');
      if (u) return mutation(src, en, u.key, 'unresolved');
      if (src.ledger.has(name)) return null;
      return unsupported(en);
    }
    case 'court': {
      if (src.courtCorpus.has(en.text) || src.courtCorpus.has(en.name ?? '')) return null;
      return unsupported(en);
    }
    case 'name':
      return judgeName(src, text, en);
    default:
      return null;
  }
}

/**
 * T-471: for a pack in PACK_SECTION_SCOPE only, a reference the section
 * or case-number pattern caught in part ("144" of "144(2) of the BNSS",
 * "s.145" of "BNSS s.145") is read with up to six words after it, or before it, and
 * passes only when it then names one of that pack's own section keys.
 */
function packSectionNear(src: Sources, text: string, en: Entity): boolean {
  if (src.packSectionKeys.size === 0) return false;
  const held = (t: string): boolean => {
    // "Section 144(1) proviso of the BNSS": the pack lists the proviso under 144(1).
    const n = normalizeSectionRef(t.replace(/\s+proviso\b/gi, '').trim());
    return n.ok && src.packSectionKeys.has(`${n.value.act}|${n.value.section}`);
  };
  // "Sections 144 and 145 of the BNSS": each number, read with the act after the last one.
  const span =
    `${en.text}${text.slice(en.end, en.end + 80).split(/[;:\n]|\.(?=\s|$)/)[0] ?? ''}`.replace(
      /,?\s*(?:18|19|20)\d{2}\b/g,
      '',
    );
  const numRe = /\d+[A-Z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*/gi;
  const nums = [...span.matchAll(numRe)];
  if (nums.length > 1) {
    const last = nums[nums.length - 1];
    const rest = span
      .slice((last.index ?? 0) + last[0].length)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 7);
    const actOk = (n: string): boolean => {
      for (let k = rest.length; k >= 1; k--) {
        if (held(`Section ${n} ${rest.slice(0, k).join(' ')}`)) return true;
      }
      return false;
    };
    if (nums.every((m) => actOk(m[0]))) return true;
  }
  const after = text.slice(en.start, en.end + 80).split(/[;:\n]|\.(?=\s|$)/)[0] ?? '';
  const afterWords = after.split(/\s+/).slice(0, 7);
  for (let k = afterWords.length; k >= 1; k--) {
    if (held(afterWords.slice(0, k).join(' '))) return true;
  }
  const before =
    text
      .slice(Math.max(0, en.start - 80), en.start)
      .split(/[;:\n]|\.(?=\s|$)/)
      .pop() ?? '';
  const beforeWords = before.trim().split(/\s+/).filter(Boolean);
  for (let k = 1; k <= Math.min(6, beforeWords.length); k++) {
    if (held(`${beforeWords.slice(-k).join(' ')} ${en.text}`)) return true;
  }
  return false;
}

function judgeDate(src: Sources, text: string, en: Entity): Judged | null {
  if (en.period) {
    // "32 years", "15 days": a period the ledger, the skeleton or the pack's static text states.
    if (src.ledger.has(en.text) || src.skeleton.has(en.text) || src.allow.has(en.text)) return null;
    const n = /\d+/.exec(en.text)?.[0] ?? '';
    if (src.facts.some((f) => fold(displayOf(f)) === n)) return null;
    return unsupported(en, `the draft gives the period "${en.text}", which is not in FACTS`);
  }
  const cued = cuedKeys(src, text, en.start, ['date']);
  if (en.relative) {
    if (src.verbatim.has(en.text)) return null;
    const u = cued.find((c) => c.unresolved);
    if (u) return mutation(src, en, u.key, 'unresolved');
    if (cued[0]) return mutation(src, en, cued[0].key, 'differs');
    return unsupported(en, `the draft gives "${en.text}" as a date, which is not in FACTS`);
  }
  const n = normalizeDate(en.text.replace(/\s+day\s+of\s+/i, ' '), {
    referenceYear: src.referenceYear,
  });
  if (!n.ok) {
    if (src.skeleton.has(en.text) || src.ledger.has(en.text)) return null;
    return unsupported(en);
  }
  const held = src.dates.get(n.value);
  if (held && held.length > 0) {
    // The date is the ledger's; is it said to be the date of something else?
    // T-488 (Ajay 971d2685): only a clear label (one key) can say so. A date
    // with no label, or with labels naming more than one key, passes.
    if (cued.some((c) => held.some((f) => f.key === c.key))) return null;
    if (cued.length !== 1) return null;
    if (cued[0].unresolved) return mutation(src, en, cued[0].key, 'unresolved');
    return mutation(src, en, cued[0].key, 'wrong_fact');
  }
  if (src.skeleton.has(en.text)) return null;
  const u = cued.find((c) => c.unresolved);
  if (u) return mutation(src, en, u.key, 'unresolved');
  if (cued[0]) return mutation(src, en, cued[0].key, 'differs');
  return unsupported(en);
}

function judgeAmount(src: Sources, text: string, en: Entity): Judged | null {
  const n = normalizeAmount(en.text);
  if (n.ok && src.amounts.has(amountKey(n.value))) return null;
  if (src.skeleton.has(en.text)) return null;
  const cued = cuedKeys(src, text, en.start, ['amount']);
  const u = cued.find((c) => c.unresolved);
  if (u) return mutation(src, en, u.key, 'unresolved');
  if (cued[0]) return mutation(src, en, cued[0].key, 'differs');
  const amountFacts = src.facts.filter((f) => f.type === 'amount');
  if (amountFacts.length === 1) return mutation(src, en, amountFacts[0].key, 'differs');
  return unsupported(en);
}

/** Levenshtein distance, small inputs only. */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function judgeName(src: Sources, text: string, en: Entity): Judged | null {
  const k = nameKey(en.text);
  if (!k.ok) return null;
  const folded = fold(en.text);
  if (
    src.ledger.hasFolded(folded) ||
    src.skeleton.hasFolded(folded) ||
    src.allow.hasFolded(folded)
  ) {
    return roleCheck(src, text, en);
  }
  // A span that opens a sentence may carry one ordinary capitalised word first.
  if (atSentenceStart(text, en.start)) {
    const rest = folded.split(' ').slice(1).join(' ');
    if (
      rest === '' ||
      src.ledger.hasFolded(rest) ||
      src.skeleton.hasFolded(rest) ||
      src.allow.hasFolded(rest)
    ) {
      return null;
    }
  }
  // Close to a name in the ledger, but not it: a mutation of that name.
  const words = folded.split(' ');
  for (const pn of src.personNames) {
    const target = pn.words.join(' ');
    const shares = words.some((w) => w.length >= 3 && pn.words.includes(w));
    const near =
      Math.abs(target.length - folded.length) <= 3 &&
      editDistance(target, folded) <= Math.max(1, Math.floor(target.length / 5));
    if (near || (shares && words.length >= 2 && pn.words.length >= 2)) {
      return mutation(src, en, pn.fact.key, 'differs');
    }
  }
  return unsupported(en);
}

/** A ledger name used for the wrong role (ROLE_RULES). */
function roleCheck(src: Sources, text: string, en: Entity): Judged | null {
  const folded = fold(en.text);
  for (const rule of ROLE_RULES) {
    const fact = src.facts.find((f) => rule.key.test(f.key) && fold(displayOf(f)) === folded);
    if (!fact) continue;
    const [s, e] = sentenceAround(text, en.start, en.end);
    const clause = text.slice(s, e);
    if (rule.wrong.test(clause) && !rule.right.test(clause)) {
      return mutation(src, en, fact.key, 'wrong_fact', `"${en.text}" ${rule.what}`);
    }
  }
  return null;
}

/** Check 2: every required fact appears in the printed document. */
function checkDropped(src: Sources, paragraphs: Paragraph[]): FactViolation[] {
  const body = paragraphs.map((p) => p.text).join('\n\n');
  const all = `${src.skeletonText}\n\n${body}`;
  const allFolded = ` ${fold(all)} `;
  const entities = extractEntities(all);
  const out: FactViolation[] = [];
  for (const f of src.facts) {
    if (!f.required_in_draft) continue;
    if (present(src, f, entities, allFolded)) continue;
    const pi = bestParagraphFor(f, paragraphs);
    out.push({
      check: 'dropped',
      entityType: entityTypeOfFact(f),
      reason: 'left_out',
      ledgerKey: f.key,
      label: f.label,
      paragraphIndex: pi,
      charOffset: 0,
      length: 0,
      ledgerValue: displayOf(f),
      draftValue: null,
      what: `${f.label} is in FACTS ("${displayOf(f)}") but is not in the draft`,
    });
  }
  return out;
}

function entityTypeOfFact(f: LedgerFact): FactEntityType {
  switch (f.type) {
    case 'date':
      return 'date';
    case 'amount':
      return 'amount';
    case 'police_station':
      return 'police_station';
    case 'court':
      return 'court';
    case 'section_ref':
      return 'section';
    case 'case_number':
      return 'case_no';
    case 'person_name':
    case 'place_name':
      return 'name';
    default:
      return 'phrase';
  }
}

function present(src: Sources, f: LedgerFact, entities: Entity[], allFolded: string): boolean {
  const display = displayOf(f);
  if (display === '' || /\{\{\s*MISSING/i.test(display)) return true;
  const has = (s: string): boolean => {
    const n = fold(s);
    return n !== '' && allFolded.includes(` ${n} `);
  };
  switch (f.type) {
    case 'amount':
      return entities.some((e) => {
        if (e.type !== 'amount') return false;
        const n = normalizeAmount(e.text);
        return n.ok && amountKey(n.value) === amountKey(f.value);
      });
    case 'date':
      return (
        has(display) ||
        entities.some((e) => {
          if (e.type !== 'date' || e.relative || e.period) return false;
          const n = normalizeDate(e.text.replace(/\s+day\s+of\s+/i, ' '), {
            referenceYear: src.referenceYear,
          });
          return n.ok && n.value === f.value;
        })
      );
    case 'police_station': {
      const k = normalizePoliceStation(display);
      if (!k.ok) return has(display);
      const words = fold(display)
        .split(' ')
        .filter((w) => !['ps', 'p', 's', 'police', 'station', 'thana'].includes(w));
      return has(display) || has(words.join(' '));
    }
    case 'section_ref':
      return (
        has(display) ||
        entities.some((e) => {
          if (e.type !== 'section') return false;
          const s = sectionKeyOf(e.text);
          return (
            s.key === `${f.value.act}|${f.value.section}` ||
            (s.number !== null && s.number === f.value.section.toUpperCase())
          );
        })
      );
    case 'enum':
    case 'boolean':
      return true;
    case 'text':
      // Prose is reworded legitimately; only a short value is looked for.
      if (display.split(/\s+/).length > 5) return true;
      return has(display);
    default:
      return has(display);
  }
}

/** The paragraph a dropped fact belongs in: the one sharing most of its label's words. */
function bestParagraphFor(f: LedgerFact, paragraphs: Paragraph[]): number {
  const stems = cueStems(f.label, f.key);
  let best = 0;
  let bestScore = -1;
  paragraphs.forEach((p, i) => {
    const words = new Set(fold(p.text).split(' ').map(stem));
    let score = 0;
    for (const s of stems) if (words.has(s)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Lower case with every run of white space one space, and a map back to the original. */
function normaliseWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastSpace) {
        norm += ' ';
        map.push(i);
      }
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    const low = ch.toLowerCase();
    for (const c of low) {
      norm += c;
      map.push(i);
    }
  }
  return { norm, map };
}

function normPhrase(p: string): string {
  return p.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A letter, combining mark or digit: what a banned phrase may not start or end next to. */
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/** What, right after a banned phrase, makes it an undertaking for the future (Ajay, T-147d). */
const FUTURE_AUXILIARY =
  /^\s*(?:jayega|jaayega|jaega|jayenge|jaenge|जाएगा|जायेगा|जाएँगे|will|jaana chahiye|jana chahiye|जाना चाहिए|जाना चाहिये|karega|karegi|karenge)(?![\p{L}\p{M}])/u;

/** The label of the fact that would unlock a banned entry: the first one the ledger lacks. */
function unlockLabel(
  entry: BannedEntry,
  byKey: ReadonlyMap<string, readonly LedgerFact[]>,
): string {
  const c: AvermentCondition | null = entry.unlocked_by;
  if (c === null) return humanise(entry.id);
  if ('all_of' in c) {
    const leaves = c.all_of.flatMap(function leaves(x: AvermentCondition): AvermentCondition[] {
      return 'all_of' in x ? x.all_of.flatMap(leaves) : [x];
    });
    const lacking = leaves.find((x) => !conditionHolds(x, byKey)) ?? leaves[0];
    return lacking && !('all_of' in lacking)
      ? (lacking.label ?? humanise(lacking.key))
      : humanise(entry.id);
  }
  return c.label ?? humanise(c.key);
}

/** Check 4: a phrase of a still-banned assertion. */
function checkBanned(src: Sources, input: VerifierInput, paragraphs: Paragraph[]): FactViolation[] {
  const still = new Set(resolveAverments(input.lists, src.facts).banned.map((b) => b.id));
  const entries = input.lists.banned.filter((b) => still.has(b.id));
  const displays = src.facts.map((f) => normPhrase(displayOf(f))).filter((d) => d.length >= 4);
  const out: FactViolation[] = [];
  paragraphs.forEach((p, pi) => {
    const { norm, map } = normaliseWithMap(p.text);
    // Ranges of the paragraph that are a ledger display printed verbatim.
    const protectedRanges: Array<[number, number]> = [];
    for (const d of displays) {
      let at = norm.indexOf(d);
      while (at >= 0) {
        protectedRanges.push([at, at + d.length]);
        at = norm.indexOf(d, at + 1);
      }
    }
    // One record per banned entry per sentence; the sentence is stripped once.
    const taken: Array<[number, number, string]> = [];
    for (const entry of entries) {
      for (const phrase of entry.phrases) {
        const np = normPhrase(phrase);
        if (np === '') continue;
        let at = norm.indexOf(np);
        while (at >= 0) {
          const end = at + np.length;
          const inside = protectedRanges.some(([s, e]) => at >= s && end <= e);
          // A future undertaking ("... sahyog kiya jayega", "... will") is not the past assertion.
          const future = FUTURE_AUXILIARY.test(norm.slice(end));
          // Whole words at both ends: "he cooperated with the" is not inside "she cooperated with the".
          const whole =
            !WORD_CHAR.test(norm.charAt(at - 1) || ' ') && !WORD_CHAR.test(norm.charAt(end) || ' ');
          if (!inside && !future && whole) {
            const os = map[at];
            const oe = map[end - 1] + 1;
            const [s, e] = sentenceAround(p.text, os, oe);
            const prefix = /^(\s*(?:\d{1,3}\.|\(\w{1,3}\)|[a-z]\))\s*)/.exec(p.text.slice(s, e));
            const from = s + (prefix ? prefix[1].length : 0);
            if (!taken.some(([a, b, id]) => id === entry.id && from < b && e > a)) {
              taken.push([from, e, entry.id]);
              out.push({
                check: 'banned',
                entityType: 'phrase',
                reason: 'banned',
                ledgerKey: firstKey(entry.unlocked_by, src.entries),
                label: unlockLabel(entry, src.entries),
                paragraphIndex: pi,
                charOffset: from,
                length: Math.max(0, e - from),
                ledgerValue: null,
                draftValue: p.text.slice(os, oe),
                bannedEntryId: entry.id,
                what: `the draft states "${p.text.slice(os, oe)}" (${entry.id}), which no fact in FACTS backs`,
              });
            }
          }
          at = norm.indexOf(np, at + 1);
        }
      }
    }
  });
  return out;
}

function firstKey(
  c: AvermentCondition | null,
  byKey: ReadonlyMap<string, readonly LedgerFact[]>,
): string | null {
  if (c === null) return null;
  if ('all_of' in c) {
    for (const x of c.all_of) {
      if (!conditionHolds(x, byKey)) return firstKey(x, byKey);
    }
    return firstKey(c.all_of[0] ?? null, byKey);
  }
  return c.key;
}

// ── Verify ──────────────────────────────────────────────────────────────────

/** Runs the four checks. No LLM call, no I/O. Empty when the draft passes. */
export function verifyDraft(input: VerifierInput): FactViolation[] {
  if (input.body.trim() === '') return [];
  const src = buildSources(input);
  const paragraphs = splitParagraphs(input.body);
  const banned = checkBanned(src, input, paragraphs);
  // An entity inside a sentence that check 4 strips is not reported twice.
  const inBanned = (v: FactViolation): boolean =>
    banned.some(
      (b) =>
        b.paragraphIndex === v.paragraphIndex &&
        v.charOffset >= b.charOffset &&
        v.charOffset < b.charOffset + b.length,
    );
  const entities = checkEntities(src, paragraphs).filter((v) => !inBanned(v));
  const dropped = checkDropped(src, paragraphs);
  return [...entities, ...dropped, ...banned];
}

/**
 * Every unsupported or mutated value becomes `{{MISSING: label}}`, and every
 * banned sentence is stripped and replaced in the same way. A dropped fact
 * has no place in the text and is listed in the banner instead.
 */
export function applyPlaceholders(
  body: string,
  violations: readonly FactViolation[],
): { body: string; added: number } {
  const paragraphs = splitParagraphs(body);
  const byPara = new Map<number, FactViolation[]>();
  for (const v of violations) {
    if (v.check === 'dropped' || v.length <= 0) continue;
    const list = byPara.get(v.paragraphIndex) ?? [];
    list.push(v);
    byPara.set(v.paragraphIndex, list);
  }
  const replaced = new Map<number, string>();
  let added = 0;
  for (const [pi, list] of byPara) {
    const p = paragraphs[pi];
    if (!p) continue;
    // Banned spans (whole clauses) first, then values outside them.
    const ordered = [...list].sort((a, b) =>
      a.check === 'banned' && b.check !== 'banned'
        ? -1
        : b.check === 'banned' && a.check !== 'banned'
          ? 1
          : 0,
    );
    const spans: Array<{ s: number; e: number; label: string }> = [];
    for (const v of ordered) {
      const s = v.charOffset;
      const e = v.charOffset + v.length;
      if (spans.some((x) => s < x.e && e > x.s)) continue;
      spans.push({ s, e, label: v.label });
    }
    spans.sort((a, b) => b.s - a.s);
    let text = p.text;
    for (const sp of spans) {
      text = text.slice(0, sp.s) + placeholder(sp.label) + text.slice(sp.e);
      added += 1;
    }
    replaced.set(pi, text);
  }
  return { body: replaceParagraphs(body, replaced), added };
}

// ── The repair pass ─────────────────────────────────────────────────────────

export interface FactRepairPromptInput {
  /** The offending paragraphs only, each with its index. */
  paragraphs: Array<{ index: number; text: string }>;
  violations: readonly FactViolation[];
  facts: ReadonlyArray<{ key: string; label: string; type: string; display: string }>;
  banned: readonly ResolvedBan[];
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** The user prompt for DRAFTER_FACT_REPAIR_SYSTEM_PROMPT. */
export function buildFactRepairUserPrompt(input: FactRepairPromptInput): string {
  const banned = input.banned.map(
    (b) => `- ${b.id} | ${b.kind} | ${b.phrases.map((p) => oneLine(p, 200)).join(' ; ')}`,
  );
  const violations = input.violations.map(
    (v) =>
      `- P${v.paragraphIndex} | ${v.check} | ${oneLine(v.label, 200)} | ${oneLine(v.what, 400)}`,
  );
  const paragraphs = input.paragraphs.map((p) => `[[P${p.index}]]\n${p.text}`);
  return [
    `FACTS:\n${JSON.stringify(input.facts, null, 1)}`,
    `BANNED ASSERTIONS (id | averment or submission | ways it is commonly written)\n${banned.length > 0 ? banned.join('\n') : 'none'}`,
    `VIOLATIONS (paragraph | check | label | what is wrong)\n${violations.join('\n')}`,
    `PARAGRAPHS:\n${paragraphs.join('\n\n')}`,
  ].join('\n\n');
}

/**
 * The repaired paragraphs, by index, or null if the answer is not exactly the
 * paragraphs asked for, in the same order, each with some text.
 */
export function parseFactRepair(
  raw: string,
  indices: readonly number[],
): Map<number, string> | null {
  if (raw.includes('===CLAUSES===')) return null;
  const marker = /^[ \t]*\[\[P(\d+)\]\][ \t]*$/gm;
  const found: Array<{ index: number; from: number; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(raw)) !== null) {
    found.push({ index: Number(m[1]), from: m.index + m[0].length, at: m.index });
  }
  if (found.length !== indices.length) return null;
  if (raw.slice(0, found[0]?.at ?? 0).trim() !== '') return null;
  const out = new Map<number, string>();
  for (let i = 0; i < found.length; i += 1) {
    if (found[i].index !== indices[i]) return null;
    const end = i + 1 < found.length ? found[i + 1].at : raw.length;
    const text = raw.slice(found[i].from, end).trim();
    if (text === '' || /\n[ \t]*\n/.test(text)) return null;
    out.set(found[i].index, text);
  }
  return out;
}

function violationKey(v: FactViolation): string {
  const value = v.ledgerKey === null || v.check === 'banned' ? fold(v.draftValue ?? '') : '';
  return [v.check, v.ledgerKey ?? '', v.entityType, v.bannedEntryId ?? '', value].join('|');
}

function finalResolution(v: FactViolation): FactResolution {
  if (v.check === 'banned') return 'stripped';
  if (v.check === 'dropped') return 'flagged';
  return 'placeholdered';
}

function toRecord(v: FactViolation, resolution: FactResolution, phase: FactPhase): FactDiffDraft {
  return {
    check: v.check,
    entityType: v.entityType,
    bannedEntryId: v.bannedEntryId ?? null,
    ledgerKey: v.ledgerKey,
    label: v.label,
    paragraphIndex: v.paragraphIndex,
    charOffset: v.charOffset,
    ledgerValue: v.ledgerValue,
    draftValue: v.check === 'dropped' ? null : v.draftValue,
    resolution,
    phase,
  };
}

const NOTE: Record<ViolationReason, string> = {
  not_in_facts: 'not in your facts. Left blank in the draft for you to fill.',
  differs: 'does not match your facts. Left blank in the draft for you to fill.',
  wrong_fact:
    'your facts give this for a different detail. Left blank in the draft for you to fill.',
  unresolved: 'not yet confirmed in your facts. Left blank in the draft for you to fill.',
  left_out: 'in your facts but not in the draft. Add it before you file.',
  banned:
    'stated in the draft but not in your facts. The statement was taken out and left blank for you to fill.',
};

/** The banner for what is still wrong after the repair. Null when nothing is. */
export function buildFactBanner(violations: readonly FactViolation[]): FactBanner | null {
  const items: FactBannerItem[] = [];
  const seen = new Set<string>();
  for (const v of violations) {
    const label = v.ledgerKey === null && v.check === 'unsupported' ? `A ${v.label}` : v.label;
    const note = NOTE[v.reason];
    const k = `${label}|${note}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ check: v.check, label, note });
  }
  if (items.length === 0) return null;
  return { text: factCheckBannerText(items.length), items, disclaimer: FACT_CHECK_DISCLAIMER };
}

/**
 * Verify; on failure, one targeted repair of the offending paragraphs; verify
 * again; placeholder whatever is still wrong. At most one repair call.
 */
export async function verifyAndRepair(
  input: VerifierInput,
  repair?: FactRepairCall,
): Promise<FactCheckOutcome> {
  const initial = verifyDraft(input);
  if (initial.length === 0) {
    return {
      body: input.body,
      passed: true,
      repairRan: false,
      repairFixed: false,
      initial,
      afterRepair: null,
      records: [],
      banner: null,
      placeholdersAdded: 0,
    };
  }

  let current = input.body;
  let afterRepair: FactViolation[] | null = null;
  let repairRan = false;
  if (repair) {
    const paragraphs = splitParagraphs(input.body);
    const indices = [...new Set(initial.map((v) => v.paragraphIndex))]
      .filter((i) => i >= 0 && i < paragraphs.length)
      .sort((a, b) => a - b);
    // T-189: one fact line per held entry, never a joined one.
    const entries = factEntriesByKey(input.facts);
    const user = buildFactRepairUserPrompt({
      paragraphs: indices.map((i) => ({ index: i, text: paragraphs[i].text })),
      violations: initial,
      facts: [...entries.values()].flat().map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        display: displayOf(f),
      })),
      banned: resolveAverments(input.lists, input.facts).banned,
    });
    repairRan = true;
    const raw = await repair(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT, user);
    const parsed = raw === null ? null : parseFactRepair(raw, indices);
    if (parsed) {
      current = replaceParagraphs(input.body, parsed);
      afterRepair = verifyDraft({ ...input, body: current });
    }
  }

  const remaining = afterRepair ?? initial;
  const placed = applyPlaceholders(current, remaining);
  const after = new Set((afterRepair ?? []).map(violationKey));
  const records: FactDiffDraft[] = [
    ...initial.map((v) =>
      toRecord(
        v,
        afterRepair !== null && !after.has(violationKey(v)) ? 'repaired' : finalResolution(v),
        'initial',
      ),
    ),
    ...(afterRepair ?? []).map((v) => toRecord(v, finalResolution(v), 'after_repair')),
  ];
  return {
    body: placed.body,
    passed: false,
    repairRan,
    repairFixed: afterRepair !== null && afterRepair.length === 0,
    initial,
    afterRepair,
    records,
    banner: buildFactBanner(remaining),
    placeholdersAdded: placed.added,
  };
}

/** `{{MISSING: ...}}` placeholders in a text. */
export function countMissingPlaceholders(text: string): number {
  return (text.match(/\{\{\s*MISSING\s*:[^}]*\}\}/gi) ?? []).length;
}
