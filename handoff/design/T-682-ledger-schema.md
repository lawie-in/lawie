# T-682 — v3 typed fact ledger: schema (for Arjun's review; Vishal builds T-683 against it)

Status: BUILT, 29 Oct 2026 (Tanvi), branch `feature/t-682-v3-typed-ledger`, reviewed (round 3 pass). Approved by Arjun (`T-682-ledger-schema-review-arjun.md`). The sections below are the original proposal, corrected where the build differs; the "As built" section wins on any doubt.

## As built (29 Oct 2026)

Files, all in `apps/drafting`: `models/FactLedgerV3.model.ts` (collection `factledgers_v3`), `services/v3/ledger.types.ts`, `services/v3/from-v2.ts`, `services/v3/ledger.service.ts`; erase steps in `services/account-erase.service.ts` and `services/document-erase.service.ts`. Behind `feature.drafting_v3_stage` >= 1 (a missing or bad setting is 0: v2 runs). Nothing in production calls the ledger yet.

- **Types file.** The types are in `ledger.types.ts`, not `types.ts`. It declares T-683's `LedgerCandidate` / `ExtractResult` with the same shape, so either file's type is accepted. Differences from §1: entries also carry `label`; `requiredInDraft` is optional; `askedAt` is an ISO string; `NonAnswer.turn` is optional; a conflict's `candidates` are `ConflictCandidate` (value, display, source, confidence); snapshots carry `runType` and `store` ('v3' | 'v2').
- **Conflict readings use the same verbatim pipeline as held values.** On the list, quote present and <= 200 chars (a narrative item is exempt), span located in the turn text (NFC both sides), v2 non-answers dropped. The stored value is re-read by code from the located span (a choice: its option), never the model's value or quote. Drop reasons: `not_on_list`, `no_span`, `span_not_found`, `no_fact_answer`, `derived_key`, and `unverified` (the normaliser cannot read it). Reason codes and counts are logged, never content.
- **Counting readings (round 3).** Confidence is clamped once when the row is built (non-number or non-finite -> 0, then [0, 1]). Only a reading the normaliser cannot read is dropped. Two or more distinct normalising readings are a conflict, whatever their confidence. One value read twice is one reading (higher confidence kept). A single reading at or above its type's floor is held; a single reading below the floor is `unresolved` with `reason: 'low_confidence'`, quote kept, never held. No verified reading leaves v2's own result.
- **An unreadable or below-floor answer leaves a conflict open.** Only a held answer closes it (`conflict_resolved`).
- **Size guards.** A sealed version over 2 MB (`LEDGER_V3_MAX_SEALED_BYTES`) and all sealed versions of one document over 12 MB (`LEDGER_V3_MAX_DOC_SEALED_BYTES`) are refused with `LedgerVersionTooLargeError` before the write. The cap stays 100 versions (`LedgerFullError`).
- **`createLedger`** validates `runId` (non-empty string) and `userId` (ObjectId), else `LedgerNotFoundV3Error`. A second create for the same run and user returns the first; a run held by another user throws `LedgerRunTakenError`. `initial` must be a state built by `importV2State` or `carryOverState`, else `LedgerInitialStateError`.
- **`recordNonAnswer`** takes an optional checklist (default: the ledger pack's own). A key not on it is dropped (`not_on_list`) and nothing is written. A passed list can only narrow what the pack allows; the pack list is the bound.
- **Not v3 derive rules yet.** `derive()` runs amount in words and custody-since R1 only. The s.138 date checks, the law switch and limitation are NOT v3 rules. The s.138 keys are computed on the generate-from-brief route only (T-363 pin). Deferred to T-685 / T-680; generation applies them on top of the ledger's facts, as today.
- **Known limit.** The description is not stored (Q4). A surrender, remand or re-arrest word that appears only in the description is not seen by the ledger view (`derive()` scans entry quotes unless the caller passes `described`). The brief and generation still see it, because the request carries it.
- **Erase.** Account erase deletes `factledgers_v3` by user. Document erase reaches a v3 ledger only through its `intakeId` (saved intake ids, shared intakes skipped); a v3 ledger without `intakeId` is not found by it.
- **Key rotation** must re-seal both collections (`factledgers` and `factledgers_v3`); no rotation code in T-682.

Not run by me: tests, lint, build. Checked by reading the code at HEAD 38ab4426.

## Notes for T-685

1. Every v3 ledger must set `intakeId` (document erase finds it only that way).
2. An empty-text `applyUserEdit` closes a conflict deliberately (as a v2 empty edit clears the fact and the doubt).
3. The `initial` guard proves origin, not content: `importV2State` does not re-check quotes.
4. `recordNonAnswer` and `createLedger` are not yet called by production code.
5. `openLedgerForRun` falls back to the v2 ledger with `intakeId === runId` (newest) until run ids exist.
6. A key rotation must re-seal both `factledgers` and `factledgers_v3`.
7. Wire in the deferred derive rules (s.138 checks, law switch, limitation) or keep applying them in generation.

## Original proposal. Sources: ADR-drafting-v3 (principles 1-3, role C, §7 Phase 1), T-683 answers (LedgerCandidate / ExtractResult), Ajay's ADR sign-off (ADR3-L10, L11), the v2 store (`FactLedger.model.ts`, `fact-ledger.service.ts`), `custody-since-derivation.ts`, `intake-brief.ts`, `documents.routes.ts`, `ai.service.ts`, `fact-verifier.ts`.

Everything is behind `feature.drafting_v3_stage` (≥ 1). Flag off = the v2 store, writers and readers unchanged.

## 1. TypeScript types

Built in `apps/drafting/src/services/v3/ledger.types.ts` (see "As built" for differences). T-683 owns `LedgerCandidate` / `ExtractResult`. T-682 imports them and **extends without renaming**.

```ts
import type { Fact, FactType } from '@lawie/shared'; // v2 typed values, reused as is

// ── T-683 (unchanged; quoted for reference) ────────────────────────────────
export interface LedgerCandidate {
  key: string;
  value: string | string[] | number; // normalised by code
  type: 'text' | 'date' | 'money' | 'name' | 'choice' | 'list';
  source: { kind: 'description' | 'answer'; turn: number; quote: string }; // quote ≤ 200
  confidence: number; // < 0.6 → ask
}
export interface ExtractResult {
  candidates: LedgerCandidate[];
  conflicts: Array<{ key: string; values: LedgerCandidate[] }>;
  nonAnswers: string[]; // AJ-655-M1: no fact
}

// ── T-682 additions ────────────────────────────────────────────────────────
/** ADR principle 1. user = read from the description; asked = an answer or a brief edit;
 *  derived = computed by code from held entries; template = from the pack/court data. */
export type EntrySource = 'user' | 'asked' | 'derived' | 'template';

export type EntryStatus = 'held' | 'unresolved' | 'conflict';

export interface EntryOrigin {
  source: EntrySource;
  /** Intake turn (0 = description). Absent for derived/template. */
  turn?: number;
  /** The user's exact words for this value, ≤ 200 chars, verbatim in their text.
   *  Required for user/asked; '' for derived/template. Stored (encrypted), never logged. */
  quote: string;
  /** Model confidence for user/asked (code floor per type, as v2); 1 for code. */
  confidence: number;
  /** When the user was asked (answers/edits). */
  askedAt?: Date;
}

/** Code provenance for source 'derived' (principle 3). */
export interface Derivation {
  rule: string; // e.g. 'custody_since.r1', 'amount_in_words.p5', 'limitation.t472'
  ruleVersion: number; // bumped when the signed rule changes
  inputs: string[]; // entry ids read
}

export interface DisplayForm {
  lang: 'en' | 'hi';
  text: string; // what the draft prints in that language
}

/** One entry. A held entry's value is a v2 `Fact` value (typed per FactType). */
export interface LedgerEntry {
  id: string; // stable across versions while the value is unchanged
  key: string; // pack/checklist key (`<group>.<name>` or `<name>`)
  type: FactType; // v2 types: amount, date, person_name, …, section_ref, enum, boolean
  status: EntryStatus;
  /** held: the validated value. unresolved/conflict: absent. */
  value?: Fact['value'];
  /** held: primary printed form (today's `display`). */
  display?: string;
  displayForms?: DisplayForm[];
  /** List / several choices: one entry per item, same key (as v2, T-189). */
  index?: number;
  origin: EntryOrigin;
  derivation?: Derivation; // only when origin.source === 'derived'
  /** unresolved: why (v2 UnresolvedReason) and one plain line. */
  reason?: string;
  detail?: string;
  /** conflict: the competing candidates, each with its own quote. */
  candidates?: Array<Pick<LedgerCandidate, 'value' | 'source' | 'confidence'>>;
  requiredInDraft: boolean;
}

/** AJ-655-M1: a non-answer is recorded, but it is not an entry, so it is never a fact. */
export interface NonAnswer {
  key: string;
  kind: 'not_known' | 'none' | 'blank_once_asked'; // T-190 / T-629 §(i)2 / T-655
  turn: number;
}

export type LedgerVersionReason =
  | 'extract'
  | 'answer'
  | 'edit' // v2 reasons
  | 'conflict_resolved'
  | 'import_v2'
  | 'kind_change';

export interface LedgerVersion {
  version: number; // 1..n, = index + 1
  reason: LedgerVersionReason;
  createdAt: Date;
  /** Keys whose entries changed in this version (ids only; for audit without decrypting). */
  changedKeys: string[];
  // sealed: { entries: LedgerEntry[]; nonAnswers: NonAnswer[] } — see §2
}

/** The decrypted current state any reader gets. Derived entries are added at read (§3). */
export interface LedgerSnapshot {
  ledgerId: string;
  runId: string;
  packId: string;
  version: number;
  entries: LedgerEntry[]; // held + unresolved + conflict (stored) + derived (computed now)
  nonAnswers: NonAnswer[];
}
```

Candidate → entry type: `text→text`, `date→date`, `money→amount`, `name→person_name` (or `place_name`/`police_station`/`court` by the checklist's `factTypeFor`), `choice→enum`, `list→` the item's type with `index`. The checklist decides; the candidate's type is only a hint. See Q2.

## 2. Mongo collection

**`factledgers_v3`**, model `FactLedgerV3`. It is a new collection: v2 `factledgers` is not touched (§5).

| field                   | type                                                | notes                                                                                               |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `_id`                   | ObjectId                                            | ledgerId                                                                                            |
| `runId`                 | string ≤ 100                                        | T-685 run id. **Unique**                                                                            |
| `userId`                | ObjectId                                            | owner; every read is `{_id, userId}` (as `loadOwnLedger`)                                           |
| `packId`                | string ≤ 100                                        | v2 `documentKind`                                                                                   |
| `runType`               | 'user' \| 'fixture'                                 | `fixtureOriginPlugin` as v2                                                                         |
| `intakeId`              | string?                                             | link to the intake (resume, carry-over)                                                             |
| `importedFrom`          | ObjectId?                                           | the v2 ledger read into version 1 (`import_v2`)                                                     |
| `currentVersion`        | number                                              | = `versions.length`                                                                                 |
| `versions[]`            | `{version, reason, createdAt, changedKeys, sealed}` | append-only, `$push` only                                                                           |
| `versions[].sealed`     | string                                              | `encrypt(JSON.stringify({entries, nonAnswers}))`, the same key and helper as v2 `factsEnc` (T-115a) |
| `createdAt`/`updatedAt` | Date                                                | timestamps                                                                                          |

- **Encrypted:** everything in an entry (values, displays, quotes, candidates, details) and the non-answers. **Plain:** ids, keys in `changedKeys`, reasons, counts and timestamps, so audits and ops never need to decrypt.
- **Privacy:** `quote` is stored only inside `sealed`. It is never written to logs, Sentry, llm-usage or the run document (ADR3-L8, T-683 §2). Log lines carry ids, keys and counts. No description text is stored, as in v2. The full description lives only in the request; see Q4.
- **Indexes:**
  - `{runId: 1}` unique: one ledger per run, and the run lookup.
  - `{userId: 1, createdAt: -1}`: own ledgers, account export and deletion.
  - `{intakeId: 1}`: resume and carry-over on a change of kind.
  - No index on keys or values. They are encrypted, and we never query by fact.
- **Size:** a full snapshot per version, as in v2. The cap stays at `maxLedgerVersions` = 100 (`LedgerFullError`). At about 60 entries × 1 kB that is about 6 MB, under the 16 MB document limit. As built: a sealed version over 2 MB, or a document whose sealed versions together pass 12 MB, is refused with `LedgerVersionTooLargeError`.
- **Retention:** no TTL, the same as v2 today. Deletion follows account deletion. See Q5.

## 3. Invariants (enforced in the write functions; each has a test)

1. **One ledger per run.** `runId` is unique. A second create for the same run returns the existing ledger (idempotent, T-685 resume). A change of kind is a new run: the new ledger gets version 1 with `reason: 'kind_change'` and the user's `asked` entries carried over (v2 `carryOver`).
2. **Append-only.** A write `$push`es one version, with an optimistic check on `currentVersion` (v2's `LedgerConflictError`, renamed `LedgerVersionRaceError` so it does not collide with the `conflict` status). A correction is a new version whose entry for that key has the new value. Every older version is kept unchanged. The audit trail is the versions list. Read-time views (T-665b-style filters) never rewrite a version.
3. **Every user/asked entry has a source and a quote.** The quote is 1-200 chars and found verbatim in that turn's text (v2 `locateSpan`). A candidate whose quote is not found is dropped and counted (`span_not_found`); it never gets an invented quote. Conflict readings pass the same check. Derived and template entries have `quote: ''` plus `derivation` or a template id.
4. **Non-answers are not facts (AJ-655-M1).** A non-answer (the §(j)3 list, Not known, `NONE_IS_EMPTY_KEYS` "none", a blank once asked) is recorded as a `NonAnswer {key, kind, turn}` in the sealed state, and any held entry for that key is removed in that version. It never becomes a `LedgerEntry`. Readers see it as "asked, empty": no fact, not asked again. The brief's `asked_empty` and `asked_blank` come from it.
5. **Conflicts become a question (ADR3-L11, T-683).** Two different values for one single-value key, whether from `ExtractResult.conflicts`, a new turn that contradicts a held `user` entry, or two quotes in one turn, are stored as one entry with `status: 'conflict'` and both `candidates`. A conflict entry is never read as held: generation shows the blank and the delivery gate asks. It closes only when the user gives a readable answer (`reason: 'conflict_resolved'`, the answer is `asked`); an unreadable answer leaves it open. Two or more distinct normalising readings are a conflict whatever their confidence; one below-floor reading alone is `unresolved` `low_confidence`. An `asked` value given after a `user` value is not a conflict: the advocate's answer replaces the reading. That matches v2 (`overlayBrief`), and the replaced value stays in the old version.
6. **Derived entries are code only and never overwrite a held user/asked entry.**
   - `derive()` (§4) computes them from held entries on every read. They are not stored, so they can never go stale; this is v2's "per request, never stored" rule.
   - If a user/asked entry holds the key, the rule does not fire (B5).
   - A held or conflicting input means no derived entry: it is never guessed.
   - The model never supplies a derived key. The Extractor's output for a derived key is dropped (`not_on_list`).
7. **Unresolved entries are not facts.** `status: 'unresolved'` keeps `reason`, `detail` and the quote. It is asked, and it is never printed.

## 4. The single ledger API

The API is in `apps/drafting/src/services/v3/ledger.service.ts`. Only this module touches `factledgers_v3`.

```ts
// read
openLedger(ledgerId: string, userId: string): Promise<LedgerSnapshot | null>   // v3 or v2 via adapter (§5)
openLedgerForRun(runId: string, userId: string): Promise<LedgerSnapshot | null>
held(s: LedgerSnapshot, opts?: { derived?: boolean }): LedgerEntry[]          // held (+ derived, default true)
heldByKey(s: LedgerSnapshot): ReadonlyMap<string, LedgerEntry[]>
openItems(s: LedgerSnapshot): { unresolved: LedgerEntry[]; conflicts: LedgerEntry[]; nonAnswers: NonAnswer[] }

// derive (pure; called inside openLedger, exported for tests)
derive(s: Omit<LedgerSnapshot, 'entries'> & { entries: LedgerEntry[] }, pack: RulePack,
       ctx: { now: Date; described?: string }): LedgerEntry[]

// write (each appends exactly one version; returns the new snapshot)
createLedger(args: { runId; userId; packId; intakeId?; runType?; initial?: LedgerSealedState; reason?; importedFrom? }): Promise<LedgerSnapshot>
  // built: `initial` only from importV2State / carryOverState (LedgerInitialStateError)
appendCandidates(ledgerId, userId, expectedVersion: number, r: ExtractResult,
                 checklist: ChecklistItem[], turnText: string): Promise<{ s: LedgerSnapshot; dropped: DropCount }>
applyUserEdit(ledgerId, userId, expectedVersion: number,
              edit: { key: string; text: string | string[] }): Promise<{ s: LedgerSnapshot; result: LedgerEditResult }>
recordNonAnswer(ledgerId, userId, expectedVersion: number, n: NonAnswer, checklist?): Promise<LedgerSnapshot>  // key must be on the pack checklist

// views (v2 shapes, so the brief, web, renderer and verifier stay unchanged in Phase 1)
viewForBrief(s: LedgerSnapshot, checklist: ChecklistItem[]): LedgerView            // v2 LedgerView + conflicts
factsForGeneration(s: LedgerSnapshot): { facts: LedgerFact[]; unresolved: LedgerUnresolvedFact[] }
factsForVerifier(s: LedgerSnapshot): LedgerFact[]                                   // same set as generation
```

`appendCandidates` and `applyUserEdit` do the v2 work in code: `normalizeForItem`, confidence floors, `locateSpan`, `bareStationName`, `holdDescriptionNone`, non-answer folding (`isNoFactAnswer`), multi-item entries and conflict detection.

What it replaces when the flag is on:

| today (v2)                                                                                                                                                                                              | v3                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `readExtraction` + `holdDescriptionNone` + `carryOver` + `overlayBrief` + `createLedger` (intake.service ~1405-1434)                                                                                    | `createLedger` + `appendCandidates` (T-685 orchestrator)                                                                  |
| `applyEdits` (`updateLedger`, intake.service ~2027)                                                                                                                                                     | `applyUserEdit` / `recordNonAnswer`                                                                                       |
| `ledgerView` (intake.service :1434, :2037; T-665b filter)                                                                                                                                               | `viewForBrief`                                                                                                            |
| `currentState(doc)` in documents.routes :1493 (quote), :1612 (generate)                                                                                                                                 | `openLedger` + `factsForGeneration`                                                                                       |
| per-request computed chain: `withLawSwitchFacts`, `withLimitationFact`, `withAmountInWordsFact`, `withS138DateChecks`, `withCustodySinceDerived` (ai.service ~2335-2410, documents.routes ~1629, ~1727) | `derive()` rules, inside `openLedger` (built: amount in words and custody-since only; the rest deferred to T-685 / T-680) |
| `buildInMemoryLedger(briefLedgerValues/formLedgerValues)` gate ledgers (ai.service :2314, :2418; documents.routes :1724)                                                                                | unchanged in Phase 1 (no persisted ledger on those paths); see Q6                                                         |
| `ledgerGivenKeys`, `ledgerCustodyInputs` readers in intake-brief                                                                                                                                        | fed from `viewForBrief` / `held()`                                                                                        |
| verifier `verifyDraft({facts})`, renderer `factEntriesByKey`                                                                                                                                            | `factsForVerifier`; same `LedgerFact[]` shape                                                                             |

## 5. v2 compatibility: read adapter, no data migration (recommended)

- **Adapter:** `fromV2(doc: IFactLedger): LedgerSnapshot`. It opens the v2 current version with `openVersion` and maps entries:
  - `facts` → `held`. Source `user` → `user`, `asked` → `asked`. A stored `computed` never exists.
  - `raw_span` → `quote`; `display` and `value` unchanged.
  - `unresolved` → `unresolved` with `reason` and `detail`.
  - No `conflict` entries: v2 already put "two values" into unresolved.
  - v2 has no stored non-answers (they are removals), so `nonAnswers = []`. The brief's `asked_empty` keeps coming from the request, as it does today.
- **Writes under the flag** never go to a v2 doc. The first v3 write for a run that has a v2 ledger creates a v3 ledger whose version 1 is `import_v2`, with `importedFrom` set. The v2 doc stays as it is, for audit and for stepping back.
- **Why not migrate:** the encrypted v2 rows would need a decrypt-and-rewrite backfill, like T-115a, for no reader benefit. Stepping back (flag off) must find v2 data unchanged. v2 ledgers are short-lived, one per intake.
- **Risks:**
  1. A flag flip mid-run gives a v2 ledger and a v3 ledger for one run. Mitigation: the run document records which store it started on (T-685) and keeps using it to the end.
  2. Adapter drift if v2 changes. Mitigation: v2 is frozen except fixes, and a contract test runs v2 fixtures → `fromV2` → `factsForGeneration` and expects them to equal today's facts.
  3. `importedFrom` holds an id only, so deleting a v2 doc never breaks v3.

## 6. How T-665 / T-665b fit

- **custody_since is a `derive()` rule.** Rule `custody_since.r1` with `ruleVersion` 1 emits a derived `custody_since` entry and the `custody_since_derived` marker, using `inputs` of the arrest and custody entry ids.
  - It calls the existing leaf `custody-since-derivation.ts`: `ledgerCustodyInputs` → `deriveCustodySince`, and `custodySinceDerivesFromLedger` once T-665b merges; it is not on this branch yet.
  - The rules are not copied. Brief, generation and the view read the one decision (T-660 / T-665 agreement).
  - B5 is invariant 6: a held user/asked `custody_since` blocks the rule.
- **T-665b back-reference.** An `unresolved` custody_since entry whose whole quote is in the closed list `CUSTODY_SINCE_BACK_REFERENCES` (Ajay 6cac06e3) is neither held nor another custody date. `viewForBrief` leaves it out of a copy only when R1 derives (Ajay 2e119150, read-time only). The stored entry is never changed (invariant 2).
- **Closed lists stay legal content** in their current modules, imported by `derive()` and the write functions and never duplicated: B1 words, the back-reference list, NONE_ANSWERS / NONE_IS_EMPTY_KEYS, date-meanings and the signed skeletons. A change to any of them is Ajay's (ADR §6).
- **B1 description scan:** `derive()` takes `ctx.described` when the caller has it (generation, first brief). Without it, it scans the entries' quotes only, the T-665b known limit. See Q4.

## 7. Open questions for Arjun (each with my default)

| #   | question                                                                                | default                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Derived entries: compute at read, or persist as versions?                               | Compute at read, never stored (invariant 6; v2 precedent; cannot go stale). Persisting would need a re-derive on every input change                 |
| Q2  | Entry `type`: T-683's 6 candidate types or v2 `FactType` (11)?                          | v2 `FactType` on the entry (renderer, verifier and normalizer read it); candidate `type` is a hint mapped by the checklist (§1). Vishal keeps his 6 |
| Q3  | Lists: one entry per item (v2) or one entry with an array value?                        | One per item with `index`, as v2 (T-189 readers `factEntriesByKey` unchanged)                                                                       |
| Q4  | Store the description (encrypted) on the run so `derive()` sees B1 words on every read? | No, for now (v2 privacy note; Ajay/DPO call). Pass `described` where the request has it; record the known limit                                     |
| Q5  | Retention / TTL for `factledgers_v3`?                                                   | None (as v2); follow account deletion. Founder/DPO to set a TTL later                                                                               |
| Q6  | Form route and no-ledger gate (`buildInMemoryLedger`): v3 ledger too?                   | Not in Phase 1; they keep in-memory v2 facts. Revisit in T-685                                                                                      |
| Q7  | Conflict question text (ADR3-L10(c) when it names a legal term)                         | Reuse T-611 P1's signed line where it fits; any new line goes to Ajay before build. No new string in T-682                                          |
| Q8  | New collection vs a `schemaVersion: 3` doc in `factledgers`?                            | New collection: v2 untouched and step-back is clean, at the cost of one adapter                                                                     |
| Q9  | Keep a full snapshot per version or an event log?                                       | Full snapshot (as v2; simple reads; cap 100 versions). Revisit if size bites                                                                        |

## Acceptance mapping (T-682 AC5; golden cases in T-683/T-147e)

- **T-675 (no invented facts):** invariant 3 (verbatim quote) and invariant 6 (no model-supplied derived keys).
- **T-676 (Hinglish and Hindi answers read as facts):** non-answers by the signed lists only (invariant 4). Anything else is normalised as a value; it is not dropped.
- **T-677 (section numbers kept):** `section_ref` entries keep `{act, section}` as v2.
- **T-679 (given facts reach the draft):** `viewForBrief` and `factsForGeneration` read the same held set.
- **T-680 (NI Act basics):** amount in words is a `derive()` rule. The s.138 checks, law switch and limitation are not yet (T-363 pin; T-685 / T-680).
