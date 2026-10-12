# Emails, waitlist consent and assistant panel (signed, 12 Oct 2026 IST)

Ajay (CLO). Read: `handoff/marketing/copy/emails.md`, `handoff/design/T-243-waitlist-form.md`, `handoff/design/T-253-assistant-panel.md`. Where this file and a draft differ, this file wins.

## 1. Emails (`emails.md`)

| Item | Mark |
|---|---|
| (a) Swap of T-222's "1 or 2 Ink" for "Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1." | Approved. It is the T-238 line; email and pricing page now say the same. True only once T-227 merges: the email does not ship before it |
| "Criminal drafts use BNS, BNSS and BSA section numbers." | Approved (T-238 final) |
| Welcome 1a, English: every tagged line | Approved as written. "Your account is ready" holds only while the first draft runs unverified (T-223 option B); the verify sentence holds only while T-223 is built that way |
| (b) Hindi welcome 1b | Approved. It says no more than the English: "धाराओं के नंबर" = section numbers, "ज़्यादातर" = most, "जवाब देंगे" = will get back to you. Keep the English disclaimer line first and the Hindi line after it. Keep "Ink", "BNS", "BNSS", "BSA" in English |
| Forgot-password E1 and E2 | Approved, as in T-221. Still conditional: "signed out on your other devices" only with the session-revoke test; the reset page must answer the same way whether or not an account exists ("If an account exists for that address, we have sent a link"), since E2 tells a Google-only user what their account uses (only ever to the account's own address) |
| (c) Verification email 3a | Approved as a draft. "Second draft, daily bonus, buy Ink", "24 hours" and "single-use" are placeholders: each must equal what T-223 builds, and any clause for a feature not live at v1 (the daily bonus) is deleted. Subject C ("One step left") is rejected: it implies the account is blocked, which it is not |
| Footer | Approved, with the address and PIN filled by the founder before any send. Line 2 ("because you have a Lawie account") is acceptable because every email carries a not-you line or goes to the account's own address |
| Hindi verification email | Not requested; if written, it comes back to me |

## 2. Waitlist form (T-243)

**Consent line (English, exact):**

`I agree that Lawie may store my name, email and the other details I enter here, and contact me about getting access to Lawie, by email and, if I gave a number, by phone or WhatsApp. I can withdraw this at any time by writing to privacy@lawie.in, and Lawie will delete my details.`

**Under the checkbox (small text, exact):** `We also record the link or campaign you came from. Where your details are stored and who receives them is in the Privacy Policy.` then the link "Privacy Policy" to `/privacy`, then `To remove your details, write to privacy@lawie.in from the email address you gave.`

**Hindi (optional, shown under the English, `lang="hi"`):**

`मैं सहमत हूँ कि Lawie मेरा नाम, ईमेल और यहाँ भरी गई अन्य जानकारी सहेज सकता है, और Lawie तक पहुँच के बारे में मुझसे संपर्क कर सकता है: ईमेल से और, अगर मैंने नंबर दिया है, तो फ़ोन या WhatsApp से। मैं कभी भी privacy@lawie.in पर लिखकर यह सहमति वापस ले सकता/सकती हूँ, और Lawie मेरी जानकारी हटा देगा।`

**Success card:** Rajesh's text is approved, and add one line under it: `To remove your details, write to privacy@lawie.in.`

**Conditions before the form goes live:**

1. **The Privacy Policy must mention the waitlist.** It does not today. Add to §2 (what we collect) a bullet: `- Waitlist details: if you join the waitlist, your name and email, the phone number, city and practice area if you give them, and the link or campaign you came from.` Add to §9 (how long): `- Waitlist details: until you ask us to delete them.` Both are signed here; update the "last updated" date.
2. **A deletion can be run.** Arjun confirms an entry (and nothing else) can be erased by hand on request, and that no copy of the email is kept after (same rule as the T-235 erase runbook). If not, the "Lawie will delete my details" sentence is false.
3. No personal data in logs or in Sentry (Rajesh's item 7).
4. Follow-up for Priya: set a retention period for an entry nobody has written to (I suggest 18 months) and tell me; until then "until you ask us to delete them" is the signed wording.
5. Rajesh's draft strings (heading, errors, success, rate limit) carry no claim and are approved from my side; Meera signs the rest. Practice-area list is not mine.

## 3. Assistant panel (T-253d)

Everything Rajesh lists as "needs Ajay" is already signed in `T-253-assistant-scope-signed.md`, Addendum of 12 Oct. Use those exact strings, not the draft ones in his §3 and §7:

| Panel state | Signed text |
|---|---|
| Daily cap | `You've reached today's message limit. It resets tomorrow.` |
| Monthly cap | `You've reached this month's assistant limit. It resets on {date}.` (no ₹ figure) |
| Cool-down | `The assistant is paused on your account until {time, date}. If you think this is a mistake, write to contact@lawie.in.` |
| Unavailable (`paused`, `budget`) | `The assistant isn't available right now. Please try again later.` Never "budget", "cost" or "cap" |
| Report dialog body (the 90-day line) | `We'll keep this question and answer, and the conversation around it, for 90 days so we can review it. Deleting the conversation won't remove this copy.` |
| Hindi line under a Hindi answer | the English per-answer line stays, then `यह legal information है, legal advice नहीं। भरोसा करने से पहले bare act देख लें।`. The panel footer stays English only |
| Client-names notice | stays visible while the paste box holds text, as well as when both boxes are empty (his open item 2: approved) |

- **Out-of-scope refusal:** the panel uses my R1, word for word: `I can help with Indian law and legal practice, with using Lawie, and with wording for one paragraph of your draft. I can't help with that.` The quoted "I can only help with law and Lawie" is not a signed line and must not appear.
- Free-plan locked card: title and numbers line are mine and exact (`Lawie's assistant is included with Solo and Pro.` and `Solo: 30 messages a day. Pro: 60 a day.`). The CTA text and any extra line come from Meera and return to me; never "unlimited", no teaser answers.
- Prompt chips: none may ask for case law, a time limit or an outcome (his rule). "Explain the difference between BNSS 480 and CrPC 437" is fine: the pair is in my signed tables.
- "Copy paragraph" (not "Use this paragraph"): approved. Copies the wording block only, markers kept.
- Delete-conversation dialog ("This can't be undone."): approved.
- Entry points before launch: hide them when `chat.enabled` is false (his risk 6): agreed.

## Addendum 1 (12 Oct 2026 IST): §9 waitlist retention (T-284)

Priya set 18 months for an untouched entry (T-243). This replaces the §9 bullet in item 1 above; the §2 bullet is unchanged.

`- Waitlist details: until you ask us to delete them, and in any case no more than 18 months after you joined or we last wrote to you, whichever is later.`

Condition: the line is true only if an entry really is erased at 18 months (by job or by hand, Arjun). Until that exists, ship the item 1 wording instead.
