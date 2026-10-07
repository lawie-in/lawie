# T-108 — Cost and price for guided drafts and page reading

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Phase      | 2 — Drops pricing                                                    |
| Owner      | Vikram (analysis), Vishal (query)                                    |
| Mode       | Analysis, no code change                                             |
| Status     | Blocked: T-106, T-111 and T-205 running in dev, for measured numbers |
| Depends on | T-003, T-106, T-111, T-205                                           |
| Branch     | None                                                                 |
| Created    | 2026-10-04                                                           |

## Goal

A measured cost for guided drafts and for reading pages, and a price for each that the founder signs.

## Context

- Founder, 4 Oct 2026: the cost of the multi-step pipeline must be analysed, and image cost must not rise sharply.
- Estimates so far (ADR-019, sections 3.9 and 3.15): a 25-paragraph guided draft costs about ₹4 on Haiku 4.5 and about ₹10.5 with a Sonnet-class Drafter and Reviewer. Reading a page costs about ₹0.15 on Haiku and about ₹0.45 on a Sonnet-class model.
- OCR does not reduce the cost: Textract is about ₹0.14 a page and the text still has to be read by the model.
- Proposals to test: a base of 100 drops for guided drafts, 3 drops for each page after the first 5, and a cap of 30 pages per draft.
- The method is the same as T-004: real calls in dev, then read-only queries on `generations` and the new `LlmAuxCall` collection.
- Updated 4 Oct 2026 (01:59): no Reviewer step. Models are final: Haiku for Reception, Sonnet for drafting. New estimate for a 25-paragraph guided draft is about ₹5.5, which fits the current formula.
- Two new prices to set: the review by agent (proposed 30 drops, estimated cost ₹2.3) and a revision (proposed three quarters of the original charge, estimated cost ₹5.4).

## Acceptance criteria

- At least 20 guided drafts are measured, light and strict, with the cost of each step shown separately.
- At least 50 pages are read and measured, including Hindi and handwritten pages.
- At least 20 reviews and 20 revisions are measured.
- A table shows cost against price for 10, 25 and 50 paragraphs, with and without a revision.
- A recommendation covers: whether guided drafts need a different base, the price of a review, the price of a revision, the charge per page, and the page cap.
- The founder signs off and the result is logged in the Decisions Log.
- Guided drafts and page charges do not go live until this is signed.

## In scope

- Read-only queries and a written result saved in this file

## Out of scope

- Any code change
- Changing plan prices or top-up packs

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed
