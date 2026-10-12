# T-280 — Section converter: the "Title:" line never shows

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (decides when titles may show) |
| Mode           | Small fix (web) |
| Status         | Merged into develop_staging (d80774f, 12 Oct 2026). Waiting for Anushka on develop, after the founder reseeds develop |
| Depends on     | T-277 merged (corrected BNS titles) |

`apps/web/src/app/tools/section-converter/page.tsx` reads `mapping.title`, but the API returns `old_title` and `new_title`, so the "Title:" line never shows.

Do not fix this before T-277 lands: the BNS titles in `bns-offences.json` are wrong for about 65 sections today, and showing them would put wrong titles on a public page.

## Acceptance criteria

1. The page shows the old and new titles from `old_title` and `new_title`.
2. Only after T-277 is merged and seeded; Ajay confirms the titles shown are his signed ones.
3. Manual check at 375 and 1280 px in the report (`apps/web` has no tests).
