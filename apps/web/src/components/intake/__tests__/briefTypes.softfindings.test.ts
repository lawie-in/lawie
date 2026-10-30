// T-690b: shownSoftFindings keeps only well-formed findings, one per rule_id and per text.
import { shownSoftFindings } from '../briefTypes';

const A = { rule_id: 'ws_over_90_days', text: 'Signed text A.' };
const B = { rule_id: 'other_rule', text: 'Signed text B.' };

describe('shownSoftFindings', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'ws_over_90_days'],
    ['a number', 3],
    ['an object', { rule_id: 'a', text: 'b' }],
    ['true', true],
    ['an empty array', []],
  ])('%s gives []', (_n, v) => {
    expect(shownSoftFindings(v)).toEqual([]);
  });

  it('keeps a good entry as is', () => {
    expect(shownSoftFindings([A])).toEqual([A]);
  });

  it('drops malformed entries', () => {
    expect(
      shownSoftFindings([
        { rule_id: 'no_text' },
        { rule_id: 'empty', text: '' },
        { rule_id: 'blank', text: '   \n ' },
        { rule_id: 7, text: 'numeric id' },
        { text: 'no id' },
        { rule_id: 'num_text', text: 5 },
        null,
        undefined,
        'string',
        42,
        [],
        A,
      ]),
    ).toEqual([A]);
  });

  it('shows two entries with the same rule_id once (the first)', () => {
    expect(shownSoftFindings([A, { rule_id: A.rule_id, text: 'Different text.' }])).toEqual([A]);
  });

  it('shows two entries with the same text once (the first)', () => {
    expect(shownSoftFindings([A, { rule_id: 'another_id', text: A.text }])).toEqual([A]);
  });

  it('keeps the order of distinct entries', () => {
    expect(shownSoftFindings([B, A])).toEqual([B, A]);
    expect(shownSoftFindings([A, B, A, B])).toEqual([A, B]);
  });

  it('ignores extra fields and does not alter the text', () => {
    const text = '  Padded text with  double  spaces.\n';
    const out = shownSoftFindings([{ rule_id: 'x', text, severity: 'high', extra: { a: 1 } }]);
    expect(out).toEqual([{ rule_id: 'x', text }]);
    expect(Object.keys(out[0]).sort()).toEqual(['rule_id', 'text']);
  });
});
