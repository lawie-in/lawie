/**
 * T-136, D2 and condition 5 (part 2): a date is shown back to the advocate as
 * they wrote it. `datesAsWritten` gives each date once, with its words, in the
 * order of first appearance; `datesInText` still returns the same set.
 * No database, no model call.
 */
import { datesAsWritten, datesInText, dateMatchesInText } from '../services/intake-text';

describe('dateMatchesInText (T-414)', () => {
  it('gives every match with its position, sorted, with no dedupe', () => {
    const text = 'On 12 March 2025 and 2 March 2025, again 2 March 2025, also 02/03/2025.';
    const out = dateMatchesInText(text);
    const first = text.indexOf('2 March 2025, again');
    expect(out).toEqual([
      { value: '2025-03-12', words: '12 March 2025', at: 3, length: 13 },
      { value: '2025-03-02', words: '2 March 2025', at: first, length: 12 },
      {
        value: '2025-03-02',
        words: '2 March 2025',
        at: text.lastIndexOf('2 March 2025'),
        length: 12,
      },
      { value: '2025-03-02', words: '02/03/2025', at: text.indexOf('02/03/2025'), length: 10 },
    ]);
  });

  it('returns nothing when there is no date', () => {
    expect(dateMatchesInText('')).toEqual([]);
  });
});

describe('datesAsWritten', () => {
  it('gives each date once, with the words as written, in order of first appearance', () => {
    const text =
      'Arrested on 12th Sept 2026. Bail was refused on 22.09.2026. The FIR is of 2026-09-10, and again 12th Sept 2026.';
    expect(datesAsWritten(text)).toEqual([
      { value: '2026-09-12', words: '12th Sept 2026' },
      { value: '2026-09-22', words: '22.09.2026' },
      { value: '2026-09-10', words: '2026-09-10' },
    ]);
  });

  it('keeps the first way a date is written when it is written twice in two ways', () => {
    const out = datesAsWritten('On 22.09.2026 and later on 22 September 2026.');
    expect(out).toEqual([{ value: '2026-09-22', words: '22.09.2026' }]);
  });

  it('reads a Hindi month form and shows it as written', () => {
    const out = datesAsWritten('उसे 15 मार्च 2026 को गिरफ्तार किया गया।');
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('2026-03-15');
    expect(out[0].words).toBe('15 मार्च 2026');
  });

  it('keeps the case the advocate used', () => {
    expect(datesAsWritten('Arrested on SEPT 12, 2026')).toEqual([
      { value: '2026-09-12', words: 'SEPT 12, 2026' },
    ]);
  });

  it('adds no year to a date written without one', () => {
    expect(datesAsWritten('He was arrested on 12th September.')).toEqual([]);
  });

  it('returns nothing for text with no date', () => {
    expect(datesAsWritten('')).toEqual([]);
    expect(datesAsWritten('No dates here, only FIR No. 124/2026.')).toEqual([]);
  });
});

describe('datesInText is still the set of those dates', () => {
  it('returns the same dates, once each, in order', () => {
    const text = '12th Sept 2026, 22.09.2026, 22/09/2026, 2026-09-10, 15 मार्च 2026, 31.02.2026';
    expect(datesInText(text)).toEqual(['2026-09-12', '2026-09-22', '2026-09-10', '2026-03-15']);
    expect(datesInText(text)).toEqual(datesAsWritten(text).map((d) => d.value));
  });
});
