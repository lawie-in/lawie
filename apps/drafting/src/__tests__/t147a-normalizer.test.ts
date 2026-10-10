import {
  normalizeAmount,
  compareAmounts,
  normalizeDate,
  compareDates,
  normalizeCaseNumber,
  compareCaseNumbers,
  normalizePoliceStation,
  normalizePersonName,
  normalizePlaceName,
  normalizeCourt,
  comparePoliceStations,
  compareNames,
  normalizeSectionRef,
  compareSectionRefs,
} from '@lawie/shared';
import type { AmountFact, FactLedger } from '@lawie/shared';

const REF = { referenceYear: 2026 };

function ok<T>(r: { ok: boolean }): T {
  expect(r.ok).toBe(true);
  return r as unknown as T;
}

describe('T-147a AC 1: ledger types', () => {
  it('rejects a string value on an amount fact at compile time', () => {
    const base = {
      id: 'f1',
      label: 'Surety',
      display: 'Rs 3,00,000',
      raw_span: '3 lakh',
      source: 'user' as const,
      confidence: 0.95,
      required_in_draft: true,
    };
    // @ts-expect-error amount value must be a number, not a string
    const bad: AmountFact = { ...base, type: 'amount', value: '300000' };
    const good: AmountFact = { ...base, type: 'amount', value: 300000 };
    const ledger: FactLedger = {
      matterId: 'm1',
      rulePackId: 'bail',
      runType: 'fixture',
      facts: [good],
      unresolved: [],
    };
    expect(bad).toBeDefined();
    expect(ledger.facts[0].value).toBe(300000);
  });
});

describe('T-147a AC 2: amounts', () => {
  const threeLakh = [
    '3 lakh', '3 lakhs', '3 lac', '3L', '3,00,000', '300000', '३ लाख', '३,००,०००',
    'तीन लाख', 'Rs. 3,00,000/-', '₹3L', '300,000',
  ];
  it.each(threeLakh)('%s -> 300000 / Rs 3,00,000', (input) => {
    const r = normalizeAmount(input);
    expect(r).toMatchObject({ ok: true, value: 300000, display: 'Rs 3,00,000' });
  });

  it.each([
    ['1 crore', 10000000, 'Rs 1,00,00,000'],
    ['1.5 cr', 15000000, 'Rs 1,50,00,000'],
    ['2 crore 50 lakh', 25000000, 'Rs 2,50,00,000'],
    ['50 thousand', 50000, 'Rs 50,000'],
    ['50k', 50000, 'Rs 50,000'],
    ['25 हज़ार', 25000, 'Rs 25,000'],
    ['dedh lakh', 150000, 'Rs 1,50,000'],
    ['3,50,000.50', 350000.5, 'Rs 3,50,000.50'],
  ])('%s', (input, value, display) => {
    expect(normalizeAmount(input)).toMatchObject({ ok: true, value, display });
  });

  it('never uses western grouping in display', () => {
    const r = normalizeAmount('300000');
    expect(r).toMatchObject({ ok: true });
    expect((r as { display: string }).display).not.toContain('300,000');
  });

  it.each([
    ['3,0,0', 'bad_digit_grouping'],
    ['3 lakh ka', 'unrecognised'],
    ['-5000', 'negative_amount'],
  ])('%s is unresolved: %s', (input, reason) => {
    expect(normalizeAmount(input)).toMatchObject({ ok: false, reason });
  });

  it('compares different spellings equal', () => {
    expect(compareAmounts('3 lakh', '३,००,०००')).toEqual({ ok: true, equal: true });
    expect(compareAmounts('3 lakh', '4 lakh')).toEqual({ ok: true, equal: false });
  });
});

describe('T-147a AC 3: dates', () => {
  it.each([
    '12/3/26', '12-3-26', '12.03.2026', '12 March 2026', '12th Mar, 2026',
    'March 12, 2026', '१२/३/२०२६',
  ])('%s -> 2026-03-12', (input) => {
    expect(normalizeDate(input, REF)).toMatchObject({
      ok: true,
      value: '2026-03-12',
      display: '12 March 2026',
    });
  });

  it('is day-first: 03/12/2026 is 3 December', () => {
    expect(normalizeDate('03/12/2026')).toMatchObject({
      ok: true,
      value: '2026-12-03',
      display: '3 December 2026',
    });
  });

  it('compares spellings equal', () => {
    expect(compareDates('12/3/26', '12 March 2026', REF)).toEqual({ ok: true, equal: true });
    expect(compareDates('03/12/2026', '12 March 2026')).toEqual({ ok: true, equal: false });
  });
});

describe('T-147a AC 4: ambiguity is never guessed', () => {
  it.each([
    ['12/3/27', REF, 'two_digit_year_ambiguous'],
    ['12/3/99', REF, 'two_digit_year_ambiguous'],
    ['12/3/26', {}, 'two_digit_year_needs_reference'],
    ['31/2/2026', REF, 'day_month_out_of_range'],
    ['29/2/2025', REF, 'day_month_out_of_range'],
    ['3/13/2026', REF, 'day_month_out_of_range'],
    ['12 Marchh 2026', REF, 'unknown_month'],
    ['12 March', REF, 'missing_year'],
  ])('%s -> %s', (input, opts, reason) => {
    expect(normalizeDate(input, opts)).toMatchObject({ ok: false, reason });
  });
});

describe('T-147a AC 5: Devanagari numerals', () => {
  it('converts in amounts', () => {
    expect(normalizeAmount('३,००,०००')).toMatchObject({ ok: true, value: 300000 });
  });
  it('converts in dates', () => {
    expect(normalizeDate('१२/३/२०२६', REF)).toMatchObject({ ok: true, value: '2026-03-12' });
  });
  it('converts in case numbers and keeps display as typed', () => {
    const dev = normalizeCaseNumber('Cr. Case No. १२३/२०२६');
    const ar = normalizeCaseNumber('CR CASE NO 123/2026');
    expect(dev).toMatchObject({ ok: true, value: 'CR CASE NO 123 2026', display: 'Cr. Case No. १२३/२०२६' });
    expect(ar).toMatchObject({ ok: true, value: 'CR CASE NO 123 2026' });
    expect(compareCaseNumbers('Cr. Case No. १२३/२०२६', 'CR CASE NO 123/2026')).toEqual({ ok: true, equal: true });
  });
  it('converts in section refs', () => {
    expect(normalizeSectionRef('धारा ४८३ BNSS')).toMatchObject({ ok: true, value: { act: 'BNSS', section: '483' } });
  });
});

describe('T-147a AC 6: police stations and names', () => {
  it.each([
    'PS Kotwali', 'Kotwali P.S.', 'P S Kotwali', 'P.S.Kotwali', 'Thana Kotwali',
    'थाना Kotwali', 'Kotwali Police Station',
  ])('%s folds to kotwali and keeps display as typed', (input) => {
    expect(normalizePoliceStation(input)).toMatchObject({ ok: true, value: 'kotwali', display: input });
  });

  it('PS Kotwali equals Kotwali P.S.', () => {
    expect(comparePoliceStations('PS Kotwali', 'Kotwali P.S.')).toEqual({ ok: true, equal: true });
  });

  it('does not correct a misspelling', () => {
    expect(comparePoliceStations('PS Kotwli', 'PS Kotwali')).toEqual({ ok: true, equal: false });
    expect(normalizePoliceStation('PS Kotwli')).toMatchObject({ ok: true, value: 'kotwli', display: 'PS Kotwli' });
  });

  it('bare PS is unresolved', () => {
    expect(normalizePoliceStation('PS')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('person names fold case and punctuation, display kept', () => {
    expect(compareNames('Ramesh Kumar', 'RAMESH. kumar')).toEqual({ ok: true, equal: true });
    expect(normalizePersonName('RAMESH. kumar')).toMatchObject({ ok: true, display: 'RAMESH. kumar' });
  });
});

describe('T-147a AC 7: section refs', () => {
  it.each([
    'S.483 BNSS', 'Sec 483 BNSS', 'Section 483 of the BNSS, 2023', 'u/s 483 BNSS',
    'BNSS s. 483', 'धारा ४८३ BNSS',
  ])('%s -> BNSS 483', (input) => {
    expect(normalizeSectionRef(input)).toMatchObject({ ok: true, value: { act: 'BNSS', section: '483' } });
  });

  it('all spellings compare equal', () => {
    expect(compareSectionRefs('S.483 BNSS', 'Sec 483 BNSS')).toEqual({ ok: true, equal: true });
    expect(compareSectionRefs('S.483 BNSS', 'Section 483 of the BNSS, 2023')).toEqual({ ok: true, equal: true });
  });

  it('keeps letter suffixes and sub-clauses', () => {
    expect(normalizeSectionRef('Section 498-A IPC')).toMatchObject({ ok: true, value: { act: 'IPC', section: '498A' } });
    expect(normalizeSectionRef('S. 480(1) BNSS')).toMatchObject({ ok: true, value: { act: 'BNSS', section: '480(1)' } });
  });

  it.each([
    ['Section 483', 'missing_act'],
    ['Section 483 of the XYZ Act', 'unknown_act'],
    ['Section 483 BNSS, 1973', 'act_year_mismatch'],
    ['302, 307 IPC', 'multiple_sections'],
    ['302 r/w 34 IPC', 'multiple_sections'],
    ['IPC 302, 307', 'multiple_sections'],
  ])('%s is unresolved: %s', (input, reason) => {
    expect(normalizeSectionRef(input)).toMatchObject({ ok: false, reason });
  });
});

describe('T-147a AC 8: pure and total', () => {
  const junk: unknown[] = [
    undefined, null, 42, {}, [], '', '   ', NaN, '\u0000', '😀', Symbol('x'),
  ];
  const single = [
    normalizeAmount, normalizeDate, normalizeCaseNumber, normalizePoliceStation,
    normalizePersonName, normalizePlaceName, normalizeCourt, normalizeSectionRef,
  ];
  const pairs = [compareAmounts, compareDates, compareCaseNumbers, comparePoliceStations, compareNames, compareSectionRefs];

  it.each(junk.map((j, i) => [i, j]))('single-input normalizers do not throw on junk #%s', (_i, j) => {
    for (const fn of single) {
      let r: { ok: boolean } | undefined;
      expect(() => { r = (fn as (x: unknown) => { ok: boolean })(j); }).not.toThrow();
      expect(r).toBeDefined();
      // Junk must never be accepted as a fact, except the emoji which may be a (useless) name key.
      if (j === undefined || j === null || typeof j !== 'string') expect(r!.ok).toBe(false);
    }
  });

  it('comparison helpers do not throw and flag the bad side', () => {
    for (const fn of pairs) {
      for (const j of junk) {
        expect(() => fn(j, 'x')).not.toThrow();
        expect(() => fn('x', j)).not.toThrow();
      }
      expect(fn(undefined, undefined)).toMatchObject({ ok: false, side: 'a' });
    }
  });
});

describe('T-147a: the three real T-147 values', () => {
  it('"3 lakh" -> 300000 / Rs 3,00,000', () => {
    expect(normalizeAmount('3 lakh')).toMatchObject({ ok: true, value: 300000, display: 'Rs 3,00,000' });
  });
  it('"PS Kotwali" equals "Kotwali P.S." and display is as typed', () => {
    expect(comparePoliceStations('PS Kotwali', 'Kotwali P.S.')).toEqual({ ok: true, equal: true });
    expect(normalizePoliceStation('PS Kotwali')).toMatchObject({ display: 'PS Kotwali' });
  });
  it('"12/3/26" with referenceYear 2026 -> 2026-03-12 / 12 March 2026', () => {
    expect(normalizeDate('12/3/26', REF)).toMatchObject({ ok: true, value: '2026-03-12', display: '12 March 2026' });
  });
});

describe('T-147a round 2: section refs with a bare year', () => {
  it.each(['BNSS, 2023', 'the BNSS 2023', 'IPC 1860', 'BNSS 2023', '2023 BNSS', '1860 IPC'])(
    '%s is unresolved: missing_section',
    (input) => {
      expect(normalizeSectionRef(input)).toMatchObject({ ok: false, reason: 'missing_section' });
    },
  );

  it.each(['S.483 BNSS', 'Sec 483 BNSS', '483 BNSS', 'BNSS s. 483', 'Section 483 of the BNSS, 2023'])(
    '%s still resolves to BNSS 483',
    (input) => {
      expect(normalizeSectionRef(input)).toMatchObject({ ok: true, value: { act: 'BNSS', section: '483' } });
    },
  );

  it('IPC 302 resolves to IPC 302', () => {
    expect(normalizeSectionRef('IPC 302')).toMatchObject({ ok: true, value: { act: 'IPC', section: '302' } });
  });
});

describe('T-147a round 2: amounts with a trailing bare number', () => {
  it.each(['3 lakh 50', '1 crore 20', '2 lakh 5000'])('%s is unresolved: unrecognised', (input) => {
    expect(normalizeAmount(input)).toMatchObject({ ok: false, reason: 'unrecognised' });
  });

  it('2 lakh 50000 -> 250000 / Rs 2,50,000', () => {
    expect(normalizeAmount('2 lakh 50000')).toMatchObject({ ok: true, value: 250000, display: 'Rs 2,50,000' });
  });

  it.each(['1 crore 20 lakh', '1 crore 2000000'])('%s -> 12000000 / Rs 1,20,00,000', (input) => {
    expect(normalizeAmount(input)).toMatchObject({ ok: true, value: 12000000, display: 'Rs 1,20,00,000' });
  });
});

describe('T-147a round 2: station markers stripped from one end only', () => {
  it('Thana Bhawan PS equals PS Thana Bhawan, key thanabhawan', () => {
    expect(comparePoliceStations('Thana Bhawan PS', 'PS Thana Bhawan')).toEqual({ ok: true, equal: true });
    expect(normalizePoliceStation('Thana Bhawan PS')).toMatchObject({ ok: true, value: 'thanabhawan' });
    expect(normalizePoliceStation('PS Thana Bhawan')).toMatchObject({ ok: true, value: 'thanabhawan' });
  });

  it.each(['PS Kotwali', 'Kotwali P.S.', 'Thana Kotwali', 'Kotwali Thana'])('%s keys to kotwali', (input) => {
    expect(normalizePoliceStation(input)).toMatchObject({ ok: true, value: 'kotwali' });
  });

  it.each(['PS', 'Thana', 'PS Thana'])('marker-only %s is unresolved', (input) => {
    expect(normalizePoliceStation(input)).toMatchObject({ ok: false });
  });
});

describe('T-147a round 2: dates with a null reference', () => {
  it('does not throw and is unresolved for a two-digit year', () => {
    expect(() => normalizeDate('12/3/26', null)).not.toThrow();
    expect(normalizeDate('12/3/26', null)).toMatchObject({ ok: false, reason: 'two_digit_year_needs_reference' });
  });

  it('a four-digit year resolves with a null reference', () => {
    expect(normalizeDate('12/3/2026', null)).toMatchObject({ ok: true, value: '2026-03-12' });
  });

  it('compareDates does not throw with a null reference', () => {
    expect(() => compareDates('12/3/2026', '12 March 2026', null)).not.toThrow();
    expect(() => compareDates('12/3/26', '12/3/2026', null)).not.toThrow();
    expect(compareDates('12/3/2026', '12 March 2026', null)).toEqual({ ok: true, equal: true });
    expect(compareDates('12/3/26', '12/3/2026', null)).toMatchObject({ ok: false });
  });
});

describe('T-147b: the Hindi Evidence Act name needs its year', () => {
  const NAME = 'भारतीय साक्ष्य अधिनियम';

  it('with 2023 it is the BSA', () => {
    expect(normalizeSectionRef(`धारा 63 ${NAME} 2023`)).toMatchObject({
      ok: true,
      value: { act: 'BSA', section: '63' },
    });
  });

  it('with 1872 it is the IEA', () => {
    expect(normalizeSectionRef(`धारा 65 ${NAME} 1872`)).toMatchObject({
      ok: true,
      value: { act: 'IEA', section: '65' },
    });
  });

  it('with no year it is ambiguous_act, never a guess', () => {
    expect(normalizeSectionRef(`धारा 63 ${NAME}`)).toMatchObject({ ok: false, reason: 'ambiguous_act' });
  });

  it('with any other year it is act_year_mismatch', () => {
    expect(normalizeSectionRef(`धारा 63 ${NAME} 2000`)).toMatchObject({
      ok: false,
      reason: 'act_year_mismatch',
    });
  });
});

// keeps the generic helper referenced for strict noUnusedLocals configs
void ok;
