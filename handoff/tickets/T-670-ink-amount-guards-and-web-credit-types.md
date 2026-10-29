# T-670 — Amount guards on spendInk/holdInk; tidy web credit types

Status: backlog (unassigned). Follow-ups from Kunal's T-667 Explore, 29 Oct 2026.

## Acceptance criteria
1. spendInk and holdInk (apps/drafting) refuse a non-finite or non-positive amount with the same typed error as T-667, before any write. The draft hot path keeps its current latency (one cheap check).
2. apps/web useCredits.ts: drop the unused `total` and `earnedCredits` type fields once T-667 has removed `total` from the server. Update the web fixtures to the real response shape.
3. Tests cover both; drafting and web CI are green.

## Mode
Small fix. Two services, so do it as two branches or with a full chain.
