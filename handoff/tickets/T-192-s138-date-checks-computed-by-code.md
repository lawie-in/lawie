# T-192 — Code computes the s.138 date checks

| Field          | Value                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                  |
| Owner          | Vishal (build). Ajay signs the logic. Anushka (verdict)                                                                 |
| Mode           | Build, full chain. Merge to develop                                                                                     |
| Status         | Merged into develop_staging 5dd6388 (12 Oct 2026). Ajay signed 527421d + 63b9b13. Anushka tests on develop |
| Size           | M (1 day), plus Ajay's sign-off time                                                                                    |
| Depends on     | T-147c (the banned entries and their unlock keys)                                                                       |
| Gate           | Before `notice_within_thirty_days` or `presented_within_validity` may unlock for any user. Until then both stay banned, which is fail-safe |
| Branch         | feature/t-192-s138-date-checks                                                                                          |
| Legal sign-off | Needed. Ajay signs the computation logic and the text the advocate sees                                                 |
| Created        | 2026-10-10                                                                                                              |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                          |

## Problem

`legal_notice_s138` cannot aver that the cheque was presented in time or that the notice was sent in time. Both are banned under T-147c, and the model must never compute dates.

## User

District court advocate sending a cheque-bounce notice who needs the two limitation checks done correctly and shown to him.

## Solution

Code computes two checks under s.138 NI Act:

- **Proviso (a):** the cheque was presented within 3 months or within its validity
- **Proviso (b):** the notice is sent within 30 days of receiving the return memo

Each check unlocks one entry: (a) unlocks `presented_within_validity`, (b) unlocks `notice_within_thirty_days`. The advocate sees the inputs.

## Acceptance criteria

1. Ajay signed the logic (inputs, periods, day counting, missing inputs) in `handoff/legal/T-192-s138-date-checks-signed.md` (fa246a7). Build to that file.
2. Inputs are ledger facts only: the cheque date, its validity if stated, the presentation date, the date the return memo was received, and the notice date. No input comes from the model.
3. Code computes both checks. The model never computes or states a date difference.
4. The brief shows the inputs and each result.
5. Each entry unlocks only when its check passes. A failed check keeps the entry banned and the brief says why.
6. A missing input leaves the entry banned and prints `[To be confirmed: label]` for that input.
7. Tests: each check one day inside, on the last day and one day outside the period, and each missing input.
8. Golden snapshots unchanged; if one moves, stop and report. CI green on all four services.

## Question for Ajay

- Proviso (a) says six months in the statute. The 3 months here is the cheque validity set by the RBI. Ajay confirms which period the code uses, and what it does when the cheque states a different validity.

## Out of scope

- The complaint under s.138 (only the notice pack)
- Any limitation check for the complaint itself

## References

- T-147c, ADR-022, NI Act s.138 provisos (a) and (b)

## Scope note (Priya, 12 Oct 2026)

AC4 is met in T-192 by showing the inputs and results in the Drafter's FACTS. Showing them in the web brief before drafting needs Mahak's T-190 files (ledgerView, intake.service.ts, the web brief), so that part moves to T-337, after T-190 merges.

## Arjun (12 Oct 2026): convention for code-computed facts (applies to T-191 too)

1. **Add `FactSource = 'user' | 'asked' | 'computed'`** in `packages/shared/src/types/fact-ledger.ts`. Do not reuse `'asked'`: it would record that the advocate said something they did not, and provenance is what the ledger is for. A one-member union addition; `packages/shared` must be on Vishal's claim row first (Priya), and `@lawie/shared` is rebuilt before drafting tests.
2. **Computed facts are never stored.** Derived on every request from the stored `user`/`asked` facts, appended after `ledger.facts` is built (your ~:1126 point), by a pure module (`s138-date-checks.ts`; T-191's own module likewise). So when the advocate edits a date, the result cannot go stale. No write to the ledger collection, no encryption question.
3. **Inputs only from `user`/`asked` facts**, never from another computed fact or model text. Appended only on pass, `required_in_draft: false`. A fail or a missing input adds nothing (the averment stays locked); whether a fail also shows a soft preflight note is the ticket's AC, not this convention.
4. **Not shown as a user fact.** Any UI or brief listing of facts either skips `source: 'computed'` or labels it "worked out from your dates"; it is never offered for editing.
5. Tests: the pure module (boundary dates: day 30/31, day 15/16, leap year), the route appends on pass only, nothing computed is persisted, and the union change compiles in every workspace that imports `FactSource`.
