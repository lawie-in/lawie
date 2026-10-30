/**
 * T-683 phase 2: the golden set's per-group fixture caps, the v2 --real run
 * never counting v3 cassettes, and the report's 'extract' stage row.
 * No model call; the runner is started without GOLDEN_SET_* secrets.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

import {
  fixtureGroup,
  MAX_FIXTURES_DEFAULT,
  RUN_LIMITS,
  selectedGroup,
  V3_VARIANT,
} from '../lib/cost';
import { loadFixtures } from '../lib/fixtures';
import { renderLlmCalls, summariseLlmCalls } from '../lib/report';
import { LlmCallObserved } from '../lib/types';

const DRAFTING = join(__dirname, '..', '..', '..', 'apps', 'drafting');
const RUN = join(__dirname, '..', 'run.ts');
const fixtures = loadFixtures();

function run(args: string[]) {
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return spawnSync('npx', ['ts-node', '--transpile-only', RUN, ...args], {
    cwd: DRAFTING,
    env,
    encoding: 'utf-8',
    timeout: 240_000,
  });
}

describe('fixture groups and the per-group caps', () => {
  it('v2 is 30 and v3 is 10 by default; the hard cap stays 40', () => {
    expect(MAX_FIXTURES_DEFAULT).toEqual({ v2: 30, v3: 10 });
    expect(RUN_LIMITS.maxFixturesDefault).toBe(30);
    expect(RUN_LIMITS.maxFixturesHard).toBe(40);
  });

  it('a fixture is v3 with v3_stage >= 1 or a v3_extract recording, else v2', () => {
    expect(fixtureGroup({})).toBe('v2');
    expect(fixtureGroup({ v3_stage: 0 })).toBe('v2');
    expect(fixtureGroup({ v3_stage: 1 })).toBe('v3');
    expect(fixtureGroup({ v3_stage: 3 })).toBe('v3');
    expect(fixtureGroup({ recorded: { clean: {} } })).toBe('v2');
    expect(fixtureGroup({ recorded: { [V3_VARIANT]: {} } })).toBe('v3');
  });

  it('the v3_extract variant selects the v3 group; any other variant is v2', () => {
    expect(selectedGroup('v3_extract')).toBe('v3');
    expect(selectedGroup('clean')).toBe('v2');
    expect(selectedGroup('t147')).toBe('v2');
  });

  it('the shipped fixtures: the ten cassettes 29-38 are the v3 group, and each group fits its cap', () => {
    const v3 = fixtures.filter((f) => fixtureGroup(f) === 'v3').map((f) => f.id.slice(0, 2));
    expect(v3.sort()).toEqual(['29', '30', '31', '32', '33', '34', '35', '36', '37', '38']);
    const v2 = fixtures.filter((f) => fixtureGroup(f) === 'v2');
    expect(v2.length).toBeLessThanOrEqual(MAX_FIXTURES_DEFAULT.v2);
    expect(v3.length).toBeLessThanOrEqual(MAX_FIXTURES_DEFAULT.v3);
  });
});

describe('the runner: a v2 --real run does not count v3 cassettes', () => {
  it('--real, all fixtures, default (v2) variant: no cap refusal; the v3 cassettes are left out and named', () => {
    const r = run(['--real']);
    expect(r.status).toBe(2);
    expect(r.stderr).not.toMatch(/more than --max-fixtures/);
    expect(r.stdout).toMatch(/10 v3 fixtures left out \(v2 run\)/);
    // It got as far as the secrets check.
    expect(r.stderr).toContain('GOLDEN_SET_ANTHROPIC_API_KEY');
  });

  it('--real on the cassettes only, v2 variant: no v2 fixture selected, refused', () => {
    const r = run(['--real', '--only', '29,30,31,32,33,34,35,36,37,38']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no v2 fixture selected/);
  });

  it('--real, v3 variant, more than the v3 cap of 10 explicitly refused with --max-fixtures 3', () => {
    const r = run(['--real', '--stub', 'x', '--max-fixtures', '3']);
    // --stub is ignored by --real, so this is a v2 run capped at 3: the cap still guards spend.
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/fixtures selected, more than --max-fixtures 3\. Refusing\./);
  });
});

describe("the report's 'extract' stage row (T-683)", () => {
  const call = (over: Partial<LlmCallObserved>): LlmCallObserved => ({
    stage: 'extract',
    call: 'v3_extract',
    model: 'm',
    effort: 'medium',
    status: 'completed',
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    stop_reason: 'end_turn',
    ...over,
  });

  it('an extract row appears in the per-stage table, between intake and preflight', () => {
    const lines = renderLlmCalls(summariseLlmCalls([call({}), call({ input_tokens: 300 })]));
    const rows = lines.filter((l) => /^\s{2}(intake|extract|preflight|body)\s/.test(l));
    expect(rows.map((l) => l.trim().split(/\s+/)[0])).toEqual([
      'intake',
      'extract',
      'preflight',
      'body',
    ]);
    const extract = rows.find((l) => l.trim().startsWith('extract'))!;
    expect(extract).toContain('calls=2 failed=0');
  });

  it('with no extract call the row says "no calls"', () => {
    const lines = renderLlmCalls(summariseLlmCalls([call({ stage: 'body', call: 'd1' })]));
    expect(lines.find((l) => l.trim().startsWith('extract'))).toMatch(/no calls/);
  });

  it('a degraded call counts as failed, and is left out of the token percentiles', () => {
    const degraded = call({ status: 'degraded' as never, input_tokens: 999, output_tokens: 0 });
    const s = summariseLlmCalls([call({}), degraded]);
    expect(s.stages.extract.calls).toBe(2);
    expect(s.stages.extract.failed).toBe(1);
    expect(s.stages.extract.inputTokens).toEqual({ median: 100, p90: 100 });
    expect(renderLlmCalls(s).find((l) => l.trim().startsWith('extract'))).toContain('failed=1');
  });

  it('a failed call counts as failed too, and extract calls do not leak into intake', () => {
    const s = summariseLlmCalls([
      call({ status: 'failed' }),
      call({ stage: 'intake', call: 'intake_extract' }),
    ]);
    expect(s.stages.extract.failed).toBe(1);
    expect(s.stages.intake.calls).toBe(1);
  });
});
