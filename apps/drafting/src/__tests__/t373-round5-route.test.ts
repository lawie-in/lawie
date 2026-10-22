/**
 * T-373 round 5, route level (in-memory Mongo, SDK stubbed):
 *  - the D1 done event never carries a factCheck key
 *  - D1 fact-diff rows carry path 'd1' and exclude date/amount findings the advocate wrote verbatim
 *  - the guided route passes the profile name as advocateName
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactDiff } from '../models/FactDiff.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { fact, regularBase } from './fixtures/t373';
import { sdkAnswer, sdkParseResponse } from './sdkStream';

const mockStream = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub(
    (...args: unknown[]) => mockStream(...args),
    (...args: unknown[]) => mockParse(...args),
  ),
);

type Fact = ReturnType<typeof regularBase>[number];
const guidedSpy = jest.spyOn(aiService, 'streamGenerateGuided');

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390d2';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

function headers(name = 'Test Advocate') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': name,
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

beforeEach(async () => {
  mockStream.mockReset();
  mockParse.mockReset();
  guidedSpy.mockClear();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
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

async function generate(facts: Fact[]) {
  mockParse.mockResolvedValue(sdkParseResponse(goodOutput(facts)));
  const ledger = await createLedger({
    userId: USER_ID,
    documentKind: 'bail_regular',
    intakeId: 'i1',
    state: { facts, unresolved: [] },
  });
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: 'bail_regular', values: valuesOf(facts), court, ledger_id: String(ledger._id) });
  const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
  const done = blocks.length
    ? (JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, any>)
    : {};
  return { res, done };
}

const NARRATIVE =
  'He is accused in a civil dispute: he paid Rs 8,00,000 to the seller on 2 Mar 2025 and the deal failed.';
const withNarrative = (raw: string): Fact[] => [
  ...regularBase().filter((f) => f.key !== 'facts_narrative'),
  fact('facts_narrative', raw, { raw_span: raw }),
];

describe('round 5: the D1 done event', () => {
  it('has no factCheck key at all, with or without findings', async () => {
    for (const facts of [regularBase(), withNarrative(NARRATIVE)]) {
      const { res, done } = await generate(facts);
      expect(res.status).toBe(200);
      expect(Array.isArray(done.rendered)).toBe(true);
      expect(Object.keys(done)).not.toContain('factCheck');
      expect(done).not.toHaveProperty('factCheck');
    }
  });
});

describe('round 5: D1 fact-diff rows', () => {
  it('a verbatim date and amount in the advocate narrative write no date/amount row; any row is path d1', async () => {
    const { res } = await generate(withNarrative(NARRATIVE));
    expect(res.status).toBe(200);
    const rows = await FactDiff.find({}).lean();
    expect(rows.every((r) => r.path === 'd1')).toBe(true);
    expect(
      rows.filter(
        (r) => ['date', 'amount'].includes(String(r.entityType)) && r.check === 'unsupported',
      ),
    ).toEqual([]);
  });

  it('a finding the filter does not cover is still logged, tagged d1 (the log is not silenced)', async () => {
    // A banned phrase in the advocate's own words is a real read-only finding on D1.
    const raw =
      'He is accused in a civil dispute. He is gainfully employed and cooperated with the investigation.';
    const { res, done } = await generate(withNarrative(raw));
    expect(res.status).toBe(200);
    expect(done).not.toHaveProperty('factCheck');
    const rows = await FactDiff.find({}).lean();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.path === 'd1')).toBe(true);
  });
});

describe('round 5: the guided route passes advocateName', () => {
  const body = {
    kind: 'none',
    kind_name: 'Consent letter',
    values: [
      {
        key: 'fixed.first_party',
        value: 'Sunita Devi',
        source: 'description',
        quote: 'Sunita Devi',
      },
      { key: 'fixed.other_party', value: 'Patna Municipal Corporation' },
      { key: 'fixed.facts', value: 'She owns shop no. 12 at Boring Road.' },
      { key: 'fixed.relief', value: 'Consent to use the shop as a clinic.' },
    ],
  };

  it('the profile name reaches streamGenerateGuided', async () => {
    mockStream.mockResolvedValue(sdkAnswer('Date: x\n\n1. That I own the shop.', 100, 50));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers('Anita Sharma'))
      .send(body);
    expect(res.status).toBe(200);
    expect(guidedSpy).toHaveBeenCalledTimes(1);
    expect(guidedSpy.mock.calls[0][0]).toMatchObject({ advocateName: 'Anita Sharma' });
  });

  it('no profile name: advocateName is undefined, not an empty string', async () => {
    mockStream.mockResolvedValue(sdkAnswer('Date: x\n\n1. That I own the shop.', 100, 50));
    const res = await request(app).post('/generate-from-brief').set(headers('')).send(body);
    expect(res.status).toBe(200);
    expect(guidedSpy.mock.calls[0][0].advocateName).toBeUndefined();
  });
});
