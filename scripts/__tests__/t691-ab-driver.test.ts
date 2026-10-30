import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  ARMS,
  ARM_EFFORT,
  BUDGET_INR,
  DEFAULT_MATTERS,
  AB_FIXTURES_DIR,
  MAX_DRAFTS,
  RATES,
  USD_INR,
  armCheck,
  armOrder,
  costOf,
  estimateAb,
  factsOf,
  outcomeOfError,
  parseArgs,
  selectMatters,
  tokensOf,
} from '../ab/run-ab';
import { seededRandom } from '../ab/blind-writer';
import { FIXTURES_DIR as GOLDEN_DIR, checkFixture, loadFixtures } from '../golden-set/lib/fixtures';
import { Fixture, LlmCallObserved, REVIEW_STATUS } from '../golden-set/lib/types';

/**
 * T-691: the drafter A/B driver. Pure functions, the fixtures, a source-level guard, and (last) one
 * child-process dry run on golden 23 against an in-memory Mongo with the stub model seam.
 * Does not read handoff/. No model call, no hosted DB, no secret literal.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'scripts', 'ab', 'run-ab.ts');

function call(over: Partial<LlmCallObserved> = {}): LlmCallObserved {
  return {
    stage: 'body',
    call: 'stream',
    model: ARMS[0],
    effort: ARM_EFFORT,
    status: 'completed',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    stop_reason: 'end_turn',
    ...over,
  };
}

describe('the design constants', () => {
  it('two arms, sonnet and opus, at effort high; cap 600 at 88/USD; 40 drafts max', () => {
    expect([...ARMS].sort()).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(ARM_EFFORT).toBe('high');
    expect(BUDGET_INR).toBe(600);
    expect(USD_INR).toBe(88);
    expect(MAX_DRAFTS).toBe(40);
  });

  it('rates: opus is the dearer arm on every class', () => {
    const s = RATES['claude-sonnet-5-5'];
    const o = RATES['claude-opus-5-5'];
    expect(o.input).toBeGreaterThan(s.input);
    expect(o.output).toBeGreaterThan(s.output);
    expect(o.cacheWrite).toBeGreaterThan(s.cacheWrite);
    expect(o.cacheRead).toBeGreaterThan(s.cacheRead);
  });
});

describe('parseArgs', () => {
  it('requires a mode', () => {
    expect(parseArgs([]).errors.join(' ')).toMatch(/--dry|--real/);
  });

  it('--dry with defaults is clean and uses the default 10 matters', () => {
    const a = parseArgs(['--dry']);
    expect(a.errors).toEqual([]);
    expect(a.mode).toBe('dry');
    expect(a.matters).toEqual(DEFAULT_MATTERS);
    expect(a.matters.length).toBeLessThanOrEqual(MAX_DRAFTS / ARMS.length);
  });

  it('a cap over 40 drafts is refused (21 matters x 2 arms)', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `m${i}`).join(',');
    const a = parseArgs(['--dry', '--matters', ids]);
    expect(a.errors.join(' ')).toMatch(/hard cap is 40/);
    expect(
      parseArgs(['--dry', '--matters', Array.from({ length: 20 }, (_, i) => `m${i}`).join(',')])
        .errors,
    ).toEqual([]);
  });

  it('--dry and --real together, unknown options, a repeated matter and an empty list are refused', () => {
    expect(parseArgs(['--dry', '--real']).errors.join(' ')).toMatch(/together/);
    expect(parseArgs(['--dry', '--bogus']).errors.join(' ')).toMatch(/unknown option/);
    expect(parseArgs(['--dry', '--matters', '23,23']).errors.join(' ')).toMatch(/twice/);
    expect(parseArgs(['--dry', '--matters', '']).errors.join(' ')).toMatch(/at least one/);
  });

  it('--max-tokens and --seed are validated', () => {
    expect(parseArgs(['--dry', '--max-tokens', '0']).errors.join(' ')).toMatch(/positive/);
    expect(parseArgs(['--dry', '--max-tokens', 'abc']).errors.join(' ')).toMatch(/positive/);
    expect(parseArgs(['--dry', '--seed', '-1']).errors.join(' ')).toMatch(/seed/);
    expect(parseArgs(['--dry', '--seed', '4294967296']).errors.join(' ')).toMatch(/seed/);
    const ok = parseArgs(['--dry', '--seed', '7', '--max-tokens', '1000']);
    expect(ok.errors).toEqual([]);
    expect(ok.seed).toBe(7);
    expect(ok.maxTokens).toBe(1000);
  });
});

describe('selectMatters', () => {
  const golden = loadFixtures(GOLDEN_DIR);
  const ab = loadFixtures(AB_FIXTURES_DIR);

  it('returns the matters in the order given, golden ids from the golden set, others from ab', () => {
    const r = selectMatters(golden, ab, ['40', '23', '39']);
    expect(r.problems).toEqual([]);
    expect(r.matters.map((m) => m.id.split('-')[0])).toEqual(['40', '23', '39']);
  });

  it('the default matters all resolve', () => {
    const r = selectMatters(golden, ab, DEFAULT_MATTERS);
    expect(r.problems).toEqual([]);
    expect(r.matters).toHaveLength(DEFAULT_MATTERS.length);
  });

  it('an unknown matter is a problem, not a silent skip', () => {
    const r = selectMatters(golden, ab, ['23', 'nope']);
    expect(r.matters).toHaveLength(1);
    expect(r.problems.join(' ')).toMatch(/no matter nope/);
  });

  it('a golden fixture outside the allowed golden ids cannot be picked', () => {
    const other = golden.find(
      (f) => !/^(23|24|26|28)(-|$)/.test(f.id) && !ab.some((a) => a.id === f.id),
    );
    if (!other) return;
    const key = other.id.split('-')[0];
    // not on the ab side either, so it must be refused
    if (!ab.some((a) => a.id === key || a.id.startsWith(`${key}-`)))
      expect(selectMatters(golden, ab, [key]).problems).toHaveLength(1);
  });

  it('an id that matches twice is ambiguous', () => {
    const dup: Fixture = { ...ab[0], id: `${ab[0].id}-copy` };
    const r = selectMatters(golden, [...ab, dup], [ab[0].id]);
    expect(r.problems.join(' ')).toMatch(/ambiguous/);
  });
});

describe('factsOf', () => {
  it('is the description plus the answers on the questions step', () => {
    const f = { description: 'DESC', answers: [{ key: 'k1', value: 'v1' }] } as unknown as Fixture;
    expect(factsOf(f)).toBe('DESC\n\nAnswers on the questions step:\n- k1: v1');
    expect(factsOf({ description: 'DESC', answers: [] } as unknown as Fixture)).toBe('DESC');
  });
});

describe('armOrder', () => {
  it('always holds both arms exactly once', () => {
    const rnd = seededRandom(1);
    for (let i = 0; i < 200; i++) expect([...armOrder(rnd)].sort()).toEqual([...ARMS].sort());
  });

  it('is randomised: both arms lead sometimes, near half each', () => {
    const rnd = seededRandom(99);
    let sonnetFirst = 0;
    for (let i = 0; i < 400; i++) if (armOrder(rnd)[0] === 'claude-sonnet-5-5') sonnetFirst += 1;
    expect(sonnetFirst).toBeGreaterThan(120);
    expect(sonnetFirst).toBeLessThan(280);
  });

  it('is deterministic for a seed', () => {
    const run = (s: number) => {
      const r = seededRandom(s);
      return Array.from({ length: 20 }, () => armOrder(r)[0]);
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
});

describe('armCheck', () => {
  it('passes when every body call is on the arm model at effort high', () => {
    expect(armCheck([call(), call({ call: 'repair' })], ARMS[0])).toEqual([]);
  });

  it('passes with no body calls (nothing to contradict)', () => {
    expect(armCheck([], ARMS[0])).toEqual([]);
  });

  it('fails on the wrong model', () => {
    const p = armCheck([call({ model: ARMS[1] })], ARMS[0]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/model other than the arm's/);
  });

  it('fails on the wrong or missing effort', () => {
    expect(armCheck([call({ effort: 'medium' })], ARMS[0])[0]).toMatch(/effort medium/);
    expect(armCheck([call({ effort: null })], ARMS[0])[0]).toMatch(/effort none/);
  });

  it('names no model in its messages (the console is blind)', () => {
    const p = armCheck([call({ model: ARMS[1], effort: 'low' })], ARMS[0]);
    expect(p).toHaveLength(2);
    for (const m of p) expect(m).not.toMatch(/claude|opus|sonnet|haiku/i);
  });
});

describe('estimateAb and the 600 rupee guard', () => {
  it('scales linearly with the number of matters', () => {
    const one = estimateAb(1);
    const ten = estimateAb(10);
    expect(ten.typicalUsd).toBeCloseTo(one.typicalUsd * 10, 9);
    expect(ten.worstUsd).toBeCloseTo(one.worstUsd * 10, 9);
    expect(ten.typicalInr).toBeCloseTo(ten.typicalUsd * USD_INR, 9);
    expect(ten.perMatterWorstUsd).toBeCloseTo(one.worstUsd, 9);
  });

  it('worst case is never below typical, and the default 10 matters fit the cap', () => {
    const e = estimateAb(DEFAULT_MATTERS.length);
    expect(e.worstUsd).toBeGreaterThanOrEqual(e.typicalUsd);
    expect(e.typicalInr).toBeLessThanOrEqual(BUDGET_INR);
    expect(e.perMatterWorstUsd * USD_INR).toBeLessThanOrEqual(BUDGET_INR);
  });

  it('the dearer arm raises the estimate (opus-only costs more than sonnet-only)', () => {
    expect(estimateAb(5, ['claude-opus-5-5']).worstUsd).toBeGreaterThan(
      estimateAb(5, ['claude-sonnet-5-5']).worstUsd,
    );
  });

  it('an unknown model is priced high, so the guard errs safe', () => {
    expect(estimateAb(1, ['claude-unknown-9']).worstUsd).toBeGreaterThan(
      estimateAb(1, ['claude-opus-5-5']).worstUsd,
    );
  });

  it('the runtime stop: a matter is not started when spent + its worst case would pass the cap', () => {
    const e = estimateAb(1);
    const wouldPass = (spentUsd: number) => (spentUsd + e.perMatterWorstUsd) * USD_INR > BUDGET_INR;
    expect(wouldPass(0)).toBe(false);
    const headroomUsd = BUDGET_INR / USD_INR - e.perMatterWorstUsd;
    expect(wouldPass(headroomUsd - 0.0001)).toBe(false);
    expect(wouldPass(headroomUsd + 0.0001)).toBe(true);
  });

  it('the driver source applies that exact stop in real mode, before a matter, and the refusals upfront', () => {
    const src = fs.readFileSync(SRC, 'utf8');
    expect(src).toMatch(
      /args\.mode === 'real' && \(spentUsd \+ estimate\.perMatterWorstUsd\) \* USD_INR > BUDGET_INR/,
    );
    // and a second stop after each matter: once the running total passes the cap, break (never continue)
    expect(src).toMatch(
      /if \(spentUsd \* USD_INR > BUDGET_INR\) \{\s*capped = [^;]*;\s*break;\s*\}/,
    );
    expect(src).toMatch(/estimate\.typicalInr > BUDGET_INR/);
    expect(src).toMatch(/estimate\.perMatterWorstUsd \* USD_INR > BUDGET_INR/);
  });
});

describe('tokensOf / costOf', () => {
  const calls = [
    call({
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 400,
    }),
    call({ input_tokens: 100, output_tokens: 50 }),
  ];

  it('tokensOf sums every class', () => {
    expect(tokensOf(calls)).toEqual({
      input: 1100,
      output: 550,
      cacheRead: 2000,
      cacheCreation: 400,
    });
    expect(tokensOf([])).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
  });

  it('costOf raw prices each cache class at its own rate', () => {
    const r = RATES[ARMS[0]];
    const raw = (1100 * r.input + 550 * r.output + 400 * r.cacheWrite + 2000 * r.cacheRead) / 1e6;
    expect(costOf(calls).raw).toBeCloseTo(raw, 12);
  });

  it('costOf uncached-equivalent prices every cached token as plain input', () => {
    const r = RATES[ARMS[0]];
    const unc = ((1100 + 2000 + 400) * r.input + 550 * r.output) / 1e6;
    expect(costOf(calls).uncachedEquivalent).toBeCloseTo(unc, 12);
  });

  it('raw and uncached are equal with no cache, and cache reads make raw cheaper', () => {
    const plain = costOf([call({ input_tokens: 1000, output_tokens: 1000 })]);
    expect(plain.raw).toBeCloseTo(plain.uncachedEquivalent, 12);
    const cached = costOf([call({ cache_read_input_tokens: 1_000_000 })]);
    expect(cached.raw).toBeLessThan(cached.uncachedEquivalent);
  });

  it('each call is priced at its own model', () => {
    const s = costOf([call({ model: ARMS[0], input_tokens: 1_000_000 })]).raw;
    const o = costOf([call({ model: ARMS[1], input_tokens: 1_000_000 })]).raw;
    expect(o).toBeCloseTo(s * 2, 9);
  });
});

describe('outcomeOfError', () => {
  it('fact_needed and fact_conflict are the gates withholding', () => {
    expect(outcomeOfError('fact_needed')).toEqual({ kind: 'withheld', code: 'fact_needed' });
    expect(outcomeOfError('fact_conflict')).toEqual({ kind: 'withheld', code: 'fact_conflict' });
  });

  it('anything else is a failed run (not a model verdict), prefixed', () => {
    expect(outcomeOfError('rate_limited')).toEqual({
      kind: 'failed',
      code: 'generate_rate_limited',
    });
    expect(outcomeOfError(undefined)).toEqual({ kind: 'failed', code: 'generate_unknown' });
    expect(outcomeOfError(42)).toEqual({ kind: 'failed', code: 'generate_unknown' });
  });
});

describe('the eight scripts/ab fixtures', () => {
  const files = fs
    .readdirSync(AB_FIXTURES_DIR)
    .filter((n) => n.endsWith('.json'))
    .sort();
  const loaded = loadFixtures(AB_FIXTURES_DIR);

  it('there are 8 (Arjun: 6-8), numbered 39..46, and loadFixtures accepts them', () => {
    expect(files).toHaveLength(8);
    expect(loaded.map((f) => f.id.split('-')[0])).toEqual([
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
    ]);
    for (const f of loaded) expect(checkFixture(f)).toEqual([]);
  });

  it.each(files)('%s: ajay null, the exact review string, no v3_stage', (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(AB_FIXTURES_DIR, file), 'utf8'));
    expect(raw.ajay).toBeNull();
    expect(raw.review).toBe(REVIEW_STATUS);
    expect(raw).not.toHaveProperty('v3_stage');
    expect(raw.id).toBe(file.replace(/\.json$/, ''));
  });

  it('every expectation has a non-empty why citing a ruling id (T-nnn or AJ-nnn)', () => {
    let n = 0;
    for (const f of loaded)
      for (const k of ['absent', 'present', 'exact'] as const)
        for (const t of f.expect[k] ?? []) {
          n += 1;
          expect({ f: f.id, why: t.why.length > 0 }).toEqual({ f: f.id, why: true });
          expect({ f: f.id, why: t.why }).toEqual({
            f: f.id,
            why: expect.stringMatching(/\b(T|AJ)-\d+/),
          });
        }
    expect(n).toBeGreaterThan(40);
  });

  it('every expectation why STARTS with a ruling id (T-nnn or AJ-nnn)', () => {
    for (const f of loaded)
      for (const k of ['absent', 'present', 'exact'] as const)
        for (const t of f.expect[k] ?? [])
          expect({ f: f.id, why: t.why }).toEqual({
            f: f.id,
            why: expect.stringMatching(/^(T-\d+|AJ-\d+)/),
          });
  });

  it('use the Sample naming pattern: no real-looking person names', () => {
    // Every name introduced by a role or a kinship word must be "Sample Person N" or "Sample <thing>".
    const intro =
      /\b(?:son of|wife of|daughter of|S\/o|W\/o|D\/o|Smt\.?|Shri|Sri|Mr\.?|Mrs\.?|Ms\.?|Plaintiff:|Defendant:|Petitioner:|Respondent:|Accused:|Applicant:|Complainant:)\s+([A-Z][A-Za-z.]*)/g;
    for (const f of loaded) {
      const text = [f.description, ...(f.answers ?? []).map((a) => String(a.value))].join('\n');
      const names = [...text.matchAll(intro)].map((m) => m[1]);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(n).toBe('Sample');
    }
  });

  it('no description carries a phone number, an email address or a 12-digit Aadhaar-like number', () => {
    for (const f of loaded) {
      const text = [f.description, ...(f.answers ?? []).map((a) => String(a.value))].join('\n');
      expect(text).not.toMatch(/\b[6-9]\d{9}\b/);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
    }
  });
});

describe('source guard: run-ab.ts never reads a database address from the shell', () => {
  const raw = fs.readFileSync(SRC, 'utf8');
  // Comments out, so the header prose that names these variables does not count.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"`])\/\/[^\n]*/g, '$1');

  it('never mentions GOLDEN_SET_MONGODB_URI in code', () => {
    expect(code).not.toContain('GOLDEN_SET_MONGODB_URI');
  });

  it('every process.env.MONGO_URI is an assignment (overwrite) or the in-memory check; never a source', () => {
    const uses = [...code.matchAll(/process\.env\.MONGO_URI\b[^\n]*/g)].map((m) => m[0]);
    expect(uses.length).toBeGreaterThan(0);
    const assignments = uses.filter((u) => /^process\.env\.MONGO_URI\s*=(?!=)/.test(u));
    const checks = uses.filter((u) => /^process\.env\.MONGO_URI\s*!==\s*ctx\.memUri/.test(u));
    // anything else (e.g. `const u = process.env.MONGO_URI`) would be a read used as a source
    expect(uses.filter((u) => !assignments.includes(u) && !checks.includes(u))).toEqual([]);
    expect(assignments).toHaveLength(2);
    expect(checks).toHaveLength(1);
    // the overwrite with the in-memory URI is the only non-placeholder assignment
    expect(assignments.some((a) => /=\s*memUri;/.test(a))).toBe(true);
  });

  it('no other way to reach MONGO_URI: bracket access, destructuring, env spread, dotenv', () => {
    expect(code).not.toMatch(/process\.env\[\s*['"`]MONGO/);
    expect(code).not.toMatch(/\{[^}]*MONGO_URI[^}]*\}\s*=\s*process\.env/);
    expect(code).not.toMatch(/\.\.\.process\.env/);
    expect(code).not.toMatch(/dotenv/);
    expect(code).not.toMatch(/readFileSync\([^)]*\.env/);
  });

  it('connects only to memUri and gates on assertMemory before writes', () => {
    expect(code).toMatch(/mongoose\.connect\(memUri,/);
    expect(code).not.toMatch(/mongoose\.connect\((?!memUri)/);
    expect(code).toMatch(/\['127\.0\.0\.1', 'localhost', '::1'\]/);
    const writes = code.match(/assertMemory\(ctx\)/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(3); // setArm, seedMemoryDb, main
  });

  it('--real is refused unless AB_ARJUN_GO is 1', () => {
    expect(code).toMatch(/process\.env\.AB_ARJUN_GO !== '1'/);
  });
});

// ── child-process runs ──────────────────────────────────────────────────────

const DRAFTING = path.join(ROOT, 'apps', 'drafting');
/** A clean environment: PATH and HOME only. Nothing of the caller's secrets or DB addresses is passed on. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, HOME: process.env.HOME, ...extra };
}
function runDriver(args: string[], env: NodeJS.ProcessEnv, timeout: number) {
  return spawnSync(
    'yarn',
    [
      '-s',
      'ts-node',
      '--transpile-only',
      '-O',
      '{"module":"commonjs","moduleResolution":"node"}',
      SRC,
      ...args,
    ],
    { cwd: DRAFTING, env, encoding: 'utf8', timeout },
  );
}

describe('driver refusals (child process, exit 2 before any database or model is touched)', () => {
  jest.setTimeout(120_000);

  it('--real without AB_ARJUN_GO exits 2 and says so', () => {
    const r = runDriver(['--real'], cleanEnv(), 90_000);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/AB_ARJUN_GO/);
  });

  it('--real with AB_ARJUN_GO but no key exits 2, naming the variable only', () => {
    const r = runDriver(['--real'], cleanEnv({ AB_ARJUN_GO: '1' }), 90_000);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/GOLDEN_SET_ANTHROPIC_API_KEY/);
  });

  it('an unknown matter exits 2', () => {
    const r = runDriver(['--dry', '--matters', 'nope'], cleanEnv(), 90_000);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no matter nope/);
  });

  it('a draft cap over 40 exits 2', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `x${i}`).join(',');
    const r = runDriver(['--dry', '--matters', ids], cleanEnv(), 90_000);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/hard cap/);
  });
});

describe('integration: --dry on golden 23 (in-memory Mongo, stub seam)', () => {
  jest.setTimeout(300_000);
  let out: string;
  beforeAll(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 't691-ab-out-'));
  });
  afterAll(() => {
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('exits 0, writes the scoring and metrics files and a 0600 sealed key, and the service wrote no AppSetting', () => {
    // A shell MONGO_URI pointing somewhere else must be ignored: pass a dead address, expect success anyway.
    const dead = ['mongodb', '://', 'dead-host.invalid', ':27017/never'].join('');
    const r = runDriver(
      ['--dry', '--matters', '23', '--seed', '7', '--out', out],
      cleanEnv({ MONGO_URI: dead, GOLDEN_SET_MONGODB_URI: dead }),
      280_000,
    );
    // yarn may warn on stderr; the driver's own errors are prefixed "ab:".
    expect({
      status: r.status,
      abErrors: r.stderr.split('\n').filter((l) => l.startsWith('ab:')),
    }).toEqual({
      status: 0,
      abErrors: [],
    });
    expect(r.stdout).toMatch(/in-memory database/);
    expect(r.stdout).toMatch(/AppSetting rows other than the arm's: unchanged/);
    expect(r.stdout).toMatch(/2 drafts: 2 delivered, 0 withheld, 0 not produced/);
    expect(r.stdout).not.toContain('dead-host');
    // blind console: no model names
    expect(r.stdout).not.toMatch(/claude|opus|sonnet|haiku/i);

    const stamps = fs.readdirSync(out);
    expect(stamps).toHaveLength(1);
    const dir = path.join(out, stamps[0]);
    expect(fs.readdirSync(path.join(dir, 'scoring')).sort()).toEqual(['D01.md', 'D02.md']);
    const metrics = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
    expect(Object.keys(metrics).sort()).toEqual(['D01', 'D02']);
    for (const id of ['D01', 'D02']) {
      const text = fs.readFileSync(path.join(dir, 'scoring', `${id}.md`), 'utf8');
      expect(text).not.toMatch(/claude|opus|sonnet|haiku/i);
      expect(text).toContain('## Draft');
    }
    expect(fs.statSync(path.join(dir, 'KEY.sealed.json')).mode & 0o777).toBe(0o600);

    // spend fields per draft, and they add up to the per-matter stdout line
    const spendOk = (x: { usd: number; inr: number } | undefined) =>
      x !== undefined && typeof x.usd === 'number' && Math.abs(x.inr - x.usd * USD_INR) < 1e-9;
    for (const id of ['D01', 'D02']) {
      expect(spendOk(metrics[id].spend)).toBe(true);
      expect(spendOk(metrics[id].intakeSpend)).toBe(true);
    }
    expect(metrics.D01.intakeSpend.usd).toBeCloseTo(metrics.D02.intakeSpend.usd, 12);
    const line = r.stdout.split('\n').find((l) => /matter 23\S*: spend intake/.test(l));
    expect(line).toBeDefined();
    const usds = [...(line as string).matchAll(/\(\$([0-9.]+)\)/g)].map((m) => Number(m[1]));
    expect(usds).toHaveLength(4); // intake, two drafts, running total
    const [intakeU, d1, d2, total] = usds;
    expect(intakeU).toBeCloseTo(metrics.D01.intakeSpend.usd, 3);
    expect([d1, d2].sort((a, b) => a - b)[0]).toBeCloseTo(
      Math.min(metrics.D01.spend.usd, metrics.D02.spend.usd),
      3,
    );
    expect([d1, d2].sort((a, b) => a - b)[1]).toBeCloseTo(
      Math.max(metrics.D01.spend.usd, metrics.D02.spend.usd),
      3,
    );
    expect(total).toBeCloseTo(
      metrics.D01.intakeSpend.usd + metrics.D01.spend.usd + metrics.D02.spend.usd,
      3,
    );
    // the line names no model, arm or order, and the drafts are listed lower first
    expect(line).not.toMatch(/claude|opus|sonnet|haiku|\barm\b|\border\b|\bfirst\b|\bsecond\b/i);
    expect(d1).toBeLessThanOrEqual(d2);
  });
});
