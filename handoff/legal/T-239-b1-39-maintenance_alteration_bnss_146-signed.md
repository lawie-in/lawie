# T-239 b1 #39 maintenance_alteration_bnss_146 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink S = 1. Pair checked against `config/sections/crpc-to-bnss.json`: CrPC 127 -> BNSS 146 (Alteration in allowance); CrPC 125 -> BNSS 144.

| Field | Value |
|---|---|
| id | `maintenance_alteration_bnss_146` |
| displayName | Application for Alteration in the Allowance (BNSS 146 / CrPC 127) |
| category | Family and matrimonial |
| court_levels | `["magistrate", "family_court"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing; the applicant may be either the payer or the recipient). Ajay may raise it to A as a maintenance filing |
| averments file | `_averments/maintenance_alteration_bnss_146.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {"number": "146", "description": "Alteration in allowance"}
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      {"number": "127", "description": "Alteration in allowance"}
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
  "caseNomenclature": "MISC. APPLICATION No. _____ of [YEAR]\n(In {maintenance_case_ref})\nAPPLICATION FOR ALTERATION IN THE ALLOWANCE UNDER {governing_provision}"
}
```

## mandatoryClauses

```json
[
  {"id": "original_order", "name": "The Original Maintenance Order", "required": true, "description": "The court, case reference, date of the order, and the monthly allowance ordered and to whom, as the brief gives them."},
  {"id": "parties_role", "name": "Parties and Applicant's Role", "required": true, "description": "Whether the applicant receives the allowance or is ordered to pay it, as the brief gives it."},
  {"id": "change_in_circumstances", "name": "Change in Circumstances", "required": true, "description": "The change in circumstances of the person receiving or paying the allowance, only as the brief gives it, with dates as given; else the blank. Never inferred."},
  {"id": "alteration_sought", "name": "Alteration Sought", "required": true, "description": "The alteration asked for (increase, reduction or other) and the figure, as the brief gives them; else the blank."},
  {"id": "payment_position", "name": "Payment Position", "required": false, "description": "The payment history or arrears only if the brief gives it, as the applicant's statement."},
  {"id": "earlier_applications", "name": "Earlier Applications", "required": true, "description": "Every earlier application to alter, enhance or cancel this allowance, and every other proceeding on the same maintenance, with court, number, date and result; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Alter the allowance ordered by order dated {original_order_date} passed in {maintenance_case_ref}, as set out in this application ({alteration_sought}), under {governing_provision};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

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
  "Certified copy of the original maintenance order",
  "Documents supporting the change in circumstances (e.g. employment, income, medical or school records), as the applicant relies on them",
  "Proof of payment or arrears, if relied on",
  "Affidavit of assets, income, expenses and liabilities, if the court requires one (separate Lawie document: affidavit_assets_liabilities)",
  "Notice / service on the respondent as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application to the Magistrate who made a maintenance order (or the court that succeeded to it) for alteration in the monthly allowance, on a change in the circumstances of the person receiving or ordered to pay it. This is not a fresh application for maintenance, not an application for execution or recovery, and not an appeal or revision.",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "WHICH SECTION. Cite the provision given as GOVERNING PROVISION in the case details, in the heading, the body and the prayer (Section 146 of the BNSS, or Section 127 of the CrPC). Do not cite a sub-section. Where GOVERNING PROVISION is not given, write [To be confirmed: Section 127 of the CrPC or Section 146 of the BNSS].",
  "State the original order's court, case reference, date and monthly allowance only as the BRIEF gives them; otherwise [To be confirmed: the original order of maintenance: court, case reference, date and allowance]. The date in fir_date is the date the maintenance petition was filed; use it only to decide the procedure code, and state it as a fact only if the BRIEF gives it.",
  "State the change in circumstances only as the BRIEF gives it, as the applicant's statement ('The applicant states that ...'), with dates as given. Do not write that circumstances have changed, or that the allowance is inadequate or excessive, unless the BRIEF gives the change and the reason; otherwise [To be confirmed: the change in the circumstances of the person receiving or ordered to pay the allowance].",
  "State the alteration sought and any figure exactly as the BRIEF gives it. Do not compute, justify or convert a figure. State the applicant's role (receiving or paying) only as the BRIEF gives it; do not assume it from the sex of the parties.",
  "Do not state that the allowance has been paid regularly, that arrears are due, or that the respondent has defaulted, unless the BRIEF gives it, and then as the applicant's statement.",
  "State every earlier application to alter, enhance or cancel this allowance, and every other proceeding on the same maintenance, that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application to alter this allowance, or any other proceeding on the same maintenance, exists, and where]. Never write that this is the first application or that none is pending.",
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
| applicant_role | Applicant is | select (The person receiving the allowance; The person ordered to pay the allowance) | yes | role clause |
| maintenance_case_ref / original_order_date | Original maintenance case reference and date of order | text / date | yes | nomenclature, prayer |
| original_allowance | Monthly allowance ordered (as in the order) | text | no | original order clause |
| fir_date | Date the maintenance petition was filed | date | no | T-245 Group C; relabelled per T-245 |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty (T-245) |
| change_in_circumstances | Change in circumstances (as the applicant gives it, with dates) | textarea | yes | averment unlock |
| alteration_sought | Alteration sought (increase / reduction / other; figure) | textarea | yes | alteration clause, prayer |
| payment_position | Payment history or arrears, as the applicant gives it | textarea | no | averment unlock |
| earlier_proceedings | Earlier applications to alter this allowance and other proceedings on the same maintenance (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "maintenance_alteration_bnss_146",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "circumstances_changed", "kind": "submission", "what": "Circumstances have changed so that the allowance should be altered", "phrases": ["circumstances have changed", "there is a change in circumstances", "the allowance is inadequate", "the allowance is excessive", "paristhitiyan badal gayi hain"], "unlocked_by": {"key": "change_in_circumstances", "label": "Change in circumstances (as the applicant gives it, with dates)", "present": true}},
    {"id": "payment_position", "kind": "averment", "what": "The allowance has been paid regularly, or arrears are due", "phrases": ["has paid the allowance regularly", "has defaulted in payment", "arrears are outstanding", "has not paid any maintenance", "bakaya hai"], "unlocked_by": {"key": "payment_position", "label": "Payment history or arrears, as the applicant gives it", "present": true}},
    {"id": "respondent_means", "kind": "averment", "what": "The respondent's means have increased or reduced", "phrases": ["the respondent's income has increased", "the respondent now earns", "the respondent has lost his job", "the respondent is now unemployed"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier applications to alter the allowance", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "circumstances_changed", "kind": "submission", "averment": "it is submitted that the allowance requires alteration because {{change_in_circumstances}}", "requires": {"key": "change_in_circumstances", "label": "Change in circumstances (as the applicant gives it, with dates)", "present": true}},
    {"id": "payment_position", "kind": "averment", "averment": "the applicant states that {{payment_position}}", "requires": {"key": "payment_position", "label": "Payment history or arrears, as the applicant gives it", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Earlier applications to alter the allowance", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The sub-sections of BNSS 146 / CrPC 127 (alteration on proof of change in circumstances; cancellation or variation where the order was made on a civil court decree or on a woman's remarriage or receipt of dues). Not cited, no sub-section cited, and no ground beyond the change in circumstances is drafted.
- Which Magistrate may hear the application (the one who made the order, or his successor). The pack says only 'the court' and relies on the form.
- Whether the original maintenance order was made under BNSS 144 / CrPC 125 or under another law (e.g. a personal law or a civil decree). The pack does not state it.
- The BSA's own savings provision for proceedings under the CrPC (T-245 marks it verify). Not cited. BNSS section 531 (repeal and savings) was in the draft's relevantActs; it is not in the approved set and is removed from signed fields.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. T-245 Group C applied: P-text only, word for word; keys fir_date (relabelled 'Date the maintenance petition was filed') and procedure_code with the T-245 show-rule; {governing_provision} = Section 146 BNSS or Section 127 CrPC. No S-text: there is no offence.
2. Risk. An alteration under the CrPC for an old order is the advocate's choice, never Lawie's; with no procedure_code the heading carries the both-forms blank.
3. Risk. The pack covers either side (the payer or the recipient). If you want two ids, say so; I have not split them.
4. Tier B chosen; consider A, since an order that raises an allowance can lead to recovery steps.
5. The derived case-details lines `PROCEDURE CODE:` and `GOVERNING PROVISION:` are as in the signed T-245; with no procedure_code both are left out and the P-text blank applies.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Family and matrimonial. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | T-245 Group C: P-text word for word, `fir_date` labelled "Date the maintenance petition was filed", `procedure_code`. BNSS 531 stays out of relevantActs. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
