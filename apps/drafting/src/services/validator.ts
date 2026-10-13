/**
 * Layer 3 — Validation Before Output
 *
 * Validates the generated document before sending to the user:
 * - Extract section references and check against SCRUM-27 mapping
 * - Detect old IPC/CrPC/IEA references and suggest BNS/BNSS/BSA equivalents
 * - Check mandatory clauses are present
 * - Auto-add missing mandatory sections from templates
 */
import crpcToBnss from '../config/sections/crpc-to-bnss.json';
import ieaToBsa from '../config/sections/iea-to-bsa.json';
import ipcToBns from '../config/sections/ipc-to-bns.json';

import { ChargedCode, readSectionsCharged } from './bns-offence-resolver';
import { DocumentRuleConfig } from './prompt-assembler';
import { readMandatoryClauses } from './rule-pack.service';
import { lookupOldToNew } from './sections.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ValidationWarning {
  type:
    | 'invalid_section'
    | 'old_law_reference'
    | 'missing_clause'
    | 'fact_alteration'
    | 'coherence_mismatch'
    | 'case_citation';
  message: string;
  details?: {
    section?: string;
    code?: string;
    suggestedReplacement?: string;
    clauseId?: string;
    field?: string;
    expected?: string;
    /** SCRUM-67 — coherence rule id (e.g. "false_implication") */
    rule?: string;
    /** SCRUM-67 — human-readable ground label (e.g. "False implication") */
    ground?: string;
  };
}

export interface ValidationResult {
  /** Warnings that should be shown to the user */
  warnings: ValidationWarning[];
  /** Sections cited in the document (for DB storage) */
  sectionsCited: string[];
  /** Whether mandatory clauses are all present */
  mandatoryClausesComplete: boolean;
}

// ── Section Reference Extraction ─────────────────────────────────────────────

/** Pattern matching "Section 480", "Sec. 103", "u/s 481", "under Section 103" — all codes */
const SECTION_PATTERN =
  /(?:sections?|sec\.?|u\/s|under\s+sections?)\s+(\d+[A-Z]?(?:\([a-z0-9]+\))?)\s*(?:of\s+)?(?:the\s+)?(BNSS|BSA|BNS|Bharatiya Nagarik Suraksha Sanhita|Bharatiya Sakshya Adhiniyam|Bharatiya Nyaya Sanhita|Negotiable Instruments Act|NI Act|Consumer Protection Act|CPA|CPC|Code of Civil Procedure|Transfer of Property Act|TPA|Registration Act|Reg\.?\s*Act|Indian Stamp Act|Limitation Act)?/gi;

/** Pattern matching old IPC/CrPC/IEA references */
const OLD_LAW_PATTERN =
  /(?:sections?|sec\.?|u\/s|under\s+sections?)\s+(\d+[A-Z]?(?:\([a-z0-9]+\))?)\s*(?:of\s+)?(?:the\s+)?(IPC|Indian Penal Code|CrPC|Cr\.?P\.?C\.?|Code of Criminal Procedure|IEA|Indian Evidence Act)/gi;

/**
 * Extract all section references from the generated text.
 * Returns an array of { section, code } pairs.
 */
export function extractSectionReferences(
  text: string,
): Array<{ section: string; code: string; raw: string }> {
  const refs: Array<{ section: string; code: string; raw: string }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  SECTION_PATTERN.lastIndex = 0;
  while ((match = SECTION_PATTERN.exec(text)) !== null) {
    const code = match[2] ? normalizeCodeName(match[2]) : '';
    refs.push({ section: match[1], code, raw: match[0] });
  }

  return refs;
}

/**
 * Extract old-law (IPC/CrPC/IEA) section references.
 */
export function extractOldLawReferences(
  text: string,
): Array<{ section: string; code: string; raw: string }> {
  const refs: Array<{ section: string; code: string; raw: string }> = [];
  let match: RegExpExecArray | null;

  OLD_LAW_PATTERN.lastIndex = 0;
  while ((match = OLD_LAW_PATTERN.exec(text)) !== null) {
    refs.push({ section: match[1], code: normalizeOldCode(match[2]), raw: match[0] });
  }

  return refs;
}

function normalizeCodeName(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase().replace(/\./g, '');
  if (upper.includes('NYAYA') || upper === 'BNS') return 'BNS';
  if (upper.includes('NAGARIK') || upper === 'BNSS') return 'BNSS';
  if (upper.includes('SAKSHYA') || upper === 'BSA') return 'BSA';
  if (upper.includes('NEGOTIABLE') || upper === 'NI ACT') return 'NI Act';
  if (upper.includes('CONSUMER PROTECTION') || upper === 'CPA') return 'CPA';
  if (upper === 'CPC' || upper.includes('CIVIL PROCEDURE')) return 'CPC';
  if (upper.includes('TRANSFER OF PROPERTY') || upper === 'TPA') return 'TPA';
  if (upper.includes('REGISTRATION') || upper.includes('REG ACT')) return 'Reg Act';
  if (upper.includes('STAMP')) return 'Stamp Act';
  if (upper.includes('LIMITATION')) return 'Limitation Act';
  return code;
}

function normalizeOldCode(code: string): string {
  const upper = code.toUpperCase().replace(/\./g, '');
  if (upper === 'IPC' || upper.includes('PENAL')) return 'IPC';
  if (upper.includes('CRPC') || upper.includes('CRIMINAL PROCEDURE')) return 'CrPC';
  if (upper === 'IEA' || upper.includes('EVIDENCE')) return 'IEA';
  return code;
}

// ── T-270: Act-scoped citations (Ajay's rulings Q1-Q5, 12 Oct 2026) ─────────

/** The six Acts T-270 checks (Q3). Every other Act is never checked. */
export type CheckedAct = 'BNS' | 'BNSS' | 'BSA' | 'IPC' | 'CrPC' | 'IEA';

export interface ActCitation {
  act: CheckedAct;
  /** As read, e.g. "61(2)(a)", "103A", "120B". */
  number: string;
}

const CHECKED_ACT: Partial<Record<ChargedCode, CheckedAct>> = {
  BNS: 'BNS',
  BNSS: 'BNSS',
  BSA: 'BSA',
  IPC: 'IPC',
  CRPC: 'CrPC',
  IEA: 'IEA',
};

/** Q3: the new Acts are valid by range, and have no lettered sections. */
const NEW_ACT_LAST_SECTION: Partial<Record<CheckedAct, number>> = {
  BNS: 358,
  BNSS: 531,
  BSA: 170,
};

/**
 * Q3 (Q6 withdrawn): an old-Act number is valid if it is a row (a key) in Ajay's
 * signed mapping, whatever its type (direct, merged, unverified, repealed,
 * repealed_no_equivalent). In these tables "repealed" means "no equivalent in the
 * new code"; those sections were in force until 2024. A number not in the table is
 * flagged.
 */
function tableRows(table: unknown): ReadonlySet<string> {
  return new Set(Object.keys((table as { mappings: Record<string, unknown> }).mappings));
}
const OLD_ACT_ROWS: Partial<Record<CheckedAct, ReadonlySet<string>>> = {
  IPC: tableRows(ipcToBns),
  CrPC: tableRows(crpcToBnss),
  IEA: tableRows(ieaToBsa),
};

/** Q1: a range is checked number by number, up to this many numbers. Wider is unreadable. */
const MAX_RANGE_NUMBERS = 20;

// Window grammar. The six Act names mirror the T-277 reader's CODE_NAMES (not exported).
const W_ACT = [
  String.raw`\bb\.?n\.?s\.?s\b\.?`,
  String.raw`\bbharatiya\s+nagarik\s+suraksha\s+sanhita\b`,
  String.raw`\bb\.?s\.?a\b\.?`,
  String.raw`\bbharatiya\s+sakshya\s+adhiniyam\b`,
  String.raw`\bb\.?n\.?s\b\.?`,
  String.raw`\bbharatiya\s+nyaya\s+sanhita\b`,
  String.raw`\bi\.?p\.?c\b\.?`,
  String.raw`\bindian\s+penal\s+code\b`,
  String.raw`\bcr\.?\s?p\.?\s?c\b\.?`,
  String.raw`\bcode\s+of\s+criminal\s+procedure\b`,
  String.raw`\bi\.?e\.?a\b\.?`,
  String.raw`\bindian\s+evidence\s+act\b`,
].join('|');
const W_CUE = String.raw`\b(?:under\s+)?(?:sections?\b|secs?\b\.?|ss\.|s\.|u\/s\b\.?)`;
const W_NUM = String.raw`\d{1,3}[A-Z]?(?:\([0-9A-Za-z]+\))*(?![0-9A-Za-z])`;
const W_SEP = String.raw`\s*(?:,|&|\/|-|–|—|\band\b|\bto\b|\br\/w\b|\bread\s+with\b)\s*`;
const W_LIST = `${W_NUM}(?:${W_SEP}${W_NUM})*`;
const W_LINK = String.raw`\s*(?:of\s+)?(?:the\s+)?`;
/** Words after which a number is not a section ("FIR No. 85 BSA", "para 3 BNS"). */
const W_NOT_SECTION_BEFORE = String.raw`(?<!\b(?:no|nos|fir|dated|on|para|paragraph|page|pages|annexure|clause|rule|order|article|art|item|chapter|schedule)\.?\s*)`;
/**
 * A citation window: (a) a section cue and its number list, with the Act straight
 * after if there is one; (b) an Act name then a number list (an optional cue
 * between), with a second Act straight after if there is one; (c) a number list
 * then an Act name. Anything outside a window is never read.
 */
const CITATION_WINDOW = new RegExp(
  [
    `${W_CUE}\\s*${W_LIST}(?:${W_LINK}(?:${W_ACT}))?`,
    `(?:${W_ACT})\\s+(?:${W_CUE}\\s*)?${W_LIST}(?:${W_LINK}(?:${W_ACT}))?`,
    `${W_NOT_SECTION_BEFORE}(?<![0-9A-Za-z/.\\-–—(])${W_LIST}\\s+(?:of\\s+)?(?:the\\s+)?(?:${W_ACT})`,
  ].join('|'),
  'gi',
);
/** A plain-number range inside a window: "3-5", "3 – 5", "3 to 5". */
const RANGE = /(?<![0-9A-Za-z(])(\d{1,3})\s*(?:-|–|—|\bto\b)\s*(\d{1,3})(?![0-9A-Za-z(])/gi;

/**
 * Q8: a double-letter section ("376AB", "103AB"). The reader takes one capital
 * letter only and would read "376AB" as 376, so before windowing each one is
 * swapped for its number plus a stand-in bracket ("376(zqx0)"), which the window
 * grammar and the reader carry as an ordinary sub-section, and swapped back after
 * reading. Capitals only, so "21st" or "2nd" never become sections.
 */
const DOUBLE_LETTER = /(?<![0-9A-Za-z])(\d{1,3})([A-Z]{2})(?![0-9A-Za-z])/g;
const DOUBLE_LETTER_STAND_IN = /^(\d{1,3})\(zqx(\d+)\)/;

/**
 * Round 4: a hyphenated letter suffix ("103-A", "498-a", "103-AB") is folded to the
 * digits plus the upper-cased letters before windowing, so it is read as 103A,
 * 498A or 103AB (a double letter, then swapped as above). Digit-to-digit ranges
 * ("3-5") never match: a letter must follow the hyphen.
 */
const HYPHEN_SUFFIX = /(?<![0-9A-Za-z])(\d{1,3})-([A-Za-z]{1,2})(?![0-9A-Za-z])/g;

/**
 * Round 4: inside a window, a lower-case single letter straight after the digits
 * ("103a", "498a") is upper-cased before the reader sees it; the reader takes
 * capitals only and would otherwise read 103. Window-only, so prose is untouched.
 */
const LOWER_SUFFIX = /(?<![0-9A-Za-z])(\d{1,3})([a-z])(?![0-9A-Za-z])/g;

/**
 * T-347: a four-digit section number ("BNS 1034", "s. 1034 of the IPC"). No section
 * in the six codes has four digits, so it is always wrong, but the window grammar
 * and the reader take 1-3 digits only (the reader drops any run of 4+ digits). So,
 * like the Q8 double letters, each one is swapped before windowing for a stand-in
 * the reader carries as an ordinary sub-section ("1(zqf0)") and restored after
 * reading; isActCitationValid then marks it invalid. Being an ordinary window
 * number, it is only read with a section cue or an Act name next to it (Q2), so
 * "Rs 1500" or "page 1034" stay unchecked. An optional capital letter (or two),
 * or one lower-case letter, is kept with it.
 * Q1: 1800-2099 read as years and are never swapped, so they stay unread.
 * Not after a digit, letter, "/", "." or "," (so "1,034", "Rs.1500", "302/1034"
 * are left alone); a range end ("ss. 10-1034") is swapped and read on its own.
 */
const FOUR_DIGIT = /(?<![0-9A-Za-z/.,])(\d{4})([A-Z]{1,2}|[a-z])?(?![0-9A-Za-z])/g;
const FOUR_DIGIT_STAND_IN = /^1\(zqf(\d+)\)/;
/** Q1: four-digit numbers in this span read as years and are never flagged. */
const YEAR_FIRST = 1800;
const YEAR_LAST = 2099;

/**
 * T-270: the one producer of Act-scoped citations, used by both section checks
 * (validateSectionReferences and extractBNSSectionNumbers/validateBNSWhitelist).
 *
 * Each citation window (CITATION_WINDOW) is read on its own by the T-277 reader,
 * so an Act code is never carried across the prose of a whole draft. A number the
 * reader leaves bare is not checked (Q4). A range has its inner numbers added under
 * the Act its two ends were read with; a range of more than 20 numbers, or a
 * backwards one, is unreadable and none of it is checked (Q1). Deduped on
 * (Act, number), in first-seen order.
 */
export function extractActCitations(
  text: string,
  opts: { includeRangeInner?: boolean } = {},
): ActCitation[] {
  /** T-333 ruling B: false = only numbers written out, not a range's inner numbers. */
  const includeRangeInner = opts.includeRangeInner ?? true;
  const out: ActCitation[] = [];
  const seen = new Set<string>();
  const add = (act: CheckedAct, number: string): void => {
    const key = `${act}|${number}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ act, number });
  };

  // Round 4: fold "103-A" / "498-a" / "103-AB" to 103A / 498A / 103AB.
  const folded = text.replace(
    HYPHEN_SUFFIX,
    (_m, digits: string, letters: string) => `${digits}${letters.toUpperCase()}`,
  );
  // T-347: swap four-digit sections (not 1800-2099) for stand-ins; restored on read.
  const fours: string[] = [];
  const unfoured = folded.replace(FOUR_DIGIT, (m, digits: string, letters: string | undefined) => {
    const n = Number(digits);
    if (n >= YEAR_FIRST && n <= YEAR_LAST) return m;
    fours.push(`${digits}${(letters ?? '').toUpperCase()}`);
    return `1(zqf${fours.length - 1})`;
  });
  // Q8: swap double-letter sections for stand-ins; restored on each number read.
  const doubles: string[] = [];
  const prepared = unfoured.replace(DOUBLE_LETTER, (_m, digits: string, letters: string) => {
    doubles.push(`${digits}${letters}`);
    return `${digits}(zqx${doubles.length - 1})`;
  });
  const restore = (number: string): string =>
    number
      .replace(DOUBLE_LETTER_STAND_IN, (m, _d: string, i: string) => doubles[Number(i)] ?? m)
      .replace(FOUR_DIGIT_STAND_IN, (m, i: string) => fours[Number(i)] ?? m);

  CITATION_WINDOW.lastIndex = 0;
  for (const w of prepared.matchAll(CITATION_WINDOW)) {
    const window = w[0].replace(
      LOWER_SUFFIX,
      (_m, digits: string, letter: string) => `${digits}${letter.toUpperCase()}`,
    );
    const read: ActCitation[] = [];
    for (const e of readSectionsCharged(window)) {
      const act = e.code ? CHECKED_ACT[e.code] : undefined;
      if (act) read.push({ act, number: restore(e.number) });
    }

    const dropped = new Set<string>();
    /** Range start (act|number) → the inner numbers, added straight after the start. */
    const inner = new Map<string, string[]>();
    for (const r of window.matchAll(RANGE)) {
      const from = read.find((c) => c.number === r[1]);
      const to = read.find((c) => c.number === r[2]);
      if (!from || !to || from.act !== to.act) continue;
      const a = Number(r[1]);
      const b = Number(r[2]);
      if (b < a || b - a + 1 > MAX_RANGE_NUMBERS) {
        dropped.add(`${from.act}|${r[1]}`).add(`${to.act}|${r[2]}`);
        continue;
      }
      const list = inner.get(`${from.act}|${r[1]}`) ?? [];
      for (let n = a + 1; n < b; n++) list.push(String(n));
      inner.set(`${from.act}|${r[1]}`, list);
    }

    for (const c of read) {
      const key = `${c.act}|${c.number}`;
      if (dropped.has(key)) continue;
      add(c.act, c.number);
      if (includeRangeInner) for (const n of inner.get(key) ?? []) add(c.act, n);
    }
  }
  return out;
}

/**
 * T-270 Q3: whether a citation is valid under its own Act (Q2). Sub-sections are
 * checked by their parent number only: 61(2)(a) → 61.
 * - BNS 1-358, BNSS 1-531, BSA 1-170 by range; any letter suffix is invalid.
 * - IPC, CrPC, IEA: valid only if the parent number is a row in the signed mapping,
 *   whatever the row's type. Double letters (Q8) follow the same rules:
 *   "376AB IPC" is a row check, "BNS 103AB" is invalid.
 */
export function isActCitationValid(act: CheckedAct, number: string): boolean {
  const parent = number
    .replace(/\(.*$/, '')
    .trim()
    .toUpperCase()
    .replace(/^0+(?=\d)/, '');
  const last = NEW_ACT_LAST_SECTION[act];
  if (last !== undefined) {
    if (!/^\d+$/.test(parent)) return false;
    const n = Number(parent);
    return n >= 1 && n <= last;
  }
  const rows = OLD_ACT_ROWS[act];
  return rows ? rows.has(parent) : true;
}

// ── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validate section references, each against its own Act's signed table (T-270).
 * Reads every form Ajay ruled on (Q1) through extractActCitations; a miss is an
 * `invalid_section` warning, never a block (Q5).
 *
 * T-270: `docRule` no longer decides validity (the old check matched numbers only,
 * against the rule's relevantActs, whatever the Act). It is kept in the signature
 * for the existing callers.
 */
export function validateSectionReferences(
  text: string,
  _docRule: DocumentRuleConfig | null,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  for (const c of extractActCitations(text)) {
    if (isActCitationValid(c.act, c.number)) continue;
    warnings.push({
      type: 'invalid_section',
      message: `Section ${c.number} of ${c.act} not found in the verified section mapping. Please verify this reference.`,
      details: { section: c.number, code: c.act },
    });
  }
  return warnings;
}

/**
 * Detect old IPC/CrPC/IEA references and suggest BNS/BNSS/BSA equivalents.
 * Uses the SCRUM-27 section mapping database for accurate suggestions.
 */
export async function detectOldLawReferences(text: string): Promise<ValidationWarning[]> {
  const refs = extractOldLawReferences(text);
  if (refs.length === 0) return [];

  const warnings: ValidationWarning[] = [];
  const seen = new Set<string>();

  // Look up each old-law reference in parallel
  const lookups = await Promise.all(
    refs
      .filter((ref) => {
        const key = `${ref.code}:${ref.section}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(async (ref) => {
        const result = await lookupOldToNew(ref.section, ref.code);
        return { ref, result };
      }),
  );

  for (const { ref, result } of lookups) {
    if (result && result.new_section) {
      warnings.push({
        type: 'old_law_reference',
        message: `Old law reference detected: Section ${ref.section} ${ref.code}. Use Section ${result.new_section} ${result.new_code} (${result.new_code_full}) instead.`,
        details: {
          section: ref.section,
          code: ref.code,
          suggestedReplacement: `Section ${result.new_section} ${result.new_code}`,
        },
      });
    } else {
      warnings.push({
        type: 'old_law_reference',
        message: `Old law reference detected: Section ${ref.section} ${ref.code}. Please verify and use the corresponding BNS/BNSS/BSA section.`,
        details: { section: ref.section, code: ref.code },
      });
    }
  }

  return warnings;
}

/**
 * Check that all mandatory clauses are present in the generated text.
 * Uses keyword matching to detect whether each clause was included.
 */
export function checkMandatoryClauses(
  text: string,
  docRule: DocumentRuleConfig | null,
): { missing: ValidationWarning[]; allPresent: boolean } {
  if (!docRule) return { missing: [], allPresent: true };

  const lowerText = text.toLowerCase();
  const missing: ValidationWarning[] = [];

  // Clause detection keywords — map clause IDs to text patterns that indicate presence
  const clauseDetectors: Record<string, string[]> = {
    grounds: ['ground', 'grounds for bail', 'reasons for'],
    fir_details: ['fir no', 'f.i.r', 'first information report', 'police station'],
    custody_status: ['custody', 'judicial custody', 'police custody', 'arrested on'],
    no_flight_risk: ['abscond', 'flight risk', 'will not flee', 'tamper with evidence'],
    apprehension: ['apprehension', 'reason to believe', 'likely to be arrested'],
    false_implication: ['false implication', 'malafide', 'mala fide', 'falsely implicated'],
    cheque_details: ['cheque no', 'cheque number', 'cheque dated', 'drawn on'],
    dishonour_details: ['dishonour', 'dishonored', 'return memo', 'insufficient funds'],
    underlying_liability: ['liability', 'debt', 'legally enforceable'],
    demand_15_days: ['15 days', 'fifteen days', 'within 15'],
    consequence_warning: ['criminal complaint', 'criminal prosecution', 'section 138'],
    notice_purpose: ['notice', 'section 80', 'statutory requirement'],
    cause_of_action: ['cause of action', 'facts giving rise'],
    demand: ['demand', 'called upon', 'required to'],
    two_month_notice: ['two months', '2 months', 'sixty days'],
    prayer: ['prayer', 'humbly pray', 'respectfully prayed', 'prayed that'],
    property_description: ['property', 'premises', 'situated at', 'address of'],
    rent_amount: ['rent', 'monthly rent', 'per month'],
    security_deposit: ['security deposit', 'earnest money', 'caution deposit'],
    tenure: ['tenure', 'lease period', 'duration', 'term of'],
    maintenance: ['maintenance', 'repair', 'upkeep'],
    termination: ['termination', 'notice period', 'vacate'],
    consumer_status: ['consumer', 'consumer protection act', 'section 2(7)'],
    deficiency_details: ['deficiency', 'defect', 'defective'],
    consideration: ['consideration', 'amount paid', 'payment of'],
    grievance_attempts: ['grievance', 'complaint to', 'approached'],
    territorial_jurisdiction: ['territorial jurisdiction', 'jurisdiction'],
    pecuniary_jurisdiction: ['pecuniary jurisdiction', 'value of'],
    limitation: ['limitation', 'within 2 years', 'within two years'],
    // DV/dowry clause detectors (CLO fix #6)
    dv_no_contact: ['no contact', 'not contact', 'stay away', 'restrain'],
    stridhan_undertaking: ['stridhan', 'dowry articles', 'dowry items'],
    pwdva_reference: ['pwdva', 'domestic violence act', 'protection of women'],
  };

  // Rule-pack reader: accepts `mandatoryClauses` or `mandatory_clauses` (T-182)
  for (const clause of readMandatoryClauses(docRule)) {
    // Skip verification and advocate_details — these are added programmatically
    if (clause.id === 'verification' || clause.id === 'advocate_details' || clause.id === 'witness')
      continue;
    if (!clause.required) continue;

    const detectors = clauseDetectors[clause.id];
    if (!detectors) continue;

    const found = detectors.some((keyword) => lowerText.includes(keyword));
    if (!found) {
      missing.push({
        type: 'missing_clause',
        message: `Mandatory clause "${clause.title}" may be missing from the draft. Please review.`,
        details: { clauseId: clause.id },
      });
    }
  }

  return { missing, allPresent: missing.length === 0 };
}

/**
 * Build the list of sections cited in the document (for DB sectionsCited field).
 * SCRUM-54 B3: Only include sections that have an explicit code qualifier in the text
 * (e.g., "Section 482 BNSS"). Unqualified "Section 80" without a code name could refer
 * to CPC, CPA, or other acts — don't assume BNS and mislabel them.
 */
export function buildSectionsCited(text: string): string[] {
  const refs = extractSectionReferences(text);
  const cited = new Set<string>();

  for (const ref of refs) {
    // Only include refs where the code was explicitly qualified in the text
    if (ref.code) {
      cited.add(`${ref.code} ${ref.section}`);
    }
  }

  return [...cited];
}

// ── SCRUM-64: BNS Whitelist Validator + Fact↔Section Sanity ─────────────────

/**
 * Extract BNS section numbers cited in AI-generated text.
 * T-270: the BNS citations of extractActCitations, so every form Ajay ruled on is
 * read ("BNS 103", "103 BNS", "S. 61(2)(a) BNS", "Ss. 3-5 BNS", "Section 103 of
 * the Bharatiya Nyaya Sanhita", ...), each window read by the T-277 reader.
 */
export function extractBNSSectionNumbers(
  text: string,
  opts: { includeRangeInner?: boolean } = {},
): string[] {
  return extractActCitations(text, opts)
    .filter((c) => c.act === 'BNS')
    .map((c) => c.number);
}

/**
 * SCRUM-64 (b): Flag BNS sections that are not valid BNS sections.
 * T-270 Q3: BNS 1-358 by range, parent number only, no letter suffix
 * (isActCitationValid, the same rule validateSectionReferences uses).
 * T-270 Q7: this range supersedes T-277 R5 for the post-draft validator only.
 * Preflight keeps R5 (the offence table via resolveBnsKey).
 */
export function validateBNSWhitelist(bnsNumbers: string[]): ValidationWarning[] {
  return bnsNumbers
    .filter((n) => !isActCitationValid('BNS', n))
    .map((n) => ({
      type: 'invalid_section' as const,
      message: `BNS Section ${n} cited but not found in the First Schedule whitelist — likely hallucinated. Please verify or replace.`,
      details: { section: n, code: 'BNS' },
    }));
}

/**
 * SCRUM-64 (c): Fact↔section sanity check.
 * BNS 103 (Murder) requires facts to mention death/killing.
 * If facts only allege injury without fatality → flag and suggest S.109 or S.117.
 */
const DEATH_TERMS = /\b(died?|death|kill(?:ed|ing)?|murder(?:ed)?|deceased|fatal(?:ly)?)\b/i;

export function checkFactSectionSanity(
  factsNarrative: string,
  bnsNumbersCited: string[],
): ValidationWarning[] {
  const hasMurderSection = bnsNumbersCited.some((n) => n === '103' || n.startsWith('103('));
  if (hasMurderSection && !DEATH_TERMS.test(factsNarrative)) {
    return [
      {
        type: 'invalid_section',
        message:
          'Section 103 of BNS (Murder) is cited but the facts do not mention death, killing, or fatality. ' +
          'If the allegation is injury only, consider Section 109 (Attempt to Murder) or Section 117 (Grievous Hurt) instead.',
        details: { section: '103', code: 'BNS', suggestedReplacement: 'BNS 109 or BNS 117' },
      },
    ];
  }
  return [];
}

// ── Main Validator ───────────────────────────────────────────────────────────

/**
 * T-270 ruling A (Ajay): an IPC/CrPC/IEA cite that is not a table row gets only the
 * "not found" invalid_section warning, never also old_law_reference. Matched on
 * details.code + details.section, which both warnings carry ('IPC'/'CrPC'/'IEA').
 * Used by validate() and, since T-333, by the stream draft paths.
 */
export function dropOldLawForNotFound(
  oldLawWarnings: ValidationWarning[],
  sectionWarnings: ValidationWarning[],
): ValidationWarning[] {
  const citeKey = (w: ValidationWarning): string =>
    `${w.details?.code ?? ''}|${(w.details?.section ?? '').toUpperCase()}`;
  const notFound = new Set(
    sectionWarnings.filter((w) => w.type === 'invalid_section').map(citeKey),
  );
  return oldLawWarnings.filter((w) => !notFound.has(citeKey(w)));
}

/**
 * T-346: the post-draft citation check, shared by the three stream draft paths
 * (template, brief, guided) so they cannot drift apart. Returns, in this order:
 *   1. old-law references, minus any cite that is "not found" (T-270 ruling A);
 *   2. BNS whitelist warnings (SCRUM-64 b);
 *   3. the other five codes (BNSS, BSA, IPC, CrPC, IEA) as validate() checks them (T-333).
 * BNS is left to the whitelist, so it is not warned twice. The fact-section sanity
 * check (T-333 ruling B) is not part of this; the callers run it themselves.
 */
export async function checkDraftCitations(text: string): Promise<ValidationWarning[]> {
  const otherCodeWarnings = validateSectionReferences(text, null).filter(
    (w) => w.details?.code !== 'BNS',
  );
  const oldLawWarnings = dropOldLawForNotFound(
    await detectOldLawReferences(text),
    otherCodeWarnings,
  );
  const bnsWhitelistWarnings = validateBNSWhitelist(extractBNSSectionNumbers(text));
  return [...oldLawWarnings, ...bnsWhitelistWarnings, ...otherCodeWarnings];
}

/**
 * Run the full validation pipeline on the generated + post-processed text.
 */
export async function validate(
  text: string,
  docRule: DocumentRuleConfig | null,
): Promise<ValidationResult> {
  // Run all validations in parallel
  const [sectionWarnings, oldLawWarnings, clauseResult] = await Promise.all([
    Promise.resolve(validateSectionReferences(text, docRule)),
    detectOldLawReferences(text),
    Promise.resolve(checkMandatoryClauses(text, docRule)),
  ]);

  const sectionsCited = buildSectionsCited(text);

  const oldLawKept = dropOldLawForNotFound(oldLawWarnings, sectionWarnings);

  return {
    warnings: [...sectionWarnings, ...oldLawKept, ...clauseResult.missing],
    sectionsCited,
    mandatoryClausesComplete: clauseResult.allPresent,
  };
}
