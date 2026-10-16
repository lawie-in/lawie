# T-481: Three form bugs: Confirm does nothing on first click, "No" on bail bonds cannot be selected, early typing is wiped

| Field  | Value |
| ------ | ----- |
| Status | To do. V1. Priya, 16 Oct 2026 |
| Owner  | Tanvi (after T-478), web lead |
| Mode   | Full chain (web, no legal text) |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw

1. The first click on "Confirm brief and continue" after editing a field does nothing (seen 4 times); also on the caveat.
2. In default bail, the "No" button on the bail-bonds question cannot be selected, in the questions or on the brief (tried 3 times). As a result the draft prints "11. That the applicant undertakes to furnish bail bonds..." wrongly.
3. Text typed within a few seconds of opening "New document" is wiped silently.

## What

Reproduce each, fix the cause, add a test for each. Check that the "No" answer reaches the draft.

## Acceptance criteria

- Confirm works on the first click after an edit; "No" selects and removes the bond undertaking; early typing is kept.
- Web tests for each; no legal text changes.


## Ajay's ruling on bug 2 (16 Oct 2026, T-245 file 5bc76d1a)

- Yes -> the existing undertaking, unchanged.
- Not answered -> "That the applicant [To be confirmed: whether the applicant is prepared to furnish bail and bonds as directed by this Hon'ble Court]."
- No -> no undertaking (a post-check strips it), plus an in-app note, not in the draft: "Default bail under Section 187(3) BNSS is available only if the accused is prepared to furnish bail. Check this before filing."
- Claim extended to default_bail.json (instruction 9) and the t251 test; the in-app note is web side. Ajay byte-checks the pack text.
