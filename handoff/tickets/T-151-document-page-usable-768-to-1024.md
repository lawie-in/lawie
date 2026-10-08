# T-151 — The saved document page is usable from 768 to about 1024 px

| Field          | Value                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live (a tablet upright or a phone sideways lands here) |
| Owner          | Vishal (build), Anushka (tests on develop before GTM)                                             |
| Mode           | Fix, full chain                                                                                   |
| Status         | Ready for Vishal                                                                                  |
| Size           | S (two files in `apps/web`, same ones as T-138)                                                   |
| Depends on     | None. T-138 (PR #52) is merged into develop; cut from develop                                     |
| Branch         | fix/t-151-document-page-usable-768-to-1024                                                        |
| Legal sign-off | Not needed: no legal-content path is touched. If the fix needs one, that is a BLOCKED             |
| Design         | Not needed: reuses the one-page layout T-138 built. A new layout is a BLOCKED for Priya           |
| Created        | 2026-10-07                                                                                        |
| Source         | T-138 PR #52 report, "Noticed on the saved document page"                                        |

## What was found (PR #52, stubbed headless Chromium)

- At 768 px the draft text column is 22 px wide; PDF and DOCX are not painted.
- At 820 px DOCX is not painted. Usable from about 930 px.
- From 768 px up, a long unbroken title pushes save, PDF and DOCX out of reach (same on develop).

## Acceptance criteria (Priya, 7 Oct 2026)

1. At 768, 820, 900 and 1000 px wide the saved document page shows title, save status, save, PDF and DOCX all painted and clickable, and a draft text column at least 400 px wide. Nothing scrolls sideways.
2. Where two columns cannot give the draft 400 px, the page uses the one-page order T-138 built (title, buttons, draft, checklist, sections, info). Moving the two-column switch from `md:` to a wider existing breakpoint (`lg:` or `xl:`) is the expected fix; pick the narrowest one that meets criterion 1 and say which in the report.
3. A 80-character unbroken title at 768, 1024 and 1280 px wraps or truncates; save, PDF and DOCX stay on screen and clickable.
4. At 360, 390 and 500 px the page is as T-138 left it (same order, edit and autosave work). At 1280 px and above it is as today, except criterion 3.
5. No new component, layout or copy. Existing Tailwind classes only. No change outside `apps/web`.

## How to check

Same as T-138: run the web locally, stub the API in headless Chromium, measure the text column width and the button boxes at each width, before (develop) and after. Say what you saw at each width. Claim a stubbed check, not a real tablet.

## Out of scope

- Section finder covering the Ink balance (shared panel, needs Rajesh).
- A fixed save bar on phones (design decision).
- The court id under the title (outside `apps/web`).
