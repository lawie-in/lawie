# T-399 — Yearly plans grant Ink every month, not once a year

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (billing); Arjun confirms the design, Vikram the numbers |
| Mode   | Full chain (billing) |
| Status | Confirmed by Arjun; numbers signed by Vikram (bd8c8b9); cancel ruled by Ajay (handoff/legal/T-399-yearly-cancel-signed.md). Kunal, after T-395. Founder: how many yearly subs sold (morning report 0g). Yearly toggle off until merged |
| Source | Ajay, T-398 sign-off (handoff/legal/T-398-pro-card-signed.md) |

## Problem

`grantSubscriptionInk` (apps/billing/src/services/subscription.service.ts ~:208) grants Ink on each billing renewal. A yearly plan renews once a year, and there is no monthly grant for yearly plans. The only hint is a comment in credit-skus.ts, "monthly drip — same monthly grant per renewal". So a yearly buyer (solo_yearly, pro_yearly) may get 50 or 150 Ink once a year. That makes "150 Ink/month", "refills every month", "save 2 months" and Ajay's signed FAQ line for Solo yearly false.

## Acceptance criteria

1. Arjun confirms the current behaviour, with a test that shows it.
2. Yearly plans grant `inkPerCycle` every month for 12 months, with the same expiry and refill rules as monthly plans. Arjun picks the mechanism: a scheduled job or a grant schedule set at purchase.
3. Tests cover a yearly purchase across 12 months, cancel mid-year, and a renewal.
4. If any yearly plan has already been sold, the founder learns how many, and those users get the missing Ink.
5. Ajay releases the HELD yearly lines once the fix is merged and tested.

## Arjun (13 Oct 2026): confirmed, and the mechanism

**Confirmed.** Ink is granted only inside the `subscription.activated` / `subscription.charged` webhook cases (`subscription.service.ts:186-214`). A yearly Razorpay subscription is charged once a year, so `solo_yearly` / `pro_yearly` get `inkPerCycle` (50 / 150) once a year. The "monthly drip" comment in `credit-skus.ts` describes nothing that exists. There is no job runtime in billing (D5 puts repeatable jobs in email-worker, which must not touch billing data).

**Mechanism: lazy drip, no scheduler.** The Subscription row gets `inkDripNextAt` (set at purchase to charge date + 1 month) and `inkDripCount` (0–11). Every balance read and every hold (`getInkBalance`, the `enforceCredits` hold path) first calls `settleYearlyDrip(userId)`: if the subscription is yearly and active and `inkDripNextAt <= now`, grant one month's `inkPerCycle` with the same reset rule as a monthly renewal, write a ledger row with a unique key `sub_drip:<razorpaySubscriptionId>:<n>` (idempotent under concurrent reads), advance `inkDripNextAt` by one month and `inkDripCount` by one; repeat while behind, never past 11. The yearly `subscription.charged` resets the counters and applies the annual carry as today. Cancel/expire stops the drip. Why lazy: Ink matters only when it is spent, every spend goes through the hold, and it needs no job runtime, cron or clock skew handling; a balance shown on the dashboard is therefore always current when the user is there.

**Tests (AC3):** yearly purchase then 12 monthly reads → 12 grants, the 13th read grants nothing; a read 3 months late grants 3 at once, idempotently; cancel mid-year → no further grant; renewal → counters reset and the carry applies; two concurrent reads → one ledger row. One test proves the bug on today's code first (AC1).

**AC4:** a one-off script `apps/billing/scripts/backfill-yearly-drip.ts` that lists yearly subscriptions and grants the months elapsed since purchase through the same `settleYearlyDrip`. The lead runs it once with the founder's count; dry-run mode prints, `--apply` writes.

Billing lead (Kunal holds billing): Priya assigns and claims `subscription.service.ts`, `ink-ledger.service.ts`, `Subscription.model.ts`, `enforceCredits` (shared), the new script and tests.

## Vikram (13 Oct 2026)

The numbers don't change, only the timing: solo_yearly ₹7,990 gives 50 Ink/month (600 a year), pro_yearly ₹19,990 gives 150 Ink/month (1,800 a year). Drips follow the monthly reset rule. The capped annual carry stays, but is never advertised. "Save 2 months" is true once the drip ships.

Open (Arjun + Ajay): "cancel stops the drip" on a prepaid year is a refund-policy question. Finance's position: cancel means no renewal, and the drip runs to the end of the paid period, unless the unused months are refunded.

## Ajay (13 Oct 2026): cancel rule

Cancelling a yearly plan stops the renewal. The monthly drip keeps running to the end of the paid year. This replaces "cancel stops it" in AC/design; update the test to match. A refund-page sentence (signed in handoff/legal/T-399-yearly-cancel-signed.md) ships with T-399. Ajay releases the held T-398 yearly lines as written once T-399 is merged and tested.

## Arjun (13 Oct 2026): cancel semantics (Vikram's flag, handoff/finance/T-399-T-398-vikram.md)

Vikram is right and the code is wrong today for both cycles. Facts: billing never calls a Razorpay cancel API; a cancel only arrives as the `subscription.cancelled` / `subscription.expired` webhook (Razorpay dashboard or support). On `cancelled`, `cancelSubscriptionInk` zeroes `inkSub` and `inkAnnualCarry` at once (`ink-ledger.service.ts:413`), which takes paid-for Ink away.

Ruling, cancel-at-cycle-end for every plan: a cancel means no renewal; the paid period runs to its end (`current_end` in the webhook payload, stored on the Subscription as `paidThrough`). Until `paidThrough`: the balance is kept and, for yearly, the monthly drip continues (`settleYearlyDrip` checks `paidThrough`, not `status`). At `paidThrough` (the `subscription.expired` webhook, or the lazy settle noticing `now > paidThrough`): zero `inkSub` and the carry as today. Immediate stop happens only on a refund of unused months, through a separate refund path that does not exist yet and is written only if Ajay's refund policy allows a refund (T-399 does not build it). Monthly plans follow the same rule, so a monthly buyer who cancels on day 2 keeps the month. Tests: yearly cancel in month 4 → drips through month 12, nothing in month 13; monthly cancel mid-period → balance kept until `paidThrough`, zeroed after.

Signed refund-page sentence (Ajay): "If you cancel an annual plan, you keep your monthly Ink until the end of the year you paid for."
The drip stops when the plan expires or after the 12th grant, not on cancel. Kunal waits for Arjun's amended mechanism before he starts.
