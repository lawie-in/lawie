# T-413: Razorpay webhook acks only after the Ink grant succeeds

| Field | Value |
|---|---|
| Status | Todo. Kunal, right after T-399. Priya, 13 Oct 2026 |
| Owner | Kunal (build), Arjun (call) |
| Mode | Small fix (billing only) |

## Why
Found during Kunal's T-399 build and confirmed by Arjun. This bug was already there before T-399, and it doesn't block it. The Razorpay webhook route returns 200 before the handler runs. So when an Ink grant fails, Razorpay never retries it, and the user paid but got nothing.

## Acceptance criteria (Arjun; full spec in T-399's last section)
1. The signature and body are checked first. A bad one returns 400 before any ack, as in T-323.
2. The handler then runs synchronously. On an error the route returns 500, so Razorpay retries.
3. A retry never grants twice. It's idempotent on T-399's paid_count key.
4. A test covers: success → 200; handler error → 500; a retry after a 500 grants exactly once; a bad signature → 400.

## Files
apps/billing/src/routes/billing.routes.ts, plus a new test.
