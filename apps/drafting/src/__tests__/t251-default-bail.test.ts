/**
 * T-251: default_bail tells the Drafter to cite case law and count days.
 * Ajay's signed text: handoff/legal/T-251-default-bail-text-signed.md (with the
 * Addendum, c2340d5), T-245 S-text and P-text, and his interim rule for
 * {governing_provision}.
 *
 * The signed strings below are typed here from the signed documents, not read
 * from the pack, so a drift in the pack fails the test.
 *
 * No database, no real model call.
 */
import './setupEnv';

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { findBlanks } from '@lawie/shared';
import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import { loadAvermentLists, resolveAverments } from '../services/averments';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { AUTHORITY_BLANK, CITATION_REMOVED_MESSAGE } from '../services/citation-check';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  GOVERNING_PROVISION_BLANK,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

// T-373: these tests drive the legacy (text-stream) path. The signed skeletons are on by default, so the
// loader is pinned to null here; every lookup is counted so the last test can show the mock was reached.
const mockSkeletonLookups: string[] = [];
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: (packId: string) => {
    mockSkeletonLookups.push(packId);
    return null;
  },
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

beforeEach(() => {
  mockMessagesStream.mockReset();
});

jest.mock('../services/app-settings.service', () => ({
  ...jest.requireActual('../services/app-settings.service'),
  getAppSetting: jest.fn(async () => 'claude-sonnet-4-5-20250929'),
}));
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

// ── The signed text, word for word ──────────────────────────────────────────

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const RAW_TEXT = readFileSync(join(RULES_DIR, 'default_bail.json'), 'utf8');
const RAW = JSON.parse(RAW_TEXT) as Record<string, unknown>;

const PROMPT_CONTEXT =
  'Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details. The application rests on dates the BRIEF gives: the date of arrest, the date of first remand, the period the advocate says applies (60 days, 90 days, or the period under a special Act) and whether a police report has been filed. Lawie does not work out which period applies and does not count days.';

const S_TEXT =
  'Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].';

const P_TEXT =
  'Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].';

const INSTRUCTIONS: string[] = [
  'Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought.',
  S_TEXT,
  P_TEXT,
  'State the date of arrest and the date of first remand to custody as the BRIEF gives them, and that the applicant remains in custody only if the BRIEF says so. Use a blank for any of them the BRIEF does not give.',
  'State the period the BRIEF says applies (60 days, 90 days, or a period under a special Act) and the date on which the BRIEF says it expired. Do not work out which period applies, and do not count or tabulate days. Where the BRIEF gives a blank for the period, write that blank exactly as the BRIEF gives it; where it does not, write [To be confirmed: the default-bail period that applies to this offence]. Where the BRIEF gives a blank for the date of expiry, write that blank exactly as the BRIEF gives it; where it does not, write [To be confirmed: the date on which the period expired].',
  'State whether a police report has been filed only as the BRIEF gives it, as on the date of this application. Where the BRIEF does not say, write [To be confirmed: whether a police report had been filed when this application was made]. Do not say that the investigation is incomplete unless the BRIEF says so.',
  'Where the BRIEF says an offence is under a special Act (for example the NDPS Act, the UAPA or the PMLA), do not apply the BNSS or CrPC periods to it; write [To be confirmed: the default-bail period and any extension under <that Act>].',
  'Submit, as "It is submitted that ...", that the period having expired without a police report, as stated above, the applicant is entitled to be released on bail. Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].',
  "Give the applicant's undertaking for the future to furnish bail bonds and sureties as this Hon'ble Court directs. Never as a fact and never as the advocate's undertaking.",
  'State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].',
  'Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system.',
];

const MANDATORY_CLAUSES = [
  {
    id: 'statutory_provision',
    name: 'Provision Invoked',
    required: true,
    description:
      'The provision under which default bail is sought, as GOVERNING PROVISION gives it.',
  },
  {
    id: 'custody_dates',
    name: 'Arrest and First Remand',
    required: true,
    description:
      'The date of arrest and the date of first remand, as the brief gives them, or the blank.',
  },
  {
    id: 'applicable_window',
    name: 'Period and Expiry',
    required: true,
    description:
      'The default-bail period the brief says applies and the date it expired, as the brief gives them, or the blank. Never worked out by Lawie.',
  },
  {
    id: 'non_filing',
    name: 'Police Report',
    required: true,
    description:
      'Whether a police report had been filed when the application was made, as the brief gives it, or the blank.',
  },
  {
    id: 'indefeasible_right',
    name: 'Entitlement to Release',
    required: true,
    description:
      'Submission that, the period having expired without a police report, the applicant is entitled to be released on bail. Naming no judgment.',
  },
  {
    id: 'willingness',
    name: 'Undertaking to Furnish Bond',
    required: true,
    description:
      "The applicant's undertaking for the future to furnish bail bonds and sureties as directed. Never a statement of fact.",
  },
  {
    id: 'earlier_applications',
    name: 'Earlier Bail Applications',
    required: true,
    description:
      'Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say.',
  },
  {
    id: 'prayer',
    name: 'Prayer',
    required: true,
    description: 'Prayer for release on default bail',
  },
  { id: 'verification', name: 'Verification', required: true, description: 'Verification on oath' },
];

const VALIDATION_RULES = [
  'remand_date, if given, must not be before arrest_date',
  'application_date, if given, must not be before remand_date',
  'period_claimed must be given; if empty, the draft carries the blank',
];

const JUDGMENTS = [
  'Uday Mohanlal Acharya',
  'Sanjay Dutt',
  'Bikramjit Singh',
  'Rakesh Kumar Paul',
  'M. Ravindran',
  'Ravindran',
];

// Addendum 1 (2992891), no choice: `[To be confirmed: Section {crpc} of the CrPC or Section {bnss} of the BNSS]`,
// approved for default_bail by Addendum 2 #7 (d5a3005). Replaces T-251's interim wording
// "Section 167(2) CrPC or Section 187(3) BNSS".
const GP_BLANK = '[To be confirmed: Section 167(2) of the CrPC or Section 187(3) of the BNSS]';
// Addendum 1, BNSS / CrPC choice, byte-exact.
const GP_BNSS = 'Section 187(3) of the Bharatiya Nagarik Suraksha Sanhita, 2023';
const GP_CRPC = 'Section 167(2) of the Code of Criminal Procedure, 1973';

describe('AC1: Ajay’s text is applied word for word', () => {
  const pack = loadRulePack('default_bail')!;

  it('the pack loads', () => {
    expect(pack).not.toBeNull();
    expect(pack.id).toBe('default_bail');
  });

  it('prompt_context', () => {
    expect(RAW.prompt_context).toBe(PROMPT_CONTEXT);
  });

  it('promptInstructions: eleven entries, each exact', () => {
    const got = RAW.promptInstructions as string[];
    expect(got).toHaveLength(11);
    INSTRUCTIONS.forEach((want, i) => expect({ i, text: got[i] }).toEqual({ i, text: want }));
  });

  it('instruction 2 is the T-245 S-text and 3 the P-text, word for word', () => {
    const got = RAW.promptInstructions as string[];
    expect(got[1]).toBe(S_TEXT);
    expect(got[2]).toBe(P_TEXT);
  });

  it('the rule-pack loader hands the same instructions to the Drafter', () => {
    expect(pack.draftingInstructions).toEqual([PROMPT_CONTEXT, ...INSTRUCTIONS]);
  });

  it('mandatoryClauses deep-equal the signed list, in order', () => {
    expect(RAW.mandatoryClauses).toEqual(MANDATORY_CLAUSES);
    expect(pack.mandatoryClauses.map((c) => c.id)).toEqual(MANDATORY_CLAUSES.map((c) => c.id));
    expect(pack.mandatoryClauses.every((c) => c.required)).toBe(true);
  });

  it('validation_rules', () => {
    expect(RAW.validation_rules).toEqual(VALIDATION_RULES);
  });

  it('title, displayName and _meta', () => {
    expect(RAW.title).toBe('Default Bail Application');
    expect(RAW.displayName).toBe('Default Bail Application');
    expect(RAW._meta).toEqual({
      description:
        'Document-rules config for default_bail: statutory bail when a police report has not been filed within the period the advocate states',
      owner: 'Ajay (CLO)',
      validated_by: 'Ajay (CLO), T-251, 12 Oct 2026',
      last_updated: '2026-10-12',
      change_protocol: 'All edits require CLO sign-off.',
      note: 'A practising advocate checks this pack before it goes live, in particular the default-bail periods (60 and 90 days), which the pack leaves to the advocate to state.',
    });
  });

  it('relevantActs 187(3) carries the Gazette heading and no period; no CrPC 167 entry', () => {
    const acts = RAW.relevantActs as Array<{
      sections: Array<{ number: string; description: string }>;
    }>;
    const secs = acts.flatMap((a) => a.sections);
    expect(secs.find((x) => x.number === '187(3)')!.description).toBe(
      'Procedure when investigation cannot be completed in twenty-four hours',
    );
    expect(secs.find((x) => /167/.test(x.number))).toBeUndefined();
    expect(JSON.stringify(RAW.relevantActs)).not.toMatch(/60 \/ 90|within 60|90 days/);
  });

  it('caseNomenclature and prayerTemplate use {governing_provision}; the old opening words are deleted', () => {
    const ct = RAW.causeTitle as { caseNomenclature: string };
    expect(ct.caseNomenclature).toBe(
      'DEFAULT BAIL APPLICATION No. _____ of [YEAR]\n(Under {governing_provision})',
    );
    expect(pack.causeTitle?.caseNomenclature).toBe(ct.caseNomenclature);
    const prayer = RAW.prayerTemplate as string;
    expect(prayer).toContain(
      'Release the applicant {applicant} on default bail under {governing_provision} in connection with FIR No.',
    );
    expect(prayer).not.toMatch(/statutory period/i);
    expect(prayer).not.toMatch(/has expired/i);
    expect(prayer).not.toMatch(/187\(3\)/);
    expect(prayer).not.toMatch(/and as the/i);
    expect(RAW_TEXT).not.toMatch(/Section 187\(3\) (of )?BNSS, 2023/);
  });

  it('form keys: removed, added, changed', () => {
    const fields = RAW.form_schema as Array<Record<string, unknown>>;
    const by = (n: string) => fields.find((f) => f.name === n);
    expect(by('offence_punishment_max_years')).toBeUndefined();
    expect(by('elapsed_days')).toBeUndefined();
    expect(by('period_claimed')).toMatchObject({
      label: 'Default-bail period that applies',
      type: 'select',
      options: ['60 days', '90 days', 'Period under a special Act'],
      required: true,
    });
    expect(by('period_expiry_date')).toMatchObject({
      label: 'Date the period expired',
      type: 'date',
      required: false,
    });
    expect(by('special_act_period')).toMatchObject({
      label: 'Special Act and its period (if any)',
      type: 'text',
      required: false,
    });
    expect(String(by('special_act_period')!.show_if)).toContain('period_claimed');
    expect(by('willingness_to_furnish_bond')).toMatchObject({
      label: 'The applicant will furnish bail bonds and sureties as directed',
      type: 'checkbox',
    });
    expect(by('earlier_bail_applications')).toMatchObject({
      label: 'Earlier bail applications (court, date, result)',
      type: 'textarea',
      required: false,
    });
  });

  it('the snake-case mandatory_clauses list is deleted', () => {
    expect(RAW).not.toHaveProperty('mandatory_clauses');
    expect(RAW_TEXT).not.toMatch(/computation of days/i);
  });
});

describe('AC2 (file): no judgment, no day count, no period rule in the pack', () => {
  it.each(JUDGMENTS)('%s is named nowhere in the pack', (name) => {
    expect(RAW_TEXT).not.toContain(name);
  });

  it('no reporter citation anywhere in the pack', () => {
    expect(RAW_TEXT).not.toMatch(/\d+\s+SCC\s+\d+|AIR\s+\d{4}\s+SC|\bSCC\b/);
  });

  it('no Tabulate / day-count instruction remains', () => {
    expect(RAW_TEXT).not.toMatch(/compute (?:the )?days|computation of days/i);
    const instructions = (RAW.promptInstructions as string[]).join('\n');
    // The only mentions of counting say Lawie does NOT count.
    expect(instructions).toMatch(/do not count or tabulate days/);
    for (const m of instructions.matchAll(/[^.]*\b(?:count|tabulate)\b[^.]*\./gi)) {
      expect(m[0]).toMatch(/\b(?:not|never)\b/i);
    }
  });

  it('no "<=10 years" / "> 10 years" period rule remains', () => {
    expect(RAW_TEXT).not.toMatch(/≤\s*10|<=\s*10|>\s*10\s*years|more than 10 years|life \/ death/i);
    expect(RAW_TEXT).not.toMatch(/90 days\s*\(|must be 90|force 90/i);
    expect(RAW_TEXT).not.toContain('offence_punishment_max_years');
    expect(RAW_TEXT).not.toContain('elapsed_days');
  });

  it('title, displayName and the loaded name carry no code section number', () => {
    const pack = loadRulePack('default_bail')!;
    for (const s of [RAW.title as string, RAW.displayName as string, pack.name]) {
      expect(s).not.toMatch(/\d/);
      expect(s).not.toMatch(/\b(?:section|sec\.?|s\.)\s*\d/i);
    }
  });
});

describe('the averments file (Addendum section 1)', () => {
  const FILE = join(RULES_DIR, '_averments', 'default_bail.json');

  it('sha256 is the signed value', () => {
    const hash = createHash('sha256').update(readFileSync(FILE)).digest('hex');
    // Re-pinned for T-334 (Ajay, T-334 Addendum 1, signed 9b484ee).
    expect(hash).toBe('2e882516bf7c5ad8f35edace6fbc53b5c264112fc9f4005a06b5878e78bdc96d');
  });

  it('stays unsigned in the file (signed_by is null on purpose)', () => {
    const f = JSON.parse(readFileSync(FILE, 'utf8')) as { signed_by: unknown; signed_on: unknown };
    expect(f.signed_by).toBeNull();
    expect(f.signed_on).toBeNull();
  });

  const lists = loadAvermentLists('default_bail');
  const fact = (key: string, display: string) => ({
    id: `f_${key}`,
    key,
    label: key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
  });
  const resolve = (facts: Array<ReturnType<typeof fact>>) =>
    resolveAverments(lists, facts as never);
  const bannedIds = (r: ReturnType<typeof resolve>) => r.banned.map((b) => b.id);
  const allowedIds = (r: ReturnType<typeof resolve>) => r.allowed.map((a) => a.id);

  const FULL = [
    fact('remand_date', '3 July 2026'),
    fact('period_claimed', '60 days'),
    fact('period_expiry_date', '1 September 2026'),
    fact('charge_sheet_status', 'Not filed'),
  ];

  it('statutory_period_expired: allowed with remand_date + period_claimed 60 days + period_expiry_date + charge_sheet_status', () => {
    const r = resolve(FULL);
    expect(bannedIds(r)).not.toContain('statutory_period_expired');
    const a = r.allowed.find((x) => x.id === 'statutory_period_expired')!;
    expect(a.text).toBe(
      'it is submitted that the default-bail period of 60 days from the first remand on 3 July 2026 expired on 1 September 2026, and that the applicant is therefore entitled to be released on bail',
    );
  });

  it('statutory_period_expired: allowed with 90 days too', () => {
    const r = resolve(
      FULL.map((f) => (f.key === 'period_claimed' ? fact('period_claimed', '90 days') : f)),
    );
    expect(allowedIds(r)).toContain('statutory_period_expired');
  });

  it.each(['remand_date', 'period_claimed', 'period_expiry_date', 'charge_sheet_status'])(
    'statutory_period_expired: banned when %s is missing',
    (missing) => {
      const r = resolve(FULL.filter((f) => f.key !== missing));
      expect(bannedIds(r)).toContain('statutory_period_expired');
      expect(allowedIds(r)).not.toContain('statutory_period_expired');
    },
  );

  it('statutory_period_expired: banned for "Period under a special Act"', () => {
    const r = resolve(
      FULL.map((f) =>
        f.key === 'period_claimed' ? fact('period_claimed', 'Period under a special Act') : f,
      ),
    );
    expect(bannedIds(r)).toContain('statutory_period_expired');
    expect(allowedIds(r)).not.toContain('statutory_period_expired');
    expect(bannedIds(r)).toContain('applicable_window');
  });

  it('statutory_period_expired: banned with no facts at all', () => {
    const r = resolve([]);
    expect(bannedIds(r)).toContain('statutory_period_expired');
  });

  it.each(['60 days', '90 days'])('applicable_window: unlocked by period_claimed %s alone', (p) => {
    const r = resolve([fact('period_claimed', p)]);
    expect(bannedIds(r)).not.toContain('applicable_window');
    expect(r.allowed.find((a) => a.id === 'applicable_window')!.text).toBe(
      `it is submitted that the default-bail period applicable to the offence charged is ${p}`,
    );
  });

  it.each(['Period under a special Act', '', '   ', '45 days', 'ten years'])(
    'applicable_window: stays banned for period_claimed %j',
    (p) => {
      const r = resolve([fact('period_claimed', p), fact('remand_date', '3 July 2026')]);
      expect(bannedIds(r)).toContain('applicable_window');
      expect(allowedIds(r)).not.toContain('applicable_window');
    },
  );

  it('applicable_window: nothing but period_claimed unlocks it', () => {
    const r = resolve([
      fact('remand_date', '3 July 2026'),
      fact('period_expiry_date', '1 September 2026'),
      fact('charge_sheet_status', 'Not filed'),
      fact('offences_alleged', 'Section 318(4) BNS, punishable up to 10 years'),
    ]);
    expect(bannedIds(r)).toContain('applicable_window');
  });

  it('days_elapsed and punishment_category: always banned, never offered, whatever the ledger holds', () => {
    const everything = [
      ...FULL,
      fact('elapsed_days', '65'),
      fact('days_elapsed', '65'),
      fact('offence_punishment_max_years', '10'),
      fact('punishment_category', 'up to 10 years'),
      fact('willingness_to_furnish_bond', 'Yes'),
      fact('earlier_bail_applications', 'none'),
      fact('arrest_date', '2 July 2026'),
    ];
    const r = resolve(everything);
    expect(bannedIds(r)).toEqual(expect.arrayContaining(['days_elapsed', 'punishment_category']));
    expect(allowedIds(r)).not.toContain('days_elapsed');
    expect(allowedIds(r)).not.toContain('punishment_category');
    for (const id of ['days_elapsed', 'punishment_category']) {
      expect(lists.banned.find((b) => b.id === id)!.unlocked_by).toBeNull();
      expect(lists.allowed.find((a) => a.id === id)).toBeUndefined();
    }
  });

  it('days_elapsed bans the day-count phrases', () => {
    const phrases = lists.banned.find((b) => b.id === 'days_elapsed')!.phrases;
    expect(phrases).toEqual(
      expect.arrayContaining(['has been in custody for', 'days have elapsed']),
    );
  });

  it('willing_to_furnish_bond: unlocked by a ticked box, as an undertaking for the future', () => {
    const r = resolve([fact('willingness_to_furnish_bond', 'Yes')]);
    expect(bannedIds(r)).not.toContain('willing_to_furnish_bond');
    expect(r.allowed.find((a) => a.id === 'willing_to_furnish_bond')!.text).toBe(
      "the applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs",
    );
  });

  it.each(['No', '', 'maybe'])(
    'willing_to_furnish_bond: stays banned for %j (unticked or unclear)',
    (v) => {
      const r = resolve([fact('willingness_to_furnish_bond', v)]);
      expect(bannedIds(r)).toContain('willing_to_furnish_bond');
      expect(allowedIds(r)).not.toContain('willing_to_furnish_bond');
    },
  );

  it.each(['none', 'nil', 'No', 'koi nahi', 'First application', 'no earlier application'])(
    'first_bail_application: unlocked by the answer %j',
    (v) => {
      const r = resolve([fact('earlier_bail_applications', v)]);
      expect(bannedIds(r)).not.toContain('first_bail_application');
      expect(allowedIds(r)).toContain('first_bail_application');
    },
  );

  it.each([
    'Regular bail rejected by Sessions Court, Patna, on 4 August 2026',
    'Application pending before the High Court',
    'one earlier application, none decided',
    'not known',
  ])('first_bail_application: stays banned for %j', (v) => {
    const r = resolve([fact('earlier_bail_applications', v)]);
    expect(bannedIds(r)).toContain('first_bail_application');
    expect(allowedIds(r)).not.toContain('first_bail_application');
  });

  it('first_bail_application: banned when the key is absent', () => {
    expect(bannedIds(resolve([]))).toContain('first_bail_application');
  });

  it('default_bail_citation bans every judgment name and the short names, with no unlock', () => {
    const e = lists.banned.find((b) => b.id === 'default_bail_citation')!;
    expect(e.unlocked_by).toBeNull();
    for (const n of JUDGMENTS.filter((j) => j !== 'Ravindran')) expect(e.phrases).toContain(n);
    // No ledger can lift it.
    expect(bannedIds(resolve(FULL))).toContain('default_bail_citation');
  });

  it('chargesheet_not_filed text carries the date it is true on', () => {
    const r = resolve([fact('charge_sheet_status', 'Not filed')]);
    expect(r.allowed.find((a) => a.id === 'chargesheet_not_filed')!.text).toBe(
      'as on the date of this application, the police report (charge sheet) has not been filed',
    );
  });
});

// ── AC2 wiring: the draft, with a stubbed model ─────────────────────────────

const BLANK_PERIOD = '[To be confirmed: the default-bail period that applies to this offence]';
const BLANK_SPECIAL_ACT =
  '[To be confirmed: the default-bail period and any extension under <that Act>]';

type Given = Record<string, string | string[]>;

const BASE_GIVEN: Given = {
  applicant_name: 'Deepak Ravidas',
  applicant_parentage: 'Shri Hari Ravidas',
  applicant_age: '28',
  applicant_address: 'Village Kotwali, Patna',
  fir_number: '143/2026',
  fir_date: '2026-06-02',
  police_station: 'Kotwali',
  offences_alleged: 'Section 318(4) BNS',
  arrest_date: '2026-06-03',
  remand_date: '2026-06-04',
  charge_sheet_status: 'Not filed',
  application_date: '2026-08-10',
  advocate_name: 'Test Advocate',
  advocate_enrollment: 'D/123/2015',
};

const BODY =
  '1. That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.\n\n2. That the applicant was arrested on 03.06.2026 and first remanded to custody on 04.06.2026. [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]';

async function draftWith(body: string, given: Given, described: string | null = null) {
  const pack = loadRulePack('default_bail')!;
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: Object.entries(given).map(([k, v]) => u(k, v)),
    court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
  });
  if (!brief.can_confirm) throw new Error('brief cannot be confirmed');
  // T-241: earlier_applications now has a cue, so the report must point at the paragraph that carries it (BODY paragraph 2).
  const clauses = pack.mandatoryClauses
    .map((c) => `${c.id}: ${c.id === 'earlier_applications' ? 2 : 1}`)
    .join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`${body}\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig('default_bail')!,
      brief,
      described,
      language: 'en',
      targetParagraphs: 12,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    res as unknown as Response,
  );
  const first = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  const user = first.messages[0].content;
  const briefJson = user.slice(
    user.indexOf('BRIEF:\n') + 'BRIEF:\n'.length,
    user.indexOf('\n\nCLAUSES'),
  );
  const sections = result.sections as Array<{ section_id: string; content: string }>;
  return {
    result,
    brief,
    system: first.system,
    user,
    briefJson,
    briefObj: JSON.parse(briefJson) as {
      unknown: Array<{ what: string; blank: string }>;
      [k: string]: unknown;
    },
    sections,
    sectionText: (id: string) => sections.find((s) => s.section_id === id)?.content ?? '',
    fullText: sections.map((s) => s.content).join('\n'),
    messages: result.warnings.map((w: { message: string }) => w.message),
  };
}

describe('AC2 (wiring): the draft built from the brief, model stubbed', () => {
  const FULL_GIVEN: Given = {
    ...BASE_GIVEN,
    period_claimed: '60 days',
    period_expiry_date: '2026-08-02',
    willingness_to_furnish_bond: 'Yes',
  };

  it('FIR on or after 1 Jul 2024 forces BNSS: the prayer carries Section 187(3) of the BNSS, no blank, no raw placeholder', async () => {
    // Addendum 1 #8: an FIR date on or after 1 July 2024 forces BNSS. The fixture FIR is 2 Jun 2026.
    const out = await draftWith(BODY, FULL_GIVEN);
    const prayer = out.sectionText('prayer');
    expect(prayer).toContain(
      `Release the applicant Deepak Ravidas on default bail under ${GP_BNSS} in connection with FIR No.`,
    );
    expect(prayer).not.toContain(GP_BLANK);
    expect(prayer).not.toContain('{governing_provision}');
    expect(prayer).not.toMatch(/statutory period/i);
    expect(out.fullText).not.toContain('{governing_provision}');
    expect(out.fullText).not.toContain('To be confirmed: Section 167(2)');
    expect(out.user).not.toContain('{governing_provision}');
  });

  it('FIR before 1 Jul 2024 and no choice: the prayer carries the both-forms blank exactly, and no raw placeholder', async () => {
    const out = await draftWith(BODY, { ...FULL_GIVEN, fir_date: '2023-06-02' });
    const prayer = out.sectionText('prayer');
    expect(prayer).toContain(
      `Release the applicant Deepak Ravidas on default bail under ${GP_BLANK} in connection with FIR No.`,
    );
    expect(prayer).not.toContain('{governing_provision}');
    expect(out.fullText).not.toContain('{governing_provision}');
    expect(out.user).not.toContain('{governing_provision}');
  });

  it('FIR before 1 Jul 2024 and a CrPC choice: CrPC 167(2) in the cause title and the prayer, no BNSS', async () => {
    const out = await draftWith(BODY, {
      ...FULL_GIVEN,
      fir_date: '2023-06-02',
      procedure_code: 'CrPC and Evidence Act',
    });
    expect(out.sectionText('prayer')).toContain(
      `on default bail under ${GP_CRPC} in connection with FIR No.`,
    );
    expect(out.fullText).toContain(`(Under ${GP_CRPC})`);
    expect(out.fullText).not.toContain('Bharatiya Nagarik Suraksha Sanhita');
    expect(out.fullText).not.toContain('To be confirmed: Section 167(2)');
  });

  // Addendum 4 #1 (b99a51e): default_bail RELATED ACTS follow the procedure.
  const actsBlock = (user: string): string => {
    const i = user.indexOf('ACTS:');
    return user.slice(i, user.indexOf('\n\n', i));
  };
  const OLD = { ...FULL_GIVEN, fir_date: '2023-06-02' };

  it('Addendum 4 #1: a CrPC choice lists the CrPC 167(2) entry only, with the BNSS entry dropped', async () => {
    const out = await draftWith(BODY, { ...OLD, procedure_code: 'CrPC and Evidence Act' });
    const acts = actsBlock(out.user);
    expect(acts).toContain('Code of Criminal Procedure, 1973');
    expect(acts).toContain('167(2)');
    expect(acts).toContain('Procedure when investigation cannot be completed in twenty-four hours');
    expect(acts).not.toContain('187(3)');
    expect(acts).not.toContain('Bharatiya Nagarik Suraksha Sanhita');
  });

  it('Addendum 4 #1: a BNSS choice lists the BNSS entry only, as today', async () => {
    const out = await draftWith(BODY, { ...OLD, procedure_code: 'BNSS and BSA' });
    const acts = actsBlock(out.user);
    expect(acts).toContain('187(3)');
    expect(acts).not.toContain('Code of Criminal Procedure, 1973');
    expect(acts).not.toContain('167(2)');
  });

  it('Addendum 4 #1: an FIR on or after 1 Jul 2024 forces BNSS even with a CrPC choice', async () => {
    const out = await draftWith(BODY, { ...FULL_GIVEN, procedure_code: 'CrPC and Evidence Act' });
    const acts = actsBlock(out.user);
    expect(acts).toContain('187(3)');
    expect(acts).not.toContain('167(2)');
  });

  it('Addendum 4 #1: no choice lists both entries', async () => {
    const out = await draftWith(BODY, OLD);
    const acts = actsBlock(out.user);
    expect(acts).toContain('187(3)');
    expect(acts).toContain('167(2)');
    expect(acts).toContain('Code of Criminal Procedure, 1973');
  });

  it('the case-details lines come first in INSTRUCTIONS (CrPC choice), byte-exact', async () => {
    const out = await draftWith(BODY, { ...OLD, procedure_code: 'CrPC and Evidence Act' });
    const i = out.user.indexOf('INSTRUCTIONS:\n');
    expect(out.user.slice(i).split('\n').slice(1, 3)).toEqual([
      '- PROCEDURE CODE: CrPC and Evidence Act',
      `- GOVERNING PROVISION: ${GP_CRPC}`,
    ]);
  });

  it('no choice: no case-details lines (the P-text blank applies)', async () => {
    const out = await draftWith(BODY, OLD);
    expect(out.user).not.toContain('PROCEDURE CODE:');
    expect(out.user).not.toContain('- GOVERNING PROVISION:');
  });

  it('T-194: findBlanks counts no governing_provision blank when BNSS is forced', async () => {
    const out = await draftWith(BODY, FULL_GIVEN);
    expect(findBlanks(out.fullText).filter((b) => b.text === GP_BLANK)).toEqual([]);
  });

  it('T-194: findBlanks counts the governing_provision blank in the rendered prayer (no choice, old FIR)', async () => {
    const out = await draftWith(BODY, { ...FULL_GIVEN, fir_date: '2023-06-02' });
    const blanks = findBlanks(out.sectionText('prayer'));
    expect(blanks.map((b) => b.text)).toEqual([GP_BLANK]);
    // And in the whole document: T-245a (Ajay, Addendum 1 ruling 1, 2992891) adds
    // "(Under {governing_provision})" to the cause title, so the blank is counted twice,
    // once in the cause title and once in the prayer.
    const all = findBlanks(out.fullText).filter((b) => b.text === GP_BLANK);
    expect(all).toHaveLength(2);
    expect(all[0].context).toMatch(/^\(Under \[To be confirmed: /);
    expect(all[1].context).toContain('default bail under [To be confirmed: ');
  });

  it('a Drafter body that names the judgments gets them removed, blanked, and one message added', async () => {
    const out = await draftWith(
      `${BODY}\n\n3. That in Uday Mohanlal Acharya v. State of Maharashtra (2001) 5 SCC 453 and Sanjay Dutt v. State through CBI (1994) 5 SCC 410 the right to default bail was held indefeasible.\n\n4. That Bikramjit Singh v. State of Punjab (2020) 10 SCC 616 and Rakesh Kumar Paul v. State of Assam (2017) 15 SCC 67 apply.`,
      FULL_GIVEN,
      'Default bail for Deepak Ravidas, FIR 143/2026, PS Kotwali.',
    );
    for (const n of JUDGMENTS) expect(out.fullText).not.toContain(n);
    expect(out.fullText).not.toMatch(/\bSCC\b/);
    expect(out.fullText).toContain(AUTHORITY_BLANK);
    expect(out.messages.filter((m) => m === CITATION_REMOVED_MESSAGE)).toHaveLength(1);
  });

  // T-263: "M. Ravindran v. Intelligence Officer, Directorate of Revenue Intelligence (2021) 2 SCC 485"
  // used to be kept by name with only the reporter blanked. The initial was not the cause; the comma
  // in party 2 was (Ajay, AJ-2026-10-12-T263). Name and reporter are now both removed.
  it('"M. Ravindran v. Intelligence Officer, ..." with a reporter is removed by name too', async () => {
    const out = await draftWith(
      `${BODY}\n\n3. That M. Ravindran v. Intelligence Officer, Directorate of Revenue Intelligence (2021) 2 SCC 485 applies.`,
      FULL_GIVEN,
    );
    expect(out.fullText).not.toContain('M. Ravindran');
    expect(out.fullText).not.toContain('Intelligence Officer');
  });

  it('a judgment the advocate gave in the description is kept, as given', async () => {
    const given = 'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273';
    const out = await draftWith(
      `${BODY}\n\n3. That in ${given} the Court held so.`,
      FULL_GIVEN,
      `Default bail for Deepak Ravidas. Please rely on ${given}.`,
    );
    expect(out.fullText).toContain(given);
    expect(out.messages).not.toContain(CITATION_REMOVED_MESSAGE);
  });

  it('the Drafter is sent the signed instructions and no judgment name', async () => {
    const out = await draftWith(BODY, FULL_GIVEN);
    for (const i of INSTRUCTIONS) expect(out.user).toContain(i);
    for (const n of JUDGMENTS) {
      expect(out.user).not.toContain(n);
      expect(out.system).not.toContain(n);
    }
    expect(out.user.replace(INSTRUCTIONS[4], '')).not.toMatch(/tabulat/i);
  });

  it('period_claimed empty (a 10-year-maximum offence): the blank is in the instructions and the brief carries it as unknown, never "90 days"', async () => {
    const out = await draftWith(BODY, {
      ...BASE_GIVEN,
      offences_alleged: 'Section 318(4) BNS, punishable up to 10 years',
    });
    // The Drafter's instruction carries Ajay's blank.
    expect(out.user).toContain(BLANK_PERIOD);
    // The brief the Drafter reads holds no period value, and no 90 days.
    const item = out.brief.items.find((i) => i.key === 'period_claimed')!;
    expect(item.value).toBeNull();
    expect(out.briefJson).not.toMatch(/90 days/);
    expect(out.briefJson).not.toMatch(/60 days/);
    const unknown = out.briefObj.unknown.find((x) => x.what === 'Default-bail period that applies');
    expect(unknown).toBeDefined();
    expect(unknown!.blank).toMatch(/^\[To be confirmed: .+\]$/);
    // Nothing the system renders states a period.
    expect(out.fullText).not.toMatch(/90 days|60 days/);
  });

  it('period_claimed empty: the rule that forces a period from the sentence is gone from the pack text the Drafter sees', async () => {
    const out = await draftWith(BODY, BASE_GIVEN);
    // INSTRUCTIONS section only: cut the BRIEF out, then no period is fixed by law.
    const outsideBrief = out.user.replace(out.briefJson, '');
    expect(outsideBrief).not.toMatch(/must be 90|force.*90|10 years.*90 days|90 days.*10 years/i);
    expect(outsideBrief).not.toMatch(/≤\s*10/);
  });

  it('the system-rendered parts (prayer, verification, cause title) state no day count or period', async () => {
    const out = await draftWith(BODY, { ...BASE_GIVEN, period_claimed: '60 days' });
    expect(out.sectionText('prayer')).not.toMatch(/\d+ days/);
    expect(out.sectionText('verification')).not.toMatch(/\d+ days/);
    expect(out.sectionText('cause_title')).not.toMatch(/\d+ days/);
  });

  const DAYS_BODY = `${BODY}\n\n3. That the applicant has been in custody for 68 days.\n\n4. That the statutory period of 90 days has expired.`;

  // Accepted gap (same as the bond pin below): in non-ledger mode nothing checks the Drafter's body for a
  // day count the brief does not hold. Ajay's go-live gate: feature.fact_ledger ON before default_bail is offered.
  it.failing(
    'GAP (non-ledger mode): a Drafter body with "68 days" in custody and "90 days" is stopped or blanked',
    async () => {
      const out = await draftWith(DAYS_BODY, { ...BASE_GIVEN, period_claimed: '60 days' });
      expect(out.fullText).not.toMatch(/68 days/);
      expect(out.fullText).not.toMatch(/90 days/);
    },
  );

  it('ledger mode: a body with a day count is caught as days_elapsed (banned), the way the go-live gate relies on', async () => {
    const pack = loadRulePack('default_bail')!;
    const lists = loadAvermentLists('default_bail');
    const mk = (key: string, display: string) => ({
      id: `f_${key}`,
      key,
      label: key,
      type: 'text',
      value: display,
      display,
      raw_span: display,
      source: 'user',
      confidence: 0.99,
      required_in_draft: true,
    });
    const facts = Object.entries({ ...BASE_GIVEN, period_claimed: '60 days' }).map(([k, v]) =>
      mk(k, String(v)),
    );
    const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: Object.entries({ ...BASE_GIVEN, period_claimed: '60 days' }).map(([k, v]) =>
        u(k, String(v)),
      ),
      court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
    });
    const clauses = pack.mandatoryClauses
      .map((c) => `${c.id}: ${c.id === 'earlier_applications' ? 2 : 1}`)
      .join('\n');
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () =>
        sdkAnswer(`${DAYS_BODY}\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
      );
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
    const result = await streamGenerateFromBrief(
      {
        pack,
        templateConfig: loadTemplateConfig('default_bail')!,
        brief,
        language: 'en',
        targetParagraphs: 12,
        advocateName: 'Test Advocate',
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
        ledger: { facts: facts as never, lists },
      },
      res as unknown as Response,
    );
    const initial = result.factCheck!.initial as Array<{
      check?: string;
      bannedEntryId?: string | null;
    }>;
    const bannedIds = initial.filter((v) => v.check === 'banned').map((v) => v.bannedEntryId);
    expect(bannedIds).toContain('days_elapsed');
    expect(result.factCheck!.passed).toBe(false);
  });

  it('special-Act offence: the brief carries the special-Act choice and the Drafter gets instruction 7 with its blank', async () => {
    const out = await draftWith(BODY, {
      ...BASE_GIVEN,
      offences_alleged: 'Section 8 read with Section 21 of the NDPS Act, 1985',
      period_claimed: 'Period under a special Act',
      special_act_period: 'NDPS Act, 180 days',
    });
    expect(out.user).toContain(INSTRUCTIONS[6]);
    expect(out.user).toContain(BLANK_SPECIAL_ACT);
    const item = out.brief.items.find((i) => i.key === 'period_claimed')!;
    expect(item.value).toBe('Period under a special Act');
    expect(out.briefJson).toContain('Period under a special Act');
    expect(out.briefJson).not.toMatch(/"(?:60|90) days"/);
    // Never the BNSS period for it.
    expect(out.sectionText('prayer')).not.toMatch(/\d+ days/);
  });

  it('special-Act offence with period_claimed empty: still the blank, never a BNSS period', async () => {
    const out = await draftWith(BODY, {
      ...BASE_GIVEN,
      offences_alleged: 'Section 20 of the NDPS Act, 1985',
    });
    expect(out.user).toContain(BLANK_SPECIAL_ACT);
    expect(out.user).toContain(BLANK_PERIOD);
    expect(out.briefJson).not.toMatch(/"(?:60|90) days"/);
  });

  it('OPEN WITH AJAY: what the brief carries for an unticked bond box and an empty period (label-derived blanks)', async () => {
    const out = await draftWith(BODY, BASE_GIVEN);
    const blankOf = (what: string) => out.briefObj.unknown.find((x) => x.what === what)?.blank;
    // The brief's blanks come from the field label (intake-brief.ts placeholderFor), not Ajay's exact wording.
    // Pinned as a record of today's behaviour, not as the signed wording.
    expect(blankOf('The applicant will furnish bail bonds and sureties as directed')).toBe(
      '[To be confirmed: the applicant will furnish bail bonds and sureties as directed]',
    );
    expect(blankOf('Default-bail period that applies')).toBe(
      '[To be confirmed: default-bail period that applies]',
    );
    // Ajay's exact wording reaches the Drafter through the instructions.
    expect(out.user).toContain(BLANK_PERIOD);
  });

  it('a ticked bond box is a value "Yes" in the brief, an unticked one is a blank (never a fact "No")', async () => {
    const ticked = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: 'Yes' });
    expect(ticked.brief.items.find((i) => i.key === 'willingness_to_furnish_bond')!.value).toBe(
      'Yes',
    );
    const unticked = await draftWith(BODY, BASE_GIVEN);
    expect(
      unticked.brief.items.find((i) => i.key === 'willingness_to_furnish_bond')!.value,
    ).toBeNull();
  });
});

describe('scope (Ajay): "No" on any other yes/no item is still a fact', () => {
  const cases: Array<[string, string]> = [
    ['bail_before_magistrate', 'sureties_available'],
    ['criminal_revision', 'state_party'],
  ];
  it.each(cases)(
    '%s / %s: "No" is placed with its value, not moved to still_unknown',
    (packId, key) => {
      const pack = loadRulePack(packId)!;
      const checklist = buildChecklist(pack);
      const item = checklist.find((i) => i.key === key)!;
      expect(item.options).toEqual(['Yes', 'No']);
      const brief = buildBrief({
        kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
        checklist,
        values: [{ source: 'user', key, value: 'No' }],
        court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
      });
      expect(brief.items.find((i) => i.key === key)!.value).toBe('No');
      expect(brief.still_unknown.map((x) => x.key)).not.toContain(key);
    },
  );

  it('only willingness_to_furnish_bond is an undertaking: "false" on another yes/no item gets the item’s ordinary treatment, not the undertaking rule', () => {
    // A choice item holds only its options (Yes / No). "false" is not an option, so the brief drops it for
    // every item that is not an undertaking, exactly as it drops any other non-option such as "banana".
    // The undertaking rule (isDeclinedUndertaking) is not what drops it; "No" (an option) is kept (test above).
    const pack = loadRulePack('bail_before_magistrate')!;
    const valueFor = (value: string) =>
      buildBrief({
        kind: { id: pack.id, name: pack.name, court_document: true },
        checklist: buildChecklist(pack),
        values: [{ source: 'user', key: 'sureties_available', value }],
        court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
      }).items.find((i) => i.key === 'sureties_available')!.value;
    expect(valueFor('No')).toBe('No');
    expect(valueFor('false')).toBe(valueFor('banana'));
  });
});

describe('willingness_to_furnish_bond = "No" must act like an unticked box (Ajay, via the lead)', () => {
  const BOND_LABEL = 'The applicant will furnish bail bonds and sureties as directed';
  const WILL_NOT =
    /will not furnish|not (?:be )?(?:willing|ready|prepared) to furnish|unable to furnish|refuses? to furnish/i;

  it('averments: "No" does not unlock willing_to_furnish_bond; it stays banned and is not offered', () => {
    const lists = loadAvermentLists('default_bail');
    const f = {
      id: 'f',
      key: 'willingness_to_furnish_bond',
      label: BOND_LABEL,
      type: 'text',
      value: 'No',
      display: 'No',
      raw_span: 'No',
      source: 'user',
      confidence: 0.99,
      required_in_draft: true,
    };
    const r = resolveAverments(lists, [f] as never);
    expect(r.banned.map((b) => b.id)).toContain('willing_to_furnish_bond');
    expect(r.allowed.map((a) => a.id)).not.toContain('willing_to_furnish_bond');
  });

  it('what the brief carries: "Yes" is a value; unticked and "No" are the same blank in still_unknown', async () => {
    const yes = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: 'Yes' });
    const unticked = await draftWith(BODY, BASE_GIVEN);
    const blankFor = (o: typeof yes) =>
      o.briefObj.unknown.find((x) => x.what === BOND_LABEL)?.blank;
    const BLANK = `[To be confirmed: ${BOND_LABEL.toLowerCase()}]`;
    expect(blankFor(yes)).toBeUndefined();
    expect(blankFor(unticked)).toBe(BLANK);
    for (const v of ['No', 'no', ' NO ', 'false', 'False']) {
      const no = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: v });
      const item = no.brief.items.find((i) => i.key === 'willingness_to_furnish_bond')!;
      expect({ v, value: item.value }).toEqual({ v, value: null });
      expect(blankFor(no)).toBe(BLANK);
      expect(no.brief.still_unknown.map((x) => x.key)).toContain('willingness_to_furnish_bond');
      expect(
        no.brief.still_unknown.find((x) => x.key === 'willingness_to_furnish_bond')!.placeholder,
      ).toBe(BLANK);
      // "No" is not carried to the Drafter as a fact about the bond.
      expect(JSON.stringify((no.briefObj as { facts?: unknown }).facts)).not.toContain(BOND_LABEL);
    }
  });

  it('the Drafter instructions are the same for "No" and unticked (instruction 9 only)', async () => {
    const no = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: 'No' });
    const unticked = await draftWith(BODY, BASE_GIVEN);
    expect(no.user).toContain(INSTRUCTIONS[8]);
    expect(unticked.user).toContain(INSTRUCTIONS[8]);
    // Neither instruction tells the Drafter what to write for "No" or for an unticked box:
    // Ajay’s bond blank [To be confirmed: the applicant's undertaking to furnish bail bonds] is not in the prompt.
    expect(no.user).not.toContain(
      "[To be confirmed: the applicant's undertaking to furnish bail bonds]",
    );
  });

  it('with "No", the brief holds a bond blank, as for an unticked box (Ajay, scope-limited to undertakings)', async () => {
    const no = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: 'No' });
    const hit = no.briefObj.unknown.find((x) => x.what === BOND_LABEL);
    expect(hit).toBeDefined();
  });

  it('with "No", the brief does not carry "No" as a fact about the bond', async () => {
    const no = await draftWith(BODY, { ...BASE_GIVEN, willingness_to_furnish_bond: 'No' });
    expect(no.brief.items.find((i) => i.key === 'willingness_to_furnish_bond')!.value).not.toBe(
      'No',
    );
  });

  // Still a GAP in non-ledger mode: nothing checks the draft against the box. it.failing: breaks when closed.
  it.failing(
    'GAP: a Drafter body that says the applicant will not furnish bonds is stopped or blanked',
    async () => {
      const out = await draftWith(
        `${BODY}\n\n3. That the applicant will not furnish bail bonds and sureties.`,
        { ...BASE_GIVEN, willingness_to_furnish_bond: 'No' },
      );
      expect(out.fullText).not.toMatch(WILL_NOT);
    },
  );

  it('what the pipeline does with an undertaking sentence when the answer is "No" (recorded)', async () => {
    const out = await draftWith(
      `${BODY}\n\n3. That the applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs.`,
      { ...BASE_GIVEN, willingness_to_furnish_bond: 'No' },
    );
    // Recorded today: the sentence passes through untouched; nothing in the non-ledger path checks it against the box.
    expect(out.sectionText('body')).toContain('undertakes to furnish bail bonds');
  });
});

// ── The template engine default ─────────────────────────────────────────────

describe('buildPlaceholderContext: {governing_provision}', () => {
  const cfg = loadTemplateConfig('default_bail')!;

  it('the constant is the Addendum 1 no-choice wording (Addendum 2 #7)', () => {
    expect(GOVERNING_PROVISION_BLANK).toBe(GP_BLANK);
  });

  it('absent: the blank', () => {
    expect(buildPlaceholderContext(cfg, {}).governing_provision).toBe(GP_BLANK);
  });

  it.each(['', '   ', '\n'])('a client value %j (empty) is dropped: the blank', (v) => {
    expect(buildPlaceholderContext(cfg, { governing_provision: v }).governing_provision).toBe(
      GP_BLANK,
    );
  });

  it('a client null or undefined is dropped: the blank', () => {
    expect(buildPlaceholderContext(cfg, { governing_provision: null }).governing_provision).toBe(
      GP_BLANK,
    );
    expect(
      buildPlaceholderContext(cfg, { governing_provision: undefined }).governing_provision,
    ).toBe(GP_BLANK);
  });

  it('a real value from the server (extra.governingProvision) is kept', () => {
    const v = 'Section 187(3) of the Bharatiya Nagarik Suraksha Sanhita, 2023';
    expect(buildPlaceholderContext(cfg, {}, { governingProvision: v }).governing_provision).toBe(v);
  });

  it('a real value reaches the rendered prayer in place of the blank', async () => {
    const { renderTemplateSection } = await import('../services/template-engine.service');
    const ctx = buildPlaceholderContext(
      cfg,
      {
        applicant_name: 'Deepak Ravidas',
        fir_number: '143/2026',
      },
      { governingProvision: 'Section 187(3) of the BNSS' },
    );
    const prayer = renderTemplateSection(
      cfg.document_structure.sections.find((s) => s.section_id === 'prayer')!,
      ctx,
    );
    expect(prayer.content).toContain(
      'on default bail under Section 187(3) of the BNSS in connection',
    );
    expect(prayer.content).not.toContain('To be confirmed: Section 167(2)');
  });

  it('{governing_provision} is used by the six T-245a bail packs and the two docs/templates twins, and no other pack or template', () => {
    const dirs = [RULES_DIR, join(__dirname, '..', '..', '..', '..', 'docs', 'templates')];
    const users: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        if (readFileSync(join(dir, f), 'utf8').includes('governing_provision'))
          users.push(`${dir.split('/').slice(-2).join('/')}/${f}`);
      }
    }
    // T-245a (Ajay, Addendum 1 rulings 1-3, 2992891): the six packs and the two twins.
    expect(users.sort()).toEqual([
      'config/document-rules/bail_anticipatory.json',
      'config/document-rules/bail_before_magistrate.json',
      'config/document-rules/bail_cancellation.json',
      'config/document-rules/bail_regular.json',
      'config/document-rules/default_bail.json',
      'config/document-rules/interim_bail.json',
      'docs/templates/bail_anticipatory.json',
      'docs/templates/bail_regular.json',
    ]);
  });

  it('another pack gets its own governing_provision from the law switch, never default_bail’s blank', () => {
    // T-245a part 2 (Addendum 1 #2-3): bail_regular and bail_anticipatory read the switch's value.
    // bail_regular with no choice and no court is the court-unknown both-forms blank (Addendum 1 #4).
    const reg = buildPlaceholderContext(loadTemplateConfig('bail_regular')!, {
      applicant_name: 'X',
    });
    expect(reg.governing_provision).toBe(
      '[To be confirmed: Section 437 or 439 of the CrPC, or Section 480 or 483 of the BNSS]',
    );
    // anticipatory with no choice: Section 438 of the CrPC or Section 482 of the BNSS, both forms.
    const ant = buildPlaceholderContext(loadTemplateConfig('bail_anticipatory')!, {
      applicant_name: 'X',
    });
    expect(ant.governing_provision).toBe(
      '[To be confirmed: Section 438 of the CrPC or Section 482 of the BNSS]',
    );
    // A pack with no law switch (and not default_bail) still gets no value.
    expect(
      buildPlaceholderContext(loadTemplateConfig('rent_agreement')!, {}).governing_provision,
    ).toBeUndefined();
    // A value the server gives to another pack is still kept as given.
    expect(
      buildPlaceholderContext(
        loadTemplateConfig('bail_regular')!,
        {},
        { governingProvision: 'S. 480 BNSS' },
      ).governing_provision,
    ).toBe('S. 480 BNSS');
  });

  it('bail_regular’s prayer does not print the default-bail blank', () => {
    const bail = loadTemplateConfig('bail_regular')!;
    const raw = JSON.stringify(bail);
    // T-245a (Addendum 1 ruling 3): bail_regular's own templates now read {governing_provision}
    // (and {GOVERNING_PROVISION} in the heading). What must stay out is default_bail's blank.
    expect(raw).toContain('{governing_provision}');
    expect(raw).not.toContain(GP_BLANK);
    expect(raw).not.toContain('167(2)');
    expect(raw).not.toContain('187(3)');
    const ctx = buildPlaceholderContext(bail, {
      applicant_name: 'Ramesh Mahto',
      fir_number: '214/2026',
    });
    // The context carries the key (harmless); no template of bail_regular reads it.
    const rendered = bail.document_structure.sections
      .filter((s) => s.type === 'template')
      .map((s) => s.template ?? '')
      .join('\n');
    expect(rendered).not.toContain(GP_BLANK);
    expect(ctx.applicant_name).toBe('Ramesh Mahto');
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
