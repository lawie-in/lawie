# T-355 — Two small clean-ups found in T-351

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead |
| Mode   | Small fix |
| Status | To do. Unassigned. Not a gate. From Shashank, 12 Oct 2026 |

## Acceptance criteria

1. Delete the unused `tryGrantDailyLoginBonus` in `apps/drafting/src/services/credits.service.ts` (no caller; it grants without the T-351 verified check).
2. Auth tests `t210-e11000-sentry` and `t210-review-fixes` pass under `--runInBand` (today Sentry.init is called twice). CI is unaffected, but local runs are noisy.
