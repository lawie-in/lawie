# T-239 b1 #9 compounding_application (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 320 -> BNSS 359, CrPC 484 -> BNSS 531. The compoundable-offence tables are NOT reproduced anywhere in this pack.

| Field | Value |
|---|---|
| id | `compounding_application` |
| displayName | Joint Application for Compounding of Offence (BNSS 359) |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/compounding_application.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "359", "description": "Compounding of offences" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "320", "description": "Compounding of offences" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{prosecution} ... Prosecution / Complainant\nVERSUS\n{accused} ... Accused\n\nJOINT APPLICATION BY:\n1. {compounding_party} ... Applicant No. 1 ({compounding_party_role})\n2. {accused} ... Applicant No. 2 (Accused)",
  "partyDesignations": [
    { "role": "applicant_1", "label": "Applicant No. 1 (person compounding)" },
    { "role": "applicant_2", "label": "Applicant No. 2 (Accused)" }
  ],
  "caseNomenclature": "{case_type} No. {case_number}\nJOINT APPLICATION FOR COMPOUNDING UNDER {governing_provision}"
}
```

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, FIR / complaint particulars, all offences charged or alleged, and the present stage, as the brief gives them." },
  { "id": "parties_capacity", "name": "Capacity of the Compounding Party", "required": true, "description": "Who Applicant No. 1 is (complainant, victim/person aggrieved, or other) as the brief gives it." },
  { "id": "offences_compounded", "name": "Offences Compounded", "required": true, "description": "The offence sections the parties seek to compound, exactly as the brief gives them; if fewer than all offences, say which remain." },
  { "id": "compoundability", "name": "Compoundability and Permission", "required": true, "description": "Always the blank: [To be confirmed: that each offence named is compoundable under {governing_provision}, and whether the permission of this Court is required]. Never a statement either way." },
  { "id": "settlement", "name": "Settlement", "required": true, "description": "Date and terms of settlement, and whether in writing, as the brief gives them; blank where not given." },
  { "id": "free_consent", "name": "Free Consent", "required": true, "description": "The parties' statement of free consent only where the brief confirms it; otherwise the blank." },
  { "id": "earlier_applications", "name": "Earlier Compounding Applications", "required": true, "description": "Every earlier compounding / compromise application in this case, with date and result; or the blank where the brief is silent." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part (both applicants)." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, the applicants jointly and most respectfully pray that this Hon'ble Court may graciously be pleased to:

a) Permit the compounding of the offence(s) under {offences_to_compound} in {case_type} No. {case_number} between Applicant No. 1 {compounding_party} and Applicant No. 2 {accused}, under {governing_provision}, granting permission for the compounding where such permission is required;
b) Record the compounding and acquit Applicant No. 2 of the offence(s) so compounded;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicants shall ever pray.
```

## verificationTemplate

```
VERIFICATION

We, (1) {compounding_party}, S/o / D/o / W/o {compounding_party_parentName}, aged about {compounding_party_age} years, resident of {compounding_party_address}, Applicant No. 1, and (2) {accused}, S/o / D/o / W/o {accused_parentName}, aged about {accused_age} years, resident of {accused_address}, Applicant No. 2, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to our knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Applicant No. 1                                   Applicant No. 2
```

## filingChecklist

```json
[
  "Joint application signed by both applicants",
  "Separate affidavits of Applicant No. 1 and Applicant No. 2, if the court requires them",
  "Copy of written settlement / compromise, if any",
  "Identity proof of both applicants",
  "Both applicants to be present in court for identification, if the court requires",
  "Copy of FIR / complaint and charge-sheet, if any",
  "Vakalatnama for each applicant",
  "Advocate to confirm compoundability of each offence and whether court permission is needed (not stated by Lawie)",
  "Court fee / stamp: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a joint application by the person entitled to compound (Applicant No. 1) and the accused (Applicant No. 2) to compound the offence(s) the BRIEF names.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "COMPOUNDABILITY. Never state that an offence is compoundable or not compoundable, or that it is compoundable with or without the permission of the Court. Do not list or describe the compoundable-offence tables. Write exactly: [To be confirmed: that each offence named is compoundable under the section cited, and whether the permission of this Court is required].",
  "If the BRIEF names fewer offences to compound than are alleged, say which offences the application covers and that the others are not covered. Do not say what follows for those others.",
  "If the BRIEF says an appeal or revision is pending or the accused has been convicted, write [To be confirmed: whether leave of the appellate or revisional Court is needed and has been sought]. Do not state the rule.",
  "State the settlement (date, terms, whether in writing) exactly as the BRIEF gives it. Do not add a sum, a term or a reason for settling that the BRIEF does not state.",
  "State that the parties settled of their own free will only where the BRIEF confirms it. Otherwise write [To be confirmed: that both parties settled of their own free will, without coercion or inducement].",
  "If the BRIEF names co-accused who are not parties to this application, name them as the BRIEF does and do not state the effect on them.",
  "State every earlier compounding or compromise application in this case that the BRIEF mentions, with date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier compounding or compromise application was made in this case, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| compounding_party | Applicant No. 1 name | text | yes | cause title, verification |
| compounding_party_role | Applicant No. 1 is | select (Complainant; Victim / person aggrieved; Other — state) | yes | capacity clause |
| compounding_party_parentage / _age / _address | Applicant No. 1 particulars | text / number / textarea | yes | verification |
| accused | Applicant No. 2 (accused) name | text | yes | cause title |
| accused_parentage / accused_age / accused_address | Accused particulars | text / number / textarea | yes | verification |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| case_type / case_number | Case type and number | text | yes | nomenclature |
| prosecution | Prosecution / complainant (as in cause title) | text | yes | cause title |
| fir_number / police_station | FIR particulars (if police case) | text | no | particulars |
| fir_date | Date of FIR, or of complaint | date | yes | old/new law switch |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| offences_alleged | All offences alleged / charged (sections, with Act) | textarea | yes | particulars |
| offences_to_compound | Offences to be compounded (sections, with Act) | textarea | yes | prayer |
| case_stage | Stage | select (Before evidence; During trial; After conviction — appeal or revision pending) | yes | leave blank |
| settlement_date | Date of settlement | date | no | settlement clause |
| settlement_terms | Terms of settlement | textarea | no | settlement clause, averment |
| settlement_in_writing | Settlement in writing? | select (Yes, No) | no | checklist |
| settlement_voluntary | Both parties confirm free consent? | select (Yes — both confirm; Not confirmed) | yes | averment unlock |
| co_accused_not_party | Co-accused not party to this application | textarea | no | body |
| earlier_applications | Earlier compounding applications (date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "compounding_application",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "offence_compoundable", "kind": "submission", "what": "The offence is compoundable", "phrases": ["the offence is compoundable", "compoundable in nature", "compoundable without permission of the court", "falls in the table of compoundable offences", "sulah ho sakta hai"], "unlocked_by": null },
    { "id": "compromise_voluntary", "kind": "averment", "what": "The parties settled of their own free will", "phrases": ["of their own free will", "without any coercion or undue influence", "voluntarily settled", "apni marzi se samjhauta"], "unlocked_by": { "key": "settlement_voluntary", "label": "Both parties confirm free consent?", "equals": ["yes — both confirm", "yes"] } },
    { "id": "dispute_settled", "kind": "averment", "what": "The dispute has been settled on stated terms", "phrases": ["have amicably settled all disputes", "the matter has been compromised", "samjhauta ho gaya hai"], "unlocked_by": { "key": "settlement_terms", "label": "Terms of settlement", "present": true } },
    { "id": "no_grievance_remains", "kind": "averment", "what": "The complainant has no remaining grievance", "phrases": ["has no grievance left", "does not wish to pursue the case", "koi shikayat nahi"], "unlocked_by": null },
    { "id": "no_earlier_application", "kind": "averment", "what": "No earlier compounding application", "phrases": ["this is the first compounding application", "no compromise petition was filed earlier"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier compounding applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "compromise_voluntary", "kind": "averment", "averment": "the applicants have settled the matter of their own free will, without coercion or inducement", "requires": { "key": "settlement_voluntary", "label": "Both parties confirm free consent?", "equals": ["yes — both confirm", "yes"] } },
    { "id": "dispute_settled", "kind": "averment", "averment": "the applicants have settled the matter on the following terms: {{settlement_terms}}", "requires": { "key": "settlement_terms", "label": "Terms of settlement", "present": true } },
    { "id": "no_earlier_application", "kind": "averment", "averment": "no earlier compounding application has been made in this case", "requires": { "key": "earlier_applications", "label": "Earlier compounding applications", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- BNSS 359 sub-sections: the two tables, the permission rule, leave where the accused is committed / convicted / appeal pending, the effect of compounding as acquittal, and who may compound for a minor, a person of unsound mind or a deceased person. None cited; prayer (b) seeks acquittal as relief without citing the sub-section.
- Whether the BNSS tables differ from CrPC 320 for any offence (e.g. offences against women, cheating). Deliberately not encoded.

## Notes for Ajay

1. **Risk.** Prayer (b) asks for acquittal. That is the standard relief; the statutory basis is a 359 sub-section I have not cited. Confirm the wording.
2. **Risk.** Folding in `equals` — the option text "Yes — both confirm" contains an em dash; confirm the loader folds punctuation as README says, or the lead should use option ids (`yes_both_confirm`).
3. **Out of scope, flag.** Non-compoundable offences settled between parties go to the High Court (BNSS 528 quashing, separate pack). Consider a `case_stage`/cue line pointing advocates there; I have not drafted it.
4. Sessions included in `court_levels` because compounding can happen at trial in Sessions; no appellate overlay drafted.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Compoundability and court permission always a blank for the advocate; no table reproduced | Approved |
| Prayer (b) acquittal, citing 359 at section level only | Approved |
| Option value with an em dash ("Yes — both confirm") | Condition: the averment condition matches an option id, not the label text |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.
