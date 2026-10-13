# T-223: verify-your-email copy (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. Source: `handoff/marketing/copy/verify-email-t223.md` (Madhuri).

## Blocker, fixed below: the trigger claim

The draft says "You need a verified email to make a second draft or to buy Ink", and assumes the first draft is open. The current T-223 AC and T-351 say otherwise: email sign-ups get **no sign-up Ink until verified** (`grantSignupBonus` runs on verification), and the prompt shows when a draft is refused for lack of Ink. The copy must match the build, so the signed lines below follow the AC. If the build changes back to "first draft open", these lines come back to me.

## A. Email: approved strings (exact)

| Part | Text |
|---|---|
| Subject | `Verify your Lawie email` |
| Preheader | `This link works once and expires in 24 hours.` |
| Greeting | `Hello {name},` |
| Body | `Please verify your email address for your Lawie account. You need a verified email to receive your 5 sign-up Ink and to buy Ink.` |
| Button | `Verify email` |
| Expiry line | `This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one.` |
| Link fallback | `If the button doesn't work, copy this link into your browser:` |
| Not-you line (line 64) | `Didn't create a Lawie account? Ignore this email: without this link, nothing is verified. To have the account removed, write to privacy@lawie.in.` |
| Help line | `Need help? Write to contact@lawie.in.` |
| Disclaimer | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` |
| Sign-off | `Team Lawie` |
| Footer line 2 (this email only) | `You are receiving this because this address was used to create a Lawie account.` |

Notes:
- The other footer lines are as in T-225 AC1c. No send until `[registered address]` and `[PIN]` are filled.
- Footer line 2 changes for this email because the recipient may not be the person who signed up.
- Plain-text version: the same text, with `Verify email: {verifyUrl}` in place of the button.

## B. In-app prompt: approved, with these changes

| Part | Text |
|---|---|
| Place 1, banner on sign-in | `Verify your email. You need it to receive your 5 sign-up Ink and to buy Ink. We sent a link to {masked}.` |
| Place 2, draft refused for lack of Ink: title | `Verify your email to continue` |
| Place 2: body | `Verify your email to receive your 5 sign-up Ink. We sent a link to {masked}.` |

All other part-B rows are approved as drafted: title, body, button, every state, Place 3, and the masking rule.

## Flag for Priya (not blocking this copy)

A password sign-up made with someone else's address leaves an unverified account holding that person's email. Recommend a ticket to delete unverified email accounts after 30 days.

## Addendum 1 (13 Oct 2026 IST): three added in-app strings

Approved exactly as written in the copy file ("Additions for Ajay (13 Oct)"):
- `You can resend the email now.`
- `We couldn't verify your email just now. Please try again.` with button `Try again`
- `This link has expired. Sign in to send a new one.` with button `Sign in`

They make no time, security or outcome claims.
