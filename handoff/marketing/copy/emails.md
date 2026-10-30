# Transactional emails: welcome, forgot password, verification

Madhuri, 12 Oct 2026. **Draft. Not for publishing, not for build.** Goes to Ajay (every line tagged `for Ajay`), then Meera. Sources: T-222 (welcome, Ajay's signed changes 1 to 7), T-221 (reset, Ajay-approved final), T-223 (verification, option B), T-225 (footer, rules), `handoff/legal/T-238-pricing-page-lines-signed.md`, `handoff/legal/marketing-s1-claims-signed.md`, `handoff/marketing/strategy.md`.

Rules applied: only the signed wording "Criminal drafts use BNS, BNSS and BSA section numbers" and "short documents". No "court-ready", "validated", "faster", no accuracy promise, no "free" without "5 Ink". No case, draft, ID or password in any email (T-225 AC1a). Transactional only: no offer, no unsubscribe link. Sender `Lawie <noreply@lawie.in>`.

Words in `{braces}` are data the template fills in. `{freeInk}` reads `SIGNUP_BONUS_CREDITS` (5), never hard-coded. Counts are characters including spaces.

Marker: **[for Ajay]** = a line that makes a claim. Lines without it carry no claim.

## Shared footer (all emails, verbatim from T-225 AC1c)

```
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

[for Ajay] Risk carried from T-225: `[registered address]` and `[PIN]` are placeholders. No send until the founder fills them. Footer line 2 ("because you have a Lawie account") is a claim for password sign-ups the user may not have made; see the not-you line in email 3 and the welcome email.

---

## 1. Welcome email (`auth.welcome`)

Sent once per user: email sign-up, or first Google sign-in. One template for everyone (Ajay change 6: neutral step 1).

### 1a. English

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Welcome to Lawie, {name} | 24 with "{name}" |
| Preheader | You have {freeInk} free Ink. Here's how to start. | 41 with "5" |
| Button (A, recommended) | Start your first draft | 22 |

Subject variants: A above · B "Your Lawie account is ready" (27) · C "Welcome to Lawie" (16)
Button variants: A above · B "Open Lawie" (10) (variant C "Sign in with Google" is retired)

Claims in the table: **[for Ajay]** preheader "You have 5 free Ink" (the amount; "free" sits next to "5 Ink", per Ajay's rule). Subject and button carry no claim.

Body (HTML email; the button is `[...]`):

```
Hello {name},

Welcome to Lawie. Your account is ready.

Lawie helps you prepare a first draft for you to review, so you spend less time copying from old files. You can draft bail applications, legal notices, agreements and other documents. Criminal drafts use BNS, BNSS and BSA section numbers.

You have {freeInk} free Ink to try it. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. If you signed up with email and password, verify your email address before your second draft.

How to start:
1. Sign in to Lawie and pick a document.
2. Answer a few questions about the matter.
3. Review the draft, edit it, and download it.

[Start your first draft]   -> {loginUrl}

Need help? Write to contact@lawie.in and we will get back to you.

Didn't create a Lawie account? Write to contact@lawie.in and we will look into it.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie
```

Line-by-line claims:

| Line | Tag |
| --- | --- |
| "Your account is ready." | **[for Ajay]** true for password users only because T-223 option B lets the first draft run unverified. If T-223 changes, this comes back. |
| "Lawie helps you prepare a first draft for you to review, so you spend less time copying from old files." | **[for Ajay]** Ajay's signed change 3, verbatim. |
| "You can draft bail applications, legal notices, agreements and other documents." | **[for Ajay]** Ajay's signed change 3 (families live and free on `develop_staging`, T-222 check). |
| "Criminal drafts use BNS, BNSS and BSA section numbers." | **[for Ajay]** T-238 final wording. Ajay's change 3 in T-222 said "Criminal drafts use BNS, BNSS and BSA."; T-238 (12 Oct) replaces it. I used T-238. |
| "You have {freeInk} free Ink to try it." | **[for Ajay]** amount must equal `SIGNUP_BONUS_CREDITS`. Unit "Ink" per Ajay's change 4. |
| "Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1." | **[for Ajay]** T-238 FAQ wording, cut to its first two sentences. This replaces T-222's "Each draft uses 1 or 2 Ink" so the email and the pricing page say the same thing. It is a swap of a signed line for a signed line; please confirm. True only once T-227 merges. |
| "verify your email address before your second draft" | **[for Ajay]** Ajay's change 5 (T-223 option B), verbatim. Comes back if T-223 changes. |
| "Need help? ..." and "Didn't create a Lawie account? ..." | **[for Ajay]** Ajay's recommended change 7, verbatim. A reply promise ("we will get back to you"). |
| Disclaimer line | Verbatim, mandatory (T-225 AC1c). Kept in the body, not only in small print. |

Left out on purpose: "charged only after a draft is generated; a failed generation is not charged" (not needed here; it lives on the pricing page, and `Ajay` said "succeeds"/"ready" must not appear); "Lawie shows the cost before you start" (T-227 AC3 not shipped); "court-ready", "faster", "in minutes", "validated".

Plain-text version (send as the `text/plain` part; same words, no formatting):

```
Hello {name},

Welcome to Lawie. Your account is ready.

Lawie helps you prepare a first draft for you to review, so you spend less time copying from old files. You can draft bail applications, legal notices, agreements and other documents. Criminal drafts use BNS, BNSS and BSA section numbers.

You have {freeInk} free Ink to try it. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. If you signed up with email and password, verify your email address before your second draft.

How to start:
1. Sign in to Lawie and pick a document.
2. Answer a few questions about the matter.
3. Review the draft, edit it, and download it.

Start your first draft: {loginUrl}

Need help? Write to contact@lawie.in and we will get back to you.

Didn't create a Lawie account? Write to contact@lawie.in and we will look into it.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie

--
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

### 1b. Hindi (हिंदी)

Same structure and same claims as 1a, nothing added. Everyday Hindi in Devanagari; Ink, BNS, BNSS, BSA, bail, email and the product name stay in English, as advocates use them. **[for Ajay]** The whole Hindi version is a translation of Ajay-signed English lines. Please confirm the translation says no more than the English, in particular "section numbers" (धाराओं के नंबर) and the disclaimer (his exact English line is kept in English first, with Hindi after, so the signed wording stays in the email).

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Lawie में आपका स्वागत है, {name} | 32 with "{name}" |
| Preheader | आपके पास {freeInk} Ink मुफ़्त हैं। शुरू करने का तरीका यहाँ है। | 54 with "5" |
| Button (A, recommended) | पहला ड्राफ्ट शुरू करें | 22 |

Subject variants: A above · B "आपका Lawie अकाउंट तैयार है" (26) · C "Lawie में स्वागत है" (19)
Button variants: A above · B "Lawie खोलें" (11)

Body:

```
नमस्कार {name},

Lawie में आपका स्वागत है। आपका अकाउंट तैयार है।

Lawie आपको समीक्षा के लिए पहला ड्राफ्ट तैयार करने में मदद करता है, ताकि पुरानी फ़ाइलों से कॉपी करने में कम समय लगे। आप bail application, legal notice, agreement और दूसरे दस्तावेज़ ड्राफ्ट कर सकते हैं। आपराधिक ड्राफ्ट में BNS, BNSS और BSA की धाराओं के नंबर इस्तेमाल होते हैं।

आज़माने के लिए आपके पास {freeInk} Ink मुफ़्त हैं। ज़्यादातर दस्तावेज़ों में 2 Ink लगते हैं; छोटे दस्तावेज़, जैसे ज़्यादातर notice और affidavit, में 1 Ink लगता है। अगर आपने ईमेल और पासवर्ड से साइन अप किया है, तो दूसरा ड्राफ्ट बनाने से पहले अपना ईमेल पता verify करें।

शुरू कैसे करें:
1. Lawie में साइन इन करें और दस्तावेज़ चुनें।
2. मामले के बारे में कुछ सवालों के जवाब दें।
3. ड्राफ्ट पढ़ें, ज़रूरत हो तो बदलें, और डाउनलोड करें।

[पहला ड्राफ्ट शुरू करें]   -> {loginUrl}

मदद चाहिए? contact@lawie.in पर लिखिए, हम आपको जवाब देंगे।

आपने Lawie अकाउंट नहीं बनाया? contact@lawie.in पर लिखिए, हम इसकी जाँच करेंगे।

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.
Lawie एक ड्राफ्टिंग सहायक है। कानूनी सटीकता और फ़ाइलिंग की ज़िम्मेदारी advocate की है।

Team Lawie
```

Hindi plain-text version: the same text as the Hindi body, with the button line as `पहला ड्राफ्ट शुरू करें: {loginUrl}`, followed by the shared footer (English; footer is verbatim from T-225 and stays in English).

[for Ajay] The Hindi disclaimer line ("कानूनी सटीकता ... की ज़िम्मेदारी advocate की है") is my translation of the signed disclaimer, shown beside the signed English. If you want the Hindi version to carry the English line only, delete the second line.

---

## 2. Forgot-password email (`auth.passwordReset`)

Text is the Ajay-approved final in T-221 ("Copy (Madhuri, final, 11 Oct 2026)", signed 11 Oct, night), unchanged. Two variants: E1 for an account with a password, E2 for a Google-only account. Neither mentions drafting, so no drafting disclaimer. No greeting by name, no name anywhere (T-225 AC1a). Tracking off. To the account's own address only.

Conditions Ajay set on T-221 still apply: the "signed out" sentences stay only if AC3 ships with a test; the four-rule checklist on the reset page only if the server enforces it; no send until the footer address is filled.

### E1: account has a password

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Reset your Lawie password | 25 |
| Preheader | This link works once and expires in 30 minutes. | 47 |
| Button (A, recommended) | Set a new password | 18 |

Subject variants: A above · B "Your Lawie password reset link" (30) · C "Set a new Lawie password" (24)
Button variants: A above · B "Reset password" (14) · C "Choose a new password" (21)

Body:

```
Reset your password

We got a request to reset the password for your Lawie account.

[Set a new password]   -> {resetUrl}

This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.

If the button doesn't work, copy this link into your browser:
{resetUrl}

Didn't ask for this? Ignore this email. Your password stays the same.

Never share this link. Lawie will never ask for your password by email or phone.

Team Lawie
```

Claims, all **[for Ajay]** (already approved in T-221, listed for the record):

| Line | Basis |
| --- | --- |
| "works once", "expires in 30 minutes" | `auth.service.ts:155`, `:175` per Ajay |
| "you will be signed out on your other devices" | only if AC3 ships, with a test |
| "Lawie will never ask for your password by email or phone" | promise about our own conduct, kept by Ajay |
| "Your password stays the same" | true if the link is not used |

Plain-text version:

```
Reset your password

We got a request to reset the password for your Lawie account.

Set a new password: {resetUrl}

This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.

Didn't ask for this? Ignore this email. Your password stays the same.

Never share this link. Lawie will never ask for your password by email or phone.

Team Lawie

--
(shared footer)
```

### E2: Google-only account asked for a reset

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Sign in to Lawie with Google | 28 |
| Preheader | Your account uses Google sign-in. No password to reset. | 55 |
| Button (A, recommended) | Go to sign in | 13 |

Subject variants: A above · B "Your Lawie account uses Google sign-in" (38) · C "Signing in to Lawie" (19)
Button variants: A above · B "Open Lawie sign-in" (18) · C "Open Lawie" (10)

Body:

```
Your account uses Google sign-in

We got a request to reset the password for your Lawie account. Your account signs in with Google, so it has no Lawie password to reset.

To get in, open Lawie and choose "Continue with Google".

[Go to sign in]   -> {loginUrl}

Didn't ask for this? Ignore this email. Nothing has changed on your account.

Team Lawie
```

**[for Ajay]** "so it has no Lawie password to reset" and "Nothing has changed on your account": approved in T-221 item 7; unchanged. The button name "Continue with Google" must match the live login button (checked against `login/page.tsx` on 11 Oct).

Plain-text version: same text, with `Go to sign in: {loginUrl}` in place of the button, then the shared footer.

---

## 3. Verification email (`auth.verifyEmail`)

New. Sent on email and password sign-up only (Google counts as verified; no email). T-223 option B: the first draft works without verification; the second draft and checkout need it (~~the daily login bonus~~ withdrawn, AJ-646-M9b). T-223 AC text is not written yet, so every number below is a placeholder from T-223's "link (signed, single-use, 24 h expiry)" line. Resend is rate-limited; the web app's "verify your email" prompt and resend button have their own copy (not here).

Design choice: the email states what verification is for in one line, and does not say "to start using Lawie" (the first draft already works, so that would be untrue).

### 3a. English

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Verify your Lawie email | 23 |
| Preheader | This link works once and expires in 24 hours. | 45 |
| Button (A, recommended) | Verify email | 12 |

Subject variants: A above · B "Confirm your email for Lawie" (28) · C "One step left: verify your email" (32)
Button variants: A above · B "Confirm your email" (18) · C "Verify my email" (15)

Subject C says "One step left", which implies the account is blocked until verified. It is not (first draft is open). Recommend A or B; C is listed for completeness and I do not recommend it.

Body:

```
Hello {name},

Please verify your email address for your Lawie account. You need a verified email to make a second draft or buy Ink.

[Verify email]   -> {verifyUrl}

This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one.

If the button doesn't work, copy this link into your browser:
{verifyUrl}

Didn't create a Lawie account? Ignore this email, or write to contact@lawie.in. Without this link, nothing is verified.

Team Lawie
```

Claims, all **[for Ajay]**:

| Line | Basis / question |
| --- | --- |
| "You need a verified email to make a second draft or buy Ink." | T-223 option B as decided by the founder, 11 Oct. Must match the build exactly. ~~"get the daily login bonus"~~ withdrawn, AJ-646-M9b: never a real offer; silent accrual stopped (T-652). Must also match Ajay's change 5 in the welcome email. |
| "works once and expires in 24 hours" | T-223 build line (signed, single-use, 24 h). Confirm after T-223 AC is written. |
| "If it has expired, sign in and ask for a new one." | Needs the resend button to exist in the web app (T-223). |
| "Didn't create a Lawie account? Ignore this email ... nothing is verified" | Ajay's change 7 reasoning (a password account can be made with someone else's address); true as long as an unused link verifies nothing. |

No mention of drafting content, so no drafting disclaimer is required (the line is not a claim about drafting). No name beyond the greeting, no case, no ID.

Plain-text version:

```
Hello {name},

Please verify your email address for your Lawie account. You need a verified email to make a second draft or buy Ink.

Verify email: {verifyUrl}

This link works once and expires in 24 hours. If it has expired, sign in and ask for a new one.

Didn't create a Lawie account? Ignore this email, or write to contact@lawie.in. Without this link, nothing is verified.

Team Lawie

--
(shared footer)
```

### 3b. Hindi

Not requested; I did not write one. Add it if Meera wants Hindi on all three, after Ajay confirms the 3a claims.

---

## Open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | Confirm the swap of T-222's "Each draft uses 1 or 2 Ink" for T-238's "Most documents use 2 Ink; short documents ... use 1" | Ajay |
| 2 | Confirm "Criminal drafts use BNS, BNSS and BSA section numbers" replaces the T-222 change 3 wording | Ajay |
| 3 | Sign off Hindi version (translation of signed lines) | Ajay |
| 4 | Verification email: confirm 24 h, single-use, "second draft / buy Ink" (~~daily bonus~~ withdrawn, AJ-646-M9b) against the T-223 AC when written | Ajay, Priya |
| 5 | Footer `[registered address]` and `[PIN]` | founder |
| 6 | Ships after T-220 (sending) and T-227 (prices), and with T-223 for the verify line | Priya |
| 7 | Meera's sign-off before anything is published | Meera |
