# T-673 — t298 referral maxUses concurrency test flakes (uses = 0)

Status: backlog (unassigned). Flaked twice on 29 Oct (d85a0fa7, 13b1ed24), with no auth change in either commit.

## Acceptance criteria
1. Find out why apps/auth t298-referral-ink "maxUses 1, five concurrent sign-ups" sometimes gets uses = 0: either a real race where no claimer wins, or a test timing issue.
2. If it's a real bug: fix it so exactly one sign-up wins under contention, and add a stress test (e.g. 50 iterations) proving it.
3. If it's the test: make it deterministic without weakening the assertion. Never skip or quarantine the test.

## Mode
Small fix (auth only). Referrals/credits area.
