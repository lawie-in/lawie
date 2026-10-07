# T-109 — Design additions: guided draft, document type and page charges

| Field      | Value                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                                            |
| Owner      | Rajesh, Meera approves                                                                                                                              |
| Mode       | Design work, not through the dev lead                                                                                                               |
| Status     | Done. Approved by Meera on 4 Oct 2026 with two conditions (see Review), and by the founder on 6 Oct 2026. Design is a claude.ai artifact, not Figma |
| Depends on | None                                                                                                                                                |
| Branch     | None                                                                                                                                                |
| Created    | 2026-10-04                                                                                                                                          |

## Goal

The screens that ADR-019 and the founder's decisions added after T-005 was delivered.

## Context

- T-005 was delivered on 4 Oct 2026 and covers the template route.
- Founder decisions on 4 Oct 2026 added a guided draft for requests with no template, a visible document type, and page charges for longer documents.
- The lead refuses a UI ticket without a Figma link, so T-105, T-106, T-301 and T-304 wait on this.

## Acceptance criteria

- Review details (03) is titled with the matched document type and has a "Not this document?" link.
- A "which document do you need?" variant of the follow-up screen (02), with up to 3 choices and "None of these".
- Reception questions for the guided draft, reusing screen 02.
- A brief screen: kind of document, parties, facts, what is asked for, court, and what is still unknown. Every part is editable, and Continue is the confirmation.
- The estimate (04) shows the page charge when more than 5 pages are attached, and the attach step shows the page count and the cap.
- Generating (05) for a guided draft (see the update at the end of this list).
- Draft ready (06) for a guided draft shows the label.
- Every new or changed screen has a 360 px version.
- The Figma link and an updated hand-off spec are added to this file.
- Updated 4 Oct 2026 (01:59): Generating (05) for a guided draft shows drafting only, with no reviewing or revising step.
- Draft ready (06) has two paid controls with their cost in drops: "Review by agent" and "Revise". It also shows the findings from the free rule checks.
- A panel for the review points, with a way to send them into a revision.
- A revision box where the user writes what to change, with the cost and a confirm.

## In scope

- Additions to the T-005 Figma file and spec

## Out of scope

- The editor
- Marketing pages

## References

- Design (reference page, Figma blocked by plan limit): https://claude.ai/artifact/8RB2R959ycrYd5FWinEfTM
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026
- Legal sign-off: Not needed

## Review, 4 Oct 2026

| Reviewer | Verdict                      | Note                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meera    | Approved with two conditions | Read the reference page (all 11 screens, 1280 and 360) and the spec. Navy, gold and teal are the brand values, headings are Lora, body is Inter, and there are no photographs. The guided-draft label is fixed and always visible. Paid controls show their cost before anything is charged. |

Conditions:

1. **Say that the review is done by AI.** "Review by agent" can be read as a person, and an advocate may take it for a lawyer's review. The card on 06a and the dialog on 06c say "An AI agent reads the draft…". The title can stay. Madhuri words it, Ajay confirms. This is copy for T-111 and does not hold up T-105 or T-106.
2. **The dev lead must accept this design.** The lead's gate refuses a UI ticket without a Figma link. Until Figma frames exist, the artifact link plus the spec count as the design for tickets fed by T-109. That is one line in `.claude/agents/vishal.md` and needs the founder's go-ahead, as T-001 did.

Not conditions:

- The revision price on the screens (three quarters) differs from T-205 (half). The screens show whatever the service returns, so it is not a design issue. Vikram and the founder settle it in T-108.
- Figma frames are added to the T-005 file when the plan allows.

## Founder approval (6 Oct 2026, 09:41 IST)

The founder approved T-109 and set it to Done on the ticket board.

Priya reads this as the go-ahead for Meera's second condition: the dev lead's gate accepts this artifact as the design until Figma frames exist. The same will apply to T-126. If the founder meant the design only, this line is wrong and the gate question is still open.
