# T-591: email-worker — /health pings Redis and SES, reports both

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder rule 26 Oct 2026: every customer event sends an email) |
| Owner  | Arjun (raised), a lead (tomorrow) (build) |
| Mode   | Small fix (email-worker) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | handoff/ops/email-audit-2026-10-26.md (Arjun) |

## Problem
/health on port 9100 returns 200 and proves nothing about whether mail can be sent.

## Acceptance criteria
1. /health pings Redis and calls SES `GetAccount` (sandbox flag and sending enabled), and reports both in the body. Non-OK status when Redis is down.
2. No secrets or account ids in the body. Tests with mocked Redis and SES. Email-worker tests and build green.

## Files
apps/email-worker health route and its tests.
