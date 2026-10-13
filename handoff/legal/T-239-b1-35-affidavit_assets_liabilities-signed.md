# T-239 b1 #35 affidavit_assets_liabilities (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2.

| Field | Value |
|---|---|
| id | `affidavit_assets_liabilities` |
| displayName | Affidavit of Assets, Income, Expenses and Liabilities (maintenance proceedings) |
| category | Affidavits and court forms |
| court_levels | `["family_court", "district_court", "magistrate"]` |
| Ink | L = 2 |
| Anushka tier | B (raised from C by Ajay's ruling; it travels with #34, a tier A pack) |
| averments file | `_averments/affidavit_assets_liabilities.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{party_one} ... {party_one_label}\nVERSUS\n{party_two} ... {party_two_label}",
  "partyDesignations": [
    {"role": "party_one", "label": "{party_one_label}"},
    {"role": "party_two", "label": "{party_two_label}"}
  ],
  "caseNomenclature": "{proceeding_reference}\nAFFIDAVIT OF ASSETS, INCOME, EXPENSES AND LIABILITIES OF {deponent_name}"
}
```

## mandatoryClauses

```json
[
  {"id": "deponent_particulars", "name": "Deponent Particulars", "required": true, "description": "Name, parentage, age, address and occupation of the deponent, as the form gives them."},
  {"id": "proceeding", "name": "Proceeding in Which Filed", "required": true, "description": "The proceeding in which the affidavit is filed, as the form gives it; else the blank."},
  {"id": "income", "name": "Income", "required": true, "description": "Every income item the form lists (source, period, figure) as given; or the deponent's own statement that there is none, if the form says so; else the blank."},
  {"id": "expenses", "name": "Expenses", "required": true, "description": "Every expense item the form lists (head, period, figure) as given; else the blank."},
  {"id": "movable_assets", "name": "Movable Assets", "required": true, "description": "Every item the form lists (description, holder, value as given); or the deponent's statement that there is none; else the blank."},
  {"id": "immovable_assets", "name": "Immovable Assets", "required": true, "description": "Every item the form lists (description, location, share, value as given); or the deponent's statement that there is none; else the blank."},
  {"id": "liabilities", "name": "Liabilities", "required": true, "description": "Every liability the form lists (creditor, nature, outstanding figure as given); or the deponent's statement that there is none; else the blank."},
  {"id": "dependants", "name": "Dependants", "required": true, "description": "Persons dependent on the deponent, names, ages and relationship only as the form gives them."},
  {"id": "earlier_proceedings", "name": "Earlier Affidavits and Proceedings", "required": true, "description": "Every earlier affidavit of assets filed by the deponent in this or another proceeding between the parties, and every other proceeding on the same matter, with court, number and date as the form gives them; or the blank where the form is silent."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

Value: `""` (empty string). An affidavit carries no prayer.

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the Deponent above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above affidavit are true and correct to my knowledge and belief.

Verified at {place} on {date}.

Deponent
```

## filingChecklist

```json
[
  "Affidavit (original + copy for the other party)",
  "Documents supporting the items disclosed (bank statements, salary slips, income tax returns, property papers, loan statements), as the deponent relies on them",
  "Affidavit filed with the maintenance application, not after it, if the court so requires: check the court's direction (verify)",
  "To be sworn or affirmed before the authority the court's rules require: check (verify)",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an affidavit of the deponent's own assets, income, expenses and liabilities, to be filed in maintenance proceedings. The form is a structured list of items the deponent gives. Present the items as numbered paragraphs under the headings Income, Expenses, Movable Assets, Immovable Assets, Liabilities and Dependants, in the first person.",
  "Every figure, description and name comes from the form, exactly as given. Lawie asserts nothing about the deponent's or the other party's income, assets, expenses or lifestyle. Where an item lacks a figure, write [To be confirmed: the figure for this item]. Where a heading has no item and the form does not say that there is none, write [To be confirmed: whether the deponent has any item under this heading].",
  "Do not total, add, average, annualise, convert or compare any figure, and do not state a net worth or a surplus or deficit. If the form gives a total, give it as the form states it.",
  "Write 'the deponent has no income', 'the deponent owns no property' or the like only where the form has the deponent's explicit statement for that heading. Do not write that the disclosure is full, complete or that nothing has been concealed unless the form's statement says so; the verification is a system part.",
  "State every earlier affidavit of assets by the deponent, and every other proceeding on the same matter, that the BRIEF mentions, with court, number and date. Where the BRIEF mentions none, write [To be confirmed: whether any earlier affidavit of assets was filed by the deponent, and where]. Never write that none was filed.",
  "Do not cite any section, Act, rule or direction. The proceeding in which the affidavit is filed is stated only as the form gives it. Do not name any judgment or direction of a court that prescribes the format; where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do not add argument, a prayer or a submission to the affidavit.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| proceeding_reference | Proceeding in which this is filed (type and number) | text | yes | nomenclature |
| proceeding_type | Proceeding is | select (Maintenance application under the Hindu Marriage Act, 1955; Maintenance application before a Magistrate (the advocate selects the procedure code; no section is named); Proceedings under the Protection of Women from Domestic Violence Act, 2005; Other, specify) | yes | proceeding clause; no section named |
| party_one_name / party_one_label / party_two_name / party_two_label | Parties and labels | text / select | yes | cause title |
| deponent_name / deponent_parentage / deponent_age / deponent_address / deponent_occupation | Deponent particulars | text / text / number / textarea / text | yes | verification, particulars |
| income_rows | Income (one row per item: source; period; figure) | list of rows | no | income clause |
| income_none_declared | Deponent states there is no income | select (Deponent states there is no income; Not stated) | no | averment unlock |
| expense_rows | Expenses (one row per head: head; period; figure) | list of rows | no | expenses clause |
| movable_rows | Movable assets (one row per item: description; held by; value as given) | list of rows | no | movable clause |
| immovable_rows | Immovable assets (one row per item: description; location; share; value as given) | list of rows | no | immovable clause |
| assets_none_declared | Deponent states there are no assets | select (Deponent states there are no assets; Not stated) | no | averment unlock |
| liability_rows | Liabilities (one row per item: creditor; nature; outstanding figure) | list of rows | no | liabilities clause |
| dependant_rows | Dependants (one row per person: name; age; relationship) | list of rows | no | dependants clause |
| full_disclosure_statement | Deponent's statement on completeness | select (Deponent states this is a full disclosure; Not stated) | no | averment unlock |
| earlier_proceedings | Earlier affidavits of assets and other proceedings between the parties (court, number, date) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "affidavit_assets_liabilities",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "no_income", "kind": "averment", "what": "The deponent has no income", "phrases": ["i have no income", "i am not earning", "i have no source of income", "meri koi aay nahi hai"], "unlocked_by": {"key": "income_none_declared", "label": "Deponent states there is no income", "equals": ["deponent states there is no income"]}},
    {"id": "no_assets", "kind": "averment", "what": "The deponent owns no assets", "phrases": ["i own no property", "i have no assets", "i do not own any movable or immovable property", "mere naam koi sampatti nahi"], "unlocked_by": {"key": "assets_none_declared", "label": "Deponent states there are no assets", "equals": ["deponent states there are no assets"]}},
    {"id": "full_disclosure", "kind": "averment", "what": "The disclosure is full and nothing is concealed", "phrases": ["this is a full and complete disclosure", "i have disclosed all my assets", "nothing has been concealed", "poori jaankari di gayi hai"], "unlocked_by": {"key": "full_disclosure_statement", "label": "Deponent's statement on completeness", "equals": ["deponent states this is a full disclosure"]}},
    {"id": "other_party_means", "kind": "averment", "what": "Statement about the other party's income, assets or lifestyle", "phrases": ["the other party earns", "the respondent has substantial assets", "lavish lifestyle", "undisclosed income", "has concealed his income", "has concealed her income"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier affidavits of assets and other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_income", "kind": "averment", "averment": "the deponent states that the deponent has no income", "requires": {"key": "income_none_declared", "label": "Deponent states there is no income", "equals": ["deponent states there is no income"]}},
    {"id": "no_assets", "kind": "averment", "averment": "the deponent states that the deponent has no assets", "requires": {"key": "assets_none_declared", "label": "Deponent states there are no assets", "equals": ["deponent states there are no assets"]}},
    {"id": "full_disclosure", "kind": "averment", "averment": "the deponent states that this is a full disclosure of the deponent's assets, income, expenses and liabilities", "requires": {"key": "full_disclosure_statement", "label": "Deponent's statement on completeness", "equals": ["deponent states this is a full disclosure"]}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Earlier affidavits of assets and other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- Any Act or rule that requires this affidavit in maintenance proceedings, and the format a court has directed. Not cited, no judgment named: the advocate adds [Authority — add if relied upon].
- Whether the affidavit must be filed with the application or by a stated date. Checklist cue only.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. Rows are the whole content. The pack's danger is a Drafter that fills a blank row with 'nil' or totals; the prompt and the three banned lines guard that. An Anushka sample with empty rows is recommended.
2. relevantActs is empty on purpose: I am not certain of any section to cite. The proceeding is a select that names Acts but no sections.
3. The Magistrate option leaves the procedure code to the advocate (T-245); no procedure code is derived here and no criminal-procedure code is named in this pack.
4. Tier B by Ajay's ruling; it travels with #34, which is tier A.
5. The verification here omits "nothing material has been concealed" (the #12 pattern has it) because the pack bans that line unless the deponent's full-disclosure statement is in the form. See Questions for Ajay.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Affidavits and court forms. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Tier B. The words "nothing material has been concealed" stay out: the deponent adds them if the deponent states them (approved removal). Closing "Deponent". |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
