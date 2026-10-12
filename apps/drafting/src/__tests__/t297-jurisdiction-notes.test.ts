/**
 * T-297 - court-rules jurisdiction notes no longer state the court by maximum term.
 * Expected strings are Ajay's signed literals (handoff/legal/T-297-jurisdiction-notes-signed.md),
 * never derived from the pack files under test.
 */
import './setupEnv';
import './setupDb';

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { checkBailEligibility } from '../services/bail-check.service';
import { invalidateCache } from '../services/sections.service';

const RULES_DIR = path.join(__dirname, '..', 'config', 'court-rules');

const OLD_A = 'Sessions courts try offences punishable with imprisonment exceeding 7 years.';
const NEW_A =
  'Which court tries an offence is set by the First Schedule to BNSS, not by the length of the sentence.';
const NEW_B =
  'Tries the offences that the First Schedule to BNSS makes triable by the Court of Session, and cases committed to it by a Magistrate. Hears bail applications under Section 483 BNSS.';

const SHA_A = '32c958e86b86d9e6d83b41f347a74d4b766340745877c50d2e9bd201abf01858';
const NEW_JMFC_FIRST =
  'Tries the offences that the First Schedule to BNSS makes triable by a Magistrate of the first class or by any Magistrate.';
const JMFC_REST =
  ' For bail, handles bailable offences and first-instance non-bailable bail applications under S.480 BNSS.';
const SHA_JMFC = 'c9ac5754d725c886bc10d8ecda1b5bbe6e2e157dbb37768df00c0986b620d431';
const SHA_B = '74a3aff7d34ed8fd68efaf4d1c31b6a8fef92e3cc9acd37e9e0960d3d018f58e';

const PACKS_WITH_A = [
  'an',
  'ap',
  'as',
  'bihar',
  'cg',
  'delhi',
  'ga',
  'gj',
  'hp',
  'hr',
  'jharkhand',
  'jk',
  'ka',
  'kl',
  'ld',
  'mh',
  'mp',
  'od',
  'pb',
  'rj',
  'sk',
  'tn',
  'ts',
  'uk',
  'up',
  'wb',
].map((p) => `${p}_district`);

const notes: Record<string, string> = {};
for (const f of fs.readdirSync(RULES_DIR).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), 'utf8'));
  notes[f.replace(/\.json$/, '')] = j.jurisdictionNote;
}
const NAMES = Object.keys(notes);

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('T-297 AC1: no court-by-term rule in any jurisdictionNote', () => {
  it('loads every pack and each has a string note', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(51);
    for (const n of NAMES) expect(typeof notes[n]).toBe('string');
  });

  // Court-by-term phrasing in any form. Money limits ("up to Rs 20 lakh") are not matched:
  // the patterns need "imprisonment" before the limit or a number/word followed by "years".
  const TERM_IMPRISONMENT =
    /punishable with imprisonment\s+(up\s*to|upto|exceeding|not exceeding)/i;
  const TERM_YEARS =
    /(up\s*to|upto|exceeding|not exceeding)\s+(\d+|seven|three|ten|one|two|five)\s+years?/i;

  it.each(NAMES.filter((n) => n !== 'cjm_generic'))('%s states no court by maximum term', (n) => {
    expect(notes[n]).not.toMatch(TERM_IMPRISONMENT);
    expect(notes[n]).not.toMatch(TERM_YEARS);
  });

  it('the term patterns flag the old phrasings and ignore money limits', () => {
    expect('Tries offences punishable with imprisonment up to 3 years.').toMatch(TERM_IMPRISONMENT);
    expect('Tries offences punishable with imprisonment up to 3 years.').toMatch(TERM_YEARS);
    expect(OLD_A).toMatch(TERM_IMPRISONMENT);
    expect(OLD_A).toMatch(TERM_YEARS);
    expect('Claims up to Rs 50 lakh; exceeding Rs 1 crore goes to NCDRC.').not.toMatch(TERM_YEARS);
    expect('Claims up to Rs 50 lakh; exceeding Rs 1 crore goes to NCDRC.').not.toMatch(
      TERM_IMPRISONMENT,
    );
  });

  it('cjm_generic keeps only its S.23 sentencing line', () => {
    expect(notes.cjm_generic).toContain('exceeding seven years (S.23 BNSS)');
    expect(notes.cjm_generic).toBe(
      'Chief Judicial Magistrate (S.10 BNSS). May pass any sentence authorised by law except death, imprisonment for life or imprisonment for a term exceeding seven years (S.23 BNSS). Has powers of remand (S.187 BNSS), first bail hearing for non-bailable offences within CJM jurisdiction, and supervisory authority over JMFCs in the district.',
    );
  });

  it.each(NAMES)('%s does not contain the old A sentence or a court-by-term phrase', (n) => {
    expect(notes[n]).not.toContain(OLD_A);
    expect(notes[n]).not.toMatch(/Sessions courts? try offences punishable/i);
    expect(notes[n]).not.toMatch(/triable by (the )?Sessions Court/i);
  });
});

describe('T-297 AC2: signed text applied exactly', () => {
  it('lists 26 packs', () => {
    expect(PACKS_WITH_A).toHaveLength(26);
  });

  it.each(PACKS_WITH_A)('%s contains sentence A exactly once', (n) => {
    expect(notes[n]).toBeDefined();
    expect(count(notes[n], NEW_A)).toBe(1);
  });

  it('packs outside the 26 do not carry sentence A', () => {
    for (const n of NAMES.filter((x) => !PACKS_WITH_A.includes(x))) {
      expect(notes[n]).not.toContain(NEW_A);
    }
  });

  it('sessions_generic note equals B exactly', () => {
    expect(notes.sessions_generic).toBe(NEW_B);
  });

  it('jmfc_generic starts with the Addendum 1 sentence and keeps the S.480 remainder exactly', () => {
    expect(notes.jmfc_generic.startsWith(NEW_JMFC_FIRST)).toBe(true);
    expect(notes.jmfc_generic).not.toContain('up to 3 years');
    expect(notes.jmfc_generic.slice(NEW_JMFC_FIRST.length)).toBe(JMFC_REST);
    expect(notes.jmfc_generic).toBe(NEW_JMFC_FIRST + JMFC_REST);
  });

  it('A and B literals match the signed SHA-256s', () => {
    const sha = (s: string) => createHash('sha256').update(`${s}\n`).digest('hex');
    expect(sha(NEW_A)).toBe(SHA_A);
    expect(sha(NEW_B)).toBe(SHA_B);
    expect(sha(NEW_JMFC_FIRST)).toBe(SHA_JMFC);
  });

  // The SHA-256 test above is the authority on the signed text. The signed markdown lives on
  // origin/develop_staging and may be absent from this worktree, so there is no file-based check here.
  // (Reading it is a manual step: git show origin/develop_staging:handoff/legal/T-297-...-signed.md.)
});

describe('T-297 AC3: BNSS 480/483 bail advice unchanged', () => {
  afterEach(() => invalidateCache());

  it("['103'] (above 7 years) -> BNSS 483", async () => {
    const { summary } = await checkBailEligibility(['103']);
    expect(summary.bnssBailSection).toBe('483');
    expect(summary.recommendation).toContain('filed under BNSS Section 483');
  });

  it("['74'] (up to 7 years) -> BNSS 480", async () => {
    const { summary } = await checkBailEligibility(['74']);
    expect(summary.bnssBailSection).toBe('480');
    expect(summary.recommendation).toContain('filed under BNSS Section 480');
  });
});
