# T-578 design note: editor above the fold, focus mode (and T-579 Word button)

Rajesh, 23 Oct 2026. For Kunal (T-578) and whichever lead takes T-579. Tokens of record: `DESIGN.md`. No signed string changes wording; two signed lines move position and Ajay confirms the moves (marked AJAY below).

## 1. Why the editor is low today

On `dashboard/documents/[id]` the column above the editor is: header row (back, title, court; save state, Save, PDF, DOCX), the export-error banner when one exists, the starting-draft label (boxed), the T-197 disclaimer (boxed card), the Annexures card (title, help line, 220px primary button; grows on success). At 1280 x 768 that is roughly 330px before the first line of the draft. Three things fix it: unbox the two notes, move Annexures out of the column at desktop, and give the editor a focus mode.

## 2. Normal view, new order (all widths)

1. Header row, as it is.
2. Export-error banner, only when there is an error (unchanged, T-233 focus rules).
3. **Notes row.** One block, no card, no border, no fill: the starting-draft label (when present) and the T-197 disclaimer as two Body Small lines, Muted (`--muted`), 20px line height, 4px apart, `role="note"` kept on each. Byte-for-byte text. The starting-draft label keeps `font-weight: 500`; the disclaimer is 400. Total height 24 to 48px. **AJAY:** the disclaimer line moves from a boxed card to a plain line in the same position (on every draft, before the editor, not dismissible, no colour change below AA: Muted on Wall is 4.6:1 by day, 5.4:1 at night). Wording identical.
4. **Annexures row** (below 1024 only; see 5 for desktop): one 44px row, Card fill, Control Line border, `rounded-nl-md`: FileText 16px, `Annexures` (Mukta 500, 14px), the help line `Prepared from the details you entered.` Muted 13px after it (hidden below 480px, the help text then goes to `aria-describedby` on the button), and `Create annexures` as a **ghost** button on the right (DESIGN.md One Primary: the page's primary is the draft, so the pack button is not brass-filled any more). The success, missing-details and error states open **below the row** exactly as today, on action only; the row never grows at rest. `role="region"` and the strings stay as they are (AJ T-381 signed).
5. **Desktop (≥ 1024, the existing `lg`)**: the Annexures row moves to the **top of the right rail**, above the filing checklist, as the same one-line row but stacked (title and help line, then the full-width ghost button, 44px). Its states open under it inside the rail. Nothing about annexures remains in the editor column at desktop. **AJAY:** the annexure strings do not change, only where the card sits.
6. Editor, starting at: ≤ 200px from the top of the viewport at 1280 (top bar 64 + header 44 + notes ≤ 48 + gaps), ≤ 290px at 768 and 390 (plus the 44px Annexures row).

Acceptance (Playwright, three widths, 768px tall viewport): the editor's content box top edge is at most 220px at 1280 and at most 300px at 768 and 390, with a draft that has a starting-draft label and a disclaimer.

## 3. Focus mode

- **Control:** a toolbar button at the right end of the editor toolbar, after a divider: Maximize2 16px, `aria-label="Full screen"`, `title="Full screen"`, `aria-pressed` toggles. In focus mode the same button shows Minimize2 with `aria-label="Exit full screen"`. One button, two states; no second control anywhere else. 44px hit area (the toolbar buttons are smaller today; give this one `min-h-[44px] min-w-[44px]` and leave the others for the toolbar rebuild).
- **Layer:** not the browser Fullscreen API (iOS Safari has none for elements, and the keyboard rules differ). The editor root becomes `position: fixed; inset: 0; z-index: 45` (above the sidebar at 30 and the page, below every dialog at 50, the consent sheet at 55 and the command bar at 60), on Wall (`--wall`), with the toolbar as the first row and the page (the 210mm sheet) scrolling under it. `body` scroll is locked while open (`overflow: hidden` on `html`, restored on exit). Safe-area insets padded (viewport-fit=cover is on).
- **What stays visible:** toolbar; save state (`Saving… / Saved / Save failed / vN`) moves into the toolbar's right group next to the control while in focus mode, so autosave is never hidden; and a **footer line**: the T-197 disclaimer, Muted 13px, one line, centred, 8px padding, at the bottom of the layer. **AJAY:** the disclaimer is shown a second time in focus mode so it never disappears; same text. If Ajay prefers it not duplicated, the footer line is the only copy while the layer is open (the page under it is covered either way).
- **Exit:** the control, or Escape (when the editor has focus, Escape exits focus mode; the Tiptap editor does not use Escape). Focus returns to the control. Export, Save and the Annexures row are not inside the layer: the user exits to reach them (one press). Autosave, versioning and unsaved edits are untouched: the editor instance is the same node, only its container's classes change (do not remount Tiptap).
- **Motion:** 150ms opacity fade of the layer in and out; under reduced motion none. No scale, no slide.
- **Widths:** 390: the sheet fills the width with the 16px gutter, no `max-w-[210mm]` shadow box (the sheet is the layer); the toolbar wraps to at most two rows and the control stays in the first row at the right (`order` it first in DOM after the undo group if needed). 768 and 1280: the sheet is centred at 210mm with 24px top padding.
- **Dialogs:** ExportBlanksDialog and the delete dialog are z-50 and open above the layer; they are not reachable from inside it today, which is fine.
- **Both themes:** the layer uses the same tokens as the page; nothing new.

## 4. T-579: the Word (.docx) button for annexures

In the Annexures success state, two download buttons side by side, same size, both ghost: `Download annexures (PDF)` (existing, first) and `Download annexures (Word)` (new, second), icons FileText and File 16px. At 390 they stack, full width, PDF first. If the pack call returns both files at once, both buttons appear together; if Word is a second fetch, the Word button carries `aria-busy` and the existing `Preparing your annexures…` label while it runs, and a failure uses the same error row and `Try again`. Filename `<title>_annexures.docx`. **New string for Ajay:** `Download annexures (Word)`; mirrors the signed PDF label. No other copy changes. Arjun decides one call or two.

## 5. T-577: held

The paragraph-count control waits for Arjun's count semantics and Vikram's cap and price. Sketch only, for planning: a numeric stepper `Paragraphs` on the brief step (document types that ask), default from the pack, cap from the server, and the existing cost line (`InkCostLine`) re-quoted on each change so shown equals charged. Full note after the numbers.
