# GST tax invoices (signed ruling)

Ajay (CLO), 14 Oct 2026. Asked by Vikram, 14 Oct. Facts given: Lawie is a trade name of a GST-registered sole proprietorship; no tax invoice is issued today; the pricing FAQ points users to the Razorpay receipt. No personal data is kept here: the proprietor's name, GSTIN and address come from config, never from this file.

Kinds: must-fix = legally wrong until done (ticket); parked = one line to Priya for parked.md.

## 1. Invoice contents (CGST Rules r.46) — must-fix

| Field                      | Ruling                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier name              | Legal name exactly as on the GST registration (the proprietor), then "trading as Lawie".                                                                                                                                |
| Supplier GSTIN and address | GSTIN and principal place of business as registered.                                                                                                                                                                    |
| Invoice number             | Consecutive serial, max 16 characters (letters, digits, "-" and "/"), unique for the financial year (Apr–Mar). Restart allowed only with a FY prefix, e.g. `LAW/2026-27/0001`. No gaps from deleted or failed invoices. |
| Date of issue              | Required.                                                                                                                                                                                                               |
| Recipient                  | Name and address on record, with State name and State code. GSTIN if the customer gave one.                                                                                                                             |
| Description                | "Lawie subscription — {plan}, {period}" or "Lawie Ink top-up — {n} Ink".                                                                                                                                                |
| SAC                        | verify: Vikram / CA to fix the SAC and rate. I sign no code.                                                                                                                                                            |
| Values                     | Taxable value, rate and amount of each tax, total. Prices are tax-inclusive: back the tax out of the price shown; never add it on top.                                                                                  |
| Tax split                  | Supplier State = place of supply: CGST + SGST, half each. Different State: IGST.                                                                                                                                        |
| Place of supply            | State name (and code). IGST Act s.12(2): registered recipient = their GSTIN's State; otherwise the address on record.                                                                                                   |
| Reverse charge             | "Tax payable on reverse charge: No".                                                                                                                                                                                    |
| Signature                  | verify: whether a system-generated electronic invoice needs a digital signature under r.46. Until verified, use "This is a computer-generated invoice." and ask the CA.                                                 |

Not applicable at our size: e-invoicing (IRN) and the B2C dynamic QR code. Vikram re-checks if turnover crosses either threshold.

## 2. When an invoice goes out — must-fix

- At every successful charge: subscription start, every renewal (monthly or yearly), and every top-up. Issue it automatically at payment capture. That keeps us inside the CGST Act s.31(2) / r.47 window (30 days from supply) with nothing to track.
- Yearly plan: one invoice for the yearly charge, not one per monthly Ink drip.
- No invoice for the Free plan's 5 Ink (no consideration), or for a failed or reversed payment.
- Email it to the account email and keep it in the account. The Razorpay receipt is not our tax invoice.
- verify (Vikram): the founder's one test top-up. If it was the founder paying himself, no invoice; if it went through as a real sale, issue one late.

## 3. Customer data at checkout

| Item                      | Ruling                                                                                                                                                                                             | Kind     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Customer's State          | Ask before the first payment, from a fixed list of States/UTs; needed to fix the place of supply and CGST+SGST vs IGST. Editable before each payment, not afterwards on an issued invoice.         | must-fix |
| Billing name and address  | Name on record plus the State is enough at our prices. The full address becomes required only for an unregistered recipient on an invoice above ₹50,000 (r.46); not reachable today.               | none     |
| Customer GSTIN (optional) | Optional field: format check, then the GSTIN's State (first two digits) overrides the chosen State, and the invoice shows the GSTIN. Not legally required of us; it lets firms claim input credit. | parked   |

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

## Addendum 1 (T-436): Vikram's answers to the verify items, 14 Oct 2026

The founder has no CA and Vikram decided the finance points. The supplier's GSTIN, address and legal name stay in config only, never in this repo's handoff files: the GSTIN carries the proprietor's PAN.

| Item                  | Vikram's answer                                                                                                                                      | Ruling                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAC and rate          | SAC 998319, 18%. Supplier State Jharkhand (code 20): CGST 9% + SGST 9% within Jharkhand, IGST 18% elsewhere.                                         | Accepted; the SAC is a finance call. The split matches §1.                                                                                                                                                             |
| Signature             | No IRN (below threshold). The PDF carries the proprietor's name, "Authorised Signatory", a scanned signature image and "Computer-generated invoice". | Acceptable for v1. Do not print "signature not required": the r.46 waiver is only for e-invoices. A scanned image is not an electronic signature under the IT Act; a Class 3 DSC on the PDF is the clean form. parked. |
| Founder's test top-up | Proprietor paid his own proprietorship: not a supply, no invoice, booked as proprietor's funds.                                                      | Agreed. Closed.                                                                                                                                                                                                        |

Still open before 5b/5c can ship: the proprietor's legal name exactly as on the GST certificate, and the trade name as registered (founder).

Change to 5b: the Terms need the legal name, trade name and GSTIN. The street address is required on the invoice (§1), but on the public Terms page only if the E-Commerce Rules apply (still verify). Until that is settled, 5b ships without `, with its principal place of business at {supplier_address}`, and 5c gives the legal name and the contact email only. This keeps a residential address off a public page unless the law requires it.

## Addendum 2 (T-436): supplier details verified, 14 Oct 2026

Vikram checked the GST registration certificate (REG-06) itself: proprietorship, regular registration, legal name and trade name confirmed. The values go in config only, not here.

- 5b and 5c are unblocked. `{supplier_legal_name}` and the trade name are printed exactly as on REG-06; `{supplier_state}` is Jharkhand.
- Invoices print the principal place of business exactly as on REG-06. Vikram corrected his earlier address: the PIN differs from the first one he sent. A test pins the config address to the certificate text.
- Invoices are issued only for supplies on or after the registration's effective date. The founder's test top-up came before that date, a second reason it needs no invoice (closed in Addendum 1).

## Addendum 3 (T-436): no State on file (Arjun's fallback #5, Priya, 14 Oct 2026)

**Acceptable.** It is the rule itself, not a workaround. Under IGST Act s.12(2)(b), for an unregistered recipient the place of supply is the recipient's location only where an address is on record; otherwise it is the supplier's location. With no State on file, the place of supply is Jharkhand: CGST + SGST.

When it applies: any charge where we have no State on record at the moment of invoicing. That covers renewals or top-ups by users who paid before the State question existed (none today, per Vikram), and edge cases where checkout did not capture it.

Conditions:

1. New checkouts still ask the State before the first payment (§3). The fallback is never the default path.
2. Never guess the State (no IP, no phone prefix, no card data).
3. Once the user gives a State on the billing page, it applies from the next invoice. Past invoices stay as issued; they were correct when made. No re-issue and no credit note for this.
4. The invoice shows the place of supply as "Jharkhand (20)" in that case, like any other.

## Addendum 4 (T-436): privacy summary, invoice email, Patna → Ranchi (Priya, 14 Oct 2026)

**1. Signed privacy summary** for the new CURRENT_PRIVACY_VERSION (T-343 string P2, byte-exact):
`We now ask for your State to issue GST tax invoices, and we explain how you can close your account and how long we keep your data.`
It covers the T-436 change and the T-115c changes, which are not yet in an accepted version. The version id and "Last updated" are the T-436 merge date. Fix the comment in packages/shared/src/constants/privacy.ts ("Bump this when Last updated changes") to: bump when the policy adds data, a purpose or a recipient, with Ajay's sign-off. A Last-updated-only change (as in T-115c) does not bump.

**2. Invoice email:** Madhuri drafts it and I sign it. Conditions: a link to the invoice only; no case content, no amount breakdown beyond the total; the sender name is the trade name.

**3. Patna, Bihar is wrong everywhere it names us.** The registered place of business is Ranchi, Jharkhand. Must-fix, in T-436:
| Where | Today | Signed text |
|---|---|---|
| Terms §12 | "exclusive jurisdiction of the courts at Patna, Bihar" | `exclusive jurisdiction of the courts at Ranchi, Jharkhand` (the rest of §12 unchanged; the Consumer Commission sentence stays) |
| Contact page address block | "Registered Address / Lawie (Sole Proprietorship) / [Street address placeholder] / Patna, Bihar — [PIN]" | Label `Based in`, then `Lawie (Sole Proprietorship)` / `Ranchi, Jharkhand`. No street line, per Addendum 1. Placeholders in brackets must never be public. |
| Email footer (email-worker verifyEmail.tsx:55 and any shared footer) | "Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]" | `Lawie (Sole Proprietorship), Ranchi, Jharkhand` |

Test: no public page or email contains "Patna, Bihar" naming Lawie, or any "[...placeholder]" / "[PIN]" text. Sample drafts (e.g. a party's address in the seed PDFs) are unaffected.

## Addendum 5 (T-436): invoice email (Madhuri's draft, handoff/marketing/copy/invoice-email-t436.md) and the number format, 14 Oct 2026

| #   | Question                       | Ruling                                                                                                                                                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Footer address                 | `Lawie (Sole Proprietorship), Ranchi, Jharkhand` (Addendum 4).                                                                                                                                   |
| 2   | Footer line 2                  | Change to: `You are receiving this because a payment was made on your Lawie account.`                                                                                                            |
| 3   | "invoice" vs "GST tax invoice" | The email may say "invoice". The PDF itself is headed `Tax Invoice` (credit notes: `Credit Note`). Use subject (A) `Your Lawie invoice {invoiceNumber}` and button (A) `Download invoice (PDF)`. |
| 4   | Number and amount in the body  | Yes. The amount line reads `Thank you for your payment of {amount} (including GST) on {date}.` Total only, no tax breakdown. If `{name}` is empty: `Hello,`.                                     |

Rest of the draft (preheader, body, help line, footer lines 3–4) **approved as written**. No case content and no attachment, as drafted.

**Invoice number format:** the law fixes the limits, not the pattern: max 16 characters (letters, digits, "-" and "/"), unique per financial year (April–March), consecutive with no gaps, and credit notes in their own series. `LAW/2026-27/0001` was an example. Arjun's `FY25-26/000123` style is equally lawful (14 characters). His choice; the FY in it must be the real one (an invoice dated October 2026 is FY 2026-27). Not a legal override.

## Addendum 6 (T-436 a): Kunal's build points, 14 Oct 2026

| #   | Point                                                                                 | Ruling                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Credit-note number `LAW-CN/2026-27/0001` is 19 characters, over the 16 limit          | My example was wrong. `LCN/2026-27/0001` (16 characters) is approved.                                                                                                                                          |
| 2   | PDF amounts as "Rs. 1,999.00" (no ₹ glyph)                                            | Approved. The law requires the value, not the symbol.                                                                                                                                                          |
| 3   | Legacy subscription with no matching plan prints "Lawie subscription — Pro, {period}" | No: that guesses the plan. Print the plan only from the charge's own record; if it is unknown, `Lawie subscription — {period}`. (No subscription has been charged yet, per Vikram, so this should never fire.) |
| —   | Street address removed from the public supplier endpoint, kept on the PDF             | Approved, per Addendum 1.                                                                                                                                                                                      |

## Addendum 7 (T-436 b/c): Shashank's legal-content questions, 15 Oct 2026

| #   | Question                                    | Ruling                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Privacy §1 and §2 strings                   | §1 bullet `Plan, Ink balance, payments and referrals.` becomes `Plan, Ink balance, payments and referrals, and the State you give us for your tax invoices.` In §2, `take payments,` becomes `take payments, issue GST tax invoices,` (the rest of §2 unchanged).      |
| 2   | State saved before the re-accept prompt     | **No.** The State is not stored before the bumped policy is accepted. Either show the re-accept prompt before the picker, or keep the picked State in the page and save it only after acceptance, on Pay. must-fix.                                                    |
| 3a  | Terms version                               | **Bump CURRENT_TERMS_VERSION** with this merge: the contracting party and the courts change, which is material. If a terms re-accept prompt exists, its summary (signed): `We now name the business behind Lawie, and disputes go to the courts at Ranchi, Jharkhand.` |
| 3b  | Supplier endpoint returns 503 (env not set) | Never show a placeholder. With no legal name, hide 5b and 5c entirely. With a legal name but no GSTIN, show 5b without `(GSTIN {supplier_gstin})`. Condition: the env is set before any release to main, so main always shows the full 5b.                             |
| 4a  | Credit note email?                          | Yes, to the account email. Subject `Your Lawie credit note {creditNoteNumber}`. Body line `We have issued a credit note of {amount} (including GST) against invoice {invoiceNumber}.` Button `Download credit note (PDF)`. Everything else as in the invoice email.    |
| 4b  | Backfilled invoices emailed?                | None are expected: no subscription has been charged, and the founder's test top-up needs no invoice. If the backfill does produce any, email each once.                                                                                                                |
| 4c  | Amount format                               | The email may use `₹` and the PDF `Rs.`. Both are lawful; the figure must match the PDF exactly.                                                                                                                                                                       |
| 5   | Template id                                 | Not a legal point; Priya decides.                                                                                                                                                                                                                                      |

## Addendum 8 (T-436): trade name and erased users (Shashank, 15 Oct 2026)

1. **5b uses the endpoint's `tradeName`**: `{supplier_trade_name} is a trade name of {supplier_legal_name}, …`. That keeps it exactly as on REG-06 (Addendum 2), which today reads "Lawie". The rest of 5b, including `In these Terms, "Lawie", "we" and "us" mean that proprietorship.`, stays as signed. If tradeName is missing, the same hide rule as Addendum 7 (3b) applies.
2. **Erased users: no credit-note email.** The customer snapshot is kept only as the tax record (CGST s.36). Using its email to contact someone who erased their account is a new use after erasure. Issue and keep the credit note; send nothing. If the person writes in, it is provided on request. Test: a credit note for an erased user sends no email.

Addendum 8 follow-up (Shashank, 15 Oct 2026): (a) Skipping the email for an erased user on **invoices** too: **approved**, for the same reason. (b) **Yes:** "erasure started" (the `erasure` sub-document is present) counts as erased for this skip, matching T-115c condition 3 (the account cannot be used once closing has started). Test both: user gone, and user mid-erasure.
