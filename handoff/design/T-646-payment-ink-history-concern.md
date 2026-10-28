# T-646 design note: payment history, Ink history, raise a concern

Rajesh, 28 Oct 2026, for Shashank. Tokens of record: `DESIGN.md`; Operate mode. All text is placeholder `[ ]` until Ajay signs (reasons, statuses, acknowledgements, response times); the few strings already in the product are named as such. Figma frames follow once the Starter MCP quota allows; this note is the spec of record.

## 5. Placement: a new "Billing" tab

Settings gets a third tab, `Billing`, after `Plan` (tab list `Profile · Plan · Billing`; `useSettingsTab` ids `profile | plan | billing`). It holds, in order: **Invoices** (the T-436 card moves here unchanged), **Payments**, **Ink history**. The Plan tab keeps the plan, the status card and Cancel: Plan is where decisions are made, Billing is the record. Deep links: `?tab=billing#payments`, `#ink`, and `#payment-<id>` to one row (used by the concern acknowledgement email). The verify bar and the privacy prompt keep their precedence over this tab as over Plan.

## 1. Payments

A `ui/Card` titled `[Payments]` with a one-line Muted intro `[ ]`, then a list, newest first, 10 rows with `[Show more]` (ghost) loading 10 at a time.

Row (desktop ≥ 720, a 6-column grid on a 44px-min row, 12px vertical padding, Line hairline between rows, no zebra):

| Col | Content | Type |
|---|---|---|
| 1 | Date, IST: `12 Oct 2026, 14:32` | Mukta 14, Text, tabular |
| 2 | Purpose: `[Solo plan]` / `[Top-up, 20 Ink]` | Mukta 16/500 Text; second line Muted 13 for the plan period `[12 Oct – 11 Nov]` when it is a plan charge |
| 3 | Amount `₹799` (en-IN, tabular, Tiro 18 for the figure as the price style); a refund shows `−₹799` in Text Soft | right-aligned |
| 4 | Status chip (`ui/Chip`): paid = ok, pending = warn, failed = error, refunded = neutral; label `[Paid]` etc. | never colour alone: the label carries it |
| 5 | Reference: `…` + the last 8 characters of the Razorpay id, Muted 13 mono-ish (`font-variant-numeric: tabular-nums`), with a copy button (ghost icon, `aria-label="[Copy reference]"`) | never the full id |
| 6 | Actions: `[Invoice]` ghost link (only when an invoice exists; opens the PDF as the Invoices card does) and `[Raise a concern]` ghost; when a concern exists the second becomes the concern state chip (§3) plus `[View]` | right-aligned, 44px targets |

Rules: one row = one payment; a failed payment still gets a row (that is the point); a refund is its own row linked to the original by `[Refund of …<ref>]` in the purpose's second line. Amount, date and reference are plain text, never truncated; the purpose truncates with a title tooltip at one line on desktop and wraps on phones. No Razorpay logo, no card details beyond what the reference is.

States: loading = 3 skeleton rows; empty = Muted line `[No payments yet.]` with no illustration; error = the row-455 pattern `Something did not work. Try again.` + `Retry` inside the card; a payment the API no longer finds (404 on a deep link) = the card scrolls to top and shows the empty line, never an error.

## 2. Ink history

A `ui/Card` titled `[Ink history]`, with the current balance as the first line (`InkChip` + `[Balance]`), then a list grouped by day, newest first, 20 rows with `[Show more]`.

Row (4 columns on desktop): date and time IST (Mukta 14 tabular) · what: `[Draft: {document title}]` for a use (title only, truncated at one line with tooltip, never content; a deleted document shows `[Draft (deleted)]`), `[Plan Ink: Solo]`, `[Top-up]`, `[Sign-up Ink]`, `[Referral Ink]`, `[Refund]` for credits · change `−2 Ink` / `+50 Ink` (Tiro 18 tabular; uses in Text, credits in Moss text) · running balance after the row `48 Ink` (Mukta 14 Muted tabular, right-aligned). A failed draft that used no Ink is not a row (there is nothing to show); a draft that settled lower than quoted (T-577) is one row at the settled figure. Grouping: a Muted day header `[Today]`, `[Yesterday]`, else the date; rows under it.

Document link: the title is a link to the document when it exists, ghost-link style; otherwise plain text.

States as §1: skeleton, empty `[No Ink activity yet.]`, error with Retry.

## 3. Raise a concern

Opened from a payment row's `[Raise a concern]`. `ui/Dialog` (bottom sheet ≤ 640, centred 440 above), title `[Raise a concern]`, description line showing the payment it is about: `[{purpose} · ₹{amount} · {date}]` in Text Soft, so the user never files against the wrong row.

Fields, in order:
1. `[Reason]` — `ui/Select` (Control Line, 44px): `[Charged but no Ink added]`, `[Charged twice]`, `[Wrong amount]`, `[Refund request]`, `[Something else]`. Required; no default selected; the error line `[Choose a reason.]` under it on submit.
2. `[What happened?]` — `ui/Input` as a textarea, 3 rows, max 500 characters with a live `{n}/500` counter in Muted (tabular), required only for `[Something else]`; otherwise optional with the placeholder `[Optional]`.
3. A Muted Body Small line under the fields for Ajay's text: `[How we handle concerns; the refund policy and grievance officer links]`. Nothing here promises a time unless Ajay signs one.

Buttons: `[Submit]` primary, `[Cancel]` ghost first in DOM. Submitting: the primary shows the spinner and both buttons are inert (Dialog `confirmLoading`). Success: the dialog closes, a `ui/Toast` (ok) says `[Concern sent. We have emailed you an acknowledgement.]`, the row's action area now shows the concern chip. Failure: the Dialog's error slot `Something did not work. Try again.` (row 455), the form keeps its values. Escape and the scrim close only while not submitting.

Concern state on the row: a `ui/Chip`: `[Concern: open]` warn, `[Concern: resolved]` ok, `[Concern: refunded]` neutral (Vikram/Ajay decide the set); `[View]` opens a read-only version of the dialog with the reason, note, date sent and the state, plus `[Grievance officer]` link; a second concern on the same payment is not allowed while one is open (the button is absent, the chip explains).

## 4. Phone layout (360)

- Tabs: the existing SettingsTabList pattern (scrollable row, 44px tabs); `Billing` is the third.
- Payment row becomes a 2-line card row, full width, 16px padding: line 1 = purpose (500) left, amount right (Tiro 18); line 2 = date · status chip left, reference with copy right; line 3 (only when present) = actions as 44px ghost buttons in a row, `[Invoice]` and `[Raise a concern]` / concern chip + `[View]`. Hairline between rows.
- Ink row: line 1 = what (link or text) left, change right; line 2 = time left, running balance right in Muted. Day headers as on desktop.
- Dialog is the bottom sheet: the reason select opens the native picker; the textarea grows to 5 rows; buttons stacked, primary on top is **not** allowed (DESIGN.md: cancel first in DOM, primary last visually), so the sheet keeps `flex-col-reverse` as `ui/Dialog` does.
- Everything tabular stays tabular; amounts never wrap; references never wrap (the copy button is the overflow).

## Accessibility and states, both themes

- Lists are `<table>` on desktop (`<caption>` sr-only, `scope="col"` headers) and `<ul>` on phones; the same data, chosen by the `min-[720px]` breakpoint, rendered once (CSS, not two trees).
- Every chip has text; status is never colour-only. Copy button announces `[Copied]` in a polite region. Focus returns to `[Raise a concern]` after the dialog closes.
- Contrast from tokens; the reviewer prints the pairs. Dates include the year always; IST is implied (the label says `[Times in IST]` once in the card intro).
- Night and Daylight from tokens; no new tokens.

## Acceptance
1. Billing tab exists with Invoices, Payments, Ink history in that order; deep links land on the card or row.
2. Each payment status renders with its chip and label; a failed payment is a row; refunds show negative and link to the original.
3. Reference shows the last 8 characters only; copy works and announces.
4. Ink rows show titles only, the running balance matches the ledger (test), credits in Moss text.
5. Concern dialog: reason required, note required only for Something else, 500-char cap, success toast, state chip on the row, no second open concern.
6. 360: no horizontal scroll, amounts and references never wrap, 44px targets.
