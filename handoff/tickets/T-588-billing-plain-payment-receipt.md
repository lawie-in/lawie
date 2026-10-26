# T-588: billing — plain payment receipt when no GST invoice is due

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder rule 26 Oct 2026: every customer event sends an email) |
| Owner  | Arjun (raised), Shashank (after T-583) (build) |
| Mode   | Full chain (billing) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | handoff/ops/email-audit-2026-10-26.md (Arjun) |

## Problem
A paid top-up or renewal emails the customer only through the tax-invoice mail. If GST config is incomplete, the payment predates GST_EFFECTIVE_FROM, or INVOICE_EMAIL_ENABLED is off, the customer gets nothing.

## Acceptance criteria
1. Hooks: apps/billing/src/services/subscription.service.ts ~:2340 (top-up) and ~:2724 (renewal): when `issueInvoice` returns "none due", enqueue a `paymentReceipt` (amount, Ink, order id, date).
2. Never two mails for one payment: receipt only when no invoice will ever be issued for it.
3. Vikram confirms the receipt is not presented as a tax invoice (no GSTIN; the word "receipt"). Ajay signs one line of wording.
4. No PII in logs. Tests for: invoice due (no receipt), none due (receipt), invoice disabled. Billing and email-worker tests and build green.

## Files
apps/billing/src/services/subscription.service.ts (the two hooks), new `paymentReceipt` template in apps/email-worker and packages/email-client (names reserved), their tests. Lead confirms after Explore.
