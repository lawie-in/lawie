# T-239 b1 #34 hma_s24_maintenance (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink S = 1.

| Field | Value |
|---|---|
| id | `hma_s24_maintenance` |
| displayName | Application for Maintenance Pendente Lite and Litigation Expenses (Hindu Marriage Act, section 24) |
| category | Family and matrimonial |
| court_levels | `["family_court", "district_court"]` |
| Ink | S = 1 |
| Anushka tier | A (maintenance-interim) — every sample twice: full facts, facts missing |
| averments file | `_averments/hma_s24_maintenance.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Hindu Marriage Act, 1955",
    "sections": [
      {"number": "24", "description": "Maintenance pendente lite and expenses of proceedings"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{applicant} ... Applicant ({applicant_status_in_petition})\nVERSUS\n{respondent} ... Respondent ({respondent_status_in_petition})",
  "partyDesignations": [
    {"role": "applicant", "label": "Applicant"},
    {"role": "respondent", "label": "Respondent"}
  ],
  "caseNomenclature": "MISC. APPLICATION No. _____ of [YEAR]\nIn {main_petition_type} No. {main_petition_number}\nAPPLICATION FOR MAINTENANCE PENDENTE LITE AND LITIGATION EXPENSES UNDER SECTION 24 OF THE HINDU MARRIAGE ACT, 1955"
}
```

## mandatoryClauses

```json
[
  {"id": "main_proceeding", "name": "The Main Proceeding", "required": true, "description": "The petition under the Act in which this application is made: its type, number, who filed it, the date of filing and the stage, as the brief gives them."},
  {"id": "parties_and_marriage", "name": "Parties and Marriage", "required": true, "description": "The parties, the date and place of marriage and the date of separation, as the brief gives them; else the blanks."},
  {"id": "applicant_means", "name": "Applicant's Income and Support", "required": true, "description": "The applicant's own income and means of support, only as the brief gives them. The affidavit of assets is referred to by reference and its contents are not restated or characterised."},
  {"id": "respondent_means", "name": "Respondent's Income", "required": true, "description": "The respondent's occupation and income only as the brief gives them, stated as the applicant's statement; never inferred."},
  {"id": "dependants", "name": "Dependants", "required": true, "description": "Children or others dependent on the applicant, their names and ages only as the brief gives them."},
  {"id": "amounts_claimed", "name": "Amounts Claimed", "required": true, "description": "The monthly (or weekly) sum claimed, the date from which, and the litigation expenses claimed, each as the brief gives it; else the blank. Never computed or justified by Lawie."},
  {"id": "earlier_proceedings", "name": "Earlier Orders and Other Proceedings", "required": true, "description": "Every earlier maintenance order or application between the parties in any proceeding, and every other proceeding on the same marriage, with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "affidavit_reference", "name": "Affidavit of Assets", "required": true, "description": "One sentence that the applicant's affidavit of assets, income, expenses and liabilities is filed with this application, by reference only, and only where the form records that it is filed; else the blank."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Direct the respondent to pay to the applicant maintenance pendente lite at the rate of {maintenance_claimed} {maintenance_period} from {maintenance_from_date} during the pendency of {main_petition_type} No. {main_petition_number}, under section 24 of the Hindu Marriage Act, 1955;
b) Direct the respondent to pay to the applicant {litigation_expenses_claimed} towards the expenses of the proceeding, under section 24 of the said Act;
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
  "Affidavit of assets, income, expenses and liabilities of the applicant (separate Lawie document: affidavit_assets_liabilities)",
  "Copy of the main petition in which the application is made",
  "Documents supporting the applicant's income position and expenses, if relied on",
  "Copy of any earlier maintenance order between the parties, if any",
  "Notice / service on the respondent as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in a pending proceeding under the Hindu Marriage Act, 1955, asking the Court for maintenance during the proceeding and for the expenses of the proceeding, under section 24. Either spouse may apply: use the applicant's role as the BRIEF gives it and never assume the applicant is the wife. This is not an application for permanent alimony and not an application under any other Act.",
  "Cite only section 24 of the Hindu Marriage Act, 1955. Do not cite a sub-section or a proviso. Write the main petition's type, number and stage only as the BRIEF gives them; otherwise [To be confirmed: the petition in which this application is made].",
  "State the applicant's income and means of support only as the BRIEF gives them. Do not write that the applicant has no independent income, or no income sufficient for support and the expenses of the proceeding, unless the BRIEF says so; where it is silent write [To be confirmed: the applicant's own income and means of support].",
  "State the respondent's occupation and income only as the BRIEF gives them and as the applicant's statement ('The applicant states that ...'). Do not infer the respondent's ability to pay, and do not write that the respondent is wealthy, evasive or concealing income unless the BRIEF gives it.",
  "State the amounts claimed (maintenance, and litigation expenses) exactly as the BRIEF gives them. Do not compute, add, convert, justify or reduce an amount. Where the BRIEF does not give an amount, write [To be confirmed: the sum claimed].",
  "Refer to the applicant's affidavit of assets, income, expenses and liabilities in one sentence, as filed with this application, only where affidavit_filed records that it is filed with this application; otherwise [To be confirmed: whether the affidavit of assets, income, expenses and liabilities is filed with this application]. Do not restate, total or characterise its contents.",
  "State every earlier maintenance order or application between the parties, and every other proceeding on the same marriage, that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier order for maintenance or any other proceeding on this marriage exists, and where]. Never write that this is the first application or that none is pending.",
  "Do not describe the other spouse's conduct, fault, desertion or cruelty except as the BRIEF gives it, and then only as the applicant's statement.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| applicant_name / applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / text / number / textarea | yes | verification |
| applicant_role | Applicant is | select (Wife; Husband) | yes | role; section 24 reaches either spouse |
| respondent_name / respondent_address | Respondent particulars | text / textarea | yes | cause title |
| main_petition_type / main_petition_number / main_petition_filed_date | Petition under the Act in which this is made | text / text / date | yes | nomenclature, prayer |
| applicant_status_in_petition / respondent_status_in_petition | Status in that petition (Petitioner / Respondent) | select | yes | cause title |
| marriage_date / marriage_place / separation_date | Marriage and separation | date / text / date | no | parties clause |
| income_position | Applicant's income position | select (No independent income sufficient for support and expenses, as stated by the applicant; Has some income, as stated by the applicant; Not stated) | yes | averment unlock |
| applicant_income_details | Applicant's own income and means (as the applicant gives them) | textarea | no | applicant_means clause |
| respondent_occupation / respondent_income_stated | Respondent's occupation and income, as the applicant states them | text / text | no | averment unlock |
| dependants | Dependants (names and ages as given) | textarea | no | dependants clause |
| maintenance_claimed / maintenance_period / maintenance_from_date | Maintenance claimed: sum; per (week / month); from | text / select / date | yes | prayer |
| litigation_expenses_claimed | Litigation expenses claimed | text | no | prayer |
| affidavit_filed | Affidavit of assets, income, expenses and liabilities | select (Filed with this application; Not stated) | yes | affidavit clause |
| earlier_proceedings | Earlier maintenance orders and other proceedings on this marriage (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "hma_s24_maintenance",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "no_independent_income", "kind": "averment", "what": "The applicant has no independent income sufficient for support and the expenses of the proceeding", "phrases": ["has no independent income", "no income sufficient for her support", "no income sufficient for his support", "is unable to maintain herself", "is unable to maintain himself", "koi aay nahi hai"], "unlocked_by": {"key": "income_position", "label": "Applicant's income position", "equals": ["no independent income sufficient for support and expenses, as stated by the applicant"]}},
    {"id": "respondent_income_stated", "kind": "averment", "what": "The respondent's income or ability to pay", "phrases": ["the respondent earns", "the respondent has a monthly income of", "the respondent is able to pay", "the respondent is a man of means", "pati ki aay"], "unlocked_by": {"key": "respondent_income_stated", "label": "Respondent's income, as the applicant states it", "present": true}},
    {"id": "dependants_exist", "kind": "averment", "what": "Children or others are dependent on the applicant", "phrases": ["is dependent on the applicant", "are dependent on the applicant", "the applicant is looking after the children", "bachche aashrit hain"], "unlocked_by": {"key": "dependants", "label": "Dependants (names and ages as given)", "present": true}},
    {"id": "respondent_conduct", "kind": "averment", "what": "The other spouse deserted, neglected or ill-treated the applicant", "phrases": ["has deserted the applicant", "has neglected the applicant", "has refused to maintain", "has abandoned", "chhod diya"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier maintenance orders and other proceedings on this marriage", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_independent_income", "kind": "averment", "averment": "the applicant states that the applicant has no independent income sufficient for support and the necessary expenses of the proceeding", "requires": {"key": "income_position", "label": "Applicant's income position", "equals": ["no independent income sufficient for support and expenses, as stated by the applicant"]}},
    {"id": "respondent_income_stated", "kind": "averment", "averment": "the applicant states that the respondent's income is {{respondent_income_stated}}", "requires": {"key": "respondent_income_stated", "label": "Respondent's income, as the applicant states it", "present": true}},
    {"id": "dependants_exist", "kind": "averment", "averment": "the applicant states that the following are dependent on the applicant: {{dependants}}", "requires": {"key": "dependants", "label": "Dependants (names and ages as given)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Earlier maintenance orders and other proceedings on this marriage", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The proviso to section 24 on the time within which the application is to be disposed of, and its period (understood to exist; not cited, no period stated).
- Whether section 24 applies, in terms, to every kind of petition under the Act (nullity, judicial separation, restitution, divorce). The pack says 'a pending proceeding under the Act' and relies on the form.
- The authority for the contents of the affidavit filed with a maintenance application (a known-format-affidavit authority exists): for the advocate to add. Not named; the Drafter writes [Authority — add if relied upon].
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. Section 24 is gender-neutral (either spouse); the pack follows the form's applicant_role and never assumes the wife.
2. Risk. Amounts are claims from the form, never computed. A blank amount stays a blank, so an Anushka sample with the amounts empty is useful.
3. The affidavit of assets is by reference only; the pack does not state that the affidavit is true or complete (that is for the deponent).
4. Prayer line b) is printed only when litigation_expenses_claimed is given (the lead re-letters the lines otherwise); the Drafter never supplies that sum.
5. Tier A: one Anushka sample with income_position = Not stated, to check that no 'no independent income' line is written.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Family and matrimonial. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Section 24 of the Hindu Marriage Act, 1955. That the affidavit of assets is filed is stated only when the form says so (`affidavit_filed`). Authority blank: [Authority — add if relied upon]. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
