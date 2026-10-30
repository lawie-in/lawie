/**
 * T-691 — the drafter A/B driver: Sonnet 5.5 vs Opus 5.5, both at effort
 * high, on the v2 pipeline, blind-scored by Anushka.
 *
 *   yarn workspace @lawie/drafting ts-node --transpile-only \
 *     -O '{"module":"commonjs","moduleResolution":"node"}' ../../scripts/ab/run-ab.ts --dry
 *
 * Options: --dry | --real   --matters <id,...>   --out <dir>   --max-tokens <n>
 *          --seed <n>   --verbose
 *
 * Arjun's rulings (T-691, 30 Oct 2026):
 * - The database is ALWAYS an ephemeral in-memory Mongo started here, also
 *   with --real. MONGO_URI and GOLDEN_SET_MONGODB_URI are never read; the
 *   run refuses to start if the service's MONGO_URI is not the in-memory URI.
 *   --real only means real model calls (GOLDEN_SET_ANTHROPIC_API_KEY), and it
 *   is refused unless AB_ARJUN_GO=1 is also set.
 * - The arm is forced by AppSetting rows in that in-memory DB
 *   (ai.model.drafter / ai.drafting_model and ai.effort.drafter /
 *   ai.effort.body), written by this driver between the arms, with both
 *   settings caches cleared. Every Drafter call's llm_call record is checked
 *   for the arm's model and effort high; a mismatch stops the run.
 * - Same ledger for both arms (option a): intake once, then
 *   /generate-from-brief twice with the same values, intake_id and ledger_id.
 * - Hard cost guard: ₹600 at ₹88/$ (Vikram, handoff/finance/drafting-model-opus-vs-sonnet.md).
 *   Before a matter: refuse if spend so far plus its worst case would pass ₹600 (--real).
 *   After a matter: stop once the running total has passed ₹600, and never continue.
 *   Spend per draft ($ and ₹) goes to vikram/metrics.json under M-ids that are independent of
 *   the D-ids; intake spend per matter to vikram/intake-spend.json with no ids. stdout shows
 *   amounts only, sorted, never the arm, the run order or a D-id.
 *
 * Output (scripts/ab/out/<stamp>/, git-ignored): see blind-writer.ts. The
 * console shows counts, aggregate cost and paths only: never a model per
 * draft, the arm order, a run id next to an arm, the seed or the passphrase.
 *
 * Exit: 0 done; 1 the token or ₹ cap stopped the run, or an arm's model,
 * effort or shared ledger was not as forced; 2 refused (flags, secrets, caps); 3 fixture
 * isolation breached; 4 harness error.
 */
/* eslint-disable no-console */
import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import { RUN_LIMITS, WORST_CASE_CALLS } from '../golden-set/lib/cost';
import {
  FIXTURES_DIR as GOLDEN_FIXTURES_DIR,
  FixtureFileError,
  loadFixtures,
} from '../golden-set/lib/fixtures';
import {
  DRAFTING_DIR,
  installModelSeam,
  installRedisMock,
  requireFromDrafting,
} from '../golden-set/lib/modules';
import { Fixture, LlmCallObserved } from '../golden-set/lib/types';

import {
  AbDraft,
  AbOutcome,
  AbTokens,
  countPlaceholders,
  MIN_PASSPHRASE,
  randomSeed,
  seededRandom,
  writeBlind,
} from './blind-writer';

// ── The test as designed ────────────────────────────────────────────────────

export const ARMS = ['claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export const ARM_EFFORT = 'high';
/** Prod's intake and fact-checker model (Arjun's note §1). Not part of the A/B. */
export const INTAKE_MODEL = 'claude-haiku-5-5';

export interface FullRate {
  input: number;
  output: number;
  /** The 1 h cache write: the stored convention (llm-usage.ts, Arjun 14 Oct). */
  cacheWrite: number;
  cacheRead: number;
}

/** $/MTok, verified by Vikram on the pricing page, 29 Oct 2026 (drafting-model-opus-vs-sonnet.md). */
export const RATES: Readonly<Record<string, FullRate>> = Object.freeze({
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 4, cacheRead: 0.1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 8, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.2, cacheRead: 0.01 },
});
/** A model with no rate here is priced high, so the guard errs safe. */
export const FALLBACK_FULL_RATE: FullRate = {
  input: 15,
  output: 75,
  cacheWrite: 30,
  cacheRead: 1.5,
};
/** finance.usd_inr in prod and Vikram's note. */
export const USD_INR = 88;
/** Vikram: "A/B spend approved, hard cap ₹600". */
export const BUDGET_INR = 600;

/** Ajay's four argued matters, the spare and the run-5 WS golden, read-only from the golden set. */
export const GOLDEN_IDS = ['23', '24', '26', '28'] as const;
/** The default 10 matters: Ajay's 23, 24, 39 (O.39), 40 (s.528) and the run-5 copies 41-46. */
export const DEFAULT_MATTERS = ['23', '24', '39', '40', '41', '42', '43', '44', '45', '46'];
export const AB_FIXTURES_DIR = join(__dirname, 'fixtures');
/** Two drafts per matter; the golden set's hard cap on runs per invocation. */
export const MAX_DRAFTS = RUN_LIMITS.maxFixturesHard;

const WITHHELD_CODES = new Set(['fact_needed', 'fact_conflict']);

// ── Args ────────────────────────────────────────────────────────────────────

export interface Args {
  mode: 'dry' | 'real' | null;
  matters: string[];
  out: string;
  maxTokens: number;
  seed: number | null;
  verbose: boolean;
  errors: string[];
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    mode: null,
    matters: [...DEFAULT_MATTERS],
    out: join(__dirname, 'out'),
    maxTokens: RUN_LIMITS.maxTokensDefault,
    seed: null,
    verbose: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--dry' || f === '--real') {
      const m = f === '--dry' ? 'dry' : 'real';
      if (a.mode !== null && a.mode !== m) a.errors.push('--dry and --real together');
      else a.mode = m;
    } else if (f === '--verbose') a.verbose = true;
    else if (f === '--matters')
      a.matters = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (f === '--out') a.out = resolve(process.cwd(), argv[++i] ?? '');
    else if (f === '--max-tokens') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0)
        a.errors.push('--max-tokens needs a positive whole number');
      else a.maxTokens = n;
    } else if (f === '--seed') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
        a.errors.push('--seed needs a whole number in 0..4294967295');
      else a.seed = n;
    } else a.errors.push(`unknown option ${f}`);
  }
  if (a.mode === null)
    a.errors.push('choose --dry (stub replies, free) or --real (the real model; costs money)');
  // The seed fixes the arm order and the blind shuffle; on a command line it lands in argv,
  // shell history and ps. A real run always draws both from crypto (review round 1, MUST 2).
  if (a.mode === 'real' && a.seed !== null)
    a.errors.push('--seed is for --dry only: a real run draws its order from crypto');
  if (a.matters.length === 0) a.errors.push('--matters needs at least one id');
  if (new Set(a.matters).size !== a.matters.length) a.errors.push('--matters lists an id twice');
  if (a.matters.length * ARMS.length > MAX_DRAFTS)
    a.errors.push(`${a.matters.length * ARMS.length} drafts asked; the hard cap is ${MAX_DRAFTS}`);
  return a;
}

const USAGE =
  'Usage: run-ab.ts (--dry | --real) [--matters id,...] [--out dir] [--max-tokens n] [--seed n] [--verbose]';

// ── Matters ─────────────────────────────────────────────────────────────────

function matchesId(f: Fixture, id: string): boolean {
  return f.id === id || f.id.startsWith(`${id}-`);
}

/** The chosen matters, in the order given. Golden ids from GOLDEN_IDS only; the rest from scripts/ab/fixtures. */
export function selectMatters(
  golden: Fixture[],
  ab: Fixture[],
  ids: string[],
): { matters: Fixture[]; problems: string[] } {
  const problems: string[] = [];
  const matters: Fixture[] = [];
  for (const id of ids) {
    const fromGolden = (GOLDEN_IDS as readonly string[]).includes(id)
      ? golden.filter((f) => matchesId(f, id))
      : [];
    const fromAb = ab.filter((f) => matchesId(f, id));
    const hits = [...fromGolden, ...fromAb];
    if (hits.length === 0)
      problems.push(
        `no matter ${id} (golden ids allowed: ${GOLDEN_IDS.join(', ')}; others from scripts/ab/fixtures)`,
      );
    else if (hits.length > 1) problems.push(`matter ${id} is ambiguous`);
    else matters.push(hits[0]);
  }
  return { matters, problems };
}

/** The facts as the scorer reads them: the description and any answers on the questions step. */
export function factsOf(f: Fixture): string {
  const lines = [f.description];
  if (f.answers && f.answers.length > 0) {
    lines.push('', 'Answers on the questions step:');
    for (const a of f.answers) lines.push(`- ${a.key}: ${a.value}`);
  }
  return lines.join('\n');
}

// ── Cost ────────────────────────────────────────────────────────────────────

export function rateFor(model: string): FullRate {
  return RATES[model] ?? FALLBACK_FULL_RATE;
}

export interface AbEstimate {
  matters: number;
  typicalUsd: number;
  worstUsd: number;
  typicalInr: number;
  worstInr: number;
  /** One matter, both arms, every cap hit: the runtime guard's step. */
  perMatterWorstUsd: number;
}

/**
 * Calls the golden set's WORST_CASE_CALLS leaves out (review round 1). Coverage:
 * - Intake: this driver makes at most two intake requests per matter
 *   (POST /intake/brief, then /intake/brief/update when the fixture has
 *   answers), so a second reception and a second extraction call, plus the
 *   match call and its one retry (INTAKE_LIMITS.matchMaxTokens 300, retry 600;
 *   about 7.2k input on prod, Arjun's note §2a). Priced at the intake model.
 * - Non-body calls during an arm (counted in spend as otherUsd): none run on
 *   v2's /generate-from-brief today (the golden set does not exercise
 *   preflight). An allowance of one full-cap call per arm at the arm's model
 *   covers one if a later pipeline adds it.
 * Not covered: a body prompt beyond WORST_CASE_CALLS' 9k input (prod p95 12.3k,
 * max 14.8k); the runtime guards bound that overshoot to one matter.
 */
export const EXTRA_WORST_CALLS = [
  { purpose: 'intake_reception_2', model: 'intake', input: 4_000, output: 4_000 },
  { purpose: 'intake_extract_2', model: 'intake', input: 3_000, output: 3_000 },
  { purpose: 'intake_match', model: 'intake', input: 8_000, output: 300 },
  { purpose: 'intake_match_retry', model: 'intake', input: 8_000, output: 600 },
  { purpose: 'arm_non_body_allowance', model: 'drafting', input: 15_000, output: 8_192 },
] as const;

/**
 * From the golden set's per-call caps (WORST_CASE_CALLS) plus EXTRA_WORST_CALLS: the intake once per
 * matter at the intake model; the Drafter, repair and fact-repair calls once
 * per arm at that arm's model. Worst case prices every input token at the
 * dearer of input and 1 h cache write. Typical: intake plus the body call at a
 * third of its output cap, as the golden set's estimate does.
 */
export function estimateAb(matters: number, arms: readonly string[] = ARMS): AbEstimate {
  const intake = rateFor(INTAKE_MODEL);
  let worst = 0;
  let typical = 0;
  for (const c of [...WORST_CASE_CALLS, ...EXTRA_WORST_CALLS]) {
    const models = c.model === 'intake' ? [INTAKE_MODEL] : [...arms];
    for (const m of models) {
      const r = c.model === 'intake' ? intake : rateFor(m);
      const inWorst = Math.max(r.input, r.cacheWrite);
      worst += (c.input / 1e6) * inWorst + (c.output / 1e6) * r.output;
      if (c.purpose === 'intake_reception' || c.purpose === 'intake_extract')
        typical += (c.input / 1e6) * r.input + (c.output / 1e6) * r.output;
      if (c.purpose === 'drafter_body')
        typical += (c.input / 1e6) * r.input + (c.output / 3 / 1e6) * r.output;
    }
  }
  return {
    matters,
    typicalUsd: typical * matters,
    worstUsd: worst * matters,
    typicalInr: typical * matters * USD_INR,
    worstInr: worst * matters * USD_INR,
    perMatterWorstUsd: worst,
  };
}

export function zeroTokens(): AbTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

export function tokensOf(calls: readonly LlmCallObserved[]): AbTokens {
  const t = zeroTokens();
  for (const c of calls) {
    t.input += c.input_tokens ?? 0;
    t.output += c.output_tokens ?? 0;
    t.cacheRead += c.cache_read_input_tokens ?? 0;
    t.cacheCreation += c.cache_creation_input_tokens ?? 0;
  }
  return t;
}

/** Cost of calls at RATES: raw (cache classes at their rates) and uncached-equivalent. */
export function costOf(calls: readonly LlmCallObserved[]): {
  raw: number;
  uncachedEquivalent: number;
} {
  let raw = 0;
  let unc = 0;
  for (const c of calls) {
    const r = rateFor(c.model);
    const inp = c.input_tokens ?? 0;
    const out = c.output_tokens ?? 0;
    const cr = c.cache_read_input_tokens ?? 0;
    const cw = c.cache_creation_input_tokens ?? 0;
    raw += (inp * r.input + out * r.output + cw * r.cacheWrite + cr * r.cacheRead) / 1e6;
    unc += ((inp + cr + cw) * r.input + out * r.output) / 1e6;
  }
  return { raw, uncachedEquivalent: unc };
}

/** The arm order of one matter: both arms, the first chosen at random. */
export function armOrder(rnd: () => number): string[] {
  return rnd() < 0.5 ? [ARMS[0], ARMS[1]] : [ARMS[1], ARMS[0]];
}

/**
 * The Drafter calls of one arm must all have run on the arm's model at effort
 * high. Problems in plain words, with no model named (the console is blind).
 */
export function armCheck(
  bodyCalls: readonly LlmCallObserved[],
  model: string,
  /** True when the arm delivered a draft: then at least one Drafter call must have been seen. */
  delivered = false,
): string[] {
  const p: string[] = [];
  // A delivered draft with no Drafter call on record proves nothing about the arm's model or effort.
  if (delivered && bodyCalls.length === 0)
    p.push('a delivered draft has no Drafter call on record');
  for (const c of bodyCalls) {
    if (c.model !== model) p.push(`a Drafter call (${c.call}) ran on a model other than the arm's`);
    if (c.effort !== ARM_EFFORT)
      p.push(`a Drafter call (${c.call}) ran at effort ${c.effort ?? 'none'}, not ${ARM_EFFORT}`);
  }
  return p;
}

/** What the generate stream's error event means for the scorer. */
export function outcomeOfError(code: unknown): AbOutcome {
  const c = typeof code === 'string' ? code : 'unknown';
  return WITHHELD_CODES.has(c)
    ? { kind: 'withheld', code: c }
    : { kind: 'failed', code: `generate_${c}` };
}

// ── Console ─────────────────────────────────────────────────────────────────

/** The service's console output while a call runs: kept, shown only with --verbose. Ids only by design. */
function muted<T>(verbose: boolean, fn: () => Promise<T>): Promise<T> {
  const lines: string[] = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const sink =
    (lvl: string) =>
    (...xs: unknown[]) =>
      lines.push(
        `[${lvl}] ${xs.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')}`,
      );
  console.log = sink('log');
  console.info = sink('info');
  console.warn = sink('warn');
  console.error = sink('error');
  return fn().finally(() => {
    Object.assign(console, saved);
    if (verbose) for (const l of lines) console.log(`      ${l}`);
  });
}

// ── The run ─────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Ctx {
  d: any;
  db: any;
  memUri: string;
  settings: any;
  usage: any;
  llmCalls: LlmCallObserved[];
  verbose: boolean;
}

interface Intake {
  intakeId: string | null;
  ledgerId: string | null;
  /** The ledger's version after the answers: both arms must draft from this one. */
  ledgerVersion: number | null;
  values: any[];
  error: string | null;
}

type GivenValue = {
  key: string;
  value: unknown;
  source: 'description' | 'user';
  quote?: string;
  label?: string;
};

/** As scripts/golden-set/lib/pipeline.ts valuesOf: what the web app sends as `values`. */
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

function poster(d: any) {
  const H = d.INTERNAL_HEADERS;
  return (path: string, body: unknown) =>
    d
      .request(d.app)
      .post(path)
      .set(H.SECRET, d.internalSecret)
      .set(H.USER_ID, d.origin.GOLDEN_SET_USER_ID)
      .set(H.USER_PLAN, 'pro')
      .set(H.USER_ROLE, 'Advocate')
      .set(H.USER_NAME, '')
      .set(H.USER_EMAIL, '')
      .set(H.USER_PRIVACY_VERSION, d.CURRENT_PRIVACY_VERSION)
      .buffer(true)
      .parse((res: any, cb: (e: null, b: string) => void) => {
        let s = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (s += c));
        res.on('end', () => cb(null, s));
      })
      .send(body);
}

function json(res: any): any {
  try {
    return JSON.parse(res.body as string);
  } catch {
    return {};
  }
}

/** Steps 1-2 of the golden pipeline, once per matter: the brief, the ledger and the answers. */
async function intakeOnce(ctx: Ctx, f: Fixture): Promise<Intake> {
  const post = poster(ctx.d);
  const court = f.court ?? undefined;
  const out: Intake = {
    intakeId: null,
    ledgerId: null,
    ledgerVersion: null,
    values: [],
    error: null,
  };
  try {
    await ctx.d.redis.flushall();
    const r1 = await post('/intake/brief', {
      description: f.description,
      language: f.language,
      kind: f.pack,
      ...(court ? { court } : {}),
    });
    const b1 = json(r1);
    out.intakeId = b1.intake_id ?? null;
    if (r1.status !== 200 || b1.outcome !== 'brief') {
      out.error =
        r1.status !== 200
          ? `intake_http_${r1.status}`
          : `intake_${String(b1.outcome ?? 'no_outcome')}`;
      return out;
    }
    if (!b1.ledger) {
      out.error = 'intake_no_ledger';
      return out;
    }
    out.ledgerId = b1.ledger.ledger_id;
    let values = valuesOf(b1.brief);
    if (f.answers && f.answers.length > 0) {
      for (const a of f.answers)
        values = [
          ...values.filter((v) => v.key !== a.key),
          { key: a.key, value: a.value, source: 'user' },
        ];
      const r2 = await post('/intake/brief/update', {
        kind: f.pack,
        values,
        ...(court ? { court } : {}),
        description: f.description,
        ledger_id: out.ledgerId,
        ledger_edits: f.answers.map((a) => ({ key: a.key, text: a.value, from_question: true })),
      });
      const b2 = json(r2);
      if (r2.status !== 200 || !b2.brief) {
        out.error = `answers_http_${r2.status}`;
        return out;
      }
      values = valuesOf(b2.brief);
    }
    out.values = values;
    out.ledgerVersion = await ledgerVersion(ctx, out.ledgerId);
  } catch (e) {
    out.error = `harness_${e instanceof Error ? e.name : 'error'}`;
  }
  return out;
}

async function ledgerVersion(ctx: Ctx, ledgerId: string | null): Promise<number | null> {
  if (!ledgerId) return null;
  const l = await ctx.d.models.FactLedgerModel.findById(ledgerId).lean();
  return l ? (l.currentVersion as number) : null;
}

/**
 * Option (a): both arms draft from the one ledger. The route only reads it
 * (loadOwnLedger); this checks that it is unchanged after the arm and that
 * the arm made no ledger of its own.
 */
async function ledgerShared(ctx: Ctx, intake: Intake, started: Date): Promise<string[]> {
  const p: string[] = [];
  if (intake.ledgerId === null) return ['no ledger to share'];
  if ((await ledgerVersion(ctx, intake.ledgerId)) !== intake.ledgerVersion)
    p.push("the matter's ledger changed during an arm");
  const oid = new ctx.d.mongoose.Types.ObjectId(ctx.d.origin.GOLDEN_SET_USER_ID);
  const fresh = await ctx.d.models.FactLedgerModel.countDocuments({
    userId: oid,
    createdAt: { $gte: started },
  });
  if (fresh > 0) p.push('an arm wrote a ledger of its own');
  return p;
}

/** The in-memory DB, and nothing else, may be written. Checked before every write. */
function assertMemory(ctx: Ctx): void {
  const svcEnv = requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'config', 'env')).env;
  if (process.env.MONGO_URI !== ctx.memUri || svcEnv.MONGO_URI !== ctx.memUri)
    throw new Error('the database is not the in-memory server this run started');
  const host = String(ctx.d.mongoose.connection.host ?? '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host))
    throw new Error('the connection is not to a local in-memory server');
}

const ARM_KEYS = {
  model: ['ai.model.drafter', 'ai.drafting_model'],
  effort: ['ai.effort.drafter', 'ai.effort.body'],
} as const;

/** Force the arm: the Drafter's model and effort rows in the in-memory DB, then both caches cleared. */
async function setArm(ctx: Ctx, model: string): Promise<void> {
  assertMemory(ctx);
  const now = new Date();
  const put = (key: string, value: string) =>
    ctx.db
      .collection('appsettings')
      .updateOne(
        { key },
        { $set: { value, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
  for (const k of ARM_KEYS.model) await put(k, model);
  for (const k of ARM_KEYS.effort) await put(k, ARM_EFFORT);
  ctx.settings._clearAppSettingsCache(); // also clears llm-usage's effort cache through its listener
  ctx.usage._clearAiEffortCache();
}

interface ArmResult {
  draft: AbDraft;
  isolation: string[];
  armProblems: string[];
  tokensUsed: number;
  otherUsd: number;
}

/** Step 3 for one arm, on the matter's shared ledger, then its rows read back. */
async function runArm(
  ctx: Ctx,
  f: Fixture,
  intake: Intake,
  model: string,
  intakeTokens: AbTokens,
): Promise<ArmResult> {
  const d = ctx.d;
  const post = poster(d);
  const court = f.court ?? undefined;
  await setArm(ctx, model);
  const from = ctx.llmCalls.length;
  const started = new Date();
  let outcome: AbOutcome = { kind: 'failed', code: 'not_run' };
  let runId: string | null = null;
  let documentId: string | null = null;
  let renderedMissing = 0;
  d.setLlmLogFixtureId(f.id);
  try {
    const r3 = await post('/generate-from-brief', {
      kind: f.pack,
      values: intake.values,
      ...(court ? { court } : {}),
      language: f.language,
      ...(intake.intakeId ? { intake_id: intake.intakeId } : {}),
      described: f.description,
      ledger_id: intake.ledgerId,
    });
    runId = (r3.headers?.['x-run-id'] as string | undefined) ?? null;
    if (r3.status !== 200) outcome = { kind: 'failed', code: `generate_http_${r3.status}` };
    else {
      const { parseSse } = await import('../golden-set/lib/pipeline');
      const events = parseSse(r3.body as string);
      const err = events.find((e) => e.event === 'error');
      const done = events.find((e) => e.event === 'done');
      if (err) outcome = outcomeOfError(err.data?.code);
      else if (!done) outcome = { kind: 'failed', code: 'generate_no_done' };
      else {
        documentId = done.data.docId ?? null;
        runId = done.data.runId ?? runId;
        if (Array.isArray(done.data.rendered))
          renderedMissing = done.data.rendered.filter((r: any) => r?.status === 'missing').length;
        if (!documentId) outcome = { kind: 'failed', code: 'generate_not_saved' };
        else outcome = { kind: 'delivered', text: '' };
      }
    }
  } catch (e) {
    outcome = { kind: 'failed', code: `harness_${e instanceof Error ? e.name : 'error'}` };
  } finally {
    d.setLlmLogFixtureId(null);
  }

  // The arm's model calls: everything logged since it started. Intake ran before.
  const armCalls = ctx.llmCalls.slice(from);
  const bodyCalls = armCalls.filter((c) => c.stage === 'body');
  const armProblems = [
    ...armCheck(bodyCalls, model, outcome.kind === 'delivered'),
    ...(await ledgerShared(ctx, intake, started)),
  ];
  // Any other call during the arm (none expected on v2) is not the arm's, but it is spend.
  const otherUsd = costOf(armCalls.filter((c) => c.stage !== 'body')).raw;

  const { isolation, deliveredText, factDiffs } = await readBack(
    ctx,
    { runId, documentId },
    started,
  );
  if (outcome.kind === 'delivered') {
    if (deliveredText === null) outcome = { kind: 'failed', code: 'document_not_found' };
    else outcome = { kind: 'delivered', text: deliveredText };
  }
  const ph = countPlaceholders(outcome.kind === 'delivered' ? outcome.text : null);
  const tokens = tokensOf(bodyCalls);
  return {
    draft: {
      fixtureId: f.id,
      model,
      runId,
      title: f.title,
      facts: factsOf(f),
      outcome,
      metrics: {
        tokens,
        intakeTokens,
        costUsd: costOf(bodyCalls),
        factDiffs,
        placeholders: { ...ph, renderedMissing },
        withheld: outcome.kind === 'withheld',
        legalReviewer: 'n/a',
      },
    },
    isolation,
    armProblems,
    tokensUsed: tokens.input + tokens.output,
    otherUsd,
  };
}

/** The arm's rows, each checked to be a fixture row (AC4 of T-147e), as pipeline.ts collect does. */
async function readBack(
  ctx: Ctx,
  ids: { runId: string | null; documentId: string | null },
  started: Date,
): Promise<{ isolation: string[]; deliveredText: string | null; factDiffs: number }> {
  const d = ctx.d;
  const m = d.models;
  const p: string[] = [];
  const oid = new d.mongoose.Types.ObjectId(d.origin.GOLDEN_SET_USER_ID);
  let deliveredText: string | null = null;
  let factDiffs = 0;
  if (ids.documentId) {
    const doc = await m.LawieDocument.findById(ids.documentId).lean();
    if (doc) {
      deliveredText = d.decrypt(doc.finalContent ?? doc.generatedContent);
      if (doc.runType !== 'fixture') p.push(`Document ${ids.documentId} runType=${doc.runType}`);
      const visible = await m.LawieDocument.countDocuments({
        _id: doc._id,
        ...d.origin.NOT_FIXTURE,
      });
      if (visible !== 0) p.push(`Document ${ids.documentId} passes the user-facing filter`);
    }
  }
  if (ids.runId) {
    for (const g of await m.Generation.find({ runId: ids.runId }).lean())
      if (g.runOrigin !== 'fixture') p.push(`Generation ${g._id} runOrigin=${g.runOrigin}`);
    const diffs = await m.FactDiff.find({ runId: ids.runId }).lean();
    factDiffs = diffs.length;
    for (const r of diffs)
      if (r.runType !== 'fixture') p.push(`FactDiff ${r._id} runType=${r.runType}`);
  }
  for (const e of await m.Event.find({ userId: oid, createdAt: { $gte: started } }).lean())
    if (e.runType !== 'fixture') p.push(`Event ${e._id} runType=${e.runType}`);
  const ink = await ctx.db
    .collection('inkledger')
    .countDocuments({ userId: oid, createdAt: { $gte: started } });
  if (ink > 0) p.push(`${ink} inkledger row(s) for the fixture user`);
  const credit = await m.CreditLedger.countDocuments({ userId: oid, createdAt: { $gte: started } });
  if (credit > 0) p.push(`${credit} CreditLedger row(s) for the fixture user`);
  if (await ctx.db.collection('users').findOne({ _id: oid }))
    p.push('a users row exists for the fixture user');
  return { isolation: p, deliveredText, factDiffs };
}

/** The matter's shared rows: the intake's LlmAuxCall rows and the ledger. */
async function readBackIntake(ctx: Ctx, intake: Intake): Promise<string[]> {
  const m = ctx.d.models;
  const p: string[] = [];
  if (intake.intakeId)
    for (const a of await m.LlmAuxCall.find({ intakeId: intake.intakeId }).lean())
      if (a.runType !== 'fixture') p.push(`LlmAuxCall ${a._id} runType=${a.runType}`);
  if (intake.ledgerId) {
    const l = await m.FactLedgerModel.findById(intake.ledgerId).lean();
    if (l && l.runType !== 'fixture') p.push(`FactLedger ${intake.ledgerId} runType=${l.runType}`);
  }
  return p;
}

/** The settings, rates and courts the pipeline reads, in the in-memory DB. Arm rows come later. */
async function seedMemoryDb(ctx: Ctx): Promise<void> {
  assertMemory(ctx);
  const now = new Date();
  const setting = (key: string, value: string) => ({ key, value, createdAt: now, updatedAt: now });
  const rate = (r: FullRate) =>
    JSON.stringify({
      input_usd_per_mtok: r.input,
      output_usd_per_mtok: r.output,
      cache_write_usd_per_mtok: r.cacheWrite,
      cache_read_usd_per_mtok: r.cacheRead,
    });
  // Prod's values (Arjun, T-691): only the legacy keys ai.intake_model and
  // ai.preflight_model are set there; ai.model.extractor / ai.model.fact_checker
  // are not, so resolveModel falls back to the legacy keys as on prod. Intake
  // caps and ai.cost_cap_* are not seeded: code defaults apply; the ₹600 cap governs.
  await ctx.db
    .collection('appsettings')
    .insertMany([
      setting('ai.intake_model', INTAKE_MODEL),
      setting('ai.preflight_model', INTAKE_MODEL),
      setting('finance.usd_inr', String(USD_INR)),
      ...Object.entries(RATES).map(([model, r]) => setting(`ai.rates.${model}`, rate(r))),
    ]);
  const courts = JSON.parse(
    readFileSync(join(DRAFTING_DIR, 'src', 'config', 'courts', 'indian-courts.json'), 'utf-8'),
  ) as { courts: Array<Record<string, unknown>> };
  const { Court } = requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'models', 'Court.model'));
  await Court.collection.insertMany(courts.courts.map((c) => ({ isActive: true, ...c })));
}

/** Every AppSetting row except the arm's own, as written by this driver: the service must write none. */
async function settingsSnapshot(ctx: Ctx): Promise<string> {
  const armKeys = new Set<string>([...ARM_KEYS.model, ...ARM_KEYS.effort]);
  const rows = await ctx.db.collection('appsettings').find({}).toArray();
  return JSON.stringify(
    rows
      .filter((r: any) => !armKeys.has(r.key))
      .map((r: any) => [r.key, r.value])
      .sort(),
  );
}

const inr = (usd: number) => `₹${(usd * USD_INR).toFixed(2)}`;
const money = (usd: number) => `${inr(usd)} ($${usd.toFixed(4)})`;
export function spendOf(usd: number): { usd: number; inr: number } {
  return { usd, inr: usd * USD_INR };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.errors.length > 0) {
    for (const e of args.errors) console.error(`ab: ${e}`);
    console.error(USAGE);
    return 2;
  }

  let matters: Fixture[];
  try {
    const golden = loadFixtures(GOLDEN_FIXTURES_DIR);
    const ab = loadFixtures(AB_FIXTURES_DIR);
    const sel = selectMatters(golden, ab, args.matters);
    if (sel.problems.length > 0) {
      for (const p of sel.problems) console.error(`ab: ${p}`);
      return 2;
    }
    matters = sel.matters;
  } catch (e) {
    console.error(`ab: ${e instanceof FixtureFileError ? e.message : String(e)}`);
    return 2;
  }

  const estimate = estimateAb(matters.length);
  if (args.mode === 'real') {
    if (process.env.AB_ARJUN_GO !== '1') {
      console.error(
        'ab: --real needs AB_ARJUN_GO=1 as well (Arjun reviews the harness first). Refusing.',
      );
      return 2;
    }
    if (!process.env.GOLDEN_SET_ANTHROPIC_API_KEY) {
      console.error(
        'ab: --real needs GOLDEN_SET_ANTHROPIC_API_KEY (name only; values are never printed).',
      );
      return 2;
    }
    if ((process.env.AB_KEY_PASSPHRASE ?? '').length < MIN_PASSPHRASE) {
      console.error(
        `ab: --real needs AB_KEY_PASSPHRASE (Arjun's), at least ${MIN_PASSPHRASE} characters.`,
      );
      return 2;
    }
    if (estimate.typicalInr > BUDGET_INR) {
      console.error(
        `ab: typical estimate ₹${estimate.typicalInr.toFixed(0)} is over the ₹${BUDGET_INR} cap. Refusing.`,
      );
      return 2;
    }
    if (estimate.perMatterWorstUsd * USD_INR > BUDGET_INR) {
      console.error(`ab: one matter's worst case is over the ₹${BUDGET_INR} cap. Refusing.`);
      return 2;
    }
  }
  let passphrase = process.env.AB_KEY_PASSPHRASE ?? '';
  let throwaway = false;
  if (passphrase.length < MIN_PASSPHRASE) {
    // Dry run only (checked above for --real): a random key nobody holds.
    passphrase = randomBytes(24).toString('hex');
    throwaway = true;
  }

  // ── Environment, before anything of the service is loaded ────────────────
  // The shell's MONGO_URI / GOLDEN_SET_MONGODB_URI are never read: overwritten below.
  const internalSecret = randomBytes(24).toString('hex');
  process.env.ANTHROPIC_API_KEY =
    args.mode === 'real' ? process.env.GOLDEN_SET_ANTHROPIC_API_KEY : 'ab-dry-run-no-key';
  process.env.MONGO_URI = 'mongodb://ab-memory-server-not-started-yet/x';
  process.env.NODE_ENV = 'development';
  process.env.INTERNAL_SECRET = internalSecret;
  process.env.REDIS_URL = 'redis://ab-mock:6379';
  process.env.LOG_LEVEL = 'error';
  process.env.SENTRY_DSN = '';
  // Drafts are encrypted under a per-run key: the DB dies with the run.
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');

  installRedisMock();
  const seam = installModelSeam(args.mode === 'real' ? 'real' : 'stub');

  let memory: any = null;
  const mongoose = requireFromDrafting<any>('mongoose');
  try {
    const { MongoMemoryServer } = requireFromDrafting<any>('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    const memUri: string = memory.getUri();
    process.env.MONGO_URI = memUri;
    const { loadDrafting } = await import('../golden-set/lib/pipeline');
    const d = loadDrafting(internalSecret);
    const svcEnv = requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'config', 'env')).env;
    if (svcEnv.MONGO_URI !== memUri) {
      console.error(
        'ab: the service would connect to a database other than the in-memory one. Refusing.',
      );
      return 2;
    }
    await mongoose.connect(memUri, { serverSelectionTimeoutMS: 10_000 });
    const ctx: Ctx = {
      d,
      db: mongoose.connection.db,
      memUri,
      settings: requireFromDrafting<any>(
        join(DRAFTING_DIR, 'src', 'services', 'app-settings.service'),
      ),
      usage: requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'services', 'llm-usage')),
      llmCalls: [],
      verbose: args.verbose,
    };
    assertMemory(ctx);
    await seedMemoryDb(ctx);
    const before = await settingsSnapshot(ctx);
    ctx.usage.setLlmCallListener((r: LlmCallObserved) => ctx.llmCalls.push(r));

    console.log(
      `ab: mode ${args.mode === 'real' ? 'REAL MODEL' : 'dry run (stub replies)'}, in-memory database, ${matters.length} matters x ${ARMS.length} arms at effort ${ARM_EFFORT}.`,
    );
    console.log(
      `ab: estimate typical ${inr(estimate.typicalUsd)}, worst case ${inr(estimate.worstUsd)} (₹${USD_INR}/$); hard cap ₹${BUDGET_INR}${args.mode === 'dry' ? ' (cap enforced after each matter; the upfront estimate check is skipped in dry runs)' : ''}; token cap ${args.maxTokens}.`,
    );
    if (throwaway)
      console.log(
        'ab: no AB_KEY_PASSPHRASE: the key is sealed under a random throwaway passphrase (dry run only; unrecoverable).',
      );

    const rnd =
      args.seed !== null
        ? seededRandom((args.seed ^ 0x9e3779b9) >>> 0)
        : seededRandom(randomSeed());
    const drafts: AbDraft[] = [];
    let used = 0;
    let spentUsd = 0;
    let capped: string | null = null;
    let breach = false;
    let armFailure = false;

    for (const f of matters) {
      if (used >= args.maxTokens) {
        capped = `the token cap ${args.maxTokens}`;
        break;
      }
      if (args.mode === 'real' && (spentUsd + estimate.perMatterWorstUsd) * USD_INR > BUDGET_INR) {
        capped = `the ₹${BUDGET_INR} cap (spent ${inr(spentUsd)}; the next matter's worst case would pass it)`;
        break;
      }
      const order = armOrder(rnd);
      const fromIntake = ctx.llmCalls.length;
      seam.setReplies(args.mode === 'dry' ? (f.recorded?.clean ?? null) : null);
      const intake = await muted(args.verbose, () => intakeOnce(ctx, f));
      const intakeCalls = ctx.llmCalls.slice(fromIntake);
      const intakeTokens = tokensOf(intakeCalls);
      const intakeUsd = costOf(intakeCalls).raw;
      used += intakeTokens.input + intakeTokens.output;
      spentUsd += intakeUsd;
      const armSpends: number[] = [];
      const sharedProblems = await readBackIntake(ctx, intake);
      if (sharedProblems.length > 0) breach = true;

      let written = 0;
      for (const model of order) {
        if (intake.error) {
          drafts.push({
            fixtureId: f.id,
            model,
            runId: null,
            title: f.title,
            facts: factsOf(f),
            outcome: { kind: 'failed', code: intake.error },
            metrics: {
              tokens: zeroTokens(),
              intakeTokens,
              costUsd: { raw: 0, uncachedEquivalent: 0 },
              factDiffs: 0,
              placeholders: { missingMarkers: 0, toBeConfirmed: 0, renderedMissing: 0 },
              withheld: false,
              legalReviewer: 'n/a',
              spend: spendOf(0),
              intakeSpend: spendOf(intakeUsd),
            },
          });
          written += 1;
          armSpends.push(0);
          continue;
        }
        const r = await muted(args.verbose, () => runArm(ctx, f, intake, model, intakeTokens));
        used += r.tokensUsed;
        const armUsd = r.draft.metrics.costUsd.raw + r.otherUsd;
        spentUsd += armUsd;
        armSpends.push(armUsd);
        r.draft.metrics.spend = spendOf(armUsd);
        r.draft.metrics.intakeSpend = spendOf(intakeUsd);
        if (r.isolation.length > 0) breach = true;
        if (r.armProblems.length > 0) {
          armFailure = true;
          for (const p of r.armProblems) console.error(`ab: matter ${f.id}: ${p}`);
          break;
        }
        drafts.push(r.draft);
        written += 1;
      }
      if (armFailure) break;
      console.log(
        `ab: matter ${f.id}: ${written} drafts recorded${intake.error ? ` (intake stopped: ${intake.error})` : ''}.`,
      );
      // The matter's total only (intake plus both arms) and the running total: a per-arm or
      // intake amount here would match the M-rows of vikram/metrics.json and the intake list.
      const matterUsd = intakeUsd + armSpends.reduce((a, b) => a + b, 0);
      console.log(
        `ab: matter ${f.id}: spend ${money(matterUsd)}; running total ${money(spentUsd)}.`,
      );
      // Arjun (T-691): once the running total has passed the cap, stop; never continue past it.
      if (spentUsd * USD_INR > BUDGET_INR) {
        capped = `the ₹${BUDGET_INR} cap (running total ${inr(spentUsd)} passed it after matter ${f.id})`;
        break;
      }
    }

    // The service must not have written any setting; only this driver's arm rows change.
    const after = await settingsSnapshot(ctx);
    const settingsUnchanged = before === after;
    console.log(
      `ab: AppSetting rows other than the arm's: ${settingsUnchanged ? 'unchanged' : 'CHANGED'}.`,
    );

    if (armFailure) {
      console.error(
        'ab: an arm did not run on its forced model at effort high, or not on the shared ledger. The run is invalid; nothing written.',
      );
      return 1;
    }
    if (drafts.length === 0) {
      console.error('ab: no drafts to write.');
      return capped ? 1 : 4;
    }
    const w = writeBlind(drafts, {
      outRoot: args.out,
      passphrase,
      ...(args.seed !== null ? { seed: args.seed } : {}),
    });
    console.log(
      `ab: ${w.counts.drafts} drafts: ${w.counts.delivered} delivered, ${w.counts.withheld} withheld, ${w.counts.failed} not produced.`,
    );
    if (w.warnings.modelWordInBody > 0)
      console.log(
        `ab: WARNING ${w.warnings.modelWordInBody} draft bodies name a model family (left as delivered).`,
      );
    if (w.warnings.modelWordInMetadata > 0)
      console.log(
        `ab: ${w.warnings.modelWordInMetadata} scoring files had a model word replaced in their metadata.`,
      );
    console.log(
      `ab: spend ${inr(spentUsd)} (${args.mode === 'dry' ? 'stub token counts, nothing billed' : 'at the rates above'}); tokens ${used}.`,
    );
    console.log(`ab: scoring files: ${w.scoringDir}`);
    console.log(`ab: metrics (for Vikram; never ship with scoring/): ${w.metricsPath}`);
    console.log(`ab: intake spend per matter (for Vikram, no ids): ${w.intakePath}`);
    console.log(`ab: sealed key (for Arjun): ${w.keyPath}`);
    // Arjun (T-691): the hash of the key file's bytes as written, so the file he receives can
    // be checked for changes. The hash only: never the contents, the passphrase or any id.
    console.log(
      `ab: key file sha256 ${createHash('sha256').update(readFileSync(w.keyPath)).digest('hex')}`,
    );

    if (breach || !settingsUnchanged) {
      console.error(
        'ab: FIXTURE ISOLATION BREACHED, or the service wrote an AppSetting row. Release-blocking.',
      );
      return 3;
    }
    if (capped) {
      console.error(`ab: ${capped} stopped the run before every matter ran.`);
      return 1;
    }
    return 0;
  } catch (e) {
    console.error(
      `ab: harness error: ${e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : String(e)}`,
    );
    return 4;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    if (memory) await memory.stop().catch(() => undefined);
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`ab: harness error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(4);
    },
  );
}
