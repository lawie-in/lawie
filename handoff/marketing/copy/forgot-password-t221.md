# T-221 Forgot password: final copy (screens and email)

**NEEDS AJAY before it is built.** Draft by Madhuri for Meera. Wording marked "Ajay, signed" is quoted from his claims check in `handoff/tickets/T-221-forgot-password-works.md` (11 Oct 2026, night); all variants there are approved. Rest is within T-225 and still needs his look.

Validity: **30 minutes** (code: `apps/auth/src/services/auth.service.ts:470`; ticket AC2). Merge fields: `{resetUrl}`, `{n}` (rate-limit minutes), `{email}` (shown only on screen 1, never in the email).

## Screen 1: /forgot-password (asks only for the email)

| Slot | Copy | Chars |
| --- | --- | --- |
| Title | Reset your password | 19 |
| Helper | Enter the email you use for Lawie. We'll send you a link to set a new password. | 79 |
| Field label | Email address | 13 |
| Button | Send reset link | 15 |
| Back link | Back to sign in | 15 |
| Sent: title | Check your email | 16 |
| Sent: body (same for every email) | If {email} has a Lawie account, we've sent it an email. It works once and expires in 30 minutes. | 96 + email |
| Sent: spam line | Not there? Check Spam and Promotions. | 37 |
| Rate limit | Too many requests. Please wait {n} minutes, then try again. | 59 |

Title variants: B "Forgot your password?" (21) · C "Can't sign in?" (14). Button: B "Email me a link" (15) · C "Continue" (8).
Ajay, signed: "Approved, any variant". "An email", not "a link", is deliberate: a Google-only account gets an email with no link, and a different line would reveal it.

## Screen 2: /reset-password/{token} (asks only for the new password)

Design has one password field with show/hide, no confirmation field (Rajesh R1 to R3).

| Slot | Copy | Chars |
| --- | --- | --- |
| Title | Set a new password | 18 |
| Field label | New password | 12 |
| Rule hint (matches `registerSchema`: min 8, A-Z, a-z, 0-9) | At least 8 characters · One capital letter (A-Z) · One small letter (a-z) · One number (0-9) | 4 lines |
| Button | Save new password | 17 |
| Success: title | Password changed | 16 |
| Success: line | You can now sign in with your new password. To keep your account safe, we've signed you out on all other devices. | 113 |
| Success: button | Sign in | 7 |
| Weak password | Your password needs everything in the list below. | 49 |
| Weak, one rule (pick the one unmet) | Use at least 8 characters to continue. / Add a capital letter to continue. / Add a small letter to continue. / Add a number to continue. | 25 to 38 |
| Link expired or used: title | This link no longer works | 25 |
| Link expired or used: body | Reset links work once and expire 30 minutes after we send them. If you already set a new password, sign in with it. | 115 |
| Link expired: buttons | Send a new link / Back to sign in | 15 / 15 |
| Network error | We couldn't reach Lawie. Check your connection and try again. | 61 |

The expired-link lines are about the link only. They never say whether an account exists.

## Email: auth.passwordReset

| Part | Copy | Chars |
| --- | --- | --- |
| Subject | Reset your Lawie password | 25 |
| Preheader | This link works once and expires in 30 minutes. | 47 |
| Button | Set a new password | 18 |

Subject: B "Your Lawie password reset link" (30) · C "Set a new Lawie password" (24). Button: B "Reset password" (14) · C "Choose a new password" (21).

Plain-text version (HTML is the same text, with the button in place of the link line):

```
Reset your password

We got a request to reset the password for your Lawie account.

Set a new password: {resetUrl}

This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.

Didn't ask for this? Ignore this email. Your password stays the same.

Never share this link. Lawie will never ask for your password by email or phone.

Team Lawie

--
Lawie (Sole Proprietorship), [Ajay to confirm footer address]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

Ajay, signed (E1 body): used exactly, no change. Restored by Meera; an earlier draft had reworded it.

## Unsigned or open, for Ajay

- Footer address: his T-225 footer has "Patna, Bihar" (GST State is Jharkhand; Priya flagged it). Not copied. No send until filled.
- His sign-off was conditional: "signed out on other devices" (screen 2 and email) only if T-221 AC3 ships; the four-rule hint only if the reset endpoint enforces it. No reset validator exists in `auth.validator.ts` yet, so today the hint would be untrue.
- Google-only email (E2) is unchanged from the signed ticket copy and not repeated here.
