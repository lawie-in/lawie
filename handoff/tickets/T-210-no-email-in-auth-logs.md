# T-210 — Auth logs carry no email address (PII)

| Field          | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Phase          | 0 — Prep                                                                                  |
| Owner          | Lead (build). Ajay (heads-up, DPDP). Anushka (verdict on sign-up still working)           |
| Mode           | Build, full chain (auth)                                                                  |
| Status         | Merged into develop_staging (37a1d32, 11 Oct 2026), waiting for Anushka on develop. Also carries T-211's syncIndexes fix |
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

- Arjun (11 Oct 2026, T-210 round 2): Shashank's fix approved, with conditions. JWT email/name: remove, separate ticket.
  1. Checked against `@sentry/core` 10.55.0 (the version in `yarn.lock`). With `sendDefaultPii: false`, the RequestData integration still attaches every incoming header to the error event's `request.headers`. Only `cookie` and the IP headers are taken out. The SDK's `auth`/`token`/`jwt` deny list only filters span attributes, not the event. So `Authorization: Bearer <jwt>` goes to Sentry today, and the JWT payload holds email and name.
  2. Approved: an allowlist on `request.headers` (`host`, `user-agent`, `content-type`, `content-length`, `accept`) inside `scrubEvent`, with `beforeSendTransaction` running the same `scrubEvent`. Keep it an allowlist, not a deny list, so `x-internal-secret` and `x-user-*` are dropped as well. Do not use the SDK's `dataCollection` option instead: once it is set, the base defaults change to permissive (`cookies: true`, `queryParams: true`).
  3. Test to add: give one error event and one transaction event `authorization`, `cookie`, `x-internal-secret`, `x-user-email` and `x-user-name` headers. After the scrub, only the five allowlisted headers are left, and the event JSON contains neither the email nor the token string.
  4. Other services leak the same way. This is not T-210; Priya opens a separate ticket, before T-403. Gateway and drafting `config/sentry.ts` only delete `request.data`, so their headers go out: on gateway that is `Authorization`, and on drafting it is `x-internal-secret`, `x-user-email` and `x-user-name`, which gateway injects at `app.ts:72-78`. Billing `config/sentry.ts` has no `beforeSend` at all and receives the same injected headers. `email-worker` (`src/index.ts:21`) has no hooks either. The leaked `x-internal-secret` is a credential, so that ticket is P1, not a hygiene fix. It should share one scrub helper in `@lawie/shared` across all five services.
  5. JWT payload: the JWT should not carry email or name. Any `Authorization` header that leaks anywhere (Sentry, proxy logs, the browser's `localStorage`) leaks the email with it. New payload: `sub`, `role`, `plan`, `type`, `jti`, `iat`, `exp`. Separate ticket, after the item 4 ticket. Consumers to change:
     - Gateway reads `email` and `name` from the token and forwards them as `x-user-email` and `x-user-name` (`app.ts:75,78,237,240,263,266`). Stop sending them, and remove `USER_EMAIL` and `USER_NAME` from `INTERNAL_HEADERS` in `packages/shared`.
     - Drafting uses `name` as the `advocateName` fallback (`documents.routes.ts:455,886,1127-1128,1612`). It reads the User record by `sub` instead; drafting already has a `User` model.
     - Billing passes `email` to `createSubscription` (`billing.routes.ts:49`). It reads the User record by `sub` instead; billing already has a `User` model.
     - Web: `getSessionUser` in `apps/web/src/lib/auth.ts` decodes the token in the browser for `email` and `name`. It needs a profile read instead. Auth has no `/me` route today, so Priya scopes one.
     - Auth: `TokenPayload` in `jwt.service.ts` and its sign call sites (`auth.service.ts`, `oauth.routes.ts`).
     - Rollout: verifiers must accept old tokens that still carry email until they expire, and the web must work with tokens that have no email or name.
