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
