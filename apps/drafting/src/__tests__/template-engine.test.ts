/**
 * Unit tests for the config-driven template engine (SCRUM-43).
 *
 * Tests: config loading, computed fields, placeholder replacement,
 * AI prompt building, document assembly, form validation, show_if.
 */
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
    expect(prompt).toContain('Do NOT generate cause title');
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
});
