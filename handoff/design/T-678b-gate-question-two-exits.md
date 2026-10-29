# T-678b design note: the delivery-gate question with two exits

Rajesh, 29 Oct 2026. Screen: the gate state of `GeneratingStep` (intake, generate flow). Copy: the signed P-R2 / T678-3 question and the signed T678-4 button (`handoff/legal/T-611-fact-checker-policy-signed.md`); nothing new is written here. Tokens: `DESIGN.md`, Operate mode.

## 1. It is a question, not an error

Today the gate renders through the error branch: an `AlertTriangle` in Rust, `role="alert"`, and a dead end. The gate becomes its own state (`kind: 'gate'`, beside `error`), on the same folio, with:
- a `HelpCircle` 20px icon in Brass (`--brass`) in place of the triangle;
- the container `role="group" aria-labelledby={questionId}`, and one polite live announcement of the question when the state appears (an `aria-live="polite"` region that receives the question text once; not `alert`);
- the heading `nl-h3` in Text, `id={questionId}`, `tabIndex={-1}`, **focused on entry** so a screen reader hears the question before any button, and nobody confirms by accident with Enter.

The signed sentence is rendered as one paragraph; inside it the `<date>` (or value), `<label A>` and `<label B>` substitutions are wrapped in `<strong>` (Mukta 500, Text) so the two labels can be told apart at a glance. No table, no second phrasing, no "In the draft / In your facts" rows: those would be new copy.

## 2. Actions

Row `actions` (the intake class: row from 640px, column-reverse below), under the question, 24px gap from it:

| | Control | Label | Behaviour |
|---|---|---|---|
| Primary (right, last in DOM) | `ui/Button` primary | `Yes, it is the <label A>` (T678-4, `<label A>` filled, never truncated) | Records the value as user-confirmed for label A and re-runs (no new charge, no cost line); the button shows the spinner and both controls go inert; the folio then moves to the `Writing your {document}…` state with the inkwell as today. |
| Secondary (left, first in DOM) | `ui/Button` ghost (upgraded from the text link so the two choices read as peers) | `Back to the brief` | As today. |

Label rules: the primary's text may wrap to two lines (`white-space: normal`, `text-align: center`, 12px vertical padding, min height 48); the ghost keeps one line. Both are full width below 640. The primary carries `aria-describedby={questionId}`.

Ink (Arjun, 29 Oct): the re-run is not a new charge: one re-run per withheld run, Ink hold 0, Ink taken only on delivery as before. So there is **no cost line under the primary** and nothing under it at all; the button never says or implies "free". The primary does not wait on a cost state (it is never blocked the way `Try again` is).

## 3. States

- Entering: focus the heading; announce once. No motion (the folio content swaps; the inkwell is not shown on the gate).
- Confirming: primary loading, ghost `aria-disabled`; Escape does nothing (this is a page, not a dialog).
- Re-run returns another gate (a second value): the same screen again with the new question; focus the heading again; the previous answer is not shown.
- Re-run fails: the normal error branch (`generationFailureCopy`), with `Back to the brief` and `Try again` as today.
- Reduced motion: unchanged (nothing animates here).

## 4. Phone (390)

Folio full width with the 16px gutter; icon and heading on one row; buttons stacked full width, primary on top visually through `flex-col-reverse` (ghost first in DOM); the primary wraps to two lines when label A is long; 44px targets; no horizontal scroll with a 60-character label.

## 5. Acceptance

1. The gate renders with the Brass help icon and `role="group"`, not `role="alert"` and not the Rust triangle; the question is announced once politely.
2. Focus is on the heading on entry and after a second gate.
3. Primary label is exactly `Yes, it is the <label A>` with the real label, wrapping and never truncated at 390 and 1280; ghost is `Back to the brief`.
4. Confirming sets both controls inert, shows the spinner, and the screen proceeds to the writing state; a failure goes to the error branch.
5. Tab order: ghost, then primary; Enter on the focused heading does nothing.
6. Contrast of Brass icon on the folio is decorative (`aria-hidden`); text pairs are the existing tokens.
7. Nothing under or beside the primary mentions Ink or cost; the word "free" does not appear on the gate.
