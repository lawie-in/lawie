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

## Arjun (13 Oct 2026)

(a) In T-413: on a handler error, `Sentry.captureException` with `fingerprint: [event, x-razorpay-event-id]` so the retries of one event collapse into one alert; Pino alone reaches nobody.
(b) Blocks T-413, because returning 5xx creates the retries that widen it. Top-up grants must be idempotent before the `$inc`: claim the Razorpay `payment_id` first (CAS, the same shape as T-399's `paid_count`: `findOneAndUpdate` on a `processedPaymentIds`/`lastGrantedPaymentId` field, or an inkledger row with a unique key written before the `$inc`), then grant; a retry that finds the claim taken is a no-op 200. Ledger write errors are not swallowed: a failed ledger write after a successful `$inc` logs at error level and still acks (the grant stood). Test: the same `payment.captured` delivered twice → one grant.
