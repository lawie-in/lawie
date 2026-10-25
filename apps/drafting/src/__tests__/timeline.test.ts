/**
 * SCRUM-48 — BNSS Investigation Timeline Tracker tests.
 * Tests custody limit calculations, chargesheet deadlines, default bail dates,
 * and edge cases. T-367: day-1 counting; the remand breakdown is removed.
 */
import './setupEnv';

import { calculateTimeline } from '../services/timeline.service';

// ── Police custody limit (15 days) ──────────────────────────────────────────

describe('Police custody limit', () => {
  it('window ends on day 40 for a 60-day offence (first remand + 39)', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.policeCustodyDays).toBe(15);
    expect(result.policeCustodyEndDate).toBe('2026-04-09');
  });

  it('window ends on day 60 for a 90-day offence (first remand + 59)', () => {
    const result = calculateTimeline({
      arrestDate: '2026-01-10',
      sections: ['103'], // murder — death/life
    });
    expect(result.policeCustodyDays).toBe(15);
    expect(result.policeCustodyEndDate).toBe('2026-03-10');
  });
});

// ── Judicial custody / chargesheet deadline ─────────────────────────────────

describe('Judicial custody and chargesheet deadline', () => {
  it('gives 60-day limit for offences < 10 years', () => {
    // BNS 303 (theft) — max 5 years in the signed table (exact-key row)
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.judicialCustodyDays).toBe(60);
    expect(result.judicialCustodyEndDate).toBe('2026-04-29');
    expect(result.chargesheetDeadline).toBe('2026-04-29');
  });

  it('gives 90-day limit for offences >= 10 years', () => {
    // BNS 109 (attempt to murder) — 99 (life) in the signed table; the old table said 10
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['109'],
    });
    expect(result.judicialCustodyDays).toBe(90);
    expect(result.judicialCustodyEndDate).toBe('2026-05-29');
    expect(result.chargesheetDeadline).toBe('2026-05-29');
  });

  it('gives 90-day limit for death/life offences', () => {
    // BNS 103 (murder) — death/life (max_years=99)
    const result = calculateTimeline({
      arrestDate: '2026-01-01',
      sections: ['103'],
    });
    expect(result.judicialCustodyDays).toBe(90);
    expect(result.isLifeOrDeath).toBe(true);
    expect(result.judicialCustodyEndDate).toBe('2026-03-31');
  });

  it('uses most serious offence when multiple sections', () => {
    // 303 (5 years) + 109 (99 = life, signed table) → should use 90 days
    const result = calculateTimeline({
      arrestDate: '2026-06-01',
      sections: ['303', '109'],
    });
    expect(result.maxYears).toBe(99);
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
  it('is first remand + 60 (day 61) for 60-day limit cases', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.defaultBailDate).toBe('2026-04-30');
  });

  it('is first remand + 90 (day 91) for 90-day limit cases', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.defaultBailDate).toBe('2026-05-30');
  });

  it('is always available', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.defaultBailAvailable).toBe(true);
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
    expect(result.milestones[0].date).toBe('2026-06-15'); // first remand (day 1)
    expect(result.milestones[1].date).toBe('2026-07-24'); // police window last day (day 40)
    expect(result.milestones[2].date).toBe('2026-08-13'); // chargesheet last day (day 60)
    expect(result.milestones[3].date).toBe('2026-08-14'); // default bail (day 61)
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

  it('uses the single signed title for a 60-day offence', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['303'],
    });
    expect(result.bnssSectionTitle).toBe('BNSS 187(3): detention limit before the charge sheet');
  });

  it('uses the single signed title for a 90-day offence', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['103'],
    });
    expect(result.bnssSectionTitle).toBe('BNSS 187(3): detention limit before the charge sheet');
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
  // T-277 (R1): was "defaults to 0 years → 60 days". A section that resolves to no
  // offence must not silently pick the shortest BNSS s.187 period; there is no period.
  it('handles no valid sections (no period, not 0 years → 60 days)', () => {
    const result = calculateTimeline({
      arrestDate: '2026-03-01',
      sections: ['999'],
    });
    expect(result.maxYears).toBeNull();
    expect(result.judicialCustodyDays).toBeNull();
    expect(result.judicialCustodyEndDate).toBeNull();
    expect(result.chargesheetDeadline).toBeNull();
    expect(result.defaultBailDate).toBeNull();
    expect(result.periodNote).toBe('Depends on the offence. Check BNSS section 187.');
    expect(result.sectionsNotFound).toContain('999');
  });

  it('handles year-end boundary correctly', () => {
    const result = calculateTimeline({
      arrestDate: '2026-12-01',
      sections: ['103'], // 90 days
    });
    // Day 1 = Dec 1; day 90 = 28 Feb 2027; default bail from 1 Mar 2027
    expect(result.judicialCustodyEndDate).toBe('2027-02-28');
    expect(result.defaultBailDate).toBe('2027-03-01');
  });

  it('handles leap year boundary', () => {
    // 2028 is a leap year
    const result = calculateTimeline({
      arrestDate: '2028-02-01',
      sections: ['303'], // 60 days
    });
    // Day 1 = 1 Feb; day 60 = 31 Mar 2028 (Feb has 29 days in 2028)
    expect(result.judicialCustodyEndDate).toBe('2028-03-31');
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
