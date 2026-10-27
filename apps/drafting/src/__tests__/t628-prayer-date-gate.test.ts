/**
 * T-628 — the past-date reader (prayer-date-gate.ts) and the signed strings.
 * Legal content: handoff/legal/T-613-o39-injunction-signed.md §(b), §(h), §(k).
 * "Now" is injected: every test reads as 27 Oct 2026 IST unless it says otherwise.
 */
import {
  modelPrayerSection,
  PAST_DATE_GATE_PACK_ID,
  PAST_DATE_IN_PRAYER_QUESTION,
  pastDateInPrayer,
  pastDateInPrayerLine,
  istToday,
  RESTRAINT_SOUGHT_KEY,
  RESTRAINT_SOUGHT_LABEL,
  SUBJECT_MATTER_KEY,
  subjectMatterDisplays,
  withoutSubjectMatter,
} from '../services/prayer-date-gate';

// 27 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-27T06:30:00Z');
const blocks = (text: string): string | null => pastDateInPrayer([text], NOW)?.date ?? null;

describe('signed strings (T-613 §(h), §(b)), byte for byte', () => {
  it('EN question', () => {
    expect(PAST_DATE_IN_PRAYER_QUESTION.en).toBe(
      'The prayer refers to <date>, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?',
    );
  });
  it('HI question', () => {
    expect(PAST_DATE_IN_PRAYER_QUESTION.hi).toBe(
      'प्रार्थना में <date> का उल्लेख है, जो बीत चुकी है। निषेधाज्ञा केवल आगे होने वाले कार्यों पर रोक लगा सकती है। प्रतिवादी को किन कार्यों से रोका जाना है?',
    );
  });
  it('fallback label, key and pack id', () => {
    expect(RESTRAINT_SOUGHT_LABEL).toBe('Acts the defendant should be restrained from');
    expect(RESTRAINT_SOUGHT_KEY).toBe('restraint_sought');
    expect(PAST_DATE_GATE_PACK_ID).toBe('temporary_injunction_o39');
  });
  it('pastDateInPrayerLine puts the date as written into the EN line', () => {
    expect(pastDateInPrayerLine('20 October 2026')).toBe(
      'The prayer refers to 20 October 2026, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?',
    );
  });
  it('a `$` in the date text is substituted literally', () => {
    const line = pastDateInPrayerLine("$& $1 $' 20 October 2026");
    expect(line).toContain("The prayer refers to $& $1 $' 20 October 2026, which");
    expect(line).not.toContain('<date>');
  });
});

describe('istToday and the IST boundary', () => {
  it('18:29:59Z is still the 26th in India, 18:30:00Z is the 27th', () => {
    expect(istToday(new Date('2026-10-26T18:29:59Z'))).toBe('2026-10-26');
    expect(istToday(new Date('2026-10-26T18:30:00Z'))).toBe('2026-10-27');
  });

  it('26 Oct blocks at 18:30Z on the 26th (now the 27th) and passes at 18:29:59Z', () => {
    const text = 'restrain on 26 October 2026';
    expect(pastDateInPrayer([text], new Date('2026-10-26T18:29:59Z'))).toBeNull();
    expect(pastDateInPrayer([text], new Date('2026-10-26T18:30:00Z'))).toEqual({
      date: '26 October 2026',
    });
  });
});

describe('Anushka case and the core rule', () => {
  it('"20 October 2026" blocks and is returned as written', () => {
    expect(pastDateInPrayer(['20 October 2026'], NOW)).toEqual({ date: '20 October 2026' });
    expect(blocks('from raising construction after 20 October 2026')).toBe('20 October 2026');
  });
  it('today passes', () => {
    expect(blocks('27 October 2026')).toBeNull();
    expect(blocks('27.10.2026')).toBeNull();
    expect(blocks('2026-10-27')).toBeNull();
  });
  it('yesterday blocks', () => {
    expect(blocks('26 October 2026')).toBe('26 October 2026');
  });
  it('a future date passes', () => {
    expect(blocks('from raising construction until 15 December 2026')).toBeNull();
    expect(blocks('28 October 2026')).toBeNull();
    expect(blocks('1 January 2027')).toBeNull();
  });
  it('no date passes, and empty or non-string texts are skipped', () => {
    expect(blocks('raising any construction on the suit property')).toBeNull();
    expect(pastDateInPrayer([], NOW)).toBeNull();
    expect(
      pastDateInPrayer(['', undefined as unknown as string, null as unknown as string], NOW),
    ).toBeNull();
  });
});

describe('formats that block', () => {
  it.each([
    ['20.10.2026', '20.10.2026'],
    ['20/10/26', '20/10/26'],
    ['20-10-2026', '20-10-2026'],
    ['2026-10-20', '2026-10-20'],
    ['October 20, 2026', 'October 20, 2026'],
    ['20th October 2026', '20th October 2026'],
    ['20 Oct 2026', '20 Oct 2026'],
    ['20th day of October, 2026', '20th day of October, 2026'],
    ['twentieth day of October, 2026', 'twentieth day of October, 2026'],
    ['the twentieth of October 2026', 'twentieth of October 2026'],
    ['२०.१०.२०२६', '२०.१०.२०२६'],
    ['२० अक्तूबर २०२६', '२० अक्तूबर २०२६'],
    ['20 अक्टूबर, 2026', '20 अक्टूबर, 2026'],
    ['5 फ़रवरी 2026', '5 फ़रवरी 2026'],
    ['5 फरवरी 2026', '5 फरवरी 2026'],
    ['1 सितम्बर 2026', '1 सितम्बर 2026'],
    ['1 सितंबर 2026', '1 सितंबर 2026'],
  ])('%s', (text, written) => {
    expect(blocks(text)).toBe(written);
  });

  it('every signed Devanagari month name, with its variants, is read (past, year 2026)', () => {
    const months = [
      'जनवरी',
      'फ़रवरी',
      'फरवरी',
      'मार्च',
      'अप्रैल',
      'मई',
      'जून',
      'जुलाई',
      'अगस्त',
      'सितंबर',
      'सितम्बर',
      'अक्टूबर',
      'अक्तूबर',
    ];
    for (const m of months) expect(blocks(`5 ${m} 2026`)).toBe(`5 ${m} 2026`);
  });

  it('the Devanagari months after today (Nov, Dec 2026) pass; the same in 2025 block', () => {
    for (const m of ['नवंबर', 'नवम्बर', 'दिसंबर', 'दिसम्बर']) {
      expect(blocks(`28 ${m} 2026`)).toBeNull();
      expect(blocks(`5 ${m} 2025`)).toBe(`5 ${m} 2025`);
    }
  });

  it('a Devanagari date in the future passes', () => {
    expect(blocks('1 सितंबर 2027')).toBeNull();
    expect(blocks('२० अक्तूबर २०२७')).toBeNull();
  });

  it('a nukta in a month name that is written without it, or with it, is the same month', () => {
    // फ़ (U+095E precomposed) and फ + U+093C read as the same month as फ.
    expect(blocks('5 फ़रवरी 2026')).toBe('5 फ़रवरी 2026');
    expect(blocks('5 फ़रवरी 2026')).toBe('5 फ़रवरी 2026');
  });
});

describe('unresolved or ambiguous dates never block (§(k)1)', () => {
  it.each([
    '31 February 2026',
    'Suit No. 245 of 2026',
    'Title Suit No. 245 of 2026 and Suit No. 12 of 2025',
    '20/10/27',
    'in the year 2026',
    '20 October',
    '20 Octobre 2026',
    '5 कोई 2026',
  ])('%s', (text) => {
    expect(blocks(text)).toBeNull();
  });
});

describe('a month and year with no day (Ajay eb3506f5): blocks only when the whole month has ended', () => {
  it.each(['September 2026', 'सितंबर 2026', 'सितम्बर 2026', 'फरवरी 2026', 'January 2026'])(
    '%s blocks, as written',
    (text) => {
      expect(blocks(text)).toBe(text);
    },
  );
  it('the restraint is read inside a sentence', () => {
    expect(blocks('from raising construction since September 2026')).toBe('September 2026');
  });
  it.each([
    'October 2026',
    'अक्तूबर 2026',
    'अक्टूबर 2026',
    'November 2026',
    'नवंबर 2026',
    'September 2027',
  ])('%s (current or later month) passes', (text) => {
    expect(blocks(text)).toBeNull();
  });
  it('the month rolls over with IST: October 2026 passes on 31 Oct 2026, blocks on 1 Nov 2026', () => {
    expect(pastDateInPrayer(['October 2026'], new Date('2026-10-31T12:00:00Z'))).toBeNull();
    expect(pastDateInPrayer(['October 2026'], new Date('2026-10-31T18:30:00Z'))).toEqual({
      date: 'October 2026',
    });
  });
});

describe('month-year round 2 (Ajay eb3506f5)', () => {
  it.each(['September 2026', 'Sept. 2026', 'Sept, 2026', 'सितम्बर २०२६', 'दिसम्बर 2025'])(
    '%s blocks',
    (text) => {
      expect(blocks(text)).toBe(text);
    },
  );
  it.each(['October 2026', 'अक्तूबर 2026', 'November 2026', 'May 26', 'Sept 26'])(
    '%s passes',
    (text) => {
      expect(blocks(text)).toBeNull();
    },
  );
  it('a month-year inside a full date is judged as the full date, first past mention returned', () => {
    expect(blocks('20 September 2026 and October 2026')).toBe('20 September 2026');
    // 28 September 2026 is past, so the full date blocks; 20 November 2026 inside is future
    expect(blocks('on 20 November 2026')).toBeNull();
  });
  it('IST edge: September 2026 passes at 2026-09-30T18:29Z and blocks at 18:30Z', () => {
    expect(pastDateInPrayer(['September 2026'], new Date('2026-09-30T18:29:00Z'))).toBeNull();
    expect(pastDateInPrayer(['September 2026'], new Date('2026-09-30T18:30:00Z'))).toEqual({
      date: 'September 2026',
    });
  });
  it('03/12/2026 is 3 Dec: passes on 3 Dec IST, blocks after', () => {
    expect(pastDateInPrayer(['03/12/2026'], new Date('2026-12-03T06:30:00Z'))).toBeNull();
    expect(pastDateInPrayer(['03/12/2026'], new Date('2026-12-04T06:30:00Z'))).toEqual({
      date: '03/12/2026',
    });
  });
});

describe('numeric day-first dates are resolved as day/month/year', () => {
  it('03/12/2026 is 3 December 2026 (future): passes', () => {
    expect(blocks('03/12/2026')).toBeNull();
  });
  it('12/03/2026 is 12 March 2026 (past): blocks', () => {
    expect(blocks('12/03/2026')).toBe('12/03/2026');
  });
});

describe('reading order', () => {
  it('with a past date in restraint_sought AND in the prayer, the first in reading order is returned', () => {
    const r = pastDateInPrayer(
      ['raising construction after 20 October 2026', 'Prayer: restrain from 5 March 2026'],
      NOW,
    );
    expect(r).toEqual({ date: '20 October 2026' });
  });
  it('within one text the earlier position wins, whatever the format', () => {
    expect(blocks('on 2026-03-05 and 20 October 2026')).toBe('2026-03-05');
    expect(blocks('on 20 October 2026 and 2026-03-05')).toBe('20 October 2026');
  });
  it('a past date after a future one in the same text still blocks', () => {
    expect(blocks('until 15 December 2026, and since 20 October 2026')).toBe('20 October 2026');
  });
  it('the second text is read when the first has no past date', () => {
    expect(pastDateInPrayer(['raising construction', 'by 1 March 2026'], NOW)).toEqual({
      date: '1 March 2026',
    });
  });
});

describe('modelPrayerSection (§(k)2: never the body)', () => {
  it.each(['PRAYER', 'Prayers', 'PRAYER:', '  prayer :  ', 'प्रार्थना', 'प्रार्थना:'])(
    'heading %j returns the section from the heading to the end',
    (heading) => {
      const body = `1. That the cause arose on 5 March 2026.\n\n${heading}\n\na) restrain the defendant until 1 March 2027.`;
      const s = modelPrayerSection(body);
      expect(s).not.toBeNull();
      expect(s!.startsWith(heading)).toBe(true);
      expect(s).toContain('restrain the defendant until 1 March 2027');
      expect(s).not.toContain('5 March 2026');
    },
  );

  it('no heading returns null', () => {
    expect(modelPrayerSection('1. That the cause arose on 5 March 2026.\n\n2. Para.')).toBeNull();
  });

  it('the word prayer inside a sentence or heading with other words is not a heading', () => {
    expect(
      modelPrayerSection('1. The prayer is below.\n\nPrayer for relief of the plaintiff'),
    ).toBeNull();
  });

  it('a date in the body before the heading is never read', () => {
    const body =
      '1. That on 5 March 2026 the defendant threatened.\n\nPRAYER\n\na) restrain from building.';
    const section = modelPrayerSection(body)!;
    expect(pastDateInPrayer([section], NOW)).toBeNull();
    // with a body but no heading, nothing is read at all
    expect(modelPrayerSection('1. That on 5 March 2026 the defendant threatened.')).toBeNull();
  });

  it('a past date inside the section blocks', () => {
    const body = '1. Body.\n\nPRAYER\n\na) restrain from building after 20 October 2026.';
    expect(pastDateInPrayer([modelPrayerSection(body)!], NOW)).toEqual({ date: '20 October 2026' });
  });
});

describe('withoutSubjectMatter (T-628, Ajay 410c3e34 §(k)6)', () => {
  it('the key is subject_matter', () => {
    expect(SUBJECT_MATTER_KEY).toBe('subject_matter');
  });

  it('takes out every literal occurrence of the value', () => {
    expect(withoutSubjectMatter('a) Plot 4 and again Plot 4 b)', 'Plot 4')).toBe(
      'a) | and again | b)',
    );
  });

  it('a date inside the value is gone, a date outside it stays', () => {
    const sm = 'Plot 4, deed of 3 March 2020';
    const out = withoutSubjectMatter(`restrain from ${sm}, after 20 October 2026`, sm);
    expect(out).not.toContain('2020');
    expect(out).toContain('20 October 2026');
    expect(blocks(out)).toBe('20 October 2026');
  });

  it('is a string match, never a pattern: regex and $ characters in the value are literal', () => {
    expect(withoutSubjectMatter('x (a+b)* $& y', '(a+b)*')).toBe('x | $& y');
    expect(withoutSubjectMatter('x .* y', '.*')).toBe('x | y');
    expect(withoutSubjectMatter('abc', '.')).toBe('abc');
  });

  it.each([[undefined], [null], [''], ['   '], ['\n\t'], [42], [{}], [['x']]])(
    'a missing, blank or non-string value (%p) changes nothing',
    (v) => {
      const text = 'a) restrain on 20 October 2026';
      expect(withoutSubjectMatter(text, v)).toBe(text);
    },
  );

  it('the `|` join cannot make a new date out of the two halves', () => {
    // "20 October" + [subject_matter "garbage"] + "2020" would read as 20 October 2020 if joined by nothing or a space
    const out = withoutSubjectMatter('on 20 October SM 2020', 'SM');
    expect(out).toBe('on 20 October | 2020');
    expect(blocks(out)).toBeNull();
    const out2 = withoutSubjectMatter('on 20/SM/2020 and 1.SM.2020', 'SM');
    expect(blocks(out2)).toBeNull();
    const out3 = withoutSubjectMatter('3 March2020x', 'March');
    expect(blocks(out3)).toBeNull();
    // a value that is a month name between day and year
    expect(blocks(withoutSubjectMatter('on 20 October 2020', 'October'))).toBeNull();
  });

  it('a value that is the whole text leaves only the join', () => {
    expect(withoutSubjectMatter('Plot 4', 'Plot 4')).toBe('|');
  });
});

describe('subjectMatterDisplays (§(k)6, the ledger text a held blank is filled with)', () => {
  it('picks subject_matter and a grouped key ending .subject_matter, in order', () => {
    expect(
      subjectMatterDisplays([
        { key: 'subject_matter', display: 'Plot 4' },
        { key: 'property.subject_matter', display: 'Plot 5' },
        { key: 'a.b.subject_matter', display: 'Plot 6' },
      ]),
    ).toEqual(['Plot 4', 'Plot 5', 'Plot 6']);
  });

  it('ignores other keys, including look-alikes', () => {
    expect(
      subjectMatterDisplays([
        { key: 'plaintiff_name', display: 'Ram' },
        { key: 'subject_matter_details', display: 'x' },
        { key: 'subject_matter.other', display: 'y' },
        { key: 'my_subject_matter', display: 'z' },
      ]),
    ).toEqual([]);
  });

  it('ignores blank and non-string displays', () => {
    expect(
      subjectMatterDisplays([
        { key: 'subject_matter', display: '' },
        { key: 'subject_matter', display: '   ' },
        { key: 'subject_matter', display: 42 },
        { key: 'subject_matter' },
        { key: 'subject_matter', display: 'Plot 7' },
      ]),
    ).toEqual(['Plot 7']);
  });

  it('trims', () => {
    expect(subjectMatterDisplays([{ key: 'subject_matter', display: '  Plot 4 \n' }])).toEqual([
      'Plot 4',
    ]);
  });

  it('is empty with no ledger or no facts', () => {
    expect(subjectMatterDisplays(undefined)).toEqual([]);
    expect(subjectMatterDisplays([])).toEqual([]);
  });
});

describe('withoutSubjectMatter with a list (§(k)6)', () => {
  it('removes each value', () => {
    expect(withoutSubjectMatter('a Plot 4 b Land X c', ['Plot 4', 'Land X'])).toBe('a | b | c');
  });

  it('longest first: a value nested inside a longer one leaves nothing of the longer behind', () => {
    const long = 'Plot 4, sale deed dated 5 March 2019';
    const short = 'sale deed dated 5 March 2019';
    const text = `restrain from ${long}.`;
    expect(withoutSubjectMatter(text, [short, long])).toBe('restrain from |.');
    expect(withoutSubjectMatter(text, [long, short])).toBe('restrain from |.');
    // control: shortest first would leave the "Plot 4, " part
    expect(withoutSubjectMatter(text, [short])).toBe('restrain from Plot 4, |.');
  });

  it('ignores blank and non-string entries', () => {
    expect(withoutSubjectMatter('a Plot 4 b', ['', '   ', undefined, null, 7, {}, 'Plot 4'])).toBe(
      'a | b',
    );
    expect(withoutSubjectMatter('a Plot 4 b', [undefined, '', null])).toBe('a Plot 4 b');
    expect(withoutSubjectMatter('a Plot 4 b', [])).toBe('a Plot 4 b');
  });

  it('a single string still works, and a single non-string changes nothing', () => {
    expect(withoutSubjectMatter('a Plot 4 b', 'Plot 4')).toBe('a | b');
    expect(withoutSubjectMatter('a Plot 4 b', undefined)).toBe('a Plot 4 b');
    expect(withoutSubjectMatter('a Plot 4 b', 12)).toBe('a Plot 4 b');
  });

  it('values are literal, never patterns', () => {
    expect(withoutSubjectMatter('a (x.*) b xyz', ['(x.*)'])).toBe('a | b xyz');
  });
});
