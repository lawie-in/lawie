# T-524: Dashboard design fixes (Rajesh's review of T-520)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (review), a web lead (build) |
| Mode   | Small fix (web) |
| Status | To do. V1 (Rajesh review of 748a5264, 21 Oct 2026). Priya |
| Source | Rajesh against DESIGN.md |

## Acceptance criteria
1. Must-fix: KPI numbers in `components/dashboard/ShelfKpis.tsx` are Tiro 40px/44px per DESIGN.md Typography (today 24px and 18px).
2. Spine label (`components/dashboard/Spine.tsx`) is Tiro 15px; the finalised mark is the 26px seal mark.
3. Shelf edge (`Shelf.tsx`) is 10px wood; "Recent documents" is set as a Title (24px) with the tiles keeping their labels.
4. Tests updated; 360px still has no horizontal scroll; Rajesh re-checks.

## Files
apps/web: components/dashboard/** only.
