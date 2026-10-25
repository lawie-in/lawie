/**
 * T-136: Ajay's signed text is in the code, character for character.
 *
 * The signed file is read at test time (`handoff/design/T-136-drafter-rules-signed.md`);
 * no legal wording is retyped here. The only strings typed in this file are the
 * three fragments the packs had before and must no longer have.
 *
 * `apps/web` has no test runner in CI. The checks on the two web strings are
 * file-text checks, done here, and are the only automated guard on them.
 *
 * No database, no model call.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { checkBriefIsUsed, checkOneDocument, checkPeriods } from '../services/brief-drafter';
import {
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { buildBrief, buildChecklist } from '../services/intake-brief';
import type { GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  codeBlocks,
  part1,
  part2,
  quoted,
  lastRow,
  signedBriefLine,
  signedC5,
  signedD2,
  signedFinding,
} from './t136-signed';

const REPO = join(__dirname, '..', '..', '..', '..');
const PACKS = join(__dirname, '..', 'config', 'document-rules');
const readPack = (id: string): Record<string, any> =>
  JSON.parse(readFileSync(join(PACKS, `${id}.json`), 'utf8'));

describe('the signed file can be read', () => {
  it('has the two parts, two code blocks in part 2 and the rows we read', () => {
    expect(part1().length).toBeGreaterThan(1000);
    expect(part2().length).toBeGreaterThan(1000);
    expect(codeBlocks(part2())).toHaveLength(2);
    for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4']) {
      expect(quoted(lastRow(part1(), id)).length).toBeGreaterThan(0);
    }
  });
});

describe('criterion 1: the two Drafter prompts are part 2, A and A2, character for character', () => {
  const [signedA, signedA2] = codeBlocks(part2());

  // T-148 (AJ-2026-10-07-T148, part b): Ajay replaced Drafter rule 7 and the last
  // sentence of repair rule 5. Everything else stays the T-136 signed text.
  const OLD_RULE_7 =
    '7. AUTHORITIES. Cite a judgment only if INSTRUCTIONS names it, and copy its citation exactly as INSTRUCTIONS gives it. Where another authority would normally be cited, write [Authority — add if relied upon]. Never cite a judgment from your own knowledge.';
  const NEW_RULE_7 =
    '7. AUTHORITIES. Cite a judgment only if the advocate named it, in their own words under "described" or in another part of the BRIEF, and copy its name and citation exactly as given there. INSTRUCTIONS, CLAUSES, ACTS and COURT RULE are never a source of a judgment, even where they name one. Where an authority would normally be cited and the advocate gave none, write [Authority — add if relied upon]. Never cite a judgment from your own knowledge, and never add to, complete or correct a citation the advocate gave.';
  const OLD_R5_LAST =
    'Cite a judgment only if INSTRUCTIONS names it, with its citation exactly as INSTRUCTIONS gives it; otherwise write [Authority — add if relied upon].';
  const NEW_R5_LAST =
    'Cite a judgment only if the advocate named it, in their own words under "described" or in another part of the BRIEF, with its name and citation exactly as given there; INSTRUCTIONS, CLAUSES, ACTS and COURT RULE are never a source of a judgment. Otherwise write [Authority — add if relied upon].';
  // T-422 (Ajay's signed T-397 change B): "that an offence is complete," added to
  // PACK rule 8 and REPAIR rule 6.
  const OLD_B = 'bailable or non-bailable, that a claim is within limitation,';
  const NEW_B =
    'bailable or non-bailable, that an offence is complete, that a claim is within limitation,';
  // T-440 (Ajay, a9bc957 and 4b46053 item 1): his signed line closes the DATES rule
  // of PACK (rule 3) and the second rule of REPAIR. Typed from the signed file, which
  // holds it on the T-404 sign-off (handoff/legal/T-404-cause-title-fields-signed.md).
  const NOT_KNOWN_LINE =
    'A date marked as not known is unknown: copy its blank exactly as given, never state or infer the date, and do not say whether any period, deadline or limitation that depends on it is met or missed.';
  // T-471 (Ajay, 722c548a, 16 Oct 2026): his signed sentence closes PACK rule 4 and REPAIR
  // rule 3. Typed from the signed commit, with U+2026.
  const T471_RULE_4_LINE =
    'Never write that a fact is missing, not given or not stated in the brief, the facts or the instructions; print only its blank in the form [To be confirmed: \u2026].';
  const PACK_R4_END = 'Never fill a blank with a guess.\n5. CLAUSES.';
  const REPAIR_R3_END = 'appear to give it.\n4. A clause that needs an assurance about the future';
  const PACK_R3_END = 'never say that such a period has or has not run unless the BRIEF says so.';
  const REPAIR_R2_END =
    'where they differ from another part of the BRIEF on any point, the other part wins, and only its version is stated.';
  const replaceOnce = (text: string, from: string, to: string): string => {
    expect(text.split(from)).toHaveLength(2); // present exactly once in the signed text
    return text.replace(from, () => to);
  };

  it('DRAFTER_PACK_SYSTEM_PROMPT is A of part 2 with Ajay’s T-148 rule 7, T-397 change B and the T-440 line', () => {
    expect(DRAFTER_PACK_SYSTEM_PROMPT).toBe(
      replaceOnce(
        replaceOnce(
          replaceOnce(
            replaceOnce(signedA, OLD_RULE_7, NEW_RULE_7),
            PACK_R3_END,
            `${PACK_R3_END} ${NOT_KNOWN_LINE}`,
          ),
          OLD_B,
          NEW_B,
        ),
        PACK_R4_END,
        `Never fill a blank with a guess. ${T471_RULE_4_LINE}\n5. CLAUSES.`,
      ),
    );
  });

  it('DRAFTER_REPAIR_SYSTEM_PROMPT is A2 of part 2 with Ajay’s T-148 repair rule 5, T-397 change B and the T-440 line', () => {
    expect(DRAFTER_REPAIR_SYSTEM_PROMPT).toBe(
      replaceOnce(
        replaceOnce(
          replaceOnce(
            replaceOnce(signedA2, OLD_R5_LAST, NEW_R5_LAST),
            REPAIR_R2_END,
            `${REPAIR_R2_END} ${NOT_KNOWN_LINE}`,
          ),
          OLD_B,
          NEW_B,
        ),
        REPAIR_R3_END,
        `appear to give it. ${T471_RULE_4_LINE}\n4. A clause that needs an assurance about the future`,
      ),
    );
  });

  it('are not the prompts of part 1 (released together, the later text)', () => {
    const [oldA, oldA2] = codeBlocks(part1());
    expect(DRAFTER_PACK_SYSTEM_PROMPT).not.toBe(oldA);
    expect(DRAFTER_REPAIR_SYSTEM_PROMPT).not.toBe(oldA2);
  });
});

describe('criterion 5: bail_regular carries B1 to B5 and the clause earlier_applications as signed', () => {
  const bail = readPack('bail_regular');
  const instructions: string[] = bail.promptInstructions;
  const [b1] = quoted(lastRow(part1(), 'B1'));
  const [b2] = quoted(lastRow(part1(), 'B2'));
  const [b3] = quoted(lastRow(part1(), 'B3'));
  const [b4] = quoted(lastRow(part1(), 'B4'));

  it('has B1, B2, B3, B4 in its instructions', () => {
    for (const text of [b1, b2, b3, b4]) {
      expect(text.length).toBeGreaterThan(50);
      expect(instructions).toContain(text);
    }
  });

  it('has B4 directly after B3', () => {
    expect(instructions.indexOf(b4)).toBe(instructions.indexOf(b3) + 1);
  });

  it('has B1 and B2 where the old custody and grounds lines were', () => {
    expect(instructions.indexOf(b2)).toBe(instructions.indexOf(b1) + 1);
  });

  it('no longer has the old lines', () => {
    const all = instructions.join('\n');
    expect(all).not.toContain('total days in custody');
    expect(all).not.toContain('will not contact prosecution witnesses');
    expect(all).not.toContain('roots in community');
  });

  it('keeps no_flight_risk, required, with the B5 name and description', () => {
    const row = quoted(lastRow(part1(), 'B5'));
    const clause = bail.mandatoryClauses.find((c: any) => c.id === 'no_flight_risk');
    expect(clause).toBeDefined();
    expect(clause.required).toBe(true);
    expect(clause.name).toBe(row[0]);
    expect(clause.description).toBe(row[1]);
  });

  it('has earlier_applications, required, directly after no_flight_risk, as Ajay worded it', () => {
    const para = part1()
      .split('\n')
      .find((l) => l.startsWith('Recommended, not a condition'));
    expect(para).toBeDefined();
    const [name, description] = quoted(para as string);
    const ids: string[] = bail.mandatoryClauses.map((c: any) => c.id);
    const at = ids.indexOf('earlier_applications');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBe(ids.indexOf('no_flight_risk') + 1);
    const clause = bail.mandatoryClauses[at];
    expect(clause.required).toBe(true);
    expect(clause.name).toBe(name);
    expect(clause.description).toBe(description);
  });

  it('is also what the loader returns', () => {
    const loaded = loadRulePack('bail_regular');
    expect(loaded?.draftingInstructions).toContain(b4);
    expect(loaded?.mandatoryClauses.map((c) => c.id)).toContain('earlier_applications');
  });
});

describe('criterion 5: legal_notice_s138 carries instructions 7, 8 and 9 of "Outside the packet", item 2', () => {
  const notice = readPack('legal_notice_s138');
  const instructions: string[] = notice.promptInstructions;
  const row = part1()
    .split('\n')
    .find((l) => l.startsWith('| 2 | Risk | `legal_notice_s138.json`')) as string;
  // The three signed texts are the quoted strings that start with "(7)", "(8)", "(9)" before the quote.
  const signed = [7, 8, 9].map((n) => {
    const at = row.indexOf(`(${n}) "`);
    expect(at).toBeGreaterThan(-1);
    return quoted(row.slice(at))[0];
  });

  it('has them at places 6, 7 and 8 of the list', () => {
    expect(instructions[6]).toBe(signed[0]);
    expect(instructions[7]).toBe(signed[1]);
    expect(instructions[8]).toBe(signed[2]);
  });

  it('no longer asks for a demand within 15 days or to reference the statutory timeline', () => {
    const all = instructions.join('\n');
    expect(all).not.toMatch(/within 15 days/i);
    expect(all).not.toContain('Reference the statutory timeline');
  });
});

describe('criterion 6: the findings are Ajay’s wording', () => {
  const user = (key: string, value: string | string[]): GivenValue => ({
    key,
    value,
    source: 'user',
  });
  const bail = loadRulePack('bail_regular');
  if (!bail) throw new Error('no bail pack');
  const briefOf = (values: GivenValue[]) =>
    buildBrief({
      kind: { id: bail.id, name: bail.name, court_document: true },
      checklist: buildChecklist(bail),
      values,
      court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
    });

  it('C1', () => {
    const brief = briefOf([user('custody_since', '2026-09-13')]);
    const [w] = checkBriefIsUsed('nothing here', brief);
    const item = brief.items.find((i) => i.key === 'custody_since');
    expect(w.message).toBe(
      signedFinding('C1', {
        date: '13 September 2026',
        'what it is the date of': item?.meaning ?? item?.label ?? '',
      }),
    );
  });

  it('C2', () => {
    const brief = briefOf([user('applicant_name', 'Ramesh Mahto')]);
    const item = brief.items.find((i) => i.key === 'applicant_name');
    const [w] = checkBriefIsUsed('nothing here', brief);
    expect(w.message).toBe(
      signedFinding('C2', { label: item?.label ?? '', value: 'Ramesh Mahto' }),
    );
  });

  it('C3', () => {
    const brief = briefOf([]);
    const [w] = checkPeriods('He was in custody for three days.', [], brief);
    expect(w.message).toBe(signedFinding('C3', { period: 'three days' }));
  });

  it('C4', () => {
    const w = checkOneDocument(
      'LEGAL NOTICE\n\n1. That the cheque was dishonoured.',
      {
        before: 'LEGAL NOTICE\n\nTo,\nX',
        after: 'DEMAND\n\nPay.',
        headings: ['LEGAL NOTICE', 'DEMAND'],
      },
      'Legal Notice',
    );
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe(signedFinding('C4', { line: 'LEGAL NOTICE' }));
  });

  it('D2 (part 2)', () => {
    const brief = briefOf([]);
    const [w] = checkBriefIsUsed('nothing here', brief, 'Arrested on 22nd Sept 2026.');
    expect(w.message).toBe(signedD2().replace('{date}', '22nd Sept 2026'));
  });

  it('C3 is the plain wording (the alternative is not used, condition 3)', () => {
    expect(signedFinding('C3', { period: 'P' })).not.toContain('fixed by law');
  });
});

describe('criteria 4 and 6: the web strings (read as text; apps/web has no test runner in CI)', () => {
  const web = (f: string): string =>
    readFileSync(join(REPO, 'apps', 'web', 'src', 'components', 'intake', f), 'utf8');

  it('DraftReadyStep.tsx carries the signed C5 text and no longer shows "No problems found." as text', () => {
    const src = web('DraftReadyStep.tsx');
    expect(src).toContain(signedC5());
    // The old sentence may be named in a comment, never as a string or as JSX text.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toContain('No problems found');
  });

  it('BriefStep.tsx carries the signed line of part 2, condition 2', () => {
    expect(web('BriefStep.tsx')).toContain(signedBriefLine());
  });

  it('the signed lines were found and are not empty', () => {
    expect(signedC5().length).toBeGreaterThan(100);
    expect(signedBriefLine().length).toBeGreaterThan(100);
  });
});
