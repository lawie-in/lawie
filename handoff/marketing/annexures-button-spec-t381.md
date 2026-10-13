# Handoff spec: annexures button (T-381)

Owner: Rajesh. For Mahak (T-381). No code here. Strings are KEYS only (`annex.*`); Madhuri writes them in `handoff/marketing/copy/annexures-button-t381.md`. Based on `app/dashboard/documents/[id]/page.tsx` as pulled on 13 Oct.

What it does (AC 1): one button calls `POST /documents/:id/annexures-pack` and offers the Vakalatnama and the Memo of Parties for download.

## 1. Placement

Not in the PDF/DOCX group. Those are 30 px high text-xs chips (red and blue, off-palette), they wrap at 375 px, and this action produces two different documents. The sidebar is below the editor at 375 px, too far for a user to find it.

**Annexures card**: a full-width row in the left column, between the disclaimer note and the editor (after the free-tier watermark notice if shown).

| | 375 px | 1280 px |
| --- | --- | --- |
| Layout | Card, 16 px padding. Title (`annex.region_label`), one-line hint (`annex.hint`), then the button full width, 48 px high. Results stack under the button | Card spans the editor column. Title and hint left, button right (min width 220 px). Results in a row of two under them |
| Position | Under the disclaimer, above the editor. Editor moves down by the card height; keep the card to one row when idle | Same |

- Visible for court documents only (not one of the 32 `not_court_documents`, T-406 list), and only once the brief has at least one party (Priya, 13 Oct). Hidden otherwise. The card shows no Ink, price or cost of any kind: the pack is free in v1 and a failed pack is never charged.
- Do not resize or restyle the existing PDF and DOCX buttons in this ticket. Note for Priya: they are under 44 px; a separate ticket.

## 2. States (one card, one live region, one alert node)

| State | What shows | Button |
| --- | --- | --- |
| Idle | Title, hint, button `annex.button`. Navy primary (`primaryButton`) | Enabled |
| Loading | Same card; button shows spinner (`Loader2`, aria-hidden) and `annex.loading` | `aria-busy="true"`, `aria-disabled="true"`, stays focusable |
| Success | Teal-light row with check icon and `annex.success_title`, then four downloads grouped per document: Vakalatnama (`annex.link_vakalatnama`) with PDF and DOCX, Memo of Parties (`annex.link_memo`) with PDF and DOCX. At 375 px the two groups stack, each group a heading plus two full-width 44 px buttons side by side (or stacked if the label wraps). At 1280 px the groups sit side by side, a 2 x 2 set. Format names (PDF, DOCX) are part of each link's accessible name. The generate button becomes the already-exists state below | Enabled |
| Already exists (a pack was made before) | Card opens with the same four download buttons as success, no spinner, plus a secondary button `annex.regenerate` and a one-line `annex.regenerate_note` under it saying it replaces the old pack (Madhuri's words). Regenerate runs the loading, success, missing-details and error states above; the old links stay until the new pack succeeds | Regenerate: secondary, enabled |
| Success with blanks | As success or already exists, plus a gold-light note `annex.blanks_note` (same look as the starting-draft note, `brand-gold-light`/`brand-gold-dark`), shown when the pack reports `[To be confirmed: …]` blanks. The T-194 dialog still runs on every download (next section) | Enabled |
| Party details missing | Gold-light box, title `annex.missing_title`, then a list of the missing items, one per row, from the API response (party names and roles per AC 2), each with its label key `annex.missing_item.<field>`. Then the fix action `annex.missing_fix` | Button stays visible; it re-runs the check |
| Error | Error-light row with `role="alert"`, `annex.error`, and a `annex.retry` link-button in the same row (as the page's export error banner, T-233) | Enabled |

- **Fixing missing details:** the fix button takes the user to where the parties are entered for this draft (the "Check your brief" screen with the parties fields focused). This route is confirmed (Priya, 13 Oct). After the user returns, the card re-checks on its own and returns to idle (or already exists, if a pack was made before).
- **Download flow, T-194 applies (Ajay, 13 Oct):** every download of either annexure, PDF or DOCX, goes through the same blanks check as any other export. Tap a download, then the check runs on that file. No blanks: the file downloads. Blanks: `ExportBlanksDialog` opens (dialog at 1280 px, bottom sheet at 375 px) and nothing downloads until "Export anyway"; "Go back and fill" returns to the card (the fix is the missing-details route). The file then carries the header `DRAFT — N items to be confirmed` and the highlighted blanks, exactly as the main draft's export. Reuse the dialog and the page's blank-warning state as they are; do not build a second one. The dialog's focus return is to the download button that opened it. Signed blanks the pack can carry: the opposite party (T-404 vakalatnama row) and the advocate's enrolment number (T-404 Addendum 3).
- Success does not auto-download. The user taps a link; nothing is saved to the device before that.
- A second press while loading is ignored (as the export buttons do).

## 3. Targets, focus, aria

- Button and the four downloads: 44 px or more high, 8 px between targets; the primary is 48 px (as `ui.ts`). Regenerate is a secondary button, 44 px.
- Card: `role="region"`, `aria-labelledby` its title.
- One live region inside the card, `role="status"` `aria-live="polite"` `aria-atomic="true"`, present in the DOM from the start: loading, success and "missing details" are announced there. Errors go to a separate `role="alert"` node. Same two-node pattern as the verify prompt (T-223) and the page's export banner.
- Download links are real `<a>` with a `download` attribute if the file URL is directly usable. If the file needs the user's token (as the PDF export uses `fetch`), use buttons that start the download, with the same look.
- After success, focus stays on the button (the user's last position); do not move focus to the links. After "missing details", move focus to the missing-details title so the list is read. After an error, keep focus on the retry.
- Colour is never the only signal: each state has an icon and text.

## 4. Contrast (AA, verify in the build)

Navy on white 15:1 or more; white on navy 15:1; gold-dark on gold-light about 6; teal-dark on teal-light about 5; error on error-light about 5.5; muted on white about 5.6. Focus ring 2 px teal with 2 px offset. Gold `#C8850E` is never text.

## 5. Reuse

- `intake/ui.ts`: `primaryButton`, `secondaryButton`, `linkButton`, `card`, `tagGold`, `tagTeal`, `tagError`, `small`.
- Page patterns: the T-233 export error banner (role alert, "Try again"), the `aria-disabled`/`aria-busy` pattern on the export buttons, the starting-draft gold note, the disclaimer note styling.
- `ExportBlanksDialog` (T-194): used as is on every annexure download (Ajay signed that it applies).
- Verify-prompt (T-223): the single live region plus alert node, and the loading, success and error rows.
- Tokens: `brand-navy`, `brand-page`, `brand-line`, `brand-gold-light`/`brand-gold-dark`, `brand-teal-light`/`brand-teal-dark`, `brand-error`/`brand-error-light`, `brand-muted`. Icons: lucide `file-text`, `check`, `alert-triangle`, `loader-2`. No new colours; do not copy the red/blue chip colours.

## 6. String keys needed

`annex.region_label`, `annex.hint`, `annex.button`, `annex.regenerate`, `annex.regenerate_note`, `annex.loading`, `annex.success_title`, `annex.link_vakalatnama`, `annex.link_memo`, `annex.blanks_note`, `annex.missing_title`, `annex.missing_item.<field>` (one per field the API can list), `annex.missing_fix`, `annex.error`, `annex.retry`, `annex.sr_loading`, `annex.sr_success`, `annex.sr_missing` (screen-reader lines for the live region). Signed by Ajay, 13 Oct (`handoff/legal/T-381-annexures-button-signed.md`): button `Create Vakalatnama and Memo of Parties`, success title `Vakalatnama and Memo of Parties created`. His file also names `annex.button_help`, `annex.success_note`, `annex.download_vakalatnama`, `annex.download_memo`; map my `annex.hint` to `annex.button_help` and `annex.link_*` to `annex.download_*`, and use his names where they differ.

**Disclaimer:** no banner or line by the card or the buttons (Ajay). Each downloaded file carries the annexure footer (T-317 Addendum 4); nothing to design on the page. Do not label the files or the card "generated with AI".

## 7. Screenshots Mahak must take for the report

Fictional matter only (`Sample, fictional matter`, no real names). Each at 375 px and 1280 px.

1. Idle: the card between the disclaimer and the editor. (The disclaimer there is the draft's own banner, not part of the card.)
2. Loading: spinner state (button `aria-busy`).
3. Success: all four downloads visible (PDF and DOCX for each document), and one downloaded Vakalatnama and Memo of Parties open, showing the sample party names.
3a. An annexure with a `[To be confirmed: …]` blank: the T-194 dialog on download (375 px bottom sheet, 1280 px dialog), then the downloaded file showing the `DRAFT — N items to be confirmed` header, the highlighted blank and the annexure footer.
3b. Already exists: reopening the draft after a pack was made, with the downloads and the Regenerate button and its note.
4. Party details missing: the list of missing items and the fix action, then "Check your brief" opened with the parties fields focused.
5. Error: the alert row with the retry.
6. A draft that cannot have a pack (one of the 32 non-court documents, and a court document with no party yet): card absent, existing PDF and DOCX buttons unchanged.
7. Keyboard pass at 1280 px: tab to the button, the live-region text after each state (accessibility tree capture).
