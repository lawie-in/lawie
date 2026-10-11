# T-251: `default_bail` text (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `default_bail.json` on `origin/develop_staging` after 00b7881. Apply **after T-245a** (same pack). This is a full replacement of the fields named below; T-245's S-text and P-text are included here so the lead applies one consistent list.

## Defects found (beyond the ticket)

| # | Defect | Fix |
|---|---|---|
| 1 | Four judgments named and cited (T-148) | Removed; `[Authority — add if relied upon]` instead |
| 2 | The Drafter tabulates days (T-136) | Removed; dates only, as the brief gives them |
| 3 | **Wrong law:** "≤10 yrs = 60 days; >10 yrs / life / death = 90 days", and `validation_rules` force 90 days for a 10-year maximum. The 90-day period is for offences punishable with death, imprisonment for life, or imprisonment for a term of not less than ten years; an offence whose punishment *may extend to* ten years is in the 60-day period. A 10-year-maximum offence drafted as a 90-day case delays a liberty claim by 30 days | The advocate states which period applies (`period_claimed`); Lawie never decides it |
| 4 | `willingness_to_furnish_bond must be Yes` treated as a fact | An undertaking for the future |
| 5 | "never IPC" | T-245 S-text |

## Replacement text (word for word)

### `prompt_context`

`Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details. The application rests on dates the BRIEF gives: the date of arrest, the date of first remand, the period the advocate says applies (60 days, 90 days, or the period under a special Act) and whether a police report has been filed. Lawie does not work out which period applies and does not count days.`

### `promptInstructions` (replaces all entries)

1. `Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought.`
2. *(T-245 S-text, word for word)*
3. *(T-245 P-text, word for word)*
4. `State the date of arrest and the date of first remand to custody as the BRIEF gives them, and that the applicant remains in custody only if the BRIEF says so. Use a blank for any of them the BRIEF does not give.`
5. `State the period the BRIEF says applies (60 days, 90 days, or a period under a special Act) and the date on which the BRIEF says it expired. Do not work out which period applies, and do not count or tabulate days. Where the BRIEF does not give the period, write [To be confirmed: the default-bail period that applies to this offence]; where it does not give the date of expiry, write [To be confirmed: the date on which the period expired].`
6. `State whether a police report has been filed only as the BRIEF gives it, as on the date of this application. Where the BRIEF does not say, write [To be confirmed: whether a police report had been filed when this application was made]. Do not say that the investigation is incomplete unless the BRIEF says so.`
7. `Where the BRIEF says an offence is under a special Act (for example the NDPS Act, the UAPA or the PMLA), do not apply the BNSS or CrPC periods to it; write [To be confirmed: the default-bail period and any extension under <that Act>].`
8. `Submit, as "It is submitted that ...", that the period having expired without a police report, as stated above, the applicant is entitled to be released on bail. Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`
9. `Give the applicant's undertaking for the future to furnish bail bonds and sureties as this Hon'ble Court directs. Never as a fact and never as the advocate's undertaking.`
10. `State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].`
11. `Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system.`

### `mandatoryClauses` (replaces all)

```json
[
  {"id": "statutory_provision", "name": "Provision Invoked", "required": true, "description": "The provision under which default bail is sought, as GOVERNING PROVISION gives it."},
  {"id": "custody_dates", "name": "Arrest and First Remand", "required": true, "description": "The date of arrest and the date of first remand, as the brief gives them, or the blank."},
  {"id": "applicable_window", "name": "Period and Expiry", "required": true, "description": "The default-bail period the brief says applies and the date it expired, as the brief gives them, or the blank. Never worked out by Lawie."},
  {"id": "non_filing", "name": "Police Report", "required": true, "description": "Whether a police report had been filed when the application was made, as the brief gives it, or the blank."},
  {"id": "indefeasible_right", "name": "Entitlement to Release", "required": true, "description": "Submission that, the period having expired without a police report, the applicant is entitled to be released on bail. Naming no judgment."},
  {"id": "willingness", "name": "Undertaking to Furnish Bond", "required": true, "description": "The applicant's undertaking for the future to furnish bail bonds and sureties as directed. Never a statement of fact."},
  {"id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "Prayer for release on default bail"},
  {"id": "verification", "name": "Verification", "required": true, "description": "Verification on oath"}
]
```

Cue map (T-200): `default_bail` / `earlier_applications` → EA-standard (T-237). Other clauses R2b.

### `causeTitle.caseNomenclature` and `prayerTemplate`

Every "Section 187(3) BNSS, 2023" / "Section 187(3) of BNSS, 2023" becomes `{governing_provision}` (T-245 pair 167(2) CrPC → 187(3) BNSS). The prayer's opening words "and as the statutory period under Section 187(3) BNSS, 2023 has expired without the police report being filed," are **deleted** (the body states it, from the brief).

### `validation_rules` (replaces all)

```json
[
  "remand_date, if given, must not be before arrest_date",
  "application_date, if given, must not be before remand_date",
  "period_claimed must be given; if empty, the draft carries the blank"
]
```

### Form keys

| Change | Key | Label | Type |
|---|---|---|---|
| Remove | `offence_punishment_max_years`, `elapsed_days` | | |
| Add | `period_claimed` | Default-bail period that applies | select: 60 days / 90 days / Period under a special Act |
| Add | `period_expiry_date` | Date the period expired | date, optional |
| Add | `special_act_period` | Special Act and its period (if any) | text, optional, shown for the third option |
| Change | `willingness_to_furnish_bond` | "The applicant will furnish bail bonds and sureties as directed" | checkbox; unticked → blank `[To be confirmed: the applicant's undertaking to furnish bail bonds]` |
| Keep | `earlier_bail_applications` (add if missing) | Earlier bail applications (court, date, result) | textarea, optional |

## Conditions

| Item | Mark |
|---|---|
| Text above, word for word | Condition |
| AC2 tests: no judgment named; no day count; a 10-year-maximum offence with `period_claimed` empty → blank, never "90 days"; a special-Act offence → special-Act blank | Condition |
| Moved golden snapshots listed for me | Condition |
| Practitioner check (pack `_meta`): the 60/90-day boundary note above is from the statute's words; the advocate reviewer confirms before release | Risk, accepted |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
