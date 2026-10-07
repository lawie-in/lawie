# T-138 — I can read my draft on a phone

| Field | Value |
|---|---|
| Phase | 1 — Describe and draft |
| Owner | Vishal (build), Anushka (tests on develop before GTM) |
| Mode | Fix, full chain |
| Status | Ready for Vishal |
| Depends on | None |
| Branch | fix/t-138-draft-readable-on-a-phone |
| Legal sign-off | Not needed: no legal-content path is touched. If the fix turns out to need one, that is a BLOCKED |
| Created | 2026-10-06 |
| Source | Anushka's first run, 6 Oct 2026, verdict FAIL |

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
