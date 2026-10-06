# T-136 — The draft is one document and keeps the facts as given

| Field | Value |
|---|---|
| Phase | 1 — Describe and draft |
| Owner | Vishal (build), Ajay (signed the rules), Anushka (tests on develop before GTM) |
| Mode | Full chain |
| Status | In progress. Part built on the branch, not wired in and not tested |
| Branch | fix/t-136-draft-is-one-document-and-keeps-the-facts |
| Legal sign-off | `handoff/design/T-136-drafter-rules-signed.md`, Ajay (CLO), 7 Oct 2026, two parts, with conditions |
| Source | Anushka's first run, 6 Oct 2026, verdict FAIL |

## Goal

A draft is one clean document that says what the advocate gave: no fact changed, added or dropped.

## What the tester found

- **Facts changed:** arrest given as 12 September, judicial custody from 13 September; the draft said "picked up by the police on 13.09.2026" and "in custody for approximately three days" on a draft dated 6 October.
- **Facts dropped:** an earlier bail rejection (JMFC, 22 September), "only earning member of his family", the jail name; in the notice, the date the client received the bank's return memo.
- **Facts added:** "mistaken identity and/or enmity with the informant", "deep roots in the community", "cooperating fully", "custodial interrogation is no longer required", and grounds she had not selected.
- **Two documents stitched together:** a second title, court and addressee after the system's own; "AFFIDAVIT IN SUPPORT OF BAIL APPLICATION" over the body; in the notice, "TO WHOM IT MAY CONCERN", a second TO/FROM block, the demand three times, "Yours faithfully" twice, and "[Advocate Signature Block — SYSTEM]" printed in the body.
- **The checks missed all of it:** "No problems found" on the notice.

## Cause, from the code

1. The Drafter was given only the names of the parts the system adds, not their text, and its rule 8 let it write "any part this kind of document needs".
2. The pack's instructions, written for the old form, list grounds and undertakings as things to write, and ask for "total days in custody".
3. Nothing told the Drafter to use every fact. The description the advocate typed is not sent to the Drafter, and the Reception model may shorten the facts, so a fact with no item of its own on the brief can be lost before drafting.
4. The checks look only for a date or a section that is new. Nothing checks that the brief's facts are in the draft, that a part appears once, or a worked-out period.

Not confirmed: whether her dropped facts were lost at intake or by the Drafter. Her saved brief could not be read.

## Acceptance criteria (confirmed by Priya, 7 Oct 2026)

1. The two Drafter prompts are Ajay's signed text of part 2 (A and A2), character for character, and are released together.
2. Both Drafter calls (first and repair) are given the text of the system's parts: what stands before the Drafter's text and what follows it.
3. The advocate's description, as typed and in full, reaches the Drafter under "described". Nothing a model wrote and nothing read from a file goes in it.
4. Before generating, the brief screen shows Ajay's line (part 2, condition 2) and the advocate can go back and change the description.
5. `bail_regular` carries B1 to B5 as signed, and the clause `earlier_applications` as Ajay worded it. `legal_notice_s138` carries his instructions 7, 8 and 9 (part 1, "Outside the packet", item 2).
6. The findings C1, C2, C3 (or its alternative, per condition 3), C4 and D2 are raised with his wording. "No problems found." is replaced by his C5 text.
7. A repeat of a system part is removed from the body only under part 1, condition 4. Otherwise it stays and C4 is raised. A numbered paragraph of facts is never removed. The word SYSTEM in brackets never reaches the document.
8. "described" is stored no longer than the brief, under the same protection, and is never written to logs or error reports (part 2, condition 6).
9. Tests with a stubbed model cover her two matters: a stitched draft comes out as one document or raises C4; a moved or missing date raises C1 or D2; a missing fact raises C2; "three days" raises C3; the 15 days of a section 138 notice does not.
10. Every one of Ajay's conditions in both parts is either met or listed in the pull request as not met, with the reason.

## Out of scope (their own tickets)

- The verification template ending "Deponent" and signed by an applicant in custody: T-143.
- The same old instruction lines in `bail_anticipatory` and `suspension_of_sentence`: T-144.
- The prompt for documents with no rule pack: T-145.
- The old-law conversion tables and the wording of the old-law finding: T-139.
- Which document is picked, the questions asked and the court list: T-134, T-139, T-140.

## Notes

- No draft has been made with the real model since the first run. A pass on stubbed tests is the developer's own check. Anushka tests on `develop` before GTM (founder, 7 Oct 2026).
