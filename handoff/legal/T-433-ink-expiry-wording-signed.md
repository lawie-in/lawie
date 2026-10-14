# T-433: Ink expiry wording (signed)

Ajay (CLO), 14 Oct 2026. Source: founder ruling relayed by Vikram, 14 Oct: plan Ink expires every month (yearly plans included, no carry); top-up Ink never expires.

## Check of current text (develop_staging)

| Where | Today | Finding | Kind |
|---|---|---|---|
| `apps/web/src/components/credits/UpgradeSuccessModal.tsx:15,21` | "Unused Ink rolls over (up to 2× cap on yearly)" | False promise of rollover, shown after payment. Misleading representation (CPA 2019 s.2(47)). Must go. | must-fix |
| same file `:14,20` | "50 / 150 Ink / month — reset each billing cycle" | On a yearly plan the billing cycle is a year; the reset is monthly. Wrong for yearly users. | must-fix |
| Terms §6 (`terms/page.tsx:146-155`) | No rollover promise; says nothing on expiry | Expiry of paid plan Ink is a material term and must be in the Terms. | must-fix |
| Pricing FAQ (`pricing/page.tsx:42`) | "Solo and Pro plans refill Ink every month." | No promise, but silent on expiry. Replace with the signed line below. | must-fix (same ticket, one line) |
| Refund page (`refunds/page.tsx:51`) | "you keep your monthly Ink until the end of the year you paid for" | Consistent with the ruling (monthly drip continues). Approved as is. | none |
| FAQ (`faq/page.tsx:48,53`) | No rollover promise | Approved as is. | none |
| TopUpModal / PaywallModal | "Top-up Ink never expires" / "never expires" | Consistent. Approved as is. | none |

## Signed strings (byte-exact)

1. UpgradeSuccessModal, Solo: replace lines 14–15 with
   - `50 Ink a month`
   - `Plan Ink resets each month; top-up Ink never expires`
2. UpgradeSuccessModal, Pro: replace lines 20–21 with
   - `150 Ink a month`
   - `Plan Ink resets each month; top-up Ink never expires`
3. Terms §6: insert after "a failed generation is not charged." (one space before):
   `Plan Ink is given for each month of your plan, including on annual plans. Plan Ink left unused at the end of that month expires and does not carry over. Top-up Ink you buy separately never expires.`
   Bump the Terms "Last updated" date to the merge date.
4. Pricing FAQ: replace "Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime." with
   `Solo and Pro plans give you fresh Ink every month; plan Ink left unused at the end of the month does not carry over. You can also buy top-up packs anytime, and top-up Ink never expires.`

Test: no web string anywhere contains "rolls over", "roll over" or "carry over" except the signed negative lines above.

## Conditions

- Ship the text with the T-433 billing change, not after it: the modal must not promise a carry the code no longer gives.
- verify (Vikram): has any paying user been shown the rollover line, or banked a yearly carry, before this change? If yes, those users keep what they banked, and I rule on notice separately. If no (pre-v1), nothing further.
- Web files sit outside T-433's Arjun scope (`apps/billing` only): Priya extends the claim or cuts a web ticket.

Legal: T-433 wording signed by Ajay.
