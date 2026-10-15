# Handoff spec: Delete a document (T-115b)

Owner: Rajesh. For the lead on T-115b. No code here. Dialog text is Ajay's, signed 14 Oct 2026 (`handoff/legal/dpdp-v1-calls-signed.md`); do not reword. Short UI strings marked "Madhuri to word". Based on `dashboard/documents/page.tsx` (table list), `ReferralOfferModal.tsx` (existing dialog: focus trap, Escape, focus return) and `intake/ui.ts`.

Decision (Arjun): hard delete at once, no undo, no restore. The web asks for one confirm, then calls `DELETE /documents/:id`.

## 1. Where the control sits

| Place | 375 px | 1280 px |
| --- | --- | --- |
| My documents list (`/dashboard/documents`) | New last column, no header text visible (`sr-only` "Actions"). Button shows trash icon only, 44 x 44 px, `aria-label="Delete {title}"`. Court and Date columns are already hidden here, so the column fits | Same column, button shows icon + `Delete` (Madhuri to word), 44 px high |
| Document page (`/dashboard/documents/[id]`) | Not in the main toolbar. Put `Delete document` as a `secondaryButton` at the bottom of the page, away from Download/Edit, so it is not hit by mistake | Same place, same style |

- Why: a destructive action should be reachable but never next to the safe actions. Icon-only on phone saves width on a 4-column table.
- Row button colour: `text-brand-error`, `hover:bg-brand-error-light`. Not red fill until confirm.
- One shared `ConfirmDeleteDialog` for both places.

## 2. The confirm step: a dialog (not a page)

Why a dialog: the user stays on the list and keeps their place. Copy the focus-trap and focus-return logic from `ReferralOfferModal` into a shared `useModalFocus` rather than writing a second one.

| Item | Spec |
| --- | --- |
| Element | `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` = title id, `aria-describedby` = body id |
| Title (Ajay, signed) | `Delete this document?` |
| Body (Ajay, signed) | `This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.` |
| Buttons (Ajay, signed) | `Delete document` / `Cancel` |
| Document name | Show the title in a line above the body, `text-sm text-brand-muted`, so the user knows which one. Not part of Ajay's text, no extra legal words. Titles may hold client names: do not log or send the title to analytics |
| Layout 375 px | Sheet centred, `max-w-sm`, 16 px gutter. Buttons stacked full width: `Cancel` first (top), `Delete document` below, 12 px gap. Each 48 px high |
| Layout 1280 px | Same card, `max-w-md`. Buttons in a row, right-aligned, `Cancel` left of `Delete document` |
| Initial focus | `Cancel` (the safe option). Never the delete button |
| Cancel button | `secondaryButton`, but 48 px |
| Delete button | `primaryButton` shape with `bg-brand-error` (`#B3261E`) and white text, about 6.5:1. Lucide `trash-2` icon 16 px `aria-hidden` |
| Focus trap | Tab and Shift+Tab cycle between the two buttons only. Page behind: `aria-hidden`, scroll locked |
| Escape, backdrop click, Cancel | Close with no call. Focus returns to the button that opened it. Disabled while `working` (see 3) |
| No typed confirmation | Neither the ticket nor Ajay's file asks for it |

## 3. States

| State | What shows | Delete button | Cancel | Screen-reader text |
| --- | --- | --- | --- | --- |
| Idle | Row/button as in section 1 | n/a | n/a | Button name `Delete {title}` |
| Confirming | Dialog open | Enabled | Enabled, focused | Dialog title then body read on open (`alertdialog`) |
| Working | Dialog stays open. Delete button label `Deleting...` with `Loader2` spinner (`aria-hidden`) | `aria-disabled="true"`, stays in place, same width | Disabled, Escape and backdrop ignored | `role="status"`: `Deleting the document.` (Madhuri to word) |
| Success | Dialog closes. Row disappears from the list. Page shows a toast-free note: a `role="status"` line above the table, `Document deleted.` (Madhuri to word), stays 6 s | n/a | n/a | Same line, polite |
| Error | Dialog stays open. Inline `<p role="alert">` above the buttons with `alert-circle` icon: `We could not delete this document. Nothing was deleted. Try again.` (Madhuri to word; keep the "nothing was deleted" claim only if the lead confirms the route is all-or-nothing, else drop that sentence) | Back to enabled, label `Delete document` (so retry is the same button) | Enabled | Alert read once on mount |

- 404 from the route (already deleted): treat as success and refresh the list.
- Never say "free", "permanently", "immediately" or anything about backups. Ajay's file allows a backups line only if Arjun gives a period; there are no backups on the current tier, so none now. If that changes: `[Ajay to supply]`.

## 4. Focus after success

- List: focus moves to the title link of the next row; if it was the last row, the previous row; if the list is now empty, the `h1` "My documents" (add `tabIndex={-1}`).
- Document page: navigate to `/dashboard/documents`, focus the `h1` and show the same `Document deleted.` status line.
- Why: the button that opened the dialog no longer exists, so focus must not fall back to `<body>`.

## 5. Tokens and reuse

- Existing: `secondaryButton`, `primaryButton` shape, `brand-error`, `brand-error-light`, `brand-navy`, modal focus code in `ReferralOfferModal`.
- New: one `ConfirmDeleteDialog`, one `useModalFocus` hook. No new colours.

## 6. Open questions

- The list page uses older `slate-*` classes, not brand tokens; the new column follows the page, the dialog uses brand tokens. Priya/lead to decide if the page is restyled (not in this ticket).
- Is `DELETE` all-or-nothing? Decides the error line (section 3).
- The ticket gives no screenshot requirement; Anushka tests the dialog on develop at 375 px with a fictional document.
