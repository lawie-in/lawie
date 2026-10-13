/**
 * T-200, Ajay's R2b amendment (12 Oct 2026): a paragraph edited by Lawie's own
 * code (the fact check) is recorded again for the uncued clauses reported
 * there; an edit by the Drafter is checked against the latest recording;
 * system-part clauses are never checked in the paragraphs.
 *
 * "Ajay R2b (a)" to "(e)" are his five test conditions. The uncued clause of
 * bail_anticipatory (`apprehension`) is used, because every non-system clause of
 * bail_regular has cues. T-237 (Ajay, 12 Oct 2026) cued `no_flight_risk` (undertaking) and added
 * the cued `earlier_applications`, so the end-to-end paragraphs carry both cues (CUES below)
 * wherever the test is not about them.
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

// ── unit: R2b.4, a model repair inside the fact check ────────────────────────

describe('recordAgainAfterCodeEdit with flagged spans (R2b.4)', () => {
  const S1 = 'Alpha sentence one.';
  const S2 = 'The man is a law-abiding citizen here.';
  const S3 = 'Gamma sentence three.';
  const before = `1. ${S1} ${S2} ${S3}`;
  const at = before.indexOf('law-abiding citizen');
  const span = [{ from: at, to: at + 'law-abiding citizen'.length }];
  const run = (
    after: string,
    flagged: ReadonlyArray<{ from: number; to: number }> | null = span,
  ) => {
    const recorded = new Map([['a', 'old text']]);
    recordAgainAfterCodeEdit(lines('a: 1'), before, after, recorded, [], flagged ?? undefined);
    return recorded.get('a');
  };
  const OLD = 'old text';

  it('only the flagged phrase replaced: re-recorded', () => {
    const r = run(`1. ${S1} ${S2.replace('law-abiding citizen', 'good man')} ${S3}`);
    expect(r).toContain('good man here');
  });

  it('the whole flagged sentence removed: re-recorded', () => {
    expect(run(`1. ${S1} ${S3}`)).toBe(`${S1} ${S3}`.toLowerCase());
  });

  it('two changes inside the same flagged sentence: one stretch, re-recorded', () => {
    const r = run(`1. ${S1} A man is a good citizen here and there. ${S3}`);
    expect(r).not.toBe(OLD);
  });

  it('the neighbouring sentence rewritten as well: not re-recorded', () => {
    expect(
      run(`1. ${S1} ${S2.replace('law-abiding citizen', 'good man')} Gamma was rewritten.`),
    ).toBe(OLD);
    expect(
      run(`1. Alpha was rewritten. ${S2.replace('law-abiding citizen', 'good man')} ${S3}`),
    ).toBe(OLD);
  });

  it("the previous sentence's closing mark changed: not re-recorded", () => {
    expect(
      run(`1. Alpha sentence one! ${S2.replace('law-abiding citizen', 'good man')} ${S3}`),
    ).toBe(OLD);
  });

  it("the flagged sentence's own closing mark changed with the phrase: still one stretch inside that sentence, re-recorded", () => {
    expect(run(`1. ${S1} The man is a good man here! ${S3}`)).toContain('good man here!');
  });

  it('a changed paragraph with no flagged span covering the change: not re-recorded', () => {
    const elsewhere = [{ from: before.indexOf('Gamma'), to: before.indexOf('Gamma') + 5 }];
    expect(run(`1. ${S1} ${S2.replace('law-abiding citizen', 'good man')} ${S3}`, elsewhere)).toBe(
      OLD,
    );
    expect(run(`1. ${S1} ${S2.replace('law-abiding citizen', 'good man')} ${S3}`, [])).toBe(OLD);
  });

  it('no flagged argument: any change is a code edit and is re-recorded (R2b.1)', () => {
    const r = run(`1. Alpha was rewritten. ${S2} Gamma was rewritten too.`, null);
    expect(r).toContain('gamma was rewritten too');
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
// T-237: the cue sentences of the two cued clauses reported at paragraph 1 (no_flight_risk: the
// undertaking cue; earlier_applications: EA-standard), so they stay present unless a test is about them
const CUES =
  'He undertakes to join the investigation. Details of any earlier bail application are as the brief gives them.';
// paragraph 1 holds the uncued clause (apprehension), the two cues and the banned phrase
const BAD = [
  `1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. He is a law-abiding citizen. ${CUES}`,
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

const systemOf = () => {
  const config = loadTemplateConfig(KIND);
  return config ? systemParts(config) : [];
};
const event = (text: string, name: string): Record<string, any> | null => {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  return blocks.length === 0 ? null : JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
};

const missingIds = (done: { missingClauses: Array<{ id: string }> }) =>
  done.missingClauses.map((m) => m.id).sort();

describe('Ajay R2b (a) and (d): the fact check removes "law-abiding citizen"', () => {
  it('Ajay R2b (a): the clauses in that paragraph are still present, with no starting-draft label', async () => {
    const { res, done } = await draft(
      `[[P0]]\n1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. ${CUES}`,
    );
    expect(res.text).toContain('event: repair\ndata: {"facts":true}');
    expect(mockMessagesStream).toHaveBeenCalledTimes(2); // the Drafter, then the fact repair only
    expect(done.missingClauses).toEqual([]);
    expect(done.mandatoryClausesComplete).toBe(true);
    expect(done.startingDraft).toBe(false);
  });

  it('Ajay R2b (d): prayer, verification and advocate_details, reported at paragraph 1 and edited, are not missing', async () => {
    const { done } = await draft(
      `[[P0]]\n1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. ${CUES}`,
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
      // T-237: the two cued clauses reported at paragraph 1 fail their cue as well
      expect(missingIds(done)).toEqual(['apprehension', 'earlier_applications', 'no_flight_risk']);
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
        `1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. ${CUES}\n\n${CLAUSES_MARKER}\n${reportOf({ fir_details: 'MISSING' })}`,
        4000,
        800,
      ),
    );
    // the repair rewrites paragraph 1 while adding the FIR paragraph
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        `1. That the applicant is a student of law. ${CUES}\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`,
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

describe("Ajay R2b.4: the fact check's model repair", () => {
  const NAME =
    'That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.';

  it('Ajay R2b.4 (a): the repair replaces only the flagged phrase: the clauses are present, no starting-draft label', async () => {
    const { done } = await draft(`[[P0]]\n1. ${NAME} He is a citizen. ${CUES}`);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(done.missingClauses).toEqual([]);
    expect(done.mandatoryClausesComplete).toBe(true);
    expect(done.startingDraft).toBe(false);
  });

  it.each([
    [
      'rewrites the neighbouring sentence too',
      `1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will never flee. He is a citizen. ${CUES}`,
    ],
    [
      "changes only the neighbour's closing mark",
      `1. ${NAME.replace(/\.$/, '!')} He is a citizen. ${CUES}`,
    ],
  ])(
    'Ajay R2b.4 (b): the repair %s: the uncued clause is missing (clause_not_in_paragraph)',
    async (_n, p1) => {
      const { res, done } = await draft(`[[P0]]\n${p1}`);
      // T-237: no_flight_risk and earlier_applications are cued and the repair kept their cue
      // sentences, so only the uncued apprehension is missing
      expect(missingIds(done)).toEqual(['apprehension']);
      expect(done.mandatoryClausesComplete).toBe(false);
      expect(done.startingDraft).toBe(true);
      // The route's payload carries ids and titles only, not the reason. The warnings name the clauses:
      const warned = (event(res.text, 'warning')?.warnings ?? []) as Array<{
        type: string;
        details: { clauseId: string };
      }>;
      expect(
        warned
          .filter((w) => w.type === 'missing_clause')
          .map((w) => w.details.clauseId)
          .sort(),
      ).toEqual(['apprehension']);
      // The reason, by the same steps the route takes: record on the first check, edit as the model
      // repair did with the flagged span, check the repaired body.
      const recorded = new Map<string, string>();
      const first = splitDrafterOutput(`${BAD}\n\n${CLAUSES_MARKER}\n${reportOf()}`);
      findMissingClauses(PACK, first, [], { recorded });
      const repaired = `${p1}\n\n${P2}`;
      const at = BAD.indexOf('law-abiding citizen');
      recordAgainAfterCodeEdit(
        first.report,
        BAD,
        repaired,
        recorded,
        [],
        [{ from: at, to: at + 'law-abiding citizen'.length }],
      );
      const after = splitDrafterOutput(`${repaired}\n\n${CLAUSES_MARKER}\n${reportOf()}`);
      const reasons = findMissingClauses(PACK, after, systemOf(), { recorded })
        .filter((m) => ['apprehension', 'no_flight_risk', 'earlier_applications'].includes(m.id))
        .map((m) => [m.id, m.reason]);
      expect(reasons).toEqual([['apprehension', 'clause_not_in_paragraph']]);
    },
  );
});

// ── Ajay R2b.5: a first check that finds only blanks records nothing ────────

describe('Ajay R2b.5: the first check of an empty reported paragraph', () => {
  const pack = { ...BAIL, id: 'bail_anticipatory', mandatoryClauses: [clause('apprehension')] };
  const out = (body: string, report = 'apprehension: 5') =>
    splitDrafterOutput(`${body}\n\n${CLAUSES_MARKER}\n${report}`);

  it.each([
    ['"5." immediately followed by "6."', '5.\n\n6. Beta stays as it is.'],
    ['"5." with only spaces before "6."', '5.   \n\n6. Beta stays as it is.'],
    ['only {{MISSING: x}}', '5. {{MISSING: x}}\n\n6. Beta stays as it is.'],
    ['only [To be confirmed: x]', '5. [To be confirmed: x]\n\n6. Beta stays as it is.'],
    ['only ___', '5. ___\n\n6. Beta stays as it is.'],
    ['blanks and punctuation', '5. {{MISSING: x}}. ; ___\n\n6. Beta stays as it is.'],
  ])('Ajay R2b.5: %s gives clause_not_in_paragraph and records nothing', (_n, body) => {
    const recorded = new Map<string, string>();
    const missing = findMissingClauses(pack, out(body), [], { recorded });
    expect(missing.map((m) => [m.id, m.reason])).toEqual([
      ['apprehension', 'clause_not_in_paragraph'],
    ]);
    expect(recorded.has('apprehension')).toBe(false);
    expect(recorded.size).toBe(0);
  });

  it('Ajay R2b.5: a first check with real text is recorded as before (control)', () => {
    const recorded = new Map<string, string>();
    const missing = findMissingClauses(
      pack,
      out('5. That the applicant fears arrest.\n\n6. Beta stays as it is.'),
      [],
      { recorded },
    );
    expect(missing).toEqual([]);
    expect(recorded.get('apprehension')).toBe('that the applicant fears arrest.');
  });

  it('Ajay R2b.5: a word next to a blank is real text and is recorded (control)', () => {
    const recorded = new Map<string, string>();
    const missing = findMissingClauses(pack, out('5. That {{MISSING: x}}\n\n6. Beta.'), [], {
      recorded,
    });
    expect(missing).toEqual([]);
    expect(recorded.has('apprehension')).toBe(true);
  });

  it('Ajay R2b.5: with no recorded map, a one-off check of an empty paragraph fails', () => {
    const missing = findMissingClauses(pack, out('5.\n\n6. Beta stays as it is.'), []);
    expect(missing.map((m) => [m.id, m.reason])).toEqual([
      ['apprehension', 'clause_not_in_paragraph'],
    ]);
  });

  it('Ajay R2b.5: with no recorded map, a paragraph with real text still passes', () => {
    expect(findMissingClauses(pack, out('5. That the applicant fears arrest.'), [])).toEqual([]);
  });

  it('Ajay R2b.5: an empty first check does not poison the next: real text is recorded then', () => {
    const recorded = new Map<string, string>();
    findMissingClauses(pack, out('5.\n\n6. Beta.'), [], { recorded });
    const later = findMissingClauses(pack, out('5. That the applicant fears arrest.'), [], {
      recorded,
    });
    expect(later).toEqual([]);
    expect(recorded.get('apprehension')).toBe('that the applicant fears arrest.');
  });

  it('Ajay R2b.5: a cued or fixed-text clause is not changed by the guard', () => {
    // bail_regular clauses have cues; an empty paragraph already fails them under R2a.
    const cued = BAIL.mandatoryClauses.find((c) => c.required && c.appliesWhen === null);
    expect(cued).toBeDefined();
    const recorded = new Map<string, string>();
    findMissingClauses(
      { ...BAIL, mandatoryClauses: [cued as RulePackClause] },
      out('5.\n\n6. Beta.', `${(cued as RulePackClause).id}: 5`),
      [],
      { recorded },
    );
    expect(recorded.size).toBe(0);
  });
});

describe('Ajay R2b.5: end to end, an uncued clause whose reported paragraph is empty', () => {
  it('goes to the clause repair pass at check 1, and the repair fills it', async () => {
    mockMessagesStream.mockReset();
    // paragraph 1 is empty; apprehension, no_flight_risk and earlier_applications are reported there
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(`1.\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`, 4000, 800),
    );
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        `1. That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. ${CUES}\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`,
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
    expect(res.text).toContain('event: repair\ndata: {"missing":');
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    // the repair prompt names the uncued clause and, since T-237, the two cued ones
    const prompt = JSON.stringify(mockMessagesStream.mock.calls[1]);
    expect(prompt).toContain('apprehension');
    expect(prompt).toContain('no_flight_risk');
    expect(prompt).toContain('earlier_applications');
    const done = event(res.text, 'done') as any;
    expect(done.repaired).toBe(true);
    expect(missingIds(done)).not.toEqual(expect.arrayContaining(['apprehension']));
    expect(missingIds(done)).not.toEqual(expect.arrayContaining(['no_flight_risk']));
    expect(missingIds(done)).not.toEqual(expect.arrayContaining(['earlier_applications']));
  });

  it('keeps them missing when the repair leaves the paragraph empty', async () => {
    mockMessagesStream.mockReset();
    const first = `1.\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`;
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(first, 4000, 800));
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(first, 400, 80));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: KIND,
        values: VALUES,
        court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
      });
    expect(res.text).toContain('event: repair\ndata: {"missing":');
    const done = event(res.text, 'done') as any;
    expect(missingIds(done)).toEqual(
      expect.arrayContaining(['apprehension', 'no_flight_risk', 'earlier_applications']),
    );
    expect(done.mandatoryClausesComplete).toBe(false);
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
