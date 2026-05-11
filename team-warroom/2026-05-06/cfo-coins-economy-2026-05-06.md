# Lawie Coins Economy — CFO Plan
**Author:** Vikram (CFO) | **Date:** 2026-05-06 | **Status:** Draft for Founder + Meera + Ajay review

---

## Headline Numbers

| Metric | Value |
|---|---|
| 1 coin | ₹10 |
| Simple draft (rent, s80 notice) | 8 coins (₹80) |
| Complex draft (anticipatory bail) | 15 coins (₹150) |
| Free tools (section converter) | 0 coins |
| Signup bonus | 50 coins (~5 simple drafts) |
| Monthly plan ₹799 | 100 coins included |
| Yearly plan ₹7,999 (17% off) | 1,300 coins (8% bonus) |
| Per rating earn | 2 coins |
| Referral signup | 10 coins |
| Referral converts to paid | 50 coins |
| Profile completion | 20 coins (one-time) |
| Monthly earn cap | 40 coins |
| Coin expiry | 12 months from issue |

COGS basis: ₹2.50/draft (Sonnet ₹1.25 + verifier ₹1.25). Razorpay 2.36%.

---

## 1. Fundamentals

**Peg: 1 coin = ₹10.** Round, easy to communicate. Avoids ₹20 (too few coins per draft, feels stingy) and ₹5 (inflates numbers).

**Draft pricing:**
- Simple (rent agreement, legal notice s80, NDA): **8 coins / ₹80** — 32x COGS
- Complex (anticipatory bail w/ jurisdiction logic, writ petition): **15 coins / ₹150** — 60x COGS
- Free tools (IPC↔BNS converter, citation lookup): **0 coins** — pure top-of-funnel

**Decay: 12-month rolling expiry, FIFO.** Defence: not "use it or lose it" — it's "use it within a year." Indian advocates accept this if framed as "credits valid 12 months from purchase, like recharge cards." Mitigates open-ended liability on books. Bonus/earned coins expire same rule. Subscription-included coins reset monthly (don't roll over) — standard SaaS behaviour.

---

## 2. Trial Allocation

**Replace SCRUM-59's 5+5 framing with: 50 coins free on signup.**
- Covers ~6 simple drafts OR 3 complex drafts — better than current 10-draft cap because heavy-complex users self-throttle.
- Mapping: old "5 base" = 50 coins on signup. Old "5 earned via rating" = 2 coins/rating × ~5 ratings = 10 coins (slightly less generous, intentional — was over-indexed).
- Profile completion bonus 20 coins funnels them toward becoming serviceable leads.

---

## 3. Earning Loop

| Action | Coins | Cap |
|---|---|---|
| Output rating (👍/👎 + feedback ≥10 chars) | 2 | 20/mo |
| Referral signs up | 10 | 30/mo |
| Referral converts to paid | 50 | uncapped |
| Profile completion | 20 | one-time |
| Daily login streak | 0 | **skip** |

**Skipping streaks.** Indian district court advocates work case-by-case, not daily. Streaks reward wrong behaviour and create perverse incentives. Founder's call but I recommend out.

**Total earn cap (excl. paid referrals): 40 coins/month** = ₹400 of theoretical liability per free user. Acceptable.

---

## 4. Subscription + Top-ups

| Plan | Price | Coins | Effective ₹/draft (simple) |
|---|---|---|---|
| Free | ₹0 | 50 signup + ~30/mo earn | n/a |
| Monthly | ₹799 | 100/mo | ₹64 |
| Yearly | ₹7,999 (17% off list ₹9,588) | 1,300/yr (108/mo equiv, 8% bonus) | ₹49 |

**Coin packs (top-ups):**

| Pack | Price | Base coins | Bonus | Total | ₹/coin |
|---|---|---|---|---|---|
| Starter | ₹199 | 19 | 1 | 20 | ₹9.95 |
| Standard | ₹499 | 49 | 6 | 55 | ₹9.07 |
| Pro | ₹999 | 99 | 21 | 120 | ₹8.32 |

**Auto-renewal on empty:** opt-in at checkout. Default = block + prompt to top-up. Razorpay mandate complexity not worth it pre-100 users.

---

## 5. Tiers Comparison

| Plan | Best for | Coins/mo | ₹/draft (simple) | Margin headroom |
|---|---|---|---|---|
| Free | Try product | ~80 (signup+earn) | ₹0 (loss leader) | -₹2.50/draft |
| Monthly | 8–12 drafts/mo | 100 | ₹64 | High |
| Yearly | 12+ drafts/mo, predictable | 108 | ₹49 | Medium |
| Coin packs | Bursty users | variable | ₹66–₹80 | Highest |

---

## 6. Unit Economics (per plan, monthly)

Net revenue = price × (1 − 2.36% Razorpay). COGS = drafts × ₹2.50.

| Plan | Net rev | Drafts (100% util, simple) | COGS | GM₹ | GM% |
|---|---|---|---|---|---|
| Monthly heavy (12 simple) | ₹780 | 12 | ₹30 | ₹750 | **96%** |
| Monthly light (3 simple) | ₹780 | 3 | ₹7.50 | ₹773 | 99% |
| Monthly all-complex (6 complex = 90 coins) | ₹780 | 6 | ₹15 | ₹765 | 98% |
| Yearly heavy (108 coins/mo, all complex = 7) | ₹651/mo | 7 | ₹17.50 | ₹633 | **97%** |
| Coin pack ₹999 (12 simple) | ₹975 | 12 | ₹30 | ₹945 | 97% |

**Margin holds at every utilization level. Floor GM ~96%.** Coin model does NOT erode margin vs flat ₹799 — it expands it because heavy users self-cap at 100 coins.

---

## 7. Referral Economics

- Signup: 10 coins to referrer (₹100 liability, 0 cash out)
- Paid conversion: 50 coins to referrer (₹500 liability, 0 cash out)
- CAC equivalent: 50 coins ≈ ₹125 COGS if fully redeemed on simple drafts. **Effective CAC ~₹125** vs paid ad CAC ₹400+ for this segment. Strong ROI.
- Day 90 math: 25 paid × 0.5 refer-rate = 12 trials → 3 paid. Adds ₹2,397/mo MRR for ₹375 COGS. **Yes, worth it.**

---

## 8. Anti-Abuse

- Earn cap 40 coins/mo (excl. paid referrals)
- Disposable email block (carry from SCRUM-59)
- **No coin transfers** — keep simple, blocks fraud rings
- **No refunds on cancel** — coins valid 12 months regardless of subscription status (legally cleaner; flag to Ajay for T&C)

---

## 9. SCRUM-59 Decision

**Rewrite.** New framing: "50 coins on signup, 8 coins/simple draft, earn via ratings + referrals, top up anytime." Drop "10 drafts cap" language entirely. Priya to update spec; I'll review the pricing copy.

---

## 10. 3-Scenario Forecast

Assumptions: 70% monthly / 25% yearly / 5% pack-only. ARPU blended.

| Day | Paid users | Sub MRR (net) | Pack rev/mo (net) | Total rev | Coin liability | ARPU | GM% |
|---|---|---|---|---|---|---|---|
| 0 | 0 | ₹0 | ₹0 | ₹0 | ₹0 | — | — |
| 30 | 8 | ₹5,460 | ₹400 | ₹5,860 | ₹4,500 (free trials) | ₹732 | 96% |
| 90 | 25 | ₹16,800 | ₹1,800 | ₹18,600 | ₹18,000 | ₹744 | 96% |

Coin liability at Day 90: ~1,800 unspent coins × ₹10 = ₹18,000. Disclose as deferred revenue. Not material at this scale; flag CA at ₹2L+ liability.

---

## Final CFO Call

**NET POSITIVE. Approve.**

Three reasons, numbers-first:
1. **Margin floor rises** from ~94% (current flat ₹799, heavy user, 50 drafts) to **96%+** (coin caps usage).
2. **New revenue surface:** coin packs add ~₹1,800/mo at Day 90 = +10% on MRR with no new acquisition cost.
3. **Referral CAC ~₹125** beats any paid channel for this segment.

**Biggest risk:** coin liability accounting if scale jumps. Mitigated by 12-month expiry + flagging CA at ₹2L threshold.

**Biggest assumption risk:** 70/25/5 plan mix. If yearly take-up <10%, MRR is fine but cash-in-bank lags. Re-test at Day 30.

Ready for next task.
