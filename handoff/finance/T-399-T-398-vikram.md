# Finance calls: T-399 (yearly Ink drip) and T-398 (Pro card)

**Summary.** T-399: fix timing only, no price or allotment changes; monthly-reset rule applies to every drip. T-398: Option A is live as-is: "Pro", ₹1,999/month, 150 Ink; yearly toggle stays off until T-399 ships.

## T-399: yearly plans must drip Ink monthly

Bug (Arjun, 13 Oct): `grantSubscriptionInk` runs only on `subscription.activated`/`charged`, so a yearly buyer gets one grant a year. Fix is Arjun's lazy drip (Kunal builds). Finance calls:

**(a) Numbers unchanged. Confirmed.**

| SKU | Price | Ink/month | Ink/year | Change |
|---|---|---|---|---|
| solo_yearly | ₹7,990 | 50 | 600 | timing only |
| pro_yearly | ₹19,990 | 150 | 1,800 | timing only |

Razorpay plans and `apps/billing/src/config/credit-skus.ts` stay as they are. No price edit rides on this ticket.

**(b) Rollover and expiry. Confirmed.**

- Each of the 12 drips follows the monthly rule exactly: inkSub resets to the allotment, unspent sub Ink does not roll over.
- The annual carry at the yearly recharge (50% of remaining inkSub into inkAnnualCarry, capped at 2× monthly allotment) stays. It is a yearly-only perk, funded only from Ink already granted and unspent, so it costs nothing new. It is not advertised anywhere and must not be.
- Cost bound per yearly sub per year (worst case): solo 12 × 50 + 100 = 700 Ink; pro 12 × 150 + 300 = 2,100 Ink. Real exposure is lower because the carry can only come from unspent Ink.

**(c) "Save 2 months". Confirmed, conditional on the drip shipping.**

| Plan | 12 × monthly | Yearly | Saving | = months |
|---|---|---|---|---|
| Solo | ₹9,588 | ₹7,990 | ₹1,598 | exactly 2 × ₹799 |
| Pro | ₹23,988 | ₹19,990 | ₹3,998 | exactly 2 × ₹1,999 |

The live line "₹3,998 saved vs paying monthly" is arithmetically right. It is true once the drip ships and false today (a yearly buyer currently gets 1/12 of the Ink). Ajay's hold on the yearly lines is correct.

**Effective ₹/Ink (context, not a decision)**

| SKU | ₹/Ink |
|---|---|
| solo_monthly | 15.98 |
| solo_yearly | 13.32 |
| pro_monthly | 13.33 |
| pro_yearly | 11.11 |
| top-ups | 17.8 to 21.7 |

Pro yearly is our cheapest Ink. That is fine as a loyalty price; it is the one SKU to watch once T-003 token data lands.

**Flag for Arjun and Ajay (not blocking the build): "cancel stops the drip".**
A yearly buyer has prepaid 12 months. If a Razorpay cancel ends the drip mid-year without refunding the unused months, that is a refund-policy and complaints problem. Finance position: cancel = no renewal, drip continues to the end of the paid period; drip stops immediately only if the unused months are refunded. Arjun to confirm which Razorpay cancel semantics apply (cancel at cycle end vs immediate); Ajay to check the refund-policy wording matches.

## T-398: pricing page Pro card, Option A

- Decision: Option A. Name stays "Pro", ₹1,999/month, 150 Ink/month. Confirmed as live.
- No re-tier or rename before v1. Pro stays under review (below the 60% margin target; loses money if tokens run 2×). Re-tier decision after two weeks of T-003 token data.
- If Pro is re-tiered later: Meera is told first, and any change applies to new buyers only.
- One accepted cost: a yearly Pro buyer locks ₹19,990 for 12 months at an under-review price. Bounded (we know the Ink ceiling above), small at Phase 1 volumes. Accept.
- Yearly toggle stays off until T-399 is merged and tested on develop. Then Ajay releases the three held yearly lines as written; no copy change needed from finance.
- Unchanged: Pro goes in no ads; it stays on the page.

## Who does what next

- Kunal: build T-399 per Arjun's design (lazy drip, idempotent `sub_drip:<subId>:<n>`, cancel/expire handling, AC4 backfill script).
- Arjun and Ajay: answer the cancel flag (Razorpay cancel semantics; refund-policy wording). Reply in the T-399 ticket.
- Ajay: release the three held yearly lines after T-399 merge + test, as written.
- Meera: Pro card Option A is go. No pricing or naming change before v1. Keep the yearly toggle off until Ajay releases.
- Priya: get the founder's count of yearly subs already sold, for the AC4 backfill.

Vikram, CFO, 13 Oct 2026
