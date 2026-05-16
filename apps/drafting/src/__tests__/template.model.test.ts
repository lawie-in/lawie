import './setupDb';

import { Template } from '../models/Template.model';

/**
 * SCRUM-80 / ADR-018 — Template is now a read-through cache of the filesystem
 * doc-rules registry. The schema is intentionally loose (no rigid category /
 * docType / courtType enums) so future CLO doc types ship without migrations.
 *
 * These tests cover only what the model still validates strictly:
 *   - templateId / slug / displayName / sourceFile required
 *   - templateId + slug unique
 *   - planAccess restricted to free|pro
 *   - defaults applied for optional fields
 */
describe('Template model — loose schema (SCRUM-80)', () => {
  const valid = {
    templateId: 'bail_anticipatory',
    slug: 'bail_anticipatory',
    displayName: 'Anticipatory Bail Application',
    category: 'criminal',
    description: 'Anticipatory bail under BNSS 482',
    sourceFile: 'bail_anticipatory.json',
  };

  it('creates a template with minimal required fields and applies defaults', async () => {
    const tpl = await Template.create(valid);
    expect(tpl.templateId).toBe(valid.templateId);
    expect(tpl.slug).toBe(valid.slug);
    expect(tpl.displayName).toBe(valid.displayName);
    expect(tpl.planAccess).toBe('free');
    expect(tpl.icon).toBe('file-text');
    expect(tpl.creditsCost).toBe(1);
    expect(tpl.states).toEqual(['all']);
    expect(tpl.supportedLanguages).toEqual(['en']);
    expect(tpl.isActive).toBe(true);
  });

  it('accepts CLO-authored category strings outside the legacy enum', async () => {
    const tpl = await Template.create({
      ...valid,
      category: 'non_court_legal_document',
    });
    expect(tpl.category).toBe('non_court_legal_document');
  });

  it('rejects missing templateId', async () => {
    await expect(Template.create({ ...valid, templateId: undefined })).rejects.toThrow(
      /templateId.*required/i,
    );
  });

  it('rejects missing displayName', async () => {
    await expect(
      Template.create({ ...valid, templateId: 'x', slug: 'x', displayName: undefined }),
    ).rejects.toThrow(/displayName.*required/i);
  });

  it('rejects missing sourceFile', async () => {
    await expect(
      Template.create({ ...valid, templateId: 'y', slug: 'y', sourceFile: undefined }),
    ).rejects.toThrow(/sourceFile.*required/i);
  });

  it('enforces unique templateId', async () => {
    await Template.syncIndexes();
    await Template.create(valid);
    await expect(Template.create({ ...valid, slug: 'different-slug' })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  it('rejects an invalid planAccess value', async () => {
    await expect(
      Template.create({ ...valid, templateId: 'z', slug: 'z', planAccess: 'enterprise' }),
    ).rejects.toThrow(/is not a valid enum/);
  });

  it('stores formSchema / documentStructure / validationRules as flexible objects', async () => {
    const tpl = await Template.create({
      ...valid,
      templateId: 'q',
      slug: 'q',
      formSchema: { steps: [{ step: 1, title: 'one', fields: [{ field_id: 'a', label: 'A' }] }] },
      documentStructure: { sections: [{ section_id: 'cause_title', type: 'template' }] },
      validationRules: { auto_convert_old_to_new: true, mandatory_sections: ['cause_title'] },
    });
    const formSchema = tpl.formSchema as { steps: Array<{ fields: Array<{ field_id: string }> }> };
    expect(formSchema.steps[0].fields[0].field_id).toBe('a');
    const docStructure = tpl.documentStructure as {
      sections: Array<{ section_id: string }>;
    };
    expect(docStructure.sections[0].section_id).toBe('cause_title');
  });
});
