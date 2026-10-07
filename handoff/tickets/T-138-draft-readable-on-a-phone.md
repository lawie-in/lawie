# T-138 — I can read my draft on a phone

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                        |
| Owner      | Rajesh (layout), Vishal (build), Anushka (verdict)                                                            |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-138-draft-readable-on-a-phone                                                                           |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

On a phone the saved document page shows the draft text.

## What Anushka found

- **Blocker.** At 500 px wide the bail document page shows the title, the PDF and DOCX buttons, then "FILING CHECKLIST", "SECTIONS CITED", "DOCUMENT INFO". The notice page shows no title or buttons either. The draft text is not on screen in any scroll direction. Seen on both saved documents.
- The FAQ says the site and the drafting flow work on mobile browsers.
- She could not go below 500 px, and no real phone was used.

## Acceptance criteria (draft, Priya to confirm)

- At 360 px and on a real phone, the draft text is readable and editable on the document page.
- The describe, questions, brief and draft-ready steps are checked at the same widths.
- Anushka tests again from the start and her verdict is PASS.
