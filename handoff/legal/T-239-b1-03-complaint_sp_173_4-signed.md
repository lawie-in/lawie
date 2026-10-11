# T-239 b1 #3 complaint_sp_173_4 (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `complaint_sp_173_4` |
| displayName | Complaint to Superintendent of Police on Refusal of FIR (BNSS 173(4)) |
| category (T-240) | Criminal: complaints, police, trial applications |
| court_levels | `[]` (addressed to the Superintendent of Police, not a court; no court-rules overlay) |
| Ink | S = 1 |
| Anushka tier | C (letter/notice). Note: it is the precondition for #2, so a defect costs the client the 175(3) route |
| averments file | `_averments/complaint_sp_173_4.json`, own file, `inherits: null` |

## relevantActs

Section-level mapping confirmed in `crpc-to-bnss.json` (154→173). Sub-section (4) from the bare act; checked by Ajay (rulings B).

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "173", "description": "Information in cognizable cases; sub-section (4): person aggrieved by refusal of the officer in charge to record information may send its substance to the Superintendent of Police" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "154", "description": "Information in cognizable cases" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "To,\nThe {addresseeDesignation},\n{spDistrict}\n\nFrom,\n{applicant}\n{applicantAddress}\n\nSubject: Substance of information of cognizable offence(s) under {offencesCited}, Police Station {policeStation}, sent under {governing_provision}\n\nSir/Madam,",
  "partyDesignations": [
    { "role": "applicant", "label": "Informant / Person aggrieved" },
    { "role": "respondent", "label": "Superintendent of Police" }
  ],
  "caseNomenclature": "N/A"
}
```

Procedure (T-245, Ajay ruling): the case begins with this filing, so the procedure is always BNSS and BSA. No `fir_date` and no `procedure_code`; code sets `PROCEDURE CODE: BNSS and BSA` and fills `{governing_provision}` (and the `GOVERNING PROVISION` line) with `Section 173(4) of the Bharatiya Nagarik Suraksha Sanhita, 2023`.

`{addresseeDesignation}` comes from the form: free text, default "Superintendent of Police", label hint "or the Deputy Commissioner of Police in a commissionerate" (Ajay ruling). See Verify.

## mandatoryClauses

```json
[
  { "id": "informant_particulars", "name": "Informant", "required": true, "description": "Name, parentage, address and phone of the informant, and the informant's connection to the occurrence, as the brief gives them" },
  { "id": "substance_of_information", "name": "Substance of the Information", "required": true, "description": "Date, time, place of occurrence, persons named and what each did, and the sections the brief gives. No cause, motive or detail the brief does not give" },
  { "id": "approach_to_officer", "name": "Approach to Officer in Charge", "required": true, "description": "Date and mode the information was given at Police Station {policeStation} and what the officer in charge did, as the brief gives them; or [To be confirmed: date the information was given at the police station and what the officer in charge did]" },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Any earlier FIR, complaint, application or case on the same facts that the brief mentions, with forum, date and result. Where the brief mentions none: [To be confirmed: whether any FIR, complaint or other proceeding on the same facts was made or is pending]. Never state that there is none unless the brief says so" }
]
```

## prayerTemplate

```
It is, therefore, requested that you may kindly be pleased to investigate the case yourself or direct an investigation to be made by a police officer subordinate to you, in accordance with {governing_provision}, and to inform the undersigned of the action taken.

Enclosures: as listed below.

Yours faithfully,

{applicant}
Date: {date}
Place: {place}
```

Advocate signature block: suppressed for this id (Ajay ruling). The letter is signed by the informant.

## verificationTemplate

```
```

(Empty. A letter to the SP is not a verified pleading. See Notes on the affidavit question.)

Subject line is deliberately neutral: it does not say the officer refused. That fact comes only from `police_response`.

## filingChecklist

```json
[
  "Signed by the informant",
  "Send in writing by post: registered post / speed post with acknowledgment — keep the postal receipt and tracking record",
  "Copy kept, with the postal receipt stapled to it (needed for an application under Section 175(3) BNSS)",
  "Copy of the written information given at the police station and any receipt, if any",
  "Documents relied on (copies only)",
  "Affidavit of the informant — check whether it is wanted (see Ajay's note); not drafted here"
]
```

## promptInstructions

```json
[
  "Draft a short letter to the Superintendent of Police sending the substance of information of a cognizable offence that the officer in charge of the police station has not recorded.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Write about five to eight numbered paragraphs: who the informant is; what happened, when and where; who did what; when and how the information was given at the police station and what the officer in charge did; and any earlier proceeding.",
  "Do not say that the officer in charge refused unless the BRIEF says so. Where the BRIEF does not say, write the blank.",
  "Do not threaten proceedings against any police officer and do not allege collusion unless the BRIEF says so.",
  "State any earlier FIR, complaint or proceeding on the same facts that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any FIR, complaint or other proceeding on the same facts was made or is pending].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (4 states) | yes | Addressee designation hint |
| addressee_designation | Addressed to (default "Superintendent of Police"; hint: or the Deputy Commissioner of Police in a commissionerate) | text | yes | Cause title; commissionerate districts |
| sp_district | District / police district | text | yes | Cause title |
| applicant_name / applicant_parentage / applicant_address | Informant | text / text / textarea | yes | Cause title, informant clause |
| applicant_phone | Phone | text | no | Informant clause |
| applicant_connection | Connection to the occurrence | text | yes | Informant clause |
| offence_date | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| offence_place | Place of occurrence | text | yes | Substance clause |
| police_station | Police station | text | yes | Subject, approach clause |
| offences_alleged | Offences (code labelled by offence_date) | textarea | no | Subject; blank if empty |
| named_persons | Persons named (repeat: name, address, role) | repeater | no | Substance clause |
| facts | What happened | textarea | yes | Substance clause |
| info_to_police_date | Date information given at police station | date | no | Approach clause |
| info_to_police_mode | How given | select | no | Approach clause |
| police_response | What the officer in charge did | textarea | no | Unlocks `police_refusal` |
| earlier_proceedings | Earlier proceedings ("none" or particulars) | textarea | no | Disclosure clause |
| advocate_name / advocate_enrolment | Advocate (if sent through counsel) | text | no | Not printed: advocate signature block suppressed for this id (Ajay ruling) |

## _averments

```json
{
  "pack": "complaint_sp_173_4",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "police_refusal",
      "kind": "averment",
      "what": "The officer in charge refused or failed to record the information",
      "phrases": ["the officer in charge refused to register the FIR", "the police refused to lodge the FIR", "the SHO did not record the information", "thanedar ne FIR nahi likhi"],
      "unlocked_by": { "key": "police_response", "label": "What the officer in charge did", "present": true }
    },
    {
      "id": "police_collusion",
      "kind": "averment",
      "what": "The police are in collusion with or influenced by the accused",
      "phrases": ["in collusion with the accused", "under the influence of the accused", "hand in glove with", "police mili hui hai"],
      "unlocked_by": null
    },
    {
      "id": "intention_of_accused",
      "kind": "averment",
      "what": "The intention or knowledge of the persons named",
      "phrases": ["with dishonest intention", "with common intention", "knowingly and deliberately", "jaan boojh kar"],
      "unlocked_by": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true }
    }
  ],
  "allowed": [
    { "id": "police_refusal", "kind": "averment", "averment": "{{police_response}}", "requires": { "key": "police_response", "label": "What the officer in charge did", "present": true } },
    { "id": "intention_of_accused", "kind": "averment", "averment": "{{intention_particulars}}", "requires": { "key": "intention_particulars", "label": "What shows the accused's intention", "present": true } }
  ]
}
```

## Verify (not in signed text)

- The words "in writing and by post" in Section 173(4) BNSS. From bare-act knowledge.
- Whether the proviso/tail of 173(4) ("failing which such aggrieved person may make an application to the Magistrate") is as remembered. Not used in signed text.
- Commissionerate districts in UP (e.g. Lucknow, Kanpur, Varanasi, others) and Delhi: is the Deputy Commissioner of Police the "Superintendent of Police concerned" for 173(4)? Ranchi: confirm whether a commissionerate exists. Addressee is a form choice, not asserted.
- Whether a 173(4) application must be on affidavit (reading of 175(3)): see #2.

## Notes for Ajay

- **Risk.** The prayer block carries "Yours faithfully, {applicant}". The system's advocate signature block would put a second signature under it. Recommend the lead suppresses the advocate block for this id, or makes it "Through: {advocateName}, Advocate" when advocate fields are filled.
- **Risk.** Commissionerate addressee is a real practice gap for Lucknow/Kanpur/Delhi users. A wrong addressee may let the court say 173(4) was not complied with.
- **Acceptable.** No verification and no affidavit drafted. The checklist cue keeps the affidavit question in front of the advocate until you settle the 175(3) reading.
- Switch: T-245, as #1 (procedure always BNSS and BSA).


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. The advocate signature block is suppressed for this id: the letter is signed by the informant. The addressee is free text, default "Superintendent of Police", hint "or the Deputy Commissioner of Police in a commissionerate". Lead builds the suppression and tests it. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
