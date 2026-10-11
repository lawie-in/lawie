# T-197 — The disclaimer shows on every draft, not only with the fact-check banner

| Field          | Value                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                 |
| Owner          | Lead (build). Anushka (verdict)                                                                                        |
| Mode           | Build, full chain. Merge to develop_staging                                                                            |
| Status         | Merged into develop_staging (d74d063, 11 Oct 2026), waiting for Anushka on develop |
| Assigned lead  | mahak |
| Size           | S (0.5 day)                                                                                                            |
| Depends on     | None                                                                                                                   |
| Gate           | Before v1 go-live (T-403). Ajay's rule: "The standard disclaimer stays on every draft, labelled or not" (T-127, §9)    |
| Branch         | fix/t-197-disclaimer-on-every-draft                                                                                    |
| Legal sign-off | Already given: the text is Ajay's, signed in T-158 ("Disclaimer on every output") and T-127. No new text in this ticket |
| Created        | 2026-10-11                                                                                                             |
| Source         | Finding from the T-147 build, 11 Oct 2026                                                                              |

## Problem

The draft-ready screen prints the disclaimer only inside the fact-check banner (`DraftReadyStep.tsx`, `factCheck.disclaimer`). The API sends the disclaimer only as part of that banner (`fact-verifier.ts`, `FACT_CHECK_DISCLAIMER`; `documents.routes.ts` sends `factCheck.banner` only when there is a finding). A clean draft shows no disclaimer at all.

## User

District court advocate who reads the draft on screen and must always see that he, not Lawie, answers for its accuracy.

## Solution

Show the signed disclaimer on every draft screen, whether the banner shows or not. One source for the text: `FACT_CHECK_DISCLAIMER`.

## Acceptance criteria

1. The draft-ready screen shows the disclaimer for every draft: with the banner, without it, with the ledger on and off.
2. The saved document page shows the same disclaimer.
3. The text is exactly "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." It comes from one constant; no second copy in the web app.
4. With the banner showing, the disclaimer appears once, not twice.
5. The API response for a finished draft carries the disclaimer even when `factCheck` is absent. A drafting test proves it for a clean draft.
6. Export footers are unchanged (they already carry their own line; aligning that text is out of scope).
7. `apps/web` has no tests: a manual check at 375 px and 1280 px, clean draft and draft with a banner, is written in the report.
8. CI green on drafting.

## Out of scope

- Export footer wording (`exportUtils.ts`, `annexures.service.ts`)
- New disclaimer text (needs Ajay)
- Marketing pages

## References

- T-127 §9, T-158, T-106 ("The standard disclaimer stays on every draft")

## Design (Rajesh, 11 Oct 2026)

No artifact needed. Reuse existing styles and tokens; the text is `FACT_CHECK_DISCLAIMER`, unchanged.

| Where | Placement | Style |
| ----- | --------- | ----- |
| `DraftReadyStep`, banner showing | As today: last line inside the gold fact-check banner. Once only (AC4) | Unchanged: `text-brand-gold-dark mt-2 text-sm` |
| `DraftReadyStep`, no banner | Same slot: inside the "Checks run for you" card, directly under its heading (`mt-3`), before the checks list | Neutral note: `role="note"`, `border-brand-line bg-brand-page rounded-lg border px-3.5 py-2.5`, text `text-brand-navy text-sm` |
| Document page `apps/web/src/app/dashboard/documents/[id]` | Above the editor: after the starting-draft label (if any), before the free-tier watermark notice | Same neutral note as above |

- Why neutral, not gold, when there is no banner: gold means "something to check" in this app. On a clean draft it would read as a false warning. The disclaimer goes in the same place in both cases, so advocates learn where it is.
- Not dismissible. No icon. Wraps on a phone; no truncation.
- Contrast: navy on page is 16:1 (WCAG AA). The manual check at 375 px and 1280 px stays as in AC7.
