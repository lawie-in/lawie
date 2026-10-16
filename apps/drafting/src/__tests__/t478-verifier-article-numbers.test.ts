/**
 * T-478 part (b), Ajay's ruling 1 (T-245 file 7d42b105): the fact verifier never blanks a
 * legal-reference number (Article / Art. / Section / S. / s. / Order / O. / Rule / r. /
 * Schedule / Para), while real case numbers are still blanked.
 *
 * Goes through the real entry points (verifyDraft, then applyPlaceholders, which is what a
 * delivered draft gets). Pure: no model call, no database.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { applyPlaceholders, verifyDraft, type VerifierInput } from '../services/fact-verifier';
import { loadRulePack } from '../services/rule-pack.service';

interface Fixture {
  pack: string;
  skeleton: string[];
}
const S138: Fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 't147d', 's138-notice.json'), 'utf8'),
);

function inputOf(
  body: string,
  pack = S138.pack,
  skeleton: string[] = S138.skeleton,
): VerifierInput {
  return {
    body,
    facts: [],
    unresolved: [],
    lists: loadAvermentLists(pack),
    skeleton,
    packText: packTexts(loadRulePack(pack)!),
  };
}

/** The delivered text: verify, then replace every flagged value with its blank. */
function deliver(sentence: string, pack = S138.pack): string {
  const body = `1. ${sentence}`;
  return applyPlaceholders(body, verifyDraft(inputOf(body, pack))).body;
}
const BLANK = '{{MISSING:';
/** Findings that would blank a number as a case/FIR number (the thing T-478b forbids). */
const caseNoFindings = (sentence: string) =>
  verifyDraft(inputOf(`1. ${sentence}`)).filter((v) => v.entityType === 'case_no');
const blanks = (s: string): number => s.split(BLANK).length - 1;

describe('T-478b: legal-reference numbers are never blanked', () => {
  const PROTECTED: Array<[string, string]> = [
    ['Article 226', 'That the petitioner invokes Article 226 of the Constitution.'],
    ['Article 227', 'That the petitioner invokes Article 227 of the Constitution.'],
    ['Art. 227', 'That the petitioner invokes Art. 227 of the Constitution.'],
    ['Art 32', 'That the petitioner invokes Art 32 of the Constitution.'],
    ['article 226 (lowercase)', 'That the petitioner invokes article 226 of the Constitution.'],
    [
      'Articles 226 and 227',
      'That the petitioner invokes Articles 226 and 227 of the Constitution.',
    ],
    ['Article 226(1)', 'That the petitioner invokes Article 226(1) of the Constitution.'],
    ['Order 39 Rule 1', 'That the application is under Order 39 Rule 1 of the Code.'],
    ['O. 39 r. 2', 'That the application is under O. 39 r. 2 of the Code.'],
    ['Rule 11', 'That the plaint is liable to be rejected under Rule 11 of the Code.'],
    ['Para 12', 'That the petitioner relies on Para 12 of the order.'],
    ['Para 12(a)', 'That the petitioner relies on Para 12(a) of the order.'],
    ['Schedule 7', 'That the entry is in Schedule 7 of the Constitution.'],
  ];

  it.each(PROTECTED)('%s: no finding, no blank, text unchanged', (_n, sentence) => {
    const body = `1. ${sentence}`;
    expect(verifyDraft(inputOf(body))).toEqual([]);
    expect(deliver(sentence)).toBe(body);
  });

  // Rows with 3+ digits: BARE_NUMBER_RE would blank these without the T-478 pass, so they
  // really exercise the change (the shorter rows above would pass either way).
  it.each([
    ['Order 123', 'Order 123'],
    ['O. 123', 'O. 123'],
    ['Rule 115', 'Rule 115'],
    ['r. 115', 'r. 115'],
    ['Schedule 100', 'Schedule 100'],
    ['Para 123', 'Para 123'],
    ['Art 323A', 'Art 323A'],
    ['Article 226(1)', 'Article 226(1)'],
    ['Orders 100 and 101', 'Orders 100 and 101'],
  ])('%s (3+ digits): prefix and number survive, no blank', (_n, ref) => {
    const sentence = `That the petitioner relies on ${ref} of the Act.`;
    const out = deliver(sentence);
    expect(out).toContain(ref);
    expect(out).not.toContain(BLANK);
    expect(verifyDraft(inputOf(`1. ${sentence}`))).toEqual([]);
  });

  // Section 138 / S. 138 / s.482 are also read by the separate "section" check (a section that is
  // not in the ledger or pack is blanked as "section"). That is pre-existing and not number
  // blanking, so here the assertion is only that the number is never taken as a case number.
  it.each([
    ['Section 138', 'That the offence is under Section 138 of the Act.'],
    ['S. 138', 'That the offence is under S. 138 of the Act.'],
    ['s.482', 'That the petition is under s.482 of the Code.'],
  ])('%s: never a case_no finding', (_n, sentence) => {
    expect(caseNoFindings(sentence)).toEqual([]);
  });

  it('a writ sentence keeps Article 227 and Article 226 in the delivered draft (certiorari pack)', () => {
    const sentence =
      'That a writ of certiorari under Article 227 of the Constitution of India is sought, and the petitioner also invokes Article 226 of the Constitution.';
    const out = deliver(sentence, 'certiorari');
    expect(out).toContain('Article 227');
    expect(out).toContain('Article 226');
    expect(out).not.toContain(BLANK);
    expect(out).toBe(`1. ${sentence}`);
  });
});

describe('T-478b: names next to a prefix are handled as before', () => {
  const findings = (sentence: string) =>
    verifyDraft(inputOf(`1. ${sentence}`)).map((v) => [v.entityType, v.check, v.label]);

  it('"Rajesh Kumar relies on Art. 227": name findings equal the control without the Art clause', () => {
    const control = findings('That Rajesh Kumar relies on the order.');
    const withArt = findings('That Rajesh Kumar relies on Art. 227.');
    expect(control.length).toBeGreaterThan(0); // the control really blanks the name
    expect(withArt).toEqual(control);
    expect(deliver('That Rajesh Kumar relies on Art. 227.')).toContain('Art. 227');
  });
  it('"Smith Art. 5 applies": Smith is handled as in the control; Art. 5 is kept', () => {
    const control = findings('That Smith applies.');
    expect(findings('That Smith Art. 5 applies.')).toEqual(control);
    expect(deliver('That Smith Art. 5 applies.')).toContain('Art. 5');
  });
  it('sentence-initial "Articles 226 and 227 apply" keeps everything', () => {
    const body = 'Articles 226 and 227 apply.';
    expect(verifyDraft(inputOf(body))).toEqual([]);
    expect(applyPlaceholders(body, verifyDraft(inputOf(body))).body).toBe(body);
  });
});

describe('T-478b: real case numbers are still blanked', () => {
  const BLANKED: Array<[string, string, string]> = [
    ['Case No.', 'That the matter is Case No. 123456 before the court.', '123456'],
    ['Bail Application No.', 'That Bail Application No. 1234/2024 is pending.', '1234/2024'],
    ['FIR No.', 'That FIR No. 123/2024 was registered.', '123/2024'],
    ['bare 6-digit number', 'That the matter is numbered 123456 on the board.', '123456'],
    ['Order No.', 'That Order No. 123456 was passed.', '123456'],
    ['Mr. 1234', 'That Mr. 1234 appeared.', '1234'],
    ['Dr. 12345', 'That Dr. 12345 appeared.', '12345'],
    ['Molar 123456', 'That Molar 123456 was noted.', '123456'],
  ];

  it.each(BLANKED)('%s: the number is blanked', (_n, sentence, num) => {
    const out = deliver(sentence);
    expect(blanks(out)).toBeGreaterThanOrEqual(1);
    expect(out).not.toContain(num);
  });

  it('Article 226 and 123456: 123456 is blanked, 226 is kept', () => {
    const out = deliver('That Article 226 and 123456 are relied on.');
    expect(out).toContain('Article 226');
    expect(out).not.toContain('123456');
    expect(blanks(out)).toBe(1);
  });

  it('Rules 3 to 5, 2024: 2024 is not swallowed into the list', () => {
    const body = '1. That Rules 3 to 5, 2024 apply.';
    const vs = verifyDraft(inputOf(body));
    // 2024 is a four-digit later item, so it is outside the 1-3 digit cap and still found.
    const out = applyPlaceholders(body, vs).body;
    expect(out).toContain('Rules 3 to 5');
    expect(out).not.toContain('2024');
  });

  it('mixed: Under Article 227 in Case No. 123456 keeps 227, blanks 123456', () => {
    const out = deliver('That, under Article 227 in Case No. 123456, the petition lies.');
    expect(out).toContain('Article 227');
    expect(out).not.toContain('123456');
    expect(blanks(out)).toBe(1);
  });
});

describe('T-478b: policy edges (shown to Ajay)', () => {
  // POLICY (Ajay, ref 1a3cc988): the first number after a prefix is capped at 4 digits (plus an
  // optional letter), so a 5-6 digit number is a case number even after "order"/"rule".
  it('lowercase "order 123456" is not protected under the 4-digit cap (ref 1a3cc988)', () => {
    const out = deliver('That the petitioner relies on order 123456 of the Act.');
    expect(out).not.toContain('123456');
    expect(blanks(out)).toBe(1);
  });
  it('lowercase "rule 123456" is not protected under the 4-digit cap (ref 1a3cc988)', () => {
    const out = deliver('That the rule 123456 applies.');
    expect(out).not.toContain('123456');
    expect(blanks(out)).toBe(1);
  });
  // POLICY: "A. S. 123456" (an appeal-suit style number). The developer expected "S. 123456" to be
  // protected. In practice the number is NOT read as a case number, but the separate "section"
  // check blanks the whole "S. 123456" as a section, so the number still does not reach the draft.
  it('"A. S. 123456": no case_no finding; the section check blanks it (observed behaviour)', () => {
    expect(caseNoFindings('That A. S. 123456 is pending.')).toEqual([]);
    expect(deliver('That A. S. 123456 is pending.')).not.toContain('123456');
  });
  // POLICY: later list items are capped at 3 digits, so a 4-digit later item is still blanked.
  it('a 4-digit later list item is still blanked', () => {
    const out = deliver('That Article 226 and 1234 are relied on.');
    expect(out).toContain('Article 226');
    expect(out).not.toContain('1234');
  });
  // "Paragraph" is not a covered prefix.
  it('"Paragraph 123456" is not protected', () => {
    const out = deliver('That Paragraph 123456 is relied on.');
    expect(out).not.toContain('123456');
  });
});

describe('T-478b: ReDoS guard', () => {
  const run = (text: string): number => {
    const t0 = Date.now();
    verifyDraft(inputOf(`1. ${text}`));
    return Date.now() - t0;
  };
  it.each([
    ['repeated "Article 1, "', 'Article 1, '.repeat(2000)],
    ['repeated "Section 1 and "', 'Section 1 and '.repeat(1700)],
    ['long digit run after Article', `Article ${'1'.repeat(20000)}`],
    ['long bracket run', `Article 1${'('.repeat(20000)}`],
    ['long whitespace run', `Article${' '.repeat(20000)}x`],
  ])('20k pathological input (%s) finishes quickly', (_n, text) => {
    expect(text.length).toBeGreaterThanOrEqual(10000);
    expect(run(text)).toBeLessThan(200);
  });
});

describe('T-478b: first-number cap, suffix, prefix case (ref 1a3cc988)', () => {
  const sent = (ref: string) => `That the petitioner relies on ${ref} of the Act.`;
  it.each(['Article 12345', 'Rule 123456', 'Order 123456'])(
    '%s: number over 4 digits is blanked',
    (ref) => {
      const out = deliver(sent(ref));
      expect(out).not.toMatch(/\d{5}/);
      expect(blanks(out)).toBeGreaterThanOrEqual(1);
    },
  );
  it.each(['Order 1234', 'Article 21A', 'Art 323A', 'ARTICLE 226', 'article 226', 'ARTICLE 1234'])(
    '%s: kept',
    (ref) => {
      const out = deliver(sent(ref));
      expect(out).toContain(ref);
      expect(out).not.toContain(BLANK);
    },
  );
  // Short prefixes are case-exact: [Ss]. / O. / r. are prefixes; o. and R. are not.
  it.each(['O. 123', 'r. 115', 'S. 138', 's. 482'])('%s: short prefix, never a case_no', (ref) => {
    expect(caseNoFindings(sent(ref))).toEqual([]);
  });
  it.each(['O. 123', 'r. 115'])('%s: kept whole in the delivered draft', (ref) => {
    expect(deliver(sent(ref))).toContain(ref);
  });
  it.each(['o. 123', 'R. 123'])('%s: not a prefix, so the 3-digit number is blanked', (ref) => {
    const out = deliver(sent(ref));
    expect(out).not.toContain('123');
    expect(blanks(out)).toBeGreaterThanOrEqual(1);
  });
});

describe('T-478b: amount guard (ref 1a3cc988)', () => {
  const sent = (ref: string) => `That the petitioner relies on ${ref} of the Act.`;
  it('"Orders 100 and 101" keeps all text', () => {
    const body = `1. ${sent('Orders 100 and 101')}`;
    expect(verifyDraft(inputOf(body))).toEqual([]);
    expect(deliver(sent('Orders 100 and 101'))).toBe(body);
  });
  it('"Partners 500" is not an amount', () => {
    const vs = verifyDraft(inputOf('1. That the Partners 500 agreed.'));
    expect(vs.filter((v) => v.entityType === 'amount')).toEqual([]);
  });
  it.each([
    ['Rs. 5,000', '5,000'],
    ['Rs 500', '500'],
    ['INR 1000', '1000'],
    ['\u20b9 200', '200'],
    ['(Rs.100)', '100'],
    ['paid,Rs.100', '100'],
  ])('%s is still an amount and is blanked', (ref, num) => {
    const sentence = `That the petitioner ${ref.startsWith('paid') ? '' : 'paid '}${ref} to the noticee.`;
    const vs = verifyDraft(inputOf(`1. ${sentence}`));
    // Found by the amount matcher itself, not just by the bare-number pass.
    expect(vs.some((v) => v.entityType === 'amount')).toBe(true);
    expect(vs.some((v) => v.entityType === 'case_no')).toBe(false);
    const out = deliver(sentence);
    expect(out).not.toContain(num);
    expect(blanks(out)).toBeGreaterThanOrEqual(1);
  });
  // POLICY EDGE: a glued typo "ofRs.500" is no longer an amount (lookbehind on a letter), but the
  // number is still blanked through the bare-number pass.
  it('glued "ofRs.500" is not an amount, still blanked via the bare-number pass', () => {
    const sentence = 'That the petitioner paid a sum ofRs.500 to the noticee.';
    const vs = verifyDraft(inputOf(`1. ${sentence}`));
    expect(vs.some((v) => v.entityType === 'amount')).toBe(false);
    expect(vs.some((v) => v.entityType === 'case_no')).toBe(true);
    expect(deliver(sentence)).not.toContain('500');
  });
});
