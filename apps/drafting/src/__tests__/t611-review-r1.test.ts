/**
 * T-611 review round 1 follow-ups.
 *
 *  - T-200 two-step recording around the held-blank repair: the deterministic fill is a code
 *    edit (R2b.1), the model repair re-records a paragraph only when its change stays inside the
 *    sentence of a blank it was asked to fill (R2b.4).
 *  - heldBlankSpans: exactly the blanks repairHeldBlanks is asked to fill.
 *  - TEXT_FILL_MAX: a long or multi-line text fact is not code-filled.
 *
 * The D1 route-level withhold is in t611-d1.routes.test.ts. Mocked model, no network.
 */
import './setupDb';
import type { LedgerFact } from '@lawie/shared';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists } from '../services/averments';
import {
  CLAUSES_MARKER,
  findMissingClauses,
  packTexts,
  recordAgainAfterCodeEdit,
  splitDrafterOutput,
} from '../services/brief-drafter';
import {
  fillHeldBlanks,
  heldBlankSpans,
  heldBlanksIn,
  repairHeldBlanks,
  VerifierInput,
} from '../services/fact-verifier';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack, RulePack, RulePackClause } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

// The signed skeletons are on by default; these tests drive the legacy text stream.
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: () => null,
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

function lf(key: string, label: string, type: string, value: unknown, display: string): LedgerFact {
  return {
    id: `f_${key}_${display.length}`,
    key,
    label,
    type,
    value,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: false,
  } as unknown as LedgerFact;
}

// ═════════════════════════════════════════════════════════════════════════════
// heldBlankSpans
// ═════════════════════════════════════════════════════════════════════════════
describe('heldBlankSpans: the blanks the held-blank repair is asked to fill', () => {
  const FACTS = [
    lf('cheque_date', 'Cheque Date', 'date', '2026-10-01', '1 October 2026'),
    lf('amount_in_words', 'Amount in Words', 'text', 'Rupees Ten only', 'Rupees Ten only'),
    lf('police_station', 'Police Station', 'police_station', 'Kotwali', 'Kotwali'),
  ];
  const BODY = [
    '1. That the cheque is dated {{MISSING: Cheque Date}} for {{missing:  amount in words }}.',
    '2. That the drawer lives at {{MISSING: Drawer Address}} on {{MISSING: date}}.',
    '3. That PS {{MISSING: Police Station}} and {{MISSING: Cheque Date}} again.',
  ].join('\n\n');

  it('returns held blanks only, with exact offsets into the body', () => {
    const spans = heldBlankSpans(BODY, FACTS);
    const tokens = spans.map((s) => BODY.slice(s.from, s.to));
    expect(tokens).toEqual([
      '{{MISSING: Cheque Date}}',
      '{{missing:  amount in words }}',
      '{{MISSING: Police Station}}',
      '{{MISSING: Cheque Date}}',
    ]);
    // ascending, non-overlapping
    spans.forEach((s, i) => {
      expect(s.to).toBeGreaterThan(s.from);
      if (i > 0) expect(s.from).toBeGreaterThanOrEqual(spans[i - 1].to);
    });
  });

  it('a blank for a fact the ledger does not hold, and a generic label, are not spans', () => {
    const tokens = heldBlankSpans(BODY, FACTS).map((s) => BODY.slice(s.from, s.to));
    expect(tokens.join('')).not.toContain('Drawer Address');
    expect(tokens.join('')).not.toContain('MISSING: date}}');
    expect(heldBlankSpans('x {{MISSING: date}} y', FACTS)).toEqual([]);
    expect(heldBlankSpans('no blanks here', FACTS)).toEqual([]);
  });

  it('offsets hold with CRLF-free multi-paragraph bodies and blank lines with spaces', () => {
    const body = 'a {{MISSING: Cheque Date}}\n \t\nb {{MISSING: Cheque Date}}';
    const spans = heldBlankSpans(body, FACTS);
    expect(spans.map((s) => body.slice(s.from, s.to))).toEqual([
      '{{MISSING: Cheque Date}}',
      '{{MISSING: Cheque Date}}',
    ]);
  });

  it('the same set heldBlanksIn counts (no allowance for the verifier-own blanks), by label', () => {
    const counted = heldBlanksIn(BODY, FACTS);
    const spans = heldBlankSpans(BODY, FACTS);
    expect(spans).toHaveLength(counted.length);
    const labels = spans.map((s) =>
      BODY.slice(s.from, s.to)
        .replace(/^\{\{\s*missing\s*:\s*|\s*\}\}$/gi, '')
        .toLowerCase(),
    );
    expect(labels).toEqual(counted.map((x) => x.label.trim().toLowerCase()));
  });

  it('a held key with two entries is still a span (it is left for the repair, not guessed)', () => {
    const two = [
      ...FACTS,
      lf('cheque_date', 'Cheque Date', 'date', '2026-10-02', '2 October 2026'),
    ];
    const body = 'dated {{MISSING: Cheque Date}}.';
    expect(fillHeldBlanks(body, two).text).toBe(body);
    expect(heldBlankSpans(body, two).map((s) => body.slice(s.from, s.to))).toEqual([
      '{{MISSING: Cheque Date}}',
    ]);
  });

  it('repairHeldBlanks is asked about the same blanks the spans mark, and no others', async () => {
    const two = [
      ...FACTS,
      lf('cheque_date', 'Cheque Date', 'date', '2026-10-02', '2 October 2026'),
    ];
    const body = [
      '1. That it is dated {{MISSING: Cheque Date}}.',
      '2. That the drawer lives at {{MISSING: Drawer Address}}.',
    ].join('\n\n');
    let prompt = '';
    const repair = jest.fn(async (_sys: string, user: string) => {
      prompt = user;
      return null;
    });
    const input = {
      body,
      facts: two,
      unresolved: [],
      lists: loadAvermentLists('legal_notice_s138'),
      skeleton: [],
      packText: packTexts(loadRulePack('legal_notice_s138')!),
      packId: 'legal_notice_s138',
    } as unknown as VerifierInput;
    await repairHeldBlanks(input, repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(prompt).toContain('has a blank for Cheque Date');
    expect(prompt).not.toContain('Drawer Address');
    expect(heldBlankSpans(body, two)).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEXT_FILL_MAX (unit)
// ═════════════════════════════════════════════════════════════════════════════
describe('fillHeldBlanks: a text fact is code-filled only when short and on one line', () => {
  const textFact = (display: string) => [lf('fact_note', 'Fact Note', 'text', display, display)];
  const body = 'It is {{MISSING: Fact Note}} here.';

  it('a short single-line text fact is code-filled', () => {
    const r = fillHeldBlanks(body, textFact('a short note'));
    expect(r.text).toBe('It is a short note here.');
    expect(r.left).toEqual([]);
  });

  it('exactly 300 characters is still code-filled; 301 goes to left', () => {
    const at = 'x'.repeat(300);
    expect(fillHeldBlanks(body, textFact(at)).text).toBe(`It is ${at} here.`);
    const over = 'x'.repeat(301);
    const r = fillHeldBlanks(body, textFact(over));
    expect(r.text).toBe(body);
    expect(r.left).toEqual([{ key: 'fact_note', label: 'Fact Note' }]);
    expect(r.filled).toEqual([]);
  });

  it.each([
    ['LF', 'line one\nline two'],
    ['CRLF', 'line one\r\nline two'],
    ['CR', 'line one\rline two'],
  ])('a text fact with %s is not code-filled: it goes to left, the body is unchanged', (_n, d) => {
    const r = fillHeldBlanks(body, textFact(d));
    expect(r.text).toBe(body);
    expect(r.left).toEqual([{ key: 'fact_note', label: 'Fact Note' }]);
    expect(heldBlanksIn(r.text, textFact(d))).toHaveLength(1);
  });

  describe('then the one model repair', () => {
    const LONG = `${'word '.repeat(70)}end`; // over 300 chars, one line
    const input = (b: string, facts: LedgerFact[]) =>
      ({
        body: b,
        facts,
        unresolved: [],
        lists: loadAvermentLists('legal_notice_s138'),
        skeleton: [],
        packText: packTexts(loadRulePack('legal_notice_s138')!),
        packId: 'legal_notice_s138',
      }) as unknown as VerifierInput;

    it('a mocked repair that prints the long fact fills it', async () => {
      expect(LONG.length).toBeGreaterThan(300);
      const facts = textFact(LONG);
      const b = '1. That the note says {{MISSING: Fact Note}}.';
      const repair = jest.fn(async () => `[[P0]]\n1. That the note says ${LONG}.`);
      const out = await repairHeldBlanks(input(b, facts), repair);
      expect(repair).toHaveBeenCalledTimes(1);
      expect(out).toContain(LONG);
      expect(out).not.toMatch(/MISSING/);
    });

    it('a repair that cannot fill it leaves the blank (so the gate withholds)', async () => {
      const facts = textFact('line one\nline two');
      const b = '1. That the note says {{MISSING: Fact Note}}.';
      const out = await repairHeldBlanks(input(b, facts), async () => null);
      expect(out).toBe(b);
      expect(heldBlanksIn(out, facts)).toHaveLength(1);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T-200 two-step recording (unit: the same calls ai.service makes)
// ═════════════════════════════════════════════════════════════════════════════
const clause = (id: string): RulePackClause => ({
  id,
  title: `Title of ${id}`,
  detail: null,
  fixedText: null,
  required: true,
  appliesWhen: null,
  statutoryBasis: null,
  parts: [],
  extra: {},
});
const ANTI = loadRulePack('bail_anticipatory') as RulePack;

describe('T-200: the held-blank repair is a model repair (R2b.4), the fill a code edit (R2b.1)', () => {
  const pack = { ...ANTI, mandatoryClauses: [clause('apprehension')] };
  const FACTS = [
    lf('applicant_address', 'Applicant Address', 'text', 'x\ny', 'House 4,\nPatna'),
    lf('fir_date', 'FIR Date', 'date', '2026-03-10', '10 March 2026'),
  ];
  const APPREHENSION = 'The applicant fears arrest and will not flee.';
  const BLANK_SENTENCE = 'He was born on {{MISSING: FIR Date}} in Patna.';
  const first = `1. ${APPREHENSION} ${BLANK_SENTENCE} He undertakes to join the investigation.`;
  const out = (b: string) => splitDrafterOutput(`${b}\n\n${CLAUSES_MARKER}\napprehension: 1`);

  function firstCheck() {
    const recorded = new Map<string, string>();
    const o = out(first);
    expect(findMissingClauses(pack, o, [], { recorded })).toEqual([]);
    return { recorded, o };
  }

  it('R2b.1: the deterministic fill (no flagged argument) re-records the clause, so it stays present', () => {
    const { recorded, o } = firstCheck();
    const filled = fillHeldBlanks(first, FACTS);
    expect(filled.text).not.toBe(first);
    recordAgainAfterCodeEdit(o.report, first, filled.text, recorded, []);
    expect(findMissingClauses(pack, out(filled.text), [], { recorded })).toEqual([]);
    // without the re-record the same edit would read as a Drafter rewrite
    const stale = new Map<string, string>();
    findMissingClauses(pack, out(first), [], { recorded: stale });
    expect(
      findMissingClauses(pack, out(filled.text), [], { recorded: stale }).map((m) => m.reason),
    ).toEqual(['clause_not_in_paragraph']);
  });

  it('R2b.4 positive: a repair that changes only the blank sentence is re-recorded', () => {
    const { recorded, o } = firstCheck();
    const repaired = first.replace(BLANK_SENTENCE, 'He was born on 10 March 2026 in Patna.');
    recordAgainAfterCodeEdit(o.report, first, repaired, recorded, [], heldBlankSpans(first, FACTS));
    expect(recorded.get('apprehension')).toContain('10 march 2026');
    expect(findMissingClauses(pack, out(repaired), [], { recorded })).toEqual([]);
  });

  it('R2b.4 negative: a repair that also rewrites the mandatory clause text is NOT re-recorded; the clause is missing', () => {
    const { recorded, o } = firstCheck();
    const before = recorded.get('apprehension');
    const repaired = first
      .replace(BLANK_SENTENCE, 'He was born on 10 March 2026 in Patna.')
      .replace(APPREHENSION, 'The applicant is a student of law.');
    recordAgainAfterCodeEdit(o.report, first, repaired, recorded, [], heldBlankSpans(first, FACTS));
    expect(recorded.get('apprehension')).toBe(before);
    expect(findMissingClauses(pack, out(repaired), [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('control: the same rewrite passed as a code edit (the round-1 bug) would be re-recorded and hide the loss', () => {
    const { recorded, o } = firstCheck();
    const repaired = first
      .replace(BLANK_SENTENCE, 'He was born on 10 March 2026 in Patna.')
      .replace(APPREHENSION, 'The applicant is a student of law.');
    recordAgainAfterCodeEdit(o.report, first, repaired, recorded, []);
    expect(findMissingClauses(pack, out(repaired), [], { recorded })).toEqual([]);
  });

  it('R2b.4 negative: a repair that changes the neighbouring sentence closing mark is not re-recorded', () => {
    const { recorded, o } = firstCheck();
    const repaired = first
      .replace(BLANK_SENTENCE, 'He was born on 10 March 2026 in Patna.')
      .replace('will not flee.', 'will not flee!');
    recordAgainAfterCodeEdit(o.report, first, repaired, recorded, [], heldBlankSpans(first, FACTS));
    expect(findMissingClauses(pack, out(repaired), [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Route level: the same on bail_anticipatory (apprehension is an uncued clause)
// ═════════════════════════════════════════════════════════════════════════════
const USER_ID = '507f1f77bcf86cd7994396c1';
const MODEL = 'claude-sonnet-4-5-20250929';
const KIND = 'bail_anticipatory';
const PACK = loadRulePack(KIND) as RulePack;
const CHECKLIST = buildChecklist(PACK);
const ADDR_LABEL = CHECKLIST.find((i) => i.key === 'address')!.label;
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
const rfact = (key: string, display: string, extra: Record<string, unknown> = {}) => ({
  id: `f_${key}`,
  key,
  label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
  type: 'text',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.99,
  required_in_draft: false,
  ...extra,
});
const factsWith = (address: string) => [
  rfact('applicant_name', 'Ram Kumar', { type: 'person_name' }),
  rfact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  rfact('applicant_age', '32'),
  rfact('address', address),
  rfact('fir_number', '124/2026', { type: 'case_number' }),
  rfact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  rfact('police_station', 'Kotwali', { type: 'police_station' }),
  rfact('facts_narrative', 'apprehends arrest and will not flee'),
];
const reportOf = () =>
  PACK.mandatoryClauses.map((c) => `${c.id}: ${c.id === 'fir_details' ? '2' : '1'}`).join('\n');
const CUES =
  'He undertakes to join the investigation. Details of any earlier bail application are as the brief gives them.';
const P2 = '2. That FIR No. 124/2026 was registered at PS Kotwali.';
const APPREHENSION =
  'That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.';
const P1_BLANK = `1. ${APPREHENSION} He resides at {{MISSING: ${ADDR_LABEL}}}. ${CUES}`;
const draftAnswer = `${P1_BLANK}\n\n${P2}\n\n${CLAUSES_MARKER}\n${reportOf()}`;
const MULTILINE = '123 Main St,\nPatna';

const events = (text: string, name: string): Array<Record<string, any>> =>
  text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));

async function post(address: string, ...repairs: Array<string | null>) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(draftAnswer, 4000, 800));
  for (const r of repairs) {
    if (r !== null) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(r, 400, 80));
  }
  const l = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: KIND,
    runType: 'user',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        facts: factsWith(address),
        unresolved: [],
        createdAt: new Date(),
        reason: 'extract',
      },
    ],
  });
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: KIND,
      values: VALUES,
      ledger_id: String(l._id),
      court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
    });
}
const heldRepairCalls = () =>
  mockMessagesStream.mock.calls.filter((c) => JSON.stringify(c[0]).includes('has a blank for'))
    .length;

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
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

describe('route: a multi-line text fact is repaired by the model, not code-filled', () => {
  it('a short single-line text fact is code-filled with no model repair', async () => {
    const res = await post('123 Main St, Patna');
    expect(heldRepairCalls()).toBe(0);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(events(res.text, 'error')).toEqual([]);
    expect(done[0].missingClauses).toEqual([]);
  });

  it('T-200 R2b.4 (positive): the repair changes only the blank sentence: apprehension stays present', async () => {
    const res = await post(
      MULTILINE,
      `[[P0]]\n1. ${APPREHENSION} He resides at 123 Main St, Patna. ${CUES}`,
    );
    expect(heldRepairCalls()).toBe(1);
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(done[0].missingClauses.map((m: { id: string }) => m.id)).not.toContain('apprehension');
  });

  it('T-200 R2b.4 (negative): the repair also rewrites the mandatory clause sentence: apprehension is reported missing', async () => {
    const res = await post(
      MULTILINE,
      `[[P0]]\n1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a student of law. He resides at 123 Main St, Patna. ${CUES}`,
    );
    expect(heldRepairCalls()).toBe(1);
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(done[0].missingClauses.map((m: { id: string }) => m.id)).toContain('apprehension');
    expect(done[0].mandatoryClausesComplete).toBe(false);
  });

  it('a repair that cannot fill the multi-line fact: withheld with fact_needed, no document, failed row', async () => {
    const res = await post(MULTILINE, `[[P0]]\n${P1_BLANK}`);
    expect(heldRepairCalls()).toBe(1);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'fact_needed', retryable: false, key: 'address' });
    expect(res.text).not.toContain('event: done');
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'failed',
    ]);
  });

  it('a text fact over 300 characters is not code-filled either', async () => {
    const long = `${'Plot number nine, '.repeat(20)}Patna`;
    expect(long.length).toBeGreaterThan(300);
    const res = await post(long, null);
    // the repair answer is not queued: the model call returns nothing useful, the blank stays
    expect(heldRepairCalls()).toBe(1);
    expect(events(res.text, 'error')[0]).toMatchObject({ code: 'fact_needed', key: 'address' });
    expect(res.text).not.toContain('event: done');
  });
});
