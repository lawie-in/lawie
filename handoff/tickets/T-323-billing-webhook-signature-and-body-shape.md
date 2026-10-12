# T-323 — Billing webhook: signature length and body shape

| Field  | Value |
| ------ | ----- |
| Phase  | 2 — Payments. Before go-live |
| Owner  | Lead (build, billing). Arjun glance |
| Mode   | Small fix (billing) |
| Status | Merged into develop_staging (6869fa1, 12 Oct 2026). Nothing to test in the UI |

## Acceptance criteria

1. An `x-razorpay-signature` of the wrong length gets a 400, not a 500. Check the length before `timingSafeEqual`.
2. A correctly signed body that is valid JSON but not an object (an array, a string or a number) gets a clean 400 before the 200 acknowledgement. Nothing throws after the ack.
3. Tests cover both cases. Nothing from the body is logged.

## Arjun (12 Oct 2026): payload check and the error log

1. **Option (a).** A signed body whose `payload` is not a plain object gets 400 before the ack, like the other shape checks. Real Razorpay events always carry `payload`; a retry of a malformed one is harmless. Test: signed `{"event":"x"}` → 400, `handleWebhookEvent` not called.
2. **Trim the log, in this ticket.** `'Webhook handler error'` logs `{ event, errorName: err.name, errorCode: err.code }` only. No `err.message` and no stack: a Mongo duplicate-key message carries the duplicate value (an email or payment id), and a V8 stack's first line repeats the message. Sentry capture stays as it is (its scrubbing is a separate matter). Test: the logged object has exactly those keys.
