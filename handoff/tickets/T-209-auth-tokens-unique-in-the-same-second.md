# T-209 — Auth: register then login in the same second no longer returns 500

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Phase          | 0 — Prep                                                                     |
| Owner          | Lead (build). Arjun (heads-up: token format change). Anushka (verdict)       |
| Mode           | Build, full chain (auth)                                                     |
| Status         | Ready                                                                        |
| Size           | S (0.5 day)                                                                  |
| Depends on     | None                                                                         |
| Gate           | Before v1 go-live (T-403)                                                    |
| Branch         | fix/t-209-auth-token-collision                                               |
| Legal sign-off | Not needed                                                                   |
| Created        | 2026-10-11                                                                   |
| Source         | Finding from the T-196 build, 11 Oct 2026                                    |

## Problem

`jwt.service.ts` signs tokens from the user payload plus `iat`, which has one-second resolution, and no unique id. Two sign-ins for the same user in the same second produce identical tokens, so `hashToken` gives the same hash and the session write collides: 500. The same happens on a double refresh or two tabs.

## User

Advocate who signs up and is signed in straight away, or taps "Sign in" twice.

## Acceptance criteria

1. Every access and refresh token carries a unique id (e.g. `jti`), so two tokens signed in the same second differ.
2. Test: register then login for the same user within one second → both 2xx, two sessions.
3. Test: two logins in the same second → both succeed, both sessions valid, logout of one leaves the other.
4. Existing tokens still verify (no forced sign-out on deploy), or Arjun accepts a sign-out in this file.
5. Gateway and drafting token checks still pass (they verify the same JWT). CI green on auth and gateway.

## Out of scope

- Session lifetime and refresh policy

## References

- `apps/auth/src/services/jwt.service.ts`, `session.service.ts`
