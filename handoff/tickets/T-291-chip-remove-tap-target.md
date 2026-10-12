# T-291 — Section chips: the remove "x" is too small to tap

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build, web). Rajesh (look). Anushka |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Found by Rajesh during T-290, 12 Oct 2026 |

The remove "x" on each section chip in `apps/web/src/components/form/DynamicFormRenderer.tsx` is 12 px, far under the 44 px tap target. On a phone it is hard to hit and easy to miss.

## Acceptance criteria

1. The remove control has a 44 x 44 px tap area (the icon can stay small), with an accessible label naming the section it removes.
2. No other change to the picker. Can ship with T-290 or alone.
3. Checked at 375 px.
