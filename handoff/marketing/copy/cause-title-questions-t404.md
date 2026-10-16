# Cause-title questions (T-404)

Madhuri, 13 Oct 2026. **Signed by Ajay, 13 Oct 2026**, with the changes recorded below (labels signed; his rule: "I sign each new question label when it is worded"). Sources: `handoff/legal/T-404-cause-title-fields-signed.md` (the ruling), `handoff/tickets/T-404-cause-title-fields-missing.md`, and the question style in `apps/drafting/src/config/document-rules/` (read only): short Title Case labels, a placeholder only where it helps, a one-line help text only where the label alone could be misread.
Rules used: English only, plain words for advocates, no legal advice, no "AI", fictional examples only ("Sample ..."), labels under 40 characters. The signed blank wording is Ajay's and is not changed here.

## What "required" means here (Ajay, signed)

"Required" means asked, never guessed. Each required question also allows a "Not known" answer, which prints Ajay's signed blank `[To be confirmed: ...]` in the cause title. It does not hard-block Continue. "Not known" is a control label for the lead and Rajesh; its wording is not set here.

## 1. The six other legal notices (required)

Packs: `legal_notice_breach_of_contract`, `_consumer_deficiency`, `_copyright_infringement`, `_defamation`, `_eviction`, `_trademark_infringement`. `legal_notice_s138` needs nothing new (it uses its existing aliases), and so does s80.

Ajay's ruling: A notice cannot go without an addressee, so all three are asked. He gives the token names (`applicant`, `respondent`, `respondentAddress`) but not the form keys for these six. The keys below are signed: the ones he names for s138 and s80 (`applicant_name`, `respondent_name`, `respondent_address`), so one cause-title token reads the same key in all eight notice packs. Today these six packs describe sender and recipient only as an object (`sender.name`, `recipient.address`) with no form field of their own.

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `applicant_name` | Client (sender of the notice) | The person on whose behalf you are sending the notice. | e.g., Sample Party | Required | 29 / 54 | Signed |
| `respondent_name` | Addressee (notice sent to) | The person or firm the notice is addressed to. | e.g., Sample Party | Required | 26 / 46 | Signed |
| `respondent_address` | Addressee's address | The full address the notice will be sent to. | (none) | Required | 19 / 44 | Signed |

## 2. PIL and habeas corpus (required)

Ajay: `respondents_list` is a required Q in both; `petitioner` is taken from `petitioner_name` (no new question).

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `respondents_list` | Respondents (names, addresses) | Put each respondent on its own line: name, then address. | e.g., Sample Authority, Sample Office, Sample Town | Required | 30 / 56 | Signed |

PIL (`pil`). Ajay's wording: "respondents, with names and addresses, one per line".

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `respondents_list` | Respondents (names, addresses) | Put each respondent on its own line: name, then address. Lawie does not fill this in for you. | e.g., Sample Authority, Sample Office, Sample Town | Required | 30 / 93 | Signed |

Habeas corpus (`habeas_corpus`). Ajay's wording: "respondents (State and the detaining authority), one per line. Never auto-fill a State or a police officer." Signed change: the label is the same as PIL. The help text says plainly that nothing is filled in. It does not say who must be named (the advocate's decision), and the existing `detaining_authority` answer is not copied in.

## 3. Vakalatnama (optional)

| Key | Label | Help text | Placeholder | Required | Chars (label / help) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `opposing_party` | Opposite party (if known) | Leave it blank if you don't have it yet. The document will then show [To be confirmed: name of the opposite party]. | e.g., Sample Party | Optional | 25 / 115 | Signed |

If unanswered, the cause title prints Ajay's signed blank `[To be confirmed: name of the opposite party]`. The counterpart role (`opposingRole`) needs no question: it follows `client_role`.

## Open points

None left. Resolved by Ajay's signature: the keys; the habeas label and help text (detaining_authority not copied in); a separate optional vakalatnama question (`case_title` is never split); the notice label "Client (sender of the notice)".

## Not v1, unworded

Questions with no wording yet (not v1): `governing_act` (eviction), `primary_statute` and `route` (defamation), and `state` and `rera_office_location` (rera_complaint). Ajay says these are Q and never inferred, with signed blanks `[To be confirmed: Act under which the notice is sent]`, `[To be confirmed: civil or criminal route]`, `[To be confirmed: State]` and `[To be confirmed: office of the Authority]`.
