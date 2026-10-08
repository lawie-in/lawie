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

import { getTemplateRegistry } from './template-promoter';

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
    | 'checkbox_group'
    | 'file' /* SCRUM-79 — single or multi file upload */
    | 'currency' /* SCRUM-79 — INR-formatted rupee input */;
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: FieldOption[];
  options_from?: string;
  source?: string;
  filtered_by?: string[];
  cascades_to?: string[];
  show_if?: string;
  depends_on?: string /* SCRUM-79 — synonym of show_if; supports quoted values + && chains */;
  inject_into?: string[];
  auto_convert_old?: boolean;
  links_to_formatting?: boolean;
  min_length?: number;
  max_length?: number;
  min_select?: number;
  validation_pattern?: string /* SCRUM-79 — regex (string form) the value must match */;
  validation_message?: string /* shown below the field when validation_pattern fails */;
  multiple?: boolean /* SCRUM-79 — for type:'file', allow multi-select */;
  accept?: string /* SCRUM-79 — `accept` attribute for type:'file' (e.g. '.pdf,image/*') */;
  help?: string /* CLO writes contextual help strings; passed through verbatim */;
}

export interface FormStep {
  step: number;
  title: string;
  fields: FormField[];
}

export interface ComputedField {
  logic: string;
  label_map?: Record<string, string>;
  /** For "value_map[field] || 'default'": the value for each value of the field. */
  value_map?: Record<string, string>;
  /**
   * A drafting instruction that states this value to the Drafter, with {value}
   * where the value goes (T-135). Legal content: the wording is Ajay's.
   */
  instruction?: string;
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
 * Load a template config by ID. Override files at /docs/templates/{id}.json
 * win when present (hand-tuned production templates). For everything else we
 * fall back to the SCRUM-78 promoter registry built from
 * apps/drafting/src/config/document-rules/*.json.
 *
 * template-promoter imports only TYPES from this module (`import type ...`)
 * so the runtime cycle is broken — both files can sit at top-level.
 */
export function loadTemplateConfig(templateId: string): TemplateConfig | null {
  const cached = configCache.get(templateId);
  if (cached !== undefined) return cached;

  // Try the override path first — hand-tuned configs trump anything synthesised.
  try {
    const raw = readFileSync(join(TEMPLATES_DIR, `${templateId}.json`), 'utf-8');
    const config: TemplateConfig = JSON.parse(raw);
    configCache.set(templateId, config);
    return config;
  } catch {
    // No override on disk — fall through to the promoter registry.
  }

  const fromRegistry = getTemplateRegistry().configs.get(templateId);
  if (fromRegistry) {
    configCache.set(templateId, fromRegistry);
    return fromRegistry;
  }
  return null;
}

/**
 * List all available template configs (summary only — no full schema).
 *
 * Union of:
 *   - every JSON in /docs/templates/ with metadata.status === 'active'
 *   - every entry in the promoter registry (built from
 *     apps/drafting/src/config/document-rules/) — minus anything already
 *     present in the override list (template_id wins).
 *
 * This is what powers the dashboard's "New document" picker.
 */
export function listTemplateConfigs(): TemplateSummary[] {
  const byId = new Map<string, TemplateSummary>();

  const toSummary = (config: TemplateConfig): TemplateSummary => ({
    template_id: config.template_id,
    display_name: config.display_name,
    category: config.category,
    description: config.description,
    icon: config.icon,
    plan_access: config.plan_access,
    supported_languages: config.supported_languages,
    metadata: config.metadata,
  });

  // 1. Overrides win.
  try {
    const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const id = f.replace('.json', '');
      const config = loadTemplateConfig(id);
      if (!config || config.metadata.status !== 'active') continue;
      byId.set(config.template_id, toSummary(config));
    }
  } catch {
    // ignore — registry-only mode is fine
  }

  // 2. Fill in everything else from the promoter registry.
  try {
    for (const config of getTemplateRegistry().configs.values()) {
      if (byId.has(config.template_id)) continue;
      if (config.metadata.status !== 'active') continue;
      byId.set(config.template_id, toSummary(config));
    }
  } catch {
    // registry not available at this code path — overrides-only result is fine
  }

  return Array.from(byId.values());
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
  /**
   * T-149: the first- and second-party labels for each document side, as
   * signed by Ajay (AJ-2026-10-07-T149). Used only for the document types in
   * SIGNED_DOCUMENT_SIDES; every other document keeps `party_designation`.
   */
  party_designation_by_side?: Partial<
    Record<DocumentSide, { petitioner: string; respondent: string }>
  >;
  case_nomenclature?: Record<string, string>;
  /**
   * T-158: wording that depends on the matter type, keyed by a
   * `case_nomenclature` key (e.g. NCLT `insolvency_application` vs
   * `company_petition`). See `ruleForMatter`.
   */
  matter_type_overrides?: Record<string, MatterTypeOverride>;
  para_numbering?: { style: string; startAt: number; format: string; indentLevel: number };
  prayer_language?: { opening: string; closing: string; tone: string };
  verification_format?: string;
  supported_languages?: string[];
  localRules?: string[];
  eFilingMandatory?: boolean;
  jurisdictionNote?: string;
}

export type DocumentSide = 'criminal' | 'civil';

/**
 * T-149: the document types Ajay's label table covers (AJ-2026-10-07-T149).
 * Criminal: regular bail, anticipatory bail, criminal misc. application.
 * Civil: suit, plaint, O.39 temporary injunction. Applications either party can
 * file (amendment of pleadings, production of documents, receiver) are removed
 * (AJ-2026-10-07-T149-types) and keep today's labels.
 * Anything not listed (revision, complaint, appeal, cancellation of bail, notices,
 * agreements ...) is not signed and keeps the court rule's `party_designation`.
 */
const SIGNED_DOCUMENT_SIDES: ReadonlyMap<string, DocumentSide> = new Map<string, DocumentSide>([
  ['bail_regular', 'criminal'],
  ['bail_anticipatory', 'criminal'],
  ['bail_before_magistrate', 'criminal'],
  ['default_bail', 'criminal'],
  ['interim_bail', 'criminal'],
  ['plaint_declaration', 'civil'],
  ['plaint_eviction', 'civil'],
  ['plaint_injunction', 'civil'],
  ['plaint_partition', 'civil'],
  ['plaint_recovery', 'civil'],
  ['plaint_specific_performance', 'civil'],
  ['temporary_injunction_o39', 'civil'],
]);

/** T-149: the document types whose party labels are signed, in table order. */
export const SIGNED_DOCUMENT_TYPES: readonly string[] = Array.from(SIGNED_DOCUMENT_SIDES.keys());

/** The signed side of a document type, or null when the table does not cover it. */
export function documentSide(templateId: string): DocumentSide | null {
  return SIGNED_DOCUMENT_SIDES.get(templateId) ?? null;
}

/**
 * T-149: the signed first- and second-party labels for one document in one
 * court, or null when the document type is not signed or the court rule gives
 * no labels for its side (callers then keep their behaviour of today).
 */
export function signedPartyLabels(
  rule: Pick<CourtRuleData, 'party_designation_by_side'>,
  templateId: string,
): { petitioner: string; respondent: string } | null {
  const side = documentSide(templateId);
  return (side && rule.party_designation_by_side?.[side]) || null;
}

/**
 * T-149: the court rule's party designations for one document. For a signed
 * document type in a court whose rule gives `party_designation_by_side`, the
 * petitioner and respondent labels are the signed ones for that side; every
 * other key, court and document is returned as the rule has it.
 */
export function partyDesignationFor(
  rule: CourtRuleData,
  templateId: string,
): Record<string, string> | undefined {
  if (!rule.party_designation) return undefined;
  const signed = signedPartyLabels(rule, templateId);
  if (!signed) return rule.party_designation;
  return {
    ...rule.party_designation,
    petitioner: signed.petitioner,
    respondent: signed.respondent,
  };
}

/** T-158: the court-rule fields a matter type may replace. */
export interface MatterTypeOverride {
  cause_title_format?: string;
  party_designation?: Record<string, string>;
  verification_format?: string;
}

/**
 * T-158 (AJ-2026-10-08-T157-A2, AJ-2026-10-08-T158-A2): the matter type of a
 * document type, as a `case_nomenclature` key. Only document types whose
 * statute is fixed are listed. Anything else (an I.A., a counter or rejoinder
 * affidavit, which arise under either statute) has no matter type, and the
 * court rule's own neutral wording prints.
 */
const MATTER_TYPE_BY_TEMPLATE: ReadonlyMap<string, string> = new Map([
  ['ibc_application', 'insolvency_application'],
]);

/** The matter type (`case_nomenclature` key) of a document type, or null. */
export function matterTypeFor(templateId: string): string | null {
  return MATTER_TYPE_BY_TEMPLATE.get(templateId) ?? null;
}

/**
 * T-158: the court rule as it applies to one document type. When the rule has
 * `matter_type_overrides` for the document's matter type, its cause title,
 * party labels and verification replace the rule's own; any other key is kept.
 * With no override (unknown matter type, or a rule without overrides) the rule
 * is returned unchanged.
 */
export function ruleForMatter<
  T extends {
    cause_title_format?: string;
    party_designation?: Record<string, string>;
    verification_format?: string;
    matter_type_overrides?: Record<string, MatterTypeOverride>;
  },
>(rule: T, templateId: string): T {
  const key = matterTypeFor(templateId);
  const override = key ? rule.matter_type_overrides?.[key] : undefined;
  if (!override) return rule;
  return {
    ...rule,
    ...(override.cause_title_format !== undefined && {
      cause_title_format: override.cause_title_format,
    }),
    ...(override.party_designation && {
      party_designation: { ...rule.party_designation, ...override.party_designation },
    }),
    ...(override.verification_format !== undefined && {
      verification_format: override.verification_format,
    }),
  };
}

/**
 * T-158 (AJ-2026-10-08-T158-diff, C2): appended to the AI prompt's party list
 * when any designation is a visible blank, so the model does not silently pick
 * one of its options.
 */
export const TO_BE_CONFIRMED_DESIGNATION_RULE =
  '- If a designation above begins with "[To be confirmed:", reproduce it exactly as written wherever that party is named. Do not choose between the options.';

/** The party designations an AI prompt is sent for one document. */
export interface PromptPartyDesignations {
  /** `[role, label]` pairs, in the court rule's order. */
  entries: Array<[string, string]>;
  /** True when any label is a visible "[To be confirmed: ...]" blank (C2). */
  needsToBeConfirmedRule: boolean;
}

/**
 * T-158: the party designations every AI prompt path is sent for one court
 * rule and document type. The matter type's labels apply (`ruleForMatter`);
 * a "not applicable" state is left out entirely (AJ-2026-10-08-T158-A1-ext),
 * so the model is sent neither the note nor a blank; and the flag says when
 * TO_BE_CONFIRMED_DESIGNATION_RULE must follow (AJ-2026-10-08-T158-diff, C2).
 */
export function promptPartyDesignations(
  rule: CourtRuleData,
  templateId: string,
): PromptPartyDesignations {
  const entries = Object.entries(
    partyDesignationFor(ruleForMatter(rule, templateId), templateId) ?? {},
  ).filter(([k, v]) => !(k === 'state' && isStateNotApplicable(v)));
  return {
    entries,
    needsToBeConfirmedRule: entries.some(([, v]) => v.startsWith('[To be confirmed:')),
  };
}

/** The AI prompt's PARTY DESIGNATIONS lines for one court rule and document type. */
export function partyDesignationsPromptLines(rule: CourtRuleData, templateId: string): string {
  const { entries, needsToBeConfirmedRule } = promptPartyDesignations(rule, templateId);
  const lines = entries.map(([k, v]) => `- ${k}: "${v}"`);
  if (needsToBeConfirmedRule) lines.push(TO_BE_CONFIRMED_DESIGNATION_RULE);
  return lines.join('\n');
}

/** Pre-fetched court data to avoid async DB calls inside resolveComputedFields. */
export interface CourtLookupData {
  designation: string;
  city: string;
  caseNomenclature: string;
  formattingRulesRef: string;
  /** The court's type in the courts list (jmfc, cjm, sessions, high_court ...). */
  courtType?: string;
  /** The court's State or Union Territory as stored in the courts list. */
  state?: string;
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

/** A designation that offers a choice ("A / B") or holds a placeholder. */
function isGenericDesignation(d: string): boolean {
  return d.includes(' / ') || /\{\w+\}/.test(d);
}

/**
 * T-157 (AJ-2026-10-08-T157, condition 2): court rules whose designation is a
 * fallback only. The chosen court's own designation from the courts list
 * always wins; the rule's line prints only when the court has none. Before
 * T-157 these designations held " / ", which is what made them yield.
 */
const FALLBACK_DESIGNATION_RULES = new Set([
  'sessions_generic',
  'district_court_generic',
  'labour_court',
]);

/** Shown in place of "State of {state}" when the State is not known or is a UT. */
const STATE_BLANK = '[To be confirmed: name of the State]';

/**
 * T-158 (AJ-2026-10-08-T158-A1-ext): a `party_designation.state` that says no
 * State party applies (e.g. family_court's "Not applicable (...)") is an
 * internal note, not a party. It is treated as not set: the engine prints
 * STATE_BLANK for `{state_respondent}`, and the AI prompt is sent no `state`.
 */
export function isStateNotApplicable(state: string | undefined): boolean {
  return (state ?? '').trim().toLowerCase().startsWith('not applicable');
}

/**
 * Union Territories (AJ-2026-10-08-T157, condition 1). A UT is not a "State",
 * so "State of {state}" must not print for one. Names are compared after
 * lower-casing and reading "&" as "and".
 */
const UNION_TERRITORIES = new Set([
  'chandigarh',
  'puducherry',
  'ladakh',
  'jammu and kashmir',
  'lakshadweep',
  'andaman and nicobar',
  'andaman and nicobar islands',
  'dadra and nagar haveli and daman and diu',
]);

/**
 * Delhi's state line (AJ-2026-10-08-T157-golden). Delhi is the National
 * Capital Territory, not a State, and the settled cause-title form is
 * "State (NCT of Delhi)". Printed in place of "State of {state}".
 */
const DELHI_STATE_LINE = 'State (NCT of Delhi)';

/** Courts-list state names that mean Delhi, compared lower-cased as whole strings. */
const DELHI_NAMES = new Set([
  'delhi',
  'new delhi',
  'nct of delhi',
  'national capital territory of delhi',
  // AJ-2026-10-08-T157-A1 (Art. 239AA(1)): the same entity under its older
  // name. Exact full-string match only, never a substring match on "Delhi".
  'union territory of delhi',
]);

/** True when the courts-list state names Delhi (case-insensitive). */
function isDelhi(state: string): boolean {
  return DELHI_NAMES.has(state.toLowerCase().replace(/\s+/g, ' ').trim());
}

/** True when the courts-list state names a Union Territory. */
function isUnionTerritory(state: string): boolean {
  const s = state.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  if (/^union territory of\s/.test(s) || /\(ut\)$/.test(s)) return true;
  return UNION_TERRITORIES.has(s);
}

/**
 * The state line of a court rule with `{district}` and `{state}` filled in.
 * T-157 (AJ-2026-10-08-T157, condition 1): `{state}` comes from the court's
 * own state in the courts list. Where that is empty or a Union Territory,
 * "State of {state}" prints as a visible blank; a literal `{state}` never
 * prints. Delhi prints "State (NCT of Delhi)" (AJ-2026-10-08-T157-golden).
 */
function stateLine(template: string, courtData: CourtLookupData): string {
  let line = template.replace(/\{district\}/g, courtData.city);
  if (!/\{state\}/.test(line)) return line;
  const state = courtData.state?.trim() ?? '';
  if (state && isDelhi(state)) {
    line = line.replace(/State of \{state\}/g, DELHI_STATE_LINE);
    return line.replace(/\{state\}/g, state);
  }
  if (!state || isUnionTerritory(state)) {
    line = line.replace(/State of \{state\}/g, STATE_BLANK);
    return line.replace(/\{state\}/g, STATE_BLANK);
  }
  return line.replace(/\{state\}/g, state);
}

/**
 * The court's name two ways, from the courts list and its court rule.
 * SCRUM-54 B8: `designation` is the bare court/judge name for addressing
 * (e.g. "SESSIONS JUDGE, PATNA" or "HIGH COURT OF JUDICATURE AT PATNA");
 * `header` is the full heading line with its "IN THE COURT OF" /
 * "IN THE HIGH COURT OF" prefix.
 */
function courtHeading(courtData: CourtLookupData): { designation: string; header: string } {
  const ruleDesignation = courtData.courtRule?.designation;
  let rawDesignation: string;
  // Only a designation taken from the court rule gets the court's city added.
  // A designation from the courts list already names its place and prints as
  // stored (AJ-2026-10-07-T146-golden-2, fix 3).
  let fromRule: boolean;
  const own = courtData.designation?.trim();
  const ruleIsFallback = FALLBACK_DESIGNATION_RULES.has(courtData.formattingRulesRef);
  if (ruleDesignation && ruleIsFallback && !isGenericDesignation(ruleDesignation)) {
    // T-157 (AJ-2026-10-08-T157, condition 2): the chosen court's own
    // designation wins over the rule's single-wording fallback. A courts-list
    // designation with " / " still prints the blank (T-146-golden-2, fix 5).
    if (own && isGenericDesignation(own)) {
      const blank = '[To be confirmed: court designation]';
      return { designation: blank, header: blank };
    }
    if (own) {
      rawDesignation = own;
      fromRule = false;
    } else {
      rawDesignation = ruleDesignation;
      // A fallback that is itself a blank gets no city after it.
      fromRule = !ruleDesignation.includes('[To be confirmed');
    }
  } else if (ruleDesignation && isGenericDesignation(ruleDesignation)) {
    // T-146 (AJ-2026-10-07-T146-golden, fix 3): a generic rule's designation
    // offers a choice ("SESSIONS JUDGE / ADDITIONAL SESSIONS JUDGE") or holds a
    // placeholder ("IN THE HIGH COURT OF {courtDesignation}"). The
    // chosen court's own designation is used instead, or a visible blank.
    if (!own || isGenericDesignation(own)) {
      // The blank alone, with no "IN THE COURT OF" or "BEFORE THE": the form
      // of the heading is not known either (AJ-2026-10-07-T146-golden-2, fix 5).
      const blank = '[To be confirmed: court designation]';
      return { designation: blank, header: blank };
    }
    rawDesignation = own;
    fromRule = false;
  } else if (
    ruleDesignation &&
    own &&
    own !== ruleDesignation.trim() &&
    !isGenericDesignation(own) &&
    /HIGH COURT/i.test(ruleDesignation) &&
    /HIGH COURT/i.test(own)
  ) {
    // T-175 (AJ-2026-10-08-T171-A3, A2 final): a High Court with its own rule
    // that the chosen court shares with a bench (e.g. allahabad_hc for the
    // Lucknow Bench). The courts-list entry's designation names the bench and
    // wins over the rule's, which names only the principal seat. Never guess
    // a seat or bench. The cached rule is read, never changed.
    rawDesignation = own;
    fromRule = false;
  } else if (ruleDesignation) {
    rawDesignation = ruleDesignation;
    fromRule = true;
  } else {
    rawDesignation = courtData.designation;
    fromRule = false;
  }
  // If the rule's designation has no city, append the court's city. Never for a
  // High Court or the Supreme Court: the seat is already in the name
  // (AJ-2026-10-07-T146-golden, fix 2; AJ-2026-10-07-T146-golden-2, fix 2).
  if (
    fromRule &&
    courtData.city &&
    !/HIGH COURT|SUPREME COURT/i.test(rawDesignation) &&
    !rawDesignation.toUpperCase().includes(courtData.city.toUpperCase())
  ) {
    rawDesignation = `${rawDesignation}, ${courtData.city.toUpperCase()}`;
  }
  if (/^IN THE COURT OF\s/i.test(rawDesignation)) {
    return {
      designation: rawDesignation.replace(/^IN THE COURT OF\s*/i, ''),
      header: rawDesignation,
    };
  }
  // A designation that already begins "IN THE " ("IN THE HIGH COURT OF ...",
  // "IN THE SUPREME COURT OF INDIA", "IN THE FAMILY COURT, PATNA") is the
  // header as written (AJ-2026-10-07-T146-golden-2, fix 1).
  if (/^IN THE\s/i.test(rawDesignation)) {
    return { designation: rawDesignation.replace(/^IN THE\s*/i, ''), header: rawDesignation };
  }
  // A commission or forum heading, e.g. "BEFORE THE DISTRICT CONSUMER DISPUTES
  // REDRESSAL COMMISSION, RANCHI", is the header as written (fix 1).
  if (/^BEFORE THE\s/i.test(rawDesignation)) {
    return { designation: rawDesignation.replace(/^BEFORE THE\s*/i, ''), header: rawDesignation };
  }
  return { designation: rawDesignation, header: `IN THE COURT OF ${rawDesignation}` };
}

/**
 * Resolve computed fields from the template config using form data.
 *
 * Supports:
 * - "if {field} === 'value' then 'a' else 'b'"
 * - "'text'" — a fixed value
 * - "label_map[{field_ref}]"
 * - "value_map[{field_ref}] || 'default'" — the value this field's value_map gives
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

    // Pattern: 'text'
    const literalMatch = logic.match(/^'([^']*)'$/);
    if (literalMatch) {
      computed[fieldId] = literalMatch[1];
      continue;
    }

    // Pattern: value_map[{field_ref}] || 'default'
    const valueMapMatch = logic.match(/^value_map\[(\w+)\]\s*\|\|\s*'([^']*)'$/);
    if (valueMapMatch) {
      const [, refField, defaultVal] = valueMapMatch;
      const refValue = String(formData[refField] ?? computed[refField] ?? '');
      computed[fieldId] = def.value_map?.[refValue] ?? defaultVal;
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
        const { designation, header } = courtHeading(courtData);
        const propMap: Record<string, string> = {
          designation,
          header,
          city: courtData.city,
          case_nomenclature: courtData.caseNomenclature,
          court_type: courtData.courtType ?? String(formData.court_type ?? ''),
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
        } else if (prop === 'court_type') {
          computed[fieldId] = String(formData.court_type ?? '');
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
 * @returns value with the first matching prefix removed (once only), or the original
 *   value if none matched or if removing it would leave nothing (AJ-2026-10-08-T139-A1)
 */
function stripLeadingPrefix(value: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}[\\s.]+`, 'i');
    if (re.test(value)) {
      const stripped = value.replace(re, '').trim();
      if (stripped === '') return value;
      // AJ-2026-10-08-T139-final C2: a leading bare थाना may be part of the
      // station's name ("थाना भवन"). It is kept when the rest is one word, or
      // when a station word also ends the value.
      if (prefix === 'थाना' && (!/\s/.test(stripped) || STATION_SUFFIX.test(value))) return value;
      return stripped;
    }
  }
  return value;
}

/** A station word ending a value, with what separates it from the name before it. */
const STATION_SUFFIX =
  /[\s,]+(?:p\.?\s?s\.?|thana|police\s+station|पुलिस\s+थाना|थाना|पुलिस\s+स्टेशन)\s*$/i;

/**
 * AJ-2026-10-08-T139 1(c): every template writes its own "Police Station" or
 * "P.S." before `{police_station}`, so a station read as the advocate wrote it
 * ("Saraidhela PS") loses a trailing PS, P.S., thana, police station,
 * पुलिस थाना, थाना or पुलिस स्टेशन here, at render only. The brief keeps the advocate's words. A
 * value that is only the station word is left as it is.
 */
export function stripStationSuffix(value: string): string {
  const stripped = value.replace(STATION_SUFFIX, '').trim();
  return stripped === '' ? value : stripped;
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

  applyCourtAndAliases(ctx, computed, courtData);

  // ── SCRUM-50: Inject court-rule-driven placeholders ───────────────────────
  if (courtData?.courtRule) {
    // T-158: labels and verification follow the document's matter type.
    const rule = ruleForMatter(courtData.courtRule, config.template_id);

    // Party labels from court rule
    // T-149: labels follow the document's side where Ajay signed them.
    const designation = partyDesignationFor(rule, config.template_id);
    if (designation) {
      ctx.party_label_petitioner = designation.petitioner ?? 'Petitioner';
      ctx.party_label_respondent = designation.respondent ?? 'Respondent';
      ctx.party_label_applicant = designation.applicant ?? 'Applicant';
      ctx.party_label_accused = designation.accused ?? 'Accused';
      // State respondent template
      // T-158 (AJ-2026-10-08-T158-A1-ext): no State party prints the visible
      // blank, never the note and never the "Through Public Prosecutor" default.
      if (isStateNotApplicable(designation.state)) {
        ctx.state_respondent = STATE_BLANK;
      } else if (designation.state) {
        ctx.state_respondent = stateLine(designation.state, courtData);
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
  // T-149: the cause-title suffixes are the same labels, in upper case.
  ctx.party_label_petitioner_upper = ctx.party_label_petitioner.toUpperCase();
  ctx.party_label_respondent_upper = ctx.party_label_respondent.toUpperCase();
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

  // T-146: aliases are set after the SCRUM-50 court-rule block, so an alias
  // such as {caseNomenclature} reads the same value as {case_nomenclature}.
  applyPlaceholderAliases(ctx);

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
    ctx.police_station = stripStationSuffix(
      stripLeadingPrefix(ctx.police_station, [
        'Police Station',
        'P\\.?S\\.?',
        'पुलिस\\s+स्टेशन',
        'पुलिस\\s+थाना',
        'थाना',
      ]),
    );
  }

  return ctx;
}

/**
 * T-146: the camelCase tokens the document rules use, and the context key each
 * one reads. An alias is set only when the rule's own key is not in the context,
 * so a value the form gave under the camelCase name is kept.
 */
export const PLACEHOLDER_ALIASES: ReadonlyArray<readonly [alias: string, sources: readonly string[]]> = [
  ['courtDesignation', ['court_designation']],
  ['courtHeader', ['court_header']],
  ['courtPlace', ['court_city']],
  ['place', ['court_city']],
  ['caseNomenclature', ['case_nomenclature']],
  ['applicant', ['applicant_name']],
  ['parentName', ['applicant_parentage', 'applicant_father_name']],
  ['age', ['applicant_age']],
  ['applicantAddress', ['applicant_address']],
  ['respondentAddress', ['respondent_address']],
  ['advocateName', ['advocate_name']],
  ['advocateAddress', ['advocate_address']],
];

/** Fill each camelCase alias from the first of its sources that has a value. */
function applyPlaceholderAliases(ctx: PlaceholderContext): void {
  for (const [alias, sources] of PLACEHOLDER_ALIASES) {
    if (ctx[alias] !== undefined && ctx[alias] !== '') continue;
    const source = sources.find((s) => ctx[s] !== undefined && ctx[s] !== '');
    if (source) ctx[alias] = ctx[source];
  }
}

/** Keys a form or brief may carry the applicant's place of custody under. */
const JAIL_SOURCES = ['jail', 'jail_name', 'place_of_custody', 'custody_place', 'custody_location'];

const IS_BLANK = /^\[To be confirmed: [^\]]*\]$/;

/**
 * T-156: the chosen court's heading, as the draft prints it in `court_header`
 * and `court_designation`. Undefined when no court was chosen (or the court
 * has no designation), in which case callers keep their own fallback. The
 * annexures pack uses this so every heading in a document names one court.
 */
export function chosenCourtHeading(
  courtData?: CourtLookupData,
): { designation: string; header: string } | undefined {
  if (!courtData?.designation?.trim()) return undefined;
  return courtHeading(courtData);
}

/**
 * T-146: the court the user chose from the courts list, put into the context
 * before the SCRUM-50 court-rule block. The camelCase aliases are set later, by
 * `applyPlaceholderAliases`, after that block.
 *
 * - The court comes from the courts list (ADR-021 rule 3): `court_header` and
 *   `court_designation` are taken from it (see `courtHeading`) over any form
 *   value, unless the template's computed fields already set them.
 * - `{lastParagraph}` is the deferred `{body_para_count}`.
 * - `{jail}` has no intake field. A value given under a custody key is used;
 *   otherwise it is a visible blank the user fills, never `_____`.
 */
function applyCourtAndAliases(
  ctx: PlaceholderContext,
  computed: Record<string, string>,
  courtData?: CourtLookupData,
): void {
  const chosen = chosenCourtHeading(courtData);
  if (chosen) {
    const { designation, header } = chosen;
    if (!computed.court_header) ctx.court_header = header;
    if (!computed.court_designation) ctx.court_designation = designation;
  }
  const city = courtData?.city?.trim();
  if (city && (!ctx.court_city || IS_BLANK.test(ctx.court_city))) ctx.court_city = city;
  if (courtData?.caseNomenclature && !ctx.case_nomenclature) {
    ctx.case_nomenclature = courtData.caseNomenclature.replace(/\{year\}/g, ctx.current_year);
  }


  if (ctx.lastParagraph === undefined) ctx.lastParagraph = '{body_para_count}';

  if (ctx.jail === undefined || ctx.jail === '') {
    const source = JAIL_SOURCES.find((s) => ctx[s] !== undefined && ctx[s] !== '');
    ctx.jail = source ? ctx[source] : '[To be confirmed: name of jail]';
  }

  // AJ-2026-10-07-T146: "currently in judicial custody at" prints only when the
  // brief says the applicant is in custody. Nothing is inferred from other
  // answers (an arrest date, days in custody).
  if (ctx.custody_clause === undefined) {
    ctx.custody_clause = custodyConfirmed(ctx)
      ? `, currently in judicial custody at ${ctx.jail}`
      : '';
  }
}

/** Keys a brief may say the applicant is in custody under. */
const CUSTODY_SOURCES = ['currently_in_custody', 'in_custody', 'custody_status'];

/**
 * True only when a custody answer names judicial custody: the option id
 * `yes_judicial`, or a value such as "Yes — Judicial custody". Police custody,
 * a bare "yes" and a negative answer ("not in judicial custody") print no clause.
 */
function custodyConfirmed(ctx: PlaceholderContext): boolean {
  return CUSTODY_SOURCES.some((k) => {
    const v = (ctx[k] ?? '').trim();
    if (!v || IS_BLANK.test(v)) return false;
    if (v.toLowerCase() === 'yes_judicial') return true;
    if (/^(no|false)\b/i.test(v) || /\bnot\b/i.test(v)) return false;
    return /judicial custody/i.test(v);
  });
}

/**
 * AJ-2026-10-07-T146 (developer finding 1): the verification date is the date
 * the deponent signs. It is never pre-filled; a date the advocate gave as
 * `verification_date` prints as given.
 */
const VERIFICATION_DATE_BLANK = '___ day of __________, 20___';

/** Placeholders whose empty value is intended (a clause that does not apply). */
const MAY_BE_EMPTY = new Set(['custody_clause']);

/**
 * The context a template section renders with. The verification's `{date}` is
 * the signing date: the advocate's `verification_date`, else a blank.
 */
export function sectionContext(
  section: Pick<DocumentSection, 'section_id'>,
  ctx: PlaceholderContext,
): PlaceholderContext {
  if (section.section_id !== 'verification') return ctx;
  return { ...ctx, date: ctx.verification_date || VERIFICATION_DATE_BLANK };
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
    if (ctx[key] === undefined || (ctx[key] === '' && !MAY_BE_EMPTY.has(key))) {
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

/** T-160: words of a court name or city, lower-case, punctuation dropped. */
function placeWords(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * T-160: true when the court designation already names the city, as whole
 * words, ignoring case and punctuation ("CHIEF JUDICIAL MAGISTRATE, PATNA" and
 * "Patna").
 */
export function designationNamesCity(designation?: string, city?: string): boolean {
  const cityWords = placeWords(city);
  if (!cityWords) return false;
  return ` ${placeWords(designation)} `.includes(` ${cityWords} `);
}

/** T-160: a `{court_city}` line printed straight after `{court_designation},`. */
const CITY_LINE_AFTER_DESIGNATION = /\{court_designation\},?[ \t]*\n[ \t]*\{court_city\}/g;

/**
 * T-160: the template a section renders. When the designation already names
 * the city (designations from the courts list do), the city line that follows
 * it is dropped, so the addressing clause names the city once. Other mentions
 * of `{court_city}` ("Place:", "Verified at") are untouched.
 */
export function sectionTemplate(template: string, ctx: PlaceholderContext): string {
  if (!designationNamesCity(ctx.court_designation, ctx.court_city)) return template;
  return template.replace(CITY_LINE_AFTER_DESIGNATION, '{court_designation}');
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

  const sectionCtx = sectionContext(section, ctx);
  return {
    section_id: section.section_id,
    type: 'template',
    content: replacePlaceholders(sectionTemplate(section.template, sectionCtx), sectionCtx),
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
      ? `\n\nPARTY DESIGNATIONS FOR THIS COURT:\n${partyDesignationsPromptLines(
          courtRule,
          config.template_id,
        )}`
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
    if (ctx.father_name) {
      const rel = (ctx.relation_type as string | undefined) ?? 'S/o / D/o / W/o';
      identityParts.push(`${rel}: ${ctx.father_name}`);
    }
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

  // SCRUM-67: Grounds-vs-facts coherence — inject reconciliation rules when the
  // selected grounds aren't supported by keywords in the facts narrative.
  // (See detectCoherenceMismatches for the full rule list and per-rule prompts.)
  const groundsRaw = ctx.grounds_for_bail ?? ctx.grounds_for_quashing ?? ctx.grounds;
  const factsRaw = ctx.facts_narrative ?? ctx.facts ?? '';
  if (groundsRaw && factsRaw) {
    const mismatches = detectCoherenceMismatches(groundsRaw, factsRaw);
    for (const m of mismatches) {
      prompt += `\n\n${m.prompt_injection}`;
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

// ── SCRUM-67: Grounds-vs-facts coherence rules ──────────────────────────────
//
// When an advocate selects a ground (e.g. "false_implication") but the facts
// narrative doesn't contain any of the keywords that would normally substantiate
// that ground, the AI is told to explicitly reconcile the mismatch in the body,
// and a coherence_mismatch warning surfaces in the drafting `done` event so the
// frontend can show a review chip on the editor.
//
// Reviewer: Ajay (CLO) for the prompt language. Each rule's `prompt_injection`
// is rendered verbatim into the AI user prompt — keep wording strict.

export interface CoherenceRule {
  /** Form field value (e.g. `false_implication`) — must match one of the checkbox options */
  groundId: string;
  /** Human-readable label for warnings */
  groundLabel: string;
  /** Regex run against facts narrative — ANY match = coherent (no injection) */
  narrativeKeywords: RegExp;
  /** Verbatim text injected into the AI user prompt when this rule fires */
  promptInjection: string;
  /** Short warning surfaced to the frontend via the SSE `done` event */
  warningMessage: string;
}

export const COHERENCE_RULES: CoherenceRule[] = [
  {
    groundId: 'false_implication',
    groundLabel: 'False implication',
    narrativeKeywords:
      /\b(rendered|aid|took|brought|drove|carried|hospital|help|assist|first[- ]?aid|rescue|good[- ]?samaritan|misunderstood|misidentif|wrongly[- ]?named|mistaken[- ]?identity|cross[- ]?complain)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "False implication" as a ground, but the facts narrative does not clearly show either (a) positive deeds by the applicant (rendering aid, taking the victim to hospital, etc.) or (b) why blame was misattributed. In the body paragraphs, explicitly reconcile the false-implication ground with the narrative — explain HOW the applicant\'s passive presence or absence led to wrongful blame. Do not paraphrase generically.',
    warningMessage:
      'False implication ground selected, but the facts narrative does not show positive deeds or explain why blame was misattributed.',
  },
  {
    groundId: 'business_dispute_civil_in_nature',
    groundLabel: 'Business / civil dispute',
    narrativeKeywords:
      /\b(business|commercial|transaction|partnership|partner|contract|payment|debt|loan|firm|account|trade|supplier|client|civil[- ]nature|recovery|cheque|invoice|consignment|stock|shareholding)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "Business dispute civil in nature" as a ground, but the facts narrative does not identify the underlying business or commercial relationship. In the body, explicitly state the business / commercial relationship between the applicant and the de-facto complainant, the nature of the transaction in dispute, and how a purely civil dispute was wrongly converted into a criminal complaint.',
    warningMessage:
      'Business dispute ground selected, but the facts narrative does not identify the business relationship.',
  },
  {
    groundId: 'complainant_motive',
    groundLabel: 'Complainant motive',
    narrativeKeywords:
      /\b(dispute|feud|grudge|previous|earlier|history|enmity|enemity|rivalry|prior[- ]complain|cross[- ]case|land[- ]dispute|family[- ]dispute|panchayat|altercation|quarrel|verbal[- ]exchange|motive|malafide|malicious|ulterior|vendetta|harass)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "Complainant motive" as a ground, but the facts narrative does not establish prior friction, dispute, or motive. In the body, explicitly identify the prior dispute, feud, or motive that explains why the complainant filed a false or motivated complaint against the applicant.',
    warningMessage:
      'Complainant motive ground selected, but the facts narrative does not establish prior friction.',
  },
  {
    groundId: 'medical_grounds',
    groundLabel: 'Medical grounds',
    narrativeKeywords:
      /\b(medical|health|illness|hospital|treatment|surgery|diabet|cardiac|hyperten|cancer|tumour|tumor|pregnan|disabled|disability|asthma|respiratory|kidney|dialysis|stroke|paralysi|chronic|prescript|medication|physician|specialist|RIMS|AIIMS)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "Medical grounds" as a ground, but the facts narrative does not describe any medical condition. In the body, explicitly identify the medical condition, name the treating hospital or doctor, and explain why custodial interrogation would aggravate the condition.',
    warningMessage:
      'Medical grounds selected, but the facts narrative does not describe any medical condition.',
  },
  {
    groundId: 'deep_roots_in_community',
    groundLabel: 'Deep roots in community',
    narrativeKeywords:
      /\b(resid|family|employ|since|years|own[- ]?property|owner|landed|ancestral|local|community|generation|childhood|born|spouse|husband|wife|children|elder|aged[- ]?parent|business[- ]?in|works[- ]?as|profession|practice|teach|nurse|engineer|doctor|farm)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "Deep roots in community" as a ground, but the facts narrative does not establish ties to the jurisdiction. In the body, explicitly state how long the applicant has resided / been employed in the jurisdiction, family ties (dependants, elderly parents, school-going children), and property or business interests that prevent any flight risk.',
    warningMessage:
      'Deep roots ground selected, but the facts narrative does not establish residence, family, or property ties.',
  },
  {
    groundId: 'professional_reputation',
    groundLabel: 'Professional reputation',
    narrativeKeywords:
      /\b(profession|occupation|employed|works[- ]?as|teacher|doctor|engineer|advocate|lawyer|nurse|officer|manager|director|professor|judge|civil[- ]servant|government[- ]servant|industry|practice|reputation|standing|client|patient|student|colleague|firm)/i,
    promptInjection:
      'COHERENCE: The applicant has selected "Professional reputation" as a ground, but the facts narrative does not identify the applicant\'s profession or standing. In the body, explicitly identify the applicant\'s profession, employer, and how arrest would damage a professional reputation built over years.',
    warningMessage:
      'Professional reputation ground selected, but the facts narrative does not identify a profession.',
  },
];

export interface CoherenceMismatch {
  rule_id: string;
  ground_label: string;
  warning_message: string;
  prompt_injection: string;
}

/**
 * Detect grounds-vs-facts coherence mismatches.
 *
 * `grounds` accepts either a string array (raw form value) or a comma/space-
 * separated string (already-flattened placeholder-context value). Each ground
 * id is checked against COHERENCE_RULES — if its narrativeKeywords regex does
 * NOT match the facts narrative, a mismatch is emitted.
 *
 * Used in two places:
 *   1. buildAIUserPrompt → injects each mismatch's promptInjection into the AI prompt.
 *   2. ai.service.ts → emits each mismatch as a `coherence_mismatch` warning
 *      on the SSE `done` event so the frontend can show a review chip.
 */
export function detectCoherenceMismatches(
  grounds: string | string[] | undefined | null,
  facts: string | undefined | null,
): CoherenceMismatch[] {
  if (!grounds || !facts) return [];

  // Normalise grounds → array of ground ids
  const groundsArr = Array.isArray(grounds)
    ? grounds.map((g) => String(g).trim())
    : String(grounds)
        .split(/[,\n;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  const factsStr = String(facts);
  if (!factsStr.trim()) return [];

  const out: CoherenceMismatch[] = [];
  for (const rule of COHERENCE_RULES) {
    if (!groundsArr.includes(rule.groundId)) continue;
    if (rule.narrativeKeywords.test(factsStr)) continue; // narrative substantiates the ground
    out.push({
      rule_id: rule.groundId,
      ground_label: rule.groundLabel,
      warning_message: rule.warningMessage,
      prompt_injection: rule.promptInjection,
    });
  }
  return out;
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

  // Emit styled HTML so that per-section alignment + headings survive into the
  // saved content. Before this, `assembled.map(s => s.content).join('\n\n')`
  // produced a plain-text blob and the cause-title / application-heading lost
  // their `alignment: 'center'` + bold styling. The PDF export's heading-
  // detection heuristic only caught all-caps single-line paragraphs, leaving
  // multi-line cause-title flush-left in the rendered PDF.
  //
  // Both `contentToHtml` (server PDF route) and the TipTap editor / client
  // `exportPdf` fallback detect HTML via the leading `<` and embed as-is —
  // no other code path needs to change.
  const fullText = assembled.map((s) => sectionToStyledHtml(s)).join('\n');
  return { fullText, bodyParaCount };
}

// ── HTML emitter for assembleDocument ───────────────────────────────────────
//
// Each rendered section becomes a sequence of `<p style="text-align:...">` —
// alignment from the section's `alignment` field, headings auto-promoted to
// `<strong>` + centred when they look like a court-document heading line.
//
// Heading detection (matches the smoke-test export-pdf.ts heuristic so both
// pipelines agree on what counts as a heading):
//   • Single-line paragraph, ≤120 chars
//   • Either fully UPPERCASE, OR starts with one of the well-known prefixes
//     (PRAYER / VERIFICATION / DEMAND / LEGAL NOTICE / APPLICATION FOR /
//      THROUGH: / Subject: / IN THE [HIGH] COURT / MOST RESPECTFULLY)

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 120) return false;
  if (
    /^(MOST RESPECTFULLY|PRAYER|VERIFICATION|DEMAND|LEGAL NOTICE|APPLICATION FOR|THROUGH:|Subject:|IN THE (HIGH )?COURT|TO,?\s*$)/i.test(
      t,
    )
  ) {
    return true;
  }
  // All-caps line with at least one letter
  return t === t.toUpperCase() && /[A-Z]/.test(t);
}

function escapeHtmlForAssembly(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownInline(s: string): string {
  // Convert **bold** and *italic* tokens after escaping. Conservative — only
  // these two markers are commonly produced by the AI and we don't want to
  // misinterpret stray asterisks in legal text.
  let html = escapeHtmlForAssembly(s);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return html;
}

export function sectionToStyledHtml(section: RenderedSection): string {
  const align = section.alignment ?? 'left';
  // Paragraphs separated by blank lines; lines within a paragraph become <br>.
  const paragraphs = section.content.split(/\n\n+/);
  const parts: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // SCRUM-44 horizontal rule support (---)
    if (trimmed === '---') {
      parts.push('<hr>');
      continue;
    }

    const lines = trimmed.split('\n');
    // Heading: single-line paragraph that matches the heading regex
    if (lines.length === 1 && isHeadingLine(lines[0])) {
      // Headings are centred and bold regardless of section alignment.
      parts.push(`<p style="text-align:center"><strong>${markdownInline(lines[0])}</strong></p>`);
      continue;
    }

    const lineHtml = lines.map((l) => markdownInline(l)).join('<br>');
    parts.push(`<p style="text-align:${align}">${lineHtml}</p>`);
  }

  return parts.join('\n');
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
