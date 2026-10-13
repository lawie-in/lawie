# T-390 — Held verification emails: send one, and refund the resend cap

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth) |
| Mode   | Small fix |
| Status | To do. Not assigned. Found by Kunal in T-379, 13 Oct 2026. Do before live sends if a lead is free; otherwise after v1 |
| Source | T-379 review |

## Background

T-379 holds verify-email jobs in the queue while the email footer is unfilled. When the footer is filled, every held job sends. A user who pressed resend N times gets N emails, and only the last link works. Each held resend also counted against the resend cap, even though nothing was sent.

## Acceptance criteria

1. The auth producer dedupes verify jobs per user, so only the newest one is queued and the older ones are dropped. A user gets at most one email, and its link works.
2. A resend that is held, not sent, doesn't use up the user's resend cap. Or Arjun rules the cap stays as it is, and this item is dropped.
3. Tests cover both.
