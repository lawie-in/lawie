# T-239 b1 #21 application_o9_r13 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: limitation at stake.

| Field | Value |
|---|---|
| id | `application_o9_r13` |
| displayName | Application to Set Aside an Ex Parte Decree (CPC Order IX Rule 13) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | A |
| averments file | `_averments/application_o9_r13.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order IX Rule 13",
        "description": "Setting aside decree ex parte against defendant"
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER IX RULE 13 OF THE CODE OF CIVIL PROCEDURE, 1908 TO SET ASIDE THE EX PARTE DECREE DATED {order_or_decree_date}"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "decree_particulars", "name": "The Ex Parte Decree", "required": true, "description": "The court, the suit, the date the defendant was set ex parte (if the BRIEF gives it), the date of the decree and what it decrees, as the BRIEF gives them."},
  {"id": "ground_service", "name": "Service of Summons", "required": true, "description": "Whether and how summons was served, only as the BRIEF gives it; blank where not given. Required where the ground includes non-service."},
  {"id": "ground_cause", "name": "Cause of Non-Appearance", "required": true, "description": "Why the applicant did not appear on the date of hearing, only as the BRIEF gives it; blank where not given. Required where the ground includes sufficient cause."},
  {"id": "knowledge", "name": "Knowledge of the Decree", "required": true, "description": "When and how the applicant came to know of the decree, only as the BRIEF gives it; blank where not given."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates the BRIEF gives for the decree, the certified copy and the filing, as dates only."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Set aside the ex parte decree dated {order_or_decree_date} passed in {suit_ref}, as against the applicant, on such terms as this Hon'ble Court may deem fit;
b) Restore the suit to its original number for hearing on the merits;
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
  "Application (original + copy for the decree-holder)",
  "Certified copy of the ex parte decree and judgment",
  "Order sheet showing the date the defendant was set ex parte",
  "Affidavit of the applicant (sufficient cause or non-service), if the court requires one",
  "Documents supporting the reason for non-appearance (e.g. medical record, travel proof), if any",
  "Draft written statement, if relied on",
  "Copy to the decree-holder / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft an application by the defendant to set aside an ex parte decree under Order IX Rule 13 of the Code of Civil Procedure, 1908. It is not an application to set aside an order that dismissed a suit, not an appeal, and not an application for stay of execution (do not add stay as a relief unless RELIEF EXTRA gives it).",
  "Plead only the ground chosen in GROUND: that summons was not duly served; that the applicant was prevented by sufficient cause from appearing on the date the suit was called on for hearing; or both in the alternative. Do not argue a ground that is not chosen.",
  "State how summons was served, or that it was not, only as the BRIEF gives it. Where not given write [To be confirmed: how and when summons was served on the applicant]. Do not write that the applicant had no knowledge of the suit unless the BRIEF says so.",
  "State why the applicant did not appear only as the BRIEF gives it, as a submission. Do not add illness, travel, wrong date, an advocate's default or any other reason that the BRIEF does not give. Where not given write [To be confirmed: the reason the applicant did not appear on the date of hearing].",
  "State when and how the applicant learnt of the decree only as the BRIEF gives it; otherwise [To be confirmed: the date and manner in which the applicant learnt of the decree].",
  "Do not state that the applicant has a good defence on the merits unless the BRIEF gives the defence; then state it as a submission, in the BRIEF's words.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
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
| ground | Ground | select (Summons not duly served; Prevented by sufficient cause from appearing; Both, in the alternative) | yes | picks the pleaded ground |
| ex_parte_order_date | Date the defendant was set ex parte | date | no | decree clause |
| decree_details | What the ex parte decree decrees | textarea | yes | decree clause |
| summons_service_details | How and when summons was served, or was not served | textarea | no | service clause; averment unlock |
| reason_for_non_appearance | Why the applicant did not appear on the date of hearing | textarea | no | cause clause; averment unlock |
| knowledge_of_decree_date | Date the applicant learnt of the decree | date | no | knowledge clause; limitation dates (listed only) |
| knowledge_details | How the applicant learnt of the decree | textarea | no | knowledge clause |
| defence_on_merits | Defence on the merits, if you want it pleaded | textarea | no | averment unlock |
| relief_extra | Any further relief (e.g. stay of execution), if you want it | textarea | no | prayer |
| order_or_decree_date | Date of the order, decree or event | date | no | limitation dates (listed only; no period is stated or computed) |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation dates (listed only) |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation dates (listed only) |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o9_r13",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "summons_not_served", "kind": "averment", "what": "Summons was not served or the applicant had no knowledge of the suit", "phrases": ["summons was never served", "the applicant was never served", "the applicant had no knowledge of the suit", "no notice of the suit was received"], "unlocked_by": {"key": "summons_service_details", "label": "How and when summons was served, or was not served", "present": true}},
    {"id": "sufficient_cause", "kind": "submission", "what": "The applicant was prevented by sufficient cause", "phrases": ["was prevented by sufficient cause", "sufficient cause for non-appearance", "the non-appearance was bona fide and unintentional"], "unlocked_by": {"key": "reason_for_non_appearance", "label": "Why the applicant did not appear", "present": true}},
    {"id": "good_defence", "kind": "submission", "what": "The applicant has a good defence on the merits", "phrases": ["has a good defence on merits", "has a meritorious defence", "has a strong case on merits"], "unlocked_by": {"key": "defence_on_merits", "label": "Defence on the merits", "present": true}},
    {"id": "decree_collusive_or_obtained_by_fraud", "kind": "averment", "what": "The decree was obtained by fraud or suppression", "phrases": ["the decree was obtained by fraud", "the plaintiff suppressed the correct address", "the ex parte decree is a nullity"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "summons_not_served", "kind": "averment", "averment": "the applicant states, as to service of summons, that {{summons_service_details}}", "requires": {"key": "summons_service_details", "label": "How and when summons was served, or was not served", "present": true}},
    {"id": "sufficient_cause", "kind": "submission", "averment": "it is submitted that the applicant was prevented from appearing on the date of hearing because {{reason_for_non_appearance}}", "requires": {"key": "reason_for_non_appearance", "label": "Why the applicant did not appear", "present": true}},
    {"id": "good_defence", "kind": "submission", "averment": "it is submitted that the applicant has a defence to the suit, namely {{defence_on_merits}}", "requires": {"key": "defence_on_merits", "label": "Defence on the merits", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The period of limitation for this application and the point from which it runs (understood: Limitation Act, 1963, Article 123; thirty days; from the date of the decree or, where summons was not duly served, from knowledge of the decree). Not stated anywhere; the dates are listed only.
- The proviso to Rule 13 (understood: a decree is not set aside only for an irregularity in service of summons if the defendant had notice and time to appear and answer). Not cited.
- Whether Section 5 of the Limitation Act, 1963 is available to this application. Not stated; the checklist cue says only "if late, file an application for condonation of delay".
- The remedy against an order refusing to set aside an ex parte decree (understood: Order XLIII Rule 1). Not cited.
- Stay of execution of the decree while this application is pending. Not drafted; `relief_extra` carries whatever the advocate gives.

## Notes for Ajay

1. Risk. `summons_not_served` is an averment of fact and is unlocked by the advocate's own service statement, in the "the applicant states" form.
2. Risk. I banned "decree is a nullity" and fraud labels with no unlock; add an unlock if you want a separate fraud ground.
3. Tier A: two Anushka samples, full facts and `reason_for_non_appearance` empty, to see that no reason is invented.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Limitation block as signed; the sufficient-cause reason only as the brief gives it. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
