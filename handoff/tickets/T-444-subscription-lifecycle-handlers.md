# T-444: Subscription lifecycle handlers (halted, paused, pending, resumed, completed)

| Field  | Value |
| ------ | ----- |
| Status | Explore done (Shashank, 15 Oct 2026). Building on feature/t-444-subscription-lifecycle; push after T-438 lands. Needs packages/shared/src/billing/yearly-drip.ts (lazy expiry), so not billing-only (Arjun 874ffe1b). Priya |
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
4. `completed`: store the status; terminal like `cancelled`, not immediate like `expired`. Access until `paidThrough`, then the lazy expiry drops the user to free (Arjun amended, 15 Oct).
5. `authenticated` and `updated`: store the status only.
6. `createSubscription` reuse check matches every non-terminal status (`created`, `authenticated`, `active`, `pending`, `halted`, `paused`). Terminal statuses are `cancelled`, `completed`, `expired`.
7. Tests: one per status; "halted user loses Pro at paidThrough and not before"; "halted user cannot start a second subscription".

## Scope

Billing and the lazy expiry in packages/shared/src/billing/yearly-drip.ts (with its tests). No web change (see T-446). No legal content.

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

Addendum (Arjun, 15 Oct 2026, 05:30 UTC): a halted/paused/updated event with no `entity.paid_count` is **applied**, not skipped — the stale-event guard in ruling 2 needs a present, lower paid_count; a missing one is not evidence, and applying only stops future Ink (access runs to paidThrough). Log that the guard was skipped. `pending` from the webhook is a no-op (AC1); a stored `pending` (admin sync only) counts as non-terminal for reuse (409) and drips nothing.

Review r1 fixes confirmed (Arjun, 15 Oct 2026, 05:35 UTC): (1) stored `pending` joins the still-paid guards (paidThrough only) and the lazy `ended` set; (2) `resumed` applies only from paused/halted under the stale guard; `updated` never writes `pending` and never moves halted/paused to active; (3) a late `charged` on a completed/cancelled/expired sub grants the paid cycle's Ink and sets paidThrough/lastGrantedPaidCount but does not revive the status; (4) 409 body stays flat `{error, status, planId, paidThrough}`.

Review r2 (Arjun, 15 Oct 2026, 05:37 UTC): `completed` joins the yearly drip query (a paid-in-full year drips to paidThrough); halted/paused/pending do not drip. A stored `pending` with no paidThrough uses the ruling-1 ladder (currentPeriodEnd, else ends on the next settle).

Round 3 approved (Arjun, 15 Oct 2026, 05:46 UTC), after two failed reviews. R2 must-fix: `charged` set `active` before winning the grant claim (a duplicate charged after paused/halted reactivated the sub; halted n could race before claim n+1); `updated` with `active` could revive a terminal sub; should-fix: `completed` must not overwrite `expired`. Rule for the fix: no status write outside the grant claim except the explicit transitions (authenticated from created; resumed from paused/halted under the stale guard; halted/paused/pending under the stale guard, $nin terminal; terminal writes, completed $ne expired). `charged` sets active only in the update that wins the claim, $nin terminal. Tests listed in my message to Shashank. Last round: a third failure pauses the ticket for the founder.

R3 addendum (Arjun, 05:50 UTC): `cancelled` also writes with status $ne expired (a late cancelled must not revive an expired user's drip or access). Nothing leaves `expired` except a new subscription.
