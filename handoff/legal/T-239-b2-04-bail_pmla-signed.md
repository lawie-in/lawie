# T-239 b2 #04 bail_pmla (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Copied from the signed `bail_ndps` (b1 #13) and the T-245 / T-237 / T-241 texts. BNSS mapping uses only the pairs in the signed table (CrPC 439 -> BNSS 483). Special-Act bail; section 45 twin conditions only as submissions on facts the brief gives.

| Field | Value |
|---|---|
| id | `bail_pmla` |
| displayName | Bail Application in PMLA Case |
| category | Criminal: bail and custody |
| court_levels | `["special_court_pmla", "high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (liberty) |
| averments file | `_averments/bail_pmla.json`, `inherits: "bail_regular"`, `key_map: {}` (form keys reuse bail_regular's ledger keys) |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "483",
        "description": "Special powers of High Court or Court of Session regarding bail"
      }
    ]
  },
  {
    "act": "Prevention of Money-Laundering Act, 2002",
    "sections": [
      {
        "number": "3",
        "description": "Offence of money-laundering"
      },
      {
        "number": "4",
        "description": "Punishment for money-laundering"
      },
      {
        "number": "45",
        "description": "Offences to be cognizable and non-bailable (conditions for grant of bail)"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Accused\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant/Accused"
    },
    {
      "role": "respondent",
      "label": "Respondent (State of {state}, or the investigating agency as the brief names it)"
    }
  ],
  "caseNomenclature": "BAIL APPLICATION No. _____ of [YEAR]\nUnder {governing_provision}\n(In {firDetails}, under the Prevention of Money-Laundering Act, 2002)"
}
```

## mandatoryClauses

```json
[
  {
    "id": "case_details",
    "name": "Case Details",
    "required": true,
    "description": "The ECIR, complaint or case number, the agency (as the brief names it), the date, the PMLA sections alleged and the scheduled offence and its FIR, exactly as the brief gives them."
  },
  {
    "id": "proceeds_of_crime",
    "name": "Proceeds of Crime as Alleged",
    "required": true,
    "description": "The proceeds of crime alleged, only as the brief gives them, as the prosecution's case. The blank where the brief gives none. No quantum, estimate or characterisation by the Drafter."
  },
  {
    "id": "custody_status",
    "name": "Custody Status",
    "required": true,
    "description": "Date of arrest, date custody began, and whether judicial or agency custody, as the brief gives them. No count of days."
  },
  {
    "id": "section_45",
    "name": "Section 45 PMLA",
    "required": true,
    "description": "The twin conditions of section 45 addressed as submissions on the grounds the brief gives, or the blank. Never a statement that the applicant is prima facie not guilty or not likely to commit an offence on bail as a fact."
  },
  {
    "id": "grounds",
    "name": "Grounds for Bail",
    "required": true,
    "description": "Only the grounds the brief gives, each as the brief puts it."
  },
  {
    "id": "undertakings",
    "name": "Undertakings",
    "required": true,
    "description": "Undertakings by the applicant for the future, if released on bail: not to abscond, not to tamper with the evidence or influence witnesses, to appear on every date fixed, and to abide by the conditions imposed. Never a statement of fact."
  },
  {
    "id": "earlier_applications",
    "name": "Earlier Bail Applications",
    "required": true,
    "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."
  },
  {
    "id": "prayer",
    "name": "Prayer Clause",
    "required": true,
    "description": "System part."
  },
  {
    "id": "verification",
    "name": "Verification",
    "required": true,
    "description": "System part."
  },
  {
    "id": "advocate_details",
    "name": "Advocate Details",
    "required": true,
    "description": "System part."
  }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Grant regular bail to the applicant {applicant} in connection with {firDetails}, under {governing_provision}, on such terms and conditions as this Hon'ble Court may deem fit and proper;
b) Direct the release of the applicant on furnishing personal bond with surety to the satisfaction of this Hon'ble Court;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245) and follows the court level chosen in the form (Ajay ruling 2): a Special Court under the Act or the High Court -> CrPC 439 / BNSS 483. Lawie does not advise whether a Special Court is a Court of Session. A Magistrate (CrPC 437 / BNSS 480) is not in `court_levels` for this pack.
- BNSS and BSA: `Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 439 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 439 CrPC or Section 483 BNSS]`

The PMLA is cited as it is, unaffected by T-245. Its sections 3, 4 and 45 are cited at section level only.

## verificationTemplate

As in `bail_ndps`: ends "{verifierCapacity}", not "Deponent" (T-136; Ajay approved the pattern for #7-13).

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the applicant" or "pairokar of the applicant, who is in custody". `{knowledgeSource}`: "personal knowledge" or "the instructions of the applicant and the case record".

## filingChecklist

```json
[
  "Application, with copies as the court's practice requires",
  "Vakalatnama / Memo of Appearance",
  "Copy of FIR or complaint",
  "Copy of ECIR / complaint, as served or obtained",
  "Copy of the FIR or complaint for the scheduled offence, and the order or status of that case, if any",
  "Copy of the grounds of arrest and remand order, as served",
  "Copy of prosecution complaint filed in the Special Court, if filed",
  "Custody certificate / proof of custody period",
  "Copies of remand orders",
  "Copies of earlier bail orders in this matter, if any",
  "Copy of charge sheet or complaint, if filed",
  "Copy of application served on the Public Prosecutor, as the court's practice requires",
  "Affidavit of applicant or pairokar, if the court's practice requires",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Identity and address proof of applicant and sureties"
]
```

## promptInstructions

```json
[
  "Draft a Regular Bail Application in a case under the Prevention of Money-Laundering Act, 2002, before the Special Court or the High Court. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Where the BRIEF says the application is before a Special Court, cite the bail provision as GOVERNING PROVISION gives it. Cite the Prevention of Money-Laundering Act, 2002 by name; cite its Section 3 and Section 4 only as the BRIEF gives the offence, and Section 45 as below. Do not cite any other section of that Act unless the BRIEF gives it.",
  "Begin PARAGRAPH 1 with the exact case details provided: the ECIR, complaint or case number, the agency, the date, the PMLA sections alleged, and the scheduled offence with its FIR number and sections. Use the values EXACTLY as given.",
  "Do not state the quantum or nature of the proceeds of crime, the value of any property or the amount of any attachment, except as the BRIEF gives it, and then as the prosecution's case: 'according to the prosecution, ...'. Where the BRIEF does not give it, write [To be confirmed: proceeds of crime alleged, as in the complaint]. Never say that no proceeds of crime exist, that the property is untainted, or that the applicant had no role.",
  "Section 45: address both conditions as submissions: that there are reasonable grounds for believing that the applicant is not guilty of the offence, and that the applicant is not likely to commit any offence while on bail. Base each only on grounds the BRIEF gives; where it gives none, write [To be confirmed: grounds for the satisfaction required by Section 45 PMLA]. Never write either condition as a fact, never write that the applicant is prima facie not guilty, and never say that Section 45 does not apply. Do not state the provisos or sub-sections of Section 45 unless the BRIEF gives them.",
  "State the status of the scheduled offence (for example pending, acquittal, discharge, quashing) only as the BRIEF gives it. Do not infer any consequence for this case from it.",
  "State the custody status as the BRIEF gives it: the date of arrest, the date from which the applicant has been in custody, and whether that custody is judicial or police. Where the BRIEF gives the date of arrest and the date custody began as two dates, keep them as two dates. Do not work out the number of days in custody.",
  "Set out the grounds for bail that the BRIEF gives, and no others. Do not assert a ground (for example no criminal history, no recovery from the applicant, false implication, delay in the investigation, parity with a co-accused) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it. Cite a section of any Act other than those in ACTS only if the BRIEF gives it.",
  "Give the standard undertakings as undertakings by the applicant for the future, never as facts and never as undertakings by the advocate: the applicant undertakes that, if released on bail, the applicant will not abscond, will not tamper with the evidence, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.",
  "State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].",
  "This is not a default bail application. Where the BRIEF seeks release because the investigation was not completed in time, write [To be confirmed: whether a default bail application is intended instead] and do not state any period of detention allowed by law.",
  "Do not name any judgment. Where an authority on bail would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `fir_date` | Date of the FIR, ECIR or complaint (the date the case began) | date | no | Procedure switch (T-245), `{governing_provision}`; relabelled for this pack only (Ajay ruling 3); the ECIR number stays in `case_number` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `case_number` | ECIR / complaint / case number | text | yes | Cause title, para 1 |
| `agency` | Agency (as in record) | text | yes | Para 1, respondent name |
| `pmla_sections` | PMLA sections alleged (as in record) | text | yes | Para 1; only source of PMLA section numbers other than 3, 4 and 45 |
| `scheduled_offence_details` | Scheduled offence: FIR number, police station, sections (as in record) | textarea | yes | Para 1; no conversion |
| `scheduled_offence_status` | Status of the scheduled offence (as instructed) | textarea | no | Unlocks scheduled_offence_status |
| `proceeds_of_crime_alleged` | Proceeds of crime alleged (as in complaint) | text | no | proceeds_of_crime; no quantum added |
| `s45_grounds` | Grounds for the s.45 satisfaction (as instructed) | textarea | no | Unlocks s45_twin_conditions_met |
| `complaint_filed` | Has a prosecution complaint been filed? | select: yes / no / not known | no | grounds; bail_regular key `chargesheet_filed` |
| `arrest_date` | Date of arrest | date | yes | custody_status |
| `custody_since` | In custody since | date | no | custody_status |
| `currently_in_custody` | Custody type | select (bail_regular options) | yes | custody_status |
| `investigation_status` | Investigation / charge sheet status (as instructed) | text | no | grounds; bail_regular key |
| `antecedents` | Criminal antecedents | textarea | no | bail_regular key |
| `earlier_bail_applications` | Earlier bail applications in this matter | textarea | no | earlier_applications; bail_regular key |
| `grounds_for_bail` | Grounds for bail | textarea | yes | grounds |
| `state`, `court_type`, `court_name` | Court | as bail_regular | yes | Cause title, court-rules overlay |
| `applicant_name`, `father_name`, `applicant_age`, `address`, `applicant_occupation` | Applicant | as bail_regular | name, parentage, address yes | Cause title, verification |
| `verifier_capacity` | Who verifies | select: applicant / pairokar | yes | verificationTemplate |
| `pairokar_name`, `pairokar_relation` | Pairokar | text | if pairokar | verificationTemplate |

## _averments (`_averments/bail_pmla.json`)

```json
{
  "pack": "bail_pmla",
  "inherits": "bail_regular",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "s45_not_applicable",
      "kind": "submission",
      "what": "Section 45 does not apply or is not attracted",
      "phrases": [
        "section 45 does not apply",
        "twin conditions do not apply",
        "bar of section 45 is not attracted",
        "section 45 is not applicable",
        "dhara 45 lagu nahi"
      ],
      "unlocked_by": null
    },
    {
      "id": "s45_provisos_subsections",
      "kind": "submission",
      "what": "The provisos or sub-sections of Section 45 stated or argued (banned; no twin)",
      "phrases": [
        "proviso to section 45",
        "first proviso",
        "second proviso",
        "sub-section of section 45",
        "woman, a person under the age of sixteen",
        "sick or infirm"
      ],
      "unlocked_by": null
    },
    {
      "id": "s45_twin_conditions_met",
      "kind": "submission",
      "what": "The twin conditions are satisfied",
      "phrases": [
        "reasonable grounds for believing that the applicant is not guilty",
        "not likely to commit any offence while on bail",
        "twin conditions are satisfied",
        "prima facie not guilty"
      ],
      "unlocked_by": {
        "key": "s45_grounds",
        "label": "Grounds for the s.45 satisfaction",
        "present": true
      }
    },
    {
      "id": "proceeds_quantum",
      "kind": "averment",
      "what": "The quantum or nature of proceeds of crime",
      "phrases": [
        "proceeds of crime amounting to",
        "proceeds of crime worth",
        "proceeds of crime amounting to",
        "proceeds of crime to the tune of",
        "apradh ki aay"
      ],
      "unlocked_by": {
        "key": "proceeds_of_crime_alleged",
        "label": "Proceeds of crime alleged",
        "present": true
      }
    },
    {
      "id": "no_proceeds",
      "kind": "averment",
      "what": "No proceeds of crime / untainted property / no role",
      "phrases": [
        "no proceeds of crime",
        "property is untainted",
        "untainted property",
        "applicant has no role in the alleged laundering",
        "aay nahi hai"
      ],
      "unlocked_by": null
    },
    {
      "id": "scheduled_offence_status",
      "kind": "averment",
      "what": "The scheduled offence has ended or is not made out",
      "phrases": [
        "scheduled offence has ended in acquittal",
        "applicant stands discharged in the scheduled offence",
        "scheduled offence has been quashed",
        "no scheduled offence is made out",
        "predicate offence has failed"
      ],
      "unlocked_by": {
        "key": "scheduled_offence_status",
        "label": "Status of the scheduled offence (as instructed)",
        "present": true
      }
    },
    {
      "id": "offence_bailable",
      "kind": "averment",
      "what": "The offence is bailable or not cognizable",
      "phrases": [
        "the offence is bailable",
        "offence is not cognizable",
        "bailable offence"
      ],
      "unlocked_by": null
    },
    {
      "id": "quantum_characterised",
      "kind": "averment",
      "what": "The case is a major or minor money-laundering case",
      "phrases": [
        "petty money laundering",
        "negligible amount",
        "huge amount",
        "large scale money laundering"
      ],
      "unlocked_by": null
    }
  ],
  "allowed": [
    {
      "id": "proceeds_quantum",
      "kind": "averment",
      "averment": "according to the prosecution, the proceeds of crime alleged are {{proceeds_of_crime_alleged}}",
      "requires": {
        "key": "proceeds_of_crime_alleged",
        "label": "Proceeds of crime alleged",
        "present": true
      }
    },
    {
      "id": "s45_twin_conditions_met",
      "kind": "submission",
      "averment": "it is submitted, on the grounds that {{s45_grounds}}, that there are reasonable grounds for believing that the applicant is not guilty of such offence and that the applicant is not likely to commit any offence while on bail",
      "requires": {
        "key": "s45_grounds",
        "label": "Grounds for the s.45 satisfaction",
        "present": true
      }
    },
    {
      "id": "scheduled_offence_status",
      "kind": "averment",
      "averment": "as to the scheduled offence, it is stated, as instructed, that {{scheduled_offence_status}}",
      "requires": {
        "key": "scheduled_offence_status",
        "label": "Status of the scheduled offence (as instructed)",
        "present": true
      }
    }
  ]
}
```

Pairing check: every banned entry with non-null `unlocked_by` (s45_twin_conditions_met, proceeds_quantum, scheduled_offence_status) has an allowed twin with the same id. `s45_provisos_subsections` and `s45_not_applicable` are banned with `unlocked_by: null` and no twin (Ajay ruling 6). Inherited bail_regular entries (earlier_bail_applications, no_recovery, recovery_planted ...) stay as signed there. `woman_proviso` and `under_sixteen` twins are BNSS 480 provisos: as in #13, propose overriding both here with `unlocked_by: null` and no twin (Ajay to decide; not written into the JSON above).

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_pmla` | `earlier_applications` | EA-standard (T-237) | Approve |
| `bail_pmla` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

## Verify (not in signed text)

- PMLA s.45 sub-sections and provisos (the Public Prosecutor's opportunity to oppose, the twin satisfaction, the exception for a woman, a person under sixteen, or a sick or infirm person, and the Special Court's cognizance bar): banned in the Drafter with no twin; the signed text cites "Section 45" only (Ajay ruling 6).
- PMLA s.44 (Special Court), s.46 (application of the CrPC): not stated. Lawie does not advise whether a Special Court is a Court of Session (Ajay ruling 2).
- PMLA s.2 definitions ("proceeds of crime", "scheduled offence") and the Schedule: not stated.
- PMLA s.5, s.17, s.19 (attachment, search, arrest) and the grounds of arrest: candidate grounds; not cited in the pack.
- How the PMLA's references to the CrPC read after 1 July 2024 (General Clauses Act / BNSS s.531): not cited.

## Rulings applied (Ajay, 11 Oct 2026)

- `court_levels` ids are the lead's to map to T-240; left as drafted.
- `{governing_provision}` follows the court level chosen (Special Court under the Act or High Court -> CrPC 439 / BNSS 483).
- `fir_date` is relabelled for this pack only: "Date of the FIR, ECIR or complaint (the date the case began)". The ECIR number stays in `case_number`.
- Provisos and sub-sections of s.45 stay banned with no twin, and in Verify. Sections 3, 4 and 45 are cited at section level only.
- `woman_proviso` and `under_sixteen` (inherited BNSS 480 provisos) stay banned with `unlocked_by: null` and no twin, as in #13; Ajay to confirm for this pack.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs: CrPC 437 to BNSS 480, CrPC 439 to BNSS 483 (signed table, T-255). Special Acts are cited as the ruling below says. The cue set for `earlier_applications` is EA-standard (T-237). Anything under "Verify" is not signed. Category (T-240): Criminal: bail and custody. `court_levels` ids are the lead's to map to the T-240 list. Which section the application cites follows the court level chosen in the form; Lawie does not advise whether a Special Court is a Court of Session.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A (every template, twice) |
| Ruling | Sections 3, 4 and 45 of the PMLA at section level only. The section 45 twin conditions are submissions only, unlocked by `s45_grounds`; the provisos and sub-sections (woman, under sixteen, sick or infirm) stay banned with no twin and in Verify. `fir_date` is labelled "Date of the FIR, ECIR or complaint (the date the case began)"; the ECIR number is in `case_number`. The quantum of proceeds of crime only as the brief gives it; "prima facie not guilty" is banned. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
