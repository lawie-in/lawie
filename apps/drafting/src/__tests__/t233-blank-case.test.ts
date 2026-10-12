/**
 * T-233 criterion 4 — the blank marker match is case-insensitive in
 * packages/shared/src/blanks.ts. Canonical forms behave as before.
 */
import { countBlanks, findBlanks, markBlanks } from '@lawie/shared';

const SECTION_LABEL = 'Section — verify before filing';
const AUTHORITY_LABEL = 'Authority — add if relied upon';

describe('T-233 AC4: blank markers match in any case', () => {
  it.each([
    ['[to be confirmed: x]', 'x'],
    ['[TO BE CONFIRMED: Date of FIR]', 'Date of FIR'],
    ['[To Be Confirmed: Date of FIR]', 'Date of FIR'],
    ['[To be confirmed: Date of FIR]', 'Date of FIR'],
    ['{{missing: x}}', 'x'],
    ['{{Missing: x}}', 'x'],
    ['{{MISSING: x}}', 'x'],
    ['{{ missing : x }}', 'x'],
  ])('%s is one blank labelled %s', (marker, label) => {
    const b = findBlanks(`That the ${marker} was lodged.`);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe(marker);
    expect(b[0].label).toBe(label);
  });

  it('lower-case Section marker is found with the canonical label', () => {
    const lower = '[section — verify before filing]';
    const b = findBlanks(`Under ${lower} of the Code.`);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe(lower);
    expect(b[0].label).toBe(SECTION_LABEL);
    expect(findBlanks('Under [SECTION — VERIFY BEFORE FILING] of the Code.')[0].label).toBe(
      SECTION_LABEL,
    );
  });

  it('canonical Section marker keeps its label', () => {
    const b = findBlanks('Under [Section — verify before filing] of the Code.');
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe(SECTION_LABEL);
  });

  it('Authority marker: canonical and other case both labelled the same', () => {
    expect(findBlanks('See [Authority — add if relied upon].')[0].label).toBe(AUTHORITY_LABEL);
    const b = findBlanks('See [authority — add if relied upon].');
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe(AUTHORITY_LABEL);
  });

  it('a lower-case marker and its canonical form give the same label and count', () => {
    const lower = findBlanks('[to be confirmed: Court name] and {{missing: Court name}}');
    const canon = findBlanks('[To be confirmed: Court name] and {{MISSING: Court name}}');
    expect(lower.map((x) => x.label)).toEqual(canon.map((x) => x.label));
    expect(
      countBlanks('[to be confirmed: a] {{missing: b}} [section — verify before filing]'),
    ).toBe(3);
  });

  it('markBlanks marks every case variant and returns them', () => {
    const text = 'A [to be confirmed: x] B {{missing: y}} C [section — verify before filing] D';
    const { marked, blanks } = markBlanks(text, findBlanks);
    expect(blanks).toHaveLength(3);
    expect(marked).not.toBe(text);
    expect(marked.replace(/[-]/g, '')).toBe(text);
  });

  it('text without a marker still has no blanks', () => {
    expect(findBlanks('That the to be confirmed date is missing section.')).toHaveLength(0);
  });
});
