# T-239 b1 #33 evidence_affidavit_o18_r4 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2.

| Field | Value |
|---|---|
| id | `evidence_affidavit_o18_r4` |
| displayName | Affidavit of Evidence in Chief (CPC Order XVIII Rule 4) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_court", "district_court"]` |
| Ink | L = 2 |
| Anushka tier | B (affidavit; raised from C by Ajay's ruling because it becomes the witness's evidence) |
| averments file | `_averments/evidence_affidavit_o18_r4.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {"number": "Order XVIII Rule 4", "description": "Examination-in-chief of a witness on affidavit"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{party_one} ... {party_one_label}\nVERSUS\n{party_two} ... {party_two_label}",
  "partyDesignations": [
    {"role": "party_one", "label": "{party_one_label}"},
    {"role": "party_two", "label": "{party_two_label}"}
  ],
  "caseNomenclature": "{suit_number}\nAFFIDAVIT OF EVIDENCE IN CHIEF OF {deponent_name} ({witness_designation}) UNDER ORDER XVIII RULE 4 OF THE CODE OF CIVIL PROCEDURE, 1908"
}
```

## mandatoryClauses

```json
[
  {"id": "deponent_particulars", "name": "Deponent Particulars", "required": true, "description": "Name, parentage, age, address and occupation of the witness, as the brief gives them."},
  {"id": "deponent_role", "name": "Role of the Witness", "required": true, "description": "Whether the witness is a party, an authorised representative or another witness, and the witness designation, only as the brief gives them; else the blank."},
  {"id": "basis_of_knowledge", "name": "Basis of Knowledge", "required": true, "description": "For the facts stated, whether from personal knowledge, information or records, only as the brief gives it for each; else the blank."},
  {"id": "facts_stated", "name": "Facts Stated by the Witness", "required": true, "description": "The numbered facts the witness states, one numbered paragraph per fact, in the order and in the first person as the brief gives them. None added, merged or strengthened."},
  {"id": "documents_referred", "name": "Documents Referred To", "required": true, "description": "Each document the witness speaks to, with its description and date as the brief gives them. Exhibit marks are the court's; never assigned."},
  {"id": "earlier_proceedings", "name": "Other Proceedings on the Same Matter", "required": true, "description": "Every other proceeding on the same matter that the brief mentions, with court, number and stage; or the blank where the brief is silent."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

Value: `""` (empty string). An affidavit carries no prayer.

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the Deponent above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above affidavit are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

Deponent
```

## filingChecklist

```json
[
  "Affidavit of evidence in chief (original + copy for each opposite party, as the court requires)",
  "Original documents the witness will speak to, and copies, if the court so directs",
  "List of documents referred to in the affidavit",
  "Authority of the witness to depose (power of attorney / board resolution), if the witness is not a party",
  "To be sworn or affirmed before the authority the court's rules require: check (verify)",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft the affidavit of a witness to be filed as that witness's examination-in-chief in a pending civil proceeding, under Order XVIII Rule 4 of the Code of Civil Procedure, 1908. It is the witness's own sworn statement in the first person. It is not a pleading, not an affidavit in support of an application, and not an argument.",
  "Write the facts only as the BRIEF gives them as facts the witness states, one numbered paragraph for each, in the order given, in the first person ('I state that ...'). Do not add, merge, reorder, summarise or strengthen a fact. Do not add a cause, a motive, a date or a document the BRIEF does not give.",
  "State the basis of the witness's knowledge for a fact (personal knowledge, information, records) only where the BRIEF gives it for that fact. Where it does not, write [To be confirmed: the source of the witness's knowledge of this fact]. Never write that all the facts are within the witness's personal knowledge unless the BRIEF says so.",
  "Refer to a document only as the BRIEF lists it, by its description and date. Do not state that a document is original, genuine or a true copy, and do not mark exhibits: write [To be confirmed: exhibit mark, to be assigned by the court].",
  "Do not include legal argument, a legal conclusion, a submission or an opinion in the affidavit. Do not say who is liable or entitled to relief. Do not cite the Indian Evidence Act or the Bharatiya Sakshya Adhiniyam.",
  "State every other proceeding on the same matter that the BRIEF mentions, with court, number and stage. Where the BRIEF mentions none, write [To be confirmed: whether any other proceeding on the same matter is pending or has been decided, and where]. Never write that none is pending.",
  "State the witness's role (a party, an authorised representative of a party, or another witness) and the witness designation only as the BRIEF gives them; otherwise [To be confirmed: the capacity in which the witness deposes].",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| suit_number | Suit / proceeding type and number | text | yes | nomenclature |
| party_one_name / party_one_label | First party and label (Plaintiff / Petitioner / Applicant / Appellant) | text / select | yes | cause title |
| party_two_name / party_two_label | Second party and label (Defendant / Respondent) | text / select | yes | cause title |
| deponent_name / deponent_parentage / deponent_age / deponent_address | Witness particulars | text / text / number / textarea | yes | verification, particulars |
| deponent_occupation | Occupation | text | no | particulars |
| deponent_role | Witness is | select (A party to the proceeding; Authorised representative of a party; Other witness) | yes | role clause |
| witness_designation | Witness designation as marked by the court, if any (e.g. PW-1, DW-1) | text | no | nomenclature |
| authority_document | Authority to depose (document and date), if not a party | text | no | averment unlock |
| knowledge_basis | Knowledge of the facts | select (Personal knowledge of the facts stated; Partly from information or records; Not stated) | yes | averment unlock |
| facts_stated | Facts the witness states (one row per fact: statement; basis: personal knowledge / information / records) | list of rows | yes | numbered paragraphs, never invented |
| documents_referred | Documents referred to (one row per document: description; date) | list of rows | no | documents clause |
| earlier_proceedings | Other proceedings on the same matter (court, number, stage) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "evidence_affidavit_o18_r4",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "personal_knowledge_of_facts", "kind": "averment", "what": "The witness has personal knowledge of the facts stated", "phrases": ["i have personal knowledge", "within my personal knowledge", "i am well acquainted with the facts", "meri zaati jankari mein"], "unlocked_by": {"key": "knowledge_basis", "label": "Knowledge of the facts", "equals": ["personal knowledge of the facts stated"]}},
    {"id": "witness_authorised", "kind": "averment", "what": "The witness is authorised to depose for a party", "phrases": ["i am duly authorised to depose", "i am competent to depose", "i am authorised by the company", "mujhe adhikar prapt hai"], "unlocked_by": {"key": "authority_document", "label": "Authority to depose (document and date), if not a party", "present": true}},
    {"id": "documents_true_copies", "kind": "averment", "what": "A document is original, genuine or a true copy", "phrases": ["is a true copy of the original", "is the original", "is a genuine document", "is a true and correct copy"], "unlocked_by": null},
    {"id": "legal_conclusion_in_affidavit", "kind": "submission", "what": "A legal conclusion or entitlement to relief", "phrases": ["the defendant is liable", "the plaintiff is entitled to a decree", "the suit deserves to be decreed", "the claim is barred"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "personal_knowledge_of_facts", "kind": "averment", "averment": "the facts stated in this affidavit are within my personal knowledge", "requires": {"key": "knowledge_basis", "label": "Knowledge of the facts", "equals": ["personal knowledge of the facts stated"]}},
    {"id": "witness_authorised", "kind": "averment", "averment": "I state that I am authorised to depose on behalf of the party under {{authority_document}}", "requires": {"key": "authority_document", "label": "Authority to depose (document and date), if not a party", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- Whether Order XVIII Rule 4 has a sub-rule that fixes what the affidavit must contain or how its documents are proved (understood to exist; not cited, no sub-rule cited).
- The provision of the CPC on the contents of an affidavit (facts within the deponent's knowledge; information and belief to be stated separately) and its Order number. Not cited.
- Whether the court's own rules require the witness affidavit to be filed at a stated stage. Not stated.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. The form takes the facts as rows the deponent states. The Drafter never composes a fact. A witness whose rows are empty gets the blank, not a story.
2. Risk. The verification for an affidavit is the system part in the #12 pattern, closing with "Deponent" (Ajay's ruling). If you want a notary jurat instead, say so; I have not drafted one.
3. No IEA/BSA citation, as asked. Proof and admissibility of the documents is for the court; the pack only lists the documents.
4. Tier B by Ajay's ruling (it is the witness's evidence).


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Tier B. Affidavit closes "Deponent". Facts only as the deponent states them; no IEA/BSA citation. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
