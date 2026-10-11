# T-239 b1 #45 reply_to_legal_notice (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `reply_to_legal_notice` |
| displayName | Reply to Legal Notice (by Advocate for the Noticee) |
| category (T-240) | Notices and replies |
| court_levels | `["pre_litigation"]` |
| Ink | S = 1 |
| Anushka tier | C (notice; she checks the allegation-by-allegation table is followed) |
| averments file | `_averments/reply_to_legal_notice.json`, `inherits: null` (default-deny from `_default.json` plus the entries below) |

## relevantActs

No statute or section is cited. If the notice being answered cites a provision, the reply refers to it only as 'the provision cited in the notice'.

```json
[]
```

## causeTitle

```json
{
  "format": "REPLY TO LEGAL NOTICE\n\nTo,\n{noticeSender}\n{noticeSenderAddress}\n(through {noticeSenderAdvocate}, if the notice was sent through an advocate)\n\nFrom,\n{noticee}\nThrough: {advocateName}, Advocate\n{advocateAddress}\n\nSubject: Reply to your notice dated {notice_date}{notice_reference_clause}",
  "partyDesignations": [
    { "role": "applicant", "label": "Noticee (my client)" },
    { "role": "respondent", "label": "Sender of the notice" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "authority_and_notice_identified", "name": "Authority and Notice Identified", "required": true, "description": "That the advocate replies on the instructions of the noticee, and the notice answered (date, reference, sender), as the brief gives them." },
  { "id": "allegation_wise_reply", "name": "Allegation-wise Reply", "required": true, "description": "One numbered paragraph for each numbered allegation of the notice, in the notice's order, giving the client's instruction exactly as selected (admitted / denied / no knowledge / explained) and the explanation only as the brief gives it. Where no instruction is given for an allegation, the blank." },
  { "id": "general_denial", "name": "General Denial", "required": false, "description": "Only where the form selects the general denial, and then only for allegations not dealt with above." },
  { "id": "client_version", "name": "Client's Own Statement", "required": false, "description": "Further facts the client instructs, as the brief gives them. No counter-allegation or counter-claim the brief does not give." },
  { "id": "earlier_proceedings", "name": "Earlier Notices, Replies and Proceedings", "required": true, "description": "Every earlier notice, reply, complaint or proceeding between the parties on this matter, as the brief gives it; or the blank where the brief is silent." },
  { "id": "reservation", "name": "Reservation of Rights", "required": true, "description": "A statement for the future that the client reserves the right to take such steps as are open to the client in law. No threat of a particular proceeding the brief does not give." },
  { "id": "receipt_of_notice", "name": "Receipt of Notice", "required": false, "description": "Date of receipt of the notice only if the brief gives it." }
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
  "Copy of the notice being answered, with the envelope / postal or courier proof of receipt, if available",
  "Client's written instructions on each allegation (kept on file)",
  "Documents the reply refers to, if any, as enclosures",
  "Vakalatnama / authority letter from the client",
  "Despatch by registered post / speed post / courier / e-mail: keep the proof of despatch",
  "Copy of the reply for the client's file"
]
```

## promptInstructions

```json
[
  "Draft a reply to a legal notice, sent by an advocate on behalf of the noticee. Open by saying the reply is sent on the instructions of the noticee, identify the notice answered (date, reference, sender) as the BRIEF gives them, and answer it.",
  "Answer the notice allegation by allegation. The form lists the allegations of the notice, numbered. For each, write one numbered paragraph that repeats the allegation number and applies the client's instruction exactly as selected: ADMITTED (write that the allegation is admitted), DENIED (write that it is denied), NO KNOWLEDGE (write that the client has no knowledge of it and does not admit it), or EXPLAINED (write the explanation the BRIEF gives and nothing more). Never turn an instruction into a different one. Never admit what the BRIEF does not admit and never deny what the BRIEF does not deny.",
  "Where the BRIEF gives an allegation without an instruction, write [To be confirmed: client's instruction on allegation <number>].",
  "Do not write a general denial such as 'all allegations are denied' or 'each and every averment is denied' unless the form selects the general denial. If it is selected, write it only for allegations not dealt with above, after the allegation-wise reply.",
  "Give an explanation only as the BRIEF gives it. Do not add facts, dates, amounts, payments, documents or conversations. Do not call the notice false, baseless, frivolous, malicious or motivated, and do not characterise the sender.",
  "Do not make a counter-allegation, counter-claim or demand unless the BRIEF gives it. If it does, state it as the BRIEF gives it, in a separate paragraph after the allegation-wise reply.",
  "State every earlier notice, reply, complaint or proceeding between the parties on this matter that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier notice, reply or proceeding exists between the parties on this matter]. Never write that no other proceeding is pending.",
  "State the date of receipt of the notice only if the BRIEF gives it. Do not say the reply is sent within time. Do not state or comment on any period of limitation.",
  "End with a reservation of rights for the future: that the client reserves the right to take such steps as are open to the client in law. Do not threaten a particular proceeding, or costs, unless the BRIEF gives it.",
  "Cite no statute, section or judgment. If the notice cites a provision, refer to it only as 'the provision cited in the notice'. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| noticee_name / noticee_address | Noticee (client) | text / textarea | yes | cause title |
| notice_sender / notice_sender_address | Sender of the notice | text / textarea | yes | addressee |
| notice_sender_advocate | Advocate who sent the notice | text | no | addressee |
| notice_date | Date of the notice | date | yes | subject |
| notice_reference | Reference number on the notice | text | no | subject |
| notice_receipt_date | Date the notice was received | date | no | receipt clause |
| notice_demand_summary | What the notice demands (as worded) | textarea | yes | context |
| allegations | Allegations of the notice (repeater) | list | yes | one row per numbered allegation |
| allegations[].number | Allegation number | text | yes | paragraph number |
| allegations[].text | Allegation (as worded in the notice) | textarea | yes | quoted for the reply |
| allegations[].instruction | Client's instruction | select (Admit; Deny; No knowledge; Explain) | yes | decides the paragraph |
| allegations[].explanation | Explanation | textarea | required if Explain | the only source of explanation |
| general_denial_selected | Add a general denial for allegations not dealt with above | select (No; Yes) | yes | unlocks general denial |
| client_further_facts | Further facts the client instructs | textarea | no | client's own statement |
| counter_demand | Counter-demand or counter-claim, if any | textarea | no | separate paragraph |
| earlier_proceedings | Earlier notices, replies and proceedings on this matter | textarea | no | disclosure |
| advocate_name / advocate_enrolment / advocate_address | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "reply_to_legal_notice",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "general_denial", "kind": "averment", "what": "All allegations of the notice are denied in general", "phrases": ["all allegations are denied", "all the allegations contained in the notice are denied", "each and every averment is denied", "every allegation is denied", "save and except what is specifically admitted"], "unlocked_by": { "key": "general_denial_selected", "label": "General denial", "equals": ["yes"] } },
    { "id": "notice_false_and_baseless", "kind": "averment", "what": "The notice is false, baseless, frivolous or malicious", "phrases": ["the notice is false", "baseless and frivolous", "a malicious notice", "motivated notice", "sent only to harass", "sent with an ulterior motive"], "unlocked_by": null },
    { "id": "within_limitation", "kind": "submission", "what": "A claim or the notice is within or outside the time allowed", "phrases": ["is within limitation", "is barred by limitation", "is time-barred", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null },
    { "id": "notice_receipt_date_stated", "kind": "averment", "what": "The notice was received on a particular date", "phrases": ["the notice was received on", "was served upon my client on"], "unlocked_by": { "key": "notice_receipt_date", "label": "Date the notice was received", "present": true } }
  ],
  "allowed": [
    { "id": "general_denial", "kind": "averment", "averment": "all allegations of the notice that are not specifically dealt with in this reply are denied", "requires": { "key": "general_denial_selected", "label": "General denial", "equals": ["yes"] } },
    { "id": "notice_receipt_date_stated", "kind": "averment", "averment": "the notice was received by my client on {{notice_receipt_date}}", "requires": { "key": "notice_receipt_date", "label": "Date the notice was received", "present": true } }
  ]
}
```

## Verify (not in signed text)

- Nothing statutory is cited; a provision named in the notice is not named in the reply. Whether any reply must be made within a stated time depends on the notice and the Act it invokes; not stated.
- Whether the repeater's per-row condition (`explanation` required if Explain) can be enforced by the form engine; if not, the blank rule in promptInstructions covers an empty row.

## Notes for Ajay

1. **Risk (admissions).** An admission in a reply can be used against the client. The Drafter writes ADMITTED only where the row says Admit. Recommend Anushka tests a row left blank (must give the blank) and a row marked Admit.
2. **Risk.** Some notices have unnumbered allegations. The form asks the advocate to number them; the Drafter follows that numbering and does not re-number.
3. The default `no_other_proceedings` (key `earlier_proceedings`) is reused unchanged; the mandatory clause is the disclosure.
4. Tier C; no signature block beyond the system advocate block.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Notices and replies. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. A general denial only if the form selects it; a reply states no statute beyond "the provision cited in the notice". |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
