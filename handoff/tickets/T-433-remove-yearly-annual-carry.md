# T-433: remove the yearly plan's annual carry

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | Todo. Shashank, after T-428. Priya, 14 Oct 2026                       |
| Owner  | Shashank (build), Arjun (details), Vikram (ruling)                    |
| Mode   | Small fix (billing only)                                              |

## Source

Founder ruling, 14 Oct 2026, relayed by Vikram: plan Ink (monthly, and the yearly plan's monthly drip) expires every month; top-up Ink never expires. The code already does this, except the yearly annual carry (50% of unspent Ink banked at the yearly charge), which goes. Vikram corrects handoff/finance/T-399-T-398-vikram.md ("carry stays").

## Acceptance criteria

1. No Ink is carried over at the yearly charge; unspent plan Ink expires as it does monthly. Top-up Ink is unchanged and never expires.
2. Billing tests updated (t399 yearly drip and backfill, t413 if affected); Arjun gives the details.
3. Any user-facing text that promises a carry is found and removed (Meera/Ajay check the wording if one exists).
