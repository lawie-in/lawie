# T-436: GST tax invoice for every payment

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Doing. Kunal; Explore first, files to Priya (incl. packages/shared privacy version constant). Priya, 14 Oct 2026 |
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

## Arjun (14 Oct, 22:10 UTC) — no server reject for a missing State

The billing server does **not** refuse to create an order or subscription when the user has no State. Reasons: Ajay's Addendum 3 makes the fallback to our state lawful (s.12(2)(b)); renewals (`subscription.charged`) happen with no user present, so a reject there would only exist on the first charge and not the ones that follow; and the money path should fail open on a lawful fallback, not add a 4xx. The web keeps asking for the State before Pay (Rajesh's spec). The invoice records `placeOfSupply.source: 'user' | 'fallback'` and the admin CSV carries that column, so Vikram can see every fallback invoice; the billing page nags the user to set their State while any invoice of theirs is a fallback.

## State/UT list and tax split (Vikram, 14 Oct 2026, 22:07 UTC)

36 entries = 28 States + 8 UTs. The GST state code comes first; store it as a 2-digit string ("01", not 1).

STATES: 37 Andhra Pradesh · 12 Arunachal Pradesh · 18 Assam · 10 Bihar · 22 Chhattisgarh · 30 Goa · 24 Gujarat · 06 Haryana · 02 Himachal Pradesh · 20 Jharkhand · 29 Karnataka · 32 Kerala · 23 Madhya Pradesh · 27 Maharashtra · 14 Manipur · 17 Meghalaya · 15 Mizoram · 13 Nagaland · 21 Odisha · 03 Punjab · 08 Rajasthan · 11 Sikkim · 33 Tamil Nadu · 36 Telangana · 16 Tripura · 09 Uttar Pradesh · 05 Uttarakhand · 19 West Bengal.

UTs: 35 Andaman and Nicobar Islands · 04 Chandigarh · 26 Dadra and Nagar Haveli and Daman and Diu · 07 Delhi · 01 Jammu and Kashmir · 38 Ladakh · 31 Lakshadweep · 34 Puducherry.

Traps:
- Andhra Pradesh is 37, not 28 (28 is the pre-2014 code).
- Merged DNH&DD is 26, not 25.
- Ladakh is 38.
- J&K is a UT now and is still 01.
- Leave out 97 (Other Territory) and 99 (Centre Jurisdiction).

Tax rule: code 20 (our state) gives CGST 9% + SGST 9%. Every other code, all UTs included, gives IGST 18%.

9. A test asserts the 36 codes, and the split: 20 gives CGST+SGST, every other code gives IGST (Vikram).

## Arjun (14 Oct, 22:15 UTC) — Kunal's three Explore calls

1. **New field `User.gstStateCode`** (2-digit GST state code as a string, e.g. `"10"`), not a reuse of `User.state` — that is free-text Bar Council state, nothing writes it, and a tax field must be exact. Auth: `PATCH /me` accepts `gstStateCode` validated against the signed list of GST state codes (Ajay's State collection, AC8), `GET /me` returns it; billing reads it from the user record at invoice time. `User.state` is untouched.
2. **`/admin/billing/invoices.csv`** — under the billing service's admin routes, so the gateway proxy and the admin auth are the ones billing already has; no new top-level admin namespace.
3. **Public endpoint, not build env**: `GET /api/billing/public/supplier` returns the five supplier values (GSTIN, legal name, trade name, address, state code) from billing's env — the same values that print on the invoice, so Terms 5b/5c and the invoice can never disagree. `Cache-Control: public, max-age=3600`. Not `NEXT_PUBLIC_*`: that needs a web rebuild to change and can drift from the invoice.

## Ajay, 14 Oct 2026 (0668cd3, GST file Addendum 4)

- AC8 signed summary for CURRENT_PRIVACY_VERSION: "We now ask for your State to issue GST tax invoices, and we explain how you can close your account and how long we keep your data." Also fix the "bump when Last updated changes" comment in packages/shared/src/constants/privacy.ts.
- AC10 (must-fix): Patna is wrong. Terms §12 courts become Ranchi, Jharkhand. The contact page and the email footer (email-worker verifyEmail.tsx) say "Ranchi, Jharkhand". Remove the live "[PIN]" and placeholder text. Use the exact strings from Ajay's file.
- The invoice email (Madhuri, link only, no case content) goes to Ajay to sign.
