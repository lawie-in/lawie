/**
 * T-240 - the template catalogue: one list in code (config/catalogue) maps
 * every template id to one of T-239's 26 library categories, and holds the one
 * price list and the one alias map.
 *
 * Arjun's conditions (12 Oct 2026):
 *  1. `category` (the behaviour value) is pinned for every existing id; none changes.
 *  2. Prices and aliases are pinned byte for byte and live only in config/catalogue.
 *  3. A bad catalogue fails at load, never at request time.
 *
 * The literal tables below were read once from origin/develop_staging
 * (document-rules/*.json `category`, docs/templates/*.json `category`,
 * credits.service.ts prices) and pasted in. Do not regenerate them from the
 * code under test. `catalogueCategory` literals are Ajay's signed filing.
 */
import './setupDb';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Types } from 'mongoose';
import request from 'supertest';

import app from '../app';
import * as catalogue from '../config/catalogue';
import {
  CATALOGUE_CATEGORIES,
  DOC_TYPE_ALIASES,
  NON_TEMPLATE_PRICES,
  TEMPLATE_CATALOGUE,
  TEMPLATE_PRICES,
  catalogueCategoryDisplay,
  catalogueCategoryFor,
  mergeCatalogueBatches,
  requireCatalogueCategory,
} from '../config/catalogue';
import type { CatalogueBatch } from '../config/catalogue';
import { Template } from '../models/Template.model';
import * as appSettings from '../services/app-settings.service';
import * as credits from '../services/credits.service';
import { resolveDocRule } from '../services/prompt-assembler';
import { clearConfigCache, loadTemplateConfig } from '../services/template-engine.service';
import { loadAllDocRules } from '../services/template-promoter';
import { syncTemplateRegistry } from '../services/template-seed.service';

const SRC = join(__dirname, '..');
const RULES_DIR = join(SRC, 'config', 'document-rules');
const OVERRIDES_DIR = join(SRC, '..', '..', '..', 'docs', 'templates');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

function headers(role = 'Client') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439240',
    'x-user-email': 't240@test.com',
    'x-user-name': 'T240',
    'x-user-plan': 'pro',
    'x-user-role': role,
  };
}

// ── Literal tables (origin/develop_staging) ──────────────────────────────

/** Behaviour value `category` of each of the 92 rule files, as they are today. */
const EXPECTED_BEHAVIOUR_CATEGORY: Record<string, string> = {
  affidavit_identity: 'non_court_legal_document',
  affidavit_in_support: 'procedural',
  amendment_of_pleadings: 'civil_interlocutory',
  aoa: 'corporate',
  bail_anticipatory: 'criminal',
  bail_before_magistrate: 'criminal_bail',
  bail_cancellation: 'criminal_bail',
  bail_regular: 'criminal',
  cat_oa: 'tribunal',
  certiorari: 'writ',
  condonation_of_delay: 'civil_interlocutory',
  consumer_complaint: 'consumer',
  counter_affidavit: 'procedural',
  criminal_appeal: 'criminal_petition',
  criminal_revision: 'criminal_petition',
  curative_petition: 'writ',
  default_bail: 'criminal_bail',
  discharge_application: 'criminal_petition',
  distribution_agreement: 'corporate',
  divorce_hma: 'family',
  divorce_mutual_consent: 'family',
  divorce_sma: 'family',
  dv_act_complaint: 'family',
  employment_agreement: 'corporate',
  fir_quashing: 'criminal_petition',
  founders_agreement: 'corporate',
  franchise_agreement: 'corporate',
  gift_deed: 'transactional_deed',
  gpa: 'transactional_deed',
  guardianship_petition: 'family',
  habeas_corpus: 'writ',
  ibc_application: 'tribunal',
  interim_application: 'writ',
  interim_bail: 'criminal_bail',
  itat_appeal: 'tribunal',
  joint_development_agreement: 'transactional_deed',
  judicial_separation: 'family',
  lease_deed: 'transactional_deed',
  legal_notice_breach_of_contract: 'notice',
  legal_notice_consumer_deficiency: 'notice',
  legal_notice_copyright_infringement: 'notice',
  legal_notice_defamation: 'notice',
  legal_notice_eviction: 'notice',
  legal_notice_s138: 'criminal',
  legal_notice_s80: 'civil',
  legal_notice_trademark_infringement: 'notice',
  license_agreement: 'transactional_deed',
  list_of_dates: 'procedural',
  loan_agreement: 'corporate',
  mact_claim: 'tribunal',
  maintenance_bnss_144: 'family',
  mandamus: 'writ',
  memo_of_parties: 'procedural',
  moa: 'corporate',
  mortgage_deed: 'transactional_deed',
  mou: 'transactional_deed',
  nda: 'corporate',
  partition_deed: 'transactional_deed',
  pil: 'writ',
  plaint_declaration: 'civil_pleading',
  plaint_eviction: 'civil_pleading',
  plaint_injunction: 'civil_pleading',
  plaint_partition: 'civil_pleading',
  plaint_recovery: 'civil_pleading',
  plaint_specific_performance: 'civil_pleading',
  posh_complaint: 'tribunal',
  production_of_documents: 'civil_interlocutory',
  quashing_528_bnss: 'criminal_petition',
  quo_warranto: 'writ',
  rcr_petition: 'family',
  receiver_appointment: 'civil_interlocutory',
  rejoinder_affidavit: 'procedural',
  release_deed: 'transactional_deed',
  rent_agreement: 'civil',
  replication: 'civil_pleading',
  rera_complaint: 'tribunal',
  restoration_application: 'procedural',
  review_petition: 'writ',
  sale_deed: 'transactional_deed',
  service_agreement: 'corporate',
  shareholders_agreement: 'corporate',
  slp: 'writ',
  spa: 'transactional_deed',
  surrender_application: 'criminal_procedural',
  suspension_of_sentence: 'criminal_appellate',
  synopsis: 'procedural',
  temporary_injunction_o39: 'civil_interlocutory',
  vakalatnama: 'procedural',
  will: 'transactional_deed',
  writ_petition_civil: 'writ',
  writ_petition_criminal: 'writ',
  written_statement: 'civil_pleading',
};

/** Ajay's signed filing: id -> catalogueCategory. */
const EXPECTED_CATALOGUE_CATEGORY: Record<string, string> = {
  affidavit_identity: 'affidavits_court_forms',
  affidavit_in_support: 'affidavits_court_forms',
  amendment_of_pleadings: 'civil_defence_interlocutory',
  aoa: 'company_insolvency',
  bail_anticipatory: 'criminal_bail_custody',
  bail_before_magistrate: 'criminal_bail_custody',
  bail_cancellation: 'criminal_bail_custody',
  bail_regular: 'criminal_bail_custody',
  cat_oa: 'service_labour',
  certiorari: 'writs_constitutional',
  condonation_of_delay: 'civil_defence_interlocutory',
  consumer_complaint: 'consumer',
  counter_affidavit: 'affidavits_court_forms',
  criminal_appeal: 'criminal_appeals_revisions_quashing',
  criminal_revision: 'criminal_appeals_revisions_quashing',
  curative_petition: 'writs_constitutional',
  default_bail: 'criminal_bail_custody',
  discharge_application: 'criminal_complaints_police_trial',
  distribution_agreement: 'contracts_agreements',
  divorce_hma: 'family_matrimonial',
  divorce_mutual_consent: 'family_matrimonial',
  divorce_sma: 'family_matrimonial',
  dv_act_complaint: 'family_matrimonial',
  employment_agreement: 'contracts_agreements',
  fir_quashing: 'criminal_appeals_revisions_quashing',
  founders_agreement: 'company_insolvency',
  franchise_agreement: 'contracts_agreements',
  gift_deed: 'property_conveyancing',
  gpa: 'property_conveyancing',
  guardianship_petition: 'family_matrimonial',
  habeas_corpus: 'writs_constitutional',
  ibc_application: 'company_insolvency',
  interim_application: 'writs_constitutional',
  interim_bail: 'criminal_bail_custody',
  itat_appeal: 'tax',
  joint_development_agreement: 'property_conveyancing',
  judicial_separation: 'family_matrimonial',
  lease_deed: 'property_conveyancing',
  legal_notice_breach_of_contract: 'notices_replies',
  legal_notice_consumer_deficiency: 'notices_replies',
  legal_notice_copyright_infringement: 'notices_replies',
  legal_notice_defamation: 'notices_replies',
  legal_notice_eviction: 'notices_replies',
  legal_notice_s138: 'cheque_bounce_ni_act',
  legal_notice_s80: 'notices_replies',
  legal_notice_trademark_infringement: 'notices_replies',
  license_agreement: 'property_conveyancing',
  list_of_dates: 'affidavits_court_forms',
  loan_agreement: 'contracts_agreements',
  mact_claim: 'mact',
  maintenance_bnss_144: 'family_matrimonial',
  mandamus: 'writs_constitutional',
  memo_of_parties: 'affidavits_court_forms',
  moa: 'company_insolvency',
  mortgage_deed: 'property_conveyancing',
  mou: 'contracts_agreements',
  nda: 'contracts_agreements',
  partition_deed: 'property_conveyancing',
  pil: 'writs_constitutional',
  plaint_declaration: 'civil_plaints_suits',
  plaint_eviction: 'civil_plaints_suits',
  plaint_injunction: 'civil_plaints_suits',
  plaint_partition: 'civil_plaints_suits',
  plaint_recovery: 'civil_plaints_suits',
  plaint_specific_performance: 'civil_plaints_suits',
  posh_complaint: 'service_labour',
  production_of_documents: 'civil_defence_interlocutory',
  quashing_528_bnss: 'criminal_appeals_revisions_quashing',
  quo_warranto: 'writs_constitutional',
  rcr_petition: 'family_matrimonial',
  receiver_appointment: 'civil_defence_interlocutory',
  rejoinder_affidavit: 'affidavits_court_forms',
  release_deed: 'property_conveyancing',
  rent_agreement: 'rent_control_tenancy',
  replication: 'civil_defence_interlocutory',
  rera_complaint: 'rera',
  restoration_application: 'affidavits_court_forms',
  review_petition: 'civil_appeals_revision_review_execution',
  sale_deed: 'property_conveyancing',
  service_agreement: 'contracts_agreements',
  shareholders_agreement: 'company_insolvency',
  slp: 'writs_constitutional',
  spa: 'property_conveyancing',
  surrender_application: 'criminal_complaints_police_trial',
  suspension_of_sentence: 'criminal_bail_custody',
  synopsis: 'affidavits_court_forms',
  temporary_injunction_o39: 'civil_defence_interlocutory',
  vakalatnama: 'affidavits_court_forms',
  will: 'property_conveyancing',
  writ_petition_civil: 'writs_constitutional',
  writ_petition_criminal: 'writs_constitutional',
  written_statement: 'civil_defence_interlocutory',
};

/** Vikram's T-227 prices, from credits.service.ts on origin/develop_staging. */
const EXPECTED_PRICES: Record<string, number> = {
  affidavit_identity: 1,
  affidavit_in_support: 1,
  amendment_of_pleadings: 1,
  aoa: 2,
  bail_anticipatory: 2,
  bail_before_magistrate: 2,
  bail_cancellation: 2,
  bail_regular: 2,
  cat_oa: 2,
  certiorari: 2,
  condonation_of_delay: 1,
  consumer_complaint: 2,
  counter_affidavit: 1,
  criminal_appeal: 2,
  criminal_revision: 2,
  curative_petition: 2,
  default_bail: 2,
  discharge_application: 2,
  distribution_agreement: 2,
  divorce_hma: 2,
  divorce_mutual_consent: 1,
  divorce_sma: 2,
  dv_act_complaint: 2,
  employment_agreement: 2,
  fir_quashing: 2,
  founders_agreement: 2,
  franchise_agreement: 2,
  gift_deed: 2,
  gpa: 1,
  guardianship_petition: 2,
  habeas_corpus: 2,
  ibc_application: 2,
  interim_application: 2,
  interim_bail: 2,
  itat_appeal: 2,
  joint_development_agreement: 2,
  judicial_separation: 2,
  lease_deed: 2,
  legal_notice_breach_of_contract: 1,
  legal_notice_consumer_deficiency: 1,
  legal_notice_copyright_infringement: 1,
  legal_notice_defamation: 1,
  legal_notice_eviction: 1,
  legal_notice_s138: 1,
  legal_notice_s80: 1,
  legal_notice_trademark_infringement: 1,
  license_agreement: 2,
  list_of_dates: 1,
  loan_agreement: 2,
  mact_claim: 2,
  maintenance_bnss_144: 1,
  mandamus: 2,
  memo_of_parties: 1,
  moa: 2,
  mortgage_deed: 2,
  mou: 1,
  nda: 1,
  partition_deed: 2,
  pil: 2,
  plaint_declaration: 2,
  plaint_eviction: 2,
  plaint_injunction: 2,
  plaint_partition: 2,
  plaint_recovery: 2,
  plaint_specific_performance: 2,
  posh_complaint: 2,
  production_of_documents: 1,
  quashing_528_bnss: 2,
  quo_warranto: 2,
  rcr_petition: 2,
  receiver_appointment: 1,
  rejoinder_affidavit: 1,
  release_deed: 2,
  rent_agreement: 1,
  replication: 2,
  rera_complaint: 2,
  restoration_application: 1,
  review_petition: 2,
  sale_deed: 2,
  service_agreement: 1,
  shareholders_agreement: 2,
  slp: 2,
  spa: 1,
  surrender_application: 2,
  suspension_of_sentence: 2,
  synopsis: 1,
  temporary_injunction_o39: 1,
  vakalatnama: 1,
  will: 1,
  writ_petition_civil: 2,
  writ_petition_criminal: 2,
  written_statement: 2,
};

/** The 6 docs/templates overrides: their own behaviour `category` (differs from the rule file for 3). */
const EXPECTED_OVERRIDE_BEHAVIOUR_CATEGORY: Record<string, string> = {
  bail_anticipatory: 'criminal',
  bail_regular: 'criminal',
  consumer_complaint: 'civil',
  legal_notice_s138: 'criminal',
  legal_notice_s80: 'civil',
  rent_agreement: 'civil',
};

const EXPECTED_NON_TEMPLATE_PRICES = {
  guided: 2,
  affidavit: 1,
  petition: 2,
  plaint: 2,
  injunction: 2,
  reply: 2,
};

const EXPECTED_ALIASES = {
  bail_application: 'bail_regular',
  complaint: 'consumer_complaint',
  legal_notice: 'legal_notice_s80',
};

/** T-239, in order, names exactly. */
const EXPECTED_CATEGORY_NAMES = [
  'Criminal: bail and custody',
  'Criminal: complaints, police, trial applications',
  'Criminal: appeals, revisions, quashing',
  'Cheque bounce / NI Act',
  'Civil: plaints and suits',
  'Civil: defence and interlocutory',
  'Civil: appeals, revision, review, execution',
  'Family and matrimonial',
  'Succession and probate',
  'Property and conveyancing',
  'Rent control and tenancy',
  'Revenue and land records',
  'Consumer',
  'Service and labour',
  'Company and insolvency',
  'Contracts and agreements',
  'Writs and constitutional',
  'Tax',
  'IP',
  'Arbitration and commercial courts',
  'RERA',
  'MACT',
  'Notices and replies',
  'Affidavits and court forms',
  'RTI',
  'Banking recovery: DRT and SARFAESI',
];
const EMPTY_CATEGORY_NUMBERS = [9, 12, 19, 20, 25, 26];

const ALL_IDS = Object.keys(EXPECTED_PRICES).sort();
const RULE_FILE_IDS = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();
const OVERRIDE_IDS = readdirSync(OVERRIDES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || p === join(SRC, 'config', 'catalogue')) continue;
      walkTs(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const ID_TO_NUMBER = (id: string) => new RegExp(`['"]?\\b${id}\\b['"]?\\s*:\\s*\\d+\\b`);
const ALIAS_LITERALS = [
  /\bbail_application['"]?\s*:/,
  /['"]bail_regular['"]\s*:/,
  /\bcomplaint['"]?\s*:\s*['"]consumer_complaint['"]/,
  /\blegal_notice['"]?\s*:\s*['"]legal_notice_s80['"]/,
];
/** Returns why `source` defines a price table or alias literal, or [] when it does not. */
function priceOrAliasLiterals(source: string): string[] {
  const why: string[] = [];
  const priced = ALL_IDS.filter((id) => ID_TO_NUMBER(id).test(source));
  if (priced.length >= 5) why.push(`${priced.length} template ids mapped to numbers`);
  for (const re of ALIAS_LITERALS) if (re.test(source)) why.push(`alias literal ${re}`);
  return why;
}

// T-375: the plaint switch is off in code, so these tests turn it on for their own describe block.
function plaintSwitchOn(): void {
  const real = appSettings.getAppSetting;
  jest
    .spyOn(appSettings, 'getAppSetting')
    .mockImplementation((key: string) =>
      key === 'feature.template_civil_plaint' ? Promise.resolve('on') : real(key),
    );
}

// ── Condition 1: the behaviour value is pinned ───────────────────────────

describe('T-240 cond 1 - behaviour `category` does not change', () => {
  // T-375: plaintSwitchOn() spies on getAppSetting; do not let it leak past this block.
  afterEach(() => jest.restoreAllMocks());

  const registry = loadAllDocRules();

  it('pins 92 literal ids, one per rule file', () => {
    expect(Object.keys(EXPECTED_BEHAVIOUR_CATEGORY).sort()).toEqual(RULE_FILE_IDS);
    expect(RULE_FILE_IDS).toHaveLength(92);
  });

  it.each(Object.entries(EXPECTED_BEHAVIOUR_CATEGORY))(
    'registry config %s keeps category %s',
    (id, category) => {
      expect(registry.configs.get(id)?.category).toBe(category);
    },
  );

  it.each(Object.entries(EXPECTED_BEHAVIOUR_CATEGORY))(
    'loadTemplateConfig(%s).category is the behaviour value (override or rule file)',
    (id, category) => {
      clearConfigCache();
      const expected = EXPECTED_OVERRIDE_BEHAVIOUR_CATEGORY[id] ?? category;
      expect(loadTemplateConfig(id)?.category).toBe(expected);
    },
  );

  it('pins the 6 docs/templates overrides', () => {
    expect(OVERRIDE_IDS).toEqual(Object.keys(EXPECTED_OVERRIDE_BEHAVIOUR_CATEGORY).sort());
    clearConfigCache();
    for (const [id, category] of Object.entries(EXPECTED_OVERRIDE_BEHAVIOUR_CATEGORY)) {
      expect(loadTemplateConfig(id)?.category).toBe(category);
    }
  });

  it('GET /template-configs still returns the behaviour value in `category`', async () => {
    plaintSwitchOn();
    clearConfigCache();
    const res = await request(app).get('/template-configs').set(headers());
    const byId = new Map(
      res.body.templates.map((t: { template_id: string; category: string }) => [t.template_id, t]),
    );
    for (const id of ALL_IDS) {
      const expected = EXPECTED_OVERRIDE_BEHAVIOUR_CATEGORY[id] ?? EXPECTED_BEHAVIOUR_CATEGORY[id];
      expect((byId.get(id) as { category: string }).category).toBe(expected);
    }
  });
});

// ── Condition 2: prices and aliases ──────────────────────────────────────

describe('T-240 cond 2 - prices and aliases live only in config/catalogue', () => {
  const sorted = (o: Record<string, unknown>) =>
    JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));

  it('TEMPLATE_PRICES equals the 92 literal prices, byte for byte', () => {
    expect(Object.keys(EXPECTED_PRICES)).toHaveLength(92);
    expect(sorted(TEMPLATE_PRICES)).toBe(sorted(EXPECTED_PRICES));
    expect(TEMPLATE_PRICES).toStrictEqual(EXPECTED_PRICES);
  });

  it('31 documents cost 1 Ink and the rest 2', () => {
    expect(Object.values(EXPECTED_PRICES).filter((p) => p === 1)).toHaveLength(31);
    expect(Object.values(EXPECTED_PRICES).filter((p) => p === 2)).toHaveLength(61);
  });

  it('NON_TEMPLATE_PRICES and the 3 aliases equal the literals', () => {
    expect(sorted(NON_TEMPLATE_PRICES)).toBe(sorted(EXPECTED_NON_TEMPLATE_PRICES));
    expect(sorted(DOC_TYPE_ALIASES)).toBe(sorted(EXPECTED_ALIASES));
    expect(Object.keys(DOC_TYPE_ALIASES)).toHaveLength(3);
  });

  it('credits.service re-exports the identical objects', () => {
    expect(credits.TEMPLATE_PRICES).toBe(TEMPLATE_PRICES);
    expect(credits.NON_TEMPLATE_PRICES).toBe(NON_TEMPLATE_PRICES);
    expect(credits.PRICE_ALIASES).toBe(DOC_TYPE_ALIASES);
  });

  it('everything is frozen', () => {
    for (const t of [
      TEMPLATE_PRICES,
      NON_TEMPLATE_PRICES,
      DOC_TYPE_ALIASES,
      TEMPLATE_CATALOGUE,
      CATALOGUE_CATEGORIES,
    ]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
    for (const e of Object.values(TEMPLATE_CATALOGUE)) expect(Object.isFrozen(e)).toBe(true);
    for (const c of CATALOGUE_CATEGORIES) expect(Object.isFrozen(c)).toBe(true);
    expect(() => {
      (TEMPLATE_PRICES as Record<string, number>).bail_regular = 99;
    }).toThrow();
    expect(TEMPLATE_PRICES.bail_regular).toBe(2);
  });

  it('costForTemplate charges the pinned price, and an alias its target price', () => {
    for (const id of ALL_IDS) expect(credits.costForTemplate(id)).toBe(EXPECTED_PRICES[id]);
    for (const [id, p] of Object.entries(EXPECTED_NON_TEMPLATE_PRICES)) {
      expect(credits.costForTemplate(id)).toBe(p);
    }
    for (const [alias, target] of Object.entries(EXPECTED_ALIASES)) {
      expect(credits.costForTemplate(alias)).toBe(EXPECTED_PRICES[target]);
    }
    expect(credits.costForTemplate('not_a_template')).toBeUndefined();
  });

  it('prompt-assembler resolves aliases with the same map', () => {
    for (const [alias, target] of Object.entries(EXPECTED_ALIASES)) {
      expect(resolveDocRule(alias)).toEqual(resolveDocRule(target));
    }
  });

  it('no source file outside config/catalogue defines a price table or alias literal', () => {
    const files = walkTs(SRC);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files
      .map((f) => ({ f, why: priceOrAliasLiterals(readFileSync(f, 'utf-8')) }))
      .filter((x) => x.why.length > 0)
      .map((x) => `${x.f.replace(SRC + '/', '')}: ${x.why.join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('the scan itself catches a price table and an alias literal (self-check)', () => {
    const table = ALL_IDS.slice(0, 5)
      .map((id) => `  ${id}: 2,`)
      .join('\n');
    expect(priceOrAliasLiterals(`const X = {\n${table}\n};`)).not.toEqual([]);
    expect(priceOrAliasLiterals(`const A = { bail_application: 'bail_regular' };`)).not.toEqual([]);
    expect(priceOrAliasLiterals(`const A = { 'bail_regular': 2 };`)).not.toEqual([]);
    expect(priceOrAliasLiterals(`const A = { legal_notice: 'legal_notice_s80' };`)).not.toEqual([]);
    expect(priceOrAliasLiterals(`const x = { bail_regular: 2, nda: 1 };`)).toEqual([]);
  });
});

// ── Condition 3 + AC9: load-time failure ─────────────────────────────────

describe('T-240 cond 3 - a bad catalogue fails at load', () => {
  const ok = (name: string, templates: CatalogueBatch['templates']): CatalogueBatch => ({
    name,
    templates,
  });

  it('merges valid batches into one frozen table (AC9)', () => {
    const merged = mergeCatalogueBatches([
      ok('a', { x1: { category: 'consumer', price: 2 } }),
      ok('b', { x2: { category: 'rera', price: 1 } }),
    ]);
    expect(merged).toEqual({
      x1: { category: 'consumer', price: 2 },
      x2: { category: 'rera', price: 1 },
    });
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.x1)).toBe(true);
  });

  it('throws on an unknown catalogue category, naming the id and batch', () => {
    expect(() =>
      mergeCatalogueBatches([ok('batch9', { x1: { category: 'criminal' as never, price: 2 } })]),
    ).toThrow(/x1.*batch9.*unknown catalogue category 'criminal'/);
    expect(() =>
      mergeCatalogueBatches([ok('b', { x1: { category: undefined as never, price: 2 } })]),
    ).toThrow(/unknown catalogue category/);
  });

  it('throws on an id in two batches', () => {
    expect(() =>
      mergeCatalogueBatches([
        ok('first', { dup: { category: 'tax', price: 2 } }),
        ok('second', { dup: { category: 'tax', price: 2 } }),
      ]),
    ).toThrow(/dup: in both first and second/);
  });

  it('throws when a batch repeats an id of the real base batch', () => {
    const real = Object.entries(TEMPLATE_CATALOGUE).slice(0, 1)[0];
    expect(() =>
      mergeCatalogueBatches([
        ok('base-copy', Object.fromEntries([real])),
        ok('other', Object.fromEntries([real])),
      ]),
    ).toThrow(/in both/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, '2' as unknown as number, undefined as unknown as number])(
    'throws on price %p',
    (price) => {
      expect(() => mergeCatalogueBatches([ok('b', { x1: { category: 'tax', price } })])).toThrow(
        /price must be a whole number above 0/,
      );
    },
  );

  it('reports every problem in one error', () => {
    expect(() =>
      mergeCatalogueBatches([
        ok('b', {
          p: { category: 'nope' as never, price: 2 },
          q: { category: 'tax', price: 0 },
        }),
      ]),
    ).toThrow(/p \(b\).*q \(b\)/);
  });

  describe('loadAllDocRules', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 't240-rules-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('throws for a rule id with no catalogue entry', () => {
      const rule = JSON.parse(readFileSync(join(RULES_DIR, 'nda.json'), 'utf-8'));
      rule.template_id = 'zz_uncatalogued_rule';
      writeFileSync(join(dir, 'zz_uncatalogued_rule.json'), JSON.stringify(rule));
      expect(() => loadAllDocRules(dir)).toThrow(/zz_uncatalogued_rule/);
    });

    it('throws for a rule file with an id derived from its name and no entry', () => {
      const rule = JSON.parse(readFileSync(join(RULES_DIR, 'nda.json'), 'utf-8'));
      delete rule.template_id;
      writeFileSync(join(dir, 'zz_brand_new.json'), JSON.stringify(rule));
      expect(() => loadAllDocRules(dir)).toThrow(/zz_brand_new/);
    });

    it('loads a catalogued rule file and sets its catalogueCategory', () => {
      const rule = readFileSync(join(RULES_DIR, 'nda.json'), 'utf-8');
      writeFileSync(join(dir, 'nda.json'), rule);
      const { configs } = loadAllDocRules(dir);
      expect(configs.get('nda')?.catalogueCategory).toBe('contracts_agreements');
    });
  });

  it('the seed refuses an entry with no catalogueCategory', async () => {
    const real = loadAllDocRules();
    const cfg = { ...real.configs.get('nda')! };
    delete (cfg as { catalogueCategory?: string }).catalogueCategory;
    await expect(
      syncTemplateRegistry({
        configs: new Map([['nda', cfg]]),
        mismatchReport: [],
        byFile: new Map(),
      }),
    ).rejects.toThrow(/no catalogue category/);
  });
});

// ── AC1-3: one category per rule file ────────────────────────────────────

describe('T-240 AC1-3 - every rule file has exactly one catalogue entry', () => {
  it('rule files and catalogue ids are the same set (92)', () => {
    expect(Object.keys(TEMPLATE_CATALOGUE).sort()).toEqual(RULE_FILE_IDS);
    expect(Object.keys(TEMPLATE_CATALOGUE)).toHaveLength(92);
  });

  it('a rule file without an entry, or an entry without a rule file, fails here', () => {
    const missing = RULE_FILE_IDS.filter((id) => catalogueCategoryFor(id) === undefined);
    const orphans = Object.keys(TEMPLATE_CATALOGUE).filter((id) => !RULE_FILE_IDS.includes(id));
    expect({ missing, orphans }).toEqual({ missing: [], orphans: [] });
  });

  it('every docs/templates override id has a catalogue entry (override loading is lazy)', () => {
    expect(OVERRIDE_IDS).toHaveLength(6);
    for (const id of OVERRIDE_IDS) {
      expect(catalogueCategoryFor(id)).toBeDefined();
      expect(() => requireCatalogueCategory(id)).not.toThrow();
    }
  });

  it('every catalogue category is one of the 26, and every price an integer above 0', () => {
    const ids = new Set(CATALOGUE_CATEGORIES.map((c) => c.id));
    for (const e of Object.values(TEMPLATE_CATALOGUE)) {
      expect(ids.has(e.category)).toBe(true);
      expect(Number.isInteger(e.price) && e.price > 0).toBe(true);
    }
  });

  it('requireCatalogueCategory throws for an unknown id', () => {
    expect(() => requireCatalogueCategory('zz_nope')).toThrow(/no catalogue category/);
    expect(catalogueCategoryFor('toString')).toBeUndefined();
    expect(catalogueCategoryFor('__proto__')).toBeUndefined();
  });

  // T-334 (Ajay, 12 Oct 2026) signed edits to document-rules/_averments/*.json. T-240 does not
  // own that directory, so it is excluded here; every other rule file and the overrides stay guarded.
  it('document-rules/ is untouched by this ticket (signed _averments/, _skeletons/ and the five T-479 packs excluded)', () => {
    const { execFileSync } = jest.requireActual('child_process');
    const out = execFileSync(
      'git',
      ['-C', __dirname, 'status', '--porcelain', '--', RULES_DIR, OVERRIDES_DIR],
      { encoding: 'utf-8' },
    );
    const touched = out
      .split('\n')
      .filter((l: string) => l.trim() !== '')
      .filter((l: string) => !/document-rules\/_averments\//.test(l))
      // T-374 (Ajay, 13 Oct 2026) signed clause skeletons live in document-rules/_skeletons/.
      .filter((l: string) => !/document-rules\/_skeletons\//.test(l))
      // T-638 (Ajay B2, 28 Oct 2026) signed the custody_since question in bail_regular (rule pack and template).
      .filter((l: string) => !/(document-rules|templates)\/bail_regular\.json$/.test(l))
      // T-650 (Ajay, 29 Oct 2026) signed the party fields in these three packs.
      .filter(
        (l: string) =>
          !/document-rules\/(replication|written_statement|plaint_partition|temporary_injunction_o39)\.json$/.test(
            l,
          ),
      )
      // T-479 (Ajay, 16 Oct 2026) signed the cause-title edits to these five packs only.
      .filter(
        (l: string) =>
          !/document-rules\/(habeas_corpus|pil|mandamus|quashing_528_bnss|certiorari)\.json$/.test(
            l,
          ),
      );
    expect(touched).toEqual([]);
  });
});

describe('T-240 catalogue mapping (Ajay, 12 Oct 2026)', () => {
  it('pins 92 literal ids', () => {
    expect(Object.keys(EXPECTED_CATALOGUE_CATEGORY).sort()).toEqual(ALL_IDS);
  });

  it.each(Object.entries(EXPECTED_CATALOGUE_CATEGORY))('%s is filed under %s', (id, cat) => {
    expect(TEMPLATE_CATALOGUE[id].category).toBe(cat);
    expect(catalogueCategoryFor(id)).toBe(cat);
  });

  it('AC4 spot-checks, by display name', () => {
    const name = (id: string) => catalogueCategoryDisplay(catalogueCategoryFor(id)!).name;
    expect(name('legal_notice_s138')).toBe('Cheque bounce / NI Act');
    expect(name('rent_agreement')).toBe('Rent control and tenancy');
    expect(name('posh_complaint')).toBe('Service and labour');
    expect(name('review_petition')).toBe('Civil: appeals, revision, review, execution');
    expect(name('curative_petition')).toBe('Writs and constitutional');
    expect(name('slp')).toBe('Writs and constitutional');
    for (const id of [
      'bail_regular',
      'bail_anticipatory',
      'bail_before_magistrate',
      'bail_cancellation',
      'default_bail',
      'interim_bail',
      'suspension_of_sentence',
    ]) {
      expect(name(id)).toBe('Criminal: bail and custody');
    }
  });

  it('26 categories, exact T-239 names, in order, numbered 1-26', () => {
    expect(CATALOGUE_CATEGORIES.map((c) => c.name)).toEqual(EXPECTED_CATEGORY_NAMES);
    expect(CATALOGUE_CATEGORIES.map((c) => c.order)).toEqual(
      Array.from({ length: 26 }, (_, i) => i + 1),
    );
    expect(new Set(CATALOGUE_CATEGORIES.map((c) => c.id)).size).toBe(26);
    expect(CATALOGUE_CATEGORIES[23].name).toBe('Affidavits and court forms');
  });

  it('the 6 empty categories are present and have no template', () => {
    for (const n of EMPTY_CATEGORY_NUMBERS) {
      const c = CATALOGUE_CATEGORIES[n - 1];
      expect(c.order).toBe(n);
      expect(Object.values(TEMPLATE_CATALOGUE).some((e) => e.category === c.id)).toBe(false);
    }
    const used = new Set(Object.values(TEMPLATE_CATALOGUE).map((e) => e.category));
    expect(used.size).toBe(20);
  });

  it('the module exports no other price or alias table', () => {
    expect(catalogue.DOC_TYPE_ALIASES).toBe(DOC_TYPE_ALIASES);
  });
});

// ── API and seed ─────────────────────────────────────────────────────────

describe('T-240 API: GET /template-configs', () => {
  beforeEach(() => {
    clearConfigCache();
    plaintSwitchOn();
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns catalogueCategory, name and order for all configs, including the 6 overrides', async () => {
    const res = await request(app).get('/template-configs').set(headers());
    expect(res.status).toBe(200);
    const list = res.body.templates as Array<{
      template_id: string;
      catalogueCategory: string;
      catalogueCategoryName: string;
      catalogueCategoryOrder: number;
    }>;
    expect(list).toHaveLength(92);
    for (const t of list) {
      const cat = CATALOGUE_CATEGORIES.find(
        (c) => c.id === EXPECTED_CATALOGUE_CATEGORY[t.template_id],
      )!;
      expect(t.catalogueCategory).toBe(cat.id);
      expect(t.catalogueCategoryName).toBe(cat.name);
      expect(t.catalogueCategoryOrder).toBe(cat.order);
    }
    for (const id of OVERRIDE_IDS) expect(list.some((t) => t.template_id === id)).toBe(true);
  });

  it('GET /template-configs/:id carries catalogueCategory for an override and a rule file', async () => {
    for (const id of ['rent_agreement', 'nda']) {
      const res = await request(app).get(`/template-configs/${id}`).set(headers());
      expect(res.status).toBe(200);
      expect(res.body.config.catalogueCategory).toBe(EXPECTED_CATALOGUE_CATEGORY[id]);
    }
  });
});

describe('T-240 seed writes catalogueCategory to Mongo', () => {
  it('every promoted template lands with its catalogue category', async () => {
    await syncTemplateRegistry(loadAllDocRules());
    const rows = await Template.find({}, { templateId: 1, catalogueCategory: 1, _id: 0 }).lean();
    expect(rows).toHaveLength(92);
    for (const r of rows) {
      expect(r.catalogueCategory).toBe(EXPECTED_CATALOGUE_CATEGORY[r.templateId]);
    }
  });

  it('a changed catalogue category rewrites the row (it is in the content hash)', async () => {
    const reg = loadAllDocRules();
    await syncTemplateRegistry(reg);
    const cfg = { ...reg.configs.get('nda')!, catalogueCategory: 'tax' as const };
    const next = { ...reg, configs: new Map(reg.configs).set('nda', cfg) };
    const result = await syncTemplateRegistry(next);
    expect(result.updated).toBe(1);
    const row = await Template.findOne({ templateId: 'nda' }).lean();
    expect(row!.catalogueCategory).toBe('tax');
  });

  it('the Template model requires catalogueCategory', async () => {
    await expect(
      Template.create({
        templateId: 'zz',
        slug: 'zz',
        displayName: 'ZZ',
        category: 'civil',
        description: 'x',
        planAccess: 'free',
        sourceFile: 'zz.json',
        creditsCost: 2,
        isActive: true,
      }),
    ).rejects.toThrow(/catalogueCategory/);
  });
});

describe('T-240 GET /templates order and field', () => {
  const base = { planAccess: 'free', creditsCost: 2, isActive: true, category: 'civil' };
  const row = (id: string, displayName: string, extra: Record<string, unknown>) => ({
    ...base,
    templateId: id,
    slug: id,
    displayName,
    description: 'd',
    sourceFile: `${id}.json`,
    ...extra,
  });

  it('returns catalogueCategory and sorts by T-239 order, then title, unknown or missing last', async () => {
    await Template.insertMany([
      row('w2', 'Zeta writ', { catalogueCategory: 'writs_constitutional' }),
      row('b1', 'Bravo bail', { catalogueCategory: 'criminal_bail_custody' }),
      row('w1', 'Alpha writ', { catalogueCategory: 'writs_constitutional' }),
      row('a1', 'Alpha bail', { catalogueCategory: 'criminal_bail_custody' }),
      row('n1', 'Notice', { catalogueCategory: 'notices_replies' }),
    ]);
    // Rows the model would refuse: a legacy row with none, and one with an unknown value.
    await Template.collection.insertMany([
      row('legacy', 'Aaa legacy', {}),
      row('weird', 'Bbb weird', { catalogueCategory: 'not_a_category' }),
    ] as never[]);
    const res = await request(app).get('/templates').set(headers());
    expect(res.status).toBe(200);
    const slugs = res.body.templates.map((t: { slug: string }) => t.slug);
    expect(slugs).toEqual(['a1', 'b1', 'w1', 'w2', 'n1', 'legacy', 'weird']);
    const first = res.body.templates[0];
    expect(first.catalogueCategory).toBe('criminal_bail_custody');
    expect(first.category).toBe('civil');
    expect(
      res.body.templates.find((t: { slug: string }) => t.slug === 'legacy').catalogueCategory,
    ).toBeUndefined();
  });
});

describe('T-240 admin analytics: catalogueCategoryName', () => {
  it('names a known catalogue id, gives undefined for a legacy row, keeps category', async () => {
    const { LawieDocument } = await import('../models/Document.model');
    await Template.insertMany([
      {
        templateId: 'bail_regular',
        slug: 'bail_regular',
        displayName: 'Regular bail',
        category: 'criminal',
        catalogueCategory: 'criminal_bail_custody',
        description: 'd',
        planAccess: 'free',
        sourceFile: 'bail_regular.json',
        creditsCost: 2,
        isActive: true,
      },
    ]);
    await Template.collection.insertOne({
      templateId: 'old_row',
      slug: 'old_row',
      displayName: 'Old row',
      category: 'civil',
      description: 'd',
      planAccess: 'free',
      sourceFile: 'old_row.json',
      creditsCost: 2,
      isActive: true,
    });
    // T-331: real shape. The document's own templateId stays null; the slug is
    // on the completed Generation that produced it.
    const { Generation } = await import('../models/Generation.model');
    const userId = new Types.ObjectId();
    for (const slug of ['bail_regular', 'old_row']) {
      const created = await LawieDocument.create({
        userId,
        title: 't',
        docType: 'bail_application',
        courtType: 'district_court',
        courtName: 'c',
        generatedContent: 'x',
        status: 'draft',
      });
      await Generation.create({
        userId,
        docType: 'bail_application',
        tokensUsed: 10,
        costUsd: 0.1,
        status: 'completed',
        templateId: slug,
        documentId: created._id,
      });
    }

    const res = await request(app).get('/admin/documents/analytics').set(headers('Admin'));
    expect(res.status).toBe(200);
    const usage = res.body.templateUsage as Array<Record<string, unknown>>;
    const known = usage.find((u) => u.templateId === 'bail_regular')!;
    expect(known.catalogueCategory).toBe('criminal_bail_custody');
    expect(known.catalogueCategoryName).toBe('Criminal: bail and custody');
    expect(known.category).toBe('criminal');
    const legacy = usage.find((u) => u.templateId === 'old_row')!;
    expect(legacy.catalogueCategory).toBeUndefined();
    expect(legacy.catalogueCategoryName).toBeUndefined();
    expect(legacy.category).toBe('civil');
  });
});
