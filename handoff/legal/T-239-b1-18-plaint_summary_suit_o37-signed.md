# T-239 b1 #18 plaint_summary_suit_o37 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `plaint_summary_suit_o37` |
| displayName | Plaint in a Summary Suit (CPC Order XXXVII) |
| category | Civil: plaints and suits |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side", "commercial_court_district", "commercial_division_high_court"]` |
| Ink | L = 2 |
| Anushka tier | B |
| averments file | `_averments/plaint_summary_suit_o37.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXXVII",
        "description": "Summary procedure"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{plaintiff} ... Plaintiff\nVERSUS\n{defendant} ... Defendant",
  "partyDesignations": [
    {
      "role": "plaintiff",
      "label": "Plaintiff"
    },
    {
      "role": "defendant",
      "label": "Defendant"
    }
  ],
  "caseNomenclature": "SUMMARY SUIT No. _____ of [YEAR]\n(Order XXXVII of the Code of Civil Procedure, 1908)\nPLAINT FOR RECOVERY OF THE SUM OF {principal_amount}"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Plaintiff and defendant with the particulars the BRIEF gives. Nothing about their standing that the BRIEF does not give."},
  {"id": "order_37_statement", "name": "Statement that the suit is under Order XXXVII", "required": true, "description": "Fixed wording: \"The plaintiff states that this suit is filed under Order XXXVII of the Code of Civil Procedure, 1908, and that no relief is claimed in it that does not fall within the ambit of that Order.\""},
  {"id": "instrument", "name": "The Written Instrument or Contract", "required": true, "description": "The written instrument or contract the claim rests on: kind, date, parties and what it provides, as the BRIEF gives them. The kind is taken from SUIT BASIS; never a kind the BRIEF does not give."},
  {"id": "amount_claimed", "name": "Amount Claimed", "required": true, "description": "The principal amount as the BRIEF gives it, and interest only as INTEREST CLAIMED gives it (rate, from-date and period as stated). No calculation, no total the BRIEF does not give."},
  {"id": "default", "name": "Default and Demand", "required": true, "description": "The due date, any demand made and the non-payment, only as the BRIEF gives them; blank where not given."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "\"It is stated that ...\" with the basis of territorial jurisdiction as the form gives it; blank where not given."},
  {"id": "valuation", "name": "Valuation", "required": true, "description": "\"It is stated that ...\" with the value of the subject matter as the form gives it; blank where not given."},
  {"id": "cause_of_action", "name": "Cause of Action", "required": true, "description": "\"It is stated that the cause of action arose on <date>\" only from the form date; else the blank."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier or other proceeding on the same claim, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Pass a decree under Order XXXVII of the Code of Civil Procedure, 1908 in favour of the plaintiff and against the defendant for the principal amount of {principal_amount} as set out in this plaint;
b) Award interest on the said amount as set out in this plaint: {interest_claimed};
c) Award the costs of the suit;
d) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the plaintiff shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {plaintiff}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that paragraphs {knowledge_paras} of the above plaint are true to my knowledge, and paragraphs {information_paras} are based on information received and believed to be true.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Plaint (original + copies for each defendant)",
  "Original written instrument or contract on which the suit is founded, with copies",
  "Documents of default or demand relied on (e.g. demand letter, bank memo, ledger extract), if any",
  "List of documents",
  "Affidavit of the plaintiff, if the court requires one",
  "Extra copies and process fee for summons: as the court requires (Order XXXVII; verify rule and form of the summons for judgment)",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "If the dispute is a commercial dispute, check whether pre-institution mediation applies (verify)",
  "Check the period of limitation against the Limitation Act, 1963 and the Act under which this is brought (verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft a plaint in a summary suit under Order XXXVII of the Code of Civil Procedure, 1908. It is not an ordinary plaint, not an application for leave to defend, and not the summons for judgment (the Court issues that; do not draft it).",
  "Include the statement of clause order_37_statement in its fixed wording. The inscription under the suit number is in the cause title; do not repeat it as a heading. Do not state that the suit is maintainable as a summary suit, that the claim is a liquidated demand, or that the defendant has no defence.",
  "Describe the written basis of the claim only as the BRIEF gives it: kind (from SUIT BASIS), date, parties and terms. Do not call it a bill of exchange, hundi, promissory note, written contract or guarantee unless SUIT BASIS says so. Do not state what the instrument means in law.",
  "State the principal as the BRIEF gives it. State interest only as INTEREST CLAIMED gives it. Do not work out interest, a total, a rate allowed by law or any period; do not state an entitlement to interest from your own knowledge.",
  "State the due date, any demand and the non-payment only as the BRIEF gives them. Do not say that a notice was served, that the defendant admitted or acknowledged the debt, or that the defendant has no defence, unless the BRIEF gives it.",
  "Jurisdiction and value come only from the form. Write \"It is stated that ...\" with the basis of territorial jurisdiction as the BRIEF gives it, and the value of the subject matter as the BRIEF gives it. Never write that the Court has jurisdiction or that the value is within its pecuniary limits. Where either is not given, write [To be confirmed: basis of territorial jurisdiction] or [To be confirmed: value of the subject matter]. State the date the cause of action arose only if the BRIEF gives it, as \"It is stated that the cause of action arose on <date>\"; otherwise [To be confirmed: date the cause of action arose].",
  "Do not state a court fee, stamp duty or other fee or duty.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "For this suit give the dates the BRIEF gives for the written instrument, the due date, any demand and the cause of action, as dates only.",
  "Give the dates the BRIEF gives (of the event the suit is founded on and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| plaintiff_name | Plaintiff name | text | yes | cause title, verification |
| plaintiff_parentage / plaintiff_age / plaintiff_address | Plaintiff particulars | text / number / textarea | yes | verification |
| defendant_name / defendant_address | Defendant name and address | text / textarea | yes | cause title, service |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| plaintiff_occupation | Plaintiff occupation or business | text | no | party clause |
| suit_basis | Written basis of the claim | select (Bill of exchange; Hundi; Promissory note; Cheque; Written contract; Other written instrument — state) | yes | instrument clause; kind is used only as chosen |
| instrument_description | Instrument or contract (date, parties, terms as they stand in it) | textarea | yes | instrument clause |
| principal_amount | Principal amount claimed | currency | yes | cause title, prayer |
| interest_claimed | Interest claimed (rate, from-date, period, as you state them) | textarea | no | amount clause, prayer |
| due_date | Date the amount fell due | date | no | default clause |
| demand_details | Demand made (date and form), if any | textarea | no | default clause; averment unlock |
| default_details | Non-payment (what was and was not paid, with dates) | textarea | yes | default clause |
| acknowledgement_details | Acknowledgement or part payment by the defendant (date and form), if any | textarea | no | averment unlock |
| territorial_basis | Basis of territorial jurisdiction (as you state it) | textarea | yes | jurisdiction clause; averment unlock |
| subject_value | Value of the subject matter (as you state it) | text | yes | valuation clause; averment unlock |
| cause_of_action_date | Date the cause of action arose | date | no | cause-of-action clause; averment unlock |
| earlier_proceedings | Earlier and other proceedings on the same matter (court, date, result) | textarea | no | disclosure clause; averment unlock |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |
| order_or_decree_date | Date of the event the suit is founded on (if you want it shown as a limitation date) | date | no | limitation dates (listed only; no period is stated or computed) |

## _averments

```json
{
  "pack": "plaint_summary_suit_o37",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "claim_within_order_37", "kind": "submission", "what": "The suit is maintainable as a summary suit or the defendant has no defence", "phrases": ["the suit is maintainable as a summary suit", "the claim is a liquidated demand", "the suit falls squarely within Order XXXVII", "the defendant has no defence", "the defendant has no real defence", "any defence is a sham"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "averment", "what": "The Court has territorial jurisdiction", "phrases": ["this Hon'ble Court has territorial jurisdiction", "this Court has jurisdiction to try the suit", "the suit is properly instituted in this Court"], "unlocked_by": {"key": "territorial_basis", "label": "Basis of territorial jurisdiction (as stated by the advocate)", "present": true}},
    {"id": "value_within_limits", "kind": "averment", "what": "The value is within the pecuniary limits of the Court", "phrases": ["the suit is within the pecuniary jurisdiction of this Court", "the value of the suit is within the pecuniary limits", "the suit is properly valued"], "unlocked_by": {"key": "subject_value", "label": "Value of the subject matter (as stated by the advocate)", "present": true}},
    {"id": "cause_of_action_arose", "kind": "averment", "what": "The cause of action arose on a date", "phrases": ["the cause of action arose on", "the cause of action first arose on", "the cause of action is continuing"], "unlocked_by": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as stated by the advocate)", "present": true}},
    {"id": "demand_made", "kind": "averment", "what": "A demand or notice was made and served", "phrases": ["the defendant was served with a legal notice", "despite service of the demand", "despite repeated demands"], "unlocked_by": {"key": "demand_details", "label": "Demand made", "present": true}},
    {"id": "liability_acknowledged", "kind": "averment", "what": "The defendant acknowledged the liability or part-paid", "phrases": ["the defendant has admitted the liability", "the defendant acknowledged the debt", "the defendant made part payment"], "unlocked_by": {"key": "acknowledgement_details", "label": "Acknowledgement or part payment", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "court_has_jurisdiction", "kind": "averment", "averment": "it is stated that the basis of territorial jurisdiction is {{territorial_basis}}", "requires": {"key": "territorial_basis", "label": "Basis of territorial jurisdiction (as stated by the advocate)", "present": true}},
    {"id": "value_within_limits", "kind": "averment", "averment": "it is stated that the value of the subject matter of the suit is {{subject_value}}", "requires": {"key": "subject_value", "label": "Value of the subject matter (as stated by the advocate)", "present": true}},
    {"id": "cause_of_action_arose", "kind": "averment", "averment": "it is stated that the cause of action arose on {{cause_of_action_date}}", "requires": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as stated by the advocate)", "present": true}},
    {"id": "demand_made", "kind": "averment", "averment": "it is stated that a demand was made as follows: {{demand_details}}", "requires": {"key": "demand_details", "label": "Demand made", "present": true}},
    {"id": "liability_acknowledged", "kind": "averment", "averment": "it is stated that the defendant acknowledged the liability or made payment as follows: {{acknowledgement_details}}", "requires": {"key": "acknowledgement_details", "label": "Acknowledgement or part payment", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The rule numbers of Order XXXVII (understood: Rule 1 the classes of suit; Rule 2 institution and the contents of the plaint, including the averment and the inscription; Rule 3 appearance, summons for judgment and leave to defend). Not cited. Check that the fixed wording of `order_37_statement` and the cause-title inscription match the Rule's words.
- The classes of suit Order XXXVII covers (understood: bills of exchange, hundis, promissory notes, and debts or liquidated demands in money on a written contract, enactment or guarantee). Not stated in signed text; `suit_basis` is the advocate's choice. Whether a cheque belongs under "bill of exchange" (understood: yes, Negotiable Instruments Act s.6) is not stated.
- The rules on interest in a summary suit and in CPC s.34. Not stated anywhere; `interest_claimed` is the advocate's text.
- Whether Order XXXVII is available in the court level selected, and any State amendment or High Court rule on summary suits. Not stated.
- Pre-institution mediation for a commercial dispute (Commercial Courts Act, 2015; understood s.12A). Checklist cue only, marked verify.
- Order VII rule numbers for the contents of a plaint. Not cited. CPC s.20 (place of suing) and s.26 (institution of suits) were in the draft relevantActs; removed from signed fields (outside the approved set), to be checked against the bare Act. Order VII as a whole also removed (approved set has Order VII Rule 11 only).
- Order VI Rule 15 (verification): used in the verification template per Ajay's ruling; the two paragraph ranges are code-supplied.

## Notes for Ajay

1. Risk. The fixed wording of `order_37_statement` is a statement about the plaint's own contents. If the Rule's actual words differ, only your wording should stand; I have kept it out of any rule number.
2. Risk. `suit_basis` offers "Cheque". A dishonoured cheque may also support a complaint under the Negotiable Instruments Act; this pack does not draft that.
3. Limitation: the block keeps only `order_or_decree_date` (the event date) and `filing_date`; approved by Ajay. The certified-copy keys do not apply to a plaint.
4. Verification: now the two-limb form per Ajay's ruling (Order VI Rule 15 approved). `{knowledge_paras}` and `{information_paras}` are code-supplied paragraph ranges, not form keys. The Rule is not cited in the template text.
5. Tier B. One Anushka sample with `interest_claimed` and `demand_details` empty.

## Review changes (v2, per Ajay's rulings)

- relevantActs reduced to Order XXXVII (CPC s.20, s.26 and bare Order VII dropped: outside the approved set).
- 'Rs.' removed from the cause-title inscription and prayer (a): now 'THE SUM OF {principal_amount}' and 'the principal amount of {principal_amount}'. The code must render the currency symbol, not the spec.
- Verification replaced by the two-limb Order VI Rule 15 form, closing with {verifierCapacity}.
- Limitation instruction and checklist cue cut to event date and filing date (no certified-copy dates for a plaint).
- Anushka tier B, Ink L=2, category and court_levels unchanged.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: plaints and suits. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Order XXXVII statement approved ("no relief is claimed that does not fall within the ambit of that Order") and the inscription "(Under Order XXXVII of the Code of Civil Procedure)" below the number of the suit; rule numbers stay in Verify. The code may render the currency (Rs.) next to {principal_amount}; no fee or interest rate is stated by Lawie. Verification is the two-limb Order VI Rule 15 form. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
