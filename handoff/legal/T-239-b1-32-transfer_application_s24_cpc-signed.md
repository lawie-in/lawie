# T-239 b1 #32 transfer_application_s24_cpc (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `transfer_application_s24_cpc` |
| displayName | Application for Transfer of a Suit (CPC Section 24) |
| category | Civil: defence and interlocutory |
| court_levels | `["district_judge", "high_court_appellate_civil_side", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/transfer_application_s24_cpc.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "24",
        "description": "General power of transfer and withdrawal"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN {court_designation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant ({applicant_role_in_suit})\nVERSUS\n{opposite_party} ... Opposite Party ({opposite_role_in_suit})",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant"
    },
    {
      "role": "opposite_party",
      "label": "Opposite Party"
    }
  ],
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(Transfer of {suit_ref}, pending in {pending_court})\nAPPLICATION UNDER SECTION 24 OF THE CODE OF CIVIL PROCEDURE, 1908"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit, appeal or proceeding sought to be transferred (number, parties, the court where pending, the applicant's position in it), as the BRIEF gives them."},
  {"id": "relief_sought", "name": "Transfer Sought", "required": true, "description": "Whether transfer to a named court, or withdrawal with trial by the court applied to, or withdrawal and transfer to a named court, as chosen in RELIEF SOUGHT, naming the transferee court only as the BRIEF names it."},
  {"id": "grounds", "name": "Grounds for Transfer", "required": true, "description": "The grounds the BRIEF gives, as submissions; no ground the BRIEF does not give."},
  {"id": "stage", "name": "Stage of the Suit", "required": true, "description": "The stage of the suit, only as the BRIEF gives it; blank where not given."},
  {"id": "transferee_court", "name": "Transferee Court", "required": true, "description": "The court to which transfer is sought and why the BRIEF says it is suitable; no statement that it is competent unless the form gives the basis."},
  {"id": "earlier_proceedings", "name": "Earlier Transfer Applications and Proceedings", "required": true, "description": "Every earlier application for transfer of this suit, and any other proceeding on the same matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) {relief_prayer}, under Section 24 of the Code of Civil Procedure, 1908;
b) Stay further proceedings in the said suit until the disposal of this application, if this Hon'ble Court so directs;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Application (original + copy for each opposite party)",
  "Certified copy of the plaint and the order sheet of the suit sought to be transferred",
  "Documents supporting the grounds for transfer, if any",
  "Affidavit of the applicant, if the court requires one",
  "Notice to the parties as per court practice",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application under Section 24 of the Code of Civil Procedure, 1908 to the High Court or the District Judge, as chosen in FORUM, for transfer of a suit, appeal or proceeding. It is not an application for transfer from one State to another and not an application to the Supreme Court.",
  "Name the forum and the court where the suit is pending, and the transferee court, only as the BRIEF gives them. Where not given, write [To be confirmed: the court where the suit is pending] or [To be confirmed: the court to which transfer is sought].",
  "State the grounds for transfer only as the BRIEF gives them, as submissions. Do not allege bias, partiality or prejudice against any Presiding Officer, party or counsel, and do not write that a fair trial is not possible or that justice will not be done, unless the BRIEF gives a fact; then state the fact the BRIEF gives and the applicant's stated apprehension in the BRIEF's words, with no label.",
  "Do not state that the transferee court is competent to try the suit, or has jurisdiction, unless TRANSFEREE BASIS gives the basis; then write \"the applicant states that ...\" on that basis only.",
  "State the stage of the suit only as the BRIEF gives it. Do not write that the application is made at the earliest stage or that no prejudice will be caused.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Write reasons and grounds as submissions (\"It is submitted that ...\"), and only the reasons the BRIEF gives.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title, verification |
| applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / number / textarea | yes | verification |
| applicant_role_in_suit | Applicant is the | select (Plaintiff; Defendant; Other party — state) | yes | cause title |
| opposite_party_name / opposite_role_in_suit | Opposite party and position in the suit | text / select | yes | cause title |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| suit_ref | Suit or proceeding number and year | text | yes | nomenclature |
| stage_of_suit | Present stage of the suit (as you state it) | text | no | particulars clause |
| forum | This application is made to | select (High Court; District Judge) | yes | cause title, court levels |
| pending_court | Court where the suit is pending | text | yes | nomenclature, particulars |
| relief_sought | Relief sought | select (Transfer to a named court; Withdrawal, to be tried by the court applied to; Withdrawal and transfer to a named court) | yes | transfer clause, prayer; see table of code-supplied strings |
| transferee_court | Court to which transfer is sought | text | no | transferee clause |
| transferee_basis | Basis on which that court can try the suit (as you state it) | textarea | no | averment unlock |
| grounds_for_transfer | Grounds for transfer | textarea | yes | grounds clause; averment unlock |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "transfer_application_s24_cpc",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "transfer_expedient", "kind": "submission", "what": "Transfer is expedient or in the interest of justice", "phrases": ["it is expedient for the ends of justice", "transfer is necessary in the interest of justice", "the ends of justice demand transfer"], "unlocked_by": {"key": "grounds_for_transfer", "label": "Grounds for transfer", "present": true}},
    {"id": "bias_or_no_fair_trial", "kind": "averment", "what": "Bias, partiality or no fair trial", "phrases": ["the Presiding Officer is biased", "the applicant will not get a fair trial", "the applicant will not get justice", "the court is prejudiced against the applicant"], "unlocked_by": null},
    {"id": "transferee_competent", "kind": "averment", "what": "The transferee court is competent or has jurisdiction", "phrases": ["is competent to try the suit", "has jurisdiction to try the suit", "is the appropriate court"], "unlocked_by": {"key": "transferee_basis", "label": "Basis on which that court can try the suit", "present": true}},
    {"id": "no_prejudice_earliest", "kind": "averment", "what": "No prejudice and made at the earliest", "phrases": ["no prejudice will be caused", "the application is made at the earliest stage"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "transfer_expedient", "kind": "submission", "averment": "it is submitted that transfer is sought on the following grounds: {{grounds_for_transfer}}", "requires": {"key": "grounds_for_transfer", "label": "Grounds for transfer", "present": true}},
    {"id": "transferee_competent", "kind": "averment", "averment": "the applicant states, as to the transferee court, that {{transferee_basis}}", "requires": {"key": "transferee_basis", "label": "Basis on which that court can try the suit", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Code-supplied strings: relief_prayer

Derived by the code from `forum` and `relief_sought`. `state`, `suit_ref`, `pending_court` and `transferee_court` are form keys. Where `transferee_court` is empty, the code writes `[To be confirmed: court to which transfer is sought]` in its place.

| Cause title | Value |
|---|---|
| After "IN " | `court_designation`, typed in full by the advocate as the court is styled; Lawie never builds a court's name |

| `relief_sought` option | `relief_prayer` (prayer a, before ", under Section 24 ...") |
|---|---|
| Transfer to a named court | Transfer {suit_ref}, now pending in {pending_court}, to {transferee_court} |
| Withdrawal, to be tried by the court applied to | Withdraw {suit_ref} from {pending_court} and try it in this Hon'ble Court |
| Withdrawal and transfer to a named court | Withdraw {suit_ref} from {pending_court} and transfer it to {transferee_court} |

## Verify (not in signed text)

- The text of Section 24 (understood: on application of a party after notice, or of its own motion without notice, the High Court or the District Court may at any stage transfer a suit, appeal or other proceeding to a subordinate court competent to try it, or withdraw it and try it itself or transfer it). Sub-section and clause numbers are not cited.
- Whether the District Court can transfer only within its own subordinate courts, and the position for a suit pending before a court subordinate to a different District Judge (understood: not covered). Not stated.
- Transfer from one State's court to another's (Section 25, Supreme Court). Out of scope; no text.
- Whether a stay of proceedings is ordinarily sought together. Prayer (b) is conditional, "if this Hon'ble Court so directs"; delete if you do not want it.
- Court level strings: `high_court_appellate_civil_side` and `high_court_original_side` are taken from existing packs; T-240 settles the list.

## Notes for Ajay

1. Cause title uses `transferringCourt`, derived from `forum` (table above). The cause-title format now reads "IN {transferringCourt}" so the string does not repeat "COURT OF". The 'Other — state' relief option is removed: no table string can be derived from free text.
2. Risk. Bias grounds are common. I banned the labels outright with no unlock; if the advocate wants a bias ground drafted, that needs your text.
3. Tier B. One Anushka sample with `grounds_for_transfer` thin, to check no bias is added.

## Review changes (v2, per Ajay's rulings)

- Added tables of select option to transferringCourt and relief_prayer; cause-title format and prayer (a) adjusted to fit them; 'Other — state' relief removed.
- Checklist: removed paraphrase of what the section requires on notice.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | The cause title uses `court_designation`, typed in full by the advocate as the court is styled ("IN {court_designation}"); Lawie never builds a court's name. This replaces the `transferringCourt` table (amended in this file). The "Other — state" relief option is removed. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
