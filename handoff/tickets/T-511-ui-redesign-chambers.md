# T-511: V1 UI redesign: Chambers look with a command bar

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (design), Arjun, Meera (design or review), a lead (build) |
| Mode   | Full chain |
| Status | To do. V1 (Priya, 17 Oct 2026). Unassigned until Priya claims a lead |
| Files  | apps/web (design system, dashboard, intake entry, editor, settings, billing) |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

Decision (Priya with the team, 17 Oct 2026): direction is Chambers (cream paper, navy, gold hairlines, serif headings, drafts shown as paper pages) plus a persistent 'What do you need to draft?' command bar with Ctrl+K and visible buttons, so mobile and first-time users are never lost.

## Acceptance criteria

1. Rajesh delivers, in order: design tokens (one source of truth), dashboard, describe-first intake entry, editor and draft-ready view, settings and billing. Mobile first at 360px and a wide desktop layout.
2. One colour source replaces the clashing sets; Devanagari font added for Hindi (Mukta or Noto Serif Devanagari; Arjun approves).
3. Arjun approves the one new UI library for the command bar and the missing parts (tabs, select, popover, tooltip).
4. Gold is for fills and borders, never small text. Dashboard shows the eight KPIs from the checklist; no time-saved tile until a measured basis exists.
5. Every screen has empty, loading and error states. Ajay checks any new claim or label. Anushka tests the whole flow before release.
