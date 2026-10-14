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
      '500558b0430ccd90b5704106bc12a345cd84b8f6692b605643c00c32ab69c56d',
    );
  });
  it('LEDGER_REPAIR prompt hash is the signed one', () => {
    expect(sha(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT)).toBe(
      '0bf7e391a79234e33763702cb3e356bfd80724f2fdca067d75ff98b1833dc714',
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
  it('PACK, REPAIR, GUIDED and D1 hashes are as before', () => {
    expect(sha(DRAFTER_PACK_SYSTEM_PROMPT)).toBe(
      '2db4baabd467aaece3f56bf2e6fff4c79cfbcfeda5a18e7f755299bab8218065',
    );
    expect(sha(DRAFTER_REPAIR_SYSTEM_PROMPT)).toBe(
      '42aab92426027f010dd5368d6b5870f7635cf0b118600c6a78c6299c33f0b928',
    );
    expect(sha(DRAFTER_GUIDED_SYSTEM_PROMPT)).toBe(
      '852a3da1b12694691b2f0280d0d25e899f0fca4c44d2a2b6cca97bf1c9bb375e',
    );
    expect(sha(DRAFTER_D1_SYSTEM_PROMPT)).toBe(
      '69ba56505e34947ef33b5cc446eaa59e14b188fe9e6ff0fa4cd22d91672add87',
    );
  });
});
