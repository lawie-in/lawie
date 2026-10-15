/**
 * T-236 (Ajay's ruling, 15 Oct 2026): the mandatory clauses are checked again
 * after a case citation is removed. A clause the removal took the cue from is
 * reported through the existing missing-clause channel, with no model call and
 * no second repair pass. Both removals of the brief drafter: the first, and the
 * one after the fact verifier. End to end through POST /generate-from-brief
 * with a mocked model, as t147e and t200-repair-end-to-end do.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

// The legacy text-stream path (as t147e): the signed skeletons are pinned off.
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: () => null,
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd7994390e6';
const MODEL = 'claude-sonnet-4-5-20250929';
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const COURT = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };

// ── The wording, pinned in ONE place (Ajay is still to confirm it) ─────────
const PLAIN = (title: string) => `This draft does not cover "${title}". Add it before use.`;
const REMOVAL = (title: string) =>
  `${PLAIN(title)} Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`;

const titleOf = (id: string) => PACK.mandatoryClauses.find((c) => c.id === id)!.title;

// The citation carries the only "undertak" of the draft (no_flight_risk's cue),
// in the second party's name, so removing it takes the clause's cue with it. The
// parties are the applicant and his father (so the fact verifier does not flag
// them) and the reporter is "All" (a word the verifier reads as common), so the
// citation passes the fact verifier and only the removal strips it.
const CITATION = 'Ram Kumar v. Undertaking Hari Kumar (2026) 5 All 10';
const BLANK = '[Authority — add if relied upon]';

const BASE =
  'That the applicant Ram Kumar is in custody in FIR No. 124/2026, the grounds are submitted below, and the details of any earlier bail application are as the brief gives them.';
const WITH_CITE = `1. ${BASE} As held in ${CITATION}, he is entitled to bail.`;
const WITH_UNDERTAKING = `1. ${BASE} He gives an undertaking, and he is entitled to bail.`;
const P2 = '2. That FIR No. 124/2026 was registered at PS Kotwali.';
const P3 = '3. That the applicant is in judicial custody.';

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'a@test.com',
  'x-user-name': 'A',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];
const fact = (key: string, display: string, extra: Record<string, unknown> = {}) => ({
  id: `f_${key}`,
  key,
  label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
  type: 'text',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.99,
  required_in_draft: true,
  ...extra,
});
const FACTS = [
  fact('applicant_name', 'Ram Kumar', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '124/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];

const report = (over: Record<string, string> = {}) =>
  PACK.mandatoryClauses.map((c) => `${c.id}: ${over[c.id] ?? '1'}`).join('\n');
const answer = (body: string, over: Record<string, string> = {}) =>
  `${body}\n\n${CLAUSES_MARKER}\n${report(over)}`;

type Warning = { type: string; message: string; details?: { clauseId?: string } };
function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}
function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}
const warningsOf = (text: string): Warning[] =>
  events(text, 'warning').flatMap((e) => e.warnings as Warning[]);
const missingWarnings = (text: string) =>
  warningsOf(text).filter((w) => w.type === 'missing_clause');

/** Model replies in order; any call after them fails the test by returning an empty answer. */
function modelReplies(...replies: string[]) {
  mockMessagesStream.mockReset();
  for (const r of replies) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(r, 4000, 800));
}

async function post(withLedger: boolean) {
  const body: Record<string, unknown> = { kind: 'bail_regular', values: VALUES, court: COURT };
  if (withLedger) {
    const l = await FactLedgerModel.create({
      userId: USER_ID,
      documentKind: 'bail_regular',
      runType: 'user',
      currentVersion: 1,
      versions: [
        { version: 1, facts: FACTS, unresolved: [], createdAt: new Date(), reason: 'extract' },
      ],
    });
    body.ledger_id = String(l._id);
  }
  return request(app).post('/generate-from-brief').set(headers()).send(body);
}

let logged: string[] = [];
beforeEach(async () => {
  logged = [];
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    jest.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logged.push(a.map((x) => String(x)).join(' '));
    });
  }
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await Court.create({
    courtId: 'district_sessions_patna',
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => jest.restoreAllMocks());

describe('T-236 AC1 to AC3, first removal (no ledger)', () => {
  it('control: the same draft with the undertaking written out has no clause missing and takes one model call', async () => {
    modelReplies(answer([WITH_UNDERTAKING, P2, P3].join('\n\n')));
    const res = await post(false);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
    expect(missingWarnings(res.text)).toEqual([]);
  });

  it('a removal that strips the cue of no_flight_risk reports the clause with the removal wording, and makes no model call', async () => {
    modelReplies(answer([WITH_CITE, P2, P3].join('\n\n')));
    const res = await post(false);
    expect(res.status).toBe(200);
    // same count as the control: no repair pass, no other call, for the removal
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'repair')).toBeNull();

    const done = event(res.text, 'done')!;
    expect(done.missingClauses).toEqual([
      { id: 'no_flight_risk', title: titleOf('no_flight_risk') },
    ]);
    expect(done.mandatoryClausesComplete).toBe(false);
    expect(done.repaired).toBe(false);
    // the existing channel: type missing_clause, details {clauseId}, nothing new
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: REMOVAL(titleOf('no_flight_risk')),
        details: { clauseId: 'no_flight_risk' },
      },
    ]);
    // the citation itself is still blanked and still reported as before
    expect(res.text).toContain(BLANK);
    expect(warningsOf(res.text).some((w) => w.type === 'case_citation')).toBe(true);
    // no new event type
    const names = res.text.match(/^event: (\w+)$/gm)!.map((l) => l.slice(7));
    expect(new Set(names)).toEqual(new Set(['checklist', 'template_sections', 'warning', 'done']));
  });

  it('a removal that changes nothing has no recheck effect: same output as before', async () => {
    // the advocate gave this very citation in the brief, so nothing is removed
    modelReplies(answer([WITH_CITE, P2, P3].join('\n\n')));
    mockMessagesStream.mockClear();
    const given = [
      ...VALUES.filter((v) => v.key !== 'facts_narrative'),
      { key: 'facts_narrative', value: `The applicant relies on ${CITATION}.` },
    ];
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'bail_regular', values: given, court: COURT });
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(warningsOf(res.text).some((w) => w.type === 'case_citation')).toBe(false);
    expect(missingWarnings(res.text)).toEqual([]);
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
  });

  it('a clause missing before any removal keeps the plain wording, and the removal wording is not used for it', async () => {
    // no undertaking anywhere, and a citation (without the cue) that the removal blanks
    const body = [
      `1. ${BASE} As held in Mohan Singh v. State of Bihar (2020) 5 SCC 1, he is entitled to bail.`,
      P2,
      P3,
    ].join('\n\n');
    modelReplies(answer(body), answer(body)); // the repair changes nothing
    const res = await post(false);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2); // the one repair pass
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: PLAIN(titleOf('no_flight_risk')),
        details: { clauseId: 'no_flight_risk' },
      },
    ]);
  });

  it('the clause repair still runs at most once: one clause missing before, another lost in the removal', async () => {
    // earlier_applications is missing at first (no earlier-bail wording); the cue of
    // no_flight_risk is inside the citation. The repair adds paragraph 4 for the first.
    const first = [
      `1. That the applicant Ram Kumar is in custody in FIR No. 124/2026 and the grounds are submitted below. As held in ${CITATION}, he is entitled to bail.`,
      P2,
      P3,
    ].join('\n\n');
    const P4 = '4. That no earlier bail application has been filed by the applicant.';
    modelReplies(answer(first), answer([first, P4].join('\n\n'), { earlier_applications: '4' }));
    const res = await post(false);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(events(res.text, 'repair')).toEqual([{ missing: 1 }]);

    const done = event(res.text, 'done')!;
    expect(done.repaired).toBe(true);
    expect(done.missingClauses).toEqual([
      { id: 'no_flight_risk', title: titleOf('no_flight_risk') },
    ]);
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: REMOVAL(titleOf('no_flight_risk')),
        details: { clauseId: 'no_flight_risk' },
      },
    ]);
  });

  it('the removed citation is in no warning, no done event and no log line', async () => {
    modelReplies(answer([WITH_CITE, P2, P3].join('\n\n')));
    const res = await post(false);
    const surfaces =
      JSON.stringify([warningsOf(res.text), event(res.text, 'done')?.missingClauses]) +
      JSON.stringify(events(res.text, 'warning')) +
      logged.join('\n');
    for (const part of [CITATION, '5 All 10', 'Undertaking Hari Kumar', 'v. Undertaking']) {
      expect(surfaces).not.toContain(part);
    }
    for (const w of missingWarnings(res.text)) {
      expect(w.message).not.toMatch(/All 10|Undertaking Hari|\bv\./);
    }
  });
});

describe('T-236 AC1 to AC3, removal after the fact verifier (ledger)', () => {
  /**
   * The first draft carries every cue, the undertaking inside one sentence the
   * fact verifier flags ("99 years" is not in the facts), so the fact repair runs.
   * The repair rewrites that sentence; the verifier passes the result, and the
   * removal after the verifier is what changes the body.
   */
  const LEAD =
    'That the applicant Ram Kumar is in custody in FIR No. 124/2026, the grounds are submitted below, and the details of any earlier bail application are as the brief gives them.';
  const FIRST = [`1. ${LEAD} He gives an undertaking for 99 years.`, P2, P3].join('\n\n');

  it('control: the ledger draft with the fact repair and no citation passes, nothing missing, two calls', async () => {
    modelReplies(answer(FIRST), `[[P0]]\n1. ${LEAD} He gives an undertaking.`);
    const res = await post(true);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(events(res.text, 'repair')).toEqual([{ facts: true }]);
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
    expect(missingWarnings(res.text)).toEqual([]);
  });

  it('a verifier-passed draft whose post-verifier removal strips a cue reports the clause (unconditional recheck)', async () => {
    modelReplies(
      answer(FIRST),
      `[[P0]]\n1. ${LEAD} As held in ${CITATION}, he is entitled to bail.`,
    );
    const res = await post(true);
    expect(res.status).toBe(200);
    // the draft and the one fact repair; nothing for the removal
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(events(res.text, 'repair')).toEqual([{ facts: true }]);
    // the verifier passed: it blanked nothing
    expect(event(res.text, 'done')!.factCheck).toEqual({ banner: null });
    // the removal after the verifier did blank the citation (it adds no case_citation warning of its own)
    expect(res.text).toContain(BLANK);
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: REMOVAL(titleOf('no_flight_risk')),
        details: { clauseId: 'no_flight_risk' },
      },
    ]);
    expect(event(res.text, 'done')!.missingClauses).toEqual([
      { id: 'no_flight_risk', title: titleOf('no_flight_risk') },
    ]);
    const surfaces = JSON.stringify(events(res.text, 'warning')) + logged.join('\n');
    expect(surfaces).not.toContain('5 All 10');
    expect(surfaces).not.toContain('Undertaking Hari Kumar');
  });

  it('a clause the fact verifier itself removed gets the plain wording, even when a removal also changes the body', async () => {
    // the repair drops the undertaking sentence and brings in a citation that carries no cue
    modelReplies(
      answer(FIRST),
      `[[P0]]\n1. ${LEAD} As held in Ram Kumar v. Hari Kumar (2026) 5 All 10, he is entitled to bail.`,
    );
    const res = await post(true);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(res.text).toContain(BLANK);
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: PLAIN(titleOf('no_flight_risk')),
        details: { clauseId: 'no_flight_risk' },
      },
    ]);
  });
});

// ── R2b: a clause without cues, held by the text recorded for it ───────────
// bail_regular has no such clause; bail_anticipatory has `apprehension`.
describe('T-236 R2b path (bail_anticipatory, clause `apprehension` has no cues)', () => {
  const ANTI_PACK = loadRulePack('bail_anticipatory')!;
  const ANTI_CHECKLIST = buildChecklist(ANTI_PACK);
  const antiTitle = (id: string) => ANTI_PACK.mandatoryClauses.find((c) => c.id === id)!.title;
  const ANTI_NARRATIVE = 'apprehends arrest and will not flee';
  const ANTI_FACTS = [
    ...FACTS.filter((f) => !['currently_in_custody', 'facts_narrative'].includes(f.key)),
    {
      ...fact('facts_narrative', ANTI_NARRATIVE),
      label: ANTI_CHECKLIST.find((i) => i.key === 'facts_narrative')?.label ?? 'facts_narrative',
    },
  ];
  const ANTI_VALUES = [
    ...VALUES.filter(
      (v) =>
        ![
          'currently_in_custody',
          'facts_narrative',
          'grounds_for_bail',
          'sections_charged',
        ].includes(v.key),
    ),
    { key: 'facts_narrative', value: ANTI_NARRATIVE },
  ];
  // paragraph 1 carries the cues of fir_details, no_flight_risk and earlier_applications
  const P1_CUES =
    '1. That the applicant Ram Kumar is named in FIR No. 124/2026, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
  const antiAnswer = (body: string) =>
    `${body}\n\n${CLAUSES_MARKER}\n${ANTI_PACK.mandatoryClauses
      .map((c) => `${c.id}: ${c.id === 'apprehension' ? '2' : '1'}`)
      .join('\n')}`;

  async function postAnti(withLedger: boolean) {
    const body: Record<string, unknown> = {
      kind: 'bail_anticipatory',
      values: ANTI_VALUES,
      court: COURT,
    };
    if (withLedger) {
      const l = await FactLedgerModel.create({
        userId: USER_ID,
        documentKind: 'bail_anticipatory',
        runType: 'user',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            facts: ANTI_FACTS,
            unresolved: [],
            createdAt: new Date(),
            reason: 'extract',
          },
        ],
      });
      body.ledger_id = String(l._id);
    }
    return request(app).post('/generate-from-brief').set(headers()).send(body);
  }

  it('control: apprehension recorded, no citation, nothing missing', async () => {
    modelReplies(
      antiAnswer(
        [P1_CUES, '2. That the applicant apprehends arrest and will not flee.'].join('\n\n'),
      ),
    );
    const res = await postAnti(false);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
  });

  it('first removal: a citation blanked in the paragraph that holds the recorded text reports the clause with the removal wording', async () => {
    // paragraph 2 is nothing but the citation, so the removal leaves only a blank (R2b.2)
    modelReplies(
      antiAnswer([P1_CUES, '2. Mohan Singh v. State of Bihar (2020) 5 SCC 1.'].join('\n\n')),
    );
    const res = await postAnti(false);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(res.text).toContain(BLANK);
    expect(missingWarnings(res.text)).toEqual([
      {
        type: 'missing_clause',
        message: REMOVAL(antiTitle('apprehension')),
        details: { clauseId: 'apprehension' },
      },
    ]);
    expect(event(res.text, 'done')!.missingClauses).toEqual([
      { id: 'apprehension', title: antiTitle('apprehension') },
    ]);
    expect(JSON.stringify(events(res.text, 'warning')) + logged.join('\n')).not.toContain(
      '5 SCC 1',
    );
  });

  it('post-verifier removal: the fact repair rewrites the recorded paragraph and adds a citation; the second removal must not record the new text as covering the clause', async () => {
    const first = [
      P1_CUES,
      '2. That the applicant apprehends arrest and will not flee. He has been under threat for 99 years.',
    ].join('\n\n');
    modelReplies(
      antiAnswer(first),
      '[[P1]]\n2. That the applicant fears detention in this case. As held in Ram Kumar v. Hari Kumar (2026) 5 All 10, he is entitled.',
    );
    const res = await postAnti(true);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(events(res.text, 'repair')).toEqual([{ facts: true }]);
    expect(res.text).toContain(BLANK);
    // reported missing: the old argument (`missing`) recorded the rewritten, de-cited paragraph as covering it
    const ids = (event(res.text, 'done')!.missingClauses as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toEqual(['apprehension']);
    const w = missingWarnings(res.text);
    expect(w).toHaveLength(1);
    expect(w[0].details).toEqual({ clauseId: 'apprehension' });
    expect(w[0].message).toBe(PLAIN(antiTitle('apprehension'))); // lost to the verifier's rewrite already
    expect(JSON.stringify(events(res.text, 'warning')) + logged.join('\n')).not.toContain(
      '5 All 10',
    );
  });
});
