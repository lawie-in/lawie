# T-239 b1 #15 bail_sc_st_appeal_14a (draft for Ajay)

Status: DRAFT, not signed. SC/ST Act section numbers are from knowledge of the bare act (not in any repo table): 14, 14A, 15A as whole sections only. Every sub-section, including the bail-appeal sub-section of 14A and the time limit in 14A(3), is under "Verify". BNSS 531 checked in `crpc-to-bnss.json` (CrPC 484 -> BNSS 531).

| Field | Value |
|---|---|
| id | `bail_sc_st_appeal_14a` |
| displayName | Criminal Appeal against Bail Order under Section 14A, SC/ST (Prevention of Atrocities) Act |
| category | Criminal: bail and custody |
| court_levels | `["high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (liberty and limitation) |
| averments file | `_averments/bail_sc_st_appeal_14a.json`, `inherits: null` (bail_regular's allowed text speaks of "the applicant"; here the accused is the appellant) |

Batch 1 (Ajay ruling): appeal by the accused against refusal of bail only. The appeal against grant of bail is a separate batch 2 id (see Notes).

## relevantActs

```json
[
  {
    "act": "Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989",
    "sections": [
      { "number": "14", "description": "Special Court and Exclusive Special Court" },
      { "number": "14A", "description": "Appeals (including appeal to the High Court against an order of the Special Court or Exclusive Special Court granting or refusing bail)" },
      { "number": "15A", "description": "Rights of victims and witnesses (including notice of, and the right to be heard in, bail proceedings)" }
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
  "format": "IN THE {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{appellant} ... Appellant\nVERSUS\n1. State of {state}\n{otherRespondents} ... Respondents",
  "partyDesignations": [
    { "role": "appellant", "label": "Appellant (Accused)" },
    { "role": "respondent_1", "label": "Respondent No. 1 (State)" },
    { "role": "respondent_2", "label": "Respondent No. 2 (victim / informant)" }
  ],
  "caseNomenclature": "CRIMINAL APPEAL No. _____ of [YEAR]\n(Under Section 14A of the Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989)\n(Against the order dated {impugnedOrderDate} passed by {impugnedCourt} in {impugnedCaseNumber})"
}
```

High Court nomenclature varies (for example a single-judge criminal appeal series). Carry it in the `court-rules/` overlay per High Court, not here.

## mandatoryClauses

```json
[
  { "id": "impugned_order", "name": "Impugned Order", "required": true, "description": "The order appealed against: the court, the case number, the date, and whether it granted or refused bail, exactly as the brief gives them." },
  { "id": "fir_details", "name": "FIR Details", "required": true, "description": "FIR number, police station, date of registration, and the sections alleged (of this Act and of the BNS or IPC), exactly as the brief gives them." },
  { "id": "custody_status", "name": "Custody Status", "required": true, "description": "The accused's date of arrest, date custody began, and present custody or release, as the brief gives them. No count of days." },
  { "id": "victim_notice", "name": "Notice to and Hearing of the Victim", "required": true, "description": "Whether the victim or dependant was given notice of, and heard in, the bail proceeding below, as the brief gives it; or the blank. Never a statement that notice was given or not given unless the brief says so." },
  { "id": "grounds_of_appeal", "name": "Grounds of Appeal", "required": true, "description": "Only the grounds the brief gives against the impugned order, each as the brief puts it, as lettered grounds." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Undertakings by the appellant for the future, if released on bail: not to abscond, not to tamper with the evidence or influence witnesses, not to contact or threaten the victim or the victim's family, to appear on every date fixed, and to abide by the conditions imposed. Never a statement of fact." },
  { "id": "earlier_applications", "name": "Earlier Bail Applications and Appeals", "required": true, "description": "Every earlier bail application, and every earlier appeal against a bail order, in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say." },
  { "id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." },
  { "id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part." }
]
```

The `earlier_applications` description is new wording (T-237 plus "and appeals"): needs your sign as new text.

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Allow this appeal and set aside the order dated {impugnedOrderDate} passed by {impugnedCourt} in {impugnedCaseNumber}, refusing bail to the appellant {appellant};
b) Grant bail to the appellant {appellant} in connection with {firDetails}, on such terms and conditions as this Hon'ble Court may deem fit and proper;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the appellant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above appeal are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}, and that the grounds of appeal are based on legal advice which I believe to be true. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the appellant" or "pairokar of the appellant". Many High Courts require a supporting affidavit instead of, or with, a verification; that is a court-rules overlay item.

## filingChecklist

```json
[
  "Memorandum of appeal, with copies as the High Court's rules require",
  "Certified copy of the impugned order (or application for it, with the court's practice on filing without it)",
  "Copy of FIR",
  "Copy of the bail application and any reply / objection filed below",
  "Copies of earlier bail orders in this matter, if any",
  "Copy of charge sheet, if filed",
  "Custody certificate",
  "Proof of notice of this appeal to the victim or dependant, and to the State, as Section 15A and the High Court's practice require",
  "Check the time limit for this appeal under Section 14A against the dates of the order and of the certified copy; if the appeal is late, file an application for condonation of delay with it (condonation_of_delay template). Do not state in the appeal that it is within time.",
  "Vakalatnama",
  "Affidavit in support, if the High Court's rules require",
  "Court fee / stamp as per the High Court's rules (cue only)"
]
```

## promptInstructions

```json
[
  "Draft a Criminal Appeal to the High Court under Section 14A of the Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989 by the accused against an order of a Special Court or Exclusive Special Court refusing bail. Cite Section 14A as the provision under which the appeal is filed. Do not cite any sub-section of Section 14A. Do not cite Section 483 of the BNSS or Section 439 of the CrPC as the provision under which the appeal is filed.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "The appellant is the accused: the appeal is against refusal of bail and seeks bail.",
  "Begin with the impugned order: the court, the case number, the date and the result, exactly as the BRIEF gives them. Then the FIR details, exactly as given.",
  "State the custody status of the accused as the BRIEF gives it: the date of arrest, the date custody began, and whether the accused is in custody or on bail. Do not work out the number of days in custody.",
  "State whether the victim or a dependant was given notice of, and was heard in, the bail proceeding below only as the BRIEF gives it. Where the BRIEF does not say, write [To be confirmed: whether the victim or dependant was given notice of, and heard in, the bail proceeding before the Special Court]. Do not say that notice of this appeal has been given; it is a filing step.",
  "Set out as lettered grounds of appeal only the grounds the BRIEF gives, each as the BRIEF puts it. Do not assert a ground (for example that no offence under the 1989 Act is made out, that the victim does not belong to a Scheduled Caste or Scheduled Tribe, that the accused did not know the victim's caste, that the incident was not in public view, or that the Special Court did not consider the record) unless the BRIEF states it. Do not say whether the Special Court's order is right in law except as the BRIEF's grounds put it.",
  "Give the date of the impugned order and the date of filing only. Do not state, compute or comment on the time limit for this appeal, and do not say that the appeal is within time, within limitation or delayed.",
  "Give the undertakings as undertakings by the appellant for the future, never as facts and never as undertakings by the advocate: the appellant undertakes that, if released on bail, the appellant will not abscond, will not tamper with the evidence, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will not contact or threaten the victim or the victim's family, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.",
  "State every earlier bail application, and every earlier appeal against a bail order, in this matter that the BRIEF mentions: the court, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions none, do not say that there was none or that this is the first appeal; write [To be confirmed: whether any earlier bail application or appeal against a bail order was made in this matter, to which court, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Refer to the victim respectfully and by the name or description the BRIEF gives. Do not describe anyone's caste beyond what the BRIEF states.",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `impugned_order_date` | Date of impugned order | date | yes | Cause title, prayer |
| `impugned_court` | Court that passed it | text | yes | Cause title, prayer |
| `impugned_case_number` | Case / bail application number below | text | yes | Cause title, prayer |
| `impugned_result` | Order granted or refused bail | select: granted / refused | yes | Must be refused (appeal by the accused); form rejects granted |
| `filing_date` | Date of filing | date | no | Stated as a date only; never a limitation claim (Ajay ruling) |
| `certified_copy_applied_on`, `certified_copy_received_on` | Certified copy dates | date | no | Checklist cue only; never drafted as a limitation claim |
| `fir_number`, `police_station`, `sections_alleged` | FIR | as bail_regular | yes | fir_details |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | fir_details; procedure switch (T-245) |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `victim_name_or_description` | Victim / informant | text | yes | Respondent No. 2 |
| `victim_notice_status` | Notice to / hearing of victim below (as instructed) | select: served and heard / served, not heard / not served / not known | yes | victim_notice; unlocks |
| `arrest_date`, `custody_since`, `custody_status_now` | Custody of accused | date / select | no | custody_status |
| `grounds_of_appeal` | Grounds of appeal | textarea | yes | grounds_of_appeal |
| `offence_not_made_out_grounds` | Why no offence under the 1989 Act is made out (as instructed) | textarea | no | Unlocks |
| `caste_status_dispute` | Dispute on caste status (as instructed) | textarea | no | Unlocks |
| `antecedents`, `earlier_bail_applications` | as bail_regular | textarea | no | |
| `state`, `high_court`, `bench` | High Court and bench | select | yes | Cause title, overlay |
| verifier keys | as #13 | | | |

## _averments (`_averments/bail_sc_st_appeal_14a.json`)

```json
{
  "pack": "bail_sc_st_appeal_14a",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "first_bail_application",
      "kind": "averment",
      "what": "No other bail application or appeal was made, is pending or was rejected (suppression risk)",
      "phrases": ["this is the first appeal", "this is the first bail application", "no other appeal is pending", "no other bail application is pending", "the appellant has not moved any other court", "pehli appeal hai"],
      "unlocked_by": { "key": "earlier_bail_applications", "label": "Earlier bail applications and appeals in this matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] }
    },
    {
      "id": "victim_notice_given",
      "kind": "averment",
      "what": "The victim was given notice of and heard in the bail proceeding",
      "phrases": ["the victim was duly served", "the victim was heard", "the informant was given notice", "notice under section 15A was served"],
      "unlocked_by": { "key": "victim_notice_status", "label": "Notice to / hearing of victim below", "equals": ["served and heard"] }
    },
    {
      "id": "victim_notice_not_given",
      "kind": "averment",
      "what": "The victim was not given notice of, or not heard in, the bail proceeding",
      "phrases": ["no notice was given to the victim", "the victim was not heard", "bail was granted without hearing the victim", "peedit ko suna nahi gaya"],
      "unlocked_by": { "key": "victim_notice_status", "label": "Notice to / hearing of victim below", "equals": ["not served", "served, not heard"] }
    },
    {
      "id": "offence_not_made_out",
      "kind": "submission",
      "what": "No offence under the 1989 Act is made out",
      "phrases": ["no offence under the SC/ST Act is made out", "ingredients of section 3 are not satisfied", "not in public view", "the Act has been misused", "atrocity act ka mamla nahi banta"],
      "unlocked_by": { "key": "offence_not_made_out_grounds", "label": "Why no offence under the 1989 Act is made out", "present": true }
    },
    {
      "id": "caste_status_disputed",
      "kind": "averment",
      "what": "The victim's caste status, or the accused's knowledge of it, is disputed",
      "phrases": ["the complainant does not belong to a Scheduled Caste", "the appellant was not aware of the caste", "caste certificate is not on record"],
      "unlocked_by": { "key": "caste_status_dispute", "label": "Dispute on caste status", "present": true }
    },
    {
      "id": "no_criminal_antecedents",
      "kind": "averment",
      "what": "The accused has no criminal antecedents",
      "phrases": ["has no criminal antecedents", "no criminal history", "clean antecedents", "first-time offender", "koi criminal record nahi hai"],
      "unlocked_by": { "key": "antecedents", "label": "Criminal antecedents", "equals": ["none", "nil", "no", "no criminal antecedents", "no criminal record", "first offender", "clean record"] }
    },
    {
      "id": "within_limitation",
      "kind": "submission",
      "what": "The appeal is within time (restates the _default ban for this pack)",
      "phrases": ["the appeal is within limitation", "filed within ninety days", "filed within the period prescribed", "there is no delay"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "first_bail_application", "kind": "averment", "averment": "no other bail application or appeal against a bail order has been made in this matter", "requires": { "key": "earlier_bail_applications", "label": "Earlier bail applications and appeals in this matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] } },
    { "id": "earlier_bail_applications", "kind": "averment", "averment": "the earlier bail applications and appeals in this matter are: {{earlier_bail_applications}}", "requires": { "key": "earlier_bail_applications", "label": "Earlier bail applications and appeals in this matter", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"] } },
    { "id": "victim_notice_given", "kind": "averment", "averment": "the victim was given notice of, and was heard in, the bail proceeding before the Special Court", "requires": { "key": "victim_notice_status", "label": "Notice to / hearing of victim below", "equals": ["served and heard"] } },
    { "id": "victim_notice_not_given", "kind": "averment", "averment": "according to the record as instructed, the victim's notice and hearing in the bail proceeding stood as follows: {{victim_notice_status}}", "requires": { "key": "victim_notice_status", "label": "Notice to / hearing of victim below", "equals": ["not served", "served, not heard"] } },
    { "id": "offence_not_made_out", "kind": "submission", "averment": "it is submitted that no offence under the 1989 Act is made out against the appellant because {{offence_not_made_out_grounds}}", "requires": { "key": "offence_not_made_out_grounds", "label": "Why no offence under the 1989 Act is made out", "present": true } },
    { "id": "caste_status_disputed", "kind": "submission", "averment": "it is submitted that {{caste_status_dispute}}", "requires": { "key": "caste_status_dispute", "label": "Dispute on caste status", "present": true } },
    { "id": "no_criminal_antecedents", "kind": "averment", "averment": "the appellant has no criminal antecedents", "requires": { "key": "antecedents", "label": "Criminal antecedents", "equals": ["none", "nil", "no", "no criminal antecedents", "no criminal record", "first offender", "clean record"] } },
    { "id": "in_custody_since", "kind": "averment", "averment": "the accused has been in custody since {{custody_since}}", "requires": { "key": "custody_since", "label": "In custody since", "present": true } }
  ]
}
```

Pairing check: every non-null `unlocked_by` has a same-id twin. `within_limitation` restated null (same as `_default`; harmless override, keeps the 14A-specific phrases).

## T-200 cue map entries

EA-standard would pass falsely here: the impugned-order paragraph of every accused appeal says the bail application was "rejected" or "dismissed", which meets both cue lists without any disclosure of earlier applications. Third set (Ajay ruling):

- **EA-appeal**: all: [any: `bail`, `जमानत`, `ज़मानत`], [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`]

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_sc_st_appeal_14a` | `earlier_applications` | EA-appeal (new) | Approved (Ajay) |
| `bail_sc_st_appeal_14a` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | For your decision |
| `bail_sc_st_appeal_14a` | `victim_notice` | any: `victim`, `informant`, `dependant`, `पीड़ित`, `सूचक` with any: `notice`, `heard`, `to be confirmed: whether the victim`, `सूचना`, `सुनवाई` | For your decision |

## Verify (not in signed text)

- s.14A sub-section that gives the appeal against an order granting or refusing bail (from knowledge 14A(2), "notwithstanding" the CrPC appeal-against-acquittal provision).
- s.14A(3): time limit for the appeal and the outer limit for condoning delay. Not stated anywhere in the pack.
- s.14A(1): "not being an interlocutory order" scope, and whether a bail order is treated as appealable only under the bail sub-section.
- s.15A sub-sections on notice to the victim or dependant of bail proceedings and the right to be heard; whether notice of the appeal itself is required by statute or by High Court practice.
- Whether revision or BNSS 528 (CrPC 482) is barred against a Special Court bail order (affects the template note only).
- Whether the State's own appeal needs a mode (Lawie users are private advocates; not built).
- High Court rules on supporting affidavit, nomenclature and number of copies (Patna, Jharkhand, Allahabad, Delhi).

## Notes for Ajay

- Blocker for release (not for sign): the time limit is the main risk for a user; the template asserts nothing, but a missed limit is a liberty and limitation failure. Anushka tier A must test the "late appeal" case: the draft must not say "within time" and the checklist cue must show.
- Risk: victim-side appeals are new ground for the averment loader (role-dependent allowed text). Needs the `appellant_role` condition or a split into two ids (`..._accused`, `..._victim`). Splitting is simpler and safer; your call before the lead builds.
- Risk: `earlier_applications` and `victim_notice` texts are new wording, not T-237 word for word.
- Acceptable: no sub-section of 14A or 15A is cited in any signed field.
- Batch 2: `bail_sc_st_appeal_14a_victim` (appeal against grant).
