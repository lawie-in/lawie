/**
 * T-347: a four-digit section number cited under any of the six codes (BNS, BNSS, BSA,
 * IPC, CrPC, IEA) gets the existing invalid_section warning. Ajay's rulings:
 * Q1 1800-2099 read as years and are never flagged; Q2 only with a section cue or a
 * code next to the number, so bare four-digit numbers stay unchecked.
 *
 * Pure functions, no database, no model.
 */
import { extractActCitations, validateSectionReferences } from '../services/validator';

const verified = (section: string, code: string) =>
  `Section ${section} of ${code} not found in the verified section mapping. Please verify this reference.`;

const warn = (text: string) => validateSectionReferences(text, null);
const pairs = (text: string) => warn(text).map((w) => `${w.details?.code}:${w.details?.section}`);

describe('T-347 four-digit section numbers are flagged (AC1)', () => {
  it.each([
    ['BNS 1034', 'BNS', '1034'],
    ['Section 1034 BNSS', 'BNSS', '1034'],
    ['Section 4521 of the BSA', 'BSA', '4521'],
    ['s. 1034 of the IPC', 'IPC', '1034'],
    ['CrPC 4521', 'CrPC', '4521'],
    ['Section 9999 IEA', 'IEA', '9999'],
    ['u/s 9999 BSA', 'BSA', '9999'],
  ])('%s -> invalid_section for %s %s', (text, code, section) => {
    const w = warn(text);
    expect(w).toHaveLength(1);
    expect(w[0]).toEqual({
      type: 'invalid_section',
      message: verified(section, code),
      details: { section, code },
    });
  });

  it("keeps today's wording exactly", () => {
    expect(warn('BNS 1034')[0].message).toBe(
      'Section 1034 of BNS not found in the verified section mapping. Please verify this reference.',
    );
  });

  it('keeps a sub-section tail and reads a letter suffix as upper case', () => {
    expect(pairs('BNS 1034(2)')).toEqual(['BNS:1034(2)']);
    expect(pairs('IPC 1034a')).toEqual(['IPC:1034A']);
  });

  it('extractActCitations restores the original number, not the stand-in', () => {
    const cites = extractActCitations('Section 1034 BNSS');
    expect(cites).toHaveLength(1);
    expect(cites[0]).toMatchObject({ act: 'BNSS', number: '1034' });
    expect(JSON.stringify(cites)).not.toContain('zqf');
  });
});

describe('T-347 Q1: 1800-2099 read as years (AC2)', () => {
  it.each(['1799', '2100'])('%s is flagged (just outside the span)', (n) => {
    expect(pairs(`Section ${n} BNSS`)).toEqual([`BNSS:${n}`]);
  });

  it.each(['1800', '2023', '2099'])('%s is not flagged', (n) => {
    expect(warn(`Section ${n} BNSS`)).toEqual([]);
    expect(warn(`BNS ${n}`)).toEqual([]);
  });
});

describe('T-347 Q2: no cue or code next to it, no check (AC3)', () => {
  it.each([
    'Rs 1500 paid',
    'Rs.1500 paid',
    'page 1034 of the paper book',
    'He waited 1034 days',
    'Cheque no. 302/1034',
    'Amount of 1,034 was seized',
  ])('%s -> no warning', (text) => {
    expect(warn(text)).toEqual([]);
  });

  it('a bare number beside an unrelated word is unchecked even in a draft that cites BNS elsewhere', () => {
    expect(pairs('Rs 1500 paid. See BNS 103.')).toEqual([]);
  });
});

describe('T-347 ranges and mixed text (AC1, AC3)', () => {
  it('ss. 10-1034 BNS: 10 is valid, 1034 flagged', () => {
    expect(pairs('ss. 10-1034 BNS')).toEqual(['BNS:1034']);
  });

  it('ss. 10-2023 BNS: nothing flagged', () => {
    expect(warn('ss. 10-2023 BNS')).toEqual([]);
  });

  it('valid three-digit citations are unaffected', () => {
    expect(warn('Section 103 BNS and Section 482 BNSS')).toEqual([]);
  });

  it('flags only the four-digit one when mixed with a valid one', () => {
    expect(pairs('Section 103 BNS and Section 1034 BNSS')).toEqual(['BNSS:1034']);
  });
});
