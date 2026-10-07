# T-302 — Consent line and retention rule for uploads

| Field      | Value                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Phase      | 3 — Matter context                                                                                       |
| Owner      | Ajay                                                                                                     |
| Mode       | Legal work, not through the dev lead                                                                     |
| Status     | Delivered by Ajay on 4 Oct 2026. Policy wording to be read by a practising lawyer before it is published |
| Depends on | None                                                                                                     |
| Branch     | None                                                                                                     |
| Created    | 2026-10-03                                                                                               |

## Goal

A written rule for what we may do with uploaded FIRs and documents, and the words the user sees.

## Context

- FIRs name complainants, accused persons and witnesses. Those people are not Lawie users.
- Ajay raised the DPDP Act on 3 Oct 2026: a consent line and a retention rule are needed before upload ships.
- T-301 defaults to "held in memory, not stored" until this ticket says otherwise.

## Acceptance criteria

- A consent line for the upload control, short enough for one line on a phone.
- A retention rule: whether uploads may be stored, for how long, and when they are deleted.
- A rule on third-party processors: whether image requests may pass through Helicone.
- The privacy policy changes needed, as exact text.
- A sign-off reference that T-301 and T-304 can quote.

## In scope

- The four outputs above, saved in this file or linked from it

## Out of scope

- Code

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-302, 4 Oct 2026. Conditions are in the Result section below

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                            |
| -------- | -------- | ------------------------------- |
| Ajay     | Approved | Mine to deliver. Can start now. |

## Result (Ajay, 4 Oct 2026)

**Status: delivered. This is the CLO agent's draft. Have a practising data-protection lawyer read the policy and terms wording before it is published.**

### 1. Who is responsible for what

- **Matter data** (FIRs, orders, party names, facts): the advocate decides why and how it is used. Lawie processes it for the advocate.
- **Account data** (name, email, enrolment number, payments): Lawie decides how it is used.
- An FIR names complainants, accused persons and witnesses who are not Lawie users and have agreed to nothing. That is the reason for every rule below.

### 2. The legal position, briefly

- The Digital Personal Data Protection Act, 2023 is the governing law. Its Rules were notified in November 2025 and come in by stages. The main duties (notice, consent, safeguards, breach reporting, erasure) apply from 13 May 2027, according to the published timelines.
- Section 17(1)(a) exempts processing that is "necessary for enforcing any legal right or claim" from most of the consent and notice duties. Two duties still apply under that exemption: the fiduciary stays responsible for its processors, and it must keep reasonable security safeguards.
- **I am not building on the exemption.** Not every Lawie document is about a legal claim (a rent agreement is not), and the safeguards duty applies either way. So the rule is: take as little as possible, keep nothing we do not need, and say plainly who else handles the data.

### 3. Retention rule

| Data                          | Rule                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Uploaded images and PDF pages | **Not kept.** Held in memory for the request only. Never written to disk, the database, logs, the error tracker or the usage rows  |
| Values read from an upload    | Stay in the user's browser until a draft is generated. Then saved only as part of that document's inputs, as form values are today |
| A guided-draft brief          | Same as the line above                                                                                                             |
| An intake the user abandons   | Nothing is kept on the server                                                                                                      |
| Drafts and their inputs       | Kept until the user deletes the document or closes the account                                                                     |
| A deleted document            | Removed for good within 30 days                                                                                                    |
| A closed account              | Documents and inputs removed for good within 30 days. Payment records kept as tax law requires                                     |
| Demand signals                | A generic label only. Never the user's text                                                                                        |
| Usage rows                    | Token counts and cost only. Never content                                                                                          |
| Test pages for T-303          | Made-up or fully redacted pages only. Deleted when the spike ends                                                                  |

### 4. Who else may handle the data

- **Images and PDF pages go to Anthropic only, direct.** Not through Helicone. (Founder decision D4.)
- **Text goes through Helicone to Anthropic**, as production does today.
- **Helicone is not listed in the privacy policy.** It handles the case details of every draft made today. This must be corrected now, whatever happens to the upload feature.
- Arjun to record, for Anthropic and for Helicone: how long each keeps request data, whether it is used for training, and where it is stored. Helicone should be set not to store request bodies if the plan allows.
- Both process data outside India. The policy must say so.

### 5. The consent line

Above the attach control, every time:

> We read these pages to fill in your draft, then discard them. Upload only what you are entitled to share.

On the first upload, once per account, with the time recorded:

> I am authorised to share these documents for this matter.

Both fit on one line at 360 px.

### 6. Privacy policy changes (exact text)

**Section 1, add:** "If you attach documents such as an FIR or a court order, we read them to fill in your draft. We do not keep the attached files."

**Section 5, replace the list:** "Razorpay (payments), Anthropic (AI drafting and reading attached documents), Helicone (routing and monitoring of AI requests), MongoDB Atlas (database), AWS (hosting), and Google Workspace (transactional email). Some of these process data outside India."

**Section 9, replace:** "We keep your documents and the details in them until you delete them or close your account. Deleted documents are removed permanently within 30 days. Attached files are never stored. Payment records are kept for as long as tax law requires."

**New section, "Other people's information":** "Documents you draft or attach may contain personal information about other people. You are responsible for having the right to share it with us for your matter. We use it only to produce your draft."

### 7. Terms of use, add

"You confirm that you are entitled to share every document and detail you provide, and that doing so is consistent with your professional duty of confidentiality."

### 8. Three gaps I found in the code

1. **Case details are saved unencrypted by the application.** A document's `formInputs` (party names, FIR numbers, the facts) are stored as plain values. Only the draft text (`generatedContent`, `finalContent`) is encrypted by our code. The policy says "the case details within them are encrypted at rest". Either encrypt `formInputs` the same way, or confirm that the database's own storage encryption is on and reword the policy.
2. **Nothing is ever really deleted.** Documents are only flagged `isDeleted`, and I found no route that removes a document or an account. The policy promises deletion on request. A permanent-delete path is needed before the retention rule in section 3 is true.
3. **Helicone is undisclosed**, as in section 4.

These three are not about uploads. They exist today.

### 9. Sign-off for T-301, T-303 and T-304

**Reference: Ajay, T-302, 4 Oct 2026.** Uploads may ship when all five are true:

1. Attached files are held in memory only, and a test proves nothing is written anywhere.
2. Image and PDF calls go direct to Anthropic.
3. Both consent lines are shown, and the first-upload confirmation is recorded.
4. The privacy policy and terms carry the text in sections 6 and 7, with Helicone listed.
5. Every value read from an upload is confirmed by the user before drafting.

### Sources

- [DPDP Act, section 17](https://www.dpdpa.com/dpdpa2023/chapter-4/section17.html)
- [DPDP Rules 2025 timeline](https://protectcomply.com/blog/dpdp-rules-2025-timeline)
