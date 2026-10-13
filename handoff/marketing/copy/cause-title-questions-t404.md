# Cause-title questions (T-404)

Madhuri, 13 Oct 2026. **Draft. Ajay to sign every label** (his rule: "I sign each new question label when it is worded"). Sources: `handoff/legal/T-404-cause-title-fields-signed.md` (the ruling), `handoff/tickets/T-404-cause-title-fields-missing.md`, and the question style in `apps/drafting/src/config/document-rules/` (read only): short Title Case labels, a placeholder only where it helps, a one-line help text only where the label alone could be misread.
Rules used: English only, plain words for advocates, no legal advice, no "AI", fictional examples only ("Sample ..."), labels under 40 characters. The signed blank wording is Ajay's and is not changed here.

## 1. The six other legal notices (required)

Packs: `legal_notice_breach_of_contract`, `_consumer_deficiency`, `_copyright_infringement`, `_defamation`, `_eviction`, `_trademark_infringement`. `legal_notice_s138` needs nothing new (it uses its existing aliases), and so does s80.

Ajay's ruling: A notice cannot go without an addressee, so all three are required Q. He gives the token names (`applicant`, `respondent`, `respondentAddress`) but not the form keys for these six. The keys below are the ones he names for s138 and s80 (`applicant_name`, `respondent_name`, `respondent_address`), so one cause-title token reads the same key in all eight notice packs. **Open: Ajay or the lead confirms the keys.** Today these six packs describe sender and recipient only as an object (`sender.name`, `recipient.address`) with no form field of their own.

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `applicant_name` | Client (sender of the notice) | The person on whose behalf you are sending the notice. | e.g., Sample Party | Required | 29 / 54 | Ajay to sign |
| `respondent_name` | Addressee (notice sent to) | The person or firm the notice is addressed to. | e.g., Sample Party | Required | 26 / 46 | Ajay to sign |
| `respondent_address` | Addressee's address | The full address the notice will be sent to. | (none) | Required | 19 / 44 | Ajay to sign |

## 2. PIL and habeas corpus (required)

Ajay: `respondents_list` is a required Q in both; `petitioner` is taken from `petitioner_name` (no new question).

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `respondents_list` | Respondents (names, addresses) | Put each respondent on its own line: name, then address. | e.g., Sample Authority, Sample Office, Sample Town | Required | 30 / 56 | Ajay to sign |

PIL (`pil`). Ajay's wording: "respondents, with names and addresses, one per line".

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `respondents_list` | State and detaining authority | Put each respondent on its own line: name, then address. Lawie does not fill this in for you. | e.g., Sample Authority, Sample Office, Sample Town | Required | 29 / 93 | Ajay to sign |

Habeas corpus (`habeas_corpus`). Ajay's wording: "respondents (State and the detaining authority), one per line. Never auto-fill a State or a police officer." The label names the two kinds of respondent he lists; the help text says plainly that nothing is filled in. It does not say who must be named, because that is the advocate's decision.

## 3. Vakalatnama (optional)

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `opposing_party` | Opposite party (if known) | Leave it blank if you don't have it yet. The document will then show [To be confirmed: name of the opposite party]. | e.g., Sample Party | Optional | 25 / 115 | Ajay to sign |

If unanswered, the cause title prints Ajay's signed blank `[To be confirmed: name of the opposite party]`. The counterpart role (`opposingRole`) needs no question: it follows `client_role`.

## Where the ruling leaves wording or keys open

| # | Open point | Who |
| --- | --- | --- |
| 1 | Form keys for the six notices (proposed: the s138 and s80 keys) | Ajay, lead |
| 2 | Habeas already has an optional `detaining_authority` ("if known"). Ajay says `respondents_list` is its own required Q and is never auto-filled. Should the help text say that the detaining authority also goes in this list? | Ajay |
| 3 | Vakalatnama already asks `case_title` ("Case Title (X vs Y)"). Ajay did not take `opposingParty` from it; he asks a separate optional Q. Two questions may overlap | Ajay, Rajesh |
| 4 | The help text on the vakalatnama question shows the signed blank in square brackets. If Ajay prefers no bracket text in help, shorten to "Leave it blank if you don't have it yet." | Ajay |
| 5 | "Client" for the notice sender: the packs use "Sender" in their party designations. "Client" follows Meera's brief; "Sender" is the alternate (`Sender of the notice`, 21) | Meera |

## Also in Ajay's ruling, not worded here (not in Meera's brief)

Questions with no wording yet: `governing_act` (eviction), `primary_statute` and `route` (defamation), and `state` and `rera_office_location` (rera_complaint). Ajay says these are Q and never inferred, with signed blanks `[To be confirmed: Act under which the notice is sent]`, `[To be confirmed: civil or criminal route]`, `[To be confirmed: State]` and `[To be confirmed: office of the Authority]`. Send the next brief when wanted.
