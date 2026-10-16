// T-481: withDeclinedAnswers marks an advocate's own "No" on a Yes/No item the service left empty.
import { withDeclinedAnswers, type Brief, type BriefItem, type GivenValue } from '../briefTypes';

const item = (over: Partial<BriefItem> = {}): BriefItem => ({
  key: 'willingness_to_furnish_bond',
  part: 'facts',
  label: 'Bond',
  kind: 'choice',
  required: false,
  options: ['Yes', 'No'],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[B]',
  party_name: false,
  ...over,
});
const brief = (...items: BriefItem[]): Brief => ({
  kind: { id: 'bail', name: 'Bail', court_document: false },
  court: { state: null, court_type: null, court: null },
  items,
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
});
const given = (value: GivenValue['value'], source: GivenValue['source'] = 'user'): GivenValue[] => [
  { key: 'willingness_to_furnish_bond', value, source, label: 'Bond' } as GivenValue,
];

describe('withDeclinedAnswers', () => {
  it('marks an empty Yes/No item the advocate answered No', () => {
    const out = withDeclinedAnswers(brief(item()), given('No'));
    expect(out.items[0].asked_empty).toBe(true);
    expect(out.items[0].value).toBeNull();
  });
  it('folds case and punctuation, in the value and in the options', () => {
    const out = withDeclinedAnswers(brief(item({ options: ['yes', 'NO.'] })), given(' no. '));
    expect(out.items[0].asked_empty).toBe(true);
  });
  it('leaves the same object when nothing applies', () => {
    const b = brief(item());
    expect(withDeclinedAnswers(b, given('Yes'))).toBe(b);
    expect(withDeclinedAnswers(b, [])).toBe(b);
  });
  it('ignores a No that did not come from the advocate', () => {
    const b = brief(item());
    expect(withDeclinedAnswers(b, given('No', 'description'))).toBe(b);
  });
  it('never changes a value the service placed or an item already asked_empty', () => {
    const placed = brief(item({ value: 'Yes', source: 'user' }));
    expect(withDeclinedAnswers(placed, given('No'))).toBe(placed);
    const asked = brief(item({ asked_empty: true }));
    expect(withDeclinedAnswers(asked, given('No'))).toBe(asked);
  });
  it('ignores items that are not exactly a Yes/No choice', () => {
    const three = brief(item({ options: ['Yes', 'No', 'Maybe'] }));
    expect(withDeclinedAnswers(three, given('No'))).toBe(three);
    const text = brief(item({ kind: 'text', options: [] }));
    expect(withDeclinedAnswers(text, given('No'))).toBe(text);
    const other = brief(item({ options: ['Issued', 'No'] }));
    expect(withDeclinedAnswers(other, given('No'))).toBe(other);
  });
  it('leaves a Yes/No item with another key untouched', () => {
    const other = brief(item({ key: 'is_first_offender' }));
    const g = [
      { key: 'is_first_offender', value: 'No', source: 'user', label: 'x' },
    ] as GivenValue[];
    expect(withDeclinedAnswers(other, g)).toBe(other);
  });
  it('acts on a key with a dotted prefix by its last segment', () => {
    const dotted = brief(item({ key: 'facts.willingness_to_furnish_bond' }));
    const g = [
      { key: 'facts.willingness_to_furnish_bond', value: 'No', source: 'user', label: 'x' },
    ] as GivenValue[];
    expect(withDeclinedAnswers(dotted, g).items[0].asked_empty).toBe(true);
  });
  it('leaves an item the service re-asks (reask) untouched', () => {
    const re = brief(item({ reask: true }));
    expect(withDeclinedAnswers(re, given('No'))).toBe(re);
  });
});
