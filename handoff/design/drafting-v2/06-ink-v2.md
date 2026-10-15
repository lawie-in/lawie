# Ink v2 — one balance, one ledger, three operations

Founder, 15 Oct: "every architecture is complex, for example the Ink credits." Agreed. Today: `inkSub`, `inkTopup`, `inkAnnualCarry`, monthly reset, yearly drip with CAS, holds, placeholder rates, bonus credits, usage logs, two ledgers' worth of history. Proposed:

## 1. Model

- **One balance** on the user: `ink: number` (integer, 1 Ink = ₹ cost unit as priced by Vikram). Nothing else.
- **One ledger**, `ink_ledger`: `{userId, delta, reason: 'grant'|'spend'|'refund'|'adjust', ref, balanceAfter, at}`. Append-only. The balance is always `sum(delta)`; a nightly job checks it.
- **Three operations**: `grant(userId, n, ref)` (plan period start, top-up purchase, admin), `spend(userId, n, ref)` (atomic `findOneAndUpdate` with `ink ≥ n`), `refund(userId, n, ref)` (failed draft). No holds: a draft spends its class price up front and refunds on failure; the user sees one number move.
- **Plan Ink expires, top-up Ink does not** — implemented not as two buckets but as a **scheduled grant with an expiry**: each grant row may carry `expiresAt`; a nightly job writes `adjust` rows that remove unspent expiring Ink (FIFO by expiry). The user sees "20 Ink, 12 expire on 31 Oct". One balance, one truth.
- **Yearly plans** = twelve scheduled `grant` rows created at purchase (`dueAt` monthly), applied by the nightly job. No lazy drip, no CAS, no anchors. If the subscription dies, the remaining scheduled grants are cancelled by one update.
- **Pricing by size class**: every kind maps to S / M / L (1 / 2 / 4 Ink, numbers Vikram's). The class is fixed at Confirm time and shown before it (exists: InkCostLine). Measured token cost feeds a monthly review of the class table, never the per-draft price.

## 2. What is removed
`inkSub/inkTopup/inkAnnualCarry`, `inkDrip*` fields and `settleYearlyDrip`, `CreditLedger` + `UsageLog` duality (one ledger), `BonusCredit` (a `grant` with reason `bonus`), `PlaceholderRate` (the class table is an AppSetting), holds and hold-expiry sweeps.

## 3. Migration
One script: `ink = inkSub + inkTopup + inkAnnualCarry`; write one `adjust` row "migration to Ink v2" per user; create scheduled grants for active yearly subs from `inkDripNextAt`; set `expiresAt` on the plan portion to the current period end. Run on develop, Anushka checks balances on three accounts, then prod with T-403's successor.

## 4. Why it is simpler for everyone
User: one number. Vikram: one ledger to reconcile. Billing: webhooks create grants; nothing else touches Ink. Drafting: spend/refund only. Support: every change to a balance is one row with a reason.
