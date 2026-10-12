# T-309 — Section picker: follow-ups from T-290 review

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Tanvi (build, web + test). Ajay sees any string |
| Mode   | Small fix |
| Status | Merged into develop_staging (ed989ee, 12 Oct 2026). Waiting for Anushka on develop |

1. The title tests compute the expected title with the same resolver as the route. Add literal titles taken from the signed table.
2. One chip over 100 characters, or more than 30 chips, makes every chip show the failure line (S8) with no retry until the list changes. Add maxLength 100, a 30-chip cap, and a retry.
3. A future item with no code would render no line. Show S8 instead.

## Acceptance criteria

Each item fixed with a test. No new strings beyond Ajay's signed S1-S8 (a cap message, if needed, goes to Ajay first).
