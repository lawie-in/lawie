# T-438: two must-fixes from T-115c: Razorpay status values, timing-safe internal secret

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Assigned to Tanvi, 15 Oct 2026 (files to Priya after Explore). Priya |
| Owner  | Lead (build), Arjun (findings)                                               |
| Mode   | Small fix (billing only, plus auth and drafting if the same secret check is there) |

## Source

Arjun, 14 Oct 2026, from Tanvi's T-115c findings (see T-115c ticket, Arjun's 21:05 note). Must-fix under Arjun's rule: money path and security.

## Acceptance criteria

1. (a) The subscription status enum gains the Razorpay values the webhook can send (pending, halted, completed). Today a webhook moving a subscription there fails Mongoose validation, 500s, and Razorpay retries forever under T-413. Add the values and a test that every documented Razorpay status saves.
2. (b) The internal-secret middleware compares with plain `!==`. Switch to `crypto.timingSafeEqual`. The lead checks whether auth and drafting have the same check and fixes all three if so; if so, say so in the claim.
