/**
 * Config-Driven Template Engine (SCRUM-43)
 *
 * Loads template configs from /docs/templates/{id}.json and provides:
 * - Template loading + listing
 * - Computed field resolution
 * - Placeholder replacement for template sections
 * - AI prompt building for ai_generated sections
 * - Full document assembly
 *
 * Adding a new document type = CLO drops a new JSON file. Zero code change.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import bnsBailability from '../config/bns-bailability.json';
import bnsOffences from '../config/bns-offences.json';

/** Sorted list of valid BNS section numbers for system-prompt injection (SCRUM-64). */
const BNS_VALID_SECTIONS = Object.keys(bnsOffences.offences).sort(
  (a, b) => parseFloat(a) - parseFloat(b),
);

// ── Types — match the JSON schema from CLO ──────────────────────────────────

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  field_id: string;
  label: string;
  type:
    | 'text'
    | 'date'
    | 'number'
    | 'textarea'
    | 'dropdown'
    | 'dropdown_search'
    | 'multi_select_search'
    | 'checkbox_group';
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: FieldOption[];
  options_from?: string;
  source?: string;
  filtered_by?: string[];
  cascades_to?: string[];
  show_if?: string;
  inject_into?: string[];
  auto_convert_old?: boolean;
  links_to_formatting?: boolean;
  min_length?: number;
  max_length?: number;
  min_select?: number;
}

export interface FormStep {
  step: number;
  title: string;
  fields: FormField[];
}

export interface ComputedField {
  logic: string;
  label_map?: Record<string, string>;
}

export interface DocumentSection {
  section_id: string;
  type: 'template' | 'ai_generated';
  alignment?: string;
  template?: string;
  style?: string;
  prompt_context?: string;
  numbering?: string;
  min_paragraphs?: number;
  max_paragraphs?: number;
}

export interface ValidationRules {
  section_codes_allowed: string[];
  reject_old_codes: string[];
  auto_convert_old_to_new: boolean;
  mandatory_sections: string[];
  fact_alteration_check: boolean;
  min_body_paragraphs?: number;
}

export interface TemplateMetadata {
  version: string;
  created_by: string;
  reviewed_at: string;
  status: string;
  next_templates_in_pipeline?: string[];
}

export interface TemplateConfig {
  template_id: string;
  display_name: string;
  category: string;
  description: string;
  icon: string;
  plan_access: 'free' | 'pro';
  applicable_courts: {
    court_levels: string[];
    states: string[];
  };
  supported_languages: string[];
  form_schema: {
    steps: FormStep[];
  };
  computed_fields: Record<string, ComputedField>;
  document_structure: {
    sections: DocumentSection[];
  };
  related_acts: string[];
  special_prayer_additions: unknown[];
  filing_checklist: string[];
  validation_rules: ValidationRules;
  metadata: TemplateMetadata;
}

/** Summary returned by listTemplates (no form_schema / document_structure) */
export interface TemplateSummary {
  template_id: string;
  display_name: string;
  category: string;
  description: string;
  icon: string;
  plan_access: 'free' | 'pro';
  supported_languages: string[];
  metadata: TemplateMetadata;
}

// ── Config Loading ──────────────────────────────────────────────────────────

const TEMPLATES_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');
const configCache = new Map<string, TemplateConfig>();

/**
 * Load a template config by ID. Reads from /docs/templates/{id}.json.
 * Caches in memory — configs don't change at runtime.
 */
export function loadTemplateConfig(templateId: string): TemplateConfig | null {
  if (configCache.has(templateId)) return configCache.get(templateId)!;

  try {
    const raw = readFileSync(join(TEMPLATES_DIR, `${templateId}.json`), 'utf-8');
    const config: TemplateConfig = JSON.parse(raw);
    configCache.set(templateId, config);
    return config;
  } catch {
    return null;
  }
}

/**
 * List all available template configs (summary only — no full schema).
 */
export function listTemplateConfigs(): TemplateSummary[] {
  try {
    const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        const id = f.replace('.json', '');
        const config = loadTemplateConfig(id);
        if (!config || config.metadata.status !== 'active') return null;
        return {
          template_id: config.template_id,
          display_name: config.display_name,
          category: config.category,
          description: config.description,
          icon: config.icon,
          plan_access: config.plan_access,
          supported_languages: config.supported_languages,
          metadata: config.metadata,
        };
      })
      .filter(Boolean) as TemplateSummary[];
  } catch {
    return [];
  }
}

/** Clear the config cache (for testing / hot-reload). */
export function clearConfigCache(): void {
  configCache.clear();
}

// ── Computed Fields ─────────────────────────────────────────────────────────

/** Court-rule JSON file shape (7 required fields from SCRUM-50) */
export interface CourtRuleData {
  courtId: string;
  courtType: string;
  designation: string;
  cause_title_format?: string;
  party_designation?: Record<string, string>;
  case_nomenclature?: Record<string, string>;
  para_numbering?: { style: string; startAt: number; format: string; indentLevel: number };
  prayer_language?: { opening: string; closing: string; tone: string };
  verification_format?: string;
  supported_languages?: string[];
  localRules?: string[];
  eFilingMandatory?: boolean;
  jurisdictionNote?: string;
}

/** Pre-fetched court data to avoid async DB calls inside resolveComputedFields. */
export interface CourtLookupData {
  designation: string;
  city: string;
  caseNomenclature: string;
  formattingRulesRef: string;
  courtRule?: CourtRuleData;
}

const COURT_RULES_DIR = join(__dirname, '..', 'config', 'court-rules');
const courtRuleCache = new Map<string, CourtRuleData | null>();

/**
 * Load a court-rule JSON file by formattingRulesRef key.
 * Caches in memory — court rules don't change at runtime.
 */
export function loadCourtRule(ruleRef: string): CourtRuleData | null {
  if (courtRuleCache.has(ruleRef)) return courtRuleCache.get(ruleRef)!;
  try {
    const raw = readFileSync(join(COURT_RULES_DIR, `${ruleRef}.json`), 'utf-8');
    const rule: CourtRuleData = JSON.parse(raw);
    courtRuleCache.set(ruleRef, rule);
    return rule;
  } catch {
    courtRuleCache.set(ruleRef, null);
    return null;
  }
}

/**
 * Resolve computed fields from the template config using form data.
 *
 * Supports:
 * - "if {field} === 'value' then 'a' else 'b'"
 * - "label_map[{field_ref}]"
 * - "courts_db.lookup({field}).property" — uses pre-fetched courtData
 * - "{field_ref}" — direct reference to another computed field
 */
export function resolveComputedFields(
  config: TemplateConfig,
  formData: Record<string, unknown>,
  courtData?: CourtLookupData,
): Record<string, string> {
  const computed: Record<string, string> = {};

  // Iterate in definition order — later fields can reference earlier ones
  for (const [fieldId, def] of Object.entries(config.computed_fields)) {
    const logic = def.logic.trim();

    // Pattern: if {field} === 'value' then 'a' else 'b'
    const ifMatch = logic.match(
      /^if\s+(\w+)\s*===\s*'([^']*)'\s+then\s+'([^']*)'\s+else\s+'([^']*)'\s*$/,
    );
    if (ifMatch) {
      const [, field, compareVal, thenVal, elseVal] = ifMatch;
      const actual = String(formData[field] ?? computed[field] ?? '');
      computed[fieldId] = actual === compareVal ? thenVal : elseVal;
      continue;
    }

    // Pattern: label_map[{field_ref}]
    const labelMapMatch = logic.match(/^label_map\[(\w+)\]$/);
    if (labelMapMatch) {
      const refField = labelMapMatch[1];
      const refValue = String(formData[refField] ?? computed[refField] ?? '');
      // Look up label_map from the referenced field's definition, or from this field
      const labelMap = def.label_map ?? config.computed_fields[refField]?.label_map;
      computed[fieldId] = labelMap?.[refValue] ?? refValue;
      continue;
    }

    // Pattern: courts_db.lookup({field}).property
    const courtsMatch = logic.match(/^courts_db\.lookup\((\w+)\)\.(\w+)$/);
    if (courtsMatch) {
      const [, , prop] = courtsMatch;
      if (courtData) {
        const courtRule = courtData.courtRule;
        let rawDesignation = courtRule?.designation ?? courtData.designation;
        // If the court rule has a generic designation without the city, append city from DB
        if (
          courtData.city &&
          !rawDesignation.toUpperCase().includes(courtData.city.toUpperCase())
        ) {
          rawDesignation = `${rawDesignation}, ${courtData.city.toUpperCase()}`;
        }
        // SCRUM-54 B8: court_designation = bare court/judge name for addressing
        // (e.g., "SESSIONS JUDGE, PATNA" or "HIGH COURT OF JUDICATURE AT PATNA").
        // court_header = full header line with "IN THE COURT OF" / "IN THE HIGH COURT OF" prefix.
        let designation = rawDesignation;
        let header = rawDesignation;

        if (/^IN THE HIGH COURT/i.test(rawDesignation)) {
          // HC: full designation is "IN THE HIGH COURT OF JUDICATURE AT PATNA"
          // designation (bare) = strip prefix for addressing ("HIGH COURT OF JUDICATURE AT PATNA")
          designation = rawDesignation.replace(/^IN THE\s*/i, '');
          header = rawDesignation; // use as-is for header
        } else if (/^IN THE COURT OF\s/i.test(rawDesignation)) {
          // Sessions/District: "IN THE COURT OF SESSIONS JUDGE, PATNA"
          designation = rawDesignation.replace(/^IN THE COURT OF\s*/i, '');
          header = rawDesignation;
        } else {
          // Bare name (e.g., "SESSIONS JUDGE, PATNA")
          designation = rawDesignation;
          header = `IN THE COURT OF ${rawDesignation}`;
        }
        const propMap: Record<string, string> = {
          designation,
          header,
          city: courtData.city,
          case_nomenclature: courtData.caseNomenclature,
        };
        computed[fieldId] = propMap[prop] ?? '';
      } else {
        // Fallback when no court data provided (e.g. unit tests without DB)
        const courtName = String(formData[courtsMatch[1]] ?? '');
        if (prop === 'designation') {
          computed[fieldId] = courtName || "THE HON'BLE COURT";
        } else if (prop === 'header') {
          computed[fieldId] = courtName
            ? `IN THE COURT OF ${courtName}`
            : "IN THE COURT OF THE HON'BLE COURT";
        } else if (prop === 'city') {
          computed[fieldId] = extractCityFromCourtName(courtName);
        } else {
          computed[fieldId] = '';
        }
      }
      continue;
    }

    // Pattern: court_rules[field].property || 'default'
    const courtRulesMatch = logic.match(/^court_rules\[(\w+)\]\.(\w+)\s*\|\|\s*'([^']*)'$/);
    if (courtRulesMatch) {
      const [, , prop, defaultVal] = courtRulesMatch;
      if (courtData && prop === 'case_nomenclature') {
        computed[fieldId] = courtData.caseNomenclature || defaultVal;
      } else {
        computed[fieldId] = defaultVal;
      }
      continue;
    }

    // Direct field reference
    if (formData[logic] !== undefined) {
      computed[fieldId] = String(formData[logic]);
    } else if (computed[logic]) {
      computed[fieldId] = computed[logic];
    } else {
      computed[fieldId] = '';
    }
  }

  return computed;
}

function extractCityFromCourtName(courtName: string): string {
  if (!courtName) return '';
  // Try extracting city after "at" or after last comma
  const atMatch = courtName.match(/(?:at|AT)\s+(.+?)$/i);
  if (atMatch) return atMatch[1].trim();
  const parts = courtName.split(',');
  if (parts.length > 1) return parts[parts.length - 1].trim();
  // Guard: if courtName looks like a courtId (contains underscores), extract last segment as city
  if (courtName.includes('_')) {
    const segments = courtName.split('_');
    const lastSegment = segments[segments.length - 1];
    // Capitalize first letter (e.g., "ranchi" → "Ranchi")
    return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
  }
  return courtName;
}

/**
 * SCRUM-63: Strip a leading prefix (and optional trailing space/dot) from a field value.
 * @param value — raw form input (e.g. "PS Chanho" or "P.S. Chanho")
 * @param prefixes — array of regex fragments to try (e.g. ['Police Station', 'P\\.?S\\.?'])
 * @returns value with the leading prefix removed, or the original value if none matched
 */
function stripLeadingPrefix(value: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}[\\s.]+`, 'i');
    if (re.test(value)) {
      return value.replace(re, '').trim();
    }
  }
  return value;
}

// ── Placeholder Replacement ─────────────────────────────────────────────────

export interface PlaceholderContext {
  [key: string]: string;
}

/**
 * Build the full placeholder context from form data + computed fields + system values.
 */
export function buildPlaceholderContext(
  config: TemplateConfig,
  formData: Record<string, unknown>,
  extra?: { advocateName?: string; enrollmentNumber?: string },
  courtData?: CourtLookupData,
): PlaceholderContext {
  const computed = resolveComputedFields(config, formData, courtData);

  const now = new Date();
  const ctx: PlaceholderContext = {
    // System values
    current_date: now.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    current_year: String(now.getFullYear()),

    // Advocate details from user profile
    advocate_name: extra?.advocateName ?? '____________________',
    enrollment_number: extra?.enrollmentNumber ?? '____________________',

    // Computed fields
    ...computed,
  };

  // Form data — flatten all values to strings
  for (const [key, val] of Object.entries(formData)) {
    if (val === null || val === undefined) continue;

    if (Array.isArray(val)) {
      // checkbox_group / multi_select → join labels
      ctx[key] = val
        .map((v) => {
          if (typeof v === 'object' && v !== null && 'label' in v) return (v as FieldOption).label;
          if (typeof v === 'object' && v !== null && 'id' in v) return (v as FieldOption).id;
          return String(v);
        })
        .join(', ');
    } else if (typeof val === 'object' && val !== null) {
      // dropdown option object → use label or id
      const opt = val as Record<string, unknown>;
      ctx[key] = String(opt.label ?? opt.id ?? '');
    } else {
      ctx[key] = String(val);
    }
  }

  // SCRUM-54 B2: Capitalise state name (form sends lowercase stateId like "bihar")
  if (ctx.state) {
    ctx.state = ctx.state
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // SCRUM-54 B5: Normalise dates to DD.MM.YYYY (Indian filing format)
  for (const key of Object.keys(ctx)) {
    if (key.includes('date') && /^\d{4}-\d{2}-\d{2}$/.test(ctx[key])) {
      const [y, m, d] = ctx[key].split('-');
      ctx[key] = `${d}.${m}.${y}`;
    }
  }

  // ── SCRUM-50: Inject court-rule-driven placeholders ───────────────────────
  if (courtData?.courtRule) {
    const rule = courtData.courtRule;

    // Party labels from court rule
    if (rule.party_designation) {
      ctx.party_label_petitioner = rule.party_designation.petitioner ?? 'Petitioner';
      ctx.party_label_respondent = rule.party_designation.respondent ?? 'Respondent';
      ctx.party_label_applicant = rule.party_designation.applicant ?? 'Applicant';
      ctx.party_label_accused = rule.party_designation.accused ?? 'Accused';
      // State respondent template
      if (rule.party_designation.state) {
        ctx.state_respondent = rule.party_designation.state.replace(
          /\{district\}/g,
          courtData.city,
        );
      }
    }

    // Case nomenclature — resolve by template type
    if (rule.case_nomenclature) {
      const templateId = config.template_id;
      // Map template_id to case_nomenclature key
      const nomenKey = templateId.includes('anticipatory')
        ? 'anticipatory_bail'
        : templateId.includes('bail')
          ? 'regular_bail'
          : templateId.includes('quashing')
            ? 'quashing'
            : templateId.includes('writ')
              ? 'civil_writ'
              : undefined;
      if (nomenKey && rule.case_nomenclature[nomenKey]) {
        ctx.case_nomenclature = rule.case_nomenclature[nomenKey].replace(
          /\{year\}/g,
          ctx.current_year,
        );
      }
    }

    // Prayer language from court rule
    if (rule.prayer_language) {
      ctx.prayer_opening = rule.prayer_language.opening;
      ctx.prayer_closing = rule.prayer_language.closing;
    }

    // Verification format from court rule
    // Note: {body_para_count} is kept as a deferred placeholder — resolved after AI generation
    if (rule.verification_format) {
      ctx.verification_text = rule.verification_format
        .replace(/\{deponent_name\}/g, ctx.applicant_name ?? '_____')
        .replace(
          /\{designation\}/g,
          `the ${ctx.party_label_petitioner ?? 'Petitioner'} herein above named`,
        )
        .replace(/\{place\}/g, ctx.court_city ?? courtData.city)
        .replace(/\{date\}/g, '_____ day of _________, ' + ctx.current_year)
        .replace(/\{body_para_count\}/g, '{body_para_count}');
    }
  }

  // Defaults when no court rule is available
  if (!ctx.party_label_petitioner) ctx.party_label_petitioner = 'Petitioner';
  if (!ctx.party_label_respondent) ctx.party_label_respondent = 'Respondent';
  if (!ctx.state_respondent)
    ctx.state_respondent = `State of ${ctx.state ?? '_____'}\nThrough Public Prosecutor`;
  if (!ctx.prayer_opening)
    ctx.prayer_opening =
      'In view of the facts and circumstances stated hereinabove, it is most respectfully prayed that this Honourable Court may be pleased to:';
  if (!ctx.prayer_closing)
    ctx.prayer_closing = 'And for this act of kindness, the petitioner shall ever pray.';
  if (!ctx.verification_text) {
    ctx.verification_text = `I, ${ctx.applicant_name ?? '_____'}, the ${ctx.party_label_petitioner} herein above named, do hereby verify that the contents of paragraphs 1 to {body_para_count} of the above application are true and correct to the best of my knowledge and belief, and nothing material has been concealed therefrom.\n\nVerified at ${ctx.court_city ?? '_____'} on this _____ day of _________, ${ctx.current_year}.`;
  }

  // Recursive placeholder pass — resolve {token} references that may exist inside
  // ctx values themselves (e.g. caseNomenclature from courts DB contains "{current_year}"
  // or "{year}" tokens that were not yet substituted during resolveComputedFields).
  // Only replaces keys already present in ctx; unknown tokens (including deferred
  // {body_para_count}) are left as-is for the template rendering pass.
  for (const key of Object.keys(ctx)) {
    if (ctx[key].includes('{')) {
      ctx[key] = ctx[key].replace(/\{(\w+)\}/g, (match: string, k: string) =>
        ctx[k] !== undefined ? ctx[k] : match,
      );
    }
  }

  // SCRUM-63: Strip duplicate prefixes from known fields (A8 fix).
  // Templates hardcode "PS {police_station}" — if the user already typed "PS Chanho"
  // the output becomes "PS PS Chanho". Strip the leading prefix from the value so the
  // template-provided prefix is the canonical one.
  if (ctx.police_station) {
    ctx.police_station = stripLeadingPrefix(ctx.police_station, ['Police Station', 'P\\.?S\\.?']);
  }

  return ctx;
}

/** Placeholders that are resolved in a later pass (after AI generation) */
const DEFERRED_PLACEHOLDERS = new Set(['body_para_count']);

/**
 * Replace {placeholder} tokens in a template string with context values.
 * Unknown placeholders are left as _____ (blanks for manual fill).
 * Deferred placeholders (e.g., body_para_count) are left as-is if not yet in context.
 */
export function replacePlaceholders(template: string, ctx: PlaceholderContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (ctx[key] !== undefined) return ctx[key];
    // Keep deferred placeholders as literal tokens for later resolution
    if (DEFERRED_PLACEHOLDERS.has(key)) return match;
    return '_____';
  });
}

/**
 * SCRUM-54 B1: Detect placeholder leakage — return list of placeholders
 * that resolved to blank ('_____') in a rendered template.
 * These indicate missing data that should have been provided by the form.
 */
export function detectLeakedPlaceholders(template: string, ctx: PlaceholderContext): string[] {
  const leaked: string[] = [];
  const pattern = /\{(\w+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    const key = match[1];
    if (DEFERRED_PLACEHOLDERS.has(key)) continue;
    if (ctx[key] === undefined || ctx[key] === '') {
      leaked.push(key);
    }
  }
  return [...new Set(leaked)];
}

// ── Document Section Rendering ──────────────────────────────────────────────

export interface RenderedSection {
  section_id: string;
  type: 'template' | 'ai_generated';
  content: string;
  alignment?: string;
  style?: string;
}

/**
 * Render a template section by replacing placeholders.
 */
export function renderTemplateSection(
  section: DocumentSection,
  ctx: PlaceholderContext,
): RenderedSection {
  if (section.type !== 'template' || !section.template) {
    throw new Error(`Section ${section.section_id} is not a template section`);
  }

  return {
    section_id: section.section_id,
    type: 'template',
    content: replacePlaceholders(section.template, ctx),
    alignment: section.alignment,
    style: section.style,
  };
}

/**
 * SCRUM-62: Strip cause-title blocks (A7) and disclaimer text (A6) that AI
 * sometimes injects into the body despite instructions not to.
 * Both are already rendered by template sections — duplicates corrupt the PDF.
 */
export function sanitiseAIBody(text: string): string {
  const paras = text.split(/\n\n+/);
  const cleaned = paras.filter((para) => {
    const t = para.trim();
    if (!t) return false;
    // A7: cause-title / court-header block
    if (/^IN THE (HIGH )?COURT OF/i.test(t)) return false;
    if (/^IN THE HIGH COURT/i.test(t)) return false;
    // A6: AI disclaimer text
    if (/AI[\s-]assisted draft/i.test(t)) return false;
    if (/^DISCLAIMER\s*:/i.test(t)) return false;
    if (/Lawie does not provide legal advice/i.test(t)) return false;
    return true;
  });
  return cleaned.join('\n\n').trim();
}

/**
 * Build the AI system prompt for config-driven generation.
 */
export function buildAISystemPrompt(
  config: TemplateConfig,
  courtRule?: CourtRuleData | null,
): string {
  const isContract =
    config.category === 'civil' && ['rent_agreement', 'nda', 'mou'].includes(config.template_id);

  let contractRule = '';
  if (isContract) {
    contractRule = `
8. CONTRACTS — ANTI-INVENTION RULE: Do NOT introduce any term, clause, rate, percentage, penalty, or condition that is not explicitly present in the user-provided form data. You may only arrange and formalise the terms given. If the user has not specified an interest rate, notice period, or penalty — do NOT invent one.`;
  }

  return `You are a senior Indian advocate with 20+ years of practice, drafting a court-ready legal document.

DOCUMENT TYPE: ${config.display_name}
CATEGORY: ${config.category}

CRITICAL RULES:
1. Use ONLY Bharatiya Nyaya Sanhita (BNS) 2023, Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023, and Bharatiya Sakshya Adhiniyam (BSA) 2023 section numbers. NEVER reference old IPC, CrPC, or IEA section numbers.
2. Format with numbered paragraphs (1, 2, 3...) for the body.
3. Use formal, respectful legal language appropriate for Indian courts.
4. Do NOT include any commentary or notes outside the document content.
5. NEVER alter, embellish, or contradict the user's stated facts. Reproduce FIR numbers, dates, names, and amounts EXACTLY as provided.
6. Generate ONLY the numbered body paragraphs as instructed. Do NOT include:
   - Any court header or cause-title block ("IN THE COURT OF..." / "IN THE HIGH COURT OF...") — the cause title is already rendered above by the template engine; a second copy corrupts the document (A7)
   - The prayer clause, verification clause, or advocate block
   - The AI disclaimer text ("AI-assisted draft" / "Lawie does not provide legal advice") — it is auto-appended to the export footer and must NOT appear in the body (A6)
7. Use today's date format (DD/MM/YYYY) where needed.${contractRule}

ANTI-HALLUCINATION GUARDRAILS (MANDATORY):
- Use the EXACT respondent / opposite party name provided in the form data. NEVER substitute, guess, or infer a different entity name (e.g., do NOT replace a retailer name with a manufacturer name).
- NEVER assert that "investigation is complete" or "chargesheet has been filed" unless EXPLICITLY stated in the user-provided facts. If not stated, say "investigation is pending" or omit the assertion entirely.
- NEVER classify an offence as "bailable" or "non-bailable" unless you have been given the classification in the prompt context below. If no classification is provided, do not comment on bailability.
- NEVER invent witness names, case numbers, dates, or factual assertions not present in the user's form data.
- All dates must be reproduced EXACTLY as provided — do not convert formats.

RELATED ACTS: ${config.related_acts.join(', ')}${courtRule?.localRules?.length ? `\n\nCOURT-SPECIFIC RULES (MANDATORY — these override generic conventions):\n${courtRule.localRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}${
    courtRule?.party_designation
      ? `\n\nPARTY DESIGNATIONS FOR THIS COURT:\n${Object.entries(courtRule.party_designation)
          .map(([k, v]) => `- ${k}: "${v}"`)
          .join('\n')}`
      : ''
  }${
    config.category === 'criminal'
      ? `\n\nBNS SECTION WHITELIST (MANDATORY — SCRUM-64): You MUST ONLY cite BNS sections from this verified First Schedule list: ${BNS_VALID_SECTIONS.join(', ')}. Any BNS section number NOT in this list does not exist in the Bharatiya Nyaya Sanhita — do NOT use it under any circumstances.`
      : ''
  }`;
}

/**
 * Classify BNS sections as bailable/non-bailable.
 * Returns a string like "BNS 303 (non-bailable), BNS 351 (bailable)"
 */
export function classifySectionsBailability(sectionsCharged: string): string {
  if (!sectionsCharged) return '';

  const nonBailableSet = new Set(bnsBailability.non_bailable);
  const bailableSet = new Set(bnsBailability.bailable);

  // Extract section numbers from strings like "BNS 303", "BNS 318(4)", "303"
  const parts = sectionsCharged.split(',').map((s) => s.trim());
  const classified: string[] = [];

  for (const part of parts) {
    // Extract the numeric portion (e.g., "303" from "BNS 303" or "318(4)" from "BNS 318(4)")
    const match = part.match(/(\d+(?:\(\d+\))?)/);
    if (!match) continue;

    const sectionNum = match[1];
    if (nonBailableSet.has(sectionNum)) {
      classified.push(`${part} (NON-BAILABLE)`);
    } else if (bailableSet.has(sectionNum)) {
      classified.push(`${part} (BAILABLE)`);
    } else {
      classified.push(`${part} (classification: verify from First Schedule)`);
    }
  }

  return classified.join(', ');
}

/**
 * Build the AI user prompt from an ai_generated section's prompt_context.
 */
export function buildAIUserPrompt(section: DocumentSection, ctx: PlaceholderContext): string {
  if (!section.prompt_context) return '';

  let prompt = replacePlaceholders(section.prompt_context, ctx);

  // Inject respondent name guardrail (SCRUM-52 S1 — prevent AI from substituting)
  if (ctx.respondent_name) {
    prompt += `\n\nIMMUTABLE PARTY NAME: The respondent / opposite party is "${ctx.respondent_name}". Use this EXACT name throughout. Do NOT substitute with any other entity.`;
  }

  // Inject applicant identity guardrail — prevent AI from inventing party details
  if (ctx.applicant_name) {
    const identityParts = [`Name: ${ctx.applicant_name}`];
    if (ctx.father_name) identityParts.push(`Father/Husband: ${ctx.father_name}`);
    if (ctx.applicant_age) identityParts.push(`Age: ${ctx.applicant_age} years`);
    if (ctx.address) identityParts.push(`Address: ${ctx.address}`);
    prompt += `\n\nIMMUTABLE APPLICANT IDENTITY (use EXACTLY as given — do NOT change name, parentage, age, or address):\n${identityParts.join('\n')}`;
  }

  // Inject bailability classification if sections_charged exist in context (SCRUM-52 S2)
  if (ctx.sections_charged) {
    const classification = classifySectionsBailability(ctx.sections_charged);
    if (classification) {
      prompt += `\n\nBAILABILITY CLASSIFICATION (from BNS First Schedule — use EXACTLY as given, do NOT contradict):\n${classification}`;
    }
  }

  if (section.min_paragraphs || section.max_paragraphs) {
    const min = section.min_paragraphs ?? 5;
    const max = section.max_paragraphs ?? 12;
    prompt += `\n\nGenerate ${min}-${max} numbered paragraphs. Use ${section.numbering ?? 'numeric'} numbering.`;
  }

  prompt += '\n\nDraft the body paragraphs now:';

  return prompt;
}

// ── Full Document Assembly ──────────────────────────────────────────────────

/**
 * Assemble the full document from rendered sections.
 * Returns sections in order, with AI body paragraph count for verification template.
 */
export function assembleDocument(sections: RenderedSection[]): {
  fullText: string;
  bodyParaCount: number;
} {
  let bodyParaCount = 0;

  // Count numbered paragraphs in AI-generated body
  const bodySection = sections.find((s) => s.type === 'ai_generated');
  if (bodySection) {
    const matches = bodySection.content.match(/^\d+\./gm);
    bodyParaCount = matches?.length ?? 0;
  }

  // Replace {body_para_count} in all template sections
  const assembled = sections.map((s) => {
    if (s.type === 'template' && s.content.includes('{body_para_count}')) {
      return {
        ...s,
        content: s.content.replace(/\{body_para_count\}/g, String(bodyParaCount)),
      };
    }
    return s;
  });

  const fullText = assembled.map((s) => s.content).join('\n\n');
  return { fullText, bodyParaCount };
}

// ── Form Validation ─────────────────────────────────────────────────────────

/**
 * Validate form data against the template's form_schema.
 * Returns an array of error messages (empty = valid).
 */
export function validateFormData(
  config: TemplateConfig,
  formData: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  for (const step of config.form_schema.steps) {
    for (const field of step.fields) {
      // Check show_if condition — skip validation if field is hidden
      if (field.show_if && !evaluateShowIf(field.show_if, formData)) {
        continue;
      }

      const value = formData[field.field_id];

      // Required check
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          errors.push(`${field.label} is required`);
          continue;
        }
        if (Array.isArray(value) && value.length === 0) {
          errors.push(`${field.label} is required`);
          continue;
        }
      }

      if (value === undefined || value === null || value === '') continue;

      // Type-specific validation
      if (field.type === 'textarea' || field.type === 'text') {
        const str = String(value);
        if (field.min_length && str.length < field.min_length) {
          errors.push(`${field.label} must be at least ${field.min_length} characters`);
        }
        if (field.max_length && str.length > field.max_length) {
          errors.push(`${field.label} must be at most ${field.max_length} characters`);
        }
      }

      if (field.type === 'checkbox_group' && Array.isArray(value)) {
        if (field.min_select && value.length < field.min_select) {
          errors.push(`${field.label}: select at least ${field.min_select}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Evaluate a show_if expression like "field_id !== no" or "field_id === value".
 */
export function evaluateShowIf(expr: string, formData: Record<string, unknown>): boolean {
  // Pattern: field !== value
  const neqMatch = expr.match(/^(\w+)\s*!==?\s*(\w+)$/);
  if (neqMatch) {
    const [, field, compareVal] = neqMatch;
    const actual = String(formData[field] ?? '');
    return actual !== compareVal;
  }

  // Pattern: field === value
  const eqMatch = expr.match(/^(\w+)\s*===?\s*(\w+)$/);
  if (eqMatch) {
    const [, field, compareVal] = eqMatch;
    const actual = String(formData[field] ?? '');
    return actual === compareVal;
  }

  // Default: show the field
  return true;
}

// ── Exports for testing ─────────────────────────────────────────────────────
export const _testing = {
  extractCityFromCourtName,
  TEMPLATES_DIR,
};
