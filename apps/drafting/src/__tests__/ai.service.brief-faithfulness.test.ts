/**
 * T-136 — the draft is one document and keeps the facts as given.
 *
 * The brief pipeline (`streamGenerateFromBrief`) run end to end with a stubbed
 * model and no database, on the two matters of the first quality run: a regular
 * bail application and a Section 138 notice. Every model answer here is a
 * fixture. The wording of the findings is Ajay's (handoff/design/
 * T-136-drafter-rules-signed.md, part 1 section C and part 2 D2).
 *
 * What is stubbed: the model id (no Mongo), the model transport (global.fetch,
 * an SSE stream), and the old-law lookup (no Redis, no Mongo).
 */
import './setupEnv';

import { Response } from 'express';

import { env } from '../config/env';
import { GenerationFailedError, streamGenerateFromBrief } from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import {
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { convertOldReferencesInText } from '../services/sections.service';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { signedFinding } from './t136-signed';

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

// ── The model, stubbed ──────────────────────────────────────────────────────

function sse(content: string) {
  const lines = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, Math.max(0, content.length - 40)) } }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(Math.max(0, content.length - 40)) } }] })}`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 4000, completion_tokens: 800 } })}`,
    'data: [DONE]',
  ];
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: new ReadableStream({
      pull(controller) {
        if (i < lines.length) controller.enqueue(encoder.encode(lines[i++] + '\n'));
        else controller.close();
      },
    }),
  };
}

interface Call {
  headers: Record<string, string>;
  system: string;
  user: string;
}

/** The first answer is the Drafter call, the second the repair call. */
function mockModel(...contents: string[]): { calls: Call[]; fetchMock: jest.Mock } {
  const calls: Call[] = [];
  const fetchMock = jest.fn(
    async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      const body = JSON.parse(init.body) as { messages: Array<{ content: string }> };
      calls.push({
        headers: init.headers,
        system: body.messages[0].content,
        user: body.messages[1].content,
      });
      const content = contents[calls.length - 1];
      if (content === undefined) throw new Error('no more model answers');
      return sse(content);
    },
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
}

function fakeRes() {
  const res = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false,
  };
  return {
    res: res as unknown as Response,
    /** Everything written to the browser. */
    text: () => res.write.mock.calls.map((c) => String(c[0])).join(''),
    /** The last `event: name` payload. */
    event: (name: string): Record<string, unknown> | null => {
      const blocks = res.write.mock.calls
        .map((c) => String(c[0]))
        .join('')
        .split('\n\n')
        .filter((b) => b.startsWith(`event: ${name}\n`));
      if (blocks.length === 0) return null;
      return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
    },
  };
}

// ── The briefs ──────────────────────────────────────────────────────────────

const given = (values: Array<{ key: string; value: string | string[] }>): GivenValue[] =>
  values.map((v) => ({ source: 'user' as const, ...v }));

function briefFor(kind: string, values: GivenValue[], court?: Record<string, string>) {
  const pack = loadRulePack(kind)!;
  return buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values,
    court,
  });
}

interface RunOptions {
  kind: string;
  values: GivenValue[];
  court?: Record<string, string>;
  courtData?: CourtLookupData;
  described?: string | null;
  answers: string[];
}

async function run(opts: RunOptions) {
  const pack = loadRulePack(opts.kind)!;
  const brief = briefFor(opts.kind, opts.values, opts.court);
  if (!brief.can_confirm) throw new Error(`brief cannot be confirmed: ${brief.confirm_message}`);
  const model = mockModel(...opts.answers);
  const out = fakeRes();
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig(opts.kind)!,
      brief,
      described: opts.described,
      language: 'en',
      targetParagraphs: 12,
      courtData: opts.courtData,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    out.res,
  );
  return { result, ...model, out, pack };
}

/** A clause report: "id: 1" for every clause of the pack, with overrides. */
function answer(
  pack: { mandatoryClauses: Array<{ id: string }> },
  body: string,
  overrides: Record<string, string> = {},
) {
  const lines = pack.mandatoryClauses.map((c) => `${c.id}: ${overrides[c.id] ?? '1'}`).join('\n');
  return `${body}\n\n${CLAUSES_MARKER}\n${lines}`;
}

const messages = (r: { result: { warnings: Array<{ message: string }> } }): string[] =>
  r.result.warnings.map((w) => w.message);

const bodyOf = (r: {
  result: { sections: Array<{ section_id: string; content: string }> };
}): string => r.result.sections.find((s) => s.section_id === 'body')!.content;

/** The signed wording of the findings (part 1 C, part 2 D2). */
const C1 = (date: string, what: string) =>
  `Your brief has a date the draft does not use: ${date} (${what}). Add it or check the draft.`;
/**
 * The signed template is "{label}: {value}. Add it or check the draft." The
 * template supplies the full stop after the value, so a value that ends in a
 * full stop is passed here without it: the finding prints one, not two. The
 * wording comes from the signed file; no rule of the code is repeated here.
 */
const C2 = (label: string, valueWithoutFinalStop: string) =>
  signedFinding('C2', { label, value: valueWithoutFinalStop });
const C3 = (period: string) =>
  `The draft states a period that is not in your brief: ${period}. Check it before use.`;
const C4 = (line: string) =>
  `The draft has a part that may not belong: "${line}". Check that the draft is one document.`;
const D2 = (date: string) =>
  `Your description has a date the draft does not use: ${date}. If you changed this date on the brief, ignore this. Otherwise add it or check the draft.`;

// ── Matter 1: regular bail ──────────────────────────────────────────────────

const BAIL = loadRulePack('bail_regular')!;
const GROUND = buildChecklist(BAIL).find((i) => i.key === 'grounds_for_bail')!.options![2];

/** The description as the advocate typed it. The rejection date is written as a person writes it. */
const BAIL_DESCRIBED =
  'My client Ramesh Mahto, son of Shri Suresh Mahto, aged 34, resident of Village Karmatand, PS Saraidhela, Dhanbad, was arrested on 12.09.2026 in FIR No. 214/2026 of Saraidhela PS dated 10.09.2026 under section 303 BNS. He has been in judicial custody since 13.09.2026 and is lodged in Dhanbad Divisional Jail. His earlier bail application was rejected by the JMFC, Dhanbad on 22nd Sept 2026. He is the only earning member of his family. We need regular bail from the Sessions Court.';

const BAIL_VALUES = given([
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
]);

const COURT = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };
const PATNA: CourtLookupData = {
  designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
  city: 'Patna',
  caseNomenclature: '',
  formattingRulesRef: 'bihar_district',
  courtType: 'sessions',
  courtRule: loadCourtRule('bihar_district') ?? undefined,
};

const bail = (over: Partial<RunOptions> & { answers: string[] }) =>
  run({
    kind: 'bail_regular',
    values: BAIL_VALUES,
    court: COURT,
    courtData: PATNA,
    described: BAIL_DESCRIBED,
    ...over,
  });

const PARA_1 =
  '1. That FIR No. 214/2026 dated 10.09.2026 was registered at PS Saraidhela under Section 303 of BNS against the applicant Ramesh Mahto, son of Shri Suresh Mahto.';
const PARA_ARREST =
  '2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026. He is lodged in Dhanbad Divisional Jail.';
const PARA_REJECTED =
  '3. That an earlier bail application of the applicant was rejected by the JMFC, Dhanbad on 22nd Sept 2026.';
const PARA_EARNER = '4. That the applicant is the only earning member of his family.';
const PARA_UNDERTAKING =
  "5. That the applicant undertakes that, if released on bail, he will not abscond, will not tamper with the evidence, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.";
const CLEAN_BAIL = [PARA_1, PARA_ARREST, PARA_REJECTED, PARA_EARNER, PARA_UNDERTAKING].join('\n\n');

/** The advocate's own brief also carries the rejection, so every date of the description is on it. */
const BAIL_VALUES_WITH_REJECTION = [
  ...BAIL_VALUES,
  ...given([
    {
      key: 'additional_context',
      value: 'His earlier bail application was rejected by the JMFC, Dhanbad on 22.09.2026.',
    },
  ]),
];

const STITCHED_BAIL = `IN THE COURT OF THE SESSIONS JUDGE, DHANBAD

BAIL APPLICATION NO. ____ OF 2026

Ramesh Mahto ... Applicant
Versus
State of Jharkhand ... Respondent

AFFIDAVIT IN SUPPORT OF BAIL APPLICATION

TO,
THE HONOURABLE DISTRICT & SESSIONS JUDGE, PATNA,
Patna

MOST RESPECTFULLY SHOWETH:

1. That the applicant Ramesh Mahto, son of Shri Suresh Mahto, has been falsely implicated in FIR No. 214/2026 dated 10.09.2026 registered at PS Saraidhela under Section 303 of BNS due to mistaken identity and/or enmity with the informant.

2. That the applicant was picked up by the police on 13.09.2026 and has been in custody for approximately three days.

3. That the applicant has deep roots in the community and is cooperating fully with the investigation. Custodial interrogation is no longer required.

4. That the applicant undertakes to abide by every condition this Hon'ble Court may impose.

PRAYER

It is therefore prayed that this Hon'ble Court may be pleased to grant bail to the applicant.

VERIFICATION

I, Ramesh Mahto, do hereby verify that the contents above are true.

DEPONENT

[Advocate Signature Block — SYSTEM]`;

const STITCHED_NUMBERED = [
  '1. That the applicant Ramesh Mahto, son of Shri Suresh Mahto, has been falsely implicated in FIR No. 214/2026 dated 10.09.2026 registered at PS Saraidhela under Section 303 of BNS due to mistaken identity and/or enmity with the informant.',
  '2. That the applicant was picked up by the police on 13.09.2026 and has been in custody for approximately three days.',
  '3. That the applicant has deep roots in the community and is cooperating fully with the investigation. Custodial interrogation is no longer required.',
  "4. That the applicant undertakes to abide by every condition this Hon'ble Court may impose.",
];

// ── Matter 2: Section 138 notice ────────────────────────────────────────────

const NOTICE = loadRulePack('legal_notice_s138')!;
/** The memo date, 10.08.2026, is only in the description. */
const NOTICE_DESCRIBED =
  "My client Sunita Devi gave a hand loan of Rs. 5,00,000 to Rajesh Kumar Singh of Hirapur, Dhanbad in January 2026. He issued cheque no. 004512 dated 01.08.2026 for Rs. 5,00,000 drawn on State Bank of India, Hirapur Branch. It was presented on 05.08.2026 and returned unpaid on 07.08.2026 for insufficient funds. My client received the bank's return memo on 10.08.2026.";

const NOTICE_VALUES = given([
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
]);

const NOTICE_REPORT = {
  demand_15_days: 'SYSTEM',
  consequence_warning: 'SYSTEM',
  advocate_details: 'SYSTEM',
};

const notice = (over: Partial<RunOptions> & { answers: string[] }) =>
  run({ kind: 'legal_notice_s138', values: NOTICE_VALUES, described: NOTICE_DESCRIBED, ...over });

const NOTICE_PARAS = [
  '1. That my client Sunita Devi, resident of Bank More, Dhanbad, advanced to you a hand loan of Rs. 5,00,000 in January 2026.',
  '2. That towards discharge of the said liability you issued Cheque No. 004512 dated 01.08.2026 for Rs. 5,00,000 drawn on State Bank of India, Hirapur Branch.',
  '3. That the said cheque was presented on 05.08.2026 and was returned dishonoured on 07.08.2026 with the endorsement "Funds Insufficient". My client received the bank\'s return memo on 10.08.2026.',
];
const noticeBody = (last: string) => [...NOTICE_PARAS, last].join('\n\n');
const CLEAN_NOTICE = noticeBody(
  '4. That the law allows you 15 (fifteen) days from the receipt of this notice to make the payment.',
);

const STITCHED_NOTICE_PARAS = [
  '1. That my client Sunita Devi, resident of Bank More, Dhanbad, advanced a hand loan of Rs. 5,00,000 to you in January 2026.',
  '2. That you issued Cheque No. 004512 dated 01.08.2026 for Rs. 5,00,000 drawn on State Bank of India, Hirapur Branch.',
  '3. That the cheque was presented on 05.08.2026 and returned unpaid on 07.08.2026 with the remark "Funds Insufficient".',
  '4. You are hereby called upon to pay the said amount within 15 days of receipt of this notice.',
];
const STITCHED_NOTICE = `LEGAL NOTICE

TO WHOM IT MAY CONCERN

To,
Rajesh Kumar Singh
Hirapur, Dhanbad

From,
Sunita Devi
Through her Advocate

Sir,

${STITCHED_NOTICE_PARAS.join('\n\n')}

DEMAND

You are hereby called upon to pay Rs. 5,00,000 within fifteen (15) days, failing which criminal proceedings shall be initiated.

Yours faithfully,

[Advocate Signature Block — SYSTEM]

Yours faithfully,
Advocate`;

// ── Set-up ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  env.HELICONE_API_KEY = 'test-helicone-key';
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Matter 1: regular bail
// ═══════════════════════════════════════════════════════════════════════════

describe('T-136 — regular bail, the stitched draft (criteria 7 and 9)', () => {
  it('keeps every numbered paragraph, never prints SYSTEM, and shows each stitched part as one document or a C4', async () => {
    const r = await bail({ answers: [answer(BAIL, STITCHED_BAIL)] });
    const full = r.result.fullText;

    for (const para of STITCHED_NUMBERED) expect(bodyOf(r)).toContain(para);
    expect(full).not.toMatch(/\[[^\]]*SYSTEM[^\]]*\]/);
    expect(full).not.toContain('SYSTEM');
    expect(bodyOf(r)).not.toContain('SYSTEM');

    // Each stitched part is gone (it repeated the system's own part exactly) or it is a C4.
    const stitchedParts = [
      'IN THE COURT OF THE SESSIONS JUDGE, DHANBAD',
      'Ramesh Mahto ... Applicant',
      'AFFIDAVIT IN SUPPORT OF BAIL APPLICATION',
      'PRAYER',
      'VERIFICATION',
      'DEPONENT',
    ];
    const found = messages(r);
    for (const line of stitchedParts) {
      const inBody = bodyOf(r).includes(line);
      if (inBody) expect(found).toContain(C4(line));
    }
    // A court name that differs from the system's is a mismatch the advocate must see: it stays and C4 is raised.
    expect(bodyOf(r)).toContain('IN THE COURT OF THE SESSIONS JUDGE, DHANBAD');
    expect(found).toContain(C4('IN THE COURT OF THE SESSIONS JUDGE, DHANBAD'));
    expect(found).toContain(C4('AFFIDAVIT IN SUPPORT OF BAIL APPLICATION'));
    expect(found).toContain(C4('DEPONENT'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('removes an exact repeat of a part of the system, so that it stands once', async () => {
    const first = await bail({ answers: [answer(BAIL, CLEAN_BAIL)] });
    const addressing = first.result.sections.find(
      (s) => s.section_id === 'addressing_clause',
    )!.content;
    expect(addressing).toContain('THE HONOURABLE');
    const repeat = addressing.trim();

    const r = await bail({ answers: [answer(BAIL, `${repeat}\n\n${CLEAN_BAIL}`)] });
    expect(bodyOf(r)).not.toContain(repeat);
    const printed = r.result.sections.map((s) => s.content).join('\n\n');
    expect(printed.split(repeat)).toHaveLength(2);
    // The body is what it was before the repeat; nothing numbered was lost.
    expect(bodyOf(r)).toBe(CLEAN_BAIL);
    expect(messages(r).some((m) => m.includes('may not belong: "TO,'))).toBe(false);
  });

  it('removes a note that marks the place of a system part, and any SYSTEM in square brackets', async () => {
    const r = await bail({
      answers: [
        answer(BAIL, `${CLEAN_BAIL}\n\n[Prayer — SYSTEM]\n\n[Advocate Signature Block — SYSTEM]`),
      ],
    });
    expect(r.result.fullText).not.toContain('SYSTEM');
    for (const para of CLEAN_BAIL.split('\n\n')) expect(bodyOf(r)).toContain(para);
  });
});

describe('T-136 — regular bail, the facts as given (criteria 6 and 9)', () => {
  it('a moved date: the arrest date 12.09.2026 is not used, so C1 is raised with the signed wording', async () => {
    const body = [
      PARA_1,
      '2. That the applicant was picked up by the police on 13.09.2026 and has been in judicial custody. He is lodged in Dhanbad Divisional Jail.',
      PARA_REJECTED,
      PARA_EARNER,
      PARA_UNDERTAKING,
    ].join('\n\n');
    const r = await bail({ answers: [answer(BAIL, body)] });
    expect(messages(r)).toContain(C1('12.09.2026', 'Date of arrest'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('a missing date: the earlier rejection that only the description gives raises D2, as the advocate typed the date', async () => {
    const body = [PARA_1, PARA_ARREST, PARA_EARNER, PARA_UNDERTAKING].join('\n\n');
    const r = await bail({ answers: [answer(BAIL, body)] });
    expect(messages(r)).toContain(D2('22nd Sept 2026'));
    // It is not on the brief the advocate saw, so it is not a C1.
    expect(
      messages(r).some((m) => m.startsWith('Your brief has a date the draft does not use: 22')),
    ).toBe(false);
    expect(r.result.startingDraft).toBe(true);
  });

  it('a date that is on the brief and left out raises C1 for it', async () => {
    const body = [PARA_1, PARA_ARREST, PARA_EARNER, PARA_UNDERTAKING].join('\n\n');
    const r = await bail({ values: BAIL_VALUES_WITH_REJECTION, answers: [answer(BAIL, body)] });
    expect(
      messages(r).some((m) =>
        m.startsWith('Your brief has a date the draft does not use: 22.09.2026 ('),
      ),
    ).toBe(true);
    expect(messages(r)).toContain(
      C2(
        'Anything else the court should know? (optional)',
        'His earlier bail application was rejected by the JMFC, Dhanbad on 22.09.2026',
      ),
    );
  });

  it('a missing fact: "only earning member" and the jail name each raise C2 with the signed wording', async () => {
    const body = [
      PARA_1,
      '2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026.',
      PARA_REJECTED,
      PARA_UNDERTAKING,
    ].join('\n\n');
    const r = await bail({ answers: [answer(BAIL, body)] });
    const label = 'Brief Facts of the Case (3-5 lines)';
    expect(messages(r)).toContain(C2(label, 'He is the only earning member of his family'));
    expect(messages(r)).toContain(C2(label, 'He is lodged in Dhanbad Divisional Jail'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('a worked-out period: "approximately three days" raises C3 naming it as written', async () => {
    const body = [
      PARA_1,
      '2. That the applicant was arrested on 12.09.2026 and has been in judicial custody since 13.09.2026, in custody for approximately three days. He is lodged in Dhanbad Divisional Jail.',
      PARA_REJECTED,
      PARA_EARNER,
      PARA_UNDERTAKING,
    ].join('\n\n');
    const r = await bail({ answers: [answer(BAIL, body)] });
    expect(messages(r)).toContain(C3('three days'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('the stitched draft raises C1, D2, C2 and C3 together, each with the signed wording', async () => {
    const r = await bail({ answers: [answer(BAIL, STITCHED_BAIL)] });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        C1('12.09.2026', 'Date of arrest'),
        D2('22nd Sept 2026'),
        C2('Brief Facts of the Case (3-5 lines)', 'He is the only earning member of his family'),
        C2('Brief Facts of the Case (3-5 lines)', 'He is lodged in Dhanbad Divisional Jail'),
        C3('three days'),
      ]),
    );
  });

  it('a clean draft raises none of C1, C2, C3, C4 or D2; the only finding is the older check on a date that only the description gives', async () => {
    const r = await bail({ answers: [answer(BAIL, CLEAN_BAIL)] });
    const found = messages(r);
    expect(
      found.filter((m) => m.startsWith('Your brief has a date the draft does not use')),
    ).toEqual([]);
    expect(
      found.filter((m) => m.startsWith('Your description has a date the draft does not use')),
    ).toEqual([]);
    expect(found.filter((m) => m.startsWith('We could not find this from your brief'))).toEqual([]);
    expect(found.filter((m) => m.startsWith('The draft states a period'))).toEqual([]);
    expect(found.filter((m) => m.startsWith('The draft has a part that may not belong'))).toEqual(
      [],
    );
    // The older check (T-106) reads only the brief: it still flags a date that only the description gives.
    expect(found).toEqual([
      'The draft has a date that is not in your brief: 22.09.2026. Check it before use.',
    ]);
    expect(bodyOf(r)).toBe(CLEAN_BAIL);
  });

  it('a clean draft with every date on the brief raises no finding and carries no label', async () => {
    const r = await bail({
      values: BAIL_VALUES_WITH_REJECTION,
      answers: [answer(BAIL, CLEAN_BAIL.replace('22nd Sept 2026', '22.09.2026'))],
    });
    expect(messages(r)).toEqual([]);
    expect(r.result.startingDraft).toBe(false);
    expect(r.result.missingClauses).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Matter 2: Section 138 notice
// ═══════════════════════════════════════════════════════════════════════════

describe('T-136 — Section 138 notice (criteria 7 and 9)', () => {
  it('a stitched notice: numbered paragraphs kept, SYSTEM never saved, each stitched part a C4', async () => {
    const r = await notice({ answers: [answer(NOTICE, STITCHED_NOTICE, NOTICE_REPORT)] });
    const found = messages(r);

    expect(r.result.fullText).not.toContain('SYSTEM');
    for (const para of STITCHED_NOTICE_PARAS) expect(bodyOf(r)).toContain(para);
    for (const line of [
      'LEGAL NOTICE',
      'TO WHOM IT MAY CONCERN',
      'To,',
      'From,',
      'Sir,',
      'DEMAND',
      'Yours faithfully,',
    ]) {
      // Either the part is gone from the body or it is a C4 for it.
      if (bodyOf(r).includes(line)) expect(found).toContain(C4(line));
    }
    // The parts the system does not write stay and are reported.
    expect(found).toContain(C4('TO WHOM IT MAY CONCERN'));
    expect(found).toContain(C4('DEMAND'));
    expect(found).toContain(C4('Yours faithfully,'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('the 15 days of a section 138 notice is not a C3, in any of its forms', async () => {
    const forms = [
      '4. You are called upon to pay within 15 days of receipt of this notice.',
      '4. You are called upon to pay within fifteen (15) days of receipt of this notice.',
      '4. You are called upon to pay within 15 (fifteen) days of receipt of this notice.',
    ];
    for (const last of forms) {
      const r = await notice({ answers: [answer(NOTICE, noticeBody(last), NOTICE_REPORT)] });
      expect(messages(r).filter((m) => m.startsWith('The draft states a period'))).toEqual([]);
    }
  });

  it('the stitched notice has the 15 days twice and still no C3', async () => {
    const r = await notice({ answers: [answer(NOTICE, STITCHED_NOTICE, NOTICE_REPORT)] });
    expect(messages(r).filter((m) => m.startsWith('The draft states a period'))).toEqual([]);
  });

  it('a period the draft works out ("after 12 days") is a C3', async () => {
    const body = noticeBody(
      '4. That this notice is sent after 12 days of the memo being received.',
    );
    const r = await notice({ answers: [answer(NOTICE, body, NOTICE_REPORT)] });
    expect(messages(r)).toContain(C3('12 days'));
  });

  it('the memo date that only the description gives, left out, raises D2', async () => {
    const body = noticeBody(
      '4. That the law allows you 15 (fifteen) days from the receipt of this notice to make the payment.',
    ).replace(" My client received the bank's return memo on 10.08.2026.", '');
    const r = await notice({ answers: [answer(NOTICE, body, NOTICE_REPORT)] });
    expect(messages(r)).toContain(D2('10.08.2026'));
    expect(r.result.startingDraft).toBe(true);
  });

  it('a clean notice that uses the memo date raises no D2, C1, C2, C3 or C4', async () => {
    const r = await notice({ answers: [answer(NOTICE, CLEAN_NOTICE, NOTICE_REPORT)] });
    const found = messages(r);
    for (const start of [
      'Your description has a date',
      'Your brief has a date',
      'We could not find this from your brief',
      'The draft states a period',
      'The draft has a part that may not belong',
    ]) {
      expect(found.filter((m) => m.startsWith(start))).toEqual([]);
    }
    // The older check (T-106) reads only the brief: the memo date is only in the description.
    expect(found).toEqual([
      'The draft has a date that is not in your brief: 10.08.2026. Check it before use.',
    ]);
  });

  it('with the demand and the warning reported SYSTEM and the rest covered, no repair call is made', async () => {
    const { calls, fetchMock, result } = await notice({
      answers: [answer(NOTICE, CLEAN_NOTICE, NOTICE_REPORT)],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(result.missingClauses).toEqual([]);
    expect(result.repaired).toBe(false);
    expect(
      result.warnings.some((w) => w.type === 'missing_clause' && /does not cover/.test(w.message)),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// What both calls are given (criteria 1, 2, 3)
// ═══════════════════════════════════════════════════════════════════════════

/** The text between a block heading and the next, as the prompt prints them. */
function blockOf(prompt: string, name: string, next: string): string {
  const from = prompt.indexOf(`\n\n${name}`);
  const to = prompt.indexOf(`\n\n${next}`, from + 1);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return prompt.slice(from + 2, to);
}

/** The BRIEF block of a prompt, parsed. */
function briefIn(prompt: string): Record<string, unknown> {
  const from = prompt.indexOf('BRIEF:\n') + 'BRIEF:\n'.length;
  const to = prompt.indexOf('\n\nCLAUSES', from);
  return JSON.parse(prompt.slice(from, to)) as Record<string, unknown>;
}

describe('T-136 — what the Drafter is given, on both calls (criteria 1, 2, 3)', () => {
  async function repairRun() {
    return bail({
      answers: [
        answer(BAIL, CLEAN_BAIL.split('\n\n').slice(0, 4).join('\n\n'), {
          no_flight_risk: 'MISSING',
        }),
        answer(BAIL, `${CLEAN_BAIL}\n\nPRAYER\n\n[Prayer — SYSTEM]`, { no_flight_risk: '5' }),
      ],
    });
  }

  it('the first call carries the signed prompt and the second the signed repair prompt', async () => {
    const r = await repairRun();
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0].system).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
    expect(r.calls[1].system).toBe(DRAFTER_REPAIR_SYSTEM_PROMPT);
    expect(r.result.repaired).toBe(true);
  });

  it('both user prompts hold the same SYSTEM PARTS, BEFORE YOUR TEXT and AFTER YOUR TEXT, with the real text of the parts', async () => {
    const r = await repairRun();
    const [first, second] = [r.calls[0].user, r.calls[1].user];
    const a = blockOf(first, 'SYSTEM PARTS:', 'TARGET:');
    const b = blockOf(second, 'SYSTEM PARTS:', 'LANGUAGE:');
    expect(a).toBe(b);
    expect(a).toContain('BEFORE YOUR TEXT:');
    expect(a).toContain('AFTER YOUR TEXT:');
    // What stands above the Drafter's text: the court's name line. What follows it: the prayer heading.
    const before = a.slice(a.indexOf('BEFORE YOUR TEXT:'), a.indexOf('AFTER YOUR TEXT:'));
    const after = a.slice(a.indexOf('AFTER YOUR TEXT:'));
    expect(before).toContain('IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA');
    expect(before).toContain('MOST RESPECTFULLY SHOWETH');
    expect(after).toContain('PRAYER');
    expect(after).toContain('VERIFICATION');
    expect(after).toContain('Ramesh Mahto');
  });

  it('both carry DOCUMENT and COURT RULE, and the repair prompt carries its own blocks', async () => {
    const r = await repairRun();
    for (const call of r.calls) {
      expect(call.user.startsWith('DOCUMENT: ')).toBe(true);
      expect(call.user).toContain('\n\nCOURT RULE:\n');
    }
    const second = r.calls[1].user;
    for (const heading of [
      'BRIEF:\n',
      'CLAUSES (id | title',
      'INSTRUCTIONS:\n',
      'ACTS:\n',
      'LANGUAGE: en',
      'DOCUMENT TEXT:\n',
      'MISSING: no_flight_risk',
    ]) {
      expect(second).toContain(heading);
    }
  });

  it('the description reaches both calls under "described", as typed and in full', async () => {
    const r = await repairRun();
    for (const call of r.calls) expect(briefIn(call.user).described).toBe(BAIL_DESCRIBED);
    // The advocate's own date, as typed: not rewritten.
    expect(r.calls[0].user).toContain('22nd Sept 2026');
  });

  it("the repair prompt's DOCUMENT TEXT is the cleaned text: no SYSTEM in brackets, no repeated heading", async () => {
    const r = await bail({
      answers: [
        answer(
          BAIL,
          `${CLEAN_BAIL.split('\n\n').slice(0, 4).join('\n\n')}\n\n[Advocate Signature Block — SYSTEM]`,
          { no_flight_risk: 'MISSING' },
        ),
        answer(BAIL, CLEAN_BAIL, { no_flight_risk: '5' }),
      ],
    });
    const text = r.calls[1].user.slice(r.calls[1].user.indexOf('DOCUMENT TEXT:\n'));
    const documentText = text.slice(text.indexOf('<document>'), text.indexOf('</document>'));
    expect(documentText).toContain('1. That FIR No. 214/2026');
    expect(documentText).not.toContain('SYSTEM');
  });

  it('with no description given, "described" is null and the run works', async () => {
    const r = await bail({ described: null, answers: [answer(BAIL, CLEAN_BAIL)] });
    expect(r.calls[0].user).toContain('"described": null');
    expect(briefIn(r.calls[0].user).described).toBeNull();
    expect(r.result.fullText).toContain(PARA_1);
    // Without it, nothing is read from a description: no D2.
    expect(messages(r).filter((m) => m.startsWith('Your description has a date'))).toEqual([]);

    const none = await bail({ described: undefined, answers: [answer(BAIL, CLEAN_BAIL)] });
    expect(briefIn(none.calls[0].user).described).toBeNull();
  });

  it('a Section 138 notice is given its system text and its description too', async () => {
    const r = await notice({ answers: [answer(NOTICE, CLEAN_NOTICE, NOTICE_REPORT)] });
    expect(briefIn(r.calls[0].user).described).toBe(NOTICE_DESCRIBED);
    const block = blockOf(r.calls[0].user, 'SYSTEM PARTS:', 'TARGET:');
    expect(block).toContain('BEFORE YOUR TEXT:');
    expect(block).toContain('AFTER YOUR TEXT:\nDEMAND');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Protection of the description (criterion 8)
// ═══════════════════════════════════════════════════════════════════════════

describe("T-136 — the description is kept out of logs, events and the model vendor's store (criterion 8)", () => {
  const MARKER = 'Purple heron over Tilaiya dam at dawn.';
  const MARKED = `${BAIL_DESCRIBED} ${MARKER}`;

  function spyOnConsole() {
    return (['error', 'info', 'log', 'warn'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
  }
  const logged = (spies: jest.SpyInstance[]): string =>
    spies
      .flatMap((s) => s.mock.calls)
      .flat()
      .map((a) =>
        a instanceof Error
          ? `${a.name} ${a.message} ${a.stack}`
          : typeof a === 'string'
            ? a
            : JSON.stringify(a),
      )
      .join('\n');

  it('both model calls ask Helicone to keep neither the request nor the answer', async () => {
    const r = await bail({
      described: MARKED,
      answers: [
        answer(BAIL, CLEAN_BAIL.split('\n\n').slice(0, 4).join('\n\n'), {
          no_flight_risk: 'MISSING',
        }),
        answer(BAIL, CLEAN_BAIL, { no_flight_risk: '5' }),
      ],
    });
    expect(r.calls).toHaveLength(2);
    for (const call of r.calls) {
      expect(call.headers['Helicone-Omit-Request']).toBe('true');
      expect(call.headers['Helicone-Omit-Response']).toBe('true');
      expect(call.user).toContain(MARKER);
    }
  });

  it('a successful run writes no log line with the description, and echoes it in no event', async () => {
    const spies = spyOnConsole();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const r = await bail({ described: MARKED, answers: [answer(BAIL, CLEAN_BAIL)] });
      expect(logged(spies)).not.toContain(MARKER);
      expect(logged(spies)).not.toContain('earlier bail application was rejected');
      expect(r.out.text()).not.toContain(MARKER);
      expect(r.out.text()).not.toContain('We need regular bail from the Sessions Court');
      expect(JSON.stringify(r.result)).not.toContain(MARKER);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('a run where the model call fails writes no log line and no error event with the description', async () => {
    const spies = spyOnConsole();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const out = fakeRes();
    try {
      const pack = BAIL;
      await expect(
        streamGenerateFromBrief(
          {
            pack,
            templateConfig: loadTemplateConfig('bail_regular')!,
            brief: briefFor('bail_regular', BAIL_VALUES, COURT),
            described: MARKED,
            language: 'en',
            targetParagraphs: 12,
            courtData: PATNA,
            userId: 'u1',
            runId: 'r1',
            runSequence: 1,
            runType: 'initial',
          },
          out.res,
        ),
      ).rejects.toBeInstanceOf(GenerationFailedError);
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(fetchMock).toHaveBeenCalled();
    expect(out.event('error')).not.toBeNull();
    expect(out.text()).not.toContain(MARKER);
    expect(logged(spies)).not.toContain(MARKER);
    expect(logged(spies)).not.toContain('earlier bail application was rejected');
    // With logging on, the failure is still logged, by ids and error name only.
    expect(logged(spies)).toContain('Drafter stream failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Review round 1
// ═══════════════════════════════════════════════════════════════════════════

describe('T-136 review round 1 — lines of the system re-paired are kept and raised (criterion 7)', () => {
  it('the notice with "To, Sunita Devi, From, Rajesh Kumar Singh" above paragraph 1: kept, and C4 names the lines', async () => {
    const above = 'To,\n\nSunita Devi\n\nFrom,\n\nRajesh Kumar Singh';
    const r = await notice({
      answers: [answer(NOTICE, `${above}\n\n${CLEAN_NOTICE}`, NOTICE_REPORT)],
    });
    expect(bodyOf(r)).toBe(`${above}\n\n${CLEAN_NOTICE}`);
    for (const para of CLEAN_NOTICE.split('\n\n')) expect(bodyOf(r)).toContain(para);
    for (const line of ['To,', 'Sunita Devi', 'From,', 'Rajesh Kumar Singh']) {
      expect(messages(r)).toContain(C4(line));
    }
    expect(r.result.startingDraft).toBe(true);
  });

  it('the bail draft with the State made the applicant: kept, and C4 names the lines', async () => {
    const above =
      'State of Bihar\n\n... Applicant\n\nVersus\n\nRamesh Mahto\n\n... Opposite Party';
    const r = await bail({ answers: [answer(BAIL, `${above}\n\n${CLEAN_BAIL}`)] });
    expect(bodyOf(r)).toBe(`${above}\n\n${CLEAN_BAIL}`);
    for (const line of [
      'State of Bihar',
      'Versus',
      'Ramesh Mahto',
      '... Opposite Party',
    ]) {
      expect(messages(r)).toContain(C4(line));
    }
    expect(r.result.startingDraft).toBe(true);
  });

  it('"TO," over the applicant: kept, and C4 names both lines', async () => {
    const r = await bail({ answers: [answer(BAIL, `TO,\n\nRamesh Mahto\n\n${CLEAN_BAIL}`)] });
    expect(bodyOf(r)).toBe(`TO,\n\nRamesh Mahto\n\n${CLEAN_BAIL}`);
    expect(messages(r)).toContain(C4('TO,'));
    expect(messages(r)).toContain(C4('Ramesh Mahto'));
  });
});

describe('T-136 review round 1 — a paragraph that held only a SYSTEM note (criterion 7)', () => {
  const withNote = [
    PARA_1,
    PARA_ARREST,
    '3. [Earlier applications — SYSTEM]',
    PARA_EARNER,
    PARA_UNDERTAKING,
  ].join('\n\n');

  it('is not counted as the paragraph that covers the clause: the repair call runs and no bare "3." is saved', async () => {
    const r = await bail({
      answers: [
        answer(BAIL, withNote, { earlier_applications: '3' }),
        answer(BAIL, CLEAN_BAIL, { earlier_applications: '3' }),
      ],
    });
    expect(r.fetchMock).toHaveBeenCalledTimes(2);
    expect(r.result.repaired).toBe(true);
    expect(r.result.fullText).not.toContain('SYSTEM');
    // The text sent for repair has no bare number either.
    const sent = r.calls[1].user;
    expect(sent.split('\n').some((l) => /^\s*3[.)]\s*$/.test(l))).toBe(false);
  });

  it('with no repair kept the clause is raised as not covered and no bare "3." is saved', async () => {
    const r = await bail({
      answers: [
        answer(BAIL, withNote, { earlier_applications: '3' }),
        answer(BAIL, withNote, { earlier_applications: '3' }),
      ],
    });
    expect(r.fetchMock).toHaveBeenCalledTimes(2);
    expect(
      bodyOf(r)
        .split('\n')
        .some((l) => /^\s*3[.)]\s*$/.test(l)),
    ).toBe(false);
    expect(bodyOf(r)).not.toContain('SYSTEM');
    expect(r.result.missingClauses.map((m) => m.id)).toContain('earlier_applications');
  });
});

describe('T-136 review round 1 — C2 with a value that ends in a full stop (criterion 5)', () => {
  it('prints the value and one full stop, in the signed wording, literally', async () => {
    const body = [PARA_1, PARA_ARREST, PARA_REJECTED, PARA_UNDERTAKING].join('\n\n');
    const r = await bail({ answers: [answer(BAIL, body)] });
    expect(messages(r)).toContain(
      'We could not find this from your brief in the draft: Brief Facts of the Case (3-5 lines): He is the only earning member of his family. Add it or check the draft.',
    );
    expect(messages(r).some((m) => m.includes('family.. '))).toBe(false);
  });
});

describe('T-136 review round 1 — old-law references in a regular bail brief (part 2, condition 4)', () => {
  const OLD = [
    ...BAIL_VALUES.filter((v) => v.key !== 'sections_charged'),
    ...given([{ key: 'sections_charged', value: ['379 IPC'] }]),
  ];

  beforeEach(() => {
    (convertOldReferencesInText as jest.Mock).mockClear();
    (convertOldReferencesInText as jest.Mock).mockImplementation(async (text: string) => ({
      converted: text.replace(/379 IPC/g, 'Section 303 BNS (converted)'),
      conversions: [{ from: '379 IPC', to: '303 BNS' }],
    }));
  });
  afterEach(() => {
    (convertOldReferencesInText as jest.Mock).mockImplementation(async (text: string) => ({
      converted: text,
      conversions: [],
    }));
  });

  it('what the code does today: the BRIEF block of the first call holds the reference as the advocate gave it', async () => {
    const r = await bail({ values: OLD, answers: [answer(BAIL, CLEAN_BAIL)] });
    const first = r.calls[0].user;
    const brief: Record<string, unknown> = { ...briefIn(first), described: undefined };
    const numbers = brief.numbers as Array<{ key: string; value: unknown }>;
    expect(numbers.find((n) => n.key === 'sections_charged')?.value).toEqual(['379 IPC']);
    // No converted number anywhere in the brief (the description is the advocate's own text and is left out).
    expect(JSON.stringify(brief)).not.toContain('converted');
    expect(JSON.stringify(brief)).not.toContain('303');
    // Pinned as observed: a list value is not passed to the converter.
    expect(convertOldReferencesInText).not.toHaveBeenCalledWith(expect.stringContaining('379'));
  });
});

describe('T-136 review round 2 — a place line beside the disclaimer (criterion 7)', () => {
  it('keeps the Place and Date lines, drops the disclaimer line, and C4 names the kept place line', async () => {
    const tail = 'Place: Ranchi\nDate: 01.10.2026\nThis is an AI-assisted draft.';
    const r = await bail({ answers: [answer(BAIL, `${CLEAN_BAIL}\n\n${tail}`)] });
    expect(bodyOf(r)).toContain('Place: Ranchi\nDate: 01.10.2026');
    expect(bodyOf(r)).not.toMatch(/AI-assisted/);
    expect(bodyOf(r)).toContain(CLEAN_BAIL);
    expect(messages(r)).toContain(C4('Place: Ranchi'));
  });
});
