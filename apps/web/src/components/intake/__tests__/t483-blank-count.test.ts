/**
 * T-483 (D): the intake review's blank count is the export dialog's count for the same
 * content (Ajay's signed set in @lawie/shared), not the old looser count.
 */
import { blanksInContent } from '@/components/editor/exportUtils';
import { countBlanks } from '../briefTypes';

const TBC = (label: string) => `[To be confirmed: ${label}]`;

describe('T-483 countBlanks', () => {
  it('counts two marked blanks and not the signing date or the cause title blanks', () => {
    const draft = [
      'IN THE COURT OF THE SESSIONS JUDGE',
      'Bail Application No. _____ of 2026',
      'Ramesh Mahto ... Applicant',
      'VERSUS',
      'State of Jharkhand ... Respondent',
      '1. That the applicant',
      `Applicant ${TBC('father name')} was arrested on ${TBC('date of arrest')}.`,
      'Verified on this _____ day of _________, 2026.',
    ].join('\n');
    expect(countBlanks(draft)).toBe(2);
    expect(countBlanks(draft)).toBe(blanksInContent(draft).length);
  });

  it('counts a {{MISSING: x}} token as one', () => {
    expect(countBlanks('The applicant {{MISSING: age}} is unwell.')).toBe(1);
  });

  it('counts a repeated identical blank each time, as the export dialog does', () => {
    const draft = `${TBC('police station')} and again ${TBC('police station')}.`;
    expect(countBlanks(draft)).toBe(2);
    expect(countBlanks(draft)).toBe(blanksInContent(draft).length);
  });

  it('equals the export dialog count for mixed content', () => {
    const draft = `IN THE COURT\r\nNo. _____ of 2026\r\nVERSUS\r\n1. That A ${TBC('x')} B {{MISSING: y}} C ${TBC('x')}\r\non this _____ day of _________, 2026`;
    expect(countBlanks(draft)).toBe(blanksInContent(draft).length);
    expect(countBlanks(draft)).toBe(3);
  });

  it('is zero for a draft with no blanks', () => {
    expect(countBlanks('Nothing is missing here.')).toBe(0);
  });
});
