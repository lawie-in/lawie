/**
 * T-577 routes (in-memory Mongo, SDK stubbed): POST /paragraph-quote and POST /generate-from-brief
 * (items 4, 5, 6, 9, 10). bail_regular on the D1 ledger path. Nothing here calls a real model;
 * the stubbed model only answers on the paths that are meant to reach it, and the refusal tests
 * assert it was never called and no hold was written.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import * as aiService from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { clampTarget } from '../services/brief-drafter';
import * as credits from '../services/credits.service';
import {
  _resetParagraphBandWarnings,
  _setParagraphConfigSourceForTests,
  costForTemplate,
} from '../services/credits.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { choice, regularBase } from './fixtures/t373';
import { sdkParseResponse } from './sdkStream';

const mockStream = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub(
    (...args: unknown[]) => mockStream(...args),
    (...args: unknown[]) => mockParse(...args),
  ),
);
jest.setTimeout(120_000);

type Fact = ReturnType<typeof regularBase>[number];
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439578';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
const BANDS = JSON.stringify([
  { upTo: 10, add: 0 },
  { upTo: 18, add: 1 },
  { upTo: 25, add: 2 },
]);

const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

async function seedUser(topupInk: number): Promise<void> {
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: topupInk * 2,
  });
}

beforeEach(async () => {
  mockStream.mockReset();
  mockParse.mockReset();
  _clearAppSettingsCache();
  _resetParagraphBandWarnings();
  _setParagraphConfigSourceForTests(null);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({ key: 'pricing.paragraph_bands.base_2', value: BANDS });
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
  await seedUser(40);
});
afterEach(() => {
  jest.restoreAllMocks();
  _setParagraphConfigSourceForTests(null);
});

function goodOutput(facts: Fact[]): DraftParagraphsOutput {
  const skeleton = loadSkeleton('bail_regular')!;
  const held = new Set(facts.map((f) => f.key));
  return {
    paragraphs: skeleton.clauses.map((c) => {
      const refs = new Set<string>();
      for (const s of c.slots ?? []) refs.add(c.derived?.[s]?.from ?? s);
      for (const v of c.variants ?? []) for (const s of v.slots ?? []) refs.add(s);
      if (c.source === 'advocate' && c.slot) refs.add(c.slot);
      if (c.list && c.from) refs.add(c.from);
      return {
        clauseId: c.id,
        factRefs: [...refs].filter((r) => held.has(r)),
        text:
          c.source === 'advocate' && c.slot
            ? (facts.find((f) => f.key === c.slot)?.display ?? '')
            : '',
        items: [],
      };
    }),
  };
}
function valuesOf(facts: Fact[]) {
  const byKey = new Map<string, string[]>();
  for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
  return [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v }));
}
const NO_CUSTODY: Fact[] = [
  ...regularBase().filter((f) => !['currently_in_custody', 'custody_since'].includes(f.key)),
  choice('currently_in_custody', 'No — anticipating arrest', 'no'),
];
const mkLedger = async (facts: Fact[]) =>
  String(
    (
      await createLedger({
        userId: USER_ID,
        documentKind: 'bail_regular',
        intakeId: 'i1',
        state: { facts, unresolved: [] },
      })
    )._id,
  );

const quote = (body: Record<string, unknown>) =>
  request(app).post('/paragraph-quote').set(headers()).send(body);

async function generate(
  facts: Fact[],
  extra: Record<string, unknown> = {},
  opts: { delivered?: number } = {},
) {
  mockParse.mockResolvedValue(sdkParseResponse(goodOutput(facts)));
  const ledger_id = await mkLedger(facts);
  if (opts.delivered !== undefined) {
    const real = aiService.streamGenerateFromBrief;
    jest.spyOn(aiService, 'streamGenerateFromBrief').mockImplementation(async (...a) => ({
      ...(await real(...a)),
      bodyParaCount: opts.delivered!,
    }));
  }
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: valuesOf(facts), court, ledger_id, ...extra });
  const blocks = (res.text ?? '').split('\n\n').filter((b) => b.startsWith('event: done\n'));
  const done = blocks.length
    ? (JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, any>)
    : null;
  return { res, done, ledger_id };
}
const holds = async () =>
  (((await User.collection.findOne({ _id: OID })) as any).inkHolds ?? []) as any[];
const inkLeft = async () => (await credits.getCreditBalance(USER_ID)).totalInk;

// ── item 4: POST /paragraph-quote ────────────────────────────────────────────

describe('item 4: POST /paragraph-quote', () => {
  it('a pack that does not ask: exactly {asks:false, ink} at its class price', async () => {
    const res = await quote({ kind: 'bail_anticipatory', values: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asks: false, ink: costForTemplate('bail_anticipatory') });
  });

  it('guided (kind none) is flat', async () => {
    const res = await quote({ kind: 'none', values: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asks: false, ink: costForTemplate('guided') });
  });

  it('bail_regular asks: the full public shape, default 10 at 2 Ink, min 7 without custody, ceiling false without a ledger', async () => {
    const res = await quote({ kind: 'bail_regular', values: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      asks: true,
      ink: 2,
      min: 7,
      max: 25,
      default: 10,
      paragraphs: 10,
      bands: [
        { from: 7, to: 10, ink: 2 },
        { from: 11, to: 18, ink: 3 },
        { from: 19, to: 25, ink: 4 },
      ],
      ceiling: false,
    });
    expect(Object.keys(res.body)).not.toContain('maxInk');
    expect(Object.keys(res.body)).not.toContain('allBands');
  });

  it('prices the asked count: 11 -> 3, 19 -> 4; custody in the brief raises the minimum to 8', async () => {
    expect((await quote({ kind: 'bail_regular', paragraphs: 11 })).body.ink).toBe(3);
    expect((await quote({ kind: 'bail_regular', paragraphs: 19 })).body.ink).toBe(4);
    const c = await quote({
      kind: 'bail_regular',
      values: [{ key: 'currently_in_custody', value: 'Yes — Judicial custody' }],
    });
    expect(c.body.min).toBe(8);
    expect(c.body.bands[0]).toEqual({ from: 8, to: 10, ink: 2 });
  });

  it('with a ledger on the English path: ceiling true, and the ledger decides the minimum', async () => {
    const withCustody = await quote({
      kind: 'bail_regular',
      ledger_id: await mkLedger(regularBase()),
    });
    expect(withCustody.status).toBe(200);
    expect(withCustody.body.ceiling).toBe(true);
    expect(withCustody.body.min).toBe(8);
    const none = await quote({ kind: 'bail_regular', ledger_id: await mkLedger(NO_CUSTODY) });
    expect(none.body.min).toBe(7);
  });

  it('ceiling is false for a Hindi or bilingual draft even with a ledger', async () => {
    const ledger_id = await mkLedger(regularBase());
    for (const language of ['hi', 'bilingual']) {
      const res = await quote({ kind: 'bail_regular', ledger_id, language });
      expect(res.status).toBe(200);
      expect(res.body.ceiling).toBe(false);
    }
  });

  it('range 400: exact body with the M4 text and the real minimum', async () => {
    const low = await quote({ kind: 'bail_regular', paragraphs: 5 });
    expect(low.status).toBe(400);
    expect(low.body).toEqual({
      error: 'paragraph_count_out_of_range',
      min: 7,
      max: 25,
      paragraphs: 5,
      message: 'Choose between 7 and 25 paragraphs.',
    });
    const high = await quote({ kind: 'bail_regular', paragraphs: 26 });
    expect(high.status).toBe(400);
    expect(high.body).toEqual({
      error: 'paragraph_count_out_of_range',
      min: 7,
      max: 25,
      paragraphs: 26,
      message: 'Choose between 7 and 25 paragraphs.',
    });
    const custody = await quote({
      kind: 'bail_regular',
      paragraphs: 7,
      ledger_id: await mkLedger(regularBase()),
    });
    expect(custody.status).toBe(400);
    expect(custody.body).toMatchObject({ min: 8, message: 'Choose between 8 and 25 paragraphs.' });
  });

  it('bad input: 400 Invalid request (non-integer, 0, 101); unknown ledger 404; unknown type refused', async () => {
    for (const paragraphs of [0, 101, 7.5, '9']) {
      const r = await quote({ kind: 'bail_regular', paragraphs });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('Invalid request');
    }
    const nf = await quote({ kind: 'bail_regular', ledger_id: 'a'.repeat(24) });
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ error: 'Ledger not found' });
    const unknown = await quote({ kind: 'no_such_pack_zz' });
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.status).toBeLessThan(500);
  });

  it('a pack with missing bands is flat; with no auth it is refused', async () => {
    await AppSetting.deleteMany({ key: /^pricing\.paragraph_bands/ });
    _clearAppSettingsCache();
    const res = await quote({ kind: 'bail_regular' });
    expect(res.body).toEqual({ asks: false, ink: 2 });
    const anon = await request(app).post('/paragraph-quote').send({ kind: 'bail_regular' });
    expect([401, 403]).toContain(anon.status);
  });

  it('writes nothing: no hold, no balance change, no Generation row, no model call', async () => {
    const hold = jest.spyOn(credits, 'holdInk');
    const before = await inkLeft();
    for (const body of [{ kind: 'bail_regular' }, { kind: 'bail_regular', paragraphs: 3 }]) {
      await quote(body);
    }
    expect(hold).not.toHaveBeenCalled();
    expect(await holds()).toHaveLength(0);
    expect(await inkLeft()).toBe(before);
    expect(await Generation.countDocuments({})).toBe(0);
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockParse).not.toHaveBeenCalled();
  });
});

// ── item 5: generate-from-brief refusals and retries ─────────────────────────

describe('item 5: generate-from-brief refusals come before any hold or model call', () => {
  const noSideEffects = async (hold: jest.SpyInstance) => {
    expect(hold).not.toHaveBeenCalled();
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockParse).not.toHaveBeenCalled();
    expect(await holds()).toHaveLength(0);
    expect(await inkLeft()).toBe(40);
    expect(await Generation.countDocuments({})).toBe(0);
  };

  it('out-of-range count: 400 with the exact body', async () => {
    const hold = jest.spyOn(credits, 'holdInk');
    for (const [paragraphs, facts, min] of [
      [5, NO_CUSTODY, 7],
      [7, regularBase(), 8],
      [26, regularBase(), 8],
    ] as const) {
      const { res } = await generate([...facts], { paragraphs });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'paragraph_count_out_of_range',
        min,
        max: 25,
        paragraphs,
        message: `Choose between ${min} and 25 paragraphs.`,
      });
    }
    await noSideEffects(hold);
  });

  it('expected_ink that is not the quote: 409 price_changed with the fresh quote', async () => {
    const hold = jest.spyOn(credits, 'holdInk');
    const { res } = await generate(regularBase(), { paragraphs: 19, expected_ink: 2 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'price_changed', ink: 4 });
    const def = await generate(regularBase(), { expected_ink: 3.5 });
    expect(def.res.status).toBe(409);
    expect(def.res.body).toEqual({ error: 'price_changed', ink: 2 });
    await noSideEffects(hold);
  });

  it('expected_ink validation: negative, not a multiple of 0.5, over 1000 -> 400 Invalid request', async () => {
    const hold = jest.spyOn(credits, 'holdInk');
    for (const expected_ink of [-1, 2.3, 1001, '2']) {
      const { res } = await generate(regularBase(), { expected_ink });
      expect(res.status).toBe(400);
    }
    await noSideEffects(hold);
  });

  it('expected_ink equal to the quote goes ahead; the range check runs before the price check', async () => {
    const { res: both } = await generate(regularBase(), { paragraphs: 5, expected_ink: 99 });
    expect(both.status).toBe(400);
    expect(both.body.error).toBe('paragraph_count_out_of_range');
    const ok = await generate(
      regularBase(),
      { paragraphs: 11, expected_ink: 3 },
      { delivered: 11 },
    );
    expect(ok.res.status).toBe(200);
    expect(ok.done).not.toBeNull();
  });

  const priorRun = (over: Record<string, unknown>) =>
    new Generation({
      userId: USER_ID,
      docType: 'petition',
      templateId: 'bail_regular',
      status: 'failed',
      runId: '11111111-1111-4111-8111-111111111111',
      runSequence: 1,
      ...over,
    }).save({ validateBeforeSave: false });
  const RUN = '11111111-1111-4111-8111-111111111111';

  it('retry re-quotes the stored count when none is sent: held and debited at the stored quote', async () => {
    await priorRun({ paragraphsRequested: 19, inkQuoted: 4 });
    const hold = jest.spyOn(credits, 'holdInk');
    const { res, done } = await generate(regularBase(), { run_id: RUN }, { delivered: 19 });
    expect(res.status).toBe(200);
    expect(res.headers['x-run-sequence']).toBe('2');
    expect(hold.mock.calls[0][0]).toMatchObject({ costCredits: 4, runSequence: 2, quoted: true });
    expect(done!.inkQuoted).toBe(4);
    expect(done!.inkDebited).toBe(4);
  });

  it('retry with a different count than the stored one: 409 price_changed, nothing held', async () => {
    await priorRun({ paragraphsRequested: 19, inkQuoted: 4 });
    const hold = jest.spyOn(credits, 'holdInk');
    const { res } = await generate(regularBase(), { run_id: RUN, paragraphs: 10 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'price_changed', ink: 2 });
    expect(hold).not.toHaveBeenCalled();
    expect(mockParse).not.toHaveBeenCalled();
    expect(await holds()).toHaveLength(0);
  });

  it('retry whose price moved (band changed since the first attempt): 409 price_changed', async () => {
    await priorRun({ paragraphsRequested: 19, inkQuoted: 3 });
    const { res } = await generate(regularBase(), { run_id: RUN });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'price_changed', ink: 4 });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("retry after the bands were removed: the pack no longer asks, so today's flow (flat price, no quote fields)", async () => {
    await priorRun({ paragraphsRequested: 19, inkQuoted: 4 });
    await AppSetting.deleteMany({ key: /^pricing\.paragraph_bands/ });
    _clearAppSettingsCache();
    const { res, done } = await generate(regularBase(), { run_id: RUN, paragraphs: 19 });
    expect(res.status).toBe(200);
    expect(done).not.toHaveProperty('inkQuoted');
    expect(done!.inkDebited).toBe(2);
  });

  it('a retry with the same count and price goes through', async () => {
    await priorRun({ paragraphsRequested: 12, inkQuoted: 3 });
    const { res, done } = await generate(
      regularBase(),
      { run_id: RUN, paragraphs: 12 },
      { delivered: 12 },
    );
    expect(res.status).toBe(200);
    expect(done!.inkQuoted).toBe(3);
  });
});

// ── item 6: the pre-check is at the class price; the hold carries the quote ──

describe('item 6: pre-check at the class price, the hold is the exact check', () => {
  it('a user with exactly the class price (2 Ink) passes the gate for the default count', async () => {
    await seedUser(2);
    const { res, done } = await generate(regularBase(), {}, { delivered: 10 });
    expect(res.status).toBe(200);
    expect(done!.inkDebited).toBe(2);
  });

  it('a user with the class price asking 25 (4 Ink) passes the gate, then the hold refuses with 402 carrying 4', async () => {
    await seedUser(2);
    const { res } = await generate(regularBase(), { paragraphs: 25 });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'Insufficient Ink', cost: 4 });
    expect(res.body.message).toContain('costs 4 Ink');
    expect(await holds()).toHaveLength(0);
    expect(await inkLeft()).toBe(2);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('a user below the class price: the gate refuses with the quoted figure', async () => {
    await seedUser(1);
    const { res } = await generate(regularBase(), { paragraphs: 25 });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'Insufficient Ink', cost: 4 });
    expect(res.body.message).toContain('costs 4 Ink');
    expect(Object.keys(res.body).sort()).toEqual(
      ['balance', 'cost', 'error', 'message', 'needsTopUp', 'needsUpgrade', 'upgradeUrl'].sort(),
    );
  });

  it('a user who can afford the chosen count (4 Ink) runs it', async () => {
    await seedUser(4);
    const { res, done } = await generate(regularBase(), { paragraphs: 25 }, { delivered: 25 });
    expect(res.status).toBe(200);
    expect(done!.inkDebited).toBe(4);
    expect(await inkLeft()).toBe(0);
  });
});

// ── item 9: T-388, shown = held = debited ────────────────────────────────────

describe('item 9 (T-388): template-configs, quote route, hold, debit and done agree', () => {
  it('template-configs: bail_regular asks and shows the default quote; a non-asking pack shows costForTemplate', async () => {
    const res = await request(app).get('/template-configs').set(headers());
    expect(res.status).toBe(200);
    const rows = res.body.templates as Array<{
      template_id: string;
      credits_cost?: number;
      asks_paragraphs?: boolean;
    }>;
    const reg = rows.find((t) => t.template_id === 'bail_regular');
    expect(reg).toMatchObject({ asks_paragraphs: true, credits_cost: 2 });
    const q = await quote({ kind: 'bail_regular' });
    expect(reg!.credits_cost).toBe(q.body.ink);
    const other = rows.find((t) => t.template_id === 'bail_anticipatory');
    expect(other!.asks_paragraphs).toBe(false);
    expect(other!.credits_cost).toBe(costForTemplate('bail_anticipatory'));
    // every row carries the flag, and only asking packs say true
    expect(rows.every((t) => typeof t.asks_paragraphs === 'boolean')).toBe(true);
    expect(rows.filter((t) => t.asks_paragraphs).map((t) => t.template_id)).toEqual([
      'bail_regular',
    ]);
  });

  it.each([
    [undefined, 2],
    [8, 2],
    [10, 2],
    [11, 3],
    [18, 3],
    [19, 4],
    [25, 4],
  ])(
    'count %s: quote route, expected_ink, hold, debit, done.inkQuoted and the Generation row all say %i',
    async (paragraphs, ink) => {
      const facts = NO_CUSTODY;
      const q = await quote({ kind: 'bail_regular', paragraphs, values: valuesOf(facts) });
      expect(q.body.ink).toBe(ink);
      const hold = jest.spyOn(credits, 'holdInk');
      const { res, done } = await generate(
        facts,
        { ...(paragraphs !== undefined ? { paragraphs } : {}), expected_ink: ink },
        { delivered: paragraphs ?? 10 },
      );
      expect(res.status).toBe(200);
      expect(hold.mock.calls[0][0].costCredits).toBe(ink);
      expect(done!.inkQuoted).toBe(ink);
      expect(done!.inkDebited).toBe(ink);
      expect(done!.inkDebited).toBeLessThanOrEqual(done!.inkQuoted);
      expect(done!.paragraphsDelivered).toBe(paragraphs ?? 10);
      expect(40 - (await inkLeft())).toBe(done!.inkDebited);
      const row = await Generation.findOne({ userId: USER_ID }).lean();
      expect(row).toMatchObject({ paragraphsRequested: q.body.paragraphs, inkQuoted: ink });
    },
  );

  it('under-delivery: quote 4 (25 asked), 12 delivered -> debit 3, inkDebited 3 <= inkQuoted 4, paragraphsDelivered 12', async () => {
    const { res, done } = await generate(NO_CUSTODY, { paragraphs: 25 }, { delivered: 12 });
    expect(res.status).toBe(200);
    expect(done).toMatchObject({ inkQuoted: 4, inkDebited: 3, paragraphsDelivered: 12 });
    expect(40 - (await inkLeft())).toBe(3);
  });

  it.each([0, 1, 5, 7, 10, 11, 18, 19, 25, 26, 60])(
    'AJ-577-M6 through the route: %i delivered of 25 asked -> debit <= 4',
    async (delivered) => {
      await seedUser(40);
      const { res, done } = await generate(NO_CUSTODY, { paragraphs: 25 }, { delivered });
      expect(res.status).toBe(200);
      const debit = 40 - (await inkLeft());
      expect(debit).toBeLessThanOrEqual(4);
      expect(done!.inkDebited).toBe(debit);
      expect(done!.inkDebited).toBeLessThanOrEqual(done!.inkQuoted);
    },
  );
});

// ── item 10: null config = today ─────────────────────────────────────────────

describe('item 10: no config for the pack -> holdInk/settleInk args, done and Generation rows as today', () => {
  it('holdInk has no quoted flag, settleInk no actual units, done has no quote fields, the row has none', async () => {
    _setParagraphConfigSourceForTests(() => null);
    const hold = jest.spyOn(credits, 'holdInk');
    const settle = jest.spyOn(credits, 'settleInk');
    const target = jest.spyOn(aiService, 'streamGenerateFromBrief');
    const { res, done } = await generate(regularBase(), { paragraphs: 40 });
    expect(res.status).toBe(200);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(Object.keys(hold.mock.calls[0][0]).sort()).toEqual(
      ['costCredits', 'runId', 'runSequence', 'userId'].sort(),
    );
    expect(hold.mock.calls[0][0].costCredits).toBe(2);
    expect(settle.mock.calls[0][3]).toBeUndefined();
    expect(done).not.toHaveProperty('inkQuoted');
    expect(done).not.toHaveProperty('paragraphsDelivered');
    expect(done!.inkDebited).toBe(2);
    const row = (await Generation.findOne({ userId: USER_ID }).lean())!;
    expect(row).not.toHaveProperty('paragraphsRequested');
    expect(row).not.toHaveProperty('inkQuoted');
    // the count still reaches the drafter through clampTarget; no range check applies
    expect(target.mock.calls[0][0].targetParagraphs).toBe(clampTarget(40));
    const h = await holds();
    expect(h).toHaveLength(0);
  });

  it('missing bands: the same as today (flat), even with a count outside 7..25', async () => {
    await AppSetting.deleteMany({ key: /^pricing\.paragraph_bands/ });
    _clearAppSettingsCache();
    const hold = jest.spyOn(credits, 'holdInk');
    const { res, done } = await generate(regularBase(), { paragraphs: 3, expected_ink: 2 });
    expect(res.status).toBe(200);
    expect(Object.keys(hold.mock.calls[0][0])).not.toContain('quoted');
    expect(done).not.toHaveProperty('inkQuoted');
    expect(done!.inkDebited).toBe(2);
  });

  it('a pack that never asks (bail_anticipatory quote) is untouched by a count', async () => {
    const q = await quote({ kind: 'bail_anticipatory', paragraphs: 99 });
    expect(q.status).toBe(200);
    expect(q.body).toEqual({ asks: false, ink: 2 });
  });
});
