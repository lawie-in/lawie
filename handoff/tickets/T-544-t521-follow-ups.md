# T-544: T-521 follow-ups (intake and editor)

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                          |
| Owner  | Lead (build), Rajesh reviews, Ajay for any new string           |
| Mode   | Full chain (web)                                                |
| Status | To do. Not a v1 blocker except where marked. Priya, 21 Oct 2026 |
| Source | Kunal's T-521 report; Rajesh and the fifth reviewer             |

## Items

1. `draftActions.ts` Finalise uses raw `fetch` like the editor page. Use `apiFetch` so a 401 after a long generation refreshes the session.
2. Focus moves to Export on success even if the user tabbed elsewhere while saving. Move it only if focus is still on Finalise.
3. DraftReadyStep title is `nl-h2`; the page title should be the document name in `nl-h1` (Rajesh).
4. Documents table: the title column truncates at 220px; the full title goes in the link's accessible name (Rajesh).
5. Inkwell under reduced motion shows the real level, static, not a fixed 60% (`components/ui/Inkwell.tsx:45`; DESIGN.md already says so).
6. Not yet restyled: BriefStep main screen, Questions, NoMatch, Browse, editor header, toolbar and side cards. Rajesh sets the order.
7. Remove `NightScope` once the dashboard layout covers all routes.
8. Seal on DraftReady when AJ-511-M17 signs the text (keep the slot).
9. Regenerate, and the "Checks: N items" chip wording: both need Ajay wording first.
10. A real-browser and screen-reader pass (T-521 was tested in jsdom only). Fold into T-523.
11. Thousands separator on the Ink chip (99,999, not 99999); Rajesh rules the format.
12. Destructive hover goes from Oxblood to Oxblood High (Rajesh, T-531 F2).
13. Rajesh's T-531 nits: N1 theme fieldset 48 to 44px; N2 same Control Line border on the language and theme toggles; N3 CommandBar to z-[60]. Rajesh to note in DESIGN.md that blocking prompts (VerifyEmailModal 55/56) sit below Dialog (60).
14. The template flow (`dashboard/new`) shows no Ink chip and never refreshes the Ink pill (found by Vishal, T-545). Needs Ajay for any new chip placement.

## Acceptance criteria

Each item done or moved with a reason; tests for 1, 2 and 5; Rajesh signs the restyled screens.

## Added 22 Oct 2026 (Rajesh)
15. Legacy cleanup: any legacy z-50 overlay still alive after the shell rebuild (credits modals, `DeleteDocumentDialog`) moves to z-[60], because the CommandBar now sits above them. Goes with the legacy-cleanup ticket, not T-544's build.
