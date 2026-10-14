# T-436: GST tax invoice for every payment

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Ready, gates clear (Ajay 9201297 + Addenda 1-2 2a31eed; Arjun design; founder GST details with Vikram, env config only). Next free lead. Priya, 14 Oct 2026 |
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
8. Bump CURRENT_PRIVACY_VERSION so users get the re-accept prompt, because the State (place of supply) is new data collected (Ajay fc0d74d, dpdp file §6). Ajay signs the change summary when the build is ready.
   Claim note (Arjun): T-436's claim includes the privacy version constant in packages/shared (one holder at a time), and its full chain covers the re-acceptance flow (T-343). T-115c does not touch it.

## Ajay's ruling (9201297, handoff/legal/gst-tax-invoice-signed.md)

Must-fix: §1-4 of his file, and strings 5a-5d (pricing FAQ, Terms §1 and §14, Privacy retention plus the State in the data list), word for word.

## Arjun (14 Oct, 20:10 UTC) — mechanism: our own invoice, not Razorpay Invoices

**Call: we issue the invoice ourselves.** Razorpay Invoices is a collection product (the customer pays the invoice it creates); it does not issue a post-payment tax invoice for a subscription charge or a Checkout order, and it would split numbering, credit notes and the GSTR-1 export across two systems. Everything Vikram asks for is ours to control: sequence per financial year, place of supply, credit notes, retention, export.

### Design (billing owns it; no new service)

| # | Item | Decision |
| - | ---- | -------- |
| 1 | Record | New `Invoice` model in `apps/billing`: `number` (`FY25-26/000123`), `fy`, `kind` (`invoice` / `credit_note`), `paymentId` (unique), `refundId` (unique, credit notes), `userId`, `issuedAt`, `seller` snapshot, `customer` snapshot (name, email, state, optional GSTIN), `lines[]`, `price`, `taxable`, `cgst`, `sgst`, `igst`, `total`, `originalInvoiceId` (credit notes). The row is the invoice; it is immutable after issue. No PDF is stored: the PDF is rendered from the row on demand, so retention is the row's retention. |
| 2 | Trigger | Issued from the webhook path after the T-413 claim-first CAS confirms a captured payment: `subscription.charged` (every monthly or yearly charge), `payment.captured` / `order.paid` for top-ups. Idempotent on `paymentId`. A refund (`refund.processed`) issues a credit note against the original invoice; the policy is no refunds, so this path exists for a founder-run refund only. |
| 3 | Numbering | One `InvoiceCounter` row per `fy`, `findOneAndUpdate` `$inc`, allocated only inside the issue step for a confirmed payment, so a failed payment never consumes a number. Unique index on `(fy, number)`. Order: upsert the invoice by `paymentId` in state `issuing`, allocate, set number + `issued`. A crash in between is finished by the existing billing sweep (`--resume` style, same as T-115c); no gaps, no duplicates. Financial year rolls on 1 April IST. |
| 4 | Amounts | Prices are GST-inclusive. `taxable = round(price / 1.18, 2)`, `tax = price - taxable`; within our state `cgst = round(tax / 2, 2)`, `sgst = tax - cgst`; inter-state `igst = tax`. Every row sums to the paise charged; a test asserts it for all four SKUs and every top-up amount. Plan prices come from the one price source, never typed into the invoice code. |
| 5 | Place of supply | Customer state from `User.state` (exists in auth); if empty, the invoice is still issued with place of supply = our state and `cgst`/`sgst`, and the billing page asks the user to set their state (Ajay confirms this fallback). Our state and GSTIN come from env, set by the founder: `GST_GSTIN`, `GST_LEGAL_NAME`, `GST_TRADE_NAME`, `GST_ADDRESS`, `GST_STATE_CODE`. Not secrets, but never hard-coded; billing refuses to issue an invoice if any is missing. |
| 6 | Customer GSTIN | Optional "GST details" box on the **billing page** (legal name + GSTIN, format-validated), not on checkout — no Rajesh checkout change. Invoices issued after it is saved carry it (B2B). |
| 7 | PDF | Rendered in billing with `pdfkit` (small, no Chrome in the billing container; puppeteer stays in drafting). One template, Ajay's wording. `GET /api/billing/invoices/:id.pdf`, owner or admin only. |
| 8 | Email | Through the existing email-worker queue (T-220) with a **link** to the billing page, no attachment: the queue never carries the PDF or the amounts. |
| 9 | Export | `GET /api/billing/admin/invoices.csv?month=YYYY-MM`, admin only: GSTR-1 B2C/B2B columns Vikram specifies; credit notes included with negative amounts. |
| 10 | Retention and erase | Invoices are billing rows: kept for Ajay's period and **not** deleted by the T-115c account erase (billing keeps payment rows; the invoice customer snapshot stays as the tax record, same as the payment). Ajay confirms this against the erase runbook. |

**Backfill:** any payment captured before this ships gets an invoice by a one-off script (numbers allocated in payment order). Nothing sold yet, so probably zero rows.

**Out of scope:** e-invoicing (IRN) — not required below the turnover threshold; TDS; any price change.

Gates stay as Priya listed: Ajay (contents, timing, fallback in #5, retention vs erase in #10), founder (the five env values), Rajesh (the one billing-page box). Build after T-413 (webhook path) and the annual-carry fix.

**Note (Priya):** Ajay parked the optional customer GSTIN (9201297), so Arjun's item 6 (GST details box) is out of v1 unless the founder or Ajay says otherwise.
