# T-239 b1 #44 consumer_execution_s71 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink S = 1. Limitation block included (execution). The penalty provision is not cited and has no number anywhere: it is a checklist cue only (Ajay's ruling).

| Field | Value |
|---|---|
| id | `consumer_execution_s71` |
| displayName | Application for Enforcement of an Order (Consumer Protection Act, 2019, section 71) |
| category | Consumer |
| court_levels | `["district_commission", "state_commission", "national_commission"]` |
| Ink | S = 1 |
| Anushka tier | A (execution; limitation) — every sample twice: full facts, facts missing |
| averments file | `_averments/consumer_execution_s71.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Consumer Protection Act, 2019",
    "sections": [
      {"number": "71", "description": "Enforcement of orders of the District Commission, the State Commission and the National Commission"}
    ]
  },
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {"number": "Order XXI", "description": "Execution of decrees and orders"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "BEFORE THE {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant ({applicant_original_role})\nVERSUS\n{respondent} ... Respondent ({respondent_original_role})",
  "partyDesignations": [
    {"role": "applicant", "label": "Applicant"},
    {"role": "respondent", "label": "Respondent"}
  ],
  "caseNomenclature": "EXECUTION APPLICATION No. _____ of [YEAR]\nIn Consumer Complaint No. {complaint_number}\nAPPLICATION FOR ENFORCEMENT OF ORDER UNDER SECTION 71 OF THE CONSUMER PROTECTION ACT, 2019"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "The applicant and the respondent, addresses, and roles in the complaint, as the brief gives them."},
  {"id": "order_to_enforce", "name": "The Order to Be Enforced", "required": true, "description": "The Commission, the consumer complaint number, the date of the order and its operative directions, as the brief gives them. The operative directions are quoted exactly as given; else the blank."},
  {"id": "compliance_position", "name": "Compliance So Far", "required": true, "description": "Whether the respondent has complied, in part or at all, only as the form records the applicant's statement; with what was paid and when, as given; else the blank."},
  {"id": "amount_due", "name": "Amount Due", "required": true, "description": "The amount the applicant states is due under the order, only as the form gives it, with how it is made up as given. No interest or total is computed by Lawie."},
  {"id": "mode_of_execution", "name": "Mode of Execution Sought", "required": true, "description": "The mode(s) of execution the advocate selects and the property or accounts the applicant identifies, as given."},
  {"id": "appeal_position", "name": "Appeal or Stay", "required": true, "description": "Whether any appeal, revision or stay concerns the order, only as the brief gives it, with forum, number, date and result; or the blank where the brief is silent."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates the brief gives: of the order, of the application for the certified copy, of receipt of the certified copy, and of filing. No period is stated or computed."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis of the forum's jurisdiction to enforce only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "earlier_proceedings", "name": "Earlier Execution and Other Proceedings", "required": true, "description": "Every earlier execution application or other proceeding on the order, with forum, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Commission may graciously be pleased to:

a) Enforce the order dated {order_date} passed in Consumer Complaint No. {complaint_number} against the respondent, under section 71 of the Consumer Protection Act, 2019 read with Order XXI of the Code of Civil Procedure, 1908, by the following mode(s): {execution_modes_list};
b) Pass any other order(s) as this Hon'ble Commission may deem fit and proper in the interest of justice.

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
  "Execution application (original + copy for the respondent)",
  "Certified copy of the order to be enforced",
  "Proof that the order was served on the respondent / the respondent's knowledge of it, as the applicant relies on it",
  "Statement of the amount due and the payments received, as the applicant gives them",
  "Particulars of the property or accounts to be attached (e.g. bank account details, property description), as the applicant gives them",
  "Documents on any appeal, stay or earlier execution, if any",
  "If penal proceedings for non-compliance are also intended: check the penalty provision of the Act: not cited by Lawie (verify)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application for enforcement of an order of a Consumer Commission under section 71 of the Consumer Protection Act, 2019, read with Order XXI of the Code of Civil Procedure, 1908. Cite section 71 and, for the procedure, Order XXI only; do not describe how the Act applies Order XXI. Do not cite a rule of Order XXI or any other section. This is not an appeal, not a complaint for a penalty, and not a fresh consumer complaint.",
  "State the order's Commission, complaint number, date and operative directions only as the BRIEF gives them. Quote the operative directions exactly; do not paraphrase, summarise or renumber them. Where not given, write [To be confirmed: the operative directions of the order].",
  "Write that the respondent has not complied with the order only where the form records the applicant's statement that the order has not been complied with; then write it as the applicant's statement ('The applicant states that ...'), with dates and payments as given. Where the BRIEF is silent write [To be confirmed: the respondent's compliance with the order so far].",
  "State the amount due only as the BRIEF gives it. Do not compute, total, add interest, convert or justify any amount, and state no court fee or other amount of fee or duty.",
  "State the mode(s) of execution and the property or accounts only as the BRIEF gives them. Do not add a property, an account or a mode. Do not write that the respondent owns or holds any property or account unless the BRIEF gives it, and then as the applicant's statement.",
  "State any appeal, revision or stay against the order only as the BRIEF gives it, with forum, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any appeal, revision or stay concerns this order]. Never write that no appeal is pending or that there is no stay.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Do not assert jurisdiction. Where the BRIEF gives the basis, write 'It is stated that this Commission has jurisdiction to enforce on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Commission's jurisdiction to enforce the order]. Do not cite a section for it.",
  "State every earlier execution application or other proceeding on the order that the BRIEF mentions, with forum, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier execution application or other proceeding on this order exists, and where]. Never write that this is the first application or that none is pending.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| applicant_name / applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / text / number / textarea | yes | verification |
| applicant_original_role / respondent_original_role | Role in the complaint (Complainant / Opposite Party) | select | yes | cause title |
| respondent_name / respondent_address | Respondent particulars | text / textarea | yes | cause title |
| complaint_number | Consumer complaint number | text | yes | nomenclature, prayer |
| impugned_order_directions | Operative directions of the order (as worded in the order) | textarea | yes | quoted verbatim |
| compliance_position | Compliance with the order | select (Order not complied with, as stated by the applicant; Order complied with in part, as stated by the applicant; Not stated) | yes | averment unlock |
| compliance_details | Payments received and dates, as the applicant gives them | textarea | no | compliance clause |
| amount_due_details | Amount due and how made up, as the applicant gives it | textarea | no | averment unlock |
| execution_modes | Mode(s) of execution sought | multiselect (Attachment and sale of property; Attachment of bank account or debts; Arrest and detention; Other, specify) | yes | prayer |
| property_details | Property or accounts of the respondent, as the applicant identifies them | textarea | no | averment unlock |
| appeal_position | Appeal, revision or stay against the order (forum, number, date, result) | textarea | no | disclosure |
| order_date | Date of the order, decree or event | date | no | limitation block |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation block |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation block |
| filing_date | Date of filing | date | no | limitation block |
| jurisdiction_basis | Basis of the Commission's jurisdiction to enforce (as the advocate states it) | textarea | no | averment unlock |
| earlier_proceedings | Earlier execution applications and other proceedings on the order (forum, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "consumer_execution_s71",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "order_not_complied", "kind": "averment", "what": "The respondent has not complied with the order", "phrases": ["the respondent has not complied with the order", "has failed to comply with the order", "has wilfully disobeyed the order", "aadesh ka palan nahi kiya"], "unlocked_by": {"key": "compliance_position", "label": "Compliance with the order", "equals": ["order not complied with, as stated by the applicant"]}},
    {"id": "amount_due_stated", "kind": "averment", "what": "The amount due under the order", "phrases": ["the amount due under the order is", "a sum of rupees", "is due and payable under the order", "dev rashi"], "unlocked_by": {"key": "amount_due_details", "label": "Amount due and how made up, as the applicant gives it", "present": true}},
    {"id": "respondent_property", "kind": "averment", "what": "The respondent owns or holds property or accounts", "phrases": ["the respondent owns", "the respondent holds a bank account", "the respondent has property at", "pratiwadi ki sampatti"], "unlocked_by": {"key": "property_details", "label": "Property or accounts of the respondent, as the applicant identifies them", "present": true}},
    {"id": "no_appeal_no_stay", "kind": "averment", "what": "No appeal is pending and no stay operates", "phrases": ["no appeal is pending", "there is no stay", "the order has become final", "no stay has been granted"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The Commission has jurisdiction to enforce", "phrases": ["this commission has jurisdiction", "this hon'ble commission has jurisdiction", "the commission has jurisdiction to entertain", "is within the jurisdiction of this commission", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of the Commission's jurisdiction to enforce (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Appeals, stays and other proceedings on the order", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "order_not_complied", "kind": "averment", "averment": "the applicant states that the respondent has not complied with the order", "requires": {"key": "compliance_position", "label": "Compliance with the order", "equals": ["order not complied with, as stated by the applicant"]}},
    {"id": "amount_due_stated", "kind": "averment", "averment": "the applicant states that the amount due under the order is as follows: {{amount_due_details}}", "requires": {"key": "amount_due_details", "label": "Amount due and how made up, as the applicant gives it", "present": true}},
    {"id": "respondent_property", "kind": "averment", "averment": "the applicant states that the respondent holds the following property or accounts: {{property_details}}", "requires": {"key": "property_details", "label": "Property or accounts of the respondent, as the applicant identifies them", "present": true}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Commission has jurisdiction to enforce on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of the Commission's jurisdiction to enforce (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Appeals, stays and other proceedings on the order", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The penalty provision for non-compliance (Ajay's ruling: cue only, no number). No penalty is stated and no section number is given; the checklist cue says 'check the penalty provision (verify)'.
- The period for an application to enforce, and whether Article 136 or another entry of the Limitation Act, 1963 applies to an order of a Commission. Not stated; limitation block applied as instructed.
- Which forum enforces (the Commission that made the order, per the wording of section 71). The pack treats jurisdiction as a form field.
- The rules of Order XXI that apply (attachment, sale, arrest, detention) and how the Act applies Order XXI to the order. Not cited at rule level.
- Any rule on the form of a Commission's execution application. Checklist cue.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. 'Compliance' and 'amount due' are the Drafter's temptation to compute and to call the respondent a wilful defaulter. Both are form-gated and attributed to the applicant.
2. Risk. An order against which an appeal or stay is pending: the pack never says there is none (blank only).
3. The penalty provision is left out on purpose (cue only, no number); a separate id for a penalty complaint is cleaner than adding it here.
4. Tier A: two Anushka samples: full facts, and impugned_order_directions and compliance_position empty.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Consumer. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Section 71 of the Consumer Protection Act, 2019, "read with Order XXI of the Code of Civil Procedure, 1908". The penalty provision is a cue only, with no section number. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
