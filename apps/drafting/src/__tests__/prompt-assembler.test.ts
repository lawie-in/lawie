import './setupEnv';

import {
  resolveDocRule,
  resolveCourtRule,
  assemblePrompt,
  _testing,
} from '../services/prompt-assembler';
import { lastRow, part1, quoted } from './t136-signed';

// Mock sections.service to avoid Redis/Mongo dependency
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
}));

describe('Layer 1 — Prompt Assembler', () => {
  describe('resolveDocRule', () => {
    it('loads bail_regular config by exact name', () => {
      const rule = resolveDocRule('bail_regular');
      expect(rule).not.toBeNull();
      expect(rule!.docType).toBe('bail_regular');
      expect(rule!.displayName).toBe('Regular Bail Application');
      expect(rule!.category).toBe('criminal');
    });

    it('maps bail_application to bail_regular', () => {
      const rule = resolveDocRule('bail_application');
      expect(rule).not.toBeNull();
      expect(rule!.docType).toBe('bail_regular');
    });

    it('loads bail_anticipatory config', () => {
      const rule = resolveDocRule('bail_anticipatory');
      expect(rule).not.toBeNull();
      expect(rule!.docType).toBe('bail_anticipatory');
    });

    it('maps legal_notice to legal_notice_s80', () => {
      const rule = resolveDocRule('legal_notice');
      expect(rule).not.toBeNull();
      expect(rule!.docType).toBe('legal_notice_s80');
    });

    it('loads legal_notice_s138 by exact name', () => {
      const rule = resolveDocRule('legal_notice_s138');
      expect(rule).not.toBeNull();
      expect(rule!.displayName).toContain('Section 138');
    });

    it('loads rent_agreement config', () => {
      const rule = resolveDocRule('rent_agreement');
      expect(rule).not.toBeNull();
      expect(rule!.category).toBe('civil');
    });

    it('loads consumer_complaint config', () => {
      const rule = resolveDocRule('consumer_complaint');
      expect(rule).not.toBeNull();
      expect(rule!.category).toBe('consumer');
    });

    it('returns null for unknown doc type', () => {
      const rule = resolveDocRule('unknown_type');
      expect(rule).toBeNull();
    });
  });

  describe('resolveCourtRule', () => {
    it('loads JMFC court rule by name match', () => {
      const rule = resolveCourtRule('district_court', 'JMFC Ranchi');
      expect(rule).not.toBeNull();
      expect(rule!.courtId).toBe('jmfc_generic');
      expect(rule!.designation).toContain('JUDICIAL MAGISTRATE FIRST CLASS');
    });

    it('loads Sessions court rule by name match', () => {
      const rule = resolveCourtRule('district_court', 'Sessions Court, Patna');
      expect(rule).not.toBeNull();
      expect(rule!.courtId).toBe('sessions_generic');
    });

    it('loads Patna HC rule by name match', () => {
      const rule = resolveCourtRule('high_court', 'Patna High Court');
      expect(rule).not.toBeNull();
      expect(rule!.courtId).toBe('patna_hc');
      expect(rule!.designation).toContain('PATNA');
    });

    it('falls back to district_court_generic for unrecognized district court', () => {
      const rule = resolveCourtRule('district_court', 'Civil Court, Delhi');
      expect(rule).not.toBeNull();
      expect(rule!.courtId).toBe('district_court_generic');
    });

    it('returns null for supreme court (no config yet)', () => {
      const rule = resolveCourtRule('supreme_court', 'Supreme Court of India');
      expect(rule).toBeNull();
    });
  });

  describe('buildBasePrompt', () => {
    // T-566 items 54/55/66 (Ajay, 22 Oct): the signed item 54 line, exactly as in the review file.
    const ITEM_54 =
      'Use BNS section numbers for an offence committed on or after 1 July 2024, and IPC section numbers for an offence committed before that date. For procedure and evidence, use BNSS and BSA, except in a matter that was pending before 1 July 2024, where CrPC and the Evidence Act continue to apply. If the date of the offence is not given, write [To be confirmed: section and code].';

    it('gives the item 54 line as rule 1 for a criminal category', () => {
      for (const category of ['criminal', 'criminal_bail', 'criminal_petition']) {
        const prompt = _testing.buildBasePrompt(category, 'fir_quashing');
        expect(prompt).toContain(`1. ${ITEM_54}`);
        expect(prompt).toContain('2. Format with numbered paragraphs (1, 2, 3...) for the body.');
        expect(prompt).not.toContain('NEVER reference old IPC');
      }
    });

    it('gives the item 54 line for writ_petition_criminal (ruling S1) whatever the category', () => {
      const prompt = _testing.buildBasePrompt('writ', 'writ_petition_criminal');
      expect(prompt).toContain(`1. ${ITEM_54}`);
    });

    it('gives no law line with no document rule or a civil one (ruling 54b); rules move up', () => {
      for (const prompt of [
        _testing.buildBasePrompt(),
        _testing.buildBasePrompt('civil', 'rent_agreement'),
        _testing.buildBasePrompt('writ', 'writ_petition_civil'),
      ]) {
        expect(prompt).not.toContain('Use BNS section numbers for an offence committed');
        expect(prompt).not.toContain('Bharatiya Nyaya Sanhita');
        expect(prompt).not.toContain('NEVER reference old IPC');
        expect(prompt).toContain('1. Format with numbered paragraphs (1, 2, 3...) for the body.');
      }
    });

    it('has deleted rule 9 ("Use today\'s date format") and the court-ready persona (rulings 66, 55)', () => {
      const prompt = _testing.buildBasePrompt('criminal', 'fir_quashing');
      expect(prompt).not.toContain("Use today's date format");
      expect(prompt).not.toContain('court-ready');
      expect(prompt).toContain(
        'You are a senior Indian advocate with 20+ years of practice, drafting a legal document for an advocate to review and file.',
      );
    });

    it('instructs AI not to generate verification clause', () => {
      const prompt = _testing.buildBasePrompt();
      expect(prompt).toContain('Do NOT generate the Verification clause');
    });
  });

  describe('buildDocTypeSection', () => {
    it('includes mandatory clauses for bail_regular', () => {
      const rule = resolveDocRule('bail_regular')!;
      const section = _testing.buildDocTypeSection(rule);
      expect(section).toContain('Regular Bail Application');
      expect(section).toContain('FIR Details');
      expect(section).toContain('Custody Status');
      // T-136, B5: Ajay renamed this clause; the name is read from the signed file.
      expect(section).toContain(quoted(lastRow(part1(), 'B5'))[0]);
      expect(section).not.toContain('No Flight Risk');
    });

    it('includes prompt instructions for legal_notice_s138', () => {
      const rule = resolveDocRule('legal_notice_s138')!;
      const section = _testing.buildDocTypeSection(rule);
      expect(section).toContain('Section 138');
      expect(section).toContain('cheque');
    });
  });

  describe('buildCourtSection', () => {
    it('includes court designation for JMFC', () => {
      const rule = resolveCourtRule('district_court', 'JMFC Ranchi')!;
      const section = _testing.buildCourtSection(rule);
      expect(section).toContain('JUDICIAL MAGISTRATE FIRST CLASS');
      expect(section).toContain('Court-specific rules');
    });
  });

  describe('buildStatutoryContext', () => {
    it('lists BNSS sections for bail_regular', () => {
      const rule = resolveDocRule('bail_regular')!;
      const context = _testing.buildStatutoryContext(rule);
      expect(context).toContain('BNSS');
      expect(context).toContain('Section 480');
      expect(context).toContain('Section 483');
      // T-135: 481 (bond for the appellate court) and 482 (anticipatory bail)
      // have no place in a regular bail application.
      expect(context).not.toContain('Section 481');
      expect(context).not.toContain('Section 482');
    });

    it('lists NI Act sections for legal_notice_s138', () => {
      const rule = resolveDocRule('legal_notice_s138')!;
      const context = _testing.buildStatutoryContext(rule);
      expect(context).toContain('Negotiable Instruments Act');
      expect(context).toContain('Section 138');
    });
  });

  describe('assemblePrompt', () => {
    const baseInput = {
      docType: 'bail_application',
      courtName: 'JMFC Ranchi',
      courtType: 'district_court',
      partyDetails: { applicant: 'Ram Kumar', respondent: 'State of Jharkhand' },
      keyFacts: 'Accused has been in custody for 30 days.',
      reliefPrayer: 'Grant regular bail.',
      advocateName: 'Adv. Sharma',
      advocateEnrollment: 'JH/1234/2020',
    };

    it('returns system and user prompts', async () => {
      const result = await assemblePrompt(baseInput);
      expect(result.systemPrompt).toBeTruthy();
      expect(result.userPrompt).toBeTruthy();
      expect(result.docRule).not.toBeNull();
      expect(result.courtRule).not.toBeNull();
    });

    it('system prompt contains doc type and court instructions', async () => {
      const result = await assemblePrompt(baseInput);
      expect(result.systemPrompt).toContain('Regular Bail Application');
      expect(result.systemPrompt).toContain('JUDICIAL MAGISTRATE FIRST CLASS');
    });

    it('user prompt contains party details and facts', async () => {
      const result = await assemblePrompt(baseInput);
      expect(result.userPrompt).toContain('Ram Kumar');
      expect(result.userPrompt).toContain('State of Jharkhand');
      expect(result.userPrompt).toContain('custody for 30 days');
    });

    it('user prompt includes advocate details', async () => {
      const result = await assemblePrompt(baseInput);
      expect(result.userPrompt).toContain('Adv. Sharma');
      expect(result.userPrompt).toContain('JH/1234/2020');
    });

    it('works gracefully when no config matches (unknown docType)', async () => {
      const result = await assemblePrompt({
        ...baseInput,
        docType: 'petition',
        courtType: 'supreme_court',
        courtName: 'Supreme Court of India',
      });
      // Should still return valid prompts, just without config-specific sections
      expect(result.systemPrompt).toContain('senior Indian advocate');
      expect(result.docRule).toBeNull();
      expect(result.courtRule).toBeNull();
    });
  });
});
