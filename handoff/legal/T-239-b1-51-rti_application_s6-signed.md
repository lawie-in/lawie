# T-239 b1 #51 rti_application_s6 (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `rti_application_s6` |
| displayName | RTI Application (Section 6(1), Right to Information Act, 2005) |
| category (T-240) | RTI |
| court_levels | `["public_authority"]` |
| Ink | S = 1 |
| Anushka tier | C (application to a public authority; not a court filing) |
| averments file | `_averments/rti_application_s6.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Right to Information Act, 2005",
    "sections": [
      { "number": "6(1)", "description": "Request for obtaining information (application to the Public Information Officer)" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "APPLICATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005\n\nTo,\nThe {pio_designation}\n{public_authority_name}\n{public_authority_address}\n\nFrom,\n{applicant}\n{applicant_address}\n\nSubject: Request for information regarding {subject_line}",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant" },
    { "role": "respondent", "label": "Public Information Officer" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "request", "name": "Request under Section 6(1)", "required": true, "description": "That the applicant requests the information below under Section 6(1) of the Right to Information Act, 2005." },
  { "id": "information_points", "name": "Information Requested", "required": true, "description": "The information requested as numbered points, exactly the points the form gives, in the form's order and words. No point added, merged or reworded to widen it." },
  { "id": "period_and_form", "name": "Period Covered and Form of Information", "required": true, "description": "The period the information relates to and the form in which it is sought (certified copies, inspection, or other), only as the form gives them. Blank where not given." },
  { "id": "applicant_particulars", "name": "Applicant Particulars", "required": true, "description": "Name, address and contact for reply, as the form gives them." },
  { "id": "fee", "name": "Fee", "required": true, "description": "A line stating that the application fee has been paid by the mode the form states, with no amount; the blank where not given." },
  { "id": "earlier_applications", "name": "Earlier Applications on the Same Subject", "required": true, "description": "Every earlier RTI application, appeal or complaint by the applicant on the same subject, as the form gives it; or the blank where the form is silent." },
  { "id": "transfer", "name": "If Not Held by this Authority", "required": false, "description": "A request that, if the information is held by another public authority, the application be transferred to it and the applicant informed. Stated as a request, not a fact." }
]
```

## prayerTemplate

```
""
```

## verificationTemplate

```
""
```

## filingChecklist

```json
[
  "Application fee as prescribed for the public authority (Central, or the state's RTI rules): check the rules of the authority; mode of payment (cash, demand draft, banker's cheque, postal order, online): check; not computed by Lawie",
  "Identify the correct public authority and its Public Information Officer (designation and address) from its website or notice board",
  "Applicant's proof of Below Poverty Line status, if fee exemption is claimed (check the authority's rules)",
  "Keep a copy of the application and the proof of fee payment",
  "Despatch by registered post / speed post, or file online on the portal where available: keep the receipt and date of filing",
  "Applicant's contact details for the reply",
  "Diary the date of filing; later steps depend on the reply: see the first appeal pack"
]
```

## promptInstructions

```json
[
  "Draft an application seeking information from a public authority under Section 6(1) of the Right to Information Act, 2005, addressed to the Public Information Officer. Address the officer by the designation the BRIEF gives, as given. Do not guess a designation.",
  "State the public authority, the Public Information Officer's designation, the applicant's name and address only as the BRIEF gives them. Where one is missing, write [To be confirmed: <what>].",
  "Information requested: write the information as numbered points, using the points the form gives, in the form's order and in its words. Each point asks for information (for example copies of a record, a note, a decision, the status of an application, or inspection of a file). Do not add a point, do not widen a point, do not turn a point into a question that asks for an opinion, an explanation of reasons or a reply to a hypothetical, unless the form's point is already worded that way.",
  "Do not make any allegation. Do not state or imply that any officer or authority has acted illegally, wrongly, corruptly, negligently or with delay. Do not characterise any person. Do not give reasons for seeking the information unless the BRIEF gives them.",
  "State the period covered and the form of information sought (certified copies, inspection, extract) only as the BRIEF gives them. If the BRIEF does not give the period, write [To be confirmed: period to which the information relates].",
  "Fee: say that the application fee is paid by the mode the BRIEF states (for example demand draft number or receipt), with no amount. If the BRIEF does not state the mode, write [To be confirmed: mode of payment of application fee]. Do not state an amount and do not state that no fee is payable. If the form says an exemption is claimed, write only that the applicant claims exemption on the basis the form gives; if the basis is not given, write [To be confirmed: basis of the fee exemption claim].",
  "Do not state the time within which the officer must reply, do not state any period under the Act, and do not state the consequences of non-reply.",
  "State every earlier RTI application, appeal or complaint by the applicant on the same subject that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier RTI application on this subject was made]. Never write that no earlier application has been made.",
  "Cite Section 6(1) of the Right to Information Act, 2005 only. Cite no other section and no judgment. Do not state that the information is held by the authority or is not exempt from disclosure.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name / applicant_address | Applicant | text / textarea | yes | cause title |
| applicant_contact | Contact for reply (phone / e-mail) | text | no | applicant particulars |
| public_authority_name / public_authority_address | Public authority | text / textarea | yes | addressee |
| pio_designation | Designation of the Public Information Officer (as given on the authority's record) | text | yes | addressee |
| subject_line | Subject (short) | text | yes | subject line |
| information_points | Information requested (repeater, one point per row) | list | yes | numbered points |
| period_covered | Period the information relates to | text | no | period clause |
| form_of_information | Form in which information is sought | select (Certified copies; Inspection of records; Extract or note; Other — explain) | no | form clause |
| fee_payment_mode | Mode and reference of fee payment (no amount) | text | no | fee clause |
| bpl_claimed | Fee exemption claimed | select (No; Yes) | no | fee clause |
| bpl_basis | Basis of the fee exemption claim (as the applicant states it) | textarea | required if exemption claimed | fee clause |
| earlier_proceedings | Earlier RTI applications, appeals, complaints on this subject | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details (if an advocate files) | text | no | system block |

## _averments

```json
{
  "pack": "rti_application_s6",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "information_held", "kind": "averment", "what": "The authority holds the information, or it is not exempt", "phrases": ["the information is held by your office", "the information is available with the authority", "the information is not exempt", "this information is not exempt under the Act"], "unlocked_by": null },
    { "id": "authority_default_or_misconduct", "kind": "averment", "what": "The authority or an officer has acted illegally, corruptly, negligently or with delay", "phrases": ["illegally", "corrupt", "negligently", "deliberately delayed", "has failed to perform its duty", "malafide"], "unlocked_by": null },
    { "id": "fee_exempt", "kind": "averment", "what": "The applicant is exempt from the fee", "phrases": ["is exempt from payment of fee", "belongs to a Below Poverty Line family", "no fee is payable"], "unlocked_by": { "key": "bpl_claimed", "label": "Fee exemption claimed", "equals": ["yes"] } },
    { "id": "reply_time_stated", "kind": "submission", "what": "The officer must reply within a stated period", "phrases": ["within thirty days", "within 30 days", "within 48 hours", "failing which the applicant will be entitled to"], "unlocked_by": null }
  ],
  "allowed": [
    { "id": "fee_exempt", "kind": "averment", "averment": "the applicant claims exemption from the fee on the following basis: {{bpl_basis}}", "requires": { "all_of": [ { "key": "bpl_claimed", "label": "Fee exemption claimed", "equals": ["yes"] }, { "key": "bpl_basis", "label": "Basis of the fee exemption claim", "present": true } ] } }
  ]
}
```

## Verify (not in signed text)

- The period within which the Public Information Officer must reply, and the 48-hour period for life and liberty, in section 7. Understood; not stated anywhere in the draft.
- Section 6(3) (transfer of an application to the authority that holds the information). The transfer request is worded as a request without a section.
- Section 8 (exemptions), section 11 (third-party information). Not cited.
- The prescribed fee and the mode of payment: central and state RTI rules differ. Cue only.
- Whether the application can be filed online for the authority named. Cue only.

## Notes for Ajay

1. **Risk.** Under Lawie's rule that the Drafter makes no allegation, the application contains no reasons and no criticism; some applicants want a one-line reason. If you want one, it needs its own form field.
2. **Risk.** The `bpl_claimed` text uses 'claims', so the application does not assert Below Poverty Line status in Lawie's voice. The fee line states no amount.
3. The `information_held` phrases are banned in all circumstances: the application asks, it does not say the authority holds the record.
4. Tier C. A sample with four information points, one of them worded as an opinion question, shows that the Drafter keeps the form's words.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): RTI. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. Section 6(1). Information points only from the form; the fee is a cue with no amount; no allegation. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
