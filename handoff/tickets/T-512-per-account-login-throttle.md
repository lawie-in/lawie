# T-512: Per-account login throttle in auth

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a lead (build) |
| Mode   | Full chain (auth service) |
| Status | To do. V1.1, first in the security batch after T-403 (Arjun, 17 Oct 2026). Not a v1 blocker: no public sign-ups yet. Priya |
| Source | Shashank's T-507 finding |

## Problem

Login is protected only by the gateway's per-IP limit (200 requests per 15 minutes, in memory). Password guessing against one account from rotating IPs is not throttled.

## Acceptance criteria

1. A Redis-backed per-account counter in apps/auth, using the same pattern as the T-221 and T-507 /me/password limiters.
2. 10 failed logins per 15 minutes per email returns 429 with a flat body (the same body whether or not the account exists, so it does not reveal accounts).
3. A successful login resets the counter.
4. No lockout email in V1.1.
5. No personal data in logs (hash or omit the email).
6. Tests: the limit trips at 10, resets on success, is per account (another email unaffected), and the 429 body is identical for unknown emails.
