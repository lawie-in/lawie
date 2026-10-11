# T-239 b1 #50 affidavit_name_change (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `affidavit_name_change` |
| displayName | Affidavit for Change / Correction of Name |
| category (T-240) | Affidavit and court forms |
| court_levels | `["transactional"]` |
| Ink | S = 1 |
| Anushka tier | C (affidavit) |
| averments file | `_averments/affidavit_name_change.json`, `inherits: null` |

## relevantActs

```json
[]
```

## causeTitle

```json
{
  "format": "AFFIDAVIT\n(For change / correction of name)\n\nI, {new_name}, {parentage_clause}, aged about {age} years, resident of {address}, do hereby solemnly affirm and state on oath as under:",
  "partyDesignations": [
    { "role": "applicant", "label": "Deponent" }
  ],
  "caseNomenclature": "N/A"
}
```

## mandatoryClauses

```json
[
  { "id": "identity", "name": "Identity", "required": true, "description": "Name, parentage, age and address of the person making the affidavit, as the form gives them." },
  { "id": "old_and_new_name", "name": "Old and New Name", "required": true, "description": "The old name (or the incorrect name) and the new name (or the correct name), exactly as the form gives them, and which of the two is the case: change or correction." },
  { "id": "reason", "name": "Reason for the Change or Correction", "required": true, "description": "The reason only as the form gives it. Blank where not given." },
  { "id": "documents_referred", "name": "Documents Referred To", "required": true, "description": "The documents in which the old name or the new name appears, listed by type only (for example school certificate, passport, bank account, Aadhaar), as the form selects. No number of any identity document." },
  { "id": "same_person", "name": "One and the Same Person", "required": true, "description": "That the old name and the new name are the names of the same person, the deponent, but only where the form's confirmation says so." },
  { "id": "future_use", "name": "Use of the New Name", "required": true, "description": "A statement for the future that the deponent will use the new name henceforth in all dealings, and will inform the authorities and institutions concerned, only as the form selects." },
  { "id": "earlier_affidavits", "name": "Earlier Affidavits, Applications and Proceedings", "required": true, "description": "Every earlier affidavit, application, publication or proceeding on this change of name, as the form gives it; or the blank where the form is silent." },
  { "id": "purpose", "name": "Purpose of the Affidavit", "required": true, "description": "That the affidavit is made to be produced before the authority, institution or office the form names; the blank where not given." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
""
```

## verificationTemplate

```
VERIFICATION

I, {new_name}, the Deponent above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of this affidavit are true and correct to my personal knowledge, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Deponent
```

## filingChecklist

```json
[
  "Stamp paper / non-judicial stamp for an affidavit as applicable: check state rules (not computed by Lawie)",
  "Affidavit to be sworn before a Notary Public / Oath Commissioner / Magistrate as applicable, with the deponent present and the identity checked by the officer",
  "Newspaper publication of the change of name (one in English and one in the local language, as the authority requires): verify the requirement of the receiving authority",
  "Gazette notification of the change of name: apply to the Department of Publication / state Gazette office, as applicable (steps and fee: check the official website; not computed by Lawie)",
  "Documents showing the old name (school or college certificate, passport, PAN, bank account, voter ID, Aadhaar, etc.): copies only; no ID number goes into the draft",
  "Proof of address and recent photographs, as the receiving authority requires",
  "Marriage certificate, divorce decree, adoption deed or court order, if the change follows such an event",
  "Where the deponent is a minor: affidavit by the parents / guardians instead, and the parents' consent: verify",
  "After the notification: update records at the passport office, bank, PAN, Aadhaar, school / university, employer, as applicable"
]
```

## promptInstructions

```json
[
  "Draft an affidavit sworn by one person (the deponent) stating that the deponent has changed, or wishes to correct, the deponent's name from the old name to the new name, for production before the authority or institution the form names. Number the paragraphs.",
  "State the old name, the new name, parentage, age and address only as the BRIEF gives them, exactly as written. Do not alter a spelling, add a middle name, or expand an initial. Where the BRIEF does not give one, write [To be confirmed: <what>].",
  "Change or correction: state which, as the form selects. Where the form gives a reason (marriage, divorce, adoption, religious conversion, personal preference, clerical error in a document, or other), state it as the BRIEF gives it. Where it does not, write [To be confirmed: reason for the change or correction of name]. Do not infer a reason, and do not add that the change is for a lawful purpose, is not to defraud or evade any person or liability, or is bona fide, unless the BRIEF gives it.",
  "Documents: list by type only the documents the BRIEF selects as bearing the old name or the new name. Never write a number, a serial, an account number, a certificate number or any identity-document number, even if the BRIEF contains one; if it does, leave the number out.",
  "'One and the same person': write that the old name and the new name are the names of the deponent only if the form's confirmation says so. Otherwise write [To be confirmed: statement that the old name and the new name are of the same person].",
  "Do not state that the name has been changed in the Gazette or by publication, or that any authority has accepted the change, unless the form gives the status and the date. The gazette and newspaper steps are checklist cues, not statements of fact in the affidavit.",
  "The use of the new name in future is an undertaking for the future by the deponent ('I shall use the new name hereafter ...'), only if the form selects it. Never a statement of present fact.",
  "State every earlier affidavit, application, publication or proceeding on this change that the BRIEF mentions. Where the BRIEF mentions none, write [To be confirmed: whether any earlier affidavit, application or publication exists on this change of name]. Never write that no other affidavit or proceeding exists.",
  "Write only facts within the deponent's own knowledge. Do not cite any statute or judgment. Do not state that the change is valid or effective in law.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| change_or_correction | This affidavit is for | select (Change of name; Correction of name) | yes | wording |
| old_name | Old name (or the incorrect name), exactly as in the records | text | yes | old and new name |
| new_name | New name (or the correct name) | text | yes | old and new name |
| deponent_parentage / deponent_age / deponent_address | Deponent particulars | text / number / textarea | yes | identity |
| reason_for_change | Reason | select (Marriage; Divorce; Adoption; Conversion; Personal preference; Clerical error in a document; Other) | no | reason |
| reason_details | Reason details | textarea | no | reason |
| documents_with_old_name | Documents bearing the old name (types only) | multi-select | yes | documents clause |
| documents_with_new_name | Documents bearing the new name (types only) | multi-select | no | documents clause |
| same_person_confirmation | The deponent confirms both names are of the deponent | select (Not confirmed; Confirmed) | yes | unlock |
| publication_status | Newspaper / Gazette publication | select (Not yet done; Done — give details and date below) | no | unlock |
| publication_details | Publication details and date | textarea | no | unlock |
| undertake_future_use | Deponent undertakes to use the new name and inform authorities | select (No; Yes) | no | undertaking |
| authority_to_produce | Authority / institution to which the affidavit will be produced | text | no | purpose |
| place | Place of swearing | text | yes | verification |
| earlier_proceedings | Earlier affidavits, applications and publications on this change | textarea | no | disclosure |

## _averments

```json
{
  "pack": "affidavit_name_change",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "same_person", "kind": "averment", "what": "The old and new names are of the same person", "phrases": ["are one and the same person", "is the same person", "both names refer to me", "ek hi vyakti hain"], "unlocked_by": { "key": "same_person_confirmation", "label": "The deponent confirms both names are of the deponent", "equals": ["confirmed"] } },
    { "id": "name_change_published", "kind": "averment", "what": "The change has been published in the newspaper or the Gazette", "phrases": ["has been published in the Gazette", "has been notified in the Gazette", "has been published in the newspaper", "publication has been made"], "unlocked_by": { "key": "publication_status", "label": "Newspaper / Gazette publication", "equals": ["done"] } },
    { "id": "bona_fide_and_lawful", "kind": "averment", "what": "The change is bona fide, lawful, and not to defraud or evade liability", "phrases": ["bona fide", "not to defraud anyone", "not to evade any liability", "for a lawful purpose", "no criminal case is pending against me"], "unlocked_by": null },
    { "id": "change_valid_in_law", "kind": "submission", "what": "The change is valid or effective in law", "phrases": ["the change is legally valid", "stands legally changed", "has been legally changed", "is legally effective"], "unlocked_by": null }
  ],
  "allowed": [
    { "id": "same_person", "kind": "averment", "averment": "{{old_name}} and {{new_name}} are the names of one and the same person, namely me", "requires": { "key": "same_person_confirmation", "label": "The deponent confirms both names are of the deponent", "equals": ["confirmed"] } },
    { "id": "name_change_published", "kind": "averment", "averment": "the publication of the change of name has been made as follows: {{publication_details}}", "requires": { "all_of": [ { "key": "publication_status", "label": "Newspaper / Gazette publication", "equals": ["done"] }, { "key": "publication_details", "label": "Publication details and date", "present": true } ] } }
  ]
}
```

## Verify (not in signed text)

- Whether any statute governs an individual's change of name by affidavit and gazette notification. Not cited; the steps appear only as checklist cues.
- Gazette procedure, applicable forms, who may apply and whether a newspaper publication is mandatory: authority-specific. Not stated.
- The receiving authority's own format (for example the passport office or the education board). Not covered; the affidavit may need to follow it.
- Minor's change of name: who swears and whether both parents must consent. Cue only.
- Whether the affidavit should cite the Oaths Act, 1969 / Notaries Act, 1952. Not cited.

## Notes for Ajay

1. The affidavit and its verification use 'Deponent' throughout and in the closing; there is no capacity field.
2. **Risk (ID numbers).** The Drafter is told never to print an identity-document number even if the brief has one. The form field takes document types only, so the brief should not carry numbers.
3. The 'not to defraud / lawful purpose' averment is common boilerplate and is banned with a null unlock. If you want it, it should come as an deponent statement from a form field.
4. Tier C.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Affidavits and court forms. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier C |
| Ruling | Approved. The closing word is "Deponent" (affidavit); the verification reads "true and correct to my personal knowledge", as for an affidavit confined to the deponent's own knowledge. Identity documents by type only, no numbers. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
