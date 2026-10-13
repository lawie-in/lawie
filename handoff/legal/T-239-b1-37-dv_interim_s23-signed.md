# T-239 b1 #37 dv_interim_s23 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink S = 1.

| Field | Value |
|---|---|
| id | `dv_interim_s23` |
| displayName | Application for Interim and Ex Parte Orders (Protection of Women from Domestic Violence Act, section 23) |
| category | Family and matrimonial |
| court_levels | `["magistrate", "metropolitan_magistrate"]` |
| Ink | S = 1 |
| Anushka tier | A (liberty / safety, interim) — every sample twice: full facts, facts missing |
| averments file | `_averments/dv_interim_s23.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Protection of Women from Domestic Violence Act, 2005",
    "sections": [
      {"number": "12", "description": "Application to Magistrate"},
      {"number": "18", "description": "Protection orders"},
      {"number": "19", "description": "Residence orders"},
      {"number": "20", "description": "Monetary reliefs"},
      {"number": "21", "description": "Custody orders"},
      {"number": "22", "description": "Compensation orders"},
      {"number": "23", "description": "Power to grant interim and ex parte orders"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {"role": "applicant", "label": "Applicant"},
    {"role": "respondent", "label": "Respondent"}
  ],
  "caseNomenclature": "MISC. APPLICATION No. _____ of [YEAR]\nIn {s12_case_ref} (application under section 12 of the Protection of Women from Domestic Violence Act, 2005)\nAPPLICATION FOR INTERIM AND EX PARTE ORDERS UNDER SECTION 23 OF THE PROTECTION OF WOMEN FROM DOMESTIC VIOLENCE ACT, 2005"
}
```

## Derived prayer line b) from `ex_parte_sought` (exact strings)

| ex_parte_sought | `{ex_parte_prayer_line}` |
|---|---|
| Yes | Grant, pending notice to the respondent, an ex parte interim order under section 23 of the said Act in terms of the relief(s) set out in this application; |
| No | Issue notice to the respondent on this application; |

No procedure_code is added: this is a civil-style proceeding under a special Act, and T-245 lists the Act as not affected (Ajay's ruling).

## mandatoryClauses

```json
[
  {"id": "s12_application", "name": "The Section 12 Application", "required": true, "description": "The application under section 12 in which, or with which, this application is made: its number, date and stage, and whether this application is filed with it or in it, as the brief gives them."},
  {"id": "parties_relationship", "name": "Parties and Relationship", "required": true, "description": "The parties and the relationship the applicant states between them, and the household the applicant describes, only as the brief gives them."},
  {"id": "incidents", "name": "Incidents as Stated by the Applicant", "required": true, "description": "The incidents the applicant states, with dates and places as given, each introduced as the applicant's statement. Nothing is added, characterised or inferred."},
  {"id": "reliefs_interim", "name": "Interim Reliefs Sought", "required": true, "description": "For each relief the form selects, the order asked for in the terms the brief gives; the section for it is cited at section level."},
  {"id": "urgency_ex_parte", "name": "Urgency and Ex Parte Order", "required": true, "description": "Whether an ex parte order is sought, and the reasons for urgency, only as the brief gives them, as submissions; else the blank."},
  {"id": "children", "name": "Children", "required": false, "description": "Children of the parties and their ages, only as the brief gives them, and only where a custody order is sought."},
  {"id": "earlier_proceedings", "name": "Other Proceedings", "required": true, "description": "Every other proceeding between the parties (criminal, matrimonial, maintenance or civil) and every earlier order under the Act, with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Pass, pending disposal of the application under section 12 of the Protection of Women from Domestic Violence Act, 2005, the interim order(s) under section 23 of the said Act in terms of the relief(s) set out in this application: {reliefs_sought_list};
b) {ex_parte_prayer_line}
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Application (original + copy for the respondent)",
  "Application under section 12 of the Act, if this application is filed with it (separate Lawie document: dv_act_complaint)",
  "Affidavit of the applicant in support, in the form the court requires: check (verify)",
  "Domestic Incident Report of the Protection Officer, if any",
  "Documents on the incidents and on the relief sought (medical records, photographs, messages, rent or ownership papers), as the applicant relies on them",
  "Affidavit of assets, income, expenses and liabilities, if monetary relief is sought (separate Lawie document: affidavit_assets_liabilities)",
  "Copies of orders in any other proceeding between the parties, if any",
  "Notice / service on the respondent as per court practice, unless an ex parte order is sought",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application for interim orders, and where the BRIEF says so an ex parte order, under section 23 of the Protection of Women from Domestic Violence Act, 2005, in or with an application under section 12. Cite section 23 for the power; cite section 18 (protection orders), 19 (residence orders), 20 (monetary reliefs), 21 (custody orders) or 22 (compensation orders) only for a relief the BRIEF selects. Do not cite a sub-section.",
  "The Drafter never asserts that domestic violence occurred, or that any act was committed; violence appears only as the applicant's own statement of the incidents, as the BRIEF gives them. State each incident only as the BRIEF gives it, introduced as the applicant's statement ('The applicant states that ...'), with the date and place the BRIEF gives. Do not use the words 'victim', 'aggrieved person', 'abuser' or 'domestic violence' as a finding. Do not add an incident, an injury, a threat, a motive or an adjective the BRIEF does not give.",
  "State the relationship of the parties, and the household the applicant describes, only as the BRIEF gives them and as the applicant's statement. Do not write that a domestic relationship or a shared household exists unless the BRIEF says so; otherwise [To be confirmed: the relationship of the parties and the household in which they lived together].",
  "For each relief the form selects, ask for the order in the terms the BRIEF gives. Any figure (monthly sum, compensation) is exactly as the BRIEF gives it; do not compute or justify it. Names and ages of children only as the BRIEF gives them, and only where a custody order is sought.",
  "Write the reasons for urgency, and for an ex parte order, only as submissions on the reasons the BRIEF gives ('It is submitted that ...'). Do not write that a prima facie case is made out, that the applicant is in danger, or that harm is likely or irreparable unless the BRIEF gives it. Ask for an ex parte order only where ex_parte_sought is Yes; where it is No, do not argue for one and ask for interim orders on notice. Prayer line b) follows ex_parte_sought and is added by the system.",
  "State the section 12 application's number, date and stage only as the BRIEF gives them; otherwise [To be confirmed: the section 12 application in which, or with which, this application is made].",
  "Do not assert jurisdiction. Where the BRIEF gives the basis, write 'It is stated that this Court has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Court's territorial jurisdiction]. Do not cite a section for it.",
  "State every other proceeding between the parties, and every earlier order under the Act, that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other proceeding between the parties, or any earlier order under the Act, exists, and where]. Never write that this is the first application or that none is pending.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| applicant_name / applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / text / number / textarea | yes | verification |
| respondent_name / respondent_address | Respondent particulars | text / textarea | yes | cause title |
| s12_case_ref / s12_filed_date | Section 12 application: number and date | text / date | yes | nomenclature |
| filed_with | This application is | select (Filed with the section 12 application; Filed in the pending section 12 application; Not stated) | yes | s12 clause |
| relationship_to_respondent | Relationship of the parties, as the applicant states it | text | no | averment unlock |
| household_address | Household the applicant describes (address) | textarea | no | averment unlock |
| incidents_described | Incidents as the applicant states them (dates, places) | textarea | yes | averment unlock |
| reliefs_sought | Interim relief sought | multiselect (Protection order (section 18); Residence order (section 19); Monetary relief (section 20); Custody order (section 21); Compensation order (section 22)) | yes | relief clause, section level |
| relief_details | Terms of each relief asked (as the advocate gives them) | textarea | yes | relief clause |
| children_details | Children (names and ages as given), if custody is sought | textarea | no | children clause |
| ex_parte_sought | Ex parte order sought | select (Yes; No) | yes | prayer line, urgency clause |
| urgency_reasons | Reasons for urgency (as the applicant gives them) | textarea | no | submission unlock |
| jurisdiction_basis | Basis of territorial jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| earlier_proceedings | Other proceedings between the parties and earlier orders under the Act (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "dv_interim_s23",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "violence_occurred", "kind": "averment", "what": "Domestic violence occurred or is occurring", "phrases": ["has been subjected to domestic violence", "committed domestic violence", "the respondent has beaten the applicant", "the respondent tortured the applicant", "is committing acts of domestic violence", "gharelu hinsa ki hai", "the applicant is a victim"], "unlocked_by": null},
    {"id": "incidents_stated", "kind": "averment", "what": "An incident is stated without the form's incidents field", "phrases": ["the applicant states that the respondent", "the applicant was beaten", "the applicant was assaulted", "the applicant was threatened"], "unlocked_by": {"key": "incidents_described", "label": "Incidents as the applicant states them", "present": true}},
    {"id": "domestic_relationship", "kind": "averment", "what": "The parties are in a domestic relationship / the applicant is an aggrieved person", "phrases": ["the applicant is an aggrieved person", "the parties are in a domestic relationship", "a domestic relationship exists", "gharelu sambandh hai"], "unlocked_by": {"key": "relationship_to_respondent", "label": "Relationship of the parties, as the applicant states it", "present": true}},
    {"id": "shared_household", "kind": "averment", "what": "The household is a shared household", "phrases": ["the shared household", "right to reside in the shared household", "resides in the shared household", "saajha ghar"], "unlocked_by": {"key": "household_address", "label": "Household the applicant describes (address)", "present": true}},
    {"id": "urgency_irreparable", "kind": "submission", "what": "Urgency, danger or irreparable harm", "phrases": ["the applicant is in grave danger", "irreparable harm", "immediate danger to the applicant", "the matter brooks no delay", "turant rahat zaroori hai"], "unlocked_by": {"key": "urgency_reasons", "label": "Reasons for urgency (as the applicant gives them)", "present": true}},
    {"id": "prima_facie_case", "kind": "submission", "what": "A prima facie case of domestic violence is made out", "phrases": ["a prima facie case is made out", "prima facie discloses domestic violence", "prima facie the respondent is committing"], "unlocked_by": null},
    {"id": "violence_continues", "kind": "averment", "what": "The respondent continues, or is likely, to commit violence", "phrases": ["continues to subject the applicant", "is likely to commit", "threatens to repeat", "will repeat the acts"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The court has territorial jurisdiction", "phrases": ["this court has jurisdiction", "this hon'ble court has territorial jurisdiction", "the court has jurisdiction to entertain", "is within the jurisdiction of this court", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "incidents_stated", "kind": "averment", "averment": "the applicant states that {{incidents_described}}", "requires": {"key": "incidents_described", "label": "Incidents as the applicant states them", "present": true}},
    {"id": "domestic_relationship", "kind": "averment", "averment": "the applicant states that the parties are, or were, related as follows: {{relationship_to_respondent}}", "requires": {"key": "relationship_to_respondent", "label": "Relationship of the parties, as the applicant states it", "present": true}},
    {"id": "shared_household", "kind": "averment", "averment": "the applicant states that the household at {{household_address}} is the household in which the applicant lives, or lived, with the respondent", "requires": {"key": "household_address", "label": "Household the applicant describes (address)", "present": true}},
    {"id": "urgency_irreparable", "kind": "submission", "averment": "it is submitted that the order is urgently needed because {{urgency_reasons}}", "requires": {"key": "urgency_reasons", "label": "Reasons for urgency (as the applicant gives them)", "present": true}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Court has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The sub-section of section 23 that deals with ex parte orders and the condition on which the Magistrate may pass one (understood to be sub-section (2): a prima facie case that the respondent is committing or has committed an act of domestic violence). Not cited, no sub-section cited, and the pack does not say prima facie.
- Section 28 (procedure: the Act's proceedings are governed by the criminal procedure code, with the court's power to lay down its own procedure) and whether the T-245 procedure_code selection is needed for a DV Act application. T-245 lists the DV Act as a special Act not affected; I have added no procedure_code key.
- Section 27 (jurisdiction of the court). Not cited; jurisdiction is a form field.
- The prescribed form of the affidavit for an ex parte order under the rules made under the Act. Checklist cue only ('in the form the court requires: check').
- The 'domestic relationship', 'shared household', 'aggrieved person' definitions (section 2). Not cited and not used as findings.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. Highest-risk wording in the batch: this is an application whose facts the Drafter must not turn into findings. Every incident is 'The applicant states that ...' from one form field, and the banned list stops the Drafter from calling the incidents violence on its own.
2. Prayer line (b) comes from ex_parte_sought; both derived strings are in the table above, for Ajay to sign.
3. Section 21 relief names the children only as given; the pack never states the children's welfare.
4. Tier A: two Anushka samples: full facts, and incidents_described empty (the Drafter must not write any incident).


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Family and matrimonial. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Derived prayer strings for `ex_parte_sought` approved. Violence is never asserted by the Drafter; incidents only as "The applicant states that ..." from the incidents field. No `procedure_code`. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
