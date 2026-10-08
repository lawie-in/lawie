# T-164 — Affidavit place is never "Ranchi" by default

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Anushka (tests develop after the batch) |
| Mode           | Fix, light chain (developer + tester + reviewer). Merge to develop per founder's 8 Oct rule |
| Status         | Ready for Vishal |
| Size           | S (half day) |
| Depends on     | None. Cut from origin/develop |
| Branch         | fix/t-164-affidavit-place-not-ranchi |
| Legal sign-off | Not needed if the fix stays in `services/annexures.service.ts` and the blank is the existing `___________`. Any edit under a legal-content path (`config/court-rules/`, `config/document-rules/`, `config/courts/` ...): BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | T-156 developer report (`scratchpad/t156-dev-r1.md`, line 56) |

## Problem

The annexures pack's Affidavit (Annexure G) falls back to "Ranchi" when the form has no `place`, `city` or `district`: `annexures.service.ts` ~L449 (`place`) and ~L458 (`{place}` in `verification_format`). On the brief path those fields are usually absent, so a Patna, Lucknow or Delhi advocate files an affidavit that says "Verified at Ranchi". That is a false fact in a sworn document. Three of our four target states are not Jharkhand.

## User

District court advocate in Bihar, UP or Delhi who downloads the annexures pack.

## Solution

Remove the "Ranchi" default. Place = `formData.place ?? formData.city ?? formData.district`; if none is given, print the same visible blank the affidavit already uses for missing facts (`___________`, from `str()` / `safeEsc()`).

## Acceptance criteria

1. No `'Ranchi'` literal remains as a default anywhere in `annexures.service.ts` (grep in the report). Search `apps/drafting/src/services` and `apps/drafting/src/routes` for any other hard-coded city default and list each found; fix only those in `annexures.service.ts`.
2. Form with `place: 'Patna'`: Annexure G prints "Verified at Patna" (and the `place` variable, if rendered, is Patna).
3. Form with no `place` but `city: 'Lucknow'`: prints Lucknow. Form with only `district: 'Gaya'`: prints Gaya. Order stays place, then city, then district.
4. Form with none of the three: the verification prints `Verified at ___________ on this ...`. The word "Ranchi" does not appear anywhere in the pack HTML.
5. A Jharkhand form with `place: 'Ranchi'` still prints Ranchi (no regression).
6. Golden snapshots unchanged: the golden fixture already sets `place`, `city`, `district` to 'Ranchi', so `court-rules-golden` must pass without an update. If any snapshot changes, stop and report; do not update it.
7. Unit tests for 2–5 in `apps/drafting/src/__tests__/annexures.test.ts` (or a new `t164-*.test.ts`), run on the captured HTML.

## Out of scope

- Using the chosen court's city as the fallback (the main draft does this via `court_city`). Needs `courtData` in the pack, which arrives with T-156 (PR #65). Goes into T-165; Ajay to say whether court city is an acceptable place of verification.
- Who verifies for a jailed applicant (pairokar). Still on Ajay's open list.
- Hard-coded "S/o" / father line in the affidavit: T-159.
- The verification date blank.

## What Ajay must sign

Nothing, provided no legal-content path changes and the blank is the existing `___________`. Include the before/after "Verified at" line in Anushka's packet; "Verified at {place}" is on Ajay's open list, so cc him on the PR for a look (not a gate).

## Files (expected)

`apps/drafting/src/services/annexures.service.ts` (~L449, ~L458), one test file. T-156 (PR #65) changes the same file at ~L22 and ~L513–550 only, so a clean merge is expected. No overlap with `template-engine.service.ts`, so no conflict with PRs #62, #64, #66.
