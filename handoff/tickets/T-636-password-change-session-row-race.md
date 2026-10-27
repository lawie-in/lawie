# T-636: Password change can hide the kept session's row for up to 15 min

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Polish (auth, LOW) |
| Owner  | a lead (auth) |
| Mode   | Small fix |
| Status | To do. Raised 27 Oct 2026 from Kunal's T-616b round-2 review. Priya |

## Problem
In deleteOtherUserSessions (password change), the Mongo deleteMany can drop the row of the caller's own kept family if that family rotates mid-call. The session then disappears from GET /me/sessions until its next rotation (≤15 min). The refresh side is never touched, so there is no security impact.

## Acceptance criteria
1. Run one more collectFamily right before the deleteMany, or filter on createdAt < call start.
2. A test interleaves a rotation with a password change; the kept row survives.
