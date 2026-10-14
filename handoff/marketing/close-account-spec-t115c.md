# Handoff spec: Close account and erase (T-115c)

Owner: Rajesh. For the lead on T-115c. No code here. Dialog text is Ajay's, signed 14 Oct 2026 (`handoff/legal/dpdp-v1-calls-signed.md`); do not reword. Short UI strings marked "Madhuri to word". Based on `dashboard/settings/page.tsx` (Profile, Plan, Sign out), `ReferralOfferModal.tsx` (dialog focus code), `intake/ui.ts`, and decisions 2, 3 and 4 in `T-115-permanent-delete-and-encrypted-inputs.md`.

Decisions (Arjun): no grace period, erase runs at once, user is logged out at once. Re-proof of identity is required (password, or email plus a session under 15 minutes for Google-only users). Refused with 409 `subscription_active` while a plan is active.

## 1. Where the control sits

| Item | 375 px | 1280 px |
| --- | --- | --- |
| Entry | New section `Close account` on Settings, below Plan, above Sign out. Heading `h2`, one line of plain text (Madhuri to word, no legal claims), then a `Close account` button: `secondaryButton`, `text-brand-error`, `border-brand-error`, full width, 44 px | Same section, button at natural width, left-aligned |
| Why last | Rare, destructive: kept apart from Plan and Sign out so it is not hit by mistake | Same |
| Click | Opens the confirm dialog (section 2). The password field is inside it, not on a separate page | Same |

- Why a dialog, not a page: one extra screen on patchy 4G adds a load and a back-button trap. The dialog keeps the Settings page in place and Cancel returns the user to exactly where they were.

## 2. The confirm step: a dialog with one field

| Item | Spec |
| --- | --- |
| Element | `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` = title, `aria-describedby` = body |
| Title (Ajay, signed) | `Close your account and erase your data?` |
| Body (Ajay, signed) | `This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.` |
| Buttons (Ajay, signed) | `Close account and erase` / `Cancel` |
| Re-proof field | Password users: `input` (type password, `autocomplete="current-password"`), label `Your password` (Madhuri to word). Google-only users: type your email, label `Type your email address` (Madhuri to word), `autocomplete="off"`. Field sits between body and buttons, 48 px high. This is Arjun's decision 3, not Ajay's text |
| Layout 375 px | Card `max-w-sm`, 16 px gutter, scrolls inside if the keyboard is open (`max-h-[90dvh] overflow-y-auto`). Buttons stacked full width, `Cancel` on top, destructive below, 48 px each |
| Layout 1280 px | `max-w-md`, buttons in a row, right-aligned, `Cancel` left |
| Initial focus | `Cancel` (the safe option), not the password field |
| Destructive button | `bg-brand-error` (`#B3261E`) white text, about 6.5:1, `aria-disabled="true"` while the field is empty. Kept in tab order (as Confirm does today) |
| Focus trap | Tab cycles: field, `Cancel`, destructive button. Page behind `aria-hidden`, scroll locked. Reuse the shared `useModalFocus` from T-115b |
| Escape, backdrop, Cancel | Close with no call and clear the field. Focus returns to the `Close account` button. Disabled while working |
| Enter in the field | Submits only when the field is filled |

## 3. States

| State | What shows | Destructive button | Screen-reader text |
| --- | --- | --- | --- |
| Idle | Settings section | n/a | Button name `Close account` |
| Confirming | Dialog open, field empty | `aria-disabled` until filled | Title, then body read on open |
| Working | Dialog stays. Label `Closing...` with `Loader2` (`aria-hidden`). Field and `Cancel` disabled, Escape ignored | `aria-disabled`, same size | `role="status"`: `Closing your account. Please wait.` (Madhuri to word). Erase takes minutes, so no timer text; do not show a progress percent |
| Success | Session is already dead, so go to a public page `/account-closed` | n/a | See section 4 |
| Error: wrong password (401) | Inline `<p role="alert">` under the field, `alert-circle` icon: `That password is not right. Nothing was changed.` (Madhuri to word). Field marked `aria-invalid="true"`, `aria-describedby` points to the message | Enabled again | Alert read once |
| Error: active plan (409 `subscription_active`) | Same slot, `role="alert"`: `Cancel your plan first.` (Arjun's string). Under it a `linkButton` to the Plan section if a cancel path exists; otherwise the line `Write to contact@lawie.in to cancel.` (Arjun's fallback) | Stays `aria-disabled` until the dialog is reopened | Alert read once |
| Error: other (network, 5xx, google session too old) | `role="alert"`: `We could not close your account. Try again.` (Madhuri to word). For an old Google session add `Sign in again, then try once more.` (Madhuri to word) | Enabled for retry | Alert read once |

- Never: "free", "permanently", "immediately", a backups promise, or a claim about how the data is protected. If Arjun confirms a backup period, Ajay adds `Copies in our backups are erased within {N} days.` as a line under the body: `[Ajay to supply]`. Not shown until signed.
- If the erase fails midway, the account is locked and a sweep finishes it. The user sees the generic error above; they cannot log in. Wording for that case: `[Ajay to supply]` or Madhuri if non-legal. Lead to say what the API returns.

## 4. After success

- Redirect to `/account-closed` (public page, no sidebar). Focus goes to its `h1`; `tabIndex={-1}`. The text of the page: `[Madhuri to word]`; if it states what was erased, `[Ajay to supply]`. Keep it to "Your account is closed" plus a link to the home page.
- Clear all local state (tokens, localStorage keys the app sets) before redirecting.
- Why: the user cannot stay on a dashboard that no longer has a session, and focus must land on text a screen reader will read.

## 5. Tokens and reuse

- Existing: `secondaryButton`, `primaryButton` shape, `input`, `label`, `linkButton`, `brand-error`, `brand-error-light`. New: `ConfirmCloseAccountDialog` (shares `useModalFocus` with T-115b). No new colours.

## 6. Open questions

- Priya/Arjun: is there a cancel-plan path in billing at build time? Decides the 409 line. The Settings page has a `Cancel subscription` button with no handler today.
- Google-only users: confirm "type your email" is shown only when the account has no password.
- Settings uses older `slate-*` classes; new section follows the page, dialog uses brand tokens.
- Does anything in the ticket need a confirmation email? (T-220, not in scope; no UI here.)
