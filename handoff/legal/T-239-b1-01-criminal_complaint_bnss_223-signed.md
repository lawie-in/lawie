# T-239 b1 #1 criminal_complaint_bnss_223 (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `criminal_complaint_bnss_223` |
| displayName | Criminal Complaint before Magistrate (BNSS 223) |
| category (T-240) | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm"]` |
| Ink | L = 2 |
| Anushka tier | B (court filing). Not A: no custody or statutory bar decided by the draft itself |
| averments file | `_averments/criminal_complaint_bnss_223.json`, own file, `inherits: null` (laid over `_default.json`) |

## relevantActs

Section-level mappings confirmed in `config/sections/crpc-to-bnss.json` (190→210, 200→223, 202→225, 203→226, 204→227, 468→514, 484→531). Clause (1)(a) is from the bare act, not the table; checked by Ajay (rulings B).

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "210", "description": "Cognizance of offences by Magistrates; clause (a) of sub-section (1): upon receiving a complaint of facts" },
      { "number": "223", "description": "Examination of complainant" },
      { "number": "225", "description": "Postponement of issue of process" },
      { "number": "226", "description": "Dismissal of complaint" },
      { "number": "227", "description": "Issue of process" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "190", "description": "Cognizance of offences by Magistrates" },
      { "number": "200", "description": "Examination of complainant" },
      { "number": "202", "description": "Postponement of issue of process" },
      { "number": "203", "description": "Dismissal of complaint" },
      { "number": "204", "description": "Issue of process" }
    ]
  }
]
```

Offence sections (BNS or IPC) are not in ACTS. They come only from the BRIEF (`offences_alleged`).

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}, {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{complainant} ... Complainant\nVERSUS\n{accusedList} ... Accused\n\nPolice Station: {policeStation}\nOffence(s): {offencesCited}",
  "partyDesignations": [
    { "role": "applicant", "label": "Complainant" },
    { "role": "respondent", "label": "Accused" }
  ],
  "caseNomenclature": "COMPLAINT CASE No. _____ of [YEAR]\n(Complaint under {governing_provision})"
}
```

Procedure (T-245, Ajay ruling): the case begins with this complaint, so the procedure is always BNSS and BSA. No `fir_date` and no `procedure_code`; code sets `PROCEDURE CODE: BNSS and BSA` and fills `{governing_provision}` (and the `GOVERNING PROVISION` line) with `Section 223 read with Section 210 of the Bharatiya Nagarik Suraksha Sanhita, 2023`. The Drafter never chooses.

`{offencesCited}` is `offences_alleged` as typed, with the code the form's switch labels it with (IPC if `offence_date` < 2024-07-01, else BNS). Not converted.

## mandatoryClauses

```json
[
  { "id": "complainant_particulars", "name": "Complainant", "required": true, "description": "Name, parentage, age and address of the complainant, as the brief gives them" },
  { "id": "accused_particulars", "name": "Accused", "required": true, "description": "Each accused: name, parentage, address and what the brief says that accused did. Blank for any particular the brief does not give" },
  { "id": "facts_of_offence", "name": "Facts Constituting the Offence", "required": true, "description": "Date, time and place of occurrence and the acts alleged against each accused, in the order they happened, as the brief gives them. No cause, motive or detail the brief does not give" },
  { "id": "offences_alleged", "name": "Offences Alleged", "required": true, "description": "The sections the brief gives, under the code the brief gives, cited exactly as written" },
  { "id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The place of occurrence and the police station within whose limits it lies, as the brief gives them. Where any accused resides outside the area of this court, state that fact as the brief gives it" },
  { "id": "police_approach", "name": "Approach to Police", "required": true, "description": "Whether the complainant gave information to the police or the Superintendent of Police and what followed, as the brief gives it; or the blank [To be confirmed: whether the matter was reported to the police and with what result]" },
  { "id": "witnesses", "name": "Witnesses", "required": true, "description": "The witnesses the complainant proposes to examine, as the brief lists them; or the blank" },
  { "id": "documents_relied", "name": "Documents Relied On", "required": true, "description": "The documents the complainant relies on, as the brief lists them; or the blank" },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Every earlier complaint, FIR, application or case on the same facts that the brief mentions, with its forum, number, date and result or that it is pending. Where the brief mentions none: [To be confirmed: whether any FIR, complaint or other proceeding on the same facts was made or is pending, where, and with what result]. Never state that there is none unless the brief says so" }
]
```

## prayerTemplate

```
PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) take cognizance of the offence(s) under {offencesCited} on this complaint;
b) after examining the complainant and the witnesses present, issue process against the accused {accusedNames} and summon them;
c) proceed against the accused in accordance with law; and
d) pass any other order that this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the complainant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {complainant}, {complainantParentage}, aged about {complainantAge} years, resident of {complainantAddress}, the complainant above-named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above complaint are true and correct to my knowledge and belief. No part of it is false and nothing material has been concealed therein.

Verified at {place} on {date}.

Complainant
```

(Signature line reads "Complainant", not "Deponent": T-136 outside item 1.)

## filingChecklist

```json
[
  "Complaint signed by the complainant",
  "Copies of the complaint for each accused, as the court requires — {{MISSING}}",
  "List of witnesses",
  "List of documents, with copies",
  "Court fee as applicable — {{MISSING}}",
  "Process fee for summons as applicable — {{MISSING}}",
  "Vakalatnama",
  "Identity proof of the complainant, if the court requires it",
  "Copy of any information or complaint given to the police or the Superintendent of Police, with proof of sending",
  "Electronic records relied on: certificate under Section 63 BSA — check",
  "Complainant to attend for examination on oath (Section 223 BNSS)",
  "Any accused residing outside the court's area: inquiry before process (Section 225 BNSS) — keep witnesses ready",
  "Bar of limitation for cognizance (Section 514 BNSS): advocate to check. The draft does not state it",
  "If any accused is a public servant: check sanction and the procedure for complaints against public servants (verify)"
]
```

## promptInstructions

```json
[
  "Draft a private complaint to the Magistrate on which the Magistrate is asked to take cognizance of the offences the BRIEF gives.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Set out the facts as numbered paragraphs in the order they happened: who, what, when, where, as the BRIEF gives them. For each accused, state only what the BRIEF says that accused did.",
  "Where the case details answer 'yes' or 'not sure' to whether any accused is a public servant and the complaint concerns acts done in the discharge of official duty, add [To be confirmed: sanction, and the procedure for a complaint against a public servant]. Do not cite a sub-section for it.",
  "Do not state an intention, a motive, a loss or an injury unless the BRIEF gives it.",
  "State the place of occurrence and the police station as the BRIEF gives them. Do not say that this court has jurisdiction except as a submission resting on those facts.",
  "State whether the matter was reported to the police and what followed, as the BRIEF gives it. Where the BRIEF is silent, write the blank for it.",
  "List the witnesses and the documents the BRIEF gives, each in its own sub-paragraph.",
  "State every earlier FIR, complaint, application or case on the same facts that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any FIR, complaint or other proceeding on the same facts was made or is pending, where, and with what result].",
  "Do not say that the complaint is within limitation or that cognizance is not barred.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (Bihar, Jharkhand, Uttar Pradesh, Delhi) | yes | Court designation, court rules overlay |
| court_designation | Court (e.g. Chief Judicial Magistrate / Judicial Magistrate First Class) | text | yes | Cause title |
| court_place | Court place / district | text | yes | Cause title |
| complainant_name | Complainant name | text | yes | Cause title, verification |
| complainant_parentage | Father's / husband's name | text | yes | Verification |
| complainant_age | Complainant age | number | no | Verification (blank if empty) |
| complainant_address | Complainant address | textarea | yes | Particulars, verification |
| accused | Accused (repeat: name, parentage, address, role) | repeater | yes | Cause title, accused clause |
| offence_date | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| offence_place | Place of occurrence | text | yes | Jurisdiction clause |
| police_station | Police station with jurisdiction over the place | text | yes | Cause title, jurisdiction |
| offences_alleged | Offences (sections; form labels the code from offence_date) | textarea | yes | Offences clause, prayer |
| facts | What happened | textarea | yes | Facts clause |
| accused_outside_area | Does any accused live outside this court's area? | select (yes, no, not sure) | yes | Checklist cue for Section 225 inquiry; jurisdiction fact |
| police_approach | Reported to police? | select (no, FIR refused, SP approached, FIR registered, not sure) | yes | Police approach clause |
| police_approach_details | Details (dates, result) | textarea | no | Police approach clause; unlocks averment |
| witnesses | Witnesses to be examined | repeater (name, address) | no | Witnesses clause |
| documents | Documents relied on | repeater | no | Documents clause |
| earlier_proceedings | Earlier proceedings on the same facts ("none" or particulars) | textarea | no | Disclosure clause; "none" unlocks default allowed entry |
| accused_public_servant | Is any accused a public servant, and does the complaint concern acts done in the discharge of official duty? | select (no, yes, not sure) | yes | Yes / not sure: sanction blank in the draft and checklist cue (Ajay ruling) |
| advocate_name | Advocate name | text | yes | Signature block |
| advocate_enrolment | Bar Council enrolment no. | text | yes | Signature block |

## _averments

```json
{
  "pack": "criminal_complaint_bnss_223",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "intention_of_accused",
      "kind": "averment",
      "what": "The intention or knowledge of the accused",
      "phrases": ["with dishonest intention", "with common intention", "knowingly and deliberately", "with mala fide intention", "with intent to cheat", "jaan boojh kar"],
      "unlocked_by": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true }
    },
    {
      "id": "police_inaction",
      "kind": "averment",
      "what": "The police refused or failed to act",
      "phrases": ["the police refused to register the FIR", "the police did not take any action", "no action was taken by the police", "thane mein FIR nahi likhi"],
      "unlocked_by": { "key": "police_approach_details", "label": "Approach to police: details", "present": true }
    },
    {
      "id": "eyewitnesses",
      "kind": "averment",
      "what": "Someone saw the occurrence",
      "phrases": ["in the presence of witnesses", "witnessed by", "eye-witnesses", "villagers saw", "logon ne dekha"],
      "unlocked_by": { "key": "eyewitnesses", "label": "Who saw the occurrence", "present": true }
    },
    {
      "id": "loss_and_damage",
      "kind": "averment",
      "what": "Loss, injury or damage suffered",
      "phrases": ["suffered a loss of Rs.", "sustained injuries", "mental agony and harassment", "damage to reputation", "bahut nuksaan hua"],
      "unlocked_by": { "key": "loss_particulars", "label": "Loss or injury suffered", "present": true }
    },
    {
      "id": "false_implication_motive",
      "kind": "averment",
      "what": "A motive of the accused",
      "phrases": ["due to old enmity", "because of a land dispute", "with an ulterior motive", "personal vendetta", "purani dushmani"],
      "unlocked_by": { "key": "motive_particulars", "label": "Motive, as the complainant states it", "present": true }
    },
    {
      "id": "territorial_jurisdiction",
      "kind": "submission",
      "what": "This court has territorial jurisdiction",
      "phrases": ["this Hon'ble Court has jurisdiction", "within the local limits of this Hon'ble Court", "cause of action arose within the jurisdiction"],
      "unlocked_by": { "key": "offence_place", "label": "Place of occurrence", "present": true }
    },
    {
      "id": "cognizance_not_barred",
      "kind": "submission",
      "what": "Cognizance is not barred by time",
      "phrases": ["not barred by limitation", "within the period prescribed for taking cognizance", "complaint is within time"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "intention_of_accused", "kind": "averment", "averment": "{{intention_particulars}}", "requires": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true } },
    { "id": "police_inaction", "kind": "averment", "averment": "{{police_approach_details}}", "requires": { "key": "police_approach_details", "label": "Approach to police: details", "present": true } },
    { "id": "eyewitnesses", "kind": "averment", "averment": "the occurrence was seen by {{eyewitnesses}}", "requires": { "key": "eyewitnesses", "label": "Who saw the occurrence", "present": true } },
    { "id": "loss_and_damage", "kind": "averment", "averment": "{{loss_particulars}}", "requires": { "key": "loss_particulars", "label": "Loss or injury suffered", "present": true } },
    { "id": "false_implication_motive", "kind": "averment", "averment": "{{motive_particulars}}", "requires": { "key": "motive_particulars", "label": "Motive, as the complainant states it", "present": true } },
    { "id": "territorial_jurisdiction", "kind": "submission", "averment": "It is submitted that the occurrence took place at {{offence_place}} and that this Hon'ble Court has jurisdiction to take cognizance", "requires": { "key": "offence_place", "label": "Place of occurrence", "present": true } }
  ]
}
```

Default entries still apply: `no_other_proceedings` (unlocked by `earlier_proceedings` = none), `within_limitation` (never), `good_character`, `no_criminal_antecedents`, etc.

## Verify (not in signed text)

- Section 223(1) BNSS, proviso said to bar cognizance without giving the accused an opportunity of being heard (new in BNSS). If confirmed, the prayer (a)-(b) order and a clause on notice to the accused may need to change.
- Section 223(2) BNSS: separate procedure for a complaint against a public servant. Needs either an exclusion question or a separate id.
- Section 225(1) BNSS: inquiry mandatory where the accused resides beyond the Magistrate's area (CrPC 202(1) as amended in 2005). Sub-section level.
- Definition of "complaint": Section 2(1)(h) BNSS (CrPC 2(d)). Not used in signed text.
- Section 531 BNSS: the procedural switch rests on sub-section (2)(a) (pending appeal, application, trial, inquiry or investigation continues under CrPC). Confirm the reading; see Notes.
- Delhi court designation after BNSS (Metropolitan Magistrate retained in practice?). Table marks CrPC 16-19 as repealed. Kept as free text.

## Notes for Ajay

- **The switch.** Replaced by T-245 (Ajay ruling): the case begins with this complaint, so procedure is BNSS and BSA; `offence_date` drives only the offence code (S-text).
- **Risk — test.** T-239's lead test checks "every BNS/BNSS/BSA citation in `config/sections/`". Section numbers here are bare (`210`), so it passes. If you prefer `210(1)(a)` as the number, the test must match on the base section.
- **Risk.** No affidavit is required by statute for a private complaint; some district courts ask for one in practice. Not added. Confirm for Bihar/Jharkhand/UP/Delhi.
- Acceptable: no witness or document is invented; both clauses blank out when the brief is silent.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Approved. The public-servant question and its blank are approved as written; the 223(1) proviso and 223(2) are court procedure and are not drafted. Procedure is always BNSS and BSA (the case begins with this complaint). |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
