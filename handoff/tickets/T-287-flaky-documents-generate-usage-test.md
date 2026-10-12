# T-287 — documents.generate.usage.test.ts failed once under load

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Unassigned. Found by Vishal (T-263), 12 Oct 2026 |
| Mode   | Small fix |
| Status         | Merged to `develop_staging` (620ac98, 12 Oct 2026). Heartbeat 5b/5e fixed. Usage test: watch item T-287a |

`apps/drafting/src/__tests__/documents.generate.usage.test.ts` failed once under load and passed on re-run. Details are in the T-263 board comment. Root-cause it (timing or shared state); do not skip or loosen the test. Touches tests in `apps/drafting` only, so check the claim record for overlap before assigning.

## Acceptance criteria

1. The cause is found and fixed; the test passes 20 runs in a row under parallel load.
2. No test is skipped or weakened.

## Second case (Shashank, 12 Oct 2026)

`t226-ink-holds.heartbeat.test.ts`, test "5b: … sweep releases it after the TTL", failed once (expected 1, got 0) in a full drafting run on `develop_staging`, then passed twice alone. Likely timing under parallel load (fake timers or a real interval). Root-cause it with the first case; do not skip or loosen. Mahak wrote it and knows the timers. Watch for the same failure in CI.
