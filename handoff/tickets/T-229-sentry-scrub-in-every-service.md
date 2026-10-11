# T-229 — No credentials or personal data reach Sentry from any service

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (approach, given 11 Oct), Lead (build), Ajay (heads-up, DPDP) |
| Mode           | Build, full chain (packages/shared, gateway, drafting, billing, email-worker) |
| Status         | To do. P1. packages/shared is held in turn: vishal (T-189), then mahak (T-194), then this ticket |
| Size           | M (1 day) |
| Depends on     | T-210 (the scrub it extracts) |
| Gate           | Before v1 go-live (T-403). The shared internal secret going to Sentry is a credential leak |
| Branch         | fix/t-229-sentry-scrub-all-services |
| Legal sign-off | Not needed. Ajay told (DPDP) |
| Created        | 2026-10-11 |
| Source         | Arjun, T-210 round 2 review, 11 Oct 2026 |

## Problem

With `sendDefaultPii: false`, Sentry error events still carry every request header except cookie and IP headers. Gateway and drafting only delete the request body; billing and email-worker scrub nothing. The gateway adds `x-internal-secret`, `x-user-email` and `x-user-name` to requests it forwards to drafting and billing, so the shared secret and user data reach Sentry. Auth gets its own fix in T-210.

## Acceptance criteria

1. One scrub helper in `@lawie/shared` (moved from T-210's auth version), used by all five services: header allowlist (host, user-agent, content-type, content-length, accept), no request body or cookies, emails masked, Mongo `keyValue` dropped; `code`, `keyPattern`, `name`, `stack` kept.
2. Each service runs it from `beforeSend` and `beforeSendTransaction`. Not the SDK's `dataCollection` option (Arjun: it loosens other defaults).
3. Tests per service: `authorization`, `cookie`, `x-internal-secret` and `x-user-*` headers are stripped from both an error event and a transaction event.
4. The founder rotates `INTERNAL_SECRET` after this ships, since it has already reached Sentry (Arjun to confirm).
5. CI green on every touched workspace.

## References

- T-210 ("Arjun (11 Oct 2026, T-210 round 2)"), T-117

## Added (Priya, 11 Oct 2026)

6. `/auth/reset-password/:token` puts the live reset token into the logged URL and the Sentry URL (Shashank, T-210). Mask path tokens in the shared scrub.

