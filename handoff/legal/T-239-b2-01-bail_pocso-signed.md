# T-239 b2 #01 bail_pocso (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Copied from the signed `bail_ndps` (b1 #13) and the T-245 / T-237 / T-241 texts. BNSS mapping uses only the pairs in the signed table (CrPC 439 -> BNSS 483). Special-Act bail; the child is never named.

| Field | Value |
|---|---|
| id | `bail_pocso` |
| displayName | Bail Application in POCSO Case |
| category | Criminal: bail and custody |
| court_levels | `["special_court_pocso", "high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (liberty) |
| averments file | `_averments/bail_pocso.json`, `inherits: "bail_regular"`, `key_map: {}` (form keys reuse bail_regular's ledger keys) |

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
  "caseNomenclature": "BAIL APPLICATION No. _____ of [YEAR]\nUnder {governing_provision}\n(In {firDetails}, under the Protection of Children from Sexual Offences Act, 2012)"
}
```

## mandatoryClauses

```json
[
  {
    "id": "fir_details",
    "name": "FIR Details",
    "required": true,
    "description": "FIR or crime number, police station, date of registration, and the sections alleged (the Protection of Children from Sexual Offences Act, 2012 and any IPC or BNS sections), exactly as the brief gives them. No description of the alleged acts."
  },
  {
    "id": "victim_reference",
    "name": "Victim (name withheld)",
    "required": true,
    "description": "The victim is referred to only as \"Victim (name withheld)\". No name, age, address, school, family detail, photograph or other identifying detail, not even the victim's initials, and no relationship to the applicant unless the brief gives it as a ground."
  },
  {
    "id": "custody_status",
    "name": "Custody Status",
    "required": true,
    "description": "Date of arrest, date custody began, and whether judicial or police custody, as the brief gives them. No count of days."
  },
  {
    "id": "grounds",
    "name": "Grounds for Bail",
    "required": true,
    "description": "Only the grounds the brief gives, each as the brief puts it. No description of the offence beyond the FIR sections."
  },
  {
    "id": "undertakings",
    "name": "Undertakings",
    "required": true,
    "description": "Undertakings by the applicant for the future, if released on bail: not to abscond, not to tamper with the evidence or influence witnesses, not to contact or approach the victim or the victim's family, to appear on every date fixed, and to abide by the conditions imposed. Never a statement of fact."
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

The POCSO Act is cited by name only, unaffected by T-245. No section of it is cited in any signed field, and it is not listed in `relevantActs` (no section is certain).

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
  "Confidentiality of the child's identity: check the Act's provision keeping the child's identity confidential (verify) and remove the child's name, address, school and photograph from the application, annexures and any copy of FIR or order before filing; use \"Victim (name withheld)\" only",
  "Check whether notice of this application is to be given to the informant or the victim's representative (verify), and attach proof of service if required",
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
  "Draft a Regular Bail Application in a case under the Protection of Children from Sexual Offences Act, 2012, before the Special Court or the High Court. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Where the BRIEF says the application is before a Special Court, cite the bail provision as GOVERNING PROVISION gives it. Cite the Protection of Children from Sexual Offences Act, 2012 by name only; a section of it may appear only in the FIR details in paragraph 1, exactly as the BRIEF gives them, and nowhere else.",
  "Begin PARAGRAPH 1 with the exact FIR or crime details provided: number, date, police station, district, and the sections alleged. Use the values EXACTLY as given. State the offences only as the sections the FIR gives. Do not describe the alleged acts, and do not add any detail of the alleged offence the BRIEF does not give.",
  "Never name or identify the child. Refer to the victim only as \"Victim (name withheld)\", never by name and not even by initials. Do not state the victim's name, age, address, school, parentage or any other detail from which the victim could be identified, and do not state the applicant's relationship to the victim unless the BRIEF gives it as a ground. Do not state that the victim is or is not a child, and do not state or argue the statutory presumptions of the Act.",
  "Do not say that the relationship was consensual or that the victim consented, in any form, even if the BRIEF says so: the advocate may add such a ground by hand. Do not say that the victim is a major or of any stated age. Do not say that the complaint is false or motivated unless the BRIEF states it as a ground; then state it as the BRIEF puts it, as the applicant's case, never as a fact.",
  "State the custody status as the BRIEF gives it: the date of arrest, the date from which the applicant has been in custody, and whether that custody is judicial or police. Where the BRIEF gives the date of arrest and the date custody began as two dates, keep them as two dates. Do not work out the number of days in custody.",
  "Set out the grounds for bail that the BRIEF gives, and no others. Do not assert a ground (for example no criminal history, no recovery from the applicant, false implication, delay in the investigation, parity with a co-accused) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it. Cite a section of any Act other than those in ACTS only if the BRIEF gives it.",
  "Give the standard undertakings as undertakings by the applicant for the future, never as facts and never as undertakings by the advocate: the applicant undertakes that, if released on bail, the applicant will not abscond, will not tamper with the evidence, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will not contact or approach the victim or the victim's family, directly or indirectly, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.",
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
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `fir_number` | FIR / Crime Number | text | yes | Cause title, para 1 |
| `agency` | Police Station / Agency | text | yes | Para 1, respondent name |
| `pocso_sections` | POCSO Act sections alleged (as in FIR) | text | yes | Para 1; only source of POCSO section numbers |
| `other_sections` | Other sections alleged (IPC / BNS, as in FIR) | text | no | Para 1; no conversion |
| `victim_placeholder` | Reference to the victim | fixed text: Victim (name withheld) | yes | victim_reference; not editable; no victim name field exists |
| `medical_record_note` | Medical or age-related record of the applicant (as instructed) | textarea | no | grounds; bail_regular `medical_*` keys |
| `false_implication_ground` | False implication / motive (as instructed) | textarea | no | bail_regular key `false_implication_motive` |
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

## _averments (`_averments/bail_pocso.json`)

```json
{
  "pack": "bail_pocso",
  "inherits": "bail_regular",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "victim_identified",
      "kind": "averment",
      "what": "Any name or identifying detail of the child",
      "phrases": [
        "the victim, Master",
        "the victim, Miss",
        "the victim, Ms.",
        "daughter of",
        "son of the informant",
        "student of",
        "resident of the victim",
        "victim's school",
        "victim's address",
        "peedita ka naam"
      ],
      "unlocked_by": null
    },
    {
      "id": "offence_described",
      "kind": "averment",
      "what": "A description of the alleged acts beyond the FIR sections",
      "phrases": [
        "the alleged act was",
        "the incident is that",
        "it is alleged that the applicant touched",
        "it is alleged that the applicant took",
        "kaha jata hai ki aavedak ne"
      ],
      "unlocked_by": null
    },
    {
      "id": "victim_status_asserted",
      "kind": "averment",
      "what": "That the victim is or is not a child, or is of a stated age",
      "phrases": [
        "the victim is a minor",
        "the victim is a child",
        "the victim is a major",
        "the victim was above eighteen",
        "the victim is aged",
        "peedita naabalig",
        "peedita balig"
      ],
      "unlocked_by": null
    },
    {
      "id": "statutory_presumption",
      "kind": "submission",
      "what": "Statutory presumptions of the Act stated or argued",
      "phrases": [
        "presumption under the Act",
        "presumption of guilt does not apply",
        "statutory presumption is rebutted",
        "presumption is not attracted"
      ],
      "unlocked_by": null
    },
    {
      "id": "consent_ground",
      "kind": "averment",
      "what": "The relationship was consensual / the victim consented (banned outright; the advocate may add it by hand)",
      "phrases": [
        "relationship was consensual",
        "with the consent of the victim",
        "love affair",
        "willing relationship",
        "sehmati se"
      ],
      "unlocked_by": null
    },
    {
      "id": "complaint_motivated",
      "kind": "averment",
      "what": "The complaint is false, motivated or a counterblast",
      "phrases": [
        "complaint is false",
        "counterblast",
        "due to enmity",
        "motivated complaint",
        "jhootha mukadma"
      ],
      "unlocked_by": {
        "key": "false_implication_ground",
        "label": "False implication / motive (as instructed)",
        "present": true
      }
    }
  ],
  "allowed": [
    {
      "id": "complaint_motivated",
      "kind": "averment",
      "averment": "it is the applicant's case that the applicant has been falsely implicated, on the following ground: {{false_implication_ground}}",
      "requires": {
        "key": "false_implication_ground",
        "label": "False implication / motive (as instructed)",
        "present": true
      }
    }
  ]
}
```

Pairing check: the only banned entry with non-null `unlocked_by` is `complaint_motivated`, and it has an allowed twin with the same id. `consent_ground` is banned with `unlocked_by: null` and has no twin (Ajay ruling 4). Inherited bail_regular entries (earlier_bail_applications, no_recovery, recovery_planted ...) stay as signed there. `woman_proviso` and `under_sixteen` twins are BNSS 480 provisos: as in #13, propose overriding both here with `unlocked_by: null` and no twin (Ajay to decide; not written into the JSON above).

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_pocso` | `earlier_applications` | EA-standard (T-237) | Approve |
| `bail_pocso` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

## Verify (not in signed text)

- POCSO Act s.29 (presumptions) and the other presumption sections: not stated; the Drafter is told to say nothing on them.
- The section of the Act on confidentiality of the child's identity (and the penal section for disclosure): checklist cue only, no number. Confirm the section and whether it bars even the redacted FIR copy in the file.
- BNSS 531 / CrPC 484 (repeal and savings): not cited in any signed field; outside the approved set. The T-245 `procedure_code` switch carries the old/new law question.
- Whether the Act or the BNSS requires notice to the informant or victim at the bail hearing, and the BNSS 483 provisos on it (checklist cue says "verify").
- Whether any POCSO section bars bail or adds conditions (none stated in the pack).
- POCSO sections of the offences: only from the FIR, via the `pocso_sections` form key.

## Rulings applied (Ajay, 11 Oct 2026)

- `court_levels` ids are the lead's to map to T-240; left as drafted.
- `{governing_provision}` follows the court level chosen in the form (Special Court under the Act or High Court -> CrPC 439 / BNSS 483). Lawie does not advise whether a Special Court is a Court of Session.
- The applicant's future undertaking not to contact the victim or the victim's family: approved.
- The "consent" ground is banned outright (`unlocked_by: null`, no twin, no form key); the advocate may add it by hand.
- The child is never named, not even by initials. The informant is not named either: respondent is the State.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs: CrPC 437 to BNSS 480, CrPC 439 to BNSS 483 (signed table, T-255). Special Acts are cited as the ruling below says. The cue set for `earlier_applications` is EA-standard (T-237). Anything under "Verify" is not signed. Category (T-240): Criminal: bail and custody. `court_levels` ids are the lead's to map to the T-240 list. Which section the application cites follows the court level chosen in the form; Lawie does not advise whether a Special Court is a Court of Session.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A (every template, twice) |
| Ruling | The child is never named, not even by initials; the "consent" ground is banned outright (the advocate may add it by hand); the applicant's future undertaking not to contact the victim or the victim's family is approved. POCSO sections only in the FIR details as the brief gives them; no description of the offence. Confidentiality cue (verify), no section number. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
