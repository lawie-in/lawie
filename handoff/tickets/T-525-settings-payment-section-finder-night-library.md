# T-525: Settings, payment pages and section finder in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (spec sections 06, 07), a web lead (build) |
| Mode   | Full chain (web) |
| Status | Merged into develop_staging fe5e5078 (21 Oct 2026). Follow-ups: T-530, T-531, T-535. Priya |
| Source | Rajesh's T-520 review point (d); Tanvi's SectionFinderPanel finding |

## Problem
The new shell applies on `/dashboard` only. Settings (with the T-509 plan section), the payment success page and the section finder still use the old look, so the look flips between routes. The old SectionFinderPanel's fixed side tab overlaps content at 360px and its closed chips sit in the tab order.

## Acceptance criteria
1. Settings, payment success and templates pages use the Night Library shell and components, per spec sections 06 and 07; T-509 behaviour unchanged.
2. SectionFinderPanel no longer overlaps content at 360px and closed chips are not tabbable (hidden or inert).
3. One shell across all dashboard routes; the legacy sidebar is removed once nothing uses it.
4. Copy only from signed files; Rajesh reviews; browser check recorded.

## Files
apps/web: app/dashboard/settings/**, app/dashboard/payment/**, app/dashboard/layout.tsx (after T-520), components/billing/**, components/sections/**, components/dashboard/Sidebar.tsx. Not intake or editor (T-521).
