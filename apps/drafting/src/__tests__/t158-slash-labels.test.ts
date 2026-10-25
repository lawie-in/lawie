/**
 * T-158(a): one signed label per party line, no " / " (AJ-2026-10-08-T158-A1,
 * AJ-2026-10-08-T157-A2, AJ-2026-10-08-T158-A2). Every signed string below is
 * copied word for word from the sign-off file. No model call is made.
 */
jest.mock('puppeteer', () => {
  const mockPage = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
  };
  return {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    __mockPage: mockPage,
  };
});

import './setupEnv';
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import { drafterPartyDesignationLines } from '../services/ai.service';
import { buildDrafterUserPrompt } from '../services/brief-drafter';
import {
  CourtLookupData,
  CourtRuleData,
  buildAISystemPrompt,
  buildPlaceholderContext,
  clearConfigCache,
  isStateNotApplicable,
  listTemplateConfigs,
  loadCourtRule,
  loadTemplateConfig,
  matterTypeFor,
  partyDesignationsPromptLines,
  promptPartyDesignations,
  renderTemplateSection,
  replacePlaceholders,
  ruleForMatter,
} from '../services/template-engine.service';

const SRC = join(__dirname, '..');
const rulePath = (id: string) => join(SRC, 'config/court-rules', `${id}.json`);
const readRule = (id: string) => JSON.parse(readFileSync(rulePath(id), 'utf-8'));

// ── Signed strings ────────────────────────────────────────────────────────────

/** AJ-2026-10-08-T158-A2 section 1 (drt.json verification_format). */
const SIGNED_DRT_VERIFICATION =
  'I, {deponent_name}, {designation}, do hereby verify that the contents of paragraphs ___ to ___ above are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nDEPONENT';
/** AJ-2026-10-08-T158-A2 section 2, IBC. */
const SIGNED_NCLT_IBC_VERIFICATION =
  'I, {deponent_name}, the Applicant herein above named, do hereby verify that the contents of paragraphs ___ to ___ of the above application are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nAPPLICANT';
/** AJ-2026-10-08-T158-A2 section 2, Companies Act 2013. */
const SIGNED_NCLT_COMPANIES_VERIFICATION =
  'I, {deponent_name}, the Petitioner herein above named, do hereby verify that the contents of paragraphs ___ to ___ of the above petition are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nPETITIONER';
/** AJ-2026-10-08-T158-A2 section 2, matter type unknown (neutral). */
const SIGNED_NCLT_NEUTRAL_VERIFICATION =
  'I, {deponent_name}, do hereby verify that the contents of paragraphs ___ to ___ above are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nDEPONENT';
/** AJ-2026-10-08-T158-A2 section 3 (ibc_application.json causeTitle.format). */
const SIGNED_IBC_CAUSE_TITLE =
  "BEFORE THE HON'BLE NATIONAL COMPANY LAW TRIBUNAL\nBENCH AT {nclt_bench}\n\n{caseNomenclature}\n\nIN THE MATTER OF: The Insolvency and Bankruptcy Code, 2016;\nAND IN THE MATTER OF: Section {section_invoked} of the Code;\nAND IN THE MATTER OF: Application for initiation of Corporate Insolvency Resolution Process against {corporate_debtor_name};\n\n{applicant} ... Applicant\nVERSUS\n{corporate_debtor_name} ... Corporate Debtor";

/** The two verification texts the sign-off replaced. They must never come back. */
const OLD_DRT_VERIFICATION =
  'I, {deponent_name}, the duly authorised officer of the Applicant Bank / Financial Institution herein above named, do hereby verify that the contents of the above application are true and correct to the best of my knowledge derived from the records maintained in the ordinary course of business, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nAUTHORISED OFFICER, APPLICANT BANK / FI';
const OLD_NCLT_VERIFICATION =
  'I, {deponent_name}, the Applicant / Petitioner herein above named, do hereby verify that the contents of the above petition / application are true and correct to the best of my knowledge derived from the records of the Corporate Debtor / Company, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nPETITIONER / APPLICANT';

/** Companies Act has no document type yet, so it is reached with a fake id. */
const FAKE_COMPANIES_TEMPLATE = 'fake_companies_act_petition';

function courtData(ref: string, over: Partial<CourtLookupData> = {}): CourtLookupData {
  return {
    designation: 'BEFORE THE NATIONAL COMPANY LAW TRIBUNAL',
    city: 'Mumbai',
    caseNomenclature: 'Company Petition No. _____ of {current_year}',
    formattingRulesRef: ref,
    courtRule: loadCourtRule(ref)!,
    ...over,
  };
}

function ctxFor(ref: string, templateId: string) {
  return buildPlaceholderContext(
    loadTemplateConfig(templateId)!,
    { applicant_name: 'A B' },
    { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
    courtData(ref),
  );
}

beforeEach(() => clearConfigCache());

// ── AC 1, 2: labour court and tribunal_generic labels ─────────────────────────

describe('T-158 AC 1-2: labour_court and tribunal_generic labels (AJ-2026-10-08-T158-A1)', () => {
  it('labour_court party_designation is exactly the signed five, state unchanged', () => {
    const pd = readRule('labour_court').party_designation;
    expect(pd.petitioner).toBe('Applicant');
    expect(pd.respondent).toBe('Opposite Party');
    expect(pd.applicant).toBe('Applicant');
    expect(pd.complainant).toBe('Complainant');
    expect(pd.counter_party).toBe('Opposite Party');
    expect(pd.state).toBe('State through Labour Commissioner (as applicable)');
  });

  it('tribunal_generic counter_party is Respondent', () => {
    expect(readRule('tribunal_generic').party_designation.counter_party).toBe('Respondent');
  });

  it('a labour_court draft prints Applicant / Opposite Party in the party labels', () => {
    const ctx = ctxFor('labour_court', 'bail_regular');
    expect(ctx.party_label_petitioner).toBe('Applicant');
    expect(ctx.party_label_respondent).toBe('Opposite Party');
    expect(ctx.party_label_applicant).toBe('Applicant');
  });
});

// ── AC 3: family_court.state is never rendered ────────────────────────────────

describe('T-158 AC 3: family_court.state is never rendered', () => {
  const FAMILY_STATE = 'Not applicable (civil / personal law proceedings)';
  const templates = listTemplateConfigs().map((t) => t.template_id);

  it('the rule still carries the string (court-rules.test.ts needs a non-empty state)', () => {
    expect(readRule('family_court').party_designation.state).toBe(FAMILY_STATE);
  });

  it('no placeholder-context value, for any document type, contains it', () => {
    const hits: string[] = [];
    for (const id of templates) {
      const cfg = loadTemplateConfig(id);
      if (!cfg) continue;
      const ctx = buildPlaceholderContext(
        cfg,
        { applicant_name: 'A B' },
        { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
        courtData('family_court', { designation: 'IN THE FAMILY COURT, PUNE', city: 'Pune' }),
      );
      for (const [k, v] of Object.entries(ctx)) {
        if (typeof v === 'string' && v.includes(FAMILY_STATE)) hits.push(`${id}:${k}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no rendered template section, for any document type, contains it', () => {
    const hits: string[] = [];
    for (const id of templates) {
      const cfg = loadTemplateConfig(id);
      if (!cfg) continue;
      const ctx = buildPlaceholderContext(
        cfg,
        { applicant_name: 'A B' },
        { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
        courtData('family_court', { designation: 'IN THE FAMILY COURT, PUNE', city: 'Pune' }),
      );
      for (const section of cfg.document_structure.sections) {
        if (section.type !== 'template' || !section.template) continue;
        if (renderTemplateSection(section, ctx).content.includes(FAMILY_STATE)) {
          hits.push(`${id}:${section.section_id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('the annexures pack does not contain it', async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      __mockPage: { setContent: jest.Mock };
    };
    let html = '';
    puppeteer.__mockPage.setContent.mockImplementationOnce((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    await buildAnnexuresPack({
      formData: {
        applicant_name: 'A B',
        court_id: 'family_court',
        template_id: 'bail_regular',
      },
      advocateName: 'Test Adv',
    });
    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toContain(FAMILY_STATE);
  });

  it('the AI system prompt does not contain it', () => {
    const cfg = loadTemplateConfig('bail_regular')!;
    const prompt = buildAISystemPrompt(cfg, loadCourtRule('family_court'));
    expect(prompt).not.toContain(FAMILY_STATE);
  });
});

// ── AC 4, 5, 6: signed strings match exactly ──────────────────────────────────

describe('T-158: every signed string matches the sign-off exactly', () => {
  it('drt.json: cause title, applicant label, verification (AJ-2026-10-08-T157-A2, -T158-A2 s.1)', () => {
    const drt = readRule('drt');
    expect(drt.cause_title_format).toBe(
      '{courtDesignation}, {city}\n{caseNomenclature}\n\n{applicant} ... APPLICANT\n\nVERSUS\n\n{defendant} ... DEFENDANT',
    );
    expect(drt.party_designation.applicant).toBe('Applicant');
    expect(drt.verification_format).toBe(SIGNED_DRT_VERIFICATION);
  });

  it('nclt.json: IBC override (AJ-2026-10-08-T157-A2, -T158-A2 s.2)', () => {
    const o = readRule('nclt').matter_type_overrides.insolvency_application;
    expect(o.cause_title_format).toBe(
      '{courtDesignation}, {bench}\n{caseNomenclature}\n\nIn the matter of: {company_name}\n\n{applicant} ... APPLICANT\n\nVERSUS\n\n{respondent} ... CORPORATE DEBTOR',
    );
    expect(o.party_designation).toMatchObject({ petitioner: 'Applicant', respondent: 'Corporate Debtor' });
    expect(o.verification_format).toBe(SIGNED_NCLT_IBC_VERIFICATION);
  });

  it('nclt.json: Companies Act override', () => {
    const o = readRule('nclt').matter_type_overrides.company_petition;
    expect(o.cause_title_format).toBe(
      '{courtDesignation}, {bench}\n{caseNomenclature}\n\nIn the matter of: {company_name}\n\n{applicant} ... PETITIONER\n\nVERSUS\n\n{respondent} ... RESPONDENT',
    );
    expect(o.party_designation).toMatchObject({ petitioner: 'Petitioner', respondent: 'Respondent' });
    expect(o.verification_format).toBe(SIGNED_NCLT_COMPANIES_VERIFICATION);
  });

  it('nclt.json: the base verification (matter type unknown) is the neutral DEPONENT string', () => {
    expect(readRule('nclt').verification_format).toBe(SIGNED_NCLT_NEUTRAL_VERIFICATION);
  });

  it('ibc_application.json:17 cause title ends "... Corporate Debtor" (AC 6)', () => {
    const cfg = JSON.parse(
      readFileSync(join(SRC, 'config/document-rules/ibc_application.json'), 'utf-8'),
    );
    expect(cfg.causeTitle.format).toBe(SIGNED_IBC_CAUSE_TITLE);
    expect(cfg.causeTitle.format).not.toContain('Corporate Debtor / Respondent');
  });
});

// ── Old verification strings must never come back ─────────────────────────────

describe('T-158: the superseded verification strings must not reappear (Ajay, T158-A2)', () => {
  it.each(['drt', 'nclt'])('%s.json: top level and every override', (id) => {
    const rule = readRule(id);
    const texts = [rule.verification_format];
    for (const o of Object.values(rule.matter_type_overrides ?? {})) {
      texts.push((o as { verification_format?: string }).verification_format);
    }
    for (const t of texts) {
      expect(t).not.toBe(OLD_DRT_VERIFICATION);
      expect(t).not.toBe(OLD_NCLT_VERIFICATION);
    }
  });

  it.each([
    ['drt', 'Applicant Bank / Financial Institution'],
    ['drt', 'APPLICANT BANK / FI'],
    ['drt', 'AUTHORISED OFFICER'],
    ['nclt', 'PETITIONER / APPLICANT'],
    ['nclt', 'Applicant / Petitioner'],
    ['nclt', 'petition / application'],
    ['nclt', 'Corporate Debtor / Company'],
  ])('%s.json verification: no fragment %p', (id, fragment) => {
    const rule = readRule(id);
    const texts = [rule.verification_format];
    for (const o of Object.values(rule.matter_type_overrides ?? {})) {
      texts.push((o as { verification_format?: string }).verification_format);
    }
    for (const t of texts) expect(t).not.toContain(fragment);
  });

  it.each(['drt', 'nclt'])('%s: the rendered draft verification never has the old text', (id) => {
    const ref = id;
    for (const tpl of ['bail_regular', 'interim_application', 'ibc_application']) {
      const ctx = ctxFor(ref, tpl);
      expect(ctx.verification_text).not.toContain('Bank / Financial Institution');
      expect(ctx.verification_text).not.toContain('AUTHORISED OFFICER');
      expect(ctx.verification_text).not.toContain('PETITIONER / APPLICANT');
      expect(ctx.verification_text).not.toContain('Corporate Debtor / Company');
    }
  });
});

// ── ruleForMatter / matterTypeFor ─────────────────────────────────────────────

describe('T-158: ruleForMatter', () => {
  const nclt = () => loadCourtRule('nclt') as CourtRuleData;

  it('matterTypeFor: ibc_application is an insolvency application; others have none', () => {
    expect(matterTypeFor('ibc_application')).toBe('insolvency_application');
    expect(matterTypeFor('interim_application')).toBeNull();
    expect(matterTypeFor('')).toBeNull();
  });

  it('IBC: labels, cause title and verification come from the IBC override', () => {
    const r = ruleForMatter(nclt(), 'ibc_application');
    expect(r.party_designation?.petitioner).toBe('Applicant');
    expect(r.party_designation?.respondent).toBe('Corporate Debtor');
    expect(r.cause_title_format).toContain('... APPLICANT');
    expect(r.cause_title_format).toContain('... CORPORATE DEBTOR');
    expect(r.verification_format).toBe(SIGNED_NCLT_IBC_VERIFICATION);
  });

  it('IBC: keys the override does not name are kept from the base rule', () => {
    const base = nclt();
    const r = ruleForMatter(base, 'ibc_application');
    expect(r.party_designation?.state).toBe(base.party_designation?.state);
    expect(r.party_designation?.complainant).not.toBe(base.party_designation?.complainant);
    expect(r.designation).toBe(base.designation);
    expect(r.case_nomenclature).toEqual(base.case_nomenclature);
  });

  it('IBC: the input rule is not mutated', () => {
    const base = nclt();
    const before = JSON.stringify(base);
    ruleForMatter(base, 'ibc_application');
    expect(JSON.stringify(base)).toBe(before);
  });

  it('Companies Act (fake template id mapped to company_petition): Petitioner / Respondent', () => {
    // No document type maps to company_petition today, so the mapping is
    // exercised with a rule whose override is read by key.
    const base = nclt();
    const viaKey = ruleForMatter(
      { ...base, matter_type_overrides: { insolvency_application: base.matter_type_overrides!.company_petition } },
      'ibc_application',
    );
    expect(viaKey.party_designation?.petitioner).toBe('Petitioner');
    expect(viaKey.party_designation?.respondent).toBe('Respondent');
    expect(viaKey.verification_format).toBe(SIGNED_NCLT_COMPANIES_VERIFICATION);
    // And the fake id itself has no matter type, so today it falls to the base rule.
    expect(matterTypeFor(FAKE_COMPANIES_TEMPLATE)).toBeNull();
    expect(ruleForMatter(base, FAKE_COMPANIES_TEMPLATE)).toBe(base);
  });

  it('unknown matter type: the base rule is returned unchanged, neutral verification', () => {
    const base = nclt();
    const r = ruleForMatter(base, 'interim_application');
    expect(r).toBe(base);
    expect(r.verification_format).toBe(SIGNED_NCLT_NEUTRAL_VERIFICATION);
    expect(ruleForMatter(base, '')).toBe(base);
  });

  it('a rule with no overrides is returned unchanged, even for ibc_application', () => {
    const drt = loadCourtRule('drt') as CourtRuleData;
    expect(drt.matter_type_overrides).toBeUndefined();
    expect(ruleForMatter(drt, 'ibc_application')).toBe(drt);
    const bare = { verification_format: 'x', party_designation: { petitioner: 'P' } };
    expect(ruleForMatter(bare, 'ibc_application')).toBe(bare);
  });

  it('an override with only some keys replaces only those', () => {
    const rule = {
      cause_title_format: 'base title',
      verification_format: 'base verification',
      party_designation: { petitioner: 'P', respondent: 'R' },
      matter_type_overrides: {
        insolvency_application: { party_designation: { respondent: 'Debtor' } },
      },
    };
    const r = ruleForMatter(rule, 'ibc_application');
    expect(r.cause_title_format).toBe('base title');
    expect(r.verification_format).toBe('base verification');
    expect(r.party_designation).toEqual({ petitioner: 'P', respondent: 'Debtor' });
  });
});

// ── NCLT drafts ───────────────────────────────────────────────────────────────

describe('T-158 AC 5: NCLT drafts', () => {
  it('ibc_application at NCLT prints Applicant / Corporate Debtor and the IBC verification', () => {
    const ctx = ctxFor('nclt', 'ibc_application');
    expect(ctx.party_label_petitioner).toBe('Applicant');
    expect(ctx.party_label_respondent).toBe('Corporate Debtor');
    expect(ctx.party_label_petitioner_upper).toBe('APPLICANT');
    expect(ctx.party_label_respondent_upper).toBe('CORPORATE DEBTOR');
    expect(ctx.verification_text).toContain('the Applicant herein above named');
    expect(ctx.verification_text).toContain('of the above application are true');
    expect(ctx.verification_text).toMatch(/\n\nAPPLICANT$/);
    expect(ctx.verification_text).not.toContain('Petitioner');
    expect(ctx.verification_text).not.toMatch(/ \/ /);
    expect(ctx.verification_text).not.toContain('{');
  });

  it('interim_application at NCLT prints the neutral DEPONENT verification', () => {
    const ctx = ctxFor('nclt', 'interim_application');
    expect(ctx.verification_text).toContain('I, A B, do hereby verify');
    expect(ctx.verification_text).toMatch(/\n\nDEPONENT$/);
    expect(ctx.verification_text).not.toContain('herein above named');
    expect(ctx.verification_text).not.toMatch(/ \/ /);
    expect(ctx.verification_text).not.toContain('{');
  });

  it('interim_application at NCLT does not take the IBC or Companies Act labels', () => {
    const ctx = ctxFor('nclt', 'interim_application');
    expect(ctx.party_label_respondent).not.toBe('Corporate Debtor');
    expect(ctx.party_label_petitioner).not.toBe('Petitioner');
    expect(ctx.party_label_respondent).not.toBe('Respondent');
  });

  it('the AI prompt party list follows the matter type', () => {
    const rule = loadCourtRule('nclt');
    const ibc = buildAISystemPrompt(loadTemplateConfig('ibc_application')!, rule);
    expect(ibc).toContain('- petitioner: "Applicant"');
    expect(ibc).toContain('- respondent: "Corporate Debtor"');
    const ia = buildAISystemPrompt(loadTemplateConfig('interim_application')!, rule);
    expect(ia).not.toContain('- respondent: "Corporate Debtor"');
  });

  it('the annexures pack for nclt with template_id ibc_application: labels and IBC verification', async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      __mockPage: { setContent: jest.Mock };
    };
    let html = '';
    puppeteer.__mockPage.setContent.mockImplementationOnce((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    await buildAnnexuresPack({
      formData: {
        applicant_name: 'Acme Finance Ltd',
        court_id: 'nclt',
        template_id: 'ibc_application',
        place: 'Mumbai',
      },
      advocateName: 'Test Adv',
    });
    expect(html).toContain('Corporate Debtor');
    expect(html).toContain('the Applicant herein above named');
    expect(html).toContain('of the above application are true');
    expect(html).not.toContain('Petitioner / Applicant');
    expect(html).not.toContain('Corporate Debtor / Company');
    expect(html).not.toContain('PETITIONER / APPLICANT');
    expect(html).not.toContain('Applicant / Petitioner herein');
  });

  it('the annexures pack for nclt with an interim_application gets the neutral verification', async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      __mockPage: { setContent: jest.Mock };
    };
    let html = '';
    puppeteer.__mockPage.setContent.mockImplementationOnce((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    await buildAnnexuresPack({
      formData: {
        applicant_name: 'Acme Finance Ltd',
        court_id: 'nclt',
        template_id: 'interim_application',
        place: 'Mumbai',
      },
      advocateName: 'Test Adv',
    });
    expect(html).toContain('do hereby verify that the contents of paragraphs');
    expect(html).not.toContain('the Applicant herein above named');
    expect(html).not.toContain('the Petitioner herein above named');
  });
});

// ── DRT draft ─────────────────────────────────────────────────────────────────

describe('T-158 AC 4: DRT drafts', () => {
  it('prints Applicant / Defendant, DEPONENT, and names the Applicant, no Bank / FI', () => {
    const ctx = ctxFor('drt', 'bail_regular');
    expect(ctx.verification_text).toContain('the Applicant herein above named');
    expect(ctx.verification_text).toMatch(/\n\nDEPONENT$/);
    expect(ctx.verification_text).not.toContain('Bank');
    expect(ctx.verification_text).not.toMatch(/ \/ /);
    expect(ctx.verification_text).not.toContain('{designation}');
  });

  it('the cause title renders APPLICANT / DEFENDANT with no slash', () => {
    const ctx = ctxFor('drt', 'bail_regular');
    const title = replacePlaceholders(loadCourtRule('drt')!.cause_title_format!, {
      ...ctx,
      applicant: 'State Bank',
      defendant: 'Mr X',
    });
    expect(title).toContain('State Bank ... APPLICANT');
    expect(title).toContain('Mr X ... DEFENDANT');
    expect(title).not.toMatch(/ \/ /);
  });
});

// ── Pinned: NCLT unknown-matter-type labels (AJ-2026-10-08-T158-diff Call 1) ──

describe('T-158 PIN (AJ-2026-10-08-T158-diff Call 1): NCLT unknown-matter-type labels', () => {
  /**
   * The ONLY place these four strings are asserted. If Ajay changes them, this
   * test and nclt.json are the only things that move.
   */
  it('NCLT_UNKNOWN_MATTER_TYPE_LABELS', () => {
    const nclt = readRule('nclt');
    expect(nclt.party_designation.petitioner).toBe(
      '[To be confirmed: Applicant (IBC) or Petitioner (Companies Act)]',
    );
    expect(nclt.party_designation.respondent).toBe(
      '[To be confirmed: Corporate Debtor (IBC) or Respondent (Companies Act)]',
    );
    expect(nclt.cause_title_format).toBe(
      '{courtDesignation}, {bench}\n{caseNomenclature}\n\nIn the matter of: {company_name}\n\n{applicant} ... [To be confirmed: APPLICANT (IBC) or PETITIONER (Companies Act)]\n\nVERSUS\n\n{respondent} ... [To be confirmed: CORPORATE DEBTOR (IBC) or RESPONDENT (Companies Act)]',
    );
  });
});

// ── AJ-2026-10-08-T158-diff: C1, C2, ibc labels, drt defendant ────────────────

describe('T-158 (AJ-2026-10-08-T158-diff) C1: override blocks carry every label key', () => {
  it('insolvency_application: applicant, complainant, counter_party', () => {
    const pd = readRule('nclt').matter_type_overrides.insolvency_application.party_designation;
    expect(pd).toEqual({
      petitioner: 'Applicant',
      respondent: 'Corporate Debtor',
      applicant: 'Applicant',
      complainant: 'Applicant',
      counter_party: 'Corporate Debtor',
    });
  });

  it('company_petition: applicant, complainant, counter_party', () => {
    const pd = readRule('nclt').matter_type_overrides.company_petition.party_designation;
    expect(pd).toEqual({
      petitioner: 'Petitioner',
      respondent: 'Respondent',
      applicant: 'Petitioner',
      complainant: 'Petitioner',
      counter_party: 'Respondent',
    });
  });

  it('IBC: the resolved rule has no "Petitioner" label on any key', () => {
    const r = ruleForMatter(loadCourtRule('nclt') as CourtRuleData, 'ibc_application');
    for (const k of ['petitioner', 'respondent', 'applicant', 'complainant', 'counter_party']) {
      expect(r.party_designation?.[k]).not.toBe('Petitioner');
      expect(r.party_designation?.[k]).not.toBe('Respondent');
    }
  });

  it('IBC AI prompt lists complainant and counter_party with the IBC terms', () => {
    const p = buildAISystemPrompt(loadTemplateConfig('ibc_application')!, loadCourtRule('nclt'));
    expect(p).toContain('- complainant: "Applicant"');
    expect(p).toContain('- counter_party: "Corporate Debtor"');
  });
});

describe('T-158 (AJ-2026-10-08-T158-diff) C2: "[To be confirmed:" prompt line', () => {
  const LINE =
    '- If a designation above begins with "[To be confirmed:", reproduce it exactly as written wherever that party is named. Do not choose between the options.';

  it('NCLT interim_application (unknown matter type): the line is present, exactly once', () => {
    const p = buildAISystemPrompt(loadTemplateConfig('interim_application')!, loadCourtRule('nclt'));
    expect(p.split(LINE)).toHaveLength(2);
    expect(p.indexOf(LINE)).toBeGreaterThan(p.indexOf('PARTY DESIGNATIONS FOR THIS COURT'));
  });

  it('NCLT ibc_application (no placeholder label): the line is absent', () => {
    const p = buildAISystemPrompt(loadTemplateConfig('ibc_application')!, loadCourtRule('nclt'));
    expect(p).not.toContain('[To be confirmed:');
    expect(p).not.toContain(LINE);
  });

  it('a court with no "[To be confirmed:" label (drt): the line is absent', () => {
    const p = buildAISystemPrompt(loadTemplateConfig('bail_regular')!, loadCourtRule('drt'));
    expect(p).not.toContain(LINE);
  });
});

describe('T-158 (AJ-2026-10-08-T158-diff) ibc_application labels and drt defendant', () => {
  it('ibc_application.json causeTitle.partyDesignations labels are Applicant / Corporate Debtor', () => {
    const cfg = JSON.parse(
      readFileSync(join(SRC, 'config/document-rules/ibc_application.json'), 'utf-8'),
    );
    const byRole = Object.fromEntries(
      cfg.causeTitle.partyDesignations.map((d: { role: string; label: string }) => [d.role, d.label]),
    );
    expect(byRole.applicant).toBe('Applicant');
    expect(byRole.corporate_debtor).toBe('Corporate Debtor');
    for (const label of Object.values(byRole)) expect(label).not.toMatch(/ \/ |\(/);
  });

  it('drt.json party_designation.defendant is "Defendant"', () => {
    expect(readRule('drt').party_designation.defendant).toBe('Defendant');
  });
});

describe('T-158 (AJ-2026-10-08-T158-A1-ext): family_court has no State party', () => {
  const BLANK = '[To be confirmed: name of the State]';

  it('family_court through bail_regular: state_respondent and sections print the blank only', () => {
    const cfg = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      cfg,
      { applicant_name: 'A B' },
      { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
      courtData('family_court', { designation: 'IN THE FAMILY COURT, PUNE', city: 'Pune' }),
    );
    expect(ctx.state_respondent).toBe(BLANK);
    const rendered = cfg.document_structure.sections
      .filter((sec) => sec.type === 'template' && sec.template)
      .map((sec) => renderTemplateSection(sec, ctx).content)
      .join('\n');
    const printed = `${ctx.state_respondent}\n${rendered}`;
    expect(printed).toContain(BLANK);
    expect(printed).not.toContain('Not applicable');
    expect(printed).not.toContain('Public Prosecutor');
  });

  it('the PARTY DESIGNATIONS prompt for family_court has no state line', () => {
    const p = buildAISystemPrompt(loadTemplateConfig('bail_regular')!, loadCourtRule('family_court'));
    expect(p).toContain('PARTY DESIGNATIONS FOR THIS COURT');
    expect(p).not.toMatch(/^- state:/m);
  });

  it('isStateNotApplicable', () => {
    expect(isStateNotApplicable('Not applicable (civil / personal law proceedings)')).toBe(true);
    expect(isStateNotApplicable('  Not applicable  ')).toBe(true);
    expect(isStateNotApplicable('NOT Applicable')).toBe(true);
    expect(isStateNotApplicable('not APPLICABLE (x)')).toBe(true);
    expect(isStateNotApplicable(undefined)).toBe(false);
    expect(isStateNotApplicable('')).toBe(false);
    expect(isStateNotApplicable('State of Bihar')).toBe(false);
    expect(isStateNotApplicable('State of {state}')).toBe(false);
  });
});

describe('T-158 Drafter path (drafterPartyDesignationLines, review round 1 fix)', () => {
  const C2_START = 'If a designation above begins with "[To be confirmed:"';

  /** The COURT RULE block of the real Drafter user prompt, built from these lines. */
  function courtRuleBlock(lines: string[]): string {
    const prompt = buildDrafterUserPrompt({
      pack: { name: 'X', mandatoryClauses: [], relevantActs: [], draftingInstructions: [] },
      brief: {},
      systemParts: [],
      courtRules: lines,
      target: 100,
      language: 'English',
    } as never);
    const m = /COURT RULE:\n([\s\S]*?)\n\nSYSTEM PARTS:/.exec(prompt);
    expect(m).not.toBeNull();
    return m![1];
  }

  it('family_court: no state line, no "Not applicable"', () => {
    const lines = drafterPartyDesignationLines(loadCourtRule('family_court') ?? undefined, 'bail_regular');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('Party designation, state:');
    expect(lines.join('\n')).not.toContain('Not applicable');
    const block = courtRuleBlock(lines);
    expect(block).not.toContain('Party designation, state:');
    expect(block).not.toContain('Not applicable');
  });

  it('nclt + ibc_application: Applicant / Corporate Debtor, no placeholder, no C2 line', () => {
    const lines = drafterPartyDesignationLines(loadCourtRule('nclt') ?? undefined, 'ibc_application');
    expect(lines).toContain('Party designation, petitioner: "Applicant"');
    expect(lines).toContain('Party designation, applicant: "Applicant"');
    expect(lines).toContain('Party designation, complainant: "Applicant"');
    expect(lines).toContain('Party designation, respondent: "Corporate Debtor"');
    expect(lines).toContain('Party designation, counter_party: "Corporate Debtor"');
    const text = lines.join('\n');
    expect(text).not.toContain('[To be confirmed:');
    expect(text).not.toContain(C2_START);
    expect(courtRuleBlock(lines)).not.toContain(C2_START);
  });

  it('nclt + interim_application: placeholders present, C2 line exactly once, one "- " in the prompt', () => {
    const lines = drafterPartyDesignationLines(loadCourtRule('nclt') ?? undefined, 'interim_application');
    const text = lines.join('\n');
    expect(text).toContain('[To be confirmed: Applicant (IBC) or Petitioner (Companies Act)]');
    expect(text).toContain('[To be confirmed: Corporate Debtor (IBC) or Respondent (Companies Act)]');
    expect(lines.filter((l) => l.startsWith(C2_START))).toHaveLength(1);
    expect(lines.every((l) => !l.startsWith('- '))).toBe(true);

    const block = courtRuleBlock(lines);
    expect(block.split(C2_START)).toHaveLength(2);
    expect(block).toContain(
      `- ${C2_START}, reproduce it exactly as written wherever that party is named. Do not choose between the options.`,
    );
    expect(block).not.toContain('- - ');
  });

  it('no court rule returns []', () => {
    expect(drafterPartyDesignationLines(undefined, 'bail_regular')).toEqual([]);
  });

  it.each([
    ['family_court', 'bail_regular'],
    ['nclt', 'ibc_application'],
    ['nclt', 'interim_application'],
  ])('parity: %s + %s, Drafter entries equal the system-prompt entries', (ref, tpl) => {
    const rule = loadCourtRule(ref) as CourtRuleData;
    const { entries } = promptPartyDesignations(rule, tpl);
    const sys = partyDesignationsPromptLines(rule, tpl).split('\n');
    expect(entries.length).toBeGreaterThan(0);
    expect(sys).toEqual(expect.arrayContaining(entries.map(([k, v]) => `- ${k}: "${v}"`)));
    expect(drafterPartyDesignationLines(rule, tpl).slice(0, entries.length)).toEqual(
      entries.map(([k, v]) => `Party designation, ${k}: "${v}"`),
    );
  });
});
