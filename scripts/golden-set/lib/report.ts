/**
 * T-147e — the readable report (AC8): pass or fail per fixture, each failure
 * as expected / actual with the lines of the draft around it. Never a stack
 * trace. Pure: results in, lines of text out.
 */
import {
  FixtureResult,
  LlmCallObserved,
  LlmCallSummary,
  LlmStageName,
  LlmStageStats,
  Percentiles,
} from './types';

export function renderFixture(r: FixtureResult): string[] {
  const head = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
  const lines = [`${head}  ${r.id}  (${r.pack})  ${r.title}`];
  if (r.skipped) {
    lines.push(`      ${r.skipReason ?? ''}`);
    return lines;
  }
  lines.push(
    `      runId=${r.runId ?? '-'}  intakeId=${r.intakeId ?? '-'}  documentId=${r.documentId ?? '-'}  ledgerId=${r.ledgerId ?? '-'}`,
  );
  lines.push(
    `      tokens in=${r.tokens.inputTokens} out=${r.tokens.outputTokens} calls=${r.tokens.calls} cost=$${r.tokens.costUsd.toFixed(4)}`,
  );
  if (r.passed) return lines;
  lines.push(`      covers: ${r.risk}`);
  r.failures.forEach((f, i) => {
    lines.push(`  ${i + 1}. [${f.kind}]`);
    lines.push(`     - expected: ${f.expected}`);
    lines.push(`     + actual:   ${f.actual}`);
    if (f.why) lines.push(`       why:      ${f.why}`);
    for (const c of f.context ?? []) lines.push(`       ${c}`);
  });
  return lines;
}

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function summarise(results: FixtureResult[]): Summary {
  const ran = results.filter((r) => !r.skipped);
  return {
    total: results.length,
    passed: ran.filter((r) => r.passed).length,
    failed: ran.filter((r) => !r.passed).length,
    skipped: results.length - ran.length,
    inputTokens: ran.reduce((a, r) => a + r.tokens.inputTokens, 0),
    outputTokens: ran.reduce((a, r) => a + r.tokens.outputTokens, 0),
    costUsd: ran.reduce((a, r) => a + r.tokens.costUsd, 0),
  };
}

export function renderSummary(s: Summary): string[] {
  return [
    '',
    `Golden set: ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped, of ${s.total}.`,
    `Tokens: ${s.inputTokens} in, ${s.outputTokens} out. Recorded cost: $${s.costUsd.toFixed(4)}.`,
    s.failed > 0 ? 'RESULT: FAIL' : 'RESULT: PASS',
  ];
}

// ── T-453: per-stage model usage (median / p90 per call, stop reasons, cap hits) ──

const STAGES: readonly LlmStageName[] = ['intake', 'preflight', 'body'];

/** Nearest-rank percentile of an ascending list: the value at rank ceil(q * n). */
function nearestRank(sorted: number[], q: number): number {
  const i = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.min(i, sorted.length - 1)]!;
}

export function percentiles(values: number[]): Percentiles | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { median: nearestRank(sorted, 0.5), p90: nearestRank(sorted, 0.9) };
}

export function summariseLlmCalls(calls: LlmCallObserved[]): LlmCallSummary {
  const stages = {} as Record<LlmStageName, LlmStageStats>;
  for (const stage of STAGES) {
    const mine = calls.filter((c) => c.stage === stage);
    const done = mine.filter((c) => c.status === 'completed');
    const stopReasons: Record<string, number> = {};
    for (const c of mine) {
      const k = c.stop_reason ?? 'none';
      stopReasons[k] = (stopReasons[k] ?? 0) + 1;
    }
    stages[stage] = {
      calls: mine.length,
      failed: mine.length - done.length,
      inputTokens: percentiles(done.map((c) => c.input_tokens)),
      outputTokens: percentiles(done.map((c) => c.output_tokens)),
      stopReasons,
      maxTokensHits: stopReasons.max_tokens ?? 0,
    };
  }
  const capHits = calls
    .filter((c) => c.stop_reason === 'max_tokens')
    .map((c) => ({
      fixtureId: c.fixture_id ?? null,
      stage: c.stage,
      call: c.call,
      outputTokens: c.output_tokens,
    }));
  return { stages, capHits };
}

export function renderLlmCalls(s: LlmCallSummary): string[] {
  const pc = (p: Percentiles | null) => (p ? `${p.median} / ${p.p90}` : '-');
  const lines = ['', 'Model calls per stage (tokens per call, median / p90, completed calls):'];
  for (const stage of STAGES) {
    const st = s.stages[stage];
    if (st.calls === 0) {
      lines.push(`  ${stage.padEnd(9)}  no calls`);
      continue;
    }
    const stops = Object.entries(st.stopReasons)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    lines.push(
      `  ${stage.padEnd(9)}  calls=${st.calls} failed=${st.failed}  in ${pc(st.inputTokens)}  out ${pc(st.outputTokens)}  stop: ${stops}  max_tokens hits=${st.maxTokensHits}`,
    );
  }
  if (s.capHits.length === 0) lines.push('Cap hits (stop_reason max_tokens): none');
  else {
    lines.push(`Cap hits (stop_reason max_tokens): ${s.capHits.length}`);
    for (const h of s.capHits)
      lines.push(
        `  - ${h.fixtureId ?? '(no fixture)'}  ${h.stage}/${h.call}  out=${h.outputTokens}`,
      );
  }
  return lines;
}
