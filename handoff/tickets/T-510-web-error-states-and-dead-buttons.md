# T-510: Web: error, loading and not-found screens; top-up error state; wire the profile page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Web lead (design or review), a lead (build) |
| Mode   | Full chain |
| Status | Merged into develop_staging eaaad92d, CI run 815 green, 17 Oct. Follow-ups: typing overwritten by an in-flight save goes into T-509; profile saves show the generic error until T-507 lands. Priya |
| Files  | apps/web (app-level error/loading/not-found, TopUpModal, settings profile card) |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

A failure can show a blank page, the Top-up modal spins forever when /api/billing/plans fails, and the profile Save button does nothing.

## Acceptance criteria

1. App-level `error.tsx`, `loading.tsx` and `not-found.tsx` with plain wording and a way back.
2. TopUpModal: when the plans request fails or returns non-OK, show an error and a Retry button.
3. Profile card: Save changes calls PATCH /me with the fields T-507 allows and shows saved or the error. Enrollment number field added.
4. Tests for the failure paths. No design change beyond using the existing brand tokens.
