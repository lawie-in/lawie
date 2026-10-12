# T-274 — Editor: plain-text drafts must escape "<" and "&"

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build) |
| Mode           | Small fix (web) |
| Status         | Merged into develop_staging (346cde7), waiting for Anushka on develop |
| Depends on     | T-233 + T-271 merged (same web area) |

`textToHtml` in `apps/web/src/components/editor/DocumentEditor.tsx` does not escape `<` (and `&`) when it turns a plain-text draft into HTML. A draft containing "a < b" or "<script>" text can lose text or render as markup in the editor.

## Acceptance criteria

1. A plain-text draft containing `<`, `>` and `&` shows exactly that text in the editor and exports it unchanged.
2. A manual check in the report (`apps/web` has no tests).

## Added 12 Oct 2026 (Mahak's reviewer, T-233)

- CRLF line endings are not split into paragraphs.
- The copy of `plainTextToHtml` in `exportUtils.ts` also needs escaping: its output goes into `innerHTML` in the PDF fallback.
- AC: a plain-text draft with CRLF breaks into the same paragraphs as with LF, and `<`, `>`, `&` come through as text in the editor, DOCX and PDF fallback.
