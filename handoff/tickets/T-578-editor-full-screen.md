# T-578: Full-screen editor; put the editor above the fold

| Field  | Value                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase  | 4 — UI (founder request 23 Oct 2026, from a screenshot of a draft on develop)                                                                |
| Owner  | Rajesh (design), Kunal (build; web)                                                                                                          |
| Mode   | Small fix (web only)                                                                                                                         |
| Status | To do. Needs Rajesh's design note first. Priya, 23 Oct 2026                                                                                  |
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

## Build status (Kunal, 23 Oct 2026): HELD for the founder's decision on a round 3

Branch fix/t-578-editor-focus-mode (uncommitted in Kunal's worktree, base 540a45fa). Built: focus mode, notes row, Annexures one-line row (rail from lg), sticky footer, fixed name "Focus mode". Fold (editor root top, 768px viewport): 199.5 / 280.5 / 292.5 at 1280 / 768 / 390 (limits 220 / 300 / 300). Web jest 236 suites / 3618 tests green; the T-578 Playwright spec 25 passed / 0 failed on 3 projects.

- Review round 1 (FAIL), fixed in round 2: (1) the section finder (citation pill or Ctrl/Cmd+K) opened behind the focus layer and took focus; (2) Tab escaped the layer onto hidden page controls; (3) autosave text colour 2.4:1.
- Review round 2 (FAIL): one must-fix. If focus drops to <body> inside focus mode (a click on the Wall beside the sheet, toolbar gaps, or the footer text), the layer's key handler no longer sees keys. Tab then reaches covered page controls, Ctrl/Cmd+K opens the finder behind the layer, and Escape does nothing (AC1). Tests missed it: the jest pull-back case cannot occur in a browser, and the Playwright sweeps always start in the editor. Should-fixes: Ctrl+K within 150 ms of exit can pull focus out of the finder; a likely race in the tablet-768 night spec (one-shot read of html overflow); slate-600 save-state text is fragile if the toolbar is tokenised.
- Proposed narrow round 3 (about 5 lines plus tests): developer sets tabIndex={-1} plus outline-none on the layer root while open (a blank click then focuses the root, inside the layer) and fixes the two should-fixes; the tester adds a Playwright case that clicks the Wall at 1280, then checks Tab, Escape and Ctrl+K, and swaps the jest pull-back test for one dispatched from body; a fresh reviewer checks only the handler and that case.
- Accepted: Annexures resets across 1024 px (Rajesh); two-line disclaimer at 390.
- Not done: the real citation-pill click in a browser (jest only); no real-browser screen-reader pass.
- Priya recommends: approve the narrow round 3. Not on Anushka's critical path.

## Arjun (23 Oct 2026) — after the second failed review: one narrow round 3 approved

Same standing approval as T-577: one round 3 limited to the ~5-line focus fix (focus drop to body must not re-open the two keyboard bugs) plus the one Playwright case that pins it. Nothing else in the diff. Same developer → fresh tester → fresh reviewer (`impeccable audit` on a11y/keyboard in the review, per ui-quality.md). A round-3 fail parks the ticket for the founder. Not on Anushka's critical path; it does not hold her batch.
