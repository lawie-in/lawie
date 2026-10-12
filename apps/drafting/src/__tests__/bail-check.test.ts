/**
 * SCRUM-47 — Bail Eligibility Checker tests.
 * Tests the bail classification logic, IPC auto-conversion, jurisdiction, and BNSS section recommendation.
 */
import './setupEnv';
import './setupDb';

import { checkBailEligibility } from '../services/bail-check.service';

// ---------------------------------------------------------------------------
// Basic bail classification
// ---------------------------------------------------------------------------

describe('Bail classification — single section', () => {
  // T-277: the signed table has bailable = null for 303 (the Schedule gives no single
  // answer). The old assertion (false) encoded the superseded table; null is never false (R3).
  it('identifies BNS 303 (theft) as bailable "depends" (null), never false', async () => {
    const result = await checkBailEligibility(['303']);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[0].offence?.bailable).toBeNull();
    expect(result.sections[0].offence?.bailableNote).toBe('Depends. Check the First Schedule.');
    expect(result.sections[0].offence?.title).toMatch(/theft/i);
  });

  it('identifies BNS 115 (voluntarily causing hurt) as bailable', async () => {
    const result = await checkBailEligibility(['115']);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[0].offence?.bailable).toBe(true);
    expect(result.sections[0].offence?.cognizable).toBe(false);
    expect(result.sections[0].offence?.compoundable).toBe(true);
  });

  it('identifies BNS 103 (murder) as non-bailable with life/death', async () => {
    const result = await checkBailEligibility(['103']);
    expect(result.sections[0].offence?.bailable).toBe(false);
    expect(result.sections[0].offence?.cognizable).toBe(true);
    expect(result.sections[0].offence?.maxYears).toBe(99);
  });

  it('returns found=false for unknown section', async () => {
    const result = await checkBailEligibility(['999']);
    expect(result.sections[0].found).toBe(false);
    expect(result.sections[0].offence).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple sections — most serious determines summary
// ---------------------------------------------------------------------------

describe('Multiple sections', () => {
  it('flags non-bailable when any section is non-bailable', async () => {
    const result = await checkBailEligibility(['115', '109']);
    expect(result.summary.overallBailable).toBe(false);
    expect(result.summary.mostSeriousSection).toBe('109');
  });

  // T-277: was ['115','303'] -> false, because the old table said 303 was non-bailable.
  // 303 is now null (depends), so the whole answer is "depends", not false and not true.
  it('is "depends" (null), not false, when a section is null and none is non-bailable', async () => {
    const result = await checkBailEligibility(['115', '303']);
    expect(result.summary.overallBailable).toBeNull();
    expect(result.summary.overallBailableNote).toBe('Depends. Check the First Schedule.');
    expect(result.summary.undeterminedSections).toEqual(['303']);
    // A null section ranks as more serious than a bailable one.
    expect(result.summary.mostSeriousSection).toBe('303');
  });

  it('flags bailable when all sections are bailable', async () => {
    const result = await checkBailEligibility(['115', '351']);
    expect(result.summary.overallBailable).toBe(true);
  });

  it('determines most serious offence by punishment quantum', async () => {
    const result = await checkBailEligibility(['303', '103']);
    // BNS 103 (murder, life/death) is more serious than 303 (theft, 5 years in the signed table)
    expect(result.summary.mostSeriousSection).toBe('103');
    expect(result.summary.maxYears).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// IPC auto-conversion
// ---------------------------------------------------------------------------

describe('IPC auto-conversion', () => {
  it('auto-converts explicit IPC prefix (e.g. 420-IPC)', async () => {
    const result = await checkBailEligibility(['420-IPC']);
    expect(result.sections[0].convertedFromIpc).toBe(true);
    expect(result.sections[0].ipcSection).toBe('420');
  });

  it('auto-detects likely IPC section (> 358)', async () => {
    const result = await checkBailEligibility(['506']);
    // 506 > 358 so must be IPC
    expect(result.sections[0].convertedFromIpc).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BNSS bail section recommendation
// ---------------------------------------------------------------------------

describe('BNSS bail section recommendation', () => {
  it('recommends BNSS 478 for bailable offences', async () => {
    const result = await checkBailEligibility(['115']);
    expect(result.summary.bnssBailSection).toBe('478');
    expect(result.summary.bnssBailSectionTitle).toContain('matter of right');
  });

  // T-277 round 7 (Ajay, signed): 103 (death/life) is BNSS 483, was 480. 74 (up to 7 years) keeps 480.
  it('recommends BNSS 483 for non-bailable offences punishable with death or life (103)', async () => {
    const result = await checkBailEligibility(['103']);
    expect(result.summary.bnssBailSection).toBe('483');
    expect(result.summary.bnssBailSectionTitle).toBe(
      'Bail in non-bailable offence (BNSS Section 483), discretionary: apply to the Sessions Court or the High Court',
    );
  });

  it('recommends BNSS 480 for a non-bailable offence of up to 7 years (74)', async () => {
    const result = await checkBailEligibility(['74']);
    expect(result.summary.overallBailable).toBe(false);
    expect(result.summary.bnssBailSection).toBe('480');
    expect(result.summary.bnssBailSectionTitle).toBe(
      'Bail in non-bailable offence (BNSS Section 480), discretionary: apply to the Magistrate; if refused, to the Sessions Court or the High Court under BNSS Section 483',
    );
  });

  it('mentions anticipatory bail (BNSS 482) in recommendation for non-bailable', async () => {
    // T-277: was ['303']; 303 is now null, so a truly non-bailable section (103) is used.
    const result = await checkBailEligibility(['103']);
    expect(result.summary.recommendation).toContain('anticipatory bail');
    expect(result.summary.recommendation).toContain('BNSS Section 482');
  });

  // T-277: the 303 case that used to assert the anticipatory-bail text.
  it('gives the "Depends" recommendation for 303 (null bailable), no anticipatory-bail advice', async () => {
    const result = await checkBailEligibility(['303']);
    expect(result.summary.recommendation).toBe('Section 303: Depends. Check the First Schedule.');
    expect(result.summary.recommendation).not.toContain('anticipatory bail');
    expect(result.summary.bnssBailSection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Court jurisdiction
// ---------------------------------------------------------------------------

describe('Court jurisdiction', () => {
  it('shows the signed value for 115 (Any Magistrate)', async () => {
    const result = await checkBailEligibility(['115']);
    expect(result.summary.courtLevel).toBe('Any Magistrate');
  });

  it('3-7 year offence 74 shows its signed value (Any Magistrate), not Sessions', async () => {
    const result = await checkBailEligibility(['74']);
    expect(result.summary.courtLevel).toBe('Any Magistrate');
  });

  it('shows Court of Session for death/life offence 103', async () => {
    const result = await checkBailEligibility(['103']);
    expect(result.summary.courtLevel).toBe('Court of Session');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  // T-277: was true. With nothing charged, nothing is known to be bailable; "all bailable"
  // over an empty set was vacuous. Now null (depends).
  it('handles empty input gracefully', async () => {
    const result = await checkBailEligibility([]);
    expect(result.sections).toHaveLength(0);
    expect(result.summary.overallBailable).toBeNull();
  });

  it('handles subsection notation (e.g. 103(1))', async () => {
    const result = await checkBailEligibility(['103(1)']);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[0].offence?.bailable).toBe(false);
    // Resolved through the parent row 103 (R2 step 3).
    expect(result.sections[0].offence?.resolution).toBe('parent');
  });

  it('handles whitespace in input', async () => {
    const result = await checkBailEligibility(['  303  ', ' 115 ']);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[1].found).toBe(true);
  });
});
