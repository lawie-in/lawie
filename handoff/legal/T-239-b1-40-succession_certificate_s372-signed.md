# T-239 b1 #40 succession_certificate_s372 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2.

| Field | Value |
|---|---|
| id | `succession_certificate_s372` |
| displayName | Application for a Succession Certificate (Indian Succession Act, section 372) |
| category | Succession and probate |
| court_levels | `["district_court"]` |
| Ink | L = 2 |
| Anushka tier | B (court filing) |
| averments file | `_averments/succession_certificate_s372.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Indian Succession Act, 1925",
    "sections": [
      {"number": "372", "description": "Application for certificate"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{petitioner} ... Petitioner",
  "partyDesignations": [
    {"role": "petitioner", "label": "Petitioner"}
  ],
  "caseNomenclature": "SUCCESSION CERTIFICATE CASE No. _____ of [YEAR]\nIn the matter of the estate of {deceased_name}, deceased\nPETITION FOR GRANT OF A SUCCESSION CERTIFICATE UNDER SECTION 372 OF THE INDIAN SUCCESSION ACT, 1925"
}
```

## mandatoryClauses

```json
[
  {"id": "petitioner_particulars", "name": "Petitioner", "required": true, "description": "Name, parentage, age, address and occupation of the petitioner, as the brief gives them."},
  {"id": "deceased", "name": "The Deceased and the Time of Death", "required": true, "description": "The name of the deceased, the date of death and the place of death, as the brief gives them; else the blanks."},
  {"id": "family_relatives", "name": "Family and Near Relatives", "required": true, "description": "The family or other near relatives of the deceased and where each resides, as the brief lists them. Not asserted to be complete unless the petitioner so states."},
  {"id": "right_claimed", "name": "Right in Which the Petitioner Claims", "required": true, "description": "The right in which the petitioner claims, as the advocate states it; else the blank."},
  {"id": "impediment", "name": "Absence of Impediment", "required": true, "description": "A statement that there is no impediment to the grant, only if the form records the petitioner's statement to that effect; else the blank."},
  {"id": "debts_securities", "name": "Debts and Securities", "required": true, "description": "Each debt and security for which the certificate is sought, listed by the advocate, with the description, the debtor or issuer and the amount only as the form gives it."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis of the court's territorial jurisdiction only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "earlier_proceedings", "name": "Other Applications", "required": true, "description": "Every other application for a succession certificate, probate or letters of administration, and every other proceeding, on the estate of the deceased or the same debts, with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Grant to the petitioner a succession certificate under section 372 of the Indian Succession Act, 1925 in respect of the debts and securities of {deceased_name}, deceased, set out in this petition;
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the petitioner shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above petition are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Petition (original + copy)",
  "Death certificate of the deceased",
  "Proof of the petitioner's relationship / right in which the petitioner claims",
  "List of debts and securities with the supporting documents (e.g. bank passbook or statement, fixed deposit receipt, share certificate, policy)",
  "Affidavit of the petitioner, if the court requires one",
  "Notice or publication to persons interested, as the court directs: check (verify)",
  "Security or indemnity bond, if the court directs: check (verify)",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a petition for a succession certificate under section 372 of the Indian Succession Act, 1925, for the debts and securities of a deceased person. The petition sets out these particulars, as the form lists them: the time of death of the deceased; the family or other near relatives of the deceased and their residences; the right in which the petitioner claims; the absence of any impediment to the grant; and the debts and securities in respect of which the certificate is applied for. Cite only section 372. Do not cite a sub-section or any other section of the Act.",
  "State each particular only as the BRIEF gives it. Where a particular is not given, write the blank: [To be confirmed: <the particular>]. Never assume a relative, an heir, a date, a place of death or a right.",
  "State the right in which the petitioner claims (for example, as a spouse, child or other heir) only as the BRIEF gives it. Do not write that the petitioner is the sole or the legal heir, or that the list of relatives is complete, unless the BRIEF says so. Do not state whether the deceased left a will unless the BRIEF does.",
  "Write that there is no impediment to the grant only where the BRIEF records the petitioner's statement that there is none, as the petitioner's statement; otherwise [To be confirmed: the petitioner's statement on the absence of any impediment to the grant].",
  "List each debt and security as the advocate gives it: description, debtor or issuer, and the amount or value only as the BRIEF gives it; otherwise [To be confirmed: the amount or value]. Do not total, convert or add interest. Do not write that a debt is due or payable. State no court fee, security amount or any other amount of fee or duty.",
  "Do not assert jurisdiction. Where the BRIEF gives the basis of territorial jurisdiction, write 'It is stated that this Court has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Court's territorial jurisdiction]. Do not cite a section for it.",
  "State every other application for a succession certificate, probate or letters of administration, and every other proceeding on the estate or the same debts, that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other application or proceeding on the estate of the deceased or these debts exists, and where]. Never write that this is the first application or that none is pending.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| petitioner_name / petitioner_parentage / petitioner_age / petitioner_address / petitioner_occupation | Petitioner particulars | text / text / number / textarea / text | yes | verification |
| deceased_name | Name of the deceased | text | yes | nomenclature, prayer |
| death_date / death_place | Date and place of death | date / text | yes | deceased clause |
| relatives_rows | Family or near relatives (one row per person: name; relationship; residence) | list of rows | yes | relatives clause |
| heirs_statement | Petitioner's statement on the list of relatives | select (Petitioner states that the list is complete; Not stated) | no | averment unlock |
| right_claimed | Right in which the petitioner claims (as the advocate states it) | textarea | yes | right clause |
| will_position | Will | select (Petitioner states that the deceased left no will; Petitioner states that the deceased left a will; Not stated) | no | averment unlock |
| impediment_position | Impediment to the grant | select (Petitioner states there is no impediment; Not stated) | yes | averment unlock |
| debts_rows | Debts and securities (one row per item: description; debtor or issuer; amount or value as given) | list of rows | yes | debts clause |
| jurisdiction_basis | Basis of territorial jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| earlier_proceedings | Other applications or proceedings on the estate or the same debts (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "succession_certificate_s372",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "no_impediment", "kind": "averment", "what": "There is no impediment to the grant of the certificate", "phrases": ["there is no impediment to the grant", "no impediment exists", "no bar to the grant", "koi badha nahi hai"], "unlocked_by": {"key": "impediment_position", "label": "Impediment to the grant", "equals": ["petitioner states there is no impediment"]}},
    {"id": "list_complete", "kind": "averment", "what": "The list of relatives or heirs is complete", "phrases": ["the petitioner is the only legal heir", "sole legal heir", "there are no other heirs", "no other relatives", "these are the only heirs"], "unlocked_by": {"key": "heirs_statement", "label": "Petitioner's statement on the list of relatives", "equals": ["petitioner states that the list is complete"]}},
    {"id": "died_intestate", "kind": "averment", "what": "The deceased died intestate / left no will", "phrases": ["died intestate", "left no will", "did not leave any will", "bina wasiyat ke"], "unlocked_by": {"key": "will_position", "label": "Will", "equals": ["petitioner states that the deceased left no will"]}},
    {"id": "debt_due_payable", "kind": "averment", "what": "A debt is due and payable", "phrases": ["is due and payable", "is lying unpaid", "the debt is recoverable", "dev rashi baaki hai"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The court has territorial jurisdiction", "phrases": ["this court has jurisdiction", "this hon'ble court has territorial jurisdiction", "the court has jurisdiction to entertain", "is within the jurisdiction of this court", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other applications on the same estate or debts", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_impediment", "kind": "averment", "averment": "the petitioner states that there is no impediment to the grant of the certificate", "requires": {"key": "impediment_position", "label": "Impediment to the grant", "equals": ["petitioner states there is no impediment"]}},
    {"id": "list_complete", "kind": "averment", "averment": "the petitioner states that the persons named above are the family and near relatives of the deceased", "requires": {"key": "heirs_statement", "label": "Petitioner's statement on the list of relatives", "equals": ["petitioner states that the list is complete"]}},
    {"id": "died_intestate", "kind": "averment", "averment": "the petitioner states that the deceased left no will", "requires": {"key": "will_position", "label": "Will", "equals": ["petitioner states that the deceased left no will"]}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Court has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other applications on the same estate or debts", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The court to which the application is made (understood as the District Judge in whose jurisdiction the deceased ordinarily resided or had property; section 371). Not cited; jurisdiction is a form field.
- The 'impediment' provisions (section 370) and the debts and securities for which a certificate may and may not be granted (section 370 and the proviso to 372 on wills and probate). Not cited.
- The procedure after the application: notice, publication, the grant (sections 373 and 374) and any security required. Checklist cues only.
- Whether the application must be verified in a particular way (section 372 refers to the verification of the petition; the manner is left out). The verification is the #12 pattern.
- Whether the Act's list of particulars has a different order or letters. The clause order here follows my reading and cites no clause letter.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. The Act's five particulars are the pack's clause set. A Drafter that fills them with a typical family would be inventing heirs; the prompt bars it and the relatives are a form list.
2. Risk. The 'no impediment' clause is the petitioner's statement only; a blank otherwise. The advocate must decide.
3. Debts and securities are listed by the advocate; nothing is totalled, and no fee, security or stamp amount appears anywhere.
4. No limitation block: not asked for #40. A banned entry stops the Drafter from saying the petition is within limitation. If you want a block (a succession certificate has a limitation reading), say so.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Succession and probate. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | A checklist cue to check the period for the application (verify); no limitation block and no period stated. No amount of fee. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
