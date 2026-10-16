/**
 * T-483 (B): an age in the draft is checked against the brief's ages, not read as a
 * period (Ajay, bd33120b). Real periods are still checked.
 */
import { checkPeriods } from '../services/brief-drafter';
import type { Brief, BriefItem } from '../services/intake-brief';

const item = (key: string, value: string | null): BriefItem =>
  ({
    key,
    part: 'facts',
    label: key,
    kind: 'text',
    required: false,
    options: [],
    value,
    source: value === null ? null : 'user',
  }) as unknown as BriefItem;

const briefOf = (...items: BriefItem[]): Brief => ({ items }) as unknown as Brief;

const ageWarning = (words: string) =>
  `The draft states an age that is not in your brief: ${words}. Check it before use.`;
const periodWarning = (words: string) =>
  `The draft states a period that is not in your brief: ${words}. Check it before use.`;

describe('T-483 checkPeriods: ages versus periods', () => {
  it('allows "aged 72 years" when the description says "elderly mother aged 72" (Anushka)', () => {
    const description = 'My elderly mother aged 72 was arrested.';
    expect(
      checkPeriods(
        'The accused, aged 72 years, is a resident of Dhanbad.',
        [description],
        briefOf(),
      ),
    ).toEqual([]);
  });

  it('flags "aged about 72 years" with the exact age warning when the brief has no age', () => {
    const found = checkPeriods('The applicant, aged about 72 years, is unwell.', [], briefOf());
    expect(found).toEqual([
      {
        type: 'fact_alteration',
        message: ageWarning('72 years'),
        details: { field: 'age', expected: '72 years' },
      },
    ]);
    expect(found[0].message).toBe(
      'The draft states an age that is not in your brief: 72 years. Check it before use.',
    );
  });

  it('flags "45 years of age" when 45 is only an FIR number', () => {
    const brief = briefOf(item('fir_number', '45'));
    const found = checkPeriods('The applicant, 45 years of age, is in custody.', [], brief);
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe(ageWarning('45 years'));
    expect(found[0].details).toEqual({ field: 'age', expected: '45 years' });
  });

  it('allows an applicant_age of "45" with "45 years old"', () => {
    const brief = briefOf(item('applicant_age', '45'));
    expect(checkPeriods('The applicant is 45 years old.', [], brief)).toEqual([]);
  });

  it('allows "60-year-old" when the brief says "sixty years old"', () => {
    expect(
      checkPeriods(
        'The 60-year-old applicant is unwell.',
        ['The deponent is sixty years old.'],
        briefOf(),
      ),
    ).toEqual([]);
  });

  it('reports only the custody period for "aged 72 years and in custody for 72 years" with brief "aged 72"', () => {
    const found = checkPeriods(
      'The applicant, aged 72 years and in custody for 72 years, seeks bail.',
      ['The applicant is aged 72.'],
      briefOf(),
    );
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe(periodWarning('72 years'));
    expect(found[0].details).toEqual({ field: 'period', expected: '72 years' });
  });

  it('still flags "custody for 3 years" when nothing in the brief gives it', () => {
    const found = checkPeriods('The applicant has been in custody for 3 years.', [], briefOf());
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe(periodWarning('3 years'));
    expect(found[0].details).toEqual({ field: 'period', expected: '3 years' });
  });

  it('still flags "within 15 days" as a period', () => {
    const found = checkPeriods('Reply was due within 15 days.', [], briefOf());
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe(periodWarning('15 days'));
    expect(found[0].details).toEqual({ field: 'period', expected: '15 days' });
  });

  it('keeps the existing pin: "aged 34 years" with an age field of 34 raises nothing', () => {
    expect(
      checkPeriods(
        'The applicant, aged 34 years, is a resident of Dhanbad.',
        [],
        briefOf(item('age', '34')),
      ),
    ).toEqual([]);
  });

  it('raises an age once, however often it is repeated', () => {
    const found = checkPeriods('Aged 80 years. Again, aged 80 years.', [], briefOf());
    expect(found).toHaveLength(1);
  });
});
