# T-005 — Design the describe-first drafting flow

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Phase      | 0 — Prep                              |
| Owner      | Rajesh, Meera approves                |
| Mode       | Design work, not through the dev lead |
| Status     | Done                                  |
| Depends on | None                                  |
| Branch     | None                                  |
| Created    | 2026-10-03                            |

## Goal

One clear flow from "describe what you need" to a generated draft, ready for hand-off.

## Context

- Founder decision, 3 Oct 2026: the user describes the matter in a chat box, templates stay behind the scenes, and only missing must-have details are asked.
- The current New document page is a gallery of 92 templates in 16 categories, followed by a long form.
- Rules that still apply: routing is silent (no message about which mode was chosen), and open-draft documents carry the label "starting draft — review before use".
- Design tokens: navy #0D1F3C, gold #C8850E, teal #0D9488, Lora headings, Inter body, illustrations only.
- The lead refuses any UI ticket without a Figma link and hand-off spec, so T-103, T-104, T-203 and T-301 wait on this.
- Templates have a median of 19 fields, 16 of them required. The largest has 38 required. The review screen must work with ten or more gaps, not only three to five questions.
- There is no regenerate control anywhere today. T-205 adds one, so the draft-ready screen needs it.
- `apps/web` has no tests and is not in CI, so the hand-off spec should list what to check by eye.

## Acceptance criteria

- Screens exist for: describe box with image attach, follow-up questions, review details, length picker with drops estimate, generating, draft ready with drops charged, low balance, and no template match.
- The template gallery is reached from a secondary "Browse templates" link.
- Fields read from an image are visibly marked and have a confirm control.
- The header balance shows drops.
- Every screen has a 360 px wide version.
- The Figma link and hand-off spec are added to the References section of this file.

## In scope

- The New document flow and the header balance pill

## Out of scope

- Marketing pages (T-204)
- The document editor

## References

- Design (Figma): https://www.figma.com/design/6FV11738gZut87KECjtFBn
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                    |
| -------- | -------- | ----------------------- |
| Rajesh   | Approved | Delivered by Rajesh     |
| Meera    | Approved | Brand tokens as listed. |
