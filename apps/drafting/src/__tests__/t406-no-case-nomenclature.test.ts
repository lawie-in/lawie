/**
 * T-406 - no case nomenclature on a document that is not filed in court.
 *
 * Ajay, T-404 Addendum 2 item 9, Option A: none of the 32 ids in
 * config/intake/court-documents.json `not_court_documents` (the 8 legal_notice_*,
 * rent_agreement, deeds, agreements, affidavit_identity ...) carries a case
 * nomenclature, under any court. Court documents are unchanged.
 */
import fs from 'fs';
import path from 'path';

import './setupEnv';

import courtDocuments from '../config/intake/court-documents.json';
import {
  buildPlaceholderContext,
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
  nomenclatureAllowed,
  resolveComputedFields,
  TemplateConfig,
} from '../services/template-engine.service';

const NOT_COURT: string[] = courtDocuments.not_court_documents;
const LEGAL_NOTICES = NOT_COURT.filter((id) => id.startsWith('legal_notice_'));

/** Same 13 court rules / paired real courts as court-rules-golden. */
const COURT_FOR_RULE: Record<string, string> = {
  allahabad_hc: 'allahabad_hc',
  bihar_district: 'bihar_sessions_patna',
  cjm_generic: 'bihar_cjm_patna',
  consumer_commission_generic: 'patna_dccdrc',
  delhi_district: 'delhi_dwarka',
  delhi_hc: 'delhi_hc',
  district_court_generic: 'bihar_civil_patna',
  jharkhand_district: 'jharkhand_sessions_ranchi',
  jharkhand_hc: 'jharkhand_hc',
  jmfc_generic: 'bihar_jmfc_patna',
  patna_hc: 'patna_hc',
  sessions_generic: 'mh_sessions_mumbai_city',
  up_district: 'up_sessions_agra',
};

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  courtType?: string;
  caseNomenclature?: string;
  state?: string;
}
const INDIAN_COURTS: CourtEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/courts/indian-courts.json'), 'utf8'),
).courts;

function lookupFor(ruleId: string): CourtLookupData {
  const courtRule = loadCourtRule(ruleId);
  const court = INDIAN_COURTS.find((c) => c.courtId === COURT_FOR_RULE[ruleId]);
  if (!courtRule || !court) throw new Error(`court fixture missing for ${ruleId}`);
  return {
    designation: court.designation,
    city: court.city,
    caseNomenclature: court.caseNomenclature ?? '',
    state: court.state,
    courtType: court.courtType,
    formattingRulesRef: ruleId,
    courtRule,
  };
}

const RULES = Object.keys(COURT_FOR_RULE);

/** A real pack when it loads, otherwise a minimal hand-built config with that id. */
function configFor(templateId: string): TemplateConfig {
  const real = loadTemplateConfig(templateId);
  if (real) return real;
  return {
    template_id: templateId,
    display_name: templateId,
    computed_fields: {},
    form_schema: { steps: [] },
    document_structure: { sections: [] },
  } as unknown as TemplateConfig;
}

/** A config that declares the two computed-field forms that carry nomenclature. */
function computedConfig(templateId: string): TemplateConfig {
  return {
    ...configFor(templateId),
    computed_fields: {
      from_db: { logic: 'courts_db.lookup(court).case_nomenclature' },
      from_rules: { logic: "court_rules[court].case_nomenclature || 'DEFAULT_LINE'" },
    },
  } as unknown as TemplateConfig;
}

const FORM = {
  applicant_name: 'T406_APPLICANT',
  place: 'Patna',
  court: 'whatever',
  state: 'bihar',
};

function expectNone(ctx: Record<string, unknown>): void {
  expect(ctx.case_nomenclature ?? '').toBe('');
  expect(ctx.caseNomenclature ?? '').toBe('');
}

describe('T-406 nomenclatureAllowed', () => {
  it('lists 32 not-court ids', () => {
    expect(NOT_COURT).toHaveLength(32);
    expect(LEGAL_NOTICES).toHaveLength(8);
  });

  it.each(NOT_COURT)('is false for %s', (id) => {
    expect(nomenclatureAllowed(id)).toBe(false);
  });

  it.each([
    'bail_regular',
    'bail_anticipatory',
    'consumer_complaint',
    'plaint_possession',
    'plaint_summary_suit_o37',
    'ni_complaint_s138',
  ])('is true for court document %s', (id) => {
    expect(nomenclatureAllowed(id)).toBe(true);
  });

  it('matches the JSON list exactly (drift guard)', () => {
    const allowedFromJson = NOT_COURT.filter((id) => nomenclatureAllowed(id));
    expect(allowedFromJson).toEqual([]);
    // Any other plausible id outside the list stays allowed.
    expect(nomenclatureAllowed('legal_notice_not_in_list_x')).toBe(true);
  });
});

describe('T-406 buildPlaceholderContext: no nomenclature for not-court packs', () => {
  it('the 8 legal_notice_* and rent_agreement load as real packs', () => {
    for (const id of [...LEGAL_NOTICES, 'rent_agreement']) {
      expect(loadTemplateConfig(id)).toBeTruthy();
    }
  });

  for (const rule of RULES) {
    describe(rule, () => {
      const court = lookupFor(rule);
      it.each(NOT_COURT)('%s has no case nomenclature', (id) => {
        const ctx = buildPlaceholderContext(
          configFor(id),
          { ...FORM, template_id: id },
          { advocateName: 'ADV', enrollmentNumber: 'ENR-1' },
          court,
        );
        expectNone(ctx);
      });
    });
  }

  it('the court itself has a nomenclature (fixtures are meaningful)', () => {
    expect(lookupFor('allahabad_hc').caseNomenclature).toBeTruthy();
    expect(lookupFor('consumer_commission_generic').caseNomenclature).toBeTruthy();
  });

  it('a client-sent case_nomenclature does not reach a not-court pack', () => {
    const FORGED = 'ZZ-FORGED-T406';
    for (const id of ['legal_notice_s138', 'rent_agreement']) {
      const ctx = buildPlaceholderContext(
        configFor(id),
        { ...FORM, template_id: id, case_nomenclature: FORGED, caseNomenclature: FORGED },
        undefined,
        lookupFor('allahabad_hc'),
      );
      expect(JSON.stringify(ctx)).not.toContain(FORGED);
      expectNone(ctx);
    }
  });
});

describe('T-406 computed-field paths', () => {
  const court = lookupFor('allahabad_hc');

  it.each(NOT_COURT)('%s: courts_db / court_rules nomenclature is empty', (id) => {
    const computed = resolveComputedFields(computedConfig(id), FORM, court);
    expect(computed.from_db).toBe('');
    expect(computed.from_rules).toBe('');
  });

  it('a court document still gets the court value', () => {
    const computed = resolveComputedFields(computedConfig('bail_regular'), FORM, court);
    expect(computed.from_db).toBe(court.caseNomenclature);
    expect(computed.from_rules).toBe(court.caseNomenclature);
  });

  it('a not-court pack never gets even the court_rules default text', () => {
    const computed = resolveComputedFields(computedConfig('legal_notice_s80'), FORM, undefined);
    expect(computed.from_rules).toBe('');
  });
});

describe('T-406 court documents are unaffected', () => {
  it('bail_regular under allahabad_hc still gets its nomenclature', () => {
    const ctx = buildPlaceholderContext(
      configFor('bail_regular'),
      { ...FORM, template_id: 'bail_regular' },
      { advocateName: 'ADV', enrollmentNumber: 'ENR-1' },
      lookupFor('allahabad_hc'),
    );
    expect(ctx.case_nomenclature).toBeTruthy();
    expect(ctx.case_nomenclature).toMatch(/Bail/i);
  });

  it.each(['bail_regular', 'bail_anticipatory', 'consumer_complaint'])(
    '%s keeps a nomenclature under every court rule',
    (id) => {
      for (const rule of RULES) {
        const ctx = buildPlaceholderContext(
          configFor(id),
          { ...FORM, template_id: id },
          { advocateName: 'ADV', enrollmentNumber: 'ENR-1' },
          lookupFor(rule),
        );
        expect(ctx.case_nomenclature).toBeTruthy();
      }
    },
  );
});
