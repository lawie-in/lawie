/**
 * Layer 1 — Modular Prompt Assembly
 *
 * Assembles AI prompts from document-rules + court-rules JSON configs
 * instead of hardcoded strings. The prompt is: base_prompt + document_type_rules
 * + court_rules + bns_context + user facts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { convertOldReferencesInText } from './sections.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocumentRuleConfig {
  docType: string;
  parentDocType: string | null;
  displayName: string;
  category: string;
  causeTitle: {
    format: string;
    partyDesignations: { role: string; label: string }[];
    caseNomenclature: string;
  };
  mandatoryClauses: {
    id: string;
    name: string;
    required: boolean;
    description: string;
  }[];
  prayerTemplate: string;
  verificationTemplate: string;
  filingChecklist: string[];
  relevantActs: {
    act: string;
    sections: { number: string; description: string }[];
  }[];
  promptInstructions: string[];
}

export interface CourtRuleConfig {
  courtId: string;
  displayName: string;
  courtType: string;
  designation: string;
  jurisdictionNote: string;
  formattingPreferences: {
    numberingStyle: string;
    paragraphStyle: string;
    sectionHeadingStyle: string;
    causeListFormat: string;
  };
  localRules: string[];
}

export interface PromptInput {
  docType: string;
  courtName: string;
  courtType: string;
  partyDetails: Record<string, string | undefined>;
  keyFacts: string;
  reliefPrayer: string;
  advocateName?: string;
  advocateEnrollment?: string;
  // Bail-specific (CLO fixes)
  firNumber?: string;
  firDate?: string;
  policeStation?: string;
  district?: string;
  fatherName?: string;
  mediationWilling?: boolean;
}

// ── Config Loading ───────────────────────────────────────────────────────────

const CONFIG_DIR = join(__dirname, '..', 'config');
const DOC_RULES_DIR = join(CONFIG_DIR, 'document-rules');
const COURT_RULES_DIR = join(CONFIG_DIR, 'court-rules');

// Cache loaded configs in memory — they don't change at runtime
const docRuleCache = new Map<string, DocumentRuleConfig>();
const courtRuleCache = new Map<string, CourtRuleConfig>();

/**
 * Map existing docType values to their most specific document-rule config.
 * Falls back to the exact docType name if no mapping exists.
 */
const DOC_TYPE_TO_RULE: Record<string, string> = {
  bail_application: 'bail_regular',
  legal_notice: 'legal_notice_s80',
  complaint: 'consumer_complaint',
};

function loadDocRule(ruleKey: string): DocumentRuleConfig | null {
  if (docRuleCache.has(ruleKey)) return docRuleCache.get(ruleKey)!;

  try {
    const raw = readFileSync(join(DOC_RULES_DIR, `${ruleKey}.json`), 'utf-8');
    const config: DocumentRuleConfig = JSON.parse(raw);
    docRuleCache.set(ruleKey, config);
    return config;
  } catch {
    return null;
  }
}

function loadCourtRule(ruleKey: string): CourtRuleConfig | null {
  if (courtRuleCache.has(ruleKey)) return courtRuleCache.get(ruleKey)!;

  try {
    const raw = readFileSync(join(COURT_RULES_DIR, `${ruleKey}.json`), 'utf-8');
    const config: CourtRuleConfig = JSON.parse(raw);
    courtRuleCache.set(ruleKey, config);
    return config;
  } catch {
    return null;
  }
}

/**
 * Resolve a docType to the best matching document-rule config.
 * Tries: exact match → mapped parent → null (fallback to legacy).
 */
export function resolveDocRule(docType: string): DocumentRuleConfig | null {
  // Try exact match first (e.g., "bail_regular" or "legal_notice_s138")
  const exact = loadDocRule(docType);
  if (exact) return exact;

  // Try mapped alias (e.g., "bail_application" → "bail_regular")
  const mapped = DOC_TYPE_TO_RULE[docType];
  if (mapped) return loadDocRule(mapped);

  return null;
}

/**
 * Resolve a court type + court name to the best matching court-rule config.
 * Tries: specific court ID → generic court type → null.
 */
export function resolveCourtRule(courtType: string, courtName: string): CourtRuleConfig | null {
  // Normalize court name for matching (e.g., "Patna High Court" → "patna_hc")
  const normalized = courtName.toLowerCase();

  // Check specific court-type names first (most specific wins)
  if (normalized.includes('jmfc') || normalized.includes('judicial magistrate first class')) {
    return loadCourtRule('jmfc_generic');
  }
  if (normalized.includes('sessions') || normalized.includes('additional sessions')) {
    return loadCourtRule('sessions_generic');
  }

  // Check for city/court-specific matches
  if (normalized.includes('patna') && courtType === 'high_court') {
    const specific = loadCourtRule('patna_hc');
    if (specific) return specific;
  }

  // Map courtType to generic rule
  const typeMapping: Record<string, string> = {
    district_court: 'district_court_generic',
    high_court: 'patna_hc', // default HC for now — expand as we add more
    consumer_forum: 'district_court_generic',
    family_court: 'district_court_generic',
  };

  const genericKey = typeMapping[courtType];
  if (genericKey) return loadCourtRule(genericKey);

  return null;
}

// ── Prompt Assembly ──────────────────────────────────────────────────────────

/**
 * Build the base system prompt that applies to all document types.
 */
function buildBasePrompt(): string {
  return `You are a senior Indian advocate with 20+ years of practice, drafting a court-ready legal document.

CRITICAL RULES:
1. Use ONLY Bharatiya Nyaya Sanhita (BNS) 2023, Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023, and Bharatiya Sakshya Adhiniyam (BSA) 2023 section numbers where applicable. NEVER reference old IPC, CrPC, or IEA section numbers.
2. Format with numbered paragraphs (1, 2, 3...) for the body.
3. Use formal, respectful legal language appropriate for Indian courts.
4. Use placeholders [DATE] and [PLACE] where specific dates/places are not provided.
5. Do NOT include any commentary, explanations, or notes outside the document itself.
6. Do NOT generate the Verification clause, Advocate signature block, or Disclaimer — these are added programmatically by the system.
7. Focus on generating LEGAL CONTENT only. Formatting is handled separately.
8. NEVER alter, embellish, or contradict the user's stated facts. Reproduce FIR numbers, dates, names, and amounts EXACTLY as provided. If a fact seems incomplete, use the value as given — do not invent details.
9. Use today's date format (DD/MM/YYYY) where a current date is needed. Do NOT hardcode any specific year.`;
}

/**
 * Build document-type-specific instructions from the config.
 */
function buildDocTypeSection(config: DocumentRuleConfig): string {
  const lines: string[] = [
    `\n--- DOCUMENT TYPE: ${config.displayName} ---`,
    `Category: ${config.category}`,
  ];

  // Mandatory clauses the AI should include
  const requiredClauses = config.mandatoryClauses
    .filter((c) => c.required && c.id !== 'verification' && c.id !== 'advocate_details')
    .map((c) => `  - ${c.name}: ${c.description}`);

  if (requiredClauses.length > 0) {
    lines.push('\nMandatory sections to include in the draft:');
    lines.push(...requiredClauses);
  }

  // Specific instructions from the config
  if (config.promptInstructions.length > 0) {
    lines.push('\nSpecific instructions:');
    config.promptInstructions.forEach((inst, i) => {
      lines.push(`${i + 1}. ${inst}`);
    });
  }

  return lines.join('\n');
}

/**
 * Build court-specific instructions from the config.
 */
function buildCourtSection(config: CourtRuleConfig): string {
  const lines: string[] = [
    `\n--- COURT: ${config.displayName} ---`,
    `Designation: ${config.designation}`,
    `Numbering style: ${config.formattingPreferences.numberingStyle}`,
  ];

  if (config.localRules.length > 0) {
    lines.push('\nCourt-specific rules to follow:');
    config.localRules.forEach((rule) => lines.push(`  - ${rule}`));
  }

  return lines.join('\n');
}

/**
 * Build statutory context from the document-rule's relevant acts.
 */
function buildStatutoryContext(config: DocumentRuleConfig): string {
  if (config.relevantActs.length === 0) return '';

  const lines: string[] = ['\n--- RELEVANT STATUTORY PROVISIONS ---'];
  for (const act of config.relevantActs) {
    lines.push(`\n${act.act}:`);
    act.sections.forEach((s) => {
      lines.push(`  - Section ${s.number}: ${s.description}`);
    });
  }

  return lines.join('\n');
}

/**
 * Build the user-facts section (party details, key facts, relief).
 */
function buildUserFactsSection(input: PromptInput, docConfig: DocumentRuleConfig | null): string {
  const partyLines = Object.entries(input.partyDetails)
    .filter(([, v]) => v)
    .map(([role, name]) => {
      // Use the config's party designation labels if available
      const designation = docConfig?.causeTitle.partyDesignations.find(
        (p) => p.role === role,
      )?.label;
      const label = designation || role.charAt(0).toUpperCase() + role.slice(1);
      return `${label}: ${name}`;
    })
    .join('\n');

  // Build FIR details block for bail applications (CLO fix #1)
  let firBlock = '';
  if (input.firNumber || input.firDate || input.policeStation || input.district) {
    const parts: string[] = [];
    if (input.firNumber) parts.push(`FIR No. ${input.firNumber}`);
    if (input.firDate) parts.push(`dated ${input.firDate}`);
    if (input.policeStation) parts.push(`registered at P.S. ${input.policeStation}`);
    if (input.district) parts.push(`District ${input.district}`);
    firBlock = `\nFIR Details (MUST appear in paragraph 1):\n${parts.join(', ')}`;
  }

  // Father's name for verification (CLO fix #2)
  let fatherBlock = '';
  if (input.fatherName) {
    fatherBlock = `\nFather's/Guardian's name: ${input.fatherName}`;
  }

  // Mediation willingness (CLO fix #9)
  let mediationBlock = '';
  if (input.mediationWilling) {
    mediationBlock =
      '\n\nNote: The applicant is willing to explore mediation/settlement. Include a paragraph expressing willingness to participate in mediation if directed by the court.';
  }

  return `\n--- CASE DETAILS ---
Court: ${input.courtName} (${input.courtType.replace(/_/g, ' ')})

Parties:
${partyLines || 'Not specified'}${fatherBlock}${firBlock}

Key facts:
${input.keyFacts}

Relief/Prayer sought:
${input.reliefPrayer}${mediationBlock}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  docRule: DocumentRuleConfig | null;
  courtRule: CourtRuleConfig | null;
}

/**
 * Assemble a complete prompt from modular configs.
 *
 * Returns a system prompt (instructions) and user prompt (facts)
 * for optimal Claude message structure.
 */
export async function assemblePrompt(input: PromptInput): Promise<AssembledPrompt> {
  const docRule = resolveDocRule(input.docType);
  const courtRule = resolveCourtRule(input.courtType, input.courtName);

  // Auto-convert old-law references in user input
  const { converted: convertedFacts } = await convertOldReferencesInText(input.keyFacts);
  const { converted: convertedRelief } = await convertOldReferencesInText(input.reliefPrayer);

  const convertedInput = { ...input, keyFacts: convertedFacts, reliefPrayer: convertedRelief };

  // Build system prompt from modular pieces
  const systemParts: string[] = [buildBasePrompt()];

  if (docRule) {
    systemParts.push(buildDocTypeSection(docRule));
    systemParts.push(buildStatutoryContext(docRule));
  }

  if (courtRule) {
    systemParts.push(buildCourtSection(courtRule));
  }

  const systemPrompt = systemParts.join('\n');

  // Build user prompt with the case facts
  const userPrompt =
    buildUserFactsSection(convertedInput, docRule) +
    (input.advocateName
      ? `\n\nAdvocate: ${input.advocateName}${input.advocateEnrollment ? `, Enrl. No. ${input.advocateEnrollment}` : ''}`
      : '') +
    '\n\nDraft the complete document now:';

  return { systemPrompt, userPrompt, docRule, courtRule };
}

// ── Exported for testing ─────────────────────────────────────────────────────
export const _testing = {
  buildBasePrompt,
  buildDocTypeSection,
  buildCourtSection,
  buildStatutoryContext,
  buildUserFactsSection,
  loadDocRule,
  loadCourtRule,
};
