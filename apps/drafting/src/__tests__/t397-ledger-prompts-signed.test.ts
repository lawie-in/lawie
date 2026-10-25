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
  // T-471 (Ajay, 722c548a and acbec79f, 16 Oct 2026): re-pinned with his signed rule-4 sentence; removing
  // that sentence from each prompt gives the previous hash (checked), so nothing else moved. D1 is unchanged.
  it('LEDGER prompt hash is the signed one', () => {
    expect(sha(DRAFTER_LEDGER_SYSTEM_PROMPT)).toBe(
      '516590deae9a9dc535820dd77f2dd1a86c58acec0501e4c52ef1a0e22c17db8b',
    );
  });
  it('LEDGER_REPAIR prompt hash is the signed one', () => {
    expect(sha(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT)).toBe(
      'e242d06bf65ecc90e845345bdc6881590c5c27a64fb34ad792e2bfe6c4ac2dd6',
    );
  });
  it('FACT_REPAIR prompt hash is unchanged (signed as is)', () => {
    expect(sha(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT)).toBe(
      '02bcc090839b9ce435d78b25fef20bb5a12670b59c7f7486c365321f29341254',
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
  // T-471 (Ajay, 722c548a and acbec79f, 16 Oct 2026): re-pinned with his signed rule-4 sentence; removing
  // that sentence from each prompt gives the previous hash (checked), so nothing else moved. D1 is unchanged.
  it('PACK, REPAIR, D1 hashes are as re-pinned in T-440; GUIDED is as signed in T-422', () => {
    expect(sha(DRAFTER_PACK_SYSTEM_PROMPT)).toBe(
      'bf32e87547753a13f04969f68adafce37a2cd867c1968cc359ae744d11e57e10',
    );
    expect(sha(DRAFTER_REPAIR_SYSTEM_PROMPT)).toBe(
      'f8b43cf15bdc5446e52cc04a77761b2126aea49ad758bc8c136b36f4a9352ab4',
    );
    expect(sha(DRAFTER_GUIDED_SYSTEM_PROMPT)).toBe(
      'c15ffcd16d0782ae56708158d671212b06818b91945919f14f9d7504a8f1bb72',
    );
    expect(sha(DRAFTER_D1_SYSTEM_PROMPT)).toBe(
      '55aa15b13adeb0f2061e5441d2dfad7e214fe8b1e5a64cf9370dd0945816537d',
    );
  });
});
