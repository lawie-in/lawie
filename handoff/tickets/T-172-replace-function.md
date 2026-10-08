# T-172 — Affidavit prints the advocate's text literally, even with "$"

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Anushka (tests develop after merge) |
| Mode           | Fix, light chain (developer + tester + reviewer). Code only. Merge to develop per founder's 8 Oct rule |
| Status         | Merged to develop (PR #69), 8 Oct. Anushka tests on develop. |
| Size           | XS (2 hours) |
| Depends on     | None. Cut from origin/develop (cb3bda5) |
| Branch         | fix/t-172-replace-function |
| Legal sign-off | Not needed: no legal-content path changes and printed text is unchanged for any input without `$`. Any edit under a legal-content path: BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | Found during T-164 review |

## Problem

`annexures.service.ts` ~L475–479 fills the affidavit's `verification_format` with `String.prototype.replace(pattern, string)`. When the replacement is a string, JavaScript reads `$&`, `$'`, `` $` ``, `$$` and `$1` in it as patterns. User text goes into that string (deponent name, designation, place), so a name or place containing `$&` prints the placeholder (`{deponent_name}`) instead, and `$'` pulls in the rest of the template. Rare, but it corrupts a sworn document silently.

## User

Any advocate who downloads the annexures pack.

## Solution

Pass a function as the replacement (`.replace('{x}', () => value)`) for every placeholder in that chain, so the value is inserted literally.

## Acceptance criteria

1. All five `.replace` calls at ~L475–479 use a function replacement.
2. Test: a deponent name containing `$&` (for example `Ram $& Sons`) prints exactly `Ram $&amp; Sons` after HTML escaping, i.e. literally, and `{deponent_name}` does not appear in the output. Same for a place containing `$'`.
3. Existing `annexures.test.ts` and T-164 tests green; golden snapshots unchanged (if any change, stop and report).
4. Grep `apps/drafting/src/services` and `apps/drafting/src/routes` for other `.replace(…, <string built from user input>)` calls; list each in the report with file:line. Fix only `annexures.service.ts`.

## Out of scope

- Other call sites found by AC 4 (logged as follow-ups from the report).
- Placeholder text inside user input (a name containing `{place}` is substituted by the next call). Report whether it happens; do not fix here.
- The default `'the above-named Applicant/Petitioner'` wording.

## What Ajay must sign

Nothing. Output is identical for inputs without `$`.

## Files (expected)

`apps/drafting/src/services/annexures.service.ts` (~L475–479), `apps/drafting/src/__tests__/annexures.test.ts` (or a new `t172-*.test.ts`).
