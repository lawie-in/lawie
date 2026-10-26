# T-590: auth — 5 s cap on enqueueEmail, same not-queued log as billing

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder rule 26 Oct 2026: every customer event sends an email) |
| Owner  | Arjun (raised), Mahak or Vishal (tomorrow) (build) |
| Mode   | Small fix (auth) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | handoff/ops/email-audit-2026-10-26.md (Arjun) |

## Problem
enqueueEmail in auth has no timeout (billing caps at 5 s). With Redis down, sign-up hangs and the log says "queued".

## Acceptance criteria
1. Same 5 s cap and the same "not queued" log as billing. Sign-up completes without the mail when Redis is down.
2. Test with a hung queue. Auth tests and build green.

## Files
apps/auth enqueueEmail helper and its test. After T-587 (same area).
