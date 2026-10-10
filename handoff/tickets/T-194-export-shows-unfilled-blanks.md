# T-194 — Exports show every blank still to be confirmed

| Field          | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                        |
| Owner          | Rajesh (design of the warning). Vishal (build). Ajay (signs the header text and the blank style). Anushka (verdict)           |
| Mode           | Design first (Rajesh), then build, full chain. Merge to develop                                                               |
| Status         | To do. Needs Rajesh's design first                                                                                            |
| Size           | Design S (0.5 day). Build M (1 day)                                                                                           |
| Depends on     | T-147c (already writes `[To be confirmed: label]` in plain text)                                                              |
| Gate           | Go-live blocker (Ajay): blocks v1 go-live (T-403). Priya reads it as also blocking `feature.fact_ledger` for real users; Ajay to confirm |
| Branch         | feature/t-194-export-shows-blanks                                                                                             |
| Legal sign-off | Needed. Ajay calls the visible blank a legal requirement                                                                      |
| Created        | 2026-10-10                                                                                                                    |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                                |

## Problem

T-147c puts `[To be confirmed: label]` in the draft as plain text. In an exported DOCX or PDF it looks like any other text, so an advocate can file a document with a blank in it without noticing.

## User

District court advocate who exports a draft to file it and must not file one with unconfirmed facts in it.

## Solution

- Every `[To be confirmed: label]` in an exported DOCX or PDF is bold and highlighted.
- Exporting a draft with blanks shows a warning with the count before the file is made.
- Such an export prints "DRAFT — N items to be confirmed" in the header.

## Acceptance criteria

1. Rajesh designs the warning before export (where it shows, its wording, the buttons). The design is a claude.ai artifact, as with T-109.
2. In the DOCX, each blank is bold and highlighted.
3. In the PDF, each blank is bold and highlighted.
4. A draft with N blanks shows the warning with N before export. The advocate can go back and fill them or export anyway.
5. A draft with N blanks prints "DRAFT — N items to be confirmed" in the header of every page of both formats.
6. A draft with no blanks exports with no warning and no header, as today.
7. N counts every blank in the document, including the cause title, prayer and verification.
8. Ajay signs the header text and the blank style in this file.
9. Tests: 0, 1 and several blanks, in both formats. `apps/web` has no tests, so the web warning carries a manual check.

## Out of scope

- The plain-text substitution (done in T-147c)
- Blocking export altogether
- The watermark question (separate, open with Vikram and Meera)

## References

- T-147c, T-188, T-109
