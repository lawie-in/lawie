# T-635: Revoke the token family when a spent refresh token is reused

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Hardening (auth security) |
| Owner  | a lead (auth), after T-616b |
| Mode   | Full chain; Arjun design |
| Status | To do, deferred by Arjun 27 Oct 2026 (T-616b ruling 2). Priya |

## Problem
After T-616b, reusing a refresh token outside the 30 s grace window returns 401 and issues nothing, but does not revoke the family. A spent token can't be told apart from a logged-out or expired one without a tombstone.

## Acceptance criteria
1. Each rotation leaves a tombstone keyed by the spent token's hash (longer TTL, up to the absolute session ceiling), under the user's session namespace so revoke-all, password change and erase clear it.
2. A reuse that hits a tombstone revokes the whole family and logs the event (ids only).
3. The Redis cost per rotation is stated; tests cover reuse inside the window (same pair), reuse after (family revoked), and logout.
