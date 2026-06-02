# CFO Sign-off — credit-skus.ts

**File:** `apps/billing/src/config/credit-skus.ts`
**Signed off by:** Vikram (CFO)
**Date:** 2026-05-12
**Authority:** Founder ask 2026-05-12 — CFO empowered to sign off without bounce-back.

## Verified against 2026-05-10 founder-approved credit-system decisions

| Item                     | Approved                           | In file                                   | Status |
| ------------------------ | ---------------------------------- | ----------------------------------------- | ------ |
| Practice monthly price   | ₹799                               | 799                                       | OK     |
| Practice monthly credits | 80                                 | 80                                        | OK     |
| Firm monthly price       | ₹1499                              | 1499                                      | OK     |
| Firm monthly credits     | 200                                | 200                                       | OK     |
| Practice yearly price    | ₹7,990 (17% off, 12-for-10)        | 7990                                      | OK     |
| Firm yearly price        | ₹14,990 (17% off, 12-for-10)       | 14990                                     | OK     |
| Yearly credits delivery  | monthly drip, same per-month grant | 80 / 200 per cycle, comment confirms drip | OK     |
| Top-up ₹199              | 20 credits                         | 199 / 20                                  | OK     |
| Top-up ₹499              | 60 credits                         | 499 / 60                                  | OK     |
| Top-up ₹999              | 150 credits                        | 999 / 150                                 | OK     |

## Scope note

This file is the SKU price/credit catalog only. The following live (correctly) outside this file and are NOT in scope of this sign-off:

- Free tier (10 signup + 30 login + 5 rating) — belongs in free-tier/credit-rules config
- Document weighting (simple=1, complex=2) — belongs in draft pricing config
- Roll-over / refund / lapse rules — belongs in subscription lifecycle handler
- Top-up credit permanence — belongs in credit ledger logic

Vishal to confirm those are wired separately as part of SCRUM-73 sub-items 3+.

## Unit economics gate (informational, not blocking)

- Practice ₹799 → net of Razorpay (~2% + 18% GST on fee) ≈ ₹781 net
- 80 credits/mo at current Sonnet 4 ₹/draft estimate must keep gross margin ≥ 60%
- CFO will track actual ₹/credit in monthly close; flag if margin breaches 55%

## Decision

SIGNED OFF. Vishal cleared to ship credit-skus.ts as-is for SCRUM-73 rollout.

— Vikram, CFO
