# T-235: Privacy Policy text (signed)

Ajay (CLO), 12 Oct 2026 IST. Read: T-235 with "Facts from Arjun" (862a289); today's `apps/web/src/app/(marketing)/privacy/page.tsx` ("Last updated: 1 June 2026"); T-225 AC2 (email provider line); T-234 consent line.

Law: Digital Personal Data Protection Act, 2023 (DPDP), s.5 notice, s.8 duties, s.11 to s.14 rights, s.16 transfer outside India; DPDP Rules, 2025 (itemised notice). Until DPDP's obligations commence in full, IT Act s.43A and the SPDI Rules, 2011 still apply; this text meets both.

## How to apply

- The lead replaces the page body with the intro and eleven sections below, **word for word**. Headings become the "On this page" list.
- `Last updated:` the merge date.
- Where the text depends on an unconfirmed fact, it is written so it stays true either way ("may be ... outside India"). Ship it as is. When the founder confirms a fact, I give the narrower line; nothing waits on him.
- **Bump `termsVersion`: yes.** This corrects material statements (cookies, encryption, deletion). Send existing users the "change to the Privacy Policy" email, which is transactional under T-225.

## The five false claims on today's page

| # | Today | Fixed by |
|---|---|---|
| 1 | Cookies keep you signed in | §6 (browser storage, no cookies) |
| 2 | Case details encrypted at rest | §4 (drafts and briefs encrypted; form answers and fact list not) |
| 3 | You may delete documents and account | §7, §9 (by request to privacy@lawie.in; no in-app delete yet) |
| 4 | Sentry, Redis Cloud, transfers abroad not named | §5 |
| 5 | Backups implied by "managed cloud" | §3 (no backups; keep your own copy) |

## Signed text

**Intro.** This policy explains what Lawie collects, why, where it goes, and your rights under the Digital Personal Data Protection Act, 2023. We collect only what we need to create your drafts and run the Service. We do not sell personal data and we do not use it for advertising.

**1. Information We Collect**
- Account details: your name and email; your password, stored only as a one-way hash; and, if you sign in with Google, the name, email and Google account ID Google shares with us. We do not receive or keep your Google password, your profile picture or Google's sign-in tokens.
- Professional details you choose to give: phone number, Bar Council, enrolment number, state, practice areas and years of practice.
- Plan, Ink balance, payments and referrals.
- Case details you enter to create a draft: your answers to the form, your description of the matter, the brief, the list of facts Lawie builds from it, and the draft itself. These often contain personal data of your clients and of other parties.
- Technical data: IP address and browser details, kept with your sign-in session, and server logs.

**2. How We Use Information**
We use it to create the drafts you ask for, keep you signed in, take payments, send you service emails, prevent misuse, and fix errors. We use case details only to produce and show your drafts.

**3. Where Data Is Stored, and Backups**
- Our servers run on Amazon Web Services in Mumbai, India. Our database is MongoDB Atlas and our session store is Redis Cloud; these may store data outside India.
- We protect data with access controls and encrypted connections (HTTPS).
- **We do not currently keep backups of your data.** If our database is lost, your drafts may be lost with it. Download and keep your own copy of every document you need.

**4. Encryption of Your Documents**
Your drafts and briefs are encrypted in our database (AES-256). Your form answers and the list of facts Lawie builds from your matter are not yet encrypted in the same way; they are protected by the database's access controls. Enter only the case details the draft needs.

**5. Who Else Receives Data**
We share data only with these service providers, and only for the purpose shown:

| Provider | What it receives | Why | Where |
|---|---|---|---|
| Anthropic | Your form answers, description, brief and account name | Writes the draft | United States |
| Amazon Web Services | Everything we hold | Hosting; service emails (Amazon SES) | India (Mumbai) |
| MongoDB Atlas | Account data, case details, drafts | Database | May be outside India |
| Redis Cloud | Name, email, plan, IP address and browser details for your session | Keeps you signed in | May be outside India |
| Sentry | Error reports, which may include your name, email and IP address | Finding and fixing errors | May be outside India |
| Razorpay | Your account ID, email and payment details | Payments | India |
| Google | Your name, email and Google account ID (if you use Google sign-in); your IP address when our pages load Google Fonts | Sign-in; fonts | May be outside India |
| Helicone | Draft text sent before 9 October 2026 | Monitoring of AI requests (no longer used) | United States |

Data sent abroad is transferred as the DPDP Act, 2023 allows. Each provider handles it under its own terms; Helicone has the data sent to it before 9 October 2026 and we cannot have it deleted.

**6. Browser Storage (no cookies)**
Lawie does not set its own cookies. To keep you signed in, we store a sign-in token in your browser's local storage; it carries your name and email. We also store your referral code and small display settings in your browser. Signing out removes the sign-in token. Clearing your browser's site data removes all of it.

**7. Your Rights**
Under the DPDP Act, 2023 you may:
- ask for a summary of the personal data we hold about you and who we have shared it with;
- ask us to correct, complete or update it;
- ask us to erase your account, your documents, or both;
- nominate another person to exercise these rights if you die or cannot act;
- raise a grievance with us, and, if we do not resolve it, complain to the Data Protection Board of India.
Write to privacy@lawie.in from your account email. Lawie does not yet have a delete button; we erase on request. Erasure covers our database and session store; it cannot reach data already sent to Helicone (see §5) or copies you have downloaded.

**8. Your Clients' Data**
The case details you enter are yours and your clients'. You decide what to enter and are responsible for having the right to share it with Lawie. We process it only to create your drafts. Do not enter Aadhaar numbers, bank details, medical records or other information a draft does not need.

**9. How Long We Keep Data**
- Sign-in sessions: about 24 hours (7 days if you stay signed in).
- Records of changes to the fact list: 90 days.
- Everything else (account, case details, drafts): while your account exists, until you ask us to erase it.
- Server logs: until we delete them.

**10. Children**
Lawie is for practising advocates. We do not knowingly collect data from anyone under 18.

**11. Contact and Grievances**
Privacy questions, rights requests and grievances: privacy@lawie.in. General support: contact@lawie.in.

## Marks

| Item | Mark |
|---|---|
| Text above, as the s.5 notice | Approved |
| Ships before any of the founder's six confirmations | Acceptable: the fallback wording is true either way |
| "We erase on request" | Condition: before go-live, Arjun confirms a manual erase (Mongo user, documents, ledger, FactDiff; Redis keys) can actually be run. If not, §7's erasure line is false and this is a Blocker |
| No delete button (DPDP s.12) | Risk for v1; product follow-up for Priya: in-app delete |
| Sentry receiving email and name from gateway/drafting; Google Fonts sending IP | Disclosed in §5. Follow-ups for Priya: scrub Sentry headers; self-host the font. When fixed, I narrow §5 |
| Email provider | §5 names Amazon SES per T-225 AC2. If T-220 ships on Google Workspace SMTP instead, the AWS row reads "Hosting" and Google's row adds "service emails"; tell me and I sign that line |
| No backups | Disclosed in §3. Founder decision (M0 → paid tier) on his list |
| pm2 logs with no retention; email-worker logs recipients | §9 "until we delete them" is true but weak. Follow-up: rotation and a retention period, then I narrow §9 |

## Narrower lines once the founder confirms (not to ship before)

- Atlas or Redis region confirmed India → in §3 and §5 replace "may store data outside India" / "May be outside India" with "India (<city>)" for that provider.
- Sentry region confirmed → same for the Sentry row.
- Anthropic zero-retention agreement in place → add to the Anthropic row: "Anthropic does not keep it after the draft is written." Never before written confirmation.
- Backups introduced → I rewrite §3.
- Grievance Officer: §11 to name a person once the founder names one (SPDI Rules, 2011 r.5(9)).

Signed: Ajay (CLO), 12 Oct 2026 IST, on the erase condition above. Any other wording comes back to me.

## Erase runbook decisions (12 Oct 2026 IST)

Read: `handoff/tickets/T-235-erase-runbook.md` (03e6b10). Arjun confirmed a manual erase can be run, so the erase condition above is **met**.

| # | Question | Decision |
|---|---|---|
| Step 3 | Billing rows under a pseudonym enough? | Yes for `subscriptions`, `inkledger` and `creditledgers` payment rows: userId and Razorpay ids, no name or email. Usage rows: delete; blank `reference` where kept. **Tax invoices are different:** an invoice Lawie has issued is a record under CGST Act s.35 and must be kept as issued, unaltered, for the s.36 period (72 months from the due date of the annual return for that year), access-restricted and used for nothing else. DPDP erasure gives way to retention required by law |
| Step 3 | Does an invoice need name or email? | Email: never. Name, address and GSTIN: only where the invoice already carries them (a registered recipient, or a high-value supply to an unregistered one under CGST Rule 46). Vikram confirms what our invoices carry today; if Lawie issues no invoices of its own (Razorpay only), nothing extra is kept |
| Step 4 | Tombstone or hard delete? | Tombstone, as Arjun proposes. Condition: no hash, partial or copy of the email (or any other unset field) is kept anywhere, including to stop a repeat sign-up bonus |
| 2a | Delete reviewers' feedback on the user's drafts? | Yes, delete. It quotes the user's drafts |
| 2n | Keep `payment` and `account_delete` audit events? | Yes, as the erase record, holding only userId, event type and time. Strip IP, user agent, email or any other detail from them |
| 2o | Delete coupon usages? | Yes. The reset of the per-user limit is acceptable: an erased account cannot sign in again |
| Step 5 | Sentry by hand, outside §7? | Acceptable, with the §7 change below so the policy says what we do |

### Policy text changes (signed, word for word)

§7, the sentence "Erasure covers our database and session store; it cannot reach data already sent to Helicone (see §5) or copies you have downloaded." becomes:

`Erasure covers our database and session store, and we remove what we can find of your data in our error reports (Sentry). We keep payment records and any tax invoice for as long as tax law requires, without your name or email unless the invoice itself carries them. Erasure cannot reach data already sent to Helicone (see §5) or copies you have downloaded.`

§9, add as the last bullet:

`- Payment records and tax invoices: for as long as tax law requires (currently up to six years), even after you ask us to erase your account.`

Signed: Ajay (CLO), 12 Oct 2026 IST.

## Addendum: Atlas tier and region confirmed (Arjun, 14 Oct 2026, read-only Atlas API)

One cluster, M0, AWS Mumbai, no backups.
- Encryption: §3 rests on app-level encryption (T-115 decision 9). No change.
- Backups: still none, so §3 stands as written. "Backup copies are erased within 7 days" (T-115b/c) is true now. If the founder moves to a paid tier, Arjun sets 7-day retention before backups go on, and §3 comes back to me for the rewrite.
- Region: the Atlas swap in "Narrower lines" is now unlocked. In §3 and the §5 Atlas row, "may store data outside India" / "May be outside India" may become "India (Mumbai)" for Atlas only; Redis is unchanged. Not legally required (the current text is not false). Parked: ship it with the next privacy-page change (T-115c is fine). If the cluster ever moves region, the line goes back to the current text.
