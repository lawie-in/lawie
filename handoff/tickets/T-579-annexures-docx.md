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
