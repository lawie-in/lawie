# T-239 b1 #16 bail_juvenile_jj_12 (draft for Ajay)

Status: DRAFT, not signed. JJ Act section numbers are from knowledge of the bare act (not in any repo table): 4 and 12 as whole sections only. Every sub-section, the definition clauses, and every other JJ Act section are under "Verify". BNSS 531 checked in `crpc-to-bnss.json`.

| Field | Value |
|---|---|
| id | `bail_juvenile_jj_12` |
| displayName | Application for Release on Bail of a Child in Conflict with Law (JJ Act, Section 12) |
| category | Criminal: bail and custody |
| court_levels | `["jjb"]` (Juvenile Justice Board) |
| Ink | L = 2 |
| Anushka tier | A (liberty; child) |
| averments file | `_averments/bail_juvenile_jj_12.json`, `inherits: null` (new file; bail_regular's wording calls the person "accused" / "applicant") |

Vocabulary rule for the whole pack: "child in conflict with law" or "the child"; "apprehended", not "arrested"; "observation home" / "place of safety", not "jail"; "inquiry", not "trial". Never "accused", "juvenile delinquent", "offender" or "criminal".

## relevantActs

```json
[
  {
    "act": "Juvenile Justice (Care and Protection of Children) Act, 2015",
    "sections": [
      { "number": "4", "description": "Juvenile Justice Board" },
      { "number": "12", "description": "Bail to a person who is apparently a child alleged to be in conflict with law" }
    ]
  },
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "531", "description": "Repeal and savings" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "BEFORE THE JUVENILE JUSTICE BOARD, {district}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{child}, a child in conflict with law, through {guardianRelation} {guardian} ... Applicant\nVERSUS\nState of {state} ... Respondent",
  "partyDesignations": [
    { "role": "applicant", "label": "Child in conflict with law, through parent / guardian" },
    { "role": "respondent", "label": "Respondent (State)" }
  ],
  "caseNomenclature": "APPLICATION FOR RELEASE ON BAIL No. _____ of [YEAR]\n(Under Section 12 of the Juvenile Justice (Care and Protection of Children) Act, 2015)\n(In {jjbCaseNumber}, arising out of {firDetails})"
}
```

`{child}` is the name as the brief gives it, or the initials if `use_initials = yes` (Board practice varies; see Notes).

## mandatoryClauses

```json
[
  { "id": "fir_details", "name": "FIR and Board Case Details", "required": true, "description": "FIR number, police station, date, the sections alleged, and the Board's case number, exactly as the brief gives them." },
  { "id": "age_particulars", "name": "Age of the Child", "required": true, "description": "The child's date of birth or age and the document it comes from, only as the brief gives them; the blank where it does not. Never a statement that the child was below eighteen on the date of the offence unless the brief says so." },
  { "id": "apprehension_and_placement", "name": "Apprehension and Present Placement", "required": true, "description": "Date the child was apprehended, date produced before the Board, and where the child is now kept (observation home, place of safety, or with family), as the brief gives them. No count of days." },
  { "id": "section_12_grounds", "name": "Grounds under Section 12", "required": true, "description": "That release is sought under Section 12, and the grounds the brief gives on why release will not bring the child into association with any known criminal, expose the child to moral, physical or psychological danger, or defeat the ends of justice; or the blank." },
  { "id": "family_and_supervision", "name": "Family and Supervision", "required": true, "description": "The parent or guardian who will take the child, and their address and circumstances, only as the brief gives them." },
  { "id": "guardian_undertakings", "name": "Undertakings of Parent / Guardian", "required": true, "description": "Undertakings by the parent or guardian for the future, if the child is released: to keep the child in their care and under supervision, to produce the child before the Board on every date fixed, to keep the child away from any known criminal, to cooperate with the probation officer, and to abide by the conditions imposed. Never a statement of fact." },
  { "id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier application for release on bail of the child in this matter, with the Board or court, the date of the order and the result, or that it is pending; or the blank where the brief does not say." },
  { "id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." },
  { "id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part." }
]
```

`earlier_applications` is T-237 wording adapted ("for release on bail of the child", "Board or court"): new text for your sign.

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Board may graciously be pleased to:

a) Release the child {child}, a child in conflict with law, on bail under Section 12 of the Juvenile Justice (Care and Protection of Children) Act, 2015, in connection with {firDetails}, with or without surety, or place the child under the supervision of a probation officer or under the care of a fit person, on such conditions as this Hon'ble Board may deem fit;
b) Direct that the child be released into the care of {guardianRelation} {guardian};
c) Pass any other order(s) as this Hon'ble Board may deem fit and proper in the best interest of the child.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {guardian}, {guardianRelation} of the child {child}, aged about {guardianAge} years, resident of {guardianAddress}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{guardian}
{guardianRelation} of the child
```

## filingChecklist

```json
[
  "Application, with copies as the Board's practice requires",
  "Vakalatnama signed by the parent / guardian",
  "Copy of FIR",
  "Proof of age of the child, if available (birth certificate, school certificate or other document as instructed)",
  "Copy of any order of the Board on age, if passed",
  "Copy of the social investigation report / probation officer's report, if supplied",
  "Identity and address proof of the parent / guardian",
  "Copies of earlier bail orders in this matter, if any",
  "Surety documents, only if the Board asks for surety",
  "Court fee / stamp as per local rules, if any (cue only)"
]
```

## promptInstructions

```json
[
  "Draft an application before the Juvenile Justice Board for release on bail of a child in conflict with law under Section 12 of the Juvenile Justice (Care and Protection of Children) Act, 2015, filed through the child's parent or guardian. Cite Section 12 as the provision under which release is sought. Do not cite Section 480, 483 or 482 of the BNSS or Section 437, 439 or 438 of the CrPC.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Call the child 'the child' or 'the child in conflict with law' throughout. Never use the words accused, juvenile delinquent, offender or criminal for the child. Say 'apprehended', not 'arrested'; 'observation home' or 'place of safety', not 'jail'; 'inquiry', not 'trial'.",
  "State the child's date of birth or age, and the document it comes from, only as the BRIEF gives them. Do not work out the child's age on any date. Do not say that the child was below eighteen years on the date of the offence, or that the Board has determined the age, unless the BRIEF says so; otherwise write [To be confirmed: date of birth of the child and the document showing it].",
  "State when the child was apprehended, when produced before the Board, and where the child is now kept, as the BRIEF gives them. Do not work out the number of days.",
  "State that Section 12 provides for release of a child on bail, with or without surety, or under the supervision of a probation officer or the care of a fit person, unless there are reasonable grounds for believing that release is likely to bring the child into association with any known criminal, expose the child to moral, physical or psychological danger, or defeat the ends of justice. Then set out, as submissions, only the grounds the BRIEF gives on why none of these applies. Where the BRIEF gives none, write [To be confirmed: grounds showing that release will not bring the child into association with any known criminal, expose the child to danger, or defeat the ends of justice]. Do not say whether the offence is bailable or non-bailable, petty, serious or heinous.",
  "Describe the child's family, schooling, conduct and circumstances, and the contents of any social investigation or probation officer's report, only as the BRIEF gives them. Do not describe the child's character or the family's standing.",
  "Give the undertakings as undertakings by the parent or guardian for the future, never as facts and never as undertakings by the advocate: the parent or guardian undertakes that, if the child is released, the child will be kept in their care and under their supervision, will be produced before this Hon'ble Board on every date fixed, will be kept away from any known criminal, and that they will cooperate with the probation officer and abide by every condition this Hon'ble Board imposes. Do not make the child give an undertaking.",
  "State every earlier application for release on bail of the child in this matter that the BRIEF mentions: the Board or court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier application for release on bail of the child was made in this matter, to which Board or court, and with what result].",
  "Include no photograph, school name, or other detail identifying the child beyond what the BRIEF gives and the application needs.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Address the Board as 'this Hon'ble Board'. Use formal, respectful, plain language.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `child_name` | Name of the child | text | yes | Cause title, prayer |
| `use_initials` | Show the child's name as initials in the title | select: yes / no | yes | Cause title (Board practice) |
| `child_dob` | Date of birth of the child (as instructed) | date | no | age_particulars; unlocks |
| `age_document` | Document showing date of birth | text | no | age_particulars; unlocks |
| `age_determined_by_board` | Has the Board determined the age? (as instructed) | select: yes / no / not known | no | age_particulars |
| `guardian_name`, `guardian_relation`, `guardian_age`, `guardian_address` | Parent / guardian | text | yes | Cause title, verification, undertakings |
| `fir_number`, `police_station`, `sections_alleged` | FIR | as bail_regular | yes | fir_details |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | fir_details; procedure switch (T-245) |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `jjb_case_number` | Board case number | text | no | Nomenclature |
| `district` | District of the Board | text | yes | Cause title |
| `apprehended_on` | Date apprehended | date | yes | apprehension_and_placement |
| `produced_on` | Date produced before the Board | date | no | apprehension_and_placement |
| `present_placement` | Where the child is now | select: observation home / place of safety / with family / other | yes | apprehension_and_placement; unlocks |
| `education` | Schooling of the child (as instructed) | text | no | Unlocks child_in_school |
| `section_12_grounds` | Why release will not bring association with known criminals, danger, or defeat justice (as instructed) | textarea | no | Unlocks section_12_exceptions_absent |
| `sir_findings` | What the social investigation / probation report says (as instructed) | textarea | no | Unlocks sir_favourable |
| `antecedents` | Earlier cases involving the child (as instructed) | textarea | no | Unlocks no_earlier_cases |
| `earlier_bail_applications` | Earlier bail applications for the child | textarea | no | earlier_applications |
| `state` | State | select | yes | Respondent |

## _averments (`_averments/bail_juvenile_jj_12.json`)

```json
{
  "pack": "bail_juvenile_jj_12",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "stigmatising_terms",
      "kind": "averment",
      "what": "Words that call the child an accused or offender",
      "phrases": ["accused child", "juvenile accused", "the accused juvenile", "applicant/accused", "accused-applicant", "juvenile delinquent", "the offender", "was arrested", "lodged in jail", "mujrim", "aaropi"],
      "unlocked_by": null
    },
    {
      "id": "below_eighteen_on_offence_date",
      "kind": "averment",
      "what": "The child was below eighteen on the date of the offence",
      "phrases": ["was below eighteen years of age on the date of the alleged offence", "was a minor on the date of occurrence", "ghatna ke din naabalig tha"],
      "unlocked_by": { "all_of": [
        { "key": "child_dob", "label": "Date of birth of the child", "present": true },
        { "key": "age_document", "label": "Document showing date of birth", "present": true }
      ] }
    },
    {
      "id": "section_12_exceptions_absent",
      "kind": "submission",
      "what": "Release will not bring association with known criminals, expose the child to danger, or defeat the ends of justice",
      "phrases": ["release will not bring the child into association with any known criminal", "no moral, physical or psychological danger", "will not defeat the ends of justice", "no known criminal associates"],
      "unlocked_by": { "key": "section_12_grounds", "label": "Why the Section 12 exceptions do not apply", "present": true }
    },
    {
      "id": "sir_favourable",
      "kind": "averment",
      "what": "The social investigation or probation officer's report favours release",
      "phrases": ["the social investigation report is favourable", "the probation officer has recommended release", "SIR supports release"],
      "unlocked_by": { "key": "sir_findings", "label": "What the social investigation / probation report says", "present": true }
    },
    {
      "id": "child_in_school",
      "kind": "averment",
      "what": "The child is a student / studying",
      "phrases": ["is a student of class", "is studying in", "is a bright student", "padhai karta hai"],
      "unlocked_by": { "key": "education", "label": "Schooling of the child", "present": true }
    },
    {
      "id": "no_earlier_cases",
      "kind": "averment",
      "what": "No earlier case involving the child",
      "phrases": ["has never been involved in any case", "no previous case against the child", "first time in conflict with law", "pehle koi case nahi"],
      "unlocked_by": { "key": "antecedents", "label": "Earlier cases involving the child", "equals": ["none", "nil", "no", "koi nahi"] }
    },
    {
      "id": "good_family_background",
      "kind": "averment",
      "what": "The child comes from a good or respectable family",
      "phrases": ["belongs to a respectable family", "good family background", "izzatdaar parivaar"],
      "unlocked_by": null
    },
    {
      "id": "first_bail_application",
      "kind": "averment",
      "what": "No other bail application for the child was made, is pending or was rejected (suppression risk)",
      "phrases": ["this is the first bail application", "no other bail application is pending", "no application has been moved before any other court", "pehli zamanat arzi hai"],
      "unlocked_by": { "key": "earlier_bail_applications", "label": "Earlier bail applications for the child", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] }
    }
  ],
  "allowed": [
    { "id": "below_eighteen_on_offence_date", "kind": "averment", "averment": "the child's date of birth, as recorded in {{age_document}}, is {{child_dob}}", "requires": { "all_of": [
      { "key": "child_dob", "label": "Date of birth of the child", "present": true },
      { "key": "age_document", "label": "Document showing date of birth", "present": true }
    ] } },
    { "id": "section_12_exceptions_absent", "kind": "submission", "averment": "it is submitted that {{section_12_grounds}}, and that there are therefore no reasonable grounds for believing that the release of the child is likely to bring the child into association with any known criminal, expose the child to moral, physical or psychological danger, or defeat the ends of justice", "requires": { "key": "section_12_grounds", "label": "Why the Section 12 exceptions do not apply", "present": true } },
    { "id": "sir_favourable", "kind": "averment", "averment": "the social investigation report / probation officer's report states: {{sir_findings}}", "requires": { "key": "sir_findings", "label": "What the social investigation / probation report says", "present": true } },
    { "id": "child_in_school", "kind": "averment", "averment": "as to schooling, the child {{education}}", "requires": { "key": "education", "label": "Schooling of the child", "present": true } },
    { "id": "no_earlier_cases", "kind": "averment", "averment": "no earlier case involving the child is known to the parent / guardian", "requires": { "key": "antecedents", "label": "Earlier cases involving the child", "equals": ["none", "nil", "no", "koi nahi"] } },
    { "id": "first_bail_application", "kind": "averment", "averment": "no other application for release on bail of the child has been made in this matter", "requires": { "key": "earlier_bail_applications", "label": "Earlier bail applications for the child", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] } },
    { "id": "earlier_bail_applications", "kind": "averment", "averment": "the earlier applications for release on bail of the child in this matter are: {{earlier_bail_applications}}", "requires": { "key": "earlier_bail_applications", "label": "Earlier bail applications for the child", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] } },
    { "id": "present_placement", "kind": "averment", "averment": "the child is at present kept in {{present_placement}}", "requires": { "key": "present_placement", "label": "Where the child is now", "present": true } },
    { "id": "guardian_resides_at", "kind": "averment", "averment": "the {{guardian_relation}} of the child resides at {{guardian_address}}", "requires": { "all_of": [
      { "key": "guardian_relation", "label": "Relation of guardian", "present": true },
      { "key": "guardian_address", "label": "Address of parent / guardian", "present": true }
    ] } }
  ]
}
```

Pairing check: every non-null `unlocked_by` (below_eighteen_on_offence_date, section_12_exceptions_absent, sir_favourable, child_in_school, no_earlier_cases, first_bail_application) has a twin. `stigmatising_terms` and `good_family_background` are null. Note: the `below_eighteen_on_offence_date` twin states the date of birth, not the conclusion; the conclusion stays with the advocate.

Loader question (Ajay ruling): "the accused" is removed from `stigmatising_terms` (substring risk: it would also hit a correct sentence about a co-accused adult). The narrower phrases "accused child", "juvenile accused", "the accused juvenile", "applicant/accused" and "accused-applicant" are used instead.

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_juvenile_jj_12` | `earlier_applications` | EA-standard (T-237) | Approve (paragraphs say "release on bail", so `bail` cue holds) |
| `bail_juvenile_jj_12` | `guardian_undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

Risk, low: "the inquiry is pending before this Hon'ble Board" in a paragraph that also says "bail" meets EA-standard without disclosure. Same exposure as bail_regular; accepted there.

## Verify (not in signed text)

- s.12 sub-sections: 12(1) release and the three exceptions (wording used in instruction 6 and the allowed twin is from knowledge; check it word for word against the bare act); 12(2) keeping in observation home when not released by police; 12(3) Board's order when not released; 12(4) modification when bail conditions are not met within a period.
- s.2 clauses defining "child" and "child in conflict with law".
- s.94 (presumption and determination of age) and s.9 (claim of juvenility before another court).
- s.74 (prohibition on disclosure of identity of children): reach of the bar to court filings, for the initials option.
- s.15 (preliminary assessment for heinous offences by a child of 16-18): whether it affects bail before the Board.
- s.101 (appeals): forum and time for an appeal against a refusal (separate template).
- Model Rules 2016: social investigation report form, probation officer's role, Board's bail form.

## Notes for Ajay

- Risk (DPDP): this pack processes a child's personal data (name, age, offence). DPDP Act s.9 (children's data) to be checked for Lawie's role (processor for the advocate vs fiduciary). Not a template blocker; a compliance-register item.
- Risk: initials. Boards differ; default `use_initials = no` keeps the brief's name. Decide whether default should be yes.
- Risk: "the accused" phrase ban (see loader question above). Resolved: removed (Ajay ruling).
- Acceptable: no sub-section of s.12 is cited in any signed field; the instruction paraphrases s.12 without a sub-section number.
- Acceptable: verification by the parent / guardian; the child does not verify.
