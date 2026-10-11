# T-227 — The price a user sees is the price charged

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Vikram (the price of each document), Ajay (heads-up: CPA 2019), Lead (build), Anushka (verdict) |
| Mode           | Vikram's price list first, then build, full chain (drafting, web) |
| Status         | To do. Waits for Vikram's price list |
| Size           | S (0.5 day) after the list |
| Depends on     | None. Drops pricing (T-201 to T-205) replaces this later; this fixes v1 as it stands |
| Gate           | Before v1 go-live (T-403) and before T-222's welcome email ships |
| Branch         | fix/t-227-price-matches-charge |
| Legal sign-off | Not needed for the code. Ajay: shown and charged price must match (CPA 2019 s.2(47)) |
| Created        | 2026-10-11 |
| Source         | Ajay, during the T-222 claims check, 11 Oct 2026. Priya checked the code |

## Problem

58 files in `docs/templates/` carry `"creditsCost": 2`, which the app shows. `apps/drafting/src/services/credits.service.ts` (`TEMPLATE_COST`) charges 2 only for `bail_regular`, `bail_anticipatory` and `consumer_complaint`, and 1 for everything else. Users see one price and pay another.

## Acceptance criteria

1. Vikram writes the price of each document in this file, or a rule (for example, 2 for bail and consumer complaint, 1 for the rest).
2. One source of truth: the shown price and the charged price come from the same place. A test fails if they ever differ for any template.
3. The draft screen shows the cost before the user generates (Ajay's condition for T-222 change 2). If it already does, the lead says where.
4. CI green on drafting and web.

## Out of scope

- Drops pricing (T-201 to T-205)

## References

- T-222 (Ajay claims check), T-226
