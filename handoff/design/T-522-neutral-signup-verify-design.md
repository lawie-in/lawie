# T-522 design note: neutral sign-up, the verify bar, refusals, post-verify landing

| Field | Value |
| --- | --- |
| Author | Rajesh, 22 Oct 2026 |
| Rulings | Arjun (ticket T-522), Ajay AJ-522-M1 to M7 and S1 to S8 (copy, `handoff/legal/T-511-copy-rulings-ajay.md`). Nothing below is pending. |
| Components | all existing Night Library parts: `ui/Banner`, `ui/Card` (folio), `ui/Dialog` (bottom sheet at 360), `ui/Button`, `ui/Toast`, `shell/TopBar`; spec 02 and DESIGN.md |
| Figma | none needed; the four screens are compositions of components already in the file |

Every string is Ajay's signed text from rows M1 to M7 and S1 to S8; nothing here adds a word. Hindi: S4, S6 and S8 give the HI lines. `{masked}` is the masked address, the existing T-223 `maskEmail` form: first character, three asterisks, domain (`a***@gmail.com`). Asterisks, not bullets: it is the convention already in the product and it renders in Mukta with no fallback glyph.

## 1. "Check your email" after sign-up (new and existing address alike)

The auth folio (spec 02) with the Create account form replaced by a result; the top bar and footer stay. One folio, 440 wide (328 at 360), brass hairline, lamp pool.

- Icon: the 64px brass disc with the On Brass check (the T-525 payment mark, `nl-seal-stamped`, no stamp motion; a 150ms fade).
- Title, Tiro 28/34: `Check your email`.
- Body, Body Soft: `We've sent a link to {email}. Open it to continue.` (AJ-511-M3). The address is the one typed, not masked, so a typo is visible.
- Secondary actions, both text links in Brass Text, 44px targets: `Resend email` (section 2 throttle rules apply; this screen is signed out, so a success shows the S6 line `Request sent. Check your inbox and spam folder.` in Ok text, a throttle shows the M4 wait line `Please wait before asking for another email.` in Warn text, and the end of the wait shows S6 `You can resend the email now.`, all `role=status`); `Use a different email` (S4) back to the form with the field kept and focused. Heading HI `अपना ईमेल देखिए` (S4).
- Below the folio, Muted body-sm: the "Lawie is a drafting assistant…" line as on the auth pages.
- No "didn't get it" countdown, no spinner, no distinction of any kind between a new and an existing address; the screen is identical byte for byte.
- States: loading is the form's own submit spinner (the screen appears only on success); error on the sign-up request stays on the form (spec 02 error banner with Retry). Resend failure (network or server, S13): `Something did not work. Try again.` in Rust text with a `Retry` ghost, inside the folio under the links. Never the S8 connection line here: signed out, nothing may hint whether an email exists.

## 2. Verify bar on the dashboard (persistent)

`ui/Banner` kind `verify-email`, tone warn, full width under the top bar, above the offline banner (verify bar first, then `OfflineBanner`, both warn tone; at 360 the two stack and the page content starts below both), not dismissible. It is the only banner that persists across routes inside the dashboard shell until the address is verified.

- Text (M3): `Verify your email to start drafting, buy Ink and receive your 5 sign-up Ink. We sent a link to {masked}.`; when the sign-up Ink was already granted, the re-signed S11 line: `Verify your email to start drafting and buy Ink. We sent a link to {masked}.` (HI per S11). S11 replaces M3's drop rule.
- Action: ghost small `Resend email` (the Banner's action slot).
- Resend states, in the same bar (the text line swaps, the bar does not grow a second row at 360; Body Small wraps): sending (button loading, width held); sent, `Email sent. Check your inbox and spam folder.` for 6 s then back to the M3 line; throttled, `Please wait before asking for another email.` (the real limit is 2 min and 5 a day, so never the "a minute" variant) and the button disabled with `aria-disabled` (not `disabled`: it keeps focus and the wait line is read out), 40% opacity, `cursor-not-allowed`, re-enabled when the window passes. `ui/Banner` gets an `action.disabled` prop for this (shared UI, Priya extends it; T-522 review, 22 Oct); daily limit reached, same wait line, button disabled until the next day; failure (S8), `Couldn't send the email. Check your connection and try again.` in Rust text with a `Retry` ghost; end of a wait window, S6 `You can resend the email now.`.
- Announcements: the bar is `role=status`; the sent and wait lines announce once.
- The Ink chip in the top bar shows the real balance (0 until the grant) and nothing else changes in the shell; the bar is the fence's one visible sign.

## 3. Refusals (draft, top-up, subscribe)

A refusal is a `ui/Dialog` (bottom sheet at 360), opened at the moment of the action, never a redirect: the advocate keeps their place.

- Draft (the Draft button in the command bar or the intake Generate): title `Verify your email to continue`, body `Verify your email to start drafting. We sent a link to {masked}.`
- Top-up (the top-up modal's Pay, or the Top up button): body `Verify your email to buy Ink.`; same title.
- Subscribe (plan chooser Choose): body `Verify your email to subscribe.`; same title.
- Buttons: `Resend email` (primary, with the section 2 throttle states shown as a Body Small status line in the dialog body, above the buttons: on the bottom sheet the buttons are the last row, against the safe-area inset, and a line under them would sit under the thumb. `ui/Dialog` stays as it is; T-522 review, 22 Oct) and `Not now` (ghost, first focus, closes). Escape and scrim close.
- Visual: the folio dialog (Card fill, brass hairline), the 64px brass disc with an envelope-less check is not used here; no icon. The dialog is 440 on desktop.
- Where the action lives in a disabled form (the intake Generate button), the button stays enabled and opens the dialog; a disabled button with no explanation is a dead button.
- What is never fenced (AJ-522-M1 a): Settings, Privacy, export, delete account, withdraw consent. No dialog on those.

## 4. Post-verify landing (the link verifies and signs in)

`app/verify-email/page.tsx` restyled as a Night Library folio, five states (S5), all on the same page:

- Verifying: folio with a single-line skeleton under the title `Verifying your email…` (S12, replaces the interim T-223 title); "Still working…" after 8 s.
- Verified and signed in: the brass disc with the check stamps (the Seal motion, 550 ms; fade under reduced motion), title `Email verified`, body `Your email is verified. You can continue.`, one primary `Go to your shelf` that leads to `/dashboard`. The verify bar is gone on arrival; if the sign-up Ink was just granted, the dashboard shows the Ink chip with the new balance and nothing else announces it (no toast, no confetti).
- Verified, not signed in (verify-kind and legacy links): the same check disc, title `Email verified`, body `Your email is verified. Sign in to continue.`, one primary `Sign in` to `/login`. No resend.
- Link used or expired (AJ-522-M1 b): Rust title `This link has expired or was already used.`, line `Sign in to continue. If your email is not verified yet, you can ask for a new link.`, one primary `Sign in`. `Resend email` appears here only when a session already exists (S5), so nothing reveals whether an account exists. Signs no one in.
- Failure: `We couldn't verify your email just now. Please try again.` with `Try again` (primary) and the Retry pattern.
- Already verified, already signed in: skip the page, land on the dashboard.

## 5. Password hint (spec 02 form)

S7: no new one-line hint. The signed T-234 checklist under the field stays, read from the shared constant, with the check marks. The weak-password error is one line in Rust: `Use at least 8 characters, with an upper-case letter, a lower-case letter and a digit.` (HI per S7). Sign-up 429 reuses T-221 `forgot.limit` with {n} from Retry-After; 503 shows `Something did not work. Try again.` with `Retry` (S8).

## 6. Mobile and motion

Everything is one column at 360: the folio full width, dialogs as bottom sheets, the verify bar two lines of Body Small with the button under the text. The only motion is the disc fade (150 ms) on screen 1 and the stamp on screen 4; the bar and the dialogs have no animation beyond the Dialog's own.

## Review notes, 22 Oct (Vishal's `fix/t-522-neutral-signup` @ 5a5c47f7)

Design read of the web diff, with the decisions above folded into the sections they belong to:

1. Verify bar Resend: `ui/Banner` gets `action.disabled` (section 2). Until it lands the press is a no-op during a send or wait, which is not a dead button in the sense of the V1 checklist, but it must not ship that way.
2. Dialog status line above the buttons: accepted, `ui/Dialog` unchanged (section 3).
3. Referral "not applied" notice: the seen flag in `localStorage` per user, written after the notice has rendered, is fine for v1. Storage unavailable means it shows again, never a silent drop. A second device shows it once more; one sentence, no harm. A server flag is Arjun's call when an endpoint exists.
4. `maskEmail` `a***@domain`: keep (section 1).
5. Verify bar above `OfflineBanner`: yes, as section 2 asks.

Design verdict: READY once item 1 is in. Tests are the tester's; nothing here depends on them.

Addendum, 22 Oct (2b817262): the Settings/Plan panel's own "Verify your email to subscribe" banner is removed; the M3 bar is the one persistent banner and it is already on that page. Subscribe stays enabled and the M6 dialog answers the 403. The header `Top up` button opens the top-up dialog as before; the M6 refusal comes at `Buy` inside it, stacked above the top-up dialog, and `Not now` returns focus to `Buy`. Opening M6 from the header button itself is not in v1.
