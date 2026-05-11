/**
 * SCRUM-75 — Court-rule golden-master snapshot suite
 *
 * Locks the deterministic render surface for every (court × template) pair so that
 * a stray edit to any of:
 *   - apps/drafting/src/config/court-rules/*.json
 *   - apps/drafting/src/services/template-engine.service.ts (placeholder build)
 *   - apps/drafting/src/services/annexures.service.ts (annexure HTML assembly)
 * cannot land silently. CI fails on any snapshot diff.
 *
 * Coverage:
 *   - 13 courts × 6 templates = 78 placeholder-context snapshots
 *   - 13 courts × 1 fixed template = 13 annexure-pack HTML snapshots
 *   = 91 golden masters total
 *
 * Reviewer: Arjun (CTO).
 *
 * ─── How to regenerate snapshots when a court rule legitimately changes ────────
 *
 *   yarn workspace @lawie/drafting test:golden:update
 *
 *   (one-liner alias for: jest --testPathPattern=court-rules-golden --updateSnapshot)
 *
 * Treat snapshot diffs as a deliberate change — not a fix-the-test flag. Every
 * legitimate update should:
 *   1. Land the rule edit (court_rules JSON or service code).
 *   2. Run the regenerate command above.
 *   3. Diff the snapshot files in the PR; reviewer (Arjun for engine/court-rule
 *      changes, Ajay for legal-language changes) explicitly approves the diff.
 *   4. PR description explains why the snapshot is changing.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 */

// Mock Puppeteer up front so annexures HTML can be captured without a browser
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

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  buildPlaceholderContext,
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COURTS = [
  'allahabad_hc',
  'bihar_district',
  'cjm_generic',
  'consumer_commission_generic',
  'delhi_district',
  'delhi_hc',
  'district_court_generic',
  'jharkhand_district',
  'jharkhand_hc',
  'jmfc_generic',
  'patna_hc',
  'sessions_generic',
  'up_district',
];

const TEMPLATES = [
  'bail_anticipatory',
  'bail_regular',
  'consumer_complaint',
  'legal_notice_s138',
  'legal_notice_s80',
  'rent_agreement',
];

/** Fixed form data — every template field a court rule might consume. */
const FIXED_FORM_DATA: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  state: 'jharkhand',
  court_type: 'high_court',
  applicant_name: 'GOLDEN_APPLICANT',
  petitioner_name: 'GOLDEN_PETITIONER',
  respondent_name: 'GOLDEN_RESPONDENT',
  applicant_age: 30,
  age: 30,
  father_name: 'GOLDEN_FATHER',
  parent_name: 'GOLDEN_PARENT',
  applicant_address: 'GOLDEN_ADDRESS, RANCHI',
  address: 'GOLDEN_ADDRESS, RANCHI',
  fir_number: '001/2026',
  fir_date: '2026-01-15',
  incident_date: '2026-01-10',
  police_station: 'GOLDEN_PS',
  ps_name: 'GOLDEN_PS',
  sections_charged: ['103', '109'],
  bns_sections: ['103', '109'],
  advocate_name: 'GOLDEN_ADV',
  enrollment_number: 'GOLDEN-ENR-001',
  place: 'Ranchi',
  city: 'Ranchi',
  district: 'Ranchi',
  cheque_amount: '50000',
  cheque_number: 'CHQ-001',
  cheque_date: '2026-01-01',
  bank_name: 'GOLDEN_BANK',
  notice_date: '2026-02-01',
  property_address: 'GOLDEN_PROP, RANCHI',
  monthly_rent: '15000',
  tenancy_period_months: '11',
  landlord_name: 'GOLDEN_LANDLORD',
  tenant_name: 'GOLDEN_TENANT',
};

/** Build a CourtLookupData stub from a courtRule — deterministic per court. */
function lookupFor(courtId: string): CourtLookupData | undefined {
  const courtRule = loadCourtRule(courtId);
  if (!courtRule) return undefined;
  return {
    designation: courtRule.designation,
    city: 'Ranchi',
    caseNomenclature:
      courtRule.case_nomenclature?.anticipatory_bail ??
      courtRule.case_nomenclature?.regular_bail ??
      '',
    formattingRulesRef: courtId,
    courtRule,
  };
}

// ── Date determinism ──────────────────────────────────────────────────────────
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-05-10T06:30:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

// ── Placeholder context snapshots — 13 × 6 = 78 ───────────────────────────────

describe('court-rules-golden — placeholder context per (court × template)', () => {
  for (const courtId of COURTS) {
    describe(courtId, () => {
      for (const templateId of TEMPLATES) {
        it(`${templateId} resolves placeholders deterministically`, () => {
          const config = loadTemplateConfig(templateId);
          const courtData = lookupFor(courtId);
          if (!config || !courtData) {
            // If a config or court is unloadable, the snapshot itself records that.
            expect({ status: 'config-or-court-missing', courtId, templateId }).toMatchSnapshot();
            return;
          }

          const ctx = buildPlaceholderContext(
            config,
            { ...FIXED_FORM_DATA, template_id: templateId },
            { advocateName: 'GOLDEN_ADV', enrollmentNumber: 'GOLDEN-ENR-001' },
            courtData,
          );

          // Snapshot only the deterministic, court-rule-derived surface — NOT the full
          // form-flattened context, which contains test fixture noise.
          const snapshot = {
            // From courtRule directly
            designation: courtData.courtRule!.designation,
            courtType: courtData.courtRule!.courtType,
            supportedLanguages: courtData.courtRule!.supported_languages ?? null,
            paraNumbering: courtData.courtRule!.para_numbering ?? null,

            // Court-rule-derived placeholders surfaced by buildPlaceholderContext
            party_label_petitioner: ctx.party_label_petitioner,
            party_label_respondent: ctx.party_label_respondent,
            party_label_applicant: ctx.party_label_applicant,
            party_label_accused: ctx.party_label_accused,
            state_respondent: ctx.state_respondent,
            case_nomenclature: ctx.case_nomenclature,
            prayer_opening: ctx.prayer_opening,
            prayer_closing: ctx.prayer_closing,
            verification_text: ctx.verification_text,
            court_designation: ctx.court_designation,
            court_header: ctx.court_header,
            court_city: ctx.court_city,
          };

          expect(snapshot).toMatchSnapshot();
        });
      }
    });
  }
});

// ── Annexure HTML snapshots — 13 ──────────────────────────────────────────────

describe('court-rules-golden — annexures pack HTML per court', () => {
  for (const courtId of COURTS) {
    it(`${courtId} renders annexures HTML deterministically`, async () => {
      // Capture the HTML that would be passed to renderPdf via the Puppeteer mock
      const puppeteer = jest.requireMock('puppeteer') as {
        __mockPage: { setContent: jest.Mock };
      };
      let captured = '';
      puppeteer.__mockPage.setContent.mockImplementationOnce((html: string) => {
        captured = html;
        return Promise.resolve(undefined);
      });

      await buildAnnexuresPack({
        formData: { ...FIXED_FORM_DATA, court_id: courtId, template_id: 'bail_anticipatory' },
        bodyParaCount: 10,
        advocateName: 'GOLDEN_ADV',
      });

      expect(captured).toMatchSnapshot();
    });
  }
});
