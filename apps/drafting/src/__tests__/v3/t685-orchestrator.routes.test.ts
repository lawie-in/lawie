/**
 * T-685 part 2: the v3 orchestrator through POST /generate-from-brief at
 * feature.drafting_v3_stage 2 (Arjun, T-685 answers §3-§9, §11-§13).
 *
 * Covers: the stage events (AC3), the run document delivered (AC1), resume with
 * no model call for a done step and no double charge (AC2), the cost cap both
 * ways (§7, §8), the fail-safe (§3), the lease (§5), and §13 Q5: below stage 2
 * the route's SSE bytes and saved Document are the same as with no hooks.
 *
 * The model is the Anthropic SDK stub; every answer is a fixture, no network.
 * Matters are fictional (the same Ram Kumar fixtures as t611). In-memory Mongo.
 */
import '../setupDb';
import http from 'http';
import type { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../../app';
import { AppSetting } from '../../models/AppSetting.model';
import logger from '../../config/logger';
import { Court } from '../../models/Court.model';
import { LawieDocument } from '../../models/Document.model';
import { FactLedgerModel } from '../../models/FactLedger.model';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { Generation } from '../../models/Generation.model';
import { User } from '../../models/User.model';
import { createVerifiedUser } from '../verifiedUser';
import { cand, readAnswer, readDescription } from './t682-helpers';
import { currentState, loadOwnLedger } from '../../services/fact-ledger.service';
import * as L from '../../services/v3/ledger.service';
import { _clearAppSettingsCache } from '../../services/app-settings.service';
import * as briefDrafter from '../../services/brief-drafter';
import { CLAUSES_MARKER } from '../../services/brief-drafter';
import * as credits from '../../services/credits.service';
import { costForTemplate } from '../../services/credits.service';
import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import { COST_CAP_MESSAGE } from '../../services/v3/orchestrator.service';
import { V3RunModel } from '../../services/v3/run.model';
import { _clearV3StageCache } from '../../services/v3/stage';
import { decrypt } from '../../utils/encryption';
import { sdkAnswer } from '../sdkStream';

jest.setTimeout(60_000);

// The signed skeletons are on by default; these tests drive the legacy text stream.
jest.mock('../../services/rule-pack.service', () => ({
  ...jest.requireActual('../../services/rule-pack.service'),
  loadSkeleton: () => null,
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('../sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439685';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
const START_INK = 2000;
const INK = costForTemplate('bail_regular')!;
const INK_UNITS = INK * 2;

/** §8: the server's plain English fallback, written out here (not imported). */
const SECTION_8_TEXT =
  'This draft needed more work than its Ink covers. Nothing was charged. Please shorten the description or try again later.';

const VALUES = [
  { key: 'applicant_name', value: 'Ramesh Kumar Yadav' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '412/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const CUES =
  ' He is in custody in FIR No. 412/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
const P1_ = `1. That the applicant Ramesh Kumar Yadav has approached this Hon'ble Court for regular bail.${CUES}`;
const P2_ = '2. That FIR No. 412/2026 was registered at PS Kotwali.';
const P3_ = '3. That the applicant is in judicial custody.';
const body = (...extra: string[]) => [P1_, P2_, P3_, ...extra].join('\n\n');

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}
const report = (over: Record<string, string> = {}) =>
  CLAUSE_IDS.map((id) => `${id}: ${over[id] ?? '1'}`).join('\n');
const answer = (b: string, over: Record<string, string> = {}) =>
  `${b}\n\n${CLAUSES_MARKER}\n${report(over)}`;
/** A report that points one clause at a paragraph that does not hold it: the repair pass runs. */
const MISPOINTED = { earlier_applications: '3' };

interface Usage {
  input: number;
  output: number;
}
const USAGE: Usage = { input: 4000, output: 800 };
type Scripted = string | { text: string; usage?: Usage } | Error;
/** One model call per entry, in order; an Error entry fails that call. */
function mockModel(...calls: Scripted[]) {
  mockMessagesStream.mockReset();
  for (const c of calls) {
    if (c instanceof Error) mockMessagesStream.mockRejectedValueOnce(c);
    else {
      const t = typeof c === 'string' ? c : c.text;
      const u = typeof c === 'string' ? USAGE : (c.usage ?? USAGE);
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(t, u.input, u.output));
    }
  }
}

interface Block {
  event: string | null;
  data: Record<string, any> | null;
  raw: string;
}
function blocksOf(text: string): Block[] {
  return text
    .split('\n\n')
    .filter((b) => b.length > 0)
    .map((raw) => {
      const m = /^event: (\S+)\ndata: ([\s\S]*)$/.exec(raw);
      if (m) return { event: m[1], data: JSON.parse(m[2]), raw };
      return { event: null, data: null, raw };
    });
}
const eventsOf = (text: string, name: string) =>
  blocksOf(text)
    .filter((b) => b.event === name)
    .map((b) => b.data!);
const stageBlocks = (text: string) => blocksOf(text).filter((b) => b.event === 'stage');

// ── Fixtures ────────────────────────────────────────────────────────────────

function fact(key: string, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f_${key}_${display.length}`,
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
  };
}
const baseFacts = () => [
  fact('applicant_name', 'Ramesh Kumar Yadav', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '412/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];
let INTAKE_ID: string = randomUUID();

/** What the intake's v3 ledger holds: [key, value, quote in the description]. Fictional. */
const V3_FACTS: Array<[string, string, string]> = [
  ['applicant_name', 'Ramesh Kumar Yadav', 'Ramesh Kumar Yadav'],
  ['father_name', 'Shri Hari Kumar', 'Shri Hari Kumar'],
  ['applicant_age', '32', '32'],
  ['address', '123 Main St, Patna', '123 Main St, Patna'],
  ['fir_number', '412/2026', '412/2026'],
  ['fir_date', '2026-03-10', '10.03.2026'],
  ['police_station', 'Kotwali', 'Kotwali'],
  ['currently_in_custody', 'Yes \u2014 Judicial custody', 'judicial custody'],
  ['facts_narrative', 'He was wrongly named in the FIR.', 'He was wrongly named in the FIR.'],
];
let v3LedgerId = '';

/** The intake's v3 ledger (runId = intakeId), v1, the facts read from one description. */
async function v3Ledger(intakeId = INTAKE_ID) {
  const s = await L.createLedger({
    runId: intakeId,
    userId: USER_ID,
    packId: 'bail_regular',
    intakeId,
  });
  await readDescription(
    s,
    `Applicant aged ${V3_FACTS.map((f) => f[2]).join('; ')}.`,
    V3_FACTS.map(([k, v, q]) => cand(k, v, q)),
    USER_ID,
  );
  v3LedgerId = s.ledgerId;
  return s.ledgerId;
}

/**
 * The v2 ledger doc the route reads for ledger_id (verify stage), plus, unless
 * `v3` is false, the intake's v3 ledger that makes the run a v3 run (§14.3).
 * Returns the v2 id.
 */
async function ledger(
  facts: Array<Record<string, unknown>>,
  opts: { v3?: boolean; intakeId?: string } = {},
) {
  const intakeId = opts.intakeId ?? INTAKE_ID;
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: 'bail_regular',
    runType: 'user',
    intakeId,
    currentVersion: 1,
    versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
  });
  if (opts.v3 !== false) await v3Ledger(intakeId);
  return String(doc._id);
}

function post(ledgerId: string | null, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      values: VALUES,
      court,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      intake_id: INTAKE_ID,
      ...extra,
    });
}

async function setSetting(key: string, value: string | null) {
  await AppSetting.deleteMany({ key });
  if (value !== null) await AppSetting.create({ key, value });
  _clearAppSettingsCache();
  _clearV3StageCache();
}

async function rawUser() {
  return (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkAnnualCarry: number;
    inkHolds: Array<{ runId: string; runSequence: number }>;
  };
}
const generateRows = () =>
  mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
const rawRun = (intakeId = INTAKE_ID) =>
  V3RunModel.collection.findOne({ intakeId }) as Promise<Record<string, any> | null>;
const savedContent = async (docId: string) =>
  decrypt((await LawieDocument.findById(docId).lean())!.generatedContent as string);

/** Nothing was taken: balance as it began, no hold left, no 'generate' ledger row, no document. */
async function expectNoInkTaken() {
  const u = await rawUser();
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  expect(await generateRows()).toEqual([]);
  expect(await LawieDocument.countDocuments({})).toBe(0);
}

beforeEach(async () => {
  INTAKE_ID = randomUUID();
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  _clearV3StageCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({ key: 'feature.drafting_v3_stage', value: '2' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await Court.create({
    courtId: COURT_ID,
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
    inkTopup: START_INK,
  });
  await V3RunModel.init();
});
afterEach(() => {
  jest.restoreAllMocks();
  _clearV3StageCache();
});

// ═════════════════════════════════════════════════════════════════════════════
// a) End to end: the stage events (AC3) and the run document (AC1)
// ═════════════════════════════════════════════════════════════════════════════
describe('a) stage 2 end to end', () => {
  it('draft, repair (round 1), verify, render, done in order, with the exact event format', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body(), MISPOINTED), answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(eventsOf(res.text, 'error')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2); // draft + the clause repair

    const run = await rawRun();
    expect(run).not.toBeNull();
    const runId = run!.attempts[0].runId as string;
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);

    const stages = stageBlocks(res.text);
    // The exact bytes: {stage, round?, runId} in that key order, `round` only on repair.
    expect(stages.map((b) => b.raw)).toEqual([
      `event: stage\ndata: {"stage":"draft","runId":"${runId}"}`,
      `event: stage\ndata: {"stage":"repair","round":1,"runId":"${runId}"}`,
      `event: stage\ndata: {"stage":"verify","runId":"${runId}"}`,
      `event: stage\ndata: {"stage":"render","runId":"${runId}"}`,
      `event: stage\ndata: {"stage":"done","runId":"${runId}"}`,
    ]);
    // Only `repair` carries a round.
    for (const s of stages) {
      expect(Object.keys(s.data!)).toEqual(
        s.data!.stage === 'repair' ? ['stage', 'round', 'runId'] : ['stage', 'runId'],
      );
    }
    // No other field a T-538 event would have.
    expect(res.text).not.toMatch(/"(pct|eta_s|label)"/);
    expect(res.text).not.toMatch(/^id: /m);

    // Order against the other events: the stage `done` is before the route's own `done`.
    const names = blocksOf(res.text)
      .map((b) => (b.event === 'stage' ? `stage:${b.data!.stage}` : b.event))
      .filter((n): n is string => n !== null);
    expect(names.indexOf('stage:draft')).toBeLessThan(names.indexOf('repair'));
    expect(names.indexOf('repair')).toBeLessThan(names.indexOf('stage:verify'));
    expect(names.indexOf('stage:render')).toBeLessThan(names.indexOf('stage:done'));
    expect(names.indexOf('stage:done')).toBeLessThan(names.lastIndexOf('done'));
    expect(eventsOf(res.text, 'done')).toHaveLength(1);
  });

  it('the run doc is delivered: documentId set, expiresAt unset, steps sealed, one charge', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    const done = eventsOf(res.text, 'done');
    expect(done).toHaveLength(1);
    const docId = done[0].docId as string;

    const run = await rawRun();
    expect(run).not.toBeNull();
    expect(run!.status).toBe('delivered');
    expect(run!.documentId).toBe(docId);
    expect(run!.settled).toBe(true);
    expect(run!.expiresAt).toBeUndefined();
    expect(run!.ledgerStore).toBe('v3');
    expect(run!.ledgerId).toBe(v3LedgerId);
    expect(run!.stage).toBe(2);
    expect(String(run!.userId)).toBe(USER_ID);
    expect(run!.attempts).toHaveLength(1);
    expect(run!.attempts[0].outcome).toBe('delivered');
    // Lease given back at the end of the request.
    expect(run!.leaseOwner).toBeUndefined();
    // Steps: done, with ids only outside `sealed`. The draft text is sealed.
    const out = run!.outputs;
    for (const s of ['confirm', 'hold', 'draft', 'deliver']) expect(out[s].status).toBe('done');
    expect(out.deliver.ref).toBe(docId);
    expect(typeof out.draft.sealed).toBe('string');
    expect(JSON.stringify(run)).not.toContain('Ramesh Kumar Yadav');
    expect(JSON.stringify(run)).not.toContain('approached this Hon');
    // Cost summed on the run doc from the one call: 4000 in / 800 out at $3 / $15 per Mtok, x 85.
    expect(run!.costPaiseSoFar).toBeCloseTo(((4000 * 3 + 800 * 15) / 1e6) * 85 * 100, 5);
    expect(run!.capPaise).toBe(900 * INK);
    expect(run!.inkQuoted).toBe(INK);

    // One charge, no hold left, the document is the saved draft.
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(START_INK - INK_UNITS);
    expect(await generateRows()).toHaveLength(1);
    expect(await savedContent(docId)).toContain('Ramesh Kumar Yadav');
  });

  it('the v3 draft is the same text a v2 run saves for the same model answers', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const v3 = await post(id);
    const v3Doc = await savedContent(eventsOf(v3.text, 'done')[0].docId);

    await setSetting('feature.drafting_v3_stage', '1');
    await LawieDocument.deleteMany({});
    await Generation.deleteMany({});
    mockModel(answer(body()));
    const v2 = await post(id);
    expect(stageBlocks(v2.text)).toEqual([]);
    expect(await savedContent(eventsOf(v2.text, 'done')[0].docId)).toBe(v3Doc);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// b) Resume (AC2): done steps replay, the previous hold is released, one charge
// ═════════════════════════════════════════════════════════════════════════════
describe('b) resume with run_id', () => {
  /** Fail the first attempt after its draft is sealed (a plain error in the route's own post-draft check). */
  function crashAfterDraftOnce() {
    return jest.spyOn(briefDrafter, 'findMissingClauses').mockImplementationOnce(() => {
      throw new Error('simulated crash after the draft');
    });
  }

  it('replays the sealed draft with no model call, releases the old hold, charges once', async () => {
    const id = await ledger(baseFacts());
    // Attempt 1: the draft is made and sealed, then the request dies. Its release
    // does not land either (the process died): the hold of (runId, 1) stays.
    mockModel(answer(body()));
    const spy = crashAfterDraftOnce();
    const releaseSpy = jest.spyOn(credits, 'releaseInk').mockResolvedValueOnce({ released: false }); // the route's own release in its failed catch
    const first = await post(id);
    spy.mockRestore();
    expect(eventsOf(first.text, 'error')).toHaveLength(1);
    expect(eventsOf(first.text, 'done')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const runId = (await rawRun())!.attempts[0].runId as string;
    releaseSpy.mockRestore();

    let u = await rawUser();
    expect(u.inkHolds.map((h) => [h.runId, h.runSequence])).toEqual([[runId, 1]]);
    expect(u.inkTopup).toBe(START_INK - INK_UNITS); // held, not yet charged or returned
    const afterFirst = await rawRun();
    expect(afterFirst!.outputs.draft.status).toBe('done');
    expect(afterFirst!.status).toBe('failed');
    const costAfterFirst = afterFirst!.costPaiseSoFar as number;
    expect(costAfterFirst).toBeGreaterThan(0);

    // Attempt 2, run_id resent: the model must not be called again for the draft.
    mockModel(); // any call now would hang the mock: it returns undefined
    const second = await post(id, { run_id: runId });
    expect(second.status).toBe(200);
    expect(eventsOf(second.text, 'error')).toEqual([]);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    const done = eventsOf(second.text, 'done');
    expect(done).toHaveLength(1);

    // The replayed draft is the saved Document.
    expect(await savedContent(done[0].docId)).toContain('approached this Hon');
    expect(await LawieDocument.countDocuments({})).toBe(1);

    // No double charge: the old hold is gone, exactly one settled debit.
    u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(START_INK - INK_UNITS);
    expect(await generateRows()).toHaveLength(1);

    // The run doc: two attempts, cost not paid twice, delivered.
    const run = await rawRun();
    expect(run!.attempts.map((a: any) => [a.runId, a.runSequence, a.outcome])).toEqual([
      [runId, 1, 'failed'],
      [runId, 2, 'delivered'],
    ]);
    expect(run!.costPaiseSoFar).toBe(costAfterFirst);
    expect(run!.status).toBe('delivered');
    expect(run!.documentId).toBe(done[0].docId);
    expect(run!.expiresAt).toBeUndefined();
    // The cap is the one fixed at the first hold: a resume gets no fresh budget.
    expect(run!.capPaise).toBe(900 * INK);
    // An identical resend is not a reset: the cap base is untouched.
    expect(run!.capBasePaise).toBe(0);

    // A replayed step still announces its stage.
    const names = stageBlocks(second.text).map((b) => b.data!.stage);
    expect(names).toEqual(['draft', 'verify', 'render', 'done']);
  });

  it('confirm-hash-change-resets-steps: a new ledger version under the same runId clears the steps and re-fixes the cap', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const spy = crashAfterDraftOnce();
    const first = await post(id);
    spy.mockRestore();
    expect(eventsOf(first.text, 'error')).toHaveLength(1);
    const before = (await rawRun())!;
    const runId = before.attempts[0].runId as string;
    expect(before.outputs.draft.status).toBe('done');
    const v0 = (await L.openLedgerForRun(INTAKE_ID, USER_ID))!.version;
    expect(before.ledgerVersion).toBe(v0);
    expect(before.capBasePaise).toBe(0);
    const cost1 = before.costPaiseSoFar as number;
    expect(cost1).toBeGreaterThan(0);

    // The advocate answers one more question: the ledger moves to the next version.
    const snap = (await L.openLedgerForRun(INTAKE_ID, USER_ID))!;
    await readAnswer(
      snap,
      'He was arrested on 10.10.2026.',
      [cand('arrest_date', '2026-10-10', '10.10.2026', { kind: 'answer', turn: 1 })],
      1,
      USER_ID,
    );
    expect((await L.openLedgerForRun(INTAKE_ID, USER_ID))!.version).toBe(v0 + 1);

    mockModel(answer(body()));
    const second = await post(id, { run_id: runId });
    expect(second.status).toBe(200);
    expect(eventsOf(second.text, 'error')).toEqual([]);
    // The old draft was not replayed against the new facts: the model made it again.
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(eventsOf(second.text, 'done')).toHaveLength(1);
    const run = (await rawRun())!;
    expect(run.status).toBe('delivered');
    expect(run.ledgerVersion).toBe(v0 + 1);
    expect(run.outputs.draft.runSequence).toBe(2);
    expect(run.outputs.draft.ledgerVersion).toBe(v0 + 1);
    // The cap is fixed again on this attempt's quote; the cost so far is its base.
    expect(run.capBasePaise).toBe(cost1);
    expect(run.capPaise).toBe(900 * INK);
    expect(run.costPaiseSoFar).toBeGreaterThan(cost1);
  });

  it('changed values under the same run (same ledger version) also reset: the draft is made again', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const spy = crashAfterDraftOnce();
    await post(id);
    spy.mockRestore();
    const runId = (await rawRun())!.attempts[0].runId as string;
    mockModel(answer(body()));
    const changed = VALUES.map((v) => (v.key === 'applicant_age' ? { ...v, value: '33' } : v));
    const second = await post(id, { run_id: runId, values: changed });
    expect(second.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(eventsOf(second.text, 'done')).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// c) The cost cap (§7, §8)
// ═════════════════════════════════════════════════════════════════════════════
describe('c) cost cap', () => {
  async function expectCapped(res: request.Response, runId: string) {
    const errs = eventsOf(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'cost_cap',
      retryable: false,
      runId,
      reason: SECTION_8_TEXT,
    });
    expect(COST_CAP_MESSAGE).toBe(SECTION_8_TEXT);
    expect(res.text).not.toContain('event: done');
    expect(eventsOf(res.text, 'stage').map((s) => s.stage)).not.toContain('done');
    // The run finished as capped; Ink released; no document; the failed row says why.
    const run = await rawRun();
    expect(run!.status).toBe('capped');
    expect(run!.attempts[run!.attempts.length - 1].outcome).toBe('capped');
    expect(run!.documentId).toBeUndefined();
    expect(run!.leaseOwner).toBeUndefined();
    await expectNoInkTaken();
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    expect(gens[0].failure?.code).toBe('cost_cap');
    expect(gens[0].usageSource).toBe('estimated'); // §14.6
    expect(gens[0].runId).toBe(runId);
  }

  it('projected trip: a call that cannot fit is not made', async () => {
    // 1 paise per Ink: the cap is a few paise, below any call's input + max_tokens estimate.
    await setSetting('ai.cost_cap_paise_per_ink', '1');
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    const run = await rawRun();
    expect(run!.capPaise).toBe(INK);
    expect(run!.costPaiseSoFar).toBe(0);
    await expectCapped(res, run!.attempts[0].runId);
    // Sentry carried no text: the doc has no step output.
    expect(run!.outputs.draft?.sealed).toBeUndefined();
  });

  it('actual trip: a call within the projection that used more than the cap stops the run before the next step', async () => {
    // Cap near 1500 paise. A draft call is projected at about 1100 paise (its input + 8192 output
    // tokens at $15/Mtok x 85), so it is allowed; its actual usage (40k in, 6k out) is about 1785.
    const perInk = Math.floor(1500 / INK);
    await setSetting('ai.cost_cap_paise_per_ink', String(perInk));
    const id = await ledger(baseFacts());
    mockModel(
      { text: answer(body(), MISPOINTED), usage: { input: 40_000, output: 6_000 } },
      answer(body()),
    );
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1); // the repair was not called
    const run = await rawRun();
    expect(run!.capPaise).toBe(perInk * INK);
    expect(run!.costPaiseSoFar).toBeGreaterThanOrEqual(run!.capPaise);
    // The call is counted, and the draft step is sealed with its text for a later attempt.
    expect(run!.outputs.draft.status).toBe('done');
    await expectCapped(res, run!.attempts[0].runId);
    // The usage of the call that tripped it is on the failed row.
    const gen = (await Generation.findOne({ userId: USER_ID }).lean())!;
    expect(gen.llmCalls).toBe(1);
    expect(gen.inputTokens).toBe(40_000);
    expect(gen.outputTokens).toBe(6_000);
  });

  it('a resume of a capped run gets no fresh budget: the cap is kept and the next live call trips', async () => {
    const perInk = Math.floor(1500 / INK);
    await setSetting('ai.cost_cap_paise_per_ink', String(perInk));
    const id = await ledger(baseFacts());
    // The draft is over the cap once made, and a clause repair is still to do.
    mockModel({ text: answer(body(), MISPOINTED), usage: { input: 40_000, output: 6_000 } });
    const first = await post(id);
    const runId = (await rawRun())!.attempts[0].runId as string;
    expect(eventsOf(first.text, 'error')[0].code).toBe('cost_cap');
    const capped = (await rawRun())!;

    // Raise the setting: the resumed run keeps the cap it was given.
    await setSetting('ai.cost_cap_paise_per_ink', '900000');
    mockModel(answer(body()));
    const second = await post(id, { run_id: runId });
    const run = (await rawRun())!;
    expect(run.capPaise).toBe(capped.capPaise);
    expect(run.capBasePaise).toBe(capped.capBasePaise);
    // The draft replays free; the repair is a live call and is refused: the model is not called.
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(eventsOf(second.text, 'error')[0]).toMatchObject({ code: 'cost_cap', retryable: false });
    expect(run.status).toBe('capped');
    await expectNoInkTaken();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// d) Fail safe (§3)
// ═════════════════════════════════════════════════════════════════════════════
describe('d) fail safe', () => {
  async function crashedRunWithDraft(id: string): Promise<string> {
    mockModel(answer(body()));
    const spy = jest.spyOn(briefDrafter, 'findMissingClauses').mockImplementationOnce(() => {
      throw new Error('simulated crash after the draft');
    });
    await post(id);
    spy.mockRestore();
    return (await rawRun())!.attempts[0].runId as string;
  }
  /** Leave `draft` as a crash would: running, nothing sealed. */
  async function leaveDraftRunning(reruns: number) {
    await V3RunModel.collection.updateOne(
      { intakeId: INTAKE_ID },
      {
        $set: { 'outputs.draft.status': 'running', 'outputs.draft.reruns': reruns },
        $unset: { 'outputs.draft.sealed': '', 'outputs.draft.endedAt': '' },
      },
    );
  }

  it('a step found running a second time ends the run: run_failed, not retryable, Ink released', async () => {
    const id = await ledger(baseFacts());
    const runId = await crashedRunWithDraft(id);
    await leaveDraftRunning(1);
    mockModel(answer(body()));
    const res = await post(id, { run_id: runId });
    expect(res.status).toBe(200);
    const errs = eventsOf(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'run_failed',
      retryable: false,
      runId,
      reason: 'The draft did not finish.',
    });
    expect(mockMessagesStream).toHaveBeenCalledTimes(0);
    expect(res.text).not.toContain('event: done');
    const run = await rawRun();
    expect(run!.status).toBe('failed');
    expect(run!.leaseOwner).toBeUndefined();
    await expectNoInkTaken();
    const gens = await Generation.find({ userId: USER_ID, runSequence: 2 }).lean();
    expect(gens).toHaveLength(1);
    expect(gens[0].status).toBe('failed');
    expect(gens[0].failure?.code).toBe('run_failed');
    expect(gens[0].usageSource).toBe('estimated'); // §14.6
  });

  it('a step found running the first time re-runs once, at our cost, and delivers', async () => {
    const id = await ledger(baseFacts());
    const runId = await crashedRunWithDraft(id);
    await leaveDraftRunning(0);
    mockModel(answer(body()));
    const res = await post(id, { run_id: runId });
    expect(eventsOf(res.text, 'error')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(eventsOf(res.text, 'done')).toHaveLength(1);
    const run = await rawRun();
    expect(run!.outputs.draft.status).toBe('done');
    expect(run!.outputs.draft.reruns).toBe(1);
    expect(run!.status).toBe('delivered');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// e) The lease (§5)
// ═════════════════════════════════════════════════════════════════════════════
describe('e) lease', () => {
  it('a second concurrent request on the same run is 409 Draft already in progress', async () => {
    const id = await ledger(baseFacts());
    // Request 1 waits on its model call.
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      await gate;
      return sdkAnswer(answer(body()), 4000, 800);
    });
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const first = request(`http://127.0.0.1:${port}`)
        .post('/generate-from-brief')
        .set(headers())
        .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: id, intake_id: INTAKE_ID })
        .then((r) => r);
      const t0 = Date.now();
      while (mockMessagesStream.mock.calls.length === 0) {
        if (Date.now() - t0 > 8000) throw new Error('first request never reached the model');
        await new Promise((r) => setTimeout(r, 10));
      }
      // The lease is held by the first request.
      const held = await rawRun();
      expect(held!.leaseOwner).toBeTruthy();
      expect(new Date(held!.leaseUntil).getTime()).toBeGreaterThan(Date.now());

      const second = await request(`http://127.0.0.1:${port}`)
        .post('/generate-from-brief')
        .set(headers())
        .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: id, intake_id: INTAKE_ID });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('Draft already in progress');
      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
      // The refused request took no hold and wrote no stage event.
      expect((await rawUser()).inkHolds).toHaveLength(1);
      expect(second.text).not.toContain('event: stage');

      open();
      const r1 = await first;
      expect(r1.status).toBe(200);
      expect(eventsOf(r1.text, 'done')).toHaveLength(1);
      // The lease is given back at the end; a later request is not refused.
      expect((await rawRun())!.leaseOwner).toBeUndefined();
      expect((await rawUser()).inkHolds).toEqual([]);
    } finally {
      open();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a request that ends in an error gives the lease back too', async () => {
    const id = await ledger(baseFacts());
    mockModel(new Error('503 service unavailable'));
    const res = await post(id);
    expect(eventsOf(res.text, 'error')).toHaveLength(1);
    expect((await rawRun())!.leaseOwner).toBeUndefined();
    // So the advocate's retry is not told "in progress".
    mockModel(answer(body()));
    const retry = await post(id);
    expect(retry.status).toBe(200);
    expect(eventsOf(retry.text, 'done')).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// f) Below stage 2 nothing changes (§13 Q5)
// ═════════════════════════════════════════════════════════════════════════════
describe('f) stage < 2 is unchanged', () => {
  /** Ids and times differ per request; the bytes around them must not. */
  function normalise(text: string): string {
    return text
      .replace(/[0-9a-f]{24}/g, '<oid>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
      .replace(/"durationMs":\d+/g, '"durationMs":0');
  }
  async function reset() {
    await LawieDocument.deleteMany({});
    await Generation.deleteMany({});
    await mongoose.connection.db!.collection('inkledger').deleteMany({});
    await User.collection.updateOne(
      { _id: OID },
      { $set: { inkSub: 0, inkAnnualCarry: 0, inkTopup: START_INK, inkHolds: [], inkSettled: [] } },
    );
    await V3RunModel.deleteMany({});
  }

  interface Shape {
    name: string;
    answers: Scripted[];
    send: (ledgerId: string) => request.Test;
    facts: () => Array<Record<string, unknown>>;
  }
  const RUN_ID = randomUUID();
  const SHAPES: Shape[] = [
    {
      name: 'ledger path with a repair round (intake_id and ledger present)',
      answers: [answer(body(), MISPOINTED), answer(body())],
      send: (id) => post(id, { run_id: RUN_ID }),
      facts: baseFacts,
    },
    {
      name: 'no ledger, body streamed (intake_id sent, no ledger_id)',
      answers: [answer(body())],
      send: () => post(null, { run_id: RUN_ID }),
      facts: baseFacts,
    },
  ];

  describe.each(SHAPES)('$name', (shape) => {
    async function runAt(stage: string | null) {
      await reset();
      await setSetting('feature.drafting_v3_stage', stage);
      await FactLedgerV3Model.deleteMany({});
      await FactLedgerModel.deleteMany({});
      const id = await ledger(shape.facts(), { intakeId: randomUUID(), v3: false });
      // The intake's own v3 ledger exists too: below stage 2 it must not matter.
      await ledger(shape.facts());
      mockModel(...shape.answers);
      const res = await shape.send(id);
      expect(res.status).toBe(200);
      const done = eventsOf(res.text, 'done');
      expect(done).toHaveLength(1);
      const doc = await LawieDocument.findOne({}).lean();
      return {
        sse: normalise(res.text),
        saved: await savedContent(done[0].docId),
        calls: mockMessagesStream.mock.calls.length,
        prompts: mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])),
        sections: JSON.stringify(doc!.sectionsCited),
        runs: await V3RunModel.countDocuments({}),
        stageEvents: stageBlocks(res.text).length,
      };
    }

    it('stage unset (no hooks), 0 and 1 give byte-equal SSE, the same saved Document and the same model calls', async () => {
      const base = await runAt(null);
      const s0 = await runAt('0');
      const s1 = await runAt('1');
      for (const r of [base, s0, s1]) {
        expect(r.stageEvents).toBe(0);
        expect(r.runs).toBe(0);
        expect(r.sse).not.toContain('event: stage');
      }
      expect(s0.sse).toBe(base.sse);
      expect(s1.sse).toBe(base.sse);
      expect(s0.saved).toBe(base.saved);
      expect(s1.saved).toBe(base.saved);
      expect(s0.calls).toBe(base.calls);
      expect(s1.calls).toBe(base.calls);
      expect(s1.prompts).toEqual(base.prompts);
      expect(s0.prompts).toEqual(base.prompts);
      expect(s1.sections).toBe(base.sections);
    });
  });

  it('stage 2 with no ledger for the intake runs v2: no run doc, no stage event, same bytes as stage 1', async () => {
    mockModel(answer(body()));
    const none = await post(null);
    await reset();
    await setSetting('feature.drafting_v3_stage', '1');
    mockModel(answer(body()));
    const v2 = await post(null);
    expect(await V3RunModel.countDocuments({})).toBe(0);
    expect(stageBlocks(none.text)).toEqual([]);
    expect(normalise(none.text)).toBe(normalise(v2.text));
  });

  it('stage 2 with only a v2 ledger runs v2 (§14.3): no run doc, no stage event, the draft is delivered', async () => {
    const id = await ledger(baseFacts(), { v3: false });
    mockModel(answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(eventsOf(res.text, 'done')).toHaveLength(1);
    expect(stageBlocks(res.text)).toEqual([]);
    expect(await V3RunModel.countDocuments({})).toBe(0);
  });

  it('stage 2 with no ai.rates.* row runs v2 (§14.4): the cap cannot be enforced, so no run doc', async () => {
    const id = await ledger(baseFacts());
    await AppSetting.deleteMany({ key: /^ai\.rates\./ });
    _clearAppSettingsCache();
    mockModel(answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(eventsOf(res.text, 'done')).toHaveLength(1);
    expect(stageBlocks(res.text)).toEqual([]);
    expect(await V3RunModel.countDocuments({})).toBe(0);
  });

  it('Q5: a fixture intake written at stage 1 (v2 ledger) gives byte-equal facts from both readers', async () => {
    const id = await ledger(
      [...baseFacts(), fact('police_station', 'Sadar', { type: 'police_station' })],
      {
        v3: false,
      },
    );
    const snap = (await L.openLedger(id, USER_ID))!;
    expect(snap.store).toBe('v2');
    const v3Reader = L.factsForGeneration(snap, { derived: false });
    const v2Reader = currentState((await loadOwnLedger(id, USER_ID))!);
    expect(JSON.stringify(v3Reader.facts)).toBe(JSON.stringify(v2Reader.facts));
    expect(JSON.stringify(v3Reader.unresolved)).toBe(JSON.stringify(v2Reader.unresolved));
  });

  it('stage 2 with no intake_id runs v2', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: id });
    expect(res.status).toBe(200);
    expect(stageBlocks(res.text)).toEqual([]);
    expect(await V3RunModel.countDocuments({})).toBe(0);
  });

  it('stage 3 also runs the orchestrator (the flag is a number, not a switch)', async () => {
    await setSetting('feature.drafting_v3_stage', '3');
    const id = await ledger(baseFacts());
    mockModel(answer(body()));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(stageBlocks(res.text).length).toBeGreaterThan(0);
    expect((await rawRun())!.stage).toBe(3);
  });

  it('a guided draft (kind none) at stage 2 is v2', async () => {
    mockModel('Date: [To be confirmed: date]\n\n1. That I consent.');
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'none',
        kind_name: 'consent letter',
        values: [{ key: 'fixed.first_party', value: 'Sunita Devi' }],
        intake_id: INTAKE_ID,
      });
    expect(stageBlocks(res.text)).toEqual([]);
    expect(await V3RunModel.countDocuments({})).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// g) Arjun's §14 rulings
// ═════════════════════════════════════════════════════════════════════════════
describe('g) §14 rulings', () => {
  const draftStep = async () => (await rawRun())!.outputs.draft;
  async function runIdOf() {
    return (await rawRun())!.attempts[0].runId as string;
  }

  it('§14.2 (i): provider failures (503, 429, network) never count as re-runs; a later success delivers', async () => {
    const id = await ledger(baseFacts());
    let runId: string | undefined;
    const cases: Array<[string, string]> = [
      ['service temporarily unavailable', 'provider_unavailable'],
      ['rate limit exceeded', 'rate_limited'],
      ['fetch failed', 'network'],
    ];
    for (const [msg, code] of cases) {
      mockModel(new Error(msg));
      const r = await post(id, runId ? { run_id: runId } : {});
      const errs = eventsOf(r.text, 'error');
      expect(errs).toHaveLength(1);
      expect(errs[0].code).toBe(code); // the code the stream sends today
      runId ??= await runIdOf();
      const step = await draftStep();
      expect(step.status).toBe('failed');
      expect(step.reason).toBe('provider_failed');
      expect(step.reruns).toBe(0);
      expect(step.retries).toBe(0);
    }
    mockModel(answer(body()));
    const ok = await post(id, { run_id: runId });
    expect(eventsOf(ok.text, 'error')).toEqual([]);
    expect(eventsOf(ok.text, 'done')).toHaveLength(1);
    const run = (await rawRun())!;
    expect(run.status).toBe('delivered');
    expect(run.outputs.draft.status).toBe('done');
    expect(JSON.stringify(run)).not.toContain('run_failed');
    // Failed calls were still costed on the run (summed, never paid for twice at the user).
    expect(run.costPaiseSoFar).toBeGreaterThan(0);
  });

  it('§14.2: a non-provider failure gets one re-run, then retry_exhausted; blocked at 5 min, re-runnable at 16 min', async () => {
    const id = await ledger(baseFacts());
    mockModel(new Error('invalid request'));
    const r1 = await post(id);
    expect(eventsOf(r1.text, 'error')[0].code).toBe('invalid_request');
    const runId = await runIdOf();
    expect((await draftStep()).status).toBe('failed');
    expect((await draftStep()).reason).not.toBe('provider_failed');

    // The one re-run fails the same way.
    mockModel(new Error('invalid request'));
    const r2 = await post(id, { run_id: runId });
    expect(eventsOf(r2.text, 'error')[0].code).toBe('invalid_request');
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect((await draftStep()).retries).toBe(1);

    // The next attempt is not allowed to call the model: retry_exhausted, run_failed.
    mockModel(answer(body()));
    const r3 = await post(id, { run_id: runId });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(eventsOf(r3.text, 'error')[0]).toMatchObject({
      code: 'run_failed',
      retryable: false,
      runId,
    });
    expect((await draftStep()).reason).toBe('retry_exhausted');
    await expectNoInkTaken();

    const setEnded = (msAgo: number) =>
      V3RunModel.collection.updateOne(
        { intakeId: INTAKE_ID },
        { $set: { 'outputs.draft.endedAt': new Date(Date.now() - msAgo) } },
      );
    // 5 minutes after it was set: still blocked.
    await setEnded(5 * 60_000);
    mockModel(answer(body()));
    const r4 = await post(id, { run_id: runId });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(eventsOf(r4.text, 'error')[0].code).toBe('run_failed');

    // 16 minutes: one more re-run, which delivers.
    await setEnded(16 * 60_000);
    mockModel(answer(body()));
    const r5 = await post(id, { run_id: runId });
    expect(eventsOf(r5.text, 'error')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(eventsOf(r5.text, 'done')).toHaveLength(1);
    expect((await rawRun())!.status).toBe('delivered');
  });

  describe('§14.4: a model with no rate is priced at the highest configured rate, never 0', () => {
    beforeEach(async () => {
      await AppSetting.create({
        key: 'ai.rates.claude-pricey-test',
        value: JSON.stringify({ input_usd_per_mtok: 3.5, output_usd_per_mtok: 17.5 }),
      });
      await setSetting('ai.drafting_model', 'claude-unrated-test');
    });

    it('costed at the table highest (field by field), with one warn that carries ids only', async () => {
      const warn = jest.spyOn(logger, 'warn');
      const id = await ledger(baseFacts());
      mockModel(answer(body()));
      const res = await post(id);
      expect(eventsOf(res.text, 'done')).toHaveLength(1);
      const run = (await rawRun())!;
      expect(run.costPaiseSoFar).toBeCloseTo(((4000 * 3.5 + 800 * 17.5) / 1e6) * 85 * 100, 5);
      const warns = warn.mock.calls.filter((c) => String(c[1]).includes('no rate for the model'));
      expect(warns).toHaveLength(1);
      const ctx = warns[0][0] as Record<string, unknown>;
      expect(Object.keys(ctx).sort()).toEqual(['intakeId', 'model', 'runId']);
      expect(ctx.model).toBe('claude-unrated-test');
      expect(JSON.stringify(warns[0])).not.toContain('Ramesh');
    });

    it('the cap still trips for it', async () => {
      await setSetting('ai.cost_cap_paise_per_ink', '1');
      const id = await ledger(baseFacts());
      mockModel(answer(body()));
      const res = await post(id);
      expect(mockMessagesStream).not.toHaveBeenCalled();
      expect(eventsOf(res.text, 'error')[0]).toMatchObject({ code: 'cost_cap', retryable: false });
      expect((await rawRun())!.status).toBe('capped');
    });
  });
});
