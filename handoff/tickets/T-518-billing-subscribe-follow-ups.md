# T-518: Billing subscribe follow-ups (from T-516 review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | In build: Shashank (21 Oct 2026). Priya |

## Items (in order)
1. The 60 s create-lock TTL can be exceeded when Razorpay is badly degraded (4 x 15 s calls), so a second subscription is possible. Raise the TTL or add a deadline check. Only item that can double-charge.
2. Strengthen the concurrency test (it passes even if both requests fail).
3. Late-webhook window after the local cancel (T-444c has the same one).
4. Stale T-399 comment in subscription.service.ts.
5. Legacy rows that Razorpay cannot fetch still return 500.

## Acceptance criteria
1. Two concurrent subscribe calls create at most one Razorpay subscription, even when Razorpay is slow.
2. The concurrency test fails if both requests fail.
3. Items 3 to 5 fixed or recorded as accepted by Arjun in the ticket.

## Arjun (21 Oct 2026) — six calls after Explore (Shashank)

1. **Create lock:** (b). A deadline check right before `subscriptions.create`: more than 40 s since the lock was taken → 503 `try_again`, lock released by the guarded delete. No TTL change, no `collMod`, no migration. The check sits in the one place every path (plan mismatch, stale cancel, re-read after a cancel throw) reaches before create.
2. **Concurrency test:** yes — exactly one `create`, one success, the other `SubscriptionInProgressError`. Test only.
3. **Late charge on a cancelled row:** report-only, as T-444c. `reportCancelledPaidSub` (error log + Sentry), ops refunds by hand. Keep the Ink grant: the money was taken, the grant matches it, and the refund path reverses both (refund is idempotent on the id). No cancel-reason marker.
4. **Stale T-399 comment:** fix it.
5. **Fetch errors on legacy rows:** agreed, never a 500. Timeout → 503 `try_again`. Razorpay "not found" → cancel the row locally with the same guarded update, then create. Everything else (auth, 5xx, malformed) → 503. "Not found" means the Razorpay error body says so (HTTP 404, or `BAD_REQUEST_ERROR` whose description names the id as not existing) — an auth failure must never be read as "not found", or we would cancel rows that are live.
6. **T-519 follow-ups:** (a) yes, `codeName`/`code` in the index-failure log. (b) keep `await` before `listen`; accepted at our scale, and recorded here: `inkledger` is small and only the first boot builds the index. Revisit if the collection passes ~1M rows.

All inside Shashank's claim; no lock-model change.
