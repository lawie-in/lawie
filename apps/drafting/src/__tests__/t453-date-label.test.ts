/**
 * T-453 round 2 — normalizeDate strips a short leading label before matching.
 * packages/shared has no test runner, so this lives in drafting. The whole span
 * is tried first; the label path runs only when the whole span is no date.
 */
import { compareDates, normalizeDate } from '@lawie/shared';

const REF = { referenceYear: 2026 };

describe('normalizeDate: leading label', () => {
  it.each([
    ['remand 4 June 2026', '2026-06-04'],
    ['FIR dated 12.03.2026', '2026-03-12'],
    ['on 4th June, 2026', '2026-06-04'],
    ['w.e.f. 1/4/2026', '2026-04-01'],
    ['Date of remand: 4 June 2026', '2026-06-04'],
    ['remand 4/6/26', '2026-06-04'],
  ])('%s -> %s', (input, value) => {
    expect(normalizeDate(input, REF)).toMatchObject({ ok: true, value });
  });

  it.each([
    ['12/3/26', '2026-03-12'],
    ['12-3-26', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    ['12 March 2026', '2026-03-12'],
    ['12th Mar, 2026', '2026-03-12'],
    ['March 12, 2026', '2026-03-12'],
    ['2026-03-12', '2026-03-12'],
    ['१२/३/२०२६', '2026-03-12'],
  ])('plain %s is unchanged -> %s', (input, value) => {
    expect(normalizeDate(input, REF)).toMatchObject({
      ok: true,
      value,
      display: '12 March 2026',
    });
  });

  it.each([
    ['12/3/27', 'two_digit_year_ambiguous'],
    ['31/2/2026', 'day_month_out_of_range'],
    ['12 Marchh 2026', 'unknown_month'],
    ['12 March', 'missing_year'],
    ['Rs 1500', 'unknown_month'],
  ])('non-date / error %s keeps its reason %s', (input, reason) => {
    expect(normalizeDate(input, REF)).toMatchObject({ ok: false, reason });
  });

  it.each([
    '4 June 2026 to 5 June 2026',
    'from June to 4 July 2026',
    'FIR dated 4, 2026',
    '4 June 2026 and 5 June 2026',
    '12.03.2026 and 14.03.2026',
    'one two three four five six seven 4 June 2026', // label longer than 6 words
  ])('stays unrecognised: %s', (input) => {
    expect(normalizeDate(input, REF)).toMatchObject({ ok: false, reason: 'unrecognised' });
  });

  it('a labelled wrong date is not equal to the ledger date', () => {
    expect(compareDates('remand 5 June 2026', '4 June 2026', REF)).toEqual({
      ok: true,
      equal: false,
    });
    expect(compareDates('remand 4 June 2026', '4 June 2026', REF)).toEqual({
      ok: true,
      equal: true,
    });
  });
});
