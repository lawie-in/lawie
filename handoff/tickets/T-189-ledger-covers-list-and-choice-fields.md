# T-189 — The Fact Ledger covers list and choice fields

| Field          | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                      |
| Owner          | Vishal (build). Ajay signs any prompt change. Anushka (verdict)                                                             |
| Mode           | Build, full chain. Merge to develop                                                                                         |
| Status         | Proposed, founder to confirm. The approach below is Vishal's; the founder has not confirmed it                              |
| Size           | M (1 day), plus Ajay's sign-off time if a prompt changes                                                                    |
| Depends on     | T-147b (extraction and ledger), T-147c (the ledger-only Drafter)                                                            |
| Blocks         | Switching `feature.fact_ledger` on for any real user. Same gate group as T-187, T-188 and T-147c                            |
| Gate           | Before `feature.fact_ledger` goes on for real users                                                                         |
| Branch         | feature/t-189-ledger-list-and-choice-fields                                                                                 |
| Legal sign-off | Needed only if the extraction prompt or `drafter.prompts.ts` changes. Ajay signs that diff                                  |
| Created        | 2026-10-10                                                                                                                  |
| Source         | Vishal, T-147c follow-up, 10 Oct 2026                                                                                       |

## Problem

With `feature.fact_ledger` on, `isLedgerItem` skips list and choices items. `bail_regular`'s required `sections_charged` and `grounds_for_bail` are list items, so they never reach the ledger and always render as missing, even when the advocate gave them.

## User

District court advocate drafting a regular bail application who has already given the sections charged and the grounds, and should not see them marked as missing.

## Solution (proposed, founder to confirm)

Extend T-147b's extraction and the ledger to list and choices items, under the same rule as other items: every value carries a verbatim span from the source (description or answer). No span, no fact.

## Acceptance criteria

1. The founder confirms the approach in this file before the build starts.
2. `isLedgerItem` accepts list and choices items. Every list and choices item in the 5 seeded packs reaches the ledger when the advocate gave it.
3. Each list entry is its own ledger value with its own `raw_span`, copied verbatim from the source. An entry with no verbatim span is not stored as a fact; it goes to `unresolved` with its reason (T-147b AC5).
4. A choices value is stored only when it matches one of the item's allowed choices and has a verbatim span. A value outside the allowed choices goes to `unresolved`.
5. Test: `bail_regular` with `sections_charged` and `grounds_for_bail` given in the description renders both in the draft, not as `[To be confirmed: label]`.
6. Test: with neither given, both render as missing, as today.
7. Test: a list where one entry has no span keeps the entries that have one and puts the other in `unresolved`.
8. The brief shows list and choices items the same way the Drafter receives them (T-147b AC6).
9. No prompt text changes unless Ajay signs the diff.
10. Golden snapshots unchanged; if one moves, stop and report. CI green on all four services.

## Out of scope

- New questions for the packs (T-190)
- Code-computed facts (T-191, T-192)
- Items past the question cap (T-188)

## References

- T-147b, T-147c, T-188, ADR-022
