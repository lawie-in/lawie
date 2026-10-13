/**
 * T-227 — the price a user sees is the price charged.
 *
 * One price list (`TEMPLATE_PRICES` + `NON_TEMPLATE_PRICES` + `PRICE_ALIASES`
 * in credits.service). The price shown (promoter -> Template rows ->
 * GET /templates) and the price charged (enforceCredits -> spendInk) are both
 * read from it. These tests loop over EVERY rule file, EVERY legacy /generate
 * docType and `guided`, so a missing or differing price fails CI (Vikram,
 * 12 Oct 2026). Document-rules files are read, never edited.
 */
import './setupDb';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import request from 'supertest';

import app from '../app';
import { chargedCost, enforceCredits } from '../middleware/enforceCredits';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { Template } from '../models/Template.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  costForTemplate,
  NON_TEMPLATE_PRICES,
  PRICE_ALIASES,
  TEMPLATE_PRICES,
} from '../services/credits.service';
import { resolveDocRule } from '../services/prompt-assembler';
import { loadTemplateConfig } from '../services/template-engine.service';
import { loadAllDocRules } from '../services/template-promoter';
import { syncTemplateRegistry } from '../services/template-seed.service';

import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: jest.fn(),
}));
const captureMessage = Sentry.captureMessage as jest.Mock;

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439227';
const MODEL = 'claude-sonnet-4-5-20250929';
const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const ROUTES_FILE = join(__dirname, '..', 'routes', 'documents.routes.ts');

// Vikram, 11 Oct 2026: the 31 documents that cost 1 Ink. Everything else is 2.
const ONE_INK_IDS = [
  'affidavit_identity',
  'affidavit_in_support',
  'amendment_of_pleadings',
  'condonation_of_delay',
  'counter_affidavit',
  'divorce_mutual_consent',
  'gpa',
  'legal_notice_breach_of_contract',
  'legal_notice_consumer_deficiency',
  'legal_notice_copyright_infringement',
  'legal_notice_defamation',
  'legal_notice_eviction',
  'legal_notice_trademark_infringement',
  'list_of_dates',
  'maintenance_bnss_144',
  'memo_of_parties',
  'mou',
  'nda',
  'production_of_documents',
  'receiver_appointment',
  'rejoinder_affidavit',
  'restoration_application',
  'service_agreement',
  'spa',
  'synopsis',
  'temporary_injunction_o39',
  'vakalatnama',
  'will',
  'legal_notice_s80',
  'legal_notice_s138',
  'rent_agreement',
];

function headers(plan = 'free') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

/** Every rule file id, from the file names on disk. */
const RULE_FILE_IDS = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

/** The docType enum of the legacy POST /generate, read from the route source. */
function legacyDocTypes(): string[] {
  const src = readFileSync(ROUTES_FILE, 'utf-8');
  const m = /const generateSchema = z\.object\(\{\s*docType: z\.enum\(\[([^\]]*)\]\)/.exec(src);
  if (!m) throw new Error('generateSchema.docType enum not found in documents.routes.ts');
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}
const LEGACY_DOC_TYPES = legacyDocTypes();

async function seedUser(inkTopup = 2000) {
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup,
  });
}
const units = async () => (await User.findById(USER_ID).lean())!.inkTopup;

beforeEach(async () => {
  mockMessagesStream.mockReset();
  captureMessage.mockClear();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
});

describe('AC1 - Vikram price list', () => {
  it('has 92 rule files priced exactly once: 31 at 1 Ink, 61 at 2 Ink', () => {
    expect(RULE_FILE_IDS).toHaveLength(92);
    expect(Object.keys(TEMPLATE_PRICES).sort()).toEqual(RULE_FILE_IDS);
    const values = Object.values(TEMPLATE_PRICES);
    expect(values.filter((v) => v === 1)).toHaveLength(31);
    expect(values.filter((v) => v === 2)).toHaveLength(61);
  });

  it("gives Vikram's 31 ids 1 Ink and every other rule id 2 Ink", () => {
    expect(ONE_INK_IDS).toHaveLength(31);
    expect(new Set(ONE_INK_IDS).size).toBe(31);
    for (const id of RULE_FILE_IDS) {
      expect({ id, cost: costForTemplate(id) }).toEqual({
        id,
        cost: ONE_INK_IDS.includes(id) ? 1 : 2,
      });
    }
  });

  it('keeps the three that were shown 1 and charged 2 at 2', () => {
    for (const id of ['bail_regular', 'bail_anticipatory', 'consumer_complaint']) {
      expect(costForTemplate(id)).toBe(2);
    }
  });

  it('prices the ids that are not rule files as Vikram wrote (12 Oct)', () => {
    expect(NON_TEMPLATE_PRICES).toEqual({
      guided: 2,
      affidavit: 1,
      petition: 2,
      plaint: 2,
      injunction: 2,
      reply: 2,
    });
    expect(costForTemplate('guided')).toBe(2);
  });

  it('freezes the price lists', () => {
    for (const table of [TEMPLATE_PRICES, NON_TEMPLATE_PRICES, PRICE_ALIASES]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });
});

describe('AC2 - one source of truth', () => {
  it('every rule file id has a price of 1 or 2 equal to the registry config creditsCost', () => {
    const { configs } = loadAllDocRules();
    expect(configs.size).toBe(92);
    expect([...configs.keys()].sort()).toEqual(RULE_FILE_IDS);
    for (const [id, config] of configs) {
      const cost = costForTemplate(id);
      expect(typeof cost).toBe('number');
      expect([1, 2]).toContain(cost);
      expect({ id, shown: (config as { creditsCost?: number }).creditsCost }).toEqual({
        id,
        shown: cost,
      });
    }
  });

  it('shown == charged for every template: seed rows and GET /templates carry the charged price', async () => {
    const registry = loadAllDocRules();
    const result = await syncTemplateRegistry(registry);
    expect(result.inserted).toBe(92);

    const rows = await Template.find({}).lean();
    expect(rows).toHaveLength(92);
    for (const row of rows) {
      expect({ id: row.templateId, shown: row.creditsCost }).toEqual({
        id: row.templateId,
        shown: costForTemplate(row.templateId),
      });
    }

    await seedUser();
    // T-385: GET /templates hides the six plaint rows while the T-375 switch is off; turn it on.
    await AppSetting.create({ key: 'feature.template_civil_plaint', value: 'on' });
    _clearAppSettingsCache();
    const res = await request(app).get('/templates').set(headers('pro'));
    expect(res.status).toBe(200);
    const listed = res.body.templates as Array<{ templateId: string; creditsCost: number }>;
    expect(listed).toHaveLength(92);
    expect(listed.map((t) => t.templateId).sort()).toEqual(RULE_FILE_IDS);
    for (const t of listed) {
      expect({ id: t.templateId, shown: t.creditsCost }).toEqual({
        id: t.templateId,
        shown: costForTemplate(t.templateId),
      });
    }
  });

  it('enforceCredits stashes, for every rule id, legacy docType and guided, the listed price', async () => {
    await seedUser();
    const ids = [...RULE_FILE_IDS, ...LEGACY_DOC_TYPES, 'guided'];
    expect(new Set(ids).size).toBeGreaterThan(92);
    for (const id of ids) {
      for (const key of ['template_id', 'docType'] as const) {
        const req = {
          jwtPayload: { sub: USER_ID },
          body: { [key]: id },
        } as unknown as Request;
        const next = jest.fn();
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
        await enforceCredits(req, res, next);
        expect({ id, key, passed: next.mock.calls.length }).toEqual({ id, key, passed: 1 });
        expect(chargedCost(req)).toBe(costForTemplate(id));
      }
    }
  });

  it('prices every legacy /generate docType (enum read from documents.routes.ts) and guided', () => {
    expect(LEGACY_DOC_TYPES.length).toBeGreaterThanOrEqual(11);
    for (const id of [...LEGACY_DOC_TYPES, 'guided']) {
      const cost = costForTemplate(id);
      expect({ id, priced: typeof cost === 'number' && [1, 2].includes(cost) }).toEqual({
        id,
        priced: true,
      });
    }
  });

  it('an alias costs exactly its target price, never a number of its own', () => {
    expect(PRICE_ALIASES).toEqual({
      bail_application: 'bail_regular',
      complaint: 'consumer_complaint',
      legal_notice: 'legal_notice_s80',
    });
    for (const [alias, target] of Object.entries(PRICE_ALIASES)) {
      expect(Object.prototype.hasOwnProperty.call(TEMPLATE_PRICES, target)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(TEMPLATE_PRICES, alias)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(NON_TEMPLATE_PRICES, alias)).toBe(false);
      expect(costForTemplate(alias)).toBe(costForTemplate(target));
    }
    expect(costForTemplate('bail_application')).toBe(2);
    expect(costForTemplate('complaint')).toBe(2);
    expect(costForTemplate('legal_notice')).toBe(1);
  });

  it('the price aliases match how the prompt assembler resolves the same docTypes', () => {
    for (const [alias, target] of Object.entries(PRICE_ALIASES)) {
      expect(resolveDocRule(alias)).not.toBeNull();
      expect(resolveDocRule(alias)).toBe(resolveDocRule(target));
    }
    // A legacy docType that is not a rule file but resolves to one must be an alias.
    for (const id of LEGACY_DOC_TYPES) {
      if (Object.prototype.hasOwnProperty.call(TEMPLATE_PRICES, id)) continue;
      if (resolveDocRule(id) !== null) {
        expect({ id, alias: id in PRICE_ALIASES }).toEqual({ id, alias: true });
      }
    }
  });

  it('every legacy docType is either a rule file, an alias or a priced non-template id', () => {
    for (const id of LEGACY_DOC_TYPES) {
      const known =
        Object.prototype.hasOwnProperty.call(TEMPLATE_PRICES, id) ||
        Object.prototype.hasOwnProperty.call(PRICE_ALIASES, id) ||
        Object.prototype.hasOwnProperty.call(NON_TEMPLATE_PRICES, id);
      expect({ id, known }).toEqual({ id, known: true });
    }
  });

  it('refuses to build the registry when a rule file has no price', () => {
    const dir = mkdtempSync(join(tmpdir(), 't227-rules-'));
    try {
      const rule = (id: string, creditsCost?: number) =>
        JSON.stringify({ template_id: id, category: 'civil', title: id, creditsCost });
      writeFileSync(join(dir, 'nda.json'), rule('nda'));
      // Even a rule file that states its own price does not get one.
      writeFileSync(join(dir, 'zz_unpriced.json'), rule('zz_unpriced', 2));
      writeFileSync(join(dir, 'aa_unpriced.json'), rule('aa_unpriced', 1));
      expect(() => loadAllDocRules(dir)).toThrow(/no price.*aa_unpriced, zz_unpriced/);
      expect(() => loadAllDocRules(dir)).not.toThrow(/nda/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a registry from a directory where every id is priced', () => {
    const dir = mkdtempSync(join(tmpdir(), 't227-rules-'));
    try {
      writeFileSync(join(dir, 'nda.json'), JSON.stringify({ template_id: 'nda', category: 'c' }));
      const built = loadAllDocRules(dir);
      expect((built.configs.get('nda') as { creditsCost?: number }).creditsCost).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('costForTemplate gives no price to anything off the list, including object keys', () => {
    for (const id of [
      'not_a_template',
      '',
      'NDA',
      ' nda',
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect({ id, cost: costForTemplate(id) }).toEqual({ id, cost: undefined });
    }
  });

  it('chargedCost throws instead of falling back to a default price', () => {
    expect(() => chargedCost({} as Request)).toThrow(/no price/);
    expect(() => chargedCost({ creditCost: '2' } as unknown as Request)).toThrow(/no price/);
    expect(chargedCost({ creditCost: 2 } as unknown as Request)).toBe(2);
  });
});

describe('unknown id: 400 from enforceCredits, before any spend or LLM call', () => {
  async function expectRefused(
    res: request.Response,
    templateIdTag: string,
    startingUnits = 2000,
    submitted?: string,
  ): Promise<void> {
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown document type' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await units()).toBe(startingUnits);
    expect(await Generation.countDocuments({})).toBe(0);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('enforceCredits: document id has no price', {
      level: 'warning',
      tags: { feature: 'pricing', templateId: templateIdTag },
    });
    expect(['(missing)', '(malformed)', '(unlisted)', '(conflict)']).toContain(templateIdTag);
    if (submitted !== undefined) {
      expect(JSON.stringify(captureMessage.mock.calls)).not.toContain(submitted);
    }
  }

  beforeEach(async () => {
    await seedUser();
  });

  it('POST /generate-from-template with an unknown template_id', async () => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'not_a_template', form_data: {} });
    await expectRefused(res, '(unlisted)', 2000, 'not_a_template');
    expect(JSON.stringify(res.body)).not.toContain('not_a_template');
  });

  it('POST /generate-from-template with no id at all', async () => {
    const res = await request(app).post('/generate-from-template').set(headers()).send({
      form_data: {},
    });
    await expectRefused(res, '(missing)');
  });

  it('an id that is not a string counts as missing', async () => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 227, form_data: {} });
    await expectRefused(res, '(missing)');
  });

  it.each([
    ['spaces', 'not a template'],
    ['an at sign', 'me@example.com'],
    ['upper case', 'Bail_Regular'],
    ['a path', '../../etc/passwd'],
    ['too long', 'a'.repeat(101)],
  ])('a malformed id (%s) is tagged (malformed) and never echoed', async (_name, bad) => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: bad, form_data: {} });
    await expectRefused(res, '(malformed)', 2000, bad);
    expect(JSON.stringify(res.body)).not.toContain(bad);
  });

  it.each([
    ['constructor', '(unlisted)'],
    ['__proto__', '(unlisted)'],
    ['toString', '(malformed)'],
  ])('object key %s is not a price', async (key, tag) => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: key, form_data: {} });
    await expectRefused(res, tag, 2000, key);
  });

  it('POST /generate (legacy) with an unknown docType', async () => {
    const res = await request(app)
      .post('/generate')
      .set(headers())
      .send({ docType: 'sale_deed_of_the_moon' });
    await expectRefused(res, '(unlisted)', 2000, 'sale_deed_of_the_moon');
  });

  it('a body with both ids that differ is a (conflict) on legacy /generate', async () => {
    const res = await request(app)
      .post('/generate')
      .set(headers())
      .send({ docType: 'petition', template_id: 'nda' });
    await expectRefused(res, '(conflict)', 2000, 'petition');
    expect(JSON.stringify(captureMessage.mock.calls)).not.toContain('nda');
  });

  it('a conflict is refused even when the balance is zero (400, not 402)', async () => {
    await User.updateOne({ _id: USER_ID }, { inkTopup: 0 });
    const res = await request(app)
      .post('/generate')
      .set(headers())
      .send({ docType: 'petition', template_id: 'nda' });
    await expectRefused(res, '(conflict)', 0);
  });

  it('an empty template_id next to a docType counts as present, so it is a conflict', async () => {
    const res = await request(app)
      .post('/generate')
      .set(headers())
      .send({ docType: 'petition', template_id: '' });
    await expectRefused(res, '(conflict)');
  });

  it('equal ids proceed and are charged at that id price', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. That the applicant prays.', 1000, 200));
    const req = {
      jwtPayload: { sub: USER_ID },
      body: { template_id: 'nda', docType: 'nda' },
    } as unknown as Request;
    const next = jest.fn();
    await enforceCredits(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(chargedCost(req)).toBe(1);
    const req2 = {
      jwtPayload: { sub: USER_ID },
      body: { template_id: 'petition', docType: 'petition' },
    } as unknown as Request;
    await enforceCredits(req2, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(chargedCost(req2)).toBe(2);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('only one of the two ids present is unchanged: priced by whichever is there', async () => {
    for (const body of [
      { template_id: 'nda' },
      { docType: 'nda' },
      { template_id: 'nda', docType: null },
    ]) {
      const req = { jwtPayload: { sub: USER_ID }, body } as unknown as Request;
      const next = jest.fn();
      await enforceCredits(req, {} as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(chargedCost(req)).toBe(1);
    }
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('POST /generate-from-brief with an unknown kind', async () => {
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    _clearAppSettingsCache();
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'not_a_pack', values: [] });
    await expectRefused(res, '(unlisted)', 2000, 'not_a_pack');
  });

  it('is a 400, not a 402, even for a user with no Ink at all', async () => {
    await User.updateOne({ _id: USER_ID }, { inkTopup: 0 });
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'not_a_template', form_data: {} });
    await expectRefused(res, '(unlisted)', 0, 'not_a_template');
  });

  it('a known id with too little Ink is still a 402 with the listed cost, and is not reported', async () => {
    await User.updateOne({ _id: USER_ID }, { inkTopup: 2 }); // 1 Ink
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: {} });
    expect(res.status).toBe(402);
    expect(res.body.cost).toBe(2);
    expect(res.body.needsTopUp).toBe(true);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    // A 1-Ink document is affordable with the same balance.
    const ok = jest.fn();
    await enforceCredits(
      { jwtPayload: { sub: USER_ID }, body: { template_id: 'nda' } } as unknown as Request,
      {} as Response,
      ok,
    );
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('the amount charged is the price shown', () => {
  const BAIL_FORM_DATA = {
    fir_number: '124/2026',
    fir_date: '2026-03-15',
    police_station: 'Kotwali, Patna',
    sections_charged: ['103'],
    currently_in_custody: 'yes_judicial',
    custody_since: '2026-03-15',
    state: 'bihar',
    court_type: 'sessions',
    court_name: 'district_sessions_patna',
    applicant_name: 'Ram Kumar',
    father_name: 'Shri Hari Kumar',
    applicant_age: '32',
    address: '123 Main St',
    language: 'en',
    facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
    grounds_for_bail: ['false_implication', 'no_flight_risk'],
  };

  /** Minimal answers for every required, visible field of a template's form. */
  function formDataFor(templateId: string): Record<string, unknown> {
    const config = loadTemplateConfig(templateId)!;
    const data: Record<string, unknown> = {};
    for (const step of config.form_schema.steps) {
      for (const f of step.fields) {
        if (!f.required) continue;
        const first = f.options?.[0]?.id;
        if (f.type === 'checkbox_group' || f.type === 'multi_select_search') {
          data[f.field_id] = first === undefined ? ['x'] : [first];
        } else if (f.type === 'date') data[f.field_id] = '2026-03-15';
        else if (f.type === 'number' || f.type === 'currency') data[f.field_id] = 5;
        else if (f.type === 'dropdown' || f.type === 'dropdown_search')
          data[f.field_id] = first ?? 'x';
        else data[f.field_id] = 'Sample text for the field';
      }
    }
    return data;
  }

  async function generate(templateId: string, formData: Record<string, unknown>) {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. That the applicant prays.', 1000, 200));
    return request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: templateId, form_data: formData });
  }

  beforeEach(async () => {
    await seedUser();
  });

  it('a 2-Ink template (bail_regular) takes 4 units, and it is the price in the list', async () => {
    expect(costForTemplate('bail_regular')).toBe(2);
    const res = await generate('bail_regular', BAIL_FORM_DATA);
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    expect(await units()).toBe(2000 - 4);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('a 1-Ink template (nda) takes 2 units, and it is the price in the list', async () => {
    expect(costForTemplate('nda')).toBe(1);
    const res = await generate('nda', formDataFor('nda'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    expect(await units()).toBe(2000 - 2);
  });

  it('a failed generation is not charged', async () => {
    mockMessagesStream.mockRejectedValue(new Error('model down'));
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'nda', form_data: formDataFor('nda') });
    expect(res.text).not.toContain('event: done');
    expect(await units()).toBe(2000);
  });
});
