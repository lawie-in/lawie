# T-444: Subscription lifecycle handlers (halted, paused, pending, resumed, completed)

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 must-fix (money). Assigned to Shashank, after T-436 and after T-438 and T-399 merge. Priya, 15 Oct 2026 |
| Owner  | Shashank (build), Arjun (rules) |
| Mode   | Full chain (money, billing only) |

## Source

Arjun, 15 Oct 2026, from Tanvi's T-438 Explore. Rules are Arjun's, copied from his 01:10 note in the T-438 ticket.

## Problem

The Razorpay webhook handles only activated, charged, cancelled and expired. Every other event falls to `default:` and is ignored. A subscription whose payments are failing keeps Pro for ever, and a halted user can start a second subscription.

## Acceptance criteria

1. `pending`: no-op (Razorpay retries).
2. `halted` and `paused`: store the status, grant no further Ink, keep access until `paidThrough` (the last paid `current_end`). After that the existing expiry logic drops the user to free exactly as cancel-at-cycle-end does (T-399).
3. `resumed`: set `active`.
4. `completed`: treat as `expired`.
5. `authenticated` and `updated`: store the status only.
6. `createSubscription` reuse check matches every non-terminal status (`created`, `authenticated`, `active`, `pending`, `halted`, `paused`). Terminal statuses are `cancelled`, `completed`, `expired`.
7. Tests: one per status; "halted user loses Pro at paidThrough and not before"; "halted user cannot start a second subscription".

## Scope

Billing only. No web change. No legal content.

## Order

After T-438 (Tanvi: enum widening, constant-time secrets, admin-sync validation) and T-399 (Kunal: paidThrough expiry logic). Files to Priya after Explore.
