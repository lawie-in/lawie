# T-508: Billing: cancel at cycle end and a complete status payload

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun, Vikram (design or review), a lead (build) |
| Mode   | Full chain |
| Status | To do. V1 (Priya, 17 Oct 2026). Unassigned until Priya claims a lead |
| Files  | apps/billing (routes, subscription.service.ts, test) |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

There is no route to cancel a subscription, and the status response may lack what a status card needs. Plan switching in V1 is cancel at cycle end, then buy the new plan, with no proration (Priya, with Arjun's proposal, 17 Oct 2026).

## Acceptance criteria

1. `POST /api/billing/cancel` cancels at the end of the current cycle at Razorpay and records cancelAtCycleEnd; idempotent; refuses when no live subscription exists.
2. Ink rules for a cancelled subscription follow the ink-ledger rules (Arjun confirms).
3. `GET /api/billing/status` returns tier, renewsAt, state (active, past_due, lapsed) and cancelAtCycleEnd.
4. After a cancelled cycle ends, the user can subscribe to another plan (T-444b behaviour stays).
5. Tests for cancel, double cancel, lapsed, and the status payload. Razorpay calls mocked.
