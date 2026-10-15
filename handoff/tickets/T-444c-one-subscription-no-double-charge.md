# T-444c: One subscription per user, no double charge on resubscribe

| Field  | Value |
| ------ | ----- |
| Status | Todo. Shashank builds after T-444b merges (Priya, 15 Oct 2026) |
| Owner  | Shashank (build), Arjun (rules) |
| Mode   | Small fix plus reviewer (money) |

## Source

Arjun, 15 Oct 2026, after T-444b passed review. V1 must-fix.

## Acceptance criteria

1. A per-user Redis lock wraps `createSubscription`, so two parallel calls cannot create two Razorpay subscriptions (pre-existing race). The second caller gets a clear conflict response, not a second subscription.
2. When a lapsed halted, paused or pending subscription is expired locally so the user can resubscribe (T-444b), it is cancelled at Razorpay first.
3. If that Razorpay cancel fails, fail closed: return 503, create no new subscription, leave the old one as it was. Otherwise a Razorpay retry on the old subscription could charge the user twice.
4. Tests: parallel create calls produce one Razorpay subscription; cancel succeeds then new sub is created; cancel fails gives 503 and no new sub; lock is released on error.

## Files (claimed for Shashank, approved by Priya)

Same as T-444b: apps/billing/src/services/subscription.service.ts and the t444 tests. Lock helper: use the billing service's existing Redis client; no new package. Anything else: ask Priya first.

## Out of scope

Web, legal content, packages/shared, the parked V1.1 lines in T-444b.
