/**
 * T-136: one document, and the facts as given. Pure functions only: no model
 * call, no database. The system's own text comes from the real templates, so
 * what is repeated or changed is what a real draft would repeat or change.
 *
 * Wording of the findings is read from Ajay's signed file (see t136-signed.ts).
 * Her two matters (a regular bail application and a Section 138 notice) are
 * the fixtures the stitched drafts are built from.
 */
import {
  buildDrafterUserPrompt,
  buildGuidedDrafterUserPrompt,
  briefText,
  buildRepairUserPrompt,
  checkBriefIsUsed,
  checkOneDocument,
  checkPeriods,
  coveredBySystemPart,
  drafterBrief,
  findMissingClauses,
  formDataFromBrief,
  guidedDrafterBrief,
  packTexts,
  paragraphNumbers,
  removeRepeatedParts,
  splitDrafterOutput,
  withoutDisclaimerText,
  systemParts,
  systemTextAround,
} from '../services/brief-drafter';
import type { DrafterPromptInput, SystemText } from '../services/brief-drafter';
import { buildBrief, buildChecklist, isCourtDocument } from '../services/intake-brief';
import type { Brief, GivenValue } from '../services/intake-brief';
import { listRulePackIds, loadRulePack } from '../services/rule-pack.service';
import type { RulePack, RulePackClause } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  loadCourtRule,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';
import type { CourtLookupData } from '../services/template-engine.service';
import { signedD2, signedFinding } from './t136-signed';

// ── Fixtures ────────────────────────────────────────────────────────────────

function pack(id: string): RulePack {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return p;
}

const BAIL = pack('bail_regular');
const NOTICE = pack('legal_notice_s138');
const COURT = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };
const PATNA = {
  designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
  city: 'Patna',
  caseNomenclature: '',
  formattingRulesRef: 'bihar_district',
  courtType: 'sessions',
  courtRule: loadCourtRule('bihar_district') ?? undefined,
} as unknown as CourtLookupData;

function briefFor(p: RulePack, values: Array<{ key: string; value: string | string[] }>): Brief {
  return buildBrief({
    kind: { id: p.id, name: p.name, court_document: isCourtDocument(p.id) },
    checklist: buildChecklist(p),
    values: values.map((v): GivenValue => ({ ...v, source: 'user' })),
    court: isCourtDocument(p.id) ? COURT : undefined,
  });
}

/** The system's own text around the Drafter's, as a real draft for this brief prints it. */
function systemFor(p: RulePack, brief: Brief): SystemText {
  const config = loadTemplateConfig(p.id);
  if (!config) throw new Error(`no template ${p.id}`);
  const ctx = buildPlaceholderContext(
    config,
    formDataFromBrief(brief, config, 'en'),
    { advocateName: 'Test Advocate' },
    isCourtDocument(p.id) ? PATNA : undefined,
  );
  return systemTextAround(
    config.document_structure.sections.map((s) =>
      s.type === 'template'
        ? renderTemplateSection(s, ctx)
        : { section_id: 'body', type: 'ai_generated' as const, content: '' },
    ),
  );
}

const GROUND = (buildChecklist(BAIL).find((i) => i.key === 'grounds_for_bail')?.options ?? [])[2];

const BAIL_DESCRIBED =
  'My client Ramesh Mahto, son of Shri Suresh Mahto, aged 34, resident of Village Karmatand, PS Saraidhela, Dhanbad, was arrested on 12.09.2026 in FIR No. 214/2026 of Saraidhela PS dated 10.09.2026 under section 303 BNS. He has been in judicial custody since 13.09.2026 and is lodged in Dhanbad Divisional Jail. His earlier bail application was rejected by the JMFC, Dhanbad on 22.09.2026. He is the only earning member of his family. We need regular bail from the Sessions Court.';

const BAIL_VALUES = [
  { key: 'applicant_name', value: 'Ramesh Mahto' },
  { key: 'father_name', value: 'Shri Suresh Mahto' },
  { key: 'applicant_age', value: '34' },
  { key: 'address', value: 'Village Karmatand, PS Saraidhela, Dhanbad' },
  { key: 'fir_number', value: '214/2026' },
  { key: 'fir_date', value: '2026-09-10' },
  { key: 'police_station', value: 'Saraidhela' },
  { key: 'sections_charged', value: ['303'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'custody_since', value: '2026-09-13' },
  {
    key: 'facts_narrative',
    value:
      'He was arrested on 12.09.2026. He is lodged in Dhanbad Divisional Jail. He is the only earning member of his family.',
  },
  { key: 'grounds_for_bail', value: [GROUND] },
];

const NOTICE_VALUES = [
  { key: 'state', value: 'Jharkhand' },
  { key: 'applicant_name', value: 'Sunita Devi' },
  { key: 'applicant_address', value: 'Bank More, Dhanbad' },
  { key: 'respondent_name', value: 'Rajesh Kumar Singh' },
  { key: 'respondent_address', value: 'Hirapur, Dhanbad' },
  { key: 'respondent_type', value: 'Individual' },
  { key: 'advocate_name', value: 'Anita Sharma' },
  { key: 'advocate_address', value: 'Chamber 12, Civil Court, Dhanbad' },
  { key: 'advocate_enrollment', value: 'JH/1234/2015' },
  { key: 'cheque_number', value: '004512' },
  { key: 'cheque_date', value: '2026-08-01' },
  { key: 'cheque_amount', value: '500000' },
  { key: 'amount_in_words', value: 'Rupees Five Lakh only' },
  { key: 'drawee_bank', value: 'State Bank of India' },
  { key: 'drawee_branch', value: 'Hirapur Branch' },
  { key: 'presentation_date', value: '2026-08-05' },
  { key: 'dishonour_date', value: '2026-08-07' },
  { key: 'dishonour_reason', value: 'Funds Insufficient' },
  { key: 'underlying_liability', value: 'A hand loan of Rs. 5,00,000 given in January 2026.' },
];

const BAIL_BRIEF = briefFor(BAIL, BAIL_VALUES);
const BAIL_SYSTEM = systemFor(BAIL, BAIL_BRIEF);
const NOTICE_BRIEF = briefFor(NOTICE, NOTICE_VALUES);
const NOTICE_SYSTEM = systemFor(NOTICE, NOTICE_BRIEF);

const PARAS = [
  '1. That FIR No. 214/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Ramesh Mahto, son of Shri Suresh Mahto.',
  '2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026. He is lodged in Dhanbad Divisional Jail.',
  '3. That the applicant is the only earning member of his family.',
];
const PARA_TEXT = PARAS.join('\n\n');

/** Her stitched bail draft: the model wrote the whole document again around the body. */
const STITCHED_BAIL = `IN THE COURT OF THE SESSIONS JUDGE, DHANBAD

BAIL APPLICATION NO. ____ OF 2026

Ramesh Mahto ... Applicant
Versus
State of Jharkhand ... Respondent

AFFIDAVIT IN SUPPORT OF BAIL APPLICATION

TO,
THE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA

MOST RESPECTFULLY SHOWETH:

1. That the applicant Ramesh Mahto, son of Shri Suresh Mahto, has been falsely implicated in FIR No. 214/2026 dated 10.09.2026 registered at PS Saraidhela under Section 303 of BNS due to mistaken identity and/or enmity with the informant.

2. That the applicant was picked up by the police on 13.09.2026 and has been in custody for approximately three days.

3. That the applicant has deep roots in the community and is cooperating fully with the investigation.

4. That the applicant undertakes to abide by every condition this Hon'ble Court may impose.

PRAYER

It is therefore prayed that this Hon'ble Court may be pleased to grant bail to the applicant.

VERIFICATION

I, Ramesh Mahto, do hereby verify that the contents above are true.

DEPONENT

[Advocate Signature Block — SYSTEM]`;

/** Her stitched notice. */
const STITCHED_NOTICE = `LEGAL NOTICE

TO WHOM IT MAY CONCERN

To,
Rajesh Kumar Singh
Hirapur, Dhanbad

From,
Sunita Devi
Through her Advocate

Sir,

1. That my client Sunita Devi, resident of Bank More, Dhanbad, advanced a hand loan of Rs. 5,00,000 to you in January 2026.

2. That you issued Cheque No. 004512 dated 01.08.2026 for Rs. 5,00,000 drawn on State Bank of India, Hirapur Branch.

3. That the cheque was presented on 05.08.2026 and returned unpaid on 07.08.2026.

DEMAND

You are hereby called upon to pay Rs. 5,00,000 within fifteen (15) days, failing which criminal proceedings shall be initiated.

Yours faithfully,

[Advocate Signature Block — SYSTEM]

Yours faithfully,
Advocate`;

const c4 = (line: string): string => signedFinding('C4', { line });
const messages = (w: Array<{ message: string }>): string[] => w.map((x) => x.message);

/** What the pipeline does to a body: remove what may be removed, then look for what remains. */
function process(body: string, system: SystemText, name: string) {
  const { body: kept, removed } = removeRepeatedParts(body, system);
  return { kept, removed, findings: messages(checkOneDocument(kept, system, name)) };
}

// ── A2: removeRepeatedParts and checkOneDocument ────────────────────────────

describe('removeRepeatedParts (T-136, part 1 condition 4)', () => {
  it('has real system text on both sides for her bail matter', () => {
    expect(BAIL_SYSTEM.before).toContain('MOST RESPECTFULLY SHOWETH');
    expect(BAIL_SYSTEM.after).toContain('PRAYER');
    expect(NOTICE_SYSTEM.before).toContain('LEGAL NOTICE');
    expect(NOTICE_SYSTEM.after).toContain('DEMAND');
  });

  it('removes an exact repeat of the addressee block above the first paragraph and keeps every numbered paragraph word for word', () => {
    const addressee =
      'TO,\nTHE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA\n\nMOST RESPECTFULLY SHOWETH:';
    expect(BAIL_SYSTEM.before).toContain(addressee);
    const out = removeRepeatedParts(`${addressee}\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    expect(out.body).toBe(PARA_TEXT);
    expect(out.removed.length).toBeGreaterThan(0);
    for (const p of PARAS) expect(out.body).toContain(p);
    expect(checkOneDocument(out.body, BAIL_SYSTEM, BAIL.name)).toEqual([]);
  });

  it('removes the whole of the system text on either side when it is repeated exactly, and nothing else', () => {
    const body = `${BAIL_SYSTEM.before}\n\n${PARA_TEXT}\n\n${BAIL_SYSTEM.after}`;
    const out = removeRepeatedParts(body, BAIL_SYSTEM);
    expect(out.body).toBe(PARA_TEXT);
  });

  it('removes an exact repeat below the last paragraph (the closing of the notice)', () => {
    const out = removeRepeatedParts(`${PARA_TEXT}\n\n${NOTICE_SYSTEM.after}`, NOTICE_SYSTEM);
    expect(out.body).toBe(PARA_TEXT);
  });

  // One test per kind of difference: a repeat that differs is not a duplicate.
  const differs: Array<[string, 'before' | 'after', (t: string) => string, SystemText]> = [
    [
      'a name',
      'before',
      (t) => t.replace(/PATNA/g, 'RANCHI').replace(/Patna/g, 'Ranchi'),
      BAIL_SYSTEM,
    ],
    ['a party name', 'before', (t) => t.replace('Ramesh Mahto', 'Rakesh Mahto'), BAIL_SYSTEM],
    ['a date', 'before', (t) => t.replace('01.08.2026', '01.09.2026'), NOTICE_SYSTEM],
    ['an amount', 'after', (t) => t.replace(/Rs\. 500000/g, 'Rs. 600000'), NOTICE_SYSTEM],
    ['a section', 'before', (t) => t.replace('SECTION 483', 'SECTION 480'), BAIL_SYSTEM],
    [
      'the relief',
      'after',
      (t) => t.replace('Grant Regular Bail', 'Grant Anticipatory Bail'),
      BAIL_SYSTEM,
    ],
  ];

  it.each(differs)(
    'does not remove a repeat that differs in %s, and C4 is raised',
    (_k, side, change, system) => {
      const original = system[side];
      const changed = change(original);
      expect(changed).not.toBe(original);
      const body = side === 'before' ? `${changed}\n\n${PARA_TEXT}` : `${PARA_TEXT}\n\n${changed}`;
      const out = process(body, system, 'Document');
      // Something of the changed text stays (a part goes whole or not at all) ...
      expect(out.kept).toContain(changed.split('\n')[0]);
      for (const p of PARAS) expect(out.kept).toContain(p);
      // ... and the advocate is told.
      expect(out.findings.length).toBeGreaterThan(0);
      for (const f of out.findings)
        expect(f).toMatch(
          /^The draft has a part that may not belong: ".+"\. Check that the draft is one document\.$/,
        );
    },
  );

  it('keeps the changed line itself, not only the heading, when only one word of a block changed', () => {
    const changed = BAIL_SYSTEM.before.replace(/PATNA/g, 'RANCHI');
    const out = removeRepeatedParts(`${changed}\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    expect(out.body).toContain('IN THE COURT OF DISTRICT & SESSIONS JUDGE, RANCHI');
  });

  it('does not remove a block that differs only by a two-letter word or a sign ("S/o" vs "D/o")', () => {
    const changed = BAIL_SYSTEM.before.replace('S/o ', 'D/o ');
    expect(changed).not.toBe(BAIL_SYSTEM.before);
    const out = removeRepeatedParts(`${changed}\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    // The part goes whole or not at all: its heading stays with the changed line.
    expect(out.body).toContain('D/o Shri Suresh Mahto');
    expect(out.body).toContain('IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA');
    expect(checkOneDocument(out.body, BAIL_SYSTEM, BAIL.name).length).toBeGreaterThan(0);
  });

  it('does not remove a block that differs only by the word "No"', () => {
    const changed = BAIL_SYSTEM.before.replace('Case No. ', 'Case ');
    expect(changed).not.toBe(BAIL_SYSTEM.before);
    const out = removeRepeatedParts(`${changed}\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    expect(out.body).toContain('Criminal Miscellaneous Case _____ of 2026');
  });

  it('never removes a numbered paragraph, even one that repeats a system part word for word', () => {
    const para = '1. IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA';
    const verification = '2. PRAYER';
    const body = `${para}\n\n${verification}\n\n3. That the applicant is the only earning member of his family.`;
    const out = removeRepeatedParts(body, BAIL_SYSTEM);
    expect(out.body).toBe(body);
    expect(out.removed).toEqual([]);
  });

  it('never removes a sub-point "(a) ..." that repeats a line of the system text', () => {
    const subPoint =
      '(a) Grant Regular Bail to the Applicant, [To be confirmed: applicant / accused full name], in connection with FIR No. [To be confirmed: FIR number]';
    const body = `${PARAS[0]}\n\n${subPoint}`;
    const out = removeRepeatedParts(body, BAIL_SYSTEM);
    expect(out.body).toContain(subPoint);
  });

  it('removes nothing from a side where the system wrote nothing', () => {
    const repeat = `${BAIL_SYSTEM.before}\n\n${PARA_TEXT}\n\n${BAIL_SYSTEM.after}`;
    const noBefore = removeRepeatedParts(repeat, {
      before: '',
      after: BAIL_SYSTEM.after,
      headings: BAIL_SYSTEM.headings,
    });
    expect(noBefore.body).toContain('IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA');
    expect(noBefore.body).not.toContain('Verified at Patna');
    const noAfter = removeRepeatedParts(repeat, {
      before: BAIL_SYSTEM.before,
      after: '',
      headings: BAIL_SYSTEM.headings,
    });
    expect(noAfter.body).toContain('Verified at Patna');
    expect(noAfter.body).not.toContain('IN THE COURT OF');
    const none = removeRepeatedParts(repeat, { before: '', after: '', headings: [] });
    expect(none.body).toBe(repeat);
    expect(none.removed).toEqual([]);
  });

  it('checkOneDocument finds nothing when the system wrote nothing on either side', () => {
    expect(
      checkOneDocument(STITCHED_BAIL, { before: '', after: '', headings: [] }, BAIL.name),
    ).toEqual([]);
  });

  describe('the word SYSTEM in brackets never reaches the document', () => {
    const none: SystemText = { before: '', after: '', headings: [] };

    it('is removed from a body with numbered paragraphs', () => {
      const out = removeRepeatedParts(
        `${PARA_TEXT}\n\n[Advocate Signature Block — SYSTEM]`,
        BAIL_SYSTEM,
      );
      expect(out.body).toBe(PARA_TEXT);
      expect(out.body).not.toMatch(/SYSTEM/);
    });

    it('is removed from a body with no numbered paragraph at all', () => {
      const body =
        'That the applicant was arrested.\n\n[Advocate Signature Block — SYSTEM]\n\n[Prayer — SYSTEM]';
      for (const system of [BAIL_SYSTEM, none]) {
        const out = removeRepeatedParts(body, system);
        expect(out.body).not.toMatch(/SYSTEM/);
        expect(out.body).toContain('That the applicant was arrested.');
      }
    });

    it('is removed in round brackets too', () => {
      const out = removeRepeatedParts('That the applicant was arrested. (Prayer — SYSTEM)', none);
      expect(out.body).toBe('That the applicant was arrested.');
    });

    it('leaves the ordinary word "system" in a sentence of facts alone', () => {
      const body =
        '1. That the banking system of the State flagged the account, and the system rejected the cheque.';
      const out = removeRepeatedParts(body, BAIL_SYSTEM);
      expect(out.body).toBe(body);
      expect(out.removed).toEqual([]);
      expect(checkOneDocument(body, BAIL_SYSTEM, BAIL.name)).toEqual([]);
    });

    it('raises C4 for upper-case SYSTEM that is left in a line', () => {
      const f = messages(
        checkOneDocument('1. That the SYSTEM wrote this.', BAIL_SYSTEM, BAIL.name),
      );
      expect(f).toEqual([c4('1. That the SYSTEM wrote this.')]);
    });
  });

  describe('her bail draft, stitched', () => {
    const out = process(STITCHED_BAIL, BAIL_SYSTEM, BAIL.name);

    it('keeps all four numbered paragraphs word for word', () => {
      const original = STITCHED_BAIL.split('\n\n').filter((p) => /^\d\. /.test(p));
      expect(original).toHaveLength(4);
      for (const p of original) expect(out.kept).toContain(p);
    });

    it('never lets SYSTEM through', () => {
      expect(out.kept).not.toMatch(/SYSTEM/);
    });

    it('removes the repeated addressee block, which is the system’s own', () => {
      expect(out.kept).not.toContain('THE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA');
      expect(out.kept).not.toContain('MOST RESPECTFULLY SHOWETH');
    });

    it.each([
      'IN THE COURT OF THE SESSIONS JUDGE, DHANBAD',
      'Ramesh Mahto ... Applicant',
      'AFFIDAVIT IN SUPPORT OF BAIL APPLICATION',
      'PRAYER',
      'VERIFICATION',
      'DEPONENT',
    ])('"%s" is either gone under condition 4 or raised as C4, never kept silently', (line) => {
      const stays = out.kept.split('\n').some((l) => l.trim() === line);
      if (stays) expect(out.findings).toContain(c4(line));
    });

    it.each([
      'IN THE COURT OF THE SESSIONS JUDGE, DHANBAD',
      'AFFIDAVIT IN SUPPORT OF BAIL APPLICATION',
      'PRAYER',
      'VERIFICATION',
      'DEPONENT',
    ])('raises C4 for "%s" in the signed wording', (line) => {
      expect(out.findings).toContain(c4(line));
    });

    it('does not raise C4 for the affidavit heading when the document is an affidavit', () => {
      const f = messages(checkOneDocument(out.kept, BAIL_SYSTEM, 'Affidavit in support of bail'));
      expect(f).not.toContain(c4('AFFIDAVIT IN SUPPORT OF BAIL APPLICATION'));
    });
  });

  describe('her notice, stitched', () => {
    const out = process(STITCHED_NOTICE, NOTICE_SYSTEM, NOTICE.name);

    it('keeps every numbered paragraph and lets no SYSTEM through', () => {
      for (const p of STITCHED_NOTICE.split('\n\n').filter((x) => /^\d\. /.test(x))) {
        expect(out.kept).toContain(p);
      }
      expect(out.kept).not.toMatch(/SYSTEM/);
    });

    it.each([
      'LEGAL NOTICE',
      'TO WHOM IT MAY CONCERN',
      'To,',
      'From,',
      'Sir,',
      'DEMAND',
      'Yours faithfully,',
    ])('"%s" is removed under condition 4 or raised as C4', (line) => {
      const stays = out.kept.split('\n').some((l) => l.trim() === line);
      if (stays) expect(out.findings).toContain(c4(line));
    });

    it.each(['TO WHOM IT MAY CONCERN', 'Yours faithfully,', 'DEMAND'])(
      'raises C4 for "%s"',
      (line) => {
        expect(out.findings).toContain(c4(line));
      },
    );

    it('is not asked to be a finding when the Drafter writes only the numbered body', () => {
      const clean = process(PARA_TEXT, NOTICE_SYSTEM, NOTICE.name);
      expect(clean.findings).toEqual([]);
      expect(clean.kept).toBe(PARA_TEXT);
    });
  });
});

// ── A3: checkBriefIsUsed ────────────────────────────────────────────────────

/** The document as it prints: the system's parts and a body. */
const printed = (body: string, system: SystemText = BAIL_SYSTEM): string =>
  `${system.before}\n\n${body}\n\n${system.after}`;

const CLEAN_BAIL = `1. That FIR No. 214/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Ramesh Mahto, son of Shri Suresh Mahto, aged 34, resident of Village Karmatand, PS Saraidhela, Dhanbad.

2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026. He is lodged in Dhanbad Divisional Jail.

3. That an earlier bail application of the applicant was rejected by the JMFC, Dhanbad on 22.09.2026.

4. That the applicant is the only earning member of his family.`;

describe('checkBriefIsUsed (C1, C2, D2)', () => {
  const messagesFor = (doc: string, described?: string | null, brief: Brief = BAIL_BRIEF) =>
    messages(checkBriefIsUsed(doc, brief, described));

  it('a faithful document raises nothing', () => {
    expect(messagesFor(printed(CLEAN_BAIL))).toEqual([]);
  });

  describe('C1: a date of the brief', () => {
    it('is raised, in the signed wording, with the date as the app shows it and what it is the date of', () => {
      const item = BAIL_BRIEF.items.find((i) => i.key === 'custody_since');
      const doc = printed(CLEAN_BAIL.replace('13.09.2026', 'a later date'));
      expect(messagesFor(doc)).toEqual([
        signedFinding('C1', {
          date: '13.09.2026',
          'what it is the date of': item?.meaning ?? item?.label ?? '',
        }),
      ]);
    });

    it('is not raised when the date is in the document', () => {
      expect(
        messagesFor(printed(CLEAN_BAIL)).filter((m) => m.startsWith('Your brief has a date')),
      ).toEqual([]);
    });

    it('counts a date that stands only in a part the system wrote', () => {
      const doc = `IN THE COURT OF X\n\nFIR dated 10.09.2026 and custody since 13.09.2026 and arrested 12.09.2026\n\n${CLEAN_BAIL.replace(
        /10\.09\.2026/g,
        'the date of the FIR',
      )
        .replace(/13\.09\.2026/g, 'the date of custody')
        .replace(/12\.09\.2026/g, 'the date of arrest')}`;
      expect(messagesFor(doc).filter((m) => m.startsWith('Your brief has a date'))).toEqual([]);
    });

    it('raises C1 for a moved date: arrest 12.09.2026 on the brief and a document that only says 13.09.2026', () => {
      const custody = BAIL_BRIEF.items.find((i) => i.key === 'custody_since');
      if (!custody) throw new Error('no custody item');
      const withArrest: Brief = {
        ...BAIL_BRIEF,
        items: [
          ...BAIL_BRIEF.items,
          {
            ...custody,
            key: 'arrest_date',
            label: 'Date of arrest',
            meaning: 'Date of arrest',
            value: '2026-09-12',
          },
        ],
      };
      const doc = printed(
        '1. That the applicant has been in judicial custody since 13.09.2026. FIR No. 214/2026 dated 10.09.2026. The applicant Ramesh Mahto, son of Shri Suresh Mahto.',
      );
      const found = messagesFor(doc, null, withArrest);
      expect(found).toContain(
        signedFinding('C1', { date: '12.09.2026', 'what it is the date of': 'Date of arrest' }),
      );
      expect(found.some((m) => m.includes('13.09.2026'))).toBe(false);
    });

    it('reads a date inside a long account and shows it as written (arrest, from the narrative)', () => {
      const doc = printed(
        CLEAN_BAIL.replace('arrested on 12.09.2026 and has been', 'arrested and has been'),
      );
      expect(
        messagesFor(doc).some((m) =>
          m.startsWith('Your brief has a date the draft does not use: 12.09.2026'),
        ),
      ).toBe(true);
    });
  });

  describe('D2: a date only in the description', () => {
    it('is raised, in the signed wording, with the date exactly as the advocate wrote it', () => {
      const described =
        'Arrested on 12.09.2026. His bail was rejected on 22nd Sept 2026 by the JMFC.';
      const doc = printed(CLEAN_BAIL.replace('on 22.09.2026', 'on a date'));
      const found = messagesFor(doc, described);
      expect(found).toContain(signedD2().replace('{date}', '22nd Sept 2026'));
      // The year is not rewritten and no form is changed.
      expect(found.some((m) => m.includes('22.09.2026'))).toBe(false);
    });

    it('is not raised when the document holds the date', () => {
      const found = messagesFor(printed(CLEAN_BAIL), 'The rejection was on 22nd Sept 2026.');
      expect(found).toEqual([]);
    });

    it('is not raised when the same date has an item on the brief (C1 rules)', () => {
      const doc = printed(CLEAN_BAIL.replace(/13\.09\.2026/g, 'a later date'));
      const found = messagesFor(doc, 'In custody since 13th September 2026.');
      expect(found.some((m) => m.startsWith('Your description has a date'))).toBe(false);
      expect(
        found.some((m) => m.startsWith('Your brief has a date the draft does not use: 13.09.2026')),
      ).toBe(true);
    });

    it('raises nothing for a date written without a year, and adds no year', () => {
      const found = messagesFor(
        printed(CLEAN_BAIL),
        'He was arrested on 22nd September and then released.',
      );
      expect(found).toEqual([]);
    });

    it('is raised once for a date written twice', () => {
      const doc = printed(CLEAN_BAIL.replace('on 22.09.2026', 'on a date'));
      const found = messagesFor(doc, 'On 22.09.2026 it was refused. On 22.09.2026 again.');
      expect(found.filter((m) => m.startsWith('Your description has a date'))).toHaveLength(1);
    });
  });

  describe('C2: a name, a number or a fact of the brief', () => {
    const c2 = (label: string, value: string): string => signedFinding('C2', { label, value });
    const labelOf = (key: string): string =>
      BAIL_BRIEF.items.find((i) => i.key === key)?.label ?? '';

    // The system's parts print the names too, so these look at the body alone.
    it('is raised for a missing party name, with label and value', () => {
      const doc = CLEAN_BAIL.replace('Shri Suresh Mahto', 'his father');
      expect(messagesFor(doc)).toContain(c2(labelOf('father_name'), 'Shri Suresh Mahto'));
    });

    it('is raised for a missing number, with label and value', () => {
      const doc = CLEAN_BAIL.replace('FIR No. 214/2026', 'the FIR');
      expect(messagesFor(doc)).toContain(c2(labelOf('fir_number'), '214/2026'));
    });

    it('finds a name written in another word order', () => {
      const doc = CLEAN_BAIL.replace(/Ramesh Mahto/g, 'Mahto, Ramesh');
      expect(messagesFor(doc).filter((m) => m.startsWith('We could not find'))).toEqual([]);
    });

    it('is raised for her dropped facts: the earning member, the jail, the earlier rejection (in a narrative item)', () => {
      const brief = briefFor(BAIL, [
        ...BAIL_VALUES.filter((v) => v.key !== 'facts_narrative'),
        {
          key: 'facts_narrative',
          value:
            'He is the only earning member of his family. He is lodged in Dhanbad Divisional Jail.',
        },
        {
          key: 'additional_context',
          value: 'His earlier bail application was rejected by the JMFC, Dhanbad.',
        },
      ]);
      const bare = [
        '1. That FIR No. 214/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Ramesh Mahto, son of Shri Suresh Mahto, aged 34, resident of Village Karmatand, PS Saraidhela, Dhanbad.',
        '2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026.',
      ].join('\n\n');
      const found = messagesFor(printed(bare), null, brief);
      const narrative = brief.items.find((i) => i.key === 'facts_narrative')?.label ?? '';
      const extra = brief.items.find((i) => i.key === 'additional_context')?.label ?? '';
      expect(found).toContain(
        c2(narrative, 'He is the only earning member of his family.'.replace(/\.$/, '')),
      );
      expect(found).toContain(c2(narrative, 'He is lodged in Dhanbad Divisional Jail'));
      expect(found).toContain(
        c2(extra, 'His earlier bail application was rejected by the JMFC, Dhanbad'),
      );
    });

    it('is not raised when the document states those facts in the same words', () => {
      const brief = briefFor(BAIL, [
        ...BAIL_VALUES.filter((v) => v.key !== 'facts_narrative'),
        {
          key: 'facts_narrative',
          value:
            'He is the only earning member of his family. He is lodged in Dhanbad Divisional Jail.',
        },
        {
          key: 'additional_context',
          value: 'His earlier bail application was rejected by the JMFC, Dhanbad.',
        },
      ]);
      const doc = printed(
        `${CLEAN_BAIL.replace('22.09.2026', 'the date given')}\n\n5. His earlier bail application was rejected by the JMFC, Dhanbad.`,
      );
      expect(
        messagesFor(doc, null, brief).filter((m) => m.startsWith('We could not find')),
      ).toEqual([]);
    });

    // KNOWN LIMIT: the check compares words, not meaning. A faithful rewording
    // of a fact of the brief is reported as missing. This test pins that, so the
    // limit is visible; if the check is made smarter, this test is to be updated.
    it('KNOWN LIMIT: a faithful paraphrase of a narrative fact raises C2', () => {
      const doc = printed(
        CLEAN_BAIL.replace(
          '4. That the applicant is the only earning member of his family.',
          '4. That the applicant alone supports his household financially.',
        ),
      );
      const found = messagesFor(doc);
      expect(
        found.some((m) => m.startsWith('We could not find this from your brief in the draft:')),
      ).toBe(true);
      expect(found.some((m) => m.includes('only earning member of his family'))).toBe(true);
    });
  });
});

// ── A4: checkPeriods and packTexts ──────────────────────────────────────────

describe('checkPeriods and packTexts (C3, part 1 condition 3)', () => {
  const bailKnown = (): string[] => [
    briefText(BAIL_BRIEF),
    BAIL_DESCRIBED,
    ...packTexts(BAIL),
    BAIL_SYSTEM.before,
    BAIL_SYSTEM.after,
  ];
  const noticeKnown = (): string[] => [
    briefText(NOTICE_BRIEF),
    ...packTexts(NOTICE),
    NOTICE_SYSTEM.before,
    NOTICE_SYSTEM.after,
  ];
  const c3 = (period: string): string => signedFinding('C3', { period });

  it.each([
    ['approximately three days', 'three days'],
    ['3 days in custody', '3 days'],
  ])(
    'raises C3 in the signed wording for "%s" in a bail body that states no such period',
    (text, period) => {
      const found = messages(
        checkPeriods(
          `That the applicant has been in custody for ${text}.`,
          bailKnown(),
          BAIL_BRIEF,
        ),
      );
      expect(found).toEqual([c3(period)]);
    },
  );

  it.each([
    'You must pay within 15 days of receipt of this notice.',
    'You must pay within 15 (fifteen) days of receipt of this notice.',
    'You must pay within fifteen (15) days of receipt of this notice.',
    'The 15-day period has been allowed by law.',
    'The notice allows 15 days.',
  ])('never raises the 15 days of a Section 138 notice: %s', (text) => {
    expect(checkPeriods(`1. ${text}`, noticeKnown(), NOTICE_BRIEF)).toEqual([]);
  });

  it('would raise it if the pack and the system did not state it (the guard works)', () => {
    expect(
      checkPeriods('1. Pay within 15 days.', [briefText(NOTICE_BRIEF)], NOTICE_BRIEF),
    ).toHaveLength(1);
  });

  it('does not raise a period the brief states', () => {
    const brief = briefFor(BAIL, [
      ...BAIL_VALUES.filter((v) => v.key !== 'facts_narrative'),
      { key: 'facts_narrative', value: 'He has been in custody for 10 days.' },
    ]);
    expect(checkPeriods('He has been in custody for 10 days.', [briefText(brief)], brief)).toEqual(
      [],
    );
  });

  it('does not raise a period the description states', () => {
    expect(
      checkPeriods(
        'In custody for ten days.',
        [BAIL_DESCRIBED, 'He is in custody for ten days.'],
        BAIL_BRIEF,
      ),
    ).toEqual([]);
    expect(
      checkPeriods('In custody for 10 days.', ['In custody for ten days.'], BAIL_BRIEF),
    ).toEqual([]);
  });

  it('does not raise a number of the brief that is written with a unit (age 34 -> "34 years")', () => {
    expect(
      checkPeriods('The applicant, aged 34 years, is a resident of Dhanbad.', [], BAIL_BRIEF),
    ).toEqual([]);
  });

  it('raises each period once', () => {
    const found = checkPeriods('For three days. Again for three days.', [], BAIL_BRIEF);
    expect(found).toHaveLength(1);
  });

  describe('packTexts', () => {
    it('includes instructions, clause titles, details, fixed wording, act sections, prayer and verification', () => {
      const texts = packTexts(BAIL).join('\n');
      expect(texts).toContain(BAIL.draftingInstructions[0]);
      for (const c of BAIL.mandatoryClauses) {
        expect(texts).toContain(c.title);
        if (c.detail) expect(texts).toContain(c.detail);
      }
      for (const a of BAIL.relevantActs) {
        expect(texts).toContain(a.act);
        for (const s of a.sections) expect(texts).toContain(s.number);
      }
      expect(texts).toContain(BAIL.prayerTemplate ?? 'prayer');
      expect(texts).toContain(BAIL.verificationTemplate ?? 'verification');
      const fixed = NOTICE.mandatoryClauses.find((c) => c.fixedText);
      if (fixed) expect(packTexts(NOTICE).join('\n')).toContain(fixed.fixedText);
    });

    it.each(listRulePackIds())(
      'condition 3: a period that pack %s gives is never reported against that pack',
      (id) => {
        const p = pack(id);
        const brief = briefFor(p, []);
        const texts = packTexts(p);
        const found = checkPeriods(texts.join('\n'), texts, brief);
        expect(messages(found)).toEqual([]);
      },
    );
  });
});

// ── A5: smaller ones ────────────────────────────────────────────────────────

describe('what the Drafter is given', () => {
  const config = loadTemplateConfig('bail_regular');
  if (!config) throw new Error('no template');
  const input = (over: Partial<DrafterPromptInput> = {}): DrafterPromptInput => ({
    pack: BAIL,
    brief: drafterBrief(BAIL_BRIEF, 'DISTRICT & SESSIONS JUDGE, PATNA', undefined, BAIL_DESCRIBED),
    systemParts: systemParts(config),
    systemText: BAIL_SYSTEM,
    courtRules: ['Font: Times New Roman 14'],
    target: 12,
    language: 'en',
    ...over,
  });

  describe('drafterBrief: "described"', () => {
    const of = (d?: string | null) => drafterBrief(BAIL_BRIEF, null, undefined, d);

    it('holds the description word for word, only trimmed', () => {
      const typed =
        '  My client Ramesh  Mahto was arrested on 12th Sept 2026.\n\nHe has "no" record.  ';
      expect(of(typed).described).toBe(typed.trim());
      expect(of(BAIL_DESCRIBED).described).toBe(BAIL_DESCRIBED);
    });

    it('is null when absent or blank', () => {
      expect(of().described).toBeNull();
      expect(of(null).described).toBeNull();
      expect(of('').described).toBeNull();
      expect(of('  \n\t ').described).toBeNull();
    });

    it('reaches the Drafter under the key "described", in the BRIEF block', () => {
      const prompt = buildDrafterUserPrompt(input());
      expect(prompt).toContain(`"described": ${JSON.stringify(BAIL_DESCRIBED)}`);
    });
  });

  describe('SYSTEM PARTS, BEFORE YOUR TEXT, AFTER YOUR TEXT', () => {
    const labels = systemParts(config).map((p) => `- ${p.label}`);
    const blocks = (before: string, after: string, names = labels.join('\n')): string =>
      `SYSTEM PARTS:\n${names}\n\nBEFORE YOUR TEXT:\n${before}\n\nAFTER YOUR TEXT:\n${after}`;

    it('both calls carry the same three blocks, with the system text in full', () => {
      const first = buildDrafterUserPrompt(input());
      const repair = buildRepairUserPrompt(input(), PARA_TEXT, ['earlier_applications']);
      const expected = blocks(BAIL_SYSTEM.before, BAIL_SYSTEM.after);
      expect(first).toContain(expected);
      expect(repair).toContain(expected);
    });

    it('the repair prompt carries DOCUMENT, COURT RULE, DOCUMENT TEXT and MISSING', () => {
      const repair = buildRepairUserPrompt(input(), PARA_TEXT, [
        'no_flight_risk',
        'earlier_applications',
      ]);
      expect(repair).toContain(`DOCUMENT: ${BAIL.name}`);
      expect(repair).toContain('COURT RULE:\n- Font: Times New Roman 14');
      expect(repair).toContain(`DOCUMENT TEXT:\n<document>\n${PARA_TEXT}\n</document>`);
      expect(repair).toContain('MISSING: no_flight_risk, earlier_applications');
      expect(repair).toContain('"described"');
    });

    it('the first call has TARGET and no DOCUMENT TEXT; the repair has no TARGET', () => {
      const first = buildDrafterUserPrompt(input());
      const repair = buildRepairUserPrompt(input(), PARA_TEXT, ['x']);
      expect(first).toContain('TARGET: 12');
      expect(first).not.toContain('DOCUMENT TEXT:');
      expect(repair).not.toContain('TARGET:');
    });

    it('both say none when the system wrote no text', () => {
      const bare = input({ systemText: undefined, systemParts: [] });
      const empty = input({ systemText: { before: '', after: '', headings: [] }, systemParts: [] });
      for (const i of [bare, empty]) {
        const expected = blocks('none', 'none', 'none');
        expect(buildDrafterUserPrompt(i)).toContain(expected);
        expect(buildRepairUserPrompt(i, PARA_TEXT, ['x'])).toContain(expected);
      }
    });
  });

  describe('a document with no rule pack (the guided Drafter)', () => {
    it('has no "described" key and its prompt does not use the word', () => {
      const guided = guidedDrafterBrief(BAIL_BRIEF, 'DISTRICT & SESSIONS JUDGE, PATNA');
      expect(Object.keys(guided)).not.toContain('described');
      const prompt = buildGuidedDrafterUserPrompt({ brief: guided, target: 10, language: 'en' });
      expect(prompt.toLowerCase()).not.toContain('described');
    });
  });
});

describe('which clauses count as missing', () => {
  const report = (pk: RulePack, over: Record<string, string>, body: string) => {
    const lines = pk.mandatoryClauses
      .filter((c) => c.required)
      .map((c) => `${c.id}: ${over[c.id] ?? '1'}`);
    return splitDrafterOutput(`${body}\n===CLAUSES===\n${lines.join('\n')}`);
  };
  const noticeConfig = loadTemplateConfig('legal_notice_s138');
  const bailConfig = loadTemplateConfig('bail_regular');
  if (!noticeConfig || !bailConfig) throw new Error('no template');
  const noticeParts = systemParts(noticeConfig);
  const idsOf = (m: Array<{ id: string }>): string[] => m.map((x) => x.id);

  describe('legal_notice_s138: the warning of prosecution', () => {
    const warning = NOTICE.mandatoryClauses.find((c) => c.id === 'consequence_warning');

    it('the pack has a consequence_warning clause', () => {
      expect(warning).toBeDefined();
    });

    it('is covered by the demand_clause part, which the template adds', () => {
      expect(noticeParts.map((p) => p.sectionId)).toContain('demand_clause');
      expect(coveredBySystemPart(warning as RulePackClause, noticeParts)).toBe(true);
    });

    it('reported SYSTEM with the demand_clause part present is not missing', () => {
      const out = report(NOTICE, { consequence_warning: 'SYSTEM' }, PARA_TEXT);
      expect(idsOf(findMissingClauses(NOTICE, out, noticeParts))).not.toContain(
        'consequence_warning',
      );
    });

    it('reported SYSTEM with no demand_clause part is missing', () => {
      const parts = noticeParts.filter((p) => p.sectionId !== 'demand_clause');
      expect(coveredBySystemPart(warning as RulePackClause, parts)).toBe(false);
      const out = report(NOTICE, { consequence_warning: 'SYSTEM' }, PARA_TEXT);
      const missing = findMissingClauses(NOTICE, out, parts).find(
        (m) => m.id === 'consequence_warning',
      );
      expect(missing?.reason).toBe('not_a_system_part');
    });
  });

  describe('bail_regular: earlier_applications', () => {
    const parts = systemParts(bailConfig);

    it('reported MISSING is missing', () => {
      const out = report(BAIL, { earlier_applications: 'MISSING' }, PARA_TEXT);
      const missing = findMissingClauses(BAIL, out, parts).find(
        (m) => m.id === 'earlier_applications',
      );
      expect(missing?.reason).toBe('reported_missing');
    });

    it('reported with a paragraph that exists is not missing', () => {
      const out = report(BAIL, { earlier_applications: '3' }, PARA_TEXT);
      expect(idsOf(findMissingClauses(BAIL, out, parts))).not.toContain('earlier_applications');
    });

    it('reported with a paragraph that does not exist is missing', () => {
      const out = report(BAIL, { earlier_applications: '9' }, PARA_TEXT);
      const missing = findMissingClauses(BAIL, out, parts).find(
        (m) => m.id === 'earlier_applications',
      );
      expect(missing?.reason).toBe('paragraph_not_found');
    });

    it('is not covered by any system part', () => {
      const clause = BAIL.mandatoryClauses.find((c) => c.id === 'earlier_applications');
      expect(clause).toBeDefined();
      expect(coveredBySystemPart(clause as RulePackClause, parts)).toBe(false);
    });
  });
});

// ── Review round 1: lines of the system's part put together in another order ──

describe('review round 1 — a part is judged as one text', () => {
  const NOTICE_PARAS = STITCHED_NOTICE.split('\n\n').filter((p) => /^\d\. /.test(p));
  const NOTICE_TEXT = NOTICE_PARAS.join('\n\n');

  const sunitaToFrom = 'To,\n\nSunita Devi\n\nFrom,\n\nRajesh Kumar Singh';
  const stateApplicant =
    'State of Bihar through the District Magistrate / S.P., Patna\n\n... Applicant\n\nVersus\n\nRamesh Mahto\n\n... Opposite Party';
  const toRamesh = 'TO,\n\nRamesh Mahto';

  const cases: Array<[string, string, string, SystemText, string]> = [
    [
      '(1) the notice addressed to the sender',
      sunitaToFrom,
      NOTICE_TEXT,
      NOTICE_SYSTEM,
      NOTICE.name,
    ],
    ['(2) the State made the applicant', stateApplicant, PARA_TEXT, BAIL_SYSTEM, BAIL.name],
    ['(3) "TO," over the applicant', toRamesh, PARA_TEXT, BAIL_SYSTEM, BAIL.name],
  ];

  it.each(cases)(
    '%s: nothing is removed, C4 is raised for each block',
    (_n, above, paras, sys, name) => {
      // Each line is a real line of the system's text; only their pairing is new.
      for (const line of above
        .split('\n')
        .filter((l) => l.trim() !== '' && l !== '... Applicant')) {
        expect(`${sys.before}\n${sys.after}`).toContain(line);
      }
      const body = `${above}\n\n${paras}`;
      const out = process(body, sys, name);
      expect(out.removed).toEqual([]);
      expect(out.kept).toBe(body);
      for (const para of paras.split('\n\n')) expect(out.kept).toContain(para);
      for (const block of above.split('\n\n')) expect(out.kept).toContain(block);
      // Every line that was re-paired is named by a C4 finding, as written.
      for (const line of above.split('\n').filter((l) => l.trim() !== '')) {
        expect(out.findings).toContain(c4(line.trim()));
      }
    },
  );

  it('(1) raises C4, in the signed wording, for "To," and "From,"', () => {
    const out = process(`${sunitaToFrom}\n\n${NOTICE_TEXT}`, NOTICE_SYSTEM, NOTICE.name);
    expect(out.findings).toContain(c4('To,'));
    expect(out.findings).toContain(c4('From,'));
  });

  it('(2) raises C4, in the signed wording, for the party lines', () => {
    const out = process(`${stateApplicant}\n\n${PARA_TEXT}`, BAIL_SYSTEM, BAIL.name);
    expect(out.findings).toContain(c4('Versus'));
    expect(out.findings).toContain(c4('... Opposite Party'));
  });

  it('(3) raises C4, in the signed wording, for "TO,"', () => {
    const out = process(`${toRamesh}\n\n${PARA_TEXT}`, BAIL_SYSTEM, BAIL.name);
    expect(out.findings).toContain(c4('TO,'));
  });

  it.each(cases)(
    '%s: without blank lines between the lines the outcome is the same',
    (_n, above, paras, sys, name) => {
      const tight = above.replace(/\n\n/g, '\n');
      const body = `${tight}\n\n${paras}`;
      const out = process(body, sys, name);
      expect(out.removed).toEqual([]);
      expect(out.kept).toBe(body);
      // The code quotes only the first line of a block with no blank lines inside: one C4 for it.
      const first = tight.split('\n').find((l) => l.trim() !== '') as string;
      expect(out.findings).toEqual([c4(first.trim())]);
    },
  );

  it('an exact repeat split across blank lines as the system prints it is removed and stands once', () => {
    const addressee =
      'TO,\nTHE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA\n\nMOST RESPECTFULLY SHOWETH:';
    const out = process(`${addressee}\n\n${PARA_TEXT}\n\nPRAYER`, BAIL_SYSTEM, BAIL.name);
    expect(out.kept).toBe(PARA_TEXT);
    expect(out.findings).toEqual([]);
    const assembled = `${BAIL_SYSTEM.before}\n\n${out.kept}\n\n${BAIL_SYSTEM.after}`;
    expect(assembled.split('MOST RESPECTFULLY SHOWETH').length - 1).toBe(1);
    expect(assembled.split('THE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA').length - 1).toBe(1);
  });

  it('an in-order repeat with a line left out stays and raises C4', () => {
    const body = `TO,\n\nMOST RESPECTFULLY SHOWETH:\n\n${PARA_TEXT}`;
    const out = process(body, BAIL_SYSTEM, BAIL.name);
    expect(out.removed).toEqual([]);
    expect(out.kept).toBe(body);
    expect(out.findings).toContain(c4('TO,'));
  });

  it('current behaviour: a lone "Versus" above paragraph 1 is removed, it being one whole system line', () => {
    const out = removeRepeatedParts(`Versus\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    expect(out.body).toBe(PARA_TEXT);
    expect(out.removed).toEqual(['Versus']);
  });

  it("current behaviour: the applicant's name alone above paragraph 1 is removed", () => {
    const out = removeRepeatedParts(`Ramesh Mahto\n\n${PARA_TEXT}`, BAIL_SYSTEM);
    expect(out.body).toBe(PARA_TEXT);
  });
});

describe('review round 1 — withoutDisclaimerText', () => {
  const LAST = '3. That the applicant is the only earning member of his family.';

  it('takes a disclaimer line directly under the last paragraph and leaves the paragraph word for word', () => {
    const out = withoutDisclaimerText(
      `${PARAS[0]}\n\n${PARAS[1]}\n\n${LAST}\nThis is an AI-assisted draft.`,
    );
    expect(out).toBe(`${PARAS[0]}\n\n${PARAS[1]}\n\n${LAST}`);
  });

  it('takes the other disclaimer patterns the function knows from under a paragraph', () => {
    for (const line of ['DISCLAIMER: review before use.', 'Lawie does not provide legal advice.']) {
      expect(withoutDisclaimerText(`${LAST}\n${line}`)).toBe(LAST);
    }
  });

  it('takes a disclaimer block of its own', () => {
    const out = withoutDisclaimerText(`${PARA_TEXT}\n\nDISCLAIMER: this is an AI-assisted draft.`);
    expect(out).toBe(PARA_TEXT);
  });

  it('current behaviour: a numbered paragraph that is itself a disclaimer stays, with no finding', () => {
    const body = `${PARA_TEXT}\n\n4. This is an AI-assisted draft.`;
    expect(withoutDisclaimerText(body)).toBe(body);
  });

  it('leaves ordinary text untouched', () => {
    expect(withoutDisclaimerText(PARA_TEXT)).toBe(PARA_TEXT);
    expect(withoutDisclaimerText(`PRAYER\n\n${PARA_TEXT}`)).toBe(`PRAYER\n\n${PARA_TEXT}`);
  });
});

describe('review round 1 — a SYSTEM note that was the whole paragraph', () => {
  const NOTE = '[Earlier applications — SYSTEM]';
  const body = (three: string): string =>
    `${PARAS[0]}\n\n${PARAS[1]}\n\n${three}\n\n4. That the applicant undertakes to abide by every condition.`;

  it('leaves no bare "3." and no paragraph 3 in the numbers', () => {
    const out = removeRepeatedParts(body(`3. ${NOTE}`), BAIL_SYSTEM);
    expect(out.body).not.toMatch(/SYSTEM/);
    expect(out.body.split('\n').some((l) => /^\s*3[.)]\s*$/.test(l))).toBe(false);
    const numbers = paragraphNumbers(out.body);
    expect(numbers.has(3)).toBe(false);
    for (const n of [1, 2, 4]) expect(numbers.has(n)).toBe(true);
    expect(out.body).toContain(PARAS[0]);
    expect(out.body).toContain(PARAS[1]);
    expect(out.body).toContain('4. That the applicant undertakes to abide by every condition.');
    expect(out.body).not.toContain('5.');
  });

  it('keeps the number and the text when real text follows the note', () => {
    const out = removeRepeatedParts(
      body(`3. ${NOTE} That the applicant has no earlier application.`),
      BAIL_SYSTEM,
    );
    expect(out.body).toContain('3. That the applicant has no earlier application.');
    expect(paragraphNumbers(out.body).has(3)).toBe(true);
  });

  it('keeps the number when the text carries on on the next line', () => {
    const out = removeRepeatedParts(
      body(`3. ${NOTE}\nThat the applicant has no earlier application.`),
      BAIL_SYSTEM,
    );
    expect(out.body).toContain('That the applicant has no earlier application.');
    expect(paragraphNumbers(out.body).has(3)).toBe(true);
  });
});

describe('review round 2 — a bare number, a disclaimer block, emphasis around a note', () => {
  const NOTE = '[Undertakings — SYSTEM]';
  const FOUR = '4. That the applicant undertakes to abide by every condition.';
  const SUBS =
    '(a) The applicant will not abscond;\n(b) The applicant will appear on every date fixed.';
  const lineOf = (text: string, re: RegExp): boolean => text.split('\n').some((l) => re.test(l));

  describe('fix 1: the number stays where the paragraph carries on below it', () => {
    it.each([
      ['sub-points directly below', `3. ${NOTE}\n${SUBS}`],
      ['sub-points after one blank line', `3. ${NOTE}\n\n${SUBS}`],
    ])('%s: "3." stays, the sub-points follow, paragraphs 2 and 4 are untouched', (_n, three) => {
      const body = `${PARAS[0]}\n\n${PARAS[1]}\n\n${three}\n\n${FOUR}`;
      const out = removeRepeatedParts(body, BAIL_SYSTEM);
      expect(out.body).not.toMatch(/SYSTEM/);
      expect(lineOf(out.body, /^3\.\s*$/)).toBe(true);
      expect(out.body).toContain(`3.\n${three.includes('\n\n') ? '\n' : ''}${SUBS}`);
      expect(out.body).toContain(PARAS[0]);
      expect(out.body).toContain(PARAS[1]);
      expect(out.body).toContain(FOUR);
      expect(paragraphNumbers(out.body).has(3)).toBe(true);
    });

    it('a note-only paragraph with nothing under it still leaves no bare number', () => {
      const out = removeRepeatedParts(
        `${PARAS[0]}\n\n${PARAS[1]}\n\n3. ${NOTE}\n\n${FOUR}`,
        BAIL_SYSTEM,
      );
      expect(lineOf(out.body, /^\s*3[.)]\s*$/)).toBe(false);
      expect(paragraphNumbers(out.body).has(3)).toBe(false);
    });

    it('a bare "(a)" left by a note, with "(b) real text" after it, is dropped and (b) stays', () => {
      const body = `${PARAS[0]}\n\n${PARAS[1]}\n\n3. That the applicant offers these undertakings:\n(a) [Something — SYSTEM]\n(b) real text\n\n${FOUR}`;
      const out = removeRepeatedParts(body, BAIL_SYSTEM);
      expect(out.body).not.toMatch(/SYSTEM/);
      expect(lineOf(out.body, /^\s*\(a\)\s*$/)).toBe(false);
      expect(out.body).toContain('(b) real text');
      expect(out.body).toContain('3. That the applicant offers these undertakings:');
    });
  });

  describe("fix 2: withoutDisclaimerText takes a disclaimer's own lines", () => {
    const LAST = PARAS[2];
    const PLACE = 'Place: Ranchi\nDate: 01.10.2026';
    const DISC = 'This is an AI-assisted draft.';

    it('keeps Place and Date, drops the disclaimer line', () => {
      const out = withoutDisclaimerText(`${PARA_TEXT}\n\n${PLACE}\n${DISC}`);
      expect(out).toBe(`${PARA_TEXT}\n\n${PLACE}`);
    });

    it('then the kept place line is raised as C4 with the real bail system text (the code quotes the first line, then the date)', () => {
      expect(BAIL_SYSTEM.before + BAIL_SYSTEM.after).not.toContain('Ranchi');
      const cleaned = withoutDisclaimerText(`${PARA_TEXT}\n\n${PLACE}\n${DISC}`);
      const out = process(cleaned, BAIL_SYSTEM, BAIL.name);
      expect(out.kept).toBe(cleaned);
      expect(out.kept).toContain(PLACE);
      expect(out.kept).not.toMatch(/AI-assisted/);
      expect(out.findings).toContain(c4('Place: Ranchi'));
    });

    it('a sentence of facts beside a disclaimer line is kept word for word', () => {
      const facts = 'The applicant has been in custody for twenty days.';
      const out = withoutDisclaimerText(`${LAST}\n\n${facts}\n${DISC}`);
      expect(out).toBe(`${LAST}\n\n${facts}`);
    });

    it('a block that opens with "DISCLAIMER:" is dropped whole', () => {
      const out = withoutDisclaimerText(`${LAST}\n\nDISCLAIMER: review before use.\nPlace: Ranchi`);
      expect(out).toBe(LAST);
    });

    it('a block of nothing but disclaimer lines is dropped whole', () => {
      const out = withoutDisclaimerText(`${LAST}\n\n${DISC}\nLawie does not provide legal advice.`);
      expect(out).toBe(LAST);
    });
  });

  describe('fix 3: emphasis around a note', () => {
    it('"6. **[Prayer — SYSTEM]**" leaves no "6.", no "****", and 6 is not counted', () => {
      const body = `${PARA_TEXT}\n\n6. **[Prayer — SYSTEM]**\n\n${FOUR}`;
      const out = removeRepeatedParts(body, BAIL_SYSTEM);
      expect(out.body).not.toMatch(/SYSTEM/);
      expect(out.body).not.toContain('****');
      expect(lineOf(out.body, /^\s*6[.)]/)).toBe(false);
      expect(paragraphNumbers(out.body).has(6)).toBe(false);
      expect(out.body).toContain(PARA_TEXT);
    });

    it('"## [Prayer — SYSTEM]" leaves no stray "##" line', () => {
      const out = removeRepeatedParts(
        `${PARA_TEXT}\n\n## [Prayer — SYSTEM]\n\n${FOUR}`,
        BAIL_SYSTEM,
      );
      expect(out.body).not.toMatch(/SYSTEM/);
      expect(out.body).not.toContain('#');
      expect(out.body).toContain(FOUR);
    });

    it('a run of underscores is a blank and is never touched: "Name of surety: ____" beside a note keeps its blank', () => {
      const line = 'Name of surety: ____ [to be added — SYSTEM]';
      const out = removeRepeatedParts(`${PARA_TEXT}\n\n${line}\n\n${FOUR}`, BAIL_SYSTEM);
      expect(out.body).not.toMatch(/SYSTEM/);
      expect(out.body).toContain('Name of surety: ____');
    });

    it('emphasis inside ordinary text is untouched', () => {
      const para = '4. That the matter is **urgent** and the applicant is in custody.';
      const out = removeRepeatedParts(`${PARA_TEXT}\n\n${para}`, BAIL_SYSTEM);
      expect(out.body).toBe(`${PARA_TEXT}\n\n${para}`);
    });
  });
});
