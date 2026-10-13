/**
 * T-394 — the promoter keeps a rule-pack field's `source`.
 *
 * AC1: promoted config carries field-level `source` for every pack field that declares one.
 * AC2: bail_anticipatory / bail_regular `sections_charged` is a section search
 *      (multi_select_search + bns_mapping), in the registry and as served.
 * AC3: pinned for courts_db and bns_mapping fields.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { clearConfigCache, loadTemplateConfig } from '../services/template-engine.service';
import type { TemplateConfig } from '../services/template-engine.service';
import { clearTemplateRegistryCache, getTemplateRegistry } from '../services/template-promoter';

const DOC_RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const OVERRIDES_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');

const PACKS_WITH_SOURCE = [
  'bail_anticipatory',
  'bail_regular',
  'consumer_complaint',
  'legal_notice_s138',
  'legal_notice_s80',
  'rent_agreement',
];

type AnyField = Record<string, unknown> & { field_id: string };

function fieldsOf(config: unknown): AnyField[] {
  const steps =
    ((config as { form_schema?: { steps?: Array<{ fields?: AnyField[] }> } })?.form_schema
      ?.steps as Array<{ fields?: AnyField[] }>) ?? [];
  return steps.flatMap((s) => s.fields ?? []);
}

function sourceMap(config: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldsOf(config)) {
    if (typeof f.source === 'string') out[f.field_id] = f.source;
  }
  return out;
}

function registryConfig(id: string): TemplateConfig {
  const c = getTemplateRegistry().configs.get(id);
  if (!c) throw new Error(`registry has no ${id}`);
  return c;
}

describe('T-394 promoter keeps field-level source', () => {
  beforeAll(() => {
    clearTemplateRegistryCache();
    clearConfigCache();
  });

  describe('AC1 / AC3 — pinned fields', () => {
    it.each([
      ['bail_anticipatory', 'sections_charged', 'bns_mapping'],
      ['bail_regular', 'sections_charged', 'bns_mapping'],
      ['bail_anticipatory', 'state', 'courts_db.states'],
      ['bail_anticipatory', 'court_type', 'courts_db.court_types'],
      ['bail_anticipatory', 'court_name', 'courts_db.courts'],
    ])('%s.%s is promoted with source %s', (pack, fieldId, source) => {
      const field = fieldsOf(registryConfig(pack)).find((f) => f.field_id === fieldId);
      expect(field).toBeDefined();
      expect(field?.source).toBe(source);
    });

    it('a field with no source has no `source` key at all', () => {
      const field = fieldsOf(registryConfig('bail_anticipatory')).find((f) => !('source' in f));
      expect(field).toBeDefined();
      for (const config of getTemplateRegistry().configs.values()) {
        for (const f of fieldsOf(config)) {
          if (!('source' in f)) continue;
          expect(typeof f.source).toBe('string');
        }
      }
    });
  });

  describe('AC1 — every declared string source is copied, and nothing else gets one', () => {
    const packFiles = readdirSync(DOC_RULES_DIR).filter((f) => f.endsWith('.json'));

    it('promoted field-id to source map equals the pack declaration for every pack', () => {
      let declared = 0;
      for (const file of packFiles) {
        const raw = JSON.parse(readFileSync(join(DOC_RULES_DIR, file), 'utf-8'));
        const expected: Record<string, string> = {};
        for (const step of raw?.form_schema?.steps ?? []) {
          for (const f of step?.fields ?? []) {
            const id = f.field_id ?? f.id;
            if (typeof f.source === 'string' && typeof id === 'string') expected[id] = f.source;
          }
        }
        declared += Object.keys(expected).length;
        const templateId = file.replace(/\.json$/, '');
        const promoted = getTemplateRegistry().configs.get(raw.template_id ?? templateId);
        expect(promoted).toBeDefined();
        expect(sourceMap(promoted)).toEqual(expected);
      }
      // Sanity: the check is not vacuous (14 at the time of T-394).
      expect(declared).toBeGreaterThanOrEqual(14);
    });

    it('no promoted field has a `source` key holding a non-string (e.g. undefined)', () => {
      for (const config of getTemplateRegistry().configs.values()) {
        for (const f of fieldsOf(config)) {
          if ('source' in f) expect(typeof f.source).toBe('string');
        }
      }
    });
  });

  describe('AC2 — section search on bail packs', () => {
    it.each(['bail_anticipatory', 'bail_regular'])(
      '%s sections_charged is multi_select_search + bns_mapping (registry and served)',
      (pack) => {
        for (const config of [registryConfig(pack), loadTemplateConfig(pack)]) {
          const field = fieldsOf(config).find((f) => f.field_id === 'sections_charged');
          expect(field?.type).toBe('multi_select_search');
          expect(field?.source).toBe('bns_mapping');
        }
      },
    );

    it.each(PACKS_WITH_SOURCE)(
      '%s promoted source map equals the docs/templates override map (no drift)',
      (pack) => {
        const override = JSON.parse(readFileSync(join(OVERRIDES_DIR, `${pack}.json`), 'utf-8'));
        const expected = sourceMap(override);
        expect(Object.keys(expected).length).toBeGreaterThan(0);
        expect(sourceMap(registryConfig(pack))).toEqual(expected);
      },
    );
  });
});
