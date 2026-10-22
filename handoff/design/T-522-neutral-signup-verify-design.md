# T-522 design note: neutral sign-up, the verify bar, refusals, post-verify landing

| Field | Value |
| --- | --- |
| Author | Rajesh, 22 Oct 2026 |
| Rulings | Arjun (ticket T-522), Ajay AJ-522-M1 to M7 (copy). **Correction, 22 Oct:** the "M11, M12, M14" strings relayed earlier were not issued by Ajay; the parts marked **pending Ajay** below are design proposals until he signs new rows (Vishal sends him the exact strings). |
| Components | all existing Night Library parts: `ui/Banner`, `ui/Card` (folio), `ui/Dialog` (bottom sheet at 360), `ui/Button`, `ui/Toast`, `shell/TopBar`; spec 02 and DESIGN.md |
| Figma | none needed; the four screens are compositions of components already in the file |

Every string not marked **pending Ajay** is Ajay's signed text from rows M1 to M7; nothing here adds a word to those. `{masked}` is the masked address (`a•••@gmail.com`).

## 1. "Check your email" after sign-up (new and existing address alike)

The auth folio (spec 02) with the Create account form replaced by a result; the top bar and footer stay. One folio, 440 wide (328 at 360), brass hairline, lamp pool.

- Icon: the 64px brass disc with the On Brass check (the T-525 payment mark, `nl-seal-stamped`, no stamp motion; a 150ms fade).
- Title, Tiro 28/34: `Check your email`.
- Body, Body Soft: `We've sent a link to {email}. Open it to continue.` (AJ-511-M3). The address is the one typed, not masked, so a typo is visible.
- Secondary actions, both text links in Brass Text, 44px targets: `Resend email` (section 2 throttle rules apply; this screen is signed out, so a success shows a signed-out sent line (**pending Ajay**; proposed `Request sent. Check your inbox and spam folder.`, since "Email sent" could reveal whether an account exists) in Ok text and a throttle shows the M4 wait line `Please wait before asking for another email.` in Warn text, both `role=status`); `Use a different email` back to the form with the field kept and focused.
- Below the folio, Muted body-sm: the "Lawie is a drafting assistant…" line as on the auth pages.
- No "didn't get it" countdown, no spinner, no distinction of any kind between a new and an existing address; the screen is identical byte for byte.
- States: loading is the form's own submit spinner (the screen appears only on success); error on the sign-up request stays on the form (spec 02 error banner with Retry). Resend failure: the Retry banner pattern inside the folio, under the links.

## 2. Verify bar on the dashboard (persistent)

`ui/Banner` kind `verify-email`, tone warn, full width under the top bar, above the offline banner, not dismissible. It is the only banner that persists across routes inside the dashboard shell until the address is verified.

- Text (M3): `Verify your email to start drafting, buy Ink and receive your 5 sign-up Ink. We sent a link to {masked}.`; drop the sign-up Ink clause when that grant was already made.
- Action: ghost small `Resend email` (the Banner's action slot).
- Resend states, in the same bar (the text line swaps, the bar does not grow a second row at 360; Body Small wraps): sending (button loading, width held); sent, `Email sent. Check your inbox and spam folder.` for 6 s then back to the M3 line; throttled, `Please wait before asking for another email.` (the real limit is 2 min and 5 a day, so never the "a minute" variant) and the button disabled with `aria-disabled`, re-enabled when the window passes; daily limit reached, same wait line, button disabled until the next day; failure, the existing signed T-223 line from `VerifyEmailPrompt.tsx` `VERIFY_STRINGS.networkError` (`Couldn't send the email. Check your connection and try again.`) in Rust text with a `Retry` ghost; reusing a T-223 string in this place is **pending Ajay**.
- Announcements: the bar is `role=status`; the sent and wait lines announce once.
- The Ink chip in the top bar shows the real balance (0 until the grant) and nothing else changes in the shell; the bar is the fence's one visible sign.

## 3. Refusals (draft, top-up, subscribe)

A refusal is a `ui/Dialog` (bottom sheet at 360), opened at the moment of the action, never a redirect: the advocate keeps their place.

- Draft (the Draft button in the command bar or the intake Generate): title `Verify your email to continue`, body `Verify your email to start drafting. We sent a link to {masked}.`
- Top-up (the top-up modal's Pay, or the Top up button): body `Verify your email to buy Ink.`; same title.
- Subscribe (plan chooser Choose): body `Verify your email to subscribe.`; same title.
- Buttons: `Resend email` (primary, with the section 2 throttle states shown as a line under the buttons) and `Not now` (ghost, first focus, closes). Escape and scrim close.
- Visual: the folio dialog (Card fill, brass hairline), the 64px brass disc with an envelope-less check is not used here; no icon. The dialog is 440 on desktop.
- Where the action lives in a disabled form (the intake Generate button), the button stays enabled and opens the dialog; a disabled button with no explanation is a dead button.
- What is never fenced (AJ-522-M1 a): Settings, Privacy, export, delete account, withdraw consent. No dialog on those.

## 4. Post-verify landing (the link verifies and signs in)

`app/verify-email/page.tsx` restyled as a Night Library folio, four states, all on the same page:

- Verifying: folio with a single-line skeleton under the title `Verifying your email…`; "Still working…" after 8 s.
- Verified and signed in: the brass disc with the check stamps (the Seal motion, 550 ms; fade under reduced motion), title `Email verified`, body the existing signed T-223 landing line, one primary `Go to your shelf` that leads to `/dashboard`. The verify bar is gone on arrival; if the sign-up Ink was just granted, the dashboard shows the Ink chip with the new balance and nothing else announces it (no toast, no confetti).
- Verified, not signed in (**pending Ajay**, a design proposal for verify-kind and legacy links that verify but carry no sign-in): the same check disc, title `Email verified`, body `Sign in to continue`, one primary `Sign in` to `/login`. No resend here. If Ajay does not sign a separate state, these links land on the signed-in state after a sign-in prompt.
- Link used or expired (AJ-522-M1 b): title and body **pending Ajay** (the existing signed T-223 `landingExpiredSignedOut` line `This link has expired. Sign in to send a new one.` is the candidate), one primary `Sign in`. No resend on this screen: a resend needs a signed-in user or the sign-up screen. Signs no one in.
- Already verified, already signed in: skip the page, land on the dashboard.

## 5. Password hint (spec 02 form)

Help text under the password field, Body Small Soft, from the shared constant: `At least 8 characters, with an upper-case letter, a lower-case letter and a digit.` The live rule list under the field (existing) shows the three rules with the check marks; the hint and the rules read the same constant.

## 6. Mobile and motion

Everything is one column at 360: the folio full width, dialogs as bottom sheets, the verify bar two lines of Body Small with the button under the text. The only motion is the disc fade (150 ms) on screen 1 and the stamp on screen 4; the bar and the dialogs have no animation beyond the Dialog's own.
