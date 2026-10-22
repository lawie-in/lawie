/**
 * T-226 — a user cannot draft past their balance. Route-level tests for the
 * three generate paths: POST /generate-from-template, POST /generate-from-brief
 * with a rule pack, and POST /generate-from-brief with no rule pack (guided).
 * (The legacy POST /generate was retired in T-443: it is 410 and takes no hold.)
 *
 * AC6.1 parallel requests, AC6.2 failure release, AC6.3 client abort,
 * AC6.4 concurrent duplicate attempt, AC6.6 fixture user. The sweep (AC6.5) and
 * the service-level rules (AC7 to AC9) are in t226-ink-holds.service.test.ts.
 *
 * The model is the SDK stub from sdkStream.ts. Where requests must really
 * overlap, the stub's answer waits on a gate the test opens.
 */
import './setupDb';
import http from 'http';
import type { AddressInfo, Socket } from 'net';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser, seedVerifiedUsers } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import * as credits from '../services/credits.service';
import { costForTemplate } from '../services/credits.service';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994392c1';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const TEMP_FIELDS = ['_ds', '_dc', '_dt', '_r1', '_r2', '_h'];

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

// ── Request bodies, one per generate path ───────────────────────────────────

const BAIL_FORM_DATA = {
  fir_number: '124/2026',
  fir_date: '2026-03-15',
  police_station: 'Kotwali, Patna',
  sections_charged: ['103'],
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  state: 'bihar',
  court_type: 'sessions',
  court_name: 'district_sessions_patna',
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St',
  language: 'en',
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];
const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
const PACK_VALUES = [
  {
    key: 'applicant_name',
    value: 'Ram Kumar',
    source: 'description',
    quote: 'My client Ram Kumar',
  },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    value:
      'The applicant was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];
const PACK_BODY = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and no earlier bail application has been filed.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');
const PACK_ANSWER = `${PACK_BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;

const LETTER_VALUES = [
  { key: 'fixed.first_party', value: 'Sunita Devi', source: 'description', quote: 'Sunita Devi' },
  { key: 'fixed.other_party', value: 'Patna Municipal Corporation' },
  {
    key: 'fixed.facts',
    value: 'She owns shop no. 12 at Boring Road and wants to let it be used as a clinic.',
  },
  { key: 'fixed.relief', value: 'Consent to use the shop as a clinic.' },
];
const LETTER = [
  'Date: [To be confirmed: date]',
  'From:\nSunita Devi',
  'To:\nPatna Municipal Corporation',
  'Subject: Consent for use of premises',
  '1. That I, Sunita Devi, own shop no. 12 at Boring Road.',
  '2. That I consent to the shop being used as a clinic.',
  'Yours faithfully,\nSunita Devi',
].join('\n\n');

interface GenPath {
  name: string;
  url: string;
  /** The id the cost is priced under (enforceCredits). */
  priceId: string;
  /** How a retry finds the failed attempt it continues (resolveRun's match). */
  match: { templateId: string } | { docType: string };
  docType: string;
  body: (extra?: Record<string, unknown>) => Record<string, unknown>;
  answer: string;
  /** The ai.service function the route calls (for a plain-Error throw). */
  pipeline: 'streamGenerateFromTemplate' | 'streamGenerateFromBrief' | 'streamGenerateGuided';
}

const PATHS: GenPath[] = [
  {
    name: 'template',
    url: '/generate-from-template',
    priceId: 'bail_regular',
    match: { templateId: 'bail_regular' },
    docType: 'bail_application',
    body: (extra = {}) => ({ template_id: 'bail_regular', form_data: BAIL_FORM_DATA, ...extra }),
    answer: '1. Applicant seeks bail.',
    pipeline: 'streamGenerateFromTemplate',
  },
  {
    name: 'brief (rule pack)',
    url: '/generate-from-brief',
    priceId: 'bail_regular',
    match: { templateId: 'bail_regular' },
    docType: 'bail_application',
    body: (extra = {}) => ({ kind: 'bail_regular', values: PACK_VALUES, court: COURT, ...extra }),
    answer: PACK_ANSWER,
    pipeline: 'streamGenerateFromBrief',
  },
  {
    name: 'brief (guided, no rule pack)',
    url: '/generate-from-brief',
    priceId: 'guided',
    match: { templateId: 'guided' },
    docType: 'guided',
    body: (extra = {}) => ({
      kind: 'none',
      kind_name: 'consent letter for use of premises',
      values: LETTER_VALUES,
      ...extra,
    }),
    answer: LETTER,
    pipeline: 'streamGenerateGuided',
  },
];

const costOf = (p: GenPath) => costForTemplate(p.priceId)!;

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Gate {
  promise: Promise<void>;
  open: () => void;
}
const openGates: Gate[] = [];
function gate(): Gate {
  let open!: () => void;
  const promise = new Promise<void>((r) => {
    open = r;
  });
  const g = { promise, open };
  openGates.push(g);
  return g;
}

/** The model stub: waits on the gate (if any), then fails or answers. */
function stubModel(p: GenPath, opts: { gate?: Gate; fail?: boolean } = {}) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async () => {
    if (opts.gate) await opts.gate.promise;
    if (opts.fail) throw new Error('503 service unavailable');
    return sdkAnswer(p.answer, 1000, 200);
  });
}

async function waitFor(cond: () => boolean | Promise<boolean>, what: string, ms = 8000) {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function post(p: GenPath, extra: Record<string, unknown> = {}, userId = USER_ID) {
  return request(app).post(p.url).set(headers(userId)).send(p.body(extra));
}

async function setInk(units: number) {
  await User.collection.updateOne(
    { _id: OID },
    { $set: { inkSub: 0, inkAnnualCarry: 0, inkTopup: units, inkHolds: [] } },
  );
}

async function rawUser() {
  return (await User.collection.findOne({ _id: OID })) as unknown as {
    inkSub: number;
    inkAnnualCarry: number;
    inkTopup: number;
    inkHolds: Array<{ runId: string; runSequence: number }>;
  } & Record<string, unknown>;
}

async function generateRows(userId: mongoose.Types.ObjectId = OID) {
  return mongoose.connection
    .db!.collection('inkledger')
    .find({ userId, reason: 'generate' })
    .toArray();
}

/** Seed a failed attempt so a retry with its run_id resolves to (runId, 2). */
async function seedFailedAttempt(p: GenPath, runId: string) {
  await Generation.create({
    userId: USER_ID,
    docType: p.docType,
    ...('templateId' in p.match ? { templateId: p.match.templateId } : {}),
    status: 'failed',
    tokensUsed: 0,
    runId,
    runSequence: 1,
    runType: 'initial',
  });
}

function assertNoTempFields(u: Record<string, unknown>) {
  for (const f of TEMP_FIELDS) expect(u).not.toHaveProperty(f);
}

// A real server, for the tests that drop the socket.
let server: http.Server;
let port: number;
const sockets = new Set<Socket>();

beforeAll(async () => {
  server = http.createServer(app);
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
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
    inkTopup: 2000,
  });
});

afterEach(() => {
  // A failed test must not leave a request hanging on its gate.
  for (const g of openGates.splice(0)) g.open();
  mockMessagesStream.mockReset();
  jest.restoreAllMocks();
});

describe.each(PATHS)('T-226 — $name', (p) => {
  const cost = costOf(p);
  const units = cost * 2;

  // ── AC6.1 ────────────────────────────────────────────────────────────────
  describe('parallel requests on a balance for one draft (AC6.1)', () => {
    it("5 overlapping requests: exactly one done, four 402 with enforceCredits' body, balance 0, one set of ledger rows", async () => {
      await setInk(units);
      const g = gate();
      stubModel(p, { gate: g });

      let settled = 0;
      const all = Array.from({ length: 5 }, () =>
        post(p).then((r) => {
          settled += 1;
          return r;
        }),
      );
      // The four refused requests answer while the winner is still inside the
      // model call: they really overlapped.
      // (A timeout here is not thrown: the assertions below then show what happened.)
      await waitFor(
        () => settled === 4 && mockMessagesStream.mock.calls.length === 1,
        'four refusals while the winner is held at the model',
        3000,
      ).catch(() => undefined);
      const mid = await rawUser();
      expect(mid.inkHolds).toHaveLength(1);
      expect(mid.inkTopup).toBe(0);
      g.open();
      const res = await Promise.all(all);

      const ok = res.filter((r) => r.status === 200);
      const refused = res.filter((r) => r.status === 402);
      expect(ok).toHaveLength(1);
      expect(refused).toHaveLength(4);
      expect(ok[0].text).toContain('event: done');
      for (const r of refused) expect(r.text).not.toContain('event:');
      expect(mockMessagesStream).toHaveBeenCalledTimes(1);

      // Final state: balance 0, no hold left, one set of generate rows.
      const u = await rawUser();
      expect(u.inkSub + u.inkAnnualCarry + u.inkTopup).toBe(0);
      expect(u.inkHolds).toEqual([]);
      assertNoTempFields(u);
      const rows = await generateRows();
      expect(rows).toHaveLength(1); // one bucket (topup) was touched
      expect(rows[0]).toMatchObject({
        delta: -units,
        sourceBucket: 'topup',
        runId: ok[0].headers['x-run-id'],
        runSequence: 1,
      });
      expect(await Generation.countDocuments({ userId: USER_ID, status: 'completed' })).toBe(1);
      expect(await LawieDocument.countDocuments({ userId: USER_ID })).toBe(1);

      // The refusals carry exactly the body enforceCredits gives an empty balance.
      const reference = await post(p);
      expect(reference.status).toBe(402);
      expect(reference.body.error).toBe('Insufficient Ink');
      expect(reference.body.cost).toBe(cost);
      expect(reference.body.balance.totalInk).toBe(0);
      for (const r of refused) expect(r.body).toEqual(reference.body);
    });

    it('a hold refused after the early check passed gives the same 402 body, with no model call and no charge', async () => {
      // The early check is fooled (its balance read says "plenty"), so the
      // refusal comes from holdInk itself.
      await setInk(units - 1);
      const real = credits.getCreditBalance;
      const spy = jest.spyOn(credits, 'getCreditBalance');
      spy.mockImplementationOnce(async (id: string) => ({
        ...(await real(id)),
        totalInk: 1000,
      }));
      stubModel(p);

      const res = await post(p);
      expect(res.status).toBe(402);
      expect(spy).toHaveBeenCalledTimes(2); // early check, then the refusal body

      const reference = await post(p); // the early check refuses this one
      expect(reference.status).toBe(402);
      expect(res.body).toEqual(reference.body);
      expect(res.body.balance.totalInk).toBe(Math.floor((units - 1) / 2));

      expect(mockMessagesStream).not.toHaveBeenCalled();
      const u = await rawUser();
      expect(u.inkTopup).toBe(units - 1);
      expect(u.inkHolds).toEqual([]);
      expect(await generateRows()).toHaveLength(0);
      expect(await Generation.countDocuments({})).toBe(0);
    });

    it('a normal single draft: holds, then settles once; the balance drops by the cost and no hold is left', async () => {
      await setInk(units * 3);
      stubModel(p);
      const res = await post(p);
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 2);
      expect(u.inkHolds).toEqual([]);
      assertNoTempFields(u);
      const rows = await generateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].delta).toBe(-units);
    });
  });

  // ── AC6.2 ────────────────────────────────────────────────────────────────
  describe('the model fails (AC6.2)', () => {
    it('GenerationFailedError (the model call is rejected): balance restored, no generate row, no hold, failed row kept', async () => {
      await setInk(units * 3);
      stubModel(p, { fail: true });
      const res = await post(p);
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: error');
      expect(res.text).not.toContain('event: done');

      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 3);
      expect(u.inkHolds).toEqual([]);
      assertNoTempFields(u);
      expect(await generateRows()).toHaveLength(0);
      expect(await Generation.countDocuments({ userId: USER_ID, status: 'failed' })).toBe(1);
      expect(await LawieDocument.countDocuments({})).toBe(0);
    });

    it('a plain Error thrown by the pipeline: balance restored, no generate row, no hold, failed row kept', async () => {
      await setInk(units * 3);
      stubModel(p);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest
        .spyOn(aiService, p.pipeline)
        .mockRejectedValueOnce(new Error('bug outside the LLM call'));

      const res = await post(p);
      expect([200, 500]).toContain(res.status);
      expect(res.text).not.toContain('event: done');

      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 3);
      expect(u.inkHolds).toEqual([]);
      assertNoTempFields(u);
      expect(await generateRows()).toHaveLength(0);
      expect(await Generation.countDocuments({ userId: USER_ID, status: 'failed' })).toBe(1);
    });

    it('a failed attempt then a retry with its run_id: the retry is held and charged once, the failed one nothing', async () => {
      await setInk(units * 3);
      stubModel(p, { fail: true });
      const first = await post(p);
      const runId = first.headers['x-run-id'];
      expect((await rawUser()).inkTopup).toBe(units * 3);

      stubModel(p);
      const retry = await post(p, { run_id: runId });
      expect(retry.headers['x-run-id']).toBe(runId);
      expect(retry.headers['x-run-sequence']).toBe('2');
      expect(retry.text).toContain('event: done');
      expect((await rawUser()).inkTopup).toBe(units * 2);
      const rows = await generateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ runId, runSequence: 2 });
    });

    it("recordGeneration reporting a duplicate releases this request's hold: nothing charged, no hold, no ledger row", async () => {
      await setInk(units * 3);
      stubModel(p);
      const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      jest.spyOn(Generation, 'create').mockRejectedValueOnce(dup as never);
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const res = await post(p);
      expect(res.status).toBe(200);
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 3);
      expect(u.inkHolds).toEqual([]);
      expect(await generateRows()).toHaveLength(0);
    });
  });

  // ── AC6.3 ────────────────────────────────────────────────────────────────
  describe('the client aborts mid-stream (AC6.3)', () => {
    /** POST over a real socket; resolves to a handle that can drop the connection. */
    function rawPost(extra: Record<string, unknown> = {}) {
      const data = JSON.stringify(p.body(extra));
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: p.url,
        method: 'POST',
        agent: false,
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      });
      req.on('error', () => undefined);
      req.on('response', (r) => {
        r.on('error', () => undefined);
        r.resume();
      });
      req.end(data);
      return req;
    }

    async function abortWhileModelIsRunning(g: Gate) {
      const req = rawPost();
      await waitFor(() => mockMessagesStream.mock.calls.length === 1, 'the model call to start');
      const held = await rawUser();
      expect(held.inkHolds).toHaveLength(1);
      expect(held.inkTopup).toBe(units * 2); // started with 3 drafts' worth
      req.destroy();
      await waitFor(() => sockets.size === 0, 'the server to see the dropped socket');
      await sleep(100); // let express emit res 'close'
      // The hold is still open: the model call is not stopped (no AbortSignal).
      expect((await rawUser()).inkHolds).toHaveLength(1);
      g.open();
    }

    it('a run that fails after the client left: the hold is released, nothing charged', async () => {
      await setInk(units * 3);
      const g = gate();
      stubModel(p, { gate: g, fail: true });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await abortWhileModelIsRunning(g);
      await waitFor(async () => (await rawUser()).inkHolds.length === 0, 'the hold to be closed');
      await waitFor(
        async () => (await Generation.countDocuments({ userId: USER_ID })) === 1,
        'the failed row',
      );

      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 3);
      assertNoTempFields(u);
      expect(await generateRows()).toHaveLength(0);
      expect(await LawieDocument.countDocuments({})).toBe(0);
    });

    it('a run that completes and saves after the client left: settled once, the draft is in their history', async () => {
      await setInk(units * 3);
      const g = gate();
      stubModel(p, { gate: g });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await abortWhileModelIsRunning(g);
      await waitFor(async () => (await rawUser()).inkHolds.length === 0, 'the hold to be closed');
      await waitFor(
        async () => (await Generation.countDocuments({ userId: USER_ID })) === 1,
        'the Generation row',
      );
      await sleep(100);

      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 2);
      assertNoTempFields(u);
      const rows = await generateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].delta).toBe(-units);
      expect(await LawieDocument.countDocuments({ userId: USER_ID })).toBe(1);
      expect(await Generation.countDocuments({ userId: USER_ID, status: 'completed' })).toBe(1);
    });

    it('a run that completes but whose document does not save, with the client gone: released', async () => {
      await setInk(units * 3);
      const g = gate();
      stubModel(p, { gate: g });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(LawieDocument, 'create').mockRejectedValue(new Error('db down') as never);

      await abortWhileModelIsRunning(g);
      await waitFor(async () => (await rawUser()).inkHolds.length === 0, 'the hold to be closed');
      await sleep(100);

      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 3);
      expect(await generateRows()).toHaveLength(0);
    });
  });

  describe('the document does not save but the client is still connected', () => {
    it('is settled: the text was delivered on screen, so the Ink is kept and `done` is sent', async () => {
      await setInk(units * 3);
      stubModel(p);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(LawieDocument, 'create').mockRejectedValue(new Error('db down') as never);

      const res = await post(p);
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 2);
      expect(u.inkHolds).toEqual([]);
      expect(await generateRows()).toHaveLength(1);
    });
  });

  // ── AC6.4 ────────────────────────────────────────────────────────────────
  describe('two concurrent requests with the same run_id and runSequence (AC6.4)', () => {
    it('one 200 stream, one 409, one model call, one charge', async () => {
      await setInk(units * 5);
      const runId = '8d3f3c52-5b0a-4c53-9e0a-0d6f7a1b2c3d';
      await seedFailedAttempt(p, runId);
      const g = gate();
      stubModel(p, { gate: g });

      let settled = 0;
      const both = [0, 1].map(() =>
        post(p, { run_id: runId }).then((r) => {
          settled += 1;
          return r;
        }),
      );
      await waitFor(
        () => settled === 1 && mockMessagesStream.mock.calls.length === 1,
        'the duplicate to be refused while the first is at the model',
        3000,
      ).catch(() => undefined);
      g.open();
      const res = await Promise.all(both);

      const ok = res.filter((r) => r.status === 200);
      const conflict = res.filter((r) => r.status === 409);
      expect(ok).toHaveLength(1);
      expect(conflict).toHaveLength(1);
      expect(ok[0].text).toContain('event: done');
      expect(ok[0].headers['x-run-id']).toBe(runId);
      expect(ok[0].headers['x-run-sequence']).toBe('2');
      expect(conflict[0].body).toEqual({ error: 'Draft already in progress', runId });

      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 4); // charged once
      expect(u.inkHolds).toEqual([]);
      assertNoTempFields(u);
      const rows = await generateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ runId, runSequence: 2, delta: -units });
      expect(await Generation.countDocuments({ runId, status: 'completed' })).toBe(1);
    });

    it('a 409 is not a 402: it is given even when the balance would cover another draft, and charges nothing', async () => {
      await setInk(units * 5);
      const runId = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
      await seedFailedAttempt(p, runId);
      // An open hold for (runId, 2) as a running first request leaves it.
      const held = await credits.holdInk({
        userId: USER_ID,
        costCredits: cost,
        runId,
        runSequence: 2,
      });
      expect(held.ok).toBe(true);
      stubModel(p);

      const res = await post(p, { run_id: runId });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Draft already in progress', runId });
      expect(mockMessagesStream).not.toHaveBeenCalled();
      const u = await rawUser();
      expect(u.inkTopup).toBe(units * 4); // only the one hold
      expect(u.inkHolds).toHaveLength(1);
      expect(await generateRows()).toHaveLength(0);
    });
  });

  // ── Review should-fix 1: a throw from holdInk / getCreditBalance ─────────
  describe("the hold step itself throws (answered with the route's own 500, no hang)", () => {
    // The route's existing pre-stream body, per route.
    const expectedBody =
      p.url === '/generate-from-brief'
        ? { error: 'Generation failed' }
        : { error: 'Generation failed', message: 'Unknown generation error' };
    const PII = ['test@test.com', 'Test Advocate', 'Ram Kumar', 'secret-driver-text'];

    function captureLogs() {
      return (['error', 'warn', 'log', 'info'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(() => undefined),
      );
    }
    const logged = (spies: jest.SpyInstance[]) =>
      spies
        .flatMap((s) => s.mock.calls.flat())
        .map(String)
        .join(' ');

    async function completes(pending: Promise<request.Response>) {
      return Promise.race([
        pending,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('request hung: no response in 5s')), 5000),
        ),
      ]);
    }

    function expectNothingSpent(u: Awaited<ReturnType<typeof rawUser>>, ink: number) {
      expect(u.inkTopup).toBe(ink);
      expect(u.inkHolds).toEqual([]);
    }

    it('holdInk throws: 500 with the route body, no model or fetch call, no hang, no PII in the log', async () => {
      await setInk(units * 3);
      stubModel(p);
      const fetchSpy = jest.spyOn(global, 'fetch');
      const logs = captureLogs();
      jest
        .spyOn(credits, 'holdInk')
        .mockRejectedValueOnce(
          new Error('secret-driver-text test@test.com Test Advocate Ram Kumar'),
        );

      const res = await completes(post(p));
      expect(res.status).toBe(500);
      expect(res.body).toEqual(expectedBody);
      expect(mockMessagesStream).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      const text = logged(logs);
      expect(text).toContain('runId=');
      expect(text).toContain('runSequence=');
      expect(text).toContain('Error'); // the class name only
      for (const pii of PII) expect(text).not.toContain(pii);
      expect(res.text).not.toContain('secret-driver-text');

      expectNothingSpent(await rawUser(), units * 3);
      expect(await generateRows()).toHaveLength(0);
      expect(await Generation.countDocuments({})).toBe(0);
    });

    it('getCreditBalance throws while building the 402 body: 500 with the route body, no model or fetch call, no hang, no PII in the log', async () => {
      // The early check is fooled so holdInk itself refuses; the refusal body
      // then reads the balance, and that read throws.
      await setInk(units - 1);
      const real = credits.getCreditBalance;
      jest
        .spyOn(credits, 'getCreditBalance')
        .mockImplementationOnce(async (id: string) => ({ ...(await real(id)), totalInk: 1000 }))
        .mockRejectedValueOnce(
          new Error('secret-driver-text test@test.com Test Advocate Ram Kumar'),
        );
      stubModel(p);
      const fetchSpy = jest.spyOn(global, 'fetch');
      const logs = captureLogs();

      const res = await completes(post(p));
      expect(res.status).toBe(500);
      expect(res.body).toEqual(expectedBody);
      expect(mockMessagesStream).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      const text = logged(logs);
      expect(text).toContain('runId=');
      expect(text).toContain('Error');
      for (const pii of PII) expect(text).not.toContain(pii);
      expect(res.text).not.toContain('secret-driver-text');

      expectNothingSpent(await rawUser(), units - 1);
      expect(await generateRows()).toHaveLength(0);
      expect(await Generation.countDocuments({})).toBe(0);
    });
  });

  // ── AC6.6 ────────────────────────────────────────────────────────────────
  describe('the fixture user (AC6.6)', () => {
    it('drafts with no hold, no ledger row and no user document', async () => {
      stubModel(p);
      const res = await post(p, {}, GOLDEN_SET_USER_ID);
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(mockMessagesStream).toHaveBeenCalled();

      const fixtureOid = new mongoose.Types.ObjectId(GOLDEN_SET_USER_ID);
      expect(await mongoose.connection.db!.collection('inkledger').countDocuments({})).toBe(0);
      expect(await User.collection.countDocuments({ _id: fixtureOid })).toBe(0);
      // The real user, untouched.
      const u = await rawUser();
      expect(u.inkTopup).toBe(2000);
      expect(u.inkHolds).toEqual([]);
    });
  });
});

seedVerifiedUsers('507f1f77bcf86cd7994392c1');
