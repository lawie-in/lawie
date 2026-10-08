/**
 * T-149 — party labels follow the document, not the court (AJ-2026-10-07-T149).
 *
 * Criterion 3: no printed party label or state line of a SIGNED document type
 * contains "(civil)", "(criminal)" or " / " between alternatives, across every
 * file in config/court-rules/. Every offender that is allowed to remain is
 * NAMED below; a new offender, or one that gets fixed, fails the test.
 * Criterion 5: Anushka's scenario 3 (regular bail, Sessions Court Lucknow) with
 * no model call: no choice string in the cause title, prayer, verification,
 * signature block, the model's system prompt, or the memo of parties.
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
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  CourtLookupData,
  CourtRuleData,
  SIGNED_DOCUMENT_TYPES,
  buildAISystemPrompt,
  buildPlaceholderContext,
  clearConfigCache,
  documentSide,
  listTemplateConfigs,
  loadCourtRule,
  loadTemplateConfig,
  partyDesignationFor,
  replacePlaceholders,
} from '../services/template-engine.service';

const COURT_RULES_DIR = join(__dirname, '../config/court-rules');
const RULE_FILES = readdirSync(COURT_RULES_DIR).filter((f) => f.endsWith('.json'));
const CHOICE = /\(civil\)|\(criminal\)| \/ /i;

function rule(file: string): CourtRuleData {
  return JSON.parse(readFileSync(join(COURT_RULES_DIR, file), 'utf-8')) as CourtRuleData;
}

/** The labels a signed document prints in one court-rule file: party keys and the state line. */
function printedLabels(file: string, templateId: string): Record<string, string> {
  return partyDesignationFor(rule(file), templateId) ?? {};
}

/**
 * Criterion 3, signed types. Court-rule files that still print an alternative
 * for a signed document type. NOT fixed by T-149: Ajay signed only UP and Delhi
 * (AJ-2026-10-07-T149); Bihar, Jharkhand and CJM stay as today (criterion 4).
 * Each entry is "<file>|<key>". Named here, never skipped.
 */
const NAMED_EXCEPTIONS_SIGNED_TYPES: readonly string[] = [
  'bihar_district.json|state',
  'consumer_commission_generic.json|state',
  // Not a choice: the fixed designation "Standing Counsel (Criminal)". Matches the
  // literal "(criminal)" rule; Ajay to confirm it is acceptable (reported, not changed).
  'delhi_hc.json|state',
  'district_court_generic.json|state',
  'drt.json|applicant',
  'family_court.json|state',
  'itat.json|respondent',
  'itat.json|state',
  'jharkhand_district.json|state',
  'labour_court.json|applicant',
  'labour_court.json|complainant',
  'labour_court.json|counter_party',
  'labour_court.json|petitioner',
  'labour_court.json|respondent',
  'nclt.json|petitioner',
  'nclt.json|respondent',
  'sessions_generic.json|state',
  'tn_district.json|state',
  'tribunal_generic.json|counter_party',
];

/**
 * Criterion 3, UNSIGNED types. In UP and Delhi the court rule's raw
 * `party_designation` still holds "Plaintiff (civil) / Applicant (criminal)"
 * for these document types, because Ajay's table does not cover them. Every
 * document type outside SIGNED_DOCUMENT_TYPES is named here. A new template
 * fails the test until someone decides which list it belongs to.
 */
const NAMED_EXCEPTIONS_UNSIGNED_TYPES: readonly string[] = [
  'affidavit_identity', 'affidavit_in_support', 'aoa', 'bail_cancellation', 'cat_oa',
  'certiorari', 'condonation_of_delay', 'consumer_complaint', 'counter_affidavit',
  'criminal_appeal', 'criminal_revision', 'curative_petition', 'discharge_application',
  'distribution_agreement', 'divorce_hma', 'divorce_mutual_consent', 'divorce_sma',
  'dv_act_complaint', 'employment_agreement', 'fir_quashing', 'founders_agreement',
  'franchise_agreement', 'gift_deed', 'gpa', 'guardianship_petition', 'habeas_corpus',
  'ibc_application', 'interim_application', 'itat_appeal', 'joint_development_agreement',
  'judicial_separation', 'lease_deed', 'legal_notice_breach_of_contract',
  'legal_notice_consumer_deficiency', 'legal_notice_copyright_infringement',
  'legal_notice_defamation', 'legal_notice_eviction', 'legal_notice_s138', 'legal_notice_s80',
  'legal_notice_trademark_infringement', 'license_agreement', 'list_of_dates', 'loan_agreement',
  'mact_claim', 'maintenance_bnss_144', 'mandamus', 'memo_of_parties', 'moa', 'mortgage_deed',
  'mou', 'nda', 'partition_deed', 'pil', 'posh_complaint', 'quashing_528_bnss', 'quo_warranto',
  'rcr_petition', 'rejoinder_affidavit', 'release_deed', 'rent_agreement', 'replication',
  'rera_complaint', 'restoration_application', 'review_petition', 'sale_deed',
  'service_agreement', 'shareholders_agreement', 'slp', 'spa', 'surrender_application',
  'suspension_of_sentence', 'synopsis', 'vakalatnama', 'will', 'writ_petition_civil',
  'writ_petition_criminal', 'written_statement',
  // AJ-2026-10-07-T149-types: either party files these, so Ajay removed them from the
  // signed list. They keep today's labels.
  'amendment_of_pleadings', 'production_of_documents', 'receiver_appointment',
];

/** AJ-2026-10-07-T149-types: removed from the signed list, keep today's labels. */
const AJAY_REMOVED_TYPES = ['amendment_of_pleadings', 'production_of_documents', 'receiver_appointment'];

const PLAINT_AND_O39 = SIGNED_DOCUMENT_TYPES.filter(
  (t) => t.startsWith('plaint_') || t === 'temporary_injunction_o39',
);

function courtDataFor(ref: string, city = 'Lucknow'): CourtLookupData {
  const courtRule = loadCourtRule(ref)!;
  return {
    designation: `IN THE COURT OF DISTRICT & SESSIONS JUDGE, ${city.toUpperCase()}`,
    city,
    caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
    formattingRulesRef: ref,
    courtRule,
  };
}

function ctxFor(ref: string, templateId: string, form: Record<string, unknown> = {}) {
  const courtData = courtDataFor(ref);
  return {
    courtRule: courtData.courtRule!,
    ctx: buildPlaceholderContext(
      loadTemplateConfig(templateId)!,
      { applicant_name: 'A B', ...form },
      { advocateName: 'Test Adv', enrollmentNumber: 'UP/001/2026' },
      courtData,
    ),
  };
}

beforeEach(() => clearConfigCache());

describe('T-149 criterion 3: no choice string in a printed label of a signed type', () => {
  it('the signed list is the 12 types Ajay signed, each with a side and a template', () => {
    expect(SIGNED_DOCUMENT_TYPES).toHaveLength(12);
    const ids = listTemplateConfigs().map((t) => t.template_id);
    for (const t of SIGNED_DOCUMENT_TYPES) {
      expect(documentSide(t)).not.toBeNull();
      expect(ids).toContain(t);
    }
  });

  it('across every court-rule file, only the named exceptions print an alternative', () => {
    const offenders = new Set<string>();
    for (const file of RULE_FILES) {
      for (const t of SIGNED_DOCUMENT_TYPES) {
        for (const [key, value] of Object.entries(printedLabels(file, t))) {
          if (CHOICE.test(value)) offenders.add(`${file}|${key}`);
        }
      }
    }
    expect([...offenders].sort()).toEqual([...NAMED_EXCEPTIONS_SIGNED_TYPES].sort());
  });

  it.each(['up_district.json', 'delhi_district.json'])(
    '%s: no signed type prints an alternative in any label or the state line',
    (file) => {
      for (const t of SIGNED_DOCUMENT_TYPES) {
        for (const value of Object.values(printedLabels(file, t))) {
          expect(value).not.toMatch(CHOICE);
        }
      }
    },
  );

  it('the printed context (labels, state, cause title) has no alternative, every signed type, UP and Delhi', () => {
    for (const ref of ['up_district', 'delhi_district']) {
      for (const t of SIGNED_DOCUMENT_TYPES) {
        const { courtRule, ctx } = ctxFor(ref, t);
        const printed = [
          ctx.party_label_petitioner,
          ctx.party_label_respondent,
          ctx.state_respondent,
          replacePlaceholders(courtRule.cause_title_format!, ctx),
        ].join('\n');
        expect({ ref, t, hit: CHOICE.test(printed) }).toEqual({ ref, t, hit: false });
      }
    }
  });

  it('unsigned types: the exception list names every document type outside the signed list', () => {
    const unsigned = listTemplateConfigs()
      .map((t) => t.template_id)
      .filter((id) => !SIGNED_DOCUMENT_TYPES.includes(id))
      .sort();
    expect(unsigned).toEqual([...NAMED_EXCEPTIONS_UNSIGNED_TYPES].sort());
  });

  it.each(AJAY_REMOVED_TYPES)('%s (AJ-2026-10-07-T149-types): not signed, keeps today UP and Delhi party_designation', (t) => {
    expect(SIGNED_DOCUMENT_TYPES).not.toContain(t);
    for (const ref of ['up_district', 'delhi_district']) {
      const courtRule = loadCourtRule(ref)!;
      expect(partyDesignationFor(courtRule, t)).toBe(courtRule.party_designation);
    }
  });

  it('unsigned types in UP and Delhi keep the court rule labels as today (named exception)', () => {
    for (const ref of ['up_district', 'delhi_district']) {
      const courtRule = loadCourtRule(ref)!;
      for (const t of NAMED_EXCEPTIONS_UNSIGNED_TYPES) {
        expect(partyDesignationFor(courtRule, t)).toBe(courtRule.party_designation);
      }
    }
  });
});

describe("Ajay's condition: civil and criminal labels in UP and Delhi", () => {
  it('covers the plaint types and O.39 (so the loop below is not empty)', () => {
    expect(PLAINT_AND_O39).toHaveLength(7);
  });

  it.each(['up_district', 'delhi_district'])(
    '%s: plaint_* and temporary_injunction_o39 give Plaintiff / Defendant',
    (ref) => {
      for (const t of PLAINT_AND_O39) {
        const { courtRule, ctx } = ctxFor(ref, t);
        expect(ctx.party_label_petitioner).toBe('Plaintiff');
        expect(ctx.party_label_respondent).toBe('Defendant');
        const title = replacePlaceholders(courtRule.cause_title_format!, ctx);
        expect(title).toContain('... PLAINTIFF');
        expect(title).toContain('... DEFENDANT');
        expect(title).not.toMatch(/APPLICANT|OPPOSITE PARTY|RESPONDENT/);
      }
    },
  );

  it('bail_regular: UP gives Applicant / Opposite Party, Delhi gives Applicant / Respondent', () => {
    const up = ctxFor('up_district', 'bail_regular');
    expect(up.ctx.party_label_petitioner).toBe('Applicant');
    expect(up.ctx.party_label_respondent).toBe('Opposite Party');
    const upTitle = replacePlaceholders(up.courtRule.cause_title_format!, up.ctx);
    expect(upTitle).toContain('... APPLICANT');
    expect(upTitle).toContain('... OPPOSITE PARTY');

    const de = ctxFor('delhi_district', 'bail_regular');
    expect(de.ctx.party_label_petitioner).toBe('Applicant');
    expect(de.ctx.party_label_respondent).toBe('Respondent');
    const deTitle = replacePlaceholders(de.courtRule.cause_title_format!, de.ctx);
    expect(deTitle).toContain('... APPLICANT');
    expect(deTitle).toContain('... RESPONDENT');
    expect(deTitle).not.toContain('OPPOSITE PARTY');
  });

  it('UP state line reads "State of Uttar Pradesh" for a signed type', () => {
    expect(ctxFor('up_district', 'bail_regular').ctx.state_respondent).toBe(
      'State of Uttar Pradesh',
    );
  });

  it('criterion 4: Bihar and Jharkhand labels are untouched for a signed type', () => {
    for (const ref of ['bihar_district', 'jharkhand_district']) {
      const courtRule = loadCourtRule(ref)!;
      expect(partyDesignationFor(courtRule, 'bail_regular')).toBe(courtRule.party_designation);
    }
  });
});

describe("T-149 criterion 5: Anushka's scenario 3, regular bail, Sessions Court Lucknow, model stubbed", () => {
  const FORM = {
    court_name: 'up_sessions_lucknow',
    state: 'uttar_pradesh',
    court_type: 'sessions',
    template_id: 'bail_regular',
    applicant_name: 'Ram Kumar',
    father_name: 'Shyam Kumar',
    applicant_age: 30,
    address: 'Aliganj, Lucknow',
    fir_number: '1/2026',
    police_station: 'Aliganj',
    sections_charged: ['BNS 303'],
    language: 'en',
  };

  it('cause title, prayer, verification, signature block and every printed value carry no choice string', () => {
    const { courtRule, ctx } = ctxFor('up_district', 'bail_regular', FORM);
    // The engine does not fill the party-name or court tokens of cause_title_format
    // (the cause-title section does); supply them so the suffixes are checked in place.
    const causeTitle = replacePlaceholders(courtRule.cause_title_format!, {
      ...ctx,
      petitioner: 'Ram Kumar',
      respondent: 'State of Uttar Pradesh',
      courtDesignation: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE',
      city: 'Lucknow',
    });
    expect(causeTitle).toContain('Ram Kumar ... APPLICANT');
    expect(causeTitle).toContain('... OPPOSITE PARTY');
    expect(causeTitle).not.toMatch(CHOICE);

    expect(ctx.prayer_opening).not.toMatch(CHOICE);
    expect(ctx.prayer_closing).not.toMatch(CHOICE);
    expect(ctx.verification_text).toContain('the Applicant herein above named');
    expect(ctx.verification_text).not.toMatch(CHOICE);
    expect(ctx.state_respondent).toBe('State of Uttar Pradesh');

    // Everything the context can print, so any signature-block value is covered too.
    for (const [key, value] of Object.entries(ctx)) {
      if (typeof value === 'string') {
        expect({ key, hit: CHOICE.test(value) }).toEqual({ key, hit: false });
      }
    }
    expect(JSON.stringify(ctx)).not.toMatch(/District Magistrate \/ S\.P\./);
  });

  it("the model's system prompt shows Applicant / Opposite Party and no choice string", () => {
    const prompt = buildAISystemPrompt(
      loadTemplateConfig('bail_regular')!,
      courtDataFor('up_district').courtRule,
    );
    expect(prompt).toContain('- petitioner: "Applicant"');
    expect(prompt).toContain('- respondent: "Opposite Party"');
    expect(prompt).toContain('- state: "State of Uttar Pradesh"');
    expect(prompt).not.toMatch(/\(civil\)|\(criminal\)|District Magistrate \/ S\.P\./);
  });

  it('the brief path is fed the same labels (helper that streamGenerateFromBrief uses)', () => {
    // The wiring inside streamGenerateFromBrief itself is not exercised here.
    const lines = Object.entries(
      partyDesignationFor(courtDataFor('up_district').courtRule!, 'bail_regular')!,
    ).map(([role, label]) => `Party designation, ${role}: "${label}"`);
    expect(lines).toContain('Party designation, petitioner: "Applicant"');
    expect(lines).toContain('Party designation, respondent: "Opposite Party"');
    expect(lines.join('\n')).not.toMatch(CHOICE);
  });

  it('the memo of parties uses Applicant / Opposite Party for bail_regular, old labels for an unsigned type', async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      __mockPage: { setContent: jest.Mock };
    };
    async function memo(templateId: string): Promise<string> {
      let captured = '';
      puppeteer.__mockPage.setContent.mockImplementationOnce((html: string) => {
        captured = html;
        return Promise.resolve(undefined);
      });
      await buildAnnexuresPack({
        formData: { ...FORM, court_id: 'up_district', template_id: templateId },
        bodyParaCount: 10,
        advocateName: 'Test Adv',
      });
      return captured;
    }
    const bail = await memo('bail_regular');
    expect(bail).toContain('Applicant');
    expect(bail).toContain('Opposite Party');
    expect(bail).not.toMatch(/\(civil\)|\(criminal\)/);

    // An unsigned type keeps today's behaviour (named exception).
    const unsigned = await memo('criminal_revision');
    expect(unsigned).toMatch(/\(civil\)|\(criminal\)/);
  });
});
