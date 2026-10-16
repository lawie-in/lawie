/**
 * T-453 cost report — the text form of a Report. Pure. Ids and numbers only.
 * (--json prints the Report object itself.)
 */
import { DraftCost, Report, StageMap, StageTotals, STAGES } from './types';

export function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function inr(n: number): string {
  return `Rs ${n.toFixed(2)}`;
}

function list(xs: string[]): string {
  return xs.length > 0 ? xs.join(',') : '-';
}

export function renderStage(name: string, s: StageTotals): string {
  if (s.calls === 0) return `    ${name.padEnd(9)} -`;
  const extra: string[] = [];
  if (s.failedCalls > 0) extra.push(`failed=${s.failedCalls}`);
  if (s.unpricedCalls > 0) extra.push(`unpriced=${s.unpricedCalls}`);
  return (
    `    ${name.padEnd(9)} calls=${s.calls} in=${s.inputTokens} out=${s.outputTokens} ` +
    `cacheW=${s.cacheWriteTokens} cacheR=${s.cacheReadTokens} ` +
    `${usd(s.costUsd)} ${inr(s.costInr)} [${s.costSource}] models=${list(s.models)}` +
    (extra.length > 0 ? ` ${extra.join(' ')}` : '')
  );
}

function renderStages(s: StageMap): string[] {
  return STAGES.map((k) => renderStage(k, s[k]));
}

function renderDraft(d: DraftCost, i: number): string[] {
  return [
    `  draft ${i + 1}: documentId=${list(d.documentIds)} intakeId=${list(d.intakeIds)} ` +
      `runId=${list(d.runIds)} userId=${list(d.userIds)}`,
    `    docType=${list(d.docTypes)} class=${list(d.inkClasses)} revisions=${d.revisions} ` +
      `linkage=${d.linkage} preflight=${d.preflight} first=${d.firstAt ?? '-'} last=${d.lastAt ?? '-'}`,
    ...renderStages(d.stages),
    `    TOTAL     ${usd(d.totalUsd)} ${inr(d.totalInr)}`,
  ];
}

export function renderText(r: Report): string {
  const out: string[] = [];
  out.push(
    `Cost report  usd_inr=${r.usdInr}${r.usdInrFallback ? ' (fallback)' : ''}  ` +
      `user=${r.userFilter ?? 'all'}  fixtures=${r.includeFixtures ? 'included' : 'excluded'}`,
  );
  for (const w of r.windows) {
    out.push('');
    out.push(`== window ${w.label}  ${w.start} -> ${w.end}  drafts=${w.drafts.length}`);
    w.drafts.forEach((d, i) => out.push(...renderDraft(d, i)));
    for (const u of w.unattributedPreflight) {
      out.push(
        `  unattributed preflight: userId=${u.userId ?? '-'} (user had ${u.candidateDrafts} drafts in window)`,
      );
      out.push(renderStage('preflight', u.stage));
    }
    out.push(`  window ${w.label} total:`);
    out.push(...renderStages(w.totals));
    out.push(`    TOTAL     ${usd(w.totalUsd)} ${inr(w.totalInr)}`);
  }
  out.push('');
  out.push('== grand total');
  out.push(...renderStages(r.grandTotals));
  out.push(`    TOTAL     ${usd(r.grandTotalUsd)} ${inr(r.grandTotalInr)}`);
  out.push('');
  out.push('Notes:');
  for (const n of r.notes) out.push(`  - ${n}`);
  return out.join('\n');
}
