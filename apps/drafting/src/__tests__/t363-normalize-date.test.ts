/**
 * T-363 AC2: `normalizeDate` (packages/shared, the ledger path) reads the day in
 * words. packages/shared has no test runner, so it is tested from here.
 */
import { normalizeDate } from '@lawie/shared';

describe('normalizeDate: ordinal word days (T-363 AC2)', () => {
  it.each([
    ['fifteenth September 2026', '2026-09-15'],
    ['the thirty-first of January 2027', '2027-01-31'],
    ['twenty-second Sept 2026', '2026-09-22'],
    ['Twenty first Sept., 2026', '2026-09-21'],
    ['FIFTEENTH SEPTEMBER 2026', '2026-09-15'],
    ['the fifteenth of September, 2026', '2026-09-15'],
    ['thirtieth October 2026', '2026-10-30'],
    ['first January 2026', '2026-01-01'],
    ['  fifteenth   September   2026 ', '2026-09-15'],
  ])('reads %p as %s', (input, value) => {
    expect(normalizeDate(input)).toMatchObject({ ok: true, value });
  });

  it.each([
    ['fifteenth September', 'missing_year'],
    ['thirty-second March 2026', 'day_month_out_of_range'],
    ['thirtieth February 2026', 'day_month_out_of_range'],
    ['thirty-first September 2026', 'day_month_out_of_range'],
    ['fifteenth Foo 2026', 'unknown_month'],
  ])('rejects %p as %s', (input, reason) => {
    expect(normalizeDate(input)).toMatchObject({ ok: false, reason });
  });

  it('a two-digit year still needs a reference year, as before', () => {
    expect(normalizeDate('fifteenth September 26').ok).toBe(false);
  });
});

describe('normalizeDate: existing formats are unchanged (regression)', () => {
  const REF = { referenceYear: 2026 };
  it.each([
    ['2026-03-12', '2026-03-12'],
    ['12/03/2026', '2026-03-12'],
    ['12-03-2026', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    ['12 March 2026', '2026-03-12'],
    ['12th March, 2026', '2026-03-12'],
    ['March 12, 2026', '2026-03-12'],
    ['१२/३/२०२६', '2026-03-12'],
  ])('reads %p as %s', (input, value) => {
    expect(normalizeDate(input, REF)).toMatchObject({ ok: true, value });
  });

  it('two-digit years resolve against the reference year', () => {
    expect(normalizeDate('12/03/26', REF)).toMatchObject({ ok: true, value: '2026-03-12' });
    expect(normalizeDate('12 March 26', REF)).toMatchObject({ ok: true, value: '2026-03-12' });
  });

  it('a two-digit year without a reference year is not guessed', () => {
    expect(normalizeDate('12/03/26').ok).toBe(false);
  });

  it.each(['', '   ', 'not a date', '31/02/2026', '2026-13-01'])('rejects %p', (input) => {
    expect(normalizeDate(input, REF).ok).toBe(false);
  });

  it('non-strings are rejected with a reason', () => {
    expect(normalizeDate(null)).toMatchObject({ ok: false, reason: 'not_a_string' });
  });
});
