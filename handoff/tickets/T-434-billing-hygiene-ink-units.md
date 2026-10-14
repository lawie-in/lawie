# T-434: billing hygiene: one Ink unit everywhere, remove dead credit code, fix stale subscription schema

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Status | Todo. Next free lead (needs the packages/shared claim). Priya, 14 Oct 2026 |
| Owner  | Lead (build), Vikram (audit), Arjun (glance)                                |
| Mode   | Full chain (billing + web + packages/shared). Not legal content. No user-visible pricing change |

## Source

Founder asked for it after Vikram's billing audit, 14 Oct 2026 (read-only on origin/develop_staging 4b9f431 plus Razorpay).

## Acceptance criteria

1. Units: every Ink to ledger-unit conversion uses INK_UNITS_PER_INK from packages/shared/src/constants/ink.ts. Replace the hand-coded `* 2` at apps/billing/src/services/subscription.service.ts:177 and :390, and at apps/web/src/app/admin/users/page.tsx:144.
2. Admin ledger page (apps/web/src/app/admin/credit-ledger/page.tsx) shows Ink (units / 2), not raw units labelled "Credits in circulation"; title and labels say Ink.
3. Delete apps/billing/src/services/credit-grant.service.ts (no importers). Remove or mark legacy the User fields subscriptionCredits / topupCredits / earnedCredits after a grep proves nothing reads them; if anything does, list it and stop.
4. Delete or archive apps/billing/src/config/BILLING_SIGNOFF.md (old price list marked "OK").
5. Subscription.model.ts:25-26: planId (4 SKUs) + billingCycle are the source of truth; planType marked deprecated; amount comment corrected to 79900 / 799000 / 199900 / 1999000.
6. apps/drafting/src/models/UsageLog.model.ts (nothing writes it): delete, or document as unused.
7. Tests: one asserting the admin ledger shows Ink, not units; existing billing tests stay green.

## Out of scope

Plan amounts in Razorpay (founder's manual check), annual carry (T-433), GST treatment (founder decision, raised separately), any price change.

## Arjun (14 Oct, 20:00 UTC) — three scope corrections before a lead picks it up

Checked on origin/develop_staging:

1. **No `packages/shared` claim.** `INK_UNITS_PER_INK` already exists in `packages/shared/src/constants/ink.ts`. AC1 only imports it; nothing in shared changes. Claim is `apps/billing` + `apps/web` only.
2. **AC3 shrinks to deleting `credit-grant.service.ts`.** The legacy fields `subscriptionCredits` / `topupCredits` / `earnedCredits` are still read in seven files across auth (`credit-bonus.service.ts`), drafting (`credits.service.ts`, `credits.routes.ts`, `CreditLedger.model.ts`) and web (`useCredits.ts`, the admin ledger page). That is the old credits system, still wired; removing the fields is a three-service change and its own post-v1 ticket. In this ticket: delete the dead service, leave the fields and their readers alone, and the lead lists the seven readers in the report so the follow-up ticket starts from facts.
3. **AC6 is out.** `UsageLog` has no writer (confirmed), but it is a drafting model and the T-115 erase design references the collection; deleting it here drags a third service into the claim while Kunal holds drafting for T-115b. Document it as unused in the same post-v1 cleanup ticket; delete it after T-115c lands.

Everything else stands. Still full chain (two services).
