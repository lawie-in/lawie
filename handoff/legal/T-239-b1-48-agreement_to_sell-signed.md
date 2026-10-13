# T-239 b1 #48 agreement_to_sell (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `agreement_to_sell` |
| displayName | Agreement to Sell (Immovable Property) |
| category (T-240) | Property and conveyancing |
| court_levels | `["transactional"]` |
| Ink | L = 2 |
| Anushka tier | C (deed). State-specific stamp duty: this id is state-neutral; the long-term plan is one id per state |
| averments file | `_averments/agreement_to_sell.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Transfer of Property Act, 1882",
    "sections": [
      { "number": "54", "description": "'Sale' defined; a contract for the sale of immovable property does not, of itself, create any interest in or charge on the property" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "AGREEMENT TO SELL\n\nThis Agreement to Sell is made at {place_of_execution} on {execution_date}\n\nBETWEEN\n{seller} ... (the 'Seller')\nAND\n{buyer} ... (the 'Buyer')",
  "partyDesignations": [
    { "role": "applicant", "label": "Seller" },
    { "role": "respondent", "label": "Buyer" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "parties", "name": "Parties", "required": true, "description": "Each party's name, parentage / constitution, age (if an individual) and address, as the form gives them. Blank where not given." },
  { "id": "recitals", "name": "Recitals", "required": true, "description": "That the Seller offers to sell the property and the Buyer agrees to buy, on the terms below. How the Seller came to hold the property is stated only as the form gives it, as the Seller's statement; Lawie asserts no title." },
  { "id": "property_description", "name": "Property Description", "required": true, "description": "The property, with address, area, survey / khasra / plot / flat number, boundaries, as the form gives them. Blank where not given." },
  { "id": "consideration", "name": "Sale Consideration", "required": true, "description": "The total sale consideration as the form gives it, in figures and words as the form gives them. No figure of any kind added." },
  { "id": "earnest_money", "name": "Earnest Money / Advance", "required": true, "description": "The amount, date, mode and receipt of any earnest money or advance as the form gives them, and the balance payable on the date the form gives. Blank where not given." },
  { "id": "sale_deed_time", "name": "Time for Execution of the Sale Deed", "required": true, "description": "The date or period for execution and registration of the sale deed as the form gives it. Whether time is of the essence only if the form says so." },
  { "id": "possession", "name": "Possession", "required": true, "description": "When and how possession is to be delivered, as the form gives it. Never that possession has been delivered unless the form says so." },
  { "id": "title_documents", "name": "Title Documents Handed Over", "required": true, "description": "The title documents handed over to the Buyer for verification (originals or copies, as the form states), listed by type, date and description, as the form gives them; the blank where not given." },
  { "id": "encumbrance_disclosure", "name": "Encumbrances and Disputes Disclosure", "required": true, "description": "The Seller's statement of any mortgage, charge, lien, lease, attachment, litigation, tax or society dues, or other encumbrance, exactly as the form gives it. Where the form is silent, only the blank." },
  { "id": "seller_obligations", "name": "Seller's Undertakings", "required": true, "description": "Undertakings by the Seller for the future (to deliver title documents, to clear dues the form lists, to execute the sale deed). Never as a statement of present fact." },
  { "id": "buyer_obligations", "name": "Buyer's Undertakings", "required": true, "description": "Undertakings by the Buyer for the future (to pay the balance, to bear the costs the form allocates)." },
  { "id": "costs_stamp_registration", "name": "Costs of Stamp Duty and Registration", "required": true, "description": "Who bears them, only as the form gives it. No amount." },
  { "id": "default", "name": "Default", "required": true, "description": "Consequences of the Seller's or the Buyer's default exactly as the form selects them (for example forfeiture of earnest money, return of earnest money, an additional sum): the sum only as the form gives it. Blank where not given." },
  { "id": "other_proceedings", "name": "Other Agreements and Proceedings on the Property", "required": true, "description": "Any other agreement to sell, sale, mortgage, lease, litigation or notice concerning the property, as the form gives it; or the blank where the form is silent." },
  { "id": "general", "name": "General", "required": true, "description": "Notices, governing law, dispute resolution only as the form gives them; otherwise omitted. No clause the form does not give." },
  { "id": "execution_and_witnesses", "name": "Execution and Witnesses", "required": true, "description": "Signature blocks for the parties and two witnesses, with blanks. System part." }
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
  "Stamp duty / stamp paper as applicable: check state rules for an agreement to sell in the state shown (not computed by Lawie)",
  "Registration of this agreement: whether compulsory or advisable in the state shown: verify",
  "Seller's title documents (copies handed over): sale deed / gift deed / partition deed / allotment letter / mutation / 7-12 or equivalent record, as relevant",
  "Encumbrance certificate or search report for the period the buyer's advocate considers appropriate",
  "Identity and address proof of the parties (types only in the agreement; no ID numbers)",
  "Property tax receipts, electricity / water bills, society or maintenance no-dues, as relevant",
  "No-objection or permission from authority / society / bank, if the property needs it (e.g. mortgage release, society NOC): verify per state",
  "Proof of payment of earnest money (bank record / receipt)",
  "Two witnesses with address",
  "Power of attorney / authority letter, if a party signs through an attorney"
]
```

## promptInstructions

```json
[
  "Draft an agreement to sell immovable property between a Seller and a Buyer. It is an agreement to sell in future by a sale deed; it is not a sale deed and does not transfer ownership. Say so in the recitals or in the clause on the sale deed: that the sale is to be completed by a registered sale deed to be executed later, as the form states.",
  "State every party detail, property detail, price, earnest money, date, period, document and obligation only as the BRIEF gives it. Where the BRIEF does not give one, write [To be confirmed: <what>]. Never compute a balance, a percentage, a period or a date. Write each amount in the figures and words the form gives; never convert one into the other.",
  "Title: Lawie asserts no title. Write how the Seller came to hold the property only as the BRIEF states it, as the Seller's own statement ('The Seller states that ...'). Do not state that the Seller has a clear, valid, marketable title, is the absolute owner, or holds the property free from encumbrances, unless the form's encumbrance disclosure says there are none.",
  "Encumbrance disclosure: state the Seller's disclosure exactly as the BRIEF gives it. If the BRIEF is silent, write [To be confirmed: Seller's disclosure of mortgages, charges, liens, leases, attachments, litigation, tax or society dues and other encumbrances on the property, or a statement that there are none]. Never write that there are none unless the BRIEF says so.",
  "Title documents: list the documents handed over by type, date and description, as the BRIEF gives them, and whether originals or copies. If none are listed, write [To be confirmed: title documents handed over to the Buyer]. Add the Seller's undertaking for the future to produce the original title documents at the time of the sale deed, if the BRIEF so states.",
  "Earnest money and payments: state the amount, date and mode only as the BRIEF gives them. State that earnest money has been paid and received only if the form's payment status says so. If the status says payable, state it as payable on the date the form gives. If the status is not given, write [To be confirmed: whether the earnest money is paid and received or payable, and when]. Do not write an acknowledgement of receipt in the Seller's voice unless the status says paid.",
  "Possession: state when and how possession is to be given only as the BRIEF gives it. Never state that possession has been or is being delivered at signing unless the form says so. Do not state that the Buyer is a licensee or in part performance.",
  "Time is of the essence: write it only if the form says so. Extension of time and notice-before-default periods only as the form gives them; otherwise omit.",
  "Default: state the consequences of the Seller's default and of the Buyer's default exactly as the form selects, and any sum only as the form gives it. Do not add a penalty, forfeiture, interest or double refund the form does not give. Do not state that a stated sum is a genuine pre-estimate of loss.",
  "Stamp duty, registration and costs: state who bears them only as the form gives it. Do not state any amount or rate of stamp duty or registration fee, and do not state that the agreement is exempt from registration or has been sufficiently stamped. The state selected is used for the place and the stamp-duty checklist cue only.",
  "Cite Section 54 of the Transfer of Property Act, 1882 only, and only to say that the agreement is a contract for sale and does not itself create an interest in the property. Cite no other section and no judgment.",
  "State every other agreement, sale, mortgage, lease, litigation or notice concerning the property that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any other agreement, mortgage, lease, litigation or notice exists on the property]. Never write that there is no other agreement or litigation; where the form's field says none, the only permitted wording is that none is disclosed.",
  "Do not characterise either party. Do not add clauses, warranties or indemnities the BRIEF does not give. Dispute resolution and jurisdiction only as the form gives them.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| state | State of the property / execution | select | yes | place; stamp-duty checklist cue |
| place_of_execution / execution_date | Place and date of execution | text / date | yes | opening |
| seller_name / seller_parentage / seller_age / seller_address | Seller particulars (repeater for several sellers) | text / text / number / textarea | yes | parties |
| buyer_name / buyer_parentage / buyer_age / buyer_address | Buyer particulars (repeater) | text / text / number / textarea | yes | parties |
| property_address | Property address | textarea | yes | property |
| property_area_survey_numbers | Area, survey / plot / flat numbers | text | yes | property |
| property_boundaries | Boundaries | textarea | no | property |
| seller_title_statement | How the Seller holds the property (Seller's own statement) | textarea | no | recitals |
| total_consideration_figures / total_consideration_words | Sale consideration (figures / words) | text | yes | consideration |
| earnest_money_amount | Earnest money / advance (figures and words) | text | no | earnest money |
| earnest_money_date / earnest_money_mode | Date and mode of payment | date / text | no | earnest money |
| earnest_money_status | Earnest money is | select (Paid and received; Payable on the date given) | no | unlock of receipt wording |
| balance_payment_terms | Balance payment: date and mode | textarea | no | consideration |
| sale_deed_date_or_period | Sale deed to be executed on / within | text | yes | sale deed clause |
| time_is_essence | Time is of the essence | select (No; Yes) | no | unlock |
| possession_terms | Possession: when and how | textarea | yes | possession |
| possession_status | Possession at signing | select (Not delivered at signing; Delivered at signing) | no | unlock |
| title_documents_handed_over | Title documents handed over (type, date, original / copy) | textarea | yes | title documents clause |
| encumbrance_disclosure | Seller's disclosure of encumbrances (or 'none') | textarea | yes | disclosure |
| costs_allocation | Who bears stamp duty, registration and incidental costs | textarea | no | costs clause |
| default_terms | Consequences of default | textarea | no | default clause |
| other_proceedings | Other agreements, mortgages, leases, litigation on the property | textarea | no | disclosure |
| dispute_resolution_clause | Dispute resolution / jurisdiction clause, if wanted (as worded) | textarea | no | general clause |
| witness_1 / witness_2 | Witnesses (name, address) | text | no | execution |
| advocate_name / advocate_enrollment | Advocate details (if drafted by an advocate) | text | no | system block |

## _averments

```json
{
  "pack": "agreement_to_sell",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "clear_marketable_title", "kind": "averment", "what": "The Seller has a clear, valid and marketable title", "phrases": ["clear and marketable title", "absolute owner", "good and marketable title", "valid title", "lawful owner of the property"], "unlocked_by": null },
    { "id": "free_from_encumbrances", "kind": "averment", "what": "The property is free from encumbrances and litigation", "phrases": ["free from all encumbrances", "free from litigation", "free from all charges and liens", "no mortgage or charge", "no dispute"], "unlocked_by": { "key": "encumbrance_disclosure", "label": "Seller's disclosure of encumbrances", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "earnest_money_received", "kind": "averment", "what": "Earnest money has been paid and received", "phrases": ["the receipt of which the seller hereby acknowledges", "has received the earnest money", "has paid the earnest money"], "unlocked_by": { "key": "earnest_money_status", "label": "Earnest money is", "equals": ["paid and received"] } },
    { "id": "possession_delivered", "kind": "averment", "what": "Possession has been delivered at signing", "phrases": ["possession has been delivered", "has handed over vacant possession", "is in possession as licensee", "has put the buyer in possession"], "unlocked_by": { "key": "possession_status", "label": "Possession at signing", "equals": ["delivered at signing"] } },
    { "id": "time_is_essence", "kind": "averment", "what": "Time is of the essence", "phrases": ["time is of the essence", "time shall be the essence of this agreement"], "unlocked_by": { "key": "time_is_essence", "label": "Time is of the essence", "equals": ["yes"] } },
    { "id": "no_other_agreement", "kind": "averment", "what": "No other agreement, sale, mortgage or litigation on the property", "phrases": ["has not agreed to sell the property to anyone else", "has not entered into any other agreement", "has not created any third-party interest", "no litigation is pending"], "unlocked_by": { "key": "other_proceedings", "label": "Other agreements, mortgages, leases, litigation on the property", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "stamp_sufficient_or_exempt", "kind": "averment", "what": "The agreement is duly stamped or exempt from registration", "phrases": ["duly stamped", "sufficiently stamped", "exempt from registration", "does not require registration"], "unlocked_by": null }
  ],
  "allowed": [
    { "id": "free_from_encumbrances", "kind": "averment", "averment": "the Seller states that the property is free from encumbrances, as disclosed: {{encumbrance_disclosure}}", "requires": { "key": "encumbrance_disclosure", "label": "Seller's disclosure of encumbrances", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "earnest_money_received", "kind": "averment", "averment": "the Seller has received earnest money of {{earnest_money_amount}}", "requires": { "all_of": [ { "key": "earnest_money_status", "label": "Earnest money is", "equals": ["paid and received"] }, { "key": "earnest_money_amount", "label": "Earnest money", "present": true } ] } },
    { "id": "possession_delivered", "kind": "averment", "averment": "possession has been delivered to the Buyer at signing, as stated: {{possession_terms}}", "requires": { "key": "possession_status", "label": "Possession at signing", "equals": ["delivered at signing"] } },
    { "id": "time_is_essence", "kind": "averment", "averment": "time is of the essence for the execution of the sale deed", "requires": { "key": "time_is_essence", "label": "Time is of the essence", "equals": ["yes"] } },
    { "id": "no_other_agreement", "kind": "averment", "averment": "no other agreement, sale, mortgage, lease or litigation on the property is disclosed", "requires": { "key": "other_proceedings", "label": "Other agreements, mortgages, leases, litigation on the property", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } }
  ]
}
```

## Verify (not in signed text)

- Section 54 of the Transfer of Property Act, 1882: the definition of 'sale' and the sentence that a contract for sale does not itself create an interest are understood; the exact wording is not in signed text.
- Whether an agreement to sell must be registered, and in which states: state-specific and a point on which amendments differ. Registration Act, 1908 section 17 and any state amendment. Not cited.
- Stamp duty on an agreement to sell (amount, whether it varies with possession): per state stamp law. Not cited; cue only.
- Section 53A (part performance) and its link with possession. Not cited; nothing says the Buyer is in part performance.
- Whether the Specific Relief Act, 1963 should be mentioned for enforcement. Not cited.
- Any state-specific mandatory clause (for example agreements to sell under real estate or apartment-ownership law). Not cited.

## Notes for Ajay

1. **Risk (state).** The id is state-neutral. The only state-dependent output is the stamp-duty checklist cue and the place. The long-term plan (one id per state) will need its own cue and, where a state requires, its own mandatory clause.
2. **Risk (title).** The Seller's title is only ever a 'Seller states'. `clear_marketable_title` is banned with a null unlock. If you want the agreement to carry a Seller's warranty, it must come as a clause the form gives, not from the Drafter.
3. **Risk (figures).** The Drafter writes figures and words only as the form gives them; a mismatch between figures and words in the form is not detected. Consider a form-side check.
4. Anushka tier C: recommend one sample with `encumbrance_disclosure` empty (must give the blank) and one with it set to 'none'.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Property and conveyancing. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier C |
| Ruling | Approved. Title, encumbrance, possession and earnest money only from form fields, else a blank. Stamp duty and registration are state-dependent checklist cues; no amounts. One id per state is the long-term plan for batch 5. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
