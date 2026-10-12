/**
 * T-255 - corrected CrPC to BNSS table.
 * Legal sign-off: Ajay (CLO), 12 Oct 2026,
 * handoff/legal/T-255-crpc-to-bnss-corrected-signed.md.
 * Expected values are copied from the signed document.
 */
import './setupEnv';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const FILE = path.join(__dirname, '..', 'config', 'sections', 'crpc-to-bnss.json');
const SHA = 'b9276355f73e62195c9a5755a30a9d5f01b708543b70f1615b793d9b57af8cd7';

interface Row {
  new: string | null;
  type: string;
  new_title: string | null;
  note?: string;
}
const table = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as {
  meta: { old_code: string; new_code: string };
  mappings: Record<string, Row>;
};
const m = table.mappings;

describe('T-255 crpc-to-bnss.json', () => {
  it('is byte for byte the signed block (SHA-256)', () => {
    expect(createHash('sha256').update(fs.readFileSync(FILE)).digest('hex')).toBe(SHA);
  });

  it('is CrPC to BNSS with 535 mappings', () => {
    expect(table.meta.old_code).toBe('CrPC');
    expect(table.meta.new_code).toBe('BNSS');
    expect(Object.keys(m)).toHaveLength(535);
  });

  describe("Ajay's named corrections", () => {
    const named: [string, string][] = [
      ['358', '399'],
      ['362', '403'],
      ['166A', '112'],
      ['166B', '113'],
      ['39', '33'],
      ['40', '34'],
      ['41C', '37'],
      ['357B', '396(7)'],
    ];
    it.each(named)('CrPC %s maps to BNSS %s', (old, bnss) => {
      expect(m[old].new).toBe(bnss);
    });

    it('CrPC 358 to 362 run 399 to 403', () => {
      expect(['358', '359', '360', '361', '362'].map((k) => m[k].new)).toEqual([
        '399',
        '400',
        '401',
        '402',
        '403',
      ]);
    });

    it('CrPC 39 and 40 are no longer marked repealed', () => {
      expect(m['39'].type).toBe('direct');
      expect(m['40'].type).toBe('direct');
    });

    it('CrPC 166A / 166B no longer point at BNSS 186(2) / 186(3)', () => {
      expect(m['166A'].new).not.toBe('186(2)');
      expect(m['166B'].new).not.toBe('186(3)');
    });

    it('CrPC 362 is not BNSS 402 and 358 is not BNSS 398', () => {
      expect(m['362'].new).not.toBe('402');
      expect(m['358'].new).not.toBe('398');
    });
  });

  describe('deleted rows (encoded as new: null, type: repealed)', () => {
    it.each(['10', '27', '144A', '153', '355', '404'])('CrPC %s has no BNSS section', (k) => {
      expect(m[k].new).toBeNull();
      expect(m[k].new_title).toBeNull();
      expect(m[k].type).toBe('repealed');
      expect(m[k].note).toMatch(/Deleted in BNSS/);
    });

    it('the eleven repealed rows are the six new deletions plus the five older repeals', () => {
      const repealed = Object.keys(m)
        .filter((k) => m[k].type === 'repealed')
        .sort();
      expect(repealed).toEqual(
        ['10', '27', '144A', '153', '355', '404', '8', '16', '17', '18', '19'].sort(),
      );
      for (const k of repealed) expect(m[k].new).toBeNull();
    });

    it('no non-repealed row has a null target', () => {
      const bad = Object.keys(m).filter((k) => m[k].type !== 'repealed' && m[k].new === null);
      expect(bad).toEqual([]);
    });
  });

  describe('pairs Ajay relies on are unchanged', () => {
    const kept: [string, string][] = [
      ['154', '173'],
      ['438', '482'],
      ['439', '483'],
      ['167', '187'],
      ['437', '480'],
      ['41', '35'],
      ['97', '100'],
      ['245', '268'],
    ];
    it.each(kept)('CrPC %s still maps to BNSS %s', (old, bnss) => {
      expect(m[old].new).toBe(bnss);
    });
  });

  it('other signed sub-section targets: 41A to 35(3), CrPC 12 to 10, CrPC 29 to 23', () => {
    expect(m['41A'].new).toBe('35(3)');
    expect(m['12'].new).toBe('10');
    expect(m['29'].new).toBe('23');
  });

  it('new_provisions has the nine entries signed in T-250 section B', () => {
    const np = (JSON.parse(fs.readFileSync(FILE, 'utf-8')) as { new_provisions: object })
      .new_provisions;
    expect(Object.keys(np).sort()).toEqual(
      ['173(1)', '173(3)', '176(3)', '187(3)', '193(3)', '356', '398', '413', '530'].sort(),
    );
  });
});
