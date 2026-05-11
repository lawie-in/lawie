# CLO Memo: Lawie Coins Economy — Regulatory Posture

**Author:** Ajay (CLO) | **Date:** 2026-05-06 | **For:** Founder, Vikram (econ), Meera (conv)

## Verdict: AMBER

Ship-able for Phase 1 if and only if we ring-fence coins as **non-transferable, non-refundable in cash, non-redeemable outside Lawie services, no peer-to-peer transfer, no expiry except on account closure**. Cross any of those lines and we hit RBI PPI, GST voucher, or PMLA territory and we must delay for a CA + tax-lawyer sign-off.

---

## 1. RBI / PPI (Master Directions on PPIs, 2021, as amended)

- A closed-loop, non-transferable instrument usable **only** for the issuer's own goods/services is **excluded** from PPI authorisation under the Master Directions (Para 2.6 and PSS Act 2007 read with RBI's clarifications on closed system PPIs).
- The moment coins are (a) transferable between users, (b) redeemable for cash, or (c) usable at a third party — they become a **semi-closed/open PPI** and require RBI authorisation under Section 7 of the PSS Act, 2007.
- **Recommendation: APPROVED** — "coins are non-transferable, non-refundable, redeemable only for Lawie services" is the correct boundary. Document this verbatim in ToS.

## 2. GST on coin purchase vs. redemption

- Closest legal analogue: **Section 2(118) CGST Act** (definition of "voucher") + **Section 12(4) / 13(4) CGST Act** (time of supply for vouchers).
- CBIC Circular 243/37/2024-GST and the Karnataka AAR on Premier Sales (2022) treat single-purpose vouchers (where the supply is identifiable at issue) as taxable **at issue**; multi-purpose vouchers are taxable **at redemption**.
- Lawie coins map closer to **single-purpose** (only Lawie drafting services, single GST rate — 18% SAC 998313 / 9983) — therefore **GST is chargeable at coin purchase**, not redemption.
- We are below the ₹20L threshold (Sec. 22 CGST), so no GST today. Once registered, invoice ₹999 inclusive of 18% GST at sale; redemption is then a non-taxable consumption event.
- **Status: Acceptable** with this treatment. Re-confirm with CA at GST registration time.

## 3. Coin expiry / Consumer Protection Act, 2019

- CPA 2019 Sec. 2(47)(ii) — "unfair trade practice" includes withholding pre-paid value through arbitrary forfeiture. CCPA has issued advisories against arbitrary expiry.
- No Maharashtra/Karnataka state rule overrides; CPA 2019 is central. Bihar/Jharkhand have no conflicting rules.
- **Recommendation: APPROVED**: coins **do not expire on a calendar timer**; coins forfeit **only on (a) account closure by user, (b) termination for ToS breach, (c) 24-month account dormancy with 30-day prior email notice**. Avoid the "12-month auto-expire" pattern.

## 4. Refunds

- ₹999 ad-hoc coin pack: pro-rata cash refund for **unused** coins within 7 days of purchase; after 7 days, unused coins remain in wallet but no cash refund. This matches CPA "reasonable" expectations.
- ₹799/mo subscription with 80 included coins: on cancellation, **coins consumed during the billed month stay consumed; unused coins lapse with the subscription** — this is defensible because the subscription fee buys the *capability*, not stored value.
- **Risk:** vocal advocate WhatsApp groups. Mitigation: 7-day unconditional refund window on first subscription month; clear copy in checkout. **Acceptable** with these guardrails.

## 5. BCI Rule 36 (Solicitation)

- Rule 36, BCI Rules — bar on advocates soliciting work, advertising, paying for referrals.
- We sell **to** advocates (B2B), so Rule 36 binds the user, not Lawie. But "advocate-refers-advocate for cash-equivalent coins" risks being framed as a referral fee between advocates, which BCI disciplinary committees have viewed unfavourably.
- **Recommendation: AMBER → restructure**:
  - Referrer: **non-monetary** benefit only — extra drafting capacity, beta features, leaderboard. **Not coins, not cash.**
  - Referee: **first-month discount** (₹200 off), framed as Lawie's promo, not a referral payment.
  - This avoids both Rule 36 and Section 194R characterisation. **Cleanest path: skip P2P referral coins entirely in Phase 1.**

## 6. TDS u/s 194R (Income-tax Act, 1961)

- Sec. 194R — 10% TDS on benefits/perquisites > ₹20,000/year given in course of business/profession to a resident.
- If a referrer-advocate accumulates >₹20K/year of coin value, **194R is triggered on Lawie**. At ₹799/mo and Phase 1 scale (25 users), no single user will cross ₹20K in coin value within the financial year.
- **Status: Theoretical at Phase 1**, real at Phase 2 (>500 users). Adopt the non-monetary referrer model in Sec. 5 above and the 194R risk goes to zero.

## 7. PMLA, 2002

- PMLA risk requires (a) value transfer between persons and (b) cash-out path. Closed-loop, non-transferable, no cash-out = **no PMLA scheduled-offence exposure** and we are not a "reporting entity" under Sec. 12.
- **Status: Approved** while non-transferability holds.

## 8. ToS clauses — verbatim, must ship with coins

1. "Lawie Coins are a non-transferable, non-refundable digital credit usable solely for services on the Lawie platform. They are not legal tender, not a prepaid payment instrument, and have no cash value."
2. "Lawie Coins cannot be transferred, sold, gifted, assigned, or exchanged between users or to any third party."
3. "Lawie Coins do not expire on a calendar basis. Unused Coins are forfeited only upon (a) voluntary account closure, (b) termination for breach of these Terms, or (c) account dormancy exceeding 24 months following 30 days' prior email notice."
4. "Coins included in a monthly subscription are consumable within that subscription. Upon cancellation or non-renewal, unused subscription-included Coins lapse. Coins purchased separately as ad-hoc packs remain in the wallet subject to clause (3)."
5. "Refunds for ad-hoc Coin pack purchases are available within 7 calendar days of purchase, pro-rated for unused Coins. After 7 days, no cash refund is available; unused Coins remain in the wallet."
6. "Applicable GST is included in the displayed price of every Coin pack and subscription. A tax invoice will be issued at the time of purchase."
7. "Lawie is a drafting assistant. The advocate using Lawie is solely responsible for the legal accuracy, suitability, and filing of any draft generated. Lawie does not provide legal advice."

(7 clauses; 5 if you compress 3+4 and 1+2.)

## 9. State-level (Bihar / Jharkhand)

- No state-specific digital-services tax in Bihar or Jharkhand.
- State Profession Tax: levied on the *advocate*, not on Lawie's invoicing.
- Stamp duty: digital subscription invoices are not stampable instruments under Indian Stamp Act Sec. 3.
- **Status: Approved.** No state action needed for Phase 1 geography.

## 10. The grey-area call

- Ship Phase 1 with the boundary: **closed-loop, non-transferable, no calendar expiry, non-monetary referrer benefit, 7-day refund on ad-hoc packs.**
- Pre-GST-registration window (we are < ₹20L turnover) is the right time to launch and stress-test the model.
- **Hard gate before Phase 2 (>₹20L ARR or > 250 users):** paid review by (i) a GST-specialist CA on voucher classification and invoicing, (ii) a tax lawyer on 194R + state nexus, (iii) one disciplinary-side BCI-experienced advocate on Rule 36 referral framing.
- Budget: ₹40-60K, 2 weeks. Schedule it now for the month we cross 100 paid users.

---

## Summary table

| # | Area | Status | Action |
|---|---|---|---|
| 1 | RBI PPI | Approved | Boundary: non-transferable, no cash-out |
| 2 | GST | Acceptable | Treat as single-purpose voucher; tax at issue post-registration |
| 3 | CPA expiry | Approved | No calendar expiry; 24-mo dormancy only |
| 4 | Refunds | Acceptable | 7-day window on ad-hoc; subscription coins lapse on cancel |
| 5 | BCI Rule 36 | Risk | Non-monetary referrer benefit only |
| 6 | 194R TDS | Acceptable | Theoretical at Phase 1 with non-monetary referrer |
| 7 | PMLA | Approved | Holds while non-transferable |
| 8 | ToS | Blocker until clauses 1-7 land | Ship with launch |
| 9 | State law | Approved | None for BR/JH |
| 10 | Overall | **Amber** | Ship with guardrails; CA+tax-lawyer review at 100 users |

Ready for next task.
