# GST tax invoices (signed ruling)

Ajay (CLO), 14 Oct 2026. Asked by Vikram, 14 Oct. Facts given: Lawie is a trade name of a GST-registered sole proprietorship; no tax invoice is issued today; the pricing FAQ points users to the Razorpay receipt. No personal data is kept here: the proprietor's name, GSTIN and address come from config, never from this file.

Kinds: must-fix = legally wrong until done (ticket); parked = one line to Priya for parked.md.

## 1. Invoice contents (CGST Rules r.46) — must-fix

| Field | Ruling |
|---|---|
| Supplier name | Legal name exactly as on the GST registration (the proprietor), then "trading as Lawie". |
| Supplier GSTIN and address | GSTIN and principal place of business as registered. |
| Invoice number | Consecutive serial, max 16 characters (letters, digits, "-" and "/"), unique for the financial year (Apr–Mar). Restart allowed only with a FY prefix, e.g. `LAW/2026-27/0001`. No gaps from deleted or failed invoices. |
| Date of issue | Required. |
| Recipient | Name and address on record, with State name and State code. GSTIN if the customer gave one. |
| Description | "Lawie subscription — {plan}, {period}" or "Lawie Ink top-up — {n} Ink". |
| SAC | verify: Vikram / CA to fix the SAC and rate. I sign no code. |
| Values | Taxable value, rate and amount of each tax, total. Prices are tax-inclusive: back the tax out of the price shown; never add it on top. |
| Tax split | Supplier State = place of supply: CGST + SGST, half each. Different State: IGST. |
| Place of supply | State name (and code). IGST Act s.12(2): registered recipient = their GSTIN's State; otherwise the address on record. |
| Reverse charge | "Tax payable on reverse charge: No". |
| Signature | verify: whether a system-generated electronic invoice needs a digital signature under r.46. Until verified, use "This is a computer-generated invoice." and ask the CA. |

Not applicable at our size: e-invoicing (IRN) and the B2C dynamic QR code. Vikram re-checks if turnover crosses either threshold.

## 2. When an invoice goes out — must-fix

- At every successful charge: subscription start, every renewal (monthly or yearly), and every top-up. Issue it automatically at payment capture. That keeps us inside the CGST Act s.31(2) / r.47 window (30 days from supply) with nothing to track.
- Yearly plan: one invoice for the yearly charge, not one per monthly Ink drip.
- No invoice for the Free plan's 5 Ink (no consideration), or for a failed or reversed payment.
- Email it to the account email and keep it in the account. The Razorpay receipt is not our tax invoice.
- verify (Vikram): the founder's one test top-up. If it was the founder paying himself, no invoice; if it went through as a real sale, issue one late.

## 3. Customer data at checkout

| Item | Ruling | Kind |
|---|---|---|
| Customer's State | Ask before the first payment, from a fixed list of States/UTs; needed to fix the place of supply and CGST+SGST vs IGST. Editable before each payment, not afterwards on an issued invoice. | must-fix |
| Billing name and address | Name on record plus the State is enough at our prices. The full address becomes required only for an unregistered recipient on an invoice above ₹50,000 (r.46); not reachable today. | none |
| Customer GSTIN (optional) | Optional field: format check, then the GSTIN's State (first two digits) overrides the chosen State, and the invoice shows the GSTIN. Not legally required of us; it lets firms claim input credit. | parked |

Privacy policy must list State (and GSTIN if built) among the data collected, with "to issue GST tax invoices" as the purpose, in the same build. must-fix.

## 4. Refunds — credit notes (CGST Act s.34) — must-fix

- Our policy stays no refunds. When one is given anyway (a goodwill refund, a double charge, a chargeback lost), issue a credit note that refers to the original invoice number and date, reverses the tax at the same split, and has its own consecutive series (e.g. `LAW-CN/2026-27/0001`).
- Declare it in the return for the month of issue, and never later than 30 November after the end of that financial year (s.34; verify the date with the CA each year).
- A failed generation is not a refund: Ink is simply not charged, so no credit note.

## 5. Signed strings (byte-exact)

5a. Pricing FAQ "Is GST included?" answer — replace with:
`Yes. Prices shown include GST. After each payment we email you a GST tax invoice from Lawie, and you can download it from your account.`
Ship "and you can download it from your account" only if the download is built in the same merge; otherwise end the sentence at "from Lawie.".

If the optional GSTIN field is built, append:
` If you are registered for GST, add your GSTIN before you pay and it will appear on your invoice.`

5b. Terms §1, after the first sentence, insert:
`Lawie is a trade name of {supplier_legal_name}, a sole proprietorship registered for GST in {supplier_state} (GSTIN {supplier_gstin}), with its principal place of business at {supplier_address}. In these Terms, "Lawie", "we" and "us" mean that proprietorship.`
Values come from config and must match the GST registration byte for byte. Bump the "Last updated" date. must-fix: today the Terms name no legal person as our side of the contract.

5c. Terms §14 Contact: add the same legal name and address line above the email. must-fix.

5d. Privacy policy retention, "currently up to six years" is wrong: CGST Act s.36 runs 72 months from the due date of the annual return for that year, which is longer. Replace with:
`for as long as GST law requires (72 months from the due date of the annual return for the year of the invoice)`
must-fix.

## Open verify items

- SAC code and GST rate (Vikram / CA).
- r.46 signature on electronic invoices.
- Whether the Consumer Protection (E-Commerce) Rules, 2020 seller-detail duties apply to us. If they do, 5b/5c already cover the name and address; a grievance officer line may be added later.
- The founder's test top-up (section 2).

Legal: GST invoice ruling signed by Ajay.
