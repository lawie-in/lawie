# T-239 b1 #42 affidavit_legal_heir (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink S = 1.

| Field | Value |
|---|---|
| id | `affidavit_legal_heir` |
| displayName | Affidavit of Legal Heirs of a Deceased |
| category | Affidavits and court forms |
| court_levels | `["not_court_specific"]` |
| Ink | S = 1 |
| Anushka tier | C (affidavit) |
| averments file | `_averments/affidavit_legal_heir.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
]
```

## causeTitle

```json
{
  "format": "AFFIDAVIT OF LEGAL HEIRS\n\n{caseNomenclature}",
  "partyDesignations": [
    {"role": "deponent", "label": "Deponent"}
  ],
  "caseNomenclature": "IN THE MATTER OF THE ESTATE OF {deceased_name}, DECEASED\nAFFIDAVIT OF {deponent_name}"
}
```

## mandatoryClauses

```json
[
  {"id": "deponent_particulars", "name": "Deponent", "required": true, "description": "Name, parentage, age, address and occupation of the deponent, as the form gives them."},
  {"id": "deceased", "name": "The Deceased", "required": true, "description": "Name, date of death, place of death and last residence of the deceased, as the form gives them; else the blanks."},
  {"id": "deponent_relationship", "name": "Relationship of the Deponent", "required": true, "description": "The deponent's relationship to the deceased, as the form gives it."},
  {"id": "heirs_list", "name": "The Heirs Named by the Deponent", "required": true, "description": "The persons the deponent names as the legal heirs of the deceased, one per row, each with relationship, age and address exactly as the form gives them. Not asserted to be complete unless the deponent states it."},
  {"id": "will_position", "name": "Will", "required": true, "description": "Whether the deceased left a will, only as the deponent states it; else the blank."},
  {"id": "purpose", "name": "Purpose of the Affidavit", "required": false, "description": "The purpose for which the affidavit is made, only as the form gives it."},
  {"id": "earlier_proceedings", "name": "Other Claims or Proceedings", "required": true, "description": "Every other claim, certificate, probate or proceeding on the estate that the form mentions, with the authority or court and date; or the blank where the form is silent."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

Value: `""` (empty string). An affidavit carries no prayer.

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the Deponent above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above affidavit are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Deponent
```

## filingChecklist

```json
[
  "Affidavit (original + copies as the receiving authority requires)",
  "Death certificate of the deceased",
  "Identity and address proof of the deponent",
  "Proof of the relationship of each heir named (e.g. family register, ration card or birth records), as the receiving authority requires",
  "To be sworn or affirmed before the authority the receiving office requires: check (verify)",
  "Stamp paper / notarisation as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an affidavit by the deponent naming the legal heirs of a deceased person. It is the deponent's own statement in the first person. It is not a petition and it is not a legal opinion on who inherits.",
  "State the heirs as 'The deponent states that the following are the legal heirs of the deceased:' followed by one numbered paragraph per person, with name, relationship, age and address exactly as the BRIEF gives them. Add no heir, relationship, age or address. Do not state the shares of any heir. Do not state the law under which they succeed.",
  "Do not write that the list is complete, that these are the only heirs, or that there is no other heir, unless the BRIEF records the deponent's statement; then write it as the deponent's statement. Where the BRIEF is silent, write [To be confirmed: whether the deponent states that the list of heirs is complete].",
  "Do not state whether the deceased left a will, died intestate, or was married or had children, unless the BRIEF gives it; otherwise [To be confirmed: whether the deceased left a will].",
  "State the deceased's name, date of death, place of death and last residence only as the BRIEF gives them. State the purpose only as the BRIEF gives it; do not write that any authority requires the affidavit.",
  "State every other claim, certificate, probate or proceeding on the estate that the BRIEF mentions, with the authority or court and date. Where the BRIEF mentions none, write [To be confirmed: whether any other claim or proceeding on the estate of the deceased exists, and where]. Never write that none exists.",
  "Cite no Act, section or rule. Do not name any judgment; where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| deponent_name / deponent_parentage / deponent_age / deponent_address / deponent_occupation | Deponent particulars | text / text / number / textarea / text | yes | verification |
| deceased_name | Name of the deceased | text | yes | nomenclature |
| death_date / death_place / deceased_last_residence | Date and place of death; last residence | date / text / textarea | yes | deceased clause |
| deponent_relationship | Deponent's relationship to the deceased | text | yes | relationship clause |
| heirs_rows | Heirs named (one row per person: name; relationship to the deceased; age; address) | list of rows | yes | heirs list, never invented |
| heirs_completeness | Deponent's statement on the list | select (Deponent states the list is complete; Not stated) | no | averment unlock |
| will_position | Will | select (Deponent states the deceased left no will; Deponent states the deceased left a will; Not stated) | no | averment unlock |
| purpose_of_affidavit | Purpose of the affidavit (as given) | text | no | purpose clause |
| earlier_proceedings | Other claims or proceedings on the estate (authority or court, date) | textarea | no | disclosure |
| court_designation / court_place | Court or office before which it is used, if any | text / text | no | optional heading |

## _averments

```json
{
  "pack": "affidavit_legal_heir",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "list_complete", "kind": "averment", "what": "The list of heirs is complete", "phrases": ["these are the only legal heirs", "there are no other legal heirs", "no other person has any right", "the list is complete", "iske alawa koi waris nahi"], "unlocked_by": {"key": "heirs_completeness", "label": "Deponent's statement on the list", "equals": ["deponent states the list is complete"]}},
    {"id": "died_intestate", "kind": "averment", "what": "The deceased left no will", "phrases": ["died intestate", "left no will", "did not leave any will", "bina wasiyat ke"], "unlocked_by": {"key": "will_position", "label": "Will", "equals": ["deponent states the deceased left no will"]}},
    {"id": "heirs_by_law", "kind": "averment", "what": "Legal conclusion on succession or shares", "phrases": ["succeed in equal shares", "are the class i heirs", "are entitled to inherit", "have equal shares in the estate", "barabar hissa"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other claims or proceedings on the estate", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "list_complete", "kind": "averment", "averment": "the deponent states that the persons named above are the only legal heirs of the deceased", "requires": {"key": "heirs_completeness", "label": "Deponent's statement on the list", "equals": ["deponent states the list is complete"]}},
    {"id": "died_intestate", "kind": "averment", "averment": "the deponent states that the deceased left no will", "requires": {"key": "will_position", "label": "Will", "equals": ["deponent states the deceased left no will"]}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other claims or proceedings on the estate", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The personal law of succession applicable (Hindu, Muslim, Christian, Parsi or other) and the Act. Not cited, not stated; the heirs are as the deponent names them.
- Whether the receiving authority (bank, employer, revenue office) prescribes its own format. Checklist cue only.
- Whether the cause title may carry no court. The format has an optional court line; the lead decides how it is shown.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. 'Legal heir' is a legal status. The Drafter writes it only as the deponent's statement ('The deponent states that the following are the legal heirs') and never states shares.
2. Risk. The 'list is complete' line is the main exposure: it is banned unless the deponent's statement is in the form.
3. The closing word of the verification is "Deponent" (Ajay's ruling); the deponent's relationship to the deceased is stated in the body, not in the closing word.
4. Court_levels is a placeholder (not court-specific); the lead maps it to T-240's list.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Affidavits and court forms. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Heirs only from the form; completeness of the list only as the deponent states it. Closing "Deponent". |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
