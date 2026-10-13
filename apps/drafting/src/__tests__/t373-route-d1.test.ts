/**
 * T-373 (ADR-025 D1), route level, on the four REAL signed skeletons
 * (config/document-rules/_skeletons/): POST /generate-from-brief with a stored
 * ledger and an SDK stub that answers `messages.parse`. No skeleton is
 * injected and the loader is not mocked: this is the default the route runs.
 * T-359's acceptance criteria are driven end to end with Anushka's run-3
 * ledgers (fixtures/t373). The saved body is read back from the Document.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import type { Skeleton } from '../types/skeleton';
import {
  anticipatoryBase,
  defaultBailBase,
  fact,
  magistrateBase,
  PackId,
  regularBase,
  REGULAR_NARRATIVE_ABSOLUTE_RAW,
  REGULAR_NARRATIVE_RAW,
  regularBaseWithNarrative,
  sections,
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
  await User.create({
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

const statusOf = (r: RouteRun, id: string): string | undefined =>
  (r.done.rendered as Array<{ clauseId: string; status: string }>).find((c) => c.clauseId === id)
    ?.status;

/** The Magistrate ledger as production builds it today: no facts_narrative item exists in the pack, so
 *  the advocate's facts are in fixed.facts (T-365 adds the field; see the it.failing in t373-round3). */
const magistrateToday = (): Fact[] => [
  ...magistrateBase().filter((f) => f.key !== 'facts_narrative'),
  fact('fixed.facts', 'The complaint is about a deal she had no part in.', {
    raw_span: 'the complaint is about a deal she had no part in',
  }),
];

const PACKS: Array<{
  id: PackId;
  facts: () => Fact[];
  /** A sentence of signed text that a valid draft must carry, and the clause that holds it. */
  signed: string;
  name: string;
}> = [
  {
    id: 'bail_regular',
    facts: regularBase,
    signed: 'The applicant has no criminal antecedents.',
    name: 'Ramesh Kumar',
  },
  {
    id: 'bail_anticipatory',
    facts: anticipatoryBase,
    signed: 'The applicant has no criminal antecedents.',
    name: 'Mohan Singh',
  },
  {
    id: 'bail_before_magistrate',
    facts: magistrateToday,
    signed: 'If released on bail, the applicant undertakes not to abscond',
    name: 'Sunita Devi',
  },
  {
    id: 'default_bail',
    facts: () => defaultBailBase('Yes'),
    signed: 'The applicant undertakes to furnish bail bonds and sureties',
    name: 'Deepak Ravidas',
  },
];

// ── The four real skeletons, valid reply ────────────────────────────────────

describe.each(PACKS)('$id: a valid structured reply on the real skeleton', (p) => {
  it('is drafted with one messages.parse, no stream, and the done event carries rendered[]', async () => {
    const r = await generate(p.id, p.facts());
    expect(r.status).toBe(200);
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
    const ids = new Set(real(p.id).clauses.map((c) => c.id));
    const rendered = r.done.rendered as Array<{ clauseId: string; status: string }>;
    expect(Array.isArray(rendered)).toBe(true);
    expect(rendered.length).toBeGreaterThan(0);
    for (const c of rendered) expect(ids.has(c.clauseId)).toBe(true);
    for (const c of rendered) expect(['ok', 'missing', 'fallback']).toContain(c.status);
  });

  it('missingClauses is derived from rendered[] and the old fact check is not in the done event', async () => {
    const r = await generate(p.id, p.facts());
    const missing = (r.done.rendered as Array<{ clauseId: string; status: string }>)
      .filter((c) => c.status === 'missing')
      .map((c) => c.clauseId);
    expect((r.done.missingClauses as Array<{ id: string }>).map((m) => m.id)).toEqual(missing);
    // D1 sends no repair banner: the old verifier is a read-only log on this path.
    // Arjun B (8d72fb6): the done event has no factCheck key at all on D1 (was: banner null).
    expect(r.done).not.toHaveProperty('factCheck');
    expect(r.done.repaired).toBe(false);
    expect(mockParse).toHaveBeenCalledTimes(1); // no repair call
  });

  it('builds the body from the signed text and the applicant name, with no unfilled slot', async () => {
    const r = await generate(p.id, p.facts());
    expect(r.body).toContain(p.signed);
    expect(r.body).toContain(p.name);
    expect(r.body).not.toMatch(/\{[a-z_]+\}/);
  });
});

// ── Magistrate: the facts clause today ──────────────────────────────────────

describe('bail_before_magistrate: the facts clause with no facts_narrative field', () => {
  it('prints MISSING for the facts clause when the ledger has no facts_narrative (Arjun option a)', async () => {
    const r = await generate('bail_before_magistrate', magistrateToday());
    expect(r.status).toBe(200);
    expect(statusOf(r, 'facts')).toBe('missing');
    expect(r.body).toContain('{{MISSING');
    expect((r.done.missingClauses as Array<{ id: string }>).map((m) => m.id)).toContain('facts');
    // T-365 added the field to the Magistrate pack; the round 3 test pins the real checklist.
  });

  it('with a facts_narrative fact the clause prints the advocate words (the pack field T-365 added)', async () => {
    const r = await generate('bail_before_magistrate', magistrateBase());
    expect(statusOf(r, 'facts')).not.toBe('missing');
    expect(r.body).toContain('The complaint is about a deal she had no part in.');
  });
});

// ── T-359, end to end through the route ─────────────────────────────────────

describe('T-359 through the route (Anushka run 3)', () => {
  it('AC1 an invented date and an invented name in the advocate clause fall back to the advocate words', async () => {
    const r = await generate('bail_regular', regularBase(), (o) => {
      o.paragraphs.find((x) => x.clauseId === 'facts')!.text =
        'He was arrested on 5 May 2026 after a quarrel with Suresh Yadav.';
    });
    expect(statusOf(r, 'facts')).toBe('fallback');
    expect(r.body).toContain(REGULAR_NARRATIVE_RAW);
    expect(r.body).not.toContain('Suresh');
    expect(r.body).not.toContain('5 May 2026');
    // A fallback is not a blank: it is not in missingClauses.
    expect((r.done.missingClauses as Array<{ id: string }>).map((m) => m.id)).not.toContain(
      'facts',
    );
  });

  it('AC1 a faithful rephrase of the advocate words is kept (ok), not replaced', async () => {
    const r = await generate(
      'bail_regular',
      regularBaseWithNarrative(REGULAR_NARRATIVE_ABSOLUTE_RAW),
      (o) => {
        o.paragraphs.find((x) => x.clauseId === 'facts')!.text =
          'He is accused in a civil dispute from a failed land-sale agreement of 2 March 2025, and was arrested.';
      },
    );
    expect(statusOf(r, 'facts')).toBe('ok');
    expect(r.body).toContain('a failed land-sale agreement of 2 March 2025, and was arrested');
  });

  it('AC1 anticipatory: roots, character and flight text the model adds in an advocate clause cannot print', async () => {
    const r = await generate('bail_anticipatory', anticipatoryBase(), (o) => {
      o.paragraphs.find((x) => x.clauseId === 'apprehension')!.text =
        'He is a law-abiding citizen with deep roots in the community and no risk of fleeing.';
    });
    expect(statusOf(r, 'apprehension')).toBe('fallback');
    expect(r.body).not.toMatch(/law-abiding|deep roots|fleeing|flight/i);
    expect(r.body).toContain('boundary quarrel with the neighbour');
  });

  it('AC1 a paragraph for a clause the skeleton does not have is dropped', async () => {
    const r = await generate('bail_regular', regularBase(), (o) => {
      o.paragraphs.push({
        clauseId: 'invented_clause',
        factRefs: [],
        text: 'The applicant is a law-abiding citizen.',
        items: [],
      });
    });
    expect(r.status).toBe(200);
    expect((r.done.rendered as Array<{ clauseId: string }>).map((c) => c.clauseId)).not.toContain(
      'invented_clause',
    );
    expect(r.body).not.toContain('law-abiding');
  });

  it('AC1 antecedents is MISSING only when the fact is absent, and prints the signed line when held', async () => {
    const held = await generate('bail_regular', regularBase());
    expect(statusOf(held, 'antecedents')).toBe('ok');
    expect(held.body).toContain('The applicant has no criminal antecedents.');

    const absent = await generate(
      'bail_regular',
      regularBase().filter((f) => f.key !== 'antecedents'),
    );
    expect(statusOf(absent, 'antecedents')).toBe('missing');
    expect(absent.body).toContain('{{MISSING');
    expect(absent.body).not.toContain('no criminal antecedents');
    expect((absent.done.missingClauses as Array<{ id: string }>).map((m) => m.id)).toContain(
      'antecedents',
    );
  });

  it('AC2 every ground ticked is in the draft, one item each, and a ground not ticked is not', async () => {
    const r = await generate('bail_regular', regularBase());
    expect(r.body).toContain('The applicant has been falsely implicated in this case.');
    expect(r.body).toContain('The applicant will cooperate with the investigation and the trial.');
    expect(r.body).toContain(
      'There is no likelihood of the applicant tampering with the evidence or influencing any witness.',
    );
    expect(r.body).not.toContain('Medical');
    expect(r.body).not.toContain('mediation');
    expect(statusOf(r, 'grounds')).toBe('ok');
    expect(r.body).not.toContain('[To be confirmed]');
  });

  it('AC2 a single ticked ground on the anticipatory pack prints that ground only', async () => {
    const r = await generate('bail_anticipatory', anticipatoryBase());
    expect(r.body).toContain('The applicant has been falsely implicated in this case.');
    expect(r.body).not.toContain('essentially civil in nature');
    expect(r.body).not.toContain('has roots in society');
  });

  it('AC3 a section entered twice prints once in the FIR line', async () => {
    const r = await generate('bail_regular', regularBase());
    const fir = r.body.split('\n').find((l) => l.includes('FIR No. 143/2026'))!;
    expect(fir).toBeDefined();
    expect(fir.match(/318\(4\)/g)).toHaveLength(1);
    expect(fir).toContain('316(2)');
  });

  it('AC4 default bail with bail bonds = No prints no bond undertaking, only the blank', async () => {
    const r = await generate('default_bail', defaultBailBase('No'));
    expect(statusOf(r, 'willingness')).toBe('missing');
    expect(r.body).not.toContain('undertakes to furnish bail bonds');
    expect(r.body).toContain('{{MISSING');
    expect((r.done.missingClauses as Array<{ id: string }>).map((m) => m.id)).toContain(
      'willingness',
    );
  });

  it('AC4 default bail with bail bonds = Yes prints the undertaking', async () => {
    const r = await generate('default_bail', defaultBailBase('Yes'));
    expect(statusOf(r, 'willingness')).toBe('ok');
    expect(r.body).toContain('undertakes to furnish bail bonds and sureties');
  });

  it('AC7 Magistrate, woman and non-bailable: the BNSS 480(1) first-proviso line, with "may"', async () => {
    const r = await generate('bail_before_magistrate', magistrateToday());
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    expect(r.body).toContain("this Hon'ble Court may release her on bail");
  });

  it('AC7 Magistrate, a man: no woman proviso', async () => {
    const facts = [
      ...magistrateToday().filter((f) => f.key !== 'applicant_sex'),
      ...magistrateBase({ woman: false }).filter((f) => f.key === 'applicant_sex'),
    ];
    const r = await generate('bail_before_magistrate', facts);
    expect(r.body).not.toContain('first proviso');
  });

  // FINDING (template, not the skeleton): the Magistrate verification section prints a literal "S/o" before
  // the blank even for a woman (AC6: no "S/o" for a woman; W/o or D/o as given, else a blank). Seen in the
  // saved draft of the route run above. Pinned with it.failing; flips to a pass when the relation is fixed.
  it.failing('AC6 FINDING: a woman applicant is not given "S/o" in the verification', async () => {
    const r = await generate('bail_before_magistrate', magistrateToday());
    const verification = r.text.split('VERIFICATION')[1] ?? '';
    expect(verification).toContain('Sunita Devi');
    expect(verification.split('aged about')[0]).not.toContain('S/o');
  });

  it('a duplicate section list built with the helper also prints once (guards the fixture)', () => {
    expect(sections('sections_charged', ['BNS 318(4)', 'BNS 318(4)'])).toHaveLength(2);
  });
});

// ── The skeleton is on by default; the stream is never reached ──────────────

describe('the default', () => {
  it('every one of the four packs takes messages.parse, never messages.stream', async () => {
    for (const p of PACKS) {
      mockParse.mockReset();
      mockStream.mockReset();
      mockStream.mockImplementation(async () => sdkAnswer('legacy body', 10, 10));
      await generate(p.id, p.facts());
      expect(mockParse).toHaveBeenCalledTimes(1);
      expect(mockStream).not.toHaveBeenCalled();
    }
  });
});
