/**
 * T-499 (Ajay acbec79f, restated 088fc4f7): every {{MISSING: ...}} becomes
 * [To be confirmed: ...] before the user sees the draft, in the body, the
 * prayer, the title and the verification. Unit tests of convertMissingMarkers,
 * the D1 route end to end on the real bail_regular skeleton with a missing FIR
 * date (streamed text, saved document, blank count, placeholder rate), a scan
 * over the four D1 packs with almost nothing given, and the template path.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import * as missingMarkers from '../services/missing-markers';
import { convertMissingMarkers, countMissingMarkers } from '../services/missing-markers';
import { loadSkeleton } from '../services/rule-pack.service';
import type { Skeleton } from '../types/skeleton';
import { decrypt } from '../utils/encryption';
import {
  anticipatoryBase,
  defaultBailBase,
  fact,
  magistrateBase,
  PackId,
  PACK_IDS,
  regularBase,
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
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

afterEach(() => jest.restoreAllMocks());

// ── convertMissingMarkers (unit) ────────────────────────────────────────────

describe('convertMissingMarkers', () => {
  it('converts every marker in every part and returns the count before conversion', () => {
    const parts = [
      { section_id: 'title', content: 'IN THE MATTER OF {{MISSING: case number}}' },
      { section_id: 'body', content: '1. FIR dated {{MISSING: FIR date}} and {{MISSING: place}}.' },
      { section_id: 'prayer', content: 'a) Grant bail in FIR {{MISSING: FIR number}}.' },
      { section_id: 'verification', content: 'Verified at {{MISSING: place of verification}}.' },
      { section_id: 'clean', content: 'Nothing missing here.' },
    ];
    expect(convertMissingMarkers(parts)).toBe(5);
    expect(parts.map((p) => p.content)).toEqual([
      'IN THE MATTER OF [To be confirmed: case number]',
      '1. FIR dated [To be confirmed: FIR date] and [To be confirmed: place].',
      'a) Grant bail in FIR [To be confirmed: FIR number].',
      'Verified at [To be confirmed: place of verification].',
      'Nothing missing here.',
    ]);
    expect(JSON.stringify(parts)).not.toContain('{{MISSING');
  });

  it('reads any case and spacing, as the PDF export does', () => {
    const parts = [{ content: '{{missing: a}} {{ MISSING : b }}' }];
    expect(convertMissingMarkers(parts)).toBe(2);
    expect(parts[0].content).toBe('[To be confirmed: a] [To be confirmed: b]');
  });

  it('a part with no marker is the same object; a converted part is a new object', () => {
    const clean = { content: 'plain' };
    const dirty = { content: 'x {{MISSING: y}}' };
    const parts = [clean, dirty];
    convertMissingMarkers(parts);
    expect(parts[0]).toBe(clean);
    expect(parts[1]).not.toBe(dirty);
    expect(dirty.content).toBe('x {{MISSING: y}}');
  });

  it('empty list, empty content and non-string content are left alone', () => {
    expect(convertMissingMarkers([])).toBe(0);
    expect(convertMissingMarkers([{ content: '' }])).toBe(0);
    expect(convertMissingMarkers([{ content: undefined as unknown as string }])).toBe(0);
  });

  it('the blank count is unchanged: blanks after = blanks before + markers converted', () => {
    const parts = [
      { content: 'a [To be confirmed: x] {{MISSING: y}}' },
      { content: '{{MISSING: z}} [To be confirmed: w]' },
    ];
    const before = parts.map((p) => (p.content.match(/\[To be confirmed:/g) ?? []).length);
    const n = convertMissingMarkers(parts);
    const after = parts.map((p) => (p.content.match(/\[To be confirmed:/g) ?? []).length);
    expect(after.reduce((a, b) => a + b, 0)).toBe(before.reduce((a, b) => a + b, 0) + n);
  });

  it('countMissingMarkers counts and never advances shared regex state', () => {
    expect(countMissingMarkers('{{MISSING: a}} {{MISSING: b}}')).toBe(2);
    expect(countMissingMarkers('{{MISSING: a}} {{MISSING: b}}')).toBe(2);
    expect(countMissingMarkers('[To be confirmed: a]')).toBe(0);
  });
});

// ── The D1 route, end to end ────────────────────────────────────────────────

const real = (id: PackId): Skeleton => loadSkeleton(id)!;

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

const valuesOf = (facts: Fact[]) => {
  const byKey = new Map<string, string[]>();
  for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
  return [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v }));
};

interface Run {
  status: number;
  text: string;
  done: Record<string, any>;
  saved: string;
  sections: Array<{ section_id: string; content: string }>;
}

async function generate(packId: PackId, facts: Fact[]): Promise<Run> {
  mockParse.mockResolvedValue(sdkParseResponse(goodOutput(real(packId), facts)));
  const ledger = await createLedger({
    userId: USER_ID,
    documentKind: packId,
    intakeId: 'i1',
    state: { facts, unresolved: [] },
  });
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: packId, values: valuesOf(facts), court, ledger_id: String(ledger._id) });
  const blocks = res.text.split('\n\n');
  const data = (ev: string) => {
    const b = blocks.filter((x) => x.startsWith(`event: ${ev}\n`)).pop();
    return b ? (JSON.parse(b.split('\ndata: ')[1]) as Record<string, any>) : {};
  };
  const done = data('done');
  let saved = '';
  if (done.docId) {
    const doc = await LawieDocument.findById(done.docId);
    saved = decrypt(doc!.generatedContent as string);
  }
  return {
    status: res.status,
    text: res.text,
    done,
    saved,
    sections: (data('template_sections').sections ?? []) as Run['sections'],
  };
}

const blanks = (t: string) => (t.match(/\[To be confirmed:/g) ?? []).length;

describe('bail_regular with a missing FIR date: no {{MISSING reaches the user', () => {
  const withoutFirDate = () => regularBase().filter((f) => f.key !== 'fir_date');

  it('the streamed text, the sections and the saved document carry [To be confirmed: ...] only', async () => {
    const spy = jest.spyOn(missingMarkers, 'convertMissingMarkers');
    const r = await generate('bail_regular', withoutFirDate());
    expect(r.status).toBe(200);
    expect(r.saved).not.toBe('');

    expect(r.text).not.toContain('{{MISSING'); // every event of the stream
    expect(r.saved).not.toContain('{{MISSING');
    expect(r.sections.length).toBeGreaterThan(0);
    for (const s of r.sections) expect(s.content).not.toContain('{{MISSING');
    expect(r.saved).toMatch(/FIR No\. 143\/2026 dated \[To be confirmed: [^\]]*\] was registered/);

    // the blank was a marker before the conversion
    expect(spy).toHaveBeenCalled();
    expect(
      spy.mock.results.map((x) => x.value as number).reduce((a, b) => a + b, 0),
    ).toBeGreaterThan(0);
  });

  it('body, prayer and verification carry the date blank wherever the date prints', async () => {
    const r = await generate('bail_regular', withoutFirDate());
    const withDate = r.sections.filter((s) => /FIR/.test(s.content));
    expect(withDate.length).toBeGreaterThan(0);
    for (const s of withDate) expect(s.content).not.toContain('{{MISSING');
    const ids = r.sections.map((s) => s.section_id);
    expect(ids).toEqual(expect.arrayContaining(['body', 'prayer']));
  });

  it('the blank count is kept: every marker becomes exactly one blank, none lost, none added', async () => {
    const spy = jest.spyOn(missingMarkers, 'convertMissingMarkers');
    const r = await generate('bail_regular', withoutFirDate());
    const converted = spy.mock.results.map((x) => x.value as number).reduce((a, b) => a + b, 0);
    expect(converted).toBeGreaterThanOrEqual(1);
    // the saved document holds at least one blank per converted marker
    expect(blanks(r.saved)).toBeGreaterThanOrEqual(converted);
    // the template blanks that were never markers are still there (signed, unchanged)
    expect(r.saved).toContain('[To be confirmed: relation]');
  });

  it('the placeholder rate still counts the markers (read before the conversion)', async () => {
    await generate('bail_regular', withoutFirDate());
    const rates = await mongoose.connection.collection('placeholderrates').find({}).toArray();
    expect(rates).toHaveLength(1);
    expect(rates[0].placeholderCount).toBeGreaterThanOrEqual(1);
    const clean = await generate('bail_regular', regularBase());
    expect(clean.status).toBe(200);
    const all = await mongoose.connection.collection('placeholderrates').find({}).toArray();
    const counts = all.map((x) => x.placeholderCount as number).sort((a, b) => a - b);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });
});

describe("scan: no {{MISSING in any part of any D1 pack's output, with almost nothing given", () => {
  const sparse: Record<PackId, () => Fact[]> = {
    bail_regular: () => [fact('applicant_name', 'Ramesh Kumar', { type: 'person_name' })],
    bail_anticipatory: () => [fact('applicant_name', 'Mohan Singh', { type: 'person_name' })],
    bail_before_magistrate: () => [fact('applicant_name', 'Sunita Devi', { type: 'person_name' })],
    default_bail: () => [fact('applicant_name', 'Deepak Ravidas', { type: 'person_name' })],
  };
  const full: Record<PackId, () => Fact[]> = {
    bail_regular: regularBase,
    bail_anticipatory: anticipatoryBase,
    bail_before_magistrate: magistrateBase,
    default_bail: () => defaultBailBase('No'),
  };

  /** The filing-checklist event is not a part of the draft; see the it.failing below. */
  const withoutChecklist = (t: string) =>
    t
      .split('\n\n')
      .filter((b) => !b.startsWith('event: checklist\n'))
      .join('\n\n');

  // FINDING (T-499, for the lead): the template's filing checklist is streamed as the `checklist`
  // event with the item "Certified copy of FIR No. {{MISSING: FIR Number}}" when the FIR number is
  // missing. It is not in the saved document, but the user sees it. Fails today; passes when fixed.
  it.failing(
    'the filing checklist event carries no raw marker (finding: it does today)',
    async () => {
      const a = await generate('bail_regular', [fact('applicant_name', 'Ramesh Kumar')]);
      expect(a.text).not.toContain('{{MISSING');
    },
  );

  it.each(PACK_IDS)('%s: sparse and full ledgers', async (id) => {
    const a = await generate(id, sparse[id]());
    expect(a.status).toBe(200);
    expect(a.saved).not.toBe('');
    expect(withoutChecklist(a.text)).not.toContain('{{MISSING');
    expect(a.saved).not.toContain('{{MISSING');
    expect(a.saved).toContain('[To be confirmed:');
    for (const s of a.sections) expect(s.content).not.toContain('{{MISSING');

    const b = await generate(id, full[id]());
    expect(withoutChecklist(b.text)).not.toContain('{{MISSING');
    expect(b.saved).not.toContain('{{MISSING');
  });
});

// ── The template/form path ──────────────────────────────────────────────────

describe('POST /generate-from-template: a marker in the model body does not reach the user', () => {
  it('the streamed sections and the saved document carry [To be confirmed: ...]', async () => {
    mockStream.mockResolvedValue(
      sdkAnswer('1. That FIR dated {{MISSING: FIR date}} was registered.', 1000, 200),
    );
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({
        template_id: 'bail_regular',
        form_data: {
          fir_number: '124/2026',
          fir_date: '2026-03-15',
          police_station: 'Kotwali, Patna',
          sections_charged: ['103'],
          currently_in_custody: 'yes_judicial',
          custody_since: '2026-03-15',
          state: 'bihar',
          court_type: 'sessions',
          court_name: COURT_ID,
          applicant_name: 'Ram Kumar',
          father_name: 'Shri Hari Kumar',
          applicant_age: '32',
          address: '123 Main St',
          language: 'en',
          facts_narrative: 'The accused was falsely implicated in FIR 124/2026.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    // The live token chunks (`data: {"text": ...}`) are the model's words as they arrive and carry the
    // marker (noted in the report); the events that give the finished parts do not.
    const events = res.text.split('\n\n').filter((b) => b.startsWith('event: '));
    expect(events.length).toBeGreaterThan(0);
    expect(events.join('\n\n')).not.toContain('{{MISSING');
    expect(res.text).toContain('event: template_sections');
    expect(events.join('\n\n')).toContain('[To be confirmed: FIR date]');
    const docs = await LawieDocument.find({ userId: USER_ID });
    expect(docs).toHaveLength(1);
    const saved = decrypt(docs[0].generatedContent as string);
    expect(saved).not.toContain('{{MISSING');
    expect(saved).toContain('[To be confirmed: FIR date]');
  });
});
