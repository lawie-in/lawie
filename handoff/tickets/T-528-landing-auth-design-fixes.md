# T-528: Landing, pricing and auth design fixes (Rajesh's review of T-517)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (review), Vishal (build) |
| Mode   | Small fix (web) |
| Status | In build: Vishal (21 Oct 2026). Must-fix before Anushka tests (Daylight contrast). Priya |
| Source | Rajesh's review of dcbd8a92 against DESIGN.md; Vishal's leftover should-fixes |

## Must-fix
1. `components/landing/LandingPage.tsx`: document spines draw their bands with `bg-nl-brass` (1.5:1 on oxblood by day). Use `--brass-mark`, as the dashboard does.
2. `LandingPage.tsx` and `pricing/page.tsx` alternate sections on `bg-nl-wood`. Wood is the shelf edge, skeletons and dividers, never a section band. One Wall ground; separate sections with the 1px Line hairline.

## Should-fix (Rajesh)
3. Plan card price in Tiro 34/40 so the price leads the card (today `nl-h2` 24px).
4. The three steps are plain text columns with a brass roman numeral (i, ii, iii), not bordered cards.
5. The top bar is sticky.
6. Login folio is 440px wide (today 448).

## Should-fix (Vishal's reviews)
7. Folio padding, selection and focus items still open; spine `focus-within` dead class; shelf `overscroll-x-contain`; the Hindi prompt height; any remaining items in his T-517 READY list.

## Later (own ticket when Ajay signs the demo text, AJ-511-M17)
The demo writes placeholder bars; the pen-writing step (12 to 14 ms a character, 220 ms between paragraphs) is built once the demo text is signed.

## Files
apps/web: components/landing/**, app/(marketing)/page.tsx, app/(marketing)/pricing/**, app/(auth)/**, tests.
