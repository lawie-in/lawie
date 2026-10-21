# T-527: Reconcile before create at Razorpay

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | To do, after T-526. Not blocking the v1 batch; BLOCKING before main (Arjun, 21 Oct 2026). Priya |
| Source | Arjun; T-518 and T-526 reviews |

## Problem
If `subscriptions.create` times out, the outcome at Razorpay is unknown. T-526 only alerts. A retry can create a second live subscription.

## Acceptance criteria
1. Before `subscriptions.create`, look up the customer's subscriptions at Razorpay (customer id / `notes.userId`). If a live one exists with no local row, adopt it: write the row and return it instead of creating again.
2. The adopt path is tested with a mock; in no timing can two live subscriptions exist for one user.
3. Logs carry ids only, never payloads or names.
4. A timed-out create can leave an orphan `created` subscription at Razorpay (no payment link, no double charge) when a retry follows after the 409 window (about 5 to 65 s): reconcile or cancel the orphan.
5. Startup guard (Arjun): refuse to boot if NODE_ENV=production with an `rzp_test_` key, or non-production with an `rzp_live_` key.
6. Reword the `SubscriptionCreateUnknownOutcomeError` comment (the real signal is `reportCreateTimeout`).
