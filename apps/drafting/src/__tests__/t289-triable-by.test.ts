/**
 * T-289: the bail check takes the trial court from the BNSS First Schedule
 * (bns-triable-by.json, signed by Ajay 12 Oct 2026), never from the maximum term.
 * Expected values are written from the signed file, not from the resolver.
 */
import './setupEnv';
import './setupDb';

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { checkBailEligibility, COURT_LEVEL_DEPENDS } from '../services/bail-check.service';
import { resolveOffence, resolveTriableBy } from '../services/bns-offence-resolver';
import { getSectionDetail } from '../services/sections.service';

const SERVICES = path.join(__dirname, '..', 'services');
const CONFIG = path.join(__dirname, '..', 'config');
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const SESSION = 'Court of Session';
const FIRST_CLASS = 'Magistrate of the first class';
const ANY = 'Any Magistrate';
const REF = 'Court by which offence abetted is triable';

const court = async (inputs: string[]) => (await checkBailEligibility(inputs)).summary.courtLevel;

describe('T-289 signed files are untouched', () => {
  it('bns-triable-by.json matches the signed SHA-256 (Addendum 1)', () => {
    expect(sha(path.join(CONFIG, 'bns-triable-by.json'))).toBe(
      'aa68395db2643298041df1597697a280e939aefeecd3805c84bd77903f7bbc05',
    );
  });

  it('bns-offences.json is still the signed T-277 file', () => {
    expect(sha(path.join(CONFIG, 'bns-offences.json'))).toBe(
      '5f0ac29ad09aaed919826275cf22c425766c8dc7196dd089bfd5c8dacecb07de',
    );
  });
});

describe('T-289 AC3: bail check shows the signed court', () => {
  it('a 3-7 year Magistrate-triable offence (74) shows the Magistrate value, not Sessions', async () => {
    const result = await checkBailEligibility(['74']);
    expect(result.summary.courtLevel).toBe(ANY);
    expect(result.summary.courtLevel).not.toMatch(/Session/);
    expect(result.summary.recommendation).not.toMatch(/Session/);
  });

  it('a Magistrate-triable offence above 7 years (81) shows first class', async () => {
    expect(await court(['81'])).toBe(FIRST_CLASS);
  });

  it('a Sessions-triable offence (103) shows "Court of Session"', async () => {
    expect(await court(['103'])).toBe(SESSION);
  });

  it.each(['47', '61'])('an unknown row (%s) shows exactly the signed Depends text', async (s) => {
    expect(COURT_LEVEL_DEPENDS).toBe('Depends on the offence. Check the First Schedule.');
    expect(await court([s])).toBe(COURT_LEVEL_DEPENDS);
  });

  it.each(['356(3)', '356(4)', '357'])(
    '%s (null after Addendum 1) shows exactly the Depends text',
    async (s) => {
      expect(await court([s])).toBe(COURT_LEVEL_DEPENDS);
      const d = await getSectionDetail(s, 'BNS');
      expect(d?.triable_by).toBeNull();
    },
  );

  it('the court explanation is always empty', async () => {
    for (const s of [['74'], ['103'], ['61'], ['74', '103']]) {
      expect((await checkBailEligibility(s)).summary.courtLevelExplanation).toBe('');
    }
  });
});

describe('T-289 multi-section rules', () => {
  it('any Court of Session wins over a known Magistrate', async () => {
    expect(await court(['74', '103'])).toBe(SESSION);
  });

  it('Court of Session wins over a null value', async () => {
    expect(await court(['47', '103'])).toBe(SESSION);
  });

  it('Court of Session wins over a reference value', async () => {
    expect(await court(['49', '103'])).toBe(SESSION);
  });

  it('first class beats Any Magistrate', async () => {
    expect(await court(['115', '81'])).toBe(FIRST_CLASS);
    expect(await court(['74', '81'])).toBe(FIRST_CLASS);
  });

  it('all Any Magistrate stays Any Magistrate', async () => {
    expect(await court(['74', '115'])).toBe(ANY);
  });

  it('a null value gives Depends when no section is Court of Session', async () => {
    expect(await court(['47', '81'])).toBe(COURT_LEVEL_DEPENDS);
  });

  it('a reference value gives Depends when no section is Court of Session', async () => {
    expect(await court(['49', '115'])).toBe(COURT_LEVEL_DEPENDS);
  });

  it('a reference value never decides a multi-section result', async () => {
    expect(await court(['49', '50'])).toBe(COURT_LEVEL_DEPENDS);
  });

  it('a single reference value shows as printed', async () => {
    expect(await court(['49'])).toBe(REF);
  });

  it('an unmapped IPC section counts as unknown', async () => {
    const r = await checkBailEligibility(['81', '999-IPC']);
    expect(r.summary.courtLevel).toBe(COURT_LEVEL_DEPENDS);
  });
});

describe('T-289 variant and parent resolution', () => {
  it('a sub-section with variants uses its own value', () => {
    expect(resolveTriableBy('119(1)')).toBe(FIRST_CLASS);
    expect(resolveTriableBy('119(2)')).toBe(SESSION);
    expect(resolveTriableBy('117(2)')).toBe(ANY);
    expect(resolveTriableBy('117(3)')).toBe(SESSION);
  });

  it('a nested variant resolves to its printed value', () => {
    expect(resolveTriableBy('61(2)(b)')).toBe(FIRST_CLASS);
  });

  it('the parent row of a varianted section is null (Depends)', () => {
    expect(resolveTriableBy('119')).toBeNull();
    expect(resolveTriableBy('61')).toBeNull();
  });

  it('a variant that is null gives Depends', () => {
    expect(resolveTriableBy('356(2)')).toBeNull();
    expect(resolveTriableBy('356(3)')).toBeNull();
    expect(resolveTriableBy('356(4)')).toBeNull();
  });

  it('a sub-section with no row of its own falls back to the parent row', () => {
    expect(resolveTriableBy('103(1)')).toBe(SESSION);
    expect(resolveTriableBy('316(2)')).toBe(FIRST_CLASS);
    expect(resolveOffence('103(1)').triableBy).toBe(SESSION);
  });

  it('an unknown key is null, never a guess', () => {
    expect(resolveTriableBy('999999')).toBeNull();
    expect(resolveTriableBy('')).toBeNull();
  });

  it('bail check on a variant shows the sub-section value', async () => {
    expect(await court(['119(1)'])).toBe(FIRST_CLASS);
    expect(await court(['119(2)'])).toBe(SESSION);
    expect(await court(['119'])).toBe(COURT_LEVEL_DEPENDS);
  });

  it('GET /details triable_by is the printed string or null', async () => {
    expect((await getSectionDetail('74', 'BNS'))?.triable_by).toBe(ANY);
    expect((await getSectionDetail('49', 'BNS'))?.triable_by).toBe(REF);
    expect((await getSectionDetail('47', 'BNS'))?.triable_by).toBeNull();
    expect((await getSectionDetail('119(2)', 'BNS'))?.triable_by).toBe(SESSION);
  });
});

describe('T-289 guard: no term-to-court rule in the services', () => {
  const read = (f: string) => fs.readFileSync(path.join(SERVICES, f), 'utf8');

  it('bail-check.service.ts has no Sessions court string or term-based court rule', () => {
    const src = read('bail-check.service.ts');
    expect(src).not.toMatch(/Court of Sessions/);
    expect(src).not.toMatch(/generally triable/);
    expect(src).not.toMatch(/JMFC/);
    const fn = src.slice(src.indexOf('function determineCourtLevel'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toMatch(/[Yy]ears/);
    expect(body).not.toMatch(/[<>]=?\s*\d/);
  });

  it('sections.service.ts does not infer triable_by from max_years', () => {
    const src = read('sections.service.ts');
    expect(src).not.toMatch(/inferTriableBy/);
    expect(src).not.toMatch(/'Sessions'/);
    expect(src).not.toMatch(/'Magistrate'/);
  });
});
