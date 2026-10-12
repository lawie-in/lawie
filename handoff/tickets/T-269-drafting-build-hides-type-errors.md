# T-269 — The drafting `build` script exits 0 even when tsc fails

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Lead (build). Arjun (glance) |
| Mode           | Small fix. Package config: `apps/drafting/package.json` |
| Status         | To do. Unassigned. HIGH: CI and every crew run trust this build. Found by shashank, 12 Oct 2026 |

## Problem

The drafting `build` script is `tsc && cp … ; … ; true`. The trailing `; true` makes it exit 0 even when `tsc` fails, so CI and the crew never see type errors from it.

## Acceptance criteria

1. `build` fails (non-zero exit) when `tsc` fails. Copy steps that must not block stay non-blocking only if they can't hide a `tsc` error.
2. Run the build on current develop_staging. Every type error it was hiding is listed, and the real ones are fixed or ticketed before the change merges, so CI doesn't turn red on merge.
3. CI shows the failure when a deliberate type error is added (try it on a throwaway branch).
