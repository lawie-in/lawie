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

/** T-176: the family court rule's id (config/court-rules/family_court.json). */
const FAMILY_COURT_RULE_ID = 'family_court';

/** T-176: printed for `{place}` when the typed court name names no seat. */
export const FAMILY_COURT_SEAT_BLANK = '[To be confirmed: place]';

/**
 * Words that mean a leftover piece of the typed name is not a plain place
 * (e.g. "Principal Judge" not caught by the title strip, or another court's
 * name). Such a name gives no seat rather than a guessed one.
 *
 * T-176 review r1: a judge or court rank written without "Judge"
 * ("Additional Family Court", "Principal Family Court", "Second Family
 * Court") leaves the rank word behind; it is not a seat either.
 */
const NOT_A_SEAT =
  /\b(?:judge|court|courts|magistrate|tribunal|bench|sessions|additional|addl|principal|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i;

/**
 * T-176 (AJ-2026-10-08-T176, C-1): a court number anywhere in the typed name
 * ("No. 2", "No.2", "2", "II", "-II", "Family Court-3 Ranchi") means the seat
 * cannot be read safely, so "[To be confirmed: place]" prints rather than
 * "AT NO. 2 PATNA". The name is split into tokens on spaces and hyphens; a
 * token is a court number if it is "No." with a number, all digits, or a
 * strict Roman numeral. The strict Roman form means place names such as
 * "Civil Lines", "Mill Road" or "Vidisha" are not caught. Ordinals ("2nd",
 * "IInd", "IIIrd") are court numbers too (T-176 review r1).
 */
const COURT_NUMBER_TOKEN =
  /^(?:no\.?\d+|\d+|\d+(?:st|nd|rd|th)|[ivxlcdm]+(?:st|nd|rd|th)|(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))$/i;

/** T-176 C-1: true when any token of `part` is a court number. */
function hasCourtNumberToken(part: string): boolean {
  return part
    .split(/[\s\-–]+/)
    .map((t) => t.replace(/^[(\[]+|[)\].,:;]+$/g, ''))
    .some((t) => t !== '' && COURT_NUMBER_TOKEN.test(t));
}

/**
 * T-176 (AJ-2026-10-08-T174, FU-1): the seat named in a typed family court
 * name, upper-cased, or null when none can be read. Read only from the typed
 * name: never from the user's state, district or profile.
 *
 *   "Family Court, Patna"                           -> "PATNA"
 *   "Additional Principal Judge, Family Court, Patna" -> "PATNA"
 *   "Family Court, Tis Hazari, Delhi"               -> "TIS HAZARI, DELHI"
 *   "Family Court at Ranchi"                        -> "RANCHI"
 *   "Family Court" / ""                             -> null
 */
export function familyCourtSeat(courtName: string | undefined | null): string | null {
  const parts: string[] = [];
  for (const segment of (courtName ?? '').split(',')) {
    let s = segment.trim();
    s = s.replace(/^(?:in\s+the\s+|before\s+the\s+)/i, '');
    s = s.replace(/^court\s+of\s+(?:the\s+)?/i, '');
    // A judge title ("Principal Judge", "Additional Principal Judge",
    // "Addl. Principal Judge") is never the seat.
    s = s.replace(/^(?:the\s+)?(?:(?:additional|addl\.?)\s+)?(?:principal\s+)?judge\b/i, '');
    s = s.replace(/\bfamily\s+courts?\b/gi, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:at|of)\b\s*/i, '');
    s = s.replace(/^[\s.:;\-–]+|[\s.:;\-–]+$/g, '').trim();
    if (s) parts.push(s);
  }
  if (parts.length === 0) return null;
  if (parts.some((p) => NOT_A_SEAT.test(p) || hasCourtNumberToken(p))) return null;
  return parts.join(', ').toUpperCase();
}

/**
 * T-176: the family court heading built from the rule's `causeListFormat`
 * ("IN THE FAMILY COURT AT {place}") and the seat in the typed name, or
 * FAMILY_COURT_SEAT_BLANK for `{place}` when no seat can be read. Falls back
 * to the rule's designation if the format has no `{place}`.
 */
export function familyCourtHeading(courtRule: CourtRuleConfig, courtName: string | undefined): string {
  const format = courtRule.formattingPreferences?.causeListFormat;
  if (!format || !format.includes('{place}')) return courtRule.designation;
  const seat = familyCourtSeat(courtName) ?? FAMILY_COURT_SEAT_BLANK;
  return format.replace(/\{place\}/g, () => seat);
}

/**
 * T-176: the first heading line of a family court draft, whichever form the
 * LLM wrote it in ("IN THE FAMILY COURT AT PATNA", "IN THE COURT OF THE
 * PRINCIPAL JUDGE, FAMILY COURT, PATNA", "BEFORE THE FAMILY COURT, PATNA").
 * The earliest such line in the text is the one replaced.
 *
 * "IN THE ..." lines match in any case, so a mixed-case "In the Family Court
 * at Patna" is replaced too and the LLM's seat never prints. T-176 review r1:
 * a "BEFORE THE ..." line counts only when it is upper case, so a body line
 * such as "Before the marriage, ..." is never taken for the heading.
 */
const FAMILY_HEADING_IN_THE =
  /^(?:IN THE COURT OF .+|IN THE HIGH COURT .+|IN THE FAMILY COURT\b.*)$/i;
const FAMILY_HEADING_BEFORE_THE = /^BEFORE THE .+$/;

/**
 * T-176 review r1: the second line of a heading the LLM split in two
 * ("... FAMILY COURT" / "AT PATNA"). Dropped after the heading is replaced,
 * so the LLM's seat does not print beside the typed one. Upper case only.
 *
 * T-176 review r2: only a line that is just a seat is dropped ("AT PATNA",
 * "FAMILY COURT, PATNA", "FAMILY COURT AT PATNA"). A line with a digit or
 * blank ("____"), or one naming a case, petition, suit or "instance", is
 * real content and always stays. So is "AT THE ...", "AT ... TIME",
 * "AT THE REQUEST / BEHEST OF ..." (e.g. "AT THE TIME OF FILING").
 */
const FAMILY_HEADING_CONTINUATION =
  /^(?:AT\s+[^\d_]+|FAMILY COURT(?:\s*,\s*[^\d_]+|\s+AT\s+[^\d_]+)?)$/;
const NOT_A_CONTINUATION = /\b(?:NO|CASE|PETITION|SUIT|INSTANCE|THE|TIME|REQUEST|BEHEST)\b/;

/**
 * True when `line` has letters and none of them is lower case. A bracketed
 * placeholder ("[To be confirmed: court designation]") is not counted.
 */
function isUpperCaseLine(line: string): boolean {
  const rest = line.replace(/\[[^\]]*\]/g, '');
  return /[A-Z]/.test(rest) && rest === rest.toUpperCase();
}

/** T-176: the family branch of `formatCauseTitle`. */
function formatFamilyCauseTitle(
  text: string,
  courtRule: CourtRuleConfig,
  courtName: string | undefined,
): string {
  const lines = text.split('\n');
  const bare = (l: string) => l.replace(/\r$/, '');
  const at = lines.findIndex(
    (l) =>
      FAMILY_HEADING_IN_THE.test(bare(l)) ||
      (FAMILY_HEADING_BEFORE_THE.test(bare(l)) && isUpperCaseLine(bare(l))),
  );
  if (at < 0) return text;
  const cr = lines[at].endsWith('\r') ? '\r' : '';
  lines[at] = familyCourtHeading(courtRule, courtName) + cr;
  let next = at + 1;
  while (next < lines.length && bare(lines[next]).trim() === '') next++;
  if (next < lines.length) {
    const cont = bare(lines[next]).trim();
    if (
      FAMILY_HEADING_CONTINUATION.test(cont) &&
      !NOT_A_CONTINUATION.test(cont) &&
      isUpperCaseLine(cont)
    ) {
      lines.splice(next, 1);
    }
  }
  return lines.join('\n');
}

/**
 * Ensure cause title headings are properly uppercased.
 *
 * T-176: for the family court rule, the heading names the seat taken from the
 * typed `courtName` (see `familyCourtHeading`). A seat the LLM wrote does not
 * win over the typed one. Other court rules are unchanged.
 */
export function formatCauseTitle(
  text: string,
  courtRule: CourtRuleConfig | null,
  courtName?: string,
): string {
  if (!courtRule) return text;

  if (courtRule.courtId === FAMILY_COURT_RULE_ID) {
    return formatFamilyCauseTitle(text, courtRule, courtName);
  }

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
    .replace(
      /{relation}/g,
      partyDetails.relation_type ?? partyDetails.relation ?? 'S/o / D/o / W/o',
    )
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
  text = formatCauseTitle(text, input.courtRule, input.courtName);

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
