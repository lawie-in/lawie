/**
 * T-367: BNSS 187 timeline rules (Ajay, signed 51175aa; Addendum 1, 3431cce).
 * The signed literals below are copied from handoff/legal/T-367-bnss-187-timeline-signed.md
 * and compared with the constants the service exports, so a drifting text fails here.
 */
import './setupEnv';

import {
  START_DESCRIPTION,
  START_LABEL,
  BNSS_SECTION_TITLE,
  calculateTimeline,
  chargesheetLabel,
  defaultBailLabel,
  chargesheetLine,
  detentionLimitLine,
  formatLegalDate,
  policeCustodyLabel,
  policeCustodyLine,
} from '../services/timeline.service';

const DEPENDS = 'Depends on the offence. Check BNSS section 187.';

const R1_40 =
  'Police custody: up to 15 days in total, in one go or in parts, within the first 40 days of detention (BNSS 187(2)).';
const R1_60 =
  'Police custody: up to 15 days in total, in one go or in parts, within the first 60 days of detention (BNSS 187(2)).';
const R2_60 =
  'Detention limit before charge sheet: 60 days (BNSS 187(3)), counting the date of the first remand as day 1.';
const R2_90 =
  'Detention limit before charge sheet: 90 days (BNSS 187(3)), counting the date of the first remand as day 1.';

const BNS_303 = '303'; // theft, 60-day period
const BNS_103 = '103'; // murder, 90-day period

function run(arrestDate: string, section: string) {
  return calculateTimeline({ arrestDate, sections: [section] });
}

describe('T-367 signed texts (exports match Ajay literally)', () => {
  it('R1 lines', () => {
    expect(policeCustodyLine(40)).toBe(R1_40);
    expect(policeCustodyLine(60)).toBe(R1_60);
  });

  it('R2 lines cite 187(3), never 187(4)', () => {
    expect(detentionLimitLine(60)).toBe(R2_60);
    expect(detentionLimitLine(90)).toBe(R2_90);
    expect(R2_60).not.toContain('187(4)');
  });

  it('R3 line uses dates like "4 April 2026"', () => {
    expect(
      chargesheetLine(new Date('2026-04-04T00:00:00Z'), new Date('2026-04-05T00:00:00Z')),
    ).toBe(
      'Last day for the charge sheet: 4 April 2026. If none is filed by then, default bail is available from 5 April 2026.',
    );
  });

  it('Addendum 1 labels', () => {
    expect(START_LABEL).toBe('Day 1: first remand');
    expect(START_DESCRIPTION).toBe(
      'The date the Magistrate first ordered the accused into custody. This is day 1.',
    );
    expect(policeCustodyLabel(40)).toBe('Last day for police custody (day 40)');
    expect(policeCustodyLabel(60)).toBe('Last day for police custody (day 60)');
  });

  it('Addendum 2 labels and title', () => {
    expect(chargesheetLabel(60)).toBe('Last day for the charge sheet (day 60)');
    expect(chargesheetLabel(90)).toBe('Last day for the charge sheet (day 90)');
    expect(defaultBailLabel(60)).toBe('Default bail available from (day 61)');
    expect(defaultBailLabel(90)).toBe('Default bail available from (day 91)');
    expect(BNSS_SECTION_TITLE).toBe('BNSS 187(3): detention limit before the charge sheet');
  });
});

describe("Ajay's check: first remand 1 January 2026", () => {
  it('60-day period (BNS 303): window 9 Feb, last day 1 Mar, default bail 2 Mar 2026', () => {
    const r = run('2026-01-01', BNS_303);
    expect(r.judicialCustodyDays).toBe(60);
    expect(r.policeCustodyEndDate).toBe('2026-02-09');
    expect(r.judicialCustodyEndDate).toBe('2026-03-01');
    expect(r.chargesheetDeadline).toBe('2026-03-01');
    expect(r.defaultBailDate).toBe('2026-03-02');
    expect(r.policeCustodyNote).toBe(R1_40);
    expect(r.detentionLimitNote).toBe(R2_60);
    expect(r.chargesheetNote).toBe(
      'Last day for the charge sheet: 1 March 2026. If none is filed by then, default bail is available from 2 March 2026.',
    );
    expect(r.periodNote).toBeNull();
  });

  it('90-day period (BNS 103): window 1 Mar, last day 31 Mar, default bail 1 Apr 2026', () => {
    const r = run('2026-01-01', BNS_103);
    expect(r.judicialCustodyDays).toBe(90);
    expect(r.policeCustodyEndDate).toBe('2026-03-01');
    expect(r.judicialCustodyEndDate).toBe('2026-03-31');
    expect(r.chargesheetDeadline).toBe('2026-03-31');
    expect(r.defaultBailDate).toBe('2026-04-01');
    expect(r.policeCustodyNote).toBe(R1_60);
    expect(r.detentionLimitNote).toBe(R2_90);
    expect(r.chargesheetNote).toBe(
      'Last day for the charge sheet: 31 March 2026. If none is filed by then, default bail is available from 1 April 2026.',
    );
  });
});

describe('milestones', () => {
  it('60-day: start, police window, last day, default bail, with the signed labels', () => {
    const r = run('2026-01-01', BNS_303);
    expect(r.milestones.map((m) => [m.type, m.date])).toEqual([
      ['start', '2026-01-01'],
      ['police_custody', '2026-02-09'],
      ['chargesheet', '2026-03-01'],
      ['default_bail', '2026-03-02'],
    ]);
    expect(r.milestones[0].label).toBe('Day 1: first remand');
    expect(r.milestones[0].description).toBe(START_DESCRIPTION);
    expect(r.milestones[1].label).toBe('Last day for police custody (day 40)');
    expect(r.milestones[1].description).toBe(R1_40);
    expect(r.milestones[2].description).toBe(R2_60);
    expect(r.milestones[3].description).toBe(r.chargesheetNote);
  });

  it('90-day: police milestone is day 60', () => {
    const r = run('2026-01-01', BNS_103);
    expect(r.milestones[1].label).toBe('Last day for police custody (day 60)');
    expect(r.milestones[1].date).toBe('2026-03-01');
  });
});

describe('leap-year and year-end first-remand dates', () => {
  const cases: Array<[string, string, string, string, string, string]> = [
    // first remand, section, police window, last day, default bail, R3 line
    [
      '2028-02-01',
      BNS_303,
      '2028-03-11',
      '2028-03-31',
      '2028-04-01',
      'Last day for the charge sheet: 31 March 2028. If none is filed by then, default bail is available from 1 April 2028.',
    ],
    [
      '2028-02-01',
      BNS_103,
      '2028-03-31',
      '2028-04-30',
      '2028-05-01',
      'Last day for the charge sheet: 30 April 2028. If none is filed by then, default bail is available from 1 May 2028.',
    ],
    [
      '2028-02-29',
      BNS_303,
      '2028-04-08',
      '2028-04-28',
      '2028-04-29',
      'Last day for the charge sheet: 28 April 2028. If none is filed by then, default bail is available from 29 April 2028.',
    ],
    [
      '2028-02-29',
      BNS_103,
      '2028-04-28',
      '2028-05-28',
      '2028-05-29',
      'Last day for the charge sheet: 28 May 2028. If none is filed by then, default bail is available from 29 May 2028.',
    ],
    [
      '2026-12-01',
      BNS_303,
      '2027-01-09',
      '2027-01-29',
      '2027-01-30',
      'Last day for the charge sheet: 29 January 2027. If none is filed by then, default bail is available from 30 January 2027.',
    ],
    [
      '2026-12-01',
      BNS_103,
      '2027-01-29',
      '2027-02-28',
      '2027-03-01',
      'Last day for the charge sheet: 28 February 2027. If none is filed by then, default bail is available from 1 March 2027.',
    ],
    [
      '2026-12-31',
      BNS_303,
      '2027-02-08',
      '2027-02-28',
      '2027-03-01',
      'Last day for the charge sheet: 28 February 2027. If none is filed by then, default bail is available from 1 March 2027.',
    ],
  ];

  it.each(cases)('%s, BNS %s', (start, section, police, last, bail, line) => {
    const r = run(start, section);
    expect(r.policeCustodyEndDate).toBe(police);
    expect(r.judicialCustodyEndDate).toBe(last);
    expect(r.chargesheetDeadline).toBe(last);
    expect(r.defaultBailDate).toBe(bail);
    expect(r.chargesheetNote).toBe(line);
  });
});

describe('no period (offence with no fixed term)', () => {
  // 316(2) is a variant row with no exact term; 999 resolves to nothing.
  it.each(['316(2)', '999'])('section %s', (section) => {
    const r = run('2026-01-01', section);
    expect(r.policeCustodyNote).toBe(DEPENDS);
    expect(r.policeCustodyEndDate).toBeNull();
    expect(r.judicialCustodyEndDate).toBeNull();
    expect(r.defaultBailDate).toBeNull();
    expect(r.detentionLimitNote).toBeNull();
    expect(r.chargesheetNote).toBeNull();
    expect(r.periodNote).toBe(DEPENDS);
    expect(r.milestones.map((m) => m.type)).toEqual(['start']);
    expect(r.milestones[0].label).toBe('Day 1: first remand');
  });
});

describe('Addendum 2: defaultBailExplanation, title and milestone labels', () => {
  it.each([
    ['60-day', BNS_303, R2_60],
    ['90-day', BNS_103, R2_90],
    ['life', '109', R2_90],
  ])('%s: explanation is R2 + " " + R3', (_n, section, r2) => {
    const r = run('2026-01-01', section);
    expect(r.defaultBailExplanation).toBe(`${r2} ${r.chargesheetNote}`);
    expect(r.bnssSectionTitle).toBe('BNSS 187(3): detention limit before the charge sheet');
  });

  it('exact explanation for 1 Jan 2026, BNS 303', () => {
    expect(run('2026-01-01', BNS_303).defaultBailExplanation).toBe(
      'Detention limit before charge sheet: 60 days (BNSS 187(3)), counting the date of the first remand as day 1. Last day for the charge sheet: 1 March 2026. If none is filed by then, default bail is available from 2 March 2026.',
    );
  });

  it('milestone labels use charge sheet (day 60/90) and default bail (day 61/91)', () => {
    const a = run('2026-01-01', BNS_303).milestones;
    expect(a[2].label).toBe('Last day for the charge sheet (day 60)');
    expect(a[3].label).toBe('Default bail available from (day 61)');
    const b = run('2026-01-01', BNS_103).milestones;
    expect(b[2].label).toBe('Last day for the charge sheet (day 90)');
    expect(b[3].label).toBe('Default bail available from (day 91)');
  });

  it('no period: explanation and title are the Depends line', () => {
    const r = run('2026-01-01', '316(2)');
    expect(r.defaultBailExplanation).toBe(DEPENDS);
    expect(r.bnssSectionTitle).toBe(DEPENDS);
  });

  it.each([
    ['2026-01-01', BNS_303],
    ['2026-01-01', BNS_103],
    ['2026-01-01', '109'],
    ['2026-01-01', '115'],
    ['2028-02-29', BNS_303],
    ['2026-01-01', '316(2)'],
    ['2026-01-01', '999'],
  ])(
    'first remand %s, section %s: no "chargesheet" or "indefeasible" in user-visible text',
    (d, s) => {
      const r = run(d, s);
      const visible = JSON.stringify({
        notes: [
          r.policeCustodyNote,
          r.detentionLimitNote,
          r.chargesheetNote,
          r.periodNote,
          r.bnssSectionTitle,
          r.defaultBailExplanation,
        ],
        sectionNotes: r.sectionNotes,
        milestones: r.milestones.map((m) => [m.label, m.description]),
      });
      expect(visible).not.toMatch(/chargesheet/i);
      expect(visible).not.toMatch(/indefeasible/i);
      expect(visible).not.toContain('< 10 years');
    },
  );
});

describe('removed texts and fields', () => {
  const SAMPLES: Array<[string, string]> = [
    ['2026-01-01', BNS_303],
    ['2026-01-01', BNS_103],
    ['2028-02-29', BNS_303],
    ['2026-12-31', BNS_103],
    ['2026-01-01', '109'],
    ['2026-01-01', '115'],
    ['2026-01-01', '316(2)'],
    ['2026-01-01', '999'],
  ];

  it.each(SAMPLES)(
    'first remand %s, section %s: no remandBreakdown and no unsigned text',
    (d, s) => {
      const r = run(d, s);
      expect(r).not.toHaveProperty('remandBreakdown');
      const all = JSON.stringify(r);
      for (const bad of [
        'No further police remand',
        'accrues on Day',
        'stringent',
        'All custody periods begin',
        'Police Custody Limit',
        '187(4)',
        'remandBreakdown',
      ]) {
        expect(all).not.toContain(bad);
      }
    },
  );
});

describe('time-zone safety', () => {
  it('formatLegalDate reads UTC parts', () => {
    expect(formatLegalDate(new Date('2026-03-01T00:00:00Z'))).toBe('1 March 2026');
    expect(formatLegalDate(new Date('2026-12-31T23:59:59Z'))).toBe('31 December 2026');
  });

  // 8 Mar 2026 is the US spring-forward day; +59 days crosses DST. Auckland is +13.
  it.each(['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Los_Angeles'])(
    'same dates with TZ=%s',
    (tz) => {
      const before = process.env.TZ;
      process.env.TZ = tz;
      try {
        const r = run('2026-03-08', BNS_303);
        expect(r.arrestDate).toBe('2026-03-08');
        expect(r.policeCustodyEndDate).toBe('2026-04-16');
        expect(r.judicialCustodyEndDate).toBe('2026-05-06');
        expect(r.defaultBailDate).toBe('2026-05-07');
        expect(r.chargesheetNote).toBe(
          'Last day for the charge sheet: 6 May 2026. If none is filed by then, default bail is available from 7 May 2026.',
        );
        const d = calculateTimeline({
          arrestDate: new Date('2026-03-08T00:00:00Z'),
          sections: [BNS_103],
        });
        expect(d.judicialCustodyEndDate).toBe('2026-06-05');
        expect(d.defaultBailDate).toBe('2026-06-06');
      } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
      }
    },
  );
});
