# T-239 b1 #4 ni_complaint_s138 (draft for Ajay)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `ni_complaint_s138` |
| displayName | Complaint under Section 138 NI Act (Cheque Bounce) |
| category (T-240) | Cheque bounce / NI Act |
| court_levels | `["magistrate", "cjm"]` |
| Ink | L = 2 |
| Anushka tier | A (limitation at stake: s.142(1)(b) timeline; a defective date chain is fatal) |
| averments file | `_averments/ni_complaint_s138.json`, `inherits: "legal_notice_s138"`, `key_map: {}` (form keys reused unchanged). Parent is not itself inheriting, so one level holds |

## relevantActs

NI Act is not in `config/sections/` (no IPC/CrPC mapping applies). Sections below are from the bare act; the sub-section details are kept out of descriptions. BNSS/CrPC section-level mappings confirmed in `crpc-to-bnss.json` (200→223, 357→395).

```json
[
  {
    "act": "Negotiable Instruments Act, 1881",
    "sections": [
      { "number": "138", "description": "Dishonour of cheque for insufficiency, etc., of funds in the account" },
      { "number": "139", "description": "Presumption in favour of holder" },
      { "number": "141", "description": "Offences by companies" },
      { "number": "142", "description": "Cognizance of offences" },
      { "number": "143", "description": "Power of court to try cases summarily" },
      { "number": "145", "description": "Evidence on affidavit" }
    ]
  },
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "223", "description": "Examination of complainant" },
      { "number": "395", "description": "Order to pay compensation" }
    ]
  },
  {
    "act": "Code of Criminal Procedure, 1973 (CrPC) — only where PROCEDURE CODE is CrPC (T-245)",
    "sections": [
      { "number": "200", "description": "Examination of complainant" },
      { "number": "357", "description": "Order to pay compensation" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}, {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{complainant} ... Complainant\nVERSUS\n{accusedList} ... Accused",
  "partyDesignations": [
    { "role": "applicant", "label": "Complainant (Payee / Holder in due course)" },
    { "role": "respondent", "label": "Accused (Drawer)" }
  ],
  "caseNomenclature": "COMPLAINT CASE (N.I. ACT) No. _____ of [YEAR]\n(Complaint under {niSections} of the Negotiable Instruments Act, 1881)"
}
```

Code fills `{niSections}` from `drawer_type`: individual → `Section 138 read with Section 142`; company / LLP / partnership firm → `Section 138 read with Sections 141 and 142`. HUF: `Section 138 read with Section 142`, and the draft adds [To be confirmed: whether section 141 applies to this drawer] (s.141 for an HUF not decided; Ajay ruling).

## mandatoryClauses

```json
[
  { "id": "complainant_particulars", "name": "Complainant", "required": true, "description": "Name and address of the complainant as payee or holder in due course. Where the complainant is a company or firm: the person filing for it and the authority under which that person files, as the brief gives them; or the blank" },
  { "id": "accused_particulars", "name": "Accused", "required": true, "description": "Drawer's name, type and address. Where the drawer is a company or firm: each other accused, the post held and the particulars the brief gives of that person's role in the conduct of its business; or the blank" },
  { "id": "underlying_liability", "name": "Debt or Liability", "required": true, "description": "The debt or other liability for which the cheque was issued, exactly as the brief gives it" },
  { "id": "cheque_details", "name": "Cheque Details", "required": true, "description": "Cheque number, date, amount in figures and words, drawee bank and branch, and account holder as the brief gives them" },
  { "id": "presentation_dishonour", "name": "Presentation and Dishonour", "required": true, "description": "Date of presentation, the bank through which it was presented, date of the return memo and the reason on the memo, word for word as the brief gives it" },
  { "id": "memo_receipt", "name": "Receipt of Information of Dishonour", "required": true, "description": "Date the complainant received the return memo or information of dishonour, as the brief gives it; or [To be confirmed: date the complainant received the return memo]" },
  { "id": "statutory_notice", "name": "Demand Notice", "required": true, "description": "Date of the demand notice, the mode and date of dispatch, and the address it was sent to, as the brief gives them" },
  { "id": "notice_service", "name": "Service of Notice", "required": true, "description": "What happened to the notice (received on a date, returned with a remark, or not known), exactly as the brief gives it; or [To be confirmed: whether and when the notice was received, or the postal remark on its return]" },
  { "id": "non_payment", "name": "Non-payment", "required": true, "description": "Whether the drawer paid the cheque amount after the notice, as the brief gives it; or [To be confirmed: whether any payment was made after the notice]. Never compute or state that the 15 days have run" },
  { "id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The branch of the bank where the complainant maintains the account through which the cheque was delivered for collection, as the brief gives it, as the basis of this court's jurisdiction; or the blank" },
  { "id": "dates_schedule", "name": "Schedule of Dates", "required": true, "description": "A list of the dates the brief gives (cheque, presentation, return memo, receipt of memo, notice dispatch, notice receipt or return) with what each is the date of. No period worked out" },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Every other complaint on the same cheque, any civil suit or other proceeding for the same debt, and any earlier complaint returned or withdrawn, that the brief mentions, with forum, number, date and status. Where the brief mentions none: [To be confirmed: whether any other complaint, suit or proceeding on this cheque or debt was filed or is pending, where, and its status]. Never state that there is none unless the brief says so" }
]
```

## prayerTemplate

```
PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) take cognizance of the offence under {niSections} of the Negotiable Instruments Act, 1881 against the accused {accusedNames};
b) summon the accused and try them in accordance with law;
c) direct payment of compensation to the complainant in accordance with law; and
d) pass any other order that this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the complainant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {verifierName}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above complaint are true and correct to my knowledge and belief and to the records of the complainant. No part of it is false and nothing material has been concealed therein.

Verified at {place} on {date}.

Complainant
```

`{verifierCapacity}`: "the complainant above-named" (individual) or "the {authorisedDesignation} and authorised representative of the complainant" (entity). The words "and to the records of the complainant" apply only when the complainant is an entity; code drops them for an individual.

## filingChecklist

```json
[
  "Original dishonoured cheque",
  "Original return memo(s)",
  "Copy of demand notice",
  "Postal receipt(s) of the notice and tracking report / acknowledgment card / returned envelope",
  "Proof of the date the return memo was received (bank intimation), if any",
  "Documents showing the debt or liability (agreement, invoice, ledger, etc.)",
  "Complainant entity: board resolution / authority letter / partnership authority for the person filing — {{MISSING}} if not held",
  "Affidavit of the complainant for evidence (Section 145 NI Act) — separate document, as the court requires",
  "List of documents and list of witnesses",
  "Court fee as applicable — {{MISSING}}",
  "Process fee and copies for each accused — {{MISSING}}",
  "Vakalatnama",
  "Bank statement / certificate of the complainant's collecting branch (for jurisdiction under Section 142 NI Act)",
  "Electronic records relied on: certificate under Section 63 BSA — check",
  "Time for filing the complaint (Section 142 NI Act): advocate to check against the dates in the form. The draft does not state it"
]
```

## promptInstructions

```json
[
  "Draft a criminal complaint under Section 138 of the Negotiable Instruments Act, 1881 before the Magistrate.",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Set out in order: the parties; the debt or liability as the BRIEF gives it; the cheque; its presentation and dishonour; the receipt of the return memo; the demand notice and what happened to it; and whether payment was made. Each as the BRIEF gives it.",
  "Give the reason for dishonour in the words of the return memo as the BRIEF gives them. Do not paraphrase it.",
  "Give each date the BRIEF gives with what it is the date of: the cheque, its presentation, the return memo, the receipt of the return memo, the dispatch of the notice, and the receipt or return of the notice. Do not say that the cheque was presented within its validity, that the notice was within time, that the notice period has expired, or that the complaint is within time. Do not work out any period or any date.",
  "State what happened to the notice exactly as the BRIEF gives it. Do not say that the notice was served or refused unless the BRIEF says so. Never state as a fact that the notice is deemed to have been served. Only where the case details say the notice was returned refused or unclaimed, it may be written as a submission: 'It is submitted that the notice is deemed to have been served ...'.",
  "Where the drawer is a company or a firm, state for each other accused the post held and only the particulars the BRIEF gives of that person's role in the conduct of its business. Do not use the words of Section 141 about any person for whom the BRIEF gives no particulars; write [To be confirmed: particulars of this accused's role in the conduct of the business of the drawer].",
  "Where the drawer is a Hindu Undivided Family, write [To be confirmed: whether section 141 applies to this drawer].",
  "Base jurisdiction only on the complainant's collecting bank branch as the BRIEF gives it.",
  "End the body with a schedule of dates, one line per date, as the BRIEF gives them.",
  "State every other complaint, suit or proceeding on the same cheque or debt that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any other complaint, suit or proceeding on this cheque or debt was filed or is pending, where, and its status].",
  "Do not claim interest, notice charges or costs.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

Reuse every key of `legal_notice_s138` step 3 unchanged (`cheque_number`, `cheque_date`, `cheque_amount`, `amount_in_words`, `drawee_bank`, `drawee_branch`, `presentation_date`, `dishonour_date`, `dishonour_reason`, `underlying_liability`), so the parent's averments apply with `key_map: {}`. New or changed keys:

| key | label | type | required | why |
|---|---|---|---|---|
| state | State | select (4 states) | yes | Court rules overlay |
| court_designation / court_place | Court, place | text | yes | Cause title |
| complainant_type | Complainant is (individual, company/LLP, partnership firm, other) | select | yes | Verification capacity, authorisation clause |
| applicant_name / applicant_address | Complainant name, address | text / textarea | yes | Cause title (same keys as parent) |
| authorised_person / authorised_designation | Person filing for an entity complainant; designation | text | if entity | Verification, authorisation clause |
| authorisation_particulars | Authority (resolution / letter, date) | text | no | Unlocks `authorised_representative` |
| respondent_name / respondent_address / respondent_type | Drawer, address, type / capacity (as parent, with HUF as an option) | text / textarea / dropdown | yes | Cause title, `{niSections}`; HUF gets the s.141 blank |
| other_accused | Other accused for entity drawer (repeat: name, post, address) | repeater | no | Accused clause |
| director_role_particulars | For each, what they did in the business (signed cheque, managed accounts, etc.) | textarea | no | Unlocks `in_charge_and_responsible` |
| account_holder | Whose account the cheque was drawn on | text | no | Parent averment `account_holder` |
| collecting_bank_branch | Complainant's bank and branch through which the cheque was presented | text | yes | Jurisdiction clause |
| memo_received_date | Date complainant received return memo | date | yes | Date chain (parent key) |
| notice_date | Date of demand notice | date | yes | Notice clause |
| notice_dispatch_date | Date notice dispatched | date | yes | Date chain |
| notice_dispatch_mode | Mode (registered post AD, speed post, courier, e-mail, by hand, other) | select (multi) | yes | Notice clause |
| notice_service_outcome | What happened to the notice (delivered, returned refused, returned unclaimed, returned other, not known) | select | yes | Unlocks `notice_served` |
| notice_received_date | Date of delivery / return, per tracking or AD | date | no | Date chain |
| payment_after_notice | Payment made after notice? ("none", part — give amount, full) | text | yes | Unlocks `non_payment` |
| demands_made / drawer_assurances / cheque_delivery / relationship_particulars | As parent | textarea | no | Parent averments |
| earlier_proceedings | Other complaint / suit on the same cheque or debt ("none" or particulars) | textarea | no | Disclosure clause |
| advocate_name / advocate_enrolment | Advocate | text | yes | Signature block |

No `offence_date` key: the offence is under the NI Act on any date (see Notes). Approved (Ajay). New complaint, so procedure is fixed to BNSS and BSA (T-245): no `fir_date`, no `procedure_code`; code sets `PROCEDURE CODE: BNSS and BSA`. The five limitation dates above are form questions only; nothing computes from them.

## _averments

```json
{
  "pack": "ni_complaint_s138",
  "inherits": "legal_notice_s138",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "notice_served",
      "kind": "averment",
      "what": "The demand notice was served, received or refused",
      "phrases": ["the notice was duly served", "the accused received the notice", "the accused refused to accept the notice", "returned with the remark 'refused'", "notice mil gaya tha"],
      "unlocked_by": { "key": "notice_service_outcome", "label": "What happened to the notice", "equals": ["served", "delivered"] }
    },
    {
      "id": "deemed_service",
      "kind": "submission",
      "what": "The notice is deemed to have been served",
      "phrases": ["deemed to have been served", "deemed service", "presumed to have been served", "deemed to have knowledge of the notice"],
      "unlocked_by": { "key": "notice_service_outcome", "label": "What happened to the notice", "equals": ["returned refused", "returned unclaimed"] }
    },
    {
      "id": "non_payment",
      "kind": "averment",
      "what": "The drawer did not pay after the notice",
      "phrases": ["failed to make payment within 15 days", "did not pay despite receipt of notice", "has neither paid nor replied", "notice ke baad bhi paise nahi diye"],
      "unlocked_by": { "key": "payment_after_notice", "label": "Payment made after notice?", "equals": ["none", "nil", "no", "no payment", "koi nahi", "kuch nahi"] }
    },
    {
      "id": "no_reply",
      "kind": "averment",
      "what": "The drawer did not reply to the notice, or what the reply said",
      "phrases": ["did not reply to the notice", "no reply was received", "sent a false and frivolous reply", "jawab nahi diya"],
      "unlocked_by": { "key": "notice_reply", "label": "Reply to the notice, if any", "present": true }
    },
    {
      "id": "in_charge_and_responsible",
      "kind": "averment",
      "what": "A person was in charge of and responsible to the company for the conduct of its business",
      "phrases": ["in charge of and responsible to the company for the conduct of its business", "in charge of the day-to-day affairs", "responsible for the conduct of business", "is the directing mind", "company chalate hain"],
      "unlocked_by": { "key": "director_role_particulars", "label": "Role of each other accused in the business", "present": true }
    },
    {
      "id": "consent_connivance_neglect",
      "kind": "averment",
      "what": "The offence was committed with a person's consent or connivance or is attributable to their neglect",
      "phrases": ["with the consent and connivance of", "attributable to the neglect of", "with the active connivance of"],
      "unlocked_by": null
    },
    {
      "id": "territorial_jurisdiction",
      "kind": "submission",
      "what": "This court has territorial jurisdiction",
      "phrases": ["this Hon'ble Court has jurisdiction", "within the territorial jurisdiction of this Hon'ble Court", "cause of action arose within the jurisdiction"],
      "unlocked_by": { "key": "collecting_bank_branch", "label": "Complainant's bank and branch through which the cheque was presented", "present": true }
    },
    {
      "id": "cause_of_action_date",
      "kind": "submission",
      "what": "The date on which the cause of action arose (arithmetic on dates: never stated)",
      "phrases": ["the cause of action arose on", "cause of action accrued on expiry of 15 days", "the complaint is filed within one month", "within the period prescribed under Section 142"],
      "unlocked_by": null
    },
    {
      "id": "authorised_representative",
      "kind": "averment",
      "what": "The person filing is authorised by the complainant entity",
      "phrases": ["duly authorised by a resolution of the Board", "authorised signatory of the complainant", "has been authorised to file this complaint"],
      "unlocked_by": { "key": "authorisation_particulars", "label": "Authority (resolution / letter, date)", "present": true }
    },
    {
      "id": "interest_and_costs",
      "kind": "averment",
      "what": "Interest, notice charges or costs (not claimed in a criminal complaint)",
      "phrases": ["interest at the rate of", "notice charges of Rs", "legal costs", "byaj samet"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "notice_served", "kind": "averment", "averment": "the notice dispatched on {{notice_dispatch_date}} was {{notice_service_outcome}}", "requires": { "all_of": [ { "key": "notice_service_outcome", "label": "What happened to the notice", "equals": ["served", "delivered"] }, { "key": "notice_dispatch_date", "label": "Date notice dispatched", "present": true } ] } },
    { "id": "deemed_service", "kind": "submission", "averment": "It is submitted that the notice is deemed to have been served", "requires": { "key": "notice_service_outcome", "label": "What happened to the notice", "equals": ["returned refused", "returned unclaimed"] } },
    { "id": "non_payment", "kind": "averment", "averment": "the accused has not paid the amount of the cheque", "requires": { "key": "payment_after_notice", "label": "Payment made after notice?", "equals": ["none", "nil", "no", "no payment", "koi nahi", "kuch nahi"] } },
    { "id": "no_reply", "kind": "averment", "averment": "{{notice_reply}}", "requires": { "key": "notice_reply", "label": "Reply to the notice, if any", "present": true } },
    { "id": "in_charge_and_responsible", "kind": "averment", "averment": "{{director_role_particulars}}", "requires": { "key": "director_role_particulars", "label": "Role of each other accused in the business", "present": true } },
    { "id": "territorial_jurisdiction", "kind": "submission", "averment": "It is submitted that the cheque was delivered for collection through the complainant's account at {{collecting_bank_branch}}, and that this Hon'ble Court has jurisdiction", "requires": { "key": "collecting_bank_branch", "label": "Complainant's bank and branch through which the cheque was presented", "present": true } },
    { "id": "authorised_representative", "kind": "averment", "averment": "{{authorised_person}} files this complaint for the complainant under {{authorisation_particulars}}", "requires": { "key": "authorisation_particulars", "label": "Authority (resolution / letter, date)", "present": true } }
  ]
}
```

Notes on the file:
- `notice_served` overrides the `_default.json` entry (same id; default has `unlocked_by: null`). Without this the complaint can never plead service. Approved (Ajay): unlocked only by `notice_service_outcome` = served / delivered.
- `deemed_service` (Ajay ruling): never an averment; a submission only ("It is submitted that the notice is deemed to have been served ..."), unlocked only by `notice_service_outcome` = returned refused / returned unclaimed.
- `non_payment` allowed text has no period ("within 15 days" is banned).
- `no_reply` needs a new form key `notice_reply` (textarea, optional: "none" or what the reply said). Add to the form table above when you sign; I kept it out of required keys.
- `authorised_representative` allowed text names `{{authorised_person}}`; per README it is not offered if that fact is missing. Fine.
- Inherited from parent and still binding: `notice_within_thirty_days`, `presented_within_validity` (never), `return_memo_reason` (memo words only), `memo_remark_other_words`, `legally_enforceable_debt`, `dishonest_intention` (never).

## Verify (not in signed text)

- Section 142(1)(b) NI Act: one month from the date the cause of action arises under clause (c) of the proviso to Section 138; proviso to 142(1)(b) on condonation for sufficient cause. Used only as the checklist cue, no period stated.
- Section 142(2)(a) NI Act (2015 amendment): jurisdiction where the payee's/holder's account branch is situated when the cheque is delivered for collection through an account. Basis of the jurisdiction clause; confirm wording "maintains the account".
- Proviso (a)-(c) to Section 138: validity period of the cheque (from knowledge: three months, by RBI circular since 2012, not by the Act), 30 days for notice from receipt of information, 15 days to pay. None stated in signed text.
- Section 141 for an HUF drawer (not a "company" within the Explanation?): decide whether `{niSections}` adds 141 for HUF.
- Compensation: BNSS 395 (CrPC 357) is in ACTS; whether to cite it in the prayer. Kept as "in accordance with law".
- Section 143 summary trial and Section 145 affidavit evidence: in ACTS for context only; nothing instructs the Drafter to cite them.

## Notes for Ajay

- **Blocker if not fixed.** `_default.json` bans `notice_served` with nothing to unlock it. The override above is required, otherwise every 138 complaint has a hole where service should be.
- **Risk — deemed service.** "Unclaimed" returns are common; the deemed-service submission is standard but is a legal conclusion. Kept banned (null). The advocate adds it. If you want it unlockable on `notice_service_outcome = returned unclaimed`, add an allowed twin with your wording.
- **Risk — no `offence_date`.** The brief to me asked for an `offence_date` switch on every criminal template. The 138 offence is under the NI Act on any date, so there is nothing to switch for the offence; procedure is fixed to BNSS and BSA for a new complaint (T-245). Add `offence_date` only if you want it as a dummy for uniformity; I advise against an unused key.
- **Risk — section 141.** The Drafter is barred from the statutory words for a director unless particulars are given. This will produce blanks often; correct (vague 141 averments are a standard quashing ground).
- **Acceptable.** Interest and costs blocked (parent allowed them for the notice).
