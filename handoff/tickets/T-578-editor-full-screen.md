# T-578: Full-screen editor; put the editor above the fold

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — UI (founder request 23 Oct 2026, from a screenshot of a draft on develop) |
| Owner  | Rajesh (design), Kunal (build; web) |
| Mode   | Small fix (web only) |
| Status | To do. Needs Rajesh's design note first. Priya, 23 Oct 2026 |
| Source | Founder screenshot: the editor sits low on the page, below the disclaimer banners and the Annexures card, and there is no full-screen option |

## Problem
On the document page (`apps/web/src/app/dashboard/documents/[id]/page.tsx`) the editor starts below the draft banner, the disclaimer line and the Annexures card, so on a laptop most of the draft is below the fold. There is no way to expand the editor.

## Acceptance criteria
1. A full-screen (focus) control on the editor toolbar that expands the editor to the whole window and exits with a control and the Escape key; unsaved edits and the autosave state are unaffected.
2. In the normal view the editor starts higher: Rajesh decides whether the Annexures card collapses into a one-line row and whether the disclaimer lines move; no signed copy changes wording or disappears (Ajay confirms if any line moves).
3. Works at 390, 768 and 1280, both themes; keyboard and focus order correct; reduced motion respected.
4. Tests, including one Playwright check at the three widths.

## Files
Claimed by Priya when Kunal starts: `apps/web/src/app/dashboard/documents/[id]/page.tsx`, `apps/web/src/components/editor/DocumentEditor.tsx`, `Toolbar.tsx`, `AnnexuresCard.tsx` (layout only), their tests.
