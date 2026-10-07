# T-103 — Web: describe-first New document page

| Field      | Value                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase      | 1 — Describe-first intake                                                                                                                                                                                    |
| Owner      | Vishal                                                                                                                                                                                                       |
| Mode       | Full chain                                                                                                                                                                                                   |
| Status     | Built 4 Oct 2026 on unmerged T-101/T-102. Web build passes. Headless manual checks pass at 360 and 1280 with the API mocked. Screen 02a follows the T-109 draft, which Meera has not approved. Not committed |
| Depends on | T-101, T-102, T-109                                                                                                                                                                                          |
| Branch     | feature/t-103-describe-first-page                                                                                                                                                                            |
| Created    | 2026-10-03                                                                                                                                                                                                   |

## Goal

New document opens on one text box, not a gallery.

## Context

- Current page: `apps/web/src/app/dashboard/new/page.tsx` (678 lines). It shows a search box, 16 category chips and 92 cards.
- The long form is `apps/web/src/components/form/DynamicFormRenderer.tsx` (1,086 lines). It is reused in T-104, not rewritten.

## Acceptance criteria

- New document opens on a single "describe what you need" box.
- The template gallery is still available from a "Browse templates" link.
- Submitting calls the intake API, then shows the follow-up questions inline, then the review screen (T-104).
- Nothing on screen says which mode or route was chosen.
- A "no match" result shows a friendly state and offers Browse templates.
- When intake returns `needs_choice`, the page asks "which document do you need?" with up to 3 choices and "None of these" (design in T-109).
- Until T-105 ships, `outcome: guided` shows the no-match screen. The label for guided drafts belongs to T-106.
- The page works at 360 px width and with the keyboard alone.
- The page matches Rajesh's design.
- `apps/web` has no tests and is not in CI. The PR includes a checked list of manual checks with screenshots at 360 px and at desktop width, and `yarn workspace @lawie/web build` passes.
- From T-305: a help link on the describe screen, "Find your FIR on the Bihar police portal", opening the official page in a new tab. No automatic fetch.

## In scope

- `apps/web/src/app/dashboard/new/`
- New components under `apps/web/src/components/`

## Out of scope

- Image attach (T-301)
- Length picker and estimate (T-203)
- The Templates page

## References

- Design: T-005 and T-109
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                       |
| -------- | --------------------- | ---------------------------------------------------------- |
| Arjun    | Approved with changes | Added a manual-check rule, because web has no tests or CI. |
| Rajesh   | Approved              | Cannot start until T-005 gives the Figma link.             |

## Build note (Vishal, 4 Oct 2026)

**Files**

- `apps/web/src/app/dashboard/new/page.tsx`: extended, not rewritten. New phases are describe, choice, follow-up and no-match. The gallery, form, preflight and generation are unchanged. `generate-from-template` now carries `intake_id`.
- `apps/web/src/components/intake/`: `DescribeStep` (01), `DocumentChoiceStep` (02a), `FollowUpStep` (02), `NoMatchStep` (08), `types.ts`.
- `apps/web/src/components/form/DynamicFormRenderer.tsx`: the per-field switch is extracted into an exported `FieldInput`, so the follow-up uses the same widgets, including the courts cascade and the BNS typeahead. `useCourtsData` and `resolveOptions` are exported. A new `initialData` prop prefills the form for review. No behaviour change on the gallery path.
- `apps/web/tailwind.config.js` and `src/app/layout.tsx`: the T-005 brand tokens (`brand-*`) and Lora (`font-heading`).

**The switch.** I added `GET /documents/intake/enabled` in drafting (`routes/intake.routes.ts`). It reads `feature.describe_first`:

- `on`: everyone
- `off` or unset: no one
- a comma-separated list of user ids: only those users

ADR §3.11 needs this to ship switched off, and no ticket owned the read path. When it is off, the page is the gallery exactly as today (screenshot `00`).

**Checked**

- `yarn workspace @lawie/web build` passes. `tsc` and eslint are clean on the changed files.
- Manual checks were scripted with headless Chrome against the real production build. The API was mocked with the T-101/T-102 response shapes, not a live backend. Driver: `handoff/manual-checks/describe-first-check.js`. Screenshots: `handoff/manual-checks/T-103/`. 56 checks at each width:
  - Continue is disabled when empty and enabled with text. The focus ring shows.
  - The textarea and Continue are reachable by keyboard.
  - The FIR link opens `https://scrb.bihar.gov.in/FIRiew.aspx` in a new tab. The odd spelling is the real page: the "corrected" URL returns 404.
  - Follow-up: 5 questions at most, filled fields are not asked, and answers are sent with `intake_id` and the round.
  - Review is prefilled.
  - 02a: up to 3 choices plus "None of these", closest pre-selected.
  - 08: the text is echoed and kept after "Edit my description". Browse templates opens the gallery.
  - On every T-103 screen: no horizontal scroll, every control at least 44 px, and no route, mode or confidence text.
- **Not checked:** a live end-to-end run through gateway, auth and drafting with a real login.

**Gaps against the design**

- The follow-up reuses the long form's inputs, so they are the current form's height, not the 48 px in T-005.
- The header pill still says "Ink · FREE". That is T-203.
- 02a: "None of these" leads to the no-match screen until T-105 brings Reception questions.
