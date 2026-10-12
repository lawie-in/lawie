# T-296 — Section converter: leftovers from T-281

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build, web). Rajesh if the look changes |
| Mode   | Small fix (web) |
| Status | Building: tanvi (12 Oct 2026) |

T-281 left two items in `apps/web/src/app/tools/section-converter/page.tsx`:

## Acceptance criteria

1. Bulk results rows do not overflow at 375 px (add `min-w-0` / `break-words` where needed).
2. A row of type `new_section` shows a proper label, not a raw value. If it needs words, Ajay signs them.
3. Checked at 375 px; no other change.
