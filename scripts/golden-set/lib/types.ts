/**
 * T-147e — the golden set's types. Pure: nothing here imports the drafting
 * app, so these modules can be unit-tested with no database and no env.
 */

/**
 * The five packs the averment lists were seeded for (T-147c), plus the
 * Magistrate bail pack, the fourth pack on a signed skeleton (T-373, ADR-025 D1).
 * The rent agreement of fixture 1c is not a seeded pack.
 */
export const SEEDED_PACKS = [
  'bail_regular',
  'legal_notice_s138',
  'bail_anticipatory',
  'maintenance_bnss_144',
  'default_bail',
  'bail_before_magistrate',
] as const;

/** A clause's status as the renderer printed it (draft-renderer.ts `ClauseStatus`). */
export type RenderedStatus = 'ok' | 'missing' | 'fallback';

export const REVIEW_STATUS = "drafted by dev from Anushka's reports, not yet reviewed by Anushka";

export type VerifierCheck = 'unsupported' | 'dropped' | 'mutation' | 'banned';

/** A text that must, or must not, be in the delivered document. */
export interface TextExpectation {
  /** Any one of these satisfies the expectation. */
  any_of: string[];
  /** Why the fixture asserts it, in plain words. Printed with a failure. */
  why: string;
}

/** What the intake must have read into the ledger. Also the ground truth for `--calibrate`. */
export interface LedgerExpectation {
  key: string;
  /**
   * The display the ledger must hold, compared after folding (case, spacing).
   * Omit with `unresolved: true`.
   */
  display?: string;
  /** True when the advocate's words do not give a value and the ledger must hold the key as unresolved. */
  unresolved?: boolean;
  why: string;
}

/** A verifier finding the fixture accepts (known, ticketed). Matched on every field given. */
export interface AllowedViolation {
  check: VerifierCheck;
  ledgerKey?: string | null;
  bannedEntryId?: string | null;
  why: string;
}

export interface FixtureExpectations {
  /**
   * Banned-list entry ids (`_averments/`) the Drafter must not have written.
   * Read from the verifier's initial findings: a stripped phrase still fails.
   */
  not_written?: Array<{ banned_entry_id: string; why: string }>;
  /** Folded match (case and spacing ignored): none of `any_of` may appear. */
  absent?: TextExpectation[];
  /** Folded match: at least one of `any_of` must appear. */
  present?: TextExpectation[];
  /** Character-exact: at least one of `any_of` must appear exactly as written. */
  exact?: TextExpectation[];
  ledger?: LedgerExpectation[];
  /** Verifier findings that do not fail this fixture. Empty by default: any finding fails. */
  allow_violations?: AllowedViolation[];
  /** T-373: the renderer's clause statuses (D1 packs only). */
  rendered?: RenderedExpectation;
}

/**
 * T-373 (ADR-025 D1): what the renderer's `rendered[]` must show, for a pack
 * on a signed skeleton. Setting it also asserts that the draft took the D1
 * path (the done event carried `rendered`) and that every rendered entry has
 * a clauseId.
 */
export interface RenderedExpectation {
  /** No rendered clause may have any of these statuses. */
  no_status?: Array<Exclude<RenderedStatus, 'ok'>>;
  /** These clauses must be rendered with exactly this status. */
  status?: Record<string, RenderedStatus>;
  /** These clauses must not be rendered at all: a clause for a fact the advocate never gave. */
  not_rendered?: string[];
  /** Why the fixture asserts it, in plain words. Printed with a failure. */
  why: string;
}

/** One model reply per call purpose, for `--dry-run`. */
export interface RecordedReplies {
  reception: string;
  extract: string;
  /**
   * The Drafter's reply. On a pack on a signed skeleton (D1, English) this is
   * the structured answer as JSON text, `{"paragraphs":[{clauseId, factRefs,
   * text, items}]}`; the stub hands it to the request's own output-format
   * parser, as the SDK's `messages.parse` does. Otherwise free prose with the
   * ===CLAUSES=== trailer.
   */
  drafter: string;
  /** The clause-repair pass. Absent: the stub returns the drafter reply again. */
  repair?: string;
  /** The fact-repair pass. Absent: an empty reply, so the verifier placeholders. */
  fact_repair?: string;
}

export interface Fixture {
  id: string;
  pack: string;
  title: string;
  /** The real failure or risk this fixture covers. */
  risk: string;
  /** Where it comes from: Anushka's report and scenario, a T-147d artefact, a T-113 item (copied). */
  source: string;
  /** Always REVIEW_STATUS until Anushka has reviewed it through the founder. */
  review: string;
  /** Null, or why this fixture's expectations assert legal wording and need Ajay's confirmation. */
  ajay: string | null;
  language: 'en' | 'hi' | 'bilingual';
  /** Synthetic. No real person's data. */
  description: string;
  /** The court the advocate picks from the list. Null for a document not for a court. */
  court: { state: string; court_type: string; court: string } | null;
  /** What the advocate types on the questions step, sent as answers to the ledger. */
  answers?: Array<{ key: string; value: string }>;
  expect: FixtureExpectations;
  /** Recorded replies by variant, for `--dry-run`. `clean` is the default variant. */
  recorded?: Record<string, RecordedReplies>;
}

// ── What a run produces ────────────────────────────────────────────────────

export interface FactDiffEvidence {
  check: VerifierCheck;
  entityType: string;
  ledgerKey: string | null;
  label: string;
  bannedEntryId: string | null;
  /** Decrypted. Synthetic fixture data only. */
  draftValue: string | null;
  ledgerValue: string | null;
  resolution: string;
  phase: 'initial' | 'after_repair';
  paragraphIndex: number;
}

export interface LedgerEvidence {
  facts: Array<{
    key: string;
    type: string;
    display: string;
    confidence: number;
    raw_span: string;
  }>;
  unresolved: Array<{ key: string; type: string; reason: string; raw_span: string }>;
}

/** One fact as the extraction pass read it, before the floors: for `--calibrate`. */
export interface ExtractionRead {
  key: string;
  type: string;
  span: string;
  confidence: number;
}

export interface TokenUse {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  calls: number;
}

export interface RunEvidence {
  fixtureId: string;
  runId: string | null;
  intakeId: string | null;
  documentId: string | null;
  ledgerId: string | null;
  /** Readable reason the pipeline stopped before a draft, or null. Never a stack trace. */
  pipelineError: string | null;
  deliveredText: string | null;
  ledger: LedgerEvidence | null;
  factDiffs: FactDiffEvidence[];
  missingClauses: string[];
  /** T-373: the done event's `rendered[]`. Absent when the draft did not take the D1 path. */
  rendered?: Array<{ clauseId: string; status: RenderedStatus; reason?: string }>;
  banner: boolean;
  tokens: TokenUse;
  extraction: ExtractionRead[];
  /** The isolation self-check of this run's rows (AC4). */
  isolation: { ok: boolean; problems: string[] };
}

export type FailureKind =
  | 'pipeline'
  | 'verifier'
  | 'not_written'
  | 'absent'
  | 'present'
  | 'exact'
  | 'ledger'
  | 'rendered'
  | 'isolation';

export interface Failure {
  kind: FailureKind;
  /** One readable line: what was expected. */
  expected: string;
  /** One readable line: what the run produced. */
  actual: string;
  why?: string;
  /** Lines of the delivered document around the problem, when there is one. */
  context?: string[];
}

export interface FixtureResult {
  id: string;
  pack: string;
  title: string;
  risk: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  failures: Failure[];
  runId: string | null;
  intakeId: string | null;
  documentId: string | null;
  ledgerId: string | null;
  tokens: TokenUse;
  /** Verifier findings, initial phase, for the record (including allowed ones). */
  verifierFindings: number;
  missingClauses: string[];
}
