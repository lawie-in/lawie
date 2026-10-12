# T-256 — t189 tests time out under load with coverage

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Lead (build) |
| Mode           | Small fix, test only (`apps/drafting/src/__tests__/t189-*.test.ts`) |
| Status         | Merged into develop_staging (addd9e7), 12 Oct 2026. Nothing to test in the UI |

## Cause (vishal)

Jest's default 5-second timeout. The HTTP tests (AC5, AC7 and the route caps) make several supertest round trips, with 4–5 mocked model calls each, on in-memory Mongo under coverage. Shared state is clean.

There is also a second problem. AC7 doesn't assert status or outcome, and the route turns errors into 200 `{outcome:'unavailable'}`. So a slow run shows up as a confusing TypeError instead of a clear failure.

## Acceptance criteria

1. Add `jest.setTimeout(30_000)` in the t189 file.
2. AC7 asserts the status and the outcome before it reads `.facts`.
3. Five full runs with `--coverage` all pass.

## Added 12 Oct 2026 (Shashank's finding)

`t189-ledger-list-choices.test.ts` L260 and L1653 assert `not.toContain('420')`. A random UUID sometimes contains "420", so the test fails about half the time (2 of 4 full runs). Make these asserts exact (check the field, not a substring of the whole text). Part of T-256.
