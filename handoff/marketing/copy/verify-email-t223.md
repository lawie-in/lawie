# Verify-your-email copy (T-223 option B)

**Signed by Ajay (cbe17ce), 12 Oct 2026 IST: `handoff/legal/T-223-verify-email-signed.md`. Where this file and his differ, his wins.** Rows marked "Signed" are his exact strings. Rows still marked "Ajay to check" are alternates he did not sign.

Madhuri, 12 Oct 2026. **Signed by Ajay; Meera's sign-off still needed.** Sources: `handoff/tickets/T-223-email-verification-decision.md` (decision and Arjun's AC shape), `handoff/tickets/T-225-email-content-rules.md` (AC1a to AC1c), `copy/emails.md` section 3 (earlier draft of the email, which this file replaces for wording), `copy/login-page-t234.md` (tone).
Rules used: plain English, no "AI", no time or outcome claims, no "free" without "5 Ink", no "secure", "safe" or "encrypted", no offer, no marketing, no case details, name in the greeting only. Char counts are for the final string; `{name}`, `{masked}`, `{X}` and `{verifyUrl}` are counted as written.

## When the prompt appears (T-223 decision, Arjun's AC 3)

- Email and password sign-ups only. Google sign-ups count as verified: no email, no prompt.
- T-351 and Ajay's signed claim: an email sign-up gets no sign-up Ink until the address is verified (the 5 Ink are granted on verification). ~~No daily bonus until then either.~~ (withdrawn, AJ-646-M9b) So the verify modal replaces the paywall whenever the Ink refusal hits an unverified email user. The prompt appears (1) on sign-in (banner), (2) when a draft is refused for lack of Ink, and (3) at checkout. A verified user, or a Google user, who runs out of Ink still gets the normal paywall copy.
- ~~The daily bonus may not exist at v1. If it ships, add "or get the daily login bonus" back after Ajay agrees.~~ Withdrawn, AJ-646-M9b: the daily login bonus was never a real offer. Do not add it back.

## A. The email (`auth.verifyEmail`)

Transactional: no consent needed, no unsubscribe link (T-225 AC1b). No draft title, document type, party or case detail (AC1a). Open and click tracking off. The disclaimer is included because the body mentions drafting.

| Part | Copy | Chars | Ajay to check |
| --- | --- | --- | --- |
| Subject (recommended) | Verify your Lawie email | 23 | Signed |
| Subject B (alternate, not signed) | Confirm your email for Lawie | 28 | Ajay to check |
| Subject C (alternate, not signed) | Verify your email address for Lawie | 35 | Ajay to check |
| Preheader | This link works once and expires in 24 hours. | 45 | Signed |
| Greeting | Hello {name}, | 13 | Signed |
| Body | Please verify your email address for your Lawie account. You need a verified email to receive your 5 sign-up Ink and to buy Ink. | 128 | Signed |
| Button (recommended) | Verify email | 12 | Signed |
| Button B (alternate, not signed) | Confirm your email | 18 | Ajay to check |
| Button C (alternate, not signed) | Verify my email | 15 | Ajay to check |
| Expiry line | This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one. | 95 | Signed |
| Link fallback | If the button doesn't work, copy this link into your browser: | 61 | Signed |
| Not-you line | Didn't create a Lawie account? Ignore this email: without this link, nothing is verified. To have the account removed, write to privacy@lawie.in. | 145 | Signed |
| Help line | Need help? Write to contact@lawie.in. | 37 | Signed |
| Disclaimer (exact) | Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | 89 | Signed |
| Sign-off | Team Lawie | 10 | Signed |
| Footer line 2 (this email only) | You are receiving this because this address was used to create a Lawie account. | 79 | Signed |

Subject and button: Ajay signed the recommended ones only. B and C are alternates and need his check before use. Not used: "One step left" (it hides that drafts and purchases wait for verification).

Body, in order:

```
Hello {name},

Please verify your email address for your Lawie account. You need a verified email to receive your 5 sign-up Ink and to buy Ink.

[Verify email]   -> {verifyUrl}

This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one.

If the button doesn't work, copy this link into your browser:
{verifyUrl}

Didn't create a Lawie account? Ignore this email: without this link, nothing is verified. To have the account removed, write to privacy@lawie.in.
Need help? Write to contact@lawie.in.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie

--
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because this address was used to create a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

The footer is T-225 AC1c, except line 2, which Ajay changed for this email only (the recipient may not be the person who signed up). `[registered address]` and `[PIN]` are the founder's placeholders: no send until filled. Plain-text version: the same text with `Verify email: {verifyUrl}` in place of the button.

Claims (all signed by Ajay; kept for the build check):

| Line | Basis |
| --- | --- |
| "You need a verified email to receive your 5 sign-up Ink and to buy Ink." | T-351: no sign-up Ink until verified (`grantSignupBonus` runs on verification). If the build changes back to "first draft open", these lines go back to Ajay |
| "works once and expires in 24 hours" | Arjun's AC shape: signed, single-use, 24 h. Confirm against the T-223 AC when written |
| "sign in and ask for a new one" | Needs the Resend button (part B) |
| "Without this link, nothing is verified." | True while an unused link verifies nothing |
| Disclaimer | Ajay's exact line; T-225 AC1c |
| "To have the account removed, write to privacy@lawie.in." | Ajay's answer on the not-you line |

## B. In-app prompt

Signed by Ajay with three changes (Place 1, Place 2 title and Place 2 body, as below). All other rows are approved as drafted. Flag for Priya, not blocking: a password sign-up made with someone else's address leaves an unverified account holding that email; Ajay recommends a ticket to delete unverified email accounts after 30 days.

Masked address: the first character, then `***`, then the domain, e.g. `a***@gmail.com`. For a one-character name before the `@`, show that character and `***`. Never show the full address in the prompt.

| Part | Copy | Chars |
| --- | --- | --- |
| Title (default) | Verify your email | 17 |
| Title, alt | Please verify your email | 24 |
| Body (default) | We sent a verification link to {masked}. Open it to verify your email. | 70 |
| Button | Resend email | 12 |
| State: sent | Email sent to {masked}. Check your inbox and your spam folder. | 62 |
| State: resend limit | Try again in {X} minutes. | 25 |
| State: resend limit, X = 1 | Try again in 1 minute. | 22 |
| State: expired | This link has expired. Send a new one. | 38 |
| State: invalid or used (extra) | This link is not valid or has already been used. Send a new one. | 64 |
| State: already verified | Your email is already verified. | 31 |
| State: verified | Your email is verified. You can continue. | 41 |
| State: network error | Couldn't send the email. Check your connection and try again. | 61 |
| Place 1, on sign-in (banner) | Verify your email. You need it to receive your 5 sign-up Ink and to buy Ink. We sent a link to {masked}. | 104 |
| Place 2, draft refused for lack of Ink: title | Verify your email to continue | 29 |
| Place 2, draft refused for lack of Ink: body | Verify your email to receive your 5 sign-up Ink. We sent a link to {masked}. | 76 |
| Place 3, checkout: title | Verify your email before you buy | 32 |
| Place 3, checkout: body | We sent a link to {masked}. Verify your email, then come back to buy Ink. | 73 |

Notes:
- The three short variants (Place 1, 2, 3) use the same Resend button and states as the default prompt. Place 1 is a banner, not a modal.
- "Resend limit": `{X}` comes from the server's remaining wait, rounded up. Use "1 minute" when X is 1.
- "You can continue" after success: the app returns the user to what they were doing (the draft or the checkout).
- No state promises delivery time ("within a minute") and none says the email is safe or secure.

## Open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | Alternates B and C for subject and button (not signed) | Ajay |
| 2 | 24 h, single-use and resend limit against the final build; if the build goes back to "first draft open", the trigger lines return to Ajay | Priya |
| 3 | ~~Daily login bonus: in or out at v1~~ Withdrawn, AJ-646-M9b: never a real offer | ~~Priya, Vikram~~ |
| 4 | Footer address and PIN | founder |
| 5 | Meera's sign-off | Meera |


## Additions for Ajay (13 Oct)

Mahak built T-223 and found three missing strings. The signed strings above are unchanged. The two extra rows (`_retry`, `_cta`) are the button labels that go with strings 2 and 3.

| Key | Where | Copy | Chars | Ajay to check |
| --- | --- | --- | --- | --- |
| `verify.limit_ready` | Screen-reader live region, announced when the resend wait ends and the Resend button is back | You can resend the email now. | 29 | Ajay to check |
| `verify.landing_error` | Landing page, server or network failure (not an expired link): message | We couldn't verify your email just now. Please try again. | 57 | Ajay to check |
| `verify.landing_error_retry` | Landing page, same state: retry button label | Try again | 9 | Ajay to check |
| `verify.landing_expired_signed_out` | Landing page, expired link, signed-out user: line | This link has expired. Sign in to send a new one. | 49 | Ajay to check |
| `verify.landing_expired_signed_out_cta` | Landing page, same state: button label | Sign in | 7 | Ajay to check |

Notes:
- `verify.landing_error` says "just now" and "try again" and does not say "expired" or "link", so it cannot be read as an expired link. It makes no time or security claim.
- `verify.landing_expired_signed_out`: resending needs sign-in, so the button goes to sign-in. After sign-in the signed "Resend email" prompt applies.

Meera's decisions, recorded (13 Oct):
1. The close button's aria-label stays "Close".
2. The countdown shows rounded-up minutes ("Try again in {X} minutes", and "Try again in 1 minute."). The signed copy wins over the spec's mm:ss.
3. No extra Continue button: the success and already-verified states close with the close button.
