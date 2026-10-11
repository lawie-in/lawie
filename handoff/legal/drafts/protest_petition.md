# T-239 b1 #6 protest_petition (draft for Ajay)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `protest_petition` |
| displayName | Protest Petition against Final / Closure Report |
| category (T-240) | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm"]` |
| Ink | L = 2 |
| Anushka tier | B (court filing). Arguable A: if the report is accepted without protest the informant's remedy narrows. Ajay: Tier B |
| averments file | `_averments/protest_petition.json`, own file, `inherits: null` |

## relevantActs

Section-level, confirmed by the signed table `crpc-to-bnss.json` (173→193, 190→210). Ajay ruling: 193 and 210 at section level; not 223.

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "193", "description": "Report of police officer on completion of investigation" },
      { "number": "210", "description": "Cognizance of offences by Magistrates" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "173", "description": "Report of police officer on completion of investigation" },
      { "number": "190", "description": "Cognizance of offences by Magistrates" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}, {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{informant} ... Informant/Protest Petitioner\nVERSUS\nState of {state} and others ... Opposite Parties\n\nArising out of FIR No. {firNumber} dated {firDate}, Police Station {policeStation}\nOffence(s): {offencesCited}",
  "partyDesignations": [
    { "role": "applicant", "label": "Informant/Protest Petitioner" },
    { "role": "respondent", "label": "Opposite Parties (State and accused)" }
  ],
  "caseNomenclature": "{caseRef}\n\nPROTEST PETITION AGAINST THE {reportNameUpper} SUBMITTED BY THE POLICE"
}
```

`{reportName}` from the form: "final report", "final form", "closure report", "cancellation report" (district usage differs; the form offers the advocate's term). `{caseRef}` is the court's case / G.R. / C.R. number as typed, or `Case No. _____ of [YEAR]`.

## mandatoryClauses

```json
[
  { "id": "informant_particulars", "name": "Informant", "required": true, "description": "Name, parentage and address of the petitioner, and that the petitioner is the informant or victim, as the brief gives it" },
  { "id": "fir_particulars", "name": "FIR Particulars", "required": true, "description": "FIR number, date, police station, sections and persons named, as the brief gives them" },
  { "id": "report_particulars", "name": "The Police Report", "required": true, "description": "Date of the report, what it says (for example mistake of fact, mistake of law, insufficient evidence, or the brief's words), and when and how the petitioner came to know of it or received notice, as the brief gives them; or blanks for each" },
  { "id": "grounds", "name": "Grounds of Protest", "required": true, "description": "Each ground the brief gives (for example a witness not examined, a document or medical report not collected, a statement not considered), as a separate sub-paragraph, as submissions. No ground the brief does not give" },
  { "id": "material_on_record", "name": "Material on Record", "required": true, "description": "The statements, documents and reports that the brief says support the allegations, each named as the brief names it; or the blank" },
  { "id": "witnesses_documents", "name": "Witnesses and Documents of the Petitioner", "required": true, "description": "The witnesses and documents the petitioner offers, as the brief lists them; or the blank" },
  { "id": "relief_basis", "name": "Relief Sought", "required": true, "description": "Which of the reliefs in the prayer the petitioner seeks, as the brief selects them, with the reasons the brief gives" },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Any earlier protest petition, application for a direction to investigate, complaint, or petition to a higher court on the same FIR that the brief mentions, with forum, date and result. Where the brief mentions none: [To be confirmed: whether any earlier protest petition, application, complaint or petition on this FIR was made or is pending, where, and with what result]. Never state that there is none unless the brief says so" }
]
```

## prayerTemplate

```
PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) not accept the {reportName} dated {reportDate} submitted by the police in the above case;
{reliefLines}
and pass any other order that this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the petitioner shall ever pray.
```

`{reliefLines}`: code builds lettered lines (b), (c) ... from `relief_sought` (multi-select), each one of:

| option | line |
|---|---|
| cognizance | `take cognizance of the offence(s) under {offencesCited} on the material on record and issue process against the accused;` |
| further_investigation | `direct further investigation in the case;` |
| treat_as_complaint | `treat this protest petition as a complaint, examine the petitioner and the witnesses present, and proceed in accordance with law;` |
| copies | `direct that the petitioner be supplied copies of the {reportName} and the statements and documents relied on in it;` |

No section numbers in the prayer (pending your verification).

## verificationTemplate

```
VERIFICATION

I, {informant}, {informantParentage}, aged about {informantAge} years, resident of {informantAddress}, the petitioner above-named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above petition are true and correct to my knowledge and belief. No part of it is false and nothing material has been concealed therein.

Verified at {place} on {date}.

Petitioner
```

## filingChecklist

```json
[
  "Copy of the FIR",
  "Copy of the police report, if received, and of any notice to the informant",
  "Application for certified copies of the report and case papers, if not yet received",
  "Affidavit of the petitioner, if the court requires it — separate document",
  "List of witnesses and documents, with copies",
  "Electronic records relied on: certificate under Section 63 BSA (Section 65B Indian Evidence Act) — check",
  "Court fee as applicable — {{MISSING}}",
  "Vakalatnama",
  "Date fixed by the court for hearing the informant on the report — note it"
]
```

## promptInstructions

```json
[
  "Draft a protest petition by the informant against the report the police submitted on completion of investigation, asking the Magistrate not to accept it.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Call the report by the name the BRIEF gives it. Do not call it a charge sheet and do not say what kind of report it is unless the BRIEF says so.",
  "Set out the FIR, the investigation as the BRIEF describes it, the report and how the petitioner came to know of it, and then the grounds.",
  "State each ground of protest that the BRIEF gives as a separate sub-paragraph, written as a submission. Do not add a lapse in the investigation that the BRIEF does not give.",
  "Do not allege that the investigating officer was biased, bribed or in collusion with the accused unless the BRIEF says so.",
  "Name the statements, documents and witnesses the BRIEF gives. Do not describe what a statement or document says beyond what the BRIEF gives.",
  "State every earlier protest petition, application, complaint or petition on this FIR that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier protest petition, application, complaint or petition on this FIR was made or is pending, where, and with what result].",
  "Do not say that the petition is within time or that the court is bound to hear the informant.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (4 states) | yes | Court rules overlay |
| court_designation / court_place | Court, place | text | yes | Cause title |
| case_ref | Court case / G.R. / C.R. number, if any | text | no | Cause title |
| informant_name / informant_parentage / informant_age / informant_address | Petitioner | text / text / number / textarea | yes / yes / no / yes | Cause title, verification |
| informant_role | Petitioner is (informant, victim, both, other) | select | yes | Informant clause |
| fir_number / police_station | FIR | text / text | yes | Cause title |
| fir_date | Date of FIR, or of the complaint if no FIR | date | no | Cause title; procedure switch (T-245) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| offence_date | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| offences_alleged | Offences in the FIR (code labelled by offence_date) | textarea | yes | Cause title, prayer |
| accused_named | Persons named in the FIR | repeater | no | Facts |
| report_name | What the report is called (final report, final form, closure report, cancellation report, other) | select | yes | Cause title, prayer |
| report_date | Date of the report | date | no | Prayer, report clause (blank if empty) |
| report_says | What the report says, as far as known | textarea | no | Report clause |
| report_knowledge | How and when the petitioner learnt of the report / received notice | textarea | no | Report clause; unlocks `notice_of_report` |
| investigation_lapses | Grounds: what the police did not do | textarea | no | Grounds; unlocks `investigation_lapses` |
| material_on_record | Statements / documents on record that support the case | textarea | no | Material clause |
| witnesses / documents | Petitioner's witnesses and documents | repeater | no | Witnesses clause |
| relief_sought | Relief (cognizance, further investigation, treat as complaint, copies) | multi-select | yes | `{reliefLines}` |
| earlier_proceedings | Earlier proceedings on this FIR ("none" or particulars) | textarea | no | Disclosure clause |
| advocate_name / advocate_enrolment | Advocate | text | yes | Signature block |

T-245 Group A. `GOVERNING PROVISION` pairs, by `procedure_code`: CrPC 173 → BNSS 193; CrPC 190 → BNSS 210.

## _averments

```json
{
  "pack": "protest_petition",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "investigation_lapses",
      "kind": "submission",
      "what": "The investigation was perfunctory or defective",
      "phrases": ["the investigation is perfunctory", "the investigating officer failed to examine", "material witnesses were not examined", "no proper investigation was done", "investigation sahi se nahi hua"],
      "unlocked_by": { "key": "investigation_lapses", "label": "Grounds: what the police did not do", "present": true }
    },
    {
      "id": "notice_of_report",
      "kind": "averment",
      "what": "When and how the informant learnt of the report, or that no notice was given",
      "phrases": ["no notice of the final report was given to the informant", "the informant came to know of the report on", "the informant was never informed", "report ki koi khabar nahi di"],
      "unlocked_by": { "key": "report_knowledge", "label": "How and when the petitioner learnt of the report", "present": true }
    },
    {
      "id": "report_contents",
      "kind": "averment",
      "what": "What the police report says",
      "phrases": ["the police have submitted the final report as mistake of fact", "the report says the case is false", "insufficient evidence"],
      "unlocked_by": { "key": "report_says", "label": "What the report says", "present": true }
    },
    {
      "id": "police_collusion",
      "kind": "averment",
      "what": "The investigating officer was biased or in collusion with the accused",
      "phrases": ["in collusion with the accused", "under the influence of the accused", "won over by the accused", "biased investigation", "police mili hui hai"],
      "unlocked_by": null
    },
    {
      "id": "material_supports_case",
      "kind": "submission",
      "what": "The material on record makes out the offence",
      "phrases": ["the material on record clearly makes out", "sufficient material for cognizance", "a prima facie case is made out"],
      "unlocked_by": { "key": "material_on_record", "label": "Statements / documents on record that support the case", "present": true }
    }
  ],
  "allowed": [
    { "id": "investigation_lapses", "kind": "submission", "averment": "It is submitted that {{investigation_lapses}}", "requires": { "key": "investigation_lapses", "label": "Grounds: what the police did not do", "present": true } },
    { "id": "notice_of_report", "kind": "averment", "averment": "{{report_knowledge}}", "requires": { "key": "report_knowledge", "label": "How and when the petitioner learnt of the report", "present": true } },
    { "id": "report_contents", "kind": "averment", "averment": "{{report_says}}", "requires": { "key": "report_says", "label": "What the report says", "present": true } },
    { "id": "material_supports_case", "kind": "submission", "averment": "It is submitted that {{material_on_record}} disclose the commission of the offence(s) alleged", "requires": { "key": "material_on_record", "label": "Statements / documents on record that support the case", "present": true } }
  ]
}
```

## Verify (not in signed text)

- Section 193 BNSS (CrPC 173): police report on completion of investigation; the duty to communicate action taken to the informant (from knowledge: 193(3)(ii) BNSS / 173(2)(ii) CrPC).
- Section 193(9) BNSS (CrPC 173(8)): further investigation, and any new condition on it (from knowledge: leave of court during trial and a time limit). Prayer "direct further investigation" carries no section until confirmed.
- Section 210(1)(b) BNSS (CrPC 190(1)(b)): cognizance on a police report, for the "cognizance" relief; and 223 for "treat as complaint".
- The informant's right to notice and hearing before the report is accepted rests on case law. No judgment named; not stated in signed text.
- Switch: an investigation begun on an FIR before 1 July 2024 continues under CrPC (Section 531(2)(a) BNSS), so the report is under Section 173 CrPC. Courts have read 531 differently; confirm.
- Signed table `new_provisions` entry "193(3): Police report to be filed within 90 days" looks wrong from knowledge (the 90/60-day figures are custody limits in 187(3)). Flag for the table owner; not used here.

## Notes for Ajay

- **Risk.** With ACTS empty the draft will carry `[Section — verify before filing]` in a few places. That is the honest output until you sign the proposed ACTS. Recommend you sign 193/210/223 at section level now; they are table-confirmed and low risk.
- **Risk — "treat as complaint".** Choosing this moves the informant into the complaint procedure (examination on oath). The form should show a one-line cue; legal wording only, not advice.
- **Risk — naming.** Bihar practice "final form" / UP "final report" / Delhi "closure" or "cancellation" report. Form choice, never Drafter guess.
- Tier: I put B. If Anushka's A list is meant to cover any filing where silence forecloses a remedy, move it to A.
