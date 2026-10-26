# T-616b: Session server side — refresh grace window, per-user refresh limiter, shared session TTL

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (P1; follow-up to T-616) |
| Owner  | Arjun (design), Kunal (build, right after T-616) |
| Mode   | Full chain (auth + gateway + packages/shared constants) |
| Status | To do. Raised 26 Oct 2026 from Arjun's T-616 rulings. Priya |
| Source | handoff/tickets/T-616-session-ends-after-30-minutes.md, Design section |

## Acceptance criteria
1. Refresh token TTL 12 h sliding, renewed on every refresh, absolute ceiling 7 days from login: `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS` (names only) and shared constants in packages/shared.
2. Single-use rotation kept, with a 30 s grace: a token reused within 30 s of rotation returns the same new pair; after 30 s it revokes the token family.
3. `/api/auth/refresh` has its own limiter keyed by user id, 60 per 15 min, excluded from the shared per-IP 200/15 min limit.
4. Tests for each; auth and gateway tests and build green. packages/shared is held by one lead at a time: claim it through Priya.
