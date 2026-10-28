# T-651 — inkledger delta correctness

Status: backlog (unassigned). From Arjun via Shashank's T-646 work, 28 Oct 2026. One lead, drafting only.

## Problem
The sub_renewal and drip writers record a `delta` that isn't the real balance change, so delta sums over inkledger overstate. balanceAfter and the delta sums disagree, and Vikram's KPIs read this.

## Acceptance criteria
1. The sub_renewal and drip writers record the real delta, so that `balanceAfter(prev) + delta == balanceAfter` for each bucket.
2. A backfill script corrects historic rows. It is a DRY RUN by default, prints counts only and needs an explicit flag to write. It runs on prod only through Arjun and Nikhil.
3. Tests: replay == balanceAfter for every writer, and the dry run writes nothing.
4. Tell Vikram when it lands, so the delta-sum KPIs can be trusted again.
