# T-281 — Section converter: sideways scroll at 375 px

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Rajesh if the fix changes the look |
| Mode           | Small fix (web, CSS only) |
| Status         | To do. Unassigned. Raised by Mahak (T-275 tester), 12 Oct 2026 |
| Depends on     | T-275 merged (same file) |

At 375 px the converter page (`apps/web/src/app/tools/section-converter/page.tsx`) scrolls sideways even before a search (scrollWidth 438). The "Look up" button in the search form overflows. Also cosmetic: "Check the Gazette" wraps to 3 lines in the narrow cell.

## Acceptance criteria

1. No sideways scroll at 375 px, before and after a search.
2. "Check the Gazette" is readable in its cell (wraps to at most 2 lines).
3. No text changes. Manual check at 375 and 1280 px in the report (`apps/web` has no tests).

## Added 12 Oct 2026 (Mahak's reviewer, T-275)

Type-only: `new_section` should be typed `string | null` in the converter page. Deferred from T-275 so Ajay's signed diff stays as signed.
