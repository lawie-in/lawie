# Handoff spec: State picker before payment (T-436)

Owner: Rajesh. For the lead on T-436. No code. Source: `handoff/legal/gst-tax-invoice-signed.md` section 3 (must-fix). Ajay signs the rule, not UI strings; only quoted text is "Ajay, signed". Everything else is "Madhuri to word". Nothing here states what the invoice shows or any tax claim.

## 1. Decisions

- Rule (Ajay, signed): "Ask before the first payment, from a fixed list of States/UTs" and "Editable before each payment, not afterwards on an issued invoice."
- Control: native `<select>`, pre-filled when set, same component on both paths. Reuse `input` and `label` from `intake/ui.ts` (48 px, 16 px text).
- No select, combobox or Radix Select exists in `apps/web/src` to reuse.

## 2. Placement and blocking

| Path | File | Placement | Block rule |
| --- | --- | --- | --- |
| Upgrade | `PlanUpgrade.tsx` (Plan block, `/dashboard/settings`) | Above the Upgrade button | Click with no State: error, focus the select, no call to `/api/billing/subscribe` |
| Ink top-up | `TopUpModal.tsx` | Above "Pay with Razorpay", below coupon | Click with no State: error, focus, Razorpay not opened |

- Button stays enabled: a grey button with no reason is unreadable on a phone.
- Server must also refuse a payment with no State; the client check is not a gate. Lead to confirm with Arjun.
- No separate billing page exists. The settings Plan block is it; the picker also sits there, saved on change.

## 3. Already set, layout, control

- Set: pre-filled select, not read-only line + Edit. Ajay says editable before each payment; a read-only line adds a tap and a second mode. No default State is ever guessed.
- 375 px: label, full-width select (48 px), help, error stacked. 1280 px: same, `max-w-xs` in the Plan block, full width in the modal.
- Native, not combobox: 36 options (28 States + 8 UTs; Vikram to confirm list and codes). Android opens the OS list with type-ahead and no keyboard pop-up; no library, no JS, works on patchy 4G. A combobox adds filtering and ARIA risk for a short A-Z list.
- Options A-Z by State name, placeholder first. Code is stored, not shown.

## 4. Strings

| Where | Text |
| --- | --- |
| Label | `State` (Madhuri to word) |
| Placeholder | `Select your State` (Madhuri to word) |
| Help | Madhuri to word. Purpose phrase from Ajay's file: "to issue GST tax invoices" |
| Required error | `Select your State to continue.` (Madhuri to word) |
| Saving / Saved / Failed | `Saving…` / `Saved` / `Could not save. Try again.` (Madhuri to word) |

## 5. States

| State | What shows |
| --- | --- |
| Empty / Chosen | Placeholder or State name; help; no error |
| Error / Failed | `brand-error` border, message below, `aria-invalid="true"`; payment does not start |
| Saving / Saved | Select disabled + `Saving…`, Pay waits; then `Saved` about 2 s |

- After payment the picker is not editable for that invoice (Ajay); editable again for the next payment.

## 6. Accessibility
- `<label htmlFor>` to select `id`; `aria-required="true"` and a text cue, not colour only.
- Help and error ids in `aria-describedby`; error is `<p role="alert">`.
- Blocked Pay: focus moves to the select via `useEffect`; do not open the list.
- Saving/Saved in an `aria-live="polite"` region always in the DOM. Tab order: coupon, State, Pay. Target 48 px (over 44).

## 7. Open questions
- State list and codes: Vikram (Jharkhand = 20, Addendum 1).
- Help wording: Madhuri; Ajay to check if it states more than his phrase.
- Parked GSTIN box is not designed here (its State overrides the chosen one per Ajay).
- Existing users with no State: check how `User.state` reaches the web.

## Superseded by Arjun (15 Oct 2026)

- The line "server refuses payment with no State" no longer applies. There is no server reject; the fallback in Ajay's addendum 3 covers it. The client still asks before the first payment.
