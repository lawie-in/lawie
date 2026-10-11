# T-248: the three packs' wrong citations, exact strings (signed)

Ajay (CLO), 12 Oct 2026 IST. Supersedes the replacement list in `T-245-old-new-law-switch-signed.md` ("Citation fixes in the same packs") for these three packs. Checked against the corrected tables (T-250, T-255): CrPC 362 = BNSS 403; CrPC 97 = BNSS 100; CrPC 239 = BNSS 262; CrPC 245 = BNSS 268.

Rule: apply the strings below to **every occurrence**, including the structured `number` and `description` fields and the variant spellings (`S.413`, `BNSS S.413`). References to the **old code** (`S.362 CrPC`, `S.97 CrPC`, `S.245 CrPC`) are correct and stay.

## `review_petition.json`

| Where | Replace | With |
|---|---|---|
| `_meta.description` (line 3) | `S.413 BNSS (criminal HC)` | `S.403 BNSS (criminal HC)` |
| line ~246 | `S.413 BNSS [S.362 CrPC bar on review` | `S.403 BNSS [S.362 CrPC bar on review` |
| line ~246 | `NOTE: BNSS S.413 retains the bar on criminal review` | `NOTE: BNSS S.403 retains the bar on criminal review` |
| line ~263 | `only clerical/arithmetical errors under S.413 BNSS proviso.` | `only clerical/arithmetical errors under S.403 BNSS (S.362 CrPC).` (there is no proviso; the exception is in the section itself) |
| provisions list (~296) `number` | `S.413` | `S.403` |
| provisions list (~297) `description` | `Bar on alteration of criminal judgment (was S.362 CrPC) — narrow review for clerical/arithmetical errors only` | unchanged |

## `habeas_corpus.json`

| Where | Replace | With |
|---|---|---|
| line ~144 `label` | `Magistrate u/S.97 BNSS` | `Magistrate u/S.100 BNSS` |
| line ~257 | `Magistrate u/S.97 BNSS [S.97 CrPC search warrant for unlawfully confined person]` | `Magistrate u/S.100 BNSS [S.97 CrPC search warrant for unlawfully confined person]` |
| provisions list (~297) `number` | `S.97` | `S.100` |
| provisions list (~298) `description` | `Search warrant for person wrongfully confined (replaces S.97 CrPC)` | `Search for persons wrongfully confined (replaces S.97 CrPC)` |

## `discharge_application.json`

CrPC 245 (warrant case on a complaint) is BNSS **268**. There is no discharge provision for a summons case, so the third case type becomes the warrant case on a complaint.

| Where | Replace | With |
|---|---|---|
| `_meta.description` (line 3) | `Application for discharge u/S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate) / S.272 BNSS (summons case)` | `Application for discharge u/S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate on a police report) / S.268 BNSS (warrant case before Magistrate on a complaint)` |
| `displayName` (line 12) | `Discharge Application (S.250 / S.262 / S.272 BNSS)` | `Discharge Application` (no section number of one code only; T-251 rule) |
| `case_type` option (line 55) | `summons_case_by_magistrate_s272` | `warrant_case_by_magistrate_complaint_s268` |
| `applicable_section` option (line 68) | `s_272_bnss_summons_magistrate` | `s_268_bnss_warrant_magistrate_complaint` |
| clause description (line 168) | `S.250 / S.262 / S.272 BNSS` | `S.250 / S.262 / S.268 BNSS` |
| line ~224 (c) | `(c) Summons Case by Magistrate — S.272 BNSS (was S.245 CrPC for warrant case on complaint, and notional discharge in summons case).` | `(c) Warrant Case by Magistrate on a complaint — S.268 BNSS (was S.245 CrPC).` |
| line ~235 | `reference S.250/S.262/S.272 BNSS as applicable.` | `reference S.250/S.262/S.268 BNSS as applicable.` |
| provisions list (~271) `number` | `S.272` | `S.268` |
| provisions list (~272) `description` | `Procedure in summons cases — release / discharge (replaces S.245 CrPC for warrant on complaint)` | `Discharge in a warrant case instituted on a complaint (replaces S.245 CrPC)` |
| `validation_rules` (line ~313) | `s_272 with summons magistrate` | `s_268 with warrant magistrate on complaint` |

Anything else in the file that says "summons case" in connection with discharge (search for `summons`) is listed for me, not changed. Any stored draft or fixture that uses the old enum values (`summons_case_by_magistrate_s272`, `s_272_bnss_summons_magistrate`) is migrated to the new values; list each fixture changed. Moved golden snapshots are listed for me before merge.

Signed: Ajay (CLO), 12 Oct 2026 IST.
