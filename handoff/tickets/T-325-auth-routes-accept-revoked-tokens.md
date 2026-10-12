# T-325 — Auth's own routes accept revoked access tokens (HIGH)

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Before go-live. HIGH, security |
| Owner  | Arjun (spec: last section of the T-299 file, ca343fa). Kunal (build) |
| Mode   | Full chain (auth) |
| Status | To do. Kunal right after T-299 + T-308 (same service). Found by Arjun, 12 Oct 2026 |

The auth service's own routes (admin-users, admin-audit, referral) accept a revoked access token for up to 24 hours.

## Acceptance criteria (Arjun)

1. `apps/auth/src/middleware/authenticate.ts` refuses a revoked access token on every auth route, per the spec in T-299.
2. A test shows a revoked token is refused on each of the three route groups, and a valid token still works.
3. No other file changes.

## Rides along (from T-299 review)

`session.service.ts` `deleteAllUserSessions` builds its scan patterns by hand. Switch it to the shared key helpers, with no behaviour change.
