# T-587: auth — send the welcome email at sign-up

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder rule 26 Oct 2026: every customer event sends an email) |
| Owner  | Arjun (raised), Tanvi (build) |
| Mode   | Full chain (auth) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | handoff/ops/email-audit-2026-10-26.md (Arjun) |

## Problem
Template stub `welcome` exists (t318/t557 tests check wording) but is never queued (T-222 was to do). A new customer gets no welcome mail.

## Acceptance criteria
1. Exactly one welcome mail per user, queued with `enqueueEmail` on the low queue, idempotent per user (dedupe key like the verify one).
2. Hooks: apps/auth/src/services/verify-email.service.ts ~:241 (after verification succeeds) and apps/auth/src/config/passport.ts ~:167 (first Google sign-in, which skips verification).
3. Wording: if the stub has no Ajay/Madhuri sign-off on record, Ajay signs it before merge (three sentences). Unsigned wording does not merge.
4. Close or fold T-222. Tests for both hooks and for no duplicate on a second login. Auth tests and build green.

## Files
apps/auth/src/services/verify-email.service.ts, src/config/passport.ts, the welcome template wording only if Ajay changes it, their tests. Lead confirms after Explore.
