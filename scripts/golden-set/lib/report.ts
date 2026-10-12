/**
 * T-147e — the readable report (AC8): pass or fail per fixture, each failure
 * as expected / actual with the lines of the draft around it. Never a stack
 * trace. Pure: results in, lines of text out.
 */
import { FixtureResult } from './types';

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
