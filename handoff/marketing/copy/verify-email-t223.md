# Verify-your-email copy (T-223 option B)

Madhuri, 12 Oct 2026. **Draft for Ajay, then Meera. Not for build until both sign.** Sources: `handoff/tickets/T-223-email-verification-decision.md` (decision and Arjun's AC shape), `handoff/tickets/T-225-email-content-rules.md` (AC1a to AC1c), `copy/emails.md` section 3 (earlier draft of the email, which this file replaces for wording), `copy/login-page-t234.md` (tone).
Rules used: plain English, no "AI", no time or outcome claims, no "free" without "5 Ink", no "secure", "safe" or "encrypted", no offer, no marketing, no case details, name in the greeting only. Char counts are for the final string; `{name}`, `{masked}`, `{X}` and `{verifyUrl}` are counted as written.

## When the prompt appears (T-223 decision, Arjun's AC 3)

- Email and password sign-ups only. Google sign-ups count as verified: no email, no prompt.
- Priya's decision (T-351): an unverified email user has 0 Ink and gets no sign-up or daily bonus until the address is verified. So the verify modal replaces the paywall whenever the Ink refusal hits an unverified email user. The prompt appears (1) on sign-in, (2) on that Ink refusal, and (3) at checkout. A verified user, or a Google user, who runs out of Ink still gets the normal paywall copy.
- The daily bonus may not exist at v1 (open in T-201 and T-223). The email and the prompts therefore do not name it. If it ships, add "or get the daily login bonus" back after Ajay agrees.

## A. The email (`auth.verifyEmail`)

Transactional: no consent needed, no unsubscribe link (T-225 AC1b). No draft title, document type, party or case detail (AC1a). Open and click tracking off. The disclaimer is included because the body mentions drafting.

| Part | Copy | Chars | Ajay to check |
| --- | --- | --- | --- |
| Subject A (recommended) | Verify your Lawie email | 23 | Ajay to check |
| Subject B | Confirm your email for Lawie | 28 | Ajay to check |
| Subject C | Verify your email address for Lawie | 35 | Ajay to check |
| Preheader | This link works once and expires in 24 hours. | 45 | Ajay to check |
| Greeting | Hello {name}, | 13 | Ajay to check |
| Body | Please verify your email address for your Lawie account. You need a verified email to generate drafts or to buy Ink. | 116 | Ajay to check |
| Button A (recommended) | Verify email | 12 | Ajay to check |
| Button B | Confirm your email | 18 | Ajay to check |
| Button C | Verify my email | 15 | Ajay to check |
| Expiry line | This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one. | 95 | Ajay to check |
| Link fallback | If the button doesn't work, copy this link into your browser: | 61 | Ajay to check |
| Not-you line | Didn't create a Lawie account? Ignore this email. Without this link, nothing is verified. | 89 | Ajay to check |
| Help line | Need help? Write to contact@lawie.in. | 37 | Ajay to check |
| Disclaimer (exact) | Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | 89 | Ajay to check |
| Sign-off | Team Lawie | 10 | Ajay to check |

Subject and button variants: A is recommended. C ("Verify my email") is fine. Not used: "One step left" (it hides that drafts and purchases wait for verification).

Body, in order:

```
Hello {name},

Please verify your email address for your Lawie account. You need a verified email to generate drafts or to buy Ink.

[Verify email]   -> {verifyUrl}

This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one.

If the button doesn't work, copy this link into your browser:
{verifyUrl}

Didn't create a Lawie account? Ignore this email. Without this link, nothing is verified.
Need help? Write to contact@lawie.in.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie

--
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

The footer is verbatim from T-225 AC1c. `[registered address]` and `[PIN]` are the founder's placeholders: no send until filled. Footer line 2 for a password sign-up made with someone else's address: the not-you line above is the answer (Ajay to confirm). Plain-text version: the same text with `Verify email: {verifyUrl}` in place of the button.

Claims, all **Ajay to check**:

| Line | Basis |
| --- | --- |
| "You need a verified email to generate drafts or to buy Ink." | T-351 and Priya's T-223 decision: an unverified email user has 0 Ink until verified. Must match the build exactly |
| "works once and expires in 24 hours" | Arjun's AC shape: signed, single-use, 24 h. Confirm against the T-223 AC when written |
| "sign in and ask for a new one" | Needs the Resend button (part B) |
| "Without this link, nothing is verified." | True while an unused link verifies nothing |
| Disclaimer | Ajay's exact line; T-225 AC1c |

## B. In-app prompt

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
| Place 1, on sign-in (banner) | Verify your email. You need it to generate drafts or to buy Ink. We sent a link to {masked}. | 92 |
| Place 2, Ink refusal for an unverified email user: title | Verify your email to continue | 29 |
| Place 2, Ink refusal for an unverified email user: body | To generate a draft, verify your email. We sent a link to {masked}. | 67 |
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
| 1 | Sign off the email strings (every row in part A) | Ajay |
| 2 | 24 h, single-use, resend limit and the "generate drafts or buy Ink" trigger against the final T-223 AC | Ajay, Priya |
| 3 | Daily login bonus: in or out at v1 | Priya, Vikram |
| 4 | Footer address and PIN | founder |
| 5 | Meera's sign-off | Meera |
