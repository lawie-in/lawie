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

// ── High Court routing (T-171, AJ-2026-10-08-T171-A1) ───────────────────────

const COURTS_FILE = join(CONFIG_DIR, 'courts', 'indian-courts.json');

/** The High Court rule used when no courts-list entry matches. Never `patna_hc`. */
const HIGH_COURT_FALLBACK = 'high_court_generic';

/** Heading printed when no High Court name was entered (AJ-2026-10-08-T171-A1, item 3). */
export const HIGH_COURT_BLANK_HEADING = 'IN THE HIGH COURT OF __________';

/** Placeholder in a generic High Court rule's designation. */
const COURT_DESIGNATION_PLACEHOLDER = '{courtDesignation}';

interface CourtEntry {
  courtId: string;
  name: string;
  designation?: string;
  courtType: string;
  formattingRulesRef?: string;
}

/** Words that differ between ways of writing the same court's name. */
const COURT_NAME_FILLER = new Set(['the', 'of', 'at', 'in', 'for', 'judicature']);

/**
 * A court name as a key: lower case, "&" as "and", punctuation dropped, filler
 * words dropped, remaining words sorted and de-duplicated. So "Patna High
 * Court" and "High Court of Judicature at Patna" give the same key, while
 * "High Court of Judicature at Allahabad, Lucknow Bench" and "High Court of
 * Judicature at Allahabad" do not.
 */
function courtNameKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !COURT_NAME_FILLER.has(w));
  return [...new Set(words)].sort().join(' ');
}

/** The key of "High Court" alone: a seatless name that names no court. */
const BARE_HIGH_COURT_KEY = courtNameKey('High Court');

/**
 * A court's name without its seat clause: the text after the last comma, or
 * else after the last " at ", is dropped.
 * "Jharkhand High Court, Ranchi" -> "Jharkhand High Court".
 */
function withoutSeat(name: string): string {
  const comma = name.lastIndexOf(',');
  if (comma > 0) return name.slice(0, comma);
  const at = name.toLowerCase().lastIndexOf(' at ');
  if (at > 0) return name.slice(0, at);
  return name;
}

/** One courts-list High Court entry under one name key. */
interface HighCourtIndexHit {
  ref: string;
  designation?: string;
  /** True when the key is the entry's name with its seat clause removed. */
  seatless: boolean;
}

let highCourtIndex: Map<string, HighCourtIndexHit[]> | null = null;

function addHit(index: Map<string, HighCourtIndexHit[]>, key: string, hit: HighCourtIndexHit): void {
  if (!index.has(key)) index.set(key, []);
  index.get(key)!.push(hit);
}

/**
 * Index of High Court entries in indian-courts.json: name key → every entry
 * with that key. An entry is keyed by its courtId, its name and its
 * designation, and (courtType `high_court` only) by its name without the seat.
 */
function loadHighCourtIndex(): Map<string, HighCourtIndexHit[]> {
  if (highCourtIndex) return highCourtIndex;
  const index = new Map<string, HighCourtIndexHit[]>();
  try {
    const data = JSON.parse(readFileSync(COURTS_FILE, 'utf-8')) as { courts?: CourtEntry[] };
    for (const court of data.courts ?? []) {
      if (court.courtType !== 'high_court' && court.courtType !== 'high_court_bench') continue;
      if (!court.formattingRulesRef) continue;
      const ref = court.formattingRulesRef;
      const designation = court.designation;
      for (const label of [court.courtId, court.name, court.designation]) {
        if (!label) continue;
        const key = courtNameKey(label);
        if (key) addHit(index, key, { ref, designation, seatless: false });
      }
      // T-171 round 2: a High Court is also reached by its name without the seat
      // ("Jharkhand High Court, Ranchi" -> "Jharkhand High Court").
      if (court.courtType === 'high_court' && court.name) {
        const key = courtNameKey(withoutSeat(court.name));
        if (key && key !== BARE_HIGH_COURT_KEY) addHit(index, key, { ref, designation, seatless: true });
      }
    }
  } catch {
    // No courts list: every High Court uses the fallback rule.
  }
  highCourtIndex = index;
  return index;
}

/** A matched High Court: the rule to use and, if one is certain, the entry's heading. */
interface HighCourtMatch {
  ref: string;
  designation: string | null;
}

/** The one value in `values`, or null if there are none or they differ. */
function onlyValue(values: (string | undefined)[]): string | null {
  const set = new Set(values.filter((v): v is string => !!v));
  return set.size === 1 ? [...set][0] : null;
}

/**
 * The High Court entry the user's court name names, or null. The whole name
 * must match an entry (see `courtNameKey`); a word inside the name is not
 * enough. If the name matches entries with different rules, it is treated as
 * no match.
 *
 * Heading: the designation of the entries matched by full name; if none match
 * by full name, of the entries matched by seatless name. If those entries'
 * designations differ, there is no certain heading (null).
 */
function matchHighCourt(courtName: string): HighCourtMatch | null {
  const key = courtNameKey(courtName);
  if (!key) return null;
  const hits = loadHighCourtIndex().get(key);
  if (!hits) return null;
  const refs = new Set(hits.map((h) => h.ref));
  if (refs.size !== 1) return null;
  const exact = hits.filter((h) => !h.seatless);
  const headingHits = exact.length > 0 ? exact : hits;
  return { ref: [...refs][0], designation: onlyValue(headingHits.map((h) => h.designation)) };
}

/** The `formattingRulesRef` of the High Court entry the name names, or null. */
function matchHighCourtRef(courtName: string): string | null {
  return matchHighCourt(courtName)?.ref ?? null;
}

/**
 * Priya's guard (T-171 open question, for Ajay to confirm or refuse in the PR):
 * on the High Court path, a matched entry's rule is used only if it is a High
 * Court rule. 17 High Court entries point at `district_court_generic` (T-155);
 * those get the generic High Court rule instead. To drop the guard, return
 * `loadCourtRule(ref)` here.
 */
function highCourtRuleOnly(ref: string): CourtRuleConfig | null {
  const rule = loadCourtRule(ref);
  return rule && rule.courtType === 'high_court' ? rule : null;
}

/**
 * The heading for a High Court rule.
 * - Generic rule (`{courtDesignation}` heading): the court name as the user
 *   entered it; no name: `IN THE HIGH COURT OF __________`.
 * - A court's own rule: the matched courts-list entry's designation
 *   (AJ-2026-10-08-T171-A2: Lucknow Bench prints its own bench, not "AT
 *   ALLAHABAD"). No certain designation: the rule's own heading.
 * Always returns a copy when the heading changes; the cached rule is never mutated.
 */
function withCourtHeading(
  rule: CourtRuleConfig,
  courtName: string,
  matchedDesignation: string | null,
): CourtRuleConfig {
  if (rule.designation.includes(COURT_DESIGNATION_PLACEHOLDER)) {
    const entered = courtName.trim();
    return { ...rule, designation: entered || HIGH_COURT_BLANK_HEADING };
  }
  if (matchedDesignation && matchedDesignation !== rule.designation) {
    return { ...rule, designation: matchedDesignation };
  }
  return rule;
}

/**
 * The rule for a High Court: the matched courts-list entry's rule, or
 * `high_court_generic` when nothing matches. Never `patna_hc` by default.
 */
function resolveHighCourtRule(courtName: string): CourtRuleConfig | null {
  const match = matchHighCourt(courtName);
  const own = match ? highCourtRuleOnly(match.ref) : null;
  const rule = own || loadCourtRule(HIGH_COURT_FALLBACK);
  if (!rule) return null;
  return withCourtHeading(rule, courtName, own ? match!.designation : null);
}

/**
 * Resolve a court type + court name to the best matching court-rule config.
 * Tries: specific court ID → generic court type → null.
 */
export function resolveCourtRule(courtType: string, courtName: string): CourtRuleConfig | null {
  // High Courts route by the courts list's formattingRulesRef (T-171). Checked
  // first: a High Court never takes a JMFC or Sessions rule from a word in its name.
  if (courtType === 'high_court') {
    return resolveHighCourtRule(courtName ?? '');
  }

  // Normalize court name for matching
  const normalized = courtName.toLowerCase();

  // Check specific court-type names first (most specific wins)
  if (normalized.includes('jmfc') || normalized.includes('judicial magistrate first class')) {
    return loadCourtRule('jmfc_generic');
  }
  if (normalized.includes('sessions') || normalized.includes('additional sessions')) {
    return loadCourtRule('sessions_generic');
  }

  // Map courtType to generic rule
  const typeMapping: Record<string, string> = {
    district_court: 'district_court_generic',
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
  courtNameKey,
  matchHighCourtRef,
  matchHighCourt,
  highCourtRuleOnly,
};
