# T-256 — t189 tests time out under load with coverage

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Lead (build) |
| Mode           | Small fix, test only (`apps/drafting/src/__tests__/t189-*.test.ts`) |
| Status         | To do. Queued for vishal right after T-200 (his test). Found by mahak; vishal analysed it, 12 Oct 2026 |

## Cause (vishal)

Jest's default 5-second timeout. The HTTP tests (AC5, AC7 and the route caps) make several supertest round trips, with 4–5 mocked model calls each, on in-memory Mongo under coverage. Shared state is clean.

There is also a second problem. AC7 doesn't assert status or outcome, and the route turns errors into 200 `{outcome:'unavailable'}`. So a slow run shows up as a confusing TypeError instead of a clear failure.

## Acceptance criteria

1. Add `jest.setTimeout(30_000)` in the t189 file.
2. AC7 asserts the status and the outcome before it reads `.facts`.
3. Five full runs with `--coverage` all pass.
