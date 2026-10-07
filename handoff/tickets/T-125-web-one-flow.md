# T-125 — Web: one flow from describe to draft

| Field      | Value                                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                                                                                                                                                                                                                                              |
| Owner      | Vishal, Rajesh reviews                                                                                                                                                                                                                                                                                                              |
| Mode       | Web change, manual checks (`apps/web` has no tests)                                                                                                                                                                                                                                                                                 |
| Status     | Merged. PR #45 into `develop`, merged by the founder 6 Oct 2026, 15:28. Checked against a stubbed API only. The end-to-end check is not run. The founder asked for it at 15:35; at 15:39 and 15:48 the backend was not running on the Mac (ports 4000 to 4003 did not answer) and the founder was not signed in in the browser pane |
| Depends on | T-105, T-106, T-126                                                                                                                                                                                                                                                                                                                 |
| Branch     | feature/t-125-web-one-flow (PR #45)                                                                                                                                                                                                                                                                                                 |
| Created    | 2026-10-05                                                                                                                                                                                                                                                                                                                          |

## Goal

New document is one path for every document: describe, answer a few questions, confirm the brief, get the draft.

## Context

- ADR-021, approved by the founder on 5 Oct 2026. Decisions D1 (the gallery stays as a way to browse) and D4 (the 6 working forms are retired).
- The describe screen and the "Which document do you need?" choice from T-103 are kept.
- This ticket carries the web side of T-121: nothing the user typed is lost on going back.

## Acceptance criteria

**The flow**

- New document opens on the describe screen. Then questions, the brief, the estimate, generating and the draft, as designed in T-126.
- The brief shows every part from T-105. The kind of document is at the top with a way to change it: a search over the 92 kinds, plus "something else".
- The court is picked from the courts list (state, court type, court). Each date shows what it is the date of. Values read from the description are marked "please check".
- "Still unknown" lists what will be a blank in the draft, with its placeholder.
- On a court document, Confirm is off until the court and the parties are given.

**Nothing is lost**

- The description, the answers and the brief are held in one place for the whole flow. Going back to any earlier step and forward again keeps all of it.
- Continue with an unchanged description makes no new call.
- Nothing is written to browser storage, and nothing is kept after the draft is generated, after Cancel, or after leaving the page.

**The gallery (D1)**

- The gallery is reachable as "Browse document types". Picking one opens the same flow with the kind already set.

**Removed (D4)**

- The stepper form, the per-document review screen (T-104) and the questions built from form fields (T-102) are removed, with their check scripts.

**Draft ready**

- The findings from the checks are shown. The starting-draft label follows the rule in T-106.
- The label also prints in the DOCX footer (moved here from T-106 on 6 Oct 2026: that export is made in the browser). The text is the footer in T-107, section 4.

**Checks**

- The whole flow is behind `feature.describe_first`.
- `handoff/manual-checks/` gets a new end-to-end plan for this flow, and it is run. It includes: generating one draft with a pack and one without, the founder's bail sentence and an anticipatory one, the three date texts from T-105, going back and forward from every step, and every screen at desktop width and at 360 px.
- Screenshots of every changed screen at both widths are in the pull request.

## In scope

- `apps/web/src/app/dashboard/new/page.tsx` and `apps/web/src/components/intake/`
- The form components that are no longer used
- `handoff/manual-checks/`

## Out of scope

- The length picker and the drops estimate (T-203)
- Images and PDFs (T-301, T-304)
- Review by agent and revision (T-111, T-205)

## References

- Design: T-126, `handoff/design/T-126-the-brief-spec.md` (section 4 maps each screen element to the service field)
- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, sections 3.1, 3.2 and 3.8
- Legal sign-off: Not needed. No prompt text changes here

## Delivery report (Vishal, from the war-room chat, 6 Oct 2026, 15:2x)

Pull request: https://github.com/lawie-in/lawie/pull/45 into `develop`. CI "Test — Drafting" passed. The web app has no tests and no CI job.

### What is built

- New document, with the switch on, is one path: describe, questions, the brief, the draft. Files: `apps/web/src/components/intake/` (`OneFlow`, `BriefStep`, `CourtPicker`, `ChangeDocumentDialog`, `QuestionsStep`, `ValueInput`, `GeneratingStep`, `DraftReadyStep`, `BrowseTypesStep`).
- The brief shows every part from T-105, the document with "Change" (search and "Something else"), the court from the courts list, each date with what it is the date of, "Please check" on values read from the description, and "Still unknown" with each blank.
- Confirm is off on a court document until the court and the parties are given, with the service's line.
- Everything typed is held in one place in memory. Going back and forward keeps it. Continue with an unchanged description makes no new call. Nothing is written to browser storage, and everything is dropped after the draft, on Cancel and on leaving the page.
- "Browse document types" opens the describe screen with the document set.
- Draft ready shows the label, the line under it and the findings as the service sends them.
- The editor shows the label of a starting draft. Its footer prints in the DOCX and in the PDF fallback. `GET /documents/:id` now sends `startingDraftFooter`.
- Removed: `FollowUpStep` (T-102), the review mode of `DynamicFormRenderer` (T-104), the calls to the old `/intake` and `/intake/answers`.
- `handoff/manual-checks/T-125-e2e-plan.md` is written. The two old check scripts are moved to `handoff/manual-checks/_retired/`. They are not deleted.

### Acceptance criteria not met

- **The stepper form is not removed.** It is what a user sees while the switch is off, and the new flow has not made one draft with the real model yet. With the switch on it cannot be reached. Removing it is small and can follow the gate. For Priya and Arjun to confirm.
- **The end-to-end plan has not been run.** It needs the database, Redis, the model and a signed-in browser.
- **Screenshots are not in the pull request.** The API cannot attach images. Two sheets were sent to the founder in the chat. They come from the stubbed run, not from the real service.
- "The estimate" step of the flow is T-203 and is skipped: Confirm goes straight to drafting.

### Differences from the design (T-126)

- "+ Add another date" is not built for a document with no rule pack: it needs the list of date meanings from the service, and no endpoint gives it.
- "Drops charged" is not on the draft-ready screen: the `done` event does not carry the charge (T-203).
- The court picker narrows with a box above a normal select, not with a list that opens under the box.
- A date the description gives a meaning to, on a document with no place for it, is shown as one plain line. The design did not draw this case.

### Found on the way

- If the draft is written but saving it fails, the user is still charged (both draft routes). The new screen says the draft could not be saved. For Arjun.
- The editor still tells a free user that exports carry a watermark. The exports carry none. Not changed.
- The sidebar still says "Templates" and that page is unchanged. Outside this ticket's files.

### What was run

- Type check and lint for the web app: no errors.
- The whole flow in a local headless browser against a stubbed API, at 1280 and at 360: both kinds of document, two rounds of questions, the court, a loose date, a change of document, back and forward, "Which document?", and Browse. No page error and no sideways scroll.
- The page with the switch off: the old list shows.
- CI "Test — Drafting": passed.

### What was not run

- Nothing against the real service. A mismatch between the stub and the service would not show.
- No real model call, no real draft, no DOCX opened in Word, no real phone.
- `next build`. No separate review. `gitleaks` was not installed where this was committed.
