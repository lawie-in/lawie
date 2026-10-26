# T-589: billing — subscription lifecycle emails (failed, activated, halted, cancelled)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder rule 26 Oct 2026: every customer event sends an email) |
| Owner  | Arjun (raised), Shashank or Vishal (after T-588, same file area) (build) |
| Mode   | Full chain (billing + email-worker) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | handoff/ops/email-audit-2026-10-26.md (Arjun) |

## Problem
Customers get no mail when a payment fails, a subscription activates, halts or is cancelled.

## Acceptance criteria
1. Four enqueue calls in apps/billing/src/services/subscription.service.ts: payment.failed ~:2881, activated ~:2423, halted/paused ~:2796, cancelled ~:2753.
2. Four small templates in apps/email-worker (ids paymentFailed and subscriptionConfirmed already reserved in packages/email-client; add the other two).
3. Madhuri writes the copy; Ajay does one pass. One mail per event, idempotent on the Razorpay event id.
4. Tests per event and for a replayed webhook. Billing and email-worker tests and build green.

## Files
apps/billing/src/services/subscription.service.ts (four hooks), apps/email-worker templates, packages/email-client names, their tests. After T-588 merges (same file). Lead confirms after Explore.
