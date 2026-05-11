import './setupDb';

import { Template } from '../models/Template.model';

describe('Template model', () => {
  const validTemplate = {
    name: 'Bail Application — Sessions Court',
    slug: 'bail-application-sessions',
    category: 'criminal' as const,
    docType: 'bail_application',
    courtType: 'district_court',
    description: 'Standard bail application template for Sessions Court',
    promptTemplate: 'Draft a bail application for {{courtName}}...',
    planAccess: 'free' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date(),
    isActive: true,
  };

  it('creates a template with all fields', async () => {
    const tpl = await Template.create(validTemplate);
    expect(tpl.name).toBe(validTemplate.name);
    expect(tpl.slug).toBe('bail-application-sessions');
    expect(tpl.category).toBe('criminal');
    expect(tpl.planAccess).toBe('free');
    expect(tpl.isActive).toBe(true);
    expect(tpl.usageCount).toBe(0);
  });

  it('rejects missing name', async () => {
    await expect(
      Template.create({ ...validTemplate, name: undefined, slug: 'missing-name' }),
    ).rejects.toThrow(/name is required/);
  });

  it('rejects missing slug', async () => {
    await expect(Template.create({ ...validTemplate, slug: undefined })).rejects.toThrow(
      /slug is required/,
    );
  });

  it('enforces unique slug', async () => {
    await Template.create(validTemplate);
    await expect(Template.create({ ...validTemplate })).rejects.toThrow(/duplicate key/i);
  });

  it('rejects missing category', async () => {
    await expect(
      Template.create({ ...validTemplate, slug: 'unique-1', category: undefined }),
    ).rejects.toThrow(/category is required/);
  });

  it('rejects invalid category', async () => {
    await expect(
      Template.create({ ...validTemplate, slug: 'unique-2', category: 'tax' }),
    ).rejects.toThrow(/is not a valid enum/);
  });

  it('rejects missing description', async () => {
    await expect(
      Template.create({ ...validTemplate, slug: 'unique-3', description: undefined }),
    ).rejects.toThrow(/description is required/);
  });

  it('rejects missing promptTemplate', async () => {
    await expect(
      Template.create({ ...validTemplate, slug: 'unique-4', promptTemplate: undefined }),
    ).rejects.toThrow(/promptTemplate is required/);
  });

  it('rejects missing reviewedBy', async () => {
    await expect(
      Template.create({ ...validTemplate, slug: 'unique-5', reviewedBy: undefined }),
    ).rejects.toThrow(/reviewedBy is required/);
  });

  it('stores formSchema as flexible object', async () => {
    const tpl = await Template.create({
      ...validTemplate,
      slug: 'form-schema-test',
      formSchema: {
        fields: [
          { name: 'petitioner', type: 'text', required: true },
          { name: 'courtName', type: 'text', required: true },
        ],
      },
    });
    expect((tpl.formSchema as Record<string, unknown>).fields).toHaveLength(2);
  });

  it('increments usageCount', async () => {
    const tpl = await Template.create({ ...validTemplate, slug: 'usage-count-test' });
    expect(tpl.usageCount).toBe(0);

    await Template.findByIdAndUpdate(tpl._id, { $inc: { usageCount: 1 } });
    const updated = await Template.findById(tpl._id);
    expect(updated!.usageCount).toBe(1);
  });

  it('defaults planAccess to free', async () => {
    const tpl = await Template.create({
      ...validTemplate,
      slug: 'default-plan',
      planAccess: undefined,
    });
    expect(tpl.planAccess).toBe('free');
  });
});
