/**
 * Layer 3 — Validation Before Output
 *
 * Validates the generated document before sending to the user:
 * - Extract section references and check against SCRUM-27 mapping
 * - Detect old IPC/CrPC/IEA references and suggest BNS/BNSS/BSA equivalents
 * - Check mandatory clauses are present
 * - Auto-add missing mandatory sections from templates
 */
import bnsOffences from '../config/bns-offences.json';

import { DocumentRuleConfig } from './prompt-assembler';
import { lookupOldToNew } from './sections.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ValidationWarning {
  type:
    | 'invalid_section'
    | 'old_law_reference'
    | 'missing_clause'
    | 'fact_alteration'
    | 'coherence_mismatch';
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

// ── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validate section references against the document-rule's known sections.
 * Returns warnings for sections not found in the config.
 */
export function validateSectionReferences(
  text: string,
  docRule: DocumentRuleConfig | null,
): ValidationWarning[] {
  if (!docRule) return [];

  // Build a set of known sections from the document rule config
  const knownSections = new Set<string>();
  for (const act of docRule.relevantActs) {
    for (const s of act.sections) {
      knownSections.add(s.number);
    }
  }

  // If no known sections, skip validation
  if (knownSections.size === 0) return [];

  const refs = extractSectionReferences(text);
  const warnings: ValidationWarning[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    // Skip unqualified section refs (no act specified) — can't validate without context
    if (!ref.code) continue;
    const key = `${ref.code}:${ref.section}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!knownSections.has(ref.section)) {
      warnings.push({
        type: 'invalid_section',
        message: `Section ${ref.section} of ${ref.code} not found in the verified section mapping. Please verify this reference.`,
        details: { section: ref.section, code: ref.code },
      });
    }
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

  for (const clause of docRule.mandatoryClauses) {
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
        message: `Mandatory clause "${clause.name}" may be missing from the draft. Please review.`,
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

/** All valid BNS section numbers per the First Schedule (CLO-validated). */
const BNS_SECTION_WHITELIST = new Set(Object.keys(bnsOffences.offences));

/**
 * Extract BNS section numbers cited in AI-generated text.
 * Matches "BNS 103", "BNS 103(1)", "Section 103 of BNS/Bharatiya Nyaya Sanhita".
 */
export function extractBNSSectionNumbers(text: string): string[] {
  const found = new Set<string>();
  // "BNS 103" / "BNS 103(1)"
  const shortPat = /\bBNS\s+(\d+(?:\(\d+\))?)/gi;
  let m: RegExpExecArray | null;
  while ((m = shortPat.exec(text)) !== null) found.add(m[1]);
  // "Section 103 of BNS" / "Section 103(1) of Bharatiya Nyaya Sanhita"
  const longPat =
    /\bSection\s+(\d+(?:\(\d+\))?)\s+of\s+(?:the\s+)?(?:BNS|Bharatiya Nyaya Sanhita)/gi;
  while ((m = longPat.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

/**
 * SCRUM-64 (b): Flag BNS sections that are not in the CLO-validated whitelist.
 * Catches hallucinated section numbers like BNS 301 that don't exist in the First Schedule.
 */
export function validateBNSWhitelist(bnsNumbers: string[]): ValidationWarning[] {
  return bnsNumbers
    .filter((n) => !BNS_SECTION_WHITELIST.has(n))
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

  return {
    warnings: [...sectionWarnings, ...oldLawWarnings, ...clauseResult.missing],
    sectionsCited,
    mandatoryClausesComplete: clauseResult.allPresent,
  };
}
