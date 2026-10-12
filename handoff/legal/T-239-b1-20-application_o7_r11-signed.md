# T-239 b1 #20 application_o7_r11 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `application_o7_r11` |
| displayName | Application for Rejection of Plaint (CPC Order VII Rule 11) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/application_o7_r11.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order VII Rule 11",
        "description": "Rejection of plaint"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant ({applicant_role_in_suit})\nVERSUS\n{opposite_party} ... Opposite Party ({opposite_role_in_suit})",
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION FOR REJECTION OF PLAINT UNDER ORDER VII RULE 11 OF THE CODE OF CIVIL PROCEDURE, 1908"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "plaint_particulars", "name": "The Plaint", "required": true, "description": "The date the plaint was filed or presented (if the BRIEF gives it), the reliefs claimed in it and the paragraphs relied on, quoted exactly as the BRIEF gives them; blank where not given."},
  {"id": "grounds", "name": "Grounds for Rejection", "required": true, "description": "Each ground chosen in GROUNDS, named only by the exact paraphrase in the table below, with the plaint's own statements relied on for it, as the BRIEF gives them. No ground the BRIEF does not give, and no other wording of a ground."},
  {"id": "decided_on_plaint", "name": "Application Decided on the Plaint Alone", "required": true, "description": "Fixed wording: \"It is submitted that this application is to be decided on the averments in the plaint and the documents filed with it.\""},
  {"id": "stage", "name": "Stage of the Suit", "required": true, "description": "The stage of the suit and whether a written statement has been filed, only as the BRIEF gives it; blank where not given."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Reject the plaint in {suit_ref} under Order VII Rule 11 of the Code of Civil Procedure, 1908, on the grounds set out in this application;
b) Award the costs of this application;
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
  "Application (original + copy for the opposite party)",
  "Certified copy or true copy of the plaint, with its annexures",
  "Documents of the plaint that the application relies on, if any",
  "Written statement, if already filed",
  "Affidavit of the applicant, if the court requires one",
  "Copy to the plaintiff / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application to reject the plaint in a pending suit under Order VII Rule 11 of the Code of Civil Procedure, 1908. It is not a written statement, not an application to dismiss the suit on merits, and not an application for a preliminary issue.",
  "Rest every ground on the statements of the plaint as the BRIEF quotes or summarises them. Quote the plaint's words exactly as the BRIEF gives them; do not paraphrase them. Include the statement of clause decided_on_plaint in its fixed wording. Do not introduce the applicant's own version of the facts, or any document or matter outside the plaint, even if the BRIEF mentions it.",
  "Plead only the grounds chosen in GROUNDS, and name each ground only by one of these four paraphrases, with no other wording: \"the plaint does not disclose a cause of action\"; \"the relief claimed is undervalued and the valuation was not corrected\"; \"the plaint is written on paper insufficiently stamped and the deficiency was not made good\"; \"the suit appears from the statement in the plaint to be barred by law\". For the last ground, name the law only as BAR PROVISION gives it; where not given write [To be confirmed: the law said to bar the suit]. Write each ground only as a submission (\"It is submitted that ...\") on the plaint's statements the BRIEF gives, never as a fact.",
  "Plead the ground that the relief is undervalued only if the case details give the Court's direction to correct the valuation (valuation_direction); state that direction as the BRIEF gives it. Otherwise write [To be confirmed: the Court's direction to correct the valuation, and its date].",
  "Plead the ground that the plaint is insufficiently stamped only if the case details give the Court's direction to make good the deficiency (stamp_direction); state that direction as the BRIEF gives it. Otherwise write [To be confirmed: the Court's direction to make good the deficiency in stamp, and its date].",
  "A ground of limitation is written only as the submission \"It is submitted that the suit appears from the plaint to be barred by limitation\", and only when LIMITATION POINT gives it, on the plaint's own dates as the BRIEF gives them. Never state it as a fact, never compute a period, and never write that the application is made within time.",
  "Do not call the suit frivolous, vexatious, an abuse of the process of the Court or collusive, and do not allege bad faith against the plaintiff, unless the BRIEF gives the fact; then state the fact, not the label.",
  "State the stage of the suit, and whether a written statement has been filed, only as the BRIEF gives it. Do not state that the application is made at the earliest or is not delayed.",
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
| plaint_filing_date | Date the plaint was filed | date | no | plaint clause |
| grounds | Grounds relied on | multi-select (the plaint does not disclose a cause of action; the relief claimed is undervalued and the valuation was not corrected; the plaint is written on paper insufficiently stamped and the deficiency was not made good; the suit appears from the statement in the plaint to be barred by law) | yes | ground clause; averment unlock; option text is exactly the string in the table below |
| valuation_direction | Court's direction to correct the valuation (date and substance) | textarea | no | Unlocks the valuation ground; else a blank (Ajay) |
| stamp_direction | Court's direction to make good the deficiency in stamp (date and substance) | textarea | no | Unlocks the stamp ground; else a blank (Ajay) |
| ground_basis | Statements of the plaint relied on (quote them, with paragraph numbers) | textarea | yes | ground clause; averment unlock |
| bar_provision | Law said to bar the suit (Act and section as you state it) | text | no | ground clause (bar by law) |
| limitation_point | If you submit the plaint shows the suit to be barred by limitation: the dates and statements of the plaint relied on | textarea | no | ground clause; averment unlock |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o7_r11",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "no_cause_of_action", "kind": "submission", "what": "The plaint discloses no cause of action", "phrases": ["the plaint discloses no cause of action", "no cause of action has arisen", "the plaint does not disclose any cause of action", "the plaint does not disclose a cause of action"], "unlocked_by": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the plaint does not disclose a cause of action"]}]}},
    {"id": "undervalued", "kind": "submission", "what": "The relief is undervalued and the valuation was not corrected", "phrases": ["the relief claimed is undervalued", "the valuation was not corrected", "the plaint is undervalued"], "unlocked_by": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the relief claimed is undervalued and the valuation was not corrected"]}]}},
    {"id": "insufficiently_stamped", "kind": "submission", "what": "The plaint is insufficiently stamped and the deficiency was not made good", "phrases": ["insufficiently stamped", "the deficiency was not made good", "the stamp paper is deficient"], "unlocked_by": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the plaint is written on paper insufficiently stamped and the deficiency was not made good"]}]}},
    {"id": "suit_barred_by_law", "kind": "submission", "what": "The suit appears from the plaint to be barred by law", "phrases": ["the suit is barred by law", "the plaint is barred by", "the suit is hopelessly barred", "appears from the statement in the plaint to be barred by law"], "unlocked_by": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the suit appears from the statement in the plaint to be barred by law"]}]}},
    {"id": "barred_by_limitation", "kind": "submission", "what": "The suit appears from the plaint to be barred by limitation", "phrases": ["barred by limitation", "the suit is time-barred", "the suit is hopelessly time-barred"], "unlocked_by": {"all_of": [{"key": "limitation_point", "label": "Limitation point on the plaint's own dates", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the suit appears from the statement in the plaint to be barred by law"]}]}},
    {"id": "frivolous_or_abuse", "kind": "averment", "what": "The suit is frivolous, vexatious or an abuse of process", "phrases": ["the suit is frivolous", "the suit is vexatious", "an abuse of the process of the court", "the suit is collusive", "the plaintiff has filed this suit mala fide"], "unlocked_by": null},
    {"id": "application_not_delayed", "kind": "submission", "what": "The application is timely", "phrases": ["the application is made at the earliest", "the application is not belated", "there is no delay in filing this application"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_cause_of_action", "kind": "submission", "averment": "it is submitted that the plaint does not disclose a cause of action, on its own statements ({{ground_basis}})", "requires": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the plaint does not disclose a cause of action"]}]}},
    {"id": "undervalued", "kind": "submission", "averment": "it is submitted that the relief claimed is undervalued and the valuation was not corrected, on the plaint's own statements ({{ground_basis}})", "requires": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the relief claimed is undervalued and the valuation was not corrected"]}]}},
    {"id": "insufficiently_stamped", "kind": "submission", "averment": "it is submitted that the plaint is written on paper insufficiently stamped and the deficiency was not made good, on the plaint's own statements ({{ground_basis}})", "requires": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the plaint is written on paper insufficiently stamped and the deficiency was not made good"]}]}},
    {"id": "suit_barred_by_law", "kind": "submission", "averment": "it is submitted that the suit appears from the statement in the plaint ({{ground_basis}}) to be barred by law", "requires": {"all_of": [{"key": "ground_basis", "label": "Statements of the plaint relied on", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the suit appears from the statement in the plaint to be barred by law"]}]}},
    {"id": "barred_by_limitation", "kind": "submission", "averment": "it is submitted that the suit appears from the plaint to be barred by limitation, on the plaint's own dates ({{limitation_point}})", "requires": {"all_of": [{"key": "limitation_point", "label": "Limitation point on the plaint's own dates", "present": true}, {"key": "grounds", "label": "Grounds relied on", "equals": ["the suit appears from the statement in the plaint to be barred by law"]}]}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Code-supplied strings: ground options

| `grounds` option (exact text) | Averment id |
|---|---|
| the plaint does not disclose a cause of action | no_cause_of_action |
| the relief claimed is undervalued and the valuation was not corrected | undervalued |
| the plaint is written on paper insufficiently stamped and the deficiency was not made good | insufficiently_stamped |
| the suit appears from the statement in the plaint to be barred by law | suit_barred_by_law |

A ground of limitation has no option of its own; it is written only through `limitation_point` under the last option, as the submission in the prompt.

## Verify (not in signed text)

- The grounds in Order VII Rule 11 and their lettering (understood: no cause of action; undervaluation not corrected; insufficient stamp not supplied; bar by law on the plaint's statements; not in duplicate; non-compliance with Rule 9). The `grounds` options are Ajay's four approved paraphrases only (see table below); the exact wording of the Rule stays here. Clause letters are not cited.
- Whether the Rule's statutory text allows the Court to look at anything but the plaint (understood: only the plaint's statements, with documents it relies on). Stated here as a drafting caution, not as law; no authority named.
- Whether limitation can be a ground under the "barred by law" head. Not stated; `bar_provision` is the advocate's text.
- Any proviso to Rule 11 and the consequence of rejection (Rule 13, understood: a fresh plaint is not barred). Not cited.

## Notes for Ajay

1. The "matter outside the plaint" paragraph and its form key are removed per Ajay's ruling 3; clause `decided_on_plaint` (fixed wording) replaces them.
2. Risk. `eq` on a multi-select reads entry by entry (README); the option text must match the folded label exactly. T-240 should confirm option strings.
3. Tier B. One Anushka sample with `bar_provision` empty and the bar ground ticked, to check the Drafter writes the blank and does not name a statute.

## Review changes (v2, per Ajay's rulings)

- Ground options cut to Ajay's four paraphrases; 'Other ground' removed. Averments rebuilt: one banned/allowed pair per ground, each unlocked by its own ground plus the plaint statements.
- Limitation ground: new key limitation_point and submission-only entry barred_by_limitation; general within_limitation (null) ban added.
- Matter-outside-the-plaint paragraph and key removed; fixed clause decided_on_plaint added.
- Anushka tier B, Ink S=1 unchanged.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | Four ground labels only. The valuation and stamp grounds are offered only when the advocate gives the Court's direction (new keys `valuation_direction`, `stamp_direction`), else a blank (amended in this file). `decided_on_plaint` reads "It is submitted that this application is to be decided on the averments in the plaint and the documents filed with it." (amended). A limitation ground is a submission only. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
