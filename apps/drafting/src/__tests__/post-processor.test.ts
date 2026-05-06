import './setupEnv';

import {
  normalizeNumbering,
  formatCauseTitle,
  generateVerificationClause,
  generateAdvocateBlock,
  generateFilingChecklist,
  postProcess,
} from '../services/post-processor';
import { resolveDocRule, resolveCourtRule } from '../services/prompt-assembler';

// Mock sections.service to avoid Redis/Mongo dependency
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text) => ({
    converted: text,
    conversions: [],
  })),
}));

describe('Layer 2 — Post-Processor', () => {
  describe('normalizeNumbering', () => {
    it('normalizes (1) style to 1. style', () => {
      const input = '(1) First paragraph\n(2) Second paragraph\n(3) Third paragraph';
      const result = normalizeNumbering(input);
      expect(result).toContain('1. First paragraph');
      expect(result).toContain('2. Second paragraph');
      expect(result).toContain('3. Third paragraph');
    });

    it('normalizes "Para 1:" style to numeric', () => {
      const input = 'Para 1: First\nPara 2: Second';
      const result = normalizeNumbering(input);
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
    });

    it('preserves non-numbered content', () => {
      const input = 'PRAYER\n\nThe applicant humbly prays...';
      const result = normalizeNumbering(input);
      expect(result).toBe(input);
    });

    it('handles mixed content with numbered and non-numbered sections', () => {
      const input = 'HEADING\n\n1. First point\n2. Second point\n\nConclusion text';
      const result = normalizeNumbering(input);
      expect(result).toContain('1. First point');
      expect(result).toContain('2. Second point');
      expect(result).toContain('Conclusion text');
    });
  });

  describe('formatCauseTitle', () => {
    it('replaces court designation with config value', () => {
      const courtRule = resolveCourtRule('district_court', 'JMFC Ranchi');
      const input = 'IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS, RANCHI\n\nRest of document';
      const result = formatCauseTitle(input, courtRule);
      expect(result).toContain('IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS');
    });

    it('handles Patna HC designation', () => {
      const courtRule = resolveCourtRule('high_court', 'Patna High Court');
      const input = 'IN THE HIGH COURT OF JUDICATURE AT PATNA\n\nBody text';
      const result = formatCauseTitle(input, courtRule);
      expect(result).toContain('IN THE HIGH COURT OF JUDICATURE AT PATNA');
    });

    it('returns text unchanged when no court rule', () => {
      const input = 'Some document text';
      const result = formatCauseTitle(input, null);
      expect(result).toBe(input);
    });
  });

  describe('generateVerificationClause', () => {
    it('generates verification from bail_regular template', () => {
      const docRule = resolveDocRule('bail_regular');
      const partyDetails = {
        applicant: 'Ram Kumar',
        parentName: 'Shyam Kumar',
        relation: 'S/o',
        age: '35',
        address: 'Village Rampur, Ranchi',
      };
      const result = generateVerificationClause(docRule, partyDetails, 'JMFC Ranchi');
      expect(result).toContain('VERIFICATION');
      expect(result).toContain('Ram Kumar');
      expect(result).toContain('S/o');
      expect(result).toContain('Shyam Kumar');
      expect(result).toContain('35 years');
      expect(result).toContain('Village Rampur, Ranchi');
    });

    it('uses placeholders when party details are missing', () => {
      const docRule = resolveDocRule('bail_regular');
      const result = generateVerificationClause(docRule, {}, 'JMFC Ranchi');
      expect(result).toContain('[DEPONENT NAME]');
      expect(result).toContain('[PARENT NAME]');
      expect(result).toContain('[AGE]');
    });

    it('returns empty for doc types without verification (legal notice)', () => {
      const docRule = resolveDocRule('legal_notice_s138');
      const result = generateVerificationClause(docRule, {}, 'Court');
      expect(result).toBe('');
    });

    it('returns empty when no doc rule', () => {
      const result = generateVerificationClause(null, {}, 'Court');
      expect(result).toBe('');
    });
  });

  describe('generateAdvocateBlock', () => {
    it('generates full advocate block with enrollment', () => {
      const result = generateAdvocateBlock('Adv. R.K. Sharma', 'JH/1234/2020');
      expect(result).toContain('Advocate for the Applicant/Petitioner');
      expect(result).toContain('Adv. R.K. Sharma');
      expect(result).toContain('Enrl. No. JH/1234/2020');
    });

    it('generates advocate block without enrollment', () => {
      const result = generateAdvocateBlock('Adv. Sharma');
      expect(result).toContain('Adv. Sharma');
      expect(result).not.toContain('Enrl. No.');
    });

    it('returns empty when no advocate name', () => {
      const result = generateAdvocateBlock();
      expect(result).toBe('');
    });
  });

  describe('generateFilingChecklist', () => {
    it('returns checklist items for bail_regular', () => {
      const docRule = resolveDocRule('bail_regular');
      const checklist = generateFilingChecklist(docRule);
      expect(checklist.length).toBeGreaterThan(0);
      expect(checklist).toContain('Copy of FIR');
      expect(checklist).toContain('Vakalatnama / Memo of Appearance');
    });

    it('returns checklist items for legal_notice_s138', () => {
      const docRule = resolveDocRule('legal_notice_s138');
      const checklist = generateFilingChecklist(docRule);
      expect(checklist).toContainEqual(expect.stringContaining('30 days'));
    });

    it('returns empty for null config', () => {
      const checklist = generateFilingChecklist(null);
      expect(checklist).toEqual([]);
    });
  });

  describe('postProcess', () => {
    const sampleAiOutput = `IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS, RANCHI

BAIL APPLICATION No. _____ of 2026

Ram Kumar ... Applicant/Accused
VERSUS
State of Jharkhand ... Respondent

1. That the applicant Ram Kumar is in judicial custody since 01.03.2026.
2. That the FIR No. 123/2026 was registered at P.S. Kotwali, Ranchi under Section 481 BNSS.
3. That the applicant has no prior criminal history.

PRAYER

The applicant humbly prays that this Hon'ble Court may grant regular bail.`;

    it('appends verification, advocate block, and disclaimer', () => {
      const docRule = resolveDocRule('bail_application');
      const courtRule = resolveCourtRule('district_court', 'JMFC Ranchi');
      const result = postProcess({
        rawText: sampleAiOutput,
        docRule,
        courtRule,
        partyDetails: { applicant: 'Ram Kumar' },
        advocateName: 'Adv. Sharma',
        advocateEnrollment: 'JH/001/2020',
        courtName: 'JMFC Ranchi',
      });

      expect(result.formattedText).toContain('VERIFICATION');
      expect(result.formattedText).toContain('Adv. Sharma');
      expect(result.formattedText).toContain('JH/001/2020');
      expect(result.formattedText).toContain('DISCLAIMER');
      expect(result.appendedSections).toContain('verification');
      expect(result.appendedSections).toContain('advocate_details');
      expect(result.appendedSections).toContain('disclaimer');
    });

    it('returns filing checklist from config', () => {
      const docRule = resolveDocRule('bail_application');
      const result = postProcess({
        rawText: sampleAiOutput,
        docRule,
        courtRule: null,
        partyDetails: {},
        courtName: 'JMFC Ranchi',
      });

      expect(result.filingChecklist.length).toBeGreaterThan(0);
    });

    it('works without doc rule or court rule', () => {
      const result = postProcess({
        rawText: 'Some plain text document.',
        docRule: null,
        courtRule: null,
        partyDetails: {},
        courtName: 'Unknown Court',
      });

      // Should still append disclaimer
      expect(result.formattedText).toContain('DISCLAIMER');
      expect(result.appendedSections).toContain('disclaimer');
      expect(result.filingChecklist).toEqual([]);
    });
  });
});
