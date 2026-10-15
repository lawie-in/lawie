import './setupDb';
import request from 'supertest';

import app from '../app';
import * as promoter from '../services/template-promoter';
import { clearConfigCache } from '../services/template-engine.service';
import * as engine from '../services/template-engine.service';
import { costForTemplate } from '../services/credits.service';
import { cardDescriptionFor } from '../utils/cardDescription';
import {
  PUBLIC_FIELD_OPTION_KEYS,
  PUBLIC_FORM_FIELD_KEYS,
  PUBLIC_FORM_SCHEMA_KEYS,
  PUBLIC_FORM_STEP_KEYS,
  PUBLIC_TEMPLATE_CONFIG_KEYS,
  PUBLIC_TEMPLATE_SUMMARY_KEYS,
} from '../utils/publicTemplateConfig';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

function internalHeaders(plan: 'free' | 'pro' = 'free') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

type Item = { template_id: string; description: string; credits_cost?: number };

/** Real registry with one pack's card_description removed (a pack lacking its signed line). */
function registryWithout(templateId: string) {
  const real = promoter.getTemplateRegistry();
  const configs = new Map(real.configs);
  const { card_description: _dropped, ...rest } = configs.get(templateId) as unknown as Record<
    string,
    unknown
  >;
  void _dropped;
  configs.set(templateId, rest as never);
  jest
    .spyOn(promoter, 'getTemplateRegistry')
    .mockReturnValue({ ...real, configs } as ReturnType<typeof promoter.getTemplateRegistry>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /template-configs (T-365 AC6: the signed card line)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('returns the signed card line for a known pack', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.description).toBe(cardDescriptionFor('affidavit_identity'));
    expect(item?.description).toBe(
      "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
    );
  });

  it('every listed description is its card line and never carries the config prefix', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const items = res.body.templates as Item[];
    expect(items.length).toBeGreaterThan(0);
    for (const t of items) {
      expect(t.description).toBe(cardDescriptionFor(t.template_id));
      expect(t.description).not.toContain('Document-rules config for');
    }
  });

  it("returns '' for a pack with no card line (no fallback to the internal text)", async () => {
    registryWithout('affidavit_identity');
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.description).toBe('');
    expect(JSON.stringify(item?.description)).not.toContain('Document-rules config for');
  });

  it('keeps the T-372 cost fields', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.credits_cost).toBe(1);
    expect(typeof res.body.guided_credits_cost).toBe('number');
  });
});

describe('GET /template-configs/:id (T-365 AC6: the signed card line)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('returns the signed card line for a known pack', async () => {
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(cardDescriptionFor('affidavit_identity'));
    expect(res.body.config.description).toBe(
      "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
    );
  });

  it('never re-adds the old internal description (certiorari)', async () => {
    const res = await request(app).get('/template-configs/certiorari').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(cardDescriptionFor('certiorari'));
    expect(res.body.config.description).not.toContain('Document-rules config for');
    expect(res.body.config.description).not.toMatch(/inferior court, tribunal, or quasi-judicial/);
  });

  it("returns '' for a pack with no card line", async () => {
    registryWithout('affidavit_identity');
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe('');
  });

  it('still returns the form schema beside the card line, and no document_structure (T-385)', async () => {
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.body.config.template_id).toBe('affidavit_identity');
    expect(res.body.config.form_schema).toBeDefined();
    expect(res.body.config.document_structure).toBeUndefined();
  });
});

type Obj = Record<string, unknown>;

function badKeys(config: Obj): string[] {
  const bad: string[] = [];
  const check = (o: Obj, allowed: readonly string[], where: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) bad.push(`${where}.${k}`);
  };
  check(config, PUBLIC_TEMPLATE_CONFIG_KEYS, 'config');
  const fs = config.form_schema as Obj;
  check(fs, PUBLIC_FORM_SCHEMA_KEYS, 'form_schema');
  (fs.steps as Obj[]).forEach((step, si) => {
    check(step, PUBLIC_FORM_STEP_KEYS, `steps[${si}]`);
    (step.fields as Obj[]).forEach((field, fi) => {
      check(field, PUBLIC_FORM_FIELD_KEYS, `steps[${si}].fields[${fi}]`);
      ((field.options as Obj[] | undefined) ?? []).forEach((o, oi) =>
        check(o, PUBLIC_FIELD_OPTION_KEYS, `steps[${si}].fields[${fi}].options[${oi}]`),
      );
    });
  });
  return bad;
}

describe('GET /template-configs/:id (T-385 AC1/AC2: no internal fields reach the browser)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  const IDS = ['bail_regular', 'affidavit_identity', 'certiorari', 'rent_agreement'];

  it.each(IDS)('%s: none of the internal keys, no prompt text anywhere in the JSON', async (id) => {
    const res = await request(app).get(`/template-configs/${id}`).set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    const config = res.body.config as Obj;
    for (const k of [
      '_source',
      'source',
      'document_structure',
      'computed_fields',
      'validation_rules',
      'metadata',
    ]) {
      expect(config).not.toHaveProperty(k);
    }
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('prompt_context');
    expect(json).not.toContain('MUST INCLUDE');
    expect(json).not.toContain('"_source"');
    expect(json).not.toContain('"document_structure"');
  });

  it('the source holds prompt_context for bail_regular, so the absence above is the route doing it', () => {
    const real = engine.loadTemplateConfig('bail_regular')!;
    expect(JSON.stringify(real.document_structure)).toContain('prompt_context');
  });

  it.each(IDS)('%s: every key at every level is in the allowlist', async (id) => {
    const res = await request(app).get(`/template-configs/${id}`).set(internalHeaders('pro'));
    expect(badKeys(res.body.config as Obj)).toEqual([]);
    expect(Object.keys(res.body)).toEqual(['config']);
  });

  it('keeps the field-level source the renderer reads (bail_regular)', async () => {
    const res = await request(app)
      .get('/template-configs/bail_regular')
      .set(internalHeaders('pro'));
    const fields = (res.body.config.form_schema.steps as Array<{ fields: Obj[] }>).flatMap(
      (s) => s.fields,
    );
    expect(fields.find((f) => f.field_id === 'sections_charged')?.source).toBe('bns_mapping');
    expect(fields.find((f) => f.field_id === 'state')?.source).toBe('courts_db.states');
  });

  it('keeps what the web reads: display_name, supported_languages, plan_access', async () => {
    const res = await request(app)
      .get('/template-configs/bail_regular')
      .set(internalHeaders('pro'));
    const real = engine.loadTemplateConfig('bail_regular')!;
    expect(res.body.config.display_name).toBe(real.display_name);
    expect(res.body.config.supported_languages).toEqual(real.supported_languages);
    expect(res.body.config.plan_access).toBe(real.plan_access);
  });

  it('a pro-only template is still 403 for a free plan, and sends no config', async () => {
    const real = engine.loadTemplateConfig('nda')!;
    jest.spyOn(engine, 'loadTemplateConfig').mockReturnValue({ ...real, plan_access: 'pro' });
    const res = await request(app).get('/template-configs/nda').set(internalHeaders('free'));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This template requires a Pro plan');
    expect(res.body.config).toBeUndefined();
  });

  it('a pro user gets the same pro-only template, projected', async () => {
    const real = engine.loadTemplateConfig('nda')!;
    jest.spyOn(engine, 'loadTemplateConfig').mockReturnValue({ ...real, plan_access: 'pro' });
    const res = await request(app).get('/template-configs/nda').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config).not.toHaveProperty('document_structure');
  });

  // The hidden-kind 404 (templateGuard) is covered in t375-documents-routes.test.ts.
});

describe('GET /template-configs list (T-385 AC1/AC2: card keys only)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  type Row = Obj & { template_id: string };

  it('rows have no metadata and every key is in PUBLIC_TEMPLATE_SUMMARY_KEYS', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const rows = res.body.templates as Row[];
    expect(rows.length).toBeGreaterThan(0);
    // the source summaries do carry metadata, so its absence is the route's doing
    expect(engine.listTemplateConfigs().some((c) => c.metadata !== undefined)).toBe(true);
    for (const row of rows) {
      expect(row).not.toHaveProperty('metadata');
      for (const k of Object.keys(row)) {
        expect(PUBLIC_TEMPLATE_SUMMARY_KEYS as readonly string[]).toContain(k);
      }
    }
    expect(JSON.stringify(res.body)).not.toContain('created_by');
  });

  it('credits_cost is still per row and guided_credits_cost still top-level, unchanged', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const rows = res.body.templates as Array<Row & { credits_cost?: number }>;
    for (const row of rows) expect(row.credits_cost).toBe(costForTemplate(row.template_id));
    expect(rows.filter((r) => r.credits_cost !== undefined).length).toBeGreaterThan(0);
    expect(res.body.guided_credits_cost).toBe(costForTemplate('guided'));
    expect(res.body.guided_credits_cost).toBeGreaterThanOrEqual(1);
  });

  it('hidden kinds stay filtered (switch off): no civil_plaints_suits row', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const got = (res.body.templates as Row[]).map((r) => r.template_id);
    const plaints = engine
      .listTemplateConfigs()
      .filter((c) => c.catalogueCategory === 'civil_plaints_suits')
      .map((c) => c.template_id);
    expect(plaints.length).toBe(6);
    for (const id of plaints) expect(got).not.toContain(id);
  });
});
