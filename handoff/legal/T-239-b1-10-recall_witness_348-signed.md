# T-239 b1 #10 recall_witness_348 (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 311 -> BNSS 348 ("Power to summon material witness, or examine person present"), CrPC 484 -> BNSS 531.

| Field | Value |
|---|---|
| id | `recall_witness_348` |
| displayName | Application to Summon / Recall / Re-examine a Witness |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/recall_witness_348.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "348", "description": "Power to summon material witness, or examine person present" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "311", "description": "Power to summon material witness, or examine person present" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{prosecution} ... Prosecution / Complainant\nVERSUS\n{accused} ... Accused\n\nAPPLICATION ON BEHALF OF: {applicant} ({applicant_role})",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant (Accused / Prosecution / Complainant)" },
    { "role": "respondent", "label": "Opposite party" }
  ],
  "caseNomenclature": "{case_type} No. {case_number}\nAPPLICATION UNDER {governing_provision} TO {relief_verb} A WITNESS"
}
```

`{relief_verb}` set by code from `relief_type`: SUMMON / RECALL AND RE-EXAMINE / RECALL.

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, offences and present stage of the case, as the brief gives them." },
  { "id": "witness_particulars", "name": "Witness Particulars", "required": true, "description": "Name and description of the witness (PW/DW number if examined), and the date(s) of earlier examination, as the brief gives them." },
  { "id": "points", "name": "Points for Examination", "required": true, "description": "The specific points, questions or documents on which the witness is to be examined, as the brief gives them; blank if not given." },
  { "id": "reasons", "name": "Why the Evidence Is Needed", "required": true, "description": "The reasons the brief gives, written as submissions; and why the points were not put earlier, only as the brief gives it." },
  { "id": "earlier_applications", "name": "Earlier Applications", "required": true, "description": "Every earlier application in this case to summon or recall this or any witness, with date and result; or the blank where the brief is silent." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) {relief_prayer} {witness_name} in {case_type} No. {case_number}, under {governing_provision}, on the points set out in this application;
b) Fix a date for the purpose and direct issue of summons to the witness, if required;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{relief_prayer}` set by code: "Summon and examine as a witness" / "Recall and re-examine the witness" / "Recall for further cross-examination the witness".

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the applicant above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Applicant
```

(Where the applicant is the State through the Prosecutor, the system omits this verification; see Notes 1.)

## filingChecklist

```json
[
  "Application (original + copy for the opposite party)",
  "Affidavit, if the court requires one",
  "Copy of the deposition of the witness (if already examined)",
  "Copy of the document(s) to be put to the witness, if any",
  "Copy of the order sheet showing the present stage",
  "Process fee / summons cue as per court practice (not computed by Lawie)",
  "Vakalatnama (if not already on record)"
]
```

## promptInstructions

```json
[
  "Draft an application to summon a person as a witness, or to recall and re-examine (or further cross-examine) a witness already examined.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Identify the witness and any earlier examination (date, PW/DW number) exactly as the BRIEF gives them.",
  "Set out the points on which the witness is to be examined as the BRIEF gives them, as numbered sub-points. If none are given, write [To be confirmed: the points on which the witness is to be examined].",
  "State why the evidence is needed only as the BRIEF gives it, and write it as a submission ('It is submitted that ...'). Do not add reasons.",
  "State why the points were not put earlier only if the BRIEF gives the reason. Do not attribute an omission to counsel or anyone else unless the BRIEF does.",
  "Do not state that the application is not to fill a lacuna, that no prejudice will be caused, or that it is not filed to delay, unless the BRIEF states it.",
  "State every earlier application to summon or recall a witness in this case that the BRIEF mentions, with date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application to summon or recall a witness was made in this case, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title, verification |
| applicant_role | Applicant is | select (Accused; Complainant; Prosecution through Prosecutor) | yes | cause title; verification on/off |
| applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / number / textarea | yes unless Prosecution | verification |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| case_type / case_number | Case type and number | text | yes | nomenclature |
| prosecution / accused | Parties as in cause title | text | yes | cause title |
| fir_date | Date of FIR, or of complaint | date | yes | old/new law switch |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| offences_alleged | Offences (sections, with Act) | textarea | yes | particulars |
| case_stage | Stage | select (Prosecution evidence; Statement of accused; Defence evidence; Final arguments; Other) | yes | particulars |
| relief_type | Relief | select (Summon a new witness; Recall and re-examine; Recall for further cross-examination) | yes | prayer, nomenclature |
| witness_name | Witness name | text | yes | prayer |
| witness_description | Witness description (PW/DW no., address) | text | no | particulars |
| witness_examined_date | Date(s) of earlier examination | text | no | particulars |
| points_for_examination | Points / documents to put to the witness | textarea | yes | points clause |
| why_essential | Why the evidence is needed | textarea | yes | reasons, submission unlock |
| reason_not_asked_earlier | Why not put earlier | textarea | no | averment unlock |
| earlier_applications | Earlier applications to summon / recall (date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "recall_witness_348",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "essential_to_just_decision", "kind": "submission", "what": "The evidence is essential to the just decision of the case", "phrases": ["essential to the just decision of the case", "necessary for the just decision", "vital witness"], "unlocked_by": { "key": "why_essential", "label": "Why the evidence is needed", "present": true } },
    { "id": "omission_explained", "kind": "averment", "what": "Why the points were not put earlier", "phrases": ["due to inadvertence of the counsel", "could not be put due to oversight", "previous counsel failed to", "galti se reh gaya"], "unlocked_by": { "key": "reason_not_asked_earlier", "label": "Why not put earlier", "present": true } },
    { "id": "not_filling_lacuna", "kind": "submission", "what": "The application is not to fill a lacuna", "phrases": ["not to fill up any lacuna", "not intended to fill gaps in the case"], "unlocked_by": null },
    { "id": "no_prejudice", "kind": "submission", "what": "No prejudice to the other side", "phrases": ["no prejudice will be caused", "the opposite party will not be prejudiced"], "unlocked_by": null },
    { "id": "not_to_delay", "kind": "submission", "what": "The application is not filed to delay", "phrases": ["not filed to delay the trial", "bona fide and not for delay"], "unlocked_by": null },
    { "id": "no_earlier_application", "kind": "averment", "what": "No earlier application to summon or recall", "phrases": ["no such application was filed earlier", "this is the first application under section 311", "this is the first application under section 348"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier applications to summon / recall", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "essential_to_just_decision", "kind": "submission", "averment": "it is submitted that the evidence of the witness is needed because {{why_essential}}", "requires": { "key": "why_essential", "label": "Why the evidence is needed", "present": true } },
    { "id": "omission_explained", "kind": "averment", "averment": "the points were not put to the witness earlier because {{reason_not_asked_earlier}}", "requires": { "key": "reason_not_asked_earlier", "label": "Why not put earlier", "present": true } },
    { "id": "no_earlier_application", "kind": "averment", "averment": "no earlier application to summon or recall a witness has been made in this case", "requires": { "key": "earlier_applications", "label": "Earlier applications to summon / recall", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- Whether BNSS 348 wording is identical to CrPC 311, including the second limb ("shall summon and examine ... if his evidence appears to it to be essential to the just decision of the case"). The allowed submission avoids quoting that phrase for this reason.
- Interplay with BSA provisions on recall / further cross-examination (IEA 138 equivalent). Not cited.

## Notes for Ajay

1. **Risk.** Prosecution applications are signed by the Prosecutor with no verification. Lead must suppress the verification block when `applicant_role = Prosecution`; otherwise the draft has a false verification.
2. **Risk.** Accused's recall applications after change of counsel are the common case; "inadvertence of counsel" is banned until the advocate types the reason. Intentional.
3. I named the "essential to the just decision" entry with an allowed twin that does not echo the statutory phrase, pending your check of BNSS 348 text.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Spec as amended | Approved |
| When the Prosecutor files, the verification block is left out | Condition: the lead builds it and tests it |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
