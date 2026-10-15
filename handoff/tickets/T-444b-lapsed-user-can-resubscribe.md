# T-444b: Lapsed user can resubscribe

| Field  | Value |
| ------ | ----- |
| Status | Todo. Shashank builds right after T-444 merges (b2d09ee9). Priya, 15 Oct 2026 |
| Owner  | Shashank (build), Arjun (rules) |
| Mode   | Small fix plus reviewer (money) |

## Source

Arjun, 15 Oct 2026, after T-444 round 3 passed. V1 blocker: today a lapsed user gets 409 for ever and can never come back.

## Acceptance criteria

1. A `halted`, `paused` or `pending` subscription whose `paidThrough` has passed no longer blocks `createSubscription`. It is written `expired` locally and a new subscription is created.
2. Before `paidThrough` the same statuses still return 409.
3. The webhook path with no `paid_count` keeps the `$nin` terminal guard (a terminal subscription is never revived).
4. Tests: lapsed halted, paused and pending each resubscribe; same statuses before `paidThrough` stay 409; no-paid_count event on a terminal subscription changes nothing.

## Files (claimed for Shashank, approved by Priya)

apps/billing/src/services/subscription.service.ts and the t444 tests only. Anything else: ask Priya first.

## Parked for V1.1 (Arjun)

- An `updated` event moving a live subscription back to `created` or `authenticated`.
- A `charged` event on an expired subscription leaving it in neither ended nor current.

## Out of scope

Web, legal content, packages/shared.
