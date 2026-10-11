# T-225 — What our emails may and may not contain

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Ajay (rules, signs), Arjun (heads-up), Madhuri (applies them to copy) |
| Mode           | Rule first (Ajay) |
| Status         | To do. Waits for Ajay |
| Size           | Ajay S |
| Depends on     | None |
| Gate           | Before any email copy is approved (T-221, T-222, T-224) |
| Branch         | None (rules only; any code change goes to the ticket that needs it) |
| Legal sign-off | Ajay signs in this file |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

The email provider is a third party. Our users are advocates whose matters are confidential, and DPDP applies to the user's own data.

## Acceptance criteria

1. Ajay writes and signs the rules: no case details, document content, client or party names in any email; which emails are transactional and need no consent; what the footer must carry (who we are, contact, privacy policy link, an unsubscribe for anything non-transactional).
2. Ajay says whether the privacy policy must name the email provider (as T-114 did for Helicone) and gives the line.
3. Ajay says whether BCI rules limit what we may say to advocates in a welcome email.

## Ajay sign-off (11 Oct 2026)

Applies to every email Lawie sends (T-221, T-222, T-224 and anything later). Madhuri writes copy inside these rules; anything outside them comes back to me.

### AC1a. What an email may never contain (Blocker if broken)

Basis: confidentiality of the advocate's matters (BCI Rules, Part VI, Ch. II, Rule 17 and BSA s.132 privilege, which the advocate owes and we must not undermine); DPDP Act 2023 s.8(4) and (5) (security safeguards, data minimisation in spirit); IT Act s.43A and SPDI Rules 2011, Rule 3 (passwords).

- No case details of any kind, in subject, preheader, body, alt text, link text, URL query strings or attachments: no client or party names, no opposite party, no court or bench, no case, FIR, CNR or complaint number, no BNS/BNSS/BSA or other section numbers tied to a matter, no facts, dates of offence or hearing, no excerpt of any draft or upload.
- No draft title, document type or template name (a "bail application ready" subject tells anyone who sees the inbox that the advocate has a criminal matter). Say "your draft" at most, and only if a future ticket gets my sign-off for a draft notice.
- No document content as an attachment or inline. No draft, upload or PDF of a draft is ever attached.
- No link that opens a draft or case without login. Links go to the app; the app checks the session.
- No password, ever, in any form. Reset is a single-use, expiring link (T-221 AC2).
- No Bar enrolment number, phone number, Aadhaar or other ID in any email. The advocate's name in the greeting is fine.
- No full card, UPI ID or bank details in billing emails. Amount, date, Razorpay payment id and an invoice link are fine; GST invoice fields per Vikram (CGST Rules 2017, Rule 46).
- Send only to the account's own address. No CC, BCC or forward to anyone else, including the advocate's clients.
- Open and click tracking OFF for all transactional mail (SES click tracking rewrites links, which would pass reset tokens through a tracking redirect). Logs and Sentry: template id and user id only (T-220 AC6).

### AC1b. Transactional (no consent) vs consent

Basis: DPDP Act s.7(a) (legitimate use: data the user gave for a purpose, used for that purpose) for transactional mail; s.6(1) and s.6(4) (consent must be specific, by clear affirmative action, and as easy to withdraw as to give) for everything else.

Transactional, no consent needed, no unsubscribe required:
- Password reset, and the "sign in with Google" notice for Google-only accounts (T-221)
- Email verification, if T-223 chooses it
- Welcome (T-222), provided it stays onboarding only: what Lawie does, free drafts, how to start, how to get help. One email, no follow-ups.
- Security notices (password changed, new sign-in, account deleted)
- Payment received / receipt, payment failed, balance low (T-224), provided they carry no offer, discount or upsell beyond a plain "top up" link
- Notice of a change to the Terms, Privacy Policy or refund policy

Needs prior opt-in consent and a working unsubscribe:
- Newsletters, product or feature announcements, tips, drip or re-engagement series, offers, discounts, referral asks, surveys and feedback requests
- Consent: a separate, unticked checkbox at sign-up or in settings, not bundled with accepting the Terms. Store yes/no, timestamp and the wording version. Unsubscribe is one click, no login, effective at once (and List-Unsubscribe / one-click header, which Gmail and Yahoo also require of bulk senders).
- A transactional email that adds promotional content becomes a marketing email. Don't mix.

### AC1c. Footer (every email)

- Who we are: "Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]". Risk: the address on `/contact` is still a placeholder; the founder fills it before T-220 goes live, and the footer uses the same text.
- Why you got this: "You are receiving this because you have a Lawie account." (marketing: "...because you chose to receive updates from Lawie.")
- Contact: contact@lawie.in (support), privacy@lawie.in (data and DPDP requests).
- Link to the Privacy Policy, https://lawie.in/privacy (and Terms).
- Unsubscribe link: required on every non-transactional email; not on transactional ones (it would imply security mail can be switched off).
- From: `Lawie <noreply@lawie.in>` is acceptable only because the footer gives a monitored reply address. Never send from a personal or advocate-looking name.
- Disclaimer, mandatory on the welcome email and on any email that mentions drafting: "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing."

### AC2. Privacy policy line for the email provider

Yes, it must be named. Today section 5 of `apps/web/src/app/(marketing)/privacy/page.tsx` says "Google Workspace (transactional email)", but the code default is Amazon SES (`apps/email-worker`, `AWS_REGION` default ap-south-1). If T-220 ships with SES the policy is wrong: Blocker for T-220 go-live (DPDP s.5 notice; Rule 3 of the DPDP Rules 2025 on itemised notice).

- If Arjun confirms SES (T-220 AC1), replace "AWS (hosting), and Google Workspace (transactional email)" with: "Amazon Web Services (hosting, and transactional email through Amazon SES in the Mumbai region), and Google Workspace (our own business email)". Drop "and Google Workspace (our own business email)" if Lawie does not use Google Workspace for its mailboxes.
- If Arjun picks SMTP through Google Workspace instead, the existing line stands; no change.
- Either way add to section 5: "Emails we send contain only your name, account and billing details. They never contain case details or document content."
- The change ships in T-220 (one-line web change, my sign-off is this entry); Madhuri does not reword it.

### AC3. BCI limits on the welcome email

Rule 36 (BCI Rules, Part VI, Ch. II) bars advocates from soliciting work or advertising; it binds the advocate, not Lawie. Our risk is copy that invites the advocate to breach it, or that overstates the product (Consumer Protection Act 2019 s.2(28) misleading advertisement; CCPA Guidelines on Misleading Advertisements 2022). The welcome email must not:

- Suggest Lawie helps get clients, grow a practice, build a brand, or market the advocate (no "win more clients", "stand out", "share your drafts to impress clients").
- Promise legal accuracy, court acceptance or outcomes ("court-ready", "error-free", "100% accurate", "win your case", "never get a filing rejected").
- Claim approval or endorsement by the Bar Council of India, any State Bar Council or any court, or call Lawie "BCI-compliant" or "approved".
- Call Lawie a lawyer, legal counsel or legal advice, or invite the advocate to let clients use it directly.
- Offer anything for referring clients or other advocates (no referral incentive in v1; a later referral programme comes to me first).
- Include testimonials or named advocates (no users yet; and a quoted advocate could be read as advocate advertising).
- Overstate the free allowance: the number of free drafts must match what the product grants on the day it ships (Vikram confirms).

The email may say: what Lawie drafts (by document family, accurately, matching live templates and states), that it uses BNS/BNSS/BSA, how many free drafts the user has, how to start, how to get help, and the disclaimer.

### Status of items

| Item | Mark |
| --- | --- |
| Content prohibitions (AC1a) | Approved as rules; Blocker on any copy that breaks them |
| Transactional vs consent (AC1b) | Approved |
| Footer (AC1c) | Approved; Risk: registered address is a placeholder |
| Privacy policy line (AC2) | Blocker for T-220 go-live if SES ships without the line change |
| Welcome email BCI limits (AC3) | Approved; I still check the T-222 copy itself |

Signed: Ajay (CLO), 11 Oct 2026. This is rule sign-off only; T-221, T-222 and T-224 copy still comes to me for a claims check (T-221 copy within these rules needs no separate sign-off, per that ticket).
