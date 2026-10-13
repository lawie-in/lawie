# T-391 — "Use template" links open that template

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) |
| Mode   | Small fix |
| Status | To do. Not assigned. new/page.tsx is held by Mahak (T-365) and then Vishal (T-373), so this goes after them. Found by Shashank in T-367, 13 Oct 2026 |
| Source | T-367; matches Anushka's T-240 finding "Use template drops the template" |

## Problem

`apps/web/src/app/dashboard/new/page.tsx` never reads `?type=`. Every `/dashboard/new?type=…` link opens the plain new-draft page. That includes the timeline tracker's CTA, the bail checker's link and the dashboard tiles.

## Acceptance criteria

1. `/dashboard/new?type=<id>` opens the new-draft flow with that template already chosen. An unknown id, or one hidden by a T-375 switch, falls back to the plain page.
2. Every in-app link that passes `?type=` lands on its template. A test covers each link.
3. An end-to-end web test drives `/dashboard/new?kind=` and `?type=` through new/page.tsx and OneFlow together (Mahak's T-365 should-fix).
4. After this merges, T-367's CTA can switch to `default_bail` with Ajay's original question. Ajay's alternative wording stays until then.

## Note (Priya, 13 Oct 2026)

Mahak's T-365 AC5 adds a OneFlow preset through `?kind=` on new/page.tsx. Check what it already covers before building this. T-391 may only need the old `?type=` links mapped onto it.
