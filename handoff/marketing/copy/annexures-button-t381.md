# Annexures pack button (T-381)

Madhuri, 13 Oct 2026. **Signed by Ajay** (`handoff/legal/T-381-annexures-button-signed.md`): the six rows marked "Signed by Ajay" are his strings word for word. Rows with "No legal statement" need no sign-off while they stay as drafted. Both annexure files carry the T-317 Addendum 4 footer (`Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.`) and never say "generated with AI". If the pack ever costs Ink, the cost must show before the click and those strings come back to Ajay (T-238 conditional line); a failed pack is not charged. Sources: `handoff/tickets/T-381-annexures-pack-button.md` (button calls `POST /documents/:id/annexures-pack`; the pack is a Vakalatnama and a Memo of Parties; brief drafts store the party data), `handoff/legal/T-317-home-faq-footer-signed.md` Addendum 4 (annexure footer and the rule that annexures are filled from a template, not written by the model, so they must not say "generated with AI"), `handoff/legal/T-365-card-descriptions-signed.md` (document names). Layout and keys are shared with Rajesh's spec.
Rules used: plain English, no "AI", no time claim, no "ready to file" or accuracy claim, the advocate checks and signs. "Created", not "ready" or "generated".

| Key | String | Chars | Where | Status |
| --- | --- | --- | --- | --- |
| `annex.button` | Create Vakalatnama and Memo of Parties | 38 | Button on the document page | Signed by Ajay |
| `annex.button_help` | Prepared from the details you entered. | 38 | Line under the button | Signed by Ajay |
| `annex.loading` | Preparing your documents… | 25 | Button/loading state. No time claim | No legal statement |
| `annex.success_title` | Vakalatnama and Memo of Parties created | 39 | Success heading | Signed by Ajay |
| `annex.success_note` | Check both before filing. | 25 | Under the success heading | Signed by Ajay |
| `annex.download_vakalatnama` | Download Vakalatnama | 20 | Download link label | Signed by Ajay |
| `annex.download_memo` | Download Memo of Parties | 24 | Download link label | Signed by Ajay |
| `annex.format_pdf` | PDF | 3 | Format tag shown beside each download label (Priya call 4); separate from the signed text | No legal statement |
| `annex.format_docx` | DOCX | 4 | Format tag, as above | No legal statement |
| `annex.error` | We couldn't create the documents. Please try again. | 51 | Error message | No legal statement |
| `annex.retry` | Try again | 9 | Retry button | No legal statement |
| `annex.missing_title` | Party details are missing | 25 | Headline of the missing-details state | No legal statement |
| `annex.missing_body` | Add the names and roles of the parties to this draft, then try again. | 69 | Generic line when the draft has no party data | No legal statement |
| `annex.missing_named` | Add {what} to this draft, then try again. | 41 | Same state, naming what is missing. `{what}` is a short phrase from the app, e.g. the client's name or the opposite party's name | No legal statement |
| `annex.missing_cta` | Check your brief | 16 | Button in the missing-details state; opens the brief with the parties fields focused (Priya's call 2) | No legal statement |
| `annex.regenerate` | Generate again | 14 | Button when a pack already exists | No legal statement |
| `annex.regenerate_note` | This replaces the earlier pack. | 31 | One line under the Generate again button | No legal statement |

## Notes

- **Disclaimer.** The ticket and Ajay's rules do not put the disclaimer line on this button. The annexure files carry Ajay's signed footer: `Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.` The success note repeats only its middle sentence. If Ajay wants the banner line `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` next to the download links, add it under `annex.success_note`.
- **Keys added beyond the brief:** `annex.button_help`, `annex.success_note`, `annex.missing_named`, `annex.regenerate`, `annex.regenerate_note`, `annex.format_pdf`, `annex.format_docx`.
- **T-194 (Ajay):** the blanks dialog applies. Any export of either annexure with a `[To be confirmed: ...]` gets the T-194 header and dialog. No banner next to the buttons.
- **Product calls applied (Priya, 13 Oct, in the ticket):** downloads are PDF and DOCX, so each download label is the signed text plus a separate PDF or DOCX tag; "Check your brief" is the fix route for missing parties; when a pack exists, the download links show with "Generate again", which replaces the old pack. No string says anything about cost, and none should: the cost decision is not copy. Ajay also says whether the blanks dialog or the disclaimer line applies to the pack.
- "Vakalatnama" and "Memo of Parties" are the names used in the document list and Ajay's card descriptions.
