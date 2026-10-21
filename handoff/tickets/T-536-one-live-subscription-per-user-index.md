# T-536: One live subscription per user (partial unique index)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design: detail in T-527's round-2 section), a billing lead (build) |
| Mode   | Full chain (billing; touches Subscription.model.ts, so its own claim) |
| Status | To do, after T-527. BLOCKING before main, not the v1 batch. Priya |
| Source | Arjun, 21 Oct 2026 |

## Acceptance criteria
1. A partial unique index on `Subscription { userId }` where the status is non-terminal, created idempotently at billing startup (the T-519 pattern).
2. A data check comes first: an aggregate that finds users with more than one non-terminal subscription row on develop's database. The report holds ids only. The founder fixes duplicates by hand before the index lands.
3. If the index build fails, billing logs, continues to start (no crash) and sends a Sentry error.
4. Tests: creates the index once with that key and filter; idempotent; failure path logs and continues; a second live subscription for one user is rejected at the database.

## Files
apps/billing: models/Subscription.model.ts, startup index config (beside the T-519 one), tests.
