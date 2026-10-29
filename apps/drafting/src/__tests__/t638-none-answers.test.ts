/**
 * T-638 Part A, ruling A1 (Ajay, 28 Oct 2026): `नहीं` and `कोई नहीं` join the "none" answers for the five
 * NONE_IS_EMPTY_KEYS, only when the question was asked-when-empty. The match is strict: vowel signs count.
 */
import './setupEnv';

import { buildChecklist, isNoFactAnswer } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const CL = buildChecklist(loadRulePack('bail_regular')!);
const item = (k: string) => CL.find((i) => i.key === k)!;
const KEYS = [
  'medical_condition',
  'local_ties',
  'co_accused_bail_court',
  'co_accused_bail_date',
  'dependants',
];

describe('T-638 A1: Devanagari "none" answers', () => {
  it('the five keys are asked when empty in the real pack', () => {
    for (const k of KEYS) expect(item(k).askWhenEmpty).toBe(true);
  });

  describe.each(KEYS)('%s', (key) => {
    // A1a: the no-anusvara spellings count too; a trailing । or . is fine
    it.each([
      'नहीं',
      'नहीं।',
      'नहीं.',
      'कोई नहीं',
      '  नहीं  ',
      'कोई नहीं।',
      'नही',
      'नही।',
      'कोई नही',
    ])('%j is a no-fact answer', (word) => {
      expect(isNoFactAnswer(item(key), word)).toBe(true);
    });

    it.each(['नहीं है', 'कोई नहीं है', 'नहा', 'नहि', 'नह', 'कई नहीं', 'मधुमेह', 'नहीं मिला'])(
      '%j is not (strict)',
      (word) => {
        expect(isNoFactAnswer(item(key), word)).toBe(false);
      },
    );

    it('only when the question was asked when empty', () => {
      const notAsked = { ...item(key), askWhenEmpty: false };
      expect(isNoFactAnswer(notAsked, 'नहीं')).toBe(false);
      expect(isNoFactAnswer(notAsked, 'कोई नहीं')).toBe(false);
      expect(isNoFactAnswer(notAsked, 'नही')).toBe(false);
    });

    it('the Latin set is unchanged', () => {
      for (const w of [
        'None',
        'nil',
        'no',
        'Not applicable',
        'N/A',
        'Nahi',
        'koi nahi',
        'Kuch Nahi!',
      ]) {
        expect(isNoFactAnswer(item(key), w)).toBe(true);
      }
      expect(isNoFactAnswer(item(key), 'Not known')).toBe(true);
      expect(isNoFactAnswer(item(key), 'Asthma')).toBe(false);
    });
  });

  it('a key outside the five is not a "none" key', () => {
    const other = { ...item('antecedents'), askWhenEmpty: true };
    expect(isNoFactAnswer(other, 'नहीं')).toBe(false);
  });
});
