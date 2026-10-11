# T-230 — The sign-in token carries no email or name

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (payload and /me route), Lead (build), Anushka (verdict) |
| Mode           | Scope a /me route first, then build, full chain (auth, gateway, drafting, billing, web) |
| Status         | Needs scoping (/me route). After T-229 |
| Size           | M to L |
| Depends on     | T-229 |
| Gate           | Before v1 go-live (T-403) |
| Branch         | feature/t-230-token-without-pii |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Shashank's question in T-210, Arjun's answer, 11 Oct 2026 |

## Problem

Access and refresh tokens carry the user's email and name. Anyone holding the token can read them, and they travel in every request header.

## Acceptance criteria (draft, Arjun to confirm)

1. New payload: `sub`, `role`, `plan`, `type`, `jti`, `iat`, `exp`. No email, no name.
2. Code that reads email or name from the token gets it another way: gateway (`x-user-email`, `x-user-name`), drafting (`name` as the advocate name, `documents.routes.ts`), billing (`email` for `createSubscription`, `billing.routes.ts:49`), web (`getSessionUser` in `apps/web/src/lib/auth.ts`). Auth gets a `/me` route for the web app.
3. Old tokens keep working until they expire. No forced sign-out.
4. Tests for old and new tokens through gateway, drafting and billing.
