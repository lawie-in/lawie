# T-571: /dashboard/documents scrolls sideways below 1280px

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (UI defect; before Anushka, she tests on a phone width too) |
| Owner  | Kunal (build, small fix), Rajesh (design check) |
| Mode   | Small fix (web only) |
| Status | To do. Found by Kunal's Playwright matrix in T-523, 22 Oct 2026. Priya |
| Source | Kunal's T-523 step 2 report |

## Problem
`/dashboard/documents` scrolls horizontally below 1280px: scrollWidth 473 against a 390 viewport, 888 against 768. Likely the legacy (non-Night) dashboard shell in `app/dashboard/layout.tsx` or the table in `app/dashboard/documents/page.tsx` (~line 160). Not traced yet.

## Acceptance criteria
1. No horizontal page scroll at 390, 768 and 1280 on the documents list, in both themes (the table may scroll inside its own container if Rajesh agrees).
2. The four `test.fail` pins in the T-523 matrix are removed (they turn into an unexpected pass once fixed).
3. No change to signed copy; no layout change to other dashboard pages without Rajesh.

## Files
Claimed by Priya when a lead takes it (check Tanvi's T-565 and Kunal's T-523 rows first). After T-523 is pushed, so the `test.fail` removal lands on the right branch.
