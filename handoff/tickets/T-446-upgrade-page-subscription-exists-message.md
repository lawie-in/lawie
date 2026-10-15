# T-446: Upgrade page shows a 'fix your payment' message on 409 subscription_exists

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1. After T-444 merges. Priya, 15 Oct 2026 |
| Owner  | Lead (web) |
| Mode   | Small fix (web only) |

## Source

Arjun, 15 Oct 2026, from T-444. T-444 AC7 makes createSubscription return 409 `subscription_exists` when a user already has an active, pending, halted or paused subscription. Until this ticket, the web shows a generic error.

## Acceptance criteria

1. When the upgrade or subscribe call returns 409 `subscription_exists`, the page says in plain words that a subscription already exists. If its status is halted or paused, it says the payment needs fixing and links to where the user can do that (wording by Meera/Madhuri; Rajesh if a design change is needed).
2. A test covers the 409 case for each status.
3. No billing change.

## Scope

Web only, the upgrade page. Not a launch blocker (V1.1).
