# T-399 — Yearly plans grant Ink every month, not once a year

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (billing); Arjun confirms the design, Vikram the numbers |
| Mode   | Full chain (billing) |
| Status | Settled (Arjun 545e80a, Vikram bd8c8b9, Ajay's cancel and refund rulings). Kunal, after T-395. Ajay's refund-page sentence ships in the same merge. No subscriptions sold yet, so the backfill is dry-run only. Yearly toggle off until merged |
| Source | Ajay, T-398 sign-off (handoff/legal/T-398-pro-card-signed.md) |

## Problem

`grantSubscriptionInk` (apps/billing/src/services/subscription.service.ts ~:208) grants Ink on each billing renewal. A yearly plan renews once a year, and there is no monthly grant for yearly plans. The only hint is a comment in credit-skus.ts, "monthly drip — same monthly grant per renewal". So a yearly buyer (solo_yearly, pro_yearly) may get 50 or 150 Ink once a year. That makes "150 Ink/month", "refills every month", "save 2 months" and Ajay's signed FAQ line for Solo yearly false.

## Acceptance criteria

1. Arjun confirms the current behaviour, with a test that shows it.
2. Yearly plans grant `inkPerCycle` every month for 12 months, with the same expiry and refill rules as monthly plans. Arjun picks the mechanism: a scheduled job or a grant schedule set at purchase.
3. Tests cover a yearly purchase across 12 months, cancel mid-year, and a renewal.
4. No subscriptions have been sold yet (founder, via Vikram, 13 Oct 2026). Ship the backfill script in dry-run only, as a safety net; there's nothing to apply.
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

## Arjun (13 Oct 2026): cancel at cycle end, for every plan

Today `cancelSubscriptionInk` zeroes the balance immediately on cancel. That is a bug for monthly plans too. Fixed in this ticket: a cancelled plan keeps its balance and drip until `paidThrough` (from the webhook), and is zeroed only after that. A refund path exists only if Ajay's refund policy allows refunds. If it does, that's a separate ticket.

**Arjun (13 Oct, closing the cancel point):** Ajay's T-399-yearly-cancel-signed.md and my 545e80a section say the same thing; the ticket mechanism and the AC3 test already read "cancel mid-year → grants continue to month 12 / paidThrough, then none". On Vikram's Razorpay question: billing makes no cancel API call today, so there is nothing to set; the rule for any future cancel button is `cancel_at_cycle_end: 1`, never an immediate cancel, and it goes in this ticket as a comment next to the webhook handler.

## Ajay (13 Oct 2026): refunds

The refund policy allows no refunds, full or partial, on any plan. Every cancel, monthly or yearly, keeps the Ink until the paid period ends, and today's immediate zeroing is a defect fixed here. No refund ticket. Statutory exceptions (failed service, double charge) are handled case by case through contact@lawie.in, not in code.

## Arjun (13 Oct 2026): where the drip lives (Kunal's Explore)

**(a) `packages/shared`.** One function, `settleYearlyDrip({ db, userId, now })`, working on the raw `users`, `subscriptions` and `inkledgers` collections, with the SKU Ink numbers moved to a shared constant (`INK_PER_CYCLE` keyed by sku id; billing's `credit-skus.ts` imports it so there is one source). Drafting calls it at the top of `getCreditBalance` and `holdInk`; billing calls it from `getInkBalance` and the webhook handler. Not (b): two copies of money logic drift. Not (c): a network hop on every hold. This is a `packages/shared` change: Priya claims it for Kunal (one lead at a time), and the shared build runs before drafting/billing tests as CI does.

**Idempotency:** compare-and-set on the Subscription counter — `findOneAndUpdate({ _id, inkDripCount: n }, { $inc: { inkDripCount: 1 }, $set: { inkDripNextAt } })`; only the caller that wins writes the grant and the ledger row. Keep the ledger `key` (`sub_drip:<subId>:<n>`) for audit, but the CAS is the guard, so no unique index migration now.

**Also fix in T-399 (all real bugs):** (1) `subscription.activated` and `subscription.charged` both fire on the first payment, so the grant and the yearly carry run twice — store the Razorpay `payment_id` of the last grant on the Subscription and grant only when it is new; one test. (2) The cancel path downgrades the plan to free at once — move that to `paidThrough` with the Ink. (3) `inkledger` writes swallow errors — log them at error level with the key; the unique index is a follow-up ticket (migration), Priya logs it.

**Arjun (13 Oct, double-grant key):** key the per-cycle grant on the subscription entity's `paid_count` (monotonic, means "this cycle was paid"), stored as `lastGrantedPaidCount`; grant only when `paid_count > lastGrantedPaidCount`. If the payload has no `paid_count`, fall back to `current_start` compared with the stored one; with neither, keep today's behaviour and log a warning. Billing calls `settleYearlyDrip` from `getInkBalance` only; the charge webhook resets the drip state itself, so no settle call there.

**Arjun (13 Oct, webhook ack, Kunal's finding):** `billing.routes.ts:278` acks 200 before the handler runs, so a failed grant is never retried by Razorpay. Follow-up ticket (Priya logs; Kunal after T-399, small fix): verify the signature and the T-323 body shape first (400 pre-ack stays), then run `handleWebhookEvent` synchronously and return 500 on a thrown error so Razorpay retries; the `paid_count` key (and the T-399 rollback on failure) makes the retry idempotent. No reconcile job: no job runtime, and a retry is what the sender already offers. A repeated failure on one event goes to Sentry as one alert, not per retry.
