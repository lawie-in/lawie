/**
 * T-453 round 2 and 3 — normalizeDate strips a short leading label before
 * matching, by allowlist: fillers (any field) and field words (only the
 * field they name). Ajay's condition: a read date fills only the field its
 * label names; anything else stays blank. packages/shared has no test runner,
 * so this lives in drafting. The whole span is tried first.
 */
import { compareDates, normalizeDate } from '@lawie/shared';

const REF = { referenceYear: 2026 };
const withKey = (fieldKey?: string) => ({ ...REF, fieldKey });
const UNREC = { ok: false, reason: 'unrecognised' };

describe('normalizeDate: allowed leading label', () => {
  it.each([
    ['remand 4 June 2026', 'remand_date', '2026-06-04'],
    ['FIR dated 12.03.2026', 'fir_date', '2026-03-12'],
    ['on 4th June, 2026', 'accident_date', '2026-06-04'],
    ['on 4th June, 2026', undefined, '2026-06-04'],
    ['w.e.f. 1/4/2026', 'any_date', '2026-04-01'],
    ['w.e.f. 1/4/2026', undefined, '2026-04-01'],
    ['Date of remand: 4 June 2026', 'remand_date', '2026-06-04'],
    ['remand 4/6/26', 'remand_date', '2026-06-04'],
    ['arrested on 4 June 2026', 'arrest_date', '2026-06-04'],
    ['next hearing 4 June 2026', 'next_hearing_date', '2026-06-04'],
    ['memo dated 18.09.2026', 'dishonour_date', '2026-09-18'],
    ['remand 4 June 2026', 'case.remand_date', '2026-06-04'], // last key segment
  ])('%s [%s] -> %s', (input, key, value) => {
    expect(normalizeDate(input, withKey(key))).toMatchObject({ ok: true, value });
  });
});

describe('normalizeDate: plain dates unchanged', () => {
  it.each([
    '12/3/26',
    '12-3-26',
    '12.03.2026',
    '12 March 2026',
    '12th Mar, 2026',
    'March 12, 2026',
    '2026-03-12',
    '१२/३/२०२६',
  ])('plain %s -> 2026-03-12, with or without a field key', (input) => {
    for (const o of [REF, withKey('remand_date')])
      expect(normalizeDate(input, o)).toMatchObject({
        ok: true,
        value: '2026-03-12',
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
});

describe('normalizeDate: spans that stay unrecognised', () => {
  it.each([
    '4 June 2026 to 5 June 2026',
    'from June to 4 July 2026',
    'FIR dated 4, 2026',
    '4 June 2026 and 5 June 2026',
    '12.03.2026 and 14.03.2026',
    'one two three four five six seven 4 June 2026',
  ])('%s', (input) => {
    expect(normalizeDate(input, withKey('fir_date'))).toMatchObject(UNREC);
    expect(normalizeDate(input, REF)).toMatchObject(UNREC);
  });

  it('two dates in one span with a label stays unrecognised', () => {
    expect(
      normalizeDate('remand 4 June 2026 and 5 June 2026', withKey('remand_date')),
    ).toMatchObject(UNREC);
  });
});

describe('normalizeDate: qualifiers never make a date definite', () => {
  it.each([
    'before',
    'after',
    'not',
    'till',
    'until',
    'by',
    'around',
    'about',
    'approx',
    'on or before',
    'on or about',
    'not later than',
    'prior to',
    'within',
  ])(
    '"%s 4 June 2026" stays unrecognised, even for a matching field and after a field word',
    (q) => {
      for (const key of ['remand_date', 'custody_since', undefined]) {
        expect(normalizeDate(`${q} 4 June 2026`, withKey(key))).toMatchObject(UNREC);
        expect(normalizeDate(`${q} 12.03.2026`, withKey(key))).toMatchObject(UNREC);
      }
      expect(normalizeDate(`remand ${q} 4 June 2026`, withKey('remand_date'))).toMatchObject(UNREC);
      expect(normalizeDate(`${q} remand 4 June 2026`, withKey('remand_date'))).toMatchObject(UNREC);
    },
  );
});

describe("Ajay's condition: a date fills only the field its label names", () => {
  it('a label naming another field stays unrecognised', () => {
    expect(normalizeDate('remand 4 June 2026', withKey('arrest_date'))).toMatchObject(UNREC);
    expect(normalizeDate('FIR dated 12.03.2026', withKey('remand_date'))).toMatchObject(UNREC);
  });

  it('a field word without a field key stays unrecognised', () => {
    expect(normalizeDate('remand 4 June 2026', REF)).toMatchObject(UNREC);
    expect(normalizeDate('FIR dated 12.03.2026')).toMatchObject(UNREC);
  });

  it.each([
    'filing 4 June 2026',
    'hearing-ish 4 June 2026',
    'bail 4 June 2026',
    'incident 4 June 2026',
  ])('a label not on the list stays unrecognised: %s', (input) => {
    for (const key of ['remand_date', 'fir_date', 'next_hearing_date', 'filing_date', undefined])
      expect(normalizeDate(input, withKey(key))).toMatchObject(UNREC);
  });

  it('two labels naming different fields stay unrecognised for both: cheque returned 18.09.2026', () => {
    for (const key of ['cheque_date', 'dishonour_date', 'notice_sent_date', undefined])
      expect(normalizeDate('cheque returned 18.09.2026', withKey(key))).toMatchObject(UNREC);
  });

  it('since works only for custody_since / in_custody_since', () => {
    const s = 'since 4 June 2026';
    expect(normalizeDate(s, withKey('custody_since'))).toMatchObject({
      ok: true,
      value: '2026-06-04',
    });
    expect(normalizeDate(s, withKey('in_custody_since'))).toMatchObject({
      ok: true,
      value: '2026-06-04',
    });
    expect(normalizeDate(s, withKey('arrest_date'))).toMatchObject(UNREC);
    expect(normalizeDate(s, withKey('remand_date'))).toMatchObject(UNREC);
    expect(normalizeDate(s, REF)).toMatchObject(UNREC);
  });
});

describe('a stripped read still reports its own errors', () => {
  it('remand 4 June (no year) with remand_date -> missing_year', () => {
    expect(normalizeDate('remand 4 June', withKey('remand_date'))).toMatchObject({
      ok: false,
      reason: 'missing_year',
    });
  });
  it('FIR 31/2/2026 with fir_date -> day_month_out_of_range', () => {
    expect(normalizeDate('FIR 31/2/2026', withKey('fir_date'))).toMatchObject({
      ok: false,
      reason: 'day_month_out_of_range',
    });
  });
});

describe('compareDates with a label', () => {
  it('a labelled wrong date is not equal to the ledger date', () => {
    const o = withKey('remand_date');
    expect(compareDates('remand 5 June 2026', '4 June 2026', o)).toEqual({
      ok: true,
      equal: false,
    });
    expect(compareDates('remand 4 June 2026', '4 June 2026', o)).toEqual({ ok: true, equal: true });
  });
});
