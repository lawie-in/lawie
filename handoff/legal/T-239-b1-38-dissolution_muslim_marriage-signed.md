# T-239 b1 #38 dissolution_muslim_marriage (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2.

| Field | Value |
|---|---|
| id | `dissolution_muslim_marriage` |
| displayName | Suit for Dissolution of Marriage by a Muslim Wife (Dissolution of Muslim Marriages Act, 1939, section 2) |
| category | Family and matrimonial |
| court_levels | `["family_court", "district_court", "civil_court"]` |
| Ink | L = 2 |
| Anushka tier | A (status of marriage, family) — every sample twice: full facts, facts missing |
| averments file | `_averments/dissolution_muslim_marriage.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Dissolution of Muslim Marriages Act, 1939",
    "sections": [
      {"number": "2", "description": "Grounds for decree for dissolution of marriage"}
    ]
  },
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {"number": "Order VII Rule 1", "description": "Particulars to be contained in plaint"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{plaintiff} ... Plaintiff\nVERSUS\n{defendant} ... Defendant",
  "partyDesignations": [
    {"role": "plaintiff", "label": "Plaintiff"},
    {"role": "defendant", "label": "Defendant"}
  ],
  "caseNomenclature": "SUIT No. _____ of [YEAR]\nSUIT FOR DISSOLUTION OF MARRIAGE UNDER SECTION 2 OF THE DISSOLUTION OF MUSLIM MARRIAGES ACT, 1939"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "The plaintiff and the defendant, with names, parentage, age and addresses, as the brief gives them. Religion or sect only as the brief gives it."},
  {"id": "marriage", "name": "The Marriage", "required": true, "description": "Date and place of the marriage, the dower (mehr) if the brief gives it, and the date of separation, as the brief gives them; else the blanks."},
  {"id": "children", "name": "Children", "required": false, "description": "Children of the marriage, their names and ages only as the brief gives them."},
  {"id": "grounds", "name": "Ground(s) Selected", "required": true, "description": "Only the ground(s) the form selects, each by its heading as the form gives it, with the plaintiff's facts for that ground as the brief gives them. No ground that is not selected."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis of the court's territorial jurisdiction only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "cause_of_action", "name": "Cause of Action", "required": true, "description": "The date the cause of action arose only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "earlier_proceedings", "name": "Other Proceedings", "required": true, "description": "Every other proceeding between the parties (maintenance, domestic violence, criminal, custody, earlier suit), with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Pass a decree dissolving the marriage solemnised on {marriage_date} between the plaintiff and the defendant, under section 2 of the Dissolution of Muslim Marriages Act, 1939, on the ground(s) set out in this plaint: {grounds_selected_list};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the plaintiff shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs {para_knowledge_basis} of the above plaint are true to my personal knowledge, and that the contents of paragraphs {para_information_basis} are based on information received, which I believe to be true; and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Plaint (original + copy for the defendant)",
  "Proof of the marriage (nikahnama / marriage certificate), as available",
  "Documents supporting the ground(s) selected, as the plaintiff relies on them",
  "If the ground is that the husband's whereabouts are not known: check the Act's requirement to name the persons who would be the husband's heirs and to give them notice (verify)",
  "Copies of orders in any other proceeding between the parties, if any",
  "Proof of the plaintiff's identity and address",
  "Notice / summons to the defendant as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a plaint by a Muslim wife for the dissolution of her marriage under section 2 of the Dissolution of Muslim Marriages Act, 1939. Cite only section 2 of the Act, and Order VII Rule 1 of the Code of Civil Procedure, 1908 only for the particulars of the plaint. Do not cite a clause number of section 2 and do not cite any other section of the Act. Do not state that a ground is made out.",
  "The grounds are chosen by the advocate in the form. Plead a ground only if the form selects it, using the heading the form gives, and then only the facts the BRIEF gives for it. Do not plead an unselected ground, and do not plead 'irretrievable breakdown' or 'the marriage has broken down' as a ground. A ground with no facts: [To be confirmed: the facts of this ground].",
  "Do not state, compute or paraphrase any period of years, any age, or any condition that the Act attaches to a ground, unless the BRIEF states that period, age or condition itself as a fact. Where a period is needed and not given, write [To be confirmed: the period relevant to this ground].",
  "State the religion or sect of the parties, the date and place of the marriage, the dower and the date of separation only as the BRIEF gives them. Do not write that the parties are Muslims or that the marriage is valid under Muslim law unless the BRIEF says so; otherwise [To be confirmed: the personal law governing the parties].",
  "Do not allege cruelty, neglect, desertion or any fault of the husband other than as the BRIEF gives it for a selected ground, and then only as the plaintiff's statement. Do not add an incident, a motive or a date.",
  "Do not assert jurisdiction or the cause of action. Where the BRIEF gives the basis of territorial jurisdiction, write 'It is stated that this Court has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Court's territorial jurisdiction]. Likewise 'It is stated that the cause of action arose on <date>' only from the BRIEF's date; otherwise [To be confirmed: the date the cause of action arose].",
  "State every other proceeding between the parties that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other proceeding between the parties is pending or was decided, and where]. Never write that this is the first suit or that none is pending.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| plaintiff_name / plaintiff_parentage / plaintiff_age / plaintiff_address | Plaintiff particulars | text / text / number / textarea | yes | verification |
| defendant_name / defendant_parentage / defendant_age / defendant_address | Defendant particulars | text / text / number / textarea | yes | cause title |
| personal_law_statement | Religion / sect of the parties (as the advocate states it) | text | no | parties clause |
| marriage_date / marriage_place | Date and place of the marriage | date / text | yes | marriage clause, prayer |
| dower_details | Dower (mehr), as given | text | no | marriage clause |
| separation_date | Date of separation | date | no | marriage clause |
| children_details | Children (names and ages as given) | textarea | no | children clause |
| grounds_selected | Ground(s) of dissolution (advocate selects) | multiselect (Whereabouts of the husband not known; Failure of the husband to provide maintenance; Imprisonment of the husband; Failure of the husband to perform marital obligations; Impotence of the husband; Insanity, leprosy or venereal disease of the husband; Option of puberty (repudiation of the marriage); Cruelty; Any other ground recognised as valid for the dissolution of marriages under Muslim law; Other ground (free text)) | yes | ground clause, averment unlock |
| ground_facts | Facts for each selected ground (one block per ground, as the plaintiff gives them) | textarea | yes | ground clause |
| ground_other_text | Other ground (free text), if selected | textarea | no | ground clause |
| jurisdiction_basis | Basis of territorial jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| cause_of_action_date | Date the cause of action arose (as the advocate states it) | date | no | averment unlock |
| earlier_proceedings | Other proceedings between the parties (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "dissolution_muslim_marriage",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "ground_cruelty", "kind": "averment", "what": "The husband treated the plaintiff with cruelty", "phrases": ["the defendant treats the plaintiff with cruelty", "the defendant has been cruel", "habitually assaults the plaintiff", "krurta"], "unlocked_by": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["cruelty"]}},
    {"id": "ground_maintenance", "kind": "averment", "what": "The husband has failed to provide maintenance", "phrases": ["has neglected to maintain the plaintiff", "has failed to provide maintenance", "has not paid any maintenance", "kharcha nahi diya"], "unlocked_by": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["failure of the husband to provide maintenance"]}},
    {"id": "ground_whereabouts", "kind": "averment", "what": "The husband's whereabouts are not known", "phrases": ["whereabouts of the defendant are not known", "has been missing", "his whereabouts are unknown", "pata nahi hai"], "unlocked_by": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["whereabouts of the husband not known"]}},
    {"id": "irretrievable_breakdown", "kind": "submission", "what": "The marriage has broken down irretrievably", "phrases": ["irretrievable breakdown", "the marriage has broken down", "no possibility of reconciliation", "rishta toot chuka hai"], "unlocked_by": null},
    {"id": "fault_of_husband", "kind": "averment", "what": "Desertion, abandonment or ill-treatment by the husband", "phrases": ["has deserted the plaintiff", "has abandoned the plaintiff", "has ill-treated the plaintiff", "chhod kar chala gaya"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The court has territorial jurisdiction", "phrases": ["this court has jurisdiction", "this hon'ble court has territorial jurisdiction", "the court has jurisdiction to entertain", "is within the jurisdiction of this court", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "cause_of_action_date", "kind": "averment", "what": "The cause of action arose on a date", "phrases": ["the cause of action arose on", "cause of action first arose", "cause of action arose when", "vaad hetuk utpann hua"], "unlocked_by": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as the advocate states it)", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "is within time", "is not barred by limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "ground_cruelty", "kind": "averment", "averment": "the plaintiff states, on the ground of cruelty, that {{ground_facts}}", "requires": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["cruelty"]}},
    {"id": "ground_maintenance", "kind": "averment", "averment": "the plaintiff states, on the ground of failure to provide maintenance, that {{ground_facts}}", "requires": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["failure of the husband to provide maintenance"]}},
    {"id": "ground_whereabouts", "kind": "averment", "averment": "the plaintiff states, on the ground that the husband's whereabouts are not known, that {{ground_facts}}", "requires": {"key": "grounds_selected", "label": "Ground(s) of dissolution", "equals": ["whereabouts of the husband not known"]}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Court has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "cause_of_action_date", "kind": "averment", "averment": "it is stated that the cause of action arose on {{cause_of_action_date}}", "requires": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings between the parties", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The grounds in section 2, their clause numbers, and the periods and conditions attached to each (years of absence, non-maintenance, imprisonment, non-performance of marital obligations, insanity; the age conditions of the option of puberty). I am confident of the headings used in the form, but periods and clause numbers are left out of every signed field and the Drafter is told not to state them.
- The residuary ground (any other ground recognised as valid under Muslim law). The heading is used as the form option; the Drafter pleads it only if selected.
- The requirement of notice and impleading of heirs where the ground is that the husband's whereabouts are not known (understood to be in section 3). Checklist cue only.
- Sections 4 (renunciation of Islam / conversion) and 5 (dower rights not affected). Not cited and not drafted.
- Which court takes this suit (Family Court or civil court) and the personal-law application of the Act. Court_levels lists both; jurisdiction is a form field.
- Verification: the two-limb pattern for suits (true to knowledge / true to information; understood as a CPC Order VI Rule 15 practice) is applied by Ajay's ruling. The Order and Rule are not cited in the signed text. The lead derives {para_knowledge_basis} and {para_information_basis} as in affidavit_in_support.

## Notes for Ajay

1. Risk. Each ground is a fact-bearing statement; the pack unlocks it only when the form selects it, so an advocate who selects nothing gets a plaint with no ground and a blank, not a default ground.
2. Risk. The form option 'Any other ground recognised as valid ...' may be read as a catch-all. Ajay may prefer to drop it and leave 'Other ground (free text)' alone.
3. Only three grounds have averment pairs; the other grounds are default-deny by the facts-only rule. Ajay may want a pair for each.
4. The form's ground headings paraphrase section 2 (see Questions for Ajay); the pack states no period, age or condition.
5. Tier A: two Anushka samples: ground selected with facts, and ground selected with ground_facts empty (the Drafter must not write facts).


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Family and matrimonial. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | The ground options are exactly these nine headings of section 2 of the Dissolution of Muslim Marriages Act, 1939, with no period or sub-clause stated (the advocate checks each condition in the Act): whereabouts of the husband not known; failure to provide maintenance; imprisonment of the husband; failure to perform marital obligations; impotence; insanity, leprosy or virulent venereal disease; repudiation of the marriage by option of puberty; cruelty; any other ground recognised as valid for the dissolution of marriages under Muslim law. Two-limb verification approved: "true to my personal knowledge" and "based on information received, which I believe to be true". |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
