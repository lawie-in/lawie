# T-239 b2 #08 application_additional_evidence_432 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. v2: revised under Ajay's rulings. No limitation block (approved). Section pairs are from the corrected signed table (CrPC to BNSS): CrPC 391 → BNSS 432. No sub-section is cited. Reasons only as the brief gives them.

| Field | Value |
|---|---|
| id | `application_additional_evidence_432` |
| displayName | Application to Take Additional Evidence in a Criminal Appeal |
| category | Criminal: appeals, revisions, quashing |
| court_levels | `["sessions", "high_court"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/application_additional_evidence_432.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "432",
        "description": "Appellate Court may take further evidence or direct it to be taken"
      }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      {
        "number": "391",
        "description": "Appellate Court may take further evidence or direct it to be taken"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant (appellant or respondent in the appeal, as the brief gives)"
    },
    {
      "role": "respondent",
      "label": "Respondent (the opposite party in the appeal)"
    }
  ],
  "caseNomenclature": "CRIMINAL MISC. APPLICATION No. _____ of [YEAR]\nIN CRIMINAL APPEAL No. {appealNumber}\n(Application under {governing_provision} to take additional evidence, or to direct it to be taken)"
}
```

The parties are named as in the appeal. Nomenclature varies by court; court-rules overlay.

## mandatoryClauses

```json
[
  {"id": "pending_appeal", "name": "The Pending Appeal", "required": true, "description": "The appeal number, the court where it is pending, the judgment appealed against and its date, and the stage of the appeal, each as the brief gives it; the blank where it does not."},
  {"id": "evidence_sought", "name": "Evidence Sought to Be Taken", "required": true, "description": "The witness(es) or document(s) meant, described only as the brief describes them, and whether the court is asked to take the evidence itself or to direct it to be taken. No account of what the witness will say or the document shows beyond the brief."},
  {"id": "reasons", "name": "Reasons", "required": true, "description": "Why the applicant says the additional evidence is needed, and why it was not led earlier, reproduced in the advocate's own words; none added by Lawie; the blank where the brief gives none."},
  {"id": "earlier_applications", "name": "Earlier Applications for Evidence", "required": true, "description": "Every earlier application to lead, summon or take further evidence, in the trial or in this appeal, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."},
  {"id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Take the additional evidence described in this application, or direct it to be taken in the manner this Hon'ble Court deems fit, under {governing_provision};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245). Pair: CrPC 391 → BNSS 432 (Appellate Court, Court of Session or High Court):
- BNSS and BSA: `Section 432 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 391 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 391 CrPC or Section 432 BNSS]`

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the applicant" or "pairokar of the applicant". Courts often require the facts about the evidence in an affidavit; that is a court-rules overlay item and a checklist cue.

## filingChecklist

```json
[
  "Application, with copies for the opposite party and the Prosecutor",
  "Affidavit of the applicant or the witness, if the court's practice requires it for facts about the evidence",
  "Copy of the memorandum of appeal and of the judgment appealed against",
  "Copy of the document(s) sought to be taken on record, or particulars of the witness(es)",
  "Copy of any earlier application for evidence and the order on it, if any",
  "Vakalatnama (if not already on record)",
  "Court fee/stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in a pending criminal appeal asking the Appellate Court to take further evidence, or to direct it to be taken. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which the application is made, in the heading, the opening paragraph and the prayer. Do not cite any sub-section. This is not an application for bail, for suspension of sentence, or to remand the case.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Begin with the pending appeal: the appeal number, the court, the judgment appealed against and its date, and the stage of the appeal, as the BRIEF gives them. Where the BRIEF does not give the stage, write [To be confirmed: stage of the appeal]. Describe the offences only as the BRIEF gives them.",
  "Describe the evidence sought (the witness or document) only as the BRIEF describes it, and say whether the court is asked to take it or to direct it to be taken only as the BRIEF says. Where the BRIEF does not say, write [To be confirmed: whether the Appellate Court is asked to take the evidence itself or to direct it to be taken]. Do not say what a witness will depose or what a document shows beyond the BRIEF. Do not say that the evidence is genuine, vital, crucial or conclusive.",
  "Reproduce the reasons the BRIEF gives (why the evidence is needed, and why it was not led earlier) in the advocate's own words, without rewriting, adding to or strengthening them, and give no reason of your own. Do not say that the evidence is necessary for a just decision, that it could not be led earlier despite due diligence, that the application is bona fide, or that the other side will not be prejudiced, unless the BRIEF gives that as the reason. Where the BRIEF gives no reason, write [To be confirmed: why the additional evidence is needed and why it was not led earlier]. Do not say what the Appellate Court must record or find.",
  "State every earlier application to lead, summon or take further evidence in the trial or in this appeal that the BRIEF mentions: the court, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions none, do not say that there was none or that this is the first application; write [To be confirmed: whether any earlier application for evidence was made in the trial or in this appeal, to which court, and with what result].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `appeal_number` | Criminal appeal number | text | yes | Cause title |
| `appeal_court` | Court where the appeal is pending | text | yes | Cause title |
| `judgment_appealed_date` | Date of judgment appealed against | date | yes | pending_appeal |
| `appeal_stage` | Stage of the appeal (as instructed) | text | no | pending_appeal |
| `applicant_role_in_appeal` | Applicant is | select: appellant / respondent / complainant / State / other (as instructed) | yes | Cause title |
| `evidence_description` | Evidence sought (witness or document) | textarea | yes | evidence_sought |
| `mode_sought` | Court is asked to | select: take the evidence itself / direct it to be taken / leave to the court | yes | evidence_sought |
| `why_necessary` | Why the evidence is needed (as instructed) | textarea | no | Unlocks |
| `reason_not_led_earlier` | Why it was not led earlier (as instructed) | textarea | no | Unlocks |
| `earlier_applications` | Earlier applications for evidence (court, date, result) | textarea | no | earlier_applications; unlocks |
| `fir_number`, `police_station`, `sections_of_conviction` | FIR particulars and sections | text | no | pending_appeal |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `state`, `court_designation` | Court | select / text | yes | Cause title |
| `applicant_name`, `father_name`, `applicant_age`, `address` | Applicant | text | name, parentage, address yes | Cause title, verification |
| verifier keys | verifier_capacity, pairokar_name, pairokar_relation, as bail_ndps (#13) |  |  | verificationTemplate |

## _averments (`_averments/application_additional_evidence_432.json`)

```json
{
  "pack": "application_additional_evidence_432",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "evidence_necessary", "kind": "submission", "what": "The additional evidence is necessary", "phrases": ["the evidence is necessary for a just decision", "the evidence is essential", "the appeal cannot be decided without this evidence", "the evidence is vital", "the evidence is crucial", "evidence zaroori hai"], "unlocked_by": {"key": "why_necessary", "label": "Why the evidence is needed", "present": true}},
    {"id": "not_led_earlier_reason", "kind": "averment", "what": "A reason why the evidence was not led earlier", "phrases": ["could not be produced despite due diligence", "was not available at the time of trial", "came to the knowledge of the applicant only recently", "was not led due to oversight"], "unlocked_by": {"key": "reason_not_led_earlier", "label": "Why it was not led earlier", "present": true}},
    {"id": "evidence_proves_case", "kind": "averment", "what": "What the evidence will prove or the witness will say", "phrases": ["will prove the innocence", "will conclusively establish", "the document is genuine", "the witness is truthful", "will demolish the prosecution case"], "unlocked_by": null},
    {"id": "no_prejudice_bona_fide", "kind": "submission", "what": "No prejudice to the other side; the application is bona fide", "phrases": ["no prejudice will be caused", "the application is bona fide", "not filed to delay the appeal", "not a dilatory tactic"], "unlocked_by": null},
    {"id": "no_other_application", "kind": "averment", "what": "No other application for evidence was made (suppression risk)", "phrases": ["this is the first application", "no application for additional evidence was made earlier", "no other application is pending", "pehli arzi hai"], "unlocked_by": {"key": "earlier_applications", "label": "Earlier applications for evidence", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}}
  ],
  "allowed": [
    {"id": "evidence_necessary", "kind": "submission", "averment": "it is submitted, as instructed, that {{why_necessary}}", "requires": {"key": "why_necessary", "label": "Why the evidence is needed", "present": true}},
    {"id": "not_led_earlier_reason", "kind": "averment", "averment": "the reason given, as instructed, why the evidence was not led earlier is: {{reason_not_led_earlier}}", "requires": {"key": "reason_not_led_earlier", "label": "Why it was not led earlier", "present": true}},
    {"id": "no_other_application", "kind": "averment", "averment": "no earlier application for evidence has been made in the trial or in this appeal", "requires": {"key": "earlier_applications", "label": "Earlier applications for evidence", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}},
    {"id": "earlier_applications_listed", "kind": "averment", "averment": "the earlier applications for evidence are: {{earlier_applications}}", "requires": {"key": "earlier_applications", "label": "Earlier applications for evidence", "not_in": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi", "first application", "no earlier application", "no other application"]}}
  ]
}
```

Pairing check: `evidence_necessary`, `not_led_earlier_reason` and `no_other_application` have same-id twins. `evidence_proves_case` and `no_prejudice_bona_fide` are null with no twin. No `within_limitation` entry is added: this is an application in an appeal, not an appeal (see Notes); the `_default` ban still applies through default-deny.

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark |
|---|---|---|---|
| `application_additional_evidence_432` | `earlier_applications` | EA-proceeding | Approved (Ajay) |

**EA-proceeding** (approved by Ajay): all: [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`], [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`].

## Verify (not in signed text)

- BNSS 432 sub-sections: that the court must record its reasons for taking or directing further evidence, and who may take it when the Appellate Court is the High Court (understood from CrPC 391(1) and (2)); the accused's presence when the evidence is taken (391(3)). Not cited; not drafted.
- Whether the court may take the evidence without a prior application, and whether an application is the required mode. Not stated.
- The effect of the judgment under appeal being a conviction, an acquittal or a sentence; the pack is neutral on this.

## Notes for Ajay

- Tier B, S = 1. The brief says "reasons only as the brief gives them": the application is nearly all blanks if the brief is thin, and that is intended.
- Limitation block: not added (approved by Ajay, ruling 3). This is a step in a pending appeal, not an appeal.
- Risk: `mode_sought` has a "leave to the court" value so the form does not force the advocate to choose between taking and directing.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs (corrected table, T-255): 415/374, 418/377, 419/378, 432/391, 446/406, 447/407, 448/408. The cue set for the earlier-proceedings clause is as named in the ruling (EA-proceeding: all of [any: `appeal`, `revision`, `petition`, `application`, `अपील`, `पुनरीक्षण`, `याचिका`, `आवेदन`] and [any: `earlier`, `previous`, `prior`, `pending`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `वापस`]; EA-transfer: all of [any: `transfer`, `petition`, `application`, `स्थानांतरण`, `याचिका`] and [any: `earlier`, `previous`, `prior`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `वापस`]). The cues read only the reported paragraph and are a word test, not a check of meaning; the residual risk (for example a paragraph about "pending appeal" passing the cue) is accepted. Anything under "Verify" is not signed. Category (T-240): Criminal: appeals, revisions, quashing. `court_levels` ids are the lead's to map. The null-unlock bans on characterising a judge, a party or a court are for the Drafter's own words: the lead tests that an advocate's ground reproduced verbatim as a value inside an allowed averment is not stripped (if the loader would strip it, those phrases leave the ban list and the instruction rule stays).

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | Application to take further evidence in appeal (CrPC 391 / BNSS 432). The advocate's reasons pass through in the advocate's words. No limitation block (a step in a pending appeal; approved). Cue set EA-proceeding. |
| `displayName` carries no section number of one code only | Condition |
| The crpc-to-bnss.json in the repo carries the T-255 correction before this pack is built (the old table has the transfer pairs one place off) | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
