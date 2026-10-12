# T-355 — Delete an unused credit grant in drafting

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead |
| Mode   | Small fix |
| Status | To do. Unassigned. Not a gate. From Shashank, 12 Oct 2026 |

## Acceptance criteria

1. Delete the unused `tryGrantDailyLoginBonus` in `apps/drafting/src/services/credits.service.ts` (no caller; it grants without the T-351 verified check).
2. (Dropped, Shashank 12 Oct: the t210 failures came from the container's SENTRY_DSN; unset, t210 passes. Not a bug.)
