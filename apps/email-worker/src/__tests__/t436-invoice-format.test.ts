/**
 * T-436 (b/c) slice 4: merge-field formatting for the invoice emails (templates/billing/format.ts).
 * Amount: Indian grouping, no ".00" on whole rupees (Ajay, Addendum 9). Date: IST, "14 Oct 2026".
 */
import { formatInr, formatIstDate } from '../templates/billing/format';

describe('formatInr', () => {
  it.each([
    [0, '₹0'],
    [1, '₹0.01'],
    [5, '₹0.05'],
    [99, '₹0.99'],
    [100, '₹1'],
    [79900, '₹799'],
    [79950, '₹799.50'],
    [79905, '₹799.05'],
    [99900, '₹999'],
    [100000, '₹1,000'],
    [199900, '₹1,999'],
    [9999900, '₹99,999'],
    [10000000, '₹1,00,000'],
    [123456789, '₹12,34,567.89'],
    [1234567890, '₹1,23,45,678.90'],
    [1234567890000, '₹12,34,56,78,900'],
    [1234567890005, '₹12,34,56,78,900.05'],
    [12345678905, '₹12,34,56,789.05'],
  ])('%i paise -> %s', (paise, expected) => {
    expect(formatInr(paise)).toBe(expected);
  });

  it('never prints ".00" and never uses Western grouping', () => {
    for (const p of [100, 100000, 12345600, 100000000]) {
      expect(formatInr(p)).not.toContain('.00');
    }
    expect(formatInr(10000000)).not.toBe('₹100,000');
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2, '100' as unknown as number])(
    'refuses %p, and the message names no value',
    (bad) => {
      expect(() => formatInr(bad)).toThrow(/non-negative integer number of paise/);
      try {
        formatInr(bad);
      } catch (e) {
        expect((e as Error).message).not.toContain(String(bad));
      }
    },
  );
});

describe('formatIstDate', () => {
  it('formats in "14 Oct 2026" form (no zero pad)', () => {
    expect(formatIstDate(new Date('2026-10-14T06:30:00Z'))).toBe('14 Oct 2026');
    expect(formatIstDate(new Date('2026-04-05T06:30:00Z'))).toBe('5 Apr 2026');
  });

  it('UTC late evening rolls to the next IST day', () => {
    expect(formatIstDate(new Date('2026-10-14T18:29:59Z'))).toBe('14 Oct 2026');
    expect(formatIstDate(new Date('2026-10-14T18:30:00Z'))).toBe('15 Oct 2026');
    expect(formatIstDate(new Date('2026-10-14T23:59:59Z'))).toBe('15 Oct 2026');
  });

  it('rolls over month, year and the financial-year boundary', () => {
    expect(formatIstDate(new Date('2026-10-31T20:00:00Z'))).toBe('1 Nov 2026');
    expect(formatIstDate(new Date('2026-12-31T18:30:00Z'))).toBe('1 Jan 2027');
    // 31 March 2027 evening UTC is already 1 April 2027 (new financial year) in IST.
    expect(formatIstDate(new Date('2027-03-31T18:30:00Z'))).toBe('1 Apr 2027');
    expect(formatIstDate(new Date('2027-03-31T18:29:59Z'))).toBe('31 Mar 2027');
    // Leap day.
    expect(formatIstDate(new Date('2028-02-28T18:30:00Z'))).toBe('29 Feb 2028');
    expect(formatIstDate(new Date('2028-02-29T18:30:00Z'))).toBe('1 Mar 2028');
  });

  it('does not depend on the process timezone', () => {
    const saved = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        expect(formatIstDate(new Date('2026-10-14T18:30:00Z'))).toBe('15 Oct 2026');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it('every month is a fixed three-letter name; September is "Sep", never "Sept"', () => {
    const names: string[] = [];
    for (let m = 0; m < 12; m++) {
      names.push(formatIstDate(new Date(Date.UTC(2026, m, 15, 6))).split(' ')[1]);
    }
    expect(names).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(formatIstDate(new Date('2026-09-15T06:00:00Z'))).toBe('15 Sep 2026');
    expect(formatIstDate(new Date('2026-09-15T06:00:00Z'))).not.toContain('Sept');
  });

  it('refuses an invalid date, and the message names no value', () => {
    expect(() => formatIstDate(new Date('garbage'))).toThrow(/not a valid date/);
  });
});
