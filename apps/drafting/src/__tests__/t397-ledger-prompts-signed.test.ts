/**
 * T-397: the three legacy ledger prompts, as Ajay signed them
 * (handoff/legal/T-397-ledger-prompts-signed.md, 13 Oct 2026).
 * Change these pins only with a fresh signed diff.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import {
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_GUIDED_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_FACT_REPAIR_SYSTEM_PROMPT,
  DRAFTER_D1_SYSTEM_PROMPT,
} from '../services/drafter.prompts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// Ajay's exact strings (signed file, changes A, B, C).
const A =
  "Never write a person's relation (S/o, D/o, W/o, H/o) or the name of a parent or spouse that FACTS does not give; write {{MISSING: relation and name of parent or spouse}} in its place.";
const B_OLD =
  'Do not say an offence is bailable or non-bailable, that a claim is within limitation,';
const B_NEW =
  'Do not say an offence is bailable or non-bailable, that an offence is complete, that a claim is within limitation,';
const C_ANCHOR = 'print each in the words of its display, exactly.';
const C = `${C_ANCHOR} Do not convert date formats.`;

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('T-397 AC2: signed text pinned byte for byte', () => {
  it('LEDGER prompt hash is the signed one', () => {
    expect(sha(DRAFTER_LEDGER_SYSTEM_PROMPT)).toBe(
      '874b2b129f8ceadd811fb822aa55e741c4c907e5ba3cb60bdb2b8b55dd2ef99a',
    );
  });
  it('LEDGER_REPAIR prompt hash is the signed one', () => {
    expect(sha(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT)).toBe(
      'a0075fbbd1c0b56d8e32164739557fdd7f95230abded0d1b00eaadd91cf9d677',
    );
  });
  it('FACT_REPAIR prompt hash is unchanged (signed as is)', () => {
    expect(sha(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT)).toBe(
      '19d075fea6ed01208eaf41ace68f097078ea69fb05da8390706d6f1760da5ef4',
    );
  });
});

describe("T-397 AC2: Ajay's changes A, B and C are present in the right prompt", () => {
  it('A: LEDGER rule 1 ends with the relation sentence, once, and only there', () => {
    expect(count(DRAFTER_LEDGER_SYSTEM_PROMPT, A)).toBe(1);
    const rule1 = DRAFTER_LEDGER_SYSTEM_PROMPT.split('\n').find((l) => /^1\./.test(l));
    expect(rule1).toBeDefined();
    expect(rule1!.endsWith(A)).toBe(true);
    expect(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT).not.toContain(A);
    expect(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT).not.toContain(A);
  });

  it('B: "that an offence is complete" is in LEDGER rule 9 and LEDGER_REPAIR rule 6', () => {
    expect(count(DRAFTER_LEDGER_SYSTEM_PROMPT, B_NEW)).toBe(1);
    expect(count(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT, B_NEW)).toBe(1);
    const r9 = DRAFTER_LEDGER_SYSTEM_PROMPT.split('\n').find((l) => /^9\./.test(l));
    const r6 = DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT.split('\n').find((l) => /^6\./.test(l));
    expect(r9).toContain(B_NEW);
    expect(r6).toContain(B_NEW);
  });

  it('B (T-422): PACK, REPAIR and GUIDED carry the signed wording exactly once', () => {
    const signed =
      'bailable or non-bailable, that an offence is complete, that a claim is within limitation,';
    for (const p of [
      DRAFTER_PACK_SYSTEM_PROMPT,
      DRAFTER_REPAIR_SYSTEM_PROMPT,
      DRAFTER_GUIDED_SYSTEM_PROMPT,
    ]) {
      expect(count(p, signed)).toBe(1);
      expect(p).not.toContain('bailable or non-bailable, that a claim is within limitation,');
    }
  });

  it('B: the old wording without "an offence is complete" is gone from both', () => {
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).not.toContain(B_OLD);
    expect(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT).not.toContain(B_OLD);
  });

  it('C: LEDGER_REPAIR rule 2 says not to convert date formats, once, in rule 2', () => {
    expect(count(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT, C)).toBe(1);
    const r2 = DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT.split('\n').find((l) => /^2\./.test(l));
    expect(r2).toContain(C);
  });
});

describe('T-397 AC3: PROPOSED is gone', () => {
  const src = readFileSync(path.join(__dirname, '..', 'services', 'drafter.prompts.ts'), 'utf8');
  it('drafter.prompts.ts has no "PROPOSED" marker, in any case', () => {
    expect(src).not.toMatch(/PROPOSED/i);
  });
  it('the sign-off is cited in the file', () => {
    expect(src).toContain('handoff/legal/T-397-ledger-prompts-signed.md');
  });
  it('no prompt text carries the word', () => {
    for (const p of [
      DRAFTER_LEDGER_SYSTEM_PROMPT,
      DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
      DRAFTER_FACT_REPAIR_SYSTEM_PROMPT,
    ]) {
      expect(p).not.toMatch(/PROPOSED/i);
    }
  });
});

describe('T-397: prompts outside the review are unchanged', () => {
  // Baseline: drafter.prompts.ts at 4f7ffed, the parent of the T-397 change.
  // PACK, REPAIR and GUIDED were re-pinned in T-422 (Ajay's signed change B applied to them);
  // T-440 (Ajay, a9bc957 and 4b46053): the signed not-known date line was added to PACK,
  // REPAIR, LEDGER, LEDGER_REPAIR and D1 (end of rule 3), so those five were re-pinned
  // (re-pinning approved for T-440 only). GUIDED is unchanged.
  it('PACK, REPAIR, D1 hashes are as re-pinned in T-440; GUIDED is as signed in T-422', () => {
    expect(sha(DRAFTER_PACK_SYSTEM_PROMPT)).toBe(
      '28257542afb486fb1b4fc388c6c8f474cf6070536749d24ef149fa709d41e41e',
    );
    expect(sha(DRAFTER_REPAIR_SYSTEM_PROMPT)).toBe(
      '1679478acb0396cc7daf52fd3703d0bac0ba1caaf683f5d03975cbee9a263e07',
    );
    expect(sha(DRAFTER_GUIDED_SYSTEM_PROMPT)).toBe(
      'df9483c61babd16c0dc96bb5eb5720f62e64bddcd7df2b7d6c3145b38449ef6c',
    );
    expect(sha(DRAFTER_D1_SYSTEM_PROMPT)).toBe(
      '55aa15b13adeb0f2061e5441d2dfad7e214fe8b1e5a64cf9370dd0945816537d',
    );
  });
});
