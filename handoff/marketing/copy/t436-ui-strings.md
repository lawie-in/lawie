# T-436 UI strings (State picker, Invoices card, State nag)

Madhuri, 15 Oct 2026. Draft for Meera. Specs: `state-picker-spec-t436.md`, `invoices-list-spec-t436.md`. Rulings: `handoff/legal/gst-tax-invoice-signed.md`. Only quoted text is "Ajay, signed". Plain Indian English, English only.
`{invoiceNumber}` and `{n}` are merge fields.

## A. State picker (Upgrade in Plan block, and Ink top-up modal)

| Where | Text | Chars | Ajay? |
| --- | --- | --- | --- |
| Label | State | 5 | No |
| Placeholder (first option) | Select your State | 17 | No |
| Help, under the select | We use this to issue GST tax invoices. | 38 | Purpose phrase is Ajay, signed: "to issue GST tax invoices". Rest of sentence is mine; NEEDS AJAY to confirm it adds no claim |
| Required error (Pay clicked, no State) | Select your State to continue. | 30 | No |
| Saving | Saving… | 7 | No |
| Saved (about 2 s) | Saved | 5 | No |
| Failed (spec state, for completeness) | Could not save. Try again. | 26 | No |

Not wording: the rule "Editable before each payment, not afterwards on an issued invoice." (Ajay, signed). I add no copy on it.

## B. Invoices card (`/dashboard/settings`)

| Where | Text | Chars | Ajay? |
| --- | --- | --- | --- |
| Card heading | Invoices | 8 | No |
| PDF link, visible | PDF | 3 | No |
| PDF link, aria-label | Download invoice {invoiceNumber} as PDF | 38 + number | No |
| PDF aria-label, credit-note row | Download credit note {invoiceNumber} as PDF | 42 + number | No; only if credit notes are listed (open question in the list spec, ask Ajay/Vikram) |
| Empty state | No invoices yet | 15 | No. I add no reason line: any reason would touch his s.2 and would need Ajay |
| Loading (visually hidden, `role="status"`) | Loading invoices… | 17 | No |
| Error | Could not load your invoices. | 29 | No |
| Error retry button | Try again | 9 | No |
| Show more button | Show more | 9 | No |
| Show more, live region | {n} more invoices shown | 22 | No |
| Credit-note marker (badge on row) | Credit note | 11 | No. Marker is a label only; I explain nothing about the refund |

Variants for the PDF link if Meera wants a verb: `Download PDF` (12) or `PDF` (3, recommended; the aria-label carries the full action).

## C. Settings nag (State not set, shown after an invoice used the fallback)

| Where | Text | Chars | Ajay? |
| --- | --- | --- | --- |
| Nag line, in the Plan or Invoices card | Your State is not set. | 22 | No |
| Action label (button or link, scrolls to and focuses the picker) | Set your State | 14 | No |
| Action variants | Set State (9) / Add your State (14) | | No |

Rules I followed: no tax explanation, no mention of which State was used (Ajay's Addendum 3 allows the fallback as a rule but gives no wording to show users), no promise about past or future invoices. Do not add "so your invoice is correct" or similar: that would be a tax claim and NEEDS AJAY.

## Summary for Ajay

- Help text (A): confirm "We use this to issue GST tax invoices." is acceptable.
- Nothing else in this file states a tax or place-of-supply fact.

Ready for next task.
