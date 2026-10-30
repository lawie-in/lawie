# T-685b: Start a fresh run after a non-retryable generate error

Status: backlog (small fix, web, no screen change; starts after T-685 merges). Raised 30 Oct 2026 by Priya from Arjun (handoff/design/T-685-run-state-answers.md §15).

Today, when generation ends with an SSE `error` carrying `retryable: false` (for example code `cost_cap`), the web keeps the stored run_id and sends it again on the next attempt. A capped run then refuses every retry, forever.

## Acceptance criteria
1. After an SSE `error` with `retryable: false`, the web clears the stored run_id, so the next attempt starts a new run.
2. A retryable error keeps the run_id (resume still works).
3. No screen change. Tests for both paths.
