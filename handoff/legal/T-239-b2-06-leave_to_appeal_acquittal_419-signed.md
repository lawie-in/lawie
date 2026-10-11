# T-239 b2 #06 leave_to_appeal_acquittal_419 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. v2: revised under Ajay's rulings. Form hint and checklist item added on the grounds field. Section pairs are from the corrected signed table (CrPC to BNSS): CrPC 378 → BNSS 419. Limitation block is mandatory. No sub-section is cited. The Drafter never characterises the trial court or the persons acquitted.

| Field | Value |
|---|---|
| id | `leave_to_appeal_acquittal_419` |
| displayName | Application for Leave to Appeal against an Acquittal |
| category | Criminal: appeals, revisions, quashing |
| court_levels | `["high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (limitation) |
| averments file | `_averments/leave_to_appeal_acquittal_419.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "419",
        "description": "Appeal in case of acquittal"
      }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      {
        "number": "378",
        "description": "Appeal in case of acquittal"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant\nVERSUS\n1. State of {state}\n{otherRespondents} ... Respondent(s)",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant (complainant / victim, as the brief gives)"
    },
    {
      "role": "respondent_1",
      "label": "Respondent No. 1 (State)"
    },
    {
      "role": "respondent_2",
      "label": "Respondent No. 2 onwards (the person(s) acquitted, named as in the judgment)"
    }
  ],
  "caseNomenclature": "CRIMINAL LEAVE TO APPEAL No. _____ of [YEAR]\n(Application under {governing_provision} for leave to appeal against the judgment of acquittal dated {judgmentDate} passed by {impugnedCourt} in {impugnedCaseNumber})"
}
```

High Court nomenclature varies; it goes in the `court-rules/` overlay per High Court.

## mandatoryClauses

```json
[
  {"id": "impugned_judgment", "name": "Impugned Judgment of Acquittal", "required": true, "description": "The court, the case number, the date of the judgment of acquittal, the persons acquitted by name, and the offences they were tried for, exactly as the brief gives them."},
  {"id": "applicant_standing", "name": "Standing of the Applicant", "required": true, "description": "The applicant's capacity (complainant, victim, or both) and whether the case below was instituted on a police report or on a complaint, only as the brief gives them; the blank where it does not. No statement of the applicant's right beyond that."},
  {"id": "case_particulars", "name": "FIR or Complaint Particulars", "required": true, "description": "FIR number, police station and date, or the complaint particulars, as the brief gives them."},
  {"id": "grounds_for_leave", "name": "Grounds for Leave", "required": true, "description": "The grounds the brief gives, reproduced as one block in the advocate's own words; none added by Lawie. No characterisation by Lawie of the trial court, its findings, or the persons acquitted."},
  {"id": "earlier_applications", "name": "Earlier Appeals and Applications", "required": true, "description": "Every earlier appeal, application for leave, or revision against this judgment, whether by the applicant, the State or any other person, including any decision of the State on whether to appeal, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."},
  {"id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Grant leave to the applicant {applicant} to appeal, under {governing_provision}, against the judgment of acquittal dated {judgmentDate} passed by {impugnedCourt} in {impugnedCaseNumber};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245). Pair: CrPC 378 → BNSS 419 (leave to appeal against an acquittal, to the High Court):
- BNSS and BSA: `Section 419 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 378 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 378 CrPC or Section 419 BNSS]`

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}, and that the grounds of the proposed appeal are based on legal advice which I believe to be true. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the applicant" or "pairokar of the applicant". Many High Courts also require a supporting affidavit; court-rules overlay.

## filingChecklist

```json
[
  "Application for leave to appeal, with copies as the High Court's rules require",
  "Memorandum of the proposed appeal, as the High Court's practice requires with or after the leave application",
  "Certified copy of the judgment of acquittal",
  "Copy of FIR, or of the complaint",
  "Copy of the charge sheet and of the charge framed, if available",
  "Proof of the applicant's capacity (complainant or victim), as the High Court's practice requires",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Check whether the State has appealed or decided not to appeal against this judgment, and state it only if known (verify)",
  "Notice of the application to the State and to the persons acquitted, as the High Court's practice requires",
  "Check every allegation against a judge or a party in your grounds: it is yours to support (verify)",
  "Vakalatnama",
  "Affidavit in support, if the High Court's rules require",
  "Court fee/stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application by a victim or complainant for leave to appeal against a judgment of acquittal. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which leave is sought, in the heading, the opening paragraph and the prayer. Do not cite any sub-section. The application asks for leave only; it is not the memorandum of appeal.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Begin with the impugned judgment: the court, the case number, the date of acquittal, the persons acquitted and the offences they were tried for, exactly as the BRIEF gives them. Then the FIR or complaint particulars, exactly as given.",
  "State the applicant's capacity (complainant, victim, or both) and whether the case below was instituted on a police report or on a complaint only as the BRIEF gives them. Where the BRIEF does not give the capacity, write [To be confirmed: the applicant's capacity in the case below (complainant or victim)]. Where it does not give how the case was instituted, write [To be confirmed: whether the case below was instituted on a police report or on a complaint]. Do not state that the applicant has a right to appeal or to seek leave.",
  "Reproduce the grounds for leave the BRIEF gives (the leave_grounds field) as one block, in the advocate's own words, without rewriting, splitting, adding to or strengthening them. Write no ground of your own, and add no reason, detail or adjective. Outside that block, never characterise the trial court, its Presiding Officer, its findings or its reasoning, the persons acquitted, the witnesses or the investigation; do not say that the court erred, misread, ignored or misappreciated anything, that the judgment is perverse, illegal or unsustainable, that the persons acquitted are guilty or committed the offence, or that there was a miscarriage of justice. Where the BRIEF gives no ground, write [To be confirmed: grounds on which leave to appeal is sought].",
  "State whether the State has filed an appeal or an application against this judgment, or has decided not to, only if the BRIEF says so. Do not say that the State has refused, failed or neglected to appeal. Where the BRIEF is silent, write [To be confirmed: whether the State has appealed against this judgment].",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "State every earlier appeal, application for leave or revision against this judgment that the BRIEF mentions, whether by the applicant, the State or any other person: the court, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions none, do not say that there was none or that this is the first application; write [To be confirmed: whether any earlier appeal, application for leave or revision was made against this judgment, by whom, to which court, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `impugned_court` | Court that acquitted | text | yes | Cause title, prayer |
| `impugned_case_number` | Case number below | text | yes | Cause title, prayer |
| `judgment_date` | Date of judgment of acquittal | date | yes | Cause title, prayer; limitation block |
| `acquitted_persons` | Persons acquitted (names as in the judgment) | textarea | yes | Respondents |
| `offences_tried` | Offences tried (sections, with Act) | textarea | yes | impugned_judgment |
| `applicant_capacity` | Applicant is | select: complainant / victim / complainant and victim / other (as instructed) | yes | applicant_standing; unlocks |
| `case_origin` | Case below was instituted on | select: police report (FIR) / complaint / not known | yes | applicant_standing; unlocks |
| `state_appeal_status` | State's appeal against this judgment (as instructed) | select: filed / not filed / not known | no | Unlocks |
| `certified_copy_applied_on` | Date of application for the certified copy | date | no | Dates only; checklist cue; never drafted as a limitation claim |
| `certified_copy_received_on` | Date of receipt of the certified copy | date | no | As above |
| `filing_date` | Date of filing | date | no | Stated as a date only |
| `fir_number`, `police_station` | FIR particulars (blank if a complaint case) | text | no | case_particulars |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `leave_grounds` | Grounds for leave (as instructed) | textarea | yes | grounds_for_leave. Form hint: "Any allegation against a judge or a party must be one you can support; Lawie reproduces what you enter." |
| `earlier_proceedings` | Earlier appeals, leave applications, revisions against this judgment | textarea | no | earlier_applications; unlocks |
| `state`, `high_court`, `bench` | High Court and bench | select | yes | Cause title, overlay |
| `applicant_name`, `father_name`, `applicant_age`, `address` | Applicant | text | name, parentage, address yes | Cause title, verification |
| verifier keys | verifier_capacity, pairokar_name, pairokar_relation, as bail_ndps (#13) |  |  | verificationTemplate |

## _averments (`_averments/leave_to_appeal_acquittal_419.json`)

```json
{
  "pack": "leave_to_appeal_acquittal_419",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "applicant_is_complainant_or_victim", "kind": "averment", "what": "The applicant is the complainant or the victim in the case below", "phrases": ["the applicant is the complainant", "the applicant is the victim", "the applicant is the informant", "shikayatkarta hai"], "unlocked_by": {"key": "applicant_capacity", "label": "Applicant is", "equals": ["complainant", "victim", "complainant and victim"]}},
    {"id": "case_instituted_on_complaint", "kind": "averment", "what": "The case below was instituted on a complaint", "phrases": ["the case was instituted upon a complaint", "the case was instituted on a complaint filed by the applicant", "complaint case"], "unlocked_by": {"key": "case_origin", "label": "Case below was instituted on", "equals": ["complaint"]}},
    {"id": "state_has_not_appealed", "kind": "averment", "what": "The State has not appealed against the judgment", "phrases": ["the State has not preferred an appeal", "no appeal has been filed by the State"], "unlocked_by": {"key": "state_appeal_status", "label": "State's appeal against this judgment", "equals": ["not filed"]}},
    {"id": "state_failed_to_appeal", "kind": "averment", "what": "The State refused, failed or neglected to appeal (characterises the State)", "phrases": ["the State has refused to appeal", "the State has failed to file an appeal", "the State has neglected to appeal", "sarkar ne appeal nahi ki"], "unlocked_by": null},
    {"id": "trial_court_erred", "kind": "submission", "what": "The trial court erred, misread or ignored the evidence, or the judgment is perverse", "phrases": ["the trial court erred", "the court below has misread the evidence", "ignored the testimony", "the judgment is perverse", "the acquittal is illegal", "the acquittal is unsustainable", "miscarriage of justice"], "unlocked_by": null},
    {"id": "acquitted_persons_guilty", "kind": "averment", "what": "The persons acquitted committed the offence", "phrases": ["the accused is guilty", "the respondents committed the offence", "the guilt of the accused stands proved", "prosecution proved its case beyond reasonable doubt", "asli gunahgar"], "unlocked_by": null},
    {"id": "no_other_proceedings_on_judgment", "kind": "averment", "what": "No other appeal, leave application or revision was filed or is pending against this judgment (suppression risk)", "phrases": ["this is the first application", "no other appeal is pending", "no other application for leave has been filed", "the applicant has not moved any other court", "pehli arzi hai"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier appeals, leave applications, revisions against this judgment", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "within_limitation", "kind": "submission", "what": "The application is within time", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null}
  ],
  "allowed": [
    {"id": "applicant_is_complainant_or_victim", "kind": "averment", "averment": "the applicant is the {{applicant_capacity}} in the case decided by the judgment of acquittal", "requires": {"key": "applicant_capacity", "label": "Applicant is", "equals": ["complainant", "victim", "complainant and victim"]}},
    {"id": "case_instituted_on_complaint", "kind": "averment", "averment": "the case below was instituted on a complaint", "requires": {"key": "case_origin", "label": "Case below was instituted on", "equals": ["complaint"]}},
    {"id": "state_has_not_appealed", "kind": "averment", "averment": "no appeal has been filed by the State against the said judgment", "requires": {"key": "state_appeal_status", "label": "State's appeal against this judgment", "equals": ["not filed"]}},
    {"id": "no_other_proceedings_on_judgment", "kind": "averment", "averment": "no other appeal, application for leave or revision has been made against this judgment", "requires": {"key": "earlier_proceedings", "label": "Earlier appeals, leave applications, revisions against this judgment", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "earlier_proceedings_listed", "kind": "averment", "averment": "the earlier appeals, applications for leave and revisions against this judgment are: {{earlier_proceedings}}", "requires": {"key": "earlier_proceedings", "label": "Earlier appeals, leave applications, revisions against this judgment", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "leave_grounds_stated", "kind": "submission", "averment": "it is submitted, as instructed, that {{leave_grounds}}", "requires": {"key": "leave_grounds", "label": "Grounds for leave (as instructed)", "present": true}}
  ]
}
```

Pairing check: the four banned entries with a non-null `unlocked_by` (`applicant_is_complainant_or_victim`, `case_instituted_on_complaint`, `state_has_not_appealed`, `no_other_proceedings_on_judgment`) each have a same-id twin. `state_failed_to_appeal`, `trial_court_erred`, `acquitted_persons_guilty` and `within_limitation` are null and have no twin. The characterisation bans are for the Drafter's own words; the advocate's ground passes only as one block through `leave_grounds_stated` (see Notes).

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark |
|---|---|---|---|
| `leave_to_appeal_acquittal_419` | `earlier_applications` | EA-proceeding | Approved (Ajay) |

**EA-proceeding** (approved by Ajay): all: [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`], [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`].

## Verify (not in signed text)

- BNSS 419 sub-sections: which sub-section gives a complainant in a complaint case the special leave to appeal to the High Court (understood as 419(4), from CrPC 378(4)), and the other limbs (State's appeals through the Public Prosecutor, appeals to the Court of Session). Not cited.
- The victim's own right of appeal against an acquittal under the proviso to CrPC 372 (BNSS 413 in the signed table) and whether that route needs no leave. Not drafted; a possible separate id.
- Period of limitation for the leave application and for the appeal after leave, and the power to condone delay. Not stated anywhere in the pack.
- Whether leave is sought before a Single Judge or a Division Bench, and High Court practice on filing the memorandum of appeal with the leave application.
- Whether the leave stage requires the State to be heard first or served first (understood to be court practice, not the Act).

## Notes for Ajay

- Tier A: limitation is at stake. Anushka to test the "late application" case (no "within time" sentence; the cue shows) and a case where the brief gives no ground (the draft must show the blank, not a ground).
- The advocate's grounds pass only as one block through `leave_grounds_stated`, never rewritten or amplified (T-241). Every characterisation phrase is banned with `unlocked_by: null` for the Drafter's own words. The form hint and the checklist item tell the advocate that allegations in the grounds are theirs to support (Ajay ruling 2).
- Scope: High Court leave application only. A State appeal against an acquittal and a victim's appeal under the proviso to CrPC 372 are separate ids, not drafted.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs (corrected table, T-255): 415/374, 418/377, 419/378, 432/391, 446/406, 447/407, 448/408. The cue set for the earlier-proceedings clause is as named in the ruling (EA-proceeding: all of [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`] and [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`]; EA-transfer: all of [any: `transfer`, `petition`, `application`, `स्थानांतरण`, `याचिका`] and [any: `earlier`, `previous`, `prior`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `वापस`]). The cues read only the reported paragraph and are a word test, not a check of meaning; the residual risk (for example a paragraph about "pending appeal" passing the cue) is accepted. Anything under "Verify" is not signed. Category (T-240): Criminal: appeals, revisions, quashing. `court_levels` ids are the lead's to map. The null-unlock bans on characterising a judge, a party or a court are for the Drafter's own words: the lead tests that an advocate's ground reproduced verbatim as a value inside an allowed averment is not stripped (if the loader would strip it, those phrases leave the ban list and the instruction rule stays).

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Leave to appeal against an acquittal (CrPC 378 / BNSS 419). Limitation block word for word. The advocate's grounds pass through as one block; the verification now carries "the grounds of the proposed appeal are based on legal advice which I believe to be true" (amended). The trial court and the persons acquitted are never characterised by the Drafter. Cue set EA-proceeding. |
| `displayName` carries no section number of one code only | Condition |
| The crpc-to-bnss.json in the repo carries the T-255 correction before this pack is built (the old table has the transfer pairs one place off) | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
