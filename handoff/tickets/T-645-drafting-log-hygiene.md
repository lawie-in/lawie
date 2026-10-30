# T-645 — Drafting log hygiene (keep input fragments out of logs and Sentry)

Status: backlog (unassigned). From Arjun's audit of prod v1.2.0 (main 849bb38e), 27 Oct 2026. Small, one lead, no ADR.

## Problem
Drafting logs raw `err.message` at about 15 sites. If a database, Anthropic or PDF-renderer error message echoes part of the input, that fragment reaches the box log and a Sentry console breadcrumb. The nginx access log also keeps query strings.

## Acceptance criteria
1. Drafting logs `err.name` and `err.code` instead of `err.message`.
2. A Pino err serializer in drafting, gateway and billing drops Mongoose `errors.*.value` and `keyValue`.
3. Sentry on the server: turn consoleIntegration off, or scrub the breadcrumbs.
4. Prod nginx log_format without the query string. Nikhil applies it, through Arjun.
5. Tests cover the serializer and one drafting error site.

## Added 28 Oct 2026 (from Shashank's T-646 Explore)
6. Billing: add pino redact. At billing.routes.ts:381, log err.name/code instead of err.message when a top-up order fails (the same issue T-583 fixed for /subscribe).
