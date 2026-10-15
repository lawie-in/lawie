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
import { purposeOf, stubEvents, stubParsedMessage, systemText } from '../lib/modules';
import { Fixture, RunEvidence, SEEDED_PACKS } from '../lib/types';
import * as dp from '../../../apps/drafting/src/services/drafter.prompts';

const fixtures = loadFixtures();

function evidence(over: Partial<RunEvidence> = {}): RunEvidence {
  return {
    fixtureId: 'x',
    runId: 'run-abc',
    intakeId: 'i',
    documentId: 'd',
    ledgerId: 'l',
    pipelineError: null,
    deliveredText:
      '1. That Testpal Yadav is in custody.\n\n2. That the applicant is gainfully employed.',
    ledger: null,
    factDiffs: [],
    missingClauses: [],
    banner: false,
    tokens: { inputTokens: 10, outputTokens: 5, costUsd: 0.01, calls: 3 },
    extraction: [],
    isolation: { ok: true, problems: [] },
    ...over,
  };
}
const fx = (): Fixture => ({
  ...fixtures[0],
  expect: {
    absent: [{ any_of: ['gainfully employed'], why: 'invented' }],
    present: [{ any_of: ['Hazratganj'], why: 'station given' }],
    exact: [{ any_of: ['Testpal Yadav'], why: 'name' }],
  },
});

describe('composition (AC3)', () => {
  it('has at least 15 fixtures on the seeded packs and every pack is used', () => {
    expect(checkComposition(fixtures)).toEqual([]);
    expect(
      fixtures.filter((f) => (SEEDED_PACKS as readonly string[]).includes(f.pack)).length,
    ).toBeGreaterThanOrEqual(15);
    for (const p of SEEDED_PACKS) expect(fixtures.some((f) => f.pack === p)).toBe(true);
  });
  it('reports a short or missing pack', () => {
    const problems = checkComposition(
      fixtures.filter((f) => f.pack !== 'default_bail').slice(0, 10),
    );
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
    const v = {
      check: 'banned' as const,
      entityType: 'phrase',
      ledgerKey: null,
      label: 'L',
      bannedEntryId: 'gainfully_employed',
      draftValue: 'gainfully employed',
      ledgerValue: null,
      resolution: 'stripped',
      phase: 'initial' as const,
      paragraphIndex: 1,
    };
    const base = { ...fx(), expect: { absent: [{ any_of: ['zzz'], why: 'w' }] } };
    expect(evaluate(base, evidence({ factDiffs: [v] })).passed).toBe(false);
    const allowed = {
      ...base,
      expect: {
        ...base.expect,
        allow_violations: [
          { check: 'banned' as const, bannedEntryId: 'gainfully_employed', why: 'ticketed' },
        ],
      },
    };
    expect(evaluate(allowed, evidence({ factDiffs: [v] })).passed).toBe(true);
    expect(
      evaluate(base, evidence({ isolation: { ok: false, problems: ['row not fixture'] } }))
        .failures[0].kind,
    ).toBe('isolation');
    expect(
      evaluate(base, evidence({ deliveredText: null, pipelineError: 'no draft' })).failures[0].kind,
    ).toBe('pipeline');
  });
  it('summary counts passed, failed and skipped', () => {
    const s = summarise([evaluate(fx(), evidence()), skipped(fx(), 'no replies')]);
    expect(s).toMatchObject({ total: 2, failed: 1, skipped: 1, passed: 0 });
    expect(renderSummary(s).join('\n')).toContain('RESULT: FAIL');
  });
});

describe('assert: the rendered expectation (T-373, ADR-025 D1)', () => {
  const base = (): Fixture => ({ ...fx(), expect: { rendered: { why: 'D1 renders it' } } });
  const list = (
    rows: Array<{ clauseId: string; status: 'ok' | 'missing' | 'fallback'; reason?: string }>,
  ) => rows;

  it('rendered expected but absent from the evidence fails: the draft took the legacy path', () => {
    const r = evaluate(base(), evidence());
    expect(r.passed).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].kind).toBe('rendered');
    expect(r.failures[0].actual).toMatch(/legacy path/);
    expect(r.failures[0].why).toBe('D1 renders it');
  });
  it('no expectation, no check: a legacy draft with no rendered[] is not failed by this', () => {
    const r = evaluate(
      { ...fx(), expect: { present: [{ any_of: ['Testpal'], why: 'w' }] } },
      evidence(),
    );
    expect(r.passed).toBe(true);
  });
  it('no_status: a clause with a banned status fails and is named with its reason', () => {
    const f = { ...base(), expect: { rendered: { no_status: ['fallback' as const], why: 'w' } } };
    const bad = evaluate(
      f,
      evidence({
        rendered: list([
          { clauseId: 'a', status: 'ok' },
          { clauseId: 'grounds', status: 'fallback', reason: 'unverified' },
        ]),
      }),
    );
    expect(bad.passed).toBe(false);
    expect(bad.failures[0].kind).toBe('rendered');
    expect(bad.failures[0].expected).toBe('no clause rendered with status fallback');
    expect(bad.failures[0].actual).toBe('grounds=fallback (unverified)');
    // a different status is fine, and an empty list is fine
    expect(
      evaluate(f, evidence({ rendered: list([{ clauseId: 'a', status: 'missing' }]) })).passed,
    ).toBe(true);
    expect(evaluate(f, evidence({ rendered: [] })).passed).toBe(true);
  });
  it('status: a clause must carry exactly that status; a clause not rendered at all fails too', () => {
    const f = {
      ...base(),
      expect: {
        rendered: { status: { antecedents: 'missing' as const, grounds: 'ok' as const }, why: 'w' },
      },
    };
    expect(
      evaluate(
        f,
        evidence({
          rendered: list([
            { clauseId: 'antecedents', status: 'missing' },
            { clauseId: 'grounds', status: 'ok' },
          ]),
        }),
      ).passed,
    ).toBe(true);
    const wrong = evaluate(
      f,
      evidence({
        rendered: list([
          { clauseId: 'antecedents', status: 'ok' },
          { clauseId: 'grounds', status: 'ok' },
        ]),
      }),
    );
    expect(wrong.failures.map((x) => x.expected)).toEqual([
      'clause antecedents rendered with status missing',
    ]);
    expect(wrong.failures[0].actual).toBe('antecedents=ok');
    const absent = evaluate(
      f,
      evidence({ rendered: list([{ clauseId: 'antecedents', status: 'missing' }]) }),
    );
    expect(absent.failures).toHaveLength(1);
    expect(absent.failures[0].actual).toBe('clause grounds not rendered');
  });
  it('not_rendered: a clause for a fact never given must not appear', () => {
    const f = { ...base(), expect: { rendered: { not_rendered: ['sureties'], why: 'w' } } };
    expect(
      evaluate(f, evidence({ rendered: list([{ clauseId: 'grounds', status: 'ok' }]) })).passed,
    ).toBe(true);
    const bad = evaluate(f, evidence({ rendered: list([{ clauseId: 'sureties', status: 'ok' }]) }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0].actual).toBe('rendered: sureties=ok');
  });
  it('an entry with no clauseId fails on its own', () => {
    const bad = evaluate(base(), evidence({ rendered: [{ clauseId: '', status: 'ok' }] }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0].expected).toBe('every rendered paragraph has a clauseId');
  });
  it('the report prints a rendered failure as expected / actual / why', () => {
    const f = {
      ...base(),
      expect: { rendered: { no_status: ['fallback' as const], why: 'because' } },
    };
    const text = renderFixture(
      evaluate(f, evidence({ rendered: list([{ clauseId: 'g', status: 'fallback' }]) })),
    ).join('\n');
    expect(text).toContain('[rendered]');
    expect(text).toContain('- expected: no clause rendered with status fallback');
    expect(text).toContain('+ actual:   g=fallback');
    expect(text).toContain('why:      because');
  });
});

describe('the parse stub (T-373): messages.parse answered from the recorded reply', () => {
  it("hands the reply to the request's own parser and returns parsed_output", () => {
    const seen: string[] = [];
    const m = stubParsedMessage('{"a":1}', {
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      output_config: {
        format: {
          parse: (c: string) => {
            seen.push(c);
            return { got: JSON.parse(c) };
          },
        },
      },
    } as never) as {
      parsed_output: unknown;
      content: Array<{ text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    expect(seen).toEqual(['{"a":1}']);
    expect(m.parsed_output).toEqual({ got: { a: 1 } });
    expect(m.content[0].text).toBe('{"a":1}');
    expect(m.usage.input_tokens).toBeGreaterThan(0);
    expect(m.usage.output_tokens).toBeGreaterThan(0);
  });
  it('without a parser it falls back to JSON.parse; prose gives a null parsed_output', () => {
    const p = { system: 's', messages: [{ role: 'user', content: 'u' }] } as never;
    expect((stubParsedMessage('{"x":2}', p) as { parsed_output: unknown }).parsed_output).toEqual({
      x: 2,
    });
    expect(
      (stubParsedMessage('1. That the applicant is in custody.', p) as { parsed_output: unknown })
        .parsed_output,
    ).toBeNull();
  });
  it('a throwing parser (malformed recording) propagates, as the SDK would', () => {
    const params = {
      system: 's',
      messages: [],
      output_config: {
        format: {
          parse: () => {
            throw new Error('bad json');
          },
        },
      },
    } as never;
    expect(() => stubParsedMessage('x', params)).toThrow('bad json');
  });
  it('purposeOf tells the D1 system prompt from the others', () => {
    expect(typeof dp.DRAFTER_D1_SYSTEM_PROMPT).toBe('string');
    expect(dp.DRAFTER_D1_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(purposeOf(dp.DRAFTER_D1_SYSTEM_PROMPT)).toBe('drafter');
    expect(purposeOf(dp.DRAFTER_FACT_REPAIR_SYSTEM_PROMPT)).toBe('fact_repair');
    expect(purposeOf('something else')).toBe('other');
  });
});

describe('system as text blocks (T-437): the fake reads string and block-array alike', () => {
  const blocks = [
    {
      type: 'text' as const,
      text: dp.DRAFTER_D1_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];
  const messages = [{ role: 'user', content: 'hello there' }];
  const inputOf = (events: unknown[]) =>
    (events[0] as { message: { usage: { input_tokens: number } } }).message.usage.input_tokens;

  it('systemText returns a string as is and joins the blocks text', () => {
    expect(systemText('plain')).toBe('plain');
    expect(
      systemText([
        { type: 'text', text: 'abc' },
        { type: 'text', text: 'def', cache_control: { type: 'ephemeral' } },
      ]),
    ).toBe('abcdef');
    expect(systemText([])).toBe('');
  });
  it('a D1 request with a block-array system is classified drafter', () => {
    expect(purposeOf(systemText(blocks))).toBe('drafter');
    expect(purposeOf(systemText(blocks))).toBe(purposeOf(dp.DRAFTER_D1_SYSTEM_PROMPT));
  });
  it('stubEvents estimates the same numeric input tokens for blocks as for the string', () => {
    const fromString = inputOf(
      stubEvents('x', { model: 'm', max_tokens: 1, system: dp.DRAFTER_D1_SYSTEM_PROMPT, messages }),
    );
    const fromBlocks = inputOf(
      stubEvents('x', { model: 'm', max_tokens: 1, system: blocks, messages }),
    );
    expect(typeof fromBlocks).toBe('number');
    expect(Number.isNaN(fromBlocks)).toBe(false);
    expect(fromBlocks).toBe(fromString);
  });
  it('stubParsedMessage estimates the same numeric input tokens for blocks as for the string', () => {
    type Msg = { usage: Record<string, unknown> };
    const s = stubParsedMessage('{"a":1}', {
      system: dp.DRAFTER_D1_SYSTEM_PROMPT,
      messages,
    } as never) as Msg;
    const b = stubParsedMessage('{"a":1}', { system: blocks, messages } as never) as Msg;
    expect(typeof b.usage.input_tokens).toBe('number');
    expect(b.usage.input_tokens).toBe(s.usage.input_tokens);
  });
  it('the stub reports no cached usage fields', () => {
    const ev = stubEvents('x', { model: 'm', max_tokens: 1, system: blocks, messages });
    const usages = [
      (ev[0] as { message: { usage: object } }).message.usage,
      (stubParsedMessage('{"a":1}', { system: blocks, messages } as never) as { usage: object })
        .usage,
    ];
    for (const u of usages) {
      expect(u).not.toHaveProperty('cache_creation_input_tokens');
      expect(u).not.toHaveProperty('cache_read_input_tokens');
    }
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
  it('T-373: the count caps are 30 by default and 40 hard (the 25 fixtures fit under the default)', () => {
    expect(RUN_LIMITS.maxFixturesDefault).toBe(30);
    expect(RUN_LIMITS.maxFixturesHard).toBe(40);
    expect(fixtures.length).toBeLessThanOrEqual(RUN_LIMITS.maxFixturesDefault);
  });
});

describe('the runner', () => {
  const DRAFTING = join(__dirname, '..', '..', '..', 'apps', 'drafting');
  const RUN = join(__dirname, '..', 'run.ts');
  function run(args: string[]) {
    // No GOLDEN_SET_* in the env, whatever the parent has.
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
    return spawnSync('npx', ['ts-node', '--transpile-only', RUN, ...args], {
      cwd: DRAFTING,
      env,
      encoding: 'utf-8',
      timeout: 240_000,
    });
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

  it('dry run: 1a and 1b pass (1a is D1 now); runId recorded', () => {
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const clean = run(['--dry-run', '--only', '1a,1b', '--out', out]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).toMatch(/PASS {2}1a-t147-regular-bail/);
    expect(clean.stdout).toMatch(/PASS {2}1b-/);
    const file = readdirSync(out).find((n) => n.endsWith('-dry.json'))!;
    const saved = JSON.parse(readFileSync(join(out, file), 'utf-8')) as {
      results: Array<{ id: string; runId: string | null }>;
    };
    for (const r of saved.results) expect(r.runId).toBeTruthy();
  }, 300_000);

  it('--stub t147 (an invented-averment prose run) still fails the gate for 1a: exit 1, FAIL, a readable diff', () => {
    // 1a is a D1 pack now: the prose recording is no draft the structured call can read, so the
    // gate fails at the pipeline, not on the four banned ids. What matters is that it fails.
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const stub = run(['--dry-run', '--stub', 't147', '--only', '1a', '--out', out]);
    expect(stub.status).toBe(1);
    expect(stub.stdout).toMatch(/FAIL {2}1a-t147-regular-bail/);
    expect(stub.stdout).toContain('RESULT: FAIL');
    expect(stub.stdout).toContain('- expected:');
    expect(stub.stdout).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)/);
  }, 300_000);

  it('--stub run3 makes 22, 23 and 24 fail with rendered fallback failures', () => {
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const r = run(['--dry-run', '--stub', 'run3', '--only', '22,23,24', '--out', out]);
    expect(r.status).toBe(1);
    for (const id of [
      '22-run3-magistrate-bail-lucknow',
      '23-run3-regular-bail-patna',
      '24-run3-anticipatory-bail-gaya',
    ]) {
      expect(r.stdout).toMatch(new RegExp(`FAIL {2}${id}`));
    }
    expect(r.stdout.match(/\[rendered\]/g)?.length).toBeGreaterThanOrEqual(6);
    expect(r.stdout).toContain('expected: no clause rendered with status fallback');
    expect(r.stdout).toMatch(/grounds=fallback/);
    expect(r.stdout).toMatch(/further_grounds=fallback/);
    expect(r.stdout).toMatch(/apprehension=fallback/);
    expect(r.stdout).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)/);
  }, 300_000);

  it('the clean replies of 22 to 25 pass in a dry run', () => {
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const r = run(['--dry-run', '--only', '22,23,24,25', '--out', out]);
    expect(r.stdout).toMatch(/PASS {2}22-/);
    expect(r.stdout).toMatch(/PASS {2}25-/);
    expect(r.status).toBe(0);
  }, 300_000);

  it('cost.ts in the runner: a dry run never refuses on the fixture count', () => {
    const out = mkdtempSync(join(tmpdir(), 'golden-'));
    const r = run(['--dry-run', '--max-fixtures', '1', '--only', '1a,1b', '--out', out]);
    expect(r.stderr).not.toMatch(/Refusing|more than --max-fixtures/);
    expect(r.status).toBe(0);
  }, 300_000);

  it('cost.ts in the runner: --real refuses more fixtures than --max-fixtures (before the secrets are looked at) and above the hard cap', () => {
    const over = run(['--real', '--max-fixtures', '1', '--only', '1a,1b']);
    expect(over.status).toBe(2);
    expect(over.stderr).toMatch(/2 fixtures selected, more than --max-fixtures 1\. Refusing\./);
    const hard = run(['--real', '--max-fixtures', '41']);
    expect(hard.status).toBe(2);
    expect(hard.stderr).toContain('--max-fixtures is capped at 40');
    // within the cap the refusal is for the missing secrets, not the count
    const within = run(['--real', '--max-fixtures', '2', '--only', '1a,1b']);
    expect(within.status).toBe(2);
    expect(within.stderr).not.toMatch(/Refusing/);
    expect(within.stderr).toContain('GOLDEN_SET_ANTHROPIC_API_KEY');
  }, 300_000);
});
