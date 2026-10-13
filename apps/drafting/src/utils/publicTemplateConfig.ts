import type { TemplateConfig, TemplateSummary } from '../services/template-engine.service';

import { cardDescriptionFor } from './cardDescription';

/**
 * T-385: the one projection every template-facing route sends to the browser.
 *
 * An allowlist: only the keys the web reads leave the service. Pack-level
 * `_source`, `document_structure` (section prompt_context, clause notes),
 * `computed_fields`, `validation_rules`, `metadata` and the internal
 * `description` never do. `description` is always the signed card line
 * (cardDescriptionFor, T-365 AC6).
 *
 * The loader hands back cached registry objects, so every function here builds
 * new objects and never mutates its input.
 *
 * The field-level `source` key (courts_db.*, bns_mapping) stays: the web form
 * renderer reads it (Arjun, 13 Oct 2026).
 */

/** Top-level keys of GET /documents/template-configs/:id `config`. */
export const PUBLIC_TEMPLATE_CONFIG_KEYS = [
  'template_id',
  'display_name',
  'description',
  'supported_languages',
  'plan_access',
  'catalogueCategory',
  'form_schema',
] as const;

/** Keys of `form_schema`. */
export const PUBLIC_FORM_SCHEMA_KEYS = ['steps'] as const;

/** Keys of each `form_schema.steps[]` entry. */
export const PUBLIC_FORM_STEP_KEYS = ['step', 'title', 'fields'] as const;

/** Keys of each `form_schema.steps[].fields[]` entry: what DynamicFormRenderer reads. */
export const PUBLIC_FORM_FIELD_KEYS = [
  'field_id',
  'label',
  'type',
  'required',
  'placeholder',
  'default',
  'options',
  'options_from',
  'source',
  'show_if',
  'depends_on',
  'cascades_to',
  'filtered_by',
  'min_length',
  'max_length',
  'min_select',
  'validation_pattern',
  'validation_message',
  'multiple',
  'accept',
  'help',
] as const;

/** Keys of each `fields[].options[]` entry. */
export const PUBLIC_FIELD_OPTION_KEYS = ['id', 'label'] as const;

/** Keys of each GET /documents/template-configs `templates[]` row. */
export const PUBLIC_TEMPLATE_SUMMARY_KEYS = [
  'template_id',
  'display_name',
  'category',
  'catalogueCategory',
  'catalogueCategoryName',
  'catalogueCategoryOrder',
  'description',
  'icon',
  'plan_access',
  'supported_languages',
  'credits_cost',
] as const;

/** Keys of each GET /templates `templates[]` row (Mongo camelCase rows). */
export const PUBLIC_TEMPLATE_ROW_KEYS = [
  'templateId',
  'slug',
  'displayName',
  'category',
  'catalogueCategory',
  'icon',
  'planAccess',
  'supportedLanguages',
  'creditsCost',
  'description',
] as const;

type Primitive = string | number | boolean | null;

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * A copy of `value` when it is a primitive or an array of primitives;
 * undefined otherwise, so no nested object can carry a key past the allowlist.
 */
function plainValue(value: unknown): Primitive | Primitive[] | undefined {
  if (isPrimitive(value)) return value;
  if (Array.isArray(value) && value.every(isPrimitive)) return [...value];
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function pickOption(option: unknown): { id: unknown; label: unknown } | undefined {
  if (!option || typeof option !== 'object') return undefined;
  const { id, label } = option as Record<string, unknown>;
  return { id: plainValue(id), label: plainValue(label) };
}

function pickField(field: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!field || typeof field !== 'object') return out;
  const source = field as Record<string, unknown>;
  for (const key of PUBLIC_FORM_FIELD_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    if (key === 'options') {
      if (Array.isArray(value)) {
        out.options = value
          .map(pickOption)
          .filter((o): o is { id: unknown; label: unknown } => o !== undefined);
      }
      continue;
    }
    const copy = plainValue(value);
    if (copy !== undefined) out[key] = copy;
  }
  return out;
}

function pickStep(step: unknown): Record<string, unknown> {
  const source = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>;
  return {
    step: plainValue(source.step),
    title: plainValue(source.title),
    fields: Array.isArray(source.fields) ? source.fields.map(pickField) : [],
  };
}

export interface PublicTemplateConfig {
  template_id: string;
  display_name: string;
  description: string;
  supported_languages: string[];
  plan_access: TemplateConfig['plan_access'];
  catalogueCategory?: TemplateConfig['catalogueCategory'];
  form_schema: { steps: Array<Record<string, unknown>> };
}

/** T-385: the detail config the form renderer needs, and nothing else. */
export function publicTemplateConfig(config: TemplateConfig): PublicTemplateConfig {
  const steps = Array.isArray(config.form_schema?.steps) ? config.form_schema.steps : [];
  return {
    template_id: config.template_id,
    display_name: config.display_name,
    description: cardDescriptionFor(config.template_id),
    supported_languages: stringArray(config.supported_languages),
    plan_access: config.plan_access,
    ...(config.catalogueCategory !== undefined
      ? { catalogueCategory: config.catalogueCategory }
      : {}),
    form_schema: { steps: steps.map(pickStep) },
  };
}

export type PublicTemplateSummary = Omit<TemplateSummary, 'metadata'> & { credits_cost?: number };

/**
 * T-385: one row of the template-configs list. `credits_cost` (T-372) passes
 * through when the caller set it on the input; `metadata` never does.
 */
export function publicTemplateSummary(
  summary: TemplateSummary & { credits_cost?: number },
): PublicTemplateSummary {
  return {
    template_id: summary.template_id,
    display_name: summary.display_name,
    category: summary.category,
    catalogueCategory: summary.catalogueCategory,
    catalogueCategoryName: summary.catalogueCategoryName,
    catalogueCategoryOrder: summary.catalogueCategoryOrder,
    description: cardDescriptionFor(summary.template_id),
    icon: summary.icon,
    plan_access: summary.plan_access,
    supported_languages: stringArray(summary.supported_languages),
    ...(typeof summary.credits_cost === 'number' ? { credits_cost: summary.credits_cost } : {}),
  };
}

export interface TemplateRowInput {
  templateId: string;
  slug: string;
  displayName: string;
  /** The behaviour category; the web's catalogue fallback (t240 asserts it). */
  category: string;
  catalogueCategory: string;
  icon: string;
  planAccess: 'free' | 'pro';
  supportedLanguages: string[];
  creditsCost: number;
}

export type PublicTemplateRow = TemplateRowInput & { description: string };

/** T-385: one row of GET /templates (card keys only, Mongo camelCase). */
export function publicTemplateRow(row: TemplateRowInput): PublicTemplateRow {
  return {
    templateId: row.templateId,
    slug: row.slug,
    displayName: row.displayName,
    category: row.category,
    catalogueCategory: row.catalogueCategory,
    icon: row.icon,
    planAccess: row.planAccess,
    supportedLanguages: stringArray(row.supportedLanguages),
    creditsCost: row.creditsCost,
    // T-365 AC6: the signed card line only; '' when the pack has none.
    description: cardDescriptionFor(row.templateId),
  };
}
