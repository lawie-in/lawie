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

## Arjun (15 Oct 2026, 02:30 UTC) — rulings on Shashank's Explore questions

**Shared change: allowed.** `settleYearlyDrip` (`packages/shared/src/billing/yearly-drip.ts`) is the one lazy-expiry path, so halted/paused expiry belongs there. Add `halted` and `paused` to the `ended` query (`paidThrough < now`), to the `current` guard (`paidThrough >= now`), and to the expired webhook's `otherActive` guard. Do **not** add them to the drip query (`status in [active, cancelled]`): a halted or paused plan drips nothing (AC2). Scope is now "billing + that one shared file and its tests". Priya: please extend Shashank's row to `packages/shared/src/billing/yearly-drip.ts` and its `__tests__`; `packages/shared` is one-lead-at-a-time, and merge slot v2 rule 7 applies (wait for CI before leaving the slot).

1. **paidThrough missing.** (a) then (b): fall back to `currentPeriodEnd`; if that is missing too, treat the paid period as over (expire on the next settle). Money rule: never keep Pro on a sub we cannot prove was paid. (c) is true pre-v1 but costs two lines to code, so code it. Confirmed: `halted`, `paused`, `pending`, `authenticated` and `updated` never write `paidThrough`; only `charged` does.
2. **Event order.** Yes, guard against stale downgrades. A `halted`/`paused`/`pending`/`updated` event is applied only if `entity.paid_count >= sub.lastGrantedPaidCount` (a halted after the charge carries the charge's paid_count; a stale one from before it carries less). Older: log at info with the ids, return 200, change nothing. `authenticated` moves a sub only from `created` to `authenticated`; from any other status it is a no-op 200. `charged` keeps its existing idempotency (paid_count / period) and stays the only event that grants.
3. **resumed → active, no grant.** Yes. The next `charged` grants; if the pause outlived `paidThrough` the user is free until that charge, which is correct (nothing was paid for that gap). Razorpay charges the overdue cycle on resume, so the gap is short in practice.
4. **halted → recovered.** Nothing extra, provided the `charged` handler sets `status: active` (and plan/paidThrough) from *any* prior status, not only from `authenticated`/`active`. Verify that in Explore's notes; if it is conditional, widen it.
5. **completed — amending my earlier note.** `subscription.completed` fires after the *last* cycle is charged, so the user has paid through that cycle. Treat it as **terminal like `cancelled`, not immediate like `expired`**: store `completed`, no renewal, access until `paidThrough`, then the lazy expiry drops the user to free. So add `completed` to the `ended` query and to the `current` guard's paid-through branch, exactly as `cancelled`. An immediate downgrade would strip a paid period, which we must not do. AC4 now reads: "completed: store the status; terminal; access until paidThrough (as cancelled)".
6. **Unknown `entity.status`.** Log at warn with the raw status and ids (no PII beyond the subscription id), count it in Sentry as a warning, return 200. Never 500-loop on a status we have not seen.
7. **createSubscription reuse.** Two branches: `created`/`authenticated` → return the existing sub's `short_url` as today (checkout not finished). `active`/`pending`/`halted`/`paused` → **409** `subscription_exists` with `{ status, planId, paidThrough }` of the existing sub; the user has to fix or cancel the live one first. Yes, fix the quirk: every reuse response carries the *existing* sub's `planId`, never the requested one. Web is out of scope; Priya, park "upgrade page shows a 'fix your payment' message on 409 subscription_exists" as a V1.1 web ticket. Until then the web shows its generic error, which is acceptable because the money is protected server-side.
8. **Tests.** Approach approved: drive `settleYearlyDrip` with injected `now`, as t399 does. "Loses Pro at paidThrough and not before" = two calls, `paidThrough - 1s` keeps Pro and drips nothing, `paidThrough + 1s` zeroes and downgrades once (second call a no-op). Add the stale-event test from (2) and the two reuse branches from (7). Cover `completed` with the same before/after pair as `cancelled`.

Order unchanged: build after T-438 lands (enum widening). If T-438 slips past the morning, tell me and I will decide whether T-444 carries the enum itself.
