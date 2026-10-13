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

- Visible only for drafts that can have a pack (brief drafts with parties, AC 2). Hidden otherwise. Priya to confirm the rule.
- Do not resize or restyle the existing PDF and DOCX buttons in this ticket. Note for Priya: they are under 44 px; a separate ticket.

## 2. States (one card, one live region, one alert node)

| State | What shows | Button |
| --- | --- | --- |
| Idle | Title, hint, button `annex.button`. Navy primary (`primaryButton`) | Enabled |
| Loading | Same card; button shows spinner (`Loader2`, aria-hidden) and `annex.loading` | `aria-busy="true"`, `aria-disabled="true"`, stays focusable |
| Success | Teal-light row with check icon and `annex.success_title`, then two download links: `annex.link_vakalatnama` and `annex.link_memo` (file type shown as the API returns it). Button becomes secondary `annex.button_again` | Enabled |
| Success with blanks | As success, plus a gold-light note `annex.blanks_note` (same look as the starting-draft note on this page, `brand-gold-light`/`brand-gold-dark`). If the pack reports blanks, Ajay decides whether the T-194 warning dialog must run before download; until he says, show the note only | Enabled |
| Party details missing | Gold-light box, title `annex.missing_title`, then a list of the missing items, one per row, from the API response (party names and roles per AC 2), each with its label key `annex.missing_item.<field>`. Then the fix action `annex.missing_fix` | Button stays visible; it re-runs the check |
| Error | Error-light row with `role="alert"`, `annex.error`, and a `annex.retry` link-button in the same row (as the page's export error banner, T-233) | Enabled |

- **Fixing missing details:** the fix button takes the user to where the parties are entered for this draft (the "Check your brief" screen with the parties fields focused). If a draft cannot be edited that way, the lead and Priya say what the route is; do not invent one. After the user returns, the card re-checks on its own and moves to idle.
- Success does not auto-download. The user taps a link; nothing is saved to the device before that.
- A second press while loading is ignored (as the export buttons do).

## 3. Targets, focus, aria

- Button and links: 44 px or more high, 8 px between targets; the primary is 48 px (as `ui.ts`).
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
- `ExportBlanksDialog` (T-194): the "blanks" pattern only if Ajay asks for it on the pack; do not build a second dialog.
- Verify-prompt (T-223): the single live region plus alert node, and the loading, success and error rows.
- Tokens: `brand-navy`, `brand-page`, `brand-line`, `brand-gold-light`/`brand-gold-dark`, `brand-teal-light`/`brand-teal-dark`, `brand-error`/`brand-error-light`, `brand-muted`. Icons: lucide `file-text`, `check`, `alert-triangle`, `loader-2`. No new colours; do not copy the red/blue chip colours.

## 6. String keys needed

`annex.region_label`, `annex.hint`, `annex.button`, `annex.button_again`, `annex.loading`, `annex.success_title`, `annex.link_vakalatnama`, `annex.link_memo`, `annex.blanks_note`, `annex.missing_title`, `annex.missing_item.<field>` (one per field the API can list), `annex.missing_fix`, `annex.error`, `annex.retry`, `annex.sr_loading`, `annex.sr_success`, `annex.sr_missing` (screen-reader lines for the live region). Names for the Vakalatnama and the Memo of Parties are legal naming: Ajay to sign. Whether the disclaimer line must sit beside the download links is Ajay's call; the page already shows it above the editor.

## 7. Screenshots Mahak must take for the report

Fictional matter only (`Sample, fictional matter`, no real names). Each at 375 px and 1280 px.

1. Idle: the card between the disclaimer and the editor.
2. Loading: spinner state (button `aria-busy`).
3. Success: both download links visible (and the downloaded Vakalatnama and Memo of Parties open, showing the sample party names).
4. Party details missing: the list of missing items and the fix action, then the fix route opened.
5. Error: the alert row with the retry.
6. A draft that cannot have a pack: card absent, existing PDF and DOCX buttons unchanged.
7. Keyboard pass at 1280 px: tab to the button, the live-region text after each state (accessibility tree capture).
