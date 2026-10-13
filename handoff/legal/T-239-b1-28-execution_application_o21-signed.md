# T-239 b1 #28 execution_application_o21 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: execution and limitation at stake. Mode of execution is a select.

| Field | Value |
|---|---|
| id | `execution_application_o21` |
| displayName | Execution Application (CPC Order XXI) |
| category | Civil: appeals, revision, review, execution |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side", "commercial_court_district"]` |
| Ink | L = 2 |
| Anushka tier | A |
| averments file | `_averments/execution_application_o21.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXI",
        "description": "Execution of decrees and orders"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{decree_holder} ... Decree-Holder\nVERSUS\n{judgment_debtor} ... Judgment-Debtor",
  "partyDesignations": [
    {
      "role": "decree_holder",
      "label": "Decree-Holder"
    },
    {
      "role": "judgment_debtor",
      "label": "Judgment-Debtor"
    }
  ],
  "caseNomenclature": "EXECUTION CASE No. _____ of [YEAR]\n(Arising out of {decree_ref}, decree dated {order_or_decree_date})\nAPPLICATION FOR EXECUTION UNDER ORDER XXI OF THE CODE OF CIVIL PROCEDURE, 1908"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Decree-holder and judgment-debtor, with the particulars the BRIEF gives, and the position of each in the suit."},
  {"id": "decree", "name": "The Decree", "required": true, "description": "The court that passed it, the suit number, the date of the decree and the relief decreed, exactly as the BRIEF gives them; blank where not given. Never paraphrased."},
  {"id": "executing_court", "name": "Executing Court", "required": true, "description": "Whether this Court passed the decree, or the decree has been transferred to it, only as the BRIEF gives it; blank where not given."},
  {"id": "appeal_and_stay", "name": "Appeal and Stay", "required": true, "description": "Any appeal, review, revision or stay of the decree, with court, date and result, only as the BRIEF gives it; or the blank where the BRIEF is silent."},
  {"id": "payments", "name": "Payments and Adjustments", "required": true, "description": "Any payment or adjustment under the decree, with date and amount, only as the BRIEF gives it; or the blank where the BRIEF is silent."},
  {"id": "amount_due", "name": "Amount or Relief Still Due", "required": true, "description": "The amount or relief still due under the decree, only as AMOUNT DUE gives it. No calculation, no interest worked out."},
  {"id": "mode", "name": "Mode of Execution", "required": true, "description": "The mode chosen in MODE OF EXECUTION and the particulars that mode needs (property for attachment and sale; the judgment-debtor for arrest; the property for delivery of possession), as the BRIEF gives them."},
  {"id": "earlier_proceedings", "name": "Earlier Execution Applications", "required": true, "description": "Every earlier application for execution of this decree, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates of the decree, of any certified copy and of filing, as dates only."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Execute the decree dated {order_or_decree_date} passed in {decree_ref} against the judgment-debtor by the mode set out in this application, namely {mode_of_execution};
b) Award the costs of this execution;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the decree-holder shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {decree_holder}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Execution application (original + copies as the court requires)",
  "Certified copy of the decree and, if relevant, of the judgment",
  "Certified copy of the order of transfer of the decree, if the decree is executed in a court other than the one that passed it",
  "Statement of account of payments and adjustments under the decree, if any",
  "Schedule of property: description, location, title particulars if known (for attachment and sale, or delivery of possession)",
  "Details of the judgment-debtor for arrest and detention (address, last known whereabouts), if that mode is chosen",
  "Order of any appellate court or stay, if any",
  "Process fee and warrants as the court requires (not computed by Lawie)",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft an application for execution of a decree under Order XXI of the Code of Civil Procedure, 1908, by the mode chosen in MODE OF EXECUTION: attachment and sale, arrest and detention, or delivery of possession. Draft only that mode. It is not a suit, an application for stay, or an application for a substitute decree.",
  "Give the decree particulars exactly as the BRIEF gives them: court, suit number, date and the relief decreed. Quote the relief as worded. Where not given write [To be confirmed: the terms of the decree, as worded in the decree]. Do not state that the decree is executable, final or conclusive.",
  "State any appeal, review, revision or stay only as the BRIEF gives it. Where the BRIEF is silent, write [To be confirmed: whether any appeal, review, revision or stay is pending against the decree]. Never write that no appeal or stay is pending unless the form's earlier-proceedings answer is none.",
  "State the amount or relief still due only as AMOUNT DUE gives it. Do not calculate interest, a balance or a total, and do not state a rate of interest.",
  "For attachment and sale, describe the property exactly as the BRIEF gives it; do not complete boundaries, area or title. For delivery of possession, describe the property as the BRIEF gives it. For arrest and detention, state facts about the judgment-debtor's means or conduct only as the BRIEF gives them; otherwise write [To be confirmed: the facts relied on about the judgment-debtor's means or conduct]. Do not write that the judgment-debtor has means, is refusing or neglecting to pay, or is dishonestly avoiding payment.",
  "Do not state a court fee, stamp duty or process fee amount. Do not state that the application is within the time allowed for execution.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| decree_holder_name | Decree-holder name | text | yes | cause title, verification |
| decree_holder_parentage / decree_holder_age / decree_holder_address | Decree-holder particulars | text / number / textarea | yes | verification |
| judgment_debtor_name / judgment_debtor_address | Judgment-debtor name and address | text / textarea | yes | cause title, mode particulars |
| court_designation / court_place / state | Executing court | text / text / select | yes | cause title |
| decree_ref | Decree: court, suit number and year | text | yes | nomenclature, prayer |
| decree_relief | Relief decreed (as worded in the decree) | textarea | yes | decree clause, quoted verbatim |
| transfer_note | Transfer of the decree to this court, if any (order and date) | textarea | no | executing court clause |
| appeal_or_stay_status | Appeal, review, revision or stay against the decree (court, date, result) | textarea | no | appeal clause; averment unlock |
| payments_or_adjustments | Payments or adjustments under the decree (date, amount) | textarea | no | payments clause |
| amount_due_as_stated | Amount or relief still due (as you state it) | textarea | yes | amount clause; averment unlock |
| mode_of_execution | Mode of execution | select (Attachment and sale of property; Arrest and detention in civil prison; Delivery of possession of immovable property) | yes | mode clause, prayer |
| property_details | Property to be attached and sold, or to be delivered (description, location) | textarea | no | mode clause; shown for the attachment and delivery modes |
| means_note | Facts about the judgment-debtor's means or conduct | textarea | no | mode clause; shown for the arrest mode; averment unlock |
| earlier_proceedings | Earlier execution applications and other proceedings on this decree (court, date, result) | textarea | no | disclosure clause; averment unlock |
| order_or_decree_date | Date of the order, decree or event | date | no | limitation dates (listed only; no period is stated or computed) |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation dates (listed only) |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation dates (listed only) |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "execution_application_o21",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "decree_executable", "kind": "averment", "what": "The decree is executable or final", "phrases": ["the decree is executable", "the decree has attained finality", "the decree is final and binding on the judgment-debtor"], "unlocked_by": null},
    {"id": "no_appeal_or_stay", "kind": "averment", "what": "No appeal or stay is pending", "phrases": ["no appeal is pending", "the decree has not been stayed", "there is no stay of the decree"], "unlocked_by": {"key": "appeal_or_stay_status", "label": "Appeal, review, revision or stay against the decree", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}},
    {"id": "amount_due", "kind": "averment", "what": "A sum is due and unpaid", "phrases": ["the entire decretal amount is due and unpaid", "a sum is due", "nothing has been paid under the decree"], "unlocked_by": {"key": "amount_due_as_stated", "label": "Amount or relief still due", "present": true}},
    {"id": "jd_means_or_wilful", "kind": "averment", "what": "The judgment-debtor has means or is wilfully refusing", "phrases": ["has the means to pay", "wilfully refuses to pay", "is dishonestly avoiding payment", "has sufficient property to satisfy the decree"], "unlocked_by": {"key": "means_note", "label": "Facts about the judgment-debtor's means or conduct", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_appeal_or_stay", "kind": "averment", "averment": "the decree-holder states that no appeal, review, revision or stay is pending against the decree", "requires": {"key": "appeal_or_stay_status", "label": "Appeal, review, revision or stay against the decree", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}},
    {"id": "amount_due", "kind": "averment", "averment": "the decree-holder states that the amount or relief still due under the decree is as follows: {{amount_due_as_stated}}", "requires": {"key": "amount_due_as_stated", "label": "Amount or relief still due", "present": true}},
    {"id": "jd_means_or_wilful", "kind": "averment", "averment": "the decree-holder states the following about the judgment-debtor's means or conduct: {{means_note}}", "requires": {"key": "means_note", "label": "Facts about the judgment-debtor's means or conduct", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Code-supplied strings: mode_of_execution

Derived by the code from the `mode_of_execution` select; used in prayer (a) after "namely ".

| Select option | String produced |
|---|---|
| Attachment and sale of property | attachment and sale of the property described in this application |
| Arrest and detention in civil prison | arrest and detention of the judgment-debtor in civil prison |
| Delivery of possession of immovable property | delivery of possession of the immovable property described in this application |

## Verify (not in signed text)

- The period within which execution may be sought and the Article of the Limitation Act, 1963 (understood: Article 136, twelve years, with the rule on a decree of another court and on execution of a decree for a fresh period). Not stated anywhere.
- The rule numbers of Order XXI (understood: Rule 11 the form and contents of the written application; Rules 30-31 money decrees and attachment/arrest; Rule 35 delivery of immovable property; Rule 37 notice before arrest; Rules 41 and 54 examination of the judgment-debtor and attachment of immovable property; Rules 64-66 sale and proclamation). None is cited.
- CPC s.51 (powers of Court to enforce execution), s.38 (court by which a decree may be executed) and s.39 (transfer of decree for execution) were in the draft relevantActs; removed from signed fields (outside the approved set), to be checked against the bare Act.
- The conditions on arrest and detention (understood: Section 51 proviso on means and refusal; and the limits on civil prison). Not stated; `means_note` is the advocate's text only.
- Whether Order XXI Rule 11(2) requires the particulars (suit number, parties, date of decree, appeal, payments, previous applications, amount, costs, against whom, mode) in tabular form. The form keys cover them in substance; the table format is not drafted.
- Execution of a decree of a commercial court or a High Court's original side, and any State amendment of Order XXI. Not covered.
- Whether the decree-holder's death or assignment changes who may apply (Order XXI Rule 16 area; understood). Not covered.

## Notes for Ajay

1. Risk. The mode drives a different set of facts; the form shows `property_details` or `means_note` by `mode_of_execution`. The lead builds the show-rules.
2. Risk. `no_appeal_or_stay` is unlocked by an explicit none-type answer, as the earlier-proceedings entry is. If the advocate leaves the field empty the Drafter writes the blank.
3. Tier A: two Anushka samples, full facts and `decree_relief` empty, to check the decree's terms are not invented.
4. Limitation block used as written. Decree-holder verification uses `{decree_holder}`; the capacity word comes from `{verifierCapacity}`.

## Review changes (v2, per Ajay's rulings)

- relevantActs reduced to Order XXI (s.51, s.38, s.39 dropped, moved to Verify).
- Banned phrase 'a sum of Rs. is due' changed to 'a sum is due' (no rupee sign anywhere).
- Added the table of select option to mode_of_execution strings.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: appeals, revision, review, execution. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Limitation block mandatory. Mode of execution is a select; the code-supplied strings in the table are approved. No amount of fee or interest is stated. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
