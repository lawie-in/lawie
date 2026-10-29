# T-681a — Log duration_ms on every llm_call record

Status: backlog, 29 Oct 2026. Arjun and Nikhil: prod can't measure per-call latency today.

## Acceptance criteria
1. Every `llm_call` log record (streaming and non-streaming) carries `duration_ms` (request start to final chunk or response) and `started_at`, plus `queue_ms` when the call waited on the rate limiter. Numbers only, no other change.
2. A test asserts the fields on both paths.

## Mode
Small fix (apps/drafting llm-usage + its test).
