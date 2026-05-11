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
  it('identifies BNS 303 (theft) as non-bailable', async () => {
    const result = await checkBailEligibility(['303']);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[0].offence?.bailable).toBe(false);
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
    const result = await checkBailEligibility(['115', '303']);
    expect(result.summary.overallBailable).toBe(false);
    // Most serious should be 303 (non-bailable, up to 3 years)
    expect(result.summary.mostSeriousSection).toBe('303');
  });

  it('flags bailable when all sections are bailable', async () => {
    const result = await checkBailEligibility(['115', '351']);
    expect(result.summary.overallBailable).toBe(true);
  });

  it('determines most serious offence by punishment quantum', async () => {
    const result = await checkBailEligibility(['303', '103']);
    // BNS 103 (murder, life/death) is more serious than 303 (theft, 3 years)
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

  it('recommends BNSS 480 for non-bailable offences', async () => {
    const result = await checkBailEligibility(['103']);
    expect(result.summary.bnssBailSection).toBe('480');
    expect(result.summary.bnssBailSectionTitle).toContain('discretionary');
  });

  it('mentions anticipatory bail (BNSS 482) in recommendation for non-bailable', async () => {
    const result = await checkBailEligibility(['303']);
    expect(result.summary.recommendation).toContain('anticipatory bail');
    expect(result.summary.recommendation).toContain('BNSS Section 482');
  });
});

// ---------------------------------------------------------------------------
// Court jurisdiction
// ---------------------------------------------------------------------------

describe('Court jurisdiction', () => {
  it('recommends JMFC for offences up to 3 years', async () => {
    const result = await checkBailEligibility(['115']);
    expect(result.summary.courtLevel).toContain('Magistrate');
  });

  it('recommends Sessions Court for 3-7 year offences', async () => {
    const result = await checkBailEligibility(['115(2)']);
    expect(result.summary.courtLevel).toContain('Sessions');
  });

  it('recommends Sessions/HC for death/life offences', async () => {
    const result = await checkBailEligibility(['103']);
    expect(result.summary.courtLevel).toContain('Sessions');
    expect(result.summary.courtLevel).toContain('High Court');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('handles empty input gracefully', async () => {
    const result = await checkBailEligibility([]);
    expect(result.sections).toHaveLength(0);
    expect(result.summary.overallBailable).toBe(true);
  });

  it('handles subsection notation (e.g. 103(1))', async () => {
    const result = await checkBailEligibility(['103(1)']);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[0].offence?.bailable).toBe(false);
  });

  it('handles whitespace in input', async () => {
    const result = await checkBailEligibility(['  303  ', ' 115 ']);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].found).toBe(true);
    expect(result.sections[1].found).toBe(true);
  });
});
