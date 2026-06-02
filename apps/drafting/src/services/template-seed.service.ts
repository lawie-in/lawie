/**
 * Template seed service — one-way filesystem → Mongo sync (SCRUM-80, ADR-018).
 *
 * On boot, walks the SCRUM-78 in-memory registry (which itself is built from
 * `apps/drafting/src/config/document-rules/*.json`) and reconciles the
 * `templates` Mongo collection against it:
 *
 *   - templateId in registry but not in DB                → INSERT
 *   - templateId in DB but no longer in registry          → mark isActive: false
 *     (do not delete — preserves referential integrity with TemplateUsage rows)
 *   - templateId in both, same content                    → no-op
 *   - templateId in both, content drift                   → UPDATE
 *
 * Idempotency: running boot twice in a row produces zero writes on the second
 * pass (verified by the integration test). The diff is computed against a
 * stable JSON snapshot stored alongside each record (`source.contentHash`).
 *
 * Never call from app code other than boot — Template is a read-through cache.
 */
import crypto from 'crypto';

import logger from '../config/logger';
import { Template } from '../models/Template.model';

import type { TemplateConfig } from './template-engine.service';
import { getTemplateRegistry, type RegistryBuild } from './template-promoter';

/** A TemplateConfig as it actually lives on the registry, with promoter extensions. */
type RegistryEntry = TemplateConfig & {
  creditsCost?: number;
  _source?: Record<string, unknown>;
};

interface SyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
}

/**
 * Stable hash of the fields we mirror to Mongo. Keys are sorted before JSON
 * serialisation so two semantically-equal configs hash identically regardless
 * of property-insertion order.
 */
function hashRegistryEntry(entry: RegistryEntry): string {
  const projection = {
    template_id: entry.template_id,
    display_name: entry.display_name,
    category: entry.category,
    description: entry.description,
    icon: entry.icon,
    plan_access: entry.plan_access,
    applicable_courts: entry.applicable_courts,
    supported_languages: entry.supported_languages,
    creditsCost: entry.creditsCost ?? 1,
    form_schema: entry.form_schema,
    document_structure: entry.document_structure,
    validation_rules: entry.validation_rules,
    related_acts: entry.related_acts,
    filing_checklist: entry.filing_checklist,
    metadata: entry.metadata,
    source: entry._source,
  };
  const stable = JSON.stringify(projection, Object.keys(projection).sort());
  return crypto.createHash('sha256').update(stable).digest('hex');
}

function toDocument(entry: RegistryEntry): Record<string, unknown> {
  const source: Record<string, unknown> = { ...(entry._source ?? {}) };
  source.contentHash = hashRegistryEntry(entry);
  return {
    templateId: entry.template_id,
    slug: entry.template_id,
    displayName: entry.display_name,
    category: entry.category,
    description: entry.description,
    icon: entry.icon ?? 'file-text',
    planAccess: entry.plan_access ?? 'free',
    courtLevels: entry.applicable_courts?.court_levels ?? [],
    states: entry.applicable_courts?.states ?? ['all'],
    supportedLanguages: entry.supported_languages ?? ['en'],
    creditsCost: entry.creditsCost ?? 1,
    formSchema: entry.form_schema,
    documentStructure: entry.document_structure,
    validationRules: entry.validation_rules,
    relatedActs: entry.related_acts,
    filingChecklist: entry.filing_checklist,
    metadata: entry.metadata,
    source,
    sourceFile:
      typeof entry._source?.sourceFile === 'string' ? (entry._source.sourceFile as string) : '',
    isActive: true,
    promotedAt: new Date(),
  };
}

/**
 * Reconcile the Template collection with the in-memory registry. Returns
 * counts so the caller can log a clean one-liner at boot time.
 */
export async function syncTemplateRegistry(
  registry: RegistryBuild = getTemplateRegistry(),
): Promise<SyncResult> {
  const result: SyncResult = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0 };

  // Pull current DB state once — we only need templateId + the stored contentHash
  // to decide which rows to touch. Pre-SCRUM-80 rows may lack `templateId`; fall
  // back to `slug` so we can still detect and deactivate them.
  const existing = await Template.find(
    {},
    { templateId: 1, slug: 1, 'source.contentHash': 1, isActive: 1, _id: 0 },
  ).lean();
  const existingByKey = new Map<string, { contentHash?: string; isActive: boolean }>();
  for (const row of existing) {
    const key = row.templateId ?? row.slug;
    if (!key) continue;
    existingByKey.set(key, {
      contentHash:
        typeof row.source === 'object' && row.source && 'contentHash' in row.source
          ? (row.source as { contentHash?: string }).contentHash
          : undefined,
      isActive: row.isActive ?? true,
    });
  }

  const seen = new Set<string>();

  for (const entry of registry.configs.values()) {
    const typed = entry as RegistryEntry;
    seen.add(typed.template_id);
    const incomingHash = hashRegistryEntry(typed);
    const prior = existingByKey.get(typed.template_id);

    if (!prior) {
      await Template.create(toDocument(typed));
      result.inserted++;
      continue;
    }
    if (prior.contentHash === incomingHash && prior.isActive) {
      result.unchanged++;
      continue;
    }
    await Template.updateOne(
      { templateId: typed.template_id },
      { $set: toDocument(typed) },
      { runValidators: true },
    );
    result.updated++;
  }

  // Anything in the DB but no longer in the registry → mark inactive (preserve
  // row). Match on `templateId` OR `slug` so pre-SCRUM-80 rows (which lack
  // templateId entirely) still get caught.
  for (const [key, prior] of existingByKey) {
    if (seen.has(key)) continue;
    if (!prior.isActive) continue;
    await Template.updateOne(
      { $or: [{ templateId: key }, { slug: key }] },
      { $set: { isActive: false } },
    );
    result.deactivated++;
  }

  return result;
}

/**
 * Boot hook — wraps syncTemplateRegistry() with a one-line log line. Errors
 * here should NOT crash the service (catalog can still be served from the
 * in-memory registry as a fallback); they are logged at error level instead.
 */
export async function runBootSync(): Promise<SyncResult | null> {
  try {
    const result = await syncTemplateRegistry();
    logger.info({ ...result }, 'Template registry → Mongo sync complete');
    return result;
  } catch (err) {
    logger.error({ err }, 'Template registry sync failed — serving in-memory fallback');
    return null;
  }
}
