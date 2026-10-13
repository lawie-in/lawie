import { readdirSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import './setupDb';
import app from '../app';
import { Template } from '../models/Template.model';
import { getTemplateRegistry } from '../services/template-promoter';
import {
  loadTemplateConfig,
  TemplateConfig,
  TemplateSummary,
} from '../services/template-engine.service';
import { cardDescriptionFor } from '../utils/cardDescription';
import {
  PUBLIC_FIELD_OPTION_KEYS,
  PUBLIC_FORM_FIELD_KEYS,
  PUBLIC_FORM_SCHEMA_KEYS,
  PUBLIC_FORM_STEP_KEYS,
  PUBLIC_TEMPLATE_CONFIG_KEYS,
  PUBLIC_TEMPLATE_ROW_KEYS,
  PUBLIC_TEMPLATE_SUMMARY_KEYS,
  publicTemplateConfig,
  publicTemplateRow,
  publicTemplateSummary,
} from '../utils/publicTemplateConfig';

// T-385 part 1 (AC1, AC2): the template routes send an allowlist projection, never
// _source, document_structure (prompt_context, clause notes) or metadata.

const OVERRIDE_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

function allConfigs(): TemplateConfig[] {
  const ids = new Set<string>(getTemplateRegistry().configs.keys());
  for (const f of readdirSync(OVERRIDE_DIR)) {
    if (f.endsWith('.json')) ids.add(f.replace(/\.json$/, ''));
  }
  const out: TemplateConfig[] = [];
  for (const id of ids) {
    const config = loadTemplateConfig(id);
    if (!config) throw new Error(`no config loadable for ${id}`);
    out.push(config);
  }
  return out;
}

const CONFIGS = allConfigs();
const OVERRIDE_IDS = readdirSync(OVERRIDE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

type Obj = Record<string, unknown>;

/** Every key of every object under `value`, with the path it was found at. */
function walk(value: unknown, path: string, visit: (path: string, obj: Obj) => void): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  } else if (value && typeof value === 'object') {
    visit(path, value as Obj);
    for (const [k, v] of Object.entries(value as Obj)) walk(v, `${path}.${k}`, visit);
  }
}

function disallowedKeys(projected: unknown): string[] {
  const bad: string[] = [];
  const check = (obj: Obj, allowed: readonly string[], where: string) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) bad.push(`${where}.${k}`);
  };
  const p = projected as Obj;
  check(p, PUBLIC_TEMPLATE_CONFIG_KEYS, 'config');
  const fs = p.form_schema as Obj;
  check(fs, PUBLIC_FORM_SCHEMA_KEYS, 'form_schema');
  (fs.steps as Obj[]).forEach((step, si) => {
    check(step, PUBLIC_FORM_STEP_KEYS, `steps[${si}]`);
    (step.fields as Obj[]).forEach((field, fi) => {
      check(field, PUBLIC_FORM_FIELD_KEYS, `steps[${si}].fields[${fi}]`);
      if (field.options !== undefined) {
        (field.options as Obj[]).forEach((o, oi) =>
          check(o, PUBLIC_FIELD_OPTION_KEYS, `steps[${si}].fields[${fi}].options[${oi}]`),
        );
      }
    });
  });
  // Structural guard: no object anywhere other than the known levels.
  walk(projected, 'config', (path, obj) => {
    const known =
      path === 'config' ||
      path === 'config.form_schema' ||
      /^config\.form_schema\.steps\[\d+\]$/.test(path) ||
      /^config\.form_schema\.steps\[\d+\]\.fields\[\d+\]$/.test(path) ||
      /^config\.form_schema\.steps\[\d+\]\.fields\[\d+\]\.options\[\d+\]$/.test(path);
    if (!known) bad.push(`unexpected object at ${path} (${Object.keys(obj).join(',')})`);
  });
  return bad;
}

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value as Obj).flatMap(allStrings);
  return [];
}

/** Every long string under the internal-only parts of the config (prompt text, clause notes). */
function internalStrings(config: TemplateConfig): string[] {
  const out: string[] = [];
  const c = config as unknown as Obj;
  const collect = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.length >= 30) out.push(v);
    } else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v as Obj).forEach(collect);
  };
  for (const key of ['_source', 'document_structure', 'computed_fields', 'validation_rules']) {
    collect(c[key]);
  }
  return out;
}

describe('T-385 AC2: publicTemplateConfig has no key outside the allowlist', () => {
  it('covers the full registry plus the docs/templates overrides', () => {
    expect(CONFIGS.length).toBeGreaterThanOrEqual(92);
    expect(OVERRIDE_IDS.length).toBe(6);
    const ids = CONFIGS.map((c) => c.template_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('for every config: only allowlisted keys at every level, none of the internal keys', () => {
    for (const config of CONFIGS) {
      const projected = publicTemplateConfig(config);
      expect({ id: config.template_id, bad: disallowedKeys(projected) }).toEqual({
        id: config.template_id,
        bad: [],
      });
      const p = projected as unknown as Obj;
      for (const k of [
        '_source',
        'source',
        'document_structure',
        'computed_fields',
        'validation_rules',
        'metadata',
        'prompt_context',
        'applicable_courts',
        'related_acts',
        'filing_checklist',
        'special_prayer_additions',
      ]) {
        expect(p).not.toHaveProperty(k);
      }
    }
  });

  it('for every config: no prompt text, prompt_context or MUST INCLUDE anywhere in the JSON', () => {
    for (const config of CONFIGS) {
      const projected = publicTemplateConfig(config);
      const json = JSON.stringify(projected);
      expect({ id: config.template_id, leak: json.includes('prompt_context') }).toEqual({
        id: config.template_id,
        leak: false,
      });
      expect(json).not.toContain('MUST INCLUDE');
      expect(json).not.toContain('"_source"');
      expect(json).not.toContain('"document_structure"');
      const publicStrings = allStrings(projected);
      for (const text of internalStrings(config)) {
        // A prompt that merely repeats a public label (a title, say) is not a leak.
        if (publicStrings.some((s) => s.includes(text))) continue;
        expect({ id: config.template_id, leaked: json.includes(text), text }).toEqual({
          id: config.template_id,
          leaked: false,
          text,
        });
      }
    }
  });

  it('a known pack: its prompt_context text is in the source and absent from the projection', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const sections = config.document_structure.sections as unknown as Array<{
      prompt_context?: string;
    }>;
    const prompts = sections.map((s) => s.prompt_context).filter((s): s is string => !!s);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.some((p) => p.includes('Do NOT generate the prayer clause'))).toBe(true);
    const json = JSON.stringify(publicTemplateConfig(config));
    for (const p of prompts) expect(json).not.toContain(p);
    expect(json).not.toContain('Do NOT generate the prayer clause');
    expect(json).not.toContain('Article 21 of Constitution');
  });

  it('a promoted pack (registry, not an override) is also clean', () => {
    const promoted = CONFIGS.find((c) => !OVERRIDE_IDS.includes(c.template_id))!;
    const json = JSON.stringify(publicTemplateConfig(promoted));
    for (const text of internalStrings(promoted)) expect(json).not.toContain(text);
  });

  it('an injected non-allowlisted key at every level never gets through', () => {
    const base = loadTemplateConfig('bail_regular')!;
    const evil = JSON.parse(JSON.stringify(base)) as Obj & {
      form_schema: Obj & { steps: Array<Obj & { fields: Obj[] }> };
    };
    evil._source = { prompt_context: 'SECRET-A' };
    evil.form_schema.leak = 'SECRET-B';
    evil.form_schema.steps[0].leak = 'SECRET-C';
    evil.form_schema.steps[0].fields[0].leak = 'SECRET-D';
    evil.form_schema.steps[0].fields[0].prompt_context = 'SECRET-E';
    evil.form_schema.steps[0].fields[0].options = [{ id: 'a', label: 'A', note: 'SECRET-F' }];
    evil.form_schema.steps[0].fields[1].show_if = { _source: 'SECRET-G' };
    const json = JSON.stringify(publicTemplateConfig(evil as unknown as TemplateConfig));
    expect(json).not.toMatch(/SECRET-[A-G]/);
  });
});

describe('T-385: field-level source is kept (the renderer reads it)', () => {
  function fieldsOf(config: TemplateConfig): Array<Record<string, unknown>> {
    return (publicTemplateConfig(config).form_schema.steps as Array<{ fields: Obj[] }>).flatMap(
      (s) => s.fields,
    );
  }

  it('bail_regular: state -> courts_db.states, sections_charged -> bns_mapping', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const fields = fieldsOf(config);
    const by = (id: string) => fields.find((f) => f.field_id === id);
    expect(by('state')?.source).toBe('courts_db.states');
    expect(by('sections_charged')?.source).toBe('bns_mapping');
    expect(by('court_type')?.source).toBe('courts_db.court_types');
    expect(by('court_name')?.source).toBe('courts_db.courts');
  });

  it('every field source in every config survives unchanged', () => {
    let seen = 0;
    for (const config of CONFIGS) {
      const original = config.form_schema.steps.flatMap((s) => s.fields);
      const projected = fieldsOf(config);
      expect(projected).toHaveLength(original.length);
      original.forEach((f, i) => {
        expect(projected[i].source).toBe(f.source);
        if (f.source !== undefined) seen += 1;
      });
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('T-385: the projection does not mutate the cached registry config', () => {
  it('deep-equal before and after, for every config', () => {
    for (const config of CONFIGS) {
      const before = JSON.parse(JSON.stringify(config));
      publicTemplateConfig(config);
      expect(config).toEqual(before);
    }
  });

  it('the projection shares no nested object with its input', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const projected = publicTemplateConfig(config);
    const step = projected.form_schema.steps[0] as { fields: Obj[] };
    step.fields.push({ field_id: 'mutated' });
    projected.form_schema.steps.length = 0;
    expect(config.form_schema.steps.length).toBeGreaterThan(0);
    expect(config.form_schema.steps[0].fields.some((f) => f.field_id === 'mutated')).toBe(false);
  });
});

describe('T-385 AC6/T-365: description is the card line', () => {
  it('equals cardDescriptionFor(id) for every config, not the internal description', () => {
    let differing = 0;
    for (const config of CONFIGS) {
      const projected = publicTemplateConfig(config);
      expect(projected.description).toBe(cardDescriptionFor(config.template_id));
      if (projected.description !== config.description) differing += 1;
    }
    expect(differing).toBeGreaterThan(0);
  });
});

describe('T-385: publicTemplateSummary', () => {
  const summary = (): TemplateSummary & { credits_cost?: number } => {
    const c = loadTemplateConfig('bail_regular')!;
    return {
      template_id: c.template_id,
      display_name: c.display_name,
      category: c.category,
      catalogueCategory: c.catalogueCategory!,
      catalogueCategoryName: 'Bail and custody',
      catalogueCategoryOrder: 3,
      description: c.description,
      icon: c.icon,
      plan_access: c.plan_access,
      supported_languages: c.supported_languages,
      metadata: c.metadata,
    };
  };

  it('keeps credits_cost when given, drops metadata, stays inside the allowlist', () => {
    const out = publicTemplateSummary({ ...summary(), credits_cost: 4 });
    expect(out.credits_cost).toBe(4);
    expect(out).not.toHaveProperty('metadata');
    for (const k of Object.keys(out)) {
      expect(PUBLIC_TEMPLATE_SUMMARY_KEYS as readonly string[]).toContain(k);
    }
    expect(out.description).toBe(cardDescriptionFor('bail_regular'));
  });

  it('omits credits_cost when not given, and ignores extra input keys', () => {
    const input = {
      ...summary(),
      _source: { prompt_context: 'SECRET' },
      document_structure: { sections: [] },
    } as unknown as TemplateSummary;
    const out = publicTemplateSummary(input);
    expect(out).not.toHaveProperty('credits_cost');
    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(out).not.toHaveProperty('document_structure');
  });
});

describe('T-385 AC1: GET /templates rows', () => {
  const headers = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'pro',
    'x-user-role': 'Client',
  };

  beforeEach(async () => {
    await Template.collection.insertMany([
      {
        templateId: 'affidavit_identity',
        slug: 'affidavit-identity',
        displayName: 'Affidavit of Identity',
        category: 'civil',
        catalogueCategory: 'affidavits_court_forms',
        description: 'STORED-DESC',
        planAccess: 'free',
        sourceFile: 'affidavit_identity.json',
        creditsCost: 1,
        isActive: true,
        courtLevels: ['high_court'],
        source: { prompt_context: 'SECRET-PROMPT-CONTEXT MUST INCLUDE x' },
        metadata: { reviewed_by: 'SECRET-METADATA' },
        _source: { prompt_context: 'SECRET-UNDERSCORE' },
        supportedLanguages: ['en'],
        icon: 'file',
      },
    ] as never);
  });

  it('every row key is in PUBLIC_TEMPLATE_ROW_KEYS; nothing internal reaches the response', async () => {
    const res = await request(app).get('/templates').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
    for (const row of res.body.templates) {
      for (const k of Object.keys(row)) {
        expect(PUBLIC_TEMPLATE_ROW_KEYS as readonly string[]).toContain(k);
      }
      for (const k of ['source', '_source', 'metadata', '_id', 'courtLevels', 'sourceFile']) {
        expect(row).not.toHaveProperty(k);
      }
    }
    const row = res.body.templates[0];
    expect(row.description).toBe(cardDescriptionFor('affidavit_identity'));
    expect(row.description).not.toBe('STORED-DESC');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET');
    expect(body).not.toContain('prompt_context');
    expect(body).not.toContain('MUST INCLUDE');
    expect(row.templateId).toBe('affidavit_identity');
    expect(row.creditsCost).toBe(1);
  });

  it('publicTemplateRow drops keys it was not given an allowlist slot for', () => {
    const out = publicTemplateRow({
      templateId: 't',
      slug: 't',
      displayName: 'T',
      category: 'civil',
      catalogueCategory: 'notices_replies',
      icon: 'i',
      planAccess: 'free',
      supportedLanguages: ['en'],
      creditsCost: 1,
      _id: 'x',
      source: 'SECRET',
    } as never);
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_TEMPLATE_ROW_KEYS].sort());
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });
});

describe('T-385 (Arjun test b, fallback): the projection keeps every key the form renderer reads', () => {
  // Cross-workspace run not feasible: the web's DynamicFormRenderer test builds its own
  // inline config and jest in apps/web cannot import apps/drafting. Instead we assert the
  // projected config keeps every field key the renderer reads (DynamicFormRenderer.tsx
  // FormField, lines 25-56, and its field.* reads) for an override and a promoted pack.
  const RENDERER_READS = [
    'field_id',
    'label',
    'type',
    'required',
    'placeholder',
    'default',
    'options',
    'options_from',
    'source',
    'filtered_by',
    'cascades_to',
    'show_if',
    'depends_on',
    'min_length',
    'max_length',
    'min_select',
    'validation_pattern',
    'validation_message',
    'multiple',
    'accept',
    'help',
  ];

  it('the allowlist is a superset of the renderer-read keys', () => {
    for (const k of RENDERER_READS) {
      expect(PUBLIC_FORM_FIELD_KEYS as readonly string[]).toContain(k);
    }
  });

  it('for 3 templates, every renderer-read key present on a source field survives with the same value', () => {
    const promoted = CONFIGS.filter((c) => !OVERRIDE_IDS.includes(c.template_id));
    const picks = [
      loadTemplateConfig('bail_regular')!,
      loadTemplateConfig('rent_agreement')!,
      promoted[0],
    ];
    for (const config of picks) {
      const projected = publicTemplateConfig(config);
      expect(projected.template_id).toBe(config.template_id);
      expect(projected.display_name).toBe(config.display_name);
      expect(projected.supported_languages).toEqual(config.supported_languages);
      expect(projected.plan_access).toBe(config.plan_access);
      const srcSteps = config.form_schema.steps;
      expect(projected.form_schema.steps).toHaveLength(srcSteps.length);
      srcSteps.forEach((step, si) => {
        const ps = projected.form_schema.steps[si] as {
          step: number;
          title: string;
          fields: Obj[];
        };
        expect(ps.step).toBe(step.step);
        expect(ps.title).toBe(step.title);
        expect(ps.fields).toHaveLength(step.fields.length);
        step.fields.forEach((field, fi) => {
          const pf = ps.fields[fi];
          for (const k of RENDERER_READS) {
            const original = (field as unknown as Obj)[k];
            if (original === undefined) {
              expect(pf).not.toHaveProperty(k);
            } else if (k === 'options') {
              expect(pf.options).toEqual(
                (original as Array<{ id: string; label: string }>).map((o) => ({
                  id: o.id,
                  label: o.label,
                })),
              );
            } else {
              expect(pf[k]).toEqual(original);
            }
          }
        });
      });
    }
  });

  it('the picked templates actually exercise conditional, cascade and source keys', () => {
    const keys = new Set<string>();
    for (const id of ['bail_regular', 'rent_agreement']) {
      for (const s of publicTemplateConfig(loadTemplateConfig(id)!).form_schema.steps) {
        for (const f of (s as { fields: Obj[] }).fields) Object.keys(f).forEach((k) => keys.add(k));
      }
    }
    for (const k of ['source', 'options', 'required', 'type']) expect(keys.has(k)).toBe(true);
  });
});
