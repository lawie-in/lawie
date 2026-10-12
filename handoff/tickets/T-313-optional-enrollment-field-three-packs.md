# T-313 — Optional advocate enrollment field in three packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (asked; signs the field label and the diff). Lead (build, drafting packs) |
| Mode   | Small fix (legal content, pack JSON) |
| Status | Merged into develop_staging (a6b2162, 12 Oct 2026). Waiting for Anushka on develop |

`bail_regular`, `bail_anticipatory` and `consumer_complaint` have no `advocate_enrollment` field. An advocate drafting for another advocate gets a blank Bar Council number and has no way to type one.

## Acceptance criteria

1. Each of the three packs gets an optional `advocate_enrollment` field, using the same label as the packs that already have it (Ajay confirms the label).
2. T-311's order applies: the typed value first, then the profile number if the field is empty, then the blank. A "[To be confirmed: …]" placeholder stays as it is.
3. Leaving the field empty never blocks the draft.
4. Tests cover the typed value and the empty field for one of the three packs. Ajay signs the diff.
