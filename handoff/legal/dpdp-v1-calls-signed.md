# DPDP calls for v1: T-115 and T-358 (Ajay, CLO, 14 Oct 2026)

| Ticket | v1? | Must-fix or parked | Why |
|---|---|---|---|
| T-115: permanent delete and encryption of saved case details | **Yes** | Must-fix | Case details are a client's confidential matter and often hold sensitive personal data. Reasonable security safeguards are required under the IT Act, s.43A with the SPDI Rules, 2011, and under the DPDP Act, s.8(5). Erasure on request and once the purpose is served is required under DPDP s.8(7) and s.12. The commencement dates of the DPDP Rules are **verify**, but the duty to keep and erase this data safely does not wait on them. |
| T-358: delete never-verified accounts after 30 days | **No** | Parked | This is storage limitation under DPDP s.8(7), and good practice, but not a v1 blocker. Two conditions: an unverified account holds only an email and a password hash, with no case details and no drafts; and the Privacy Policy does not promise a deletion period. If either fails, it becomes v1. |

## Update (14 Oct 2026): T-358 moves to v1

Arjun's facts break my parking condition. An unverified account stores the name, IP, user agent and UTM tags, and it can create documents with case details. So **T-358 is v1, must-fix.** The daily sweep that erases accounts unverified for 30+ days is agreed, on two conditions:
- **Notice first.** Seven days before erasure, email the address given: `Please verify your email address. If it is not verified by {date}, we will delete your Lawie account and everything in it.`
- **Privacy Policy line, signed:** `If you do not verify your email address within 30 days of signing up, we delete your account and everything in it.`

Separately (parked, for Priya): unverified accounts can create documents, although the free Ink is tied to a verified email. That is a product question, not a legal one.

## T-115b and T-115c confirm dialogs (signed)

**T-115b: delete a document**
- Title: `Delete this document?`
- Body: `This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.`
- Buttons: `Delete document` / `Cancel`

**T-115c: close the account and erase it**
- Title: `Close your account and erase your data?`
- Body: `This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.`
- Buttons: `Close account and erase` / `Cancel`

Neither dialog says "permanently" or "immediately". If deleted data stays in backups, Arjun gives the backup period, and I sign one added line: `Copies in our backups are erased within {N} days.`

**Backup line (14 Oct 2026, Arjun's facts).** There are no backups today, and once Atlas Cloud Backup is on, daily snapshots will be kept for 7 days. Both dialogs (T-115b and T-115c) add this line at the end of the body:
`Backup copies are erased within 7 days.`

It is true now and stays true after backups are turned on. If the retention period ever rises above 7 days, this line needs a fresh sign-off. Failed email jobs kept for up to 30 days (T-220) belong in the Privacy Policy's retention section, not in the dialogs.

## T-115b and T-115c: when erasing fails partway (signed 14 Oct 2026)

The backup line is above: `Backup copies are erased within 7 days.`

**T-115b, delete document fails:**
`We couldn't finish deleting this document. Please try again. If this keeps happening, write to us at {support email}.`

**T-115c, close account fails:**
`We couldn't finish closing your account. Some of your data may not be erased yet. Please try again, or write to us at {support email} and we will finish it.`

Conditions:
1. A success message ("deleted" or "closed") shows only once every part of the erase is done.
2. A partial erase is never left in place. The server retries until it completes, and logs the failure with ids only, no content.
3. The account is signed out and cannot be used once closing has started, even if the erase failed.
4. `{support email}` is the address in the Privacy Policy.

## T-115c: erase list and Privacy Policy text (signed 14 Oct 2026)

### 1. User fields the runbook missed (Tanvi's list)

Erase all of them: signupSource, yearsOfExperience, privacyHistory, emailVerifyToken*, passwordResetExpires, lastLoginAt, referralInkCode, and the terms/privacy consent stamps. Keep nothing on the User record. A hard delete of the whole User document (if Arjun rules it) is preferred and satisfies this.

- Consent stamps go too. Once the account is erased there is nothing left to prove consent for. The erasure record holds the user id, time and reason code only, no email and no name.
- What survives erasure: payment records and tax invoices (tax law), which keep only what the invoice itself prints. Nothing else.
- Test: after closing, no collection holds the user's email, name or any field above under that user id, except the billing/invoice records.

### 2. Privacy Policy (legal content: Tanvi ships these in T-115c, byte-exact)

Must-fix: the current §7 line "Lawie does not yet have a delete button; we erase on request" becomes false the moment T-115c ships.

**§7, replace the paragraph starting "Write to privacy@lawie.in" with:**
`You can close your account and erase your data from Settings, and delete any single document from the document itself. You can also write to <a>privacy@lawie.in</a> from your account email and we will do it for you. Erasure covers our database and session store, and we remove what we can find of your data in our error reports (Sentry). Backup copies are erased within 7 days. We keep payment records and tax invoices for as long as tax law requires; an invoice keeps the name and State printed on it. Erasure cannot reach data already sent to Helicone (see §5) or copies you have downloaded.`
(The link keeps its current mailto markup. If T-115b has not merged when T-115c ships, drop `, and delete any single document from the document itself` until it does.)

**§9, change these bullets:**
- `Everything else (account, case details, drafts): while your account exists, until you ask us to erase it.` becomes
  `Everything else (account, case details, drafts): until you close your account or delete the document. Backup copies are erased within 7 days after that.`
- Add: `Emails we could not send: up to 30 days.` (T-220 facts).
- Payment bullet becomes:
  `Payment records and tax invoices: for as long as GST law requires (72 months from the due date of the annual return for the year of the invoice), even after you close your account.`
  This is the same text as GST ruling 5d (T-436). Whichever ticket merges first ships it; the other checks it is already there.
- T-358's signed line (`If you do not verify your email address within 30 days of signing up, we delete your account and everything in it.`) goes into §9 with T-358, not T-115c, unless T-358 has already merged.

Unchanged: sessions, fact-list records, waitlist.
Parked: "Server logs: until we delete them" names no period (DPDP s.8(7)); Arjun to give a log retention period, then I sign a line.

Bump the Privacy Policy "Last updated" date in the merge.

### 3. T-115b merging before T-115c (Priya, 14 Oct 2026)

The gap is acceptable on develop_staging and develop. Users only see main, and nothing reaches main without the founder's release after Anushka's PASS.

Condition: T-115b goes to main only with T-115c, or with this interim line. In that case, replace `Lawie does not yet have a delete button; we erase on request.` in §7 with:
`You can delete any single document from the document itself. To erase your account, write to us from your account email and we will do it.`
No change in T-115b itself.

### 4. T-115c: two more calls (Tanvi, 14 Oct 2026)

| # | Item | Ruling |
|---|---|---|
| 1 | Kept inkledger rows `admin_grant` (reference = admin's free-text reason) and `referral_bonus` (reference = referral code) | **Blank the reference on erase.** Free text can name the person, and the referral code links back to them. Keep type, amount and date only. Payment and tax rows are unaffected. |
| 2 | Review feedback the erased user left on another owner's document | **Keep the feedback; it belongs to the document owner's file. Remove the reviewer's identity:** name, email and token go, and the feedback shows the reviewer as `A reviewer`. The feedback text itself is not scanned or edited. |

Test: after erasure, no inkledger reference and no review record holds the erased user's email, name or referral code.

### 5. T-115c FYI (Tanvi, 14 Oct 2026)

| # | Item | Ruling | Kind |
|---|---|---|---|
| 1 | `payment` and `account_delete` audit rows auto-expire after 2 years | The audit rows need not last 72 months. The 72-month duty (CGST Act s.36), and the Privacy §9 line, attach to the tax records: invoices, credit notes and the billing/Ink payment ledger. **Condition:** those stores have no TTL shorter than 72 months; Arjun confirms. If the audit row is the only payment record anywhere, its TTL becomes 72 months. `account_delete` rows: 2 years is fine. | must-fix only if the condition fails |
| 2 | Stripped reviewer feedback ("A reviewer") drops out of the admin panel-review list | Not a legal issue. The admin tooling is Priya's call. | none |

Arjun's reading (14 Oct 2026) is **confirmed**: the 72 months attach to billing's own rows (payments, subscriptions, top-ups, T-436 invoices and credit notes), which carry no TTL. The auth AuditLog stays an operational log with its 2-year TTL. No audit-trail ticket.
Reviewer feedback is anonymised in place: approved. The internal marker may be `reviewer: erased` in the admin list. Anything the document owner sees shows `A reviewer` (§4).

**Condition met (Arjun, 14 Oct 2026, every model checked read-only).** Billing and ledger rows (Subscription, CouponCode, CouponUsage, CreditLedger/Ink ledger) and the T-436 invoice store have no TTL. The only TTLs are AuditLog (2 years), Consent (12 months after the latest decision), Session and FactDiff (90 days, matching Privacy §9). §5(1) is closed.
Parked: the billing rows are kept forever, not "72 months". A sweep that deletes them once the 72 months have run would match §9 and DPDP s.8(7).

### 6. T-115c privacy page checks (Tanvi, 14 Oct 2026)

1. §3 sentence **signed** as reworded: `Our database is MongoDB Atlas, in India (Mumbai). Our session store is Redis Cloud, which may store data outside India.` The §5 Atlas row reads "India (Mumbai)".
2. **Keep CURRENT_PRIVACY_VERSION; no re-accept prompt.** T-115c adds no new data and no new purpose. It adds a way to erase and states the retention periods, which is in users' favour, so bump "Last updated" only. The version bump (with a signed summary) comes with T-436, when we start collecting the State (and optional GSTIN) for invoices: that is new data for a new purpose.

### 7. T-115c review notes (Tanvi, 14 Oct 2026)

| # | Item | Ruling | Kind |
|---|---|---|---|
| 1 | Sent-email jobs (with the address) stay in Redis 7 days and are not erased on close | Add to §9, after the failed-emails bullet: `Emails we have sent: up to 7 days, even after you close your account.` Erasing them on close as well is better; parked. | must-fix (the §9 line) |
| 2 | §7 "we remove what we can find … in our error reports (Sentry)" is a manual runbook step | Keep the wording only if every self-serve close tells the operator automatically (user id only, no email) and the Sentry step is done within 7 days. If that alert is not in T-115c, the sentence comes out of §7 until it is. | must-fix (one or the other) |
| 3 | Partial-failure message says "Please try again", but the account is already locked and signed out | Replace the signed T-115c failure line with: `We couldn't finish erasing your data. Your account is closed and you have been signed out. We will finish erasing it; if you have any questions, write to us at {support email}.` The conditions stand: the server retries until complete, and no "closed" success message shows until every part is done. | must-fix |
