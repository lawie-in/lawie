# T-239 b1 #52 rti_first_appeal_s19 (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `rti_first_appeal_s19` |
| displayName | RTI First Appeal (Section 19(1), Right to Information Act, 2005) |
| category (T-240) | RTI |
| court_levels | `["public_authority"]` |
| Ink | S = 1 |
| Anushka tier | A (an appeal; a lost time-limit cannot be cured by redrafting) |
| averments file | `_averments/rti_first_appeal_s19.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Right to Information Act, 2005",
    "sections": [
      { "number": "6(1)", "description": "Request for obtaining information (application to the Public Information Officer)" },
      { "number": "19(1)", "description": "Appeal: first appeal to the officer senior in rank to the Public Information Officer (First Appellate Authority)" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "FIRST APPEAL UNDER SECTION 19(1) OF THE RIGHT TO INFORMATION ACT, 2005\n\nBefore the {faa_designation}\n{public_authority_name}\n{public_authority_address}\n\nIN THE MATTER OF:\n{appellant} ... Appellant\nVERSUS\n{pio_designation}, {public_authority_name} ... Respondent\n\n(Appeal against the {decision_description} dated {pio_reply_date} on RTI application dated {rti_application_date}, Registration / Reference No. {rti_reference_number})",
  "partyDesignations": [
    { "role": "applicant", "label": "Appellant" },
    { "role": "respondent", "label": "Respondent (Public Information Officer)" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "appellant_particulars", "name": "Appellant Particulars", "required": true, "description": "Name and address of the appellant, as the form gives them." },
  { "id": "original_application", "name": "The RTI Application", "required": true, "description": "The date and reference of the application under section 6(1), the authority and Public Information Officer to whom it was made, and the information sought (the points), as the form gives them." },
  { "id": "response_of_pio", "name": "Response of the Public Information Officer", "required": true, "description": "Whether a reply was given: the date and content of the reply, quoted or summarised exactly as the form gives it, and the ground, if any, on which the officer refused or limited the information, as the form gives it. If no reply is stated, only that the form records none." },
  { "id": "dates", "name": "Dates", "required": true, "description": "The dates the form gives: of the RTI application, of the reply, of receipt of the reply, and of filing this appeal. Not computed, and no date for the end of any period the officer had." },
  { "id": "grounds", "name": "Grounds of Appeal", "required": true, "description": "The grounds as the form gives them, as submissions: that the information was not given, was incomplete, or was refused on a ground the appellant disputes. No ground the form does not give." },
  { "id": "relief_sought", "name": "Relief Sought", "required": true, "description": "The information, or part of it, that the appellant asks the First Appellate Authority to direct the officer to give, as the form gives it." },
  { "id": "earlier_proceedings", "name": "Earlier Appeals and Proceedings", "required": true, "description": "Every earlier appeal, complaint or proceeding on this RTI application, as the form gives it; or the blank where the form is silent." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts stated above, it is respectfully prayed that the First Appellate Authority may be pleased to:

a) Direct the Public Information Officer to furnish the information sought in the application dated {rti_application_date}, as set out in this appeal;
b) Pass any other order(s) as the First Appellate Authority may deem fit and proper.

Appellant
```

## verificationTemplate

```
VERIFICATION

I, {appellant}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above appeal are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Appeal (original + copies as the authority requires)",
  "Copy of the RTI application, with proof of its despatch and of the fee paid",
  "Copy of the reply of the Public Information Officer, with the envelope or proof of the date of receipt; or, if there was no reply, a note of that",
  "Check the period for filing the first appeal under section 19(1) of the Act: verify",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Identify the First Appellate Authority (designation and address): the officer senior in rank to the Public Information Officer, from the authority's record",
  "Appeal fee, if any, as prescribed for the public authority: check the rules of the authority (not computed by Lawie)",
  "Documents relied on, if any, as enclosures",
  "Despatch by registered post / speed post, or filing online where available: keep the receipt and date of filing"
]
```

## promptInstructions

```json
[
  "Draft a first appeal under Section 19(1) of the Right to Information Act, 2005 to the First Appellate Authority, against the response (or non-response) of a Public Information Officer to an application under Section 6(1). Address the First Appellate Authority by the designation the BRIEF gives. Do not guess it.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "In this appeal, 'the order, decree or event' is the reply of the Public Information Officer, or the form's record that no reply was received. The dates to give are: of the RTI application, of the reply, of receipt of the reply, and of filing, as the form gives them. Do not state the time limit for filing a first appeal and do not state the time the officer had to reply.",
  "State the RTI application (date, reference, authority, the points of information sought) and the officer's response only as the BRIEF gives them. Quote or summarise the reply exactly as the form gives it. If the form says no reply was received, write only that the appellant states no reply was received, and do not write 'deemed refusal' or any consequence. If the BRIEF does not say whether a reply was given, write [To be confirmed: whether the Public Information Officer replied, and the date of the reply].",
  "Grounds: write the grounds only as the BRIEF gives them, as submissions ('It is submitted that ...'). If the officer relied on an exemption or other ground, state it in the words of the BRIEF but Where the reply names a section, sub-section or clause relied on, write it exactly as the reply gives it and add none of your own; where it names none, write [Provision relied on by the officer — add from the reply]. Do not add that the officer acted malafide, illegally, wilfully or with a motive, and do not characterise the officer.",
  "Do not state that the information is held by the authority, that it is not exempt, or that the denial is wrong in law unless the BRIEF gives a ground; then write it as a submission on that ground only.",
  "Relief: ask for the information as the BRIEF gives it. Do not add a request for a penalty, compensation or disciplinary action unless the BRIEF gives it.",
  "State every earlier appeal, complaint or proceeding on this RTI application that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier appeal, complaint or proceeding exists on this RTI application]. Never write that this is the first appeal or that no other proceeding is pending.",
  "Cite Section 19(1) of the Right to Information Act, 2005 and Section 6(1) only. Cite no other section. Do not name any judgment or Information Commission order. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| appellant_name / appellant_address | Appellant | text / textarea | yes | cause title |
| public_authority_name / public_authority_address | Public authority | text / textarea | yes | cause title |
| pio_designation | Public Information Officer (designation) | text | yes | respondent |
| faa_designation | First Appellate Authority (designation) | text | yes | addressee |
| rti_application_date | Date of the RTI application | date | yes | dates, prayer |
| rti_reference_number | Registration / reference number of the application | text | no | nomenclature |
| information_sought | Information sought in the application (points) | textarea | yes | original application clause |
| pio_replied | PIO response | select (Replied; No reply received) | yes | response clause |
| pio_reply_date | Date of the PIO's reply | date | no | dates (order or event date) |
| pio_reply_content | Content of the reply and the ground relied on (as worded) | textarea | no | response clause |
| pio_reply_receipt_date | Date the reply was received | date | no | dates |
| certified_copy_applied_date | Date of application for a copy, if any | date | no | limitation block key |
| certified_copy_received_date | Date a copy was received, if any | date | no | limitation block key |
| appeal_filing_date | Date of filing this appeal | date | no | limitation block key |
| filing_is_late | The filing is late | select (No; Yes) | no | condonation blank |
| delay_reason | Reason for delay, if late | textarea | no | condonation, if given |
| grounds_of_appeal | Grounds of appeal (as the appellant states them) | textarea | yes | submissions unlock |
| relief_sought | Information the appellant asks to be directed | textarea | yes | relief |
| earlier_proceedings | Earlier appeals and proceedings on this application | textarea | no | disclosure |
| verifierCapacity | Capacity in the verification | select (Appellant) | yes | verification |
| place | Place | text | yes | verification |
| advocate_name / advocate_enrolment | Advocate details (if an advocate files) | text | no | system block |

## _averments

```json
{
  "pack": "rti_first_appeal_s19",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "within_limitation", "kind": "submission", "what": "The appeal is within the time allowed", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null },
    { "id": "no_reply_received", "kind": "averment", "what": "The officer gave no reply", "phrases": ["no reply was received", "the PIO did not respond", "the application was not answered"], "unlocked_by": { "key": "pio_replied", "label": "PIO response", "equals": ["no reply received"] } },
    { "id": "denial_wrong", "kind": "submission", "what": "The denial or part-denial of information is wrong", "phrases": ["the denial is wrong", "the denial is unjustified", "the information is not exempt", "the exemption does not apply"], "unlocked_by": { "key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true } },
    { "id": "officer_malafide", "kind": "averment", "what": "The officer acted in bad faith or deliberately", "phrases": ["malafide", "deliberately denied", "acted with a motive", "wilfully withheld", "to shield"], "unlocked_by": null }
  ],
  "allowed": [
    { "id": "no_reply_received", "kind": "averment", "averment": "the appellant states that no reply was received to the application dated {{rti_application_date}}", "requires": { "key": "pio_replied", "label": "PIO response", "equals": ["no reply received"] } },
    { "id": "denial_wrong", "kind": "submission", "averment": "it is submitted that the response of the Public Information Officer is disputed on the following grounds: {{grounds_of_appeal}}", "requires": { "key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true } }
  ]
}
```

## Verify (not in signed text)

- The time limit for the first appeal (understood to run from the receipt of the decision or from the expiry of the time for decision) and the First Appellate Authority's power to admit a late appeal for sufficient cause. Not stated in any signed field; the cue is 'check the period for filing the first appeal in section 19: verify'.
- The period the Public Information Officer has to reply, and the consequence of no reply (section 7). Not stated.
- The First Appellate Authority's period to decide, and the second appeal to the Information Commission (section 19(3)). Not cited.
- Whether an appeal fee applies and its mode: authority-specific. Cue only.
- The limitation block says 'certified copy' and 'order, decree'. For an RTI appeal this is read as the PIO's reply; the block is kept word for word as instructed.

## Notes for Ajay

1. **Risk (limitation).** Tier A because a first appeal filed out of time may not be heard. The Drafter never says the appeal is in time and states no period; the checklist carries both cues.
2. **Risk.** The block's words 'certified copy' fit a court appeal, not an RTI reply; I kept them exactly and added an RTI-specific instruction after them. Ajay has approved this reading.
3. The default `no_other_proceedings` ban (key `earlier_proceedings`) applies unchanged. The default `within_limitation` is restated here (same id, still `unlocked_by: null`).
4. Anushka: one sample with `pio_replied` set to 'No reply received' and no dates, to check there is no 'deemed refusal' and no time-limit statement.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): RTI. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Approved. Tier A. The limitation text and the RTI instruction after it are approved. A section the reply names is written exactly as the reply gives it (amended in this file); the Drafter adds none of its own. No time limit and no "deemed refusal" is stated. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
