/**
 * T-428 (Ajay: 2fcf6c4, 03b3e6e, e512365): signed bail case lines for lower courts and
 * three high courts. Supreme Court bail lines are the case-type blank; patna_hc and
 * delhi_hc case lines match the committed T-428 baseline fixture
 * (fixtures/t428-hc-case-nomenclature-baseline.json, taken at develop_staging ead7f7e4).
 * That fixture is legal content: changing it needs Ajay's sign-off.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadCourtRule,
  loadTemplateConfig,
  type CourtLookupData,
  type TemplateConfig,
} from '../services/template-engine.service';

const BLANK = '[To be confirmed: case type and number]';
const BASELINE: Record<string, unknown> = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/t428-hc-case-nomenclature-baseline.json'), 'utf-8'),
);
const form = { applicant_name: 'Ramesh Kumar', state: 'bihar', fir_number: '12/2026' };
const year = String(new Date().getFullYear());

function line(
  ruleId: string,
  courtType: string,
  template: string,
  extraForm: Record<string, string> = {},
): unknown {
  const court: CourtLookupData = {
    designation: 'IN THE COURT OF TEST',
    city: 'Patna',
    caseNomenclature: 'Courts-list line No. 99',
    formattingRulesRef: ruleId,
    courtType,
    courtRule: loadCourtRule(ruleId) ?? undefined,
  };
  const cfg = loadTemplateConfig(template) as TemplateConfig;
  return buildPlaceholderContext(cfg, { ...form, ...extraForm }, { advocateName: 'A' }, court)
    .caseNomenclature;
}

beforeEach(() => clearConfigCache());

describe('T-428 bail case lines', () => {
  it('district court (bihar_district): regular and anticipatory lines', () => {
    expect(line('bihar_district', 'district_court', 'bail_regular')).toBe(
      `Bail Application No. _____ of ${year}`,
    );
    expect(line('bihar_district', 'district_court', 'bail_anticipatory')).toBe(
      `Anticipatory Bail Application No. _____ of ${year}`,
    );
  });

  it('cjm_generic: regular line; anticipatory prints the case-type blank', () => {
    expect(line('cjm_generic', 'cjm', 'bail_regular')).toBe(
      `Bail Application No. _____ of ${year}`,
    );
    expect(line('cjm_generic', 'cjm', 'bail_anticipatory')).toBe(BLANK);
  });

  it('district_court_generic keeps the case-type blank for bail (Ajay e512365)', () => {
    expect(line('district_court_generic', 'district_court', 'bail_regular')).toBe(BLANK);
    expect(line('district_court_generic', 'district_court', 'bail_anticipatory')).toBe(BLANK);
  });

  it('jharkhand_hc: anticipatory A.B.A.', () => {
    expect(line('jharkhand_hc', 'high_court', 'bail_anticipatory')).toBe(
      `A.B.A. No. _____ of ${year}`,
    );
  });

  // Addendum 1 #6 (2992891): "U/S 482 BNSS" stays for a BNSS choice; a CrPC choice or no choice
  // prints the T-426 generic `Anticipatory Bail Application No. _____ of {year}`.
  const ALLAHABAD_BNSS = `Criminal Misc. Anticipatory Bail Application U/S 482 BNSS No. _____ of ${year}`;
  const GENERIC = `Anticipatory Bail Application No. _____ of ${year}`;

  it('allahabad_hc: a BNSS choice keeps the U/S 482 BNSS line', () => {
    expect(
      line('allahabad_hc', 'high_court', 'bail_anticipatory', { procedure_code: 'BNSS and BSA' }),
    ).toBe(ALLAHABAD_BNSS);
  });

  it('allahabad_hc: an FIR on or after 1 Jul 2024 forces BNSS, whatever was chosen', () => {
    expect(
      line('allahabad_hc', 'high_court', 'bail_anticipatory', {
        procedure_code: 'CrPC and Evidence Act',
        fir_date: '2026-03-01',
      }),
    ).toBe(ALLAHABAD_BNSS);
  });

  it('allahabad_hc: a CrPC choice prints the generic line, not U/S 482 BNSS', () => {
    const l = line('allahabad_hc', 'high_court', 'bail_anticipatory', {
      procedure_code: 'CrPC and Evidence Act',
      fir_date: '2023-03-01',
    });
    expect(l).toBe(GENERIC);
    expect(l).not.toContain('BNSS');
  });

  it('allahabad_hc: no choice prints the generic line, not U/S 482 BNSS', () => {
    const l = line('allahabad_hc', 'high_court', 'bail_anticipatory');
    expect(l).toBe(GENERIC);
    expect(l).not.toContain('BNSS');
  });

  it('allahabad_hc: the procedure choice does not touch the regular bail line', () => {
    const none = line('allahabad_hc', 'high_court', 'bail_regular');
    expect(
      line('allahabad_hc', 'high_court', 'bail_regular', {
        procedure_code: 'CrPC and Evidence Act',
      }),
    ).toBe(none);
  });

  it('supreme_court: bail lines are the case-type blank (Ajay e512365)', () => {
    const cn = loadCourtRule('supreme_court')!.case_nomenclature as Record<string, string>;
    expect(cn.regular_bail).toBe(BLANK);
    expect(cn.anticipatory_bail).toBe(BLANK);
  });

  it('high_court_generic: both bail lines are the case-type blank', () => {
    const cn = loadCourtRule('high_court_generic')!.case_nomenclature as Record<string, string>;
    expect(cn.regular_bail).toBe(BLANK);
    expect(cn.anticipatory_bail).toBe(BLANK);
  });

  it.each(['patna_hc', 'delhi_hc'])('%s case lines match the committed T-428 baseline', (id) => {
    expect(BASELINE[id]).toBeDefined();
    const rule = loadCourtRule(id)!;
    expect(rule.case_nomenclature).toEqual(BASELINE[id]);
  });
});
