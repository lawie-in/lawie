# T-702: Refund-Ink retry and outcome labels

Status: backlog, P3, billing only. Starts after T-646 merges. Raised 30 Oct 2026 by Priya from Arjun (the T-646 reviewer's should-fixes).

It is safe today: it can only under-reverse Ink. This is label and retry hygiene.

## Acceptance criteria
1. When another refund still has a pending claim, refund-ink returns busy (retryable), not grant_already_reversed.
2. When capAfterClaim lowers dueUnits to 0, the outcome label is grant_already_reversed.
3. Tests for both.
