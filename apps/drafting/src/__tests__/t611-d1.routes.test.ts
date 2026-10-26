/**
 * T-611 on the D1 (signed skeleton) path, through the route: bail_before_magistrate with no
 * facts_narrative held prints a blank for a fact the ledger does NOT hold. That is delivered
 * (P6: a fact not held stays a blank), and GET /documents/:id serves it as [To be confirmed: ...],
 * never a raw {{MISSING token (AC1, AC5). Mocked model, no network.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import { magistrateBase, fact } from './fixtures/t373';
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

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994396b1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

beforeEach(async () => {
  mockStream.mockReset();
  mockParse.mockReset();
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

describe('D1: a blank for a fact not held is delivered, and never served raw', () => {
  it('no facts_narrative: the facts clause is a blank in the stored draft, [To be confirmed] from GET', async () => {
    const facts = [
      ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      fact('fixed.facts', 'The complaint is about a deal she had no part in.'),
    ];
    const skeleton = loadSkeleton('bail_before_magistrate')!;
    const held = new Set(facts.map((f) => f.key));
    const output: DraftParagraphsOutput = {
      paragraphs: skeleton.clauses.map((c) => ({
        clauseId: c.id,
        factRefs: [...(c.slots ?? [])].filter((s) => held.has(s)),
        text: '',
        items: [],
      })),
    };
    mockParse.mockResolvedValue(sdkParseResponse(output));
    const ledger = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_before_magistrate',
      intakeId: 'i1',
      state: { facts, unresolved: [] },
    });
    const byKey = new Map<string, string[]>();
    for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
    const values = [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v }));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_before_magistrate',
        values,
        court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
        ledger_id: String(ledger._id),
      });
    expect(res.status).toBe(200);
    const done = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
    expect(done).toHaveLength(1);
    expect(res.text).not.toContain('event: error');
    const docId = JSON.parse(done[0].split('\ndata: ')[1]).docId as string;
    const stored = decrypt((await LawieDocument.findById(docId))!.generatedContent as string);
    expect(stored).toContain('{{MISSING');
    const got = await request(app).get(`/${docId}`).set(headers());
    expect(got.status).toBe(200);
    expect(got.body.content).not.toMatch(/\{\{\s*MISSING/i);
    expect(got.body.content).toContain('[To be confirmed:');
  });
});

describe('D1: a conflicting value withholds the draft (P1), at the route', () => {
  const OID = new mongoose.Types.ObjectId(USER_ID);
  const CONFLICT = '3 May 2026'; // held as the FIR date, said in the draft to be the arrest date

  async function run(kind: 'bail_before_magistrate' | 'bail_regular', facts: any[], mutate: any) {
    const skeleton = loadSkeleton(kind)!;
    const held = new Set(facts.map((f) => f.key));
    const output: DraftParagraphsOutput = {
      paragraphs: skeleton.clauses.map((c) => ({
        clauseId: c.id,
        factRefs: [...(c.slots ?? [])].filter((s) => held.has(s)),
        text: '',
        items: [],
      })),
    };
    mutate(output);
    mockParse.mockResolvedValue(sdkParseResponse(output));
    const ledger = await createLedger({
      userId: USER_ID,
      documentKind: kind,
      intakeId: 'i1',
      state: { facts, unresolved: [] },
    });
    const byKey = new Map<string, string[]>();
    for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
    const values = [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v }));
    return request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind,
        values,
        court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
        ledger_id: String(ledger._id),
      });
  }

  it('bail_before_magistrate: fact_conflict, no done, no document, hold released, failed row, value not logged', async () => {
    const facts = [
      ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      fact('arrest_date', '12 May 2026', { type: 'date', value: '2026-05-12' }),
      // the advocate's own words: a date held as the FIR date, written as the arrest date
      fact('facts_narrative', `The arrest date was ${CONFLICT} and she had no part in the deal.`),
    ];
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const res = await run('bail_before_magistrate', facts, (o: DraftParagraphsOutput) => {
      const p = o.paragraphs.find((x) => x.clauseId === 'facts');
      if (p) p.text = `The arrest date was ${CONFLICT} and she had no part in the deal.`;
    });
    const errs = res.text
      .split('\n\n')
      .filter((b) => b.startsWith('event: error\n'))
      .map((b) => JSON.parse(b.split('\ndata: ')[1]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'fact_conflict',
      retryable: false,
      conflict: { keyA: 'arrest_date', keyB: 'fir_date' },
    });
    expect(res.text).not.toContain('event: done');
    expect(await LawieDocument.countDocuments({})).toBe(0);
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    const u = (await User.collection.findOne({ _id: OID })) as unknown as {
      inkTopup: number;
      inkSub: number;
      inkHolds: unknown[];
    };
    expect(u.inkTopup).toBe(2000);
    expect(u.inkSub).toBe(0);
    expect(u.inkHolds).toEqual([]);
    expect(
      await mongoose.connection
        .db!.collection('inkledger')
        .countDocuments({ userId: OID, reason: 'generate' }),
    ).toBe(0);
    const logged = logs
      .flatMap((s) => s.mock.calls)
      .map((c) => c.map(String).join(' '))
      .join('\n');
    expect(logged).not.toContain(CONFLICT);
    expect(logged).not.toContain('Which is right');
    logs.forEach((s) => s.mockRestore());
  });

  it('control: the same draft with the date under its own label is delivered', async () => {
    const facts = [
      ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
      fact('arrest_date', '12 May 2026', { type: 'date', value: '2026-05-12' }),
      fact('facts_narrative', 'The arrest date was 12 May 2026 and she had no part in the deal.'),
    ];
    const res = await run('bail_before_magistrate', facts, (o: DraftParagraphsOutput) => {
      o.paragraphs.find((x) => x.clauseId === 'facts')!.text =
        'The arrest date was 12 May 2026 and she had no part in the deal.';
    });
    expect(res.text).not.toContain('event: error');
    expect(res.text).toContain('event: done');
  });
});
