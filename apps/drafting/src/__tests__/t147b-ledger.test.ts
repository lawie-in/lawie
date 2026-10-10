/**
 * T-147b — Reception writes the Fact Ledger, and the brief renders from it.
 *
 * AC1 separate extraction call, one quota unit; AC2 spans verbatim, invented
 * ones dropped; AC3 source user / asked; AC4 the headline MACT case; AC5
 * unreadable values go to unresolved and are asked; AC6 the rendered facts
 * equal the payload (server-side: apps/web has no test runner, so this
 * imports the pure function the screen renders from); AC7 an edit is a new
 * version, an unreadable edit writes none; AC8 runType user; AC9 the
 * Drafter's input is unchanged. Also: the switch off, ownership, PII.
 */
import './setupDb';
import request from 'supertest';

import path from 'path';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { Brief, buildBrief, buildChecklist, buildQuestions } from '../services/intake-brief';
import { INTAKE_LIMITS, MAX_LEDGER_VERSIONS, runBriefIntake } from '../services/intake.service';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

// apps/web is outside this workspace's rootDir for tsc, so the pure function the
// brief screen renders its rows from is loaded by path (ts-jest compiles it).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderedLedgerFacts } = require(
  path.join(__dirname, '../../../web/src/components/intake/briefTypes'),
) as {
  renderedLedgerFacts: (ledger: unknown) => Array<{
    key: string;
    display: string;
    raw_span: string;
    required: boolean;
  }>;
};

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439081';
const OTHER_USER_ID = '507f1f77bcf86cd799439082';
const MODEL = 'claude-haiku-4-5-20251001';
const INTAKE_ID = '55555555-5555-4555-8555-555555555555';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

function match(templateId: string) {
  return JSON.stringify({
    template_id: templateId,
    confidence: 'high',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: true,
    label: 'legal document',
    category: 'other',
  });
}
const MATCH_MACT = match('mact_claim');
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });

function extract(...facts: Array<Record<string, unknown>>) {
  return JSON.stringify({ facts });
}

function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
  return mockMessagesStream;
}

/** The three calls of a describe request: the match, Reception, then the extraction. */
function mockDescribe(extractAnswer: string) {
  return mockModel(MATCH_MACT, EMPTY_READ, extractAnswer);
}

const DESC =
  'Mere client Ramesh ka accident 12/3/26 ko hua tha, PS Kotwali mein FIR 45/26 darj hui. ' +
  'Unhone 2 lakh ka muavza claim kiya hai.';

const FACT_AMOUNT = { key: 'compensation_claimed_amount', span: '2 lakh', confidence: 0.99 };
const FACT_PS = { key: 'police_station', span: 'PS Kotwali', confidence: 0.99 };
const FACT_DATE = { key: 'accident_date', span: '12/3/26', confidence: 0.99 };

function describe_(body: Record<string, unknown> = {}, userId = USER_ID) {
  return request(app)
    .post('/intake/brief')
    .set(headers(userId))
    .send({ description: DESC, intake_id: INTAKE_ID, ...body });
}

function update(body: Record<string, unknown>, userId = USER_ID) {
  return request(app)
    .post('/intake/brief/update')
    .set(headers(userId))
    .send({ kind: 'mact_claim', ...body });
}

interface LFact {
  key: string;
  value: unknown;
  display: string;
  raw_span: string;
  source: string;
  previous_display?: string;
}
interface LUnresolved {
  key: string;
  reason: string;
  raw_span: string;
}
const factOf = (ledger: { facts: LFact[] }, key: string) => ledger.facts.find((f) => f.key === key);

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-147b AC1: a separate extraction call, one quota unit', () => {
  it('makes an intake_extract call after Reception, records it, and counts the request once', async () => {
    const fetchMock = mockDescribe(extract(FACT_AMOUNT));
    const res = await describe_();

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const extractCall = fetchMock.mock.calls[2][0] as SdkStreamParams;
    expect(extractCall.max_tokens).toBe(1500);
    expect(extractCall.system).toContain('You copy facts out of what an Indian advocate wrote');
    expect(extractCall.messages[0].content).toContain('compensation_claimed_amount |');

    const rows = await LlmAuxCall.find({ intakeId: INTAKE_ID }).lean();
    expect(rows.map((r) => r.purpose).sort()).toEqual([
      'intake_extract',
      'intake_match',
      'intake_reception',
    ]);
    // One request is one unit, however many calls it makes; no follow-up unit either.
    expect(await redis.get(`intake:burst:${USER_ID}`)).toBe('1');
    expect(await redis.get(`intake:followups:${INTAKE_ID}`)).toBeNull();
  });

  it('a failed extraction still gives the brief, with an empty ledger', async () => {
    mockMessagesStream.mockReset();
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(MATCH_MACT, 900, 120))
      .mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120))
      .mockRejectedValueOnce(new Error('boom'));
    const res = await describe_();
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.items.length).toBeGreaterThan(0);
    expect(res.body.ledger?.facts ?? []).toEqual([]);
  });
});

describe('T-147b AC2: every span is verbatim in the description', () => {
  it('drops an invented span and a key that is not on the list; stored spans are all verbatim', async () => {
    const logs = (['info', 'error', 'warn', 'log'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    mockDescribe(
      extract(
        FACT_AMOUNT,
        FACT_PS,
        { key: 'victim_name', span: 'Rs 9,99,999 ka nuksan', confidence: 0.99 },
        { key: 'court', span: 'PS Kotwali', confidence: 0.99 },
      ),
    );
    const res = await describe_();
    const ledger = res.body.ledger;

    expect(factOf(ledger, 'victim_name')).toBeUndefined();
    expect(ledger.unresolved.find((u: LUnresolved) => u.key === 'victim_name')).toBeUndefined();
    expect(factOf(ledger, 'court')).toBeUndefined();
    expect(factOf(ledger, 'compensation_claimed_amount')).toBeDefined();

    const spans = [...ledger.facts, ...ledger.unresolved].map((x: { raw_span: string }) => x.raw_span);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) expect(DESC).toContain(span);

    // The stored copy too, in every version.
    const doc = await FactLedgerModel.findById(ledger.ledger_id).lean();
    for (const v of doc!.versions) {
      for (const x of [...v.facts, ...v.unresolved]) expect(DESC).toContain(x.raw_span);
    }
    // Only a count is logged for what was dropped.
    expect(JSON.stringify(logs.flatMap((l) => l.mock.calls))).not.toContain('9,99,999');
  });
});

describe('T-147b AC3 and AC8: source and run type', () => {
  it('is user from the description and asked from /update; runType is user', async () => {
    mockDescribe(extract(FACT_AMOUNT, FACT_PS));
    const res = await describe_();
    const ledger = res.body.ledger;
    expect(ledger.facts.length).toBeGreaterThan(0);
    for (const f of ledger.facts) expect(f.source).toBe('user');
    expect(ledger.run_type).toBe('user');
    expect((await FactLedgerModel.findById(ledger.ledger_id).lean())!.runType).toBe('user');

    const up = await update({
      ledger_id: ledger.ledger_id,
      ledger_edits: [{ key: 'police_station', text: 'Gandhi Maidan' }],
    });
    expect(up.status).toBe(200);
    expect(factOf(up.body.ledger, 'police_station')!.source).toBe('asked');
    expect(factOf(up.body.ledger, 'compensation_claimed_amount')!.source).toBe('user');
  });
});

describe('T-147b AC4: the headline MACT case', () => {
  it('reads 3 lakh, PS Kotwali and 12/3/26 into typed values', async () => {
    const description =
      'Mere client Ramesh ka accident 12/3/26 ko hua tha, PS Kotwali mein FIR darj hui. ' +
      'Unhone 3 lakh ka muavza claim kiya hai.';
    mockDescribe(
      extract(
        { key: 'compensation_claimed_amount', span: '3 lakh', confidence: 0.99 },
        FACT_PS,
        FACT_DATE,
      ),
    );
    const out = await runBriefIntake({
      userId: USER_ID,
      plan: 'free',
      description,
      now: new Date('2026-10-10T08:00:00Z'),
    });
    const ledger = out.ledger!;
    expect(factOf(ledger, 'compensation_claimed_amount')).toMatchObject({
      value: 300000,
      display: 'Rs 3,00,000',
      raw_span: '3 lakh',
    });
    expect(factOf(ledger, 'police_station')).toMatchObject({
      value: 'kotwali',
      display: 'PS Kotwali',
    });
    expect(factOf(ledger, 'accident_date')).toMatchObject({
      value: '2026-03-12',
      display: '12 March 2026',
    });
  });
});

describe('T-147b AC5: what cannot be read is asked, not stored', () => {
  it('puts an unreadable value in unresolved with a reason and asks for its key', async () => {
    const description = 'Mere client ka accident hua. Muavza kuch lakh ka claim hai, naam Ramesh hai.';
    mockDescribe(
      extract(
        { key: 'compensation_claimed_amount', span: 'kuch lakh', confidence: 0.99 },
        { key: 'victim_name', span: 'Ramesh', confidence: 0.05 },
      ),
    );
    const res = await describe_({ description });
    const ledger = res.body.ledger;

    expect(factOf(ledger, 'compensation_claimed_amount')).toBeUndefined();
    expect(factOf(ledger, 'victim_name')).toBeUndefined();
    const amount = ledger.unresolved.find((u: LUnresolved) => u.key === 'compensation_claimed_amount');
    expect(amount).toBeDefined();
    expect(typeof amount.reason).toBe('string');
    expect(amount.reason.length).toBeGreaterThan(0);
    expect(ledger.unresolved.find((u: LUnresolved) => u.key === 'victim_name').reason).toBe(
      'low_confidence',
    );
    const asked = res.body.questions.map((q: { key: string }) => q.key);
    expect(asked).toContain('compensation_claimed_amount');
    expect(asked).toContain('victim_name');
  });

  it('two different values for one key go to unresolved as conflicting_values', async () => {
    const description = 'Muavza 2 lakh ka hai, nahi, 3 lakh ka claim hai.';
    mockDescribe(
      extract(
        { key: 'compensation_claimed_amount', span: '2 lakh', confidence: 0.99 },
        { key: 'compensation_claimed_amount', span: '3 lakh', confidence: 0.99 },
      ),
    );
    const res = await describe_({ description });
    expect(factOf(res.body.ledger, 'compensation_claimed_amount')).toBeUndefined();
    expect(
      res.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'compensation_claimed_amount')
        .reason,
    ).toBe('conflicting_values');
  });
});

describe('T-147b AC6: the screen renders from the ledger payload', () => {
  // apps/web has no test runner, so this is checked here, on the server side,
  // with the same pure function the screen renders its rows from.
  it('renderedLedgerFacts equals the payload facts, and the unresolved set is the rest', async () => {
    mockDescribe(
      extract(FACT_AMOUNT, FACT_PS, { key: 'victim_name', span: 'Ramesh', confidence: 0.05 }),
    );
    const res = await describe_();
    const ledger = res.body.ledger;
    const rendered = renderedLedgerFacts(ledger);

    expect(rendered).toEqual(
      ledger.facts.map((f: LFact & { required_in_draft: boolean }) => ({
        key: f.key,
        display: f.display,
        raw_span: f.raw_span,
        required: f.required_in_draft,
      })),
    );
    expect(rendered.length).toBe(2);
    const factKeys = new Set(ledger.facts.map((f: LFact) => f.key));
    expect(ledger.unresolved.map((u: LUnresolved) => u.key)).toEqual(['victim_name']);
    for (const u of ledger.unresolved) expect(factKeys.has(u.key)).toBe(false);
  });
});

describe('T-147b AC7: an edit is a new version', () => {
  it('appends a version, keeps the old one, and normalises 3 lakh', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;
    expect(factOf(first.body.ledger, 'compensation_claimed_amount')!.display).toBe('Rs 2,00,000');
    const before = await FactLedgerModel.findById(id).lean();

    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
    });
    expect(up.status).toBe(200);
    const edited = factOf(up.body.ledger, 'compensation_claimed_amount')!;
    expect(edited).toMatchObject({ value: 300000, display: 'Rs 3,00,000', previous_display: 'Rs 2,00,000' });

    const after = await FactLedgerModel.findById(id).lean();
    expect(after!.currentVersion).toBe(2);
    expect(after!.versions).toHaveLength(2);
    expect(after!.versions[1].reason).toBe('edit');
    // The earlier version is untouched.
    expect(JSON.stringify(after!.versions[0])).toBe(JSON.stringify(before!.versions[0]));
    expect(after!.versions[0].facts[0]).toMatchObject({ value: 200000, display: 'Rs 2,00,000' });
  });

  it('an answer to an unresolved key, or from a question, is an answer version', async () => {
    mockDescribe(extract({ key: 'victim_name', span: 'Ramesh', confidence: 0.05 }));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'victim_name', text: 'Ramesh Kumar' }],
    });
    expect(factOf(up.body.ledger, 'victim_name')).toMatchObject({ source: 'asked' });
    expect(up.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'victim_name')).toBeUndefined();
    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.versions[1].reason).toBe('answer');
  });

  it('an unreadable edit writes no version and leaves the fact as it was', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;

    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: 'kuch bhi' }],
    });
    expect(up.status).toBe(200);
    expect(up.body.ledger_results[0]).toMatchObject({ key: 'compensation_claimed_amount', status: 'unreadable' });
    expect(factOf(up.body.ledger, 'compensation_claimed_amount')!.display).toBe('Rs 2,00,000');
    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.currentVersion).toBe(1);
    expect(doc!.versions).toHaveLength(1);
  });

  it('emptying a field removes the fact in a new version', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const up = await update({
      ledger_id: first.body.ledger.ledger_id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '' }],
    });
    expect(factOf(up.body.ledger, 'compensation_claimed_amount')).toBeUndefined();
    expect(up.body.ledger.version).toBe(2);
  });
});

describe('T-147b: the switch off', () => {
  it('makes no extraction call, writes no ledger and returns none', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const fetchMock = mockModel(MATCH_MACT, EMPTY_READ);
    const res = await describe_();

    expect(res.body.outcome).toBe('brief');
    expect(res.body.ledger).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const purposes = (await LlmAuxCall.find({ intakeId: INTAKE_ID }).lean()).map((r) => r.purpose);
    expect(purposes).not.toContain('intake_extract');
    expect(await FactLedgerModel.countDocuments()).toBe(0);

    // /update ignores a ledger id while the switch is off.
    const up = await update({ ledger_id: 'a'.repeat(24), ledger_edits: [{ key: 'victim_name', text: 'X' }] });
    expect(up.status).toBe(200);
    expect(up.body.ledger).toBeUndefined();
  });

  it('a list of user ids turns it on for those users only', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: OTHER_USER_ID });
    _clearAppSettingsCache();
    mockModel(MATCH_MACT, EMPTY_READ);
    const res = await describe_();
    expect(res.body.ledger).toBeUndefined();
  });
});

describe('T-147b: ownership', () => {
  it("another user's ledger id is a 404 on /update and on /brief, and nothing changes", async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;

    const up = await update(
      { ledger_id: id, ledger_edits: [{ key: 'compensation_claimed_amount', text: '9 lakh' }] },
      OTHER_USER_ID,
    );
    expect(up.status).toBe(404);
    const again = await describe_({ ledger_id: id, intake_id: undefined, kind: 'mact_claim' }, OTHER_USER_ID);
    expect(again.status).toBe(404);

    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.versions).toHaveLength(1);
  });

  it('a ledger id that does not exist is a 404', async () => {
    const up = await update({ ledger_id: 'b'.repeat(24), ledger_edits: [] });
    expect(up.status).toBe(404);
  });
});

describe('T-147b AC9: the Drafter input is unchanged', () => {
  it('the brief items are the same with the switch on and off', async () => {
    mockDescribe(extract(FACT_AMOUNT, FACT_PS));
    const on = await describe_();
    await redis.flushall();
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(MATCH_MACT, EMPTY_READ);
    const off = await describe_();

    expect(on.body.ledger).toBeDefined();
    expect(off.body.ledger).toBeUndefined();
    expect(on.body.brief.items).toEqual(off.body.brief.items);
  });

  it('what /generate-from-brief sends the model is the same with the switch on and off', async () => {
    const COURT_ID = 'district_sessions_patna';
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
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
    await User.create({ _id: USER_ID, plan: 'free', planTier: 'free', inkSub: 0, inkAnnualCarry: 0, inkTopup: 4000 });
    const ground = buildChecklist(loadRulePack('bail_regular')!).find((i) => i.key === 'grounds_for_bail')!.options[0];
    const values = [
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
      { key: 'grounds_for_bail', value: [ground] },
    ];
    const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
    const generate = async () => {
      mockMessagesStream.mockReset();
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. That the applicant is a law-abiding citizen.', 4000, 800));
      const res = await request(app)
        .post('/generate-from-brief')
        .set(headers())
        .send({ kind: 'bail_regular', values, court, paragraphs: 12 });
      expect(res.status).toBe(200);
      expect(mockMessagesStream).toHaveBeenCalled();
      return JSON.stringify(mockMessagesStream.mock.calls[0][0]);
    };

    const on = await generate();
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const off = await generate();

    expect(on).toBe(off);
    expect(await FactLedgerModel.countDocuments()).toBe(0);
  });
});

describe('T-147b: no fact value or span in usage rows or logs', () => {
  it('keeps the description, spans and values out of LlmAuxCall and the console', async () => {
    const logs = (['info', 'error', 'warn', 'log'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    mockDescribe(extract(FACT_AMOUNT, FACT_PS, FACT_DATE, { key: 'victim_name', span: 'Ramesh', confidence: 0.05 }));
    const first = await describe_();
    await update({
      ledger_id: first.body.ledger.ledger_id,
      ledger_edits: [
        { key: 'compensation_claimed_amount', text: '3 lakh' },
        { key: 'victim_name', text: 'Ramesh Kumar' },
        { key: 'police_station', text: 'zzz unreadable ??' },
      ],
    });
    // A bad id and an invented span also log nothing of the text.
    await update({ ledger_id: 'c'.repeat(24), ledger_edits: [{ key: 'victim_name', text: 'Ramesh Kumar' }] });

    const stored = JSON.stringify(await LlmAuxCall.find({}).lean());
    const logged = JSON.stringify(logs.flatMap((l) => l.mock.calls));
    expect(logged).toContain('ledger written');
    for (const text of ['2 lakh', '3 lakh', 'PS Kotwali', '12/3/26', 'Ramesh', '2,00,000', '3,00,000', 'zzz unreadable']) {
      expect(stored).not.toContain(text);
      expect(logged).not.toContain(text);
    }
  });
});

describe('T-147b: write failures and a change of kind', () => {
  it('409: a write that finds another write came first changes nothing', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;

    // Another write lands between this request's read of the ledger and its write.
    const original = FactLedgerModel.findOne.bind(FactLedgerModel);
    jest.spyOn(FactLedgerModel, 'findOne').mockImplementationOnce(((...args: unknown[]) =>
      (async () => {
        const doc = await (original as (...a: unknown[]) => Promise<{ _id: unknown } | null>)(...args);
        await FactLedgerModel.collection.updateOne({ _id: doc!._id } as never, {
          $set: { currentVersion: 7 },
        });
        return doc;
      })()) as never);

    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
    });
    expect(up.status).toBe(409);
    expect(up.body.error).toBe('ledger_conflict');
    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.versions).toHaveLength(1);
  });

  it('503: a ledger that cannot be written says so, and logs no text', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const logs = (['error', 'warn', 'log'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    jest.spyOn(FactLedgerModel, 'findOneAndUpdate').mockRejectedValueOnce(new Error('db down 3 lakh'));

    const up = await update({
      ledger_id: first.body.ledger.ledger_id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
    });
    expect(up.status).toBe(503);
    expect(up.body.error).toBe('ledger_unavailable');
    expect(JSON.stringify(logs.flatMap((l) => l.mock.calls))).not.toContain('3 lakh');
    const doc = await FactLedgerModel.findById(first.body.ledger.ledger_id).lean();
    expect(doc!.versions).toHaveLength(1);
  });

  it('a change of kind with the ledger id carries what the advocate asked or edited to the new ledger', async () => {
    mockDescribe(extract(FACT_AMOUNT, FACT_PS));
    const first = await describe_();
    const oldId = first.body.ledger.ledger_id;
    await update({
      ledger_id: oldId,
      ledger_edits: [{ key: 'police_station', text: 'Gandhi Maidan' }],
    });

    mockModel(EMPTY_READ, extract());
    const changed = await describe_({ kind: 'bail_regular', ledger_id: oldId });
    expect(changed.status).toBe(200);
    const ledger = changed.body.ledger;

    expect(ledger.ledger_id).not.toBe(oldId);
    expect(ledger.document_kind).toBe('bail_regular');
    // The asked fact is carried; what the new document does not have is not.
    expect(factOf(ledger, 'police_station')).toMatchObject({ source: 'asked', raw_span: 'Gandhi Maidan' });
    expect(factOf(ledger, 'compensation_claimed_amount')).toBeUndefined();
    // The old ledger is left as it was.
    const old = await FactLedgerModel.findById(oldId).lean();
    expect(old!.documentKind).toBe('mact_claim');
    expect(old!.versions).toHaveLength(2);
  });
});

// ── Round 2 ─────────────────────────────────────────────────────────────────

describe('T-147b round 2, AC5: what the ledger could not read is asked even when the brief has a value', () => {
  const bail = buildChecklist(loadRulePack('bail_regular')!);
  const bailKind = { id: 'bail_regular', name: 'Regular Bail Application', court_document: true };
  const briefWith = (values: Array<{ key: string; value: string | string[] }>): Brief =>
    buildBrief({
      kind: bailKind,
      checklist: bail,
      values: values.map((v) => ({ ...v, quote: '', source: 'description' as const })),
    });

  it('the reviewer case: a read value the extraction marks low_confidence stays in the brief and is asked', async () => {
    const read = JSON.stringify({
      outcome: 'read',
      read: [{ id: 'police_station', value: 'Kotwali', quote: 'PS Kotwali' }],
      conflicts: [],
      questions: [],
    });
    mockModel(MATCH_MACT, read, extract({ ...FACT_PS, confidence: 0.05 }));
    const res = await describe_();
    expect(res.status).toBe(200);

    const ps = res.body.brief.items.find((i: { key: string }) => i.key === 'police_station');
    expect(ps.value).toBe('Kotwali');
    expect(
      res.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'police_station').reason,
    ).toBe('low_confidence');
    expect(factOf(res.body.ledger, 'police_station')).toBeUndefined();
    expect(res.body.questions.map((q: { key: string }) => q.key)).toContain('police_station');

    // AC9: the brief itself is what it is with the switch off; only the question is added.
    await redis.flushall();
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(MATCH_MACT, read);
    const off = await describe_();
    expect(off.body.brief.items).toEqual(res.body.brief.items);
    expect(off.body.questions.map((q: { key: string }) => q.key)).not.toContain('police_station');
  });

  it('an empty alwaysAsk gives the same output as calling without it', () => {
    for (const brief of [
      briefWith([]),
      briefWith([
        { key: 'applicant_name', value: 'Ram Kumar' },
        { key: 'fir_number', value: '124/2026' },
      ]),
    ]) {
      const worded = new Map([['fir_date', 'On what date was the FIR registered?']]);
      expect(buildQuestions(brief, worded, new Set(), new Set())).toEqual(
        buildQuestions(brief, worded),
      );
      expect(buildQuestions(brief, worded, new Set(['custody_since']), new Set())).toEqual(
        buildQuestions(brief, worded, new Set(['custody_since'])),
      );
    }
  });

  it('asks an alwaysAsk key that has a value, ranked right after the party names, value untouched', () => {
    const brief = briefWith([{ key: 'police_station', value: 'Kotwali' }]);
    expect(buildQuestions(brief, new Map()).map((q) => q.key)).not.toContain('police_station');

    const q = buildQuestions(brief, new Map(), new Set(), new Set(['police_station']));
    const keys = q.map((x) => x.key);
    expect(keys[0]).toBe('applicant_name');
    expect(keys[1]).toBe('police_station');
    expect(q).toHaveLength(10);
    expect(brief.items.find((i) => i.key === 'police_station')!.value).toBe('Kotwali');
  });

  it('alwaysAsk keys stay within the 10-question cap and are kept before the others', () => {
    const everyKey = new Set(bail.map((i) => i.key));
    expect(everyKey.size).toBeGreaterThan(10);
    const all = buildQuestions(briefWith([]), new Map(), new Set(), everyKey);
    expect(all).toHaveLength(10);
    expect(all.map((q) => q.round)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

    // An optional key, which is never asked on its own, displaces a lower-ranked
    // missing one rather than lengthening the list.
    const base = buildQuestions(briefWith([]), new Map()).map((q) => q.key);
    const withOne = buildQuestions(briefWith([]), new Map(), new Set(), new Set(['custody_since']));
    expect(withOne).toHaveLength(10);
    expect(withOne.map((q) => q.key)).toContain('custody_since');
    expect(withOne.map((q) => q.key)).not.toContain(base[9]);
  });
});

describe('T-147b round 2, AC5 (Ajay): party names keep their slots ahead of alwaysAsk keys', () => {
  it('12 alwaysAsk keys and 2 empty party names: both names first, then 8 alwaysAsk, 10 in all', () => {
    const checklist = buildChecklist(loadRulePack('criminal_appeal')!);
    const brief = buildBrief({
      kind: { id: 'criminal_appeal', name: 'Criminal Appeal', court_document: true },
      checklist,
      values: [],
    });
    const parties = brief.items.filter((i) => i.party_name && i.required).map((i) => i.key);
    expect(parties).toEqual(['appellant_name', 'respondent_name']);
    const others = brief.items.filter((i) => !i.party_name).map((i) => i.key);
    const always = new Set(others.slice(0, 12));
    expect(always.size).toBe(12);

    const q = buildQuestions(brief, new Map(), new Set(), always);
    const keys = q.map((x) => x.key);
    expect(keys).toHaveLength(10);
    expect(keys.slice(0, 2).sort()).toEqual([...parties].sort());
    const rest = keys.slice(2);
    expect(rest).toHaveLength(8);
    for (const k of rest) expect(always.has(k)).toBe(true);
  });
});

describe('T-147b round 2, AC7: one request writes at most one version', () => {
  const ledgerOf = async (id: string) => (await FactLedgerModel.findById(id).lean())!;

  async function seeded() {
    mockDescribe(
      extract(FACT_AMOUNT, FACT_PS, { key: 'victim_name', span: 'Ramesh', confidence: 0.05 }),
    );
    return (await describe_()).body.ledger.ledger_id as string;
  }

  it('three edits of existing facts in one request are one version, reason edit', async () => {
    mockDescribe(extract(FACT_AMOUNT, FACT_PS, FACT_DATE));
    const id = (await describe_()).body.ledger.ledger_id as string;
    const up = await update({
      ledger_id: id,
      ledger_edits: [
        { key: 'compensation_claimed_amount', text: '3 lakh' },
        { key: 'police_station', text: 'Gandhi Maidan' },
        { key: 'accident_date', text: '14/3/26' },
      ],
    });
    expect(up.status).toBe(200);
    expect(up.body.ledger_results.map((r: { status: string }) => r.status)).toEqual([
      'saved',
      'saved',
      'saved',
    ]);
    const doc = await ledgerOf(id);
    expect(doc.currentVersion).toBe(2);
    expect(doc.versions).toHaveLength(2);
    expect(doc.versions[1].reason).toBe('edit');
    expect(up.body.ledger.version).toBe(2);
    // All three are in that one version.
    expect(factOf(up.body.ledger, 'compensation_claimed_amount')!.display).toBe('Rs 3,00,000');
    expect(factOf(up.body.ledger, 'police_station')!.raw_span).toBe('Gandhi Maidan');
    expect(factOf(up.body.ledger, 'accident_date')!.display).toBe('14 March 2026');
  });

  it('a mix of an edit and an answer is one version, reason edit', async () => {
    const id = await seeded();
    const up = await update({
      ledger_id: id,
      ledger_edits: [
        { key: 'victim_name', text: 'Ramesh Kumar' },
        { key: 'compensation_claimed_amount', text: '3 lakh' },
      ],
    });
    expect(up.status).toBe(200);
    const doc = await ledgerOf(id);
    expect(doc.versions).toHaveLength(2);
    expect(doc.versions[1].reason).toBe('edit');
  });

  it('answers only, or an edit marked from_question, are one version, reason answer', async () => {
    const id = await seeded();
    const up = await update({
      ledger_id: id,
      ledger_edits: [
        { key: 'victim_name', text: 'Ramesh Kumar' },
        { key: 'accident_date', text: '12/3/26' },
        { key: 'police_station', text: 'Gandhi Maidan', from_question: true },
      ],
    });
    expect(up.status).toBe(200);
    const doc = await ledgerOf(id);
    expect(doc.currentVersion).toBe(2);
    expect(doc.versions).toHaveLength(2);
    expect(doc.versions[1].reason).toBe('answer');
  });

  it('a request that changes nothing writes no version', async () => {
    const id = await seeded();
    const none = await update({ ledger_id: id, ledger_edits: [] });
    expect(none.status).toBe(200);
    const unreadable = await update({
      ledger_id: id,
      ledger_edits: [
        { key: 'compensation_claimed_amount', text: 'kuch bhi' },
        { key: 'accident_date', text: '' },
      ],
    });
    expect(unreadable.status).toBe(200);
    const doc = await ledgerOf(id);
    expect(doc.currentVersion).toBe(1);
    expect(doc.versions).toHaveLength(1);
  });

  it('exports the version cap as 100', () => {
    expect(INTAKE_LIMITS.maxLedgerVersions).toBe(100);
    expect(MAX_LEDGER_VERSIONS).toBe(100);
  });

  it('with currentVersion at 100 the next write is a 422 ledger_version_limit and changes nothing', async () => {
    const id = await seeded();
    await FactLedgerModel.collection.updateOne(
      { _id: (await ledgerOf(id))._id } as never,
      { $set: { currentVersion: 100 } },
    );
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
    });
    expect(up.status).toBe(422);
    expect(up.body).toEqual({ error: 'ledger_version_limit' });
    const doc = await ledgerOf(id);
    expect(doc.versions).toHaveLength(1);
    expect(doc.currentVersion).toBe(100);

    // A request that would write nothing is not refused.
    const noop = await update({ ledger_id: id, ledger_edits: [] });
    expect(noop.status).toBe(200);
  });

  it('at 99 the write that makes 100 still goes through', async () => {
    const id = await seeded();
    await FactLedgerModel.collection.updateOne(
      { _id: (await ledgerOf(id))._id } as never,
      { $set: { currentVersion: 99 } },
    );
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
    });
    expect(up.status).toBe(200);
    expect((await ledgerOf(id)).currentVersion).toBe(100);
  });
});

describe('T-147b round 2: an unreadable value typed into an empty field', () => {
  it('writes no version and no unresolved entry when the field is empty and not unresolved', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const first = await describe_();
    const id = first.body.ledger.ledger_id;
    expect(first.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'accident_date')).toBeUndefined();

    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'accident_date', text: 'kuch din pehle' }],
    });
    expect(up.status).toBe(200);
    expect(up.body.ledger_results[0]).toMatchObject({ key: 'accident_date', status: 'unreadable' });
    expect(up.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'accident_date')).toBeUndefined();
    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.currentVersion).toBe(1);
    expect(doc!.versions).toHaveLength(1);
  });

  it('a failed answer from the questions step still goes to unresolved', async () => {
    mockDescribe(extract(FACT_AMOUNT));
    const id = (await describe_()).body.ledger.ledger_id;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'accident_date', text: 'kuch din pehle', from_question: true }],
    });
    expect(up.body.ledger_results[0].status).toBe('unreadable');
    expect(
      up.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'accident_date'),
    ).toBeDefined();
    const doc = await FactLedgerModel.findById(id).lean();
    expect(doc!.versions).toHaveLength(2);
    expect(doc!.versions[1].reason).toBe('answer');
  });

  it('a failed answer for a key that is already unresolved stays unresolved', async () => {
    mockDescribe(extract({ key: 'victim_name', span: 'Ramesh', confidence: 0.05 }));
    const id = (await describe_()).body.ledger.ledger_id;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'victim_name', text: '??' }],
    });
    expect(up.body.ledger_results[0].status).toBe('unreadable');
    expect(
      up.body.ledger.unresolved.find((u: LUnresolved) => u.key === 'victim_name'),
    ).toBeDefined();
    expect(factOf(up.body.ledger, 'victim_name')).toBeUndefined();
  });
});
