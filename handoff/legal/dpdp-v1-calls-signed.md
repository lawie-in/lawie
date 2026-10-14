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
