# T-526: Billing subscribe follow-ups, second batch (from T-518 review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design for item 2), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | To do. V1.1 (Shashank's T-518 report, 21 Oct 2026). Priya |

## Items (in order)
1. A `subscriptions.create` timeout returns 500 and the 500 body leaks `err.message` (billing.routes.ts). The body must be a fixed, safe message; the detail goes to the log only.
2. A stored different-plan row that Razorpay has lost gets 503 every time. A cancel "not found" should count as ended (needs Arjun's ruling).
3. Take the budget clock from the lock's `createdAt`.
4. Reword the `BILLING_TERMINAL_STATUSES` comment.
5. `isRazorpayNotFound` should require HTTP 400 for the description match.

## Acceptance criteria
1. No error response from the subscribe route contains a provider or internal error message; tests assert it.
2. A lost-at-Razorpay stale row no longer blocks a new checkout.
3. Items 3 to 5 fixed or recorded as accepted by Arjun; billing tests green, Razorpay mocked.
