# Vikram: GTM budget, offers and prices (12 Oct 2026, night)

Asked through Priya from Meera's handoff/marketing/strategy.md §8. Signed: Vikram (CFO).

## Budget: ₹1,00,000 at most, cut from the ₹1,45,000 asked

It is released in two tranches: T1 ₹66,500, then T2 up to ₹33,500.

| Item | Approved | Condition |
|---|---|---|
| Paid social (IG/YT) | T1 15,000, T2 +15,000 | Cap ₹500/day. One reel at a time. UTM on every ad |
| LinkedIn boosts | 0 | Founder posts stay organic |
| Legal-news slot | T2 only, at most 15,000 | Quote first, one site, Week 3 |
| Bar demos | T1 20,000 | Receipts. No gifts to association members |
| Law-college labs | T1 6,000 | Two labs first. A third in T2 if labs convert |
| Ambassador stipends | T1 15,000 | 10 × ₹1,500 flat, paid after the agreed work. No per-sign-up pay. PAN and bank/UPI (a CA confirms TDS) |
| Reel editing | T1 7,500, T2 +3,500 | 3 reels first |
| Tools | T1 3,000 | Canva Pro and a free scheduler. Free WhatsApp Business broadcast lists, opt-in only |

**When money can be spent:**
- No rupee before go-live. Go-live means T-403 released after Anushka's PASS, T-227 and T-238 merged, and Ajay's sign-off on the copy.
- T2 is released only if, by the end of Week 2, all of these hold:
  - at least 250 sign-ups;
  - at least 8 paying users;
  - blended CAC of ₹3,000 or less.
- If T2 is not released, paid channels stop and only bar demos continue.

## Offers

Both approved offers use the existing referral codes (`referral.service.ts`), so nothing needs building.

| Offer | Decision | Terms |
|---|---|---|
| Bar-demo bonus | Approved | One code per demo. +5 Ink (10 in total). New accounts only. Up to 50 uses. Expires 14 days after the demo |
| Ambassador code | Approved | One code per ambassador. +3 Ink (8 in total). New accounts only. Up to 100 uses. Expires after 60 days. No per-sign-up reward |
| First-month Solo discount | Rejected | Nothing in the code discounts a subscription, and the margin can't take it |

Copy for both offers:
- Say "+5 Ink" or "+3 Ink", never "free drafts".
- Ajay checks the wording before use.
- A lead confirms that `passport.ts` applies the code on Google sign-in.

## Prices

- **Final:**
  - Solo ₹799/mo, 50 Ink (₹7,990/yr).
  - Top-ups: ₹65 for 3 Ink, ₹199 for 10, ₹499 for 28.
- **Under review:** Pro ₹1,999. It's below the 60% margin target and makes a loss if tokens run 2×. Vikram re-tiers it after two weeks of T-003 token data. It stays on the page but goes in no ads.
- **May go in ads,** once T-227 and T-238 are merged and the founder has checked the Razorpay plans:
  - "Start free with 5 Ink"
  - "Solo ₹799/month, 50 Ink"
  - "Top-ups from ₹65 (3 Ink)"
- **Never in ads:**
  - Pro or any yearly price;
  - any rupee price per document;
  - "50 documents a month";
  - any discount.

## For the founder (morning report)

1. In the Razorpay dashboard, check that the plans charge exactly ₹799, ₹7,990, ₹1,999 and ₹19,990.
2. Cash on hand, to confirm the budget at T-403.
3. GST status, with a CA. The page says "inclusive of applicable taxes". If we register, Solo's net revenue drops to about ₹658.
