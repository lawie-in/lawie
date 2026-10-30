import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  ARMS,
  ARM_EFFORT,
  BUDGET_INR,
  DEFAULT_MATTERS,
  EXTRA_WORST_CALLS,
  INTAKE_MODEL,
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
  rateFor,
  selectMatters,
  tokensOf,
} from '../ab/run-ab';
import { seededRandom, unseal } from '../ab/blind-writer';
import { WORST_CASE_CALLS } from '../golden-set/lib/cost';
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

  it('--real with --seed is refused (a seed on a command line leaks into argv, history and ps)', () => {
    const e = parseArgs(['--real', '--seed', '7']).errors;
    expect(e.join(' ')).toMatch(/--seed is for --dry only/);
    // either order of the flags
    expect(parseArgs(['--seed', '7', '--real']).errors.join(' ')).toMatch(
      /--seed is for --dry only/,
    );
    // the error does not echo the seed value
    expect(e.join(' ')).not.toMatch(/\b7\b/);
  });

  it('--real alone and --dry with --seed raise no seed error', () => {
    expect(parseArgs(['--real']).errors.join(' ')).not.toMatch(/seed/);
    expect(parseArgs(['--dry', '--seed', '7']).errors).toEqual([]);
    expect(parseArgs(['--dry', '--seed', '0']).errors).toEqual([]);
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

  it('passes with no body calls when no draft was delivered (nothing to contradict)', () => {
    expect(armCheck([], ARMS[0])).toEqual([]);
    expect(armCheck([], ARMS[0], false)).toEqual([]);
  });

  it('a delivered draft with no Drafter call on record is one problem, for either arm', () => {
    for (const m of ARMS) {
      const p = armCheck([], m, true);
      expect(p).toHaveLength(1);
      expect(p[0]).toMatch(/no Drafter call on record/);
      expect(p[0]).not.toMatch(/claude|opus|sonnet|haiku/i);
    }
  });

  it('a delivered draft with a good body call still passes; a bad one still fails', () => {
    expect(armCheck([call()], ARMS[0], true)).toEqual([]);
    expect(armCheck([call({ model: ARMS[1] })], ARMS[0], true)).toHaveLength(1);
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

  describe('EXTRA_WORST_CALLS (review round 1, SHOULD 3)', () => {
    /** Priced the way the estimate says it prices: input at the dearer of input and cache write. */
    const priced = (calls: readonly { model: string; input: number; output: number }[]) => {
      let usd = 0;
      for (const c of calls)
        for (const m of c.model === 'intake' ? [INTAKE_MODEL] : [...ARMS]) {
          const r = rateFor(m);
          usd += (c.input / 1e6) * Math.max(r.input, r.cacheWrite) + (c.output / 1e6) * r.output;
        }
      return usd;
    };

    it('covers a second reception and extraction, the match call and its retry, and a non-body allowance per arm', () => {
      const purposes = EXTRA_WORST_CALLS.map((c) => c.purpose);
      expect(purposes).toEqual(
        expect.arrayContaining([
          'intake_reception_2',
          'intake_extract_2',
          'intake_match',
          'intake_match_retry',
          'arm_non_body_allowance',
        ]),
      );
      // the allowance is priced at the arm's model, once per arm; the rest at the intake model
      expect(EXTRA_WORST_CALLS.filter((c) => c.model === 'drafting')).toHaveLength(1);
      for (const c of EXTRA_WORST_CALLS) expect(c.input + c.output).toBeGreaterThan(0);
    });

    it('the per-matter worst case is the old worst case plus the extras, and is higher', () => {
      const old = priced(WORST_CASE_CALLS);
      const extra = priced(EXTRA_WORST_CALLS);
      expect(extra).toBeGreaterThan(0);
      const e = estimateAb(1);
      expect(e.perMatterWorstUsd).toBeCloseTo(old + extra, 9);
      expect(e.perMatterWorstUsd).toBeGreaterThan(old);
      // the allowance is the arm's model: opus-only raises the extras more than sonnet-only
      expect(
        estimateAb(1, ['claude-opus-5-5']).perMatterWorstUsd -
          estimateAb(1, ['claude-sonnet-5-5']).perMatterWorstUsd,
      ).toBeGreaterThan(0);
    });

    it('the typical estimate does not include the extras', () => {
      let typical = 0;
      for (const c of WORST_CASE_CALLS)
        for (const m of c.model === 'intake' ? [INTAKE_MODEL] : [...ARMS]) {
          const r = rateFor(m);
          if (c.purpose === 'intake_reception' || c.purpose === 'intake_extract')
            typical += (c.input / 1e6) * r.input + (c.output / 1e6) * r.output;
          if (c.purpose === 'drafter_body')
            typical += (c.input / 1e6) * r.input + (c.output / 3 / 1e6) * r.output;
        }
      expect(estimateAb(1).typicalUsd).toBeCloseTo(typical, 9);
      expect(estimateAb(10).typicalUsd).toBeCloseTo(typical * 10, 9);
    });

    it('the default 10 matters still have a typical estimate within 600 rupees, and one matter fits the cap', () => {
      const e = estimateAb(DEFAULT_MATTERS.length);
      expect(e.typicalInr).toBeLessThanOrEqual(BUDGET_INR);
      expect(e.perMatterWorstUsd * USD_INR).toBeLessThanOrEqual(BUDGET_INR);
      // and the worst case for ten does pass it: the runtime stops are what hold the cap
      expect(e.worstInr).toBeGreaterThan(BUDGET_INR);
    });
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

  it.each(files)('%s: signed ajay string, the exact review string, no v3_stage', (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(AB_FIXTURES_DIR, file), 'utf8'));
    expect(raw.ajay).toBe(
      'Ajay, 30 Oct 2026, T-691 (handoff/legal/T-691-ab-matters-and-rubric-ajay.md)',
    );
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

describe('source guard (regex): only what cannot be exercised without --real or a non-memory database', () => {
  // Left as regexes on purpose:
  //  - the runtime stops in real mode (they need a real run to be reached),
  //  - assertMemory before writes (needs a database that is not the in-memory one),
  //  - no other route to a database address (.env files, bracket access, env spread).
  // Replaced by child-process behaviour below: --real refusals (AB_ARJUN_GO, key, seed), a dead
  // MONGO_URI / GOLDEN_SET_MONGODB_URI being ignored, and the connection being to the in-memory server.
  const raw = fs.readFileSync(SRC, 'utf8');
  // Comments out, so the header prose that names these variables does not count.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"`])\/\/[^\n]*/g, '$1');

  it('applies the runtime stop in real mode before a matter, the stop after one, and the refusals upfront', () => {
    expect(code).toMatch(
      /args\.mode === 'real' && \(spentUsd \+ estimate\.perMatterWorstUsd\) \* USD_INR > BUDGET_INR/,
    );
    expect(code).toMatch(
      /if \(spentUsd \* USD_INR > BUDGET_INR\) \{\s*capped = [^;]*;\s*break;\s*\}/,
    );
    expect(code).toMatch(/estimate\.typicalInr > BUDGET_INR/);
    expect(code).toMatch(/estimate\.perMatterWorstUsd \* USD_INR > BUDGET_INR/);
  });

  it('no other way to reach MONGO_URI: bracket access, destructuring, env spread, dotenv', () => {
    expect(code).not.toMatch(/process\.env\[\s*['"`]MONGO/);
    expect(code).not.toMatch(/\{[^}]*MONGO_URI[^}]*\}\s*=\s*process\.env/);
    expect(code).not.toMatch(/\.\.\.process\.env/);
    expect(code).not.toMatch(/dotenv/);
    expect(code).not.toMatch(/readFileSync\([^)]*\.env/);
  });

  it('gates on assertMemory before writes and allows loopback hosts only', () => {
    expect(code).toMatch(/\['127\.0\.0\.1', 'localhost', '::1'\]/);
    expect((code.match(/assertMemory\(ctx\)/g) ?? []).length).toBeGreaterThanOrEqual(3); // setArm, seedMemoryDb, main
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

  it('--real with --seed exits 2 on the seed alone, before any database or model (AB_ARJUN_GO set)', () => {
    // The go flag is built at runtime; the key is deliberately absent, so the only reason that names the seed is the seed.
    const go = String(Number('1'));
    const r = runDriver(['--real', '--seed', '7'], cleanEnv({ AB_ARJUN_GO: go }), 90_000);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--seed is for --dry only/);
    // refused at argument parsing: nothing of the run started
    expect(r.stdout).not.toMatch(/in-memory database|estimate|REAL MODEL/);
    expect(r.stderr).not.toMatch(/GOLDEN_SET_ANTHROPIC_API_KEY|AB_KEY_PASSPHRASE|AB_ARJUN_GO/);
  });

  it('--real with --seed and a --out folder writes nothing there', () => {
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 't691-ab-seedrefuse-'));
    try {
      const r = runDriver(
        ['--real', '--seed', '7', '--out', o],
        cleanEnv({ AB_ARJUN_GO: '1' }),
        90_000,
      );
      expect(r.status).toBe(2);
      expect(fs.readdirSync(o)).toEqual([]);
    } finally {
      fs.rmSync(o, { recursive: true, force: true });
    }
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
  let dir: string;
  let run: ReturnType<typeof runDriver>;
  /** The sealing passphrase is built at runtime and handed to the child by env, as Arjun would. */
  const PASS = ['t691', 'child', 'phrase', String(4242)].join('-');
  const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

  beforeAll(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 't691-ab-out-'));
    // A shell MONGO_URI pointing somewhere else must be ignored: pass a dead address, expect success anyway.
    const dead = ['mongodb', '://', 'dead-host.invalid', ':27017/never'].join('');
    run = runDriver(
      ['--dry', '--matters', '23', '--seed', '7', '--out', out],
      cleanEnv({ MONGO_URI: dead, GOLDEN_SET_MONGODB_URI: dead, AB_KEY_PASSPHRASE: PASS }),
      280_000,
    );
    const stamps = fs.existsSync(out) ? fs.readdirSync(out) : [];
    dir = stamps.length === 1 ? path.join(out, stamps[0]) : out;
  });
  afterAll(() => {
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('exits 0 against the in-memory database only (a dead MONGO_URI is ignored), AppSetting unchanged', () => {
    // yarn may warn on stderr; the driver's own errors are prefixed "ab:".
    expect({
      status: run.status,
      abErrors: run.stderr.split('\n').filter((l) => l.startsWith('ab:')),
    }).toEqual({ status: 0, abErrors: [] });
    expect(run.stdout).toMatch(/in-memory database/);
    expect(run.stdout).toMatch(/AppSetting rows other than the arm's: unchanged/);
    expect(run.stdout).toMatch(/2 drafts: 2 delivered, 0 withheld, 0 not produced/);
    expect(run.stdout).not.toContain('dead-host');
    // blind console: no model names; no passphrase either
    expect(run.stdout).not.toMatch(/claude|opus|sonnet|haiku/i);
    expect(run.stdout + run.stderr).not.toContain(PASS);
  });

  it('writes exactly KEY.sealed.json, scoring/ and vikram/ (and no metrics file next to scoring/)', () => {
    expect(fs.readdirSync(out)).toHaveLength(1);
    expect(fs.readdirSync(dir).sort()).toEqual(['KEY.sealed.json', 'scoring', 'vikram']);
    expect(fs.readdirSync(path.join(dir, 'scoring')).sort()).toEqual(['D01.md', 'D02.md']);
    expect(fs.readdirSync(path.join(dir, 'vikram')).sort()).toEqual([
      'intake-spend.json',
      'metrics.json',
    ]);
    expect(fs.statSync(path.join(dir, 'KEY.sealed.json')).mode & 0o777).toBe(0o600);
    for (const id of ['D01', 'D02']) {
      const text = fs.readFileSync(path.join(dir, 'scoring', `${id}.md`), 'utf8');
      expect(text).not.toMatch(/claude|opus|sonnet|haiku/i);
      expect(text).toContain('## Draft');
    }
  });

  it('the printed paths are the ones written, and the metrics path is outside scoring/', () => {
    const printed = (label: RegExp) => run.stdout.split('\n').find((l) => label.test(l)) ?? '';
    expect(printed(/^ab: metrics/)).toContain(path.join(dir, 'vikram', 'metrics.json'));
    expect(printed(/^ab: intake spend/)).toContain(path.join(dir, 'vikram', 'intake-spend.json'));
    expect(printed(/^ab: scoring files/)).toContain(path.join(dir, 'scoring'));
  });

  it('metrics.json: M-ids, as many rows as scoring files, no D-id, no intake, no placeholders, no withheld', () => {
    const raw = fs.readFileSync(path.join(dir, 'vikram', 'metrics.json'), 'utf8');
    const m = JSON.parse(raw);
    const scoring = fs.readdirSync(path.join(dir, 'scoring'));
    expect(Object.keys(m).sort()).toEqual(['M01', 'M02']);
    expect(Object.keys(m)).toHaveLength(scoring.length);
    expect(raw).not.toMatch(/\bD\d{2}\b|intake|placeholder|withheld|fixtureId|runId|model|claude/i);
    for (const row of Object.values<Record<string, unknown>>(m))
      expect(Object.keys(row).sort()).toEqual(
        ['costUsd', 'factDiffs', 'legalReviewer', 'spend', 'tokens'].sort(),
      );
  });

  it('the sealed key opens with the runtime passphrase and links D to M consistently', () => {
    const key = unseal(path.join(dir, 'KEY.sealed.json'), PASS);
    expect(key.version).toBe(2);
    expect(key.seed).toBe(7);
    expect(Object.keys(key.entries).sort()).toEqual(['D01', 'D02']);
    const mIds = Object.values(key.entries).map((e) => e.metricsId);
    expect([...mIds].sort()).toEqual(['M01', 'M02']);
    expect(new Set(Object.values(key.entries).map((e) => e.model)).size).toBe(2);
    expect([...Object.values(key.entries).map((e) => e.model)].sort()).toEqual([...ARMS].sort());
    for (const e of Object.values(key.entries)) {
      expect(e.fixtureId).toMatch(/^23(-|$)/);
      expect(e.withheld).toBe(false);
      expect(typeof e.placeholders.missingMarkers).toBe('number');
    }
    // the row each D points to is that arm's: the dearer model has the dearer spend
    const m = readJson(path.join(dir, 'vikram', 'metrics.json'));
    const byModel = Object.fromEntries(
      Object.values(key.entries).map((e) => [e.model, m[e.metricsId].spend.usd as number]),
    );
    expect(byModel['claude-opus-5-5']).toBeGreaterThan(byModel['claude-sonnet-5-5']);
  });

  it('the sealed intake agrees with vikram/intake-spend.json, which has no ids and one entry per matter', () => {
    const key = unseal(path.join(dir, 'KEY.sealed.json'), PASS);
    const rawIntake = fs.readFileSync(path.join(dir, 'vikram', 'intake-spend.json'), 'utf8');
    const arr = JSON.parse(rawIntake) as {
      tokens: { input: number; output: number };
      spend: { usd: number; inr: number };
    }[];
    const fromKey = Object.values(key.intake);
    expect(arr).toHaveLength(1);
    expect(fromKey).toHaveLength(arr.length);
    expect(rawIntake).not.toMatch(/fixtureId|\bD\d{2}\b|\bM\d{2}\b/);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(arr.map((x) => x.spend.usd))).toBeCloseTo(
      sum(fromKey.map((x) => x.spend?.usd ?? 0)),
      12,
    );
    expect(sum(arr.map((x) => x.tokens.input))).toBe(sum(fromKey.map((x) => x.tokens.input)));
    for (const x of arr) expect(Math.abs(x.spend.inr - x.spend.usd * USD_INR)).toBeLessThan(1e-9);
  });

  it('metrics spend per draft is in USD and rupees at 88, and adds up to the stdout matter line', () => {
    const m = readJson(path.join(dir, 'vikram', 'metrics.json'));
    const key = unseal(path.join(dir, 'KEY.sealed.json'), PASS);
    const intakeUsd = Object.values(key.intake)[0].spend?.usd as number;
    const spends = Object.values<{ spend: { usd: number; inr: number } }>(m).map((r) => r.spend);
    for (const x of spends) expect(Math.abs(x.inr - x.usd * USD_INR)).toBeLessThan(1e-9);
    const line = run.stdout.split('\n').find((l) => /matter 23\S*: spend intake/.test(l));
    expect(line).toBeDefined();
    const usds = [...(line as string).matchAll(/\(\$([0-9.]+)\)/g)].map((x) => Number(x[1]));
    expect(usds).toHaveLength(4); // intake, two drafts, running total
    const [intakeU, d1, d2, total] = usds;
    const sorted = spends.map((x) => x.usd).sort((a, b) => a - b);
    expect(intakeU).toBeCloseTo(intakeUsd, 3);
    expect(d1).toBeCloseTo(sorted[0], 3);
    expect(d2).toBeCloseTo(sorted[1], 3);
    expect(total).toBeCloseTo(intakeUsd + sorted[0] + sorted[1], 3);
    // the line names no model, arm or order, and the drafts are listed lower first
    expect(line).not.toMatch(
      /claude|opus|sonnet|haiku|\barm\b|\border\b|\bfirst\b|\bsecond\b|\bD\d{2}\b/i,
    );
    expect(d1).toBeLessThanOrEqual(d2);
  });

  it('nothing outside KEY.sealed.json joins a scoring file to a metrics row', () => {
    const key = unseal(path.join(dir, 'KEY.sealed.json'), PASS);
    for (const f of fs.readdirSync(path.join(dir, 'scoring')))
      expect(fs.readFileSync(path.join(dir, 'scoring', f), 'utf8')).not.toMatch(/\bM\d{2}\b/);
    const clear = fs.readFileSync(path.join(dir, 'KEY.sealed.json'), 'utf8');
    for (const e of Object.values(key.entries)) {
      expect(clear).not.toContain(e.fixtureId);
      expect(clear).not.toContain(e.metricsId);
    }
    // with a wrong passphrase the key stays shut
    expect(() => unseal(path.join(dir, 'KEY.sealed.json'), PASS + 'x')).toThrow();
  });
});
