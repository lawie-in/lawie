/**
 * T-147e — the golden-set harness itself (no model, no real database).
 * Pure libs are unit-tested; the runner is spawned for mode refusal and the
 * dry run. The child env is built from scratch: no GOLDEN_SET_* secret, so
 * `--real` is always refused before anything is touched.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { evaluate, skipped } from '../lib/assert';
import { estimateCost, RUN_LIMITS } from '../lib/cost';
import { checkComposition, checkFixture, loadFixtures } from '../lib/fixtures';
import { renderFixture, renderSummary, summarise } from '../lib/report';
import { Fixture, RunEvidence, SEEDED_PACKS } from '../lib/types';

const fixtures = loadFixtures();

function evidence(over: Partial<RunEvidence> = {}): RunEvidence {
  return {
    fixtureId: 'x', runId: 'run-abc', intakeId: 'i', documentId: 'd', ledgerId: 'l', pipelineError: null,
    deliveredText: '1. That Testpal Yadav is in custody.\n\n2. That the applicant is gainfully employed.',
    ledger: null, factDiffs: [], missingClauses: [], banner: false,
    tokens: { inputTokens: 10, outputTokens: 5, costUsd: 0.01, calls: 3 }, extraction: [],
    isolation: { ok: true, problems: [] }, ...over,
  };
}
const fx = (): Fixture => ({ ...fixtures[0], expect: {
  absent: [{ any_of: ['gainfully employed'], why: 'invented' }],
  present: [{ any_of: ['Hazratganj'], why: 'station given' }],
  exact: [{ any_of: ['Testpal Yadav'], why: 'name' }],
} });

describe('composition (AC3)', () => {
  it('has at least 15 fixtures on the seeded packs and every pack is used', () => {
    expect(checkComposition(fixtures)).toEqual([]);
    expect(fixtures.filter((f) => (SEEDED_PACKS as readonly string[]).includes(f.pack)).length).toBeGreaterThanOrEqual(15);
    for (const p of SEEDED_PACKS) expect(fixtures.some((f) => f.pack === p)).toBe(true);
  });
  it('reports a short or missing pack', () => {
    const problems = checkComposition(fixtures.filter((f) => f.pack !== 'default_bail').slice(0, 10));
    expect(problems.join('\n')).toMatch(/at least 15/);
    expect(problems.join('\n')).toMatch(/no fixture for default_bail/);
  });
  it('every fixture names its risk and is well-formed', () => {
    for (const f of fixtures) expect({ id: f.id, p: checkFixture(f) }).toEqual({ id: f.id, p: [] });
  });
});

describe('assert / report (AC8): a readable diff, no stack trace', () => {
  it('fails with expected / actual / why and context lines', () => {
    const r = evaluate(fx(), evidence());
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.kind).sort()).toEqual(['absent', 'present']);
    const text = renderFixture(r).join('\n');
    expect(text).toMatch(/^FAIL /);
    expect(text).toContain('- expected: absent: "gainfully employed"');
    expect(text).toContain('+ actual:   found "gainfully employed"');
    expect(text).toContain('why:      invented');
    expect(text).toContain('> '); // context line marker
    expect(text).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)/);
    expect(text).not.toMatch(/Error:/);
  });
  it('records the runId with the result and prints it', () => {
    const r = evaluate(fx(), evidence());
    expect(r.runId).toBe('run-abc');
    expect(renderFixture(r).join('\n')).toContain('runId=run-abc');
  });
  it('passes when expectations hold; a placeholder label is not an assertion', () => {
    const e = { ...fx(), expect: { absent: [{ any_of: ['gainfully employed'], why: 'w' }] } };
    const r = evaluate(e, evidence({ deliveredText: '2. That {{MISSING: gainfully employed}}.' }));
    expect(r.passed).toBe(true);
  });
  it('character-exact: a near match fails and says so', () => {
    const e = { ...fx(), expect: { exact: [{ any_of: ['18 September 2026'], why: 'memo date' }] } };
    const r = evaluate(e, evidence({ deliveredText: '18 september 2026' }));
    expect(r.failures[0].actual).toMatch(/near match/);
  });
  it('a verifier finding fails the fixture unless allowed; isolation and pipeline errors fail it', () => {
    const v = { check: 'banned' as const, entityType: 'phrase', ledgerKey: null, label: 'L', bannedEntryId: 'gainfully_employed', draftValue: 'gainfully employed', ledgerValue: null, resolution: 'stripped', phase: 'initial' as const, paragraphIndex: 1 };
    const base = { ...fx(), expect: { absent: [{ any_of: ['zzz'], why: 'w' }] } };
    expect(evaluate(base, evidence({ factDiffs: [v] })).passed).toBe(false);
    const allowed = { ...base, expect: { ...base.expect, allow_violations: [{ check: 'banned' as const, bannedEntryId: 'gainfully_employed', why: 'ticketed' }] } };
    expect(evaluate(allowed, evidence({ factDiffs: [v] })).passed).toBe(true);
    expect(evaluate(base, evidence({ isolation: { ok: false, problems: ['row not fixture'] } })).failures[0].kind).toBe('isolation');
    expect(evaluate(base, evidence({ deliveredText: null, pipelineError: 'no draft' })).failures[0].kind).toBe('pipeline');
  });
  it('summary counts passed, failed and skipped', () => {
    const s = summarise([evaluate(fx(), evidence()), skipped(fx(), 'no replies')]);
    expect(s).toMatchObject({ total: 2, failed: 1, skipped: 1, passed: 0 });
    expect(renderSummary(s).join('\n')).toContain('RESULT: FAIL');
  });
});

describe('cost: the estimate and the caps', () => {
  const rate = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };
  it('scales with fixtures and prices at the seeded rates', () => {
    const one = estimateCost(1, { intake: rate, drafting: rate });
    const ten = estimateCost(10, { intake: rate, drafting: rate });
    expect(one.maxUsd).toBeGreaterThan(0);
    expect(ten.maxUsd).toBeCloseTo(one.maxUsd * 10, 6);
    expect(one.typicalUsd).toBeLessThan(one.maxUsd);
    expect(one.ratesAssumed).toBe(false);
  });
  it('an unseeded rate is priced high and flagged', () => {
    const e = estimateCost(1, { intake: null, drafting: rate });
    expect(e.ratesAssumed).toBe(true);
    expect(e.maxUsd).toBeGreaterThan(estimateCost(1, { intake: rate, drafting: rate }).maxUsd);
  });
  it('run limits exist and the hard cap is above the default', () => {
    expect(RUN_LIMITS.maxFixturesHard).toBeGreaterThan(RUN_LIMITS.maxFixturesDefault);
    expect(RUN_LIMITS.maxTokensDefault).toBeGreaterThan(0);
  });
});

describe('the runner', () => {
  const DRAFTING = join(__dirname, '..', '..', '..', 'apps', 'drafting');
  const RUN = join(__dirname, '..', 'run.ts');
  function run(args: string[]) {
    // No GOLDEN_SET_* in the env, whatever the parent has.
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
    return spawnSync('npx', ['ts-node', '--transpile-only', RUN, ...args], { cwd: DRAFTING, env, encoding: 'utf-8', timeout: 240_000 });
  }

  it('no mode: refused with exit 2 and a usage line', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('choose --dry-run');
  });
  it('--real without the secrets: refused with exit 2, names only', () => {
    const r = run(['--real']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('GOLDEN_SET_ANTHROPIC_API_KEY');
    expect(r.stderr).toContain('GOLDEN_SET_MONGODB_URI');
  });
  it('--dry-run and --real together: refused', () => {
    expect(run(['--dry-run', '--real']).status).toBe(2);
  });

  it('dry run: 1a and 1b pass; --stub t147 makes 1a fail with the four invented averments; runId recorded', () => {
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const clean = run(['--dry-run', '--only', '1a,1b', '--out', out]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).toMatch(/PASS {2}1a-t147-regular-bail/);
    expect(clean.stdout).toMatch(/PASS {2}1b-/);
    const file = readdirSync(out).find((n) => n.endsWith('-dry.json'))!;
    const saved = JSON.parse(readFileSync(join(out, file), 'utf-8')) as { results: Array<{ id: string; runId: string | null }> };
    for (const r of saved.results) expect(r.runId).toBeTruthy();

    const out2 = mkdtempSync(join(tmpdir(), 'golden-'));
    const stub = run(['--dry-run', '--stub', 't147', '--only', '1a', '--out', out2]);
    expect(stub.status).toBe(1);
    expect(stub.stdout).toMatch(/FAIL {2}1a-t147-regular-bail/);
    for (const id of ['no_criminal_antecedents', 'gainfully_employed', 'cooperated_with_investigation', 'deep_roots_in_society']) {
      expect(stub.stdout).toContain(id);
    }
    expect(stub.stdout).toContain('- expected:');
    expect(stub.stdout).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)/);
  }, 300_000);
});
