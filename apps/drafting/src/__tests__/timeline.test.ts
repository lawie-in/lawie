/**
 * SCRUM-48 — BNSS Investigation Timeline Tracker tests.
 * Tests custody limit calculations, chargesheet deadlines, default bail dates,
 * staggered remand breakdown, and edge cases.
 */
import './setupEnv';

import { calculateTimeline } from '../services/timeline.service';

// ── Police custody limit (15 days) ──────────────────────────────────────────

describe('Police custody limit', () => {
  it('ends 15 days after arrest', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.policeCustodyDays).toBe(15);
    expect(result.policeCustodyEndDate).toBe('2026-03-16');
  });

  it('is always 15 days regardless of offence severity', () => {
    const result = calculateTimeline({
      arrestDate: '2026-01-10',
      sections: ['103'], // murder — death/life
    });
    expect(result.policeCustodyDays).toBe(15);
    expect(result.policeCustodyEndDate).toBe('2026-01-25');
  });
});

// ── Judicial custody / chargesheet deadline ─────────────────────────────────

describe('Judicial custody and chargesheet deadline', () => {
  it('gives 60-day limit for offences < 10 years', () => {
    // BNS 303 (theft) — max 3 years
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.judicialCustodyDays).toBe(60);
    expect(result.judicialCustodyEndDate).toBe('2026-04-30');
    expect(result.chargesheetDeadline).toBe('2026-04-30');
  });

  it('gives 90-day limit for offences >= 10 years', () => {
    // BNS 109 (attempt to murder) — max 10 years
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['109'],
    });
    expect(result.judicialCustodyDays).toBe(90);
    expect(result.judicialCustodyEndDate).toBe('2026-05-30');
    expect(result.chargesheetDeadline).toBe('2026-05-30');
  });

  it('gives 90-day limit for death/life offences', () => {
    // BNS 103 (murder) — death/life (max_years=99)
    const result = calculateTimeline({
      arrestDate: '2026-01-01',
      sections: ['103'],
    });
    expect(result.judicialCustodyDays).toBe(90);
    expect(result.isLifeOrDeath).toBe(true);
    expect(result.judicialCustodyEndDate).toBe('2026-04-01');
  });

  it('uses most serious offence when multiple sections', () => {
    // 303 (3 years) + 109 (10 years) → should use 90 days
    const result = calculateTimeline({
      arrestDate: '2026-06-01',
      sections: ['303', '109'],
    });
    expect(result.maxYears).toBe(10);
    expect(result.judicialCustodyDays).toBe(90);
  });

  it('uses 60 days for bailable offences (< 10 years)', () => {
    // BNS 115 (voluntarily causing hurt) — 1 year
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['115'],
    });
    expect(result.judicialCustodyDays).toBe(60);
    expect(result.maxYears).toBe(1);
  });
});

// ── Default bail date ───────────────────────────────────────────────────────

describe('Default bail date', () => {
  it('is day 61 for 60-day limit cases', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.defaultBailDate).toBe('2026-05-01');
  });

  it('is day 91 for 90-day limit cases', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.defaultBailDate).toBe('2026-05-31');
  });

  it('is always available', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.defaultBailAvailable).toBe(true);
  });
});

// ── Staggered remand breakdown ──────────────────────────────────────────────

describe('Staggered remand breakdown', () => {
  it('police custody from arrest to day 15', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.remandBreakdown.policeCustody.from).toBe('2026-03-01');
    expect(result.remandBreakdown.policeCustody.to).toBe('2026-03-16');
    expect(result.remandBreakdown.policeCustody.days).toBe(15);
  });

  it('judicial custody from day 16 to day 60 for < 10 year offences', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.remandBreakdown.judicialCustody.from).toBe('2026-03-17');
    expect(result.remandBreakdown.judicialCustody.to).toBe('2026-04-30');
    expect(result.remandBreakdown.judicialCustody.days).toBe(45);
  });

  it('judicial custody from day 16 to day 90 for >= 10 year offences', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.remandBreakdown.judicialCustody.from).toBe('2026-03-17');
    expect(result.remandBreakdown.judicialCustody.to).toBe('2026-05-30');
    expect(result.remandBreakdown.judicialCustody.days).toBe(75);
  });
});

// ── Milestones ──────────────────────────────────────────────────────────────

describe('Timeline milestones', () => {
  it('returns 4 milestones in order', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.milestones).toHaveLength(4);
    expect(result.milestones[0].type).toBe('start');
    expect(result.milestones[1].type).toBe('police_custody');
    expect(result.milestones[2].type).toBe('chargesheet');
    expect(result.milestones[3].type).toBe('default_bail');
  });

  it('marks police custody, chargesheet, and default bail as critical', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.milestones[0].critical).toBe(false); // start
    expect(result.milestones[1].critical).toBe(true); // police custody
    expect(result.milestones[2].critical).toBe(true); // chargesheet
    expect(result.milestones[3].critical).toBe(true); // default bail
  });

  it('milestones have correct dates', () => {
    const result = calculateTimeline({
      arrestDate: '2026-06-15',
      sections: ['115'], // 1 year → 60-day limit
    });
    expect(result.milestones[0].date).toBe('2026-06-15'); // arrest
    expect(result.milestones[1].date).toBe('2026-06-30'); // police custody end (day 15)
    expect(result.milestones[2].date).toBe('2026-08-14'); // chargesheet (day 60)
    expect(result.milestones[3].date).toBe('2026-08-15'); // default bail (day 61)
  });
});

// ── BNSS section reference ──────────────────────────────────────────────────

describe('BNSS section reference', () => {
  it('references BNSS 187 for all cases', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.bnssSection).toBe('187');
  });

  it('mentions 60-day limit in title for < 10 year offences', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.bnssSectionTitle).toContain('60-day');
  });

  it('mentions 90-day limit in title for >= 10 year offences', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.bnssSectionTitle).toContain('90-day');
  });
});

// ── Sections resolution ─────────────────────────────────────────────────────

describe('Section resolution', () => {
  it('tracks found and not-found sections', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303', '999'],
    });
    expect(result.sectionsUsed).toContain('303');
    expect(result.sectionsNotFound).toContain('999');
  });

  it('uses max punishment from found sections only', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['115', '999'], // 115 = 1 year, 999 = not found
    });
    expect(result.maxYears).toBe(1);
    expect(result.judicialCustodyDays).toBe(60);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles no valid sections (defaults to 0 years → 60 days)', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['999'],
    });
    expect(result.maxYears).toBe(0);
    expect(result.judicialCustodyDays).toBe(60);
    expect(result.sectionsNotFound).toContain('999');
  });

  it('handles year-end boundary correctly', () => {
    const result = calculateTimeline({
      arrestDate: '2026-12-01',
      sections: ['103'], // 90 days
    });
    // Dec 1 + 90 = March 1, 2027
    expect(result.judicialCustodyEndDate).toBe('2027-03-01');
    expect(result.defaultBailDate).toBe('2027-03-02');
  });

  it('handles leap year boundary', () => {
    // 2028 is a leap year
    const result = calculateTimeline({
      arrestDate: '2028-02-01',
      sections: ['303'], // 60 days
    });
    // Feb 1 + 60 = April 1 (Feb has 29 days in 2028)
    expect(result.judicialCustodyEndDate).toBe('2028-04-01');
  });

  it('throws on invalid date', () => {
    expect(() => calculateTimeline({ arrestDate: 'not-a-date', sections: ['303'] })).toThrow(
      'Invalid date',
    );
  });

  it('handles empty section strings gracefully', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303', '', '  '],
    });
    expect(result.sectionsUsed).toEqual(['303']);
  });
});
