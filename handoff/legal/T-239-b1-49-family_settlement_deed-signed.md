# T-239 b1 #49 family_settlement_deed (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `family_settlement_deed` |
| displayName | Family Settlement Deed |
| category (T-240) | Property and conveyancing |
| court_levels | `["transactional"]` |
| Ink | L = 2 |
| Anushka tier | C (deed) |
| averments file | `_averments/family_settlement_deed.json`, `inherits: null` |

## relevantActs

No statute is cited as authority for the settlement. Registration and stamp duty appear only as checklist cues to verify, without naming a section.

```json
[]
```

## causeTitle

```json
{
  "format": "FAMILY SETTLEMENT DEED\n\nThis Deed of Family Settlement is made at {place_of_execution} on {execution_date}\n\nBETWEEN\n{parties_list}\n(each a 'Party' and together the 'Parties')",
  "partyDesignations": [
    { "role": "applicant", "label": "First Party" },
    { "role": "respondent", "label": "Other Parties" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "parties_and_relationship", "name": "Parties and Relationship", "required": true, "description": "Each party's name, parentage, age, address and relationship to the others, as the form gives them. Blank where not given." },
  { "id": "family_background", "name": "Family Background", "required": true, "description": "The family tree and the persons the form names (for example the deceased owner and the heirs), as the form gives them. No relationship the form does not give." },
  { "id": "properties", "name": "Properties Covered", "required": true, "description": "Each property in a schedule: description, address, survey / plot numbers, as the form gives them, and how the parties say it is held. Lawie asserts no title; the parties' statements are attributed to them." },
  { "id": "reason_for_settlement", "name": "Reason for the Settlement", "required": true, "description": "The differences or doubts the parties wish to settle, only as the form gives them. Blank if not given." },
  { "id": "allocation", "name": "Allocation of Properties and Shares", "required": true, "description": "Which party takes which property or what share, exactly as the form gives it. No share, fraction or value the form does not give." },
  { "id": "payments_between_parties", "name": "Payments between Parties", "required": false, "description": "Any sum payable by one party to another to equalise shares, only as the form gives it." },
  { "id": "mutual_releases", "name": "Mutual Releases", "required": true, "description": "Each party's release, in terms the form selects, of claims in the properties allotted to the others, stated as an operative release from the date of the deed and for the future. Its scope is the properties in the schedule only." },
  { "id": "possession", "name": "Possession", "required": true, "description": "Possession of the allotted properties, only as the form gives it (already held, or to be delivered by a date). No statement of present possession the form does not give." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Undertakings for the future by each party (not to dispute the settlement, to sign documents needed to give effect to it, not to alienate before mutation if the form so states)." },
  { "id": "other_proceedings", "name": "Pending Proceedings and Other Dealings", "required": true, "description": "Every pending suit, proceeding, will, earlier settlement, mortgage or other dealing concerning the properties, as the form gives it; or the blank where the form is silent." },
  { "id": "minors_and_incapacitated", "name": "Minors and Persons under Disability", "required": false, "description": "If any party is a minor or acts through a guardian, the guardian and the capacity, as the form gives them; and the blank [To be confirmed: whether the permission of a court is required]." },
  { "id": "general", "name": "General", "required": true, "description": "Binding on heirs, costs, governing law, dispute resolution only as the form gives them. Omitted otherwise." },
  { "id": "execution_and_witnesses", "name": "Execution and Witnesses", "required": true, "description": "Signature blocks for each Party and two witnesses, with blanks. System part." }
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
  "Stamp duty as applicable to a family settlement in the state: check state rules (not computed by Lawie)",
  "Check whether registration is compulsory for the properties and terms of this settlement (verify), and the stamp duty for the state shown (not computed by Lawie)",
  "Documents of title for each property in the schedule (as the parties hold them): copies for the advocate's file",
  "Family tree / list of legal heirs, and death certificate of the deceased owner, if the settlement follows a death",
  "Revenue records / property tax receipts for each property",
  "Identity and address proof of each party (types only in the deed; no ID numbers)",
  "Will, earlier partition or earlier settlement, if any, concerning the properties",
  "Where a party is a minor or incapacitated: guardianship papers; whether court permission is needed: verify",
  "Where the properties are mortgaged or in litigation: the relevant papers",
  "Two witnesses with address",
  "Mutation / record-of-rights application after execution, as applicable: check state rules"
]
```

## promptInstructions

```json
[
  "Draft a deed recording a family settlement or arrangement among the family members the BRIEF names, dividing or allocating the properties the BRIEF lists and recording the parties' mutual releases. It is a record of what the parties have agreed, in their voice.",
  "Lawie asserts no title. State how each party holds or claims any property only as the BRIEF gives it, attributed to the party ('The First Party states that ...'). Do not state that any party is the owner, co-owner, coparcener or heir, or that a property is ancestral, joint family or self-acquired, unless the BRIEF says so; then state it as that party's statement.",
  "State party details, relationships, the family tree, each property's description, each party's share or allotted property, any equalisation payment and every date only as the BRIEF gives them. Where the BRIEF does not give one, write [To be confirmed: <what>]. Never compute a share, a fraction, a value or an equalisation sum.",
  "Mutual releases: write each release as an operative release by the party named, of that party's claims, as the BRIEF gives them, in the properties allotted to the others and in the schedule only; effective from the date of the deed. Do not write a general release of every claim of every kind, and do not release rights over properties not in the schedule, unless the BRIEF gives that scope.",
  "Do not state that the settlement is fair, equitable, bona fide, voluntary, free from coercion, undue influence or fraud, or made with full knowledge of rights, unless the form's voluntariness field says the parties so state; then write it as the parties' joint statement.",
  "Do not state the reason for the settlement unless the BRIEF gives it. Do not describe an existing dispute or its history beyond the BRIEF.",
  "Possession: state it only as the BRIEF gives it (already held, or to be delivered by a date). Do not state that any party is in possession unless the BRIEF says so.",
  "Undertakings are for the future, by the party named, for example to sign further documents, to join in mutation, not to dispute the settlement. Never write them as facts.",
  "State every pending suit, proceeding, will, earlier settlement, mortgage or other dealing concerning the properties that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any suit, proceeding, will, earlier settlement, mortgage or other dealing exists on the properties]. Never write that there is none; where the form's field says none, the only permitted wording is that the parties have disclosed none.",
  "Registration and stamp duty: do not state that the deed is registered, requires or does not require registration, or is duly stamped, and do not state any amount or rate of duty or fee. Where a party is a minor or incapacitated, state the guardian only as the BRIEF gives and add [To be confirmed: whether the permission of a court is required].",
  "Cite no statute and no judgment in the deed. Do not use the words 'Hindu Undivided Family' or any personal-law term unless the BRIEF does.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| place_of_execution / execution_date | Place and date of execution | text / date | yes | opening |
| state | State where the properties lie | select | yes | stamp / registration cues |
| parties | Parties (repeater: name, parentage, age, address, relationship) | list | yes | parties |
| family_background | Family background / family tree | textarea | yes | background clause |
| properties | Properties (repeater: description, address, survey / plot, how held as the parties state) | list | yes | schedule |
| nature_of_property_statement | The parties' own statement of the nature of the properties (for example ancestral or self-acquired), if they make one | textarea | no | unlock |
| reason_for_settlement | What the parties wish to settle | textarea | no | reason clause |
| allocation | Allocation: party, property or share | textarea | yes | allocation clause |
| equalisation_payments | Payments between parties (who pays whom, amount as figure, date) | textarea | no | payments clause |
| release_scope | Scope of each party's release | textarea | no | release clause |
| possession_terms | Possession of allotted properties | textarea | no | possession clause |
| voluntariness_statement | The parties state the settlement is voluntary | select (Not stated; Parties so state) | no | unlock |
| party_under_disability | A party is a minor or under guardianship | select (No; Yes) | no | minors clause |
| guardian_details | Guardian and capacity | textarea | no | minors clause |
| other_proceedings | Pending suits, wills, earlier settlements, mortgages on the properties | textarea | no | disclosure |
| dispute_resolution_clause | Dispute resolution clause, if wanted (as worded) | textarea | no | general clause |
| witness_1 / witness_2 | Witnesses (name, address) | text | no | execution |
| advocate_name / advocate_enrolment | Advocate details (if drafted by an advocate) | text | no | system block |

## _averments

```json
{
  "pack": "family_settlement_deed",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "sole_owner_or_title", "kind": "averment", "what": "A party is the owner or has a clear title to a property", "phrases": ["absolute owner", "lawful owner", "clear and marketable title", "sole owner of the property", "is seized and possessed of"], "unlocked_by": null },
    { "id": "property_nature", "kind": "averment", "what": "A property is ancestral, joint family or self-acquired", "phrases": ["ancestral property", "joint family property", "self-acquired property", "coparcenary property", "HUF property"], "unlocked_by": { "key": "nature_of_property_statement", "label": "The parties' statement of the nature of the properties", "present": true } },
    { "id": "settlement_fair_voluntary", "kind": "averment", "what": "The settlement is fair, equitable and voluntary", "phrases": ["fair and equitable", "bona fide settlement", "free from coercion", "without any undue influence", "of their own free will", "with full knowledge of their rights"], "unlocked_by": { "key": "voluntariness_statement", "label": "The parties state the settlement is voluntary", "equals": ["parties so state"] } },
    { "id": "no_other_dealings", "kind": "averment", "what": "No other suit, will, settlement or dealing on the properties", "phrases": ["no litigation is pending on the properties", "no will has been executed", "no earlier settlement exists", "the properties are free from encumbrances", "no mortgage or charge"], "unlocked_by": { "key": "other_proceedings", "label": "Pending suits, wills, earlier settlements, mortgages on the properties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "full_and_final_all_claims", "kind": "averment", "what": "A release of all claims of every kind", "phrases": ["all claims of every kind are released", "full and final settlement of all disputes", "no party shall have any claim whatsoever"], "unlocked_by": { "key": "release_scope", "label": "Scope of each party's release", "present": true } }
  ],
  "allowed": [
    { "id": "property_nature", "kind": "averment", "averment": "the parties state about the nature of the properties as follows: {{nature_of_property_statement}}", "requires": { "key": "nature_of_property_statement", "label": "The parties' statement of the nature of the properties", "present": true } },
    { "id": "settlement_fair_voluntary", "kind": "averment", "averment": "the parties jointly state that this settlement is made voluntarily", "requires": { "key": "voluntariness_statement", "label": "The parties state the settlement is voluntary", "equals": ["parties so state"] } },
    { "id": "no_other_dealings", "kind": "averment", "averment": "the parties have disclosed no suit, will, earlier settlement, mortgage or other dealing on the properties", "requires": { "key": "other_proceedings", "label": "Pending suits, wills, earlier settlements, mortgages on the properties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"] } },
    { "id": "full_and_final_all_claims", "kind": "averment", "averment": "each party releases the claims described as follows: {{release_scope}}", "requires": { "key": "release_scope", "label": "Scope of each party's release", "present": true } }
  ]
}
```

## Verify (not in signed text)

- Registration Act, 1908, section 17 (moved here from the checklist): applicability of compulsory registration to a family settlement, to a memorandum of an earlier oral settlement, and to the properties here; state-specific amendments. Cue only.
- Stamp duty on a family settlement (amount, any concession for family members): per state stamp law. Cue only.
- Whether a family settlement needs a recital of a pre-existing dispute or doubtful right to be binding. Not stated; the reason clause is blank unless the form gives it.
- Court permission for a minor's share: Guardians and Wards Act, 1890 / Hindu Minority and Guardianship Act, 1956. Not cited; blank only.
- Whether a settlement among Muslim, Christian or Parsi family members needs different drafting. Not addressed.

## Notes for Ajay

1. **Risk (title).** Properties are described only as the parties state. `property_nature` is unlocked only by the dedicated `nature_of_property_statement` field, and the allowed text attributes the statement to the parties.
2. **Risk (releases).** A general release is the common over-drafting. The scope clause is limited to the schedule and to what the form gives.
3. **Risk.** Because a family settlement can be oral and later recorded, the deed does not say so; add a memorandum variant later if wanted.
4. Tier C; recommend one Anushka sample with `allocation` empty.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Property and conveyancing. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier C |
| Ruling | Approved, with the registration/stamp cue amended in this file: "Check whether registration is compulsory for the properties and terms of this settlement (verify), and the stamp duty for the state shown (not computed by Lawie)". No statute cited as authority; Registration Act s.17 stays in Verify. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
