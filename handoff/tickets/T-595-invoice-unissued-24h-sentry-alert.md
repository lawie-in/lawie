# T-595: billing — Sentry alert when an invoice is still unissued or unsent 24 h after payment

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (compliance guard; split from T-588 by Arjun, 26 Oct 2026) |
| Owner  | Vikram (rule), Arjun (design), Shashank (build) |
| Mode   | Small fix (billing only) |
| Status | To do. Raised 26 Oct 2026. Priya |
| Source | Vikram's T-588 ruling (compliance guard): a tax invoice for a service is due within 30 days of payment. "Config incomplete" or "email off" on prod must be found within a day, not at GST return time |

## Acceptance criteria
1. Inside the existing 5-minute invoice sweep (apps/billing/src/services/invoice-sweep.service.ts), capture one Sentry event for each invoice row still `issuing`, or whose invoice email is still unsent, 24 h after payment capture.
2. One capture per invoice id: deduped, never repeated every 5 minutes (a marker on the row or an in-store set; Shashank proposes, Arjun reviews).
3. The event carries the invoice id and its age only. No email address, no amounts, no names.
4. No new scheduler, no change to subscription.service.ts or email-worker.
5. Tests: nothing at 23 h, one capture at 25 h, no second capture on the next sweep, nothing for issued and sent invoices. Billing tests and build green.

## Files
apps/billing/src/services/invoice-sweep.service.ts, apps/billing/src/__tests__/t436-invoice-sweep.test.ts (and a new t595 test), the Invoice model only if the dedupe marker needs a field (Arjun confirms first). Nothing else.
