# T-210 — Auth logs carry no email address (PII)

| Field          | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Phase          | 0 — Prep                                                                                  |
| Owner          | Lead (build). Ajay (heads-up, DPDP). Anushka (verdict on sign-up still working)           |
| Mode           | Build, full chain (auth)                                                                  |
| Status         | Assigned to shashank, 11 Oct 2026. Not started |
| Assigned lead  | shashank |
| Size           | XS (0.25 day)                                                                             |
| Depends on     | None                                                                                      |
| Gate           | Before v1 go-live (T-403): no personal data in logs or Sentry                              |
| Branch         | fix/t-210-no-email-in-auth-logs                                                           |
| Legal sign-off | Not needed for the code. Ajay told it is fixed                                            |
| Created        | 2026-10-11                                                                                |
| Source         | Finding, 11 Oct 2026                                                                      |

## Problem

`apps/auth/src/config/passport.ts:60` logs `{ userId, email }` on every new Google sign-up. Emails are personal data under the DPDP Act 2023 and should not sit in log storage.

## Acceptance criteria

1. No log line in `apps/auth` writes an email, name or phone. `userId` is enough.
2. The error handler does not log request bodies that hold an email or password. The lead checks and lists what it logs.
3. A test or a grep in the report shows no `email` field in any `logger.*` call in `apps/auth/src`.
4. Pino `redact` covers `email`, `password`, `*.email`, `*.password` as a safety net, if Arjun agrees (one line in the report).
5. CI green on auth.

## Out of scope

- Other services (follow-up if the grep finds any)
- Log retention

## References

- T-187 AC10 (same rule for the ledger)
