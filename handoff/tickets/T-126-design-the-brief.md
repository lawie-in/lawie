# T-126 — Design: the brief, for every document

| Field      | Value                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                           |
| Owner      | Rajesh, Meera approves                                                                                           |
| Mode       | Design work, not through the dev lead                                                                            |
| Status     | Done. Approved by the founder on 6 Oct 2026, 14:28: "yes approved, please go ahead". Vishal builds from the page |
| Depends on | None                                                                                                             |
| Branch     | None                                                                                                             |
| Created    | 2026-10-05                                                                                                       |

## Goal

The screens of the one flow, ready for hand-off, so T-125 can be built.

## Context

- ADR-021, approved by the founder on 5 Oct 2026. The brief becomes the only screen where details are entered.
- T-109 screen 02c ("Check your brief") is the starting point. It was drawn for requests with no template. It now serves every document.
- T-005 and T-109 tokens, components and accessibility rules still apply.

## Acceptance criteria

- The brief with all its parts: kind of document, court, parties, facts, dates, numbers, what is asked for, still unknown.
- The control to change the kind of document: a search over the 92 kinds, and "something else".
- The court picker inside the brief: state, court type, court.
- A date with its meaning shown ("date of arrest", "date of FIR"), and how the user adds or corrects one.
- The "please check" mark on values read from the description.
- The state where Confirm is off on a court document, saying what is still needed.
- Draft ready in its three states: with rules and no label, with rules and the label because something is missing, and with no rules.
- The gallery as "Browse document types".
- Every screen at 1280 px and at 360 px.
- An updated hand-off spec in `handoff/design/`.

## In scope

- Additions to the T-109 design and spec

## Out of scope

- The editor
- The length picker and estimate (drawn in T-005 and T-109)

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, section 3.2
- Earlier designs: `handoff/design/T-005-describe-first-flow-spec.md`, `handoff/design/T-109-guided-draft-additions-spec.md`
- Legal sign-off: Ajay confirms the label wording and the "please check" wording with T-127

## Delivery (Rajesh, 6 Oct 2026, 14:1x)

- Design reference: https://claude.ai/artifact/C8sMcrGqa6vtA8HqU8hXcF. Ten screens, each at 1280 and at 360, with behaviour notes: B1 the brief, B2 change the document, B3 the court, B4 dates, B5 Confirm off, B6 nothing fits, D1 to D3 draft ready, G1 browse document types.
- Hand-off spec: `handoff/design/T-126-the-brief-spec.md`. Section 4 maps every screen element to the field the service returns.
- No Figma frames. The page is the design source, as with T-109.
- Every acceptance line is drawn. No new colour or type token.
- Checked: the page was opened once at desktop width and each screen looked at. Not checked: on a real phone, and against the running app.
- Open: Meera's approval; Ajay's read of the new wording (spec, section 5); the founder's word that the dev lead's gate accepts this page in place of a Figma link.

## Review (6 Oct 2026, 14:2x)

**Meera: approved.** No new colour or type token. Gold stays a fill, never small text. One condition: T-125 is checked on a real phone, not only at a 360 px window, because the brief is a long screen.

**Ajay: the new wording is fine as drawn**, with one change made on the page's notes, not the screens: nothing on screen may say the draft is "checked" or "verified" in D1. "Checks run for you" and "No problems found." are the limit. The fixed lines of T-127 section 7 and T-107 section 4 are used as signed.

These two reads are by agents of the same team that drew the screens. Neither is an outside review. The founder has not looked at the design yet.
