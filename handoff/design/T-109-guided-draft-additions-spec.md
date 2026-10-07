# T-109 hand-off spec: guided draft, document type, page charges, paid review and revision

| Field            | Value                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author           | Rajesh (designer)                                                                                                                                                   |
| Approver         | Meera (brand tokens)                                                                                                                                                |
| Design reference | https://claude.ai/artifact/8RB2R959ycrYd5FWinEfTM                                                                                                                   |
| Figma            | Not available. The Figma MCP call limit on the Starter plan blocked the build. Frames to be added to the T-005 file (`6FV11738gZut87KECjtFBn`) once the plan allows |
| Extends          | `handoff/design/T-005-describe-first-flow-spec.md` (tokens, components, accessibility and manual checks there still apply)                                          |
| Ticket           | `handoff/tickets/T-109-design-additions-for-guided-draft-and-pages.md`                                                                                              |
| Date             | 2026-10-04                                                                                                                                                          |
| Feeds            | T-105, T-106, T-111, T-205, T-301, T-304                                                                                                                            |

The reference page shows each screen at 1280 and at 360, with behaviour notes beside it. It is the design source until Figma frames exist. Layout, spacing, tokens and type follow T-005 exactly.

## 1. Flow with the additions

```
01 Describe (+ pages, PDF)
   ├─ template matched, sure ─────────────> 02 Follow-up ──> 03 Review details (titled with document type, "Not this document?")
   ├─ template matched, not sure ─> 02a Which document? ──┐                                │
   │                                 (up to 3 + None of these)                              ▼
   └─ no template ─> 02b Reception questions ─> 02c Brief (user confirms) ─────────> 04 Length + estimate (+ page charge)
                                                                                            │
                                                              05 Generating (05a: drafting only for a guided draft)
                                                                                            │
                                                           06 Draft ready (06a for a guided draft)
                                                              ├─ Review by agent ─> 06c confirm ─> 06d Review points ─┐
                                                              └─ Revise ───────────────────────────────────────────> 06e Revise
```

Guided drafts skip 03 and use the brief (02c) as their confirmation step. Nothing on screen names the route or the mode (light or strict).

## 2. Screens

| #   | Screen                            | New or changed                   | Ticket              |
| --- | --------------------------------- | -------------------------------- | ------------------- |
| 01a | Describe, pages attached          | Changes 01                       | T-301, T-304        |
| 02a | Which document do you need?       | New variant of 02                | T-101, T-103        |
| 02b | Reception questions               | Reuses 02                        | T-105               |
| 02c | Check your brief                  | New                              | T-105               |
| 03a | Review details with document type | Changes 03                       | T-104               |
| 04a | Estimate with page charge         | Changes 04                       | T-203, T-304        |
| 05a | Generating, guided draft          | Variant of 05                    | T-106               |
| 06a | Draft ready, guided draft         | Changes 06                       | T-106, T-111, T-205 |
| 06c | Review by agent confirm           | New dialog (bottom sheet at 360) | T-111               |
| 06d | Review points                     | New                              | T-111               |
| 06e | Revise your draft                 | New                              | T-205               |

Not redrawn because they do not change: 01, 02, 03 fields, 05, 06b (regenerate), 07 and 08 from T-005. Regenerate (06b) stays for template drafts. For a guided draft the same-inputs regenerate is replaced by Revise, which takes instructions.

## 3. Screen notes

### 01a Describe, pages attached

- Page meter under the files: "N of 30 pages". The first 5 are teal, pages after that are gold.
- Text under it: "First 5 pages are free. 4 more pages add 12 drops to the estimate." The rate and cap come from settings (T-108).
- Each file shows its page count. PDFs and images count together.
- At 30 pages, Attach is disabled and says "Limit reached. Remove a page to add more." A file that would pass 30 is refused with the same message.
- The consent line from T-302 still shows before the first upload.

### 02a Which document do you need?

- Up to 3 radio cards plus "None of these". The closest match is pre-selected.
- Each card has the plain document name and a one-line description. No internal template text, no confidence figure.
- "None of these" continues to 02b. "Edit my description" returns to 01 with text and files kept.

### 02b Reception questions

- Same screen as 02. Header "Round 1 of 2 · N questions", up to 5 a round, 2 rounds.
- Free-text fields. Any may stay empty. Skipped answers become visible blanks in the draft, and the screen says so.
- "Skip these questions" goes straight to the brief.

### 02c Check your brief

- Parts, in order: kind of document, parties, facts, what is asked for, court, dates, and "Still unknown".
- Every part is editable in place. Continue is the confirmation and is labelled "Confirm brief and continue". No separate checkbox.
- Parties, court and dates always carry a gold "Please check" tag.
- "Still unknown" lists each unknown with the placeholder the draft will use, for example "[Section — verify before filing]", and an "Add it" link.
- "More questions" shows only while a round is left.

### 03a Review details with document type

- Eyebrow "Review details". Page title is the matched document name. Under it, the link "Not this document?" opens 02a. Entered details that match the new document's fields are kept.
- The rest is as T-005 screen 03.

### 04a Estimate with page charge

- A gold-tinted row "N pages after the first 5 × 3" appears only when more than 5 pages are attached. The total includes it.
- Everything else is as T-005 screen 04.

### 05a Generating, guided draft

- Two steps only: reading the confirmed brief, writing the draft. No reviewing or revising step.
- The rule checks run silently at the end. Their results show on 06a.
- Fall back to the moving bar alone if the service cannot report progress.

### 06a Draft ready, guided draft

- Label "Starting draft — review before use · not court-verified" is always visible, cannot be dismissed, and prints in the PDF and DOCX footer.
- "Checks run for you" card lists the free rule-check findings: old-law references, section-number checks, court format. It always shows, with "No problems found" when empty. Tag "No charge".
- Two paid cards, each with its cost in drops on the card and on the button: Review by agent (30 in the examples) and Revise (65 in the examples).
- Strict-mode draft: the review card has a gold border and the tag "Recommended for court documents" and sits next to the draft, above Revise. Light mode shows it as a normal card. The mode is never named.
- If the balance is under a cost, the button opens the low-balance dialog (T-005 07).

### 06c Review by agent confirm

- States the cost, the balance after, that the draft is not changed, and that a failed review is not charged.
- Escape and Cancel close it with nothing charged. Focus returns to the opener.

### 06d Review points

- Shows "N points" and "Review charged: 30 drops". The page says nothing in the draft was changed.
- Each point has a type tag (invented fact, invented citation, missing part, contradiction), where it is, and what is wrong, with a checkbox. Select all and Select none sit above.
- "Revise with N points · cost" goes to 06e with those points attached. With no points the panel says "No problems found" and shows only Back.

### 06e Revise your draft

- Points from the review show as removable chips. The "What should change?" box is required unless a point is attached.
- Cost box: cost, balance after, earlier version kept as Version 1, new one is Version 2, failed revision not charged.
- The primary button carries the cost and is the confirmation.
- The new version keeps the guided-draft label.

## 4. Numbers used (examples only)

| Item            | Example                           | Real value from                              |
| --------------- | --------------------------------- | -------------------------------------------- |
| Pages           | 9 pages, 5 free, 4 × 3 = 12 drops | T-108 (proposed 3 per page, cap 30)          |
| Review by agent | 30 drops                          | T-108 (proposed)                             |
| Revision        | 65 drops (three quarters of 86)   | T-108 and the founder. T-205 still says half |
| Guided draft    | 86 drops (50 + 18 paragraphs × 2) | Decided formula                              |

The screens show whatever the service returns. None of these numbers are hard-coded in the UI.

## 5. Manual checks to add to the T-005 list

Check at 360 px and 1280 px.

1. Attach a 7-page PDF and 2 images: meter reads 9 of 30, extra charge reads 12 drops, estimate includes it.
2. Try to pass 30 pages: blocked with the message, Attach disabled.
3. With 5 pages or fewer, the page row is absent from the estimate.
4. A medium-confidence request shows at most 3 choices and "None of these". "None of these" leads to the questions.
5. Reception: 5 questions or fewer a round, 2 rounds, every question can stay empty.
6. Brief: every part editable, Parties, Court and Dates tagged, unknowns listed with their placeholders, Continue reads "Confirm brief and continue". Nothing is drafted before it.
7. Review title shows the document name. "Not this document?" opens the choices and keeps matching details.
8. Guided Generating shows only the reading and writing steps.
9. Guided Draft ready shows the full label, the free checks (including an empty case), and both paid controls with costs.
10. Strict-mode draft: review card is emphasised and sits next to the draft. The words "strict" and "light" never appear.
11. Review: confirm dialog shows cost and balance. Cancel and Escape charge nothing. A failed review charges nothing.
12. Review points: select all or none, remove one, Revise count and cost update. Revise with points opens 06e with chips.
13. Revise: empty box allowed only with a point attached. A failed revision charges nothing and Version 1 is kept.
14. Balance below a cost opens the low-balance dialog instead of running.
15. Keyboard only through the new dialogs and the brief. No horizontal scroll at 360.

## 6. Open items

- Revision price: T-205 says half, the ADR proposes three quarters. Founder or Vikram to settle.
- Prices for pages, review and revision are pending T-108.
- Label wording, the "Please check" tags and the placeholder text need Ajay's sign-off with T-107.
- Figma frames are still to be added to the T-005 file.
