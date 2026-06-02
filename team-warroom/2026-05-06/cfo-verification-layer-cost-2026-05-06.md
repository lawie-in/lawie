# CFO Call: Pre-Generation Verification Layer — Cost Analysis

**Date:** 2026-05-06
**Author:** Vikram (CFO)
**For:** Abhinav (Founder); cc Arjun (Architect), Ajay (Legal Taxonomy), Priya (Product)

---

## VERDICT: YES, build it — with guardrails

Haiku adds ~₹0.29/draft (23% bump on Sonnet draft cost ₹1.25) and breaks even at just ~23% regen-avoidance rate. Current rough drafts likely sit at 20-30% regen for catchable mistakes. Net positive once churn/NPS upside is included. Monthly burn impact is negligible (₹67/mo at Day 90).

---

## 1. Per-Draft Marginal Cost

### Haiku 4.5 verifier call

| Component | Tokens | $ rate | USD | INR (₹83/USD) |
|---|---|---|---|---|
| Input | 800 | $1/MTok | $0.0008 | ₹0.066 |
| Output | 300 | $5/MTok | $0.0015 | ₹0.125 |
| **Subtotal** | 1,100 | — | **$0.0023** | **₹0.19** |
| Safety buffer (50%, retries / longer prompts) | — | — | $0.0035 | **₹0.29** |

### Comparison to Sonnet draft cost

- Sonnet 4 draft (real, today): **₹1.25 / $0.0151** at 954 in + 815 out
- Verifier marginal: **₹0.29 / $0.0035**
- **Bump on per-draft cost: +23%** (worst-case +30%)

### Regen-avoidance break-even

- 1 Sonnet regen = ₹1.25 (full draft re-run)
- Verifier cost = ₹0.29
- **Break-even regen-avoidance rate = 0.29 / 1.25 = 23%**
- Estimated current regen rate for catchable mistakes (wrong section, party missing, jurisdiction mismatch) on first-time advocate users: **20-30%** (gut, pending Priya telemetry)
- Conclusion: verifier is roughly **cost-neutral on Sonnet alone** — before any churn/NPS upside

**Largest assumption risk:** regen rate is unverified. Priya must instrument regen events this sprint.

---

## 2. Monthly Burn Impact

Assumptions:
- Paying users: 1.2 drafts/user/month (early-stage usage)
- Trial users: 2 drafts each (capped 10/month, but realistic actual = 2)

| Stage | Drafts/mo | Verifier ₹/mo | Verifier USD/mo | Sonnet ₹/mo | Verifier % of Sonnet |
|---|---|---|---|---|---|
| Today (~12/day smoke × 30) | 360 | ₹104 | $1.25 | ₹450 | 23% |
| Day 30 (5 paid × 1.2 + 20 trials × 2) | 46 | ₹13 | $0.16 | ₹58 | 23% |
| Day 90 (25 paid × 1.2 + 100 trials × 2) | 230 | ₹67 | $0.81 | ₹288 | 23% |

### Phase 1 budget headroom

- Total LLM spend Day 90: Sonnet ₹288 + Haiku ₹67 = **~₹355/mo / $4.28**
- Phase 1 MRR target: 25 × ₹799 = ₹19,975
- LLM gross-margin impact: ~1.8% of MRR — well inside 60%+ gross margin target
- **Headroom is not the constraint.** This decision is about value, not affordability.

---

## 3. Decision Math: Net Positive?

| Lever | Direction | Magnitude | Confidence |
|---|---|---|---|
| Sonnet regens avoided | Saves ₹0.25-0.38/draft | Material if regen rate >23% | Medium (needs telemetry) |
| Embarrassing-draft churn avoided | 1 paying advocate saved = ₹799 LTV-month, likely 6-12 mo LTV = ₹4.8K-9.6K | 1 save/quarter funds verifier ~100x | Handwave, high asymmetric upside |
| NPS / word-of-mouth in tight bar circles (Bihar/Jharkhand district court cohort) | Trust compounds; one bad draft seen by peers in court can poison cohort | Cannot model, but downside of being known for "wrong section" drafts is severe | Low confidence, high impact |
| Friction risk: Haiku false-positives interrupting clean drafts | Cost in user experience | Real — Priya owns UX guardrail | Medium |

### Bottom line

- **Worst case:** 10% regen rate, no churn impact → verifier costs ~₹40/mo extra at Day 90 with ~₹0 saved. Affordable.
- **Realistic case:** 20-30% regen + 1 churn-save/quarter → strongly net positive
- **Best case:** Verifier becomes a marketing asset ("Lawie checks before drafting") → asymmetric NPS lift

---

## Guardrails (binding if we ship)

1. **Hard cap Haiku call: 1,500 input + 500 output tokens.** If exceeded, fall back to deterministic-only and log the event for review.
2. **Track `verifier_cost_inr` per draft** in the same cost ledger as Sonnet. Daily roll-up to Notion Finance DB.
3. **Kill switch:** if verifier monthly cost exceeds 15% of Sonnet monthly cost without measurable regen-rate drop, disable.
4. **Re-review at Day 30** with actual regen-rate telemetry from Priya before scaling verifier to all paying users.
5. **No human CA decision needed** for this layer; standard expense.

---

## Open dependencies

- **Priya:** instrument regen events (button click → log) this sprint. Without this, we are flying on guesswork at Day 30 review.
- **Arjun:** confirm Haiku call lives behind a circuit-breaker; on Haiku API outage, default to "pass through" rather than block draft.
- **Ajay:** legal taxonomy edge cases — what % of cases will deterministic rules catch vs need Haiku? If deterministic catches >50%, Haiku call rate may be much lower than 1:1 with drafts (further reducing cost).

---

Ready for next task.
