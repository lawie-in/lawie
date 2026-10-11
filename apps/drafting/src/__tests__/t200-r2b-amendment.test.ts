/**
 * T-200, Ajay's R2b amendment (12 Oct 2026): a paragraph edited by Lawie's own
 * code (the fact check) is recorded again for the uncued clauses reported
 * there; an edit by the Drafter is checked against the latest recording;
 * system-part clauses are never checked in the paragraphs.
 *
 * "Ajay R2b (a)" to "(e)" are his five test conditions. Uncued clauses of
 * bail_anticipatory (`apprehension`, `no_flight_risk`) are used, because every
 * non-system clause of bail_regular has cues.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  CLAUSES_MARKER,
  findMissingClauses,
  recordAgainAfterCodeEdit,
  splitDrafterOutput,
  systemParts,
} from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack, RulePack, RulePackClause } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── unit: recordAgainAfterCodeEdit ───────────────────────────────────────────

const lines = (l: string) => splitDrafterOutput(`1. x\n\n${CLAUSES_MARKER}\n${l}`).report;
const doc = (paras: Record<number, string>) =>
  Object.entries(paras)
    .map(([n, t]) => `${n}. ${t}`)
    .join('\n\n');

describe('recordAgainAfterCodeEdit (R2b.1, R2b.2)', () => {
  const before = doc({ 1: 'Alpha is a law-abiding citizen here.', 2: 'Beta stays as it is.' });

  it('a changed paragraph is recorded again for a recorded clause reported there', () => {
    const recorded = new Map([['a', 'alpha is a law-abiding citizen here.']]);
    const after = doc({ 1: 'Alpha is here.', 2: 'Beta stays as it is.' });
    recordAgainAfterCodeEdit(lines('a: 1'), before, after, recorded, []);
    expect(recorded.get('a')).toBe('alpha is here.');
  });

  it('an unchanged paragraph is left untouched', () => {
    const recorded = new Map([
      ['a', 'recorded text for a'],
      ['b', 'recorded text for b'],
    ]);
    const after = doc({ 1: 'Alpha is here.', 2: 'Beta stays as it is.' });
    recordAgainAfterCodeEdit(lines('a: 1\nb: 2'), before, after, recorded, []);
    expect(recorded.get('a')).toBe('alpha is here.');
    expect(recorded.get('b')).toBe('recorded text for b');
  });

  it('a clause not recorded yet is not recorded by a code edit', () => {
    const recorded = new Map<string, string>();
    recordAgainAfterCodeEdit(lines('a: 1'), before, doc({ 1: 'Alpha.', 2: 'Beta.' }), recorded, []);
    expect(recorded.size).toBe(0);
  });

  it('R2b.2: a paragraph the edit removed is not recorded again', () => {
    const recorded = new Map([['a', 'old text']]);
    recordAgainAfterCodeEdit(
      lines('a: 1'),
      before,
      doc({ 2: 'Beta stays as it is.' }),
      recorded,
      [],
    );
    expect(recorded.get('a')).toBe('old text');
  });

  it.each([
    ['a {{MISSING}} blank', '{{MISSING: Good character}}'],
    ['a [To be confirmed] blank', '[To be confirmed: good character]'],
    ['an underscore blank', '__________'],
    ['a brace blank and punctuation', '{x}. ;'],
    ['nothing', ''],
  ])('R2b.2: a paragraph left holding only %s is not recorded again', (_n, blank) => {
    const recorded = new Map([['a', 'old text']]);
    const after = `1. ${blank}\n\n2. Beta stays as it is.`;
    recordAgainAfterCodeEdit(lines('a: 1'), before, after, recorded, []);
    expect(recorded.get('a')).toBe('old text');
  });

  it('a paragraph that keeps a word next to a blank is recorded again', () => {
    const recorded = new Map([['a', 'old text']]);
    recordAgainAfterCodeEdit(
      lines('a: 1'),
      before,
      doc({ 1: 'That {{MISSING: x}}', 2: 'Beta stays as it is.' }),
      recorded,
      [],
    );
    expect(recorded.get('a')).toBe('that {{missing: x}}');
  });

  it('a clause already missing is not recorded again', () => {
    const recorded = new Map([['a', 'old text']]);
    const missing = [{ id: 'a', title: 'A', reason: 'clause_not_in_paragraph' as const }];
    recordAgainAfterCodeEdit(
      lines('a: 1'),
      before,
      doc({ 1: 'Alpha.', 2: 'Beta.' }),
      recorded,
      missing,
    );
    expect(recorded.get('a')).toBe('old text');
  });

  it('no report, or a clause reported MISSING or SYSTEM: nothing happens', () => {
    const recorded = new Map([['a', 'old text']]);
    recordAgainAfterCodeEdit(null, before, 'x', recorded, []);
    recordAgainAfterCodeEdit(lines('a: MISSING'), before, doc({ 1: 'Changed.' }), recorded, []);
    recordAgainAfterCodeEdit(lines('a: SYSTEM'), before, doc({ 1: 'Changed.' }), recorded, []);
    expect(recorded.get('a')).toBe('old text');
  });
});

// ── unit: Ajay R2b (c), (d) ──────────────────────────────────────────────────

const clause = (id: string, extra: Partial<RulePackClause> = {}): RulePackClause => ({
  id,
  title: `Title of ${id}`,
  detail: null,
  fixedText: null,
  required: true,
  appliesWhen: null,
  statutoryBasis: null,
  parts: [],
  extra: {},
  ...extra,
});
const BAIL = loadRulePack('bail_regular') as RulePack;

describe('Ajay R2b (c): a Drafter edit is checked against the latest recording', () => {
  const pack = { ...BAIL, id: 'bail_anticipatory', mandatoryClauses: [clause('apprehension')] };
  const out = (t: string) => splitDrafterOutput(`1. ${t}\n\n${CLAUSES_MARKER}\napprehension: 1`);

  it('the clause repair pass rewrites the paragraph: clause_not_in_paragraph, even after a code re-record', () => {
    const recorded = new Map<string, string>();
    const first = out('The applicant fears arrest. He is a law-abiding citizen.');
    expect(findMissingClauses(pack, first, [], { recorded })).toEqual([]);
    // a code edit, then the re-record
    const edited = '1. The applicant fears arrest.';
    recordAgainAfterCodeEdit(first.report, first.body, edited, recorded, []);
    expect(findMissingClauses(pack, out('The applicant fears arrest.'), [], { recorded })).toEqual(
      [],
    );
    // the Drafter rewrites the paragraph: not re-recorded, and checked
    const rewritten = out('The applicant is a student of law.');
    expect(findMissingClauses(pack, rewritten, [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });
});

describe('Ajay R2b (d): system parts are not checked in the paragraphs', () => {
  const config = loadTemplateConfig('bail_regular');
  if (!config) throw new Error('no template');
  const parts = systemParts(config);
  const SYSTEM_IDS = ['prayer', 'verification', 'advocate_details'];
  const pack = {
    ...BAIL,
    mandatoryClauses: BAIL.mandatoryClauses.filter((c) => SYSTEM_IDS.includes(c.id)),
  };

  it('reported at paragraph 1, paragraph 1 edited: not checked, not missing', () => {
    const recorded = new Map<string, string>();
    const rep = SYSTEM_IDS.map((id) => `${id}: 1`).join('\n');
    const first = splitDrafterOutput(
      `1. First text of the paragraph.\n\n${CLAUSES_MARKER}\n${rep}`,
    );
    expect(findMissingClauses(pack, first, parts, { recorded })).toEqual([]);
    const edited = splitDrafterOutput(`1. Entirely different.\n\n${CLAUSES_MARKER}\n${rep}`);
    expect(findMissingClauses(pack, edited, parts, { recorded })).toEqual([]);
    expect(recorded.size).toBe(0);
    // even a paragraph that does not exist is not checked for a part the system added
    const gone = splitDrafterOutput(`2. Other.\n\n${CLAUSES_MARKER}\n${rep}`);
    expect(findMissingClauses(pack, gone, parts, { recorded })).toEqual([]);
  });

  it('with no such part in the document, the clause is checked as before', () => {
    const rep = SYSTEM_IDS.map((id) => `${id}: 9`).join('\n');
    const out = splitDrafterOutput(`1. Text.\n\n${CLAUSES_MARKER}\n${rep}`);
    expect(findMissingClauses(pack, out, [], {}).map((m) => m.reason)).toEqual([
      'paragraph_not_found',
      'paragraph_not_found',
      'paragraph_not_found',
    ]);
  });
});

// ── end to end, ledger path: Ajay R2b (a), (b), (c), (d) ────────────────────

const USER_ID = '507f1f77bcf86cd7994390e3';
const MODEL = 'claude-sonnet-4-5-20250929';
const KIND = 'bail_anticipatory';
const PACK = loadRulePack(KIND) as RulePack;
const CHECKLIST = buildChecklist(PACK);
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
  { key: 'facts_narrative', value: 'apprehends arrest and will not flee' },
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
  fact('facts_narrative', 'apprehends arrest and will not flee'),
];

/** Every clause reported at paragraph 1 except the FIR details, which are at 2. */
const reportOf = (over: Record<string, string> = {}) =>
  PACK.mandatoryClauses
    .map((c) => `${c.id}: ${over[c.id] ?? (c.id === 'fir_details' ? '2' : '1')}`)
    .join('\n');
const answer = (body: string) => `${body}\n\n${CLAUSES_MARKER}\n${reportOf()}`;
const P2 = '2. That FIR No. 124/2026 was registered at PS Kotwali.';
// paragraph 1 holds the uncued clauses (apprehension, no_flight_risk) and the banned phrase
const BAD = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. He is a law-abiding citizen.',
  P2,
].join('\n\n');

async function draft(...replies: string[]) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BAD), 4000, 800));
  for (const r of replies) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(r, 400, 80));
  const l = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: KIND,
    runType: 'user',
    currentVersion: 1,
    versions: [
      { version: 1, facts: FACTS, unresolved: [], createdAt: new Date(), reason: 'extract' },
    ],
  });
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: KIND,
      values: VALUES,
      ledger_id: String(l._id),
      court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
    });
  const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
  return { res, done: JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) };
}

beforeEach(async () => {
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

const missingIds = (done: { missingClauses: Array<{ id: string }> }) =>
  done.missingClauses.map((m) => m.id).sort();

describe('Ajay R2b (a) and (d): the fact check removes "law-abiding citizen"', () => {
  it('Ajay R2b (a): the clauses in that paragraph are still present, with no starting-draft label', async () => {
    const { res, done } = await draft(
      '[[P0]]\n1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.',
    );
    expect(res.text).toContain('event: repair\ndata: {"facts":true}');
    expect(mockMessagesStream).toHaveBeenCalledTimes(2); // the Drafter, then the fact repair only
    expect(done.missingClauses).toEqual([]);
    expect(done.mandatoryClausesComplete).toBe(true);
    expect(done.startingDraft).toBe(false);
  });

  it('Ajay R2b (d): prayer, verification and advocate_details, reported at paragraph 1 and edited, are not missing', async () => {
    const { done } = await draft(
      '[[P0]]\n1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.',
    );
    expect(missingIds(done)).not.toEqual(expect.arrayContaining(['prayer']));
    expect(missingIds(done)).toEqual([]);
  });
});

describe('Ajay R2b (b): the fact check leaves the paragraph holding only a blank', () => {
  it.each([['{{MISSING: Good character}}'], ['[To be confirmed: good character]']])(
    'paragraph 1 is %s: the clauses reported there are missing (clause_not_in_paragraph)',
    async (blank) => {
      const { done } = await draft(`[[P0]]\n1. ${blank}`);
      expect(missingIds(done)).toEqual(['apprehension', 'no_flight_risk']);
      expect(done.mandatoryClausesComplete).toBe(false);
      expect(done.startingDraft).toBe(true);
    },
  );
});

describe('Ajay R2b (c): the clause repair pass rewrites a paragraph holding an uncued clause', () => {
  it('is refused (it may add and nothing else): the first draft is kept, the new clause stays missing', async () => {
    mockMessagesStream.mockReset();
    // the first draft lacks the FIR paragraph's cue: FIR details are reported missing
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        `1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.\n\n${CLAUSES_MARKER}\n${reportOf({ fir_details: 'MISSING' })}`,
        4000,
        800,
      ),
    );
    // the repair rewrites paragraph 1 while adding the FIR paragraph
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        `1. That the applicant is a student of law.\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`,
        400,
        80,
      ),
    );
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: KIND,
        values: VALUES,
        court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
      });
    const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
    const done = JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
    expect(done.repaired).toBe(false);
    expect(missingIds(done)).toEqual(['fir_details']);
  });
});
