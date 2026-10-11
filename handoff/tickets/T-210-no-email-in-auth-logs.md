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

## Decisions

- Arjun (11 Oct 2026): AC4 yes, with conditions.
  1. Pino `redact` on `email`, `password`, `*.email`, `*.password`, censor `'[Redacted]'`, as proposed. `*.x` only reaches one level, so the `err` serializer is still needed for `err.keyValue`.
  2. `err` serializer: drop `keyValue` and ValidationError `errors[*].value`. Mask only the email-shaped substring in `err.message`, not the whole message. Keep `name`, `code` (11000), `keyPattern` (field names only), `stack` and the collection/index name. That is all we need to debug E11000; nothing is lost.
  3. Logs alone do not meet the Gate. Sentry gets the email two other ways, and the Pino change touches neither: (a) `Sentry.setupExpressErrorHandler(app)` (`app.ts:48`) and `errorHandler` both send the raw `err`, whose E11000 message holds `dup key: { email: "..." }`. (b) `@sentry/node` v10 records incoming request bodies by default, so register and login bodies (email and password) can go with any event. Fix in `apps/auth/src/config/sentry.ts`, in this ticket: set `sendDefaultPii: false` explicitly, turn off request-body capture (`httpIntegration({ maxIncomingRequestBodySize: 'none' })`), and add a `beforeSend` that masks email-shaped text in exception values and the event message and deletes `request.data`, `request.cookies` and any `keyValue` in `extra`/`contexts`. Use the same masking helper as the Pino serializer.
  4. Test: E11000 on register and on Google sign-up. Assert that neither the log line nor the `beforeSend` output contains the email, and that `code` and `keyPattern` are still there.
  5. Out of scope here: the double Sentry capture (Express handler plus `errorHandler`), and `name: profile.displayName ?? email` in `passport.ts:57`, which stores the email as the name. That one is not a log issue, but log it as a follow-up.
