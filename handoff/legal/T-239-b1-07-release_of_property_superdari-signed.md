# T-239 b1 #7 release_of_property_superdari (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json` (signed 2026-05-10): CrPC 451 -> BNSS 497, CrPC 457 -> BNSS 503, CrPC 484 -> BNSS 531.

| Field | Value |
|---|---|
| id | `release_of_property_superdari` |
| displayName | Application for Release of Seized Property / Vehicle on Superdari |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/release_of_property_superdari.json`, `inherits: null` (own entries over `_default`) |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "497", "description": "Order for custody and disposal of property pending trial (property produced before a Criminal Court during inquiry or trial)" },
      { "number": "503", "description": "Procedure by police upon seizure of property (seizure reported to a Magistrate; property not produced before a Criminal Court during inquiry or trial)" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "451", "description": "Order for custody and disposal of property pending trial in certain cases" },
      { "number": "457", "description": "Procedure by police upon seizure of property" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant\n\nIN RE:\nState of {state} ... Prosecution\nVERSUS\n{accusedOrUnknown} ... Accused",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant (claimant of the property)" },
    { "role": "respondent", "label": "Prosecution / State" }
  ],
  "caseNomenclature": "MISC. APPLICATION No. _____ of [YEAR]\n(Arising out of FIR No. {fir_number} dated {fir_date}, P.S. {police_station})\nAPPLICATION UNDER {governing_provision} FOR RELEASE OF PROPERTY ON SUPERDARI"
}
```

`{governing_provision}` is set by code, not the model: see Notes 1.

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "FIR number, date, police station and offences as the brief gives them; case number and stage if given." },
  { "id": "property_particulars", "name": "Property Particulars", "required": true, "description": "Description of the property; for a vehicle, registration, engine and chassis numbers as the brief gives them, else a blank for each." },
  { "id": "seizure_particulars", "name": "Seizure Particulars", "required": true, "description": "Date of seizure, seizing agency, seizure memo reference, and whether the property was produced before the Court, each as the brief gives it." },
  { "id": "applicant_claim", "name": "Applicant's Claim to the Property", "required": true, "description": "The basis on which the applicant claims the property and the documents relied on, as the brief gives them. Never assert ownership the brief does not state." },
  { "id": "special_statute", "name": "Special Statute Check", "required": true, "description": "Whether the seizure was under a special Act, as the brief gives it; where yes or not known, the blank on whether that Act permits this Court to release the property." },
  { "id": "earlier_applications", "name": "Earlier Applications for Release", "required": true, "description": "Every earlier application for release of this property, with court, date and result, as the brief gives them; or the blank where the brief is silent. Never state that none was made." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Undertakings by the applicant for the future, if the property is released: to produce it whenever directed, not to sell, transfer, alter, encumber or part with it, and to abide by every condition imposed. Never a statement of fact." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Order the release of {property_description} seized in connection with FIR No. {fir_number} dated {fir_date} of Police Station {police_station} to the interim custody (superdari) of the applicant {applicant} under {governing_provision}, on such bond and conditions as this Hon'ble Court may deem fit;
b) Direct the officer in charge of Police Station {police_station}, or the officer having custody of the property, to hand over the property to the applicant on compliance with those conditions;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the applicant above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Applicant
```

## filingChecklist

```json
[
  "Application (original + copies as per court practice)",
  "Affidavit of the applicant, if the court requires one",
  "Copy of FIR",
  "Copy of seizure memo / seizure list",
  "Documents supporting the applicant's claim (for a vehicle: registration certificate, insurance, permit/fitness where applicable)",
  "Identity and address proof of the applicant",
  "Photographs of the property, if the court requires them",
  "Vakalatnama",
  "Court fee / stamp: check state rules (not computed by Lawie)",
  "Bond and surety as the court directs (amount fixed by court, not by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application by the claimant of seized property (often a vehicle) for its release to the applicant's interim custody on superdari, pending the case.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "WHICH SECTION. If the BRIEF says the property was produced before a Criminal Court during inquiry or trial, cite Section 497 BNSS (451 CrPC). If the BRIEF says it was seized by the police and not produced before a Criminal Court, cite Section 503 BNSS (457 CrPC). If the BRIEF does not say, write [To be confirmed: section; 497 or 503 BNSS depends on whether the property was produced before the Court]. Do not cite a sub-section.",
  "Set out the case particulars, the property particulars and the seizure particulars exactly as the BRIEF gives them. For a vehicle, give the registration, engine and chassis numbers only as given; blank any not given.",
  "State the applicant's claim to the property only as the BRIEF puts it (for example registered owner, financier, hirer, person from whom seized). Do not call the applicant the owner unless the BRIEF does.",
  "Do not state that the property was not used in the offence, that no one else claims it, or that it is not required for investigation or trial, unless the BRIEF states it.",
  "If the BRIEF says the seizure was under a special Act, or does not know, write: [To be confirmed: whether the Act under which the property was seized permits this Court to release it on interim custody]. Never state that this Court has or lacks that power.",
  "State every earlier application for release of this property that the BRIEF mentions, with court, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application for release of this property was made, to which court, and with what result]. Never write that no other application was made or is pending.",
  "Give the undertakings as undertakings by the applicant for the future, conditional on release: to produce the property before the Court whenever directed, not to sell, transfer, alter, encumber or part with possession of it, and to abide by every condition the Court imposes. Never as facts, never as the advocate's undertaking.",
  "Do not state any bond, surety or court-fee amount. Do not state that the application is within time.",
  "Do not name any judgment. Where an authority on interim custody would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title, verification |
| applicant_parentage | Father's / Husband's name | text | yes | verification |
| applicant_age | Applicant age | number | yes | verification |
| applicant_address | Applicant address | textarea | yes | verification |
| court_designation | Court designation | text | yes | cause title |
| court_place | Court place | text | yes | cause title |
| state | State | select (Bihar, Jharkhand, Uttar Pradesh, Delhi) | yes | cause title; state cue |
| fir_number | FIR number | text | yes | particulars |
| fir_date | FIR date | date | yes | old/new law switch (BNSS 531) |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| police_station | Police station | text | yes | particulars |
| offences_alleged | Offences alleged (sections, with Act) | textarea | yes | particulars |
| accused_name | Accused (if known) | text | no | cause title; else "Unknown" |
| applicant_is_accused | Is the applicant an accused in this case? | select (Yes, No) | yes | averment unlock |
| property_type | Property type | select (Vehicle, Other movable property) | yes | particulars |
| property_description | Description of property | textarea | yes | prayer |
| vehicle_registration_no / vehicle_engine_no / vehicle_chassis_no | Vehicle numbers | text | no (show_if Vehicle) | particulars |
| seizure_date | Date of seizure | date | yes | particulars |
| seizure_memo_ref | Seizure memo / list reference | text | no | particulars |
| seized_by | Seized by (police station / agency) | text | yes | particulars |
| produced_before_court | Was the property produced before a Criminal Court? | select (Yes, No — seized by police only, Not known) | yes | picks 497 vs 503 |
| ownership_basis | Applicant's claim to the property (e.g. registered owner) | text | yes | averment unlock |
| ownership_documents | Documents supporting the claim | textarea | no | checklist / body |
| special_act_seizure | Seized under a special Act? | select (No, Yes, Not known) | yes | special_statute clause |
| special_act_name | Name of that Act | text | no (show_if Yes) | special_statute clause |
| property_condition | Present condition / where kept | textarea | no | averment unlock |
| property_not_required_reason | Why the property need not stay in custody | textarea | no | submission unlock |
| earlier_applications | Earlier applications for release (court, date, result) | textarea | no | mandatory disclosure; blank if empty |
| advocate_name | Advocate name | text | yes | signature block |
| advocate_enrolment | Bar Council enrolment no. | text | yes | signature block |

`governing_provision` is computed by code from `procedure_code` + `produced_before_court`; not a form field.

## _averments

```json
{
  "pack": "release_of_property_superdari",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "owner_of_property", "kind": "averment", "what": "The applicant owns the property", "phrases": ["the applicant is the lawful owner", "the applicant is the registered owner", "absolute owner of the vehicle", "gaadi ka asli malik"], "unlocked_by": { "key": "ownership_basis", "label": "Applicant's claim to the property", "present": true } },
    { "id": "not_accused", "kind": "averment", "what": "The applicant is not an accused", "phrases": ["the applicant is not an accused", "has no concern with the offence", "is not named in the FIR"], "unlocked_by": { "key": "applicant_is_accused", "label": "Is the applicant an accused in this case?", "equals": ["no"] } },
    { "id": "not_used_in_offence", "kind": "averment", "what": "The property was not used in the offence", "phrases": ["the vehicle was not used in the commission of any offence", "has no connection with the alleged offence", "is not case property in any real sense"], "unlocked_by": null },
    { "id": "no_rival_claim", "kind": "averment", "what": "No one else claims the property", "phrases": ["no other person claims the property", "there is no rival claimant", "no dispute about title"], "unlocked_by": null },
    { "id": "property_not_required", "kind": "submission", "what": "The property is not required for investigation or trial", "phrases": ["is no longer required for investigation", "not required for the purpose of trial", "no useful purpose will be served by keeping it"], "unlocked_by": { "key": "property_not_required_reason", "label": "Why the property need not stay in custody", "present": true } },
    { "id": "property_deteriorating", "kind": "averment", "what": "The property is deteriorating in custody", "phrases": ["lying in the open", "is deteriorating", "exposed to sun and rain", "kharab ho raha hai"], "unlocked_by": { "key": "property_condition", "label": "Present condition / where kept", "present": true } },
    { "id": "no_earlier_application", "kind": "averment", "what": "No earlier application for release was made", "phrases": ["this is the first application", "no other application for release is pending", "no similar application has been filed"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier applications for release", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "owner_of_property", "kind": "averment", "averment": "the applicant is the {{ownership_basis}} of the said property", "requires": { "key": "ownership_basis", "label": "Applicant's claim to the property", "present": true } },
    { "id": "not_accused", "kind": "averment", "averment": "the applicant is not an accused in this case", "requires": { "key": "applicant_is_accused", "label": "Is the applicant an accused in this case?", "equals": ["no"] } },
    { "id": "property_not_required", "kind": "submission", "averment": "it is submitted that the property need not be kept in custody, as {{property_not_required_reason}}", "requires": { "key": "property_not_required_reason", "label": "Why the property need not stay in custody", "present": true } },
    { "id": "property_deteriorating", "kind": "averment", "averment": "the property is at present {{property_condition}}", "requires": { "key": "property_condition", "label": "Present condition / where kept", "present": true } },
    { "id": "no_earlier_application", "kind": "averment", "averment": "no earlier application for release of this property has been made", "requires": { "key": "earlier_applications", "label": "Earlier applications for release", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- Any sub-section of BNSS 497 or 503 (BNSS 497 is understood to add provisions on photographing/videographing property and on disposal timelines; not confirmed, not cited).
- Whether the Bihar Prohibition and Excise Act, 2016 (and its confiscation scheme) bars a criminal court's interim release of a seized vehicle; same for NDPS, Forest and Mines/Minerals seizures. Not cited; handled by the `special_statute` blank.
- Exact boundary between 497 and 503 where property is seized but charge-sheet not yet filed (practice varies by district).

## Notes for Ajay

1. **Risk.** `{governing_provision}` in the cause title and prayer is a system part. Lead must compute it from `fir_date` + `produced_before_court` (4 outcomes + the verify blank). If code cannot, the prayer must carry `[To be confirmed: section]` rather than a guess.
2. **Risk (law).** FIR date is a proxy for "pending immediately before 1 July 2024" in BNSS 531. An application filed after that date in an older case: views have differed on which Code applies (from knowledge, no authority named). Same note applies to #8–#12.
3. **Risk (Bihar).** Prohibition-case vehicles are the most common superdari request in Bihar and the most likely to be barred. Recommend an Anushka sample with `special_act_seizure = Yes`.
4. `court_levels` vocabulary is mixed across packs (`magistrate` vs `magistrate_jmfc`, `sessions` vs `sessions_court`). I used the bail-pack values. T-240 should fix one list.
5. Verification ends "Applicant", not "Deponent" (T-136 outside item 1).


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Spec as amended | Approved |
| Special-Act seizure (prohibition, NDPS) handled by a blank asking whether that Act lets this court release the property | Approved |
| Anushka: one sample with the special-Act answer set to Yes | Condition |
| Which of 497 / 503 by whether the property was produced before the court | Approved; sub-sections stay out |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.
