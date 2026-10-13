# T-239 b1 #5 ni_interim_compensation_143a (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `ni_interim_compensation_143a` |
| displayName | Application for Interim Compensation (Section 143A NI Act) |
| category (T-240) | Cheque bounce / NI Act |
| court_levels | `["magistrate", "cjm"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing in a pending trial) |
| averments file | `_averments/ni_interim_compensation_143a.json`, own file, `inherits: null`. Not inheriting `legal_notice_s138`: most of its entries are about the notice stage and would only add noise |

## relevantActs

```json
[
  {
    "act": "Negotiable Instruments Act, 1881",
    "sections": [
      { "number": "138", "description": "Dishonour of cheque for insufficiency, etc., of funds in the account" },
      { "number": "143A", "description": "Power to direct interim compensation" }
    ]
  }
]
```

No BNSS/CrPC section is needed in the body. The recovery provision behind 143A is under Verify.

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}, {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{complainant} ... Complainant/Applicant\nVERSUS\n{accusedList} ... Accused/Respondent",
  "partyDesignations": [
    { "role": "applicant", "label": "Complainant/Applicant" },
    { "role": "respondent", "label": "Accused/Respondent" }
  ],
  "caseNomenclature": "COMPLAINT CASE (N.I. ACT) No. {caseNumber}\n\nAPPLICATION UNDER SECTION 143A OF THE NEGOTIABLE INSTRUMENTS ACT, 1881 FOR INTERIM COMPENSATION"
}
```

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, date of filing of the complaint, and the cheque (number, date, amount) as the brief gives them" },
  { "id": "stage_of_trial", "name": "Stage of the Case", "required": true, "description": "Whether the accused has pleaded not guilty (with the date) in a summary or summons trial, or the charge has been framed (with the date) in any other case, exactly as the brief gives it; or [To be confirmed: date on which the accused pleaded not guilty or the charge was framed]" },
  { "id": "grounds", "name": "Grounds for Interim Compensation", "required": true, "description": "Only the grounds the brief gives (for example the stage reached, the conduct of the trial, the complainant's position), each written as a submission" },
  { "id": "amount_sought", "name": "Amount Sought", "required": true, "description": "The amount the brief asks for, as the brief gives it; or that the amount is left to the court within the limit fixed by Section 143A. No amount worked out from the cheque amount" },
  { "id": "earlier_proceedings", "name": "Earlier Applications and Orders", "required": true, "description": "Any earlier application under Section 143A in this case and its result, and any order already made for interim compensation or deposit, as the brief gives them. Where the brief mentions none: [To be confirmed: whether any earlier application for interim compensation was made in this case and with what result]. Never state that there was none unless the brief says so" }
]
```

## prayerTemplate

```
PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) direct the accused {accusedNames} to pay interim compensation to the complainant under Section 143A of the Negotiable Instruments Act, 1881, of such amount, not exceeding twenty per cent of the amount of the cheque, as this Hon'ble Court may deem fit{amountSoughtClause};
b) direct that the interim compensation be paid within the time fixed by this Hon'ble Court under that Section; and
c) pass any other order that this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the complainant shall ever pray.
```

`{amountSoughtClause}`: empty, or `, and in particular Rs. {compensation_sought}/- as sought by the complainant` when the form gives an amount. Code never computes it.

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief and to the record of the case. No part of it is false and nothing material has been concealed therein.

Verified at {place} on {date}.

Complainant
```

## filingChecklist

```json
[
  "Copy of the order sheet showing the plea of not guilty / framing of charge",
  "Copy of the complaint and the cheque (copies; originals are on record)",
  "Copy of any earlier order on interim compensation or deposit",
  "Authority of the person filing for an entity complainant, if not already on record",
  "Court fee as applicable — {{MISSING}}",
  "Copy served on the accused's counsel",
  "Confirm that section 143A applies to this cheque (verify)"
]
```

## promptInstructions

```json
[
  "Draft an application by the complainant in a pending complaint under Section 138 of the Negotiable Instruments Act, 1881, asking the court to direct the accused to pay interim compensation under Section 143A.",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "State the case number, the date of filing, the cheque and the stage the case has reached, each as the BRIEF gives it.",
  "State the plea of not guilty or the framing of charge, with its date, only as the BRIEF gives it. Where the BRIEF does not give it, write the blank. Do not say that the accused is delaying the trial unless the BRIEF says so.",
  "The limit of twenty per cent of the amount of the cheque is the law's limit and may be stated as such. Do not work out twenty per cent of the cheque amount or any other amount.",
  "State the amount sought only as the BRIEF gives it.",
  "State any earlier application or order for interim compensation or deposit in this case that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier application for interim compensation was made in this case and with what result].",
  "Do not say that the accused will be convicted or that the complainant's case is proved. A prima facie case may be argued only as a submission on the facts stated.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (4 states) | yes | Court rules overlay |
| court_designation / court_place | Court, place | text | yes | Cause title |
| case_number | Complaint case number | text | yes | Cause title |
| fir_date | Date the complaint was filed | date | no | Case particulars; procedure switch (T-245 key) |
| procedure_code | This application is under | select (BNSS and BSA; CrPC and Evidence Act) | yes when shown | shown only when fir_date is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| complainant_type | Complainant is (individual, entity) | select | yes | Verification capacity |
| applicant_name | Complainant | text | yes | Cause title |
| authorised_person / authorised_designation | Person filing for an entity | text | if entity | Verification |
| respondent_name | Accused (repeat if several) | repeater | yes | Cause title, prayer |
| cheque_number / cheque_date / cheque_amount | Cheque | text / date / number | yes | Case particulars (same keys as `legal_notice_s138`) |
| trial_type | Trial (summary / summons, other) | select | yes | Stage clause |
| plea_date | Date accused pleaded not guilty | date | no | Stage clause; unlocks `plea_not_guilty` |
| charge_date | Date charge framed | date | no | Stage clause; unlocks `charge_framed` |
| compensation_sought | Amount sought (Rs.), if any | number | no | Prayer clause |
| grounds | Grounds for interim compensation | textarea | no | Grounds clause |
| delay_particulars | Adjournments sought by the accused (dates, as on order sheet) | textarea | no | Unlocks `accused_delay` |
| earlier_proceedings | Earlier 143A application or deposit order ("none" or particulars) | textarea | no | Disclosure clause |
| advocate_name / advocate_enrollment | Advocate | text | yes | Signature block |

Validation (code, not Drafter): warn if `compensation_sought` > 20% of `cheque_amount`. The warning is to the advocate; nothing is written into the draft.

## _averments

```json
{
  "pack": "ni_interim_compensation_143a",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "plea_not_guilty",
      "kind": "averment",
      "what": "The accused pleaded not guilty",
      "phrases": ["the accused has pleaded not guilty", "the accused denied the accusation", "plea of the accused was recorded", "accused ne jurm se inkaar kiya"],
      "unlocked_by": { "key": "plea_date", "label": "Date accused pleaded not guilty", "present": true }
    },
    {
      "id": "charge_framed",
      "kind": "averment",
      "what": "The charge has been framed",
      "phrases": ["charge has been framed", "charges were framed on", "charge framed ho gaya"],
      "unlocked_by": { "key": "charge_date", "label": "Date charge framed", "present": true }
    },
    {
      "id": "accused_delay",
      "kind": "averment",
      "what": "The accused is delaying the trial",
      "phrases": ["the accused is deliberately delaying", "dilatory tactics", "repeated adjournments by the accused", "taarikh par taarikh le raha hai"],
      "unlocked_by": { "key": "delay_particulars", "label": "Adjournments sought by the accused", "present": true }
    },
    {
      "id": "computed_compensation",
      "kind": "submission",
      "what": "An amount worked out from the cheque amount (arithmetic: never stated)",
      "phrases": ["being twenty per cent of the cheque amount, i.e. Rs.", "20% of Rs.", "which comes to Rs."],
      "unlocked_by": null
    },
    {
      "id": "complainant_hardship",
      "kind": "averment",
      "what": "Hardship or loss suffered by the complainant",
      "phrases": ["the complainant is suffering great financial hardship", "the complainant's business has suffered", "bahut nuksaan ho raha hai"],
      "unlocked_by": { "key": "hardship_particulars", "label": "Hardship to the complainant", "present": true }
    },
    {
      "id": "conviction_certain",
      "kind": "submission",
      "what": "The accused will be convicted or the case is proved",
      "phrases": ["the accused is bound to be convicted", "the offence is fully proved", "there is no defence"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "plea_not_guilty", "kind": "averment", "averment": "the accused pleaded not guilty on {{plea_date}}", "requires": { "key": "plea_date", "label": "Date accused pleaded not guilty", "present": true } },
    { "id": "charge_framed", "kind": "averment", "averment": "the charge was framed on {{charge_date}}", "requires": { "key": "charge_date", "label": "Date charge framed", "present": true } },
    { "id": "accused_delay", "kind": "averment", "averment": "{{delay_particulars}}", "requires": { "key": "delay_particulars", "label": "Adjournments sought by the accused", "present": true } },
    { "id": "complainant_hardship", "kind": "averment", "averment": "{{hardship_particulars}}", "requires": { "key": "hardship_particulars", "label": "Hardship to the complainant", "present": true } }
  ]
}
```

`hardship_particulars` is not a form key yet: stays banned until added (README default-deny). Add it as an optional textarea if you sign the entry.

## Verify (not in signed text)

- Section 143A(1)(a)/(b): summary or summons trial where the accused pleads not guilty; any other case upon framing of charge. Used only in descriptions in plain words, no clause numbers.
- Section 143A(2): not exceeding twenty per cent of the cheque amount. Stated in the prayer as the law's limit; certain from the bare act, but confirm.
- Section 143A(3): payment within sixty days, extendable by not more than thirty days. Deliberately not stated; prayer says "within the time fixed by this Hon'ble Court under that Section".
- Section 143A(4)-(5): repayment on acquittal with interest; recovery as fine under Section 421 CrPC. Table maps CrPC 421 → BNSS 462 (not 461). Not used.
- Section 143A inserted by the NI (Amendment) Act, 2018, in force 1 September 2018 (from knowledge). Prospective application rests on case law; no judgment named. Kept as a checklist cue only.
- Whether "Section 143A" (with letter) passes the lead's citation test; NI Act is not in `config/sections/`, so the test must skip non-BNS/BNSS/BSA acts.

## Notes for Ajay

- **Risk.** The power is discretionary ("may"). Prayer is "such amount ... as this Hon'ble Court may deem fit", with the advocate's figure only as "in particular". Do not let marketing call this "get 20% interim compensation".
- **Risk — switch.** No `offence_date`: NI Act on any date. `fir_date` (labelled "Date the complaint was filed") and `procedure_code` follow T-245 (Ajay ruling). Same reasoning as #4.
- **Acceptable.** No 60-day period stated; avoids C3 firing and avoids a period being misread as running from filing.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | Approved. The checklist cue "Confirm that section 143A applies to this cheque (verify)" is approved; no date is stated. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
