# T-579: Annexures as an editable Word file (not only PDF)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Product (founder request 23 Oct 2026) |
| Owner  | Arjun (design), Rajesh (button), Ajay (check the annexure text), a lead (build; drafting, web) |
| Mode   | Full chain (drafting + web) |
| Status | To do. Needs Arjun's note on how the annexure document is built. Priya, 23 Oct 2026 |
| Source | Founder: the Annexures are not editable; give a docx option instead of only a PDF |

## Problem
"Create annexures" produces only a PDF (`AnnexuresCard.tsx` downloads `<title>_annexures.pdf`), so the user cannot edit an annexure before filing.

## Acceptance criteria
1. Next to the PDF, a Word (.docx) download of the same annexures, with the same content and order, and the same signed headings and footer as the PDF; blanks the user still has to fill stay visibly marked.
2. Opens in Word and LibreOffice with editable text (no images of text); Hindi text renders.
3. Same eligibility, rate limits and errors as the PDF; no PII in logs; no extra Ink unless Vikram rules otherwise.
4. Reuse the existing Word export path used for the draft where possible (`exportUtils.ts`) and the drafting service's annexure builder; one source for the annexure content, two renderers.
5. Tests for both renderers; Ajay byte-checks the text once.

## Files
Claimed by Priya when a lead takes it: `apps/web/src/components/editor/AnnexuresCard.tsx`, `exportUtils.ts`, the drafting annexure route and service (Explore finds them), tests.

## Arjun (23 Oct 2026) — how it is built today, and the design

**Today:** `apps/drafting/src/services/annexures.service.ts` builds each annexure as an **HTML string** (memo of parties, synopsis, …, from `formData` + court rules), wraps it (`wrapHtml`), and `buildAnnexuresPack` renders the pages to one PDF with **Puppeteer/Chromium**. The route `POST /documents/:id/annexures-pack` returns `application/pdf`. The web's draft export already makes DOCX **client-side** with the `docx` package (`exportUtils.ts`, `htmlToDocxParagraphs`) — so the two renderers already exist, one on each side.

**Design — one source, two renderers, no new library:**
1. The service's HTML builders become the single source: factor `buildAnnexuresHtml(doc, rules) → { title, sections: [{ heading, html }], footer }` out of `buildAnnexuresPack`; the PDF path renders it as before.
2. New `POST /documents/:id/annexures-pack?format=html` (same auth, same eligibility, same rate limit, same `exportedAs` mark, same error bodies) returns that JSON. No PDF, no Chromium on this path, so it is cheaper than the PDF.
3. The web calls it and reuses `htmlToDocxParagraphs` + the existing blank-marker and header/footer code to build `<title>_annexures.docx`, with page breaks between annexures and the same signed headings and footer the PDF uses (same strings, same source). Hindi: the draft DOCX path already handles Devanagari runs; the annexure path uses the same run builder.
4. No Ink (same as the PDF today; Vikram may rule otherwise). Tests: a snapshot of the HTML source per annexure type; a DOCX test that unzips and checks heading order, footer text and that blanks are present as text; the PDF test unchanged. Ajay byte-checks the strings once — they do not change.
Rajesh: a second button beside the PDF, same card.
