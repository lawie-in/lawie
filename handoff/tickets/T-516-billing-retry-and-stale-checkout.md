# T-516: Retry a failed payment, and stop choosing Pro landing on a Solo checkout

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing service, billing) |
| Status | To do. V1 candidate (Vishal's T-509 report, 17 Oct 2026). Priya |
| Source | T-509 known gaps |

## Problem

1. A user whose plan is past_due (payment failed) sees the signed payment-failed banner but no Retry button, because `/subscribe` answers 409 `subscription_exists` and returns no link.
2. With an unfinished checkout, `/subscribe` returns that checkout's link and plan. Choosing Pro can therefore open a Solo checkout. This predates T-509.

## Acceptance criteria

1. For a past_due subscription, billing returns the live subscription's Razorpay payment link (short_url) in a defined response, for the signed-in owner only.
2. Choosing a plan while an unfinished checkout exists for a different plan never opens the other plan's checkout: the stale checkout is cancelled or replaced, and the link returned matches the plan asked for.
3. Choosing the same plan again returns the same unfinished checkout (no duplicate subscriptions).
4. No new Razorpay subscription is created while a live one exists for the user.
5. Tests for 1 to 4, Razorpay mocked. Sandbox check written in the ticket.
6. Web: once AC1 ships, a small follow-up adds the Retry button to the payment-failed banner (separate web ticket; not part of this one).

## Out of scope
Proration, plan switching rules (cancel at cycle end, then buy), refunds.
