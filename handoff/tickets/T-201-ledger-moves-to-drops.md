# T-201 — Ledger moves from Ink units to drops

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Phase      | 2 — Drops pricing                     |
| Owner      | Vishal                                |
| Mode       | Full chain                            |
| Status     | Ready. ADR-020 approved on 4 Oct 2026 |
| Depends on | T-112                                 |
| Branch     | feature/t-201-ledger-drops            |
| Created    | 2026-10-03                            |

## Goal

All balances are whole numbers of drops, where 1 Ink = 100 drops.

## Context

- Founder confirmed on 3 Oct 2026: unit name "drops", 1 Ink = 100 drops.
- Today Ink is stored as integer units at 2 per Ink on the user record: `inkSub`, `inkAnnualCarry`, `inkTopup`, `inkSubMonthlyAllotment`.
- `apps/billing/src/config/credit-skus.ts` holds plan and top-up amounts in Ink, and callers multiply by 2.
- `getCreditBalance` in `apps/drafting/src/services/credits.service.ts` divides by 2 for display.
- Older credit buckets still exist next to Ink: `topupCredits`, `earnedCredits`, `subscriptionCredits`. Bonuses in code: signup 5, daily login 2, rating 1, all into `earnedCredits`. Signup also seeds 5 Ink into `inkTopup`.
- This touches billing and drafting and migrates live balances, so it is a one-way change.
- The live spend path (`spendInk`) draws only from the Ink buckets.
- The 2-per-Ink conversion is repeated in four apps: auth, billing, drafting and web. See In scope.
- Stack notes say production is on MongoDB Atlas M0. Confirm whether it has any automatic backup before relying on one.
- ADR-020 changes two things in this ticket: drops go into new fields (`dropsSub`, `dropsAnnualCarry`, `dropsTopup`, `dropsMonthlyAllotment`, `dropsMigratedAt`) and the old Ink fields are not multiplied in place. Where this ticket says "multiplies existing stored Ink units by 50", read "copies them, times 50, into the new fields".
- The balance API keeps its Ink fields and adds drops fields. The web app does not change here.
- If the founder approves D3, the "log in tomorrow to earn bonus Ink" line is removed from `LowBalanceModal`.

## Acceptance criteria

- Every stored balance is an integer number of drops.
- A one-off migration multiplies existing stored Ink units by 50 (2 per Ink becomes 100 per Ink).
- The migration has a dry-run mode that prints totals before and after, and cannot run twice on the same user.
- The total of all balances after migration equals 50 times the total before.
- Plan grants per cycle: Solo 5,000 drops, Pro 15,000 drops. Free is 500 drops for life.
- Top-ups: 300, 1,000 and 2,800 drops for 65, 199 and 499 rupees.
- Annual carry-over rules are unchanged: 50 percent carries, capped at twice the monthly grant.
- Old ledger rows keep their history. New rows are in drops and carry a unit marker.
- APIs return drops. No decimal balance appears anywhere.
- The migration is run against a backup copy before production.
- The Ink-to-drops factor is one shared constant in `packages/shared`, not repeated per service.
- ~~A manual database dump is taken and checked before the production run.~~ Not needed (founder, 4 Oct 2026): no customers. Deploy, run the script once, check a test account. This comes back if a paying user exists before this ships.

## In scope

- `apps/billing/src/config/credit-skus.ts`
- `apps/billing/src/services/ink-ledger.service.ts`, `credit-grant.service.ts`
- `apps/drafting/src/services/credits.service.ts`
- `apps/drafting/src/middleware/enforceCredits.ts`
- `apps/drafting/src/models/CreditLedger.model.ts` and the `User` models in both services
- `apps/auth/src/services/credit-bonus.service.ts` and `apps/auth/src/config/passport.ts`
- `apps/billing/src/services/subscription.service.ts`
- `apps/drafting/src/routes/admin-users.routes.ts`
- `apps/web/src/app/admin/` (two pages)
- `packages/shared` (the shared constant)

## Out of scope

- The paragraph formula (T-202)
- Plan prices and Razorpay plans
- Web screens (T-203)

## References

- Design: Not needed
- ADR: `docs/adr/ADR-020-drops-migration.md` (draft, waiting for founder approval). Build to it once approved
- Legal sign-off: Not needed

## Open questions

- Founder: what happens to the older credit buckets and the bonuses? Vikram recommends leaving them out of the migration and deciding separately whether to retire them. Converting the daily login bonus (2 a day) at 100 drops each would give away up to 60 Ink a month, more than Solo's 50.

## Review, 3 Oct 2026

| Reviewer | Verdict                   | Note                                                                                                                                  |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes     | Feasible, but wider than written. It touches four apps and live balances. Scope and backup step corrected above. Needs the ADR first. |
| Vikram   | Approved with a condition | Multiplying stored units by 50 is correct. I do not approve converting the older bonus buckets until the founder decides.             |
| Priya    | Not startable yet         | Waits on the ADR and the founder's answer on bonuses.                                                                                 |
