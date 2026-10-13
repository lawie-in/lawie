# T-239 b1 #47 legal_notice_arbitration_s21 (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `legal_notice_arbitration_s21` |
| displayName | Notice Invoking Arbitration (Section 21, Arbitration and Conciliation Act, 1996) |
| category (T-240) | Arbitration and commercial courts |
| court_levels | `["pre_litigation"]` |
| Ink | S = 1 |
| Anushka tier | C (notice) |
| averments file | `_averments/legal_notice_arbitration_s21.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Arbitration and Conciliation Act, 1996",
    "sections": [
      { "number": "21", "description": "Commencement of arbitral proceedings: request for a dispute to be referred to arbitration" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "NOTICE INVOKING ARBITRATION\n(Section 21, Arbitration and Conciliation Act, 1996)\n\nTo,\n{respondent}\n{respondentAddress}\n\nFrom,\n{claimant}\nThrough: {advocateName}, Advocate\n{advocateAddress}\n\nSubject: Request for reference of the dispute under the agreement dated {agreement_date} to arbitration",
  "partyDesignations": [
    { "role": "applicant", "label": "Claimant (invoking arbitration)" },
    { "role": "respondent", "label": "Respondent" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "authority", "name": "Authority", "required": true, "description": "That the notice is sent on the instructions of the claimant." },
  { "id": "agreement", "name": "The Agreement", "required": true, "description": "The agreement containing the arbitration clause: title, date, place, parties, as the brief gives them." },
  { "id": "arbitration_clause", "name": "The Arbitration Clause", "required": true, "description": "The clause number and the clause quoted exactly as the brief gives it, in full, in quotation marks. Never paraphrased, shortened or completed. If not given, the blank." },
  { "id": "dispute", "name": "The Dispute", "required": true, "description": "The dispute that has arisen, briefly, as the brief gives it: what is claimed and on what facts. No fact or figure the brief does not give." },
  { "id": "request_for_reference", "name": "Request for Reference to Arbitration", "required": true, "description": "The request that the dispute be referred to arbitration under the clause, and that this notice be treated as the request under section 21." },
  { "id": "appointment_procedure", "name": "Appointment Procedure", "required": false, "description": "Only the procedure for appointing the arbitrator(s) that the clause itself gives and the brief states; the nominee named by the claimant only if the form gives a name. If the clause is silent or the brief gives nothing, the blank." },
  { "id": "seat_venue_language", "name": "Seat, Venue, Language", "required": false, "description": "Only as the clause gives them and the brief states." },
  { "id": "claims", "name": "Claims", "required": false, "description": "The reliefs the claimant intends to claim, as the brief gives them, without computing any sum." },
  { "id": "earlier_proceedings", "name": "Earlier Notices and Proceedings", "required": true, "description": "Every earlier notice, correspondence on the dispute, conciliation, mediation, suit, application or arbitration on this subject, as the brief gives it; or the blank where the brief is silent." },
  { "id": "reservation", "name": "Reservation of Rights", "required": true, "description": "Rights reserved, stated for the future." }
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
  "Copy of the agreement containing the arbitration clause (complete, with all annexures and amendments)",
  "Correspondence showing how the dispute arose, if any",
  "Proof of the respondent's address and, where the agreement fixes a notice address, that address",
  "Check the agreement for any pre-arbitration step (negotiation, conciliation, escalation) and the period it requires: verify",
  "Check whether the clause names the arbitrator or an institution, and its rules: verify",
  "Despatch by the mode the agreement requires for notices, and by registered post / speed post / courier / e-mail: keep proof of despatch and delivery",
  "Vakalatnama / authority letter from the claimant",
  "Fee: none for the notice; fees of the arbitral tribunal or institution as applicable: check the clause and the rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a notice by an advocate on behalf of a party to an arbitration agreement, requesting that a dispute be referred to arbitration under the Arbitration and Conciliation Act, 1996. The notice says that it is the request under Section 21 of that Act. It is not a statement of claim and not a petition to a court.",
  "Cite the Arbitration and Conciliation Act, 1996, Section 21 only. Cite no other section (for example no section on appointment by a court, interim measures or time limits). Do not state what the section provides beyond that it concerns the request for the dispute to be referred to arbitration.",
  "Quote the arbitration clause exactly as the BRIEF gives it, word for word, in quotation marks, with its clause number. Do not paraphrase, summarise, correct, translate or complete it. If it is not given, write [To be confirmed: arbitration clause, quoted exactly as in the agreement, with clause number].",
  "State the agreement (title, date, place, parties) and the dispute only as the BRIEF gives them. Do not add a date of breach, an amount, a figure of loss or a document that the BRIEF does not give. Do not total or compute any amount.",
  "Appointment procedure: state it only as the clause provides and the BRIEF states. Where the clause provides that each party nominates an arbitrator, name the claimant's nominee only if the form gives a name; otherwise write [To be confirmed: name of the claimant's nominee arbitrator, if the clause requires one]. Where the BRIEF does not state the procedure, write [To be confirmed: appointment procedure under the arbitration clause]. Do not propose a sole arbitrator, a name, a panel or an institution that the BRIEF does not give.",
  "Where the form gives a period for the respondent to reply, nominate or consent, state it exactly as the form gives it; if not given, write [To be confirmed: period allowed to the respondent]. Do not choose a period and do not state the periods that a statute or the clause may provide.",
  "Seat, venue and language: only as the clause gives them and the BRIEF states.",
  "Do not state that the dispute is arbitrable, that the clause is valid, binding or wide enough to cover the dispute, or that the claim is within time. Do not state or comment on any period of limitation. Do not argue the merits.",
  "State every earlier notice, correspondence on the dispute, conciliation, mediation, suit, application or arbitration on this subject that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier notice or proceeding exists on this dispute]. Never write that no other proceeding is pending.",
  "State that the respondent has failed to appoint or to respond only if the BRIEF says so and gives the date of the request it relates to. Otherwise do not write it.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| claimant_name / claimant_address | Claimant | text / textarea | yes | cause title |
| respondent_name / respondent_address | Respondent | text / textarea | yes | addressee |
| agreement_title | Agreement (title) | text | yes | agreement clause |
| agreement_date / agreement_place | Date and place of the agreement | date / text | yes | agreement clause |
| arbitration_clause_number | Arbitration clause number | text | yes | quoted |
| arbitration_clause_text | Arbitration clause (exact words) | textarea | yes | quoted verbatim |
| dispute_description | Dispute | textarea | yes | dispute clause |
| claims_intended | Claims the claimant intends to make | textarea | no | claims clause |
| appointment_procedure | Appointment procedure (as the clause gives it) | textarea | no | appointment clause |
| claimant_nominee | Claimant's nominee arbitrator, if the clause requires one | text | no | appointment clause |
| seat_venue_language | Seat, venue, language (as the clause gives them) | textarea | no | clause |
| reply_period | Period allowed to the respondent | text | no | request clause (blank if empty) |
| respondent_failed_to_respond | Respondent has not responded to an earlier request | select (No; Yes — give date below) | no | unlock |
| earlier_request_date | Date of the earlier request | date | no | unlock |
| earlier_proceedings | Earlier notices and proceedings on this dispute | textarea | no | disclosure |
| advocate_name / advocate_enrollment / advocate_address | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "legal_notice_arbitration_s21",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "clause_valid_and_wide", "kind": "submission", "what": "The arbitration clause is valid, binding and covers this dispute; the dispute is arbitrable", "phrases": ["the arbitration clause is valid", "binding arbitration agreement", "the dispute is covered by the arbitration clause", "the dispute is arbitrable", "falls within the scope of the arbitration agreement"], "unlocked_by": null },
    { "id": "respondent_failed_to_appoint", "kind": "averment", "what": "The respondent has failed to respond or to appoint", "phrases": ["has failed to appoint", "has failed to respond", "has not responded to the request", "has ignored the request"], "unlocked_by": { "key": "respondent_failed_to_respond", "label": "Respondent has not responded to an earlier request", "equals": ["yes"] } },
    { "id": "claim_within_time", "kind": "submission", "what": "The claim is not time-barred", "phrases": ["the claim is not time-barred", "the claim is within time", "the claims are within limitation", "is within limitation", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null },
    { "id": "respondent_in_breach", "kind": "averment", "what": "The respondent is in breach or has acted in bad faith", "phrases": ["is in breach of the agreement", "committed a fundamental breach", "acted in bad faith", "has wilfully defaulted"], "unlocked_by": { "key": "dispute_description", "label": "Dispute", "present": true } }
  ],
  "allowed": [
    { "id": "respondent_failed_to_appoint", "kind": "averment", "averment": "the respondent has not responded to the request made on {{earlier_request_date}}", "requires": { "all_of": [ { "key": "respondent_failed_to_respond", "label": "Respondent has not responded to an earlier request", "equals": ["yes"] }, { "key": "earlier_request_date", "label": "Date of the earlier request", "present": true } ] } },
    { "id": "respondent_in_breach", "kind": "averment", "averment": "the claimant states the dispute as follows: {{dispute_description}}", "requires": { "key": "dispute_description", "label": "Dispute", "present": true } }
  ]
}
```

## Verify (not in signed text)

- The text of section 21 in full: understood as providing that, unless the parties agree otherwise, arbitral proceedings in respect of a particular dispute commence on the date the respondent receives the request for reference. Only the heading-level description is in signed text.
- Section 11 (appointment of arbitrators, including the period after which a party may approach the court). Not cited.
- Section 43 and the Limitation Act, 1963 in relation to arbitration. Not cited; no limitation statement.
- Whether the 2015 / 2019 / 2021 amendments change anything about the notice or a pre-arbitration step. Not cited.
- Institutional rules where the clause names an institution. Not cited.

## Notes for Ajay

1. **Risk.** The clause is the heart of the notice. The form takes it in a single field and the Drafter quotes it verbatim. Recommend Anushka tests a sample with `arbitration_clause_text` empty (must give the blank, must not write a clause).
2. **Risk.** `respondent_in_breach` is unlocked by the dispute field being present, and the allowed text turns the dispute description into the claimant's own statement ('the claimant states ...'), so no breach is asserted in Lawie's voice.
3. The date of receipt matters under section 21 (understood, not signed text); the checklist tells the advocate to keep proof of delivery without saying why. Nothing more is said about it in the draft.
4. Tier C.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Arbitration and commercial courts. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. The arbitration clause is quoted exactly as the brief gives it; section 21 is cited at section level only. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
