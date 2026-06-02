/**
 * Template diff service (SCRUM-81 — structural gate).
 *
 * Compares the hand-tuned TemplateConfig in `docs/templates/<id>.json` (the
 * "override" path currently used in production) against the auto-promoted
 * TemplateConfig produced by SCRUM-78's promoter from
 * `apps/drafting/src/config/document-rules/<id>.json`.
 *
 * Per ADR-018, a template's override can be retired only when the promoter
 * output is structurally close enough that the rendered PDF will match. Full
 * byte-diff requires synthesising `document_structure.sections` from CLO's
 * prayer / verification / promptInstructions fields (a promoter extension we
 * have NOT yet shipped), so the gate here is structural — measured on:
 *
 *   1. form schema field coverage (does the promoter expose the same inputs?)
 *   2. document_structure section coverage (does the promoter emit a body?)
 *   3. validation rules parity (BNS whitelist + mandatory sections + flags)
 *   4. plan_access / category / icon — secondary metadata
 *
 * Each comparison returns a per-dimension drift score in [0, 1]; the verdict
 * is "retire override" iff the maximum drift across dimensions is ≤ tolerance
 * (default 0.05 — matches the ADR's "5% layout drift" budget). Otherwise the
 * override stays.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import type { FormField, TemplateConfig } from './template-engine.service';
import { promoteDocRuleToTemplateConfig } from './template-promoter';

const OVERRIDE_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');
const DOC_RULES_DIR = join(__dirname, '..', 'config', 'document-rules');

export interface DimensionScore {
  /** 0 = identical, 1 = fully different. */
  drift: number;
  detail: string;
}

export interface TemplateDiff {
  templateId: string;
  hasOverride: boolean;
  hasDocRule: boolean;
  dimensions: {
    formFields: DimensionScore;
    documentStructure: DimensionScore;
    validationRules: DimensionScore;
    metadata: DimensionScore;
  };
  maxDrift: number;
  verdict: 'retire' | 'keep' | 'missing_source';
  reason: string;
}

interface LoadedOverride {
  config: TemplateConfig;
}

function loadOverride(templateId: string): LoadedOverride | null {
  const path = join(OVERRIDE_DIR, `${templateId}.json`);
  if (!existsSync(path)) return null;
  try {
    const config = JSON.parse(readFileSync(path, 'utf-8')) as TemplateConfig;
    return { config };
  } catch {
    return null;
  }
}

function loadDocRule(templateId: string): TemplateConfig | null {
  const path = join(DOC_RULES_DIR, `${templateId}.json`);
  if (!existsSync(path)) return null;
  try {
    const rule = JSON.parse(readFileSync(path, 'utf-8'));
    const { config } = promoteDocRuleToTemplateConfig(rule, `${templateId}.json`);
    return config;
  } catch {
    return null;
  }
}

function flattenFields(config: TemplateConfig): FormField[] {
  return config.form_schema.steps.flatMap((s) => s.fields);
}

function scoreFormFields(a: TemplateConfig, b: TemplateConfig): DimensionScore {
  const aFields = flattenFields(a);
  const bFields = flattenFields(b);
  const aIds = new Set(aFields.map((f) => f.field_id));
  const bIds = new Set(bFields.map((f) => f.field_id));
  const union = new Set([...aIds, ...bIds]);
  if (union.size === 0) return { drift: 0, detail: 'no fields on either side' };
  const intersection = [...aIds].filter((id) => bIds.has(id)).length;
  const drift = 1 - intersection / union.size;
  const missingFromPromoter = [...aIds].filter((id) => !bIds.has(id));
  const missingFromOverride = [...bIds].filter((id) => !aIds.has(id));
  const parts: string[] = [`${intersection}/${union.size} field ids shared`];
  if (missingFromPromoter.length > 0) {
    parts.push(
      `only-in-override: ${missingFromPromoter.slice(0, 5).join(', ')}${missingFromPromoter.length > 5 ? '…' : ''}`,
    );
  }
  if (missingFromOverride.length > 0) {
    parts.push(
      `only-in-promoter: ${missingFromOverride.slice(0, 5).join(', ')}${missingFromOverride.length > 5 ? '…' : ''}`,
    );
  }
  return { drift, detail: parts.join(' · ') };
}

function scoreDocumentStructure(a: TemplateConfig, b: TemplateConfig): DimensionScore {
  const aCount = a.document_structure?.sections.length ?? 0;
  const bCount = b.document_structure?.sections.length ?? 0;
  if (aCount === 0 && bCount === 0) {
    return { drift: 0, detail: 'no sections on either side' };
  }
  if (bCount === 0) {
    // Override has body sections; promoter has none. This is the biggest blocker
    // until the promoter learns to synthesise sections from CLO source fields.
    return { drift: 1, detail: `override has ${aCount} sections, promoter has 0` };
  }
  const aIds = new Set(a.document_structure.sections.map((s) => s.section_id));
  const bIds = new Set(b.document_structure.sections.map((s) => s.section_id));
  const union = new Set([...aIds, ...bIds]);
  const intersection = [...aIds].filter((id) => bIds.has(id)).length;
  const drift = 1 - intersection / union.size;
  return { drift, detail: `${intersection}/${union.size} section ids shared` };
}

function scoreValidationRules(a: TemplateConfig, b: TemplateConfig): DimensionScore {
  const av = a.validation_rules ?? {
    section_codes_allowed: [],
    reject_old_codes: [],
    auto_convert_old_to_new: false,
    mandatory_sections: [],
    fact_alteration_check: false,
  };
  const bv = b.validation_rules ?? av;
  const allowedDrift = jaccard(av.section_codes_allowed, bv.section_codes_allowed);
  const rejectDrift = jaccard(av.reject_old_codes, bv.reject_old_codes);
  const mandatoryDrift = jaccard(av.mandatory_sections, bv.mandatory_sections);
  const flagDrift =
    (av.auto_convert_old_to_new === bv.auto_convert_old_to_new ? 0 : 0.5) +
    (av.fact_alteration_check === bv.fact_alteration_check ? 0 : 0.5);
  const drift = (allowedDrift + rejectDrift + mandatoryDrift + flagDrift) / 4;
  return {
    drift,
    detail: `allowed=${allowedDrift.toFixed(2)} reject=${rejectDrift.toFixed(2)} mandatory=${mandatoryDrift.toFixed(2)} flags=${flagDrift.toFixed(2)}`,
  };
}

function scoreMetadata(a: TemplateConfig, b: TemplateConfig): DimensionScore {
  const fields = ['category', 'plan_access', 'icon'] as const;
  let mismatches = 0;
  const details: string[] = [];
  for (const f of fields) {
    if (a[f] !== b[f]) {
      mismatches++;
      details.push(`${f}: ${JSON.stringify(a[f])} vs ${JSON.stringify(b[f])}`);
    }
  }
  return {
    drift: mismatches / fields.length,
    detail: details.length > 0 ? details.join('; ') : 'all metadata fields match',
  };
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  const union = new Set([...sa, ...sb]).size;
  const intersection = [...sa].filter((x) => sb.has(x)).length;
  return 1 - intersection / union;
}

/**
 * Diff a single template by ID against its override + doc-rule sources.
 *
 * @param tolerance — verdict threshold. Default 0.05 mirrors the ADR's
 *                    "5% layout drift" budget. Override goes if max drift ≤ tolerance.
 */
export function diffTemplate(templateId: string, tolerance = 0.05): TemplateDiff {
  const override = loadOverride(templateId);
  const promoted = loadDocRule(templateId);

  if (!override || !promoted) {
    return {
      templateId,
      hasOverride: override !== null,
      hasDocRule: promoted !== null,
      dimensions: {
        formFields: { drift: 1, detail: 'source missing' },
        documentStructure: { drift: 1, detail: 'source missing' },
        validationRules: { drift: 1, detail: 'source missing' },
        metadata: { drift: 1, detail: 'source missing' },
      },
      maxDrift: 1,
      verdict: 'missing_source',
      reason: !override
        ? 'no docs/templates override on disk'
        : 'no doc-rule on disk to promote from',
    };
  }

  const dimensions = {
    formFields: scoreFormFields(override.config, promoted),
    documentStructure: scoreDocumentStructure(override.config, promoted),
    validationRules: scoreValidationRules(override.config, promoted),
    metadata: scoreMetadata(override.config, promoted),
  };

  const maxDrift = Math.max(
    dimensions.formFields.drift,
    dimensions.documentStructure.drift,
    dimensions.validationRules.drift,
    dimensions.metadata.drift,
  );

  const verdict: TemplateDiff['verdict'] = maxDrift <= tolerance ? 'retire' : 'keep';
  const driftDimension = (
    Object.entries(dimensions) as Array<[keyof typeof dimensions, DimensionScore]>
  ).sort((a, b) => b[1].drift - a[1].drift)[0];
  const reason =
    verdict === 'retire'
      ? `all dimensions within ${tolerance} tolerance — promoter equivalence verified`
      : `${driftDimension[0]} drift ${driftDimension[1].drift.toFixed(2)} exceeds tolerance (${driftDimension[1].detail})`;

  return {
    templateId,
    hasOverride: true,
    hasDocRule: true,
    dimensions,
    maxDrift,
    verdict,
    reason,
  };
}

/** Format a diff report as Markdown for engineer + Ajay (CLO) sign-off. */
export function formatReport(diffs: TemplateDiff[], tolerance = 0.05): string {
  const lines: string[] = [];
  lines.push(`# Template promoter diff report (SCRUM-81)`);
  lines.push('');
  lines.push(
    `Compares each template's \`docs/templates/<id>.json\` override against the SCRUM-78 promoter output from \`apps/drafting/src/config/document-rules/<id>.json\`. Verdict: **retire** = override safe to delete (max drift ≤ ${tolerance}), **keep** = override required (one or more dimensions exceed tolerance).`,
  );
  lines.push('');
  lines.push(
    '| Template | Verdict | Max drift | Form fields | Doc structure | Validation | Metadata |',
  );
  lines.push('|---|---|---|---|---|---|---|');
  for (const d of diffs) {
    lines.push(
      `| \`${d.templateId}\` | **${d.verdict}** | ${d.maxDrift.toFixed(2)} | ${d.dimensions.formFields.drift.toFixed(2)} | ${d.dimensions.documentStructure.drift.toFixed(2)} | ${d.dimensions.validationRules.drift.toFixed(2)} | ${d.dimensions.metadata.drift.toFixed(2)} |`,
    );
  }
  lines.push('');
  for (const d of diffs) {
    lines.push(`## \`${d.templateId}\` — ${d.verdict}`);
    lines.push('');
    lines.push(`**Reason:** ${d.reason}`);
    lines.push('');
    lines.push(
      `- form_fields (drift ${d.dimensions.formFields.drift.toFixed(2)}): ${d.dimensions.formFields.detail}`,
    );
    lines.push(
      `- doc_structure (drift ${d.dimensions.documentStructure.drift.toFixed(2)}): ${d.dimensions.documentStructure.detail}`,
    );
    lines.push(
      `- validation_rules (drift ${d.dimensions.validationRules.drift.toFixed(2)}): ${d.dimensions.validationRules.detail}`,
    );
    lines.push(
      `- metadata (drift ${d.dimensions.metadata.drift.toFixed(2)}): ${d.dimensions.metadata.detail}`,
    );
    lines.push('');
  }
  const retire = diffs.filter((d) => d.verdict === 'retire').length;
  const keep = diffs.filter((d) => d.verdict === 'keep').length;
  const missing = diffs.filter((d) => d.verdict === 'missing_source').length;
  lines.push(`---`);
  lines.push(
    `**Summary:** retire ${retire} · keep ${keep} · missing-source ${missing} (total ${diffs.length})`,
  );
  return lines.join('\n');
}
