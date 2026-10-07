# T-102 — Ask only for the missing details

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                           |
| Owner      | Vishal                                                              |
| Mode       | Full chain                                                          |
| Status     | Built 4 Oct 2026 on top of T-101, intake tests green. Not committed |
| Depends on | T-101                                                               |
| Branch     | feature/t-102-follow-up-questions                                   |
| Created    | 2026-10-03                                                          |

## Goal

After intake, the user is asked only for the must-have details that are still missing.

## Context

- The team estimate is 3 to 5 follow-up questions for a typical draft.
- Ajay's rule: court, parties, FIR number, sections and dates are never guessed for court-critical documents.
- The median template has 16 required fields. Two rounds of five questions will not always cover them. The review screen (T-104) handles the rest.
- ADR-019, section 3.6: the questions are built by code from the `form_schema` labels. There is no model call in this ticket.

## Acceptance criteria

- Given the missing required fields, the API returns at most 5 questions per round, worded from the `form_schema` labels.
- A field that is already filled is never asked again.
- Answers are merged into the field set and checked again against `form_schema`.
- Court, parties, FIR number, sections and dates are asked when absent and are never invented.
- After 2 rounds the flow moves to the review screen with any gaps highlighted.
- The user can choose to fill the details themselves at any point, which opens the existing form prefilled.
- Tests cover: nothing missing, some missing, an invalid answer, and the 2-round limit.

## In scope

- `apps/drafting`: intake service and route

## Out of scope

- The web screens (T-103, T-104)

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026
- Legal sign-off: Not needed if the questions are built by code, as ADR-019 says. Required again if a prompt is introduced

## Review, 3 Oct 2026

| Reviewer | Verdict     | Note                        |
| -------- | ----------- | --------------------------- |
| Arjun    | Approved    | Feasible once T-101 exists. |
| Ajay     | Conditional | Same condition as T-101.    |
| Priya    | Approved    | Keep the 2-round limit.     |

## Build note (Vishal, 4 Oct 2026)

- `POST /documents/intake` (matched) now returns round-1 `questions` and `form_data`.
- `POST /documents/intake/answers` takes `intake_id`, `template_id`, `fields`, `answers` and `round`. It returns:
  - `fields`, `form_data` (plain values to prefill the existing form, for "fill it myself")
  - `missing`, `invalid` (field and reason)
  - `questions` (at most 5)
  - `ready` (nothing missing)
  - `review` (nothing missing, or round 2 reached)
- No model call, no quota, no cost. All in `apps/drafting/src/services/intake.service.ts` (`buildQuestions`, `checkUserValue`, `applyAnswers`) and `routes/intake.routes.ts`.
- Question text is the `form_schema` label, unchanged. Court fields carry `source` and `options_from` so the web loads the real list, as the form does.
- Order: court, party names, FIR, sections and dates first (Ajay's rule), then form order. That keeps state, court type, court in sequence.
- Every value the browser sends back is checked again, answers included. An invalid value is listed in `invalid`, not kept, and asked again. Answers win over values read from the description and are marked `source: user`.
- Tests: `apps/drafting/src/__tests__/intake.answers.test.ts`, 10 tests: nothing missing, some missing, invalid answer, browser values re-checked, the 2-round limit, show_if, 404 and 400, no model call. Plus round-1 assertions in `intake.test.ts`.
- **Assumption:** party-name detection is by field id (`applicant_name`, `accused_name` and similar). A template with unusual ids gets its party questions in form order instead of first. Nothing is ever skipped. Only the order changes.

## Replaced, 5 Oct 2026

ADR-021 is approved. Questions are now built from the rule pack's required facts (T-105). The web part of this ticket is removed in T-125.
