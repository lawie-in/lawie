# T-323 — Billing webhook: signature length and body shape

| Field  | Value |
| ------ | ----- |
| Phase  | 2 — Payments. Before go-live |
| Owner  | Lead (build, billing). Arjun glance |
| Mode   | Small fix (billing) |
| Status | To do. Tanvi after T-320. Found in T-320 review, 12 Oct 2026 |

## Acceptance criteria

1. An `x-razorpay-signature` of the wrong length gets a 400, not a 500. Check the length before `timingSafeEqual`.
2. A correctly signed body that is valid JSON but not an object (an array, a string or a number) gets a clean 400 before the 200 acknowledgement. Nothing throws after the ack.
3. Tests cover both cases. Nothing from the body is logged.
