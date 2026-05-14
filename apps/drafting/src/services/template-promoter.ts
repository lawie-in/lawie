/**
 * Template Promoter (SCRUM-78)
 *
 * Normalises CLO-authored doc-rule JSONs (apps/drafting/src/config/document-rules/*.json)
 * into the TemplateConfig shape consumed by template-engine.service.ts.
 *
 * Reads:    apps/drafting/src/config/document-rules/<id>.json   (source of truth)
 * Produces: TemplateConfig (in-memory registry) + mismatch report
 *
 * CLO authors 92 doc-rules in five distinct shapes:
 *   1. flat list:                [{name, label, type, required, options?, help?}]
 *   2. dict-with-fields:         {fields: [{name, label, type, required, ...}]}
 *   3. JSON Schema:              {type:"object", properties:{<id>:{type, enum?}}, required:[...]}
 *   4. nested-by-section:        {<section_name>: {<sub_field>: {type, label, required}}}
 *   5. absent:                   no form_schema key
 *
 * Top-level keys also vary (template_id / docType / displayName / title all coexist).
 * The promoter is tolerant: it fills sensible defaults, normalises field shape into the
 * target FormField type, and logs anything it cannot map.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import logger from '../config/logger';

import type {
  DocumentSection,
  FieldOption,
  FormField,
  FormStep,
  TemplateConfig,
  ValidationRules,
} from './template-engine.service';

// ── Source shape (loose — every key optional) ───────────────────────────────

interface DocRuleSource {
  _meta?: Record<string, unknown>;
  template_id?: string;
  docType?: string;
  parentDocType?: string;
  title?: string;
  displayName?: string;
  description?: string;
  category?: string;
  creditsCost?: number;
  court_levels?: string[];
  causeTitle?: unknown;
  mandatory_clauses?: string[];
  mandatoryClauses?: Array<{
    id?: string;
    name?: string;
    description?: string;
    required?: boolean;
  }>;
  prayerTemplate?: string;
  verificationTemplate?: string;
  prompt_context?: string;
  promptInstructions?: string[];
  relevantActs?: unknown[];
  filing_checklist?: string[];
  filingChecklist?: string[];
  validation_rules?: string[] | ValidationRules;
  form_schema?: unknown;
  [key: string]: unknown;
}

export interface PromoterOutput {
  config: TemplateConfig;
  mismatches: string[];
}

export interface RegistryBuild {
  configs: Map<string, TemplateConfig>;
  mismatchReport: string[];
  byFile: Map<string, { template_id: string; mismatches: string[] }>;
}

// ── Field-type mapping (source → target enum) ───────────────────────────────

const FIELD_TYPE_MAP: Record<string, FormField['type']> = {
  // already-canonical
  text: 'text',
  date: 'date',
  number: 'number',
  textarea: 'textarea',
  dropdown: 'dropdown',
  dropdown_search: 'dropdown_search',
  multi_select_search: 'multi_select_search',
  checkbox_group: 'checkbox_group',
  // JSON-Schema / loose aliases
  string: 'text',
  integer: 'number',
  float: 'number',
  decimal: 'number',
  select: 'dropdown',
  enum: 'dropdown',
  email: 'text',
  tel: 'text',
  phone: 'text',
  url: 'text',
  // multi-select-style — collapse all variants onto the target enum value.
  array: 'multi_select_search',
  list: 'multi_select_search',
  multiselect: 'multi_select_search',
  multi_select: 'multi_select_search',
  'multi-select': 'multi_select_search',
  enum_set: 'multi_select_search',
  // checkbox-style
  boolean: 'checkbox_group',
  bool: 'checkbox_group',
  checkbox: 'checkbox_group',
  checkbox_multi: 'checkbox_group',
  // SCRUM-79 — first-class currency + file rendering.
  currency: 'currency',
  money: 'currency',
  rupees: 'currency',
  inr: 'currency',
  file: 'file',
  upload: 'file',
  attachment: 'file',
};

function mapFieldType(raw: unknown, mismatches: string[], context: string): FormField['type'] {
  if (typeof raw !== 'string') {
    mismatches.push(`${context}: field type is not a string (${typeof raw}); defaulted to 'text'`);
    return 'text';
  }
  const mapped = FIELD_TYPE_MAP[raw.toLowerCase()];
  if (!mapped) {
    mismatches.push(`${context}: unknown field type '${raw}'; defaulted to 'text'`);
    return 'text';
  }
  return mapped;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function humaniseId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugifyOption(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function normaliseOptions(
  raw: unknown,
  mismatches: string[],
  context: string,
): FieldOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((o, idx) => {
    if (typeof o === 'string') {
      return { id: slugifyOption(o) || `opt_${idx}`, label: o };
    }
    if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>;
      const label =
        typeof obj.label === 'string' ? obj.label : String(obj.id ?? `Option ${idx + 1}`);
      const id =
        typeof obj.id === 'string' && obj.id.length > 0
          ? obj.id
          : slugifyOption(label) || `opt_${idx}`;
      return { id, label };
    }
    mismatches.push(`${context}: option at index ${idx} has unsupported shape; coerced to string`);
    return { id: `opt_${idx}`, label: String(o) };
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── form_schema normalisers — one per source shape ──────────────────────────

interface RawField {
  field_id: string;
  raw: Record<string, unknown>;
  required: boolean;
}

function normaliseFlatList(arr: unknown[], mismatches: string[]): RawField[] {
  return arr
    .map((f, idx) => {
      if (!isPlainObject(f)) {
        mismatches.push(`form_schema[${idx}]: not an object; skipped`);
        return null;
      }
      // CLO uses any of `name`, `field_id`, or `id` as the key — accept all three.
      const name =
        typeof f.name === 'string'
          ? f.name
          : typeof f.field_id === 'string'
            ? f.field_id
            : typeof f.id === 'string'
              ? f.id
              : '';
      if (!name) {
        mismatches.push(`form_schema[${idx}]: no 'name' / 'field_id' / 'id'; skipped`);
        return null;
      }
      return { field_id: name, raw: f, required: f.required === true };
    })
    .filter((x): x is RawField => x !== null);
}

function normaliseJsonSchema(
  schema: Record<string, unknown>,
  mismatches: string[],
  pathPrefix = '',
): RawField[] {
  const props = isPlainObject(schema.properties) ? schema.properties : {};
  const requiredList = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const out: RawField[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (!isPlainObject(val)) {
      mismatches.push(`form_schema.properties.${pathPrefix}${key}: not an object; skipped`);
      continue;
    }
    if (val.type === 'object' && isPlainObject(val.properties)) {
      // Nested object — recurse with dot-path prefix so the field id stays unique.
      out.push(...normaliseJsonSchema(val, mismatches, `${pathPrefix}${key}.`));
      continue;
    }
    const fieldId = `${pathPrefix}${key}`;
    out.push({
      field_id: fieldId,
      raw: {
        ...val,
        // Carry enum forward as options for mapFieldType to pick up.
        options: Array.isArray(val.enum) ? val.enum : val.options,
      },
      required: requiredList.includes(key),
    });
  }
  return out;
}

/**
 * Detect whether a sub-object looks like a leaf field definition vs a section header.
 *
 * A leaf field has a primitive `type` (text/string/number/date/textarea/select/etc.)
 * A header has either `type: 'object'` (JSON-Schema style — recurse into properties)
 * or no `type` at all (free-form nested section).
 */
function looksLikeFieldDef(o: Record<string, unknown>): boolean {
  return typeof o.type === 'string' && o.type !== 'object';
}

function normaliseNestedSection(schema: Record<string, unknown>, mismatches: string[]): RawField[] {
  // Three coexisting shapes:
  //   (a) flat field dict:           { <field_id>: { type, label, required, ... } }
  //   (b) nested-by-section:         { <section>: { <sub_field>: { type, ... } } }
  //   (c) JSON-Schema stub at top:   { <section>: { type:'object', properties:{...} } }
  //   (d) JSON-Schema header-only:   { <section>: { type:'object', required:[...] } }   ← CLO gap
  const out: RawField[] = [];
  for (const [key, sub] of Object.entries(schema)) {
    if (!isPlainObject(sub)) {
      mismatches.push(`form_schema.${key}: not an object; skipped`);
      continue;
    }
    if (looksLikeFieldDef(sub)) {
      // (a) — `key` is the field_id, `sub` is the field def.
      out.push({ field_id: key, raw: sub, required: sub.required === true });
      continue;
    }
    if (sub.type === 'object' && isPlainObject(sub.properties)) {
      // (c) — JSON-Schema section with explicit properties. Recurse with dot-prefix.
      out.push(...normaliseJsonSchema(sub, mismatches, `${key}.`));
      continue;
    }
    if (sub.type === 'object') {
      // (d) — JSON-Schema-style placeholder without enumerated properties. CLO needs
      // to fill `properties` for these sections; promoter cannot fabricate fields.
      mismatches.push(
        `form_schema.${key}: declared as type:'object' but no 'properties' enumerated; needs CLO fill-in`,
      );
      continue;
    }
    // (b) — plain nested-by-section: `sub` is a map of sub-field id → def.
    for (const [fieldKey, def] of Object.entries(sub)) {
      if (!isPlainObject(def)) {
        mismatches.push(`form_schema.${key}.${fieldKey}: not an object; skipped`);
        continue;
      }
      out.push({
        field_id: `${key}.${fieldKey}`,
        raw: def,
        required: def.required === true,
      });
    }
  }
  return out;
}

function normaliseFormSchema(
  fs: unknown,
  mismatches: string[],
): { fields: RawField[]; shape: string } {
  if (fs === undefined || fs === null) return { fields: [], shape: 'absent' };
  if (Array.isArray(fs)) return { fields: normaliseFlatList(fs, mismatches), shape: 'flat_list' };
  if (!isPlainObject(fs)) {
    mismatches.push(`form_schema: unsupported root shape (${typeof fs}); treated as empty`);
    return { fields: [], shape: 'unknown' };
  }
  // {fields: [...]}
  if (Array.isArray(fs.fields)) {
    return { fields: normaliseFlatList(fs.fields, mismatches), shape: 'dict_with_fields' };
  }
  // {steps: [{fields: [...]}]} — target shape already; flatten and carry through.
  if (Array.isArray(fs.steps)) {
    const fields: RawField[] = [];
    for (const step of fs.steps) {
      if (isPlainObject(step) && Array.isArray(step.fields)) {
        fields.push(...normaliseFlatList(step.fields, mismatches));
      }
    }
    return { fields, shape: 'stepped' };
  }
  // JSON Schema shape — {type:"object", properties:{...}, required:[...]}
  if (fs.type === 'object' && isPlainObject(fs.properties)) {
    return { fields: normaliseJsonSchema(fs, mismatches), shape: 'json_schema' };
  }
  // Fallback: assume nested-by-section
  return { fields: normaliseNestedSection(fs, mismatches), shape: 'nested_section' };
}

// ── Validation-rules normaliser ─────────────────────────────────────────────

function normaliseValidationRules(raw: unknown, mismatches: string[]): ValidationRules {
  if (isPlainObject(raw)) {
    return {
      section_codes_allowed: Array.isArray(raw.section_codes_allowed)
        ? (raw.section_codes_allowed as string[])
        : [],
      reject_old_codes: Array.isArray(raw.reject_old_codes)
        ? (raw.reject_old_codes as string[])
        : [],
      auto_convert_old_to_new: raw.auto_convert_old_to_new === true,
      mandatory_sections: Array.isArray(raw.mandatory_sections)
        ? (raw.mandatory_sections as string[])
        : [],
      fact_alteration_check: raw.fact_alteration_check === true,
      min_body_paragraphs:
        typeof raw.min_body_paragraphs === 'number' ? raw.min_body_paragraphs : undefined,
    };
  }
  if (Array.isArray(raw)) {
    // CLO writes free-text rules as `["purpose must be specified", ...]`. These are
    // human-readable acceptance criteria, not the structured target shape. Stash them
    // in mandatory_sections as a best-effort carry-over so they're not lost.
    return {
      section_codes_allowed: [],
      reject_old_codes: [],
      auto_convert_old_to_new: false,
      mandatory_sections: raw.filter((r): r is string => typeof r === 'string'),
      fact_alteration_check: false,
    };
  }
  if (raw !== undefined) {
    mismatches.push(`validation_rules: unsupported shape (${typeof raw}); defaulted to empty`);
  }
  return {
    section_codes_allowed: [],
    reject_old_codes: [],
    auto_convert_old_to_new: false,
    mandatory_sections: [],
    fact_alteration_check: false,
  };
}

// ── Document-structure synthesis (SCRUM-84) ─────────────────────────────────

/**
 * Build a renderable `document_structure.sections[]` array from the CLO source
 * fields. Without this, promoter-only templates land in the registry with
 * `sections: []` and the engine renders an empty document.
 *
 * Synthesis order — sections present in source appear in this order, absent
 * ones are skipped:
 *   1. cause_title  (template)      — `rule.causeTitle.format` (or string)
 *   2. body         (ai_generated)  — `prompt_context` + `promptInstructions[]`
 *                                     + `mandatoryClauses[]` enumerated as
 *                                     requirements (single AI call, not per-clause,
 *                                     to keep generation fast + cheap)
 *   3. prayer       (template)      — `rule.prayerTemplate`
 *   4. verification (template)      — `rule.verificationTemplate`
 *
 * Production overrides (`docs/templates/<id>.json`) still beat this synthesis
 * — the engine consults overrides first; this kicks in only for the 86
 * commodity templates.
 */
function extractCauseTitleFormat(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  if (isPlainObject(raw) && typeof raw.format === 'string' && raw.format.trim().length > 0) {
    return raw.format;
  }
  return null;
}

function buildBodyPrompt(rule: DocRuleSource): string | null {
  const parts: string[] = [];

  if (typeof rule.prompt_context === 'string' && rule.prompt_context.trim().length > 0) {
    parts.push(rule.prompt_context.trim());
  }

  if (Array.isArray(rule.promptInstructions) && rule.promptInstructions.length > 0) {
    const numbered = rule.promptInstructions
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s, i) => `${i + 1}. ${s.trim()}`);
    if (numbered.length > 0) {
      parts.push(`INSTRUCTIONS:\n${numbered.join('\n')}`);
    }
  }

  // mandatoryClauses (objects with name+description) OR mandatory_clauses (strings)
  const clauseLines: string[] = [];
  if (Array.isArray(rule.mandatoryClauses)) {
    for (const c of rule.mandatoryClauses) {
      if (isPlainObject(c)) {
        const name = typeof c.name === 'string' ? c.name : '';
        const description = typeof c.description === 'string' ? c.description : '';
        if (name || description)
          clauseLines.push(`- ${name}${name && description ? ': ' : ''}${description}`);
      }
    }
  }
  if (clauseLines.length === 0 && Array.isArray(rule.mandatory_clauses)) {
    for (const c of rule.mandatory_clauses) {
      if (typeof c === 'string' && c.trim().length > 0) clauseLines.push(`- ${c.trim()}`);
    }
  }
  if (clauseLines.length > 0) {
    parts.push(`MUST INCLUDE (mandatory clauses):\n${clauseLines.join('\n')}`);
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

type DocKind = 'court_application' | 'legal_notice' | 'agreement' | 'generic';

/**
 * Detect doc kind from the causeTitle prefix so the synthesiser emits the right
 * section IDs (a court application looks different from a legal notice from a
 * rent agreement, even though all three may share prayer + verification fields).
 */
function detectDocKind(causeTitle: string | null, displayName: string): DocKind {
  const probe = `${causeTitle ?? ''} ${displayName}`.toUpperCase();

  // Notary / oath commissioner affidavits — keep on the generic shape.
  if (/\bNOTARY\b/.test(probe) || /\bOATH\s+COMMISSIONER\b/.test(probe)) return 'generic';

  if (/\bLEGAL\s+NOTICE\b/.test(probe)) return 'legal_notice';

  if (/\b(AGREEMENT|DEED|LEASE|MOU|NDA|SPA|GIFT|PARTITION|MORTGAGE|SHAREHOLDERS)\b/.test(probe)) {
    return 'agreement';
  }

  // Anything that opens with "IN THE ..." or "BEFORE THE ..." (typical cause-title
  // form for a court-filed pleading), or names a court / tribunal / magistrate
  // / commission / forum, or whose displayName carries an obvious court-doc
  // verb (Complaint / Petition / Application / Appeal / Revision / Reference /
  // Writ / Vakalatnama / Affidavit-in-Support / Plaint / Written-Statement).
  if (
    /\bIN\s+THE\b/.test(probe) ||
    /\bBEFORE\s+THE\b/.test(probe) ||
    /\b(COURT|TRIBUNAL|MAGISTRATE|JUDGE|COMMISSION|FORUM)\b/.test(probe) ||
    /\b(COMPLAINT|PETITION|APPLICATION|APPEAL|REVISION|REFERENCE|WRIT|PLAINT|VAKALATNAMA|AFFIDAVIT[-\s]IN[-\s]SUPPORT|WRITTEN\s+STATEMENT|QUASHING)\b/.test(
      probe,
    )
  ) {
    return 'court_application';
  }

  return 'generic';
}

function synthesiseDocumentStructure(rule: DocRuleSource): DocumentSection[] {
  const sections: DocumentSection[] = [];

  const causeTitle = extractCauseTitleFormat(rule.causeTitle);
  const hasPrayer =
    typeof rule.prayerTemplate === 'string' && rule.prayerTemplate.trim().length > 0;
  const hasVerification =
    typeof rule.verificationTemplate === 'string' && rule.verificationTemplate.trim().length > 0;
  const displayName =
    (typeof rule.displayName === 'string' && rule.displayName) ||
    (typeof rule.title === 'string' && rule.title) ||
    '';

  const kind = detectDocKind(causeTitle, displayName);
  const bodyPrompt = buildBodyPrompt(rule);

  if (kind === 'legal_notice') {
    // Override shape: header → subject_line → body → demand_clause → closing.
    if (causeTitle) {
      sections.push({
        section_id: 'header',
        type: 'template',
        alignment: 'center',
        template: causeTitle,
      });
    }
    if (displayName) {
      sections.push({
        section_id: 'subject_line',
        type: 'template',
        alignment: 'left',
        template: `Subject: ${displayName}`,
      });
    }
    if (bodyPrompt) {
      sections.push({
        section_id: 'body',
        type: 'ai_generated',
        alignment: 'left',
        prompt_context: bodyPrompt,
        numbering: 'numeric',
        min_paragraphs: 4,
        max_paragraphs: 12,
      });
    }
    if (hasPrayer) {
      sections.push({
        section_id: 'demand_clause',
        type: 'template',
        alignment: 'left',
        template: rule.prayerTemplate as string,
      });
    }
    sections.push({
      section_id: 'closing',
      type: 'template',
      alignment: 'left',
      template: hasVerification
        ? (rule.verificationTemplate as string)
        : 'Yours faithfully,\n\n_________________________\n{advocate_name}\nAdvocate for {applicant_name}\nEnrollment No. {enrollment_number}\n\nPlace: {place}\nDate: {current_date}',
    });
    return sections;
  }

  if (kind === 'agreement') {
    // Override shape: header → recitals → body → closing.
    if (causeTitle) {
      sections.push({
        section_id: 'header',
        type: 'template',
        alignment: 'center',
        template: causeTitle,
      });
    }
    // Recitals from mandatoryClauses (each WHEREAS), if any.
    const clauseLines = Array.isArray(rule.mandatoryClauses)
      ? rule.mandatoryClauses
          .filter((c): c is { name?: string; description?: string } => isPlainObject(c))
          .map((c) => {
            const text = typeof c.description === 'string' ? c.description : (c.name ?? '');
            return text ? `WHEREAS ${text}` : '';
          })
          .filter((s) => s.length > 0)
      : [];
    if (clauseLines.length > 0) {
      sections.push({
        section_id: 'recitals',
        type: 'template',
        alignment: 'left',
        template: clauseLines.join(';\n\n') + '.',
      });
    }
    if (bodyPrompt) {
      sections.push({
        section_id: 'body',
        type: 'ai_generated',
        alignment: 'left',
        prompt_context: bodyPrompt,
        numbering: 'numeric',
        min_paragraphs: 6,
        max_paragraphs: 18,
      });
    }
    sections.push({
      section_id: 'closing',
      type: 'template',
      alignment: 'left',
      template: hasVerification
        ? (rule.verificationTemplate as string)
        : 'IN WITNESS WHEREOF, the parties hereto have set their hands on the day and year first above written.\n\n_________________________\nParty 1\n\n_________________________\nParty 2\n\nWITNESSES:\n1. _________________________\n2. _________________________',
    });
    return sections;
  }

  if (kind === 'court_application') {
    // Override shape: cause_title → application_heading → addressing_clause
    //                → body → prayer → verification → advocate_block.
    if (causeTitle) {
      sections.push({
        section_id: 'cause_title',
        type: 'template',
        alignment: 'center',
        template: causeTitle,
      });
    }
    if (displayName) {
      // Section ID mirrors the doc verb so the structural diff matches the
      // production override convention: "Consumer Complaint" → complaint_heading,
      // "Writ Petition" → petition_heading, otherwise application_heading.
      const headingId = /complaint/i.test(displayName)
        ? 'complaint_heading'
        : /petition/i.test(displayName)
          ? 'petition_heading'
          : /appeal/i.test(displayName)
            ? 'appeal_heading'
            : 'application_heading';
      sections.push({
        section_id: headingId,
        type: 'template',
        alignment: 'center',
        template: displayName.toUpperCase(),
      });
    }
    sections.push({
      section_id: 'addressing_clause',
      type: 'template',
      alignment: 'left',
      template: 'TO,\nTHE HON’BLE {court_designation},\n{court_city}\n\nMOST RESPECTFULLY SHOWETH:',
    });
    if (bodyPrompt) {
      sections.push({
        section_id: 'body',
        type: 'ai_generated',
        alignment: 'left',
        prompt_context: bodyPrompt,
        numbering: 'numeric',
        min_paragraphs: 5,
        max_paragraphs: 15,
      });
    }
    if (hasPrayer) {
      sections.push({
        section_id: 'prayer',
        type: 'template',
        alignment: 'left',
        template: rule.prayerTemplate as string,
      });
    }
    if (hasVerification) {
      sections.push({
        section_id: 'verification',
        type: 'template',
        alignment: 'left',
        template: rule.verificationTemplate as string,
      });
    }
    sections.push({
      section_id: 'advocate_block',
      type: 'template',
      alignment: 'right',
      template:
        'THROUGH:\n\n_________________________\n{advocate_name}\nAdvocate\nEnrollment No. {enrollment_number}\n\nPlace: {court_city}\nDate: {current_date}',
    });
    return sections;
  }

  // Generic — minimal cause_title + body + (prayer) + (verification).
  if (causeTitle) {
    sections.push({
      section_id: 'cause_title',
      type: 'template',
      alignment: 'center',
      template: causeTitle,
    });
  }
  if (bodyPrompt) {
    sections.push({
      section_id: 'body',
      type: 'ai_generated',
      alignment: 'left',
      prompt_context: bodyPrompt,
      numbering: 'numeric',
      min_paragraphs: 5,
      max_paragraphs: 15,
    });
  }
  if (hasPrayer) {
    sections.push({
      section_id: 'prayer',
      type: 'template',
      alignment: 'left',
      template: rule.prayerTemplate as string,
    });
  }
  if (hasVerification) {
    sections.push({
      section_id: 'verification',
      type: 'template',
      alignment: 'left',
      template: rule.verificationTemplate as string,
    });
  }
  return sections;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Promote a single doc-rule JSON object into a TemplateConfig.
 *
 * Never throws on a malformed source — every gap is captured in `mismatches` so the
 * caller can build a mismatch report. `sourceFile` is the bare filename (no path) and
 * is used both for fallback template_id derivation and for mismatch context lines.
 */
export function promoteDocRuleToTemplateConfig(
  rule: DocRuleSource,
  sourceFile: string,
): PromoterOutput {
  const mismatches: string[] = [];

  // template_id fallback to docType then filename (strip .json). This is a routine
  // normalisation, not a gap — don't pollute the mismatch report with it.
  const template_id =
    typeof rule.template_id === 'string' && rule.template_id.length > 0
      ? rule.template_id
      : typeof rule.docType === 'string' && rule.docType.length > 0
        ? rule.docType
        : sourceFile.replace(/\.json$/i, '');

  const display_name =
    (typeof rule.displayName === 'string' && rule.displayName) ||
    (typeof rule.title === 'string' && rule.title) ||
    humaniseId(template_id);

  const category =
    typeof rule.category === 'string' && rule.category.length > 0 ? rule.category : 'uncategorised';
  if (!rule.category) mismatches.push(`category: missing; defaulted to 'uncategorised'`);

  const description =
    typeof rule.description === 'string' && rule.description
      ? rule.description
      : isPlainObject(rule._meta) && typeof rule._meta.description === 'string'
        ? rule._meta.description
        : '';

  // form_schema → single synthetic step
  const { fields: rawFields, shape } = normaliseFormSchema(rule.form_schema, mismatches);
  const formFields: FormField[] = rawFields.map(({ field_id, raw, required }) => {
    const ctx = `${sourceFile}#${field_id}`;
    let fieldType = mapFieldType(raw.type, mismatches, ctx);
    const options = normaliseOptions(raw.options, mismatches, ctx);
    // JSON-Schema authors write {type: 'string', enum: [...]} for what is semantically
    // a dropdown. If we've parsed any options at all and landed on plain 'text', upgrade.
    if (options && options.length > 0 && fieldType === 'text') {
      fieldType = 'dropdown';
    }
    const field: FormField = {
      field_id,
      label:
        typeof raw.label === 'string'
          ? raw.label
          : typeof raw.title === 'string'
            ? raw.title
            : humaniseId(field_id),
      type: fieldType,
      required,
    };
    if (typeof raw.placeholder === 'string') field.placeholder = raw.placeholder;
    if (typeof raw.default === 'string') field.default = raw.default;
    if (options) field.options = options;
    if (typeof raw.show_if === 'string') field.show_if = raw.show_if;
    // SCRUM-79: CLO writes `depends_on` interchangeably with `show_if`. Carry over.
    if (typeof raw.depends_on === 'string') field.depends_on = raw.depends_on;
    if (Array.isArray(raw.inject_into) && raw.inject_into.every((v) => typeof v === 'string')) {
      field.inject_into = raw.inject_into as string[];
    }
    if (typeof raw.min_length === 'number') field.min_length = raw.min_length;
    if (typeof raw.max_length === 'number') field.max_length = raw.max_length;
    if (typeof raw.min_select === 'number') field.min_select = raw.min_select;
    // SCRUM-79: regex validation + currency/file extras.
    if (typeof raw.validation_pattern === 'string')
      field.validation_pattern = raw.validation_pattern;
    if (typeof raw.pattern === 'string' && !field.validation_pattern) {
      // JSON-Schema authors use `pattern` rather than `validation_pattern`.
      field.validation_pattern = raw.pattern;
    }
    if (typeof raw.validation_message === 'string')
      field.validation_message = raw.validation_message;
    if (typeof raw.help === 'string') field.help = raw.help;
    if (raw.multiple === true) field.multiple = true;
    if (typeof raw.accept === 'string') field.accept = raw.accept;
    return field;
  });

  const step: FormStep = {
    step: 1,
    title: display_name,
    fields: formFields,
  };

  // filing_checklist — pick whichever variant the doc has.
  const filingChecklist =
    Array.isArray(rule.filing_checklist) && rule.filing_checklist.length > 0
      ? rule.filing_checklist
      : Array.isArray(rule.filingChecklist)
        ? rule.filingChecklist
        : [];

  // related_acts — collapse CLO's structured shape down to a string list.
  const relatedActs: string[] = Array.isArray(rule.relevantActs)
    ? rule.relevantActs
        .map((a) => {
          if (typeof a === 'string') return a;
          if (isPlainObject(a) && typeof a.act === 'string') return a.act;
          return '';
        })
        .filter((s) => s.length > 0)
    : [];

  const config: TemplateConfig & {
    creditsCost?: number;
    _source?: Record<string, unknown>;
  } = {
    template_id,
    display_name,
    category,
    description,
    icon: 'file-text',
    plan_access: 'free',
    applicable_courts: {
      court_levels: Array.isArray(rule.court_levels) ? rule.court_levels : [],
      states: ['all'],
    },
    supported_languages: ['en'],
    form_schema: { steps: [step] },
    computed_fields: {},
    document_structure: { sections: synthesiseDocumentStructure(rule) },
    related_acts: relatedActs,
    special_prayer_additions: [],
    filing_checklist: filingChecklist,
    validation_rules: normaliseValidationRules(rule.validation_rules, mismatches),
    metadata: {
      version: '1.0.0',
      created_by: 'Ajay (CLO) — promoted from doc-rule',
      reviewed_at:
        (isPlainObject(rule._meta) && typeof rule._meta.last_updated === 'string'
          ? rule._meta.last_updated
          : '') || new Date().toISOString().slice(0, 10),
      status: 'active',
    },
  };

  // Preserve fields the engine doesn't model yet but downstream consumers (SCRUM-80
  // / SCRUM-81 golden-PDF compare / billing credit math) need to read.
  config.creditsCost = typeof rule.creditsCost === 'number' ? rule.creditsCost : 1;
  config._source = {
    sourceFile,
    formSchemaShape: shape,
    docType: rule.docType,
    parentDocType: rule.parentDocType,
    causeTitle: rule.causeTitle,
    mandatoryClauses: rule.mandatoryClauses ?? rule.mandatory_clauses,
    prayerTemplate: rule.prayerTemplate,
    verificationTemplate: rule.verificationTemplate,
    prompt_context: rule.prompt_context,
    promptInstructions: rule.promptInstructions,
    relevantActs: rule.relevantActs,
  };

  return { config, mismatches };
}

// ── Boot-time loader ────────────────────────────────────────────────────────

const DOC_RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const MISMATCH_REPORT_PATH = join(__dirname, '..', '..', 'template-promoter-mismatches.log');

/**
 * Walk apps/drafting/src/config/document-rules/ and promote every JSON.
 *
 * Returns an in-memory registry keyed by template_id, plus a flat mismatch report
 * (one line per gap with sourceFile context). Failing to read a single file does
 * not abort the rest of the walk.
 */
export function loadAllDocRules(dir: string = DOC_RULES_DIR): RegistryBuild {
  const configs = new Map<string, TemplateConfig>();
  const byFile = new Map<string, { template_id: string; mismatches: string[] }>();
  const mismatchReport: string[] = [];

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    mismatchReport.push(`Failed to read doc-rules dir ${dir}: ${(err as Error).message}`);
    return { configs, mismatchReport, byFile };
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const rule = JSON.parse(raw) as DocRuleSource;
      const { config, mismatches } = promoteDocRuleToTemplateConfig(rule, file);
      configs.set(config.template_id, config);
      byFile.set(file, { template_id: config.template_id, mismatches });
      for (const m of mismatches) mismatchReport.push(`[${file}] ${m}`);
    } catch (err) {
      mismatchReport.push(`[${file}] parse/promote failed: ${(err as Error).message}`);
    }
  }

  return { configs, mismatchReport, byFile };
}

/**
 * Persist the mismatch report alongside the drafting service.
 *
 * Returns the path written to, or null if the report was empty.
 */
export function writeMismatchReport(
  report: string[],
  path: string = MISMATCH_REPORT_PATH,
): string | null {
  if (report.length === 0) return null;
  const header = `# Template-Promoter mismatch report — ${new Date().toISOString()}\n# ${report.length} gap(s) logged across the doc-rules directory.\n`;
  writeFileSync(path, header + report.join('\n') + '\n', 'utf-8');
  return path;
}

// In-memory singleton — populated lazily on first access so unit tests can stub
// the directory without paying a disk-walk cost at import time.
let cachedRegistry: RegistryBuild | null = null;

export function getTemplateRegistry(): RegistryBuild {
  if (cachedRegistry === null) {
    cachedRegistry = loadAllDocRules();
    const reportPath = writeMismatchReport(cachedRegistry.mismatchReport);
    logger.info(
      {
        templateCount: cachedRegistry.configs.size,
        mismatchCount: cachedRegistry.mismatchReport.length,
        mismatchReportPath: reportPath,
      },
      'Template promoter: doc-rules registry built',
    );
  }
  return cachedRegistry;
}

/** For tests — drop the cached registry so subsequent calls re-read disk. */
export function clearTemplateRegistryCache(): void {
  cachedRegistry = null;
}
