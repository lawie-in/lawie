/**
 * T-147e AC4 (release-blocking) — fixture isolation, verified not assumed.
 *
 * A golden-set run writes to the production database (there is no dev
 * database). So after a fixture run, three things must hold, and this file
 * demonstrates each of them through the real routes:
 *
 *   (a) no fixture matter appears in any user-facing list;
 *   (b) no fixture draft counts against any Ink or drops balance;
 *   (c) no fixture row lands in analytics.
 *
 * The setup is one fixture run (the reserved fixture user: describe, ledger,
 * draft with verifier violations, export) next to one normal user doing the
 * same, so that every "nothing from the fixture" assertion has a "the normal
 * user's own rows are still there" assertion beside it. A filter that hides
 * everything would fail those.
 *
 * Then the security properties: nothing a request says can make a normal
 * user's rows fixture, and the reserved id cannot be reached without the
 * internal secret.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { enforceCredits } from '../middleware/enforceCredits';
import { enforceFreeLimit, FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { spendCapCheck } from '../middleware/spendCap';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { CreditLedger } from '../models/CreditLedger.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { FactDiff } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { PlaceholderRate } from '../models/PlaceholderRate.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { spendInk } from '../services/credits.service';
import { loadWeeklyFactDiffData } from '../services/fact-diff-log';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  GOLDEN_SET_USER_ID,
  isFixtureUser,
  NOT_FIXTURE,
  NOT_FIXTURE_GENERATION,
  runOriginFor,
} from '../services/run-origin';
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
// The PDF engine is not what is under test; the export route's Event rows are.
jest.mock('../services/pdf-export.service', () => ({
  ...jest.requireActual('../services/pdf-export.service'),
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 stub')),
}));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const FIX = GOLDEN_SET_USER_ID;
const REAL = '507f1f77bcf86cd7994390b1';
const ADMIN = '507f1f77bcf86cd7994390b9';
const MODEL = 'claude-sonnet-4-5-20250929';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const COURT_ID = 'district_sessions_patna';
const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const CHECKLIST = buildChecklist(PACK);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

function headers(
  userId: string,
  extra: Record<string, string> = {},
  role = 'Client',
  plan = 'free',
) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'u@test.com',
    'x-user-name': userId === REAL ? 'Real Advocate' : 'Someone',
    'x-user-plan': plan,
    'x-user-role': role,
    ...extra,
  };
}
const admin = () => headers(ADMIN, {}, 'Admin', 'pro');

// ── model answers ────────────────────────────────────────────────────────────
const MATCH_MACT = JSON.stringify({
  template_id: 'mact_claim',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'legal document',
  category: 'other',
});
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });
const EXTRACT = JSON.stringify({
  facts: [{ key: 'police_station', span: 'PS Kotwali', confidence: 0.99 }],
});
const DESC =
  'Mere client Ramesh ka accident 12/3/26 ko hua tha, PS Kotwali mein FIR 45/26 darj hui.';

const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');
const answer = (body: string) => `${body}\n\n${CLAUSES_MARKER}\n${report()}`;
// A banned phrase and a section the ledger does not hold: two verifier violations.
const BAD2 = [
  '1. That the applicant Ram Kumar is a law-abiding citizen.',
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
  '4. That the offence is under Section 318 of the Bharatiya Nyaya Sanhita, 2023.',
].join('\n\n');

function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 4000, 800));
}

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

function fact(key: string, display: string, extra: Record<string, unknown> = {}) {
  return {
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
  };
}
const baseFacts = () => [
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

function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  return blocks.length === 0 ? null : JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}

/**
 * One whole matter, as the golden-set runner does it, but for any user:
 * describe (intake: LlmAuxCall + FactLedger path), a ledger, a draft with two
 * verifier violations and a failed repair (Document, Generation, FactDiff,
 * PlaceholderRate), and a PDF export (Event). Everything over the real routes
 * except the ledger row, which is written as the service writes it: with
 * `runType: 'user'` whoever the user is, so that the fixture marking is the
 * plugin's work and not the test's.
 */
async function runMatter(userId: string, intakeId: string) {
  mockModel(MATCH_MACT, EMPTY_READ, EXTRACT);
  const intake = await request(app)
    .post('/intake/brief')
    .set(headers(userId))
    .send({ description: DESC, intake_id: intakeId });
  expect(intake.status).toBe(200);
  expect(intake.body.outcome).toBe('brief');

  const ledger = await FactLedgerModel.create({
    userId,
    documentKind: 'bail_regular',
    runType: 'user',
    currentVersion: 1,
    versions: [
      { version: 1, facts: baseFacts(), unresolved: [], createdAt: new Date(), reason: 'extract' },
    ],
  });

  mockModel(answer(BAD2), 'Sorry, no.');
  const gen = await request(app)
    .post('/generate-from-brief')
    .set(headers(userId))
    .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: String(ledger._id) });
  expect(gen.status).toBe(200);
  const done = event(gen.text, 'done');
  expect(done?.docId).toBeTruthy();
  const docId = done!.docId as string;

  const exp = await request(app).post(`/${docId}/export/pdf`).set(headers(userId)).send({});
  expect(exp.status).toBe(200);
  return { docId, ledgerId: String(ledger._id), runId: done!.runId as string };
}

let fixtureRun: Awaited<ReturnType<typeof runMatter>>;
let realRun: Awaited<ReturnType<typeof runMatter>>;
const INK_BEFORE = 2000;

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await AppSetting.create({
    key: `ai.rates.${INTAKE_MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
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
  // The real user has a name and Ink. The fixture user has NO users row, by design.
  await User.create({
    _id: REAL,
    name: 'Real Advocate',
    email: 'real@test.com',
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: INK_BEFORE,
  });
  await User.create({
    _id: ADMIN,
    name: 'Admin',
    email: 'admin@test.com',
    plan: 'pro',
    planTier: 'pro',
  });

  fixtureRun = await runMatter(FIX, '11111111-1111-4111-8111-111111111111');
  realRun = await runMatter(REAL, '22222222-2222-4222-8222-222222222222');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Control: the run happened, and the real user's own rows are all there
// ═════════════════════════════════════════════════════════════════════════════
describe('the setup is real: both runs wrote rows, the fixture run through the reserved user', () => {
  it('the fixture run wrote a Document, Generation, ledger, LlmAuxCall, Event, FactDiff and PlaceholderRate', async () => {
    const f = { userId: FIX };
    expect(await LawieDocument.countDocuments(f)).toBe(1);
    expect(await Generation.countDocuments(f)).toBe(1);
    expect(await FactLedgerModel.countDocuments(f)).toBe(2); // the intake's, and the bail ledger
    expect(await LlmAuxCall.countDocuments(f)).toBeGreaterThan(0);
    expect(await Event.countDocuments(f)).toBeGreaterThan(0);
    expect(await FactDiff.countDocuments(f)).toBeGreaterThan(0);
    expect(await PlaceholderRate.countDocuments({})).toBe(2); // one per draft
  });

  it('the normal user wrote the same rows, and every one of them is a user row', async () => {
    const f = { userId: REAL };
    expect(await LawieDocument.countDocuments({ ...f, runType: 'user' })).toBe(1);
    expect(await Generation.countDocuments({ ...f, runOrigin: 'user' })).toBe(1);
    expect(await FactLedgerModel.countDocuments({ ...f, runType: 'user' })).toBe(2);
    expect(await LlmAuxCall.countDocuments({ ...f, runType: 'fixture' })).toBe(0);
    expect(await LlmAuxCall.countDocuments({ ...f, runType: 'user' })).toBeGreaterThan(0);
    expect(await Event.countDocuments({ ...f, runType: 'fixture' })).toBe(0);
    expect(await FactDiff.countDocuments({ ...f, runType: 'fixture' })).toBe(0);
    expect(await FactDiff.countDocuments({ ...f, runType: 'real' })).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (c) first, because (a) and (b) lean on the marking: every row is tagged
// ═════════════════════════════════════════════════════════════════════════════
describe('AC4(c): every row written for the fixture user is tagged fixture', () => {
  it('Document.runType', async () => {
    const docs = await LawieDocument.find({ userId: FIX }).lean();
    expect(docs.map((d) => d.runType)).toEqual(['fixture']);
  });

  it('Generation.runOrigin is fixture, and Generation.runType keeps its T-110 meaning (initial)', async () => {
    const gens = await Generation.find({ userId: FIX }).lean();
    expect(gens).toHaveLength(1);
    expect(gens[0].runOrigin).toBe('fixture');
    expect(gens[0].runType).toBe('initial');
  });

  it('LlmAuxCall.runType: every intake call of the run', async () => {
    const rows = await LlmAuxCall.find({ userId: FIX }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.runType === 'fixture')).toBe(true);
  });

  it('Event.runType: the export events', async () => {
    const rows = await Event.find({ userId: FIX }).lean();
    expect(rows.map((r) => r.type).sort()).toEqual(['activation_first_export', 'draft.exported']);
    expect(rows.every((r) => r.runType === 'fixture')).toBe(true);
  });

  it('FactLedger.runType: written as "user" by the service, stored as fixture', async () => {
    const rows = await FactLedgerModel.find({ userId: FIX }).lean();
    expect(rows.map((r) => r.runType)).toEqual(['fixture', 'fixture']);
  });

  it('FactDiff.runType and PlaceholderRate.runType follow the ledger: fixture for this run, real for the other', async () => {
    const diffs = await FactDiff.find({ userId: FIX }).lean();
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((r) => r.runType === 'fixture')).toBe(true);
    expect((await FactDiff.find({ userId: REAL }).lean()).every((r) => r.runType === 'real')).toBe(
      true,
    );
    // PlaceholderRate has no userId; one row per draft, one of each.
    const rates = await PlaceholderRate.find({}).lean();
    expect(rates.map((r) => r.runType).sort()).toEqual(['fixture', 'real']);
  });

  it('a sweep of every collection: no row for the fixture user lacks a fixture marker', async () => {
    const oid = new mongoose.Types.ObjectId(FIX);
    const unmarked: string[] = [];
    let collectionsWithFixtureRows = 0;
    for (const c of await mongoose.connection.db!.collections()) {
      const rows = await c.find({ $or: [{ userId: oid }, { userId: FIX }] }).toArray();
      if (rows.length === 0) continue;
      collectionsWithFixtureRows += 1;
      for (const r of rows) {
        if (r['runType'] !== 'fixture' && r['runOrigin'] !== 'fixture')
          unmarked.push(c.collectionName);
      }
    }
    expect(collectionsWithFixtureRows).toBeGreaterThanOrEqual(5);
    expect(unmarked).toEqual([]);
  });

  it('a row written for the fixture user is tagged even when the writer says "user" (plugin, create and save)', async () => {
    const d = await LawieDocument.create({
      userId: FIX,
      title: 't',
      docType: 'bail_application',
      generatedContent: 'x',
      runType: 'user',
    });
    expect(d.runType).toBe('fixture');
    const e = new Event({ userId: FIX, type: 'x', runType: 'user' });
    await e.save();
    expect((await Event.findById(e._id).lean())!.runType).toBe('fixture');
    const g = await Generation.create({
      userId: FIX,
      docType: 'bail_application',
      tokensUsed: 1,
      runOrigin: 'user',
    });
    expect(g.runOrigin).toBe('fixture');
    // and an UPDATE cannot turn it back: save() re-validates
    d.runType = 'user';
    await d.save();
    expect((await LawieDocument.findById(d._id).lean())!.runType).toBe('fixture');
  });
});

describe('AC4(c): admin aggregates exclude fixture rows', () => {
  it('/admin/documents/analytics: totals, doc types, templates and AI cost count the normal user only', async () => {
    const realGen = (await Generation.findOne({ userId: REAL }).lean())!;
    const res = await request(app).get('/admin/documents/analytics').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.kpis.totalDocs).toBe(1);
    expect(res.body.kpis.totalDocsThisMonth).toBe(1);
    expect(res.body.kpis.aiGenCount).toBe(1);
    const typed = (res.body.docTypeBreakdown as Array<{ count: number }>).reduce(
      (n, t) => n + t.count,
      0,
    );
    expect(typed).toBe(1);
    const templated = (res.body.templateUsage as Array<{ count: number }>).reduce(
      (n, t) => n + t.count,
      0,
    );
    expect(templated).toBeLessThanOrEqual(1);
    expect(res.body.kpis.aiCostInr).toBeGreaterThanOrEqual(0);
    // the cost is the real user's cost alone
    const usd = (await Generation.aggregate([
      { $match: { runOrigin: { $ne: 'fixture' } } },
      { $group: { _id: null, c: { $sum: '$costUsd' } } },
    ])) as Array<{ c: number }>;
    expect(usd[0].c).toBe(realGen.costUsd);
  });

  it("/admin/ai-usage: tokens, cost and generation count are the normal user's alone", async () => {
    const realGen = (await Generation.findOne({ userId: REAL }).lean())!;
    const fixGen = (await Generation.findOne({ userId: FIX }).lean())!;
    expect(fixGen.tokensUsed).toBeGreaterThan(0); // the fixture row is not empty
    const res = await request(app).get('/admin/ai-usage').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.generationCount).toBe(1);
    expect(res.body.totalTokens).toBe(realGen.tokensUsed);
    expect(res.body.totalCostUsd).toBe(realGen.costUsd);
  });

  it("/admin/overview/kpis: drafts generated counts the normal user's draft only", async () => {
    const res = await request(app).get('/admin/overview/kpis').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.draftsGenerated.value).toBe(1);
  });

  it("/admin/overview/activity: one draft in the feed, the normal user's", async () => {
    const res = await request(app).get('/admin/overview/activity').set(admin());
    expect(res.status).toBe(200);
    const drafts = (res.body.items as Array<{ type: string; label: string }>).filter(
      (i) => i.type === 'draft',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].label).toContain('Real Advocate');
  });

  it("/admin/documents/exports: only the normal user's export, though both were exported", async () => {
    expect(await LawieDocument.countDocuments({ status: 'exported' })).toBe(2);
    const res = await request(app).get('/admin/documents/exports').set(admin());
    expect(res.status).toBe(200);
    expect((res.body.exports as Array<{ _id: string }>).map((e) => e._id)).toEqual([realRun.docId]);
  });

  it('/admin/users/:id: the draft count ignores fixture-marked documents, even under a real user id', async () => {
    await LawieDocument.create({
      userId: REAL,
      title: 'fixture marked',
      docType: 'bail_application',
      generatedContent: 'x',
      runType: 'fixture',
    });
    const res = await request(app).get(`/admin/users/${REAL}`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.draftCount).toBe(1);
  });

  it('/admin/users: the fixture user is in no user list or count (it has no users row)', async () => {
    expect(await User.countDocuments({ _id: FIX })).toBe(0);
    const res = await request(app).get('/admin/users').set(admin());
    expect(res.status).toBe(200);
    expect((res.body.users as Array<{ _id: string }>).map((u) => u._id)).not.toContain(FIX);
    expect(res.body.total).toBe(2); // real + admin
    expect((await request(app).get(`/admin/users/${FIX}`).set(admin())).status).toBe(404);
    const kpis = await request(app).get('/admin/overview/kpis').set(admin());
    expect(kpis.body.activeAdvocates.value).toBe(2);
  });

  it('the weekly fact-diff report reads real rows only and counts the fixture rows apart', async () => {
    const data = await loadWeeklyFactDiffData(
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
    );
    const realDiffs = await FactDiff.countDocuments({ runType: 'real' });
    const fixDiffs = await FactDiff.countDocuments({ runType: 'fixture' });
    expect(realDiffs).toBeGreaterThan(0);
    expect(fixDiffs).toBeGreaterThan(0);
    expect(data.rows).toHaveLength(realDiffs);
    expect(data.fixtureRows).toBe(fixDiffs);
    expect(data.rates).toHaveLength(1);
  });

  it('the filters themselves: NOT_FIXTURE and NOT_FIXTURE_GENERATION keep untagged (pre-T-147e) rows', async () => {
    await mongoose.connection.collection('documents').insertOne({
      userId: new mongoose.Types.ObjectId(REAL),
      title: 'old row',
      docType: 'bail_application',
      generatedContent: 'x',
      isDeleted: false,
    });
    await mongoose.connection.collection('generations').insertOne({
      userId: new mongoose.Types.ObjectId(REAL),
      docType: 'bail_application',
      tokensUsed: 1,
    });
    expect(await LawieDocument.countDocuments({ userId: REAL, ...NOT_FIXTURE })).toBe(2);
    expect(await Generation.countDocuments({ userId: REAL, ...NOT_FIXTURE_GENERATION })).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) no fixture matter appears in any user-facing list
// ═════════════════════════════════════════════════════════════════════════════
describe('AC4(a): no fixture matter in any user-facing list', () => {
  it('My documents, for the fixture user: empty, though it has a document', async () => {
    expect(await LawieDocument.countDocuments({ userId: FIX, isDeleted: { $ne: true } })).toBe(1);
    const res = await request(app).get('/').set(headers(FIX));
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });

  it('My documents, for a normal user: their own draft and nothing marked fixture, even under their own id', async () => {
    await LawieDocument.create({
      userId: REAL,
      title: 'FIXTURE-MARKED UNDER A REAL ID',
      docType: 'bail_application',
      generatedContent: 'x',
      runType: 'fixture',
    });
    const res = await request(app).get('/').set(headers(REAL));
    expect(res.status).toBe(200);
    const ids = (res.body.documents as Array<{ _id: string; title: string }>).map((d) => d._id);
    expect(ids).toEqual([realRun.docId]);
    expect(JSON.stringify(res.body)).not.toContain('FIXTURE-MARKED');
    expect(ids).not.toContain(fixtureRun.docId);
  });

  it('a normal user cannot see the fixture document by id either', async () => {
    expect((await request(app).get(`/${fixtureRun.docId}`).set(headers(REAL))).status).toBe(404);
    expect((await request(app).get(`/${realRun.docId}`).set(headers(REAL))).status).toBe(200);
  });

  it("/documents/usage: the fixture user has used nothing; a normal user's count is their own draft only", async () => {
    const fix = await request(app).get('/usage').set(headers(FIX));
    expect(fix.body.used).toBe(0);
    expect(fix.body.remaining).toBe(FREE_TIER_MONTHLY_LIMIT);
    // fixture-marked generations under a real id are not counted
    await Generation.create([
      { userId: REAL, docType: 'bail_application', tokensUsed: 1, runOrigin: 'fixture' },
      { userId: REAL, docType: 'bail_application', tokensUsed: 1, runOrigin: 'fixture' },
    ]);
    const real = await request(app).get('/usage').set(headers(REAL));
    expect(real.body.used).toBe(1);
    expect(real.body.remaining).toBe(FREE_TIER_MONTHLY_LIMIT - 1);
  });

  it('the rating bonus: a fixture draft is not found by the rating route (no Ink for a fixture draft)', async () => {
    await LawieDocument.updateOne({ _id: realRun.docId }, { $set: { runType: 'fixture' } });
    const res = await request(app)
      .post(`/credits/rate/${realRun.docId}`)
      .set(headers(REAL))
      .send({ stars: 5 });
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (b) no fixture draft counts against Ink or drops
// ═════════════════════════════════════════════════════════════════════════════
function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown } as {
    statusCode: number;
    body: unknown;
    status: (c: number) => typeof res;
    json: (b: unknown) => typeof res;
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
}
const fakeReq = (sub: string, body: Record<string, unknown> = {}, plan = 'free') =>
  ({ jwtPayload: { sub, email: '', name: '', role: 'Client', plan }, body, headers: {} }) as never;

describe('AC4(b): no fixture draft counts against Ink or drops', () => {
  it('the fixture draft charged nothing: no inkledger row, no CreditLedger row, no users row created', async () => {
    const oid = new mongoose.Types.ObjectId(FIX);
    expect(await mongoose.connection.collection('inkledger').countDocuments({ userId: oid })).toBe(
      0,
    );
    expect(await CreditLedger.countDocuments({ userId: FIX })).toBe(0);
    expect(await User.countDocuments({ _id: FIX })).toBe(0);
    // the same draft by the normal user did charge, so the check above can fail
    expect(
      await mongoose.connection
        .collection('inkledger')
        .countDocuments({ userId: new mongoose.Types.ObjectId(REAL) }),
    ).toBeGreaterThan(0);
    const real = (await User.findById(REAL).lean())!;
    expect(real.inkTopup).toBeLessThan(INK_BEFORE);
  });

  it('spendInk skips the fixture user: success, no write; it still charges a normal user', async () => {
    const before = await mongoose.connection.collection('inkledger').countDocuments({});
    const r = await spendInk({ userId: FIX, costCredits: 3, reason: 'generate' });
    expect(r).toEqual({ success: true, reason: 'fixture_run' });
    expect(await mongoose.connection.collection('inkledger').countDocuments({})).toBe(before);
    const topup = (await User.findById(REAL).lean())!.inkTopup;
    expect((await spendInk({ userId: REAL, costCredits: 1, reason: 'generate' })).success).toBe(
      true,
    );
    expect((await User.findById(REAL).lean())!.inkTopup).toBe(topup! - 2);
  });

  it('spendInk upper-case form of the fixture id is skipped as well', async () => {
    const r = await spendInk({ userId: FIX.toUpperCase(), costCredits: 3, reason: 'generate' });
    expect(r.reason).toBe('fixture_run');
  });

  it('enforceCredits lets the fixture user through with no balance; a normal user with none gets 402', async () => {
    const next = jest.fn();
    const res = fakeRes();
    await enforceCredits(fakeReq(FIX, { template_id: 'bail_regular' }), res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);

    await User.updateOne({ _id: REAL }, { $set: { inkTopup: 0, inkSub: 0, inkAnnualCarry: 0 } });
    const next2 = jest.fn();
    const res2 = fakeRes();
    await enforceCredits(fakeReq(REAL, { template_id: 'bail_regular' }), res2 as never, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(402);
  });

  it('enforceFreeLimit: fixture-marked generations do not count; five normal ones do', async () => {
    await Generation.deleteMany({});
    await Generation.create(
      Array.from({ length: FREE_TIER_MONTHLY_LIMIT + 3 }, () => ({
        userId: REAL,
        docType: 'bail_application',
        tokensUsed: 1,
        status: 'completed',
        runOrigin: 'fixture',
      })),
    );
    const next = jest.fn();
    const res = fakeRes();
    await enforceFreeLimit(fakeReq(REAL), res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);

    await Generation.create(
      Array.from({ length: FREE_TIER_MONTHLY_LIMIT }, () => ({
        userId: REAL,
        docType: 'bail_application',
        tokensUsed: 1,
        status: 'completed',
      })),
    );
    const next2 = jest.fn();
    const res2 = fakeRes();
    await enforceFreeLimit(fakeReq(REAL), res2 as never, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(402);
  });

  it('spendCap: fixture cost counts toward neither the user nor the total daily cap; real cost does', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await Generation.deleteMany({});
    await Generation.create([
      {
        userId: REAL,
        docType: 'bail_application',
        tokensUsed: 1,
        costUsd: 30,
        runOrigin: 'fixture',
      },
      { userId: FIX, docType: 'bail_application', tokensUsed: 1, costUsd: 30 },
    ]);
    await spendCapCheck(fakeReq(REAL), fakeRes() as never, jest.fn());
    await spendCapCheck(fakeReq(FIX), fakeRes() as never, jest.fn());
    expect(warn).not.toHaveBeenCalled();

    await Generation.create({
      userId: REAL,
      docType: 'bail_application',
      tokensUsed: 1,
      costUsd: 30,
    });
    await spendCapCheck(fakeReq(REAL), fakeRes() as never, jest.fn());
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/exceeded daily cap/);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(
      /Total daily spend exceeded/,
    );
  });

  it('the fixture user is not subject to the 402: a second fixture draft with no balance still succeeds', async () => {
    mockModel(answer(BAD2), 'no');
    const ledger = await FactLedgerModel.create({
      userId: FIX,
      documentKind: 'bail_regular',
      runType: 'user',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          facts: baseFacts(),
          unresolved: [],
          createdAt: new Date(),
          reason: 'extract',
        },
      ],
    });
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers(FIX))
      .send({ kind: 'bail_regular', values: VALUES, court, ledger_id: String(ledger._id) });
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')?.docId).toBeTruthy();
    expect(await CreditLedger.countDocuments({ userId: FIX })).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Security: a normal user cannot become fixture; the reserved id cannot be reached
// ═════════════════════════════════════════════════════════════════════════════
describe("security: no request field makes a normal user's run a fixture run", () => {
  const FLAGS = {
    runType: 'fixture',
    run_type: 'fixture',
    runOrigin: 'fixture',
    run_origin: 'fixture',
    fixture: true,
    isFixture: true,
    is_fixture: true,
  };
  const FLAG_HEADERS = {
    'x-run-type': 'fixture',
    'x-run-origin': 'fixture',
    'x-fixture': 'true',
    'x-golden-set': 'true',
  };

  it('/generate-from-brief with every flag in the body and the headers: user rows, Ink charged, listed', async () => {
    const inkBefore = (await User.findById(REAL).lean())!.inkTopup!;
    const ledger = await FactLedgerModel.create({
      userId: REAL,
      documentKind: 'bail_regular',
      runType: 'user',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          facts: baseFacts(),
          unresolved: [],
          createdAt: new Date(),
          reason: 'extract',
        },
      ],
    });
    mockModel(answer(BAD2), 'no');
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers(REAL, FLAG_HEADERS))
      .send({
        kind: 'bail_regular',
        values: VALUES,
        court,
        ledger_id: String(ledger._id),
        ...FLAGS,
      });
    // Either the flags are ignored (200) or refused (400): never honoured.
    expect([200, 400]).toContain(res.status);
    expect(await LawieDocument.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
    expect(await Generation.countDocuments({ userId: REAL, runOrigin: 'fixture' })).toBe(0);
    expect(await FactDiff.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
    if (res.status === 200) {
      const docId = event(res.text, 'done')!.docId as string;
      expect((await LawieDocument.findById(docId).lean())!.runType).toBe('user');
      expect((await User.findById(REAL).lean())!.inkTopup).toBeLessThan(inkBefore);
      const list = await request(app).get('/').set(headers(REAL));
      expect((list.body.documents as Array<{ _id: string }>).map((d) => d._id)).toContain(docId);
    }
  });

  it('/intake/brief with every flag: LlmAuxCall and FactLedger rows stay user rows', async () => {
    mockModel(MATCH_MACT, EMPTY_READ, EXTRACT);
    const res = await request(app)
      .post('/intake/brief')
      .set(headers(REAL, FLAG_HEADERS))
      .send({ description: DESC, intake_id: '33333333-3333-4333-8333-333333333333', ...FLAGS });
    expect([200, 400]).toContain(res.status);
    expect(await LlmAuxCall.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
    expect(await FactLedgerModel.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
    expect(await Event.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
  });

  it('a PATCH or export with the flags cannot flip an existing document to fixture', async () => {
    await request(app)
      .patch(`/${realRun.docId}`)
      .set(headers(REAL, FLAG_HEADERS))
      .send({ ...FLAGS, content: 'x' });
    await request(app)
      .post(`/${realRun.docId}/export/pdf`)
      .set(headers(REAL, FLAG_HEADERS))
      .send(FLAGS);
    expect((await LawieDocument.findById(realRun.docId).lean())!.runType).toBe('user');
    expect(await Event.countDocuments({ userId: REAL, runType: 'fixture' })).toBe(0);
  });

  it('the feature switches are bypassed for the fixture user only: with them off, a normal user gets 404', async () => {
    await AppSetting.updateOne({ key: 'feature.describe_first' }, { $set: { value: 'off' } });
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { $set: { value: 'off' } });
    _clearAppSettingsCache();
    mockModel(MATCH_MACT, EMPTY_READ, EXTRACT);
    const real = await request(app)
      .post('/intake/brief')
      .set(headers(REAL, FLAG_HEADERS))
      .send({ description: DESC, intake_id: '44444444-4444-4444-8444-444444444444', ...FLAGS });
    expect(real.status).toBe(404);
    mockModel(MATCH_MACT, EMPTY_READ, EXTRACT);
    const fix = await request(app)
      .post('/intake/brief')
      .set(headers(FIX))
      .send({ description: DESC, intake_id: '55555555-5555-4555-8555-555555555555' });
    expect(fix.status).toBe(200);
  });
});

describe('security: the reserved id cannot be reached from outside', () => {
  it('without the internal secret, the fixture id is refused (401), on a read and on a draft', async () => {
    const h = { 'x-user-id': FIX, 'x-user-plan': 'free', 'x-user-role': 'Client' };
    expect((await request(app).get('/').set(h)).status).toBe(401);
    expect((await request(app).post('/generate-from-brief').set(h).send({})).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/')
          .set({ ...h, 'x-internal-secret': 'wrong' })
      ).status,
    ).toBe(401);
  });

  it("a normal user's own id is never read as the fixture id", () => {
    for (const id of [
      REAL,
      ADMIN,
      '0000000000000000000f147f',
      '0000000000000000000f147',
      '',
      'null',
      'undefined',
    ]) {
      expect(isFixtureUser(id)).toBe(false);
      expect(runOriginFor(id)).toBe('user');
    }
    expect(isFixtureUser(null)).toBe(false);
    expect(isFixtureUser(undefined)).toBe(false);
  });

  it('the fixture id is recognised in every spelling, so it cannot dodge the tagging by case or type', () => {
    expect(isFixtureUser(FIX)).toBe(true);
    expect(isFixtureUser(FIX.toUpperCase())).toBe(true);
    expect(isFixtureUser(new mongoose.Types.ObjectId(FIX))).toBe(true);
    expect(runOriginFor(FIX.toUpperCase())).toBe('fixture');
  });

  it('upper-case header: rows are still tagged fixture', async () => {
    const res = await request(app).get('/usage').set(headers(FIX.toUpperCase()));
    expect(res.status).toBe(200);
    const d = await LawieDocument.create({
      userId: FIX.toUpperCase(),
      title: 't',
      docType: 'bail_application',
      generatedContent: 'x',
    });
    expect(d.runType).toBe('fixture');
  });

  it('the reserved id can never be generated: it is a valid ObjectId with a zero timestamp, and new ids are current', () => {
    expect(mongoose.isValidObjectId(FIX)).toBe(true);
    const reserved = new mongoose.Types.ObjectId(FIX);
    expect(reserved.getTimestamp().getTime()).toBe(0);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const id = new mongoose.Types.ObjectId();
      expect(id.getTimestamp().getFullYear()).toBeGreaterThanOrEqual(2024);
      seen.add(id.toHexString());
    }
    expect(seen.has(FIX)).toBe(false);
  });

  it('the fixture user has no users row, and nothing in the drafting service creates one for it', async () => {
    expect(await User.findById(FIX).lean()).toBeNull();
    const res = await request(app).get('/users/me').set(headers(FIX));
    expect([401, 403, 404]).toContain(res.status);
    expect(await User.countDocuments({ _id: FIX })).toBe(0);
  });

  it('a user row can still be created with any normal id, and its rows are user rows (the plugin is keyed on the id alone)', async () => {
    const d = await LawieDocument.create({
      userId: REAL,
      title: 't',
      docType: 'bail_application',
      generatedContent: 'x',
    });
    expect(d.runType).toBe('user');
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
