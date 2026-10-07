# T-136 — The draft is one document and keeps the facts as given

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                        |
| Owner      | Vishal (cause and fix), Ajay (the rule on facts), Anushka (verdict)                                           |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-136-draft-is-one-document-and-keeps-the-facts                                                           |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

A draft is one clean document that says what the brief says: no fact changed, added or dropped.

## What Anushka found

- **Blocker.** In the bail draft: arrest date changed (12 September given, "13.09.2026" drafted), "in custody for approximately three days" on a draft dated 6 October, the earlier bail rejection of 22 September left out while the verification says nothing is concealed. Added without being given: "mistaken identity and/or enmity with the informant", "deep roots in the community", "cooperating fully", "custodial interrogation is no longer required". Grounds she did not select appear. "Only earning member" and the jail name dropped.
- **Major.** Both drafts arrive as two documents stitched together: cause title and addressee twice, a second "To, The District & Sessions Judge", "AFFIDAVIT IN SUPPORT OF BAIL APPLICATION" over the body, verification signed "DEPONENT" by a man in jail. In the notice: "TO WHOM IT MAY CONCERN", a second TO/FROM block, the demand three times, "Yours faithfully" twice, and the text "[Advocate Signature Block — SYSTEM]" printed in the body. The date the bank memo was received is dropped.
- **Major.** "Checks run for you" said "No problems found" on the notice and raised one unrelated point on the bail draft. It missed all of the above.

## Acceptance criteria (draft, Priya to confirm)

- Each fault above is reproduced first, with the brief and the draft side by side, and its cause is written here.
- The same two matters drafted again give one document each, with every fact from the brief and none that is not in it.
- The checks catch a changed date, a dropped fact and a duplicated part, or the panel stops saying "No problems found".
- Anushka tests again from the start and her verdict is PASS.

## Notes

- This is the flow built in T-105, T-106 and T-125 on 5 and 6 Oct 2026. It was passed on tests with a stubbed model. No draft had been made with the real model before her run.
- Touches legal-content paths. Ajay's sign-off is needed for any change to prompts or rules.

## Cause, traced in the code (Vishal, 6 Oct 2026, 23:4x). Read from the code; not reproduced with the real model

**Two documents stitched together**

- The system adds the cause title, heading, "TO, THE HONOURABLE … MOST RESPECTFULLY SHOWETH:", prayer, verification and advocate block from the template (`docs/templates/*.json`). The Drafter writes the body in between.
- The Drafter is told only the names of those parts ("cause title", "addressing clause" …), not their text. It does not know the addressee and the opening are already on the page, and rule 8 of its prompt lets it write "any part this kind of document needs that is not listed". So it wrote its own title, its own "To," block and its own closing. In the notice the template also adds a header, a demand and "Yours faithfully", so each appeared twice or more.
- "[Advocate Signature Block — SYSTEM]": the Drafter wrote its clause-report word into the document. Nothing strips it.

**Facts added**

- The pack's drafting instructions were written for the old form pipeline and order the grounds: "no prior criminal history, cooperation with investigation, roots in community … investigation complete", and "Include standard undertakings". The clause "No Flight Risk" is mandatory for every bail draft. The prompt says the facts rule wins, but the instructions invite exactly what she saw: "deep roots in the community", "cooperating fully", flight-risk paragraphs she did not select.

**Facts changed**

- "Three days in custody": the pack instructs "total days in custody". The Drafter is not given today's date and is asked to do arithmetic.
- Arrest date 12 September drafted as 13.09.2026: not known yet whether the brief held it wrongly (intake) or the Drafter moved it. Needs the saved brief of document `6ac4e3ad096b376f03ce168d`.

**Facts dropped**

- The bail rejection of 22 September, "only earning member", the jail name, the bank memo date: not known yet whether they reached the brief. If they sat under "other" in the brief, nothing requires the Drafter to use them. Needs the same saved brief, and the notice's (`6ac4e5b9096b376f03ce16e6`).

**Why "Checks run for you" missed it** (`checkAgainstBrief`, `brief-drafter.ts`)

- It flags only a date that is nowhere in the brief and a section that is in neither the brief nor the pack. 13.09.2026 was in the brief (custody), so moving it to the arrest is not caught. Nothing checks that every fact of the brief is in the draft, that a part appears once, or a figure like "three days".

**To confirm on the Mac (read only, the database):** the saved brief and the Drafter's raw text for the two documents above.

**Direction, for Priya and Arjun to scope and Ajay to sign (prompts and packs are legal content):**

1. Give the Drafter the text of the system parts and tell it to write numbered paragraphs only.
2. Remove from the packs the instructions that order grounds and undertakings the brief does not hold; make a ground appear only when the brief has it.
3. Give today's date, or have code compute custody days.
4. Checks both ways: every brief fact appears; a part appears once; no bracketed system word; and no "No problems found" when a check could not run.
