/**
 * T-471 round 3: the s.141 / notice_to / demand_heading computed fields of legal_notice_s138 are
 * label maps, not court provisions. courtProvisions() (brief-drafter) must return nothing for them,
 * so the advocate sees no bogus "could not state the provision for this kind of court" warning.
 * Also pins the signed placeholder text for the proprietor and for blank role / designation.
 * No model call and no database.
 */
import './setupEnv';

import { checkCourtProvisions, courtProvisions } from '../services/brief-drafter';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';

const PACK = 'legal_notice_s138';
const BASE: Record<string, string> = {
  applicant_name: 'Suresh Gupta',
  applicant_address: '12 Karol Bagh, Delhi',
  respondent_name: 'Demo Traders',
  respondent_address: '5 Lajpat Nagar, Delhi',
  advocate_name: 'A. Advocate',
  advocate_address: 'Chamber 3, Tis Hazari',
  cheque_number: '123456',
  cheque_date: '2026-05-01',
  cheque_amount: '3,00,000',
  amount_in_words: 'Three Lakh',
  drawee_bank: 'SBI',
  drawee_branch: 'Karol Bagh',
  dishonour_date: '2026-05-10',
};
const WATCHED = /^(s141_|notice_to$|demand_heading$)/;

function run(form: Record<string, unknown>) {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const ctx = buildPlaceholderContext(config, { ...BASE, ...form });
  const provisions = courtProvisions(config, ctx);
  const text = config.document_structure.sections
    .filter((s) => s.type === 'template')
    .map((s) => replacePlaceholders(s.template as string, ctx))
    .join('\n');
  return { config, ctx, provisions, text };
}

const FORMS: Array<[string, Record<string, unknown>]> = [
  [
    'company, 3 persons',
    {
      respondent_type: 'company',
      drawer_signatory_capacity: 'director',
      s141_person_1_name: 'Ravi Sharma',
      s141_person_1_designation: 'Managing Director',
      s141_person_1_role: 'head of sales',
      s141_person_2_name: 'Sita Rao',
      s141_person_2_designation: 'Director',
      s141_person_3_name: 'Mohan Das',
    },
  ],
  [
    'partnership, 2 persons',
    {
      respondent_type: 'partnership',
      drawer_signatory_capacity: 'partner',
      s141_person_1_name: 'Ravi Sharma',
      s141_person_1_designation: 'Partner',
      s141_person_2_name: 'Sita Rao',
    },
  ],
  ['company, no persons', { respondent_type: 'company' }],
  ['proprietorship', { respondent_type: 'proprietorship', drawer_proprietor: 'Anil Gupta' }],
  ['unanswered', {}],
];

describe('T-471 round 3: s141 / notice_to / demand_heading are not court provisions', () => {
  it('the pack keeps these computed fields and none is a value_map', () => {
    const { config } = run({});
    const names = Object.keys(config.computed_fields).filter((k) => WATCHED.test(k));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(config.computed_fields[n].value_map).toBeUndefined();
  });

  it.each(FORMS)('%s: no court provision entry for them', (_n, form) => {
    const { provisions } = run(form);
    expect(provisions.filter((p) => WATCHED.test(p.field))).toEqual([]);
  });

  it.each(FORMS)('%s: checkCourtProvisions raises no warning for them', (_n, form) => {
    const { provisions, text } = run(form);
    const warnings = checkCourtProvisions(text, provisions);
    const bogus = warnings.filter((w) =>
      WATCHED.test(String((w.details as { field?: string } | undefined)?.field ?? '')),
    );
    expect(bogus).toEqual([]);
  });

  it.each(FORMS.slice(0, 2))('%s: the s141 fields still resolve to non-empty text', (_n, form) => {
    const { ctx } = run(form);
    expect(ctx.notice_to).toMatch(/Ravi Sharma/);
    expect(ctx.demand_heading).toBeTruthy();
  });
});

describe('T-471 round 3: signed text is unchanged', () => {
  it('proprietor: "X, proprietor of Firm", no s.141, no Accused paragraph', () => {
    const { text } = run({ respondent_type: 'proprietorship', drawer_proprietor: 'Anil Gupta' });
    expect(text).toContain('Anil Gupta, proprietor of Demo Traders');
    expect(text).not.toContain('141');
    expect(text).not.toContain('Accused');
    expect(text).not.toContain('deemed to be guilty');
  });

  it.each(FORMS)('%s: the notice never says "Accused" or "deemed to be guilty"', (_n, form) => {
    const { text } = run(form);
    expect(text).not.toContain('Accused');
    expect(text).not.toContain('deemed to be guilty');
  });

  it('blank role and blank designation print the signed placeholders, exactly', () => {
    const { text } = run({ respondent_type: 'company', s141_person_1_name: 'Ravi Sharma' });
    expect(text).toContain(
      'being its [To be confirmed: designation of Ravi Sharma] and ' +
        '[To be confirmed: role of Ravi Sharma in the conduct of the business], ' +
        'and shall be liable under Section 141 of the Negotiable Instruments Act, 1881 if the amount ' +
        'is not paid within 15 days of receipt of this notice.',
    );
    expect(text).toContain('2. Ravi Sharma, [To be confirmed: designation of Ravi Sharma]');
  });
});
