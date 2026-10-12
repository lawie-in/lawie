/**
 * T-278 - an auto-detected IPC number with no IPC table row (Ajay, CLO).
 * "999" must come back found:false with the signed NOT_IN_IPC_TABLE note, the same as "999-IPC",
 * and must never be looked up as a BNS section.
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import { checkBailEligibility, NOT_IN_IPC_TABLE } from '../services/bail-check.service';
import {
  calculateTimeline,
  leftOutOfPeriodNote,
  notInBnsTableNote,
  oldLawLeftOutNote,
} from '../services/timeline.service';

// IPC rows come from the signed table itself. Sections in `missingRows` are served as "no row",
// to reach the in-range path (every real IPC_INDICATORS number <= 358 has a row, see below).
const missingRows = new Set<string>();
jest.mock('../services/sections.service', () => {
  const nodeFs = jest.requireActual('fs') as typeof import('fs');
  const nodePath = jest.requireActual('path') as typeof import('path');
  const table = JSON.parse(
    nodeFs.readFileSync(
      nodePath.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'),
      'utf-8',
    ),
  ) as { mappings: Record<string, { new: string | null; type: string; new_title: string | null }> };
  return {
    lookupOldToNew: jest.fn(async (section: string, code: string) => {
      if (code !== 'IPC' || missingRows.has(section)) return null;
      const row = table.mappings[section];
      if (!row) return null;
      return {
        old_code: 'IPC',
        old_section: section,
        new_code: 'BNS',
        new_section: row.new,
        new_title: row.new_title,
        mapping_type: row.type,
      };
    }),
  };
});

afterEach(() => missingRows.clear());

describe('T-278: auto-detected IPC with no table row', () => {
  it('"999" returns found:false with the signed note, no offence, no guessed BNS section', async () => {
    const { sections } = await checkBailEligibility(['999']);
    expect(sections).toHaveLength(1);
    const s = sections[0];
    expect(s.found).toBe(false);
    expect(s.note).toBe(NOT_IN_IPC_TABLE);
    expect(s.note).toBe('Not found in the IPC table. Check the Gazette');
    expect(s.offence).toBeNull();
    expect(s.bnsSection).toBe('');
    expect(s.ipcSection).toBe('999');
  });

  it('"999" gives the same result as the explicit "999-IPC" (apart from the input text)', async () => {
    const auto = (await checkBailEligibility(['999'])).sections[0];
    const explicit = (await checkBailEligibility(['999-IPC'])).sections[0];
    expect(explicit.note).toBe(NOT_IN_IPC_TABLE);
    expect({ ...auto, input: '' }).toEqual({ ...explicit, input: '' });
  });

  it('"999" is undetermined in the summary, not a bailable/non-bailable verdict', async () => {
    const { summary } = await checkBailEligibility(['999']);
    expect(summary.overallBailable).toBeNull();
  });

  it('every IPC_INDICATORS number <= 358 has a real table row (so none can be tested unmocked)', () => {
    const table = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'), 'utf-8'),
    ) as { mappings: Record<string, unknown> };
    for (const s of ['302', '304', '304A', '306', '307', '354']) {
      expect(table.mappings[s]).toBeDefined();
    }
  });

  it('an in-range IPC indicator ("302") whose row is missing gets the note and no BNS offence', async () => {
    missingRows.add('302');
    const s = (await checkBailEligibility(['302'])).sections[0];
    expect(s.found).toBe(false);
    expect(s.note).toBe(NOT_IN_IPC_TABLE);
    expect(s.offence).toBeNull();
    expect(s.bnsSection).toBe('');
    expect(s.ipcSection).toBe('302');
  });

  it('with its row present, "302" still converts (guard against over-reach)', async () => {
    const s = (await checkBailEligibility(['302'])).sections[0];
    expect(s.found).toBe(true);
    expect(s.note).toBeUndefined();
    expect(s.bnsSection).toBe('103(1)');
  });
});

// Ajay's sign-off condition: the timeline page shows no line of its own for left-out sections,
// so every sectionsNotFound entry must carry its own API note. The only push path in
// timeline.service.ts is resolveOffence(...).kind === 'not_an_offence' (unknown number, definition
// sub-section, "-IPC" text or junk); an empty token is skipped and is never pushed.
describe('T-278: every timeline sectionsNotFound entry carries a signed note', () => {
  const run = (sections: string[]) => calculateTimeline({ arrestDate: '2026-09-01', sections });

  // Ajay's three signed lines (f4244ec + Addendum 1, 9f11633). Every left-out entry carries
  // exactly one; the number it names is checked rather than the token as typed ("420-IPC" reads
  // "IPC 420 is an old-law section ...").
  const OLD_LAW =
    /^(IPC|CrPC|IEA) \S+ is an old-law section, so it was left out of this period\. Use the section converter to find the (BNS|BNSS|BSA) section\.$/;
  const NOT_OFFENCE =
    /^Section .+ does not create an offence, so it was left out of this period\.$/;
  const NOT_FOUND =
    /^Section .+ was not found in the BNS offences table, so it was left out of this period\. Check the Gazette\.$/;

  const assertNotes = (r: ReturnType<typeof calculateTimeline>) => {
    for (const n of r.sectionsNotFound) {
      const note = r.sectionNotes[n];
      expect(typeof note).toBe('string');
      expect(note.trim().length).toBeGreaterThan(0);
      const matches = [OLD_LAW, NOT_OFFENCE, NOT_FOUND].filter((re) => re.test(note));
      expect(matches).toHaveLength(1);
    }
  };

  const digits = (t: string): string => t.replace(/\D*(\d.*?)\D*$/, '$1');
  const lineFor = (token: string, kind: 'old' | 'none'): string => {
    if (kind === 'none') return notInBnsTableNote(token);
    const m = /ipc|crpc|iea/i.exec(token)![0].toUpperCase();
    const map: Record<string, [string, string]> = {
      IPC: ['IPC', 'BNS'],
      CRPC: ['CrPC', 'BNSS'],
      IEA: ['IEA', 'BSA'],
    };
    return oldLawLeftOutNote(map[m][0], digits(token), map[m][1]);
  };

  it.each([
    [['103', '999'], ['999'], []],
    [['303', '2'], ['2'], []],
    [['420-IPC'], ['420-IPC'], ['420-IPC']],
    [['124-IPC'], ['124-IPC'], ['124-IPC']],
    [['999-IPC'], ['999-IPC'], ['999-IPC']],
    [['abc'], ['abc'], []],
    [['999', '777', '2', '2(1)', '0'], ['999', '777', '2', '2(1)', '0'], []],
  ])('%j -> not found %j, each with the right signed line', (input, expected, oldLaw) => {
    const r = run(input);
    expect(r.sectionsNotFound).toEqual(expected);
    assertNotes(r);
    for (const n of expected) {
      expect(r.sectionNotes[n]).toBe(lineFor(n, oldLaw.includes(n) ? 'old' : 'none'));
    }
  });

  it('an empty / whitespace token is skipped: not in sectionsNotFound, so no note is owed', () => {
    const r = run(['', '   ', '303', '999']);
    expect(r.sectionsNotFound).toEqual(['999']);
    assertNotes(r);
    expect(Object.keys(r.sectionNotes)).not.toContain('');
  });

  it('only empty tokens: nothing is found or not found, and no stray note', () => {
    const r = run(['', ' ']);
    expect(r.sectionsNotFound).toEqual([]);
    expect(r.sectionNotes).toEqual({});
  });

  it('the note key is the trimmed token, matching what sectionsNotFound lists', () => {
    const r = run(['  999  ']);
    expect(r.sectionsNotFound).toEqual(['999']);
    assertNotes(r);
  });

  it('holds on the no-period path and the period path alike', () => {
    assertNotes(run(['999'])); // nothing usable: noPeriodResult
    assertNotes(run(['103', '999'])); // 103 gives a period: full result
    assertNotes(run(['303', '2', '420-IPC']));
  });

  it('a not-found section never appears in sectionsUsed or sectionsWithoutPeriod', () => {
    const r = run(['103', '999', '2']);
    for (const n of r.sectionsNotFound) {
      expect(r.sectionsUsed).not.toContain(n);
      expect(r.sectionsWithoutPeriod).not.toContain(n);
    }
  });
});

// One input per row of Ajay's table, plus the Addendum 1 / R1 checks.
describe('T-278: the three signed left-out lines, one input per row', () => {
  const run = (sections: string[]) => calculateTimeline({ arrestDate: '2026-09-01', sections });
  const OLD_LAW_STEM = 'is an old-law section, so it was left out of this period.';

  it('line 1: "302-IPC" names IPC and points to BNS', () => {
    const r = run(['302-IPC']);
    expect(r.sectionsNotFound).toEqual(['302-IPC']);
    expect(r.sectionNotes['302-IPC']).toBe(
      'IPC 302 is an old-law section, so it was left out of this period. Use the section converter to find the BNS section.',
    );
  });

  it('line 1: "IPC 302" (code first) reads the same as "302-IPC"', () => {
    const r = run(['IPC 302']);
    expect(r.sectionNotes['IPC 302']).toBe(oldLawLeftOutNote('IPC', '302', 'BNS'));
  });

  it('line 1: "CrPC 167" names CrPC and points to BNSS', () => {
    const r = run(['CrPC 167']);
    expect(r.sectionsNotFound).toEqual(['CrPC 167']);
    expect(r.sectionNotes['CrPC 167']).toBe(
      'CrPC 167 is an old-law section, so it was left out of this period. Use the section converter to find the BNSS section.',
    );
  });

  it('line 1: "IEA 65B" names IEA and points to BSA, sub-section letter kept as typed', () => {
    const r = run(['IEA 65B']);
    expect(r.sectionsNotFound).toEqual(['IEA 65B']);
    expect(r.sectionNotes['IEA 65B']).toBe(
      'IEA 65B is an old-law section, so it was left out of this period. Use the section converter to find the BSA section.',
    );
  });

  it('line 1: an old-law code in any position, with a sub-section ("124(1)-IPC")', () => {
    const r = run(['124(1)-IPC']);
    expect(r.sectionNotes['124(1)-IPC']).toBe(oldLawLeftOutNote('IPC', '124(1)', 'BNS'));
  });

  it('line 2: a real non-offence (316(1): parent row has variants, none match)', () => {
    const r = run(['316(1)']);
    expect(r.sectionsNotFound).toEqual(['316(1)']);
    expect(r.sectionNotes['316(1)']).toBe(
      'Section 316(1) does not create an offence, so it was left out of this period.',
    );
    expect(r.sectionNotes['316(1)']).toBe(leftOutOfPeriodNote('316(1)'));
  });

  it('line 3: "999" has no BNS row', () => {
    const r = run(['999']);
    expect(r.sectionsNotFound).toEqual(['999']);
    expect(r.sectionNotes['999']).toBe(
      'Section 999 was not found in the BNS offences table, so it was left out of this period. Check the Gazette.',
    );
  });

  it('line 3: "BNSS 187" is a code other than BNS: not found, never the old-law line', () => {
    const r = run(['BNSS 187']);
    expect(r.sectionsNotFound).toEqual(['BNSS 187']);
    const note = r.sectionNotes['BNSS 187'];
    expect(note).toBe(notInBnsTableNote('BNSS 187'));
    expect(note).toMatch(/was not found in the BNS offences table/);
    expect(note).not.toContain(OLD_LAW_STEM);
  });

  it('line 3: text ("abc") and a sub-section with no row ("2(1)")', () => {
    const r = run(['abc', '2(1)']);
    expect(r.sectionNotes['abc']).toBe(notInBnsTableNote('abc'));
    expect(r.sectionNotes['2(1)']).toBe(notInBnsTableNote('2(1)'));
  });

  it('"103-BNS" and "BNS 103" read as 103: they get the period (90 days), not left out', () => {
    for (const token of ['103-BNS', 'BNS 103']) {
      const r = run([token]);
      expect(r.sectionsNotFound).toEqual([]);
      expect(r.sectionsUsed).toEqual([token]);
      expect(r.judicialCustodyDays).toBe(90);
    }
    expect(run(['103']).judicialCustodyDays).toBe(90);
  });

  it('R1: "BNS 103(1)" reads exactly like "103(1)": no period, same Depends note', () => {
    const a = run(['103(1)']);
    const b = run(['BNS 103(1)']);
    expect(a.sectionsWithoutPeriod).toEqual(['103(1)']);
    expect(b.sectionsWithoutPeriod).toEqual(['BNS 103(1)']);
    expect(b.sectionsNotFound).toEqual([]);
    expect(b.sectionsUsed).toEqual([]);
    expect(a.sectionNotes['103(1)']).toBe(
      'Section 103(1): Depends on the offence. Check BNSS section 187.',
    );
    expect(b.sectionNotes['BNS 103(1)']).toBe(a.sectionNotes['103(1)']);
    expect(b.judicialCustodyDays).toBe(a.judicialCustodyDays);
    expect(b.periodNote).toBe(a.periodNote);
  });

  it('every sectionsNotFound entry in one mixed request carries exactly one of the three lines', () => {
    const tokens = ['302-IPC', 'CrPC 167', 'IEA 65B', '316(1)', '999', 'BNSS 187', 'abc', '103'];
    const r = run(tokens);
    expect(r.sectionsNotFound).toEqual(tokens.filter((t) => t !== '103'));
    const lines = [
      /is an old-law section, so it was left out of this period\. Use the section converter to find the (BNS|BNSS|BSA) section\.$/,
      /^Section .+ does not create an offence, so it was left out of this period\.$/,
      /^Section .+ was not found in the BNS offences table, so it was left out of this period\. Check the Gazette\.$/,
    ];
    for (const n of r.sectionsNotFound) {
      expect(lines.filter((re) => re.test(r.sectionNotes[n]))).toHaveLength(1);
    }
    expect(r.sectionsUsed).toEqual(['103']);
  });
});
