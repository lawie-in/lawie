/**
 * T-245a part 1: the old/new criminal law switch for the bail packs.
 *
 * Expected strings are literals copied from handoff/legal/T-245-old-new-law-switch-signed.md
 * (Ajay 345bd24, Addendum 1 2992891, Addendum 2 d5a3005, Addendum 3 8e3167e), never built from
 * the code under test.
 */
import './setupEnv';
import './setupDb';

import { buildBrief, buildChecklist } from '../services/intake-brief';
import {
  bailCourtFromCourtType,
  fillLawSwitchTokens,
  firForcesBnss,
  lawSwitch,
  offenceLawFor,
  parseLawDate,
  readProcedureChoice,
} from '../services/law-switch';
import { preflightCheck } from '../services/preflight.service';
import { readFileSync } from 'fs';
import { join } from 'path';

import { loadRulePack } from '../services/rule-pack.service';

const rawPack = (id: string): { promptInstructions: string[]; form_schema?: unknown } =>
  JSON.parse(readFileSync(join(__dirname, '..', 'config', 'document-rules', `${id}.json`), 'utf8'));

const B = 'Bharatiya Nagarik Suraksha Sanhita, 2023';
const C = 'Code of Criminal Procedure, 1973';
const BNSS_CHOICE = 'BNSS and BSA';
const CRPC_CHOICE = 'CrPC and Evidence Act';

type Row = {
  pack: string;
  court?: 'magistrate' | 'sessions_or_hc';
  bailable?: boolean;
  bnss: string;
  crpc: string;
  none: string;
};

// Addendum 1 ruling 2 and 4 (pairs), Addendum 2 ruling 4 (436 -> 478).
const ROWS: Row[] = [
  {
    pack: 'bail_regular',
    court: 'magistrate',
    bnss: `Section 480 of the ${B}`,
    crpc: `Section 437 of the ${C}`,
    none: '[To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS]',
  },
  {
    pack: 'bail_regular',
    court: 'sessions_or_hc',
    bnss: `Section 483 of the ${B}`,
    crpc: `Section 439 of the ${C}`,
    none: '[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]',
  },
  {
    pack: 'bail_before_magistrate',
    bailable: false,
    bnss: `Section 480 of the ${B}`,
    crpc: `Section 437 of the ${C}`,
    none: '[To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS]',
  },
  {
    pack: 'bail_before_magistrate',
    bailable: true,
    bnss: `Section 478 of the ${B}`,
    crpc: `Section 436 of the ${C}`,
    none: '[To be confirmed: Section 436 of the CrPC or Section 478 of the BNSS]',
  },
  {
    pack: 'bail_anticipatory',
    bnss: `Section 482 of the ${B}`,
    crpc: `Section 438 of the ${C}`,
    none: '[To be confirmed: Section 438 of the CrPC or Section 482 of the BNSS]',
  },
  {
    pack: 'interim_bail',
    court: 'magistrate',
    bnss: `Section 480 of the ${B}`,
    crpc: `Section 437 of the ${C}`,
    none: '[To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS]',
  },
  {
    pack: 'interim_bail',
    court: 'sessions_or_hc',
    bnss: `Section 483 of the ${B}`,
    crpc: `Section 439 of the ${C}`,
    none: '[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]',
  },
  {
    pack: 'bail_cancellation',
    court: 'magistrate',
    bnss: `Section 480 of the ${B}`,
    crpc: `Section 437(5) of the ${C}`,
    none: '[To be confirmed: Section 437(5) of the CrPC or Section 480 of the BNSS]',
  },
  {
    pack: 'bail_cancellation',
    court: 'sessions_or_hc',
    bnss: `Section 483(3) of the ${B}`,
    crpc: `Section 439(2) of the ${C}`,
    none: '[To be confirmed: Section 439(2) of the CrPC or Section 483(3) of the BNSS]',
  },
  {
    pack: 'default_bail',
    bnss: `Section 187(3) of the ${B}`,
    crpc: `Section 167(2) of the ${C}`,
    none: '[To be confirmed: Section 167(2) of the CrPC or Section 187(3) of the BNSS]',
  },
];

const input = (r: Row, procedureCode?: string) => ({
  templateId: r.pack,
  procedureCode,
  court: r.court,
  offenceBailable: r.bailable,
});

describe('lawSwitch: every pack x procedure (Addendum 1 rendering, byte-exact)', () => {
  it.each(ROWS)('$pack court=$court bailable=$bailable', (r) => {
    // FIR in 2023 so the advocate's choice stands.
    const bnss = lawSwitch({ ...input(r, BNSS_CHOICE), firDate: '2023-05-01' });
    expect(bnss.procedureCode).toBe('BNSS');
    expect(bnss.governingProvision).toBe(r.bnss);
    expect(bnss.governingProvisionUpper).toBe(r.bnss.toUpperCase());
    expect(bnss.lines).toEqual(['PROCEDURE CODE: BNSS and BSA', `GOVERNING PROVISION: ${r.bnss}`]);

    const crpc = lawSwitch({ ...input(r, CRPC_CHOICE), firDate: '2023-05-01' });
    expect(crpc.procedureCode).toBe('CrPC');
    expect(crpc.forcedByFirDate).toBe(false);
    expect(crpc.governingProvision).toBe(r.crpc);
    expect(crpc.lines).toEqual([
      'PROCEDURE CODE: CrPC and Evidence Act',
      `GOVERNING PROVISION: ${r.crpc}`,
    ]);

    const none = lawSwitch({ ...input(r), firDate: '2023-05-01' });
    expect(none.procedureCode).toBeNull();
    expect(none.governingProvision).toBe(r.none);
    expect(none.lines).toEqual([]); // both lines omitted with no procedure code
  });
});

describe('lawSwitch: court unknown (Addendum 1 ruling 4, Addendum 2 ruling 2)', () => {
  it.each(['bail_regular', 'interim_bail'])('%s', (pack) => {
    expect(lawSwitch({ templateId: pack, procedureCode: BNSS_CHOICE }).governingProvision).toBe(
      '[To be confirmed: Section 480 or Section 483 of the BNSS]',
    );
    expect(lawSwitch({ templateId: pack, procedureCode: CRPC_CHOICE }).governingProvision).toBe(
      '[To be confirmed: Section 437 or Section 439 of the CrPC]',
    );
    expect(lawSwitch({ templateId: pack }).governingProvision).toBe(
      '[To be confirmed: Section 437 or 439 of the CrPC, or Section 480 or 483 of the BNSS]',
    );
  });

  it('bail_cancellation: three blanks, no 480(5)', () => {
    const t = 'bail_cancellation';
    const b = lawSwitch({ templateId: t, procedureCode: BNSS_CHOICE }).governingProvision;
    const c = lawSwitch({ templateId: t, procedureCode: CRPC_CHOICE }).governingProvision;
    const n = lawSwitch({ templateId: t }).governingProvision;
    expect(b).toBe('[To be confirmed: Section 480 or Section 483(3) of the BNSS]');
    expect(c).toBe('[To be confirmed: Section 437(5) or Section 439(2) of the CrPC]');
    expect(n).toBe(
      '[To be confirmed: Section 437(5) or 439(2) of the CrPC, or Section 480 or 483(3) of the BNSS]',
    );
    for (const s of [b, c, n]) expect(s).not.toContain('480(5)');
  });

  it('upper-casing is of the whole provision', () => {
    expect(
      lawSwitch({ templateId: 'bail_regular', court: 'magistrate', procedureCode: BNSS_CHOICE })
        .governingProvisionUpper,
    ).toBe('SECTION 480 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023');
  });
});

describe('lawSwitch: bail_before_magistrate bailable true / false / null (Addendum 3 ruling 5)', () => {
  const mk = (bailable: boolean | null | undefined, p?: string) =>
    lawSwitch({ templateId: 'bail_before_magistrate', procedureCode: p, offenceBailable: bailable })
      .governingProvision;
  it('true is 436 / 478, false is 437 / 480', () => {
    expect(mk(true, BNSS_CHOICE)).toBe(`Section 478 of the ${B}`);
    expect(mk(true, CRPC_CHOICE)).toBe(`Section 436 of the ${C}`);
    expect(mk(false, BNSS_CHOICE)).toBe(`Section 480 of the ${B}`);
    expect(mk(false, CRPC_CHOICE)).toBe(`Section 437 of the ${C}`);
  });
  it.each([null, undefined])('%s gives the blank, never 437/480 by default', (v) => {
    expect(mk(v, BNSS_CHOICE)).toBe('[To be confirmed: Section 478 or Section 480 of the BNSS]');
    expect(mk(v, CRPC_CHOICE)).toBe('[To be confirmed: Section 436 or Section 437 of the CrPC]');
    expect(mk(v)).toBe(
      '[To be confirmed: Section 436 or 437 of the CrPC, or Section 478 or 480 of the BNSS]',
    );
  });
});

describe('lawSwitch: women proviso, notice provision, do-not-cite', () => {
  it('women proviso: three forms, bail_before_magistrate only (Addendum 1 ruling 2)', () => {
    const w = (p?: string) =>
      lawSwitch({ templateId: 'bail_before_magistrate', procedureCode: p, offenceBailable: false })
        .womenProviso;
    expect(w(BNSS_CHOICE)).toBe('the first proviso to Section 480(1) of the BNSS');
    expect(w(CRPC_CHOICE)).toBe('the first proviso to Section 437(1) of the CrPC');
    expect(w()).toBe(
      'the first proviso to [To be confirmed: Section 437(1) of the CrPC or Section 480(1) of the BNSS]',
    );
    for (const pack of [
      'bail_regular',
      'bail_anticipatory',
      'interim_bail',
      'bail_cancellation',
      'default_bail',
    ]) {
      expect(lawSwitch({ templateId: pack, procedureCode: BNSS_CHOICE }).womenProviso).toBeNull();
    }
  });

  it.each(ROWS.map((r) => r.pack))(
    'noticeProvision is the same in every pack (%s) (Addendum 2 ruling 1)',
    (pack) => {
      expect(lawSwitch({ templateId: pack, procedureCode: BNSS_CHOICE }).noticeProvision).toBe(
        'Section 35(3) of the BNSS',
      );
      expect(lawSwitch({ templateId: pack, procedureCode: CRPC_CHOICE }).noticeProvision).toBe(
        'Section 41A of the CrPC',
      );
      expect(lawSwitch({ templateId: pack }).noticeProvision).toBe(
        '[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]',
      );
    },
  );

  it('doNotCite: bail_regular only (Addendum 3 ruling 4)', () => {
    const d = (p?: string) => lawSwitch({ templateId: 'bail_regular', procedureCode: p }).doNotCite;
    expect(d(BNSS_CHOICE)).toBe('Do not cite Section 481 or Section 482');
    expect(d(CRPC_CHOICE)).toBe('Do not cite Section 437A or Section 438 of the CrPC');
    expect(d()).toBe(
      'Do not cite Section 437A or 438 of the CrPC, or Section 481 or 482 of the BNSS',
    );
    expect(
      lawSwitch({ templateId: 'bail_anticipatory', procedureCode: BNSS_CHOICE }).doNotCite,
    ).toBeNull();
  });

  it('a pack outside T-245a throws', () => {
    expect(() => lawSwitch({ templateId: 'nda' })).toThrow();
  });
});

describe('FIR date force (the rule: on or after 1 July 2024 is BNSS)', () => {
  it('2024-06-30 does not force; the choice stands', () => {
    const r = lawSwitch({
      templateId: 'default_bail',
      firDate: '2024-06-30',
      procedureCode: CRPC_CHOICE,
    });
    expect(r.forcedByFirDate).toBe(false);
    expect(r.procedureCode).toBe('CrPC');
    expect(r.governingProvision).toBe(`Section 167(2) of the ${C}`);
  });
  it('2024-07-01 forces BNSS over a CrPC choice and over no choice', () => {
    for (const p of [CRPC_CHOICE, undefined, 'garbage']) {
      const r = lawSwitch({ templateId: 'default_bail', firDate: '2024-07-01', procedureCode: p });
      expect(r.forcedByFirDate).toBe(true);
      expect(r.procedureCode).toBe('BNSS');
      expect(r.governingProvision).toBe(`Section 187(3) of the ${B}`);
      expect(r.lines).toEqual([
        'PROCEDURE CODE: BNSS and BSA',
        `GOVERNING PROVISION: Section 187(3) of the ${B}`,
      ]);
    }
  });
  it('no or unreadable FIR date never forces', () => {
    expect(firForcesBnss(undefined)).toBe(false);
    expect(firForcesBnss('')).toBe(false);
    expect(firForcesBnss('not a date')).toBe(false);
    expect(firForcesBnss('2024-06-30')).toBe(false);
    expect(firForcesBnss('2024-07-01')).toBe(true);
    expect(firForcesBnss('01/07/2024')).toBe(true);
  });
  it('offence law: before 1 July 2024 IPC, on or after BNS, no date is unknown', () => {
    expect(offenceLawFor('2024-06-30')).toBe('IPC');
    expect(offenceLawFor('2024-07-01')).toBe('BNS');
    expect(offenceLawFor('2025-03-01')).toBe('BNS');
    expect(offenceLawFor('2023-12-31')).toBe('IPC');
    expect(offenceLawFor(undefined)).toBeNull();
    expect(offenceLawFor('')).toBeNull();
  });
});

describe('parseLawDate', () => {
  it.each([
    ['2024-07-01', '2024-07-01'],
    ['2024-07-01T10:30:00Z', '2024-07-01'],
    ['2024-07-01T10:30:00.000+05:30', '2024-07-01'],
    ['2024-07-01 10:30:00', '2024-07-01'],
    ['01/07/2024', '2024-07-01'],
    ['1.7.2024', '2024-07-01'],
    ['30.06.2024', '2024-06-30'],
    ['30-06-2024', '2024-06-30'],
    [' 29/02/2024 ', '2024-02-29'],
  ])('reads %s', (v, want) => {
    expect(parseLawDate(v)).toBe(want);
  });
  it('reads a valid Date object', () => {
    expect(parseLawDate(new Date('2024-07-01T00:00:00Z'))).toBe('2024-07-01');
  });
  it.each([
    '01/07/24',
    '1.7.24',
    '31/06/2024',
    '29/02/2023',
    '2024-13-01',
    '2024-02-30',
    '00/01/2024',
    '1 July 2024',
    'July 2024',
    '',
    'abc',
  ])('rejects %p', (v) => {
    expect(parseLawDate(v)).toBeNull();
  });
  it.each([null, undefined, 20240701, {}, [], new Date('x')])('rejects non-date %p', (v) => {
    expect(parseLawDate(v)).toBeNull();
  });
});

describe('parseLawDate: an instant is read as its calendar date in India (Asia/Kolkata, +5:30)', () => {
  it.each([
    ['2024-06-30T18:30:00Z', '2024-07-01'],
    ['2024-06-30T18:29:59Z', '2024-06-30'],
    ['2024-06-30T20:00:00-0400', '2024-07-01'],
    ['2024-06-30T20:00:00-04:00', '2024-07-01'],
    ['2024-07-01T00:00:00+05:30', '2024-07-01'],
    ['2024-06-30T23:59:59+05:30', '2024-06-30'],
    // a time with no zone, and a date alone, are read as written
    ['2024-06-30T23:00', '2024-06-30'],
    ['2024-06-30 23:00:00', '2024-06-30'],
    ['2024-06-30', '2024-06-30'],
    ['30/06/2024', '2024-06-30'],
  ])('reads %s as %s', (v, want) => {
    expect(parseLawDate(v)).toBe(want);
  });
  it('a Date object is read in India', () => {
    expect(parseLawDate(new Date('2024-06-30T18:30:00Z'))).toBe('2024-07-01');
    expect(parseLawDate(new Date('2024-06-30T18:29:59Z'))).toBe('2024-06-30');
  });
  it('firForcesBnss at the boundary follows the Indian date', () => {
    expect(firForcesBnss('2024-06-30T18:30:00Z')).toBe(true);
    expect(firForcesBnss('2024-06-30T18:29:59Z')).toBe(false);
    expect(firForcesBnss(new Date('2024-06-30T18:30:00Z'))).toBe(true);
    expect(firForcesBnss(new Date('2024-06-30T18:29:59Z'))).toBe(false);
    expect(firForcesBnss('2024-06-30T20:00:00-0400')).toBe(true);
    expect(firForcesBnss('2024-06-30T23:00')).toBe(false);
  });
  it('an invalid zoned time is not read', () => {
    expect(parseLawDate('2024-06-30T25:99:00Z')).toBeNull();
  });
});

describe('fillLawSwitchTokens fills only the two law-switch tokens', () => {
  it('fills {governing_provision} and {do_not_cite} when a value is set', () => {
    expect(
      fillLawSwitchTokens('Cite {governing_provision}. Never cite {do_not_cite}.', {
        governing_provision: 'Section 439 of the CrPC',
        do_not_cite: 'Section 483 of the BNSS',
      }),
    ).toBe('Cite Section 439 of the CrPC. Never cite Section 483 of the BNSS.');
  });
  it('fills every occurrence', () => {
    expect(
      fillLawSwitchTokens('{governing_provision}/{governing_provision}', {
        governing_provision: 'X',
      }),
    ).toBe('X/X');
  });
  it('leaves {value} and {other} literal', () => {
    expect(
      fillLawSwitchTokens('{value} and {other} under {governing_provision}', {
        governing_provision: 'Y',
        do_not_cite: 'Z',
      }),
    ).toBe('{value} and {other} under Y');
  });
  it('leaves a token with no value as it was', () => {
    expect(fillLawSwitchTokens('{governing_provision} {do_not_cite}', { do_not_cite: 'Z' })).toBe(
      '{governing_provision} Z',
    );
    expect(fillLawSwitchTokens('{governing_provision} {do_not_cite}', {})).toBe(
      '{governing_provision} {do_not_cite}',
    );
  });
});

// Addendum 6 (b016997): strings literal from handoff/legal/T-245-old-new-law-switch-signed.md on
// origin/develop_staging, each checked present in backticks there, never read from the JSON.
describe('Addendum 6: signed wording in the packs', () => {
  const rules = (id: string) =>
    JSON.parse(
      readFileSync(join(__dirname, '..', 'config', 'document-rules', `${id}.json`), 'utf8'),
    );
  const CANCEL =
    'Draft an Application for Cancellation of Bail under the provision given as GOVERNING PROVISION in the case details.';
  const DISPLAY = 'Bail Application before Magistrate (Section 480 BNSS / Section 437 CrPC)';
  const RULE =
    'recommend Section 483 BNSS (Section 439 CrPC) before the Court of Session or High Court';

  it('bail_cancellation prompt_context opens with the signed sentence, not "read with"', () => {
    const pc: string = rules('bail_cancellation').prompt_context;
    expect(pc.startsWith(CANCEL)).toBe(true);
    expect(pc).not.toContain('read with');
  });
  it('bail_before_magistrate displayName is the signed pairing', () => {
    expect(rules('bail_before_magistrate').displayName).toBe(DISPLAY);
  });
  it('bail_before_magistrate _meta description follows the same pairing', () => {
    const d: string = rules('bail_before_magistrate')._meta.description;
    expect(d).toContain('Section 480 BNSS (Section 437 CrPC)');
    expect(d).toContain('Section 483 BNSS (Section 439 CrPC)');
  });
  it('bail_before_magistrate validation rule ends with the signed recommendation', () => {
    expect(JSON.stringify(rules('bail_before_magistrate'))).toContain(RULE + '"');
  });
});

describe('court mapping and procedure choice', () => {
  it.each([
    ['jmfc', 'magistrate'],
    ['cjm', 'magistrate'],
    ['sessions', 'sessions_or_hc'],
    ['high_court', 'sessions_or_hc'],
    ['high_court_bench', 'sessions_or_hc'],
    ['district_court', null],
    ['Sessions Court, Patna', null],
    ['', null],
    [undefined, null],
  ])('%p -> %p', (v, want) => {
    expect(bailCourtFromCourtType(v)).toBe(want);
  });

  it.each([
    ['BNSS and BSA', 'BNSS'],
    ['CrPC and Evidence Act', 'CrPC'],
    ['bnss_and_bsa', 'BNSS'],
    ['crpc_and_evidence_act', 'CrPC'],
    ['  bnss and bsa ', 'BNSS'],
    ['BNSS', null],
    ['IPC', null],
    ['', null],
    [undefined, null],
    [3, null],
  ])('readProcedureChoice(%p) -> %p', (v, want) => {
    expect(readProcedureChoice(v)).toBe(want);
  });
});

describe('the packs carry the signed S-text and P-text at [1] and [2], and no "never IPC" line', () => {
  const S_TEXT =
    'Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].';
  const P_TEXT =
    'Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].';
  const ENTRY0: Record<string, string> = {
    bail_regular:
      'Draft a Regular Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.',
    bail_anticipatory:
      'Draft an Anticipatory Bail Application under the provision given as GOVERNING PROVISION in the case details.',
    interim_bail:
      'Draft an Interim Bail Application in the pending bail proceedings, under the provision given as GOVERNING PROVISION in the case details.',
  };
  const PACKS = [
    'bail_regular',
    'bail_before_magistrate',
    'bail_anticipatory',
    'interim_bail',
    'bail_cancellation',
    'default_bail',
  ];

  it.each(PACKS)('%s', (id) => {
    const ins = rawPack(id).promptInstructions;
    expect(ins[1]).toBe(S_TEXT);
    expect(ins[2]).toBe(P_TEXT);
    expect(ins.filter((x) => x === S_TEXT)).toHaveLength(1);
    expect(ins.filter((x) => x === P_TEXT)).toHaveLength(1);
    if (ENTRY0[id]) expect(ins[0]).toBe(ENTRY0[id]);
    expect(ins.join('\n')).not.toMatch(/never IPC|NEVER use old IPC|NEVER include any IPC/i);
  });

  it.each(PACKS)(
    '%s form has offence_date, fir_date optional, procedure_code optional with the two options',
    (id) => {
      const raw = JSON.stringify(rawPack(id));
      expect(raw).toContain('offence_date');
      expect(raw).toContain('procedure_code');
      expect(raw).toContain('BNSS and BSA');
      expect(raw).toContain('CrPC and Evidence Act');
    },
  );
});

describe('preflight old_law_section follows the offence date only (Addendum 1 ruling 7)', () => {
  const BASE = {
    court_name: 'patna_hc',
    applicant_name: 'Ramesh Kumar',
    father_name: 'Suresh Kumar',
    respondent_name: 'State of Bihar',
    applicant_age: 35,
    fir_number: '091/2024',
    facts_narrative:
      'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
    sections_charged: '302 IPC',
  };
  const hits = async (extra: Record<string, unknown>) => {
    const r = await preflightCheck('bail_anticipatory', { ...BASE, ...extra });
    return r._meta?.rule_hits ?? [];
  };

  it('offence 2025: fires', async () => {
    expect(await hits({ offence_date: '2025-03-01', fir_date: '2025-03-02' })).toContain(
      'old_law_section',
    );
  });
  it('offence on 2024-07-01: fires', async () => {
    expect(await hits({ offence_date: '2024-07-01' })).toContain('old_law_section');
  });
  it('offence 2024-06-30: does not fire, even with an FIR in 2026', async () => {
    expect(await hits({ offence_date: '2024-06-30', fir_date: '2026-01-01' })).not.toContain(
      'old_law_section',
    );
  });
  it('no offence date: no finding, even with an FIR in 2026 (the FIR date is no stand-in)', async () => {
    expect(await hits({ fir_date: '2026-01-01' })).not.toContain('old_law_section');
    expect(await hits({})).not.toContain('old_law_section');
  });
  it('an unreadable offence date: no finding', async () => {
    expect(await hits({ offence_date: 'sometime in 2025' })).not.toContain('old_law_section');
  });
});

describe('intake brief: IPC note on the offence date, no FIR fallback', () => {
  const NOTE =
    'If the offence was committed on or after 1 July 2024, the Bharatiya Nyaya Sanhita, 2023 (BNS) applies, not the Indian Penal Code (IPC). Check the sections before you file.';
  const pack = loadRulePack('bail_regular')!;
  const kind = { id: 'bail_regular', name: 'Regular Bail Application', court_document: true };
  const noteFor = (dates: Array<[string, string]>) => {
    const b = buildBrief({
      kind,
      checklist: buildChecklist(pack),
      values: [
        {
          key: 'sections_charged',
          value: ['379 IPC'],
          source: 'description',
          quote: 'u/s 379 IPC',
        },
        ...dates.map(([key, value]) => ({
          key,
          value,
          source: 'description' as const,
          quote: 'x',
        })),
      ],
    });
    return b.items.find((i) => i.key === 'sections_charged')?.note;
  };
  it('offence date 2026 gives the note', () => {
    expect(noteFor([['offence_date', '2026-03-15']])).toBe(NOTE);
  });
  it('offence date 2024-06-30 gives none', () => {
    expect(noteFor([['offence_date', '2024-06-30']])).toBeUndefined();
  });
  it('FIR date 2026 and no offence date gives none', () => {
    expect(noteFor([['fir_date', '2026-03-15']])).toBeUndefined();
  });
  it('offence date 2024-06-30 with FIR date 2026 gives none', () => {
    expect(
      noteFor([
        ['offence_date', '2024-06-30'],
        ['fir_date', '2026-03-15'],
      ]),
    ).toBeUndefined();
  });
});
