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

import {
  catalogueCategoryDisplay,
  catalogueCategoryFor,
  requireCatalogueCategory,
  type CatalogueCategoryId,
} from '../config/catalogue';
import courtDocuments from '../config/intake/court-documents.json';
import dateMeanings from '../config/intake/date-meanings.json';
import logger from '../config/logger';

import {
  BNS_CLASSIFICATION,
  BNS_OFFENCE_KEYS,
  ChargedCode,
  ChargedSection,
  OLD_LAW_LINE,
  readChargedField,
  readSectionsCharged,
  resolveOffence,
} from './bns-offence-resolver';
import { SIDED_PACKS } from './brief-party-fields';
import { NOT_KNOWN_DATE_LINE } from './drafter.prompts';
import {
  isLawSwitchPack,
  lawSwitch,
  lawSwitchInputFromCase,
  P_TEXT,
  S_TEXT,
  type LawSwitchResult,
  type ProcedureCode,
} from './law-switch';
import { policeStationName, stripTrailingStationMarker } from './police-station-name';
import { getTemplateRegistry } from './template-promoter';

/**
 * T-406 (Ajay, T-404 Addendum 2 item 9): a document that is not filed in court
 * carries no case nomenclature. Not a court document = listed in Ajay's
 * `not_court_documents` (read here directly; importing `isCourtDocument` from
 * intake-brief would be a circular import).
 */
const NOT_COURT_DOCUMENTS = new Set<string>(courtDocuments.not_court_documents);

/** T-406: whether a document type may carry a case nomenclature. */
export function nomenclatureAllowed(templateId: string): boolean {
  return !NOT_COURT_DOCUMENTS.has(templateId);
}

/** Sorted list of valid BNS section numbers for system-prompt injection (SCRUM-64). */
const BNS_VALID_SECTIONS = [...BNS_OFFENCE_KEYS].sort((a, b) => parseFloat(a) - parseFloat(b));

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
  /**
   * The behaviour value, from the rule file (or the docs/templates override).
   * Gates what is drafted (civil contract rule, CATEGORY prompt line, BNS
   * whitelist). NOT the library category: see `catalogueCategory`.
   */
  category: string;
  /**
   * The library category (T-240): one of T-239's 26, from config/catalogue,
   * never from the rule file. Drives the library, filters, seed and web only.
   * Always set on configs from the registry and the overrides (a template
   * without one fails at load); optional in the type for hand-built configs.
   */
  catalogueCategory?: CatalogueCategoryId;
  description: string;
  /** T-482: the pack's signed `_meta.match_terms`, shown to the intake match prompt only. */
  match_terms?: string[];
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
  /** T-240: library category id, its display name and its T-239 order. */
  catalogueCategory: CatalogueCategoryId;
  catalogueCategoryName: string;
  catalogueCategoryOrder: number;
  description: string;
  /** T-482: see TemplateConfig.match_terms. Absent when the pack has none. */
  match_terms?: string[];
  icon: string;
  plan_access: 'free' | 'pro';
  supported_languages: string[];
  metadata: TemplateMetadata;
}

// ── Config Loading ──────────────────────────────────────────────────────────

const TEMPLATES_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');
const configCache = new Map<string, TemplateConfig>();

/**
 * T-345: every docs/templates/*.json override must have a catalogue entry
 * (config/catalogue). Checks the id `loadTemplateConfig` files it under (the
 * file's `template_id`, else its file name) and throws ONE error naming every
 * missing id. A missing or unreadable directory is tolerated (registry-only
 * mode).
 *
 * T-350: an override file that cannot be read or is not valid JSON is not
 * skipped: it is logged (file-name id only, never its content) and fails the
 * same check, listed after the uncatalogued ids in the one error.
 *
 * Runs once when this module is first loaded (the engine is imported at boot),
 * so an unknown or broken override stops the boot instead of a request.
 */
export function assertOverridesCatalogued(dir: string = TEMPLATES_DIR): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    logger.warn(
      { dir, err: (err as Error).message },
      'T-345: docs/templates not readable; running without overrides',
    );
    return;
  }

  const missing: string[] = [];
  const invalid: string[] = [];
  const badNames: string[] = [];
  for (const f of files) {
    const fileId = f.replace(/\.json$/, '');
    // T-357 AC2: loadTemplateConfig refuses any id that is not a plain id, so
    // such a file could never be served; fail the boot instead of hiding it.
    if (!TEMPLATE_ID_PATTERN.test(fileId)) badNames.push(fileId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
    } catch {
      // T-350: no error message logged; a JSON parse message can echo the file's content.
      logger.error(
        { templateId: fileId },
        'T-350: docs/templates override is unreadable or not valid JSON',
      );
      invalid.push(fileId);
      continue;
    }
    // T-357 AC1: `null`, a primitive or an array is not a template config.
    if (!isPlainObject(parsed)) {
      logger.error(
        { templateId: fileId },
        'T-350: docs/templates override is unreadable or not valid JSON',
      );
      invalid.push(fileId);
      continue;
    }
    const inner = (parsed as { template_id?: unknown }).template_id;
    const id = typeof inner === 'string' ? inner : fileId;
    if (catalogueCategoryFor(id) === undefined) missing.push(id);
  }
  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(
      `no catalogue category in config/catalogue for docs/templates override(s): ${missing
        .sort()
        .join(', ')}`,
    );
  }
  if (invalid.length > 0) {
    problems.push(
      `docs/templates override(s) unreadable or not valid JSON: ${invalid.sort().join(', ')}`,
    );
  }
  if (badNames.length > 0) {
    problems.push(
      `docs/templates override file name(s) not a plain template id: ${badNames.sort().join(', ')}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`Template engine: ${problems.join('; ')}`);
  }
}

/** T-350 AC4: the only shape a template id may have (every catalogue and override id fits). */
const TEMPLATE_ID_PATTERN = /^[a-z0-9_-]+$/;

/** T-357 AC1: a parsed override must be a JSON object (not `null`, a primitive or an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** T-350: the read errors that mean "no override file at this path". */
function isNoOverrideFile(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

assertOverridesCatalogued();

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
  // T-350 AC4: a route passes its decoded `:id` straight in, so "../" (sent as
  // %2F) could reach files outside docs/templates. Anything that is not a plain
  // template id is "not found", before the filesystem or the registry is touched.
  if (typeof templateId !== 'string' || !TEMPLATE_ID_PATTERN.test(templateId)) return null;

  const cached = configCache.get(templateId);
  if (cached !== undefined) return cached;

  // Try the override path first — hand-tuned configs trump anything synthesised.
  // T-350: only a missing file falls through to the registry. An override that
  // is there but cannot be read or parsed is logged (id only) and thrown, so a
  // broken signed override is never silently replaced by the registry text.
  let override: TemplateConfig | null = null;
  let raw: string | null = null;
  try {
    raw = readFileSync(join(TEMPLATES_DIR, `${templateId}.json`), 'utf-8');
  } catch (err) {
    if (!isNoOverrideFile(err)) {
      logger.error({ templateId }, 'T-350: docs/templates override is unreadable');
      throw new Error(`Template engine: docs/templates override ${templateId} is unreadable`);
    }
    // No override on disk — fall through to the promoter registry.
  }
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // No parse message logged or thrown: it can echo the file's content.
      logger.error({ templateId }, 'T-350: docs/templates override is not valid JSON');
      throw new Error(`Template engine: docs/templates override ${templateId} is not valid JSON`);
    }
    // T-357 AC1: `null`, a primitive or an array is refused the same way, never
    // silently replaced by the registry config.
    if (!isPlainObject(parsed)) {
      logger.error({ templateId }, 'T-350: docs/templates override is not valid JSON');
      throw new Error(`Template engine: docs/templates override ${templateId} is not valid JSON`);
    }
    override = parsed as unknown as TemplateConfig;
  }
  if (override) {
    // T-240: the library category comes from config/catalogue, never from the
    // override file; an override with no catalogue entry is refused (throws).
    // `category` (the behaviour value) is the override's own, unchanged.
    const config: TemplateConfig = {
      ...override,
      catalogueCategory: requireCatalogueCategory(override.template_id ?? templateId),
    };
    configCache.set(templateId, config);
    return config;
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

  const toSummary = (config: TemplateConfig): TemplateSummary => {
    const catalogueCategory =
      config.catalogueCategory ?? requireCatalogueCategory(config.template_id);
    const { name, order } = catalogueCategoryDisplay(catalogueCategory);
    return {
      template_id: config.template_id,
      display_name: config.display_name,
      category: config.category,
      catalogueCategory,
      catalogueCategoryName: name,
      catalogueCategoryOrder: order,
      description: config.description,
      ...(config.match_terms ? { match_terms: config.match_terms } : {}),
      icon: config.icon,
      plan_access: config.plan_access,
      supported_languages: config.supported_languages,
      metadata: config.metadata,
    };
  };

  // 1. Overrides win. T-345: only a missing or unreadable docs/templates dir is
  // tolerated (registry-only mode). A per-file catalogue error throws.
  let overrideFiles: string[] = [];
  try {
    overrideFiles = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    // No overrides dir: registry-only mode.
  }
  for (const f of overrideFiles) {
    const id = f.replace(/\.json$/, '');
    const config = loadTemplateConfig(id);
    if (!config || config.metadata.status !== 'active') continue;
    byId.set(config.template_id, toSummary(config));
  }

  // 2. Fill in everything else from the promoter registry. T-345: no catch.
  // loadAllDocRules already tolerates a missing doc-rules dir and a bad file;
  // what it throws (a missing price or catalogue entry) must fail loudly.
  for (const config of getTemplateRegistry().configs.values()) {
    if (byId.has(config.template_id)) continue;
    if (config.metadata.status !== 'active') continue;
    byId.set(config.template_id, toSummary(config));
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
  /**
   * Keyed by matter type. T-177: family_court.json is keyed by state, then by
   * matter type, each with a `default` (see `familyCaseNomenclature`).
   */
  case_nomenclature?: Record<string, string | Record<string, string>>;
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
 * The court rule's `case_nomenclature` key for a document type, or undefined
 * (bail packs, quashing, writs; the mapping the court-rule block has used since
 * SCRUM-50).
 */
function ruleCaseNomenclatureKey(templateId: string): string | undefined {
  if (templateId.includes('anticipatory')) return 'anticipatory_bail';
  if (templateId.includes('bail')) return 'regular_bail';
  if (templateId.includes('quashing')) return 'quashing';
  if (templateId.includes('writ')) return 'civil_writ';
  return undefined;
}

/**
 * The court rule's own case line for a document type, with `{year}` not yet
 * filled in. Undefined when there is no rule, the document type has no key, or
 * the rule has no non-empty line under that key.
 */
function ruleCaseLineFor(
  rule: Pick<CourtRuleData, 'case_nomenclature'> | undefined,
  templateId: string,
  procedureCode?: ProcedureCode | null,
): string | undefined {
  const key = ruleCaseNomenclatureKey(templateId);
  // T-245a (Ajay, Addendum 1 #6): a court line that names the BNSS section
  // ("U/S 482 BNSS", allahabad_hc) is kept for a BNSS choice only. For a CrPC
  // choice or no choice, the rule's `<key>_crpc_or_no_choice` line, when it has one.
  if (templateId === 'bail_anticipatory' && procedureCode !== 'BNSS' && key) {
    const alt = rule?.case_nomenclature?.[`${key}_crpc_or_no_choice`];
    if (typeof alt === 'string' && alt.trim() !== '') return alt;
  }
  const line = key ? rule?.case_nomenclature?.[key] : undefined;
  return typeof line === 'string' && line.trim() !== '' ? line : undefined;
}

/** T-177: the family court rule's id (config/court-rules/family_court.json). */
const FAMILY_COURT_RULE_ID = 'family_court';

/**
 * T-177 (AJ-2026-10-09-T177): the case-number line printed when the family
 * court rule gives none. No family court case type is verified yet.
 */
export const FAMILY_CASE_NUMBER_PLACEHOLDER = '[To be confirmed: case type] No. _____ of {year}';

/**
 * T-177 (AJ-2026-10-09-T177): each family template's matter type, as a key of
 * family_court.json `case_nomenclature`.
 */
const FAMILY_NOMENCLATURE_KEY: ReadonlyMap<string, string> = new Map([
  ['divorce_hma', 'divorce'],
  ['divorce_mutual_consent', 'divorce_mutual_consent'],
  ['divorce_sma', 'divorce_sma'],
  ['judicial_separation', 'judicial_separation'],
  ['rcr_petition', 'restitution'],
  ['guardianship_petition', 'guardianship'],
  ['maintenance_bnss_144', 'maintenance'],
]);

/**
 * T-177 (AJ-2026-10-09-T177): the family court case-number line for a
 * template, with `{year}` not yet filled in. Null when the rule is not the
 * family court rule or the template is not a family template.
 *
 * The rule file wins; FAMILY_CASE_NUMBER_PLACEHOLDER is the fallback. The
 * state is never taken from the user's profile. Every cell is the
 * placeholder for now, so the rule's `default` state block is read and no
 * state lookup is done (the ruling defers it until a cell is verified).
 */
export function familyCaseNomenclature(
  rule: { courtId?: string; case_nomenclature?: CourtRuleData['case_nomenclature'] },
  templateId: string,
): string | null {
  if (rule.courtId !== FAMILY_COURT_RULE_ID) return null;
  const matterKey = FAMILY_NOMENCLATURE_KEY.get(templateId);
  if (!matterKey) return null;
  const block = rule.case_nomenclature?.default;
  if (block && typeof block === 'object') {
    const value = block[matterKey] ?? block.default;
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return FAMILY_CASE_NUMBER_PLACEHOLDER;
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
  courtState?: string,
): PromptPartyDesignations {
  const entries = Object.entries(
    partyDesignationFor(ruleForMatter(rule, templateId), templateId) ?? {},
  )
    .filter(
      ([k, v]) =>
        !(k === 'state' && isStateNotApplicable(v)) &&
        // T-479 (Ajay, 6a047469, point 4): a civil certiorari never takes the
        // court rule's State line ("Home Department"); its cause title prints
        // the signed State line, so the model is sent none.
        !(k === 'state' && templateId === 'certiorari'),
    )
    // T-479 (Ajay, f9415fe8, point f): writ_petition_civil's model is sent the
    // signed State line in place of the court rule's ("Home Department"). With
    // no State known to the caller, the signed no-State line.
    .map(([k, v]): [string, string] =>
      k === 'state' && templateId === 'writ_petition_civil'
        ? [k, civilWritStateParty(courtState)]
        : [k, v],
    );
  return {
    entries,
    needsToBeConfirmedRule: entries.some(([, v]) => v.startsWith('[To be confirmed:')),
  };
}

/** The AI prompt's PARTY DESIGNATIONS lines for one court rule and document type. */
export function partyDesignationsPromptLines(
  rule: CourtRuleData,
  templateId: string,
  courtState?: string,
): string {
  const { entries, needsToBeConfirmedRule } = promptPartyDesignations(rule, templateId, courtState);
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
  } else if (courtData.formattingRulesRef === 'family_court' && own && !isGenericDesignation(own)) {
    // T-176 (AJ-2026-10-08-T174, FU-1): a family court names its seat. The
    // courts-list entry's own designation ("IN THE FAMILY COURT AT TIS HAZARI,
    // DELHI") prints as stored, over the rule's bare "IN THE FAMILY COURT"
    // with the city appended. The cached rule is read, never changed.
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
 * T-410 (Ajay, T-406-T-410 ruling and Addendum 1; c894ab9): consumer_complaint
 * is filed before a Consumer Commission only.
 */
const CONSUMER_COMPLAINT_ID = 'consumer_complaint';

/** T-410: the consumer rule, for party labels, prayer and verification. */
const CONSUMER_RULE_ID = 'consumer_commission_generic';

/** T-410: printed for the court, the case line and the designation at a court that is not a Commission. */
export const CONSUMER_COMMISSION_BLANK = '[To be confirmed: Consumer Commission]';

/**
 * T-410 (Ajay 2957f50, T-404 item c): `{place}` with no Commission. Same value
 * as T-404's PLACE_BLANK; local, so the two never clash.
 */
const CONSUMER_PLACE_BLANK = '[To be confirmed: place]';

/** T-410 Addendum 1, items 2 and 3: the complaint's case line at a State Commission and at NCDRC. */
const CONSUMER_COMPLAINT_LINE = 'Consumer Complaint No. _____ of {current_year}';

/** T-410 Addendum 1: the s.35 heading prints at a District Commission only. */
const COMPLAINT_HEADING_DISTRICT =
  'CONSUMER COMPLAINT UNDER SECTION 35 OF THE CONSUMER PROTECTION ACT, 2019';

/** T-410 Addendum 1: the heading at a State or National Commission. */
const COMPLAINT_HEADING_ACT = 'CONSUMER COMPLAINT UNDER THE CONSUMER PROTECTION ACT, 2019';

/**
 * T-410: which Consumer Commission the chosen court is, or null when it is not
 * one. National is the ncdrc rule. District and State share courtType
 * `consumer_commission` and are told apart by the courts-list designation;
 * a Commission court whose designation names neither is null (never guessed).
 */
export function consumerForum(
  courtData?: CourtLookupData,
): 'district' | 'state' | 'national' | null {
  if (!courtData) return null;
  if (courtData.formattingRulesRef === 'ncdrc') return 'national';
  if (courtData.courtType !== 'consumer_commission') return null;
  const own = courtData.designation ?? '';
  if (/\bDISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION\b/i.test(own)) return 'district';
  if (/\bSTATE CONSUMER DISPUTES REDRESSAL COMMISSION\b/i.test(own)) return 'state';
  return null;
}

/**
 * T-410: the court lines of a consumer_complaint. At a court that is not a
 * Commission, the header, designation and case line are the signed blank and
 * the city line is dropped (see `sectionTemplate`), and no "State of ..."
 * respondent is set (Addendum 1, item 4). `{place}` and `{courtPlace}` are the
 * Commission's city, or CONSUMER_PLACE_BLANK. At a State Commission the
 * State Commission's own designation from the courts list prints, never the
 * District rule's, and never the list's appeal line. Values may hold
 * `{current_year}`, filled in by the recursive pass.
 */
function consumerComplaintCourt(
  courtData: CourtLookupData | undefined,
  ctx: PlaceholderContext,
): void {
  const forum = consumerForum(courtData);
  // Ajay 2957f50 (c): "Place:" and "Verified at" print the Commission's city, else the blank.
  ctx.place = (forum !== null && ctx.court_city?.trim()) || CONSUMER_PLACE_BLANK;
  ctx.courtPlace = ctx.place;
  if (forum === null) {
    ctx.court_header = CONSUMER_COMMISSION_BLANK;
    ctx.court_designation = CONSUMER_COMMISSION_BLANK;
    ctx.case_nomenclature = CONSUMER_COMMISSION_BLANK;
    ctx.complaint_heading_text = COMPLAINT_HEADING_ACT;
    delete ctx.state_respondent;
    return;
  }
  if (forum === 'state' && courtData) {
    const designation = courtData.designation.trim().replace(/^BEFORE THE\s*/i, '');
    ctx.court_designation = designation;
    ctx.court_header = `BEFORE THE ${designation}`;
  }
  if (forum !== 'district') ctx.case_nomenclature = CONSUMER_COMPLAINT_LINE;
  ctx.complaint_heading_text =
    forum === 'district' ? COMPLAINT_HEADING_DISTRICT : COMPLAINT_HEADING_ACT;
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
  /** T-245a: the procedure code from the law switch (bail_anticipatory's court line). */
  procedureCode?: ProcedureCode | null,
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
          case_nomenclature: nomenclatureAllowed(config.template_id)
            ? courtData.caseNomenclature
            : '',
          court_type: courtData.courtType ?? String(formData.court_type ?? ''),
        };
        computed[fieldId] = propMap[prop] ?? '';
      } else {
        // Fallback when no court data provided (e.g. unit tests without DB)
        // T-404 Addendum 3 #4: no court at all prints the signed blank, never a made-up court.
        const courtName = String(formData[courtsMatch[1]] ?? '');
        if (prop === 'designation') {
          computed[fieldId] = courtName || COURT_BLANK;
        } else if (prop === 'header') {
          computed[fieldId] = courtName ? `IN THE COURT OF ${courtName}` : COURT_BLANK;
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
      if (prop === 'case_nomenclature' && !nomenclatureAllowed(config.template_id)) {
        computed[fieldId] = '';
      } else if (prop === 'case_nomenclature') {
        // T-404 part 2 (Ajay, 6f567e6): the chosen court's rule line for this
        // pack, else the case-type blank. Never the courts list's court-wide
        // line ("Civil Suit No.", "O.A. No." ...) and never the pack's own
        // default. No court record (none chosen, or only a typed name) is the
        // blank too (Addendum 3 #4, 2957f50 (a)).
        // `{year}` becomes `{current_year}`, which the recursive pass fills in.
        computed[fieldId] =
          ruleCaseLineFor(courtData?.courtRule, config.template_id, procedureCode)?.replace(
            /\{year\}/g,
            '{current_year}',
          ) ?? CASE_TYPE_BLANK;
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
 * AJ-2026-10-08-T139 1(c), as amended by Ajay T-612 (6a)/(6b) for T-638: every
 * template writes its own "Police Station" or "P.S." before `{police_station}`,
 * so one trailing PS, P.S., P S, Police Station, पुलिस स्टेशन, पुलिस थाना, Thana
 * or थाना is removed here, at render only. The brief keeps the advocate's
 * words. A value that is only the station word, or one glued to the name
 * ("Chaps"), is left as it is. The full table is `policeStationName`.
 */
export function stripStationSuffix(value: string): string {
  return stripTrailingStationMarker(value);
}

// ── Placeholder Replacement ─────────────────────────────────────────────────

export interface PlaceholderContext {
  [key: string]: string;
}

/**
 * T-251: what default_bail's {governing_provision} prints while no procedure
 * code is given. T-245a: the Addendum 1 no-choice form (approved for
 * default_bail in Addendum 2 #7), the same string lawSwitch gives.
 */
export const GOVERNING_PROVISION_BLANK =
  '[To be confirmed: Section 167(2) of the CrPC or Section 187(3) of the BNSS]';

/** T-245a: the server-only context key holding the law switch's case-details lines. */
export const LAW_SWITCH_LINES_KEY = '__law_switch_lines';

/**
 * T-393 (Ajay, T-359 AC6, signed dff323f): what the relation prints when
 * neither the relation nor the name of the parent or spouse is given.
 */
export const RELATION_BLANK = '[To be confirmed: relation and name of parent or spouse]';

/** T-393 (Ajay, T-359 AC6 Addendum 2): the relation part, when only the name is given. */
export const RELATION_ONLY_BLANK = '[To be confirmed: relation]';

/** T-393 (Ajay, T-359 AC6 Addendum 2): the name part, when only the relation is given. */
export const PARENT_NAME_BLANK = '[To be confirmed: name of parent or spouse]';

/** T-404 rule 3 (Ajay, 13 Oct 2026): no advocate name from the form or the profile. */
export const ADVOCATE_NAME_BLANK = "[To be confirmed: advocate's name]";

/** T-404 rule 3, Addendum 2 #8: no advocate address in the form (the profile has none yet). */
export const ADVOCATE_ADDRESS_BLANK = "[To be confirmed: advocate's address]";

/** T-404 rule 4: what {courtHeader}, {courtDesignation} and {caseNomenclature} print with no court. */
export const COURT_BLANK = '[To be confirmed: court]';

/** The ledger path's blank for a fact it does not hold (`missingPlaceholder`). */
const LEDGER_BLANK = /^\{\{MISSING: [^}]*\}\}$/;

/**
 * T-404 rule 3: the advocate address as typed, else the signed blank. Empty,
 * whitespace only, or a blank the brief or ledger path put in for the field
 * (`[To be confirmed: …]`, `{{MISSING: …}}`) counts as not given (rule 2).
 */
function advocateAddressOrBlank(value: string | undefined): string {
  const v = value?.trim() ?? '';
  if (v === '' || /^\[To be confirmed: [^\]]*\]$/.test(v) || LEDGER_BLANK.test(v)) {
    return ADVOCATE_ADDRESS_BLANK;
  }
  return value as string;
}

/**
 * T-404 rule 4: with no court chosen, {courtHeader} and {courtDesignation}
 * print the court blank and {caseNomenclature} the case-type blank (2be946d
 * (b)), never `_____`. Only the camelCase
 * tokens: `court_designation` stays as it was, since the Drafter is told the
 * court from it. Runs after `applyPlaceholderAliases`, so a value wins.
 * T-406: a document not filed in court (`allowNomenclature` false) gets no
 * case-line blank; its {caseNomenclature} stays empty.
 */
function applyCourtBlanks(
  ctx: PlaceholderContext,
  courtData?: CourtLookupData,
  allowNomenclature = true,
): void {
  if (chosenCourtHeading(courtData)) {
    // T-404 Addendum 3 #5: a court with no case line of its own.
    if (allowNomenclature && !ctx.caseNomenclature?.trim()) {
      ctx.caseNomenclature = CASE_TYPE_BLANK;
    }
    return;
  }
  for (const alias of ['courtHeader', 'courtDesignation']) {
    if (!ctx[alias]?.trim()) ctx[alias] = COURT_BLANK;
  }
  // T-404 2be946d (b): with no court, the case line is the case-type blank in
  // every court pack; the court blank is for the court itself.
  if (allowNomenclature && !ctx.caseNomenclature?.trim()) {
    ctx.caseNomenclature = CASE_TYPE_BLANK;
  }
  // T-404 (2957f50, c): "Place:" / "Verified at" with no court and no city.
  for (const alias of ['place', 'courtPlace']) {
    if (!ctx[alias]?.trim()) ctx[alias] = PLACE_BLANK;
  }
}

/** T-404 Addendum 3 #5: {caseNomenclature} when the court chosen has no case line. */
export const CASE_TYPE_BLANK = '[To be confirmed: case type and number]';

/** T-404 (2957f50, c): {place} and the default verification's place with no court and no city. */
export const PLACE_BLANK = '[To be confirmed: place]';

/**
 * T-404 (Ajay, 49b5fd2): the place fields a not-court pack may declare for its
 * place of execution. rent_agreement and the 11 deeds (affidavit_identity,
 * gift_deed, joint_development_agreement, lease_deed, license_agreement,
 * mortgage_deed, mou, partition_deed, release_deed, sale_deed, will) declare
 * `execution_place` (T-404 part 2, Ajay 687c19f).
 */
const NOT_COURT_PLACE_FIELDS = ['execution_place'];

/**
 * T-404 (Ajay, 49b5fd2): the place a not-court document (T-406 list) prints
 * for {place} / {courtPlace} and its verification. Only a place field this
 * pack declares and the advocate filled; never a court city. Empty, or a
 * `[To be confirmed: …]` / `{{MISSING: …}}` blank, is the signed blank.
 */
function notCourtPlace(config: TemplateConfig, ctx: PlaceholderContext): string {
  const declared = declaredFieldIds(config);
  for (const field of NOT_COURT_PLACE_FIELDS) {
    if (!declared.has(field)) continue;
    const v = ctx[field]?.trim() ?? '';
    if (v !== '' && !IS_BLANK.test(v) && !LEDGER_BLANK.test(v)) return ctx[field];
  }
  return PLACE_BLANK;
}

/** T-404 Addendum 3 #2b: no enrolment number after the T-311 resolver. */
export const ENROLMENT_BLANK = "[To be confirmed: advocate's enrolment number]";

/**
 * The blanks the brief and ledger paths put in for a declared field left
 * empty: `[To be confirmed: <label, lower case>]` (intake-brief `placeholderFor`)
 * and `{{MISSING: <label>}}` (brief-drafter `missingPlaceholder`). Kept in step
 * with those two by hand; importing them here would be circular.
 */
function labelBlanksFor(config: TemplateConfig, fieldId: string): Set<string> {
  const field = (config.form_schema?.steps ?? [])
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.field_id === fieldId);
  if (!field?.label) return new Set();
  const flat = field.label.replace(/\s+/g, ' ').trim();
  return new Set([
    `[To be confirmed: ${blankWords(flat)}]`,
    `{{MISSING: ${flat.replace(/[{}]/g, '') || 'detail'}}}`,
  ]);
}

/** Lower case, except for words written in capitals such as FIR (intake-brief `blankLabel`). */
function blankWords(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (/^[A-Z0-9./-]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

/** The kind of date of each fact name (config/intake/date-meanings.json), read as intake-brief reads it. */
const DATE_KIND_LABEL_OF_FIELD = new Map<string, { id: string; label: string }>();
for (const kind of dateMeanings.kinds as Array<{ id: string; label: string; facts: string[] }>) {
  for (const fact of kind.facts) DATE_KIND_LABEL_OF_FIELD.set(fact, kind);
}

/**
 * T-440 (Ajay, a9bc957, Q2): the blank of a declared date field,
 * `[To be confirmed: <what it is the date of, lower case>]`. The date-meaning
 * label wins, as on the brief (intake-brief `dateMeaningOf`): the kind's label
 * when this form declares no other date of that kind, else the form label.
 */
export function dateBlankFor(config: TemplateConfig, fieldId: string): string {
  const fields = (config.form_schema?.steps ?? []).flatMap((s) => s.fields ?? []);
  const field = fields.find((f) => f.field_id === fieldId);
  const kind = DATE_KIND_LABEL_OF_FIELD.get(fieldId);
  const sameKind = kind
    ? fields.filter((f) => f.type === 'date' && DATE_KIND_LABEL_OF_FIELD.get(f.field_id) === kind)
        .length
    : 0;
  const meaning = kind && sameKind <= 1 ? kind.label : (field?.label ?? fieldId.replace(/_/g, ' '));
  return `[To be confirmed: ${blankWords(meaning)}]`;
}

/**
 * T-440: the server-only context key holding the blanks of the dates answered
 * "Not known" (`extra.notKnownDates`), as JSON. `buildAIUserPrompt` lists them.
 */
export const NOT_KNOWN_DATES_KEY = '__not_known_dates';

/** The field ids a section of this template prints or gives the model as `{field}`. */
function fieldsTheTemplatePrints(config: TemplateConfig): Set<string> {
  const ids = new Set<string>();
  for (const section of config.document_structure?.sections ?? []) {
    for (const text of [section.template, section.prompt_context]) {
      for (const m of (text ?? '').matchAll(/\{(\w+)\}/g)) ids.add(m[1]);
    }
  }
  return ids;
}

/** T-393: the relations Ajay allows (AC6 Addendum 3), as they print. */
export type PartyRelation = 'S/o' | 'D/o' | 'W/o' | 'H/o';

/**
 * T-393: the context keys the applicant's relation may be given under. Nothing
 * asks for it yet (Ajay's question comes later, in the rule files).
 */
export const RELATION_SOURCES = ['applicant_relation', 'relation_type', 'relation'];

/**
 * T-393: the context keys the name of the applicant's (or, in
 * suspension_of_sentence, the appellant's) parent or spouse may be given under.
 */
export const PARENT_NAME_SOURCES = [
  'father_name',
  'applicant_parentage',
  'applicant_father_name',
  'appellant_parentage',
  'parentName',
];

const RELATION_WORDS: Record<string, PartyRelation> = {
  so: 'S/o',
  sonof: 'S/o',
  sonofso: 'S/o',
  do: 'D/o',
  daughterof: 'D/o',
  daughterofdo: 'D/o',
  wo: 'W/o',
  wifeof: 'W/o',
  wifeofwo: 'W/o',
  ho: 'H/o',
  husbandof: 'H/o',
  husbandofho: 'H/o',
};

/**
 * T-393: the relation as given, normalised to `S/o`, `D/o`, `W/o` or `H/o`
 * ("s/o", "Son of", "Son of (S/o)" and "son_of" are all `S/o`). Anything else,
 * including a blank, is not a relation and gives undefined. The relation is
 * never inferred from the applicant's sex or from anything else.
 */
export function normaliseRelation(value: unknown): PartyRelation | undefined {
  if (typeof value !== 'string') return undefined;
  return RELATION_WORDS[value.toLowerCase().replace(/[^a-z]/g, '')];
}

/** T-393: true for a name that is given (not empty, not a `[To be confirmed: …]` blank). */
function isGivenName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !IS_BLANK.test(value.trim());
}

/**
 * T-393 (Ajay, T-359 AC6 and its Addendum): what prints for the relation and
 * the name of the parent or spouse. Never a default `S/o`.
 * - both given: `S/o Suresh Kumar`
 * - name only: `[To be confirmed: relation] Suresh Kumar`
 * - relation only: `S/o [To be confirmed: name of parent or spouse]`
 * - neither: `[To be confirmed: relation and name of parent or spouse]`
 */
export function relationLine(relation: unknown, parentName: unknown): string {
  const rel = normaliseRelation(relation);
  const name = isGivenName(parentName) ? parentName.trim() : undefined;
  if (rel && name) return `${rel} ${name}`;
  if (name) return `${RELATION_ONLY_BLANK} ${name}`;
  if (rel) return `${rel} ${PARENT_NAME_BLANK}`;
  return RELATION_BLANK;
}

/** T-393: `relationLine` from a context, each part from the first source that has it. */
export function relationLineFor(ctx: Record<string, unknown>): string {
  const relKey = RELATION_SOURCES.find((k) => normaliseRelation(ctx[k]) !== undefined);
  const nameKey = PARENT_NAME_SOURCES.find((k) => isGivenName(ctx[k]));
  return relationLine(relKey && ctx[relKey], nameKey && ctx[nameKey]);
}

/** The `source` of a form field (e.g. 'bns_mapping'), if the template defines one. */
export function fieldSourceOf(config: TemplateConfig | null, fieldId: string): string | undefined {
  for (const step of config?.form_schema?.steps ?? []) {
    const field = step.fields.find((f) => f.field_id === fieldId);
    if (field) return field.source;
  }
  return undefined;
}

/**
 * ctx key holding sections_charged as read BEFORE the array is joined (Arjun,
 * correction to step 7): JSON of readChargedField's { code, number } entries.
 */
export const SECTIONS_CHARGED_READ_KEY = '__sections_charged_read';

// ── Draft dates (T-340, Ajay's T-192 ruling) ────────────────────────────────

/**
 * English month names, explicit so the output never depends on locale/ICU.
 * Also read by ai.service's fact-alteration check (T-340).
 */
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * T-340: a draft date as "D Month YYYY" (no leading zero, full English month),
 * e.g. "4 April 2026". Reads the date's local day, month and year, as
 * `toLocaleDateString` did before.
 */
export function formatDraftDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * T-340: an ISO "YYYY-MM-DD" string as "D Month YYYY". Returns null when the
 * string is not ISO or not a real calendar date (e.g. 2026-02-30), so the
 * caller leaves it unchanged.
 */
export function formatIsoDraftDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return null;
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * T-300 list A (Arjun, 12 Oct 2026): context keys the server sets and no client
 * value may set, even if a template declares the field. Also never client-set:
 * every `__*` key, every `party_label_*` key and the camelCase aliases in
 * `PLACEHOLDER_ALIASES` (see `isServerOnlyKey`).
 */
const SERVER_ONLY_KEYS: ReadonlySet<string> = new Set([
  'current_date',
  'current_year',
  'enrollment_number',
  'governing_provision',
  // T-245a: the law switch's values, set by the server only.
  'GOVERNING_PROVISION',
  'women_proviso',
  'notice_provision',
  'do_not_cite',
  'custody_clause',
  'state_respondent',
  'case_nomenclature',
  'prayer_opening',
  'prayer_closing',
  'verification_text',
  'body_para_count',
  'lastParagraph',
]);

/**
 * T-300 list B: set by the server unless THIS template's form declares the
 * field, in which case the value is what the user typed. Every computed-field
 * id of the template is in this list too (see `clientFormData`).
 */
const SERVER_UNLESS_DECLARED_KEYS: readonly string[] = [
  'advocate_name',
  'court_designation',
  'court_header',
  'court_city',
  'jail',
];

/** T-300 list A: true for a key no client value may set. */
function isServerOnlyKey(key: string): boolean {
  return (
    key.startsWith('__') ||
    key.startsWith('party_label_') ||
    SERVER_ONLY_KEYS.has(key) ||
    PLACEHOLDER_ALIASES.some(([alias]) => alias === key)
  );
}

/** The field ids this template's form declares (`form_schema.steps[].fields[].field_id`). */
export function declaredFieldIds(config: TemplateConfig | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const step of config?.form_schema?.steps ?? []) {
    for (const field of step.fields ?? []) ids.add(field.field_id);
  }
  return ids;
}

/** T-340: the field ids this template's form declares with `type: "date"`. */
function declaredDateFieldIds(config: TemplateConfig | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const step of config?.form_schema?.steps ?? []) {
    for (const field of step.fields ?? []) if (field.type === 'date') ids.add(field.field_id);
  }
  return ids;
}

/**
 * T-300: the client's formData without the keys it may not set (lists A and
 * B), and the names of the keys dropped. A key whose value is null or
 * undefined never reaches the context, so it is left out and not counted.
 */
export function clientFormData(
  config: TemplateConfig,
  formData: Record<string, unknown>,
): { kept: Record<string, unknown>; dropped: string[] } {
  const declared = declaredFieldIds(config);
  const serverUnlessDeclared = new Set([
    ...SERVER_UNLESS_DECLARED_KEYS,
    ...Object.keys(config.computed_fields ?? {}),
  ]);
  // A jail alias (JAIL_SOURCES) feeds {jail} and custody_clause, so it is list B
  // too: kept only where this template declares `jail` or the alias itself.
  if (!declared.has('jail')) for (const alias of JAIL_SOURCES) serverUnlessDeclared.add(alias);
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, val] of Object.entries(formData)) {
    if (val === null || val === undefined) continue;
    if (isServerOnlyKey(key) || (serverUnlessDeclared.has(key) && !declared.has(key))) {
      dropped.push(key);
      continue;
    }
    kept[key] = val;
  }
  return { kept, dropped };
}

/**
 * T-311: a resolved advocate name and whether it is the profile's name. Only
 * a name from the profile may be paired with the profile's enrolment number.
 */
export interface ResolvedAdvocate {
  name: string | undefined;
  fromProfile: boolean;
}

/**
 * T-300 (Ajay, 12 Oct 2026): the advocate name the draft and the annexures
 * print. A value typed in a field this template declares wins when it is not
 * empty (missing, null or whitespace only); otherwise the profile name.
 * `name` is undefined when neither is there, so each caller keeps its own blank.
 */
export function resolveAdvocate(
  formData: Record<string, unknown>,
  profile: { name?: string | null },
  config: TemplateConfig | null | undefined,
): ResolvedAdvocate {
  const declared = declaredFieldIds(config).has('advocate_name');
  return typedOrProfile(declared ? formData.advocate_name : undefined, profile.name);
}

/** The name `resolveAdvocate` returns. */
export function resolveAdvocateName(
  formData: Record<string, unknown>,
  profile: { name?: string | null },
  config: TemplateConfig | null | undefined,
): string | undefined {
  return resolveAdvocate(formData, profile, config).name;
}

/**
 * T-300 (Arjun): the legacy /generate body's `advocateName` is the typed name
 * only if, after trim, it is 1 to 100 characters with no `{`, `}` or line
 * break; otherwise the profile name. A failing value never refuses a request.
 */
export function resolveLegacyAdvocate(
  bodyName: string | undefined,
  profile: { name?: string | null },
): ResolvedAdvocate {
  const typed = bodyName?.trim() ?? '';
  const ok = typed.length >= 1 && typed.length <= 100 && !/[{}\r\n\u2028\u2029]/.test(typed);
  return typedOrProfile(ok ? typed : undefined, profile.name);
}

/** The name `resolveLegacyAdvocate` returns. */
export function resolveLegacyAdvocateName(
  bodyName: string | undefined,
  profile: { name?: string | null },
): string | undefined {
  return resolveLegacyAdvocate(bodyName, profile).name;
}

/**
 * T-311 (Ajay, 12 Oct 2026): the enrolment number a document prints.
 * - A typed value always prints (the advocate on the document may not be the
 *   account holder), a "[To be confirmed: …]" placeholder included.
 * - Otherwise the profile number, only when the field is truly empty (missing,
 *   null or whitespace only) AND the advocate name the same document prints
 *   came from the profile. A typed name is another advocate: no profile number
 *   is paired with it.
 * - Otherwise undefined, so each caller keeps its own blank.
 */
export function resolveEnrollmentNumber(
  typed: unknown,
  profileNumber: string | null | undefined,
  nameFromProfile: boolean,
): string | undefined {
  return typedOrProfile(typed, nameFromProfile ? profileNumber : undefined).name;
}

/**
 * The typed value when it is not empty (a "[To be confirmed: …]" blank counts
 * as typed and stays, AJ 12 Oct 2026), else the profile value, with which of
 * the two it was. `fromProfile` is false when neither is there.
 */
function typedOrProfile(typed: unknown, profileValue: string | null | undefined): ResolvedAdvocate {
  if (typeof typed === 'string' || typeof typed === 'number') {
    const value = String(typed);
    if (value.trim() !== '') return { name: value, fromProfile: false };
  }
  return profileValue?.trim()
    ? { name: profileValue, fromProfile: true }
    : { name: undefined, fromProfile: false };
}

/**
 * Build the full placeholder context from form data + computed fields + system values.
 *
 * T-300: the formData keys a client may not set are dropped before anything
 * reads them (see `clientFormData`); one warn per request names them, never
 * their values. `extra.governingProvision` is the server's own
 * `{governing_provision}` (T-245a will compute it). `extra.enrollmentNumber`
 * is the profile's number, used only when no number was typed and the name is
 * the profile's (T-311).
 * T-440: `extra.notKnownDates` are the declared date fields the advocate
 * answered "Not known" (a brief's `asked_empty` dates, `notKnownDateKeys`).
 * Their blanks go to the model's prompt (`buildAIUserPrompt`); a date that is
 * merely empty gets no such note (Ajay, a9bc957, Q4).
 */
export function buildPlaceholderContext(
  config: TemplateConfig,
  rawFormData: Record<string, unknown>,
  extra?: {
    advocateName?: string;
    enrollmentNumber?: string;
    governingProvision?: string;
    notKnownDates?: readonly string[];
    /**
     * T-245a: the law switch for this case, worked out by the caller from
     * values it can read for certain (ledger ISO dates). Absent: worked out
     * here from the form data and the court type, for the six bail packs only.
     */
    lawSwitch?: LawSwitchResult | null;
  },
  courtData?: CourtLookupData,
): PlaceholderContext {
  const { kept: formData, dropped } = clientFormData(config, rawFormData);
  if (dropped.length > 0) {
    logger.warn(
      { templateId: config.template_id, droppedKeys: dropped },
      'T-300: client formData keys the server sets were dropped',
    );
  }

  // T-245a: the six bail packs' law switch (procedure by FIR date or choice,
  // offence law by offence date). Never for any other template.
  const law: LawSwitchResult | null = isLawSwitchPack(config.template_id)
    ? (extra?.lawSwitch ??
      lawSwitch(
        lawSwitchInputFromCase(
          config.template_id,
          formData,
          courtData?.courtType ?? formData.court_type,
        ),
      ))
    : null;

  const computed = resolveComputedFields(config, formData, courtData, law?.procedureCode ?? null);

  const advocate = resolveAdvocate(formData, { name: extra?.advocateName }, config);
  const declaresEnrollment = declaredFieldIds(config).has('advocate_enrollment');
  const enrollment = resolveEnrollmentNumber(
    declaresEnrollment ? formData.advocate_enrollment : undefined,
    extra?.enrollmentNumber,
    advocate.fromProfile,
  );
  // T-404 Addendum 3 #2b: after the resolver, nothing (or the brief or ledger
  // blank for the field) prints Ajay's signed blank.
  const enrollmentOrBlank =
    enrollment === undefined || labelBlanksFor(config, 'advocate_enrollment').has(enrollment.trim())
      ? ENROLMENT_BLANK
      : enrollment;

  const now = new Date();
  const ctx: PlaceholderContext = {
    // System values
    // T-340: "4 April 2026" (Ajay, T-192). Same "today" and time zone as before.
    current_date: formatDraftDate(now),
    current_year: String(now.getFullYear()),

    // Advocate details: the declared, typed name, else the user profile (T-300)
    // T-404 rule 3: with neither, Ajay's signed blank.
    advocate_name: advocate.name ?? ADVOCATE_NAME_BLANK,
    // T-311: the declared, typed advocate_enrollment, else the profile number
    // when the name is the profile's (extra.enrollmentNumber). A client
    // `enrollment_number` is list A (T-300).
    enrollment_number: enrollmentOrBlank,

    // Computed fields
    ...computed,
  };

  // Arjun (step 7 correction): read sections_charged per entry, with the picker's
  // BNS default, before the array is flattened to "303, 351" below.
  // T-293: this key is server-only. Clear anything already there so a missing
  // server read means "no pre-read", never a value from elsewhere.
  delete ctx[SECTIONS_CHARGED_READ_KEY];
  if (formData.sections_charged !== null && formData.sections_charged !== undefined) {
    ctx[SECTIONS_CHARGED_READ_KEY] = JSON.stringify(
      readChargedField(formData.sections_charged, fieldSourceOf(config, 'sections_charged')),
    );
  }

  // Form data — flatten all values to strings
  for (const [key, val] of Object.entries(formData)) {
    if (val === null || val === undefined) continue;
    // T-293: a client-sent value must never overwrite the server's pre-read.
    if (key === SECTIONS_CHARGED_READ_KEY) continue;
    // T-300: advocate_name is set above, by resolveAdvocateName.
    if (key === 'advocate_name') continue;

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

  // T-440 (Ajay, 49a8eaa; a9bc957, Q4): a declared date left empty, that a
  // section prints (or gives the model) as {field} whatever its value, prints
  // its label blank, never nothing and never "_____". A line printed only when
  // the date is given is a computed field, worked out above from the form
  // values, so it stays omitted. A field the form hides (show_if) is left out.
  const printed = fieldsTheTemplatePrints(config);
  const notKnownBlanks: string[] = [];
  const notKnown = new Set(extra?.notKnownDates ?? []);
  for (const field of (config.form_schema?.steps ?? []).flatMap((s) => s.fields ?? [])) {
    if (field.type !== 'date' || field.field_id === 'verification_date') continue;
    const id = field.field_id;
    // A date typed as "Not known" (Ajay, a9bc957, Q1) is not known too.
    const typedNotKnown = /^not known$/i.test((ctx[id] ?? '').trim());
    const empty = (ctx[id] ?? '').trim() === '' || typedNotKnown;
    const condition = field.show_if ?? field.depends_on;
    const shown = !condition || evaluateShowIf(condition, formData);
    if (empty && shown && printed.has(id)) ctx[id] = dateBlankFor(config, id);
    if (notKnown.has(id) || typedNotKnown) {
      const v = (ctx[id] ?? '').trim();
      notKnownBlanks.push(IS_BLANK.test(v) || LEDGER_BLANK.test(v) ? v : dateBlankFor(config, id));
    }
  }
  if (notKnownBlanks.length > 0) ctx[NOT_KNOWN_DATES_KEY] = JSON.stringify(notKnownBlanks);

  // T-311: a template that declares advocate_enrollment prints
  // {advocate_enrollment} itself (legal_notice_s138, _s80). Same number as
  // {enrollment_number}; with none, the signed blank (T-404 Addendum 3 #2b).
  if (declaresEnrollment) ctx.advocate_enrollment = enrollmentOrBlank;

  // T-404 rule 3, Addendum 2 #8: the form answer, else the signed blank.
  ctx.advocate_address = advocateAddressOrBlank(ctx.advocate_address);

  // T-404 (Ajay, 49b5fd2): a not-court document's place never comes from a
  // court city. Set before the aliases, so they leave it alone.
  const notCourtPlaceValue = nomenclatureAllowed(config.template_id)
    ? undefined
    : notCourtPlace(config, ctx);
  if (notCourtPlaceValue !== undefined) {
    ctx.place = notCourtPlaceValue;
    ctx.courtPlace = notCourtPlaceValue;
  }

  // T-488 (from T-479): any pack with a state_of_filing field (certiorari,
  // quo_warranto, interim_application) gets it copied to {state} when no
  // `state` answer is given. quo_warranto and interim_application have no
  // {state} in their cause title and are not in STATE_FROM_COURT_PACKS.
  const stateOfFiling =
    isUnanswered(ctx.state) && !isUnanswered(ctx.state_of_filing) ? ctx.state_of_filing : undefined;
  if (stateOfFiling !== undefined) ctx.state = stateOfFiling;

  // SCRUM-54 B2: Capitalise state name (form sends lowercase stateId like "bihar")
  if (ctx.state) {
    ctx.state = ctx.state
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  const answeredState = stateOfFiling !== undefined ? ctx.state : undefined;
  applyStateFromCourt(config.template_id, ctx, courtData);
  // T-488: applyStateFromCourt takes out a {state} that is only the court
  // picker's State; the State the user answered is not that, so it stays.
  if (answeredState !== undefined && isUnanswered(ctx.state)) ctx.state = answeredState;

  // SCRUM-54 B5, T-340: an ISO date in any "*date*" key, or in any field the
  // template declares as type "date" (e.g. minor_dob, custody_since), prints as
  // "D Month YYYY" (Ajay, T-192). Not a real calendar date: left unchanged.
  const dateFields = declaredDateFieldIds(config);
  for (const key of Object.keys(ctx)) {
    if (!key.includes('date') && !dateFields.has(key)) continue;
    const formatted = formatIsoDraftDate(ctx[key]);
    if (formatted !== null) ctx[key] = formatted;
  }

  applyCourtAndAliases(ctx, computed, courtData, nomenclatureAllowed(config.template_id));

  // T-410 (Addendum 1, item 4): a consumer_complaint at a court that is not a
  // Commission takes the consumer rule, never the court's.
  const isConsumerComplaint = config.template_id === CONSUMER_COMPLAINT_ID;
  const consumerNotCommission = isConsumerComplaint && consumerForum(courtData) === null;
  const courtRule = consumerNotCommission
    ? (loadCourtRule(CONSUMER_RULE_ID) ?? undefined)
    : courtData?.courtRule;

  // T-431: on SIDED_PACKS the verification reads the T-424 resolver's
  // deponent_name / client_side (set by ai.service.ts), never applicant_name.
  // The designation is the party label of the client's own side; no resolved
  // side prints the blank, never a guessed side.
  const sidedPack = Object.prototype.hasOwnProperty.call(SIDED_PACKS, config.template_id);
  const sidedDeponentLabel = (c: PlaceholderContext): string =>
    c.client_side === 'respondent'
      ? (c.party_label_respondent ?? 'Respondent')
      : c.client_side === 'petitioner'
        ? (c.party_label_petitioner ?? 'Petitioner')
        : '_____';

  // ── SCRUM-50: Inject court-rule-driven placeholders ───────────────────────
  if (courtData && courtRule) {
    // T-158: labels and verification follow the document's matter type.
    const rule = ruleForMatter(courtRule, config.template_id);

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
    // T-177 (AJ-2026-10-09-T177): a family template in a family court takes
    // the family court rule's line, or the placeholder; never the list entry's.
    // T-406: none on a document that is not filed in court.
    const familyLine = familyCaseNomenclature(rule, config.template_id);
    if (!nomenclatureAllowed(config.template_id)) {
      // no case nomenclature
    } else if (familyLine !== null) {
      ctx.case_nomenclature = familyLine.replace(/\{year\}/g, ctx.current_year);
    } else {
      const nomen = ruleCaseLineFor(rule, config.template_id, law?.procedureCode ?? null);
      if (nomen !== undefined) {
        ctx.case_nomenclature = nomen.replace(/\{year\}/g, ctx.current_year);
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
      // T-431: a sided pack's deponent is the resolved client, under its own side's label.
      ctx.verification_text = rule.verification_format
        .replace(
          /\{deponent_name\}/g,
          (sidedPack ? ctx.deponent_name : ctx.applicant_name) ?? '_____',
        )
        .replace(
          /\{designation\}/g,
          `the ${sidedPack ? sidedDeponentLabel(ctx) : (ctx.party_label_petitioner ?? 'Petitioner')} herein above named`,
        )
        // T-404 (49b5fd2): a not-court document takes its own place, never the court's.
        // T-410 (Ajay 2957f50, c): no Commission, no city in "Verified at".
        .replace(
          /\{place\}/g,
          notCourtPlaceValue ??
            (consumerNotCommission ? CONSUMER_PLACE_BLANK : (ctx.court_city ?? courtData.city)),
        )
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
    // T-404 (2957f50, c): no court and no city prints the place blank.
    // T-404 (49b5fd2): a not-court document takes its own place, never the court's.
    const verifiedAt =
      notCourtPlaceValue ??
      (!chosenCourtHeading(courtData) && !ctx.court_city?.trim()
        ? PLACE_BLANK
        : (ctx.court_city ?? '_____'));
    ctx.verification_text = `I, ${(sidedPack ? ctx.deponent_name : ctx.applicant_name) ?? '_____'}, the ${sidedPack ? sidedDeponentLabel(ctx) : ctx.party_label_petitioner} herein above named, do hereby verify that the contents of paragraphs 1 to {body_para_count} of the above application are true and correct to the best of my knowledge and belief, and nothing material has been concealed therefrom.\n\nVerified at ${verifiedAt} on this _____ day of _________, ${ctx.current_year}.`;
  }

  // T-410: after the court-rule block, the computed fields and the defaults,
  // before the aliases.
  if (isConsumerComplaint) consumerComplaintCourt(courtData, ctx);

  // T-251 (Ajay's interim rule, 12 Oct 2026): until T-245a supplies the
  // provision, {governing_provision} prints the both-forms blank. The server's
  // value (extra.governingProvision, T-300) wins; a client value never reaches
  // here. The pair is default_bail's own, so only that pack gets it; other
  // packs will carry their own pair.
  // T-245a: the six bail packs take the law switch's value (its no-choice
  // blank included, which for default_bail is GOVERNING_PROVISION_BLANK).
  for (const key of ['GOVERNING_PROVISION', 'women_proviso', 'notice_provision', 'do_not_cite']) {
    delete ctx[key];
  }
  delete ctx[LAW_SWITCH_LINES_KEY];
  if (extra?.governingProvision?.trim()) {
    ctx.governing_provision = extra.governingProvision;
  } else if (law !== null) {
    ctx.governing_provision = law.governingProvision;
  } else if (config.template_id === 'default_bail') {
    ctx.governing_provision = GOVERNING_PROVISION_BLANK;
  }
  if (law !== null) {
    // Addendum 1: in an all-caps heading it is upper-cased as a whole.
    ctx.GOVERNING_PROVISION = (ctx.governing_provision ?? law.governingProvision).toUpperCase();
    ctx.notice_provision = law.noticeProvision;
    if (law.womenProviso !== null) ctx.women_proviso = law.womenProviso;
    if (law.doNotCite !== null) ctx.do_not_cite = law.doNotCite;
    if (law.lines.length > 0) ctx[LAW_SWITCH_LINES_KEY] = law.lines.join('\n');
  }

  // T-393 (Ajay, T-359 AC6): {parent_relation} / {parentRelation} is the
  // relation and the name of the parent or spouse, or the signed blanks. Always
  // the server's value; never a default `S/o`.
  ctx.parent_relation = relationLineFor(ctx);

  // T-146: aliases are set after the SCRUM-50 court-rule block, so an alias
  // such as {caseNomenclature} reads the same value as {case_nomenclature}.
  applyPlaceholderAliases(ctx);
  applyCourtBlanks(ctx, courtData, nomenclatureAllowed(config.template_id));
  applyCauseTitlePartyBlanks(config.template_id, ctx, courtData);

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

  // SCRUM-63 (A8), as amended by T-638 (Ajay T-612 (6a)/(6b), amending T-139 C2):
  // the template writes its own "Police Station", so the value loses its station
  // markers by the same table as the ledger and the D1 renderer, applied once per
  // stage (store, then render). A leading bare "Thana X" / "थाना X" is part of the
  // name and stays; पुलिस स्टेशन and पुलिस थाना always go.
  if (ctx.police_station) {
    ctx.police_station = policeStationName(ctx.police_station);
  }

  // T-479: set after the recursive pass, so the format's tokens are filled
  // only by renderTemplateSection, never from text a user typed.
  applySupremeCourtCauseTitle(config, ctx, courtData);

  return ctx;
}

/**
 * T-146: the camelCase tokens the document rules use, and the context key each
 * one reads. An alias is set only when it is not already in the context. A
 * client value under a camelCase name is dropped before the flatten (T-300).
 */
export const PLACEHOLDER_ALIASES: ReadonlyArray<
  readonly [alias: string, sources: readonly string[]]
> = [
  ['courtDesignation', ['court_designation']],
  ['courtHeader', ['court_header']],
  ['courtPlace', ['court_city']],
  ['place', ['court_city']],
  ['caseNomenclature', ['case_nomenclature']],
  ['applicant', ['applicant_name']],
  // T-395: suspension_of_sentence's verification and cause title name the appellant.
  ['appellant', ['appellant_name']],
  // T-479 (T-404, Ajay): the cause-title party tokens read the form's name
  // fields. `respondents_list` is never an alias: it is a field the advocate
  // types, and an alias name is a key no client value may set (T-300).
  ['petitioner', ['petitioner_name']],
  ['respondent', ['respondent_name']],
  ['complainant', ['complainant_name']],
  // T-644: the civil packs' cause titles print {plaintiff} and {defendant}.
  ['plaintiff', ['plaintiff_name']],
  ['defendant', ['defendant_name']],
  ['parentName', ['applicant_parentage', 'applicant_father_name']],
  ['parentRelation', ['parent_relation']],
  ['age', ['applicant_age', 'appellant_age']],
  ['applicantAddress', ['applicant_address']],
  ['respondentAddress', ['respondent_address']],
  ['advocateName', ['advocate_name']],
  ['advocateAddress', ['advocate_address']],
];

/** T-479 (Ajay, 16 Oct 2026; T-404 Addendum 2 #2): unanswered respondents in habeas and PIL. */
export const RESPONDENTS_LIST_BLANK = '[To be confirmed: respondents, with names and addresses]';
/** T-479 (Ajay, 16 Oct 2026): quashing_528_bnss Respondent No. 1 left empty. */
export const PROSECUTING_AGENCY_BLANK = '[To be confirmed: prosecuting agency]';
/** T-479 (Ajay, 16 Oct 2026): mandamus's writ_civil title lines with no form field. */
export const STATUTE_INVOKED_BLANK = '[To be confirmed: statute or rule imposing the duty]';
export const GRIEVANCE_SUMMARY_BLANK = '[To be confirmed: grievance in brief]';
/** T-479 (Ajay, 6a047469, point 3): certiorari's statute line with no form field. */
export const CERTIORARI_STATUTE_BLANK =
  '[To be confirmed: statute or rule under which the impugned order was passed]';
/** T-479 (Ajay, 6a047469, point 4): the State as respondent to an administrative order. */
const CERTIORARI_STATE_LINE =
  'State of {state} through [To be confirmed: Secretary of the concerned department], Government of {state}';
/** T-479 (Ajay, 6a047469, point 5): the same with no State known. Never "Through Public Prosecutor". */
export const CERTIORARI_NO_STATE_LINE =
  'State of [To be confirmed: State] through [To be confirmed: Secretary of the concerned department]';
/** T-479 (Ajay, f9415fe8, point d): the State party of a civil writ in Delhi. Never "State of Delhi". */
export const CIVIL_WRIT_DELHI_STATE_LINE =
  'Government of NCT of Delhi through [To be confirmed: Secretary of the concerned department]';
/** T-488 / T-479 (Ajay, ca12ec2e; f9415fe8 point d): the State party in any other Union Territory. */
export const UT_PARTY_BLANK = '[To be confirmed: name of the State or Union Territory as party]';
/** T-479 (Ajay, 7c279a77, point 3): an empty respondent_authority (mandamus, certiorari). */
export const AUTHORITY_BLANK =
  '[To be confirmed: authority against whom the writ is sought, with designation and address]';
/** T-488 / T-479 (Ajay, ca12ec2e): the State party of a criminal pack in Delhi (NCT). */
export const CRIMINAL_DELHI_STATE_PARTY = 'State (Govt. of NCT of Delhi)';

/**
 * T-479 (Ajay, 6a047469 points 4-5, f9415fe8 point d): the State as a party
 * to a civil writ against an administrative order, from the court's State.
 * Never the court rule's line ("Home Department") or "Through Public Prosecutor".
 */
export function civilWritStateParty(state: string | undefined): string {
  const s = state?.trim() ?? '';
  if (isUnanswered(s) || s.toLowerCase() === 'india') return CERTIORARI_NO_STATE_LINE;
  if (isDelhi(s)) return CIVIL_WRIT_DELHI_STATE_LINE;
  if (isUnionTerritory(s)) return UT_PARTY_BLANK;
  return CERTIORARI_STATE_LINE.replace(/\{state\}/g, () => s);
}

/**
 * T-479: the cause-title party fallbacks, per pack and per token, so no other
 * pack's output changes. A token with no value, or holding a blank the brief
 * or ledger path put in (`[To be confirmed: …]` label-derived, `{{MISSING: …}}`),
 * prints Ajay's signed blank, never the label-derived text.
 */
const CAUSE_TITLE_PARTY_BLANKS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> =
  {
    habeas_corpus: [['respondents_list', RESPONDENTS_LIST_BLANK]],
    pil: [['respondents_list', RESPONDENTS_LIST_BLANK]],
    quashing_528_bnss: [['prosecuting_agency', PROSECUTING_AGENCY_BLANK]],
    mandamus: [
      ['statute_invoked', STATUTE_INVOKED_BLANK],
      ['grievance_summary', GRIEVANCE_SUMMARY_BLANK],
    ],
    certiorari: [
      ['statute_invoked', CERTIORARI_STATUTE_BLANK],
      ['grievance_summary', GRIEVANCE_SUMMARY_BLANK],
    ],
    temporary_injunction_o39: [['suit_number', 'Suit No. _____ of {current_year}']],
  };

/** True for a value that is empty or a `[To be confirmed: …]` / `{{MISSING: …}}` blank. */
function isUnanswered(value: string | undefined): boolean {
  const v = value?.trim() ?? '';
  return v === '' || IS_BLANK.test(v) || LEDGER_BLANK.test(v);
}

/**
 * T-404 Addendum 2 #6: one respondent per line, in the order given, numbered
 * `1.`, `2.`, … Lines with no text are left out. Ajay (T-479): each line is
 * trimmed, then only a leading `n.` or `n)` is removed; the rest of the line is
 * kept as typed (one space is put after our number only if the line has none).
 */
export function numberRespondents(list: string, start = 1): string {
  return (
    list
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      // A marker is `n.` / `n)` followed by a space or the line end, so a
      // decimal such as "2.5 Acres" is text, not numbering.
      .map((line) => line.replace(/^\d+[.)](?=\s|$)/, ''))
      .map((line, i) => `${i + start}.${/^\s/.test(line) ? '' : ' '}${line}`)
      .join('\n')
  );
}

/** An option answer as its id: lower case, words joined by `_` (as the promoter makes ids). */
function optionId(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** True when the chosen court is the Supreme Court (courts list, court picker, or the pack's `court` answer). */
function atSupremeCourt(ctx: PlaceholderContext, courtData?: CourtLookupData): boolean {
  return (
    courtData?.courtType === 'supreme_court' ||
    optionId(ctx.court_type) === 'supreme_court' ||
    optionId(ctx.court) === 'supreme_court'
  );
}

type CertiorariRoute =
  | 'article_227'
  | 'article_227_no_high_court'
  | 'article_226_and_227'
  | 'article_226_and_227_no_high_court'
  | 'supreme_court'
  | 'high_court';

/**
 * T-479 (Ajay, 6a047469; f9415fe8 points a-b): which certiorari title prints.
 * The Article 227 choice (a judicial order of a civil court) is High Court
 * only: with a Supreme Court court it prints the High Court blank heading,
 * never "AT New Delhi" or a Supreme Court heading. "226 and 227" keeps the
 * Article 226 title with its own matter line. Otherwise Article 32, or a
 * Supreme Court court, takes the Supreme Court title; everything else the
 * High Court one.
 */
function certiorariRoute(ctx: PlaceholderContext, courtData?: CourtLookupData): CertiorariRoute {
  const article = optionId(ctx.article_invoked);
  if (article === 'article_227_judicial_order_of_a_civil_court') {
    return atSupremeCourt(ctx, courtData) ? 'article_227_no_high_court' : 'article_227';
  }
  // Ajay 00568779: "226 and 227" with a Supreme Court court is treated like (b), never Article 32.
  if (article === '226_and_227') {
    return atSupremeCourt(ctx, courtData)
      ? 'article_226_and_227_no_high_court'
      : 'article_226_and_227';
  }
  if (article === '32' || atSupremeCourt(ctx, courtData)) return 'supreme_court';
  return 'high_court';
}

/**
 * T-479 (Ajay, 6a047469 points 4-5; f9415fe8 points c-d): certiorari's
 * respondents, numbered 1., 2., ... Against a civil court's judicial order
 * (Article 227) the State is not a party: the respondents the advocate typed
 * (the authority, then the additional respondents), else the signed
 * respondents blank when none are given. Otherwise, in order: the State
 * (`civilWritStateParty`), the authority whose order is impugned, then the
 * additional respondents, one per line. An optional additional respondent
 * left unanswered prints nothing.
 */
function certiorariRespondents(ctx: PlaceholderContext, route: CertiorariRoute): string {
  const authority = isUnanswered(ctx.respondent_authority)
    ? AUTHORITY_BLANK
    : (ctx.respondent_authority as string);
  const additional = isUnanswered(ctx.additional_respondents)
    ? ''
    : (ctx.additional_respondents as string);
  if (route === 'article_227' || route === 'article_227_no_high_court') {
    // f9415fe8 (c): the signed respondents blank only when none are given.
    if (isUnanswered(ctx.respondent_authority) && additional === '') return RESPONDENTS_LIST_BLANK;
    return numberRespondents([authority, additional].join('\n'));
  }
  const stateLine = civilWritStateParty(ctx.state);
  return `1. ${stateLine}\n${numberRespondents([authority, additional].join('\n'), 2)}`;
}

/**
 * T-479 (Ajay, 7c279a77, points 2-3): mandamus's respondents, numbered: the
 * authority as typed (one per line), else the signed authority blank as 1.
 * No State line is added; the advocate names the State if it is a party.
 */
function mandamusRespondents(ctx: PlaceholderContext): string {
  if (isUnanswered(ctx.respondent_authority)) return `1. ${AUTHORITY_BLANK}`;
  return numberRespondents(ctx.respondent_authority as string);
}

function applyCauseTitlePartyBlanks(
  templateId: string,
  ctx: PlaceholderContext,
  courtData?: CourtLookupData,
): void {
  for (const [key, blank] of CAUSE_TITLE_PARTY_BLANKS[templateId] ?? []) {
    if (isUnanswered(ctx[key])) {
      ctx[key] = blank;
    } else if (key === 'respondents_list') {
      ctx[key] = numberRespondents(ctx[key]);
    } else if (templateId === 'mandamus') {
      // T-489 (Ajay 53132fb2): a multi-line answer prints on one title line.
      ctx[key] = String(ctx[key]).replace(/\s+/g, ' ').trim();
    }
  }
  if (templateId === 'certiorari') {
    ctx.respondents_list = certiorariRespondents(ctx, certiorariRoute(ctx, courtData));
  }
  if (templateId === 'mandamus') ctx.respondents_list = mandamusRespondents(ctx);
}

/**
 * T-479: packs whose cause title prints {state} with no `state` question on the
 * brief and ledger paths. There {state} is the chosen court's State, as the
 * courts list stores it (its display name, e.g. "Bihar").
 */
const STATE_FROM_COURT_PACKS: ReadonlySet<string> = new Set([
  'fir_quashing',
  'quashing_528_bnss',
  'writ_petition_civil',
  'mandamus',
  'certiorari',
]);

/** A State name compared loosely: lower case, "&" as "and", "_" as a space. */
function normState(state: string | undefined): string {
  return (state ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * T-479 (review round 1; Ajay, 7c279a77): the States whose High Court is
 * their own and named for them, so a court listed under one of them is in the
 * matter's State. A court under any other State is left out: common High
 * Courts and their benches (Gauhati: Assam, Nagaland, Mizoram, Arunachal
 * Pradesh; Punjab and Haryana: Punjab, Haryana, Chandigarh), and every Union
 * Territory other than Delhi (Goa, J&K, Ladakh, Puducherry, A&N Islands,
 * Lakshadweep, DNH and DD). "India" (the Supreme Court) is not on the list.
 */
const OWN_HIGH_COURT_STATES: ReadonlySet<string> = new Set([
  'andhra pradesh',
  'bihar',
  'chhattisgarh',
  'delhi',
  'gujarat',
  'himachal pradesh',
  'jharkhand',
  'karnataka',
  'kerala',
  'madhya pradesh',
  'maharashtra',
  'manipur',
  'meghalaya',
  'odisha',
  'rajasthan',
  'sikkim',
  'tamil nadu',
  'telangana',
  'tripura',
  'uttar pradesh',
  'uttarakhand',
  'west bengal',
]);

/**
 * T-479 (Ajay, 7c279a77): High Court benches whose seat is in a different
 * State or UT from the parent court, although the courts list stores the
 * parent's State: Panaji (Goa; Bombay High Court, listed as Maharashtra) and
 * Port Blair (A&N Islands; Calcutta High Court, listed as West Bengal).
 */
const OFF_STATE_BENCH_CITIES: ReadonlySet<string> = new Set(['panaji', 'port blair']);

/**
 * T-479: true only when the chosen court's listed State is both the State the
 * matter belongs to and the State its High Court is named for. Anything else
 * keeps the State blank: a wrong State never prints.
 */
export function courtStateIsMatterState(courtData: CourtLookupData | undefined): boolean {
  if (!courtData || courtData.courtType === 'supreme_court') return false;
  if (!OWN_HIGH_COURT_STATES.has(normState(courtData.state))) return false;
  const isHighCourt =
    courtData.courtType === 'high_court' || courtData.courtType === 'high_court_bench';
  return !(isHighCourt && OFF_STATE_BENCH_CITIES.has(normState(courtData.city)));
}

/** T-479 (Ajay, 7c279a77): the Punjab and Haryana High Court, listed under Chandigarh. */
function isPunjabHaryanaHighCourt(courtData: CourtLookupData | undefined): boolean {
  return courtData?.courtType === 'high_court' && normState(courtData.state) === 'chandigarh';
}

/** T-479 (Ajay, 7c279a77): its own full name, signed. Never "HIGH COURT OF Chandigarh". */
export const PUNJAB_HARYANA_HIGH_COURT_NAME = 'HIGH COURT OF PUNJAB AND HARYANA AT CHANDIGARH';

/**
 * T-479: an unanswered {state} in these packs reads the court's State, only
 * when `courtStateIsMatterState`. For any other court a {state} that is just
 * the court's listed State (the court picker's) is taken out, so the blank
 * prints, never a wrong State.
 */
function applyStateFromCourt(
  templateId: string,
  ctx: PlaceholderContext,
  courtData?: CourtLookupData,
): void {
  if (!STATE_FROM_COURT_PACKS.has(templateId)) return;
  if (courtData && !courtStateIsMatterState(courtData)) {
    if (!isUnanswered(ctx.state) && normState(ctx.state) === normState(courtData.state)) {
      delete ctx.state;
    }
    return;
  }
  if (!isUnanswered(ctx.state) || !courtData) return;
  ctx.state = courtData.state as string;
}

/** T-479: the State the prompt's civil-writ State line names (same guard as the cause title). */
export function promptCourtState(
  ctx: PlaceholderContext | undefined,
  courtData: CourtLookupData | undefined,
): string | undefined {
  if (!isUnanswered(ctx?.state)) return ctx?.state;
  return courtStateIsMatterState(courtData) ? courtData?.state : undefined;
}

/**
 * T-479 (Ajay, 0e5f64b7): the cause-title format a Supreme Court petition
 * uses in place of the pack's High Court one. Server-only (`__` key).
 */
export const CAUSE_TITLE_FORMAT_KEY = '__cause_title_format';

/**
 * T-479: the title route of a pack whose rule file carries more than one
 * signed title (`causeTitle.supremeCourtFormat`, `causeTitle.article227Format`).
 * Undefined: the pack prints its own `causeTitle.format`.
 */
function causeTitleRoute(
  templateId: string,
  ctx: PlaceholderContext,
  courtData?: CourtLookupData,
): CertiorariRoute | undefined {
  if (templateId === 'mandamus') {
    return atSupremeCourt(ctx, courtData) ? 'supreme_court' : 'high_court';
  }
  if (templateId === 'certiorari') return certiorariRoute(ctx, courtData);
  return undefined;
}

/** A non-empty string from the rule file's causeTitle block, else undefined. */
function causeTitleString(config: TemplateConfig, key: string): string | undefined {
  const causeTitle = (config as { _source?: { causeTitle?: unknown } })._source?.causeTitle;
  if (causeTitle === null || typeof causeTitle !== 'object') return undefined;
  const value = (causeTitle as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * T-479: mandamus and certiorari at the Supreme Court print Ajay's signed
 * Article 32 title and addressee (0e5f64b7, 2d578206), never the High Court /
 * Article 226 one. Certiorari's Article 227 choice prints its signed title
 * (6a047469). The court is the Supreme Court when the chosen court's type says
 * so (the courts list, or the brief's court picker `court_type`), or the
 * pack's own `court` answer is the Supreme Court.
 */
function applySupremeCourtCauseTitle(
  config: TemplateConfig,
  ctx: PlaceholderContext,
  courtData?: CourtLookupData,
): void {
  delete ctx[CAUSE_TITLE_FORMAT_KEY];
  delete ctx[ADDRESSEE_KEY];
  delete ctx[STATE_PARTY_KEY];
  delete ctx[COURT_NAME_KEY];
  // T-479 (Ajay, 7c279a77): the Punjab and Haryana High Court prints its own
  // full name, never "HIGH COURT OF Chandigarh"; its State stays blank.
  if (STATE_FROM_COURT_PACKS.has(config.template_id) && isPunjabHaryanaHighCourt(courtData)) {
    ctx[COURT_NAME_KEY] = PUNJAB_HARYANA_HIGH_COURT_NAME;
  }
  // T-488 / T-479 (Ajay, ca12ec2e; f9415fe8 point d): fir_quashing, a
  // criminal pack, names the State party per ca12ec2e in Delhi and other UTs.
  if (config.template_id === 'fir_quashing') {
    const state = ctx.state?.trim() ?? '';
    if (state !== '' && isDelhi(state)) ctx[STATE_PARTY_KEY] = CRIMINAL_DELHI_STATE_PARTY;
    else if (state !== '' && isUnionTerritory(state)) ctx[STATE_PARTY_KEY] = UT_PARTY_BLANK;
  }
  const route = causeTitleRoute(config.template_id, ctx, courtData);
  const formatKey: Partial<Record<CertiorariRoute, string>> = {
    supreme_court: 'supremeCourtFormat',
    article_227: 'article227Format',
    article_227_no_high_court: 'article227NoHighCourtFormat',
    article_226_and_227: 'article226And227Format',
    article_226_and_227_no_high_court: 'article226And227NoHighCourtFormat',
  };
  const key = route === undefined ? undefined : formatKey[route];
  const format = key === undefined ? undefined : causeTitleString(config, key);
  if (format !== undefined) ctx[CAUSE_TITLE_FORMAT_KEY] = format;
  if (route === 'supreme_court') {
    const addressee = causeTitleString(config, 'supremeCourtAddressee');
    if (addressee !== undefined) ctx[ADDRESSEE_KEY] = addressee;
  }
}

/**
 * T-488 / T-479: the State party name that replaces "State of {state}" in a
 * cause title where ca12ec2e rules it out (Delhi, other UTs). Server-only.
 */
export const STATE_PARTY_KEY = '__state_party';

/** T-479 (Ajay, 7c279a77): a court's own full name for "HIGH COURT OF {state} AT {courtPlace}". Server-only. */
export const COURT_NAME_KEY = '__court_name';

/**
 * T-479 (Ajay, 2d578206): the addressee a Supreme Court petition is addressed
 * to, in place of the generic "TO, THE HON'BLE {court_designation}" lines.
 * Server-only (`__` key).
 */
export const ADDRESSEE_KEY = '__addressee';

/** The generic clause's addressee: "TO," then the designation line and an optional city line. */
const GENERIC_ADDRESSEE =
  /^TO,[ \t]*\n[^\n]*\{court_designation\}[^\n]*(?:\n[ \t]*\{court_city\}[^\n]*)?/;

/**
 * T-479: the template a section prints. A Supreme Court mandamus takes the
 * signed title for its cause title and the signed addressee for its
 * addressing clause; the rest of that clause is kept. Every other section and
 * pack prints its own template.
 */
function supremeCourtSectionTemplate(section: DocumentSection, ctx: PlaceholderContext): string {
  const template = section.template as string;
  if (section.section_id === 'cause_title') {
    let title = ctx[CAUSE_TITLE_FORMAT_KEY] || template;
    if (ctx[STATE_PARTY_KEY]) {
      title = title.replace(/State of \{state\}/g, () => ctx[STATE_PARTY_KEY]);
    }
    if (ctx[COURT_NAME_KEY]) {
      title = title.replace(
        /HIGH COURT OF \{state\} AT \{courtPlace\}/g,
        () => ctx[COURT_NAME_KEY],
      );
    }
    return title;
  }
  if (section.section_id === 'addressing_clause' && ctx[ADDRESSEE_KEY]) {
    // Never the generic addressee: with no match, the signed addressee alone.
    return GENERIC_ADDRESSEE.test(template)
      ? template.replace(GENERIC_ADDRESSEE, () => ctx[ADDRESSEE_KEY])
      : ctx[ADDRESSEE_KEY];
  }
  return template;
}

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
  allowNomenclature = true,
): void {
  const chosen = chosenCourtHeading(courtData);
  if (chosen) {
    const { designation, header } = chosen;
    if (!computed.court_header) ctx.court_header = header;
    if (!computed.court_designation) ctx.court_designation = designation;
  }
  const city = courtData?.city?.trim();
  if (city && (!ctx.court_city || IS_BLANK.test(ctx.court_city))) ctx.court_city = city;
  if (allowNomenclature && courtData?.caseNomenclature && !ctx.case_nomenclature) {
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
 * T-410 (Addendum 1, item 1): with the Consumer Commission blank as the
 * designation, the city line is left out too.
 */
export function sectionTemplate(template: string, ctx: PlaceholderContext): string {
  if (
    ctx.court_designation !== CONSUMER_COMMISSION_BLANK &&
    !designationNamesCity(ctx.court_designation, ctx.court_city)
  )
    return template;
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
  // T-479: a Supreme Court mandamus uses the signed Article 32 title and addressee.
  const template = supremeCourtSectionTemplate(section, sectionCtx);
  return {
    section_id: section.section_id,
    type: 'template',
    content: replacePlaceholders(sectionTemplate(template, sectionCtx), sectionCtx),
    alignment: section.alignment,
    style: section.style,
  };
}

/**
 * T-477 (Arjun): the "[only when: ...]" marker the RELATED ACTS line carries
 * for a conditional act. Matches that literal marker shape only, never other
 * bracketed text, with any spaces or tabs before it on the same line.
 */
const ONLY_WHEN_MARKER = /[ \t]*\[only when:[^\]\n]*\]/gi;

/**
 * T-477: removes every "[only when: ...]" marker the model echoed into a body.
 * `count` is how many were removed, so a caller can record the count (not the
 * text).
 */
export function stripOnlyWhenMarkers(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(ONLY_WHEN_MARKER, () => {
    count += 1;
    return '';
  });
  return { text: out, count };
}

/**
 * SCRUM-62: Strip cause-title blocks (A7) and disclaimer text (A6) that AI
 * sometimes injects into the body despite instructions not to.
 * Both are already rendered by template sections — duplicates corrupt the PDF.
 */
export function sanitiseAIBody(text: string): string {
  // T-477: echoed "[only when: ...]" markers go before the paragraph filter.
  const paras = stripOnlyWhenMarkers(text).text.split(/\n\n+/);
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
  // T-566 (item 65, Ajay's review 22 Oct; Arjun: by line, not paragraph): a
  // line that carries the Lawie disclaimer goes on its own and the rest of its
  // paragraph stays. Runs after the paragraph rules so they still see each
  // paragraph whole; a paragraph left empty is dropped. Ruling 65e adds the
  // second phrase.
  const lawieLineFree = cleaned
    .map((para) =>
      para
        .split('\n')
        .filter(
          (line) =>
            !/Lawie is a drafting assistant/i.test(line) &&
            !/Lawie is not legal counsel/i.test(line),
        )
        .join('\n'),
    )
    .filter((para) => para.trim() !== '');
  return lawieLineFree.join('\n\n').trim();
}

/**
 * T-410 (Ajay 2a8b722, ruling 4 covers the prompt): the rule a consumer_complaint
 * prompt reads. A Commission's own rule, else the consumer rule; never a court
 * that is not a Commission. Its party designations are Complainant / Opposite
 * Party only: the `state` party is left out.
 *
 * localRules (Ajay 4e42ef8 item 3, amended (a) 27fcccd): the generic rule's
 * District lines at a District Commission, the ncdrc rule's lines at NCDRC,
 * none at a State Commission, a court that is not a Commission, or no court.
 * State and District share one rule, so District lines need `courtData` to
 * name a District Commission; without it the generic rule's lines are left out.
 */
function consumerPromptRule(
  courtRule?: CourtRuleData | null,
  courtData?: CourtLookupData,
): CourtRuleData | null {
  const base =
    courtRule?.courtType === 'consumer_commission' ? courtRule : loadCourtRule(CONSUMER_RULE_ID);
  if (!base) return base;
  const forum = courtData
    ? consumerForum(courtData)
    : courtRule?.courtId === 'ncdrc'
      ? 'national'
      : null;
  const parties =
    base.party_designation &&
    Object.fromEntries(Object.entries(base.party_designation).filter(([role]) => role !== 'state'));
  return {
    ...base,
    ...(parties && { party_designation: parties }),
    localRules: forum === 'district' || forum === 'national' ? base.localRules : undefined,
  };
}

/**
 * T-410 (Ajay 2a8b722): the rule the Drafter prompt reads, chosen as
 * buildAISystemPrompt chooses it. consumer_complaint takes consumerPromptRule;
 * every other template takes the chosen court's rule unchanged.
 */
export function drafterPromptCourtRule(
  templateId: string,
  courtData?: CourtLookupData,
): CourtRuleData | undefined {
  if (templateId !== CONSUMER_COMPLAINT_ID) return courtData?.courtRule;
  return consumerPromptRule(courtData?.courtRule, courtData) ?? undefined;
}

/**
 * T-566 item 54 (Ajay, pre-Anushka legal review 22 Oct, L96; rulings 54a/54b):
 * the law line for a pack in a criminal category that is not one of the six
 * law-switch packs. Byte for byte; legal content, do not edit without Ajay.
 */
export const OFFENCE_DATE_LAW_RULE =
  'Use BNS section numbers for an offence committed on or after 1 July 2024, and IPC section numbers for an offence committed before that date. For procedure and evidence, use BNSS and BSA, except in a matter that was pending before 1 July 2024, where CrPC and the Evidence Act continue to apply. If the date of the offence is not given, write [To be confirmed: section and code].';

/**
 * T-566 ruling 54b: a criminal category is a rule-pack `category` of
 * `criminal` or one that starts `criminal_` (criminal_bail, criminal_petition,
 * criminal_procedural, criminal_appellate). Every other category is not.
 */
export function isCriminalCategory(category: string | undefined | null): boolean {
  return typeof category === 'string' && /^criminal(?:_|$)/.test(category);
}

/**
 * T-566 ruling S1: writ_petition_criminal (category `writ`) also gets the item
 * 54 line. It is named here by id; its category is not changed.
 */
const OFFENCE_DATE_LAW_RULE_EXTRA_IDS: readonly string[] = ['writ_petition_criminal'];

/**
 * T-566 rulings 54b and S1: whether a pack gets OFFENCE_DATE_LAW_RULE. A pack
 * in a criminal category, or one of the ids named in ruling S1.
 */
export function getsOffenceDateLawRule(
  templateId: string | undefined | null,
  category: string | undefined | null,
): boolean {
  return (
    isCriminalCategory(category) ||
    (typeof templateId === 'string' && OFFENCE_DATE_LAW_RULE_EXTRA_IDS.includes(templateId))
  );
}

/**
 * Build the AI system prompt for config-driven generation.
 * T-410: `courtData` (optional) tells a District from a State Commission for
 * consumer_complaint's localRules.
 * T-407: `ctx` (optional) is the placeholder context of this draft. When it is
 * given, each related_acts entry is rendered through replacePlaceholders, so a
 * computed field (e.g. the s.138 notice's {ni_act_related_sections}) picks the
 * sections for this drawer. Without ctx each entry still goes through
 * replacePlaceholders with an empty context, so an unresolved {token} prints as
 * the normal blank and never reaches the model raw.
 */
export function buildAISystemPrompt(
  config: TemplateConfig,
  chosenCourtRule?: CourtRuleData | null,
  courtData?: CourtLookupData,
  ctx?: PlaceholderContext,
): string {
  const relatedActs = config.related_acts.map((act) => replacePlaceholders(act, ctx ?? {}));
  const courtRule =
    config.template_id === CONSUMER_COMPLAINT_ID
      ? consumerPromptRule(chosenCourtRule, courtData)
      : chosenCourtRule;
  const isContract =
    config.category === 'civil' && ['rent_agreement', 'nda', 'mou'].includes(config.template_id);

  // T-245a: the six bail packs keep Ajay's signed S-text (offence law by the
  // date of the offence) and P-text (procedure by the PROCEDURE CODE the law
  // switch puts in the case details). T-566 item 54 (rulings 54a/54b): every
  // other pack in a criminal category, and writ_petition_criminal (ruling S1),
  // gets Ajay's date-aware line; any other pack gets no law line, and the rules
  // after it move up.
  const lawRule = isLawSwitchPack(config.template_id)
    ? `${S_TEXT} ${P_TEXT}`
    : getsOffenceDateLawRule(config.template_id, config.category)
      ? OFFENCE_DATE_LAW_RULE
      : null;

  const criticalRules = [
    ...(lawRule ? [lawRule] : []),
    'Format with numbered paragraphs (1, 2, 3...) for the body.',
    'Use formal, respectful legal language appropriate for Indian courts.',
    'Do NOT include any commentary or notes outside the document content.',
    "NEVER alter, embellish, or contradict the user's stated facts. Reproduce FIR numbers, dates, names, and amounts EXACTLY as provided.",
    [
      'Generate ONLY the numbered body paragraphs as instructed. Do NOT include:',
      '   - Any court header or cause-title block ("IN THE COURT OF..." / "IN THE HIGH COURT OF...") — the cause title is already rendered above by the template engine; a second copy corrupts the document (A7)',
      '   - The prayer clause, verification clause, or advocate block',
      '   - The footer disclaimer ("First draft generated with AI" / "Lawie does not provide legal advice") — it is added to the export footer automatically and must NOT appear in the body (A6)',
    ].join('\n'),
    `Write any date as D Month YYYY, for example 4 April 2026. Never work out, add or change a date that is not given. ${NOT_KNOWN_DATE_LINE}`,
    ...(isContract
      ? [
          'CONTRACTS — ANTI-INVENTION RULE: Do NOT introduce any term, clause, rate, percentage, penalty, or condition that is not explicitly present in the user-provided form data. You may only arrange and formalise the terms given. If the user has not specified an interest rate, notice period, or penalty — do NOT invent one.',
        ]
      : []),
  ]
    .map((rule, i) => `${i + 1}. ${rule}`)
    .join('\n');

  return `You are a senior Indian advocate with 20+ years of practice, drafting a legal document for an advocate to review and file.

DOCUMENT TYPE: ${config.display_name}
CATEGORY: ${config.category}

CRITICAL RULES:
${criticalRules}

ANTI-HALLUCINATION GUARDRAILS (MANDATORY):
- Use the EXACT respondent / opposite party name provided in the form data. NEVER substitute, guess, or infer a different entity name (e.g., do NOT replace a retailer name with a manufacturer name).
- NEVER assert that "investigation is complete" or "chargesheet has been filed" unless EXPLICITLY stated in the user-provided facts. If not stated, say "investigation is pending" or omit the assertion entirely.
- NEVER classify an offence as "bailable" or "non-bailable" unless you have been given the classification in the prompt context below. If no classification is provided, do not comment on bailability.
- NEVER invent witness names, case numbers, dates, or factual assertions not present in the user's form data.
- All dates must be reproduced EXACTLY as provided — do not convert formats.

RELATED ACTS: ${relatedActs.join(', ')}${courtRule?.localRules?.length ? `\n\nCOURT-SPECIFIC RULES (MANDATORY — these override generic conventions):\n${courtRule.localRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}${
    courtRule?.party_designation
      ? `\n\nPARTY DESIGNATIONS FOR THIS COURT:\n${partyDesignationsPromptLines(
          courtRule,
          config.template_id,
          promptCourtState(ctx, courtData),
        )}`
      : ''
  }${
    config.category === 'criminal'
      ? `\n\nBNS SECTION WHITELIST (MANDATORY — SCRUM-64): When you cite a BNS section, cite only one from this verified First Schedule list: ${BNS_VALID_SECTIONS.join(', ')}. Any BNS section number NOT in this list does not exist in the Bharatiya Nyaya Sanhita — do NOT use it under any circumstances.\nA sub-section of a listed section may be cited, for example 103(1) or 316(2).`
      : ''
  }`;
}

/**
 * T-295: Ajay's signed old-law line (handoff/legal/T-295-old-law-block-signed.md,
 * 455559c), byte for byte. PREFLIGHT ONLY: the question of the soft old_law_section
 * finding in preflight.service.ts. The prompt's old-law block in
 * classifySectionsBailability keeps Ajay's T-277 line ("…is not classified here…"),
 * which stops the model classifying IPC sections from memory; do not use this there.
 * Code first, then the number as read ("302 IPC" -> "IPC 302"); never "BNS" in front
 * of an old-law number. Returns null for any non-old-law code.
 * Legal content: do not edit without Ajay's sign-off.
 */
export function oldLawLine(code: ChargedCode | null, number: string): string | null {
  const old = code === null ? undefined : OLD_LAW_LINE[code];
  if (!old) return null;
  return `${old.name} ${number} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the ${old.newCode} section. For an earlier offence, the old section may still apply.`;
}

/**
 * Classify BNS sections as bailable/non-bailable.
 * Returns a string like "BNS 303(2) (NON-BAILABLE), BNS 351(2) (BAILABLE)".
 *
 * T-277 (R4): generated from bns-offences.json at load time (BNS_CLASSIFICATION
 * replaces the retired bns-bailability.json). A section resolves through the shared
 * resolver: its own row, else its own variant, else a parent row without variants.
 * A null or non-"yes"/"no" value goes in neither list. Only the extracted section
 * number and table-derived labels are emitted, never the user's free text. The field
 * is read only by readSectionsCharged (Arjun, round 4).
 */
export function classifySectionsBailability(sectionsCharged: string | ChargedSection[]): string {
  if (!sectionsCharged || sectionsCharged.length === 0) return '';
  // A string (brief, free text) is read with no default; a pre-read list keeps
  // the per-entry codes from readChargedField.
  const charged =
    typeof sectionsCharged === 'string' ? readSectionsCharged(sectionsCharged) : sectionsCharged;

  const nonBailableSet = new Set(BNS_CLASSIFICATION.non_bailable);
  const bailableSet = new Set(BNS_CLASSIFICATION.bailable);

  // Arjun (round 4): the one sections_charged reader; no comma split here.
  const classified: string[] = [];
  const oldLaw: string[] = [];

  for (const { code, number } of charged) {
    // Bare (code not stated): never BNS, never classified; existing wording only.
    if (code === null) {
      classified.push(`${number} (classification: verify from First Schedule)`);
      continue;
    }
    // Ajay Q8 / round 5c: an old-law number gets its line, never a "BNS" label.
    const old = OLD_LAW_LINE[code];
    if (old) {
      oldLaw.push(
        `${old.name} ${number} is an old-law section and is not classified here. Use the section converter to find the ${old.newCode} section.`,
      );
      continue;
    }
    // BNSS / BSA / OTHER: kept by the reader, no label and no line here.
    if (code !== 'BNS') continue;

    // Exact table key → the generated lists; otherwise the resolver's variant /
    // parent-row value (same source, so a key and its list entry always agree).
    const bailable = bailableSet.has(number)
      ? true
      : nonBailableSet.has(number)
        ? false
        : resolveOffence(number).bailable;
    if (bailable === false) {
      classified.push(`BNS ${number} (NON-BAILABLE)`);
    } else if (bailable === true) {
      classified.push(`BNS ${number} (BAILABLE)`);
    } else {
      classified.push(`BNS ${number} (classification: verify from First Schedule)`);
    }
  }

  return [classified.join(', '), ...oldLaw].filter(Boolean).join('\n');
}

/**
 * T-293: parse the server's sections_charged pre-read. Bad JSON (or anything
 * that is not an array) returns undefined so the caller falls back to the
 * normal read. Logs ids only, never the value.
 */
function parseSectionsChargedRead(
  raw: string | undefined,
  sectionId: string,
): ChargedSection[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ChargedSection[];
  } catch {
    // fall through to the warn below
  }
  logger.warn(
    { key: SECTIONS_CHARGED_READ_KEY, sectionId },
    'sections_charged pre-read unparseable; using normal read',
  );
  return undefined;
}

/** T-440: the blanks `buildPlaceholderContext` stored for the dates answered "Not known". */
function notKnownDateBlanks(ctx: PlaceholderContext): string[] {
  const raw = ctx[NOT_KNOWN_DATES_KEY];
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b): b is string => typeof b === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build the AI user prompt from an ai_generated section's prompt_context.
 */
export function buildAIUserPrompt(section: DocumentSection, ctx: PlaceholderContext): string {
  if (!section.prompt_context) return '';

  let prompt = replacePlaceholders(section.prompt_context, ctx);

  // T-245a (signed file, "Form keys"): the case details carry the two derived
  // lines, PROCEDURE CODE and GOVERNING PROVISION. None with no procedure code.
  const lawLines = ctx[LAW_SWITCH_LINES_KEY];
  if (lawLines) prompt += `\n\n${lawLines}`;

  // T-440 (Ajay, a9bc957): the dates answered "Not known", each with the blank
  // to copy (system prompt rule 7 carries the signed line). None for a date
  // that is merely empty (Q4).
  const notKnownBlanks = notKnownDateBlanks(ctx);
  if (notKnownBlanks.length > 0) {
    prompt += `\n\nDATES MARKED AS NOT KNOWN:\n${notKnownBlanks.map((b) => `- ${b}`).join('\n')}`;
  }

  // Inject respondent name guardrail (SCRUM-52 S1 — prevent AI from substituting)
  if (ctx.respondent_name) {
    prompt += `\n\nIMMUTABLE PARTY NAME: The respondent / opposite party is "${ctx.respondent_name}". Use this EXACT name throughout. Do NOT substitute with any other entity.`;
  }

  // Inject applicant identity guardrail — prevent AI from inventing party details
  if (ctx.applicant_name) {
    const identityParts = [`Name: ${ctx.applicant_name}`];
    // T-393: the relation as given, or the signed blank; never a presumed one.
    const parentage = relationLineFor(ctx);
    if (parentage !== RELATION_BLANK) identityParts.push(`Parentage: ${parentage}`);
    if (ctx.applicant_age) identityParts.push(`Age: ${ctx.applicant_age} years`);
    if (ctx.address) identityParts.push(`Address: ${ctx.address}`);
    prompt += `\n\nIMMUTABLE APPLICANT IDENTITY (use EXACTLY as given — do NOT change name, parentage, age, or address):\n${identityParts.join('\n')}`;
  }

  // Inject bailability classification if sections_charged exist in context (SCRUM-52 S2)
  if (ctx.sections_charged) {
    const preRead = parseSectionsChargedRead(ctx[SECTIONS_CHARGED_READ_KEY], section.section_id);
    const classification = classifySectionsBailability(preRead ?? ctx.sections_charged);
    if (classification) {
      prompt += `\n\nBAILABILITY CLASSIFICATION (from BNS First Schedule — use EXACTLY as given, do NOT contradict):\n${classification}\nA section in neither list: do not say whether it is bailable or cognizable.`;
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
