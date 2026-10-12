# T-239 b1 #53 contempt_petition_civil (signed)

Status: PROPOSED. Not signed. Nothing here is in the repo.

| Field | Value |
|---|---|
| id | `contempt_petition_civil` |
| displayName | Petition for Civil Contempt (Contempt of Courts Act, 1971) |
| category (T-240) | Civil: appeals, revision, review, execution |
| court_levels | `["high_court", "supreme_court"]` (T-240 settles one list; the lead maps these) |
| Ink | L = 2 |
| Anushka tier | A (limitation at stake; a person's liberty and reputation are at stake on the other side) |
| averments file | `_averments/contempt_petition_civil.json`, `inherits: null` |

## relevantActs

Section 2(b) and Section 12 only. Article 215 and Article 129 and the High Court's own rules are not cited (see Verify).

```json
[
  {
    "act": "Contempt of Courts Act, 1971",
    "sections": [
      { "number": "2(b)", "description": "Definition of 'civil contempt': wilful disobedience to a judgment, decree, direction, order, writ or other process of a court, or wilful breach of an undertaking given to a court" },
      { "number": "12", "description": "Punishment for contempt of court" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{petitioner} ... Petitioner\nVERSUS\n{contemnor_name_and_description} ... Alleged Contemnor",
  "partyDesignations": [
    { "role": "applicant", "label": "Petitioner" },
    { "role": "respondent", "label": "Alleged Contemnor" }
  ],
  "caseNomenclature": "CONTEMPT PETITION (CIVIL) No. _____ of [YEAR]\n(In {order_case_ref}, order dated {order_date})\nPETITION UNDER THE CONTEMPT OF COURTS ACT, 1971 FOR ALLEGED DISOBEDIENCE OF THE ORDER DATED {order_date}"
}
```

## mandatoryClauses

```json
[
  { "id": "petitioner_and_contemnor", "name": "Parties", "required": true, "description": "The petitioner and the alleged contemnor, the latter named and described only as the form gives (name, designation, capacity). No description or label not in the form." },
  { "id": "order_disobeyed", "name": "The Order Disobeyed", "required": true, "description": "The court, the case reference, the date of the order, and the operative directions quoted exactly as the brief gives them, in quotation marks, in full. Never paraphrased, shortened or completed. If not given, the blank." },
  { "id": "order_status", "name": "Status of the Order", "required": true, "description": "Whether the order has been stayed, modified, challenged or complied with in part, as the brief gives it; the blank where silent. Never that the order is in force or is final unless the brief says so." },
  { "id": "knowledge_of_order", "name": "Knowledge of the Order", "required": true, "description": "How and on what date the alleged contemnor came to know of the order (service, communication, presence in court), only as the brief gives it; the blank otherwise." },
  { "id": "acts_of_disobedience", "name": "Acts of Disobedience", "required": true, "description": "What the order required, what has been done or not done, and on which dates, as the brief gives it, fact by fact, in neutral words. Only facts; no characterisation of the person." },
  { "id": "representations_made", "name": "Demands and Representations", "required": false, "description": "Letters, notices, requests made to the alleged contemnor to comply, with dates and replies if any, as the brief gives them." },
  { "id": "wilfulness", "name": "Wilfulness", "required": false, "description": "Only where the form gives facts of wilfulness: those facts, followed by a submission. Otherwise omitted." },
  { "id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis on which the petitioner says this court may entertain the petition, as the advocate states it in the form: 'It is stated that ...'. Never asserted by Lawie." },
  { "id": "dates_limitation_block", "name": "Dates", "required": true, "description": "The dates the form gives: of the order, of the alleged disobedience, of knowledge, of any copy obtained, of filing. Not computed." },
  { "id": "earlier_proceedings", "name": "Earlier Proceedings", "required": true, "description": "Every earlier contempt petition, execution proceeding, appeal, review, application for stay or other proceeding on the same order or subject, with court, number, date and result; or the blank where the brief is silent." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Issue notice to the alleged contemnor, {contemnor_name}, to show cause why proceedings for contempt should not be taken against the alleged contemnor under the Contempt of Courts Act, 1971 in respect of the order dated {order_date} passed in {order_case_ref};
b) Proceed against the alleged contemnor in accordance with law for the alleged disobedience of the said order;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the petitioner shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {petitioner}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above petition are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Petition (original + copies for each alleged contemnor and as the Registry requires)",
  "Affidavit of the petitioner in support, if the High Court rules require one: verify under the High Court rules",
  "Certified copy of the order alleged to be disobeyed",
  "Proof that the order was communicated to the alleged contemnor (service report, acknowledgement, minutes of the hearing), if relied on",
  "Copies of the demands, notices or letters asking for compliance, with proof of despatch",
  "Evidence of the non-compliance, as the petitioner relies on it",
  "Copies of any orders staying, modifying or extending time for the order, if any",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Check the time bar for initiating contempt proceedings under the Contempt of Courts Act, 1971: verify",
  "Check the High Court's rules on contempt petitions (form, affidavit, procedure): verify",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a petition alleging civil contempt, that is, wilful disobedience of a judgment, decree, direction or order of a court, as the BRIEF gives it. It is not an execution application, a review, an appeal, or a petition for criminal contempt.",
  "Quote the operative directions of the order exactly as the BRIEF gives them, word for word, in quotation marks, with the court, case reference and date. Do not paraphrase, summarise, correct or complete them. If not given, write [To be confirmed: operative directions of the order, quoted exactly as in the order].",
  "Name the alleged contemnor only as the form gives (name, designation, capacity). Do not name any other person. Never characterise the alleged contemnor: no 'arrogant', 'high-handed', 'habitual', 'brazen', 'contumacious', 'defiant', 'scant regard' or any similar word. State only what the order required and what was or was not done, in neutral words, with dates.",
  "Wilful: write that the disobedience is wilful, or use any similar word, only as follows. Where the form gives facts of wilfulness, set out those facts first, then add a submission ('It is submitted that, on these facts, the non-compliance is wilful'). Where it does not, write [To be confirmed: facts showing that the non-compliance is wilful]. Do not assert wilfulness in any other way, and do not infer it from the mere fact of non-compliance.",
  "Knowledge of the order: state how and when the alleged contemnor came to know of the order only as the BRIEF gives it. Otherwise write [To be confirmed: how and on what date the alleged contemnor came to know of the order].",
  "Status of the order: state whether the order has been stayed, modified, appealed or complied with in part only as the BRIEF gives it. Otherwise write [To be confirmed: whether the order has been stayed, modified or challenged]. Do not state that the order is final, binding or in force unless the BRIEF says so.",
  "Cite the Contempt of Courts Act, 1971, Section 2(b) (civil contempt) and Section 12 (punishment) only, and only for those propositions. Cite no other provision of that Act, no Article of the Constitution and no High Court rule. Do not state the punishment or its limit.",
  "Jurisdiction: Lawie does not assert that the court has jurisdiction. Where the form gives the basis, write 'It is stated that this Hon'ble Court may entertain this petition because ...' in the advocate's words. Otherwise write [To be confirmed: basis on which this Court may entertain the petition].",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Here 'the order, decree or event' includes the date of the alleged disobedience; give it as the BRIEF gives it. Do not state the time bar for contempt proceedings and do not say when the contempt began or that it is continuing.",
  "State every earlier contempt petition, execution proceeding, appeal, review, application for stay or other proceeding on the same order or subject that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier contempt petition, execution, appeal, review or stay application exists on this order]. Never write that no other proceeding is pending or that this is the first petition.",
  "Demands: state any letter, notice or request for compliance only as the BRIEF gives it, with its date and any reply. Do not write that the alleged contemnor ignored, refused or evaded unless the BRIEF says so.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| petitioner_name / petitioner_address | Petitioner | text / textarea | yes | cause title |
| contemnor_name | Alleged contemnor (name) | text | yes | cause title, prayer |
| contemnor_description | Designation / capacity of the alleged contemnor | text | yes | cause title |
| court_designation / court_place | Court | text | yes | cause title |
| order_case_ref | Case reference of the order | text | yes | nomenclature, prayer |
| order_date | Date of the order | date | yes | nomenclature, prayer, limitation block |
| order_court | Court that passed the order | text | yes | order clause |
| order_operative_text | Operative directions (as worded in the order) | textarea | yes | quoted verbatim |
| order_status | Status of the order | select (In operation, not stayed; Stayed in part; Under challenge; Not stated) | yes | status clause, unlock |
| knowledge_of_order | How and when the alleged contemnor came to know of the order | textarea | no | knowledge clause |
| acts_of_disobedience | What was not done or done contrary to the order, with dates | textarea | yes | acts clause |
| date_of_disobedience | Date of the alleged disobedience | date | no | limitation block key |
| demands_made | Demands for compliance (dates, mode, replies) | textarea | no | representations clause |
| wilfulness_facts | Facts the petitioner relies on to show wilfulness | textarea | no | unlock |
| jurisdiction_basis | Basis on which the petitioner says this court may entertain the petition | textarea | no | unlock |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation block key |
| certified_copy_received_date | Date the certified copy was received | date | no | limitation block key |
| filing_date | Date of filing | date | no | limitation block key |
| filing_is_late | The filing is late | select (No; Yes) | no | condonation blank |
| delay_reason | Reason for delay, if late | textarea | no | condonation, if given |
| earlier_proceedings | Earlier contempt petitions, execution, appeals, stay applications on the order | textarea | no | disclosure |
| verifierCapacity | Capacity in the verification | select (Petitioner) | yes | verification |
| place | Place | text | yes | verification |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "contempt_petition_civil",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    { "id": "within_limitation", "kind": "submission", "what": "The petition is within the time allowed", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "the contempt is continuing", "miyaad ke andar hai"], "unlocked_by": null },
    { "id": "wilful_disobedience", "kind": "averment", "what": "The disobedience is wilful", "phrases": ["wilfully disobeyed", "deliberate and wilful", "intentionally flouted", "wilful and deliberate", "deliberately disobeyed"], "unlocked_by": { "key": "wilfulness_facts", "label": "Facts showing wilfulness", "present": true } },
    { "id": "contemnor_characterised", "kind": "averment", "what": "The alleged contemnor is arrogant, defiant or of a bad character", "phrases": ["arrogant", "high-handed", "brazen", "contumacious", "habitual violator", "scant regard for the order", "defiant", "flouting with impunity"], "unlocked_by": null },
    { "id": "knowledge_of_order", "kind": "averment", "what": "The alleged contemnor had knowledge of the order", "phrases": ["had full knowledge of the order", "was fully aware of the order", "the order was duly served", "has knowledge of the order"], "unlocked_by": { "key": "knowledge_of_order", "label": "How and when the alleged contemnor came to know of the order", "present": true } },
    { "id": "order_in_force", "kind": "averment", "what": "The order is in force and has not been stayed or set aside", "phrases": ["the order is in force", "the order has attained finality", "the order has not been stayed", "the order has not been set aside"], "unlocked_by": { "key": "order_status", "label": "Status of the order", "equals": ["in operation, not stayed"] } },
    { "id": "court_has_jurisdiction", "kind": "averment", "what": "This court has jurisdiction", "phrases": ["this Hon'ble Court has jurisdiction", "this court has territorial jurisdiction", "the petition is maintainable"], "unlocked_by": { "key": "jurisdiction_basis", "label": "Basis of jurisdiction", "present": true } }
  ],
  "allowed": [
    { "id": "wilful_disobedience", "kind": "submission", "averment": "it is submitted that, on the facts stated, the non-compliance is wilful, the petitioner relying on the following: {{wilfulness_facts}}", "requires": { "key": "wilfulness_facts", "label": "Facts showing wilfulness", "present": true } },
    { "id": "knowledge_of_order", "kind": "averment", "averment": "the petitioner states that the alleged contemnor came to know of the order as follows: {{knowledge_of_order}}", "requires": { "key": "knowledge_of_order", "label": "How and when the alleged contemnor came to know of the order", "present": true } },
    { "id": "order_in_force", "kind": "averment", "averment": "the order has not been stayed, as the petitioner states", "requires": { "key": "order_status", "label": "Status of the order", "equals": ["in operation, not stayed"] } },
    { "id": "court_has_jurisdiction", "kind": "averment", "averment": "it is stated that this Hon'ble Court may entertain this petition because {{jurisdiction_basis}}", "requires": { "key": "jurisdiction_basis", "label": "Basis of jurisdiction", "present": true } }
  ]
}
```

## Verify (not in signed text)

- Section 2(b) and section 12 of the Contempt of Courts Act, 1971 are cited on my reading of the bare Act; the wording of each is understood, not signed text.
- Section 20 (the time bar for initiating contempt proceedings; moved here from the checklist, which now carries the cue without the section number): the period and the point from which it runs. Not stated anywhere; the checklist cue only.
- Articles 215 and 129 of the Constitution (the High Court's and the Supreme Court's power to punish for contempt of itself) and the High Court's own rules on contempt petitions. Not cited.
- Which court may hear a contempt of a subordinate court's order (reference to the High Court) and the role of the Advocate General's consent for criminal contempt. Not addressed; the pack is for the court that passed the order.
- Whether contempt can lie where the order was stayed, was ambiguous or has since been modified. Not addressed beyond the status field.
- Whether a contempt petition must be supported by an affidavit in a particular form under the High Court rules. Cue only.

## Notes for Ajay

1. **Risk (reputation).** Contempt notice names a person and may harm them if wrongly framed. The Drafter never characterises the person; `contemnor_characterised` is banned with a null unlock and its list is long on purpose.
2. **Risk (wilful).** `wilful_disobedience` is unlocked only by the advocate's facts, and the allowed text turns them into a submission. The mere fact of non-compliance does not unlock it.
3. **Risk (limitation).** The block is used as instructed, with a second instruction that the date of disobedience goes in as the event date. The checklist has both the general cue and the section 20 cue; the period is never stated.
4. The `knowledge_of_order` banned entry shares an id with its key; that is allowed (the id names the entry, the key names the fact).
5. Anushka tier A: recommend samples with `order_operative_text` empty and with `wilfulness_facts` empty.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. The "Notes" sections are the drafter's reasoning, not build text. Category (T-240): Civil: appeals, revision, review, execution. `court_levels` values are the lead's to map to the T-240 list.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Approved. The caption says "ALLEGED DISOBEDIENCE". The order is quoted exactly as the brief gives it; "wilful" only as a submission on facts the brief gives; the person is never characterised. Sections 2(b) and 12 at section level; the time bar is a checklist cue without a number and its period is never stated. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
