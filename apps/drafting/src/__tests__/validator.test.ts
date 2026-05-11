import './setupEnv';

import {
  extractSectionReferences,
  extractOldLawReferences,
  validateSectionReferences,
  detectOldLawReferences,
  checkMandatoryClauses,
  buildSectionsCited,
  validate,
} from '../services/validator';
import { resolveDocRule } from '../services/prompt-assembler';

// Mock sections.service for old-law lookup
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async (section: string, code: string) => {
    // Simulate IPC 302 → BNS 103 mapping
    if (section === '302' && code === 'IPC') {
      return {
        old_code: 'IPC',
        old_code_full: 'Indian Penal Code',
        old_section: '302',
        old_title: 'Punishment for murder',
        new_code: 'BNS',
        new_code_full: 'Bharatiya Nyaya Sanhita',
        new_section: '103',
        new_title: 'Punishment for murder',
        mapping_type: 'direct',
      };
    }
    // Simulate IPC 420 → BNS 318 mapping
    if (section === '420' && code === 'IPC') {
      return {
        old_code: 'IPC',
        old_code_full: 'Indian Penal Code',
        old_section: '420',
        old_title: 'Cheating and dishonestly inducing delivery of property',
        new_code: 'BNS',
        new_code_full: 'Bharatiya Nyaya Sanhita',
        new_section: '318',
        new_title: 'Cheating',
        mapping_type: 'direct',
      };
    }
    return null;
  }),
}));

describe('Layer 3 — Validator', () => {
  describe('extractSectionReferences', () => {
    it('extracts "Section 480" pattern', () => {
      const text = 'filed under Section 480 of BNSS for bail';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('480');
      expect(refs[0].code).toBe('BNSS');
    });

    it('extracts "Sec. 103" pattern', () => {
      const text = 'under Sec. 103 BNS for murder';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('103');
      expect(refs[0].code).toBe('BNS');
    });

    it('extracts "u/s 481" pattern', () => {
      const text = 'bail u/s 481 BNSS';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('481');
    });

    it('extracts multiple references', () => {
      const text = 'Section 480 BNSS and Section 481 BNSS read with Section 103 BNS';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(3);
    });

    it('handles sections with sub-clauses like 103(a)', () => {
      const text = 'under Section 103(a) of BNS';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('103(a)');
    });

    it('returns empty for text without section references', () => {
      const text = 'This is a plain text document with no legal references.';
      const refs = extractSectionReferences(text);
      expect(refs.length).toBe(0);
    });
  });

  describe('extractOldLawReferences', () => {
    it('detects IPC reference', () => {
      const text = 'charged under Section 302 IPC for murder';
      const refs = extractOldLawReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('302');
      expect(refs[0].code).toBe('IPC');
    });

    it('detects CrPC reference', () => {
      const text = 'bail under Section 439 CrPC';
      const refs = extractOldLawReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('439');
      expect(refs[0].code).toBe('CrPC');
    });

    it('detects "Indian Penal Code" full name', () => {
      const text = 'Section 420 of the Indian Penal Code';
      const refs = extractOldLawReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].section).toBe('420');
      expect(refs[0].code).toBe('IPC');
    });

    it('returns empty when no old-law references', () => {
      const text = 'Section 103 BNS applies to murder cases.';
      const refs = extractOldLawReferences(text);
      expect(refs.length).toBe(0);
    });
  });

  describe('validateSectionReferences', () => {
    it('warns about sections not in the config', () => {
      const docRule = resolveDocRule('bail_regular');
      // Section 485 is NOT in bail_regular's known sections
      const text = 'under Section 485 BNSS the applicant seeks bail';
      const warnings = validateSectionReferences(text, docRule);
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('invalid_section');
      expect(warnings[0].details?.section).toBe('485');
    });

    it('does not warn about known sections', () => {
      const docRule = resolveDocRule('bail_regular');
      // 480 and 481 ARE in bail_regular's known sections
      const text = 'under Section 480 BNSS and Section 481 BNSS';
      const warnings = validateSectionReferences(text, docRule);
      expect(warnings.length).toBe(0);
    });

    it('returns empty when no doc rule', () => {
      const warnings = validateSectionReferences('Section 999 BNS', null);
      expect(warnings).toEqual([]);
    });

    it('deduplicates repeated invalid sections', () => {
      const docRule = resolveDocRule('bail_regular');
      const text = 'Section 999 BNSS mentioned twice: Section 999 BNSS again';
      const warnings = validateSectionReferences(text, docRule);
      expect(warnings.length).toBe(1);
    });
  });

  describe('detectOldLawReferences', () => {
    it('suggests BNS equivalent for IPC 302', async () => {
      const text = 'The accused is charged under Section 302 IPC for murder.';
      const warnings = await detectOldLawReferences(text);
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('old_law_reference');
      expect(warnings[0].details?.suggestedReplacement).toBe('Section 103 BNS');
    });

    it('suggests BNS equivalent for IPC 420', async () => {
      const text = 'Section 420 of the Indian Penal Code';
      const warnings = await detectOldLawReferences(text);
      expect(warnings.length).toBe(1);
      expect(warnings[0].details?.suggestedReplacement).toBe('Section 318 BNS');
    });

    it('returns empty when no old-law references', async () => {
      const text = 'Section 103 BNS applies here.';
      const warnings = await detectOldLawReferences(text);
      expect(warnings.length).toBe(0);
    });
  });

  describe('checkMandatoryClauses', () => {
    it('detects all clauses present in bail application', () => {
      const docRule = resolveDocRule('bail_regular');
      const text = `
        1. That the FIR No. 123/2026 was registered at P.S. Kotwali.
        2. The accused has been in judicial custody since 01.03.2026.
        3. Grounds for bail: no prior criminal history.
        4. The applicant will not abscond or tamper with evidence.
        PRAYER: The applicant humbly prays for bail.
      `;
      const result = checkMandatoryClauses(text, docRule);
      expect(result.allPresent).toBe(true);
      expect(result.missing.length).toBe(0);
    });

    it('detects missing FIR details clause', () => {
      const docRule = resolveDocRule('bail_regular');
      const text = `
        The accused has been in custody.
        Grounds for bail: clean record.
        Will not abscond.
        PRAYER: Grant bail.
      `;
      const result = checkMandatoryClauses(text, docRule);
      expect(result.allPresent).toBe(false);
      const missingIds = result.missing.map((w) => w.details?.clauseId);
      expect(missingIds).toContain('fir_details');
    });

    it('detects cheque details missing in S.138 notice', () => {
      const docRule = resolveDocRule('legal_notice_s138');
      const text = `
        LEGAL NOTICE
        You are liable for the amount.
        Pay within 15 days.
        Criminal complaint under Section 138.
      `;
      const result = checkMandatoryClauses(text, docRule);
      expect(result.allPresent).toBe(false);
      const missingIds = result.missing.map((w) => w.details?.clauseId);
      expect(missingIds).toContain('cheque_details');
      expect(missingIds).toContain('dishonour_details');
    });

    it('returns allPresent=true when no doc rule', () => {
      const result = checkMandatoryClauses('any text', null);
      expect(result.allPresent).toBe(true);
      expect(result.missing.length).toBe(0);
    });
  });

  describe('buildSectionsCited', () => {
    it('extracts cited sections for DB storage', () => {
      const text = 'Section 480 BNSS and Section 103 BNS';
      const cited = buildSectionsCited(text);
      expect(cited).toContain('BNSS 480');
      expect(cited).toContain('BNS 103');
    });

    it('deduplicates repeated sections', () => {
      const text = 'Section 480 BNSS mentioned twice. Section 480 BNSS again.';
      const cited = buildSectionsCited(text);
      const count480 = cited.filter((c) => c === 'BNSS 480').length;
      expect(count480).toBe(1);
    });

    it('returns empty for text without sections', () => {
      const cited = buildSectionsCited('No legal references here.');
      expect(cited).toEqual([]);
    });
  });

  describe('validate (full pipeline)', () => {
    it('runs all validations and returns combined result', async () => {
      const docRule = resolveDocRule('bail_regular');
      const text = `
        IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS, RANCHI
        FIR No. 123/2026, P.S. Kotwali
        The accused in judicial custody since 01.03.2026.
        Grounds for bail: clean record.
        Will not abscond or tamper with evidence.
        Section 480 BNSS, Section 481 BNSS
        PRAYER: Grant bail.
      `;
      const result = await validate(text, docRule);
      expect(result.sectionsCited.length).toBeGreaterThan(0);
      expect(result.sectionsCited).toContain('BNSS 480');
    });

    it('catches AI hallucinated section', async () => {
      const docRule = resolveDocRule('bail_regular');
      const text = `
        FIR No. 100/2026, P.S. Civil Lines.
        Custody since last month.
        Grounds for bail stated.
        Will not flee.
        Section 485 BNSS invoked.
        PRAYER: Bail granted.
      `;
      const result = await validate(text, docRule);
      // Section 485 is NOT in bail_regular's config (SCRUM-43 test case #5)
      const invalidWarnings = result.warnings.filter((w) => w.type === 'invalid_section');
      expect(invalidWarnings.length).toBe(1);
      expect(invalidWarnings[0].details?.section).toBe('485');
    });

    it('catches old IPC reference in output', async () => {
      const docRule = resolveDocRule('bail_regular');
      const text = `
        FIR under Section 302 IPC.
        Accused in custody.
        Grounds stated.
        No flight risk.
        PRAYER: Bail.
      `;
      const result = await validate(text, docRule);
      // SCRUM-43 test case #2: IPC 302 → should flag with BNS 103 suggestion
      const oldLawWarnings = result.warnings.filter((w) => w.type === 'old_law_reference');
      expect(oldLawWarnings.length).toBe(1);
      expect(oldLawWarnings[0].details?.suggestedReplacement).toBe('Section 103 BNS');
    });
  });

  // ── CLO Round 3 — Section-citation snapshot tests ─────────────────────────
  describe('buildSectionsCited — multi-act coverage (Round 3 item 2)', () => {
    it('extracts NI Act sections from S.138 legal notice text', () => {
      const text = `
        LEGAL NOTICE under Section 138 of the Negotiable Instruments Act, 1881.
        The cognizance of offences under Section 142 of the NI Act is subject to
        the notice being sent within 30 days of dishonour.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(expect.arrayContaining(['NI Act 138', 'NI Act 142']));
      expect(cited.length).toBe(2);
    });

    it('extracts CPC section from S.80 legal notice text', () => {
      const text = `
        This notice is being issued under Section 80 of the Code of Civil Procedure
        as a mandatory pre-condition before filing a civil suit against the Government.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(expect.arrayContaining(['CPC 80']));
    });

    it('extracts CPA sections from consumer complaint text', () => {
      const text = `
        The complainant files this complaint under Section 35 of the Consumer Protection Act, 2019.
        As per Section 2(7) of the CPA, "consumer" means any person who buys goods.
        Section 2(11) CPA defines "defect". Territorial jurisdiction under Section 34 CPA.
        This complaint is within the limitation period under Section 69 of the Consumer Protection Act.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(
        expect.arrayContaining(['CPA 35', 'CPA 2(7)', 'CPA 2(11)', 'CPA 34', 'CPA 69']),
      );
    });

    it('extracts BNSS section from bail application text', () => {
      const text = `
        Application for regular bail under Section 480 BNSS in connection with
        FIR under Section 303 BNS and Section 351 of the Bharatiya Nyaya Sanhita.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(expect.arrayContaining(['BNSS 480', 'BNS 303', 'BNS 351']));
    });

    it('returns empty array when no recognized act references exist', () => {
      const text = 'This is a plain text document with no legal citations.';
      const cited = buildSectionsCited(text);
      expect(cited).toEqual([]);
    });
  });

  // ── CLO Round 4 — Section-citation mis-tagging fixes (item 4) ───────────
  describe('buildSectionsCited — no false BNS tagging (Round 4 item 4)', () => {
    it('legal_notice_s138: does NOT tag unqualified "Section 138" as BNS', () => {
      const text = `
        LEGAL NOTICE under Section 138 of the Negotiable Instruments Act, 1881.
        The notice is sent within 30 days of the dishonour memo.
        Section 142 NI Act provides for cognizance.
        The drawer is liable under Section 138 to pay the cheque amount.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(expect.arrayContaining(['NI Act 138', 'NI Act 142']));
      // Must NOT contain BNS 138 (wrongful confinement — irrelevant)
      expect(cited.filter((c) => c.startsWith('BNS'))).toEqual([]);
    });

    it('consumer_complaint: does NOT tag "Section 2(10)" as BNS', () => {
      const text = `
        The complainant files under Section 35 of the Consumer Protection Act.
        "Defect" as defined under Section 2(10) CPA includes any fault in quality.
        Section 2(7) CPA defines "consumer".
        Section 2(11) of the Consumer Protection Act defines "deficiency".
        Section 2(47) CPA defines "unfair trade practice".
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(
        expect.arrayContaining(['CPA 35', 'CPA 2(10)', 'CPA 2(7)', 'CPA 2(11)', 'CPA 2(47)']),
      );
      // Must NOT contain any BNS tags
      expect(cited.filter((c) => c.startsWith('BNS'))).toEqual([]);
    });

    it('rent_agreement: unqualified TPA sections are NOT tagged as BNS', () => {
      const text = `
        This lease is governed by Section 105 of the Transfer of Property Act.
        Section 106 TPA governs the notice period for termination.
        Section 107 of the Transfer of Property Act requires written lease for >1 year.
        Registration under Section 17 of the Registration Act is required.
      `;
      const cited = buildSectionsCited(text);
      expect(cited).toEqual(
        expect.arrayContaining(['TPA 105', 'TPA 106', 'TPA 107', 'Reg Act 17']),
      );
      // Must NOT contain any BNS tags
      expect(cited.filter((c) => c.startsWith('BNS'))).toEqual([]);
    });

    it('unqualified "Section 420" without any act name is excluded', () => {
      const text = 'The accused was charged under Section 420 and Section 302.';
      const cited = buildSectionsCited(text);
      // No act qualifier → should be empty (don't default to BNS)
      expect(cited).toEqual([]);
    });
  });
});
