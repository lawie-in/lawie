# T-239 b1 #12 modification_bail_conditions (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 437 -> BNSS 480, CrPC 439 -> BNSS 483, CrPC 484 -> BNSS 531. Tier A per your 12 Oct amendment.

| Field | Value |
|---|---|
| id | `modification_bail_conditions` |
| displayName | Application for Modification of Bail Conditions |
| category | Criminal: bail and custody |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | A (liberty) — every sample twice: full facts, facts missing |
| averments file | `_averments/modification_bail_conditions.json`, `inherits: "bail_regular"`, `key_map: {"address": "applicant_address", "father_name": "applicant_parentage"}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "480", "description": "When bail may be taken in case of non-bailable offence (Magistrate / trial court)" },
      { "number": "483", "description": "Special powers of High Court or Court of Session regarding bail" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "437", "description": "When bail may be taken in case of non-bailable offence" },
      { "number": "439", "description": "Special powers of High Court or Court of Session regarding bail" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Accused\nVERSUS\nState of {state} ... Respondent",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant/Accused" },
    { "role": "respondent", "label": "Respondent (State)" }
  ],
  "caseNomenclature": "MISC. APPLICATION No. _____ of [YEAR]\n(In {bail_order_case_ref}, arising out of FIR No. {fir_number} dated {fir_date}, P.S. {police_station})\nAPPLICATION FOR MODIFICATION OF BAIL CONDITIONS UNDER {governing_provision}"
}
```

## mandatoryClauses

```json
[
  { "id": "fir_particulars", "name": "FIR Particulars", "required": true, "description": "FIR number, date, police station and offences, as the brief gives them." },
  { "id": "bail_order", "name": "Bail Order", "required": true, "description": "The court that granted bail, the case reference and the date of the order, as the brief gives them." },
  { "id": "conditions_imposed", "name": "Conditions Imposed", "required": true, "description": "The conditions of the bail order, quoted exactly as the brief gives them; blank if not given. Never paraphrased." },
  { "id": "modification_sought", "name": "Modification Sought", "required": true, "description": "Which condition is to be modified and the modification proposed, as the brief gives them." },
  { "id": "reasons", "name": "Reasons", "required": true, "description": "The reasons the brief gives, as submissions; no reason the brief does not give." },
  { "id": "compliance", "name": "Compliance So Far", "required": true, "description": "Compliance with the bail conditions only as the brief states it; otherwise the blank. Any alleged breach the brief mentions is stated." },
  { "id": "earlier_applications", "name": "Earlier Modification Applications", "required": true, "description": "Every earlier application to modify, relax or vary these conditions, with court, date and result; or the blank where the brief is silent." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Undertaking by the applicant for the future to abide by the condition as modified and by every other condition of the bail order. Never a statement of fact." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Modify the condition(s) of bail imposed by order dated {bail_order_date} passed in {bail_order_case_ref}, as set out in this application, under {governing_provision};
b) Keep every other condition of the said order in force;
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
  "Application (original + copy for the Prosecutor)",
  "Affidavit of the applicant, if the court requires one",
  "Certified copy of the bail order",
  "Copy of bail bond / surety bond as furnished",
  "Documents supporting the reason for modification (e.g. employment letter, medical record, travel documents), if any",
  "Proof of compliance so far (e.g. attendance record at police station), if relied on",
  "Copy to the Prosecutor / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application to the Court that granted bail, asking it to modify one or more conditions of its own bail order. This is not an application for bail, for cancellation of bail, or to challenge the order before a higher court.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "WHICH SECTION. If the BRIEF says bail was granted by a Magistrate, cite Section 480 BNSS (437 CrPC). If by a Court of Session, cite Section 483 BNSS (439 CrPC). If not given, write [To be confirmed: section; 480 or 483 BNSS depends on the Court that granted bail]. Do not cite a sub-section.",
  "Quote the conditions of the bail order exactly as the BRIEF gives them. Do not paraphrase, summarise or renumber them. If they are not given, write [To be confirmed: the conditions imposed by the bail order, as worded in the order].",
  "State the modification sought and the reasons only as the BRIEF gives them. Write the reasons as submissions ('It is submitted that ...'). Do not add hardship, employment, illness, travel or family need that the BRIEF does not state.",
  "Do not state that the applicant has complied with every condition, has not misused the liberty, or has attended every date, unless the BRIEF says so. Where the BRIEF is silent, write [To be confirmed: the applicant's compliance with the bail conditions so far]. Where the BRIEF mentions an alleged breach, state it as the BRIEF gives it.",
  "State every earlier application to modify, relax or vary these conditions that the BRIEF mentions, with court, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application to modify these bail conditions was made, to which court, and with what result]. Never write that this is the first application or that none is pending.",
  "Give the undertaking as an undertaking by the applicant for the future: that the applicant will abide by the condition as modified and by every other condition of the bail order. Never as a fact, never as the advocate's undertaking.",
  "Do not state that a condition is illegal, onerous or disproportionate unless the BRIEF gives the reason; then write it as a submission on that reason only.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title, verification |
| applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / number / textarea | yes | verification; bail_regular key_map |
| applicant_occupation | Occupation | text | no | inherited averment (gainfully_employed) |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| fir_number / police_station | FIR particulars | text | yes | particulars |
| fir_date | FIR date | date | yes | old/new law switch |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| offences_alleged | Offences (sections, with Act) | textarea | yes | particulars |
| granting_court | Bail granted by | select (Magistrate / CJM; Court of Session) | yes | picks 480 vs 483 |
| bail_order_case_ref | Bail application / case reference | text | yes | nomenclature, prayer |
| bail_order_date | Date of bail order | date | yes | prayer |
| conditions_imposed | Conditions imposed (as worded in the order) | textarea | yes | quoted verbatim |
| condition_to_modify | Condition(s) to be modified | textarea | yes | modification clause |
| modification_sought | Modification proposed | textarea | yes | modification clause |
| reason_for_modification | Reason for modification | textarea | yes | submission unlock |
| compliance_with_conditions | Compliance so far | select (Complied with every condition so far; Not stated; Breach alleged — explain) | yes | averment unlock |
| compliance_details | Details of compliance / alleged breach | textarea | no | compliance clause |
| medical_condition | Medical condition (if relevant) | textarea | no | inherited averment |
| earlier_applications | Earlier modification applications (court, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "modification_bail_conditions",
  "inherits": "bail_regular",
  "key_map": { "address": "applicant_address", "father_name": "applicant_parentage" },
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "complied_with_conditions", "kind": "averment", "what": "The applicant has complied with the bail conditions", "phrases": ["has complied with all the conditions", "has scrupulously followed the conditions", "has never violated any condition", "saari sharten maani hain"], "unlocked_by": { "key": "compliance_with_conditions", "label": "Compliance so far", "equals": ["complied with every condition so far"] } },
    { "id": "not_misused_liberty", "kind": "averment", "what": "The applicant has not misused the liberty", "phrases": ["has not misused the liberty", "has not misused the concession of bail", "no complaint against the applicant"], "unlocked_by": null },
    { "id": "condition_needs_modification", "kind": "submission", "what": "The condition is onerous or needs modification", "phrases": ["the condition is onerous", "causing great hardship", "is disproportionate", "impossible to comply with"], "unlocked_by": { "key": "reason_for_modification", "label": "Reason for modification", "present": true } },
    { "id": "no_earlier_modification_application", "kind": "averment", "what": "No earlier application to modify the conditions", "phrases": ["this is the first application for modification", "no such application is pending", "no other application for relaxation has been filed"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier modification applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "complied_with_conditions", "kind": "averment", "averment": "the applicant has complied with every condition of the bail order so far", "requires": { "key": "compliance_with_conditions", "label": "Compliance so far", "equals": ["complied with every condition so far"] } },
    { "id": "condition_needs_modification", "kind": "submission", "averment": "it is submitted that the condition requires modification because {{reason_for_modification}}", "requires": { "key": "reason_for_modification", "label": "Reason for modification", "present": true } },
    { "id": "no_earlier_modification_application", "kind": "averment", "averment": "no earlier application to modify these bail conditions has been made", "requires": { "key": "earlier_applications", "label": "Earlier modification applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- The sub-section that empowers the granting court to impose conditions (understood as BNSS 480(3) for the Magistrate, BNSS 483(1)(a) for Sessions/High Court) and to modify them. Not cited.
- The power of the Sessions Court / High Court to set aside or modify a condition imposed by a Magistrate (understood as BNSS 483(1)(b), CrPC 439(1)(b)). Not in this pack; a separate relief.
- Whether BNSS changed any condition wording from CrPC 437(3) (e.g. the inducement/threat/promise condition, from knowledge per T-136 B3). Not cited.

## Notes for Ajay

1. **Risk (scope).** "Before the court that granted bail" excludes the common Sessions-modifies-Magistrate route (483(1)(b)). If you want it, it is a second relief or a second id; I have not drafted it.
2. **Risk.** Inheriting `bail_regular` brings in bail-grant entries (no flight risk, parity, etc.) that are mostly irrelevant here but harmless under default-deny. It also brings `first_bail_application` (key `earlier_bail_applications`), which this pack's form does not ask, so it stays banned. My own `no_earlier_modification_application` is the disclosure that matters. Alternative: `inherits: null` and copy only `medical_condition` and `gainfully_employed`.
3. **Risk.** High Court bail orders excluded from `court_levels` (district focus). A court-rules overlay later.
4. Tier A: recommend one Anushka sample with `conditions_imposed` empty, to check the Drafter does not invent the conditions.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Spec as amended | Approved |
| Only the court that granted bail; the Sessions Court changing a Magistrate's conditions is a separate id | Approved. New id for batch 2: `modification_bail_conditions_superior_court` |
| Averments inherit `bail_regular` | Approved (default-deny makes the unused entries harmless) |
| Anushka | Tier A; one sample with `conditions_imposed` empty |
| `court_levels` values | T-240 settles one list; the lead maps these to it |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.
