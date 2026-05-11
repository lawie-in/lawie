/**
 * Layer 2 — Post-Processing Formatting
 *
 * AI generates legal CONTENT. This layer handles FORMATTING:
 * - Cause title correction
 * - Numbered paragraphs
 * - Verification clause (template-generated, NOT AI-generated)
 * - Advocate details block from user profile
 * - Filing checklist from document-rules config
 *
 * The AI disclaimer footer is appended ONCE at PDF render time by
 * pdf-export.service.ts (single source of truth). Post-processor must NOT add
 * it to the body — that produced duplicate disclaimers in advocate-pack PDFs
 * when both the template-config "disclaimer" section and contentToHtml ran.
 */
import { DocumentRuleConfig, CourtRuleConfig } from './prompt-assembler';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PostProcessInput {
  /** Raw AI-generated text */
  rawText: string;
  /** Document rule config (if resolved) */
  docRule: DocumentRuleConfig | null;
  /** Court rule config (if resolved) */
  courtRule: CourtRuleConfig | null;
  /** Party details from the form */
  partyDetails: Record<string, string | undefined>;
  /** Advocate name from user profile */
  advocateName?: string;
  /** Advocate enrollment number from user profile */
  advocateEnrollment?: string;
  /** Court name */
  courtName: string;
  /** Whether this is a DV/dowry case — triggers special bail conditions (CLO fix #8) */
  isDvCase?: boolean;
}

export interface PostProcessResult {
  /** Fully formatted document text */
  formattedText: string;
  /** Filing checklist items (for UI display) */
  filingChecklist: string[];
  /** Sections that were auto-appended (for transparency) */
  appendedSections: string[];
}

// ── Formatting Functions ─────────────────────────────────────────────────────

/**
 * Normalize paragraph numbering to consistent numeric format.
 * Handles AI output that may use inconsistent numbering.
 */
export function normalizeNumbering(text: string): string {
  // Find blocks of numbered paragraphs and ensure consistent numbering
  // Match patterns like "1.", "1)", "(1)", "Para 1.", etc.
  let paragraphCounter = 0;
  let inNumberedBlock = false;

  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect numbered paragraph patterns
    const numberedMatch = trimmed.match(
      /^(?:\(?(\d+)\)?[.)]\s?|Para(?:graph)?\s*(\d+)[.:]\s?)(.*)/i,
    );

    if (numberedMatch) {
      inNumberedBlock = true;
      paragraphCounter++;
      const content = numberedMatch[3] || '';
      result.push(`${paragraphCounter}. ${content}`);
    } else if (inNumberedBlock && trimmed === '') {
      // Blank line in numbered block — preserve it
      result.push('');
      inNumberedBlock = false;
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Ensure cause title headings are properly uppercased.
 */
export function formatCauseTitle(text: string, courtRule: CourtRuleConfig | null): string {
  if (!courtRule) return text;

  // Replace any "In the Court of..." variations with the correct designation
  const courtDesignation = courtRule.designation;
  const patterns = [
    /^(IN THE COURT OF .+?)$/im,
    /^(BEFORE THE .+?)$/im,
    /^(IN THE HIGH COURT .+?)$/im,
  ];

  let result = text;
  for (const pattern of patterns) {
    const match = result.match(pattern);
    if (match) {
      // Ensure it's fully uppercased and matches the config
      result = result.replace(match[0], courtDesignation);
      break;
    }
  }

  return result;
}

/**
 * Generate the verification clause from template + form data.
 * This is NOT AI-generated — ensures accuracy of the verification oath.
 */
export function generateVerificationClause(
  docRule: DocumentRuleConfig | null,
  partyDetails: Record<string, string | undefined>,
  _courtName: string,
): string {
  if (!docRule || !docRule.verificationTemplate) return '';

  // Determine the applicant/deponent name
  const deponentName =
    partyDetails.applicant ||
    partyDetails.petitioner ||
    partyDetails.plaintiff ||
    partyDetails.complainant ||
    '[DEPONENT NAME]';

  // Count approximate paragraphs for "paragraphs 1 to N" reference
  const lastParagraph = '[N]';

  // CLO fix #4: Use system date, not hardcoded placeholder
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // CLO fix #2: Use fatherName from partyDetails if provided
  const parentName = partyDetails.fatherName || partyDetails.parentName || '[PARENT NAME]';

  const verification = docRule.verificationTemplate
    .replace(/{applicant}/g, deponentName)
    .replace(/{relation}/g, partyDetails.relation || 'S/o / D/o / W/o')
    .replace(/{parentName}/g, parentName)
    .replace(/{age}/g, partyDetails.age || '[AGE]')
    .replace(/{address}/g, partyDetails.address || '[ADDRESS]')
    .replace(/{lastParagraph}/g, lastParagraph)
    .replace(/{place}/g, '[PLACE]')
    .replace(/{date}/g, dateStr);

  return `\n\n${verification}`;
}

/**
 * Generate the advocate details signature block from user profile.
 */
export function generateAdvocateBlock(advocateName?: string, advocateEnrollment?: string): string {
  if (!advocateName) return '';

  const lines = ['\n\nAdvocate for the Applicant/Petitioner', '', advocateName, 'Advocate'];

  if (advocateEnrollment) {
    lines.push(`Enrl. No. ${advocateEnrollment}`);
  }

  lines.push('[PLACE]', '[DATE]');

  return lines.join('\n');
}

/**
 * Generate the prayer clause from template + form data. (CLO fix #5)
 * Template-generated with correct BNSS sections — not left to AI.
 */
export function generatePrayerClause(
  docRule: DocumentRuleConfig | null,
  partyDetails: Record<string, string | undefined>,
  isDvCase: boolean,
): string {
  if (!docRule || !docRule.prayerTemplate) return '';

  const applicantName =
    partyDetails.applicant ||
    partyDetails.petitioner ||
    partyDetails.plaintiff ||
    '[APPLICANT NAME]';

  // Build FIR details string
  const firParts: string[] = [];
  if (partyDetails.firNumber) firParts.push(`FIR No. ${partyDetails.firNumber}`);
  if (!partyDetails.firNumber) firParts.push('FIR No. ____');
  const firDetails = firParts.join(', ');

  let prayer = docRule.prayerTemplate
    .replace(/{applicant}/g, applicantName)
    .replace(/{firDetails}/g, firDetails);

  // CLO fix #8: Add DV-specific bail conditions
  const specials = (docRule as unknown as Record<string, unknown>).specialPrayerAdditions as
    | Record<string, string>
    | undefined;
  if (isDvCase && specials?.dv_dowry) {
    // Insert DV additions before the last clause
    prayer = prayer.replace(
      /\nc\) Pass any other order/,
      `\n${specials.dv_dowry}\nf) Pass any other order`,
    );
  }

  return `\n\n${prayer}`;
}

/**
 * Generate a filing checklist section from the document-rule config.
 */
export function generateFilingChecklist(docRule: DocumentRuleConfig | null): string[] {
  if (!docRule || docRule.filingChecklist.length === 0) return [];
  return docRule.filingChecklist;
}

// ── Main Post-Processor ──────────────────────────────────────────────────────

/**
 * Post-process AI-generated text into a court-ready document.
 *
 * Steps:
 * 1. Normalize paragraph numbering
 * 2. Format cause title using court rules
 * 3. Append prayer clause from template
 * 4. Append verification clause (template, not AI)
 * 5. Append advocate details block
 * 6. Generate filing checklist
 *
 * NOTE: The AI disclaimer footer is appended at render time by
 * pdf-export.service.ts (contentToHtml). Do NOT add it to the body here.
 */
export function postProcess(input: PostProcessInput): PostProcessResult {
  const appendedSections: string[] = [];
  let text = input.rawText;

  // Step 1: Normalize paragraph numbering
  text = normalizeNumbering(text);

  // Step 2: Format cause title
  text = formatCauseTitle(text, input.courtRule);

  // Step 3: Append prayer clause from template (CLO fix #5)
  const prayerClause = generatePrayerClause(
    input.docRule,
    input.partyDetails,
    input.isDvCase ?? false,
  );
  if (prayerClause) {
    text += prayerClause;
    appendedSections.push('prayer');
  }

  // Step 4: Append verification clause (only for doc types that need it)
  const verification = generateVerificationClause(
    input.docRule,
    input.partyDetails,
    input.courtName,
  );
  if (verification) {
    text += verification;
    appendedSections.push('verification');
  }

  // Step 5: Append advocate details
  const advocateBlock = generateAdvocateBlock(input.advocateName, input.advocateEnrollment);
  if (advocateBlock) {
    text += advocateBlock;
    appendedSections.push('advocate_details');
  }

  // Step 6: Generate filing checklist
  const filingChecklist = generateFilingChecklist(input.docRule);

  return {
    formattedText: text,
    filingChecklist,
    appendedSections,
  };
}
