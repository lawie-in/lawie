/**
 * T-682 — the v3 typed fact ledger: types (handoff/design/T-682-ledger-schema.md,
 * approved by Arjun, T-682-ledger-schema-review-arjun.md).
 *
 * `LedgerCandidate` / `ExtractResult` are T-683's interface (Vishal owns
 * `services/v3/types.ts`; handoff/design/T-683-extractor-answers.md §1). They are
 * declared here with exactly the same shape, so this ledger accepts either
 * file's type without a clash. Do not change them here: change T-683's first.
 *
 * Types only.
 */
import type { Fact, FactType, LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

// ── T-683's interface (same shape as services/v3/types.ts) ─────────────────

export interface LedgerCandidate {
  key: string; // checklist/pack key, e.g. 'defendant_name', 'summons_service_date'
  value: string | string[] | number; // normalised by code, never by the model
  type: 'text' | 'date' | 'money' | 'name' | 'choice' | 'list';
  source: { kind: 'description' | 'answer'; turn: number; quote: string }; // quote = exact user words, ≤ 200 chars
  confidence: number; // 0–1 from the model; code treats < 0.6 as "ask"
}

export interface ExtractResult {
  candidates: LedgerCandidate[];
  conflicts: Array<{ key: string; values: LedgerCandidate[] }>; // two dates for one key → a question, never a guess
  nonAnswers: string[]; // keys the user answered with a §(j)3 non-answer → no fact (AJ-655-M1)
}

// ── T-682 ───────────────────────────────────────────────────────────────────

/**
 * ADR principle 1. `user`: read from the description. `asked`: an answer or an
 * edit on the brief. `derived`: computed by code from held entries (never
 * stored). `template`: from the pack or court data.
 */
export type EntrySource = 'user' | 'asked' | 'derived' | 'template';

export type EntryStatus = 'held' | 'unresolved' | 'conflict';

export interface EntryOrigin {
  source: EntrySource;
  /** Intake turn (0 = the description). Absent for derived/template and v2 entries. */
  turn?: number;
  /**
   * The user's exact words for this value, verbatim in their text (NFC). '' for
   * derived/template. Stored only inside the sealed version; never logged.
   */
  quote: string;
  /** Model confidence for user/asked entries; 1 for code and for the advocate's own edit. */
  confidence: number;
  /** When the advocate gave it (answers and edits). ISO string. */
  askedAt?: string;
}

/** Code provenance of a derived entry (principle 3). */
export interface Derivation {
  rule: string;
  ruleVersion: number;
  /** Ids of the held entries read. */
  inputs: string[];
}

export interface DisplayForm {
  lang: 'en' | 'hi';
  text: string;
}

/** One entry. A held entry's `value` is the v2 typed value of its `type`. */
export interface LedgerEntry {
  id: string;
  key: string;
  /** The pack's label for the key (kept so a v2 fact reads back byte for byte). */
  label: string;
  type: FactType;
  status: EntryStatus;
  /** held only. */
  value?: Fact['value'];
  /** held only: the primary printed form (v2 `display`). */
  display?: string;
  displayForms?: DisplayForm[];
  /** A list or several choices: one entry per item, same key (T-189). */
  index?: number;
  origin: EntryOrigin;
  /** Only when `origin.source === 'derived'`. */
  derivation?: Derivation;
  /** unresolved: the v2 UnresolvedReason and its plain line. */
  reason?: string;
  detail?: string;
  /** conflict: the competing readings, each with its own quote. */
  candidates?: Array<Pick<LedgerCandidate, 'value' | 'source' | 'confidence'>>;
  /** held only. */
  requiredInDraft?: boolean;
}

/**
 * AJ-655-M1: a non-answer is recorded, but it is not an entry, so it is never
 * a fact. `not_known`: "Not known" / "Not given", and a key the Extractor
 * reported in `nonAnswers` with no words. `none`: a "none" on a fact used only
 * when present. `blank_once_asked`: T-629 §(i)2.
 */
export interface NonAnswer {
  key: string;
  kind: 'not_known' | 'none' | 'blank_once_asked';
  turn?: number;
}

export type LedgerVersionReason =
  | 'extract'
  | 'answer'
  | 'edit'
  | 'conflict_resolved'
  | 'import_v2'
  | 'kind_change';

/** What one version seals. */
export interface LedgerSealedState {
  entries: LedgerEntry[];
  nonAnswers: NonAnswer[];
}

/** Which store a snapshot was read from (Arjun's condition 7: never merged). */
export type LedgerStore = 'v3' | 'v2';

/**
 * The current state a reader gets. `openLedger` adds the derived entries
 * (computed now, never stored) after the stored ones.
 */
export interface LedgerSnapshot {
  ledgerId: string;
  /** The run id. For a v2 ledger read before T-685, its intake id ('' when none). */
  runId: string;
  packId: string;
  runType: 'user' | 'fixture';
  store: LedgerStore;
  version: number;
  entries: LedgerEntry[];
  nonAnswers: NonAnswer[];
  /** Key → the display before the last edit, as v2's `previous_display`. */
  previousDisplays?: Record<string, string>;
}

/** Why candidates were not kept. Reason codes and counts only (condition 2). */
export type DropReason =
  | 'not_on_list'
  | 'no_span'
  | 'span_not_found'
  | 'no_fact_answer'
  | 'derived_key';

export type DropCount = Partial<Record<DropReason, number>>;

/** The v2 shapes the generation and verifier paths read today. */
export interface GenerationFacts {
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
}
