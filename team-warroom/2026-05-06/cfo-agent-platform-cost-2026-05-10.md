# CFO Cost Analysis: API-Based Agent Platform vs Cowork
**Date:** 2026-05-10 | **Author:** Vikram (CFO) | **For:** Abhinav (Founder)

---

## Verdict: DEFER until 25 paying users (Phase 1 ships)

---

## 1. Build Cost (Opportunity Cost)

| Assumption | Value | Source | Sensitivity |
|---|---|---|---|
| Vishal velocity | ~2 SCRUM tickets/week on Lawie product | Phase 1 status doc | ±30% |
| Build duration | 3-4 weeks | Founder estimate | High — could slip to 6 |
| Tickets foregone | **6-8 Lawie product tickets** | 2/wk × 3-4 wk | — |
| Cash outlay | ₹0 (AI labour) | — | — |

**Real cost: 6-8 SCRUM tickets that don't ship.** At Phase 1, each missed ticket = a feature that could have closed a paying advocate. Largest assumption risk: Vishal's parallel agent work doesn't fully offset (debugging multi-service orchestration is non-linear).

---

## 2. Monthly Run Cost

### LLM (the big one)

| Scenario | Tasks/day | Mix | ₹/month | $/month |
|---|---|---|---|---|
| Worst case (all Sonnet, high vol) | 165 | 100% Sonnet | **₹6,188** | $74.50 |
| Realistic (mixed) | 110 | 6 Sonnet + 5 Haiku (~1/3 cost) | **₹2,750** | $33 |
| Low end | 55 | Mixed | **₹1,375** | $16.50 |

Math: 110 tasks/day × 30 = 3,300 calls/mo. Sonnet ₹1.25/call × 1,800 = ₹2,250 + Haiku ₹0.33/call × 1,500 = ₹500. **Realistic ≈ ₹2,750/mo.**

### Infra Delta vs Today

| Item | Today | Needed | Delta ₹/mo |
|---|---|---|---|
| EC2 t3.medium | ₹2,797 | t3.large for 11 services | +₹2,800 |
| Redis Cloud | Free 30MB | Paid 250MB (queues for 11 agents) | +₹600 |
| Mongo Atlas | M0 Free | M0 holds (agent state is small) | ₹0 |
| Sentry | Free 1 seat | Free still works | ₹0 |
| Helicone | Free | Free up to 100k req/mo — fits | ₹0 |
| Doppler secrets | none | Free tier (5 users) | ₹0 |
| **Infra delta** | | | **+₹3,400** |

### Total Monthly Delta

**₹2,750 (LLM) + ₹3,400 (infra) = ₹6,150/mo realistic. Worst case ~₹9,600/mo.**

Largest cost driver: **EC2 upgrade**, not LLM. Biggest assumption risk: 11 concurrent services may need t3.xlarge (₹11k) if memory-bound — could push delta to ₹9k.

---

## 3. Break-even / ROI

| Line | Value | Note |
|---|---|---|
| Current Cowork cost | ~$50/mo (₹4,150) | Founder Claude + Cowork sub estimate |
| Build cost (cash) | ₹0 | AI labour |
| Build cost (opportunity) | 6-8 tickets | Real |
| New run cost | ₹6,150/mo | Realistic |
| **Net monthly cash delta** | **+₹2,000/mo** | Cowork displaced; small net increase |
| Time saved (parallel exec) | 16 hrs/mo × ₹2,000 | **₹32,000/mo notional** |
| **Reinvestment haircut** | **40%** | Honest: founder context-switches, Twitter, planning loops eat most of the saved time. ~6.4 hrs actually flows to revenue work. |
| **Real time value** | **₹12,800/mo** | 6.4 hrs × ₹2,000 |

ROI = ₹12,800 saved – ₹2,000 cash delta = **₹10,800/mo net**, IF the saved time is actually deployed on revenue. Payback on opportunity cost: ~6-8 weeks of operation, assuming the displaced product tickets weren't the ones that closed paying users.

---

## 4. CFO Recommendation: DEFER

**Why not now:**
1. Phase 1 MRR target is ₹19,975/mo. Spending 6-8 product tickets on internal tooling when 0 paying users exist is the wrong sequencing. Tickets compound revenue; agent platform compounds founder convenience.
2. ₹32k/mo "saved time" is notional. With no paying users, there's no revenue work to reinvest into — the saved time has no productive sink yet.
3. Cowork at ~₹4,150/mo is already cheap. The pain isn't cost; it's perceived friction.
4. Build complexity risk: 11 concurrent services × debugging × Vishal-as-AI = real chance of 6-week slip, not 3-4. That's 12+ tickets foregone.

**When to revisit:** Once 25 paying users sign (₹19,975 MRR confirmed), founder time genuinely becomes the bottleneck and reinvestment haircut drops because there's a real revenue pipeline to feed. Build then. Cost will not have changed materially.

**One thing to do now:** Track Cowork friction in a Notion page. If founder hits >2 hrs/day of "agent orchestration overhead" before 25 users, revisit early.

---
**Largest cost driver:** EC2 upgrade, not LLM
**Biggest assumption risk:** Reinvestment haircut — does saved time become revenue?
