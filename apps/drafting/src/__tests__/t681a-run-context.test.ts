/**
 * T-681a — run_id / run_sequence / template_id on llm_call lines, taken from the
 * run context (AsyncLocalStorage). Unit tests of run-context + logLlmCall, then
 * route-level tests: a generate-from-template run and a generate-from-brief run
 * log their calls with the run's ids, and the preflight call logs none.
 * SDK stubbed; ids only, never user text.
 */
import './setupDb';

import { EventEmitter } from 'events';
import { Readable } from 'stream';
import request from 'supertest';

const mockStream = jest.fn();
const mockCreate = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      stream: (...a: unknown[]) => mockStream(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      parse: (...a: unknown[]) => mockParse(...a),
    },
  })),
}));

import app from '../app';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import { createLedger } from '../services/fact-ledger.service';
import { runIntake } from '../services/intake.service';
import { buildChecklist } from '../services/intake-brief';
import {
  _clearAiEffortCache,
  LlmCallRecord,
  logLlmCall,
  setLlmCallListener,
  setLlmLogFixtureId,
} from '../services/llm-usage';
import { currentRunContext, runWithRunContext } from '../services/run-context';
import { loadRulePack, loadSkeleton } from '../services/rule-pack.service';
import { seedCourts } from './seedCourts';
import { magistrateBase, fact } from './fixtures/t373';
import { sdkAnswer, sdkParseResponse } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

const SECRET = 'ZZ-SECRET-T681A-RUNCTX-Ramesh-Kumar';
const base = {
  stage: 'body',
  call: 'stream',
  model: 'm',
  effort: 'low',
  status: 'completed',
  startedAt: 1000,
  durationMs: 1,
} as const;

let records: LlmCallRecord[] = [];
const tick = () => new Promise<void>((r) => setImmediate(r));

beforeEach(() => {
  records = [];
  setLlmLogFixtureId(null);
  setLlmCallListener((r) => records.push(r));
});
afterEach(() => {
  setLlmCallListener(null);
  jest.restoreAllMocks();
});

// ── unit: run-context ───────────────────────────────────────────────────────

describe('run context (unit)', () => {
  it('is undefined outside a run, and logLlmCall omits run_id, run_sequence and template_id', () => {
    expect(currentRunContext()).toBeUndefined();
    logLlmCall({ ...base });
    const r = records[0] as unknown as Record<string, unknown>;
    expect(r).not.toHaveProperty('run_id');
    expect(r).not.toHaveProperty('run_sequence');
    expect(r).not.toHaveProperty('template_id');
  });

  it('is undefined again after the run ends', async () => {
    await runWithRunContext({ runId: 'r1', runSequence: 1 }, async () => {
      await tick();
    });
    expect(currentRunContext()).toBeUndefined();
  });

  it('survives awaits', async () => {
    await runWithRunContext({ runId: 'r-await', runSequence: 2, templateId: 't1' }, async () => {
      await Promise.resolve();
      await tick();
      await new Promise((r) => setTimeout(r, 5));
      expect(currentRunContext()).toEqual({ runId: 'r-await', runSequence: 2, templateId: 't1' });
      logLlmCall({ ...base });
    });
    expect(records[0]).toMatchObject({ run_id: 'r-await', run_sequence: 2, template_id: 't1' });
  });

  it('survives a stream / event callback (SSE-style) registered inside the run', async () => {
    const seen: Array<string | undefined> = [];
    await runWithRunContext({ runId: 'r-sse', runSequence: 1 }, async () => {
      const em = new EventEmitter();
      const rs = Readable.from(['a', 'b', 'c']);
      const done = new Promise<void>((resolve) => {
        em.on('chunk', () => seen.push(currentRunContext()?.runId));
        rs.on('data', () => em.emit('chunk'));
        rs.on('end', () => {
          seen.push(currentRunContext()?.runId);
          logLlmCall({ ...base });
          resolve();
        });
      });
      await done;
    });
    expect(seen).toEqual(['r-sse', 'r-sse', 'r-sse', 'r-sse']);
    expect(records[0]).toMatchObject({ run_id: 'r-sse', run_sequence: 1 });
  });

  it('survives Promise.all', async () => {
    await runWithRunContext({ runId: 'r-all', runSequence: 3 }, async () => {
      await Promise.all(
        [1, 2, 3].map(async (i) => {
          await new Promise((r) => setTimeout(r, 6 - i));
          logLlmCall({ ...base, call: `c${i}` });
        }),
      );
    });
    expect(records).toHaveLength(3);
    for (const r of records) expect(r).toMatchObject({ run_id: 'r-all', run_sequence: 3 });
  });

  it('isolates two interleaved concurrent runs', async () => {
    const seen: Record<string, string[]> = { A: [], B: [] };
    const run = (name: string, id: string, seq: number, delays: number[]) =>
      runWithRunContext({ runId: id, runSequence: seq, templateId: `tpl-${name}` }, async () => {
        for (const d of delays) {
          await new Promise((r) => setTimeout(r, d));
          seen[name].push(currentRunContext()!.runId);
          logLlmCall({ ...base, call: name });
        }
      });
    await Promise.all([run('A', 'run-A', 1, [5, 1, 5, 1]), run('B', 'run-B', 7, [1, 5, 1, 5])]);
    expect(new Set(seen.A)).toEqual(new Set(['run-A']));
    expect(new Set(seen.B)).toEqual(new Set(['run-B']));
    for (const r of records) {
      if (r.call === 'A')
        expect(r).toMatchObject({ run_id: 'run-A', run_sequence: 1, template_id: 'tpl-A' });
      else expect(r).toMatchObject({ run_id: 'run-B', run_sequence: 7, template_id: 'tpl-B' });
    }
    expect(records).toHaveLength(8);
  });

  it('nested run replaces the outer one only inside, and the outer is restored', async () => {
    await runWithRunContext({ runId: 'outer', runSequence: 1 }, async () => {
      await runWithRunContext({ runId: 'inner', runSequence: 2 }, async () => {
        expect(currentRunContext()?.runId).toBe('inner');
      });
      expect(currentRunContext()?.runId).toBe('outer');
    });
  });

  it('an explicit c.runId wins; sequence and template come only from a matching context', () => {
    runWithRunContext({ runId: 'ctx-run', runSequence: 4, templateId: 'tpl' }, () => {
      logLlmCall({ ...base, runId: 'explicit-run' });
      logLlmCall({ ...base, runId: 'ctx-run' });
    });
    const [a, b] = records as unknown as Array<Record<string, unknown>>;
    expect(a.run_id).toBe('explicit-run');
    expect(a).not.toHaveProperty('run_sequence');
    expect(a).not.toHaveProperty('template_id');
    expect(b).toMatchObject({ run_id: 'ctx-run', run_sequence: 4, template_id: 'tpl' });
  });

  it('omits template_id when the context has none', () => {
    runWithRunContext({ runId: 'r', runSequence: 1 }, () => logLlmCall({ ...base }));
    expect(records[0]).toMatchObject({ run_id: 'r', run_sequence: 1 });
    expect(records[0]).not.toHaveProperty('template_id');
  });

  it('copies only the three id fields and carries no user text or user id', () => {
    const dirty = {
      runId: 'r-dirty',
      runSequence: 1,
      templateId: 't',
      userId: 'user-123',
      prompt: SECRET,
    } as unknown as Parameters<typeof runWithRunContext>[0];
    runWithRunContext(dirty, () => {
      expect(Object.keys(currentRunContext()!).sort()).toEqual([
        'runId',
        'runSequence',
        'templateId',
      ]);
      logLlmCall({ ...base });
    });
    const s = JSON.stringify(records);
    expect(s).not.toContain(SECRET);
    expect(s).not.toContain('user-123');
    expect(s).not.toMatch(/user_?id/i);
    const allowed = [
      'event',
      'stage',
      'call',
      'model',
      'effort',
      'status',
      'input_tokens',
      'output_tokens',
      'cache_read_input_tokens',
      'cache_creation_input_tokens',
      'stop_reason',
      'duration_ms',
      'started_at',
      'intake_id',
      'run_id',
      'run_sequence',
      'template_id',
      'fixture_id',
    ];
    for (const k of Object.keys(records[0])) expect(allowed).toContain(k);
  });

  it('the logger line carries the run ids too', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    runWithRunContext({ runId: 'r-line', runSequence: 5, templateId: 'tp' }, () =>
      logLlmCall({ ...base }),
    );
    expect(info.mock.calls[0][0]).toMatchObject({
      event: 'llm_call',
      run_id: 'r-line',
      run_sequence: 5,
      template_id: 'tp',
    });
  });
});

// ── route level ─────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const USER_ID = '507f1f77bcf86cd799439077';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const FORM_DATA = {
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
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

describe('route level: llm_call lines carry the run context', () => {
  seedCourts(COURT_ID);

  beforeEach(async () => {
    _clearAppSettingsCache();
    _clearAiEffortCache();
    mockStream.mockReset();
    mockCreate.mockReset();
    mockParse.mockReset();
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({ key: 'ai.preflight_model', value: 'claude-haiku-4-5-20251001' });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
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

  it('generate-from-template: body lines have the run id, sequence and template id', async () => {
    mockStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: FORM_DATA });
    expect(res.status).toBe(200);
    const runId = res.headers['x-run-id'];
    expect(runId).toBeTruthy();
    const body = records.filter((r) => r.stage === 'body');
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const r of body) {
      expect(r).toMatchObject({
        run_id: runId,
        run_sequence: Number(res.headers['x-run-sequence']),
        template_id: 'bail_regular',
      });
    }
    expect(JSON.stringify(records)).not.toContain('Ram Kumar');
  });

  it('a retry keeps the run id and bumps run_sequence on its lines', async () => {
    mockStream.mockRejectedValueOnce(new Error('503'));
    const first = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: FORM_DATA });
    const runId = first.headers['x-run-id'];
    const firstLines = records.filter((r) => r.stage === 'body');
    expect(firstLines.length).toBeGreaterThanOrEqual(1);
    expect(firstLines[0]).toMatchObject({ run_id: runId, run_sequence: 1, status: 'failed' });
    records = [];
    mockStream.mockResolvedValueOnce(sdkAnswer('1. Body.', 500, 100));
    await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: FORM_DATA, run_id: runId });
    const second = records.filter((r) => r.stage === 'body');
    expect(second.length).toBeGreaterThanOrEqual(1);
    for (const r of second) expect(r).toMatchObject({ run_id: runId, run_sequence: 2 });
  });

  it('the preflight route call logs no run_id, run_sequence or template_id', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"unusual":false,"hard_block":false,"findings":[]}' }],
      usage: { input_tokens: 5, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    const res = await request(app)
      .post('/preflight')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: FORM_DATA });
    expect(res.status).toBe(200);
    const pf = records.filter((r) => r.stage === 'preflight');
    expect(pf.length).toBeGreaterThanOrEqual(1);
    for (const r of pf) {
      const o = r as unknown as Record<string, unknown>;
      expect(o).not.toHaveProperty('run_id');
      expect(o).not.toHaveProperty('run_sequence');
      expect(o).not.toHaveProperty('template_id');
    }
  });

  it('two concurrent template runs keep their own run ids on their lines', async () => {
    const other = '507f1f77bcf86cd799439078';
    await createVerifiedUser({
      _id: other,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    mockStream.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return sdkAnswer('1. Body.', 500, 100);
    });
    const [a, b] = await Promise.all([
      request(app)
        .post('/generate-from-template')
        .set(headers(USER_ID))
        .send({ template_id: 'bail_regular', form_data: FORM_DATA }),
      request(app)
        .post('/generate-from-template')
        .set(headers(other))
        .send({ template_id: 'bail_regular', form_data: FORM_DATA }),
    ]);
    const ra = a.headers['x-run-id'];
    const rb = b.headers['x-run-id'];
    expect(ra).toBeTruthy();
    expect(rb).toBeTruthy();
    expect(ra).not.toBe(rb);
    const ids = records.filter((r) => r.stage === 'body').map((r) => r.run_id);
    expect(ids.filter((i) => i === ra).length).toBeGreaterThanOrEqual(1);
    expect(ids.filter((i) => i === rb).length).toBeGreaterThanOrEqual(1);
    expect(ids.every((i) => i === ra || i === rb)).toBe(true);
  });

  it('intake llm_call lines carry intake_id and no run_id, run_sequence or template_id', async () => {
    await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
    _clearAppSettingsCache();
    const { asyncIterable } = jest.requireActual('./sdkStream');
    mockStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: '{}' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      ]),
    );
    await runIntake({
      userId: '507f1f77bcf86cd799439079',
      plan: 'free',
      description: SECRET,
      intakeId: 'intake-681-ctx',
    });
    const lines = records.filter((r) => r.stage === 'intake');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const r of lines) {
      const o = r as unknown as Record<string, unknown>;
      expect(o.intake_id).toBe('intake-681-ctx');
      expect(o).not.toHaveProperty('run_id');
      expect(o).not.toHaveProperty('run_sequence');
      expect(o).not.toHaveProperty('template_id');
    }
    expect(JSON.stringify(records)).not.toContain(SECRET);
  });

  describe('generate-from-brief', () => {
    const PACK = loadRulePack('bail_regular')!;
    const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
    const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];
    const VALUES = [
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
    const BODY = [
      '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.',
      '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
      '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
      '4. That the applicant has deep roots in society and will not flee from justice.',
    ].join('\n\n');

    beforeEach(async () => {
      await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    });

    it('body lines carry the run id, sequence and template id; a preflight line has none', async () => {
      const answer = `${BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;
      mockStream.mockResolvedValue(sdkAnswer(answer, 4000, 800));
      const res = await request(app)
        .post('/generate-from-brief')
        .set(headers())
        .send({
          kind: 'bail_regular',
          values: VALUES,
          court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
          paragraphs: 12,
        });
      expect(res.status).toBe(200);
      const runId = res.headers['x-run-id'];
      expect(runId).toBeTruthy();
      const body = records.filter((r) => r.stage === 'body');
      expect(body.length).toBeGreaterThanOrEqual(1);
      for (const r of body) {
        expect(r).toMatchObject({
          run_id: runId,
          run_sequence: Number(res.headers['x-run-sequence']),
        });
        expect(typeof r.template_id).toBe('string');
        expect(r.template_id).toBe('bail_regular');
      }
      // A preflight call made outside the run adds a line with no run fields.
      records = [];
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"unusual":false,"hard_block":false,"findings":[]}' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
      });
      await request(app)
        .post('/preflight')
        .set(headers())
        .send({ template_id: 'bail_regular', form_data: FORM_DATA });
      const pf = records.filter((r) => r.stage === 'preflight');
      expect(pf.length).toBeGreaterThanOrEqual(1);
      for (const r of pf) expect(r).not.toHaveProperty('run_id');
    });

    it('guided branch (no rule pack): body lines carry run_id, run_sequence and template_id guided', async () => {
      mockStream.mockResolvedValue(
        sdkAnswer(
          'Date: [To be confirmed: date]\n\n1. That I, Sunita Devi, own shop no. 12.',
          400,
          80,
        ),
      );
      const res = await request(app)
        .post('/generate-from-brief')
        .set(headers())
        .send({
          kind: 'none',
          kind_name: 'consent letter for use of premises',
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
        });
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      const runId = res.headers['x-run-id'];
      expect(runId).toBeTruthy();
      const body = records.filter((r) => r.stage === 'body');
      expect(body.length).toBeGreaterThanOrEqual(1);
      for (const r of body) {
        expect(r).toMatchObject({
          run_id: runId,
          run_sequence: Number(res.headers['x-run-sequence']),
          template_id: 'guided',
        });
      }
      expect(JSON.stringify(records)).not.toContain('Sunita');
    });

    it('D1 brief path (messages.parse): the d1 line carries run_id, run_sequence and template_id', async () => {
      await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
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
      const runId = res.headers['x-run-id'];
      expect(runId).toBeTruthy();
      const d1 = records.filter((r) => r.call === 'd1');
      expect(d1.length).toBeGreaterThanOrEqual(1);
      for (const r of d1) {
        expect(r).toMatchObject({
          stage: 'body',
          run_id: runId,
          run_sequence: Number(res.headers['x-run-sequence']),
          template_id: 'bail_before_magistrate',
        });
      }
    });
  });
});

void Court;
