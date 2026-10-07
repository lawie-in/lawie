# T-104 — Web: review details before drafting

| Field      | Value                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                                                                                                                                     |
| Owner      | Vishal                                                                                                                                                                                        |
| Mode       | Full chain                                                                                                                                                                                    |
| Status     | Built 4 Oct 2026 on T-103. Web build passes. Headless manual checks pass at 360 and 1280 with the API mocked. Title and "Not this document?" follow the unapproved T-109 draft. Not committed |
| Depends on | T-103, T-109                                                                                                                                                                                  |
| Branch     | feature/t-104-review-details                                                                                                                                                                  |
| Created    | 2026-10-03                                                                                                                                                                                    |

## Goal

The user sees and can correct every detail before the draft is generated.

## Context

- Founder condition from June, kept on 3 Oct: the user confirms extracted details before drafting.
- This screen replaces the long form as the default path and is the confirm step for image-read fields in T-301.

## Acceptance criteria

- Every filled field is shown, grouped as in `form_schema`, and is editable.
- Missing required fields are highlighted.
- Generate is disabled until all required fields are filled.
- The screen can mark a field as "read from image" and require an explicit confirm for it.
- It reuses `DynamicFormRenderer` with prefilled values. There is no second form implementation.
- The screen matches Rajesh's design.
- `apps/web` has no tests and is not in CI. The PR includes a checked list of manual checks with screenshots at 360 px and at desktop width, and `yarn workspace @lawie/web build` passes.
- The screen is titled with the matched document type and has a "Not this document?" link (founder, D3, 4 Oct 2026; design in T-109).

## In scope

- `apps/web/src/components/form/`
- `apps/web/src/app/dashboard/new/`

## Out of scope

- Reading images (T-301)

## References

- Design: T-005 and T-109
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                     |
| -------- | --------------------- | ------------------------------------------------------------------------ |
| Arjun    | Approved with changes | Same manual-check rule. Reusing `DynamicFormRenderer` is the right call. |
| Rajesh   | Approved              | Waits on T-005.                                                          |

## Build note (Vishal, 4 Oct 2026)

**Files**

- `apps/web/src/components/form/DynamicFormRenderer.tsx` gets a `mode="review"`. It is the same form state, widgets, cascade and validation as the long form, laid out as the review screen. No second form.
- Review mode shows:
  - every group on one page, gap groups open, ready groups folded to "All N ready"
  - a sticky summary bar: needs input, to confirm, ready, a progress bar, **Next gap** (opens the group and moves focus into the field), and **Show only gaps** (fields being filled stay visible until the filter is turned off)
  - field states: missing or invalid (red 2 px border, "Needs your input", hint line), read from image (gold-light, "Read from image", "Confirm this value"), confirmed (teal tag). Editing an image value confirms it.
  - **Generate** disabled until nothing is missing and nothing is unconfirmed, with the reason written next to it
  - two columns on desktop, one at 360
- New props: `mode`, `imageFields` (T-301 passes fields with `source: image`), `titleExtra`, `onValuesChange`. Without them the component behaves exactly as before.
- `apps/web/src/app/dashboard/new/page.tsx` uses review mode whenever intake values exist. The title is the document name with the "Review details" eyebrow and the "Not this document?" link.

**Design gap for Rajesh.** T-109 says "Not this document?" opens 02a. After a confident match the API returns no alternatives, so there is nothing to show there.

- What I built: the link opens 02a when choices exist, otherwise the gallery.
- Either way, the details already entered that exist in the newly picked document are kept, and it opens straight in review.
- If 02a should always show alternatives, the match call has to return them on a high-confidence match too. That is a T-101 change.

**Checked**

- `yarn workspace @lawie/web build` passes. `tsc` and eslint are clean.
- Headless Chrome on the production build, API mocked with T-101/T-102 shapes. Driver: `handoff/manual-checks/review-details-check.js`. Screenshots: `handoff/manual-checks/T-104/`. 44 checks pass across 360 and 1280:
  - title and link
  - counts with 1 gap and with 12 or more gaps
  - folded and open groups
  - Next gap moves focus, also with many gaps
  - Show only gaps
  - an image value blocks Generate until confirmed, and editing it confirms it
  - Generate enables only with no gaps, and sends `intake_id` with the reviewed values
  - "Not this document?" keeps the details
  - the summary bar stays flush at the top while scrolling
  - no horizontal scroll, controls at least 44 px, no route or mode text
- The T-103 suite was re-run after these changes: 56 of 56 checks pass, and 2 of 2 with the switch off.
- Found and fixed during the checks: in "Show only gaps", a field disappeared on its first keystroke and the rest of the typing was lost.
- **Not checked:** a live run through gateway, auth and drafting with a real login. Image reading itself is T-301.

**Gaps against the design**

- Inputs keep the long form's amber focus ring and 38 px height, not T-005's teal ring and 48 px. Changing the shared input class would also restyle the gallery form. Worth one small follow-up with Rajesh.

## Replaced, 5 Oct 2026

ADR-021 is approved. The per-document review screen is replaced by the brief. Its code is removed in T-125. Finding 1 of the end-to-end check (arrest date filled in as the FIR Date) is fixed in T-105.
