# T-304 — Attach PDFs as matter context

| Field      | Value                    |
| ---------- | ------------------------ |
| Phase      | 3 — Matter context       |
| Owner      | Vishal                   |
| Mode       | Full chain               |
| Status     | Blocked: T-301           |
| Depends on | T-301, T-108             |
| Branch     | feature/t-304-pdf-upload |
| Created    | 2026-10-03               |

## Goal

The user can attach a PDF, such as an order or a chargesheet, as reference for the draft.

## Context

- Founder, 3 Oct 2026: users may have a document they want to attach for reference.
- A long PDF can be far larger than five photos, so it needs its own limits.
- The same 10 MB request limit as T-301 applies.
- Founder, 4 Oct 2026: a user may upload a whole case file of 20 or more pages, and the cost must stay under control.
- ADR-019, section 3.9: OCR does not make reading cheaper. The controls are: read each page once, batches of 5, a page charge after the first 5, and a cap.

## Acceptance criteria

- The user can attach a PDF to the description.
- There is a page limit and a size limit, and a larger file is rejected with a clear message. Proposed: 10 pages.
- Scanned pages are treated like images. Text pages are read as text.
- The same rules as T-301 apply: confirm before drafting, no storage unless T-302 allows it, nothing in logs.
- Tokens are recorded in usage.
- If a PDF costs much more than five images, Vikram decides whether it adds drops, before this ships.
- Up to 30 pages per draft, sent in batches of 5. Pages after the first 5 carry a page charge shown in the estimate. The charge and the cap come from T-108.
- PDFs are split by our code into page images or plain text. Anthropic's PDF input is not used, because it sends each page as both text and image.

## In scope

- The same paths as T-301

## Out of scope

- Word files and other formats

## References

- Design: T-005
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026, section 3.9
- Legal sign-off: Ajay, T-302, 4 Oct 2026. Five conditions, listed in the T-302 Result section

## Review, 3 Oct 2026

| Reviewer | Verdict     | Note                                                                    |
| -------- | ----------- | ----------------------------------------------------------------------- |
| Arjun    | Approved    | Feasible after T-301. The page limit keeps it inside the request limit. |
| Ajay     | Conditional | Same as T-301.                                                          |
