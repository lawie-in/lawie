# T-574: Keep test accounts out of billing and revenue

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up to T-563; before main; parked until after Anushka's first run) |
| Owner  | Arjun (design done: T-563 default 8), a lead (build; apps/billing) |
| Mode   | Full chain (billing) |
| Status | To do. Raised by Vishal and Arjun in T-563, 22 Oct 2026. After Shashank's billing merge. Priya |
| Source | `T-563-*.md` (Arjun's default 8) |

## Problem
Test accounts (username prefix TEST) get 30 Ink without paying. Billing must never treat them as customers: no purchase of paid items by test accounts, no invoices issued, and they must not appear in revenue or counts.

## Acceptance criteria
1. Purchase guard: a test account cannot buy a paid item.
2. No tax invoice or invoice email is generated for a test account.
3. Revenue and customer counts exclude test accounts (billing admin views and any export).
4. Tests; no change to real users' behaviour.

## Files
Claimed by Priya when a lead takes it, after Shashank's billing work has merged. Not before T-563 is merged.
