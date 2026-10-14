# T-436: GST tax invoice for every payment

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Todo, gated. Waits on Ajay's ruling, Arjun's mechanism call, the founder's GST details. Pre-v1 blocker for charging anyone. Priya, 14 Oct 2026 |
| Owner  | Lead (build), Vikram (requirements), Ajay (contents/wording), Arjun (mechanism), Rajesh (any new checkout fields) |
| Mode   | Full chain (billing + web; email-worker if invoices are emailed by us)       |

## Source

Vikram, 14 Oct 2026, founder-approved: Lawie is GST-registered (sole proprietorship) and must issue a GST tax invoice for every payment. Nothing does that today.

## Gates

- Ajay: invoice contents, timing, wording, retention period.
- Arjun: Razorpay Invoices vs our own PDF.
- Rajesh: design, only if checkout gains fields (customer GSTIN).
- Founder: GSTIN, legal name, trade name, registered address and state (config, not hard-coded).

## Acceptance criteria (Vikram)

1. One tax invoice per captured payment: each subscription charge (monthly and each yearly charge) and each top-up order.
2. Prices are GST-inclusive: taxable value = price / 1.18, GST 18%, split CGST 9% + SGST 9% within our state or IGST 18% inter-state by the customer's place of supply. Rounding sums exactly to the price charged.
3. Sequential invoice numbers per financial year, never reused, no gaps from failed payments.
4. (Parked by Ajay, 9201297: optional customer GSTIN / B2B invoice. Not in v1.)
5. Refunds produce a credit note against the original invoice.
6. Invoice emailed and downloadable from the billing page; stored for Ajay's retention period; no case content on it.
7. Monthly CSV export of all invoices and credit notes for GSTR-1, to Vikram.

## Ajay's ruling (9201297, handoff/legal/gst-tax-invoice-signed.md)

Must-fix: §1-4 of his file, and strings 5a-5d (pricing FAQ, Terms §1 and §14, Privacy retention plus the State in the data list), word for word.
