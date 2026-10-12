# T-239 b1 #46 legal_notice_recovery_of_money (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `legal_notice_recovery_of_money` |
| displayName | Legal Notice for Recovery of Money (Loan / Goods / Services) |
| category (T-240) | Notices and replies |
| court_levels | `["pre_litigation"]` |
| Ink | S = 1 |
| Anushka tier | C (notice) |
| averments file | `_averments/legal_notice_recovery_of_money.json`, `inherits: null` |

## relevantActs

No section of any Act is cited, because none is needed to state the demand and none is certain enough for a money-recovery notice of this kind. The Indian Contract Act, 1872 is named in the text of the reservation of rights by name only; with no section, it is not listed here.

```json
[]
```

## causeTitle

```json
{
  "format": "LEGAL NOTICE\n\nTo,\n{recipient}\n{recipientAddress}\n\nFrom,\n{sender}\nThrough: {advocateName}, Advocate\n{advocateAddress}\n\nSubject: Notice demanding payment of {amount_demanded}",
  "partyDesignations": [
    { "role": "applicant", "label": "Sender / Creditor" },
    { "role": "respondent", "label": "Noticee / Debtor" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "authority", "name": "Authority", "required": true, "description": "That the notice is sent on the instructions of the sender." },
  { "id": "transaction", "name": "The Transaction", "required": true, "description": "Whether a loan, or goods supplied, or services rendered; date(s); parties; what was advanced, supplied or rendered; the invoice, bill, receipt or acknowledgement numbers: all only as the brief gives them." },
  { "id": "terms_of_repayment", "name": "Terms of Repayment", "required": true, "description": "The agreed due date or repayment terms only as the brief gives them; otherwise the blank." },
  { "id": "payments_and_balance", "name": "Payments Received and Balance", "required": true, "description": "Payments received so far, if the brief gives any, and the amount now said to be due, as the brief gives them. If the brief is silent on payments, the blank." },
  { "id": "interest", "name": "Interest", "required": false, "description": "Only if the form gives a rate and the period from which it is claimed. The rate is written exactly as the form gives it." },
  { "id": "demand", "name": "Demand", "required": true, "description": "Demand that the amount be paid within the period the form gives (blank if not given), by the mode the form gives." },
  { "id": "consequence", "name": "Consequence of Non-payment", "required": true, "description": "That, failing payment, the sender will be at liberty to take such proceedings as are open to the sender in law. No named proceeding other than as the brief gives it, and no consequence as to costs." },
  { "id": "earlier_demands", "name": "Earlier Demands and Proceedings", "required": true, "description": "Every earlier demand, notice, reminder, complaint or proceeding on this debt, as the brief gives it; or the blank where the brief is silent." },
  { "id": "reservation", "name": "Reservation of Rights", "required": true, "description": "Rights reserved for the future, under the Indian Contract Act, 1872 (named, no section) and any other law." }
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
  "Documents of the transaction: loan document / promissory note / receipt / invoices / delivery challans / work order, as available",
  "Statement of account or ledger showing payments and the balance",
  "Proof of earlier demands (letters, e-mails, messages), if any",
  "Proof of the noticee's address",
  "Despatch by registered post / speed post / courier / e-mail: keep the proof of despatch and delivery",
  "Vakalatnama / authority letter from the sender",
  "Stamp duty / court fee: none for a notice; for any later suit, court fee as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a legal notice by an advocate on behalf of a creditor, demanding repayment of a money debt arising from a loan or from goods supplied or services rendered, as the form selects. State the facts in the order: parties, transaction, terms, payments and balance, demand, consequence.",
  "State the date, place, parties, amount, mode of payment, goods or services and every document number only as the BRIEF gives them. Where the BRIEF does not give one, write [To be confirmed: <what>]. Never compute interest, never total the amount due, and never infer a due date.",
  "State the amount demanded exactly as the form gives it. Do not add costs, damages or compensation as a sum unless the form gives a sum.",
  "Interest: state a rate only exactly as the form gives it, and say whether it is agreed or claimed only as the form says. If the form gives no rate, claim no interest and add nothing about interest. Do not state a statutory rate.",
  "Period to pay: state the period only as the form gives it (default blank). If it is not given, write [To be confirmed: period within which payment is demanded]. Do not choose a period such as 15 or 30 days.",
  "Payments received: state them only as the BRIEF gives them. If the BRIEF is silent, write [To be confirmed: payments received so far, if any]. Never write that nothing has been paid.",
  "Do not state that the noticee has acknowledged the debt, promised to pay, or admitted liability unless the BRIEF gives that and when. Do not state the date from which the debt became due unless the BRIEF gives it.",
  "Do not state or comment on any period of limitation, and do not say that the debt is within time or is not time-barred.",
  "Name the Indian Contract Act, 1872 once, by name only, in the reservation of rights (all rights under the Indian Contract Act, 1872 and any other law are reserved). State no section of it and no proposition of law drawn from it.",
  "Cite no section of any statute. Do not cite any judgment. Do not state that any particular offence has been committed, and do not threaten criminal proceedings; the notice may say only that the sender will take such proceedings as are open in law, unless the BRIEF gives a specific proceeding, in which case state it as the BRIEF gives it.",
  "State every earlier demand, reminder, notice or proceeding on this debt that the BRIEF mentions, with date and mode. Where the BRIEF mentions none, write [To be confirmed: whether any earlier demand, notice or proceeding exists on this debt]. Never write that no other proceeding is pending.",
  "Do not characterise the noticee (dishonest, fraudulent, habitual defaulter). Use neutral words: 'has not paid', only where the BRIEF says no payment was made.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| sender_name / sender_address | Sender (creditor) | text / textarea | yes | cause title |
| recipient_name / recipient_address | Noticee (debtor) | text / textarea | yes | addressee |
| debt_nature | Nature of the debt | select (Loan; Goods supplied; Services rendered) | yes | transaction clause |
| transaction_date | Date of the loan / supply / service | date | yes | transaction clause |
| transaction_description | Description (what was lent, supplied or rendered) | textarea | yes | transaction clause |
| document_references | Invoice / receipt / agreement references | textarea | no | transaction clause |
| principal_amount | Amount advanced or invoiced (as figure) | text | yes | only source of the figure |
| due_date_or_terms | Due date or agreed repayment terms | textarea | no | terms clause |
| payments_received | Payments received so far (date, amount, mode) | textarea | no | payments clause |
| amount_demanded | Total amount demanded (as figure) | text | yes | demand |
| interest_rate | Interest rate claimed (as worded) | text | no | interest clause |
| interest_from_date | Interest claimed from | date | no | interest clause |
| interest_basis | Interest is | select (Agreed in the contract; Claimed without agreement) | no | wording |
| acknowledgement_of_debt | Debtor acknowledged the debt in writing | select (No; Yes — give date and form below) | no | unlock |
| acknowledgement_details | Details of acknowledgement | textarea | no | unlock |
| period_to_pay | Period allowed to pay | text | no | demand (blank if empty) |
| payment_mode | Mode of payment demanded (bank details as given) | textarea | no | demand |
| earlier_proceedings | Earlier demands, notices and proceedings | textarea | no | disclosure |
| advocate_name / advocate_enrolment / advocate_address | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "legal_notice_recovery_of_money",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "debt_acknowledged", "kind": "averment", "what": "The debtor acknowledged or admitted the debt", "phrases": ["has acknowledged the debt", "has admitted the liability", "promised to repay", "has acknowledged his liability in writing"], "unlocked_by": { "key": "acknowledgement_of_debt", "label": "Debtor acknowledged the debt in writing", "equals": ["yes"] } },
    { "id": "interest_agreed", "kind": "averment", "what": "Interest is payable at a stated rate", "phrases": ["interest at the rate of", "interest as agreed", "interest at the agreed rate", "interest at the bank rate"], "unlocked_by": { "key": "interest_rate", "label": "Interest rate claimed", "present": true } },
    { "id": "no_payment_made", "kind": "averment", "what": "Nothing has been paid", "phrases": ["has not paid a single rupee", "has not paid anything", "no payment has been made", "has not repaid any amount"], "unlocked_by": { "key": "payments_received", "label": "Payments received so far", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "within_limitation", "kind": "submission", "what": "The debt is within or outside the time allowed", "phrases": ["is within limitation", "is within time", "is not time-barred", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null },
    { "id": "debtor_dishonest", "kind": "averment", "what": "The debtor is dishonest or has acted with fraud or bad faith", "phrases": ["dishonest intention", "fraudulent", "cheated my client", "habitual defaulter", "with malafide intention"], "unlocked_by": null },
    { "id": "criminal_threat", "kind": "averment", "what": "Criminal proceedings will follow", "phrases": ["criminal proceedings will be initiated", "will be prosecuted", "an FIR will be lodged", "will be sent to jail"], "unlocked_by": null }
  ],
  "allowed": [
    { "id": "debt_acknowledged", "kind": "averment", "averment": "the noticee acknowledged the liability as follows: {{acknowledgement_details}}", "requires": { "all_of": [ { "key": "acknowledgement_of_debt", "label": "Debtor acknowledged the debt in writing", "equals": ["yes"] }, { "key": "acknowledgement_details", "label": "Details of acknowledgement", "present": true } ] } },
    { "id": "interest_agreed", "kind": "averment", "averment": "interest is claimed at {{interest_rate}}", "requires": { "key": "interest_rate", "label": "Interest rate claimed", "present": true } },
    { "id": "no_payment_made", "kind": "averment", "averment": "no payment has been received against the said amount", "requires": { "key": "payments_received", "label": "Payments received so far", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- Whether any section of the Indian Contract Act, 1872 should be cited for a debt notice (for example for compensation for breach). Not cited; the Act is named in the reservation of rights only.
- Whether a statutory interest provision applies where the contract is silent on interest. Not cited; the Drafter claims no interest unless the form gives a rate.
- Whether an acknowledgement of debt affects the period for suing; deliberately not mentioned in the notice or the pack.
- Whether a particular period before suit is required for this kind of debt. Not stated; the period to pay is the form's.

## Notes for Ajay

1. **Risk.** `debt_acknowledged` and `interest_agreed` are the two assertions that can later hurt the client if wrong; both are locked behind form fields. `interest_agreed` unlocks on any rate being present, and the allowed text says only 'claimed', so it does not assert that the rate was agreed; if you want 'agreed' as a separate fact, use `interest_basis`.
2. The notice is silent on limitation by design. The mandatory limitation block is not used because this is a notice, not a filing; an explicit `within_limitation` ban with a null unlock is in this pack.
3. `criminal_threat` banned with null unlock so a money-recovery notice cannot read as a threat.
4. Tier C.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Notices and replies. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. The Indian Contract Act, 1872 is named once, by name only, in the reservation of rights; no section. Interest and the period to pay only from the form. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
