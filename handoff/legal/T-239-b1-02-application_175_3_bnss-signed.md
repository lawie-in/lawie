# T-239 b1 #2 application_175_3_bnss (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `application_175_3_bnss` |
| displayName | Application to Magistrate for Direction to Investigate (BNSS 175(3)) |
| category (T-240) | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm"]` |
| Ink | L = 2 |
| Anushka tier | B (court filing) |
| averments file | `_averments/application_175_3_bnss.json`, own file, `inherits: null`. Shares ids with #1 by copy, not by inheritance (one level only; #1 is not a parent) |

## relevantActs

Section-level mappings confirmed in `crpc-to-bnss.json` (154→173, 156→175, 190→210). Sub-sections (173(4), 175(3)) are from the bare act; checked by Ajay (rulings B).

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "173", "description": "Information in cognizable cases; sub-section (4): substance of information sent to the Superintendent of Police on refusal to record it" },
      { "number": "175", "description": "Police officer's power to investigate cognizable cases; sub-section (3): Magistrate empowered under Section 210 may order investigation, after considering the application under Section 173(4) supported by an affidavit" },
      { "number": "210", "description": "Cognizance of offences by Magistrates" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "154", "description": "Information in cognizable cases" },
      { "number": "156", "description": "Police officer's power to investigate cognizable cases" },
      { "number": "190", "description": "Cognizance of offences by Magistrates" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}, {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Informant\nVERSUS\n{proposedAccusedList} ... Proposed Accused\n\nPolice Station: {policeStation}\nOffence(s): {offencesCited}",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant/Informant" },
    { "role": "respondent", "label": "Proposed Accused" }
  ],
  "caseNomenclature": "MISC. CRIMINAL APPLICATION No. _____ of [YEAR]\n(Application under {governing_provision})"
}
```

Procedure (T-245, Ajay ruling): the case begins with this application, so the procedure is always BNSS and BSA. No `fir_date` and no `procedure_code`; code sets `PROCEDURE CODE: BNSS and BSA` and fills `{governing_provision}` (and the `GOVERNING PROVISION` line) with `Section 175(3) of the Bharatiya Nagarik Suraksha Sanhita, 2023`.

Nomenclature ("Misc. Criminal Application" / "Complaint Case" / "Misc. Case") differs by district: court-rules overlay, not this pack.

## mandatoryClauses

```json
[
  { "id": "applicant_particulars", "name": "Applicant", "required": true, "description": "Name, parentage, age and address of the applicant, and how the applicant is connected to the occurrence, as the brief gives them" },
  { "id": "proposed_accused", "name": "Proposed Accused", "required": true, "description": "Each person named: name, parentage, address and what the brief says that person did; or the blank" },
  { "id": "facts_of_offence", "name": "Facts Disclosing a Cognizable Offence", "required": true, "description": "Date, time, place and acts alleged, as the brief gives them, and the sections the brief gives. No cause, motive or detail the brief does not give" },
  { "id": "information_to_police", "name": "Information to Officer in Charge", "required": true, "description": "Date and mode the information was given to the officer in charge of the police station, and what the officer did, as the brief gives them; or the blank" },
  { "id": "sp_application", "name": "Application to Superintendent of Police", "required": true, "description": "Date the substance of the information was sent to the Superintendent of Police, how it was sent, the proof of sending, and any response, as the brief gives them. Where the brief does not say it was sent: [To be confirmed: date and mode of sending the information to the Superintendent of Police, and proof of sending]" },
  { "id": "affidavit_support", "name": "Supporting Affidavit", "required": true, "description": "A sentence that the application is supported by the applicant's affidavit, filed with it. The affidavit itself is a separate document and is not drafted here" },
  { "id": "investigation_needed", "name": "Need for Police Investigation", "required": true, "description": "Why investigation by the police is needed, only on the grounds the brief gives (for example evidence to be collected that the applicant cannot collect). Written as submissions" },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Every earlier application, complaint, FIR or case on the same facts that the brief mentions, with forum, number, date and result or that it is pending. Where the brief mentions none: [To be confirmed: whether any application, complaint or other proceeding on the same facts was made or is pending, where, and with what result]. Never state that there is none unless the brief says so" }
]
```

## prayerTemplate

```
PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) direct the officer in charge of Police Station {policeStation} to register the information of the applicant and investigate the case, under {governing_provision};
b) call for such report from the police as this Hon'ble Court may deem necessary; and
c) pass any other order that this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, {applicantParentage}, aged about {applicantAge} years, resident of {applicantAddress}, the applicant above-named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief. No part of it is false and nothing material has been concealed therein.

Verified at {place} on {date}.

Applicant
```

## filingChecklist

```json
[
  "Application signed by the applicant",
  "Affidavit of the applicant in support of the application — separate document, sworn as the court requires",
  "Copy of the information given to the officer in charge, with proof of giving it (receipt or postal proof), if any",
  "Copy of the application sent to the Superintendent of Police, with postal receipt / acknowledgment",
  "Any reply of the police or the Superintendent of Police",
  "Documents relied on, with copies",
  "Electronic records relied on: certificate under Section 63 BSA — check",
  "Court fee as applicable — {{MISSING}}",
  "Vakalatnama"
]
```

## promptInstructions

```json
[
  "Draft an application to the Magistrate asking for a direction to the police to investigate, after the officer in charge did not record the information and the Superintendent of Police was approached.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Set out in order: the occurrence; the information given to the officer in charge and what the officer did; the sending of the information to the Superintendent of Police, with the date, the mode and the proof; and what followed. Each as the BRIEF gives it.",
  "Do not say that the officer in charge refused, or that the Superintendent of Police did nothing, unless the BRIEF says so. Where the BRIEF does not say, write the blank.",
  "Do not say that the information discloses a cognizable offence except as a submission resting on the facts stated.",
  "State that the application is supported by the applicant's affidavit. Do not write the affidavit.",
  "State every earlier application, complaint, FIR or case on the same facts that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any application, complaint or other proceeding on the same facts was made or is pending, where, and with what result].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (4 states) | yes | Court rules overlay |
| court_designation | Court | text | yes | Cause title |
| court_place | Court place / district | text | yes | Cause title |
| applicant_name / applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / text / number / textarea | yes / yes / no / yes | Cause title, verification |
| applicant_connection | Applicant's connection to the occurrence (victim, relative, witness) | text | yes | Applicant clause |
| proposed_accused | Persons named (repeat: name, parentage, address, role) | repeater | no | Cause title, accused clause |
| offence_date | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| offence_place | Place of occurrence | text | yes | Facts |
| police_station | Police station | text | yes | Prayer, cause title |
| offences_alleged | Offences (code labelled by offence_date) | textarea | yes | Facts, cause title |
| facts | What happened | textarea | yes | Facts clause |
| info_to_police_date | Date information given to officer in charge | date | no | Police clause |
| info_to_police_mode | How given (in person, written, post, e-mail, other) | select | no | Police clause |
| police_response | What the officer in charge did | textarea | no | Police clause; unlocks `police_refusal` |
| sp_sent_date | Date sent to Superintendent of Police | date | yes | SP clause (blank if empty) |
| sp_sent_mode | How sent to SP (registered post, speed post, by hand, e-mail, other) | select | yes | SP clause; statute requires writing and post: see Verify |
| sp_proof | Proof of sending held (postal receipt, acknowledgment, none) | select | yes | Checklist, SP clause |
| sp_response | Any response from SP / police after that | textarea | no | Unlocks `sp_no_action` |
| investigation_grounds | Why police investigation is needed | textarea | no | Investigation clause |
| affidavit_ready | Is the applicant's supporting affidavit ready? | select (yes, no) | yes | Checklist cue only |
| earlier_proceedings | Earlier proceedings on the same facts ("none" or particulars) | textarea | no | Disclosure clause |
| advocate_name / advocate_enrollment | Advocate | text | yes | Signature block |

## _averments

```json
{
  "pack": "application_175_3_bnss",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "police_refusal",
      "kind": "averment",
      "what": "The officer in charge refused or failed to record the information",
      "phrases": ["the officer in charge refused to register the FIR", "the police refused to lodge the FIR", "no FIR was registered despite", "thanedar ne FIR nahi likhi"],
      "unlocked_by": { "key": "police_response", "label": "What the officer in charge did", "present": true }
    },
    {
      "id": "sp_no_action",
      "kind": "averment",
      "what": "The Superintendent of Police took no action",
      "phrases": ["the Superintendent of Police took no action", "no action has been taken till date", "the SP did not respond", "SP sahab ne kuch nahi kiya"],
      "unlocked_by": { "key": "sp_response", "label": "Any response from SP / police after that", "present": true }
    },
    {
      "id": "sp_received",
      "kind": "averment",
      "what": "The Superintendent of Police received the application",
      "phrases": ["duly received by the office of the Superintendent of Police", "the SP received the application", "was served on the Superintendent of Police"],
      "unlocked_by": { "key": "sp_proof", "label": "Proof of sending held", "not_in": ["none", "no", "nil"] }
    },
    {
      "id": "cognizable_offence_disclosed",
      "kind": "submission",
      "what": "The information discloses a cognizable offence",
      "phrases": ["clearly discloses a cognizable offence", "a cognizable offence is made out", "prima facie cognizable offence"],
      "unlocked_by": { "key": "facts", "label": "What happened", "present": true }
    },
    {
      "id": "intention_of_accused",
      "kind": "averment",
      "what": "The intention or knowledge of the proposed accused",
      "phrases": ["with dishonest intention", "with common intention", "knowingly and deliberately", "with mala fide intention", "jaan boojh kar"],
      "unlocked_by": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true }
    },
    {
      "id": "police_collusion",
      "kind": "averment",
      "what": "The police are in collusion with or influenced by the accused",
      "phrases": ["in collusion with the accused", "under the influence of the accused", "police mili hui hai"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "police_refusal", "kind": "averment", "averment": "{{police_response}}", "requires": { "key": "police_response", "label": "What the officer in charge did", "present": true } },
    { "id": "sp_no_action", "kind": "averment", "averment": "{{sp_response}}", "requires": { "key": "sp_response", "label": "Any response from SP / police after that", "present": true } },
    { "id": "sp_received", "kind": "averment", "averment": "the application was sent to the Superintendent of Police and the applicant holds {{sp_proof}}", "requires": { "key": "sp_proof", "label": "Proof of sending held", "not_in": ["none", "no", "nil"] } },
    { "id": "cognizable_offence_disclosed", "kind": "submission", "averment": "It is submitted that the facts stated above disclose the commission of a cognizable offence", "requires": { "key": "facts", "label": "What happened", "present": true } },
    { "id": "intention_of_accused", "kind": "averment", "averment": "{{intention_particulars}}", "requires": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true } }
  ]
}
```

Note: `sp_received` allowed text says "sent" and "holds proof", not "received": proof of posting is not proof of receipt.

## Verify (not in signed text)

- Wording "in writing and by post" in Section 173(4) BNSS: confirm.
- Whether the affidavit in 175(3) must support the application to the Magistrate, the application to the SP under 173(4), or both. Text reads "the application supported by an affidavit made under sub-section (4) of section 173". See Notes.
- Section 175(3) BNSS: Magistrate "after making such inquiry as he thinks necessary and submission made in this regard by the police officer". Prayer (b) is drafted to fit; confirm.
- Section 175(4) BNSS: separate procedure where the complaint is against a public servant for acts in discharge of duty. Needs an exclusion question or a separate id.
- Section 173(3) BNSS (preliminary enquiry for offences punishable 3 to 7 years). Relevant to "police did not register": not cited.
- Signed table `crpc-to-bnss.json` `new_provisions` labels 173(3) as "E-FIR" and 176(2) as "preliminary inquiry". From knowledge, e-communication is in 173(1) and preliminary enquiry is 173(3). Not used here; flag for the table owner.
- Switch reading of Section 531(2)(a) BNSS, as in #1.

## Notes for Ajay

- **Risk — affidavit.** Safest reading: the applicant's affidavit supports the 175(3) application, and the 173(4) application is shown to have been made. I made the affidavit a checklist item and a mandatory sentence, never drafted here (rule 9: no second document). If you read 175(3) as requiring the SP application itself to be on affidavit, #3 needs an affidavit cue too; I put a soft cue there.
- **Risk — no "refused" by default.** Many briefs will just say "thana ne FIR nahi likhi". That comes in through `police_response`; without it the Drafter writes a blank. Intended.
- **Acceptable.** No "in the alternative, treat as complaint under Section 223" prayer. It is tactical and changes the procedure; add only as an optional prayer line on a form toggle if you approve the wording.
- Switch: T-245, as #1 (procedure always BNSS and BSA).


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Approved. The affidavit supports the application to the Magistrate (BNSS 175(3) text); it stays a required checklist item and a required sentence; the affidavit itself is not drafted. The check that the substance of the information was sent to the Superintendent of Police "in writing and by post" stays as a checklist item. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
