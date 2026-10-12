# T-315 — Shared JSON-error handler for auth, billing, gateway and email-worker (HIGH)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. HIGH (auth: login and register bodies can hold a password) |
| Owner  | Arjun (scope, glance). Lead (build) |
| Mode   | Full chain (`packages/shared` plus more than one service) |
| Status | Building: tanvi (12 Oct 2026). Auth part urgent, not waiting for T-234 |

T-307 gave drafting a handler that answers malformed, oversized and bad-encoding bodies with plain JSON and echoes nothing. The other services still use Express's default handler. It writes body-parser's message, with a slice of the body, to pm2 stderr. In auth that slice comes from a login or register body, so it can hold part of a password.

## Acceptance criteria (Arjun)

1. One shared export, `jsonBodyErrorHandler`, in `packages/shared`, with the same behaviour as T-307.
2. One line in each of `apps/auth`, `apps/billing`, `apps/gateway` and `apps/email-worker` (where it parses JSON) uses it.
3. Malformed, oversized and bad-encoding bodies get a plain JSON 4xx in every environment. Nothing from the body appears in the response, stderr or the logs.
4. Same tests as T-307, run in each service. `@lawie/shared` is rebuilt before those tests.
5. Drafting may switch to the shared export too, or keep its own (lead's call; keep the T-307 tests green).
