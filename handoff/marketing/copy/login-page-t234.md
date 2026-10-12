# T-234: login page copy, email + password sign-up and sign-in

**Meera: please approve.** Nothing ships before your sign-off.

Owner: Madhuri (copy). Build: kunal (`feature/t-234-password-sign-up`). Source: Rajesh's design in `handoff/tickets/T-234-email-password-sign-up-in-the-web-app.md` (draft strings in quotes) and `apps/web/src/app/(auth)/login/page.tsx` as of 12 Oct 2026.
Rules used: plain English, peer to peer, no "AI" hype, no time or outcome claims, no "free forever", no feature promises Priya hasn't confirmed. Char counts are for the final string.

"(none)" in the Draft column means neither Rajesh's spec nor the page has a string there today. "Keep" means the draft is already right.

## 1. Headings and sublines

| # | Where | Draft | Final | Chars | Alternates |
| --- | --- | --- | --- | --- | --- |
| H1 | Heading, Sign in | "Sign in to Lawie" | Sign in to Lawie | 16 | "Welcome back" / "Sign in to your account" |
| H2 | Heading, Create account | "Create your Lawie account" | Create your Lawie account | 25 | "Join Lawie" / "Create your account" |
| H3 | Subline, Sign in | "Access your AI legal drafting workspace." (page today) | Welcome back. Sign in to continue drafting. | 43 | "Sign in to get back to your drafts." / "Good to see you again." |
| H4 | Subline, Create account | (none) | Set up your account and start your first draft. | 47 | "Takes a minute. Then start drafting." / "Start your first draft today." |

Why H3 changes: "AI legal drafting workspace" is AI hype and jargon. H4 makes no time claim and names no document type.

## 2. Mode switch (segmented control) and switch link

| # | Where | Draft | Final | Chars | Alternates |
| --- | --- | --- | --- | --- | --- |
| M1 | Tab 1 | "Sign in" | Sign in | 7 | n/a |
| M2 | Tab 2 | "Create account" | Create account | 14 | "Sign up" |
| M3 | Bottom link, Sign in mode | "New to Lawie? Create an account" (replaces "New advocate? Sign in with Google to create your account.") | New to Lawie? Create an account | 31 | "Don't have an account? Create one" |
| M4 | Bottom link, Create account mode | "Already have an account? Sign in" | Already have an account? Sign in | 32 | "Have an account? Sign in" |

Only the action words ("Create an account", "Sign in") are the link.

## 3. Google button and divider

| # | Where | Draft | Final | Chars | Alternates |
| --- | --- | --- | --- | --- | --- |
| G1 | Google button | "Continue with Google" | Continue with Google | 20 | Keep: matches Google's own button wording |
| G2 | Divider | "or with email" (page today: "or continue with email") | or with email | 13 | "or use your email" / "or" |

## 4. Fields, labels, placeholders

| # | Where | Draft | Final | Chars | Note |
| --- | --- | --- | --- | --- | --- |
| F1 | Name label (Create account only) | "Full name" | Full name | 9 | No placeholder |
| F2 | Email label | "Email address" (page today) | Email | 5 | Alt: "Email address" (13). Short label reads cleaner at 375 px |
| F3 | Email placeholder | "you@legalfirm.com" (page today) | (none, drop it) | 0 | Per Rajesh: most users are on Gmail |
| F4 | Password label | "Password" | Password | 8 | |
| F5 | Password placeholder | "••••••••" (page today) | (none, drop it) | 0 | Per Rajesh |
| F6 | Forgot password link (Sign in only, hidden until T-221 merges) | "Forgot password?" | Forgot password? | 16 | |
| F7 | Eye toggle `aria-label` | "Show password" / "Hide password" | Show password / Hide password | 13 / 13 | Screen reader only |
| F8 | Password rules, intro (Create account only) | (none) | Your password needs: | 20 | Alt: "Use at least:" |
| F9 | Rule 1 | "8+ characters" | At least 8 characters | 21 | Must mirror the API (T-208). Lead to confirm before build |
| F10 | Rule 2 | "one uppercase" | One capital letter (A–Z) | 24 | Alt: "One uppercase letter" (20) |
| F11 | Rule 3 | "one lowercase" | One small letter (a–z) | 22 | Alt: "One lowercase letter" (20) |
| F12 | Rule 4 | "one number" | One number (0–9) | 16 | |

F10/F11: "capital" and "small" letter are how most users say it; the (A–Z) / (a–z) removes any doubt. If Meera prefers the standard wording, use the alternates.

## 5. Buttons

| # | Where | Draft | Final | Chars | Alternates |
| --- | --- | --- | --- | --- | --- |
| B1 | Submit, Sign in | "Sign in" | Sign in | 7 | n/a |
| B2 | Submit, Create account | (none) | Create account | 14 | "Create my account" (17) |
| B3 | In flight, Sign in | "Signing in…" | Signing in… | 11 | |
| B4 | In flight, Create account | "Creating account…" | Creating your account… | 22 | "Creating account…" (17) |

## 6. Consent line (Ajay, final legal text: NOT changed)

| # | Where | Draft | Final | Chars |
| --- | --- | --- | --- | --- |
| C1 | Under submit, both modes | "By continuing, you agree to Lawie's Terms and Privacy Policy." (Rajesh) | By continuing, you agree to Lawie's [Terms of Service](/terms) and confirm you have read our [Privacy Policy](/privacy). | 98 (visible text) |

Word for word from Ajay's ruling of 11 Oct 2026 in the ticket. Rajesh's draft is superseded. Link text must be exactly "Terms of Service" and "Privacy Policy". No edits without Ajay's sign-off.

## 7. Referral box (Create account only) and referral modal

| # | Where | Draft | Final | Chars | Note |
| --- | --- | --- | --- | --- | --- |
| R1 | Box heading | "Have a referral code?" | Have a referral code? | 21 | |
| R2 | Code placeholder | "e.g. LAWIE2026" | Enter code | 10 | Alt: keep "e.g. LAWIE2026" only if that code is live. A sample code that fails looks like a bug |
| R3 | Apply button | "Apply" | Apply | 5 | |
| R4 | Apply, checking | "Checking…" | Checking… | 9 | |
| R5 | Code valid, with bonus | "Code accepted — {label}. {n} Ink credited on signup." | Code applied{ — label}. {n} Ink will be added when you create your account. | ~70 | Old line said "credited", but nothing is credited yet |
| R6 | Code valid, no number | "Ink bonus credited on signup." | Code applied. Bonus Ink will be added when you create your account. | 67 | |
| R7 | Code invalid | "Code not recognised or no longer active." | This code isn't valid or has expired. Check it and try again. | 61 | Alt: keep the draft (40). Build: `text-red-700`, not `red-500` |
| R8 | Modal eyebrow | "Referral offer" | Referral offer | 14 | |
| R9 | Modal title | "You've been invited!" | You've been invited | 19 | No exclamation, calmer |
| R10 | Modal benefit 1 | "{n} Ink credit added to your account on sign-in" | {n} Ink added to your account when you sign up | ~45 | "sign-in" was wrong for a new account |
| R11 | Modal benefit 2 | "Stacks with your free daily login bonus" | **Unchanged, needs Priya** | n/a | Is there a daily login bonus today? If not, delete the line |
| R12 | Modal benefit 3 | "No credit card required — start drafting immediately" | **Unchanged, needs Priya**; if confirmed: "No card needed to sign up." | 26 | Card-free sign-up must be confirmed before we say it |
| R13 | Modal CTA | "Claim offer" (replaces "Claim offer & continue with Google") | Claim offer | 11 | Alt: "Use this code" (13). Closes the modal and returns to the form (Priya decision 2) |
| R14 | Modal footnote | "Bonus applied automatically after sign-in" | Your bonus is added when you create your account. | 49 | |
| R15 | Modal close button `aria-label` | (none, icon only today) | Close | 5 | Build gap: the X has no label |

## 8. Error summary and messages

| # | Where | Draft | Final | Chars | Alternates |
| --- | --- | --- | --- | --- | --- |
| E1 | Summary heading (422, more than one message) | (none) | Please check the following: | 27 | "Fix these to continue:" / "A few things to fix:" |
| E2 | 422 body | API messages as a bullet list | API messages as a bullet list (T-208 text, not rewritten here) | n/a | |
| E3 | 409 extra link | "Sign in instead" | Sign in instead | 15 | |
| E4 | 401 line 1 | "Invalid email or password" | Email or password is incorrect. | 31 | Keep draft (25) |
| E5 | 401 line 2 | "Signed up with Google? Use Continue with Google above." | Signed up with Google? Use Continue with Google above. | 54 | |
| E6 | 403 | API message as is | API message as is | n/a | |
| E7 | 429, 5xx, network | "Couldn't reach Lawie. Check your connection and try again." | Couldn't reach Lawie. Check your connection and try again. | 58 | |
| E8 | Client: empty name | (none) | Enter your full name. | 21 | |
| E9 | Client: empty email | (none) | Enter your email. | 17 | |
| E10 | Client: bad email format | (none) | Enter a valid email, like name@gmail.com | 40 | "This email doesn't look right." |
| E11 | Client: empty password | (none) | Enter your password. | 20 | |

E1 shows only when there are two or more items; a single message (409, 401, 403, network) shows on its own with no heading.

## 9. Removed strings

| # | Where | Draft / today | Final |
| --- | --- | --- | --- |
| X1 | Amber notice banner | "Sign in with Google to continue." | Delete (Rajesh) |
| X2 | `alert()` | "Email/password login coming soon. Please use Google sign-in." | Delete (Rajesh, build) |

## Open for Meera / Priya

1. R11 and R12: Priya to confirm the daily login bonus and no-card sign-up, or the lines go.
2. Footer under the card still says "AI-assisted drafting tool — not a substitute for legal advice." with "Terms · Privacy". T-252 (Ajay signed) replaces that line site-wide with "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." Suggest the login page follows T-252. Not in this ticket's list, so not changed here.
3. F9–F12 must match the API rules exactly; lead to check `apps/auth` before build.

## Priya (12 Oct 2026)

- "Stacks with your free daily login bonus": drop it. The future of the daily bonus is still open (T-201, T-223), so the page must not promise it.
- "No credit card required": keep. Sign-up asks for no card.

## Meera sign-off (12 Oct 2026)

Approved as written: all "Final" strings in sections 1-9. Conditions:
1. Ajay checks R5, R6, R10, R12 and R14 (the offer and no-card lines) before release; they are public claims about Ink and sign-up. R11 stays deleted (Priya).
2. The login footer follows T-252: replace "AI-assisted drafting tool — not a substitute for legal advice." with Ajay's line "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." (approved, open item 2).
3. F9-F12 must match the API password rules exactly; the lead checks apps/auth before build.
4. When showing a referral line, the bonus applies to NEW accounts only; the lead confirms the code is applied on both email and Google sign-up.

Alternates: keep "Email or password is incorrect." (E4) and "Creating your account…" (B4). Nothing else changes.
