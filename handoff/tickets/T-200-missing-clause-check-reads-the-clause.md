# T-200 — The missing-clause check looks at the clause, not only its paragraph number

| Field          | Value                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                                   |
| Owner          | Ajay (rule: what counts as present, signs). Lead (build). Anushka (verdict)                                              |
| Mode           | Rule first (Ajay), then build, full chain                                                                                |
| Status         | To do. Waits for Ajay's rule                                                                                             |
| Size           | Ajay S. Build M (1 day)                                                                                                  |
| Depends on     | T-136 (the check exists)                                                                                                 |
| Gate           | Before `feature.fact_ledger` for real users and before v1 go-live: a missing mandatory clause can pass as present        |
| Branch         | fix/t-200-missing-clause-check                                                                                           |
| Legal sign-off | Needed. `apps/drafting/src/services/brief-drafter.ts` is legal content (T-136 rules)                                     |
| Created        | 2026-10-11                                                                                                               |
| Source         | Finding from the T-147 build, 11 Oct 2026                                                                                |

## Problem

`findMissingClauses` (`brief-drafter.ts`) counts a mandatory clause as present when the Drafter reports it at paragraph N and paragraph N exists in the body. It does not check that paragraph N still holds the clause. After a repair pass, a fact-check removal or renumbering, the number survives while the clause is gone, and the check passes.

## User

Advocate who relies on Lawie to include every clause the law requires, e.g. the earlier-bail-applications disclosure.

## Solution

Ajay states what proves a clause is present (for example its fixed wording, or a cue from the pack). Code checks that in the reported paragraph.

## Acceptance criteria

1. Ajay writes the rule here and signs it: for clauses with `fixedText`, and for clauses without it.
2. A clause whose reported paragraph exists but no longer carries the clause is reported missing with a new reason (e.g. `clause_not_in_paragraph`).
3. Test: clause at paragraph 5, paragraph 5 replaced by other text → missing.
4. Test: renumbered body where the clause moved from 5 to 6 and the report says 5 → missing, then fixed by the repair pass.
5. Test: today's passing cases still pass (T-136 tests unchanged).
6. No prompt text changes unless Ajay signs the diff.
7. Golden snapshots unchanged; if one moves, stop and report. CI green on drafting.

## Out of scope

- Clauses with `appliesWhen` (still not checked by code)
- The repair prompt

## References

- T-136, `handoff/design/T-136-drafter-rules-signed.md`
