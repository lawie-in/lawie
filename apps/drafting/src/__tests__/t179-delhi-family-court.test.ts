/**
 * T-179 — Delhi family court headings (AJ-2026-10-08-T179 and -T179-A).
 * Typed path only: resolveCourtRule -> postProcess with a stand-in LLM first line.
 */
import './setupEnv';
import './setupDb';

import { resolveCourtRule } from '../services/prompt-assembler';
import { postProcess } from '../services/post-processor';

const PARTIES = { petitioner: 'Asha Devi', respondent: 'Ravi Kumar' };
const BODY =
  'M.J. No. _____ of 2026\n\nAsha Devi ... PETITIONER\n\nVERSUS\n\nRavi Kumar ... RESPONDENT\n\n1. The petitioner states.';

const DELHI_BLANK = 'IN THE FAMILY COURT AT [To be confirmed: district/complex], DELHI';
const T176_BLANK = 'IN THE FAMILY COURT AT [To be confirmed: place]';

function firstLine(courtName: string): string {
  const courtRule = resolveCourtRule('family_court', courtName);
  return postProcess({
    rawText: `IN THE FAMILY COURT\n${BODY}`,
    docRule: null,
    courtRule,
    partyDetails: PARTIES,
    courtName,
  }).formattedText.split('\n')[0];
}

describe('T-179 Delhi family court headings', () => {
  describe('bare Delhi gives the district/complex placeholder', () => {
    it.each([
      'Family Court, Delhi',
      'Family Court, New Delhi',
      'Family Court, NCT of Delhi',
      'Family Court, Delhi NCT',
      'Family Court, National Capital Territory of Delhi',
    ])('%j', (name) => {
      expect(firstLine(name)).toBe(DELHI_BLANK);
    });
  });

  describe('complexes print the ruled line', () => {
    it.each([
      ['Family Court, Tis Hazari, Delhi', 'IN THE FAMILY COURT AT TIS HAZARI, DELHI'],
      ['Family Court, Tees Hazari Courts, Delhi', 'IN THE FAMILY COURT AT TIS HAZARI, DELHI'],
      ['Family Court, Karkardooma Courts, Delhi', 'IN THE FAMILY COURT AT KARKARDOOMA, DELHI'],
      ['Family Court, Kadkadooma Court', 'IN THE FAMILY COURT AT KARKARDOOMA, DELHI'],
      ['Family Court, Rohini, Delhi', 'IN THE FAMILY COURT AT ROHINI, DELHI'],
      ['Family Court, Saket, New Delhi', 'IN THE FAMILY COURT AT SAKET, NEW DELHI'],
      ['Family Court, Saket Courts, New Delhi', 'IN THE FAMILY COURT AT SAKET, NEW DELHI'],
      ['Family Court, Dwarka, New Delhi', 'IN THE FAMILY COURT AT DWARKA, NEW DELHI'],
      ['Family Court, Dwarka Courts Complex, New Delhi', 'IN THE FAMILY COURT AT DWARKA, NEW DELHI'],
      ['Family Court, Patiala House', 'IN THE FAMILY COURT AT PATIALA HOUSE, NEW DELHI'],
      ['Family Court, Rouse Avenue', 'IN THE FAMILY COURT AT ROUSE AVENUE, NEW DELHI'],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('districts print the district line', () => {
    it.each([
      ['Family Court, South District, Delhi', 'IN THE FAMILY COURT, SOUTH DISTRICT, DELHI'],
      ['Family Court, South Distt., Delhi', 'IN THE FAMILY COURT, SOUTH DISTRICT, DELHI'],
      ['Family Court, New Delhi District', 'IN THE FAMILY COURT, NEW DELHI DISTRICT, DELHI'],
      ['Family Court, south west District, Delhi', 'IN THE FAMILY COURT, SOUTH-WEST DISTRICT, DELHI'],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('compass word with Delhi is bare Delhi, not a district (T179-A)', () => {
    it.each([
      'Family Court, South Delhi',
      'Family Court, South, Delhi',
      'Family Court, Central Delhi',
      'Family Court, East Delhi',
      'Family Court, NCT Delhi',
      'Family Court, Delhi (NCT)',
      'Family Court, North-West Delhi',
    ])('%j', (name) => {
      expect(firstLine(name)).toBe(DELHI_BLANK);
    });
  });

  describe('Dwarka, Rohini, Saket alone are not known to be Delhi (T179-B 2)', () => {
    it.each([
      ['Family Court, Rohini', 'IN THE FAMILY COURT AT ROHINI'],
      ['Family Court, Saket', 'IN THE FAMILY COURT AT SAKET'],
      ['Family Court, Dwarka', 'IN THE FAMILY COURT AT DWARKA'],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('Delhi-only complexes count without Delhi typed (T179-B 2)', () => {
    it('Tis Hazari alone', () => {
      expect(firstLine('Family Court, Tis Hazari')).toBe('IN THE FAMILY COURT AT TIS HAZARI, DELHI');
    });
  });

  describe('two different complexes or districts (T179-B 1)', () => {
    it.each([
      ['Family Court, Saket Courts, Rohini, Delhi', DELHI_BLANK],
      ['Family Court, Tis Hazari, Karkardooma', DELHI_BLANK],
      ['Family Court, Saket, Rohini', T176_BLANK],
      ['Family Court, Saket, Tis Hazari', T176_BLANK],
      ['Family Court, East District, West District', T176_BLANK],
      ['Family Court, East District, West District, Delhi', DELHI_BLANK],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('compass-word district counts as Delhi only with Delhi typed (T179-B)', () => {
    it.each([
      ['Family Court, East District', 'IN THE FAMILY COURT AT EAST DISTRICT'],
      ['Family Court, East District, Delhi', 'IN THE FAMILY COURT, EAST DISTRICT, DELHI'],
      ['Family Court, Shahdara District', 'IN THE FAMILY COURT, SHAHDARA DISTRICT, DELHI'],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('reviewer rows', () => {
    it.each([
      ['Family Court, Saket New Delhi', 'IN THE FAMILY COURT AT SAKET, NEW DELHI'],
      ['Family Court, Civil Lines District, Delhi', 'IN THE FAMILY COURT AT CIVIL LINES DISTRICT, DELHI'],
      ['Family Court, South', 'IN THE FAMILY COURT AT SOUTH'],
      ['Family Court, Rohini Courts, Pune', T176_BLANK],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });

  describe('precedence and fall-backs', () => {
    it('a complex wins over a district', () => {
      expect(firstLine('Family Court, Saket Courts, South District, New Delhi')).toBe(
        'IN THE FAMILY COURT AT SAKET, NEW DELHI',
      );
    });

    it('a court number gives the T-176 placeholder', () => {
      expect(firstLine('Family Court No. 2, Saket Courts, New Delhi')).toBe(T176_BLANK);
    });

    it('"Civil Courts, Patna" gives the T-176 placeholder', () => {
      expect(firstLine('Family Court, Civil Courts, Patna')).toBe(T176_BLANK);
    });
  });

  describe('other cities unchanged', () => {
    it.each([
      ['Family Court, Patna', 'IN THE FAMILY COURT AT PATNA'],
      ['Family Court, Lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['Family Court, Ranchi', 'IN THE FAMILY COURT AT RANCHI'],
    ])('%j -> %s', (name, expected) => {
      expect(firstLine(name)).toBe(expected);
    });
  });
});
