/**
 * T-146 — a bail application before a Magistrate names the court and the
 * applicant the advocate gave. Legal sign-off: AJ-2026-10-07-T146 (+ -golden, -golden-2).
 *
 * Criterion 1 (CJM Patna), 2 (JMFC Patna), 3 (system-owned placeholders are never
 * a user message), 5 (placeholder coverage over every document rule).
 * Criterion 4 (blank count) is apps/web countBlanks; apps/web has no jest config.
 * Criterion 6 (real-model run) is not a unit test.
 */
import './setupEnv';

import { leakedPlaceholderWarnings } from '../services/ai.service';
import { loadAllDocRules } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  CourtLookupData,
  detectLeakedPlaceholders,
  loadCourtRule,
  renderTemplateSection,
  sectionContext,
  TemplateConfig,
} from '../services/template-engine.service';

const { configs, byFile } = loadAllDocRules();
const bail = configs.get(byFile.get('bail_before_magistrate.json')!.template_id) as TemplateConfig;

const COURTS: Record<string, { designation: string; ref: string; type: string; id: string }> = {
  cjm: {
    id: 'bihar_cjm_patna',
    designation: 'IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA',
    ref: 'cjm_generic',
    type: 'cjm',
  },
  jmfc: {
    id: 'bihar_jmfc_patna',
    designation: 'IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS, PATNA',
    ref: 'jmfc_generic',
    type: 'jmfc',
  },
};

function courtData(key: string): CourtLookupData {
  const c = COURTS[key];
  return {
    designation: c.designation,
    city: 'Patna',
    caseNomenclature: 'Criminal Case No. _____ of {current_year}',
    formattingRulesRef: c.ref,
    courtType: c.type,
    courtRule: loadCourtRule(c.ref) ?? undefined,
  };
}

/**
 * Keys the scenario may carry that are not form_schema fields: system keys only.
 * Criterion 1's jail part is NOT MET: the Magistrate pack has no custody or jail
 * field, so the CJM/JMFC scenario cannot give one (follow-up ticket). The scenario
 * therefore carries no custody/jail key; custody cases below pass them explicitly.
 */
// court_name: the courts-list choice the intake makes (resolved to courtData); court_designation: the intake stub.
const SYSTEM_KEYS = new Set(['court_name', 'court_designation']);

function formData(key: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    applicant_name: 'Ramesh Kumar',
    applicant_parentage: 'Suresh Kumar',
    applicant_age: '34',
    state: 'bihar',
    court_name: COURTS[key].id,
    fir_number: '12/2026',
    fir_date: '2026-09-01',
    police_station: 'Kotwali',
    // what the stubbed intake leaves for the court field (a visible blank)
    court_designation: '[To be confirmed: court designation (magistrate / cjm)]',
    ...extra,
  };
}

function renderAll(key: string, extra: Record<string, unknown> = {}): Record<string, string> {
  const ctx = buildPlaceholderContext(
    bail,
    formData(key, extra),
    { advocateName: 'Adv. A' },
    courtData(key),
  );
  const out: Record<string, string> = {};
  for (const s of bail.document_structure.sections) {
    if (s.type === 'template' && s.template)
      out[s.section_id] = renderTemplateSection(s, ctx).content;
  }
  return out;
}

describe.each([
  ['cjm', 'CHIEF JUDICIAL MAGISTRATE, PATNA'],
  ['jmfc', 'JUDICIAL MAGISTRATE FIRST CLASS, PATNA'],
])('T-146 criteria 1-2: bail before Magistrate, %s Patna', (key, courtName) => {
  const out = renderAll(key);
  const all = Object.values(out).join('\n');

  it('prints the court heading exactly once, never doubled', () => {
    expect(out.cause_title.startsWith(`IN THE COURT OF ${courtName}`)).toBe(true);
    expect(all.split(`IN THE COURT OF ${courtName}`)).toHaveLength(2);
    expect(all).not.toMatch(/IN THE COURT OF\s+IN THE/);
    expect(all).not.toMatch(/IN THE COURT OF\s*(_{3,}|\n)/);
  });

  it('names the applicant in the cause title, the prayer and the verification', () => {
    expect(out.cause_title).toContain('Ramesh Kumar ... Applicant/Accused');
    expect(out.prayer).toContain('Release the applicant Ramesh Kumar on bail');
    expect(out.verification).toContain('I, Ramesh Kumar');
  });

  it('puts the father and age in the verification, with no custody clause (jail part of criterion 1 not met: follow-up)', () => {
    expect(out.verification).toContain('S/o Suresh Kumar');
    expect(out.verification).toContain('aged about 34 years, do hereby verify');
    expect(out.verification).not.toMatch(/custody/i);
    expect(all).not.toContain('[To be confirmed: name of jail]');
  });

  it('fixture guard: every scenario key is a bail_before_magistrate form field or a system key', () => {
    const fields = new Set(bail.form_schema.steps.flatMap((st) => st.fields.map((f) => f.field_id)));
    const stray = Object.keys(formData(key)).filter((k) => !fields.has(k) && !SYSTEM_KEYS.has(k));
    expect(stray).toEqual([]);
  });

  it('reads Place: Patna and addresses the right court', () => {
    expect(out.advocate_block).toContain('Place: Patna');
    expect(out.addressing_clause).toContain(`THE HON’BLE ${courtName}`);
    expect(out.addressing_clause).not.toMatch(/_{3,}/);
  });

  it('leaves no underscore blank except the case number and signature lines', () => {
    const stripped = all
      .replace(/Criminal Case No\. _____ of \d{4}/, '')
      .replace(/___ day of __________, 20___/, '')
      .replace(/^[ \t]*_{3,}[ \t]*$/gm, '')
      .replace(/Enrollment No\. _{3,}/, '');
    expect(stripped).not.toMatch(/_{3,}/);
    expect(all.replace(/\{body_para_count\}/g, '')).not.toMatch(/\{\w+\}/);
  });

  it('the cause title, prayer and verification have no unfilled placeholder', () => {
    const ctx = buildPlaceholderContext(bail, formData(key), { advocateName: 'A' }, courtData(key));
    for (const s of bail.document_structure.sections) {
      if (s.type === 'template' && s.template) {
        expect(detectLeakedPlaceholders(s.template, sectionContext(s, ctx))).toEqual([]);
      }
    }
  });
});

describe('T-146 verification: jail, custody clause and date', () => {
  it('shows a visible blank for the jail when none is given', () => {
    const out = renderAll('cjm', { currently_in_custody: 'yes_judicial' });
    expect(out.verification).toContain(
      'currently in judicial custody at [To be confirmed: name of jail]',
    );
  });

  it.each([
    ['not given', {}],
    ['No', { currently_in_custody: 'No' }],
    [
      'an arrest date alone',
      { currently_in_custody: undefined, arrest_date: '2026-09-02', days_in_custody: '30' },
    ],
  ])('omits the custody clause when custody is %s', (_label, extra) => {
    const base = formData('cjm');
    const ctx = buildPlaceholderContext(
      bail,
      { ...base, ...extra },
      { advocateName: 'A' },
      courtData('cjm'),
    );
    const verification = bail.document_structure.sections.find(
      (s) => s.section_id === 'verification',
    )!;
    const text = renderTemplateSection(verification, ctx).content;
    expect(text).not.toMatch(/custody/i);
    expect(text).not.toContain('jail');
    expect(text).toContain('aged about 34 years, do hereby verify');
  });

  it.each(['yes_judicial', 'Yes — Judicial custody', 'yes — in judicial custody', 'Judicial custody'])(
    'adds the custody clause for %p',
    (v) => {
      const out = renderAll('cjm', { currently_in_custody: v, jail_name: 'Beur Jail' });
      expect(out.verification).toContain(
        'aged about 34 years, currently in judicial custody at Beur Jail, do hereby',
      );
    },
  );

  it.each([
    'Yes — Police custody',
    'yes_police',
    'Yes',
    'No — anticipating arrest',
    'not in judicial custody',
  ])('adds no custody clause for %p', (v) => {
    const out = renderAll('cjm', { currently_in_custody: v, jail_name: 'Beur Jail' });
    expect(out.verification).not.toMatch(/custody/i);
    expect(out.verification).not.toContain('Beur Jail');
    expect(out.verification).toContain('aged about 34 years, do hereby verify');
  });

  it('leaves the verification date blank unless the advocate gave one', () => {
    expect(renderAll('cjm').verification).toContain(
      'Verified at Patna on this ___ day of __________, 20___.',
    );
    expect(renderAll('cjm', { verification_date: '12 October 2026' }).verification).toContain(
      'on this 12 October 2026.',
    );
  });

  it('keeps the paragraph count as the deferred token for the later pass', () => {
    expect(renderAll('cjm').verification).toContain('paragraphs 1 to {body_para_count}');
  });
});

describe('T-146 criterion 3: system-owned placeholders are never a user message', () => {
  const userFieldIds = new Set(
    bail.form_schema.steps.flatMap((st) => st.fields.map((f) => f.field_id)),
  );

  it('an empty context reports only keys the user is asked for', () => {
    const warnings = leakedPlaceholderWarnings(bail, {});
    for (const w of warnings) {
      const key = (w.details as { clauseId: string }).clauseId;
      expect(userFieldIds.has(key)).toBe(true);
    }
    const text = warnings.map((w) => w.message).join('\n');
    for (const system of [
      'courtDesignation',
      'caseNomenclature',
      'applicant}',
      'parentName',
      'place}',
      'lastParagraph',
      'jail}',
    ]) {
      expect(text).not.toContain(`{${system.replace('}', '')}}`);
    }
  });

  it('a field the user is asked for is still reported when unfilled', () => {
    const tpl = JSON.parse(JSON.stringify(bail)) as TemplateConfig;
    const section = tpl.document_structure.sections.find(
      (s) => s.type === 'template' && s.template,
    )!;
    section.template = 'Station: {police_station}. Court: {courtDesignation}. Zzz: {not_a_field}.';
    const w = leakedPlaceholderWarnings(tpl, {});
    const keys = w.map((x) => (x.details as { clauseId: string }).clauseId);
    expect(keys).toContain('police_station');
    expect(keys).not.toContain('courtDesignation');
    expect(keys).not.toContain('not_a_field');
  });

  it('with the full bail context there is no warning at all', () => {
    const ctx = buildPlaceholderContext(
      bail,
      formData('cjm'),
      { advocateName: 'A' },
      courtData('cjm'),
    );
    expect(leakedPlaceholderWarnings(bail, ctx)).toEqual([]);
  });
});

describe('T-146 alias order: aliases read the final court-rule value', () => {
  it.each(['cjm', 'jmfc'])('{caseNomenclature} equals {case_nomenclature} for %s', (key) => {
    const data = { ...courtData(key), caseNomenclature: 'DB Nomenclature No. __ of {year}' };
    const ctx = buildPlaceholderContext(bail, formData(key), { advocateName: 'A' }, data);
    expect(ctx.case_nomenclature).toMatch(/^Criminal Case No\. _____ of \d{4}$/);
    expect(ctx.caseNomenclature).toBe(ctx.case_nomenclature);
    const s = { section_id: 'x', type: 'template', template: '{caseNomenclature}|{case_nomenclature}' };
    const [a, b] = renderTemplateSection(s as never, ctx).content.split('|');
    expect(a).toBe(b);
    expect(a).not.toContain('DB Nomenclature');
  });
});

describe('T-146 warnings for aliases', () => {
  function withTemplate(text: string): TemplateConfig {
    const tpl = JSON.parse(JSON.stringify(bail)) as TemplateConfig;
    const sections = tpl.document_structure.sections.filter((s) => s.type === 'template' && s.template);
    sections.forEach((s, i) => {
      s.template = i === 0 ? text : 'plain';
    });
    return tpl;
  }
  const label = bail.form_schema.steps
    .flatMap((st) => st.fields)
    .find((f) => f.field_id === 'applicant_name')!.label as string;

  it('an unfilled {applicant} warns once under applicant_name with the label', () => {
    const w = leakedPlaceholderWarnings(withTemplate('I, {applicant}.'), {});
    expect(w).toHaveLength(1);
    expect((w[0].details as { clauseId: string }).clauseId).toBe('applicant_name');
    expect(w[0].message).toContain(label);
    expect(w[0].message).not.toContain('{applicant}');
  });

  it('{applicant} and {applicant_name} in one section give exactly one warning', () => {
    const w = leakedPlaceholderWarnings(withTemplate('{applicant} / {applicant_name}'), {});
    expect(w).toHaveLength(1);
    expect((w[0].details as { clauseId: string }).clauseId).toBe('applicant_name');
  });

  it('{courtDesignation} is never named in a warning', () => {
    // FINDING: court_designation IS a bail_before_magistrate form_schema field, so an
    // unfilled {courtDesignation} warns once under court_designation (the alias rule),
    // not "none" as the handoff expected. Asserted: the alias itself is never shown.
    const w = leakedPlaceholderWarnings(withTemplate('{courtDesignation}'), {});
    expect(w.map((x) => x.message).join('\n')).not.toContain('{courtDesignation}');
    expect(w.map((x) => (x.details as { clauseId: string }).clauseId)).toEqual(['court_designation']);
  });
});

// Criterion 4 (countBlanks counts the signing-date blank once) lives in apps/web,
// which has no test runner and cannot be imported from drafting: not tested here.

describe('T-146 criterion 5: placeholder coverage of every document rule', () => {
  const SECTIONS = ['cause_title', 'prayer', 'verification'];

  /** Placeholders the engine cannot fill, per rule file, rendered with every form field given. */
  function unfillable(): Record<string, string[]> {
    const found: Record<string, string[]> = {};
    for (const [file, { template_id }] of byFile) {
      const cfg = configs.get(template_id)!;
      const fd: Record<string, unknown> = {};
      for (const st of cfg.form_schema.steps) for (const f of st.fields) fd[f.field_id] = 'X';
      fd.state = 'bihar';
      const ctx = buildPlaceholderContext(
        cfg,
        fd,
        { advocateName: 'Adv. A', enrollmentNumber: 'ENR-1' },
        courtData('cjm'),
      );
      const miss = new Set<string>();
      for (const s of cfg.document_structure.sections) {
        if (s.type !== 'template' || !s.template || !SECTIONS.includes(s.section_id)) continue;
        for (const k of detectLeakedPlaceholders(s.template, sectionContext(s, ctx))) {
          miss.add(`${s.section_id}:${k}`);
        }
      }
      if (miss.size) found[file] = [...miss].sort();
    }
    return found;
  }

  /**
   * Known gaps in OTHER document rules, recorded here and reported to the lead —
   * not fixed in T-146. Shrinking this list is good; a new entry fails the test.
   */
  const KNOWN_UNFILLABLE_OTHER_RULES: Record<string, string[]> = {
    'affidavit_identity.json': ['cause_title:city'],
    'affidavit_in_support.json': [
      'cause_title:petitioner',
      'cause_title:petitionerRole',
      'cause_title:respondent',
      'cause_title:respondentRole',
    ],
    'amendment_of_pleadings.json': ['cause_title:respondent'],
    'bail_anticipatory.json': [
      'cause_title:respondent',
      'prayer:firDetails',
      'verification:parentName',
      'verification:relation',
    ],
    'bail_cancellation.json': [
      'cause_title:petitioner',
      'cause_title:respondent',
      'prayer:respondent',
      'verification:address',
      'verification:age',
      'verification:petitioner',
    ],
    'bail_regular.json': [
      'cause_title:respondent',
      'prayer:firDetails',
      'verification:parentName',
      'verification:relation',
    ],
    'cat_oa.json': ['prayer:impugned_order_date', 'prayer:impugned_order_no'],
    'condonation_of_delay.json': ['cause_title:respondent'],
    'consumer_complaint.json': [
      'cause_title:respondent',
      'prayer:amount',
      'prayer:compensationAmount',
      'prayer:litigationCost',
      'verification:parentName',
      'verification:relation',
    ],
    'criminal_appeal.json': [
      'cause_title:appellant',
      'cause_title:respondent',
      'prayer:applicable_section',
    ],
    'criminal_revision.json': [
      'cause_title:petitioner',
      'cause_title:respondent',
      'prayer:applicable_section',
      'prayer:case_details',
    ],
    'discharge_application.json': ['cause_title:accused'],
    'divorce_hma.json': ['cause_title:petitioner', 'cause_title:respondent'],
    'divorce_mutual_consent.json': [
      'cause_title:petitioner1',
      'cause_title:petitioner2',
      'prayer:section_citation',
      'prayer:waiver_prayer_if_applicable',
    ],
    'divorce_sma.json': ['cause_title:petitioner', 'cause_title:respondent'],
    'dv_act_complaint.json': ['cause_title:aggrievedPerson', 'cause_title:respondent'],
    'fir_quashing.json': ['cause_title:complainant', 'cause_title:petitioner'],
    'guardianship_petition.json': [
      'cause_title:petitioner',
      'cause_title:respondent',
      'prayer:parent_names',
    ],
    'habeas_corpus.json': ['cause_title:petitioner', 'cause_title:respondents_list'],
    'ibc_application.json': [
      'prayer:irp_ibbi_number',
      'verification:applicant_authorised_rep_name',
      'verification:authorisation_reference',
    ],
    'interim_bail.json': ['verification:address'],
    'itat_appeal.json': [
      'cause_title:appellant',
      'cause_title:respondent',
      'verification:appellant_or_authorised_signatory_name',
    ],
    'judicial_separation.json': [
      'cause_title:petitioner',
      'cause_title:respondent',
      'prayer:section_citation',
    ],
    'mact_claim.json': [
      'cause_title:claimant_list',
      'cause_title:district',
      'cause_title:tribunalPlace',
      'verification:claimant_primary_name',
    ],
    'maintenance_bnss_144.json': ['cause_title:respondent'],
    'memo_of_parties.json': ['cause_title:seat'],
    'mou.json': ['cause_title:date'],
    'pil.json': [
      'cause_title:petitioner',
      'cause_title:respondents_list',
      'prayer:primary_relief',
      'prayer:subject_matter',
    ],
    'plaint_declaration.json': ['cause_title:defendant', 'cause_title:plaintiff'],
    'plaint_eviction.json': [
      'cause_title:defendant',
      'cause_title:plaintiff',
      'prayer:arrears_from',
    ],
    'plaint_injunction.json': [
      'cause_title:defendant',
      'cause_title:plaintiff',
      'prayer:mandatory_act',
    ],
    'plaint_recovery.json': ['cause_title:defendant', 'cause_title:plaintiff'],
    'plaint_specific_performance.json': ['cause_title:defendant', 'cause_title:plaintiff'],
    'posh_complaint.json': [
      'cause_title:aggrieved_woman',
      'cause_title:workplaceName',
      'prayer:specific_final_relief',
      'prayer:specific_interim_relief',
    ],
    'production_of_documents.json': ['cause_title:respondent'],
    'quashing_528_bnss.json': [
      'cause_title:complainant',
      'cause_title:petitioner',
      'cause_title:prosecuting_agency',
      'prayer:district',
      'prayer:fir_date',
      'prayer:fir_number',
      'prayer:police_station',
      'prayer:special_acts',
    ],
    'rcr_petition.json': ['cause_title:petitioner', 'cause_title:respondent'],
    'receiver_appointment.json': ['cause_title:respondent'],
    'replication.json': ['cause_title:defendant', 'cause_title:plaintiff'],
    'rera_complaint.json': [
      'cause_title:complainant',
      'cause_title:rera_office_location',
      'cause_title:respondents_list',
      'prayer:commencement_date',
      'verification:complainant_primary_name',
    ],
    'review_petition.json': [
      'cause_title:originalCourtHeader',
      'cause_title:petitioner',
      'prayer:scope_of_review',
    ],
    'slp.json': [
      'cause_title:hc_case_no',
      'cause_title:hc_name',
      'cause_title:petitioner',
      'prayer:hc_case_no',
      'prayer:hc_name',
    ],
    'surrender_application.json': ['verification:address', 'verification:occupation'],
    'suspension_of_sentence.json': [
      'cause_title:appellant',
      'prayer:appellant',
      'verification:age',
      'verification:appellant',
      'verification:parentName',
    ],
    'temporary_injunction_o39.json': ['cause_title:defendant', 'cause_title:plaintiff'],
    'vakalatnama.json': [
      'cause_title:client',
      'cause_title:clientRole',
      'cause_title:opposingParty',
      'cause_title:opposingRole',
    ],
    'will.json': ['cause_title:date'],
    'writ_petition_civil.json': [
      'cause_title:petitioner',
      'prayer:impugned_order_brief',
      'prayer:positive_relief',
      'prayer:writ_type_primary',
    ],
    'writ_petition_criminal.json': [
      'cause_title:petitioner',
      'prayer:compensation_amount',
      'prayer:incident_brief',
      'prayer:officials_named',
      'prayer:primary_direction',
    ],
    'written_statement.json': ['cause_title:defendant', 'cause_title:plaintiff'],
  };

  it('bail_before_magistrate has no placeholder the engine cannot fill', () => {
    expect(unfillable()['bail_before_magistrate.json']).toBeUndefined();
  });

  it('no other document rule has an unfillable placeholder beyond the recorded list', () => {
    const { 'bail_before_magistrate.json': _bail, ...others } = unfillable();
    const unexpected: string[] = [];
    for (const [file, keys] of Object.entries(others)) {
      for (const k of keys) {
        if (!(KNOWN_UNFILLABLE_OTHER_RULES[file] ?? []).includes(k))
          unexpected.push(`${file} ${k}`);
      }
    }
    expect(unexpected).toEqual([]);
  });
});
