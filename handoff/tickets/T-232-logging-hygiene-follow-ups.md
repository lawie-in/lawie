# T-232 — Logging and Sentry follow-ups from T-210

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (which to do for v1), Ajay (req.ip under DPDP), Lead (build) |
| Mode           | Arjun triages first |
| Status         | Needs triage by Arjun |
| Size           | S to M |
| Depends on     | T-210, T-229 |
| Gate           | Arjun decides per item |
| Branch         | fix/t-232-logging-follow-ups |
| Legal sign-off | Ajay on req.ip only |
| Created        | 2026-10-11 |
| Source         | Shashank's T-210 review and developer notes, 11 Oct 2026 |

## Items

1. Scrub transaction spans in Sentry, not only events.
2. One end-to-end test through the real Sentry transport.
3. Is `req.ip` in logs allowed under DPDP? (Ajay, Arjun)
4. `console.warn` calls in auth services bypass the logger and its scrub.
5. Sentry breadcrumb data and URL-encoded emails are not masked.
6. Errors are captured twice (setupExpressErrorHandler and errorHandler).

The reset-password token in logged URLs goes to T-229; `passport.ts:57` (email stored as the user's name) goes to T-230.
