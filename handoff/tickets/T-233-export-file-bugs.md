# T-233 — Exported files: empty DOCX and wrong-side PDF margin

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build), Anushka (verdict) |
| Mode           | Small fix (web) |
| Status         | Merged into develop_staging (0e965e7), waiting for Anushka on develop |
| Size           | S |
| Depends on     | T-194 (exportUtils.ts) |
| Gate           | Before v1 go-live: an empty DOCX is a broken download |
| Branch         | fix/t-233-export-file-bugs |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Mahak's T-194 developer, 11 Oct 2026 |

## Problem

In `apps/web/src/components/editor/exportUtils.ts`:

1. A DOCX of a plain-text draft nobody has edited may come out empty: `htmlToDocxParagraphs` skips non-element nodes.
2. The browser fallback PDF puts its 1.5 in binding margin on the right, not the left (html2pdf margin order in `exportPdf`).

(Bold, italic and underlined text exporting empty in DOCX is fixed by T-194's rework.)

## Acceptance criteria

1. An unedited plain-text draft exports a DOCX with its full text.
2. The fallback PDF has its 1.5 in margin on the left.
3. A manual check of both in the report (`apps/web` has no tests).

## Added (Priya, 12 Oct 2026, from mahak during T-194)

- A failed export after "Export anyway" is an unhandled rejection with no message to the user: `exportFile` in page.tsx has no catch. Show an error and let the user retry.

## Follow-up added (Ajay, T-194 sign-off 5640356)

- Make the blank-marker match case-insensitive. Low risk, and it needs no sign-off on its own.
