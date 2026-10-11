/**
 * T-147e — one fixture through the real pipeline, in-process, through the
 * service's own routes (as scripts/intake-gate.ts does for T-113):
 *
 *   POST /intake/brief            reception + extraction -> fact ledger
 *   POST /intake/brief/update     the fixture's answers, written to the ledger
 *   POST /documents/generate-from-brief   ledger Drafter -> fact verifier
 *
 * Then it reads back every row the run wrote, by runId and intakeId: the
 * document, the Generation rows, the LlmAuxCall rows, the ledger and the
 * verifier's FactDiff rows, and checks each one is marked fixture (AC4).
 * No drafting logic is repeated here.
 *
 * Load only after modules.ts has installed its seams.
 */
import { join } from 'path';

import { CallPurpose, DRAFTING_DIR, ModelSeam, requireFromDrafting } from './modules';
import {
  ExtractionRead,
  FactDiffEvidence,
  Fixture,
  LedgerEvidence,
  RunEvidence,
  TokenUse,
} from './types';

const src = (p: string) => join(DRAFTING_DIR, 'src', p);

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Drafting {
  app: any;
  mongoose: any;
  redis: any;
  request: any;
  decrypt: (s: string) => string;
  models: {
    LawieDocument: any;
    Generation: any;
    LlmAuxCall: any;
    FactLedgerModel: any;
    FactDiff: any;
    Event: any;
    CreditLedger: any;
  };
  origin: {
    GOLDEN_SET_USER_ID: string;
    NOT_FIXTURE: Record<string, unknown>;
    NOT_FIXTURE_GENERATION: Record<string, unknown>;
  };
  INTERNAL_HEADERS: Record<string, string>;
  internalSecret: string;
  parseModelJson: (t: string) => any;
}

export function loadDrafting(internalSecret: string): Drafting {
  const r = <T = any>(p: string): T => requireFromDrafting<T>(src(p));
  return {
    app: r<any>('app').default,
    mongoose: requireFromDrafting<any>('mongoose'),
    redis: r<any>('config/redis').default,
    request: requireFromDrafting<any>('supertest'),
    decrypt: r<any>('utils/encryption').decrypt,
    models: {
      LawieDocument: r<any>('models/Document.model').LawieDocument,
      Generation: r<any>('models/Generation.model').Generation,
      LlmAuxCall: r<any>('models/LlmAuxCall.model').LlmAuxCall,
      FactLedgerModel: r<any>('models/FactLedger.model').FactLedgerModel,
      FactDiff: r<any>('models/FactDiff.model').FactDiff,
      Event: r<any>('models/Event.model').Event,
      CreditLedger: r<any>('models/CreditLedger.model').CreditLedger,
    },
    origin: r<any>('services/run-origin'),
    INTERNAL_HEADERS: requireFromDrafting<any>('@lawie/shared').INTERNAL_HEADERS,
    internalSecret,
    parseModelJson: r<any>('services/intake-text').parseModelJson,
  };
}

interface SseEvent {
  event: string;
  data: any;
}

export function parseSse(text: string): SseEvent[] {
  const out: SseEvent[] = [];
  for (const block of text.split(/\n\n+/)) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) continue;
    try {
      out.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      out.push({ event, data: data.join('\n') });
    }
  }
  return out;
}

class Stop extends Error {}

type Value = string | string[];
interface GivenValue {
  key: string;
  value: Value;
  source: 'description' | 'user';
  quote?: string;
  label?: string;
}

/** What the web app sends as `values` after a brief (briefTypes.valuesAfter, placed values only). */
function valuesOf(brief: any): GivenValue[] {
  const out: GivenValue[] = [];
  for (const item of brief?.items ?? []) {
    const v = item.value;
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out.push({
      key: item.key,
      value: v,
      source: item.source === 'description' ? 'description' : 'user',
      ...(item.quote ? { quote: item.quote } : {}),
      label: item.label,
    });
  }
  return out;
}

const ZERO: TokenUse = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };

export async function runFixture(
  d: Drafting,
  seam: ModelSeam,
  fixture: Fixture,
): Promise<RunEvidence & { calls: CallPurpose[] }> {
  const ev: RunEvidence & { calls: CallPurpose[] } = {
    fixtureId: fixture.id,
    runId: null,
    intakeId: null,
    documentId: null,
    ledgerId: null,
    pipelineError: null,
    deliveredText: null,
    ledger: null,
    factDiffs: [],
    missingClauses: [],
    banner: false,
    tokens: { ...ZERO },
    extraction: [],
    isolation: { ok: true, problems: [] },
    calls: [],
  };
  const started = new Date();
  const H = d.INTERNAL_HEADERS;
  const userId = d.origin.GOLDEN_SET_USER_ID;
  const post = (path: string, body: unknown) =>
    d
      .request(d.app)
      .post(path)
      .set(H.SECRET, d.internalSecret)
      .set(H.USER_ID, userId)
      .set(H.USER_PLAN, 'pro')
      .set(H.USER_ROLE, 'Advocate')
      .set(H.USER_NAME, '')
      .set(H.USER_EMAIL, '')
      .buffer(true)
      .parse((res: any, cb: (e: null, b: string) => void) => {
        let s = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (s += c));
        res.on('end', () => cb(null, s));
      })
      .send(body);
  const json = (res: any): any => {
    try {
      return JSON.parse(res.body as string);
    } catch {
      return {};
    }
  };
  const court = fixture.court ?? undefined;
  let fields: Record<string, string> = {};

  try {
    await d.redis.flushall();

    // 1. Describe: reception, extraction, the ledger.
    const r1 = await post('/intake/brief', {
      description: fixture.description,
      language: fixture.language,
      kind: fixture.pack,
      ...(court ? { court } : {}),
    });
    const b1 = json(r1);
    ev.intakeId = b1.intake_id ?? null;
    if (r1.status !== 200 || b1.outcome !== 'brief') {
      throw new Stop(`intake: HTTP ${r1.status}, outcome ${b1.outcome ?? b1.error ?? 'none'} (expected a brief)`);
    }
    if (!b1.ledger) throw new Stop('intake: no fact ledger came back (feature.fact_ledger path not taken)');
    ev.ledgerId = b1.ledger.ledger_id;
    fields = b1.ledger.fields ?? {};
    let brief = b1.brief;
    let values = valuesOf(brief);

    // 2. The advocate's answers, as the questions step sends them.
    if (fixture.answers && fixture.answers.length > 0) {
      for (const a of fixture.answers) {
        values = [...values.filter((v) => v.key !== a.key), { key: a.key, value: a.value, source: 'user' }];
      }
      const r2 = await post('/intake/brief/update', {
        kind: fixture.pack,
        values,
        ...(court ? { court } : {}),
        description: fixture.description,
        ledger_id: ev.ledgerId,
        ledger_edits: fixture.answers.map((a) => ({ key: a.key, text: a.value, from_question: true })),
      });
      const b2 = json(r2);
      if (r2.status !== 200 || !b2.brief) throw new Stop(`answers: HTTP ${r2.status} ${b2.error ?? ''}`.trim());
      brief = b2.brief;
      values = valuesOf(brief);
    }

    // 3. Draft from the ledger; the verifier runs inside.
    const r3 = await post('/generate-from-brief', {
      kind: fixture.pack,
      values,
      ...(court ? { court } : {}),
      language: fixture.language,
      ...(ev.intakeId ? { intake_id: ev.intakeId } : {}),
      described: fixture.description,
      ledger_id: ev.ledgerId,
    });
    ev.runId = (r3.headers?.['x-run-id'] as string | undefined) ?? null;
    if (r3.status !== 200) {
      const b3 = json(r3);
      throw new Stop(
        `generate: HTTP ${r3.status} ${b3.error ?? ''}${b3.message ? ` — ${b3.message}` : ''}${b3.blockers ? ` (missing: ${b3.blockers.join(', ')})` : ''}`,
      );
    }
    const events = parseSse(r3.body as string);
    const err = events.find((e) => e.event === 'error');
    const done = events.find((e) => e.event === 'done');
    if (err) throw new Stop(`generate: the model call failed (${err.data?.code ?? 'unknown'}: ${err.data?.reason ?? ''})`);
    if (!done) throw new Stop('generate: the stream ended without a done event');
    ev.documentId = done.data.docId ?? null;
    ev.runId = done.data.runId ?? ev.runId;
    ev.missingClauses = (done.data.missingClauses ?? []).map((m: { id: string }) => m.id);
    ev.banner = Boolean(done.data.factCheck?.banner);
    if (!ev.documentId) throw new Stop('generate: the draft was not saved');
  } catch (e) {
    ev.pipelineError = e instanceof Stop ? e.message : `harness: ${e instanceof Error ? e.name : 'error'}: ${e instanceof Error ? e.message.split('\n')[0] : ''}`;
  }

  ev.calls = seam.takeCalls();
  ev.extraction = extractionReads(d, seam.takeExtractReplies(), fields);
  await collect(d, ev, started);
  return ev;
}

function extractionReads(d: Drafting, replies: string[], fields: Record<string, string>): ExtractionRead[] {
  const out: ExtractionRead[] = [];
  for (const text of replies) {
    const parsed = d.parseModelJson(text);
    for (const f of Array.isArray(parsed?.facts) ? parsed.facts : []) {
      if (typeof f?.key !== 'string' || typeof f?.span !== 'string' || typeof f?.confidence !== 'number') continue;
      out.push({ key: f.key, type: fields[f.key] ?? 'unknown', span: f.span, confidence: f.confidence });
    }
  }
  return out;
}

/** Read back every row of the run, and check each is a fixture row (AC4). */
async function collect(d: Drafting, ev: RunEvidence, started: Date): Promise<void> {
  const m = d.models;
  const problems = ev.isolation.problems;
  const oid = new d.mongoose.Types.ObjectId(d.origin.GOLDEN_SET_USER_ID);
  const tokens: TokenUse = { ...ZERO };

  if (ev.documentId) {
    const doc = await m.LawieDocument.findById(ev.documentId).lean();
    if (doc) {
      ev.deliveredText = d.decrypt(doc.finalContent ?? doc.generatedContent);
      if (doc.runType !== 'fixture') problems.push(`Document ${ev.documentId} runType=${doc.runType}`);
      const visible = await m.LawieDocument.countDocuments({ _id: doc._id, ...d.origin.NOT_FIXTURE });
      if (visible !== 0) problems.push(`Document ${ev.documentId} passes the user-facing filter`);
    } else {
      ev.pipelineError = ev.pipelineError ?? `document ${ev.documentId} not found after the run`;
    }
  }
  if (ev.runId) {
    for (const g of await m.Generation.find({ runId: ev.runId }).lean()) {
      tokens.inputTokens += g.inputTokens ?? 0;
      tokens.outputTokens += g.outputTokens ?? 0;
      tokens.costUsd += g.costUsd ?? 0;
      tokens.calls += g.llmCalls ?? 0;
      if (g.runOrigin !== 'fixture') problems.push(`Generation ${g._id} runOrigin=${g.runOrigin}`);
    }
    const diffs = await m.FactDiff.find({ runId: ev.runId }).lean();
    ev.factDiffs = diffs.map(
      (r: any): FactDiffEvidence => ({
        check: r.check,
        entityType: r.entityType,
        ledgerKey: r.ledgerKey,
        label: r.label,
        bannedEntryId: r.bannedEntryId,
        draftValue: r.draftValue === null ? null : d.decrypt(r.draftValue),
        ledgerValue: r.ledgerValue === null ? null : d.decrypt(r.ledgerValue),
        resolution: r.resolution,
        phase: r.phase,
        paragraphIndex: r.paragraphIndex,
      }),
    );
    for (const r of diffs) if (r.runType !== 'fixture') problems.push(`FactDiff ${r._id} runType=${r.runType}`);
  }
  if (ev.intakeId) {
    for (const a of await m.LlmAuxCall.find({ intakeId: ev.intakeId }).lean()) {
      tokens.inputTokens += a.inputTokens ?? 0;
      tokens.outputTokens += a.outputTokens ?? 0;
      tokens.costUsd += a.costUsd ?? 0;
      tokens.calls += 1;
      if (a.runType !== 'fixture') problems.push(`LlmAuxCall ${a._id} runType=${a.runType}`);
    }
  }
  if (ev.ledgerId) {
    const l = await m.FactLedgerModel.findById(ev.ledgerId).lean();
    if (l) {
      if (l.runType !== 'fixture') problems.push(`FactLedger ${ev.ledgerId} runType=${l.runType}`);
      const v = l.versions[l.versions.length - 1] ?? { facts: [], unresolved: [] };
      const ledger: LedgerEvidence = {
        facts: (v.facts ?? []).map((f: any) => ({ key: f.key, type: f.type, display: String(f.display), confidence: f.confidence, raw_span: f.raw_span })),
        unresolved: (v.unresolved ?? []).map((u: any) => ({ key: u.key, type: u.type, reason: u.reason, raw_span: u.raw_span })),
      };
      ev.ledger = ledger;
    }
  }
  for (const e of await m.Event.find({ userId: oid, createdAt: { $gte: started } }).lean()) {
    if (e.runType !== 'fixture') problems.push(`Event ${e._id} (${e.type}) runType=${e.runType}`);
  }
  const db = d.mongoose.connection.db;
  const ink = await db.collection('inkledger').countDocuments({ userId: oid, createdAt: { $gte: started } });
  if (ink > 0) problems.push(`${ink} inkledger row(s) written for the fixture user`);
  const credit = await m.CreditLedger.countDocuments({ userId: oid, createdAt: { $gte: started } });
  if (credit > 0) problems.push(`${credit} CreditLedger row(s) written for the fixture user`);
  if (await db.collection('users').findOne({ _id: oid })) {
    problems.push('a users row exists for the fixture user (it must have none: no balance, no counts)');
  }
  ev.tokens = tokens;
  ev.isolation.ok = problems.length === 0;
}
