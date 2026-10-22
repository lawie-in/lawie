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

## Arjun (22 Oct 2026) — three calls after Explore (Shashank)

1. **Ensure-only at boot, not in the schema.** `ensureSubscriptionIndexes()` in the T-519 pattern: log + Sentry error and continue on failure (AC3). Tests that need the index call ensure; the T-516/T-527 duplicate-handling tests that seed two live rows on purpose keep running without it. Spec as proposed: `userId_1_live_unique`, `{ userId: 1 }`, unique, `partialFilterExpression: { status: { $in: ['created','authenticated','active','pending','halted','paused'] } }`. `$in` in a partial filter needs Mongo ≥ 6.0; the check script prints `db.version()` and the founder reads it before the index ever runs on develop. The existing non-partial `userId_1` stays; the AC4 test proves the two coexist. If Mongo refuses, stop and ask me — do not drop `userId_1` on your own.
2. **Write paths:** (A) `createSubscriptionLocked` — catch E11000 after the Razorpay create, cancel the new sub (`cancel(id,false)`), return the existing row or its checkout link (same outcome as T-527's post-create check, now enforced by the DB). (B) reconcile — cancel the user's local checkout rows first, then adopt; two live orphans → adopt the newest, report the others (paid at Razorpay, ops decides). (C) `adoptUnknownSubLocked` — report on E11000, ids only, never silent. (H) admin sync (`admin-billing.routes.ts`) — catch E11000, answer 409 with the ids; an admin never gets a 500 for a known conflict, and a terminal row is never revived over a live one.
3. **Data check script:** `apps/billing/scripts/check-live-subscription-duplicates.ts`, read-only, `MONGO_URI` only, no Razorpay secrets, no `--apply`, prints users with > 1 non-terminal row (userIds, sub ids, statuses, createdAt — ids only) and `db.version()`. `yarn workspace @lawie/billing check:live-sub-duplicates`. The founder runs it on develop; the crew never runs it against a hosted DB. He fixes any duplicates by hand before the index is enabled; until the script has been run clean, `ensureSubscriptionIndexes` is still safe because a failed build only logs.
