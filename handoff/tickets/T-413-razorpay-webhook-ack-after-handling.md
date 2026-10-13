# T-413: Razorpay webhook acks only after the Ink grant succeeds

| Field | Value |
|---|---|
| Status | Todo. Kunal, right after T-399. Priya, 13 Oct 2026 |
| Owner | Kunal (build), Arjun (call) |
| Mode | Full chain (billing grant logic; Arjun, 13 Oct) |

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

**Arjun (13 Oct, scope, correcting the record):** I did not make (b) a separate ticket. The invariant: T-413 may not merge while any webhook grant path is non-idempotent under the retries it adds. So everything in that handler that increments on an event — the top-up grant, `CouponCode.uses`, and the `payment.captured` + `order.paid` pair for one order — moves to claim-first (CAS on the Razorpay payment/order id, then increment) inside T-413. If that takes T-413 past a small fix, its mode becomes full chain; it does not split.

**Arjun (13 Oct, reviewer points):** (1) Fingerprint `[razorpay-webhook, eventId || event]` is fine; the id is unique, the event name adds nothing. (2) Pre-T-413 double top-ups: a read-only count of `inkledger` rows with reason `topup_purchase` and reference `""`, grouped by user, goes on the founder's list through Priya; Vikram decides what to do with the number. Not a code change. (3) The claimed-but-failed race (a slow attempt fails after Razorpay's timeout, the retry sees the claim and no-ops): follow-up ticket, small, Kunal after T-413, for both the top-up and T-399 subscription claims — the claim carries a state and a timestamp: `pending` on claim, `granted` on success; a retry that sees `pending` older than 60 s re-claims it by CAS (pending→pending with a new timestamp) and runs; one that sees `granted` no-ops. The Sentry signal on the manual-grant paths stays as the safety net until then.
