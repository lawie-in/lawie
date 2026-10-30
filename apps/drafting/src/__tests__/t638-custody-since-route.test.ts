/**
 * T-638 Part B (9): the generation path (ai.service.ts), route level, on the real v7 skeleton.
 * Harness as t373-route-d1.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import type { Skeleton } from '../types/skeleton';
import {
  anticipatoryBase,
  fact,
  PackId,
  regularBase,
  REGULAR_NARRATIVE_ABSOLUTE_RAW,
  regularBaseWithNarrative,
} from './fixtures/t373';
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

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390d1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

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

// ── Harness ─────────────────────────────────────────────────────────────────

/** The real skeleton, as the route gets it. */
const real = (id: PackId): Skeleton => loadSkeleton(id)!;

/** What a faithful model returns: every clause, the refs it can cite, the advocate's words for own-words clauses. */
function goodOutput(skeleton: Skeleton, facts: Fact[]): DraftParagraphsOutput {
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

/** The brief values the route re-derives from: one per key, a list when the key repeats. */
function valuesOf(facts: Fact[]) {
  const byKey = new Map<string, string[]>();
  for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
  return [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v }));
}

interface RouteRun {
  status: number;
  done: Record<string, any>;
  body: string;
  text: string;
}

async function generate(
  packId: PackId,
  facts: Fact[],
  mutate: (o: DraftParagraphsOutput) => void = () => undefined,
): Promise<RouteRun> {
  const output = goodOutput(real(packId), facts);
  mutate(output);
  mockParse.mockResolvedValue(sdkParseResponse(output));
  const ledger = await createLedger({
    userId: USER_ID,
    documentKind: packId,
    intakeId: 'i1',
    state: { facts, unresolved: [] },
  });
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: packId,
      values: valuesOf(facts),
      court,
      ledger_id: String(ledger._id),
    });
  const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
  const done = blocks.length
    ? (JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, any>)
    : {};
  let body = '';
  if (done.docId) {
    const doc = await LawieDocument.findById(done.docId);
    body = decrypt(doc!.generatedContent as string);
  }
  return { status: res.status, done, body, text: res.text };
}

const DERIVED = 'The applicant was arrested on 12 June 2026 and is now in judicial custody.';
const ORIGINAL = 'The applicant has been in judicial custody since 12 June 2026.';
const count = (h: string, n: string) => h.split(n).length - 1;
const arrest = (): Fact =>
  fact('arrest_date', '12 June 2026', { type: 'date', value: '2026-06-12' as never });
// the narrative without "three weeks ago", which the fact check reads as a date that conflicts with the arrest date
const noCustodySince = (): Fact[] =>
  regularBaseWithNarrative(REGULAR_NARRATIVE_ABSOLUTE_RAW).filter((f) => f.key !== 'custody_since');

describe('T-638 B (9) the generation path derives custody_since (R1)', () => {
  it('a regular bail with an arrest date and no custody_since: the Drafter is sent the computed fact and the body prints the derived line once', async () => {
    const r = await generate('bail_regular', [...noCustodySince(), arrest()]);
    expect(r.status).toBe(200);
    expect(r.body).not.toBe('');
    expect(count(r.body, DERIVED)).toBe(1);
    // Ajay: the marker fact may be in the Drafter's FACTS list, never in the drafted body
    expect(r.body).not.toContain('custody_since_derived');
    expect(r.body).not.toMatch(/arrest_date/);
    expect(r.body).not.toContain('has been in judicial custody since');
    expect(r.body).not.toContain('The applicant was arrested on 12 June 2026.');
    const sent = JSON.stringify(mockParse.mock.calls[0][0]);
    expect(sent).toContain('custody_since');
    expect(sent).toContain('12 June 2026');
    expect((r.done.rendered as Array<{ clauseId: string }>).map((c) => c.clauseId)).toContain(
      'custody_status_derived',
    );
  });

  it('a given custody_since equal to the arrest date keeps the original line (B5)', async () => {
    const r = await generate('bail_regular', [
      ...noCustodySince(),
      arrest(),
      fact('custody_since', '12 June 2026', { type: 'date', value: '2026-06-12' as never }),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).not.toBe('');
    expect(count(r.body, ORIGINAL)).toBe(1);
    expect(r.body).not.toContain(DERIVED);
    expect(count(r.body, 'The applicant was arrested on 12 June 2026.')).toBe(1);
  });

  it('a surrender word in the ledger facts stops the derivation', async () => {
    const r = await generate('bail_regular', [
      ...noCustodySince().filter((f) => f.key !== 'facts_narrative'),
      fact('facts_narrative', 'He surrendered before the court.', {
        raw_span: 'he surrendered before the court',
      }),
      arrest(),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).not.toBe('');
    expect(r.body).not.toContain(DERIVED);
  });

  it('another pack is unchanged: an anticipatory draft has no derived line', async () => {
    const r = await generate('bail_anticipatory', [...anticipatoryBase(), arrest()]);
    expect(r.status).toBe(200);
    expect(r.body).not.toBe('');
    expect(r.body).not.toContain(DERIVED);
  });
});

describe('T-638 B (4) the route with no ledger', () => {
  it('a derived custody_since never reaches the draft as a fact: the model is not told "in judicial custody since <arrest date>"', async () => {
    mockStream.mockImplementation(async () => sdkAnswer('Body.\n\n---CLAUSES---\n', 10, 10));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        values: [
          { key: 'applicant_name', value: 'Ramesh Kumar', source: 'user' },
          { key: 'currently_in_custody', value: 'Yes — Judicial custody', source: 'user' },
          { key: 'arrest_date', value: '2026-06-12', source: 'description' },
        ],
        description: 'Ramesh Kumar was arrested on 12 June 2026 for cheating and sent to jail.',
        court,
      });
    expect(res.status).toBe(200);
    expect(mockStream).toHaveBeenCalled();
    const prompt = String(mockStream.mock.calls[0][0].messages[0].content);
    // the arrest date is in the brief as the date of arrest; no custody date is made from it
    expect(prompt).toContain('"key": "arrest_date"');
    expect(prompt).not.toContain('"key": "custody_since"');
    expect(prompt).not.toMatch(/in (judicial|police) custody since 12 June 2026/);
  });
});
