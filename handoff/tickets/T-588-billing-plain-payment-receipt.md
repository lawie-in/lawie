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
4. SUPERSEDED BY VIKRAM'S RULES BELOW (Arjun agreed 26 Oct): `issueInvoice` returns an explicit reason; the receipt is sent only on `before_gst_date`; never on incomplete GST config or invoice email off; bad input is an error that logs and sends nothing. Wording is Ajay's AJ-588-M1.
5. MOVED to T-595 (Arjun, 26 Oct 2026; do NOT build here). Was: the 24h check: an invoice still `issuing`, or an invoice email unsent, 24 h after capture goes to Sentry as one alert, captured from the existing 5-minute sweep (no new scheduler).
6. No PII in logs. Tests for: before GST date (receipt), invoice due (no receipt), config incomplete or email off (no receipt), bad input (error, no mail), 24h alert. Billing and email-worker tests and build green.

## Files
apps/billing/src/services/subscription.service.ts (the two hooks), new `paymentReceipt` template in apps/email-worker and packages/email-client (names reserved), their tests. Lead confirms after Explore.

## Vikram (26 Oct 2026): receipt rules

**(1) Not a tax invoice. Confirmed.** The receipt:
- is titled "Payment receipt";
- carries no GSTIN, legal name or address, no SAC code, no CGST/SGST/IGST split, and no "tax" wording at all;
- shows the trade name "Lawie", the item (plan or top-up name), amount paid in ₹, Ink credited, payment date, Razorpay order id and payment id, and the support email;
- uses **no number from the invoice series**. Identify it by the order id only. The GST invoice series must have no gaps, so a receipt can never take a number from it.

**(2) Never both. Arjun's default holds.** Send the receipt only when billing has decided no invoice will ever be issued for that payment. Today that is one case: payment before `GST_EFFECTIVE_FROM` (we registered 19 Jun 2026; the only such payment is the founder's own ₹199 test on 15 Jun). Do not send a receipt when:
- **GST config is incomplete or invoice email is off.** `recordInvoiceForPayment` still records the row and the sweep issues it later, so a tax invoice is owed. A receipt there would be the "both" case.
- **Input is bad** (no payment id, no positive amount). `null` there is an error, not "none due". It logs and sends nothing. Please return an explicit reason from `issueInvoice` (`before_gst_date` and so on) and send the receipt on that reason only.

**Compliance guard (my addition):** a tax invoice for a service is due within 30 days of payment. An invoice row still `issuing`, or an invoice email still unsent, 24 h after capture goes to Sentry as one alert. That way "config incomplete" or "email off" on prod is found within a day, not at GST return time. T-403's launch check must include `INVOICE_EMAIL_ENABLED=true` and the GST env set.

Vikram, CFO
