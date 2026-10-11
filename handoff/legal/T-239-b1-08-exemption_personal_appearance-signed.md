# T-239 b1 #8 exemption_personal_appearance (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 205 -> BNSS 228, CrPC 317 -> BNSS 355, CrPC 484 -> BNSS 531.

| Field | Value |
|---|---|
| id | `exemption_personal_appearance` |
| displayName | Application for Exemption from Personal Appearance |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/exemption_personal_appearance.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "228", "description": "Magistrate may dispense with personal attendance of accused (summons stage)" },
      { "number": "355", "description": "Provision for inquiries and trial being held in absence of accused" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "205", "description": "Magistrate may dispense with personal attendance of accused" },
      { "number": "317", "description": "Provision for inquiries and trial being held in the absence of accused in certain cases" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{prosecution} ... Prosecution / Complainant\nVERSUS\n{accused} ... Accused\n\nAPPLICATION ON BEHALF OF: {applicant} ... Accused / Applicant",
  "partyDesignations": [
    { "role": "applicant", "label": "Accused / Applicant" },
    { "role": "respondent", "label": "Prosecution / Complainant" }
  ],
  "caseNomenclature": "{case_type} No. {case_number}\nAPPLICATION UNDER {governing_provision} FOR EXEMPTION FROM PERSONAL APPEARANCE"
}
```

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, FIR / complaint particulars, offences and present stage, as the brief gives them." },
  { "id": "exemption_sought", "name": "Exemption Sought", "required": true, "description": "Whether exemption is sought for a particular date or for the remaining proceedings until further orders, as the brief gives it." },
  { "id": "reason", "name": "Reason for Exemption", "required": true, "description": "The reason the brief gives, and nothing more; blank if not given." },
  { "id": "representation_by_pleader", "name": "Representation by Pleader", "required": true, "description": "That the accused will be represented by the named advocate/pleader on every date; blank for the name if not given." },
  { "id": "earlier_applications", "name": "Earlier Exemption Applications", "required": true, "description": "Every earlier exemption application in this case, with date and result, as the brief gives them; or the blank where the brief is silent." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Only the undertakings the brief selects, as undertakings by the accused for the future; blank if none selected. Never a statement of fact." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Exempt the accused/applicant {applicant} from personal appearance {exemption_period} in {case_type} No. {case_number}, under {governing_provision}, and permit the accused/applicant to be represented by the pleader;
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{exemption_period}` is set by code: "on {hearing_date}" or "for the remaining proceedings, until further orders".

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the accused/applicant above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Applicant
```

## filingChecklist

```json
[
  "Application (original + copies as per court practice)",
  "Affidavit of the accused, if the court requires one",
  "Supporting document for the reason given (e.g. medical certificate), if any",
  "Copy of summons / last order sheet",
  "Vakalatnama of the pleader who will appear",
  "Copy of bail order / bail bonds, if on bail",
  "Court fee / stamp: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application by an accused for exemption from personal appearance, either for one date or for the remaining proceedings until further orders.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "WHICH SECTION. If the BRIEF gives the stage as summons issued and the accused not yet appeared, cite Section 228 BNSS (205 CrPC). If the stage is during inquiry or trial, cite Section 355 BNSS (317 CrPC). If the stage is not given, write [To be confirmed: section; 228 or 355 BNSS depends on the stage]. Do not cite a sub-section.",
  "State the reason for exemption only as the BRIEF gives it. Do not add illness, travel, distance, age, occupation or hardship that the BRIEF does not state. If no reason is given, write [To be confirmed: reason the accused cannot attend].",
  "State the accused's past attendance only if the BRIEF states it. Do not say the accused has appeared on every date unless the BRIEF says so.",
  "Give only the undertakings the BRIEF selects, as undertakings by the accused for the future (for example, that the accused will not dispute identity, that the pleader will appear on every date, that the accused will appear in person whenever the Court directs). If the BRIEF selects none, write [To be confirmed: undertakings the accused gives]. Never as facts, never as the advocate's undertaking.",
  "State every earlier exemption application in this case that the BRIEF mentions, with date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier exemption application was made in this case, and with what result]. Never write that this is the first application.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Accused / applicant name | text | yes | cause title, verification |
| applicant_parentage | Father's / Husband's name | text | yes | verification |
| applicant_age | Age | number | yes | verification |
| applicant_address | Address | textarea | yes | verification |
| court_designation | Court designation | text | yes | cause title |
| court_place | Court place | text | yes | cause title |
| state | State | select (4 states) | yes | cause title |
| case_type | Case type (e.g. Complaint Case, G.R., Sessions Trial) | text | yes | nomenclature |
| case_number | Case number / year | text | yes | nomenclature, prayer |
| prosecution | Prosecution / complainant (as in cause title) | text | yes | cause title |
| fir_number | FIR number (if police case) | text | no | particulars |
| fir_date | Date of FIR, or of complaint | date | yes | old/new law switch |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| police_station | Police station (if police case) | text | no | particulars |
| offences_alleged | Offences (sections, with Act) | textarea | yes | particulars |
| stage | Stage | select (Summons issued, not yet appeared; During inquiry or trial) | yes | picks 228 vs 355 |
| exemption_type | Exemption for | select (A particular date; Remaining proceedings until further orders) | yes | prayer |
| hearing_date | Date for which exemption is sought | date | no (show_if particular date) | prayer, averment |
| reason_for_exemption | Reason the accused cannot attend | textarea | yes | reason clause |
| medical_condition | Medical condition (if the reason is medical) | textarea | no | averment unlock |
| past_attendance | Past attendance | select (Appeared on every date; Not stated; Missed some dates — explain) | no | averment unlock |
| pleader_name | Advocate who will appear | text | no | representation clause |
| undertakings_instructed | Undertakings the accused gives | multiselect (Will not dispute identity; Pleader will appear on every date; Will appear in person when directed; Evidence may be taken in absence through pleader) | no | undertakings clause |
| earlier_applications | Earlier exemption applications (date, result) | textarea | no | disclosure; blank if empty |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "exemption_personal_appearance",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "medical_condition", "kind": "averment", "what": "A medical condition", "phrases": ["suffering from a serious ailment", "advised bed rest", "is hospitalised", "bimaar hai"], "unlocked_by": { "key": "medical_condition", "label": "Medical condition", "present": true } },
    { "id": "unable_to_attend", "kind": "averment", "what": "A reason the accused cannot attend", "phrases": ["due to unavoidable circumstances", "is out of station", "is residing far away", "cannot attend due to work", "majboori hai"], "unlocked_by": { "key": "reason_for_exemption", "label": "Reason the accused cannot attend", "present": true } },
    { "id": "regular_attendance", "kind": "averment", "what": "The accused has attended every date", "phrases": ["has appeared on every date", "has never missed a date", "has been regularly appearing", "har taareekh par aaya"], "unlocked_by": { "key": "past_attendance", "label": "Past attendance", "equals": ["appeared on every date"] } },
    { "id": "aged_or_pardanashin", "kind": "averment", "what": "The accused is aged, infirm or pardanashin", "phrases": ["an old and infirm person", "a pardanashin lady", "of advanced age", "budhe hain"], "unlocked_by": null },
    { "id": "no_earlier_application", "kind": "averment", "what": "No earlier exemption application", "phrases": ["this is the first exemption application", "no exemption has been sought earlier"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier exemption applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "medical_condition", "kind": "averment", "averment": "the accused suffers from {{medical_condition}}", "requires": { "key": "medical_condition", "label": "Medical condition", "present": true } },
    { "id": "unable_to_attend", "kind": "averment", "averment": "the accused cannot attend because {{reason_for_exemption}}", "requires": { "key": "reason_for_exemption", "label": "Reason the accused cannot attend", "present": true } },
    { "id": "regular_attendance", "kind": "averment", "averment": "the accused has appeared on every date so far", "requires": { "key": "past_attendance", "label": "Past attendance", "equals": ["appeared on every date"] } },
    { "id": "no_earlier_application", "kind": "averment", "averment": "no earlier exemption application has been made in this case", "requires": { "key": "earlier_applications", "label": "Earlier exemption applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- Sub-sections of BNSS 228 and 355 (e.g. 228(1), 228(2); 355(1) and its proviso on personal attendance). Not cited.
- Whether BNSS 355 changed the CrPC 317 conditions (e.g. a new explanation on appearance by audio-video means). Not cited.
- BNSS 530 (proceedings in electronic mode) as an alternative relief: in the signed table as a new provision, but not added to this pack.

## Notes for Ajay

1. **Risk.** "Will not dispute identity" and "evidence may be taken in absence through pleader" carry real consequences for the accused. I kept them as opt-in only (multiselect). If none is ticked, the draft carries a blank. Please confirm you want them offered at all.
2. **Risk.** A permanent exemption in a warrant case is usually refused at the summons stage unless the accused is on bail (practice, from knowledge). Not encoded. Consider a cue in the checklist or a prompt line if you want it.
3. `fir_date` doubles as complaint date here. Lead should label it clearly; BNSS 531 point as in #7 Note 2.
4. The default `medical_condition` entry is null-unlocked; this pack overrides it by id (README allows that).


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Spec as amended | Approved |
| "Will not dispute identity" and "evidence may be taken in absence through pleader" offered, opt-in only, blank if none ticked | Approved. They bind the accused, so the form shows them unticked, with the label "Only if the accused agrees" |
| Note 2 (permanent exemption practice) | Not encoded. No practice rule from knowledge goes into a pack |
| 228 vs 355 by stage | Approved |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.
