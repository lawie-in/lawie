# T-239 b2 #11 transfer_application_sessions_448 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. v2: revised under Ajay's rulings. Form hint and checklist item added on the grounds field; no heading in signed fields. Section pairs are from the corrected signed table (CrPC to BNSS): CrPC 408 → BNSS 448. No sub-section is cited. The Drafter states no ground unless the brief gives it and never characterises the judge or the opposite party.

| Field | Value |
|---|---|
| id | `transfer_application_sessions_448` |
| displayName | Application to the Sessions Judge for Transfer of a Criminal Case or Appeal |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["sessions"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/transfer_application_sessions_448.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "448",
        "description": "Power of Sessions Judge to transfer cases and appeals"
      }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      {
        "number": "408",
        "description": "Power of Sessions Judge to transfer cases and appeals"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF THE SESSIONS JUDGE\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant\nVERSUS\n{respondents} ... Respondent(s)",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant"
    },
    {
      "role": "respondent",
      "label": "Respondent(s) (the other parties in the case, named as in the case; the State is included where it is a party)"
    }
  ],
  "caseNomenclature": "[To be confirmed: heading as per the Court's nomenclature] No. _____ of [YEAR]\n(Under {governing_provision})\n(For transfer of {proceedingType} No. {caseNumber}, pending in the court of {transferorCourt})"
}
```

The heading is a blank in the cause title (nomenclature varies by State and is not signed); court-rules overlay.

## mandatoryClauses

```json
[
  {"id": "case_to_be_transferred", "name": "Case or Appeal to Be Transferred", "required": true, "description": "The case or appeal (number, parties, court, place), its stage and next date, and the FIR particulars and offences, each as the brief gives them; the blank where it does not."},
  {"id": "court_sought", "name": "Court to Which Transfer Is Sought", "required": true, "description": "The court to which the brief asks for transfer, or the blank; where the brief names none, the prayer asks for transfer to the court the Sessions Judge directs."},
  {"id": "grounds_for_transfer", "name": "Grounds for Transfer", "required": true, "description": "The grounds the brief gives, reproduced as one block in the advocate's own words; none added by Lawie. No ground, apprehension or reason the brief does not give. No characterisation by Lawie of the Presiding Officer, the court, the opposite party, a witness or a lawyer."},
  {"id": "earlier_applications", "name": "Earlier Transfer Applications and Petitions", "required": true, "description": "Every earlier application or petition for transfer of this case or appeal, to the Sessions Judge, the High Court or the Supreme Court, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."},
  {"id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Transfer {proceedingType} No. {caseNumber}, pending in the court of {transferorCourt}, to {transfereeCourt}, under {governing_provision};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245). Pair: CrPC 408 → BNSS 448 (Sessions Judge):
- BNSS and BSA: `Section 448 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 408 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 408 CrPC or Section 448 BNSS]`

`{transfereeCourt}` is the court the form gives, or "such court of competent jurisdiction as this Hon'ble Court may direct" when the form is blank.

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the applicant" or "pairokar of the applicant".

## filingChecklist

```json
[
  "Application, with copies for the opposite party and the Prosecutor",
  "Affidavit in support, if the court's practice requires it (verify)",
  "Copy of the order sheet(s) and of the latest order in the case sought to be transferred",
  "Copy of the FIR or complaint, if the brief has it",
  "Copies of earlier transfer applications and orders on them, if any",
  "Notice of the application to the Public Prosecutor and to the other parties, as the court's practice requires (verify)",
  "Check every allegation against a judge or a party in your grounds: it is yours to support (verify)",
  "Vakalatnama",
  "Court fee/stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an Application to the Sessions Judge asking that a pending criminal case or criminal appeal be transferred from one criminal court to another. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which the application is made, in the heading, the opening paragraph and the prayer. Do not cite any sub-section. Do not say which courts are within the Sessions Judge's division.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Begin with the case or appeal to be transferred: its number, the court, the parties, its stage and the next date, and the FIR or complaint particulars and the offences, as the BRIEF gives them. Use a blank for any of these the BRIEF does not give. Do not say that the trial is about to begin or about to end unless the BRIEF says so.",
  "State the court to which transfer is sought only as the BRIEF gives it. Where the BRIEF does not give it, ask for transfer to such court of competent jurisdiction as this Hon'ble Court may direct, and write [To be confirmed: court to which transfer is sought].",
  "Reproduce the grounds for transfer the BRIEF gives (the transfer_grounds field) as one block, in the advocate's own words, without rewriting, splitting, adding to or strengthening them. Write no ground of your own, and add no reason, detail or adjective. Do not say that the transfer is expedient or necessary for the ends of justice, that a fair trial is not possible, or that there is an apprehension of any kind, unless the advocate's block says it. Outside that block, never characterise the Presiding Officer, the court, the opposite party, any witness or any lawyer, and refer to the court only by its designation. Where the BRIEF gives no ground, write [To be confirmed: grounds on which transfer is sought].",
  "State every earlier application or petition for transfer of this case or appeal that the BRIEF mentions, whether to the Sessions Judge, the High Court or the Supreme Court: the court, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions none, do not say that there was none or that this is the first application; write [To be confirmed: whether any earlier application or petition for transfer was made in this matter, to which court, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `proceeding_type` | To be transferred | select: criminal case (trial) / criminal appeal | yes | case_to_be_transferred |
| `case_number` | Case / appeal number | text | yes | Cause title |
| `transferor_court` | Court from which transfer is sought | text | yes | case_to_be_transferred |
| `transferor_place` | District and place of that court | text | yes | case_to_be_transferred |
| `parties_in_case` | Parties in the case (names as in the case) | textarea | yes | Respondents |
| `petitioner_role` | Petitioner is | select: accused / complainant-informant / victim / State / other (as instructed) | yes | Cause title |
| `case_stage_and_next_date` | Stage of the case and next date (as instructed) | text | no | case_to_be_transferred |
| `transferee_court` | Court to which transfer is sought (as instructed) | text | no | court_sought; blank if not given |
| `transfer_grounds` | Grounds for transfer (as instructed) | textarea | yes | grounds_for_transfer; unlocks. Form hint: "Any allegation against a judge or a party must be one you can support; Lawie reproduces what you enter." |
| `fir_number`, `police_station`, `sections_alleged` | FIR particulars and sections (blank if a complaint case) | text | no | case_to_be_transferred |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `earlier_applications` | Earlier transfer applications and petitions (court, date, result) | textarea | no | earlier_applications; unlocks |
| `state`, `court_place`, `sessions_division` | Sessions Judge's court and place | select / text | yes | Cause title |
| `petitioner_name`, `father_name`, `petitioner_age`, `address` | Petitioner | text | name, parentage, address yes | Cause title, verification |
| verifier keys | verifier_capacity, pairokar_name, pairokar_relation, as bail_ndps (#13) |  |  | verificationTemplate |

## _averments (`_averments/transfer_application_sessions_448.json`)

```json
{
  "pack": "transfer_application_sessions_448",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "judge_characterised", "kind": "averment", "what": "The Presiding Officer or the court is characterised", "phrases": ["the judge is biased", "the presiding officer is prejudiced", "the court has shown bias", "the judge has pre-judged", "the court is hostile to the petitioner", "judge ka rukh paksh-pati hai"], "unlocked_by": null},
    {"id": "opposite_party_characterised", "kind": "averment", "what": "The opposite party is characterised", "phrases": ["the opposite party is influential", "powerful and influential", "has political backing", "uses muscle power", "a person of criminal antecedents", "dabang hai"], "unlocked_by": null},
    {"id": "transfer_ground_asserted", "kind": "submission", "what": "A ground for transfer (apprehension of bias, convenience, safety, distance or any other)", "phrases": ["fair trial is not possible", "apprehension of bias", "reasonable apprehension", "will not get justice", "a fair and impartial trial", "convenience of the parties", "inconvenience to the witnesses", "threat to life", "nyay milne ki ummeed nahi"], "unlocked_by": {"key": "transfer_grounds", "label": "Grounds for transfer (as instructed)", "present": true}},
    {"id": "no_other_transfer_application", "kind": "averment", "what": "No other transfer application or petition was made or is pending (suppression risk)", "phrases": ["this is the first transfer petition", "this is the first application for transfer", "no other transfer petition is pending", "no application for transfer has been made earlier", "pehli arzi hai"], "unlocked_by": {"key": "earlier_applications", "label": "Earlier transfer applications and petitions", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}}
  ],
  "allowed": [
    {"id": "transfer_ground_asserted", "kind": "submission", "averment": "it is submitted that transfer is sought on the following grounds, as instructed: {{transfer_grounds}}", "requires": {"key": "transfer_grounds", "label": "Grounds for transfer (as instructed)", "present": true}},
    {"id": "no_other_transfer_application", "kind": "averment", "averment": "no earlier application or petition for transfer of this case or appeal has been made", "requires": {"key": "earlier_applications", "label": "Earlier transfer applications and petitions", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "earlier_applications_listed", "kind": "averment", "averment": "the earlier applications and petitions for transfer are: {{earlier_applications}}", "requires": {"key": "earlier_applications", "label": "Earlier transfer applications and petitions", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}}
  ]
}
```

Pairing check: as #09.

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark |
|---|---|---|---|
| `transfer_application_sessions_448` | `earlier_applications` | EA-transfer | Approved (Ajay) |

**EA-transfer** (approved by Ajay): all: [any: `transfer`, `petition`, `application`, `स्थानांतरण`, `याचिका`], [any: `earlier`, `previous`, `prior`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `वापस`].

## Verify (not in signed text)

- BNSS 448 sub-sections: the Sessions Judge's power over cases and appeals in his sessions division, from which courts and to which, the grounds, that the application is by motion supported by an affidavit, and the power to order costs (understood from CrPC 408). None is cited or drafted.
- Whether the power covers only courts in the same sessions division, and whether it covers an appeal pending before the Sessions Judge's own court. The prompt forbids stating either.
- Whether the Sessions Judge may transfer a case pending in a Special Court or a court of another district. Not stated.

## Notes for Ajay

- Tier B, S = 1. Same bans as #09: no ground unless the brief gives it, and no characterisation of the judge or the opposite party.
- Risk: one id covers a case and an appeal (the brief says "a case or appeal"). `proceeding_type` carries the difference in the cause title and the prayer.
- Group A (T-245): S-text and P-text are included because the case being moved carries an offence date and a procedure date. If you want the transfer packs P-text only, drop the S-text entry and `offence_date`.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs (corrected table, T-255): 415/374, 418/377, 419/378, 432/391, 446/406, 447/407, 448/408. The cue set for the earlier-proceedings clause is as named in the ruling (EA-proceeding: all of [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`] and [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`]; EA-transfer: all of [any: `transfer`, `petition`, `application`, `स्थानांतरण`, `याचिका`] and [any: `earlier`, `previous`, `prior`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `वापस`]). The cues read only the reported paragraph and are a word test, not a check of meaning; the residual risk (for example a paragraph about "pending appeal" passing the cue) is accepted. Anything under "Verify" is not signed. Category (T-240): Criminal: complaints, police, trial applications. `court_levels` ids are the lead's to map. The null-unlock bans on characterising a judge, a party or a court are for the Drafter's own words: the lead tests that an advocate's ground reproduced verbatim as a value inside an allowed averment is not stripped (if the loader would strip it, those phrases leave the ban list and the instruction rule stays).

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | Application to the Sessions Judge to transfer a case or appeal (CrPC 408 / BNSS 448). The heading is a blank, as in the others. Cue set EA-transfer. |
| `displayName` carries no section number of one code only | Condition |
| The crpc-to-bnss.json in the repo carries the T-255 correction before this pack is built (the old table has the transfer pairs one place off) | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
