# T-135 — The draft cites the right provision for the court

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                        |
| Owner      | Ajay (the law), then Vishal (apply), Anushka (verdict)                                                        |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-135-right-provision-in-bail-drafts                                                                      |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

A bail application cites the provision that gives that court its power, and the catalogue states provisions correctly.

## What Anushka found

- **Blocker.** A regular bail application before a Sessions Judge cited three sections: 480 in the heading and prayer, "481 and 482" in paragraph 1. She says it should be 483 before a Court of Session. The product's own Section finder maps 439 CrPC to 483 BNSS.
- The catalogue card says "Application for regular bail under Section 480/481 BNSS, 2023". No Sessions bail document under 483 is offered.
- **Major.** Catalogue descriptions she believes are wrong and wants confirmed: "Criminal Revision Petition u/S.438 BNSS (HC) or S.442 BNSS (Sessions)", "S.272 BNSS (summons case)" under Discharge, "S.413 BNSS (criminal HC)" under Review Petition.

## Acceptance criteria (draft, Priya to confirm)

- Ajay confirms or corrects each provision she names, with the section text as the source, and writes the result here.
- The provision in a bail draft follows the court the user chose.
- Every catalogue description is read once by Ajay for provisions.
- Anushka tests again from the start and her verdict is PASS.

## Notes

- This is legal content (`.claude/docs/legal-content-paths.md`). Nothing changes without Ajay's sign-off.
- The chat has not checked the sections against the statute text.

## Cause, traced in the code (Vishal, 6 Oct 2026, 23:4x). Not yet confirmed by Ajay against the statute

1. **The heading and the prayer never look at the court.** `docs/templates/bail_regular.json`, computed field `bail_section`: "if currently_in_custody === 'no' then '482' else '480'". So a regular bail application says 480 before every court, and 483 can never appear.
2. **The rule pack tells the Drafter the wrong sections.** `apps/drafting/src/config/document-rules/bail_regular.json`: the first drafting instruction is "Draft a Regular Bail Application under Sections 480/481/482 BNSS, 2023", and the pack's own prayer says "under Sections 480/481/482". That is where "Sections 481 and 482" in paragraph 1 came from.
3. **The pack's descriptions of the sections are wrong**, as written today: 480 "Bail in bailable offences", 481 "Bail in non-bailable offences", 482 "Bail to person accused of non-bailable offence".
4. **Why the check passed it:** the check allows any section listed in the pack, and the pack lists 480 to 484.

Needed from Ajay before any change: the provision for each court (Magistrate, Sessions, High Court) for regular and anticipatory bail, the corrected descriptions, and one read of all 92 packs for section numbers. His check was started in the war room on 6 Oct at about 22:50 and did not run.
