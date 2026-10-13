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

## Addendum 3 (13 Oct 2026): T-404 part 1, Shashank's ac3e651 (s138 twin and template engine)

**ac3e651: approved.**
- The s138 header prints the five signed blanks on the form, brief and ledger paths.
- A notice with every field filled renders byte-identical to before.
- A court pack with no court prints `[To be confirmed: court]`.

| # | Question | Ruling |
|---|---|---|
| 1 | Subject line and "(Counsel for …)" use the client blank too | Yes. Every place the client's name prints uses the one blank, `[To be confirmed: name of the client]`. A literal `{applicant_name}` or `_____` is never acceptable. |
| 2a | Client's address in "From," | `[To be confirmed: address of the client]` |
| 2b | Advocate's enrolment number | `[To be confirmed: advocate's enrolment number]`. The T-311 resolver order applies first: typed number, then the profile number (only when the printed name came from the profile), then this blank. |
| 3 | "IN THE COURT OF [To be confirmed: court]" for a pack with no court and no twin | Accepted for now. The pack keeps its own prefix. |
| 4 | Bail twins print "THE HON'BLE COURT" when there is no court | Yes, change it to `[To be confirmed: court]`. "THE HON'BLE COURT" hides a missing court instead of flagging it. The Drafter may receive the blank but must never fill in a court name, so add a test: no court given means no court name in the body. The bail golden diff comes to me, and it must change only that line. |
| 5 | A court is chosen but has no nomenclature | `[To be confirmed: case type and number]` |

**Rule 1, clarified.** The registry's number blank inside a signed case line ("Bail Application No. _____ of 2026") is the filing convention and is allowed. Rule 1 bans `_____` only where a token or field value should print.

**71f1e98: approved.** The blanks are byte-equal to Addendum 3. The bail no-court header and Drafter input change as listed. The golden snapshot does not move, because the no-court path never runs there.

| # | Question | Ruling |
|---|---|---|
| a | Bail case line with no court | `[To be confirmed: case type and number]`. The case line is not the court, and the pack's default "Criminal Miscellaneous Case" is a guess. |
| b | `THE HONOURABLE [To be confirmed: court],` | Keep it. The blank sits where the court's name goes. |
| c | `Place:` with no city | `[To be confirmed: place]`, wherever place prints: the `Place:` line and "Verified at {place}". |

Tests: no court gives (a) and (c) and no court name in the body.

**2be946d: approved.** The bail no-court case line and both place lines match the file, and a typed or chosen court renders byte-identical. The consumer_complaint twin's `Place:` and `Verified at` lines taking the place blank with no court is also approved.

| # | Question | Ruling (part 2 is fine) |
|---|---|---|
| a | Empty city line under `THE HONOURABLE [To be confirmed: court],`, and consumer's bare `AT ` | Leave the line out when there is no city. Never print an empty line or a bare `AT`. Consumer's cause title and addressing clause belong to T-410 Addendum 1 (Tanvi), which already leaves out the city there. Don't edit those lines in T-404; check with Priya that the claims don't overlap. |
| b | Packs with no twin print the court blank for caseNomenclature | Make them match: with no court, `caseNomenclature` prints `[To be confirmed: case type and number]` in every pack, and the court blank stays for the court itself. |
