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

## Arjun's scope (14 Oct, in T-399)

- apps/billing only: remove the yearly carry write in `grantSubscriptionInk` (apps/billing/src/services/ink-ledger.service.ts).
- Keep `inkAnnualCarry` at 0, do not drop the field (about 60 reads across four workspaces; dropping it is a separate post-v1 cleanup).
- Update the two billing tests that expect a carry; add one asserting the carry stays 0. No migration.
- Merge waits for the founder's own confirmation of the ruling (Priya).

## Wording (Ajay, 925bc30, must-fix; ships in the same merge)

- Remove "Unused Ink rolls over" from the upgrade modal (apps/web/src/components/credits/UpgradeSuccessModal.tsx).
- Add the expiry line to Terms §6 and the pricing FAQ, word for word from handoff/legal/T-433-ink-expiry-wording-signed.md.
