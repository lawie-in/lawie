/**
 * T-194 phase 2 — the one blank set (Ajay's sign-off (d) and his rulings of
 * 11 Oct 2026, night), in packages/shared/src/blanks.ts.
 *
 * AC covered: 5 (header text), 7 (N counts every blank incl. cause title, prayer,
 * verification), 9 (0 / 1 / several), and the "web and server agree" requirement.
 */
import fs from 'fs';
import path from 'path';

import {
  EMPTY_BLANK_LABEL,
  UNDERSCORE_BLANK_LABEL,
  blankContext,
  blankText,
  countBlanks,
  draftHeaderText,
  findBlanks,
  markBlanks,
} from '@lawie/shared';

import { blanksInContent } from '../services/pdf-export.service';

const TBC = (label: string) => `[To be confirmed: ${label}]`;
const SECTION = '[Section — verify before filing]';
const AUTHORITY = '[Authority — add if relied upon]';

describe('set (d): one test per row', () => {
  it('[To be confirmed: …] counts', () => {
    const b = findBlanks(`That the FIR ${TBC('Date of FIR')} was lodged.`);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe('[To be confirmed: Date of FIR]');
    expect(b[0].label).toBe('Date of FIR');
  });

  it('{{MISSING: …}} counts, with the same label', () => {
    const b = findBlanks('That the FIR {{MISSING: Date of FIR}} was lodged.');
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe('{{MISSING: Date of FIR}}');
    expect(b[0].label).toBe('Date of FIR');
  });

  it('[Section — verify before filing] counts, listed by its marker words', () => {
    const b = findBlanks(`Under ${SECTION} of the Code.`);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe(SECTION);
    expect(b[0].label).toBe('Section — verify before filing');
  });

  it('[Authority — add if relied upon] counts, listed by its marker words', () => {
    const b = findBlanks(`As held in ${AUTHORITY}.`);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe(AUTHORITY);
    expect(b[0].label).toBe('Authority — add if relied upon');
  });

  it('an underscore run of 3 or more inside a line counts (Case No. _____)', () => {
    const b = findBlanks('Under Case No. _____ before this court.');
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe('_____');
    expect(b[0].label).toBe(UNDERSCORE_BLANK_LABEL);
  });

  it('a run of 2 underscores is not a blank', () => {
    expect(countBlanks('a __ b')).toBe(0);
  });

  it('a run of exactly 3 underscores is a blank', () => {
    expect(countBlanks('a ___ b')).toBe(1);
  });

  it('exception 1: a line of underscores only (signature line) does not count', () => {
    expect(countBlanks('Deponent\n\n__________________\n\nSignature')).toBe(0);
    expect(countBlanks('__________')).toBe(0);
    expect(countBlanks('   ______   ')).toBe(0);
  });

  it('exception 2: the verification signing date does not count (inside the block)', () => {
    const v = 'VERIFICATION\n\nI verify the above.\n\nVerified at Patna, ___ day of ______, 20___.';
    expect(countBlanks(v)).toBe(0);
  });

  it('exception 3: the registry number in the cause title does not count', () => {
    const t =
      'IN THE COURT OF SESSIONS\n\nBAIL APPLICATION No. _____ of 2026\n\nRam ... Applicant\nVERSUS\nState';
    expect(countBlanks(t)).toBe(0);
  });

  it('mixed markers in one draft are all counted, in document order', () => {
    const text = `A ${TBC('x')} b ____ c ${SECTION} d {{MISSING: y}} e ${AUTHORITY}`;
    const b = findBlanks(text);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.start)).toEqual([...b.map((x) => x.start)].sort((p, q) => p - q));
    for (const x of b) expect(text.slice(x.start, x.end)).toBe(x.text);
  });

  it('empty text and text without blanks give 0', () => {
    expect(findBlanks('')).toEqual([]);
    expect(countBlanks('All facts are filled in. Section 439 CrPC.')).toBe(0);
  });
});

describe("Ajay's ruling 2: the signing date", () => {
  it('"Verified at Patna on this ___ day of ___, 2026" is not counted', () => {
    expect(countBlanks('Verified at Patna on this ___ day of ___, 2026')).toBe(0);
  });

  it('"arrested on the ___ day of ___, 2026" in a body paragraph is counted, as ONE blank', () => {
    const t = '1. That the applicant was arrested on the ___ day of ___, 2026 by the police.';
    const b = findBlanks(t);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe('___ day of ___, 2026');
  });

  it('"Dated this ___ day of ______, 2026" is exempt anywhere ("this" before it)', () => {
    expect(countBlanks('1. Some body text.\n\nDated this ___ day of ______, 2026')).toBe(0);
  });

  it('"this" must be on the same line', () => {
    expect(countBlanks('1. That on this\n___ day of ______, 2026 he was arrested.')).toBe(1);
  });

  it('a printed year (_____ day of _________, 2026) is exempt like 20___', () => {
    expect(countBlanks('Verified at Patna on this _____ day of _________, 2026')).toBe(0);
    expect(countBlanks('VERIFICATION\n\nVerified at Patna, _____ day of _________, 2026.')).toBe(0);
    expect(countBlanks('VERIFICATION\n\nVerified at Patna, ___ day of ______, 20___.')).toBe(0);
  });

  it.each(['Verified', 'Verification', 'Solemnly affirmed', 'Sworn', 'Affirmed', 'Jurat'])(
    'a paragraph starting with "%s" is a signing block',
    (word) => {
      expect(countBlanks(`1. Body.\n\n${word} at Patna, ___ day of ______, 2026.`)).toBe(0);
    },
  );

  it('the paragraph after a VERIFICATION or JURAT heading line is a signing block', () => {
    expect(
      countBlanks(
        '1. Body.\n\nVERIFICATION\n\nI, Ram, state that ___ day of ______, 2026 it is true.',
      ),
    ).toBe(0);
    expect(
      countBlanks('1. Body.\n\nJURAT\n\nI, Ram, state that ___ day of ______, 2026 it is true.'),
    ).toBe(0);
  });

  it('a heading that is more than only VERIFICATION does not open a block', () => {
    expect(
      countBlanks(
        '1. Body.\n\nVERIFICATION OF FACTS BY THE POLICE\n\nOn the ___ day of ______, 2026 he was arrested.',
      ),
    ).toBe(1);
  });

  it('other blanks inside the verification still count', () => {
    const v = `VERIFICATION\n\nVerified at ${TBC('Place')}, ___ day of ______, 20___.`;
    expect(countBlanks(v)).toBe(1);
  });

  it('a day-of date outside any block and without "this" counts as one blank, not several', () => {
    expect(countBlanks('1. Order dated the ___ day of ______, 20___ was passed.')).toBe(1);
  });
});

describe("Ajay's ruling 3: the registry number", () => {
  const TITLE_END =
    '\n\nRam ... Applicant\nVERSUS\nState ... Respondent\n\n1. That the facts are as follows.';

  it('the first "No. ___ of" in the cause title is exempt', () => {
    expect(countBlanks(`IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026${TITLE_END}`)).toBe(0);
  });

  it('a second "No. ___ of" counts', () => {
    const t = `IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026\nRelated Case No. _____ of 2025${TITLE_END}`;
    const b = findBlanks(t);
    expect(b).toHaveLength(1);
    expect(t.slice(b[0].start - 12, b[0].start)).toMatch(/Case No\.\s*$/);
  });

  it('"in … No. ___ of" counts, even as the first number', () => {
    expect(countBlanks(`IN THE COURT\n\nApplication in Case No. _____ of 2026${TITLE_END}`)).toBe(
      1,
    );
  });

  it('"arising out of" counts', () => {
    expect(countBlanks(`IN THE COURT\n\n(Arising out of Case No. _____ of 2026)${TITLE_END}`)).toBe(
      1,
    );
    expect(countBlanks(`IN THE COURT\n\n(ARISING OUT OF Case No. _____ of 2026)${TITLE_END}`)).toBe(
      1,
    );
  });

  it('"in" is a whole word: "Bail" or "Application" does not trigger it', () => {
    expect(countBlanks(`IN THE COURT\n\nINTERIM BAIL No. _____ of 2026${TITLE_END}`)).toBe(0);
  });

  it.each(['VERSUS', 'versus', 'VS', 'vs.', 'V/S', 'V/s', 'v. s.'])(
    'a line that is only "%s" ends the cause title',
    (sep) => {
      const t = `IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026\n\nRam\n${sep}\nState\n\nCrl. Misc. No. _____ of 2024`;
      // first is exempt; the one after the separator counts
      expect(countBlanks(t)).toBe(1);
    },
  );

  it('an inline "v." / "vs." citation does not end the cause title', () => {
    const t =
      'IN THE COURT\n\nAs held in Ram v. State; Shyam vs. State, BAIL APPLICATION No. _____ of 2026\nRam\nVERSUS\nState';
    // "in" appears before the number on its line, so use a clean line instead
    const t2 =
      'IN THE COURT\nRam v. State, Shyam vs. State\nBAIL APPLICATION No. _____ of 2026\nRam\nVERSUS\nState';
    expect(countBlanks(t2)).toBe(0);
    expect(countBlanks(t)).toBe(1);
  });

  it('paragraph 1 ends the cause title when there is no VERSUS', () => {
    const t =
      'IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026\n\n1. That the facts are as follows, Case No. _____ of 2025.';
    expect(countBlanks(t)).toBe(1);
  });

  it('a number after paragraph 1 counts even before any VERSUS', () => {
    const t = '1. That Case No. _____ of 2026 is pending.\n\nVERSUS';
    expect(countBlanks(t)).toBe(1);
  });

  it('no VERSUS and no paragraph 1: the number counts', () => {
    expect(
      countBlanks(
        'IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026\n\nSome text without numbering.',
      ),
    ).toBe(1);
  });

  it('a number in the body, after the cause title, counts', () => {
    const t = `IN THE COURT\n\nBAIL APPLICATION No. _____ of 2026${TITLE_END}\n\n2. That Crl. Case No. _____ of 2025 is pending.`;
    expect(countBlanks(t)).toBe(1);
  });
});

describe('templates built from the real rule packs', () => {
  const RULES = path.join(__dirname, '..', 'config', 'document-rules');
  const load = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(RULES, `${name}.json`), 'utf8'));

  function fill(tpl: string, nomenclature: string): string {
    return tpl
      .replace('{caseNomenclature}', nomenclature)
      .replace(/\[YEAR\]/g, '2026')
      .replace(/\{date\}/g, '_____ day of _________, 2026')
      .replace(/\{[A-Za-z_]+\}/g, 'Ram Kumar');
  }

  /** Cause title + paragraph 1 + prayer + standard verification of a pack. */
  function draftOf(name: string): string {
    const pack = load(name);
    const nomenclature: string = pack.causeTitle.caseNomenclature;
    const title = fill(pack.causeTitle.format, nomenclature);
    return [
      title,
      '1. That the applicant is innocent and has been falsely implicated.',
      'PRAYER\n\nIt is prayed that the application be allowed.',
      fill(pack.verificationTemplate, nomenclature),
    ].join('\n\n');
  }

  it.each([
    ['bail_regular', 0],
    ['discharge_application', 1],
    ['bail_cancellation', 2],
    ['temporary_injunction_o39', 1],
  ])('%s: %i counted', (name, expected) => {
    expect(countBlanks(draftOf(name))).toBe(expected);
  });

  it('the packs still carry the nomenclature the counts rely on', () => {
    expect(load('bail_regular').causeTitle.caseNomenclature).toBe(
      'BAIL APPLICATION No. _____ of [YEAR]',
    );
    expect(load('discharge_application').causeTitle.caseNomenclature).toContain(
      'in {case_type} No. _____ of',
    );
    expect(load('bail_cancellation').causeTitle.caseNomenclature).toContain(
      'Arising out of Bail Order dated _____ in Bail Application No. _____',
    );
    expect(load('temporary_injunction_o39').causeTitle.caseNomenclature).toBe(
      'I.A. No. _____ of [YEAR] in Civil Suit No. _____ of [YEAR]',
    );
  });

  it('which blanks are counted: discharge counts the "in … No." number', () => {
    const b = findBlanks(draftOf('discharge_application'));
    expect(b).toHaveLength(1);
    expect(b[0].context).toContain('No. _____');
  });

  it('I.A. exempts the I.A. number and counts the Civil Suit number', () => {
    const b = findBlanks(draftOf('temporary_injunction_o39'));
    expect(b).toHaveLength(1);
    expect(b[0].context).toContain('Civil Suit No.');
  });

  it('bail_cancellation: the order date and the bail application number count', () => {
    const t = draftOf('bail_cancellation');
    const b = findBlanks(t);
    expect(b).toHaveLength(2);
    expect(b[0].context).toContain('dated');
  });

  it('one blank added to each draft adds exactly one', () => {
    for (const n of [
      'bail_regular',
      'discharge_application',
      'bail_cancellation',
      'temporary_injunction_o39',
    ]) {
      const d = draftOf(n);
      expect(countBlanks(`${d}\n\nAlso ${TBC('Extra')}`)).toBe(countBlanks(d) + 1);
    }
  });

  it('blanks in the cause title, prayer and verification are all counted (AC7)', () => {
    const d = `IN THE COURT OF ${TBC('Court')}\n\n1. Body.\n\nPRAYER\n\nGrant ${TBC('relief')}.\n\nVERIFICATION\n\nVerified at ${TBC('Place')}.`;
    expect(countBlanks(d)).toBe(3);
  });
});

describe('labels', () => {
  it('uses the label text of [To be confirmed: label]', () => {
    expect(findBlanks(TBC('Date of FIR'))[0].label).toBe('Date of FIR');
  });
  it('trims and collapses whitespace in the label', () => {
    expect(findBlanks('[To be confirmed:   Date   of\nFIR  ]')[0].label).toBe('Date of FIR');
  });
  it('an empty label gives EMPTY_BLANK_LABEL, signed exactly', () => {
    expect(EMPTY_BLANK_LABEL).toBe('To be confirmed — add the detail');
    expect(findBlanks('[To be confirmed: ]')[0].label).toBe(EMPTY_BLANK_LABEL);
    expect(findBlanks('[To be confirmed:]')[0].label).toBe(EMPTY_BLANK_LABEL);
    expect(findBlanks('{{MISSING: }}')[0].label).toBe(EMPTY_BLANK_LABEL);
  });
  it('underscore blanks are labelled "Blank to fill in", signed exactly', () => {
    expect(UNDERSCORE_BLANK_LABEL).toBe('Blank to fill in');
    expect(findBlanks('Case No. _____')[0].label).toBe('Blank to fill in');
  });
  it('Section and Authority use the marker words', () => {
    expect(findBlanks(SECTION)[0].label).toBe('Section — verify before filing');
    expect(findBlanks(AUTHORITY)[0].label).toBe('Authority — add if relied upon');
  });
});

describe('context', () => {
  it('up to 3 words each side, with … where the line goes on', () => {
    const text = 'one two three four five Case No. _____ of the year 2026 filed late';
    const [b] = findBlanks(text);
    expect(b.context).toBe('… five Case No. _____ of the year …');
  });
  it('no … when the line is short', () => {
    const [b] = findBlanks('Case No. _____ of 2026');
    expect(b.context).toBe('Case No. _____ of 2026');
  });
  it('exactly 3 words each side has no …', () => {
    const [b] = findBlanks('a b c ____ d e f');
    expect(b.context).toBe('a b c ____ d e f');
  });
  it('takes words from the blank’s own line only', () => {
    const [b] = findBlanks('previous line words here\nCase No. _____\nnext line words here');
    expect(b.context).toBe('Case No. _____');
  });
  it('blankContext agrees with the context findBlanks sets', () => {
    const text = 'x y z w Date ' + TBC('FIR') + ' of lodging the report today';
    const [b] = findBlanks(text);
    expect(blankContext(text, b)).toBe(b.context);
    expect(b.context).toBe('… z w Date [To be confirmed: FIR] of lodging the …');
  });
});

describe('draftHeaderText (Ajay (a))', () => {
  it('1 is singular', () => {
    expect(draftHeaderText(1)).toBe('DRAFT — 1 item to be confirmed');
  });
  it('N is plural, digits, em dash', () => {
    expect(draftHeaderText(2)).toBe('DRAFT — 2 items to be confirmed');
    expect(draftHeaderText(11)).toBe('DRAFT — 11 items to be confirmed');
  });
});

describe('web and server count the same N from the same saved content', () => {
  const plain = `IN THE COURT OF ${TBC('Court')}\n\nBAIL APPLICATION No. _____ of 2026\n\nRam ... Applicant\nVERSUS\nState\n\n1. That FIR ${TBC('FIR')} & ____ was lodged.\n\nPRAYER\n\nGrant ${SECTION}.\n\nVERIFICATION\n\nVerified at {{MISSING: Place}} on this ___ day of ______, 2026.\n\n______________`;
  const html = [
    `<p>IN THE COURT OF ${TBC('Court')}</p>`,
    '<p>BAIL APPLICATION No. _____ of 2026</p>',
    '<p>Ram ... Applicant<br>VERSUS<br>State</p>',
    `<p>1. That FIR <strong>${TBC('FIR')}</strong> &amp; ____ was lodged.</p>`,
    `<p>PRAYER</p><p>Grant ${SECTION}.</p>`,
    '<p>VERIFICATION</p>',
    '<p>Verified at {{MISSING: Place}} on this ___ day of ______, 2026.</p>',
    '<p>______________</p>',
  ].join('');

  it('server (blanksInContent) equals the web count (findBlanks(blankText(content))) for plain text and HTML', () => {
    const webPlain = findBlanks(blankText(plain)).length;
    const webHtml = findBlanks(blankText(html)).length;
    expect(blanksInContent(plain)).toHaveLength(webPlain);
    expect(blanksInContent(html)).toHaveLength(webHtml);
    expect(webPlain).toBe(5);
    expect(webHtml).toBe(webPlain);
  });

  it('the same labels come out of plain text and HTML', () => {
    expect(blanksInContent(html).map((b) => b.label)).toEqual(
      blanksInContent(plain).map((b) => b.label),
    );
  });

  it('HTML entities and tags do not change the count', () => {
    expect(blanksInContent('<p>a&nbsp;[To be confirmed: A&amp;B]</p>')).toHaveLength(1);
    expect(blanksInContent('<p>[To be <strong>confirmed</strong>: x]</p>')).toHaveLength(1);
  });

  it('markBlanks marks as many runs as blanks (no tag-crossing blank in this content)', () => {
    const { blanks, marked } = markBlanks(html);
    expect(blanks).toHaveLength(5);
    expect(marked.split('\uE000').length - 1).toBe(5);
  });
});
