# T-160 — Addressing clause names the city once

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Anushka (tests develop after the batch) |
| Mode           | Fix, light chain (developer + tester + reviewer). Merge to develop per founder's 8 Oct rule (as relayed by Vishal) |
| Status         | Merged to develop (PR #62), 8 Oct. Anushka tests on develop. |
| Size           | S (half day) |
| Depends on     | None |
| Branch         | fix/t-160-addressing-clause-names-city-once |
| Legal sign-off | Not needed if the fix stays in `template-promoter.ts` / `template-engine.service.ts` and only removes a repeated city. If it needs an edit under `config/document-rules/`, `config/court-rules/`, `config/courts/` or another listed legal-content path: BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | Overnight build finding |

## Goal

"TO, THE HON'BLE CHIEF JUDICIAL MAGISTRATE, PATNA, Patna" becomes "TO, THE HON'BLE CHIEF JUDICIAL MAGISTRATE, PATNA".

## Likely cause (Priya, from a read, not reproduced)

`template-promoter.ts` ~line 660: `'TO,\nTHE HON’BLE {court_designation},\n{court_city}\n\nMOST RESPECTFULLY SHOWETH:'`. Court designations from `courts/indian-courts.json` already end with the city.

## Acceptance criteria

1. CJM Court, Patna (stubbed model): addressing clause names Patna once.
2. A court whose designation does not contain the city (e.g. a generic fallback) still prints the city line once.
3. Match is case- and punctuation-insensitive ("PATNA" vs "Patna", trailing comma).
4. Same check for any other addressing/heading section that appends `{court_city}` after `{court_designation}`; list each one found in the report.
5. "Place:" in the advocate block and "Verified at" are unchanged (they should carry the city).
6. Unit test covering 1–3; golden snapshots not auto-updated; any snapshot change listed in the PR.

## Out of scope

- Raw court codes on screen; court heading wording; "IN THE COURT OF" duplication (fixed in T-146).

## What Ajay must sign

Nothing, provided no legal-content path changes. If one does, the exact diff.

## Files (expected)

`services/template-promoter.ts` (possibly `services/template-engine.service.ts` helper), a new test. No overlap with T-153/T-157/T-139 files, except `template-engine.service.ts` if used — T-153 is not expected to change it.
