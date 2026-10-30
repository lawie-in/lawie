# T-617: Admin records still wrong: Ink ledger, AI cost, last active, drafts by type

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P2; from the prod quality check of 26 Oct 2026) |
| Owner  | Shashank (billing/admin); Arjun glance |
| Mode   | Full chain |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
The Ink ledger shows none of the 6 Ink spent (Spent -0, 16 in circulation vs 33 in Overview); AI configuration shows Total cost INR 0 for 4 generations and 38,248 tokens; Users 'Last active' shows '-' for an account in use; Dashboard 'Drafts by type' shows 3 of 4 (the injunction is missing) and one label is 'Guided', an internal word. Audit log 0 events is T-598. Quality report item 9.

## Acceptance criteria
1. The ink ledger records every spend.
2. AI cost computed from tokens and the model price table (Vikram's rates).
3. Last active updates on use.
4. Drafts by type counts every document and uses user-facing labels.

## Files
Lead lists after Explore (apps/billing, apps/drafting admin routes, web admin). Claimed by Priya.

## Vikram (26 Oct 2026): AI cost formula (AC2)

Per call, in USD, rates per million tokens from the model price table in AppSettings:
`cost = (input × rIn + output × rOut + cacheWrite5m × 1.25·rIn + cacheWrite1h × 2·rIn + cacheRead × 0.1·rIn) / 1,000,000`
(`input` is uncached input only, as `Generation.inputTokens` already stores it.) In ₹: `cost × ai.fx_inr_per_usd` (AppSetting, 88 today). A draft sums its generation row and its aux calls (intake, preflight, v3 passes).

- **A missing rate is never ₹0.** Store `costStatus: 'rate_missing'` (the model already has it) and show "rate missing" on the admin page, with the token count. Prod's "₹0 for 38,248 tokens" is almost certainly that: the price table is not seeded on prod.
- Rates on develop today: Sonnet 5.5 $2 in / $10 out, cache write (1h) $4, cache read $0.20. Haiku 5.5 is $0.10 / $0.50 on develop. Arjun confirms that figure against Anthropic's price page before it is seeded on prod (see ADR-drafting-v3 §4, Vikram).
- Rates are copied onto each row at save (already the design), so a price change never rewrites history.
- **Prod seed gap:** prod also lacks `pricing.paragraph_bands.*` (T-577), so any count charges the class price. A 25-paragraph bail is charged 2 Ink instead of 4 (≈ ₹6.50 cost per Ink, over the line). Seed the price table and the bands on prod (values in T-577 "## Vikram"), or hold the paragraph count at ≤ 10 until they are.

**Correction (Vikram, 26 Oct, after Arjun checked Anthropic's price page):** use each model's own cache rates from the price table, not multipliers of the input rate. Sonnet 5.5 is $2 in / $10 out, cache write $2.50, cache read $0.10. Haiku 5.5 is $0.10 / $0.50, cache write $0.125, cache read $0.01. Both are for prompts up to 100k tokens; above that, Haiku is $0.50 / $2.50. Formula: `cost = (input × rIn + output × rOut + cacheWrite5m × rCacheWrite5m + cacheWrite1h × rCacheWrite1h + cacheRead × rCacheRead) / 1,000,000` (the $2.50 / $0.125 write rates are the 5-minute ones; Arjun confirms the 1-hour write rates from the same page). A call whose prompt passes 100k tokens is priced at the higher tier, and logs a warning, because our drafts should never get there. `finance.usd_inr` on prod: 88. Develop's Sonnet cache-read rate (0.20) must be re-seeded to 0.10; its 1-hour write rate (4) stays only if the price page confirms it.
