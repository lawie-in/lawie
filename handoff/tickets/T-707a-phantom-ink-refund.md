# T-707a: A failed draft can refund plan Ink that was already reset

Status: backlog, P1, billing and drafting (next month). Raised 30 Oct 2026 by Priya from Arjun's T-707 audit (H1).

When a draft fails or its hold expires, the refund can return plan Ink that a monthly drip, renewal or expiry already reset while the hold was open. The user gets free Ink ("phantom Ink"). The balance never goes negative.

## Acceptance criteria
1. A refund returns Ink only to a bucket and period that still exist; Ink that a reset or expiry already removed is not given back.
2. Tests: a hold open across a drip, across a renewal, and across an expiry, each followed by a failure.
