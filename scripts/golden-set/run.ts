/**
 * T-147e — the golden set. One command runs every fixture through the real
 * pipeline (intake extraction -> fact ledger -> ledger Drafter -> fact
 * verifier) and reports pass or fail per fixture, with the verifier's
 * findings and each fixture's own expectations as the assertions.
 *
 *   yarn workspace @lawie/drafting golden:set --dry-run          recorded replies, in-memory DB, free
 *   yarn workspace @lawie/drafting golden:set --real             THE REAL MODEL AND THE REAL DB. COSTS MONEY.
 *
 * Options: --only <id,...>  --stub <variant>  --calibrate  --max-fixtures <n>
 *          --max-tokens <n>  --out <dir>  --verbose
 *
 * --real needs GOLDEN_SET_ANTHROPIC_API_KEY and GOLDEN_SET_MONGODB_URI. No
 * .env file is read. See scripts/golden-set/README.md.
 *
 * Exit: 0 all passed; 1 a fixture failed (or the token cap stopped the run);
 * 2 refused (flags, secrets, caps); 3 fixture isolation breached; 4 harness error.
 */
/* eslint-disable no-console */
import { randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import { evaluate, skipped } from './lib/assert';
import {
  calibrate,
  CalibrationSample,
  DateConfidenceRow,
  DateReader,
  dateConfidenceHistogram,
  dateConfidenceRows,
  renderCalibration,
  renderDateConfidence,
  samplesFor,
} from './lib/calibrate';
import {
  estimateCost,
  fixtureGroup,
  MAX_FIXTURES_DEFAULT,
  Rate,
  renderEstimate,
  RUN_LIMITS,
  selectedGroup,
} from './lib/cost';
import { checkComposition, FixtureFileError, loadFixtures, selectFixtures } from './lib/fixtures';
import {
  DRAFTING_DIR,
  installModelSeam,
  installRedisMock,
  requireFromDrafting,
} from './lib/modules';
import {
  renderFixture,
  renderLlmCalls,
  renderSummary,
  summarise,
  summariseLlmCalls,
} from './lib/report';
import { FixtureResult, LlmCallObserved } from './lib/types';

export interface Args {
  mode: 'dry' | 'real' | null;
  calibrate: boolean;
  only: string[] | null;
  variant: string;
  maxFixtures: number;
  maxTokens: number;
  out: string;
  verbose: boolean;
  errors: string[];
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    mode: null,
    calibrate: false,
    only: null,
    variant: 'clean',
    maxFixtures: RUN_LIMITS.maxFixturesDefault,
    maxTokens: RUN_LIMITS.maxTokensDefault,
    out: join(__dirname, 'results'),
    verbose: false,
    errors: [],
  };
  // T-683 (Arjun §6): the default cap is the selected variant's, known only after --stub.
  let maxFixturesGiven = false;
  const num = (v: string | undefined, flag: string): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) a.errors.push(`${flag} needs a positive whole number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--dry-run')
      a.mode = a.mode === 'real' ? (a.errors.push('--dry-run and --real together'), 'real') : 'dry';
    else if (f === '--real')
      a.mode = a.mode === 'dry' ? (a.errors.push('--dry-run and --real together'), 'dry') : 'real';
    else if (f === '--calibrate') a.calibrate = true;
    else if (f === '--verbose') a.verbose = true;
    else if (f === '--only')
      a.only = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (f === '--stub') a.variant = argv[++i] ?? '';
    else if (f === '--max-fixtures') {
      a.maxFixtures = num(argv[++i], f);
      maxFixturesGiven = true;
    } else if (f === '--max-tokens') a.maxTokens = num(argv[++i], f);
    else if (f === '--out') a.out = resolve(process.cwd(), argv[++i] ?? '');
    else a.errors.push(`unknown option ${f}`);
  }
  if (a.mode === null)
    a.errors.push(
      'choose --dry-run (recorded replies, free) or --real (the real model; costs money)',
    );
  if (!maxFixturesGiven) a.maxFixtures = MAX_FIXTURES_DEFAULT[selectedGroup(a.variant)];
  if (a.maxFixtures > RUN_LIMITS.maxFixturesHard)
    a.errors.push(`--max-fixtures is capped at ${RUN_LIMITS.maxFixturesHard}`);
  return a;
}

const USAGE =
  'Usage: golden:set (--dry-run | --real) [--calibrate] [--only id,...] [--stub variant] [--max-fixtures n] [--max-tokens n] [--out dir] [--verbose]';

/** Console output of the service while a fixture runs: kept, shown only with --verbose. Ids only by design. */
function muted<T>(verbose: boolean, fn: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
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
  return fn()
    .then((value) => ({ value, lines }))
    .finally(() => {
      Object.assign(console, saved);
      if (verbose) for (const l of lines) console.log(`      ${l}`);
    });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.errors.length > 0) {
    for (const e of args.errors) console.error(`golden-set: ${e}`);
    console.error(USAGE);
    return 2;
  }

  let all;
  try {
    all = loadFixtures();
  } catch (e) {
    console.error(`golden-set: ${e instanceof FixtureFileError ? e.message : String(e)}`);
    return 2;
  }
  const composition = checkComposition(all);
  for (const p of composition) console.warn(`golden-set: composition: ${p}`);
  let chosen = selectFixtures(all, args.only);
  if (chosen.length === 0) {
    console.error('golden-set: no fixture matches --only');
    return 2;
  }
  // T-683 (Arjun §6, b452537e): a --real run runs and counts only the fixtures of
  // its own variant/stage, so the v3 cassettes never run in, or count against, a v2 run.
  const group = selectedGroup(args.variant);
  if (args.mode === 'real') {
    const other = chosen.filter((f) => fixtureGroup(f) !== group).length;
    chosen = chosen.filter((f) => fixtureGroup(f) === group);
    const otherGroup = group === 'v2' ? 'v3' : 'v2';
    if (other > 0)
      console.log(`golden-set: ${other} ${otherGroup} fixtures left out (${group} run).`);
    if (chosen.length === 0) {
      console.error(`golden-set: no ${group} fixture selected`);
      return 2;
    }
  }
  // Arjun (T-373): the count cap guards spend, so it applies to --real only; a dry run is free.
  if (args.mode === 'real' && chosen.length > args.maxFixtures) {
    console.error(
      `golden-set: ${chosen.length} fixtures selected, more than --max-fixtures ${args.maxFixtures}. Refusing.`,
    );
    return 2;
  }

  // ── Environment, before anything of the service is loaded ────────────────
  const internalSecret = randomBytes(24).toString('hex');
  if (args.mode === 'real') {
    const missing = ['GOLDEN_SET_ANTHROPIC_API_KEY', 'GOLDEN_SET_MONGODB_URI'].filter(
      (k) => !process.env[k],
    );
    if (missing.length > 0) {
      console.error(
        `golden-set: --real needs ${missing.join(' and ')} (names only; values are never printed).`,
      );
      return 2;
    }
    process.env.ANTHROPIC_API_KEY = process.env.GOLDEN_SET_ANTHROPIC_API_KEY;
    process.env.MONGO_URI = process.env.GOLDEN_SET_MONGODB_URI;
  } else {
    process.env.ANTHROPIC_API_KEY = 'golden-set-dry-run-no-key';
    process.env.MONGO_URI = 'mongodb://golden-set-memory-server-not-started-yet/x';
  }
  process.env.NODE_ENV = 'development';
  process.env.INTERNAL_SECRET = internalSecret;
  process.env.REDIS_URL = 'redis://golden-set-mock:6379';
  process.env.LOG_LEVEL = 'error';
  process.env.SENTRY_DSN = '';
  // Fixture documents are encrypted under a per-run key unless one is given:
  // they are synthetic and only this runner reads them back.
  process.env.ENCRYPTION_KEY =
    process.env.GOLDEN_SET_ENCRYPTION_KEY || randomBytes(32).toString('hex');

  installRedisMock();
  const seam = installModelSeam(args.mode === 'real' ? 'real' : 'stub');

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let memory: any = null;
  const mongoose = requireFromDrafting<any>('mongoose');
  try {
    if (args.mode === 'dry') {
      const { MongoMemoryServer } = requireFromDrafting<any>('mongodb-memory-server');
      memory = await MongoMemoryServer.create();
      process.env.MONGO_URI = memory.getUri();
    }
    // Loads the service's env and models with the values above.
    const { loadDrafting, runFixture } = await import('./lib/pipeline');
    const d = loadDrafting(internalSecret);
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    if (args.mode === 'dry') await seedMemoryDb(mongoose);
    else console.log('golden-set: connected to the database given by GOLDEN_SET_MONGODB_URI.');

    // ── Cost guard ───────────────────────────────────────────────────────────
    const settings = requireFromDrafting<any>(
      join(DRAFTING_DIR, 'src', 'services', 'app-settings.service'),
    );
    const usage = requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'services', 'llm-usage'));
    // T-453: every model call's llm_call record (ids and counts only), through
    // the service's in-process listener; the log lines stay muted at LOG_LEVEL=error.
    const llmCalls: LlmCallObserved[] = [];
    usage.setLlmCallListener((r: LlmCallObserved) => llmCalls.push(r));
    const rateOf = async (key: string): Promise<Rate | null> => {
      try {
        const r = await usage.getModelRates(await settings.getAppSetting(key));
        return r.costStatus === 'priced' ? r.rate : null;
      } catch {
        return null;
      }
    };
    const runnable =
      args.mode === 'dry' ? chosen.filter((f) => f.recorded?.[args.variant]) : chosen;
    const estimate = estimateCost(runnable.length, {
      intake: await rateOf('ai.intake_model'),
      drafting: await rateOf('ai.drafting_model'),
    });
    console.log(
      `golden-set: mode ${args.mode === 'real' ? 'REAL MODEL' : `dry run (recorded replies, variant "${args.variant}")`}, ${runnable.length} of ${chosen.length} fixtures.`,
    );
    if (args.mode === 'real') for (const l of renderEstimate(estimate)) console.log(l);
    console.log(`golden-set: token cap for this run ${args.maxTokens}.`);
    console.log('');

    // ── Run ──────────────────────────────────────────────────────────────────
    const results: FixtureResult[] = [];
    const samples: CalibrationSample[] = [];
    // T-453 round 2: every date read with its confidence, normalised as the ledger does.
    const sharedForDates = requireFromDrafting<any>('@lawie/shared');
    const ledgerSvc = requireFromDrafting<any>(
      join(DRAFTING_DIR, 'src', 'services', 'fact-ledger.service'),
    );
    const refYear: number = ledgerSvc.referenceYear(new Date());
    const readDate: DateReader = (text) => {
      const n = sharedForDates.normalizeDate(text, { referenceYear: refYear });
      return n.ok ? n.value : null;
    };
    const dateRows: DateConfidenceRow[] = [];
    const v3StageMod = requireFromDrafting<{
      setFixtureV3Stage(stage: 0 | 1 | 2 | 3 | null): void;
    }>(join(DRAFTING_DIR, 'src', 'services', 'v3', 'stage'));
    let used = 0;
    let capped = false;
    let breach = false;
    for (const f of chosen) {
      if (args.mode === 'dry' && !f.recorded?.[args.variant]) {
        results.push(skipped(f, `no recorded "${args.variant}" replies (dry run only)`));
      } else if (used >= args.maxTokens) {
        capped = true;
        results.push(skipped(f, `token cap ${args.maxTokens} reached; not run`));
      } else {
        seam.setReplies(args.mode === 'dry' ? f.recorded![args.variant] : null);
        // T-683: the drafting v3 stage this fixture runs at (fixture user only); absent, 0.
        v3StageMod.setFixtureV3Stage(f.v3_stage ?? null);
        let ev: Awaited<ReturnType<typeof runFixture>>;
        try {
          ({ value: ev } = await muted(args.verbose, () => runFixture(d, seam, f)));
        } finally {
          v3StageMod.setFixtureV3Stage(null);
        }
        used += ev.tokens.inputTokens + ev.tokens.outputTokens;
        if (!ev.isolation.ok) breach = true;
        samples.push(...samplesFor(f, ev.extraction, ev.ledger));
        dateRows.push(...dateConfidenceRows(f, ev.extraction, readDate));
        results.push(evaluate(f, ev));
      }
      for (const l of renderFixture(results[results.length - 1])) console.log(l);
    }

    const summary = summarise(results);
    const llmSummary = summariseLlmCalls(llmCalls);
    for (const l of renderLlmCalls(llmSummary)) console.log(l);
    for (const l of renderSummary(summary)) console.log(l);
    for (const l of renderDateConfidence(dateRows)) console.log(l);
    let calibration = null;
    if (args.calibrate) {
      const shared = requireFromDrafting<any>('@lawie/shared');
      calibration = calibrate(samples, shared.CONFIDENCE_FLOORS);
      for (const l of renderCalibration(calibration)) console.log(l);
    }

    mkdirSync(args.out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(args.out, `${stamp}-${args.mode}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          startedAt: stamp,
          mode: args.mode,
          variant: args.variant,
          composition,
          estimate,
          summary,
          llmCalls: { summary: llmSummary, calls: llmCalls },
          results,
          calibration,
          dateConfidence: { rows: dateRows, histogram: dateConfidenceHistogram(dateRows) },
        },
        null,
        2,
      ),
    );
    console.log(`golden-set: results (with every runId) written to ${file}`);

    if (breach) {
      console.error(
        'golden-set: FIXTURE ISOLATION BREACHED — a row of a fixture run is not marked fixture. Release-blocking (AC4).',
      );
      return 3;
    }
    if (capped)
      console.error('golden-set: the token cap stopped the run before every fixture ran.');
    return summary.failed > 0 || capped ? 1 : 0;
  } catch (e) {
    console.error(
      `golden-set: harness error: ${e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : String(e)}`,
    );
    return 4;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    if (memory) await memory.stop().catch(() => undefined);
  }
}

/** Dry run only: the settings, rates and courts the pipeline reads. Never run against a real DB. */
async function seedMemoryDb(mongoose: any): Promise<void> {
  const db = mongoose.connection.db;
  const now = new Date();
  const setting = (key: string, value: string) => ({ key, value, createdAt: now, updatedAt: now });
  await db
    .collection('appsettings')
    .insertMany([
      setting('ai.intake_model', 'golden-stub-intake'),
      setting('ai.drafting_model', 'golden-stub-drafting'),
      setting(
        'ai.rates.golden-stub-intake',
        JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
      ),
      setting(
        'ai.rates.golden-stub-drafting',
        JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
      ),
    ]);
  const courts = JSON.parse(
    readFileSync(join(DRAFTING_DIR, 'src', 'config', 'courts', 'indian-courts.json'), 'utf-8'),
  ) as { courts: Array<Record<string, unknown>> };
  const { Court } = requireFromDrafting<any>(join(DRAFTING_DIR, 'src', 'models', 'Court.model'));
  // As seed-courts.ts writes them: straight to the collection, no schema validation.
  await Court.collection.insertMany(courts.courts.map((c) => ({ isActive: true, ...c })));
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`golden-set: harness error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(4);
    },
  );
}
