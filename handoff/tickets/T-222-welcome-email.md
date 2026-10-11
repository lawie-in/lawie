# T-222 — A new user gets a welcome email

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Madhuri (copy), Ajay (checks claims), Lead (build), Anushka (verdict) |
| Mode           | Copy first, then build, full chain (auth, email-worker) |
| Status         | To do. Needs Madhuri's copy |
| Size           | S (0.5 day) |
| Depends on     | T-220 to send for real. T-225 |
| Gate           | Before v1 go-live. Nice to have, not a blocker |
| Branch         | feature/t-222-welcome-email |
| Legal sign-off | Ajay checks the copy for claims (BCI, no promise of accuracy) |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

`auth.welcome` is a stub template and nothing sends it.

## Acceptance criteria

1. Sign-up by email and first Google sign-in each send `auth.welcome` once, never twice for the same user.
2. The copy is Madhuri's, checked by Ajay: what Lawie does, the free drafts the user has, how to start, how to get help. No claim of legal accuracy.
3. Sign-up still succeeds if the email cannot be queued; the failure is logged by user id only.

## Out of scope

- Any drip or marketing sequence

## References

- `apps/email-worker/src/templates/auth/welcome.tsx`, T-225
