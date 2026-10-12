/**
 * T-270 - the post-draft section validator reads code-first citations and checks each
 * number against its own Act (Ajay's rulings Q1-Q8, 12 Oct 2026; Q6 withdrawn).
 *
 *  Q1 forms: "Section N", "Sec. N", "S. N", "u/s N", "Ss. N, M"; "BSA 85"; "85 BSA";
 *     "N of the BSA"; sub-sections checked by the parent; ranges checked number by number (cap 20).
 *  Q2 Act-scoped only.
 *  Q3 BNS 1-358, BNSS 1-531, BSA 1-170, any letter suffix invalid; IPC/CrPC/IEA valid only
 *     if the number is a row in the signed mapping (any row, whatever its type, after Q6 was
 *     withdrawn); other Acts are not checked.
 *  Q4 a bare number is not checked.
 *  Q5 a miss is an invalid_section warning with the existing wording, never a block.
 *  Q7 the BNS range applies to the post-draft validator only (preflight keeps T-277 R5).
 *  Q8 double letters are read: "376AB IPC" valid, "BNS 103AB" invalid.
 */
import './setupEnv';

import {
  validate,
  extractActCitations,
  extractBNSSectionNumbers,
  isActCitationValid,
  validateBNSWhitelist,
  validateSectionReferences,
} from '../services/validator';
import { resolveDocRule } from '../services/prompt-assembler';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async (section: string, code: string) =>
    section === '302' && code === 'IPC'
      ? {
          old_code: 'IPC',
          old_code_full: 'Indian Penal Code',
          old_section: '302',
          old_title: 'Punishment for murder',
          new_code: 'BNS',
          new_code_full: 'Bharatiya Nyaya Sanhita',
          new_section: '103(1)',
          new_title: 'Punishment for murder',
          mapping_type: 'direct',
        }
      : null,
  ),
}));

/** Sections flagged by validateSectionReferences, as "ACT number". */
function flagged(text: string): string[] {
  return validateSectionReferences(text, null).map(
    (w) => `${w.details?.code} ${w.details?.section}`,
  );
}

describe('T-270 Q1: every form is read', () => {
  it('"Section N"', () => {
    expect(flagged('under Section 999 BNS')).toEqual(['BNS 999']);
    expect(flagged('under Section 103 BNS')).toEqual([]);
  });

  it('"Sec. N"', () => {
    expect(flagged('under Sec. 999 BNS')).toEqual(['BNS 999']);
    expect(flagged('under Sec. 103 BNS')).toEqual([]);
  });

  it('"S. N"', () => {
    expect(flagged('under S. 999 BNS')).toEqual(['BNS 999']);
    expect(flagged('under S. 103 BNS')).toEqual([]);
  });

  it('"u/s N"', () => {
    expect(flagged('bail u/s 999 BNSS')).toEqual(['BNSS 999']);
    expect(flagged('bail u/s 483 BNSS')).toEqual([]);
  });

  it('"Ss. N, M" checks every number in the list', () => {
    expect(flagged('under Ss. 103, 999 BNS')).toEqual(['BNS 999']);
    expect(flagged('under Ss. 103, 105 BNS')).toEqual([]);
    expect(extractActCitations('under Ss. 103, 105 BNS')).toEqual([
      { act: 'BNS', number: '103' },
      { act: 'BNS', number: '105' },
    ]);
  });

  it('code-first "BSA 85" is valid and "BSA 999" is flagged', () => {
    expect(flagged('as per BSA 85')).toEqual([]);
    expect(extractActCitations('as per BSA 85')).toEqual([{ act: 'BSA', number: '85' }]);
    expect(flagged('as per BSA 999')).toEqual(['BSA 999']);
  });

  it('code-first "BNS 103" is valid and "BNS 999" is flagged', () => {
    expect(flagged('BNS 103')).toEqual([]);
    expect(flagged('BNS 999')).toEqual(['BNS 999']);
  });

  it('number-first "85 BSA" is valid and "999 BSA" is flagged', () => {
    expect(flagged('as per 85 BSA')).toEqual([]);
    expect(flagged('as per 999 BSA')).toEqual(['BSA 999']);
    expect(flagged('the offence is 103 BNS')).toEqual([]);
  });

  it('"N of the BSA"', () => {
    expect(flagged('Section 85 of the BSA')).toEqual([]);
    expect(flagged('Section 999 of the BSA')).toEqual(['BSA 999']);
    expect(flagged('Section 999 of the Bharatiya Nyaya Sanhita')).toEqual(['BNS 999']);
  });

  it('mixed forms in one sentence give both citations: "BSA 85 and 103 BNS"', () => {
    expect(extractActCitations('BSA 85 and 103 BNS')).toEqual([
      { act: 'BSA', number: '85' },
      { act: 'BNS', number: '103' },
    ]);
    expect(flagged('BSA 85 and 103 BNS')).toEqual([]);
    expect(flagged('BSA 999 and 103 BNS')).toEqual(['BSA 999']);
  });

  it('sub-sections are checked by the parent: S. 61(2)(a) BNS is checked as 61', () => {
    expect(flagged('S. 61(2)(a) BNS')).toEqual([]);
    expect(isActCitationValid('BNS', '61(2)(a)')).toBe(true);
    // a bad parent is flagged, with the number as read
    expect(flagged('S. 359(2)(a) BNS')).toEqual(['BNS 359(2)(a)']);
  });
});

describe('T-270 Q1: ranges', () => {
  it('"Ss. 3-5 BSA" is read as 3, 4 and 5', () => {
    expect(extractActCitations('Ss. 3-5 BSA')).toEqual([
      { act: 'BSA', number: '3' },
      { act: 'BSA', number: '4' },
      { act: 'BSA', number: '5' },
    ]);
    expect(flagged('Ss. 3-5 BSA')).toEqual([]);
  });

  it('checks every number in a range, not only the ends', () => {
    // BSA ends at 170: 169 and 170 are valid, 171 and 172 are not; 168 is the start.
    expect(flagged('Ss. 168-172 BSA').sort()).toEqual(['BSA 171', 'BSA 172']);
  });

  it('cap of 20: a range of exactly 20 numbers is checked', () => {
    // 340..359 is 20 numbers; BNS ends at 358, so 359 is flagged.
    expect(extractActCitations('Ss. 340-359 BNS')).toHaveLength(20);
    expect(flagged('Ss. 340-359 BNS')).toEqual(['BNS 359']);
  });

  it('cap of 20: a range of 21 numbers or more is not checked', () => {
    expect(extractActCitations('Ss. 340-360 BNS')).toEqual([]);
    expect(flagged('Ss. 340-360 BNS')).toEqual([]);
    expect(flagged('Ss. 3-30 BSA')).toEqual([]);
    expect(extractActCitations('Ss. 3-30 BSA')).toEqual([]);
  });
});

describe('T-270 Q2: Act-scoped only', () => {
  it('"Section 3 BSA" in an affidavit is checked against BSA only', () => {
    const affidavit = resolveDocRule('affidavit');
    // Oaths Act 3 is a known number for an affidavit; BSA 3 is a BSA number, valid on its own.
    expect(validateSectionReferences('Sworn under Section 3 BSA', affidavit)).toEqual([]);
    // the Act decides, not the doc rule: BSA 171 is out of range even in an affidavit.
    const w = validateSectionReferences('Sworn under Section 171 BSA', affidavit);
    expect(w).toHaveLength(1);
    expect(w[0].details).toEqual({ section: '171', code: 'BSA' });
  });

  it('the same number is valid under one Act and flagged under another', () => {
    expect(flagged('Section 400 BNS')).toEqual(['BNS 400']);
    expect(flagged('Section 400 BNSS')).toEqual([]);
    expect(flagged('Section 200 BSA')).toEqual(['BSA 200']);
    expect(flagged('Section 200 BNS')).toEqual([]);
  });

  it('a section of another Act is not checked: "u/s 3 of the Oaths Act", "Section 8 of the Notaries Act"', () => {
    expect(flagged('Sworn u/s 3 of the Oaths Act')).toEqual([]);
    expect(flagged('Attested under Section 8 of the Notaries Act')).toEqual([]);
    expect(flagged('Section 999 of the Oaths Act')).toEqual([]);
    expect(extractActCitations('Section 999 of the Oaths Act')).toEqual([]);
  });

  it('the code never carries across prose to a later bare number', () => {
    expect(
      flagged(
        'The accused is charged under BNS 103. The hearing is on Section 999 of the Contract Act.',
      ),
    ).toEqual([]);
  });
});

describe('T-270 Q3: valid ranges and signed rows, per Act', () => {
  it('BNS 1-358', () => {
    expect(isActCitationValid('BNS', '1')).toBe(true);
    expect(isActCitationValid('BNS', '358')).toBe(true);
    expect(isActCitationValid('BNS', '359')).toBe(false);
    expect(isActCitationValid('BNS', '0')).toBe(false);
    expect(flagged('BNS 359')).toEqual(['BNS 359']);
  });

  it('BNSS 1-531', () => {
    expect(isActCitationValid('BNSS', '531')).toBe(true);
    expect(isActCitationValid('BNSS', '532')).toBe(false);
    expect(flagged('BNSS 600')).toEqual(['BNSS 600']);
    expect(flagged('BNSS 531')).toEqual([]);
  });

  it('BSA 1-170', () => {
    expect(isActCitationValid('BSA', '170')).toBe(true);
    expect(isActCitationValid('BSA', '171')).toBe(false);
    expect(flagged('BSA 170')).toEqual([]);
    expect(flagged('BSA 171')).toEqual(['BSA 171']);
  });

  it('any letter suffix on a new Act is invalid: BNS 103A, BNSS 479A, BSA 63A', () => {
    expect(flagged('BNS 103A')).toEqual(['BNS 103A']);
    expect(flagged('BNSS 479A')).toEqual(['BNSS 479A']);
    expect(flagged('BSA 63A')).toEqual(['BSA 63A']);
  });

  it('IPC: a number that is a row is valid, one that is not a row is flagged', () => {
    expect(flagged('Section 302 IPC')).toEqual([]);
    expect(flagged('Section 500 IPC')).toEqual([]);
    expect(flagged('Section 999 IPC')).toEqual(['IPC 999']);
    expect(flagged('IPC 999')).toEqual(['IPC 999']);
    expect(flagged('Section 600 IPC')).toEqual(['IPC 600']);
  });

  it('CrPC: a row is valid, a number not in the table is flagged', () => {
    expect(flagged('u/s 438 CrPC')).toEqual([]);
    expect(flagged('Section 154 CrPC')).toEqual([]);
    expect(flagged('Section 999 CrPC')).toEqual(['CrPC 999']);
  });

  it('IEA: a row is valid, a number not in the table is flagged', () => {
    expect(flagged('Section 65B IEA')).toEqual([]);
    expect(flagged('IEA 65Z')).toEqual(['IEA 65Z']);
    expect(flagged('Section 999 IEA')).toEqual(['IEA 999']);
  });

  it('Q6 withdrawn: a repealed row is still a row, so it is valid (IPC 13, CrPC 8, IEA 82)', () => {
    expect(flagged('Section 13 IPC')).toEqual([]);
    expect(flagged('Section 8 CrPC')).toEqual([]);
    expect(flagged('Section 82 IEA')).toEqual([]);
  });

  it('Q6 withdrawn: an unverified IPC row with no target stays valid (IPC 236, 254)', () => {
    expect(flagged('Section 236 IPC')).toEqual([]);
    expect(flagged('IPC 254')).toEqual([]);
  });

  it('Q6 withdrawn: "Section 480 IPC" is a row, so it is valid', () => {
    expect(flagged('Section 480 IPC')).toEqual([]);
  });

  it('other Acts are never checked (NI Act, CPC, Oaths Act)', () => {
    expect(flagged('Section 999 of the NI Act, Section 999 CPC')).toEqual([]);
    expect(extractActCitations('Section 138 NI Act and Section 999 CPC')).toEqual([]);
  });
});

describe('T-270 Q4: a bare number is not checked', () => {
  it('"Section 999" with no Act gives no warning and no citation', () => {
    expect(flagged('under Section 999 the court may')).toEqual([]);
    expect(extractActCitations('under Section 999 the court may')).toEqual([]);
  });

  it('bare numbers in prose, lists and dates are not read', () => {
    expect(extractActCitations('Para 999 and 12 of the plaint, hearing on 14.03.2026')).toEqual([]);
  });

  it('a code earlier in the draft does not make a later bare number a citation', () => {
    expect(extractActCitations('Offence under BNS 103. Section 999 was also mentioned.')).toEqual([
      { act: 'BNS', number: '103' },
    ]);
  });
});

describe('T-270: numbers that are not sections are not read', () => {
  it('an FIR number followed by an Act name is not a citation: "FIR No. 999 BNS dated 12.03.2026"', () => {
    expect(extractActCitations('FIR No. 999 BNS dated 12.03.2026')).toEqual([]);
    expect(flagged('FIR No. 999 BNS dated 12.03.2026')).toEqual([]);
  });

  it('"dated 999 BSA" and "on 999 BNS" are not citations', () => {
    expect(flagged('dated 999 BSA')).toEqual([]);
    expect(flagged('hearing on 999 BNS')).toEqual([]);
  });

  it('an ordinal is not a section: "the 21st BNS hearing"', () => {
    expect(extractActCitations('the 21st BNS hearing')).toEqual([]);
    expect(flagged('the 21st BNS hearing')).toEqual([]);
  });

  it('a date is not a section', () => {
    expect(extractActCitations('Dated 12.03.2026 at Patna. Filed on 14-03-2026.')).toEqual([]);
  });
});

describe('T-270 Q5: a miss is a warning with the existing wording, never a block', () => {
  it('validateSectionReferences wording is unchanged', () => {
    const w = validateSectionReferences('Section 999 BNS', null);
    expect(w).toEqual([
      {
        type: 'invalid_section',
        message:
          'Section 999 of BNS not found in the verified section mapping. Please verify this reference.',
        details: { section: '999', code: 'BNS' },
      },
    ]);
  });

  it('validateBNSWhitelist wording is unchanged', () => {
    expect(validateBNSWhitelist(['999'])).toEqual([
      {
        type: 'invalid_section',
        message:
          'BNS Section 999 cited but not found in the First Schedule whitelist — likely hallucinated. Please verify or replace.',
        details: { section: '999', code: 'BNS' },
      },
    ]);
  });

  it('the same citation twice is one warning', () => {
    expect(flagged('BNS 999 here and Section 999 BNS again')).toEqual(['BNS 999']);
  });
});

describe('T-270 Q7: the BNS check in the validator is the range', () => {
  it('extractBNSSectionNumbers reads every form for BNS only', () => {
    expect(
      extractBNSSectionNumbers('BNS 103, 105 BNS, S. 61(2)(a) BNS, BSA 85, Section 302 IPC'),
    ).toEqual(['103', '105', '61(2)(a)']);
  });

  it('validateBNSWhitelist flags out-of-range and lettered numbers and accepts in-range ones', () => {
    expect(
      validateBNSWhitelist(['114', '330(1)', '1', '358']).map((w) => w.details?.section),
    ).toEqual([]);
    expect(validateBNSWhitelist(['359', '103A', '999(1)']).map((w) => w.details?.section)).toEqual([
      '359',
      '103A',
      '999(1)',
    ]);
  });
});

describe('T-270 Q8: double-letter sections are read', () => {
  it('"376AB IPC" is read as a number, not dropped as unreadable, and is valid (a row)', () => {
    expect(extractActCitations('Section 376AB IPC')).toEqual([{ act: 'IPC', number: '376AB' }]);
    expect(flagged('Section 376AB IPC')).toEqual([]);
    expect(flagged('376AB IPC')).toEqual([]);
  });

  it('"IPC 376AB" code-first is valid', () => {
    expect(extractActCitations('IPC 376AB')).toEqual([{ act: 'IPC', number: '376AB' }]);
    expect(flagged('IPC 376AB')).toEqual([]);
  });

  it('"BNS 103AB" is read and flagged (a letter suffix on a new Act)', () => {
    expect(extractActCitations('BNS 103AB')).toEqual([{ act: 'BNS', number: '103AB' }]);
    expect(flagged('BNS 103AB')).toEqual(['BNS 103AB']);
  });

  it('a double-letter number that is not a row of its old Act is flagged', () => {
    expect(flagged('Section 999AB IPC')).toEqual(['IPC 999AB']);
  });
});

describe('T-270 round 4: letter suffixes with a hyphen or lower case', () => {
  it('"BNS 103a" and "BNS 103-A" are flagged (letter suffix on a new Act)', () => {
    expect(flagged('BNS 103a')).toHaveLength(1);
    expect(flagged('BNS 103a')[0]).toMatch(/^BNS 103/i);
    expect(flagged('BNS 103-A')).toHaveLength(1);
    expect(flagged('BNS 103-A')[0]).toMatch(/^BNS 103/i);
  });

  it('the whitelist flags 103A', () => {
    expect(validateBNSWhitelist(['103A']).map((w) => w.details?.section)).toEqual(['103A']);
  });

  it('"BNS 103-AB" is flagged', () => {
    expect(flagged('BNS 103-AB')).toHaveLength(1);
    expect(flagged('BNS 103-AB')[0]).toMatch(/^BNS 103/i);
  });

  it('"Section 498-A IPC" and "IPC 498a" are valid (row 498A)', () => {
    expect(flagged('Section 498-A IPC')).toEqual([]);
    expect(flagged('IPC 498a')).toEqual([]);
    expect(extractActCitations('Section 498-A IPC')).toHaveLength(1);
    expect(extractActCitations('IPC 498a')).toHaveLength(1);
  });

  it('"IPC 304z" is flagged', () => {
    expect(flagged('IPC 304z')).toHaveLength(1);
    expect(flagged('IPC 304z')[0]).toMatch(/^IPC 304/i);
  });

  it('"IPC 376-ab" is valid', () => {
    expect(flagged('IPC 376-ab')).toEqual([]);
    expect(extractActCitations('IPC 376-ab')).toHaveLength(1);
  });

  it('"Ss. 3-5 BSA" still reads 3, 4, 5', () => {
    expect(extractActCitations('Ss. 3-5 BSA').map((c) => c.number)).toEqual(['3', '4', '5']);
    expect(flagged('Ss. 3-5 BSA')).toEqual([]);
  });
});

describe('T-270 ruling A: validate() on an IPC number', () => {
  const docRule = resolveDocRule('bail_regular');

  it('"Section 999 IPC" gives only invalid_section, no old_law_reference', async () => {
    const r = await validate('FIR under Section 999 IPC.', docRule);
    expect(r.warnings.filter((w) => w.type === 'invalid_section')).toHaveLength(1);
    expect(r.warnings.filter((w) => w.type === 'old_law_reference')).toEqual([]);
  });

  it('"Section 302 IPC" gives only old_law_reference, as before', async () => {
    const r = await validate('FIR under Section 302 IPC.', docRule);
    expect(r.warnings.filter((w) => w.type === 'invalid_section')).toEqual([]);
    const old = r.warnings.filter((w) => w.type === 'old_law_reference');
    expect(old).toHaveLength(1);
    expect(old[0].details?.suggestedReplacement).toBe('Section 103(1) BNS');
  });
});
