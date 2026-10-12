# T-287 — documents.generate.usage.test.ts failed once under load

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Unassigned. Found by Vishal (T-263), 12 Oct 2026 |
| Mode   | Small fix |
| Status | To do. Unassigned |

`apps/drafting/src/__tests__/documents.generate.usage.test.ts` failed once under load and passed on re-run. Details are in the T-263 board comment. Root-cause it (timing or shared state); do not skip or loosen the test. Touches tests in `apps/drafting` only, so check the claim record for overlap before assigning.

## Acceptance criteria

1. The cause is found and fixed; the test passes 20 runs in a row under parallel load.
2. No test is skipped or weakened.
