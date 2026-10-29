# T-682 ledger schema — Arjun's review (29 Oct 2026, 18:45 UTC)

Reviewed: `handoff/design/T-682-ledger-schema.md` at ca2dc8ea on `feature/t-682-v3-typed-ledger`. **APPROVED to build**, with Tanvi's defaults on all nine questions and the conditions below. Build may start on this commit.

## Q1–Q9

| #   | ruling                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Compute derived entries at read, never stored.                                                                                                                                    |
| Q2  | v2 `FactType` on the entry; the candidate's 6 types are a hint the checklist maps. Vishal keeps his 6.                                                                            |
| Q3  | One entry per list item with `index`, as v2.                                                                                                                                      |
| Q4  | **No.** The description is not stored in the ledger or on the run. Pass `described` where the request has it; the known limit is recorded in the doc. Any change is Ajay's/DPO's. |
| Q5  | No TTL now; account deletion must delete `factledgers_v3` rows — that deletion path is **in T-682's scope** (same place T-187 deletes v2 ledgers), with a test.                   |
| Q6  | Not Phase 1. Form route and no-ledger gate stay on in-memory v2 facts; T-685 revisits.                                                                                            |
| Q7  | Agreed: reuse T-611 P1's signed line; any new string → Ajay before build; no new string in T-682.                                                                                 |
| Q8  | New collection `factledgers_v3`; v2 untouched; adapter + contract test.                                                                                                           |
| Q9  | Full snapshot per version, cap 100. Add a size guard: refuse a version whose `sealed` exceeds 2 MB with a typed error (never a silent Mongo 16 MB failure).                       |

## Conditions (each with a test)

1. Every invariant in §3 has a unit test named after it (`invariant-1-one-per-run`, …). Invariant 2's optimistic check is tested with two concurrent appends: exactly one wins, the other gets `LedgerVersionRaceError`.
2. `quote` verbatim check normalises both sides with NFC before `locateSpan`, so Devanagari answers are not dropped as `span_not_found`; dropped counts are logged by reason code only.
3. Confidence floors, `NONE_ANSWERS`, `NONE_IS_EMPTY_KEYS`, back-reference lists and date meanings are **imported** from their v2 modules, never copied (legal content stays in one place).
4. Encryption uses the v2 helper and key (T-115a). Document in the file that a key rotation must rewrite both collections; no rotation code in T-682.
5. Plaintext fields are ids, keys, reasons, counts, timestamps only. A test asserts the stored document contains no entry value, display, quote or candidate outside `sealed` (serialise, search).
6. `fromV2` contract test: today's v2 fixtures → `fromV2` → `factsForGeneration` equals today's `currentState` facts byte for byte.
7. The run document (T-685) records the store it started on; until T-685 lands, `openLedgerForRun` prefers v3 and falls back to v2 — never merges the two.
8. No v2 file changes except: the import of shared constants and, if needed, exporting an existing function. `intake.service.ts` and `documents.routes.ts` are not touched in T-682 (that wiring is T-685).

## Interface with T-683

`LedgerCandidate` / `ExtractResult` stay as T-683 defines them (`services/v3/types.ts`, Vishal's file); T-682 adds its types to the same file under a `// T-682` section. Whoever lands second rebases; no shared hunks.
