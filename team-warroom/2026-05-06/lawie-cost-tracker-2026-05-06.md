# Lawie Cost Tracker — 2026-05-06

Owner: Vikram (CFO) | Founder: Abhinav | Phase: 1 (~85% shipped, demo.lawie.in live)
FX assumption: ₹83/USD (spot ~₹84.5 on 2026-05-06 — recompute monthly close at actual settlement rate; flagged as assumption risk).

---

## 1. Current Month Burn — May 2026 (IST)

| # | Vendor | Service / SKU | Usage Metric | USD/mo | INR/mo | GST/RCM 18%? | Notes |
|---|--------|---------------|--------------|--------|--------|--------------|-------|
| 1 | AWS | EC2 t3.medium ap-south-1 (on-demand) | 0.0468/hr × 24 × 30 = 720 hr | $33.70 | ₹2,797 | RCM yes | Largest single line. Reserved instance saves ~30% if 1y commit. |
| 2 | AWS | EBS gp3 30GB root | $0.0912/GB-mo × 30 | $2.74 | ₹227 | RCM yes | |
| 3 | AWS | Elastic IP | Attached & in use | $0.00 | ₹0 | — | Becomes $3.65/mo if detached. |
| 4 | AWS | Data transfer out | ~10 GB/mo × $0.1093 | $1.09 | ₹91 | RCM yes | First 100GB free tier may still apply Y1. |
| 5 | AWS | Secrets Manager | $0.40 × 4 secrets | $1.60 | ₹133 | RCM yes | |
| 6 | AWS | ECR storage | ~2 GB × $0.10 | $0.20 | ₹17 | RCM yes | |
| 7 | AWS | Route 53 hosted zone (lawie.in) | $0.50 | $0.50 | ₹42 | RCM yes | |
| 8 | Domain registrar | lawie.in renewal (annualized) | ₹999/yr ÷ 12 | $1.00 | ₹83 | 18% GST | |
| 9 | Anthropic | Claude Sonnet 4 — smoke tests | 12 drafts/day × 30 = 360 drafts × ~$0.063/draft (~6k in + 3k out tokens at $3/$15 per MTok) | $22.68 | ₹1,883 | RCM yes | Variable — biggest assumption risk on token mix. |
| 10 | MongoDB Atlas | M0 Free | 512 MB cap | $0 | ₹0 | — | Breaks at >512 MB or >500 conns → M10 $57/mo. |
| 11 | Redis Cloud | Free tier | 30 MB cap | $0 | ₹0 | — | Breaks at ~100 concurrent sessions → Fixed 250MB $5/mo. |
| 12 | Razorpay | Transaction fees | 0 txns | $0 | ₹0 | 18% GST on fee | 2.36% incl GST when active. |
| 13 | Sentry | Free tier | 5k errors/mo cap | $0 | ₹0 | — | Team plan $26/mo if breached. |
| 14 | GitHub | Free | — | $0 | ₹0 | — | |
| 15 | Notion | Free (solo) | — | $0 | ₹0 | — | |
| 16 | Jira | Free (≤10 users) | Solo + AI agents | $0 | ₹0 | — | Headroom OK. |
| 17 | Helicone | Free tier (under eval by Arjun) | — | $0 | ₹0 | — | |
| | | | **TOTAL** | **$63.51** | **₹5,273** | | |

**Largest cost driver:** AWS EC2 + EBS (₹3,024 = 57% of burn).
**Largest assumption risk:** Anthropic per-draft token mix. If drafts run 2× longer (12k in / 6k out), Anthropic line jumps to ₹3,766 and overtakes EC2.

---

## 2. 90-Day Phase 1 Burn Forecast

Per-user assumptions:
- Anthropic: ~30 drafts/mo × $0.063/draft = ₹157/user/mo
- Razorpay: ₹799 × 2.36% = ₹18.85/txn → net revenue ₹780.15/user
- Trial users (Case C): assume 5 drafts each before converting/dropping → ₹26/trial

| Case | Paying users | Trial users | Anthropic INR | Razorpay INR | Fixed infra INR | Total burn INR | Net revenue INR | Gross margin / paying user | Net P&L INR |
|------|-------------|-------------|---------------|--------------|-----------------|----------------|------------------|----------------------------|-------------|
| A — Day 0 (today) | 0 | 0 | ₹1,883 (smoke) | ₹0 | ₹3,390 | ₹5,273 | ₹0 | n/a | -₹5,273 |
| B — Day 30 | 5 | ~20 | ₹785 + ₹520 + ₹1,883 = ₹3,188 | ₹94 | ₹3,390 | ₹6,672 | ₹3,901 | ₹605 (76%) | -₹2,771 |
| C — Day 90 (target) | 25 | 100 | ₹3,925 + ₹2,615 + ₹1,883 = ₹8,423 | ₹471 | ₹3,390 + Atlas M10 ₹4,756 = ₹8,146 | ₹17,040 | ₹19,503 | ₹605 (76%) | +₹2,463 |

**Runway implications:**
- Case A: ₹100k buffer → 19 months runway
- Case B: ₹100k buffer → 36 months at this loss rate
- Case C: turns positive — break-even at ~22 paid users assuming Atlas M10 kicks in, ~9 paid users if still on M0

**Decisions to flag founder:**
- Trial draft allowance: cap at 3 (not 5) keeps Case C cleaner
- Atlas upgrade timing: budget M10 at user 40, not user 25
- Pricing review with Meera at Day 60 if Anthropic token mix trends higher than modelled

---

## 3. Tracker Spec — Notion "Cost Ledger" DB

**Location:** Notion → Finance workspace → new database "Cost Ledger"

**Schema:**

| Field | Type | Notes |
|-------|------|-------|
| Date | Date | Invoice date or accrual date |
| Vendor | Select | AWS, Anthropic, Atlas, Redis, Razorpay, Domain, Other |
| Service | Text | e.g. "EC2 t3.medium", "Sonnet 4 API" |
| Usage Metric | Text | e.g. "720 hours", "1.2M input tokens" |
| Cost USD | Number | Source of truth for foreign vendors |
| FX rate | Number | Settlement rate, default 83 |
| Cost INR | Formula | USD × FX rate |
| Category | Select | Infra, AI, Payments, Domain, Tools |
| GST/RCM 18% | Checkbox | Triggers RCM filing entry |
| Invoice URL | URL | Notion file attachment or S3 link |
| Notes | Text | Variance vs forecast |

**Seeded rows for May 2026:**

1. 2026-05-01 | AWS | EC2 t3.medium | 720 hours | $33.70 | ₹2,797 | Infra | RCM yes
2. 2026-05-01 | AWS | EBS gp3 30GB | 30 GB-mo | $2.74 | ₹227 | Infra | RCM yes
3. 2026-05-06 | Anthropic | Claude Sonnet 4 | ~360 drafts smoke | $22.68 | ₹1,883 | AI | RCM yes
4. 2026-05-01 | AWS | Route 53 lawie.in | 1 hosted zone | $0.50 | ₹42 | Infra | RCM yes
5. 2026-05-01 | AWS | Secrets Manager | 4 secrets | $1.60 | ₹133 | Infra | RCM yes

**Cadence:**
- **Monday:** Founder uploads invoice PDFs as Notion attachments to that week's rows
- **Tuesday:** Vikram reconciles, posts variance vs forecast in daily digest if delta >10%
- **Monthly close:** 3rd of next month — mirror to `/docs/finance/lawie_model.xlsx` and Google Sheets

**Alerts (manual until Helicone wired):**
- Anthropic single-day spend >₹500 → "DECIDE TODAY" item in next digest
- Atlas connection count >80% of free tier → infra ticket to Arjun
- Any AWS line >20% MoM growth → flag in next digest
- Razorpay first txn → trigger CA engagement workflow

**CA / compliance triggers:**
- GST registration mandatory once turnover crosses ₹20L (not imminent)
- RCM filing on AWS + Anthropic invoices required from month 1 of revenue
- TDS on domestic vendors (Razorpay) — confirm with CA before first settlement
- Engage CA before first Razorpay settlement (likely Day 30 in Case B)

---

Ready for next task.
