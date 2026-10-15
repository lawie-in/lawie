# T-245: old/new criminal law switch, per pack (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `origin/develop_staging` after 1aee87c. Apply after T-237 and T-241 (same files). Section pairs below are checked against our signed tables `config/sections/crpc-to-bnss.json` and `ipc-to-bns.json`; sub-sections not in a pack or table today are marked **verify** and stay out.

## The rule

- **Offence (substantive law)** follows the **date of the offence**. Before 1 July 2024: Indian Penal Code, 1860. On or after: Bharatiya Nyaya Sanhita, 2023. Special Acts (NDPS, SC/ST, PMLA, DV Act and the like) are not affected.
- **Procedure and evidence** follow the **date the case began** (FIR; or the complaint where there is no FIR). On or after 1 July 2024: BNSS and BSA. Before: proceedings pending on that date continue under the CrPC (BNSS s.531(2)(a)); whether a fresh application in such a case is made under the CrPC or the BNSS is the **advocate's choice**, never Lawie's.
- Lawie never converts a section from one code to the other and never assumes a date.

## Form keys (lead builds; I sign the `form_schema` diff)

| Key              | Label                                                         | Type                                             | Required       | Shown                                                           |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------ | -------------- | --------------------------------------------------------------- |
| `offence_date`   | Date of the alleged offence (or of the offence of conviction) | date                                             | no             | Group A, B                                                      |
| `fir_date`       | Date of FIR, or of the complaint if no FIR                    | date                                             | no             | Group A, C; reuse the key where the pack has it                 |
| `procedure_code` | This application is under                                     | select: `BNSS and BSA` / `CrPC and Evidence Act` | yes when shown | Group A, C, only when `fir_date` is before 1 July 2024 or empty |

When `fir_date` is on or after 1 July 2024, `procedure_code` is set to `BNSS and BSA` and not shown.

The case details sent to the Drafter carry two derived lines: `PROCEDURE CODE: <procedure_code>` and `GOVERNING PROVISION: <the pack's provision under that code, e.g. Section 480 of the BNSS>`. With no `procedure_code`, both lines are left out and the P-text's blank applies.

## Shared Drafter text (exact)

**S-text** (Groups A and B), one `promptInstructions` entry:

`Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].`

**P-text** (Groups A and C), one `promptInstructions` entry:

`Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].`

`{governing_provision}`: the lead adds this placeholder to `causeTitle.caseNomenclature` and `prayerTemplate` wherever they name a BNSS section today, filled from the per-pack pair below and `procedure_code`; empty choice → `[To be confirmed: Section <CrPC> CrPC or Section <BNSS> BNSS]`.

## Per pack

Every sentence or phrase in the pack that says "never IPC", "NEVER use old IPC section numbers", "Cite BNS for offences (never IPC)" or "NEVER include any IPC reference" is **deleted**; the S-text and/or P-text below is added once, as the second `promptInstructions` entry.

### Group A: offence and procedure

| Pack                                   | Provision pair (CrPC → BNSS)                                                                    | Also                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bail_regular`                         | Magistrate 437 → 480; Court of Session / High Court 439 → 483                                   | Entry 0 becomes: `Draft a Regular Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.` Entry 4 (BNS / "IPC 498A = BNS 85" line) is deleted; S-text replaces it |
| `bail_before_magistrate`               | 437 → 480                                                                                       | `prompt_context`: delete "(corresponding to Section 437 CrPC)" and "Cite BNS for offences (never IPC), BNSS for procedural provisions."                                                                                                                                                                                           |
| `bail_anticipatory`                    | 438 → 482                                                                                       | Entry 0 becomes: `Draft an Anticipatory Bail Application under the provision given as GOVERNING PROVISION in the case details.`                                                                                                                                                                                                   |
| `interim_bail`                         | 437 → 480 or 439 → 483, by court                                                                | Entry 0 becomes: `Draft an Interim Bail Application in the pending bail proceedings, under the provision given as GOVERNING PROVISION in the case details.`                                                                                                                                                                       |
| `bail_cancellation`                    | Court of Session / High Court 439(2) → 483(3); Magistrate 437(5) → 480 (sub-section **verify**) |                                                                                                                                                                                                                                                                                                                                   |
| `default_bail`                         | 167(2) → 187(3)                                                                                 |                                                                                                                                                                                                                                                                                                                                   |
| `surrender_application`                | 437 → 480                                                                                       |                                                                                                                                                                                                                                                                                                                                   |
| `suspension_of_sentence`               | 389 → 430                                                                                       |                                                                                                                                                                                                                                                                                                                                   |
| `criminal_appeal`                      | 374 → 415; 378 → 419                                                                            |                                                                                                                                                                                                                                                                                                                                   |
| `criminal_revision`                    | 397 → 438; 401 → 442                                                                            |                                                                                                                                                                                                                                                                                                                                   |
| `discharge_application`                | 227 → 250; 239 → 262; 245 → 268                                                                 | See citation fix 3                                                                                                                                                                                                                                                                                                                |
| `fir_quashing`, `quashing_528_bnss`    | 482 → 528                                                                                       | Article 226 unaffected                                                                                                                                                                                                                                                                                                            |
| `writ_petition_criminal`               | 154(3) → 173(4); 156(3) → 175(3); 41 → 35                                                       | Article 226 unaffected                                                                                                                                                                                                                                                                                                            |
| `review_petition` (criminal limb only) | 362 → 403                                                                                       | See citation fix 1                                                                                                                                                                                                                                                                                                                |
| `habeas_corpus`                        | 97 → 100; 57 → 58                                                                               | See citation fix 2. Articles 32 / 226 unaffected                                                                                                                                                                                                                                                                                  |

### Group B: offence only (no procedure key)

| Pack                      | Date key                                       | Pairs (IPC → BNS)                                                                                                  |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `legal_notice_defamation` | `offence_date`, labelled "Date of publication" | 499 → 356(1); 500 → 356(2)                                                                                         |
| `mact_claim`              | `offence_date`, labelled "Date of accident"    | 304A → 106(1); 279 → 281; 337 → 125(b); 338 → 125(c). The claim itself is under the Motor Vehicles Act, unaffected |

### Group C: procedure only (no offence)

| Pack                   | Pair                       | Note                                                                                                                                             |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maintenance_bnss_144` | 125 → 144; 127 → 146       | `fir_date` is labelled "Date the maintenance petition was filed" (for an alteration or execution in an old case); a fresh petition is under BNSS |
| `divorce_sma`          | 125 → 144 (reference only) | P-text only where it mentions maintenance                                                                                                        |

### Group D: wording only

`affidavit_identity`, `memo_of_parties`: the "NEVER include any IPC reference ..." sentence becomes `Cite a criminal law provision only as the BRIEF gives it. Do not convert an IPC section to the BNS, or a CrPC section to the BNSS.`

No change: `synopsis`, `list_of_dates`, `production_of_documents`, `vakalatnama`, `posh_complaint`, `dv_act_complaint`, civil limb of `review_petition`.

## Citation fixes in the same packs (wrong today)

| #   | Pack                    | Wrong                                                                                                                 | Exact fix                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `review_petition`       | "S.413 BNSS" as the criminal review provision (413 is CrPC 372, no appeal unless provided)                            | Replace every `S.413 BNSS` with `S.403 BNSS` (CrPC 362, court not to alter judgment; corrected from 402 by T-255)                                                                                                                                                                                                                                 |
| 2   | `habeas_corpus`         | "S.97 BNSS" for search of a person wrongfully confined                                                                | Replace every `S.97 BNSS` with `S.100 BNSS`                                                                                                                                                                                                                                                                                                       |
| 3   | `discharge_application` | "S.272 BNSS (summons case)": there is no discharge in a summons case; CrPC 245 (warrant case on complaint) is missing | `S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate) / S.272 BNSS (summons case)` → `S.250 BNSS (Sessions) / S.262 BNSS (warrant case on police report) / S.268 BNSS (warrant case on complaint)`; `(S.250 / S.262 / S.272 BNSS)` → `(S.250 / S.262 / S.268 BNSS)`. Any other `272` in the pack: list it for me, do not change it |

## Conditions

| Item                                                                                                                                                                                                                                   | Mark                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Lead applies the text above word for word                                                                                                                                                                                              | Condition                                                                        |
| AC4 tests per Group A and B pack: offence 2023 → IPC cited; 2025 → BNS; no date → blank, no code assumed. Group A and C also: FIR 2023 with `procedure_code` CrPC → CrPC provision in heading and prayer; no choice → both-forms blank | Condition                                                                        |
| `config/sections/` maps both ways (AC3)                                                                                                                                                                                                | Condition: the reverse map is generated from the signed tables, never hand-typed |
| Moved golden snapshots listed for me before merge                                                                                                                                                                                      | Condition                                                                        |
| Evidence code follows `procedure_code`. The BSA's own savings section is **verify** and not cited                                                                                                                                      | Acceptable                                                                       |
| T-239 batch 1 criminal specs use these keys and texts (AC6)                                                                                                                                                                            | Approved; I apply them in each spec                                              |

Signed: Ajay (CLO), 12 Oct 2026 IST, on the conditions above. Any other wording comes back to me.

## Addendum 1: T-245a build rulings (Vishal, 14 Oct 2026)

`{governing_provision}` renders, byte-exact, as one of:

- BNSS: `Section {n} of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC: `Section {n} of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section {crpc} of the CrPC or Section {bnss} of the BNSS]`
  In an all-caps heading it is upper-cased as a whole.

| #   | Point                                                                       | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Kind     |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Where the heading's provision goes                                          | **(A) approved**: `(Under {governing_provision})` in each pack's own cause-title format, and in the application heading for bail_regular / bail_anticipatory. No court-rule change.                                                                                                                                                                                                                                                                                                                                                               | —        |
| 2   | D1 skeletons hard-code BNSS                                                 | Replace each hard-coded `Section N of the Bharatiya Nagarik Suraksha Sanhita, 2023` with `{governing_provision}`: bail_regular :31 (court-keyed 437/439 → 480/483), bail_before_magistrate :53, bail_anticipatory :31, default_bail :11 (167(2) → 187(3)). bail_before_magistrate :211, women's proviso: BNSS `the first proviso to Section 480(1) of the BNSS` (as today); CrPC `the first proviso to Section 437(1) of the CrPC`; no choice `the first proviso to [To be confirmed: Section 437(1) of the CrPC or Section 480(1) of the BNSS]`. | must-fix |
| 3   | docs/templates twins (bail_regular, bail_anticipatory)                      | Heading `APPLICATION FOR REGULAR BAIL UNDER {GOVERNING_PROVISION}` / `APPLICATION FOR ANTICIPATORY BAIL UNDER {GOVERNING_PROVISION}`; prayer `… under {governing_provision}`, replacing "Section {bail_section} of BNSS, 2023". **Turn auto-convert off** for both: offences print exactly as given (it breaks "never convert"). Descriptions (:5): `Application for regular bail` / `Application for anticipatory bail (apprehension of arrest)`.                                                                                                | must-fix |
| 4   | Court unknown in two-pair packs (bail_regular, interim_bail)                | Procedure known: `[To be confirmed: Section 480 or Section 483 of the BNSS]` / `[To be confirmed: Section 437 or Section 439 of the CrPC]`. Both unknown: `[To be confirmed: Section 437 or 439 of the CrPC, or Section 480 or 483 of the BNSS]`. bail_cancellation, Magistrate: CrPC `Section 437(5)`, BNSS `Section 480` with no sub-section (verify stands).                                                                                                                                                                                   | must-fix |
| 5   | Lines my text missed                                                        | bail_before_magistrate entry [0]: delete `(successor to Section 437 CrPC)`. Entry [1]: `under BNSS 480` → `under the provision given as GOVERNING PROVISION in the case details`. bail_cancellation entry [0]: `483(3) BNSS read with 480 BNSS` → `the provision given as GOVERNING PROVISION in the case details`. Form labels `(BNS sections)` → `(as written in the FIR)`.                                                                                                                                                                     | must-fix |
| 6   | allahabad_hc anticipatory line names "U/S 482 BNSS"                         | Keep it for a BNSS choice. For a CrPC choice or no choice, print the T-426 generic `Anticipatory Bail Application No. _____ of {year}` (the court's old-law form is verify). Moved goldens to me.                                                                                                                                                                                                                                                                                                                                                 | must-fix |
| 7   | Preflight old_law_section and the intake IPC note fall back to the FIR date | **Offence date only.** With no offence date, no finding and no note: the S-text blank handles it. The FIR date is never a stand-in for the offence date.                                                                                                                                                                                                                                                                                                                                                                                          | must-fix |
| 8   | procedure_code cannot be shown conditionally                                | Always ask it, with help text `Matters only for a case that began before 1 July 2024. For an FIR on or after that date, Lawie uses the BNSS.` At draft time an FIR date on or after 1 July 2024 forces BNSS whatever was chosen.                                                                                                                                                                                                                                                                                                                  | approved |
| 9   | "Notice under Section 35 BNSS" (CrPC 41A)                                   | Follows procedure_code: `Section 35 of the BNSS` / `Section 41A of the CrPC`, no sub-section on either side. A form label shown before the choice reads `Notice to appear (Section 35 BNSS / Section 41A CrPC)`.                                                                                                                                                                                                                                                                                                                                  | must-fix |
| —   | offence_date in every pack; fir_date required?                              | offence_date goes in every Group A and B pack (signed table), optional. fir_date stays optional: an unknown date gives the blank, never a block.                                                                                                                                                                                                                                                                                                                                                                                                  | —        |

Golden entries moved by 2, 3, 4 and 6 come to me before merge.

Signed: Ajay (CLO), 14 Oct 2026 IST. Addendum 1 is my ruling; the "(Vishal, …)" in its heading names who asked.

## Addendum 2: T-245a part 1 build points (Vishal, 14 Oct 2026)

| #   | Point                                                                                                                                                                                                                          | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Kind                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | 35 BNSS / 41A CrPC wording                                                                                                                                                                                                     | BNSS `Section 35(3) of the BNSS`, kept as today where the text has it. CrPC `Section 41A of the CrPC`. No choice: `[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]`. Applies to the skeleton clauses, the \_averments s35 entries and the s35 question. The form label from Addendum 1 stays as signed.                                                                                                                                                                                                                         | must-fix              |
| 2   | bail_cancellation, court unknown                                                                                                                                                                                               | BNSS: `[To be confirmed: Section 480 or Section 483(3) of the BNSS]`. CrPC: `[To be confirmed: Section 437(5) or Section 439(2) of the CrPC]`. Neither: `[To be confirmed: Section 437(5) or 439(2) of the CrPC, or Section 480 or 483(3) of the BNSS]`. No "480(5)" (verify stands).                                                                                                                                                                                                                                                                   | must-fix              |
| 3   | Twin texts missed                                                                                                                                                                                                              | bail_regular computed bail_section instruction → `{governing_provision}`. Both twins' `under Sections {sections_charged} of BNS, 2023` → `under Section(s) {sections_charged}, as written in the FIR`. Anticipatory `under Section 482 BNSS` → `under {governing_provision}`.                                                                                                                                                                                                                                                                           | must-fix              |
| 4   | Remaining BNSS citations                                                                                                                                                                                                       | All follow procedure_code. Magistrate entry [0] and prompt_context `480 BNSS / 483 BNSS` → `the provision given as GOVERNING PROVISION in the case details`. Bailable variant: new pair **CrPC 436 → BNSS 478**, through `{governing_provision}`. interim_bail `read with BNSS 480/483` and bail_cancellation `BNSS 483(3) ... read with 480` → `read with the provision given as GOVERNING PROVISION in the case details`. bail_regular `domestic violence (BNS 85/80)` → `cruelty or dowry death`, with no section numbers (S-text governs offences). | must-fix              |
| 5   | procedure_code required:true but never blocks                                                                                                                                                                                  | Make it **optional**. A required mark that never blocks misleads, and an empty value gives the blank.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | must-fix              |
| 6   | S/P at [1]/[2], entry 4 deleted                                                                                                                                                                                                | Same result. **Approved.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                     |
| 7   | default_bail blank in the Addendum 1 form                                                                                                                                                                                      | **Approved.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                     |
| 8   | Judgment names in prompts: bail_cancellation entry 5 (Dolat Ram; Bhagirathsinh), bail_anticipatory twin (Sushila Aggarwal), interim_bail prompt_context (Lal Kamlendra); also criminal_revision :219 (Krishnan v. Krishnaveni) | Against the signed rule (`Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`). The model can misquote or invent a citation. Out of T-245a scope: a **new ticket** (Priya) removes each name and adds that sentence to the pack.                                                                                                                                                                                                                                                             | must-fix (new ticket) |

Moved goldens (part 2) come to me before merge.

## Addendum 3: T-245a part 1 leftovers (Vishal, 14 Oct 2026)

| #   | Point                                               | Ruling                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Static s35 question                                 | Use `…under Section 35(3) of the BNSS or Section 41A of the CrPC…` (the rest of the question unchanged).                                                                                                                                                                                                  |
| 2   | bail_before_magistrate DISTINCTION sentence         | Keep it, with each BNSS number followed by its pair: `Section 480 BNSS (Section 437 CrPC)` and `Section 483 BNSS (Section 439 CrPC)`. The P-text still decides what is cited.                                                                                                                             |
| 3   | bail_regular relatedActs note "BNS 85/80"           | Yes: `When the bail application involves cruelty or dowry death`. No section numbers.                                                                                                                                                                                                                     |
| 4   | Twin's "Do not cite Section 481 or Section 482"     | Follows the choice. Correct pairs: **CrPC 437A → BNSS 481** (not 436A) and **438 → 482**. CrPC: `Do not cite Section 437A or Section 438 of the CrPC`; no choice: `Do not cite Section 437A or 438 of the CrPC, or Section 481 or 482 of the BNSS`.                                                       |
| 5   | Bailable variant when the classification is unknown | Not 437/480 by default: unknown → blank, like the court-unknown rule. BNSS `[To be confirmed: Section 478 or Section 480 of the BNSS]`; CrPC `[To be confirmed: Section 436 or Section 437 of the CrPC]`; neither `[To be confirmed: Section 436 or 437 of the CrPC, or Section 478 or 480 of the BNSS]`. |
| 6   | Label reuse for the notice_provision condition      | Approved.                                                                                                                                                                                                                                                                                                 |

Signed: Ajay (CLO), 14 Oct 2026 IST.

## Addendum 4: T-245a part 2 (Vishal, 15 Oct 2026)

1. default_bail RELATED ACTS. CrPC choice: the CrPC entry **only**, `{act: "Code of Criminal Procedure, 1973", sections: [{number: "167(2)", description: "Procedure when investigation cannot be completed in twenty-four hours"}]}`, with the BNSS entry dropped. BNSS choice: the BNSS entry only, as today. No choice: both entries. **Approved.**
2. Upper-cased blank in the twins' heading: approved, on one condition: blank detection matches `[To be confirmed:` case-insensitively. A test with the upper-cased heading must be flagged as unfinished exactly as the lower-case blank is. must-fix if the detection misses it.

No golden moved (fixture FIR 2026): noted. The CrPC / no-choice Allahabad test is welcome.

Signed: Ajay (CLO), 15 Oct 2026 IST.

## Addendum 5: T-245a hash pins and the FIR-date question (Vishal, 15 Oct 2026)

1. `_averments/bail_regular.json` re-pin to `df163457…a923`: **approved**, on the stated diff only: the s35 averment `no notice under {{notice_provision}} was served on the applicant before arrest`, where `{{notice_provision}}` renders per Addendum 2 #1, plus requires/unlocked_by `notice_provision present`. Any other change in that file is not covered.
2. t182 bail_regular prompt digest: **approved** to re-record. The instruction changes are exactly the signed ones (deletions; S/P at [1]/[2]; entry 0; entry 4 removed; "cruelty or dowry death").
3. FIR date at intake: **ask it, never block.** It decides the procedure code, so asking it cuts the blanks. Label as signed (`Date of FIR, or of the complaint if no FIR`), with "Not known" allowed. An unanswered date prints the blank as today.

Signed: Ajay (CLO), 15 Oct 2026 IST.

Addendum 5 #3 follow-up (15 Oct 2026). fir_date question, signed byte-exact, replacing the model's wording and the fallback in all six packs:
`On what date was the FIR registered, or the complaint filed if there is no FIR?`

## Addendum 6: T-245a review wording (Vishal, 15 Oct 2026)

1. bail_cancellation prompt_context: use `Draft an Application for Cancellation of Bail under the provision given as GOVERNING PROVISION in the case details.` (not "read with").
2. bail_before_magistrate. displayName: `Bail Application before Magistrate (Section 480 BNSS / Section 437 CrPC)`. The _meta description follows the same pairing. Validation rule: `recommend Section 483 BNSS (Section 439 CrPC) before the Court of Session or High Court`. Fold into T-245a. must-fix (the displayName is shown to users).
3. Court-rule practice notes ("S.483 BNSS" / "S.482 BNSS"): **parked**. The P-text governs what is cited. A follow-up adds the CrPC pair to each note.

Signed: Ajay (CLO), 15 Oct 2026 IST.

## Addendum 7: T-245a review round 2 notes (Vishal, 15 Oct 2026)

1. System rule 1 repeating the S-text and P-text verbatim (replacing "NEVER reference old IPC, CrPC"): **approved**.
2. The dead `\n(Under {governing_provision})` suffix in the bail_before_magistrate / default_bail caseNomenclature: **remove it in T-245a** (it would print twice if ever wired). No other change to those strings.
3. Offence-date-only warning scoped to the six packs until T-245b: noted.

## Addendum 8: T-441, judgment names (Vishal, 15 Oct 2026)

S = `Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`

**(a) The five strings: approved as proposed** (including #2, bail_cancellation prompt_context :187, which I had missed). S is added once per pack, not once per line.

**(b) T-441 covers the whole of criminal_revision, bail_cancellation, bail_anticipatory (twin) and interim_bail**, by the rules below. Same files as T-245a.

**(c) The rest of the catalogue: one ticket per group, applying these signed rules mechanically.** I byte-check each group's diff; I do not pre-sign every line.

| Rule | Text |
|---|---|
| R1 | In model-visible text (promptInstructions, prompt_context, system_role, clause names and descriptions, relevantActs descriptions, notes), delete each judgment name, its citation and its connector ("per", "in", "as held in", "see", "following", "cite … on"). Keep the legal proposition word for word. |
| R2 | If a line only says to cite a judgment, delete the line. |
| R3 | Add S once per pack, as the last promptInstructions entry. |
| R4 | Where a name is used as a label ("Bhajan Lal categories", "Sarla Verma method"), replace it with a plain description proposed in the diff (e.g. "the recognised categories for quashing"). I check each one. |
| R5 | No new law in any replacement: no new section, case or proposition. |
| R6 | key_citations, key_precedents and _meta are not sent to the model: leave them. But change each `_meta.change_protocol` that makes a citation MANDATORY to `Do not name judgments in model-visible text (Ajay, T-441).` |
| R7 | The _averments ban lists stay as they are. |

**Always V1, whatever the group, signed one by one (send me the list):**
- the 6 user-facing form labels naming cases (curative, fir_quashing, divorce_mutual, dv_act, plaint_recovery, plaint_partition);
- any judgment inside fixed clause text that prints into the document (e.g. service_agreement);
- the "Suraj Lamp Disclaimer" clause name (gpa/spa).

Group order: criminal and writs **V1**; civil/family and deeds/agreements **V1.1**, except the always-V1 items above.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### Addendum 8: always-V1 items, signed byte-exact (15 Oct 2026)

| File:line | New text |
|---|---|
| curative_petition.json :72 label | `Curative ground` |
| fir_quashing.json :103 label | `Grounds for quashing invoked (one or more)` (the id stays) |
| divorce_mutual_consent.json :148 label | `Whether waiver of the 6-month cooling period is sought` |
| dv_act_complaint.json :82 label | `Additional respondents (in-laws, family members)` |
| plaint_recovery.json :202 label | `Pre-institution mediation completed under Section 12A of the Commercial Courts Act, 2015 (if commercial and no urgent interim relief)` |
| plaint_partition.json :93 label | `Female coparceners: daughters with an equal share after the Hindu Succession (Amendment) Act, 2005` |
| service_agreement.json :75 printed content | Delete the last sentence, ` Reference: Dharangadhara Chemical Works v. Workmen AIR 1957 SC 264 (control test).`. The clause ends at `…all statutory dues.` |
| gpa.json :239 name | `Title disclaimer (if power to sell included)`; the description stays. |
| spa.json :233 name | `Title disclaimer (if power to sell)`; the description stays. |

Any golden that moves (service_agreement especially) comes to me.

### T-441 byte check (feature/t-441-no-judgment-names, diff 7e94b5e9.., 15 Oct 2026)

The five signed strings are applied verbatim; S appears once per pack, last; no case name is left in any model-visible field of the four files (only key_citations, which R6 leaves alone); no golden moved.

criminal_revision R1/R2 calls: **approved as proposed** for :231, :233, :236, :237, :243, :249 and :250 (keep "charge framing principles"). The deletions of :232 and :238 are approved (nothing of law left).

Para 8: `Para 8: Grounds of revision — itemise each ground with relevant precedent.` becomes `Para 8: Grounds of revision — itemise each ground.` "With relevant precedent" invites a citation S forbids. must-fix in T-441.

With Para 8 changed: **T-441 is approved.** Merge-body ref: "Legal: T-441 signed by Ajay, 2ec63fc + this check".
