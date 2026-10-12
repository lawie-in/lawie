# T-291 — Section chips: the remove "x" is too small to tap

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build, web). Rajesh (look). Anushka |
| Mode           | Small fix (web) |
| Status         | Merged into develop_staging (38433f3), waiting for Anushka on develop |

The remove "x" on each section chip in `apps/web/src/components/form/DynamicFormRenderer.tsx` is 12 px, far under the 44 px tap target. On a phone it is hard to hit and easy to miss.

## Acceptance criteria

1. The remove control has a 44 x 44 px tap area (the icon can stay small), with an accessible label naming the section it removes.
2. No other change to the picker. Can ship with T-290 or alone.
3. Checked at 375 px.

## Scope added (Priya, 12 Oct 2026)

The file-list remove "x" in the same file (about line 627) has the same 12 px problem. Fix it the same way in this ticket.

## Design decision (Rajesh 20cd430, Priya 12 Oct 2026)

Build to `handoff/design/T-291-remove-tap-target.md`: a visible "x" button outside the pill. Under 640 px it is 44 x 44 px; from 640 px up it is 24 x 24 px (accepted: pointer devices, and 24 px meets WCAG 2.2 AA target size). AC1 reads: 44 px on phones, at least 24 px on wider screens, no overlap between targets.
