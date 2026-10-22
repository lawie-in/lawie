# T-513: Billing cancel follow-ups (from T-508)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), Vikram (heads-up), a billing lead (build) |
| Mode   | Full chain (billing service) |
| Status | To do. V1.1 (Vishal's T-508 report, 17 Oct 2026). Priya |
| Source | T-508 review notes |

## Problem

Four loose ends from the cancel route (T-508):

1. A cancel retry can get stuck on a `try_again` response after a partial failure (Razorpay accepted the cancel, our record did not update).
2. Two concurrent cancel requests for one subscription are not guarded.
3. A webhook comment is stale after T-508 changed the flow.
4. Cancel has not been checked in the Razorpay sandbox on halted or paused subscriptions.

## Acceptance criteria

1. A partial failure is recoverable: a repeated cancel completes and records `cancelAtCycleEnd`; the user never sees a permanent `try_again`.
2. Concurrent cancels for the same user result in one cancel at Razorpay and the same success answer for both.
3. The stale comment is corrected or removed; no behaviour change.
4. Sandbox check of cancel on halted and paused subscriptions, with the result written in the ticket; a fix only if it fails.
5. Tests for 1 and 2; Razorpay calls mocked.
