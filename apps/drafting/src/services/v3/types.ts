/**
 * T-683: the v3 Extractor's contract (role C, handoff/design/ADR-drafting-v3.md).
 *
 * T-683 owns this file; T-682 (the typed ledger) imports and extends it.
 * LedgerCandidate and ExtractResult are Arjun's interface
 * (handoff/design/T-683-extractor-answers.md §1), with Ajay's output contract
 * (handoff/legal/run5-rulings-ajay.md, "T-683: v3 Extractor, complete rule"):
 *
 * - rule 4: a non-answer is output under `nonAnswers` as `{key, quote}`. This
 *   replaces Arjun's `nonAnswers: string[]` (Ajay's shape wins, per the lead).
 * - rule 1: a value that cannot be read from the quote alone gives no fact,
 *   and its key goes to `unresolved`. Added as `unresolved: string[]`.
 *
 * Pure types: no I/O. Nothing here is logged: `quote` is the user's own text
 * (same custody as the fact ledger, T-187), never written to logs or Sentry.
 */

/** The value types code validates. */
export type LedgerCandidateType = 'text' | 'date' | 'money' | 'name' | 'choice' | 'list';

export interface LedgerCandidate {
  /** Checklist/pack key, e.g. 'defendant_name', 'summons_service_date'. */
  key: string;
  /** Normalised by code, never by the model. */
  value: string | string[] | number;
  type: LedgerCandidateType;
  /** quote = the user's exact words, ≤ 200 chars (a verbatim substring after whitespace collapse). */
  source: { kind: 'description' | 'answer'; turn: number; quote: string };
  /** 0–1 from the model; code treats < 0.6 as "ask" (the key goes to `unresolved`). */
  confidence: number;
}

/** Ajay rule 4: a non-answer, kept against the key it was given for. Never a fact. */
export interface NonAnswer {
  key: string;
  /** The user's words that are the non-answer. Never logged. */
  quote: string;
}

export interface ExtractResult {
  candidates: LedgerCandidate[];
  /** Two different values for one key: a question, never a guess. */
  conflicts: Array<{ key: string; values: LedgerCandidate[] }>;
  /** Keys the user answered with a non-answer (§(j)3, AJ-668 M5–M6): no fact (AJ-655-M1). */
  nonAnswers: NonAnswer[];
  /** Keys with no fact because the value could not be read from the quote alone (Ajay rule 1). */
  unresolved: string[];
}

/** The empty result: no candidate, nothing asked. */
export function emptyExtractResult(): ExtractResult {
  return { candidates: [], conflicts: [], nonAnswers: [], unresolved: [] };
}
