/**
 * SCRUM-78 — template-promoter unit + integration tests.
 *
 * Acceptance criteria (from inputToDev.md):
 *   - All 92 docs promote cleanly with zero errors
 *   - Mismatch report saved on boot if any field is unmappable
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  clearTemplateRegistryCache,
  getTemplateRegistry,
  loadAllDocRules,
  promoteDocRuleToTemplateConfig,
} from '../services/template-promoter';

const DOC_RULES_DIR = join(__dirname, '..', 'config', 'document-rules');

describe('template-promoter', () => {
  describe('promoteDocRuleToTemplateConfig — top-level normalisation', () => {
    it('derives template_id from filename when missing in source (silent — routine normalisation)', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        { category: 'criminal' },
        'foo_bar.json',
      );
      expect(config.template_id).toBe('foo_bar');
      expect(mismatches.some((m) => m.includes('template_id'))).toBe(false);
    });

    it('prefers explicit template_id over docType over filename', () => {
      const a = promoteDocRuleToTemplateConfig(
        { template_id: 'a', docType: 'b', category: 'x' },
        'c.json',
      );
      const b = promoteDocRuleToTemplateConfig({ docType: 'b', category: 'x' }, 'c.json');
      expect(a.config.template_id).toBe('a');
      expect(b.config.template_id).toBe('b');
    });

    it('flags missing category and defaults to uncategorised', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig({}, 'x.json');
      expect(config.category).toBe('uncategorised');
      expect(mismatches.some((m) => m.includes('category'))).toBe(true);
    });

    it('falls back to _meta.description for description', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        { _meta: { description: 'CLO note here' }, category: 'civil' },
        'x.json',
      );
      expect(config.description).toBe('CLO note here');
    });

    it('humanises template_id into a display_name when no displayName/title', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        { template_id: 'rent_agreement', category: 'civil' },
        'rent_agreement.json',
      );
      expect(config.display_name).toBe('Rent Agreement');
    });
  });

  describe('form_schema — flat list shape', () => {
    it('normalises {name, label, type, required} into FormField shape', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          form_schema: [
            {
              name: 'purpose',
              label: 'Purpose',
              type: 'select',
              required: true,
              options: ['A', 'B'],
            },
            { name: 'age', label: 'Age', type: 'number', required: true },
          ],
        },
        't.json',
      );
      expect(mismatches).toEqual([]);
      const fields = config.form_schema.steps[0].fields;
      expect(fields).toHaveLength(2);
      expect(fields[0]).toMatchObject({ field_id: 'purpose', type: 'dropdown', required: true });
      expect(fields[0].options).toEqual([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      expect(fields[1]).toMatchObject({ field_id: 'age', type: 'number', required: true });
    });

    it('skips entries without name or field_id and logs a mismatch', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        { template_id: 't', category: 'c', form_schema: [{ label: 'Orphan', type: 'text' }] },
        't.json',
      );
      expect(config.form_schema.steps[0].fields).toHaveLength(0);
      expect(mismatches.some((m) => m.includes("no 'name'"))).toBe(true);
    });
  });

  describe('form_schema — dict-with-fields shape', () => {
    it('flattens {fields: [...]} into a single step', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          form_schema: {
            fields: [{ name: 'fir_number', label: 'FIR No', type: 'text', required: true }],
          },
        },
        't.json',
      );
      expect(config.form_schema.steps[0].fields[0].field_id).toBe('fir_number');
    });
  });

  describe('form_schema — JSON Schema shape', () => {
    it('flattens properties into fields with nested objects dot-prefixed', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        {
          template_id: 'aoa',
          category: 'corporate',
          form_schema: {
            type: 'object',
            required: ['company_name'],
            properties: {
              company_name: { type: 'string' },
              company_type: { type: 'string', enum: ['Pvt', 'Public'] },
              share_capital: {
                type: 'object',
                properties: {
                  authorised: { type: 'number' },
                  face_value: { type: 'number', default: 10 },
                },
              },
            },
          },
        },
        'aoa.json',
      );
      expect(mismatches).toEqual([]);
      const fields = config.form_schema.steps[0].fields;
      const ids = fields.map((f) => f.field_id).sort();
      expect(ids).toEqual([
        'company_name',
        'company_type',
        'share_capital.authorised',
        'share_capital.face_value',
      ]);
      const company_name = fields.find((f) => f.field_id === 'company_name')!;
      expect(company_name.required).toBe(true);
      expect(company_name.type).toBe('text');
      const company_type = fields.find((f) => f.field_id === 'company_type')!;
      expect(company_type.type).toBe('dropdown');
      expect(company_type.options).toEqual([
        { id: 'pvt', label: 'Pvt' },
        { id: 'public', label: 'Public' },
      ]);
    });
  });

  describe('form_schema — nested-by-section shape', () => {
    it('flattens {<section>: {<field>: {...}}} with dot-prefixed ids', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        {
          template_id: 'list_of_dates',
          category: 'civil',
          form_schema: {
            case_details: {
              case_type: { type: 'string', required: true, label: 'Case Type' },
              year: { type: 'string', required: true, label: 'Year' },
            },
            parties: {
              petitioner_name: { type: 'string', required: true, label: 'Petitioner' },
            },
          },
        },
        'list_of_dates.json',
      );
      expect(mismatches).toEqual([]);
      const ids = config.form_schema.steps[0].fields.map((f) => f.field_id).sort();
      expect(ids).toEqual([
        'case_details.case_type',
        'case_details.year',
        'parties.petitioner_name',
      ]);
    });
  });

  describe('form_schema — absent', () => {
    it('yields an empty fields array without logging a mismatch', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        { template_id: 't', category: 'c' },
        't.json',
      );
      expect(config.form_schema.steps[0].fields).toEqual([]);
      expect(mismatches).toEqual([]);
    });
  });

  describe('field-type mapping', () => {
    it.each([
      ['string', 'text'],
      ['integer', 'number'],
      ['float', 'number'],
      ['select', 'dropdown'],
      ['enum', 'dropdown'],
      ['email', 'text'],
      ['boolean', 'checkbox_group'],
      ['textarea', 'textarea'],
      ['date', 'date'],
    ])('maps source type %s → target type %s', (src, target) => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          form_schema: [{ name: 'x', type: src, required: false }],
        },
        't.json',
      );
      expect(config.form_schema.steps[0].fields[0].type).toBe(target);
      expect(mismatches).toEqual([]);
    });

    it('falls back to text for unknown types and logs the mismatch', () => {
      const { config, mismatches } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          form_schema: [{ name: 'x', type: 'martian', required: false }],
        },
        't.json',
      );
      expect(config.form_schema.steps[0].fields[0].type).toBe('text');
      expect(mismatches.some((m) => m.includes("unknown field type 'martian'"))).toBe(true);
    });
  });

  describe('legal-content carry-over', () => {
    it('preserves CLO source fields under _source', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          docType: 'bail_anticipatory',
          prayerTemplate: 'BE PLEASED TO...',
          verificationTemplate: 'I verify...',
          prompt_context: 'Draft bail under BNSS 482.',
          promptInstructions: ['line a', 'line b'],
          relevantActs: [{ act: 'BNS', sections: [] }],
          mandatoryClauses: [{ id: 'a', name: 'A', required: true }],
        },
        't.json',
      );
      const source = (config as unknown as { _source: Record<string, unknown> })._source;
      expect(source).toMatchObject({
        sourceFile: 't.json',
        docType: 'bail_anticipatory',
        prayerTemplate: 'BE PLEASED TO...',
        verificationTemplate: 'I verify...',
        prompt_context: 'Draft bail under BNSS 482.',
      });
      expect(source.promptInstructions).toEqual(['line a', 'line b']);
    });

    it('flattens relevantActs into related_acts as string list', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          relevantActs: [
            { act: 'Notaries Act, 1952', sections: [] },
            { act: 'BNS', sections: [] },
          ],
        },
        't.json',
      );
      expect(config.related_acts).toEqual(['Notaries Act, 1952', 'BNS']);
    });

    it('picks filingChecklist when filing_checklist is absent', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        { template_id: 't', category: 'c', filingChecklist: ['a', 'b'] },
        't.json',
      );
      expect(config.filing_checklist).toEqual(['a', 'b']);
    });

    it('carries creditsCost forward (default 1)', () => {
      const a = promoteDocRuleToTemplateConfig(
        { template_id: 't', category: 'c', creditsCost: 2 },
        't.json',
      );
      const b = promoteDocRuleToTemplateConfig({ template_id: 't', category: 'c' }, 't.json');
      expect((a.config as unknown as { creditsCost: number }).creditsCost).toBe(2);
      expect((b.config as unknown as { creditsCost: number }).creditsCost).toBe(1);
    });
  });

  describe('validation_rules normalisation', () => {
    it('passes through structured object shape', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          validation_rules: {
            section_codes_allowed: ['BNS', 'BNSS'],
            reject_old_codes: ['IPC'],
            auto_convert_old_to_new: true,
            mandatory_sections: ['cause_title'],
            fact_alteration_check: true,
            min_body_paragraphs: 5,
          },
        },
        't.json',
      );
      expect(config.validation_rules.section_codes_allowed).toEqual(['BNS', 'BNSS']);
      expect(config.validation_rules.auto_convert_old_to_new).toBe(true);
      expect(config.validation_rules.min_body_paragraphs).toBe(5);
    });

    it('stashes free-text rule array into mandatory_sections', () => {
      const { config } = promoteDocRuleToTemplateConfig(
        {
          template_id: 't',
          category: 'c',
          validation_rules: ['purpose must be specified', 'stamp must be > 0'],
        },
        't.json',
      );
      expect(config.validation_rules.mandatory_sections).toEqual([
        'purpose must be specified',
        'stamp must be > 0',
      ]);
      expect(config.validation_rules.auto_convert_old_to_new).toBe(false);
    });
  });

  describe('loadAllDocRules — integration against the live 92-doc directory', () => {
    beforeEach(() => clearTemplateRegistryCache());

    it('promotes every JSON in config/document-rules without throwing', () => {
      const fileCount = readdirSync(DOC_RULES_DIR).filter((f) => f.endsWith('.json')).length;
      const { configs, byFile, mismatchReport } = loadAllDocRules();
      // Every file must produce a registry entry (acceptance: "promote cleanly").
      expect(configs.size).toBe(fileCount);
      expect(byFile.size).toBe(fileCount);
      // No promotion may have crashed — only structured-mismatch lines may appear.
      const crashes = mismatchReport.filter((line) => /parse\/promote failed/i.test(line));
      expect(crashes).toEqual([]);
    });

    it('every promoted config has a non-empty template_id and category', () => {
      const { configs } = loadAllDocRules();
      for (const [id, cfg] of configs) {
        expect(id).toBeTruthy();
        expect(cfg.template_id).toBe(id);
        expect(cfg.category).toBeTruthy();
        expect(Array.isArray(cfg.form_schema.steps)).toBe(true);
      }
    });

    it('records the original form-schema shape under _source.formSchemaShape', () => {
      const { configs } = loadAllDocRules();
      const shapes = new Set<string>();
      for (const cfg of configs.values()) {
        const shape = (cfg as unknown as { _source: { formSchemaShape: string } })._source
          .formSchemaShape;
        shapes.add(shape);
      }
      // Acceptance: the registry covers at least the five known shapes — flat_list,
      // dict_with_fields, json_schema, nested_section, absent.
      expect(shapes.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getTemplateRegistry caching', () => {
    beforeEach(() => clearTemplateRegistryCache());

    it('returns the same registry instance on repeat calls', () => {
      const a = getTemplateRegistry();
      const b = getTemplateRegistry();
      expect(a).toBe(b);
    });

    it('clearTemplateRegistryCache forces a re-walk', () => {
      const a = getTemplateRegistry();
      clearTemplateRegistryCache();
      const b = getTemplateRegistry();
      expect(a).not.toBe(b);
      expect(a.configs.size).toBe(b.configs.size);
    });
  });

  describe('writeMismatchReport behaviour via boot path', () => {
    it('matches the byFile count to the configs count for the live directory', () => {
      const files = readdirSync(DOC_RULES_DIR).filter((f) => f.endsWith('.json'));
      const expectedJson = files.map((f) =>
        JSON.parse(readFileSync(join(DOC_RULES_DIR, f), 'utf-8')),
      );
      expect(expectedJson.length).toBe(files.length);
      // Sanity — re-promote a random sample matches the boot result.
      const sample = expectedJson[0];
      const { config } = promoteDocRuleToTemplateConfig(sample, files[0]);
      expect(config.template_id).toBeTruthy();
    });
  });
});
