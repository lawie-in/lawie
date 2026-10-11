# T-239 b2 #07 state_appeal_inadequate_sentence_418 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. v2: revised under Ajay's rulings. Verification wording as signed #15. Section pairs are from the corrected signed table (CrPC to BNSS): CrPC 377 → BNSS 418. Limitation block is mandatory. No sub-section is cited. The Drafter states no punishment prescribed for any offence.

| Field | Value |
|---|---|
| id | `state_appeal_inadequate_sentence_418` |
| displayName | Appeal by the State against Inadequacy of Sentence |
| category | Criminal: appeals, revisions, quashing |
| court_levels | `["sessions", "high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (limitation; enhancement affects liberty) |
| averments file | `_averments/state_appeal_inadequate_sentence_418.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "418",
        "description": "Appeal by the State Government against sentence"
      }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      {
        "number": "377",
        "description": "Appeal by the State Government against sentence"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\nState of {state}, through {stateRepresentative} ... Appellant\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "appellant",
      "label": "Appellant (State)"
    },
    {
      "role": "respondent",
      "label": "Respondent (the convicted person, named as in the judgment)"
    }
  ],
  "caseNomenclature": "CRIMINAL APPEAL No. _____ of [YEAR]\n(Under {governing_provision})\n(Against the sentence imposed by the judgment and order dated {judgmentDate} passed by {impugnedCourt} in {impugnedCaseNumber})"
}
```

The court (Court of Session or High Court) follows the court that passed the sentence; the form asks for it and the cause title is filled from `court_designation`.

## mandatoryClauses

```json
[
  {"id": "impugned_judgment", "name": "Impugned Judgment and Sentence", "required": true, "description": "The court, the case number, the date of the judgment, the offences of conviction, and the sentence imposed, quoted as the brief gives it."},
  {"id": "authority_to_appeal", "name": "Authority to File the Appeal", "required": true, "description": "The direction of the State Government to the Public Prosecutor, or the authority under which the appeal is filed, with its reference and date, only as the brief gives them; the blank where it does not."},
  {"id": "case_particulars", "name": "FIR Particulars", "required": true, "description": "FIR number, police station and date, as the brief gives them."},
  {"id": "respondent_status", "name": "Present Status of the Respondent", "required": true, "description": "Whether the respondent is in custody, on bail, or has served the sentence, only as the brief gives it. No count of days."},
  {"id": "grounds_of_inadequacy", "name": "Grounds of Inadequacy", "required": true, "description": "The grounds on which the brief says the sentence is inadequate, reproduced as one block in the advocate's own words; none added by Lawie. The punishment prescribed for the offence is not stated unless the brief gives it."},
  {"id": "earlier_applications", "name": "Earlier Appeals and Applications", "required": true, "description": "Every earlier appeal, revision or application against this judgment or sentence, whether by the State, the respondent or any other party, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."},
  {"id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Admit and allow this appeal under {governing_provision};
b) Enhance the sentence imposed on the respondent {respondent} by the judgment and order dated {judgmentDate} passed by {impugnedCourt} in {impugnedCaseNumber}, to such sentence as this Hon'ble Court may deem fit and proper;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the appellant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245). Pair: CrPC 377 → BNSS 418 (appeal by the State against the inadequacy of a sentence):
- BNSS and BSA: `Section 418 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 377 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 377 CrPC or Section 418 BNSS]`

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above appeal are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}, and that the grounds of appeal are based on legal advice which I believe to be true. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: the Public Prosecutor or the officer authorised for the State, with the designation as the brief gives it; the blank otherwise. `{knowledgeSource}`: "the record of the case" or "the instructions of the State". The basis-of-grounds sentence ("legal advice") is as signed #15 (Ajay ruling).

## filingChecklist

```json
[
  "Memorandum of appeal, with copies as the court's rules require",
  "Certified copy of the judgment and of the order of sentence",
  "Copy of FIR and of the charge sheet",
  "Copy of the direction or sanction of the State Government for filing the appeal, and of the Public Prosecutor's authority, as the court's practice requires (verify)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Check what notice to the respondent is required before the sentence can be enhanced, and serve it (verify)",
  "Custody certificate or proof of release of the respondent, if the court requires it",
  "Vakalatnama / Memo of Appearance, as the State's practice requires",
  "Affidavit in support, if the court's rules require",
  "Court fee/stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an Appeal by the State against the inadequacy of a sentence. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which the appeal is filed, in the heading, the opening paragraph and the prayer. Do not cite any sub-section. The appeal is against the sentence only; it does not challenge the conviction.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Begin with the impugned judgment: the court, the case number, the date, the offences of conviction and the sentence imposed, exactly as the BRIEF gives them. Then the FIR particulars, exactly as given.",
  "State the authority under which the State files the appeal (the direction of the State Government to the Public Prosecutor, with its reference and date) only as the BRIEF gives it. Where the BRIEF does not give it, write [To be confirmed: the direction or authority under which this appeal is filed].",
  "State whether the respondent is in custody, on bail or has served the sentence only as the BRIEF gives it. Do not work out the number of days.",
  "Reproduce the grounds of inadequacy the BRIEF gives (the inadequacy_grounds field) as one block, in the advocate's own words, without rewriting, splitting, adding to or strengthening them. Write no ground of your own. Do not call the sentence lenient, unduly lenient, shockingly inadequate, disproportionate or a travesty unless the advocate's block uses that word. Do not state the minimum or maximum punishment for any offence, any aggravating circumstance, the gravity or manner of the offence, or the respondent's antecedents, unless the BRIEF gives it. Outside that block, do not characterise the trial court or the respondent. Where the BRIEF gives no ground, write [To be confirmed: grounds on which the sentence is said to be inadequate].",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "State every earlier appeal, revision or application against this judgment or sentence that the BRIEF mentions, whether by the State, the respondent or any other party: the court, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions none, do not say that there was none or that this is the first appeal; write [To be confirmed: whether any earlier appeal, revision or application was made against this judgment or sentence, by whom, to which court, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `impugned_court` | Court that passed the sentence | text | yes | Cause title, prayer; decides the appellate court |
| `impugned_case_number` | Case number below | text | yes | Cause title, prayer |
| `judgment_date` | Date of judgment and sentence | date | yes | Cause title, prayer; limitation block |
| `sentence_imposed` | Sentence imposed (as in the order) | textarea | yes | impugned_judgment; quoted |
| `respondent_name` | Convicted person (as in the judgment) | text | yes | Respondent |
| `respondent_status_now` | Respondent's present status (as instructed) | select: in custody / on bail / sentence served / not known | no | respondent_status |
| `state_direction_reference` | State Government direction (reference and date) | text | no | authority_to_appeal; unlocks |
| `state_representative` | Through (Public Prosecutor or officer) | text | yes | Cause title |
| `certified_copy_applied_on` | Date of application for the certified copy | date | no | Dates only; checklist cue; never drafted as a limitation claim |
| `certified_copy_received_on` | Date of receipt of the certified copy | date | no | As above |
| `filing_date` | Date of filing | date | no | Stated as a date only |
| `fir_number`, `police_station`, `sections_of_conviction` | FIR particulars and sections of conviction | text | yes | case_particulars |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `inadequacy_grounds` | Why the sentence is inadequate (as instructed) | textarea | yes | grounds_of_inadequacy; unlocks |
| `aggravating_facts` | Aggravating circumstances relied on (as instructed) | textarea | no | Unlocks |
| `earlier_proceedings` | Earlier appeals, revisions, applications against this judgment | textarea | no | earlier_applications; unlocks |
| `state`, `court_designation` | Appellate court and State | select / text | yes | Cause title |
| `verifier_name`, `verifier_capacity` | Who verifies (name, designation) | text | yes | verificationTemplate |

## _averments (`_averments/state_appeal_inadequate_sentence_418.json`)

```json
{
  "pack": "state_appeal_inadequate_sentence_418",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "sentence_inadequate", "kind": "submission", "what": "The sentence is inadequate", "phrases": ["the sentence is inadequate", "the sentence is too light", "the sentence does not meet the ends of justice", "sazaa bahut kam hai"], "unlocked_by": {"key": "inadequacy_grounds", "label": "Why the sentence is inadequate", "present": true}},
    {"id": "lenient_characterisation", "kind": "submission", "what": "Loaded words for the sentence or the trial court", "phrases": ["shockingly lenient", "unduly lenient", "a mere slap on the wrist", "travesty of justice", "shocks the conscience", "the court has taken a lenient view"], "unlocked_by": null},
    {"id": "aggravating_circumstances", "kind": "averment", "what": "Aggravating circumstances of the offence", "phrases": ["brutal", "heinous", "gruesome", "premeditated", "dangerous to society", "hardened criminal", "habitual offender"], "unlocked_by": {"key": "aggravating_facts", "label": "Aggravating circumstances relied on", "present": true}},
    {"id": "direction_of_state_government", "kind": "averment", "what": "The appeal is filed on the direction of the State Government", "phrases": ["the State Government has directed the Public Prosecutor", "on the direction of the State Government", "by order of the State Government", "sarkar ke aadesh se"], "unlocked_by": {"key": "state_direction_reference", "label": "State Government direction", "present": true}},
    {"id": "no_other_proceedings_on_judgment", "kind": "averment", "what": "No other appeal or revision was filed or is pending against this judgment (suppression risk)", "phrases": ["this is the first appeal", "no other appeal is pending", "no revision has been filed", "the appellant has not moved any other court", "pehli appeal hai"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier appeals, revisions, applications against this judgment", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "within_limitation", "kind": "submission", "what": "The appeal is within time", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null}
  ],
  "allowed": [
    {"id": "sentence_inadequate", "kind": "submission", "averment": "it is submitted, as instructed, that {{inadequacy_grounds}}", "requires": {"key": "inadequacy_grounds", "label": "Why the sentence is inadequate", "present": true}},
    {"id": "aggravating_circumstances", "kind": "averment", "averment": "the circumstances relied on by the State, as instructed, are: {{aggravating_facts}}", "requires": {"key": "aggravating_facts", "label": "Aggravating circumstances relied on", "present": true}},
    {"id": "direction_of_state_government", "kind": "averment", "averment": "the appeal is filed on the direction of the State Government given by {{state_direction_reference}}", "requires": {"key": "state_direction_reference", "label": "State Government direction", "present": true}},
    {"id": "no_other_proceedings_on_judgment", "kind": "averment", "averment": "no other appeal or revision has been made against this judgment or sentence", "requires": {"key": "earlier_proceedings", "label": "Earlier appeals, revisions, applications against this judgment", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "earlier_proceedings_listed", "kind": "averment", "averment": "the earlier appeals, revisions and applications against this judgment are: {{earlier_proceedings}}", "requires": {"key": "earlier_proceedings", "label": "Earlier appeals, revisions, applications against this judgment", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}}
  ]
}
```

Pairing check: `sentence_inadequate`, `aggravating_circumstances`, `direction_of_state_government` and `no_other_proceedings_on_judgment` have same-id twins. `lenient_characterisation` and `within_limitation` are null with no twin.

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark |
|---|---|---|---|
| `state_appeal_inadequate_sentence_418` | `earlier_applications` | EA-proceeding | Approved (Ajay) |

**EA-proceeding** (approved by Ajay): all: [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`], [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`].

## Verify (not in signed text)

- BNSS 418 sub-sections: which appeals lie to the High Court and which to the Court of Session (understood from CrPC 377(1)(a) and (b)); the bar on a State appeal where the High Court has passed the sentence. Not cited.
- The proviso on enhancement of sentence: the convicted person's right to show cause against enhancement (understood to exist in 418 and CrPC 377(3)). Checklist cue only.
- Period of limitation for a State appeal against sentence and the power to condone delay. Not stated anywhere in the pack.
- The Public Prosecutor's authority and the State Government's direction: the BNSS provisions on Public Prosecutors and any sanction rule. Not cited.
- Whether the appellate court may enhance the sentence beyond the maximum for the offence; not stated, and the prompt forbids stating any prescribed punishment.

## Notes for Ajay

- Tier A as given. The liberty at stake is the respondent's (enhancement), and limitation is mandatory. Anushka to test a brief with no ground (blank, no "lenient") and a late filing.
- Risk: Lawie users are private advocates. A State appeal is presented by the Public Prosecutor on the State's direction. If your view is that the pack is for advocates engaged by or for the State, say so; if not, the pack is still safe because it drafts only what the brief gives.
- Risk: the Drafter states no prescribed punishment and no aggravating fact (T-136), which makes the "inadequacy" ground depend entirely on the advocate's brief. That is intended.
- The verification form departs from #15 only in the verifier's particulars (no age, relation or address, because the verifier is an officer); the wording is as #15.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs (corrected table, T-255): 415/374, 418/377, 419/378, 432/391, 446/406, 447/407, 448/408. The cue set for the earlier-proceedings clause is as named in the ruling (EA-proceeding: all of [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`] and [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`]; EA-transfer: all of [any: `transfer`, `petition`, `application`, `स्थानांतरण`, `याचिका`] and [any: `earlier`, `previous`, `prior`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `वापस`]). The cues read only the reported paragraph and are a word test, not a check of meaning; the residual risk (for example a paragraph about "pending appeal" passing the cue) is accepted. Anything under "Verify" is not signed. Category (T-240): Criminal: appeals, revisions, quashing. `court_levels` ids are the lead's to map. The null-unlock bans on characterising a judge, a party or a court are for the Drafter's own words: the lead tests that an advocate's ground reproduced verbatim as a value inside an allowed averment is not stripped (if the loader would strip it, those phrases leave the ban list and the instruction rule stays).

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Appeal by the State against the inadequacy of a sentence (CrPC 377 / BNSS 418). Limitation block word for word. No prescribed punishment is stated. The verification keeps the #15 wording without age, relation and address, because an officer verifies (approved). Cue set EA-proceeding. |
| `displayName` carries no section number of one code only | Condition |
| The crpc-to-bnss.json in the repo carries the T-255 correction before this pack is built (the old table has the transfer pairs one place off) | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
