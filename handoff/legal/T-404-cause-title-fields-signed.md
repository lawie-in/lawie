# T-404: cause-title fields with no form source (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Built from Kunal's T-395 scan. Key: **A** = taken from an existing answer (alias), **Q** = ask (Rajesh/Meera word the question; I sign the label), **B** = signed blank.

## Rules for every pack

1. A cause title never prints `_____`. Every token is A, Q or B.
2. Blanks read exactly `[To be confirmed: <what>]`, with the "what" given below. Never a guess, and never another party's value.
3. `advocateName`, `advocateAddress`: A from the profile, by the T-311 resolver. If absent: B `[To be confirmed: advocate's name]` / `[To be confirmed: advocate's address]`.
4. `caseNomenclature`, `courtHeader`, `courtDesignation`: A from the court the advocate chose. If there is no court: B `[To be confirmed: court]`.

## legal_notice_* (s138 first, with Shashank's T-363)

| Token | s138, s80 (form fields exist) | Other 6 notices (brief-only) |
|---|---|---|
| `applicant` | A `applicant_name` (with the T-363 payee proprietor rule) | Q, required: the client's name |
| `respondent` | A `respondent_name` (with the T-363 drawer proprietor rule) | Q, required: the name of the person the notice is sent to |
| `respondentAddress` | A `respondent_address` | Q, required: that person's address |
| `governing_act` (eviction), `primary_statute` and `route` (defamation) | n/a | Q, never inferred. If unanswered: B `[To be confirmed: Act under which the notice is sent]` / `[To be confirmed: civil or criminal route]` |

A notice cannot go without an addressee, so these Qs are required.

## Other packs

| Pack | Token | Ruling |
|---|---|---|
| slp | `petitioner` | A `petitioner_name` |
| slp | `hc_name` | A `impugned_order_court` |
| slp | `hc_case_no` | A `impugned_order_case_no` |
| pil | `respondents_list` | Q, required: respondents, with names and addresses, one per line |
| habeas_corpus | `respondents_list` | Q, required: respondents (State and the detaining authority), one per line. Never auto-fill a State or a police officer. |
| habeas_corpus, pil | `petitioner` | A `petitioner_name` |
| rera_complaint | `complainant` | A `complainant_name` |
| rera_complaint | `respondents_list` | A `promoter_name` (with `promoter_address`); further respondents only if the advocate adds them |
| rera_complaint | `state`, `rera_office_location` | Q: the State and the Authority's office. If unanswered: B `[To be confirmed: State]` / `[To be confirmed: office of the Authority]` |
| vakalatnama | `client`, `clientRole` | A `client_name`, `client_role` |
| vakalatnama | `opposingParty` | Q, optional: name of the opposite party. If unanswered: B `[To be confirmed: name of the opposite party]` |
| vakalatnama | `opposingRole` | A: the counterpart of `client_role` (petitioner ↔ respondent, plaintiff ↔ defendant, complainant ↔ accused, appellant ↔ respondent). If there is no counterpart: B `[To be confirmed: role of the opposite party]` |

Any token the scan finds that is not listed here follows rules 1 and 2. I sign each new question label when it is worded.

## Question labels (Madhuri's `cause-title-questions-t404.md`), 13 Oct 2026

Signed as drafted, with one change:
- **Six notices:** the keys are `applicant_name`, `respondent_name` and `respondent_address`, the same as s138 and s80. The labels, help text and placeholders are approved, including "Client (sender of the notice)".
- **PIL:** approved as drafted.
- **Habeas corpus (change):** the label is `Respondents (names, addresses)`, the same as PIL. Who the respondents are is the advocate's call, so the label must not name them. Keep the help text as drafted: `Put each respondent on its own line: name, then address. Lawie does not fill this in for you.` Do not copy `detaining_authority` into this list.
- **Vakalatnama:** approved as drafted, including the help text with the signed blank. Keep it a separate optional question; never split `case_title` to fill it.
- **"Required"** means always asked and never guessed. "Not known" is allowed and prints the signed blank. Agreed with Priya.

Still to word (next brief): `governing_act`, `primary_statute`, `route`, `state`, `rera_office_location`.

## Addendum 2 (13 Oct 2026): Shashank's gap list after Explore

| # | Question | Ruling |
|---|---|---|
| 1 | s138 "From," block: add the payee's proprietor? | No. "From," keeps `applicant_name`. The subject line already names the proprietor (T-363), and printing it twice adds nothing. |
| 2 | "Not known" wording | `applicant`: `[To be confirmed: name of the client]`. `respondent`: `[To be confirmed: name of the addressee]`. `respondentAddress`: `[To be confirmed: address of the addressee]`. `respondents_list` (PIL, habeas): `[To be confirmed: respondents, with names and addresses]`. Never the label-derived text. |
| 3 | Six notices: drop the group facts sender.name, recipient.name and recipient.address? | Yes. Each fact is asked once. Old briefs: an existing group answer fills the new key (A), never the reverse. Other group facts stay. |
| 4 | vakalatnama: counterpart of Respondent | Blank, `[To be confirmed: role of the opposite party]`. A Respondent's opposite party could be a petitioner, appellant, plaintiff or complainant, so it is never guessed. The other pairs in the table are one-to-one, so they keep the counterpart. |
| 5 | slp `hc_name` doubling | Change the template line, not the label. Official names don't share one prefix ("High Court of Delhi", "High Court of Judicature at Bombay"), so the line prints `{hc_name}` as given, with no "HIGH COURT OF" prefix. Label: `High Court that passed the impugned order (full name, e.g. High Court of Delhi)`. Send me the before and after of the line for a byte check before merge. |
| 6 | respondents_list numbering | Yes: `1.`, `2.`, … one respondent per line, in the order given. |
| 7 | rera `state` from the court picker; more respondents | Ask. Don't fill it from the picker: the Authority is not a court, and the ruling is "never inferred". Also add an optional question, `Other respondents (names, addresses)`, one per line, numbered after the promoter. If unanswered, it prints nothing. |
| 8 | Advocate address with no profile field | Enough for now: the form answer, else `[To be confirmed: advocate's address]`. The "A from profile" part waits until the profile has an address field. |
| 9 | Golden snapshot: s138 shows a bail case nomenclature under HC courts | A notice is not filed in court, so no case nomenclature may print on any `legal_notice_*`. Out of T-404 scope: raise it with Priya as its own ticket. The snapshot changes when the fix lands, under the golden-snapshot rules. |
