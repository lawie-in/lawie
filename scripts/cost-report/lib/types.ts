/**
 * T-453 cost report — the shapes the pure functions work on. Every field is an
 * id, a number, a model id, a time or a status. No text a user wrote, no
 * names, no contact details: main.ts never selects them (see PROJECTIONS).
 */

/** A time window from `--window "label=<ISO start>/<ISO end>"`. `end` is exclusive. */
export interface Window {
  label: string;
  start: Date;
  end: Date;
}

/** Token counts as recorded on a Generation or LlmAuxCall row. */
export interface TokenCounts {
  /** Uncached input only (T-437). */
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache writes, all TTLs. */
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** The 5-minute part of cacheCreationInputTokens, when the API reported the split. */
  cacheCreation5mInputTokens: number;
}

/** One Generation row (the body meter, documents.routes.ts recordGeneration). */
export interface GenerationRow extends TokenCounts {
  id: string;
  userId: string | null;
  documentId: string | null;
  intakeId: string | null;
  runId: string | null;
  runSequence: number | null;
  runType: string | null;
  runOrigin: string | null;
  status: string | null;
  docType: string | null;
  aiModel: string | null;
  costUsd: number | null;
  costStatus: string | null;
  createdAt: Date | null;
}

/** One LlmAuxCall row (intake_* via recordAuxCall, or preflight). */
export interface AuxRow extends TokenCounts {
  id: string;
  userId: string | null;
  intakeId: string | null;
  purpose: string | null;
  status: string | null;
  aiModel: string | null;
  costUsd: number | null;
  costStatus: string | null;
  /** On LlmAuxCall, `runType` is the run origin ('user' | 'fixture'). */
  runType: string | null;
  createdAt: Date | null;
}

/** USD per million tokens, from AppSetting `ai.rates.<model-slug>`. */
export interface ModelRate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheWriteUsdPerMTok?: number;
  cacheReadUsdPerMTok?: number;
}

/** Rates keyed by model slug (see modelSlug in lib/rates.ts). */
export type RateTable = Record<string, ModelRate>;

export type Stage = 'body' | 'intake' | 'preflight';
export const STAGES: readonly Stage[] = ['body', 'intake', 'preflight'];

/**
 * Where a stage's cost came from:
 * - recorded: every row carried a priced costUsd;
 * - computed: every row was re-priced from tokens with AppSettings ai.rates;
 * - mixed: some of each;
 * - unpriced: at least one row had no recorded cost and no rate for its model
 *   (those rows count as 0 USD; see unpricedCalls);
 * - none: no rows.
 */
export type CostSource = 'recorded' | 'computed' | 'mixed' | 'unpriced' | 'none';

export interface StageTotals {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  costInr: number;
  costSource: CostSource;
  /** Rows with no recorded cost and no configured rate: priced at 0. */
  unpricedCalls: number;
  models: string[];
}

export type StageMap = Record<Stage, StageTotals>;

/**
 * How a draft's rows were tied together:
 * - exact: body and intake rows share documentId / runId / intakeId as written by the service;
 * - intake-only: intake rows with no Generation row in the window (no draft was generated);
 * - body-only: Generation rows with no intakeId (no intake ran, or a pre-ADR-019 row);
 * Preflight rows carry no intakeId or documentId; `preflight` says how they were placed.
 */
export type DraftLinkage = 'exact' | 'intake-only' | 'body-only';

/**
 * - none: no preflight rows attached;
 * - user+window: attached because this was the user's only draft in the window (not exact).
 */
export type PreflightLinkage = 'none' | 'user+window';

export interface DraftCost {
  documentIds: string[];
  intakeIds: string[];
  runIds: string[];
  userIds: string[];
  docTypes: string[];
  /** Ink class. No row carries one today; always empty until the schema has it. */
  inkClasses: string[];
  revisions: number;
  linkage: DraftLinkage;
  preflight: PreflightLinkage;
  firstAt: string | null;
  lastAt: string | null;
  stages: StageMap;
  totalUsd: number;
  totalInr: number;
}

/** Preflight rows of one user in a window that could not be tied to a single draft. */
export interface UnattributedPreflight {
  userId: string | null;
  /** How many drafts this user had in the window (0 or 2+). */
  candidateDrafts: number;
  stage: StageTotals;
}

export interface WindowReport {
  label: string;
  start: string;
  end: string;
  drafts: DraftCost[];
  unattributedPreflight: UnattributedPreflight[];
  totals: StageMap;
  totalUsd: number;
  totalInr: number;
}

export interface Report {
  usdInr: number;
  /** True when finance.usd_inr was unset or invalid and 85 was used (the service's fallback). */
  usdInrFallback: boolean;
  /** Models seen on rows that needed re-pricing but have no ai.rates entry. */
  missingRates: string[];
  includeFixtures: boolean;
  userFilter: string | null;
  windows: WindowReport[];
  /** Pairs of window labels that overlap: their rows count in both, so the grand total double-counts them. */
  overlappingWindows: Array<[string, string]>;
  grandTotals: StageMap;
  grandTotalUsd: number;
  grandTotalInr: number;
  notes: string[];
}

/** Rows fetched for one window. */
export interface WindowRows {
  window: Window;
  generations: GenerationRow[];
  aux: AuxRow[];
}
