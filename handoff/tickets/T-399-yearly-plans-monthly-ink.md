# T-399 — Yearly plans grant Ink every month, not once a year

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (billing); Arjun confirms the design, Vikram the numbers |
| Mode   | Full chain (billing) |
| Status | To do. Arjun to confirm the bug first. Found by Ajay while signing T-398, 13 Oct 2026. Until fixed: the pricing page's yearly toggle stays off and no yearly line is published |
| Source | Ajay, T-398 sign-off (handoff/legal/T-398-pro-card-signed.md) |

## Problem

`grantSubscriptionInk` (apps/billing/src/services/subscription.service.ts ~:208) grants Ink on each billing renewal. A yearly plan renews once a year, and there is no monthly grant for yearly plans. The only hint is a comment in credit-skus.ts, "monthly drip — same monthly grant per renewal". So a yearly buyer (solo_yearly, pro_yearly) may get 50 or 150 Ink once a year. That makes "150 Ink/month", "refills every month", "save 2 months" and Ajay's signed FAQ line for Solo yearly false.

## Acceptance criteria

1. Arjun confirms the current behaviour, with a test that shows it.
2. Yearly plans grant `inkPerCycle` every month for 12 months, with the same expiry and refill rules as monthly plans. Arjun picks the mechanism: a scheduled job or a grant schedule set at purchase.
3. Tests cover a yearly purchase across 12 months, cancel mid-year, and a renewal.
4. If any yearly plan has already been sold, the founder learns how many, and those users get the missing Ink.
5. Ajay releases the HELD yearly lines once the fix is merged and tested.
