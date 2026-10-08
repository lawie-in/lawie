# T-157 — No "/" either-or lines in court and state names

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live (Bihar, Jharkhand are core markets) |
| Owner          | Vishal (build), Ajay (wording + sign-off), Anushka (tests develop after the batch) |
| Mode           | Fix, full chain. Merge to develop per founder's 8 Oct rule (as relayed by Vishal) |
| Status         | Ready for Vishal |
| Size           | M (1–2 days incl. snapshot review) |
| Depends on     | None |
| Branch         | fix/t-157-no-slash-state-and-court-lines |
| Legal sign-off | NEEDED. BLOCKED for Ajay until he signs the replacement table (see below) |
| Created        | 2026-10-08 |
| Source         | Overnight build finding |

## Goal

No draft prints an either/or line such as "State of Bihar through the District Magistrate / S.P., Patna" or "IN THE COURT OF SESSIONS JUDGE / ADDITIONAL SESSIONS JUDGE". A filed document names one authority.

## Lines in scope (Priya, from a scan of `config/court-rules/*.json` on develop 6e3afba)

| File | Key | Current |
| ---- | --- | ------- |
| bihar_district.json | party_designation.state | State of Bihar through the District Magistrate / S.P., {district} |
| jharkhand_district.json | party_designation.state | State of Jharkhand through the District Magistrate / S.P., {district} |
| sessions_generic.json | designation | IN THE COURT OF SESSIONS JUDGE / ADDITIONAL SESSIONS JUDGE |
| sessions_generic.json | party_designation.state | State through the District Magistrate / S.P., {district} |
| district_court_generic.json | designation | IN THE COURT OF DISTRICT JUDGE / CIVIL JUDGE (SENIOR DIVISION) |
| district_court_generic.json | party_designation.state | State through the Collector / District Magistrate, {district} |
| consumer_commission_generic.json | party_designation.state | State through the Collector / District Magistrate, {district} |
| labour_court.json | designation, cause_title_format, prayer_language | LABOUR COURT / INDUSTRIAL TRIBUNAL; Court / Tribunal; workman / applicant |
| itat.json | party_designation.respondent/state | ACIT / DCIT (as applicable), <Circle/Ward> |
| tn_district.json | (flagged by grep; Vishal to list exact key) | |

## Acceptance criteria

1. Every value in the table is replaced with Ajay's signed single wording (or, for a designation, the court the user chose from the courts list wins and the generic line is only a fallback with no "/").
2. A unit test loads every `config/court-rules/*.json` and fails on " / " in `designation`, `cause_title_format`, `party_designation.*`, `prayer_language.*`. `_meta`, `notes` and guidance prose are exempt.
3. Bihar regular bail before Sessions Judge, Patna, stubbed model: cause title reads "State of Bihar" + Ajay's signed wording, no "/". Same for Jharkhand (Ranchi).
4. A sessions court chosen from the courts list (e.g. "Additional Sessions Judge-I, Gaya") prints that court, not the generic line.
5. Golden snapshots: changed snapshots are listed in the PR with old/new lines and updated only after Ajay's sign-off; tester never auto-updates (`.claude/docs/golden-snapshots.md`).
6. Party labels with "/" in delhi/up/nclt/drt/tribunal (petitioner/respondent): if T-149's code already picks one label at render, leave them and say so in the report; if any still prints, list it — fixing it is T-158.

## Out of scope

- Party labels for revisions, complaints, appeals, either-party applications (T-158).
- "/" in notes, guidance prose and `_meta`.
- High Court rule packs (T-155).

## What Ajay must sign (exact)

- The replacement table: for each file + key above, the one wording to print (e.g. Bihar: "State of Bihar" alone, or "State of Bihar through the Officer-in-Charge, {police_station} P.S." — Ajay decides).
- The resulting diff to the golden snapshots under `apps/drafting/src/__tests__/__snapshots__/` for court-rules.

## Files (expected)

`config/court-rules/{bihar_district,jharkhand_district,sessions_generic,district_court_generic,consumer_commission_generic,labour_court,itat,tn_district}.json`, `__tests__/court-rules*.test.ts` + snapshots. Must NOT touch `party_designation.petitioner/respondent` labels (T-158 next batch).
