# T-529: Billing error handling hygiene (from T-526)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Small fix (billing) |
| Status | To do. V1.1 (Shashank's T-526 report, 21 Oct 2026). Priya |

## Acceptance criteria
1. `/cancel` treats a Razorpay not-found as already ended instead of returning 503.
2. `/topup/order` and `/status` log ids and error names only, never the error detail or whole error object.
3. An unknown `planId` returns 400, not 500.
4. Tests for each; Razorpay mocked.
