# T-149 — Party labels in the cause title fit the document, not the court

| Field          | Value                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live                                                       |
| Owner          | Vishal (build), Ajay (confirms labels), Anushka (tests on develop before GTM)                         |
| Mode           | Fix, full chain                                                                                       |
| Status         | Ready for Vishal, once Ajay signs the label table below                                               |
| Depends on     | Ajay's sign-off on criterion 1 and 2 wording                                                          |
| Branch         | fix/t-149-party-labels-from-the-document                                                              |
| Legal sign-off | Needed: `config/court-rules/` (up_district, delhi_district) is legal content and golden-snapshotted. Snapshot changes only with Ajay's reference; the tester never auto-updates them |
| Created        | 2026-10-07                                                                                            |
| Source         | Anushka's run 2, 7 Oct 2026, finding 4 (scenario 3)                                                   |

## What Anushka found

Regular bail, Sessions Court Lucknow: "Plaintiff (civil) / Applicant (criminal)" and "Defendant (civil) / Opposite Party (criminal)" printed in the cause title, prayer, verification and under the signature (5 places). Also "State of U.P. through the District Magistrate / S.P., Lucknow".

## Cause (Priya, from a grep)

`court-rules/up_district.json` and `delhi_district.json` set `party_designation.petitioner` and `.respondent` to a choice string meant for a human. `template-engine.service.ts` (~line 557) copies `petitioner` into `party_label_petitioner` for every document. `state` holds "District Magistrate / S.P." the same way.

## Label table for Ajay to sign (Priya's proposal)

| Document side | First party | Second party |
| ------------- | ----------- | ------------ |
| Criminal (bail, anticipatory bail, quashing, criminal misc.) | Applicant | Opposite Party (UP) / Respondent (Delhi), as the court rule's cause title already says |
| Civil (suit, plaint, civil misc.) | Plaintiff | Defendant |

State line, UP: Ajay to give one wording (e.g. "State of Uttar Pradesh"). No "/" choice left in it.

## Acceptance criteria (Priya, 7 Oct 2026)

1. A criminal document drafted for any UP or Delhi district court carries the criminal labels from the signed table in the cause title, prayer, verification and signature block. A civil document carries the civil labels.
2. The state line has no "/" choice in it; it reads as Ajay signed.
3. A test fails if any court rule's party label or state line, as printed, contains "(civil)", "(criminal)" or " / " between alternatives. Run across all files in `config/court-rules/`; other offenders are listed in the report, fixed only if Ajay signed them.
4. Bihar, Jharkhand and CJM drafts print the same labels as today (golden snapshots for them unchanged).
5. Anushka's scenario 3 (regular bail, Sessions Court Lucknow) re-run with a stubbed model: none of the five places shows a choice string.

## Out of scope

- Facts added (T-147). Verification "Verified at Lucknow" for a jailed applicant and the checklist gaps (run 2 minors, Ajay).
- Any other change to court-rule wording.
