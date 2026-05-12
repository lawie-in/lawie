/**
 * SCRUM-80 — template-seed integration tests.
 *
 * Acceptance:
 *   - App boot populates 92 Template records
 *   - Running boot twice is idempotent (no extra writes / no version churn)
 *   - Manual file edit triggers re-seed on next boot
 *   - Removing a doc-rule on disk marks the row inactive (no destructive delete)
 */
import './setupDb';

import { Template } from '../models/Template.model';
import { clearTemplateRegistryCache } from '../services/template-promoter';
import { syncTemplateRegistry } from '../services/template-seed.service';
import type { TemplateConfig } from '../services/template-engine.service';

function fakeRegistry(entries: Array<Partial<TemplateConfig> & { template_id: string }>) {
  const configs = new Map<string, TemplateConfig>();
  for (const e of entries) {
    configs.set(e.template_id, {
      template_id: e.template_id,
      display_name: e.display_name ?? e.template_id,
      category: e.category ?? 'criminal',
      description: e.description ?? '',
      icon: e.icon ?? 'file-text',
      plan_access: e.plan_access ?? 'free',
      applicable_courts: e.applicable_courts ?? { court_levels: [], states: ['all'] },
      supported_languages: e.supported_languages ?? ['en'],
      form_schema: e.form_schema ?? { steps: [] },
      computed_fields: e.computed_fields ?? {},
      document_structure: e.document_structure ?? { sections: [] },
      related_acts: e.related_acts ?? [],
      special_prayer_additions: e.special_prayer_additions ?? [],
      filing_checklist: e.filing_checklist ?? [],
      validation_rules: e.validation_rules ?? {
        section_codes_allowed: [],
        reject_old_codes: [],
        auto_convert_old_to_new: false,
        mandatory_sections: [],
        fact_alteration_check: false,
      },
      metadata: e.metadata ?? {
        version: '1.0.0',
        created_by: 'test',
        reviewed_at: '2026-05-12',
        status: 'active',
      },
      ...({ _source: { sourceFile: `${e.template_id}.json` } } as object),
    } as TemplateConfig);
  }
  return { configs, mismatchReport: [], byFile: new Map() };
}

describe('template-seed.service — syncTemplateRegistry', () => {
  beforeEach(async () => {
    clearTemplateRegistryCache();
    await Template.syncIndexes();
  });

  it('inserts every registry entry into an empty Template collection', async () => {
    const registry = fakeRegistry([
      { template_id: 'bail_anticipatory', display_name: 'Anticipatory Bail', category: 'criminal' },
      { template_id: 'rent_agreement', display_name: 'Rent Agreement', category: 'civil' },
    ]);
    const result = await syncTemplateRegistry(registry);
    expect(result.inserted).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.deactivated).toBe(0);
    const dbCount = await Template.countDocuments();
    expect(dbCount).toBe(2);
  });

  it('is idempotent — running twice produces zero writes on the second pass', async () => {
    const registry = fakeRegistry([
      { template_id: 'bail_anticipatory', display_name: 'Anticipatory Bail' },
      { template_id: 'rent_agreement', display_name: 'Rent Agreement' },
    ]);
    await syncTemplateRegistry(registry);
    const second = await syncTemplateRegistry(registry);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(2);
    expect(second.deactivated).toBe(0);
  });

  it('updates an existing row when the registry content changes', async () => {
    const before = fakeRegistry([{ template_id: 'bail_anticipatory', display_name: 'Old Name' }]);
    await syncTemplateRegistry(before);
    const after = fakeRegistry([
      { template_id: 'bail_anticipatory', display_name: 'New Polished Name' },
    ]);
    const result = await syncTemplateRegistry(after);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(0);
    const row = await Template.findOne({ templateId: 'bail_anticipatory' }).lean();
    expect(row!.displayName).toBe('New Polished Name');
  });

  it('deactivates rows whose template_id disappeared from the registry', async () => {
    const before = fakeRegistry([
      { template_id: 'bail_anticipatory' },
      { template_id: 'rent_agreement' },
      { template_id: 'legal_notice_s138' },
    ]);
    await syncTemplateRegistry(before);
    const after = fakeRegistry([{ template_id: 'bail_anticipatory' }]);
    const result = await syncTemplateRegistry(after);
    expect(result.deactivated).toBe(2);
    expect(result.unchanged).toBe(1);
    const inactive = await Template.find({ isActive: false }).lean();
    expect(inactive.map((r) => r.templateId).sort()).toEqual([
      'legal_notice_s138',
      'rent_agreement',
    ]);
  });

  it('re-activates a row if its template_id reappears in the registry', async () => {
    await syncTemplateRegistry(fakeRegistry([{ template_id: 'bail_anticipatory' }]));
    // First pass — deactivate it.
    await syncTemplateRegistry(fakeRegistry([]));
    expect((await Template.findOne({ templateId: 'bail_anticipatory' }).lean())!.isActive).toBe(
      false,
    );
    // Reappear — sync should flip it back active via the update path.
    const result = await syncTemplateRegistry(fakeRegistry([{ template_id: 'bail_anticipatory' }]));
    expect(result.updated).toBe(1);
    const row = await Template.findOne({ templateId: 'bail_anticipatory' }).lean();
    expect(row!.isActive).toBe(true);
  });

  it('writes a contentHash on source so future syncs can short-circuit cleanly', async () => {
    await syncTemplateRegistry(fakeRegistry([{ template_id: 'bail_anticipatory' }]));
    const row = await Template.findOne({ templateId: 'bail_anticipatory' }).lean();
    expect((row!.source as { contentHash?: string }).contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
