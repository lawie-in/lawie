# T-179 — A Delhi family court heading names its complex, or says it is to be confirmed

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build) and Ajay (strings and complex list, AJ-2026-10-08-T179) |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Changes printed legal text. Must land before Delhi go-live (AJ-2026-10-08-T176, item 3) |
| Status         | Merged to develop (PR #78), 9 Oct. Anushka tests on develop. |
| Size           | S (half day) |
| Depends on     | T-176 (merged, PR #76). Cut from origin/develop (e8e3730) |
| Branch         | fix/t-179-delhi-family-court-complex |
| Legal sign-off | Ajay supplies and signs the placeholder string, the list of Delhi complexes and the heading each prints (AJ-2026-10-08-T179), and any golden diff (AC 6), before merge. No string or complex name is written until his ruling is in the handoff packet. If it is missing: BLOCKED for Ajay. Expected to be code only; any edit under a legal-content path (`config/court-rules/`, `config/courts/` ...): BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | FU-T176-1 of Ajay's ruling AJ-2026-10-08-T176 (item 3) |
| Testing        | Founder wants testing kept short: one 15-minute pass. |

## Problem

Delhi has several family court complexes. "Delhi" alone is not a seat.

- **"Family Court, Delhi" prints "IN THE FAMILY COURT AT DELHI".** It does not say which complex. Ajay approved this for T-176 only on condition it is fixed before Delhi go-live.
- **"Family Court, Saket Courts, New Delhi" prints the placeholder.** `familyCourtSeat` (`apps/drafting/src/services/post-processor.ts`) rejects any part matching `NOT_A_SEAT`, and that list includes "courts". So the way Delhi advocates usually write a complex ("Saket Courts", "Rohini Courts") gives no seat.

## User

District court advocate in Delhi filing a family matter. A heading that says only "DELHI" has to be hand-corrected before filing.

## Solution

- Typed "Family Court, Delhi" or "Family Court, New Delhi", with no complex: print Ajay's placeholder heading. His draft is "IN THE FAMILY COURT AT [To be confirmed: district/complex], DELHI". The final string comes per AJ-2026-10-08-T179.
- Typed Delhi complex name, with or without "Courts" ("Saket", "Saket Courts"): counts as the seat and prints as Ajay rules.
- "Courts" is accepted only after a complex on Ajay's list. Everywhere else `NOT_A_SEAT` behaves as today.

## Acceptance criteria

1. **Delhi / New Delhi with no complex.** "Family Court, Delhi" and "Family Court, New Delhi" each print Ajay's placeholder heading per AJ-2026-10-08-T179, verbatim. Never "IN THE FAMILY COURT AT DELHI". Tested for both. The T-176 pin for "Family Court, Delhi" (`t176-family-court-seat-heading.test.ts`, AC 1) is updated to the signed string; no other T-176 test changes.
2. **Each listed complex.** For every Delhi complex Ajay lists, the typed name prints the heading he rules. Tested per complex, with and without "Courts". The PR body pastes each line for Ajay.
3. **"Saket Courts".** "Family Court, Saket Courts, New Delhi" prints the Saket heading per Ajay's ruling, not the placeholder. Tested. A "... Courts" name that is not on Ajay's list (e.g. "Family Court, Civil Courts, Patna") still prints "[To be confirmed: place]". Tested.
4. **Patna, Lucknow, Ranchi unchanged.** Their typed headings, the judge-title cases and the numbered-court cases from T-176 print exactly as today. Existing `t176-*` and `t174-*` tests pass unedited (except the one pin in AC 1).
5. **List path unchanged.** Every family court entry picked from the courts list (including Tis Hazari, Patiala House, Saket, Rohini) prints its stored designation as today.
6. **Golden snapshots.** Run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay. Read `.claude/docs/golden-snapshots.md` first.
7. **Full suite green.** The full drafting suite passes, with counts reported. `@lawie/shared` is built first.

## Out of scope

- Family court case numbering per state (T-177).
- `family_court.json` citation and `courtType` (T-178).
- Judge title in the heading (FU-T176-2) and inserting a heading when the LLM writes none (FU-T176-3).
- Adding or editing Delhi entries in `indian-courts.json`.
- Complexes in other cities (Mumbai, Hyderabad ...).

## What Ajay signs

The Delhi / New Delhi placeholder (AC 1), the complex list and each complex heading (AC 2–3), and any golden diff (AC 6). Anushka's verdict is still required before merge.

## Files (expected)

`apps/drafting/src/services/post-processor.ts` (`familyCourtSeat`, `NOT_A_SEAT`), `apps/drafting/src/__tests__/t176-family-court-seat-heading.test.ts` (the one Delhi pin), one new test file (`apps/drafting/src/__tests__/t179-*.test.ts`). Reads `config/courts/indian-courts.json`; does not edit it.
