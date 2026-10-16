/**
 * T-453 cost report — rows -> per-draft, per-window and grand totals. Pure.
 *
 * Linking (from the real schema, apps/drafting/src/models):
 * - Generation (body) rows carry documentId, runId and, when the draft came
 *   from an intake, intakeId (ADR-019 §3.7).
 * - LlmAuxCall intake_* rows carry intakeId (required for every purpose but preflight).
 * - LlmAuxCall preflight rows carry only userId and createdAt (T-437).
 *
 * Within a window, rows sharing any documentId, runId or intakeId are one
 * draft (union-find), so revisions of one document and the intake that led to
 * it end up together: that link is exact. A preflight row is attached to a
 * draft only when its user has exactly one draft in the window ('user+window',
 * not exact); otherwise it stays in the window's unattributed preflight list.
 */
import { costForRow } from './rates';
import {
  AuxRow,
  CostSource,
  DraftCost,
  GenerationRow,
  RateTable,
  Report,
  Stage,
  StageMap,
  StageTotals,
  STAGES,
  TokenCounts,
  UnattributedPreflight,
  Window,
  WindowReport,
  WindowRows,
} from './types';

export function emptyStage(): StageTotals {
  return {
    calls: 0,
    failedCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    costInr: 0,
    costSource: 'none',
    unpricedCalls: 0,
    models: [],
  };
}

export function emptyStages(): StageMap {
  return { body: emptyStage(), intake: emptyStage(), preflight: emptyStage() };
}

function combineSource(a: CostSource, b: CostSource): CostSource {
  if (a === 'none') return b;
  if (b === 'none') return a;
  if (a === 'unpriced' || b === 'unpriced') return 'unpriced';
  if (a === b) return a;
  return 'mixed';
}

function addModel(models: string[], m: string | null): void {
  if (m && !models.includes(m)) models.push(m);
}

type PricedRow = TokenCounts & {
  costUsd: number | null;
  costStatus: string | null;
  aiModel: string | null;
  status: string | null;
};

/** Adds one row into a stage's totals (mutates `s`). Returns the model when it was unpriced. */
export function addRow(
  s: StageTotals,
  row: PricedRow,
  rates: RateTable,
  usdInr: number,
): string | null {
  const cost = costForRow(row, rates);
  s.calls += 1;
  if (row.status === 'failed') s.failedCalls += 1;
  s.inputTokens += row.inputTokens;
  s.outputTokens += row.outputTokens;
  s.cacheWriteTokens += row.cacheCreationInputTokens;
  s.cacheReadTokens += row.cacheReadInputTokens;
  s.costUsd += cost.usd;
  s.costInr = s.costUsd * usdInr;
  s.costSource = combineSource(s.costSource, cost.source);
  if (cost.source === 'unpriced') s.unpricedCalls += 1;
  addModel(s.models, row.aiModel);
  return cost.source === 'unpriced' ? (row.aiModel ?? '(no model on row)') : null;
}

/** Sums stage totals into `into` (mutates it). */
export function mergeStage(into: StageTotals, from: StageTotals, usdInr: number): void {
  into.calls += from.calls;
  into.failedCalls += from.failedCalls;
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  into.cacheWriteTokens += from.cacheWriteTokens;
  into.cacheReadTokens += from.cacheReadTokens;
  into.costUsd += from.costUsd;
  into.costInr = into.costUsd * usdInr;
  into.costSource = combineSource(into.costSource, from.costSource);
  into.unpricedCalls += from.unpricedCalls;
  for (const m of from.models) addModel(into.models, m);
}

export function stagesTotalUsd(s: StageMap): number {
  return STAGES.reduce((sum, k) => sum + s[k].costUsd, 0);
}

/** Which stage an aux row belongs to, by purpose. Unknown purposes count as intake. */
export function auxStage(row: AuxRow): Stage {
  return row.purpose === 'preflight' ? 'preflight' : 'intake';
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    while (p !== this.parent.get(p)) p = this.parent.get(p)!;
    // path compression
    let c = x;
    while (c !== p) {
      const next = this.parent.get(c)!;
      this.parent.set(c, p);
      c = next;
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function generationKeys(g: GenerationRow): string[] {
  const keys: string[] = [];
  if (g.documentId) keys.push(`doc:${g.documentId}`);
  if (g.runId) keys.push(`run:${g.runId}`);
  if (g.intakeId) keys.push(`intake:${g.intakeId}`);
  if (keys.length === 0) keys.push(`gen:${g.id}`);
  return keys;
}

interface Group {
  generations: GenerationRow[];
  intake: AuxRow[];
  preflight: AuxRow[];
}

function pushUnique(list: string[], v: string | null): void {
  if (v && !list.includes(v)) list.push(v);
}

function timeBounds(rows: Array<{ createdAt: Date | null }>): {
  firstAt: string | null;
  lastAt: string | null;
} {
  const times = rows
    .map((r) => r.createdAt?.getTime())
    .filter((t): t is number => typeof t === 'number');
  if (times.length === 0) return { firstAt: null, lastAt: null };
  return {
    firstAt: new Date(Math.min(...times)).toISOString(),
    lastAt: new Date(Math.max(...times)).toISOString(),
  };
}

function draftFromGroup(
  g: Group,
  rates: RateTable,
  usdInr: number,
  unpriced: Set<string>,
): DraftCost {
  const stages = emptyStages();
  const note = (m: string | null): void => {
    if (m) unpriced.add(m);
  };
  for (const r of g.generations) note(addRow(stages.body, r, rates, usdInr));
  for (const r of g.intake) note(addRow(stages.intake, r, rates, usdInr));
  for (const r of g.preflight) note(addRow(stages.preflight, r, rates, usdInr));

  const documentIds: string[] = [];
  const intakeIds: string[] = [];
  const runIds: string[] = [];
  const userIds: string[] = [];
  const docTypes: string[] = [];
  for (const r of g.generations) {
    pushUnique(documentIds, r.documentId);
    pushUnique(intakeIds, r.intakeId);
    pushUnique(runIds, r.runId);
    pushUnique(userIds, r.userId);
    pushUnique(docTypes, r.docType);
  }
  for (const r of [...g.intake, ...g.preflight]) {
    pushUnique(intakeIds, r.intakeId);
    pushUnique(userIds, r.userId);
  }
  const linkage =
    g.generations.length === 0
      ? 'intake-only'
      : g.intake.length === 0 && intakeIds.length === 0
        ? 'body-only'
        : 'exact';
  const totalUsd = stagesTotalUsd(stages);
  return {
    documentIds,
    intakeIds,
    runIds,
    userIds,
    docTypes,
    inkClasses: [],
    revisions: g.generations.filter((r) => r.runType === 'revision').length,
    linkage,
    preflight: g.preflight.length > 0 ? 'user+window' : 'none',
    ...timeBounds([...g.generations, ...g.intake, ...g.preflight]),
    stages,
    totalUsd,
    totalInr: totalUsd * usdInr,
  };
}

/** Builds one window's report. `unpriced` collects models that had no rate (mutated). */
export function buildWindow(
  input: WindowRows,
  rates: RateTable,
  usdInr: number,
  unpriced: Set<string> = new Set(),
): WindowReport {
  const uf = new UnionFind();
  for (const g of input.generations) {
    const keys = generationKeys(g);
    for (const k of keys.slice(1)) uf.union(keys[0], k);
    uf.find(keys[0]);
  }
  const intakeRows = input.aux.filter((r) => auxStage(r) === 'intake');
  const preflightRows = input.aux.filter((r) => auxStage(r) === 'preflight');

  const groups = new Map<string, Group>();
  const groupOf = (key: string): Group => {
    const root = uf.find(key);
    let grp = groups.get(root);
    if (!grp) {
      grp = { generations: [], intake: [], preflight: [] };
      groups.set(root, grp);
    }
    return grp;
  };
  for (const g of input.generations) groupOf(generationKeys(g)[0]).generations.push(g);
  // An intake row with no intakeId (should not happen) stands alone by its own id.
  for (const r of intakeRows)
    groupOf(r.intakeId ? `intake:${r.intakeId}` : `aux:${r.id}`).intake.push(r);

  // Preflight: attach only when the user has exactly one draft in the window.
  const draftsByUser = new Map<string, Group[]>();
  for (const grp of groups.values()) {
    const users = new Set<string>();
    for (const r of [...grp.generations, ...grp.intake]) if (r.userId) users.add(r.userId);
    for (const u of users) {
      const list = draftsByUser.get(u) ?? [];
      list.push(grp);
      draftsByUser.set(u, list);
    }
  }
  const unattributedRows = new Map<string, AuxRow[]>();
  for (const r of preflightRows) {
    const candidates = r.userId ? (draftsByUser.get(r.userId) ?? []) : [];
    if (candidates.length === 1) {
      candidates[0].preflight.push(r);
    } else {
      const k = r.userId ?? '';
      const list = unattributedRows.get(k) ?? [];
      list.push(r);
      unattributedRows.set(k, list);
    }
  }

  const drafts = [...groups.values()]
    .map((g) => draftFromGroup(g, rates, usdInr, unpriced))
    .sort((a, b) => (a.firstAt ?? '').localeCompare(b.firstAt ?? ''));

  const unattributedPreflight: UnattributedPreflight[] = [...unattributedRows.entries()].map(
    ([userId, rows]) => {
      const stage = emptyStage();
      for (const r of rows) {
        const m = addRow(stage, r, rates, usdInr);
        if (m) unpriced.add(m);
      }
      return {
        userId: userId || null,
        candidateDrafts: userId ? (draftsByUser.get(userId)?.length ?? 0) : 0,
        stage,
      };
    },
  );

  const totals = emptyStages();
  for (const d of drafts) for (const k of STAGES) mergeStage(totals[k], d.stages[k], usdInr);
  for (const u of unattributedPreflight) mergeStage(totals.preflight, u.stage, usdInr);
  const totalUsd = stagesTotalUsd(totals);

  return {
    label: input.window.label,
    start: input.window.start.toISOString(),
    end: input.window.end.toISOString(),
    drafts,
    unattributedPreflight,
    totals,
    totalUsd,
    totalInr: totalUsd * usdInr,
  };
}

export function overlappingWindows(windows: Window[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i];
      const b = windows[j];
      if (a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()) {
        out.push([a.label, b.label]);
      }
    }
  }
  return out;
}

export interface BuildReportInput {
  windows: WindowRows[];
  rates: RateTable;
  usdInr: number;
  usdInrFallback: boolean;
  includeFixtures: boolean;
  userFilter: string | null;
}

export function buildReport(input: BuildReportInput): Report {
  const unpriced = new Set<string>();
  const windows = input.windows.map((w) => buildWindow(w, input.rates, input.usdInr, unpriced));
  const grandTotals = emptyStages();
  for (const w of windows)
    for (const k of STAGES) mergeStage(grandTotals[k], w.totals[k], input.usdInr);
  const grandTotalUsd = stagesTotalUsd(grandTotals);
  const overlaps = overlappingWindows(input.windows.map((w) => w.window));

  const notes: string[] = [
    'Body, intake and revisions are linked exactly by documentId / runId / intakeId as written by the service.',
    'Preflight rows carry no draft id: one is attached to a draft only when its user had exactly one draft in the window (preflight=user+window); otherwise it is listed as unattributed preflight for the window.',
    'Ink class is not recorded on Generation or LlmAuxCall rows; no class is shown.',
    'INR = USD x finance.usd_inr as read now (rows store USD only).',
  ];
  if (input.usdInrFallback)
    notes.push('finance.usd_inr is unset or invalid: 85 used (the service fallback).');
  if (unpriced.size > 0) {
    notes.push(
      `No ai.rates entry for: ${[...unpriced].sort().join(', ')}. Rows of these models without a recorded cost count as 0 USD.`,
    );
  }
  if (overlaps.length > 0) {
    notes.push(
      `Overlapping windows (${overlaps.map(([a, b]) => `${a}/${b}`).join(', ')}): their rows count in each, so the grand total double-counts them.`,
    );
  }
  if (!input.includeFixtures) notes.push("Golden-set rows (origin 'fixture') are left out.");

  return {
    usdInr: input.usdInr,
    usdInrFallback: input.usdInrFallback,
    missingRates: [...unpriced].sort(),
    includeFixtures: input.includeFixtures,
    userFilter: input.userFilter,
    windows,
    overlappingWindows: overlaps,
    grandTotals,
    grandTotalUsd,
    grandTotalInr: grandTotalUsd * input.usdInr,
    notes,
  };
}
