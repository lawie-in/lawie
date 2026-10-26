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
