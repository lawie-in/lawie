# T-390 — Held verification emails: send one, and refund the resend cap

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth) |
| Mode   | Small fix |
| Status | Merged into develop_staging ed2e18a (Mahak, 13 Oct 2026). Waiting for Anushka on develop. Priya |
| Source | T-379 review |

## Background

T-379 holds verify-email jobs in the queue while the email footer is unfilled. When the footer is filled, every held job sends. A user who pressed resend N times gets N emails, and only the last link works. Each held resend also counted against the resend cap, even though nothing was sent.

## Acceptance criteria

1. The auth producer dedupes verify jobs per user, so only the newest one is queued and the older ones are dropped. A user gets at most one email, and its link works.
2. A resend that is held, not sent, doesn't use up the user's resend cap. Or Arjun rules the cap stays as it is, and this item is dropped.
3. Tests cover both.
4. Fix the header comment at line 2 of `apps/auth/src/__tests__/t223-resend-cap-real-redis.test.ts`; it still describes the old Redis order (Kunal, T-379).

**Arjun (13 Oct, AC2):** option B, drop AC2. The hold is a configuration state (footer unfilled) that must never be true in production; the resend cap is an abuse limit, not a delivery promise, and AC1's dedupe already means one email per user when the hold lifts. No cross-service "held" signal. Condition: the held state is visible — email-worker /health reports it and T-379's log line fires once — so nobody is silently capped in prod.

## Arjun (13 Oct 2026, via Mahak)
AC2 dropped: the resend cap stays as it is. His condition, that the held state is visible, is already met: email-worker /health returns 503 unfilled_footer_placeholders, and the hold is logged once at boot.
