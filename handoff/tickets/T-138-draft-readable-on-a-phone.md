# T-138 — I can read my draft on a phone

| Field          | Value                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                            |
| Owner          | Vishal (build), Anushka (tests on develop before GTM)                                             |
| Mode           | Fix, full chain                                                                                   |
| Status         | Ready for Vishal                                                                                  |
| Depends on     | None                                                                                              |
| Branch         | fix/t-138-draft-readable-on-a-phone                                                               |
| Legal sign-off | Not needed: no legal-content path is touched. If the fix turns out to need one, that is a BLOCKED |
| Created        | 2026-10-06                                                                                        |
| Source         | Anushka's first run, 6 Oct 2026, verdict FAIL                                                     |

## Goal

On a phone, the saved document page shows the draft text, and the advocate can read and edit it.

## What Anushka found

- **Blocker.** At 500 px wide the bail document page shows the title, the PDF and DOCX buttons, then "FILING CHECKLIST", "SECTIONS CITED", "DOCUMENT INFO". The notice page shows no title or buttons either. The draft text is not on screen in any scroll direction. Seen on both saved documents.
- The FAQ says "Does Lawie work on mobile? Yes. The site and the drafting flow work on modern mobile browsers".
- She could not go below 500 px, and no real phone was used.
- Minor, same page: the Section finder panel stays open across pages and covers the Ink balance.

## Likely cause (Priya, read from the code, not reproduced)

`apps/web/src/app/dashboard/documents/[id]/page.tsx`, about line 296: the page is a column of fixed height (`h-[calc(100vh-4rem)]`, `flex-col`, `md:flex-row`). The draft column is `flex-1` with `overflow-hidden`; the side column (checklist, sections, info) is `shrink-0`. Below the `md` width the side column takes the height it wants and the draft column is squeezed to nothing. Confirm this in a browser before changing anything; if the cause is something else, write what it is in your report.

## Acceptance criteria (Priya, 7 Oct 2026)

1. At 360, 390 and 500 px wide, the saved document page shows, in this order from the top: the title, the export buttons, the draft text, then the filing checklist, the sections cited and the document info. The page scrolls as one page. Nothing is cut off and nothing scrolls sideways.
2. At those widths the draft can be edited and saved as it can on a desktop, and the starting-draft label and the checks panel, where the page shows them, are readable.
3. From 768 px up, the page looks and behaves as it does today.
4. The describe, questions, brief, generating and draft-ready steps of New document are opened at 360 and 390 px. Anything that is cut off, overlaps or scrolls sideways is fixed if it is a small layout fix in the same components, and otherwise listed in the report for a ticket of its own.
5. The Section finder panel does not cover the Ink balance at any of these widths. If that needs more than a small layout fix, list it and leave it.
6. No new layout, component or copy. Reuse the existing components and Tailwind classes. No change outside `apps/web`.

## Out of scope

- The FAQ's mobile claim and any other marketing wording: T-141.
- What the draft says: T-136, merged.
- The public marketing pages at phone width.

## Packet for Vishal (Priya, 7 Oct 2026, 19:5x)

Take this ticket through the chain and open the pull request to `develop`. Do not merge.

**How to check, since the web has no tests and this session has no database or model**

- Run the web app locally and open the pages in a headless browser (Chromium is installed for Playwright in the cloud workspace; do not download a browser). The document page needs a signed-in user and a saved document: stub the API responses in the browser, as was done for T-125 (`handoff/manual-checks/T-125-e2e-plan.md` is on the founder's Mac only, so work from the page's own fetch calls).
- First reproduce the fault at 500 px and at 390 px on `develop` as it is, and say in the report what you saw. Then fix, then open the same pages at 360, 390, 500, 768 and 1280 px and say what you saw at each.
- If you cannot get a browser to render the signed-in pages, do not guess a fix blind: write BLOCKED with what stopped you.

**Decided already**

- No design step from Rajesh: this is a fault in an existing layout, and criterion 6 forbids a new one. If the only sound fix needs a new layout (tabs, a drawer, a new order of parts beyond criterion 1), that is a BLOCKED for Priya, not a judgement call.
- On a class name joined to `${...}` in a template literal, keep a space inside the literal: the Prettier Tailwind plugin trims it on commit.
- A stubbed browser check is the developer's own check. Claim what you saw, not that it works on a real phone.

**The pull request**

- Title: `fix(web): the saved draft is readable on a phone (T-138)`.
- Body: what changed; "What a user can now do" in a user's words; what you saw at each width, before and after; what was run and what was not; anything from criteria 4 and 5 that you listed instead of fixing.
- Above the last line: "Founder's decision, 7 Oct 2026: Anushka tests on develop before GTM; this pull request does not wait for a verdict of its own." Last line: `Quality: waiting for Anushka`.
- CI green on the last push.

## Vishal's report (8 Oct 2026, 00:05 IST)

Pull request: #52, to `develop`, opened as a draft. Not merged. Head commit of the code: `b79f9f1`.

**The chain was stopped early, on the founder's instruction.** Round 1 ran in full: developer, tester (green), reviewer (fail, one must-fix). The developer fixed that point in round 2. The second tester run and the second review did not happen, and the doc-writer step did not run. So the round 2 commit has the developer's own check only.

### Cause

As Priya described, confirmed in a browser on `develop` before any change. Below 768 px the page was a fixed-height column. The side column took the height it wanted and the draft column got what was left (124 px at 500x800, 0 px at 500x600), with the rest clipped. No draft text was painted, in any scroll direction.

### What is done

- Criterion 1: at 360, 390 and 500 px the page shows the title, the buttons, the draft, the filing checklist, the sections cited and the document info, in that order. It scrolls as one page and nothing scrolls sideways. Text column 262, 292 and 402 px.
- Criterion 1, round 2: a guided document's name is typed by the advocate (up to 80 characters). One long unbroken word made the page scroll sideways. It now wraps. Checked by the developer only.
- Criterion 2: typing, the save after 2 seconds, the save button, Bold and a checklist tick work at 360, 390 and 500, as at 1280. The starting-draft label is readable. The saved document page has no checks panel; the one on the draft-ready step is readable at 360 and 390.
- Criterion 3: at 768 and 1280 every measurement and screenshot is the same as on `develop`. The switch is exactly at 768.
- Criterion 4: describe, questions, brief, generating and draft-ready were opened at 360 and 390. None scrolls sideways. Nothing needed a small layout fix.
- Criterion 6: two files, both in `apps/web`; class names and comments only.

Two things changed that no criterion names: below 768 px the header stacks (title, then buttons), and the paper margins are narrower. Without the narrower margins the text column is 134 px at 360.

### What is not done

- **Criterion 5 is not met.** Open as the full panel, the Section finder covers the whole Ink balance at 360, 390, 500, 768 and 1280, on `develop` too. Left as the ticket allows: it covers the balance on a desktop as well, and the panel is shared by every dashboard page.
- The second tester run and second review of round 2, and the doc-writer step.

### Listed for tickets of their own

1. Section finder: the open full panel covers the Ink balance at every width; below 768 px the compact drawer's backdrop lies over it.
2. Section finder: below 768 px the closed tab lies over the right 9 px of the content on every dashboard page. No text was seen under it.
3. Saved document page, 768 to about 930 px: still unusable, unchanged. Text column 22 px at 768; PDF and DOCX not painted. Tablets held upright and phones held sideways land here. Bears on T-141.
4. Saved document page on a phone: the save status, save button, export buttons and toolbar scroll away with the page, so "Save failed" can be off screen.
5. Saved document page from 768 px: a long unbroken title pushes save, PDF and DOCX out of reach, as today.
6. Saved document page: a very short draft still gets a full page of paper, so the checklist starts far down on a phone.
7. Brief: the chosen court's name is clipped in its dropdown at 360 and 390, and at 1280. At 1280 the Court type dropdown is clipped too.
8. Brief, 360 only: the dropdown "Choose what it is the date of" is clipped by about 8 px.
9. Brief: the "Facts of the case" box scrolls inside itself and shows a line cut in half at 360 and 390.
10. Questions: the description is one line ending in an ellipsis.
11. Read from code, not seen: a document made from a brief may show the court's id instead of its name. Outside `apps/web`.

### What I ran

- Developer and tester, round 1 (commit `4738143`): headless Chromium against a stubbed API, on the dev server and on a production build. Tester's counts: saved document page 434 pass, 0 fail; edit and save 128 / 0; desktop unchanged 332 / 0; New document 134 / 0; Section finder 102 / 0.
- Developer, round 2 (commit `b79f9f1`): the long-title checks at 360, 390, 500, 767, 768 and 1280, and the earlier checks again. All clean.
- On `b79f9f1` myself: `yarn workspace @lawie/shared build` exit 0; `npx tsc --noEmit -p apps/web/tsconfig.json` exit 0; `yarn workspace @lawie/web test` exit 0 ("No tests found").
- Developer: `yarn workspace @lawie/web build` exit 0 with stand-in fonts.

### What I did not run

- A plain `next build`. This workspace cannot reach Google Fonts, so it stops at the font download.
- Any committed test. `apps/web` has no tests and no CI job, so CI says nothing about this change. The browser checks are not in the repo.
- The secret scan. `gitleaks` is not installed here, so the commit hook skipped it.
- A real phone, Safari, Firefox, the on-screen keyboard, real fonts, landscape.
- The other New document states: document choice, no match, browse types, paywall, failed generation, the older template flow.
- Any real API, database, model or payment call.

Status line: it is the founder's to move. I would set it to "Pull request open, round 2 not reviewed".
