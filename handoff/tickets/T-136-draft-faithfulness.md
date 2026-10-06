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

## Packet for Vishal (Priya, 7 Oct 2026, 01:3x)

Take this ticket through the full chain and open the pull request to `develop`. Do not merge.

**Already on this branch, from a session that ran out of usage part-way**

- `apps/drafting/src/services/drafter.prompts.ts`: both prompts are Ajay's signed text. Checked against part 2 of the signed file character for character. **Do not edit this file.**
- `apps/drafting/src/services/brief-drafter.ts`: new and not yet called from anywhere: `SystemText`, `systemTextAround`, `removeRepeatedParts`, `checkOneDocument`, `checkBriefIsUsed`, `checkPeriods`, `packTexts`. `DrafterBrief` gained `described`; `drafterBrief` takes a fourth argument.
- `apps/drafting/src/services/intake-text.ts`: new `datesAsWritten`.
- `tsc --noEmit` on `apps/drafting` passed. Nothing else was run and no tests were written. Treat this code as an unfinished draft: read it against the criteria and the signed conditions, keep what is right, fix what is not.

**Left to build**

1. Wire it into `streamGenerateFromBrief` in `ai.service.ts`: the first call and the repair call both get the text of the system's parts; the brief carries `described`; repeats are removed only as part 1 condition 4 allows; then the new findings run. Check the repair call's user prompt carries DOCUMENT and COURT RULE, since the signed A2 says it is given them.
2. Send the description, as typed, from the web (`OneFlow.tsx`) to the generate route. Follow how the intake cache holds the brief today for storage and protection. Keep it out of every log and error report.
3. Brief screen: Ajay's line from part 2, condition 2, word for word, near the confirm button, with the existing way back to the description. Reuse the existing components. No new layout.
4. Checks panel: his C5 text in place of "No problems found."
5. Rule packs, copied from the signed file and never retyped: `bail_regular.json` (B1 to B5 and the clause `earlier_applications`; keep the clause id `no_flight_risk` and change only its name and description) and `legal_notice_s138.json` (instructions 7, 8, 9). Read `.claude/docs/golden-snapshots.md` first. Never auto-update a snapshot.
6. Tests for every new function and for criterion 9. The model is stubbed.

**Decided already**

- C3: try to meet part 1 condition 3. If it cannot be done reliably, use his alternative C3 wording and say so in the pull request.
- A condition that cannot be met is listed in the pull request under "Conditions not met", with the reason. Never dropped silently.
- No real model call is available. Claim what the tests show, not that the faults are fixed.

**The pull request**

- Title: `fix(drafting): the draft is one document and keeps the facts (T-136)`.
- Body: what changed; "What a user can now do" in a user's words; what was run and what was not; each of Ajay's conditions as met or not met.
- Above the quality line: "Founder's decision, 7 Oct 2026: Anushka tests on develop before GTM; this pull request does not wait for a verdict of its own." Last line: `Quality: waiting for Anushka`.
- CI green on the last push.
