/**
 * Unit tests for the config-driven template engine (SCRUM-43).
 *
 * Tests: config loading, computed fields, placeholder replacement,
 * AI prompt building, document assembly, form validation, show_if.
 */
import {
  extractBNSSectionNumbers,
  validateBNSWhitelist,
  checkFactSectionSanity,
} from '../services/validator';

import {
  loadTemplateConfig,
  listTemplateConfigs,
  clearConfigCache,
  resolveComputedFields,
  buildPlaceholderContext,
  replacePlaceholders,
  renderTemplateSection,
  buildAISystemPrompt,
  buildAIUserPrompt,
  assembleDocument,
  validateFormData,
  evaluateShowIf,
  sanitiseAIBody,
  TemplateConfig,
  RenderedSection,
  CourtLookupData,
  loadCourtRule,
  _testing,
} from '../services/template-engine.service';

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearConfigCache();
});

// ── Config Loading ──────────────────────────────────────────────────────────

describe('Template Config Loading', () => {
  test('loads bail_regular.json successfully', () => {
    const config = loadTemplateConfig('bail_regular');
    expect(config).not.toBeNull();
    expect(config!.template_id).toBe('bail_regular');
    expect(config!.display_name).toBe('Regular Bail Application');
    expect(config!.category).toBe('criminal');
    expect(config!.plan_access).toBe('free');
  });

  test('returns null for non-existent template', () => {
    const config = loadTemplateConfig('does_not_exist');
    expect(config).toBeNull();
  });

  test('caches config on second load', () => {
    const first = loadTemplateConfig('bail_regular');
    const second = loadTemplateConfig('bail_regular');
    expect(first).toBe(second); // Same reference = cached
  });

  test('bail_regular has form_schema with steps', () => {
    const config = loadTemplateConfig('bail_regular')!;
    expect(config.form_schema.steps.length).toBeGreaterThanOrEqual(3);
    expect(config.form_schema.steps[0].title).toBe('Case Details');
  });

  test('bail_regular has document_structure with sections', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const sections = config.document_structure.sections;
    expect(sections.length).toBeGreaterThanOrEqual(6);

    const sectionIds = sections.map((s) => s.section_id);
    expect(sectionIds).toContain('cause_title');
    expect(sectionIds).toContain('body');
    expect(sectionIds).toContain('prayer');
    expect(sectionIds).toContain('verification');
    expect(sectionIds).toContain('advocate_block');
    expect(sectionIds).toContain('disclaimer');
  });

  test('bail_regular body section is ai_generated', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const body = config.document_structure.sections.find((s) => s.section_id === 'body');
    expect(body).toBeDefined();
    expect(body!.type).toBe('ai_generated');
    expect(body!.prompt_context).toBeDefined();
    expect(body!.min_paragraphs).toBe(7);
  });

  test('bail_regular non-body sections are templates', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const templateSections = config.document_structure.sections.filter(
      (s) => s.type === 'template',
    );
    expect(templateSections.length).toBeGreaterThanOrEqual(5);
    for (const s of templateSections) {
      expect(s.template).toBeDefined();
    }
  });

  test('listTemplateConfigs returns summaries', () => {
    const list = listTemplateConfigs();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const bail = list.find((t) => t.template_id === 'bail_regular');
    expect(bail).toBeDefined();
    expect(bail!.display_name).toBe('Regular Bail Application');
    // Summary should NOT have form_schema
    expect((bail as unknown as Record<string, unknown>).form_schema).toBeUndefined();
  });
});

// ── Computed Fields ─────────────────────────────────────────────────────────

describe('Computed Fields Resolution', () => {
  let config: TemplateConfig;

  beforeEach(() => {
    config = loadTemplateConfig('bail_regular')!;
  });

  test('resolves bail_section based on custody status (in custody)', () => {
    const computed = resolveComputedFields(config, {
      currently_in_custody: 'yes_judicial',
    });
    expect(computed.bail_section).toBe('480');
  });

  test('resolves bail_section based on custody status (not in custody)', () => {
    const computed = resolveComputedFields(config, {
      currently_in_custody: 'no',
    });
    expect(computed.bail_section).toBe('482');
  });

  test('resolves bail_type_label from label_map', () => {
    const computed = resolveComputedFields(config, {
      currently_in_custody: 'yes_judicial',
    });
    expect(computed.bail_type_label).toBe('Regular Bail');

    const computed2 = resolveComputedFields(config, {
      currently_in_custody: 'no',
    });
    expect(computed2.bail_type_label).toBe('Anticipatory Bail');
  });

  test('resolves court_designation from courts_db stub', () => {
    const computed = resolveComputedFields(config, {
      court_name: 'District & Sessions Court, Patna',
    });
    expect(computed.court_designation).toBe('District & Sessions Court, Patna');
  });

  test('resolves court_city by extracting from court name', () => {
    const computed = resolveComputedFields(config, {
      court_name: 'District & Sessions Court, Patna',
    });
    expect(computed.court_city).toBe('Patna');
  });

  test('resolves case_nomenclature with default fallback', () => {
    const computed = resolveComputedFields(config, {
      court_name: 'Test Court',
    });
    expect(computed.case_nomenclature).toBe('Criminal Miscellaneous Case');
  });
});

// ── Placeholder Replacement ─────────────────────────────────────────────────

describe('Placeholder Replacement', () => {
  test('replaces known placeholders', () => {
    const result = replacePlaceholders('FIR No. {fir_number} dated {fir_date}', {
      fir_number: '124/2026',
      fir_date: '15/03/2026',
    });
    expect(result).toBe('FIR No. 124/2026 dated 15/03/2026');
  });

  test('replaces unknown placeholders with blanks', () => {
    const result = replacePlaceholders('Name: {applicant_name}', {});
    expect(result).toBe('Name: _____');
  });

  test('handles multiple occurrences', () => {
    const result = replacePlaceholders('{name} vs {name}', { name: 'Ram' });
    expect(result).toBe('Ram vs Ram');
  });
});

describe('buildPlaceholderContext', () => {
  test('includes system values', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(config, {}, {});
    expect(ctx.current_year).toBe(String(new Date().getFullYear()));
    expect(ctx.current_date).toBeTruthy();
  });

  test('includes form data as strings', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        fir_number: '124/2026',
        applicant_name: 'Ram Kumar',
      },
      {},
    );
    expect(ctx.fir_number).toBe('124/2026');
    expect(ctx.applicant_name).toBe('Ram Kumar');
  });

  test('flattens array values (checkbox_group)', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        grounds_for_bail: ['false_implication', 'no_flight_risk'],
      },
      {},
    );
    expect(ctx.grounds_for_bail).toBe('false_implication, no_flight_risk');
  });

  test('includes advocate details from extra', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      {},
      {
        advocateName: 'Adv. Sharma',
        enrollmentNumber: 'BR/1234/2020',
      },
    );
    expect(ctx.advocate_name).toBe('Adv. Sharma');
    expect(ctx.enrollment_number).toBe('BR/1234/2020');
  });

  test('includes computed fields', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        currently_in_custody: 'yes_judicial',
      },
      {},
    );
    expect(ctx.bail_section).toBe('480');
    expect(ctx.bail_type_label).toBe('Regular Bail');
  });
});

// ── Template Section Rendering ──────────────────────────────────────────────

describe('renderTemplateSection', () => {
  test('renders cause_title with placeholders', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const section = config.document_structure.sections.find((s) => s.section_id === 'cause_title')!;

    const ctx = buildPlaceholderContext(
      config,
      {
        applicant_name: 'Ram Kumar',
        father_name: 'Shri Hari Kumar',
        applicant_age: '32',
        address: '123 Main St, Patna',
        state: 'Bihar',
        currently_in_custody: 'yes_judicial',
        court_name: 'District & Sessions Court, Patna',
      },
      {},
    );

    const rendered = renderTemplateSection(section, ctx);
    expect(rendered.section_id).toBe('cause_title');
    expect(rendered.type).toBe('template');
    expect(rendered.content).toContain('Ram Kumar');
    expect(rendered.content).toContain('Shri Hari Kumar');
    expect(rendered.content).toContain('32');
    expect(rendered.content).toContain('Bihar');
  });

  test('renders prayer with bail section', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const section = config.document_structure.sections.find((s) => s.section_id === 'prayer')!;

    const ctx = buildPlaceholderContext(
      config,
      {
        currently_in_custody: 'yes_judicial',
        applicant_name: 'Ram Kumar',
        fir_number: '124/2026',
        fir_date: '15/03/2026',
        police_station: 'Kotwali, Patna',
      },
      {},
    );

    const rendered = renderTemplateSection(section, ctx);
    expect(rendered.content).toContain('Regular Bail');
    expect(rendered.content).toContain('480');
    expect(rendered.content).toContain('Ram Kumar');
    expect(rendered.content).toContain('124/2026');
  });

  test('renders disclaimer without placeholders', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const section = config.document_structure.sections.find((s) => s.section_id === 'disclaimer')!;

    const rendered = renderTemplateSection(section, {});
    expect(rendered.content).toContain('AI-assisted draft');
    expect(rendered.content).toContain('Lawie does not provide legal advice');
  });

  test('throws for non-template section', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const bodySection = config.document_structure.sections.find((s) => s.section_id === 'body')!;

    expect(() => renderTemplateSection(bodySection, {})).toThrow();
  });
});

// ── AI Prompt Building ──────────────────────────────────────────────────────

describe('AI Prompt Building', () => {
  test('buildAISystemPrompt includes template info', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const prompt = buildAISystemPrompt(config);
    expect(prompt).toContain('Regular Bail Application');
    expect(prompt).toContain('criminal');
    expect(prompt).toContain('BNS');
    expect(prompt).toContain('BNSS');
    expect(prompt).toContain('cause-title block');
  });

  test('buildAIUserPrompt replaces placeholders in prompt_context', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const bodySection = config.document_structure.sections.find((s) => s.section_id === 'body')!;

    const ctx = buildPlaceholderContext(
      config,
      {
        currently_in_custody: 'yes_judicial',
        fir_number: '124/2026',
        fir_date: '15/03/2026',
        police_station: 'Kotwali, Patna',
        sections_charged: 'BNS 103(1), BNS 85',
        facts_narrative: 'The accused was falsely implicated.',
        grounds_for_bail: ['false_implication', 'no_flight_risk'],
      },
      {},
    );

    const prompt = buildAIUserPrompt(bodySection, ctx);
    expect(prompt).toContain('124/2026');
    expect(prompt).toContain('15/03/2026');
    expect(prompt).toContain('Kotwali, Patna');
    expect(prompt).toContain('falsely implicated');
    expect(prompt).toContain('false_implication, no_flight_risk');
    expect(prompt).toContain('7-12 numbered paragraphs');
  });
});

// ── Document Assembly ───────────────────────────────────────────────────────

describe('assembleDocument', () => {
  test('joins sections in order', () => {
    const sections: RenderedSection[] = [
      { section_id: 'title', type: 'template', content: 'CAUSE TITLE' },
      {
        section_id: 'body',
        type: 'ai_generated',
        content: '1. Para one.\n2. Para two.\n3. Para three.',
      },
      { section_id: 'prayer', type: 'template', content: 'PRAYER' },
    ];

    const { fullText, bodyParaCount } = assembleDocument(sections);
    expect(fullText).toBe('CAUSE TITLE\n\n1. Para one.\n2. Para two.\n3. Para three.\n\nPRAYER');
    expect(bodyParaCount).toBe(3);
  });

  test('replaces {body_para_count} in template sections', () => {
    const sections: RenderedSection[] = [
      { section_id: 'body', type: 'ai_generated', content: '1. A.\n2. B.\n3. C.\n4. D.\n5. E.' },
      {
        section_id: 'verification',
        type: 'template',
        content: 'paragraphs 1 to {body_para_count}',
      },
    ];

    const { fullText, bodyParaCount } = assembleDocument(sections);
    expect(bodyParaCount).toBe(5);
    expect(fullText).toContain('paragraphs 1 to 5');
  });
});

// ── Form Validation ─────────────────────────────────────────────────────────

describe('validateFormData', () => {
  let config: TemplateConfig;

  beforeEach(() => {
    config = loadTemplateConfig('bail_regular')!;
  });

  test('returns errors for missing required fields', () => {
    const errors = validateFormData(config, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('FIR Number'))).toBe(true);
  });

  test('passes with all required fields filled', () => {
    const errors = validateFormData(config, {
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
    });
    expect(errors).toEqual([]);
  });

  test('validates min_length for textarea', () => {
    const errors = validateFormData(config, {
      fir_number: '124/2026',
      fir_date: '2026-03-15',
      police_station: 'Kotwali',
      sections_charged: ['103'],
      currently_in_custody: 'yes_judicial',
      state: 'bihar',
      court_type: 'sessions',
      court_name: 'test',
      applicant_name: 'Ram',
      father_name: 'Hari',
      applicant_age: '32',
      address: '123 Main',
      language: 'en',
      facts_narrative: 'Short', // Less than min_length 50
      grounds_for_bail: ['false_implication', 'no_flight_risk'],
    });
    expect(errors.some((e) => e.includes('at least 50'))).toBe(true);
  });

  test('validates min_select for checkbox_group', () => {
    const errors = validateFormData(config, {
      fir_number: '124/2026',
      fir_date: '2026-03-15',
      police_station: 'Kotwali',
      sections_charged: ['103'],
      currently_in_custody: 'yes_judicial',
      state: 'bihar',
      court_type: 'sessions',
      court_name: 'test',
      applicant_name: 'Ram',
      father_name: 'Hari',
      applicant_age: '32',
      address: '123 Main',
      language: 'en',
      facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
      grounds_for_bail: ['false_implication'], // Only 1, need 2
    });
    expect(errors.some((e) => e.includes('at least 2'))).toBe(true);
  });

  test('skips validation for hidden fields (show_if)', () => {
    // custody_since has show_if: "currently_in_custody !== no"
    // When currently_in_custody is "no", custody_since should be skipped
    const errors = validateFormData(config, {
      fir_number: '124/2026',
      fir_date: '2026-03-15',
      police_station: 'Kotwali',
      sections_charged: ['103'],
      currently_in_custody: 'no', // custody_since should be hidden
      state: 'bihar',
      court_type: 'sessions',
      court_name: 'test',
      applicant_name: 'Ram',
      father_name: 'Hari',
      applicant_age: '32',
      address: '123 Main',
      language: 'en',
      facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
      grounds_for_bail: ['false_implication', 'no_flight_risk'],
    });
    // Should not have error about custody_since
    expect(errors.some((e) => e.includes('custody'))).toBe(false);
  });
});

// ── show_if Evaluation ──────────────────────────────────────────────────────

describe('evaluateShowIf', () => {
  test('evaluates !== correctly', () => {
    expect(evaluateShowIf('status !== no', { status: 'yes' })).toBe(true);
    expect(evaluateShowIf('status !== no', { status: 'no' })).toBe(false);
  });

  test('evaluates === correctly', () => {
    expect(evaluateShowIf('type === bail', { type: 'bail' })).toBe(true);
    expect(evaluateShowIf('type === bail', { type: 'notice' })).toBe(false);
  });

  test('defaults to true for unknown expressions', () => {
    expect(evaluateShowIf('complex || expr', {})).toBe(true);
  });
});

// ── extractCityFromCourtName ────────────────────────────────────────────────

describe('extractCityFromCourtName', () => {
  const { extractCityFromCourtName } = _testing;

  test('extracts city after comma', () => {
    expect(extractCityFromCourtName('District & Sessions Court, Patna')).toBe('Patna');
  });

  test('extracts city after "at"', () => {
    expect(extractCityFromCourtName('Sessions Court at Ranchi')).toBe('Ranchi');
  });

  test('returns full name if no pattern matches', () => {
    expect(extractCityFromCourtName('Patna High Court')).toBe('Patna High Court');
  });

  test('returns empty for empty input', () => {
    expect(extractCityFromCourtName('')).toBe('');
  });
});

// ── CLO Round 3 — Court header city resolution (item 4) ──────────────────────
describe('court header city resolution', () => {
  const bailConfig = loadTemplateConfig('bail_regular')!;

  test('generic court rule designation gets city appended from DB', () => {
    // Simulates: bihar_district court rule has "IN THE COURT OF DISTRICT & SESSIONS JUDGE"
    // DB record has city: "Patna" — result should include PATNA
    const courtData: CourtLookupData = {
      designation: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA',
      city: 'Patna',
      caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
      formattingRulesRef: 'bihar_district',
      courtRule: loadCourtRule('bihar_district') ?? undefined,
    };
    const ctx = buildPlaceholderContext(
      bailConfig,
      {
        court_name: 'bihar_sessions_patna',
        state: 'bihar',
        court_type: 'sessions',
        applicant_name: 'Test',
        father_name: 'Test Sr',
        applicant_age: 30,
        address: 'Test Address',
        fir_number: '1/2026',
        fir_date: '2026-01-01',
        police_station: 'PS Test',
        sections_charged: ['BNS 303'],
        currently_in_custody: 'yes_judicial',
        custody_since: '2026-01-02',
        language: 'en',
        facts_narrative: 'Test facts',
        grounds_for_bail: ['no_flight_risk'],
        respondent_name: 'State of Bihar',
        relief_sought: 'Regular bail',
      },
      { advocateName: 'Test Adv', enrollmentNumber: 'TEST/001' },
      courtData,
    );
    // The court_header should contain PATNA
    expect(ctx.court_header).toContain('PATNA');
    expect(ctx.court_header).toContain('IN THE COURT OF');
  });

  test('Jharkhand sessions court gets RANCHI in header', () => {
    const courtData: CourtLookupData = {
      designation: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE, RANCHI',
      city: 'Ranchi',
      caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
      formattingRulesRef: 'jharkhand_district',
      courtRule: loadCourtRule('jharkhand_district') ?? undefined,
    };
    const ctx = buildPlaceholderContext(
      bailConfig,
      {
        court_name: 'jharkhand_sessions_ranchi',
        state: 'jharkhand',
        court_type: 'sessions',
        applicant_name: 'Test',
        father_name: 'Test Sr',
        applicant_age: 28,
        address: 'Ranchi Address',
        fir_number: '2/2026',
        fir_date: '2026-02-01',
        police_station: 'PS Lalpur',
        sections_charged: ['BNS 303'],
        currently_in_custody: 'yes_judicial',
        custody_since: '2026-02-02',
        language: 'en',
        facts_narrative: 'Test facts',
        grounds_for_bail: ['no_flight_risk'],
        respondent_name: 'State of Jharkhand',
        relief_sought: 'Regular bail',
      },
      { advocateName: 'Test Adv', enrollmentNumber: 'JHC/001' },
      courtData,
    );
    expect(ctx.court_header).toContain('RANCHI');
  });

  test('HC designation is used as-is (already includes city)', () => {
    const courtData: CourtLookupData = {
      designation: 'IN THE HIGH COURT OF JUDICATURE AT PATNA',
      city: 'Patna',
      caseNomenclature: 'Criminal Miscellaneous Application No. _____ of {current_year}',
      formattingRulesRef: 'patna_hc',
      courtRule: loadCourtRule('patna_hc') ?? undefined,
    };
    const ctx = buildPlaceholderContext(
      bailConfig,
      {
        court_name: 'patna_hc',
        state: 'bihar',
        court_type: 'high_court',
        applicant_name: 'Test',
        father_name: 'Test Sr',
        applicant_age: 30,
        address: 'Test Address',
        fir_number: '3/2026',
        fir_date: '2026-03-01',
        police_station: 'PS Test',
        sections_charged: ['BNS 303'],
        currently_in_custody: 'yes_judicial',
        custody_since: '2026-03-02',
        language: 'en',
        facts_narrative: 'Test facts',
        grounds_for_bail: ['no_flight_risk'],
        respondent_name: 'State of Bihar',
        relief_sought: 'Anticipatory bail',
      },
      { advocateName: 'Test Adv', enrollmentNumber: 'TEST/001' },
      courtData,
    );
    expect(ctx.court_header).toBe('IN THE HIGH COURT OF JUDICATURE AT PATNA');
  });

  test('fallback: courtId-like string extracts city, never prints raw courtId (Round 4 item 1d)', () => {
    // No courtData — simulates when Court.findOne returns null
    const consumerConfig = loadTemplateConfig('consumer_complaint')!;
    const ctx = buildPlaceholderContext(
      consumerConfig,
      {
        court_name: 'ranchi_dccdrc',
        state: 'jharkhand',
        court_type: 'consumer_commission',
        applicant_name: 'Test User',
        father_name: 'Test Father',
        applicant_age: 30,
        address: 'Ranchi',
        respondent_name: 'Test Corp',
        language: 'en',
        deficiency_details: 'Test deficiency',
        consideration_amount: 10000,
        purchase_date: '2026-01-01',
        invoice_number: 'INV-001',
        payment_mode: 'Cash',
        compensation_claimed: 5000,
        litigation_cost: 2000,
        territorial_basis: 'Ranchi',
        pecuniary_basis: 'Within limit',
        limitation_basis: 'Within time',
      },
      { advocateName: 'Test Adv', enrollmentNumber: 'TEST/001' },
    );
    // court_city should extract "Dccdrc" from the courtId (last segment), NOT print raw "ranchi_dccdrc"
    // More importantly, it should never contain underscores (raw courtId pattern)
    expect(ctx.court_city).not.toContain('_');
  });

  test('recursive placeholder pass: {current_year} in caseNomenclature resolves to current year (A2)', () => {
    // Simulates indian-courts.json caseNomenclature = "Cr. Misc. No. _____ of {current_year}"
    const courtData: CourtLookupData = {
      designation: 'IN THE HIGH COURT OF JUDICATURE AT JHARKHAND AT RANCHI',
      city: 'Ranchi',
      caseNomenclature: 'Cr. Misc. No. _____ of {current_year}',
      formattingRulesRef: 'jharkhand_hc',
      courtRule: loadCourtRule('jharkhand_hc') ?? undefined,
    };
    const ctx = buildPlaceholderContext(
      bailConfig,
      {
        court_name: 'jharkhand_hc_ranchi',
        state: 'jharkhand',
        court_type: 'high_court',
        applicant_name: 'Ramesh Singh',
        father_name: 'Laxman Singh',
        applicant_age: 35,
        address: 'Ranchi',
        fir_number: '10/2026',
        fir_date: '2026-04-01',
        police_station: 'PS Chanho',
        sections_charged: ['BNS 109'],
        currently_in_custody: 'no',
        custody_since: '',
        language: 'en',
        facts_narrative: 'Test facts',
        grounds_for_bail: ['no_prior_record'],
        respondent_name: 'State of Jharkhand',
        relief_sought: 'Anticipatory bail',
      },
      { advocateName: 'Adv Test', enrollmentNumber: 'JHC/99' },
      courtData,
    );
    const currentYear = String(new Date().getFullYear());
    // {current_year} inside case_nomenclature must be resolved — never literal
    expect(ctx.case_nomenclature).toContain(currentYear);
    expect(ctx.case_nomenclature).not.toContain('{current_year}');
    expect(ctx.case_nomenclature).not.toContain('{year}');
  });

  test('no unresolved {..} tokens survive in any rendered template section (A2)', () => {
    // Renders all template sections of bail_anticipatory with Jharkhand HC court data.
    // No {token} (other than deferred {body_para_count}) should appear in rendered output.
    const config = loadTemplateConfig('bail_anticipatory')!;
    const courtData: CourtLookupData = {
      designation: 'IN THE HIGH COURT OF JUDICATURE AT JHARKHAND AT RANCHI',
      city: 'Ranchi',
      caseNomenclature: 'Cr. Misc. No. _____ of {current_year}',
      formattingRulesRef: 'jharkhand_hc',
      courtRule: loadCourtRule('jharkhand_hc') ?? undefined,
    };
    const ctx = buildPlaceholderContext(
      config,
      {
        court_name: 'jharkhand_hc_ranchi',
        state: 'jharkhand',
        court_type: 'high_court',
        applicant_name: 'Ramesh Singh',
        father_name: 'Laxman Singh',
        applicant_age: 35,
        address: 'Ranchi',
        fir_number: '10/2026',
        fir_date: '2026-04-01',
        police_station: 'PS Chanho',
        sections_charged: ['BNS 109'],
        currently_in_custody: 'no',
        custody_since: '',
        language: 'en',
        facts_narrative: 'Test facts',
        grounds_for_bail: ['no_prior_record'],
        respondent_name: 'State of Jharkhand',
        relief_sought: 'Anticipatory bail',
      },
      { advocateName: 'Adv Test', enrollmentNumber: 'JHC/99' },
      courtData,
    );
    const templateSections = config.document_structure.sections.filter(
      (s) => s.type === 'template' && s.template,
    );
    for (const section of templateSections) {
      const rendered = section.template!.replace(/\{(\w+)\}/g, (_m: string, k: string) =>
        ctx[k] !== undefined ? ctx[k] : `{${k}}`,
      );
      // Only {body_para_count} is allowed to survive (deferred until after AI generation)
      const unresolved = [...rendered.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const nonDeferred = unresolved.filter((k) => k !== 'body_para_count');
      expect(nonDeferred).toHaveLength(0);
    }
  });
});

// ── SCRUM-62: sanitiseAIBody ─────────────────────────────────────────────────

describe('sanitiseAIBody', () => {
  test('strips sessions court cause-title block from body (A7)', () => {
    const dirty =
      'IN THE COURT OF SESSIONS JUDGE, RANCHI\n\n1. The applicant apprehends arrest.\n\n2. Facts follow.';
    const clean = sanitiseAIBody(dirty);
    expect(clean).not.toMatch(/IN THE COURT OF/i);
    expect(clean).toContain('1. The applicant apprehends arrest.');
    expect(clean).toContain('2. Facts follow.');
  });

  test('strips high court cause-title block from body (A7)', () => {
    const dirty = 'IN THE HIGH COURT OF JHARKHAND AT RANCHI\n\n1. Para one.\n\n2. Para two.';
    const clean = sanitiseAIBody(dirty);
    expect(clean).not.toMatch(/IN THE HIGH COURT/i);
    expect(clean).toContain('1. Para one.');
  });

  test('strips AI-assisted disclaimer from body (A6)', () => {
    const dirty =
      '1. Grounds for bail.\n\nAI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice.';
    const clean = sanitiseAIBody(dirty);
    expect(clean).not.toMatch(/AI[\s-]assisted draft/i);
    expect(clean).not.toMatch(/Lawie does not provide/i);
    expect(clean).toContain('1. Grounds for bail.');
  });

  test('strips DISCLAIMER: prefix block (A6)', () => {
    const dirty = '1. Facts.\n\nDISCLAIMER: This is an AI-generated draft.';
    const clean = sanitiseAIBody(dirty);
    expect(clean).not.toMatch(/^DISCLAIMER\s*:/im);
    expect(clean).toContain('1. Facts.');
  });

  test('passes clean body through unchanged', () => {
    const body =
      '1. The applicant is a resident of Ranchi.\n\n2. The FIR is false and frivolous.\n\n3. Relief is sought.';
    expect(sanitiseAIBody(body)).toBe(body);
  });

  test('handles body that has BOTH cause-title and disclaimer (A6 + A7 together)', () => {
    const dirty = [
      'IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA',
      '1. Body paragraph.',
      'AI-assisted draft — verify before filing.',
    ].join('\n\n');
    const clean = sanitiseAIBody(dirty);
    expect(clean).toBe('1. Body paragraph.');
  });
});

// ── SCRUM-64: BNS whitelist validator + fact↔section sanity ──────────────────

describe('extractBNSSectionNumbers', () => {
  test('extracts short form "BNS 103"', () => {
    expect(extractBNSSectionNumbers('under BNS 103 of the Act')).toContain('103');
  });

  test('extracts short form with sub-clause "BNS 103(1)"', () => {
    expect(extractBNSSectionNumbers('BNS 103(1) applies here')).toContain('103(1)');
  });

  test('extracts long form "Section 103 of BNS"', () => {
    expect(extractBNSSectionNumbers('Section 103 of BNS is applicable')).toContain('103');
  });

  test('extracts long form "Section 109 of Bharatiya Nyaya Sanhita"', () => {
    expect(
      extractBNSSectionNumbers('Section 109 of Bharatiya Nyaya Sanhita and Section 117 of BNS'),
    ).toEqual(expect.arrayContaining(['109', '117']));
  });

  test('returns empty array when no BNS sections found', () => {
    expect(extractBNSSectionNumbers('The applicant was arrested under BNSS 187.')).toHaveLength(0);
  });

  test('deduplicates repeated references', () => {
    const text = 'BNS 103 and again BNS 103 appear twice';
    const result = extractBNSSectionNumbers(text);
    expect(result.filter((n) => n === '103')).toHaveLength(1);
  });
});

describe('validateBNSWhitelist', () => {
  test('no warnings for valid First Schedule sections', () => {
    // 103 (Murder), 109 (Attempt), 117 (Grievous Hurt) are all in the First Schedule
    expect(validateBNSWhitelist(['103', '109', '117'])).toHaveLength(0);
  });

  test('flags a hallucinated section not in First Schedule (e.g. 400)', () => {
    const warnings = validateBNSWhitelist(['400']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('invalid_section');
    expect(warnings[0].message).toMatch(/400/);
    expect(warnings[0].message).toMatch(/whitelist/i);
  });

  test('flags multiple hallucinated sections while passing valid ones', () => {
    const warnings = validateBNSWhitelist(['103', '400', '450', '109']);
    expect(warnings).toHaveLength(2);
    const flagged = warnings.map((w) => w.details?.section);
    expect(flagged).toContain('400');
    expect(flagged).toContain('450');
  });

  test('returns empty array for empty input', () => {
    expect(validateBNSWhitelist([])).toHaveLength(0);
  });
});

describe('checkFactSectionSanity', () => {
  test('no warning when BNS 103 is cited and facts mention death', () => {
    const facts = 'The deceased was killed by the accused on 01/01/2025.';
    expect(checkFactSectionSanity(facts, ['103'])).toHaveLength(0);
  });

  test('flags BNS 103 when facts mention only injury, not death', () => {
    const facts = 'The accused beat the complainant with a stick causing injury.';
    const warnings = checkFactSectionSanity(facts, ['103']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('invalid_section');
    expect(warnings[0].message).toMatch(/109|117/);
    expect(warnings[0].details?.suggestedReplacement).toMatch(/BNS 109/);
  });

  test('flags BNS 103(1) sub-clause when facts lack death keywords', () => {
    const facts = 'Accused attacked the complainant causing grievous hurt.';
    const warnings = checkFactSectionSanity(facts, ['103(1)']);
    expect(warnings).toHaveLength(1);
  });

  test('no warning when BNS 109 is cited without death keywords', () => {
    // 109 = Attempt to Murder — does not require proven death
    const facts = 'Accused attempted to stab the complainant.';
    expect(checkFactSectionSanity(facts, ['109'])).toHaveLength(0);
  });

  test('no warning when no BNS sections cited at all', () => {
    expect(checkFactSectionSanity('any facts', [])).toHaveLength(0);
  });

  test('detects "deceased" as a death keyword', () => {
    const facts = 'The deceased was found at the scene.';
    expect(checkFactSectionSanity(facts, ['103'])).toHaveLength(0);
  });
});

// ── SCRUM-63: Duplicate-prefix normaliser (A8 fix) ───────────────────────────

describe('buildPlaceholderContext — police_station prefix dedup (A8)', () => {
  const minimalData = {
    currently_in_custody: 'yes_judicial',
    fir_number: '124/2026',
    fir_date: '15/03/2026',
    sections_charged: 'BNS 103',
    facts_narrative: 'Facts.',
    grounds_for_bail: ['false_implication'],
    applicant_name: 'Ram Kumar',
    father_name: 'Shyam Kumar',
  };

  test('strips leading "PS " so template "PS {police_station}" does not double-prefix (bail_anticipatory)', () => {
    const config = loadTemplateConfig('bail_anticipatory')!;
    const ctx = buildPlaceholderContext(config, { ...minimalData, police_station: 'PS Chanho' });
    // Value stored in ctx must NOT start with "PS " — template provides the prefix
    expect(ctx.police_station).toBe('Chanho');
  });

  test('strips leading "P.S. " variant', () => {
    const config = loadTemplateConfig('bail_anticipatory')!;
    const ctx = buildPlaceholderContext(config, { ...minimalData, police_station: 'P.S. Chanho' });
    expect(ctx.police_station).toBe('Chanho');
  });

  test('strips leading "Police Station " prefix', () => {
    const config = loadTemplateConfig('bail_anticipatory')!;
    const ctx = buildPlaceholderContext(config, {
      ...minimalData,
      police_station: 'Police Station Chanho',
    });
    expect(ctx.police_station).toBe('Chanho');
  });

  test('plain name without prefix passes through unchanged', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(config, { ...minimalData, police_station: 'Chanho' });
    expect(ctx.police_station).toBe('Chanho');
  });

  test('rendered prayer for bail_anticipatory never contains "PS PS"', () => {
    const config = loadTemplateConfig('bail_anticipatory')!;
    const prayerSection = config.document_structure.sections.find(
      (s) => s.section_id === 'prayer',
    )!;
    const ctx = buildPlaceholderContext(config, { ...minimalData, police_station: 'PS Chanho' });
    const rendered = renderTemplateSection(prayerSection, ctx);
    expect(rendered.content).not.toContain('PS PS');
    expect(rendered.content).toMatch(/PS Chanho/);
  });

  test('rendered prayer for bail_regular never contains "PS PS"', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const prayerSection = config.document_structure.sections.find(
      (s) => s.section_id === 'prayer',
    )!;
    const ctx = buildPlaceholderContext(config, {
      ...minimalData,
      police_station: 'PS Kotwali',
      currently_in_custody: 'yes_judicial',
      bail_section: '480',
      bail_type_label: 'Regular Bail',
    });
    const rendered = renderTemplateSection(prayerSection, ctx);
    expect(rendered.content).not.toContain('PS PS');
    expect(rendered.content).toMatch(/PS Kotwali/);
  });
});
