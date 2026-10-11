# T-239 b1 #11 summon_additional_accused_358 (signed)

Status: SIGNED (see end). Drafted 12 Oct 2026, reviewed and amended by Ajay. Mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 319 -> BNSS 358 ("Power to proceed against other persons appearing to be guilty"), CrPC 484 -> BNSS 531.

| Field | Value |
|---|---|
| id | `summon_additional_accused_358` |
| displayName | Application to Proceed against an Additional Person |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/summon_additional_accused_358.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "358", "description": "Power to proceed against other persons appearing to be guilty of offence" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "319", "description": "Power to proceed against other persons appearing to be guilty of offence" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{prosecution} ... Prosecution / Complainant\nVERSUS\n{accused} ... Accused\n\nAPPLICATION ON BEHALF OF: {applicant} ({applicant_role})",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant (Prosecution / Complainant / Victim)" },
    { "role": "proposed_accused", "label": "Person proposed to be proceeded against" }
  ],
  "caseNomenclature": "{case_type} No. {case_number}\nAPPLICATION UNDER {governing_provision} TO PROCEED AGAINST {proposed_person_name}"
}
```

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, FIR / complaint particulars, offences, present accused and stage, as the brief gives them." },
  { "id": "proposed_person", "name": "Person Proposed", "required": true, "description": "Name, parentage and address of the person, and whether named in the FIR / complaint and charge-sheeted, as the brief gives them; blank where not given." },
  { "id": "evidence_relied", "name": "Evidence Relied On", "required": true, "description": "The evidence recorded in this inquiry or trial on which the application rests: witness, date of deposition and what it says, as the brief gives them. Never evidence the brief does not give." },
  { "id": "offences_proposed", "name": "Offences", "required": true, "description": "The offence sections for which the person is to be proceeded against, as the brief gives them; blank if not given." },
  { "id": "submission", "name": "Submission", "required": true, "description": "Submission that, on that evidence, it appears the person has committed an offence for which that person could be tried together with the accused. Never a statement of guilt as fact." },
  { "id": "earlier_applications", "name": "Earlier Applications", "required": true, "description": "Every earlier application in this case to proceed against this or any other person, with date and result; or the blank where the brief is silent." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Proceed against {proposed_person_name}, S/o / D/o / W/o {proposed_person_parentage}, resident of {proposed_person_address}, under {governing_provision}, for the offence(s) set out in this application, to be tried together with the accused in {case_type} No. {case_number};
b) Issue such process against {proposed_person_name} as this Hon'ble Court may deem fit;
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

(Suppressed when the applicant is the State through the Prosecutor; see #10 Note 1.)

## filingChecklist

```json
[
  "Application (original + copies for the accused and the prosecution)",
  "Certified / attested copies of the deposition(s) relied on",
  "Copy of FIR / complaint and charge-sheet",
  "Copy of the order sheet showing the present stage",
  "Address particulars of the person proposed, for process",
  "Process fee cue as per court practice (not computed by Lawie)",
  "Vakalatnama (if not already on record)"
]
```

## promptInstructions

```json
[
  "Draft an application asking the Court to proceed against a person who is not an accused, on the strength of evidence recorded in this inquiry or trial.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Rest the application only on evidence recorded in this inquiry or trial as the BRIEF gives it: for each item, the witness, the date of deposition and what it says. Do not paraphrase a deposition beyond what the BRIEF says it contains. Do not rely on the FIR, the case diary or the charge-sheet as evidence; they may be stated as background only.",
  "If the BRIEF gives no evidence recorded in the inquiry or trial, write [To be confirmed: the evidence recorded in this case on which this application rests] and do not supply any.",
  "Never state as fact that the person committed the offence or is guilty. Write it as a submission: it is submitted that, from the evidence stated, it appears that the person has committed an offence for which that person could be tried together with the accused.",
  "Do not state the standard of satisfaction the Court must apply. Where an authority on that standard would normally be cited, write [Authority — add if relied upon].",
  "Do not allege collusion, deliberate omission by the police or a motive unless the BRIEF states it.",
  "State every earlier application in this case to proceed against any person that the BRIEF mentions, with date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application to proceed against any person was made in this case, and with what result].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title |
| applicant_role | Applicant is | select (Prosecution through Prosecutor; Complainant; Victim) | yes | cause title; verification on/off |
| applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / number / textarea | yes unless Prosecution | verification |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| case_type / case_number | Case type and number | text | yes | nomenclature |
| prosecution / accused | Parties as in cause title | text | yes | cause title |
| fir_number / police_station | FIR particulars (if police case) | text | no | particulars |
| fir_date | Date of FIR, or of complaint | date | yes | old/new law switch |
| offence_date | Date of the alleged offence | date | no | offence law switch (T-245 S-text) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| offences_alleged | Offences alleged against present accused | textarea | yes | particulars |
| case_stage | Stage | select (Inquiry; Prosecution evidence; Other) | yes | particulars |
| proposed_person_name | Person proposed | text | yes | prayer |
| proposed_person_parentage | Parentage | text | no | prayer (blank if empty) |
| proposed_person_address | Address | textarea | no | prayer, process |
| named_in_fir | Named in FIR / complaint? | select (Yes, No, Not known) | yes | averment unlock |
| chargesheet_status | Charge-sheeted? | select (Not charge-sheeted; Kept pending / column 2; Not known) | no | background |
| proposed_offences | Offences against the person proposed (sections, with Act) | textarea | yes | offences clause |
| evidence_relied | Evidence recorded: witness, date, what it says | textarea | yes | evidence clause, submission unlock |
| earlier_applications | Earlier applications to proceed against any person (date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "summon_additional_accused_358",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "person_guilty", "kind": "averment", "what": "The person committed the offence", "phrases": ["has committed the offence", "is guilty of", "actively participated in the crime", "is the main culprit", "usne hi kiya hai"], "unlocked_by": null },
    { "id": "appears_from_evidence", "kind": "submission", "what": "From the evidence it appears the person committed an offence", "phrases": ["it appears from the evidence", "the evidence clearly shows", "the witnesses have categorically stated"], "unlocked_by": { "key": "evidence_relied", "label": "Evidence recorded: witness, date, what it says", "present": true } },
    { "id": "named_in_fir", "kind": "averment", "what": "The person is named in the FIR / complaint", "phrases": ["is named in the FIR", "was named in the complaint", "FIR mein naam hai"], "unlocked_by": { "key": "named_in_fir", "label": "Named in FIR / complaint?", "equals": ["yes"] } },
    { "id": "police_collusion", "kind": "averment", "what": "The police deliberately left the person out", "phrases": ["in collusion with the police", "the investigating officer deliberately omitted", "to shield the accused", "police ne bacha liya"], "unlocked_by": null },
    { "id": "no_earlier_application", "kind": "averment", "what": "No earlier application to proceed against any person", "phrases": ["no such application was filed earlier", "this is the first application under section 319", "this is the first application under section 358"], "unlocked_by": { "key": "earlier_applications", "label": "Earlier applications to proceed against any person", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ],
  "allowed": [
    { "id": "appears_from_evidence", "kind": "submission", "averment": "it is submitted that, from the evidence recorded in this case, namely {{evidence_relied}}, it appears that {{proposed_person_name}} has committed an offence for which that person could be tried together with the accused", "requires": { "key": "evidence_relied", "label": "Evidence recorded: witness, date, what it says", "present": true } },
    { "id": "named_in_fir", "kind": "averment", "averment": "{{proposed_person_name}} is named in the FIR / complaint", "requires": { "key": "named_in_fir", "label": "Named in FIR / complaint?", "equals": ["yes"] } },
    { "id": "no_earlier_application", "kind": "averment", "averment": "no earlier application to proceed against any person has been made in this case", "requires": { "key": "earlier_applications", "label": "Earlier applications to proceed against any person", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- BNSS 358 sub-sections: arrest or summons of a person attending / not attending court, proceedings to commence afresh and witnesses to be re-heard, and any change from CrPC 319. Not cited.
- The "could be tried together with the accused" wording in the allowed submission tracks CrPC 319(1) from knowledge; confirm BNSS 358(1) text before signing.
- Whether the Sessions Court may act on this at the committal / pre-evidence stage. Not encoded.

## Notes for Ajay

1. **Risk.** The allowed submission names `{{proposed_person_name}}`, which is not in the `requires` condition. README: an allowed entry whose text names a fact the ledger does not hold is not offered, so it is safe, but you may want `all_of` with `proposed_person_name` present for clarity.
2. **Risk.** Applying against a named person in a verified pleading is defamation-sensitive. The pack bans any statement of guilt and any collusion allegation without facts. Recommend Anushka sample this one despite Tier B.
3. `chargesheet_status` is background only; no averment drawn from it.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended by me before signing: the old/new law instruction is replaced by the T-245 S-text and P-text (345bd24), word for word; `{provision_cited}` is renamed `{governing_provision}` (T-245); `offence_date` and `procedure_code` keys added; every "[Section — verify before filing ...]" blank is now a "[To be confirmed: ...]" blank (T-136 style). Every BNSS/CrPC pair cited above is in the signed `crpc-to-bnss.json`. Nothing under "Verify (not in signed text)" is signed; it stays out until checked against the bare act.

The "Notes" section is the drafter's reasoning, kept for the record; it is not text to build. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Spec as amended | Approved |
| Guilt never stated as fact; collusion and motive only if the brief states them | Approved |
| Allowed submission naming `{{proposed_person_name}}` | Condition: `requires` becomes `all_of` with `proposed_person_name` present |
| When the Prosecutor files, the verification block is left out | Condition, as #10 |
| Anushka | Tier A treatment: every template sampled, twice (names a third person in a verified filing) |
| "Could be tried together with the accused" in prayer (a) | Approved: it describes the relief, it does not quote the section |

Signed: Ajay (CLO), 12 Oct 2026 IST. S = 1 Ink. Any other wording comes back to me.
