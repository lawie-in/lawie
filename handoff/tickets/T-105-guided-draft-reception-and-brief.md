# T-105 — Questions and the brief, for every document

| Field      | Value                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                                                            |
| Owner      | Vishal                                                                                                                                            |
| Mode       | Full chain                                                                                                                                        |
| Status     | Done. PR #40 merged into `develop` by the founder, 6 Oct 2026. Not switched on: `feature.describe_first` stays off until the gate in T-113 passes |
| Depends on | T-124, T-127. T-122 comes first in the build order                                                                                                |
| Branch     | feature/t-105-questions-and-brief                                                                                                                 |
| Created    | 2026-10-04, rewritten 2026-10-05                                                                                                                  |

## Goal

For any legal document, the service asks only for what is missing and returns one brief that the user confirms before anything is drafted.

## Context

- ADR-021, approved by the founder on 5 Oct 2026: one flow for every document, legal rules kept, per-document forms removed. This ticket was "Reception and the brief for requests with no template". It is now the flow for all requests.
- The checklist of what to ask comes from the rule pack (T-124) plus a fixed list. Reception words the questions.
- The describe step, the match call, the quote checks, the limits, the `intakeId` and the usage records from T-101 are reused. The form filling of T-101 and the questions built from form fields in T-102 are replaced.
- This ticket also carries what T-119 (dates) and the server side of T-121 (nothing lost on going back) asked for. Both are closed into it.

## Acceptance criteria

**The brief**

- The brief has the same parts for every document: kind of document, court, parties, facts, dates, numbers (FIR number, case number, sections, amounts), what is asked for, and still unknown.
- The kind of document is a rule-pack id, or none. The user can change it. Changing it keeps every other part and works out "still unknown" again.
- The court is never filled by the model. It is a state, a court type and a court from the courts data, chosen by the user.
- "Still unknown" lists the pack's required facts that are missing, each with the placeholder the draft will use.

**Reading the description**

- Every value the model reads carries a quote, and the server checks the quote against the description, as today.
- A date is kept only with what it is the date of, and that meaning must be supported by the quote. A date with no stated meaning is asked, not placed.
- These three texts give the stated result: "arrested on 15/03/2026 in FIR No. 124/2026" gives a date of arrest and no FIR date. "arrested by Sadar Thana Police on 25th August 2026" gives a date of arrest and no FIR date. "FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026" gives both.
- One date is never used for two meanings unless the description says so for both.

**Questions**

- The checklist is the fixed items plus the pack's required facts that the description does not state. At most 5 questions a round, 2 rounds.
- With a pack, Reception cannot ask for anything outside the checklist. With no pack, Reception asks its own questions, as written in T-107.
- Reception never writes any part of the document.

**Confirming (decision D2)**

- The user can confirm with required facts missing. They become visible blanks.
- On a court document the user cannot confirm without the court and the parties.
- Nothing is drafted before the user confirms.

**Other**

- When the match is unsure, the response carries up to 3 kinds to choose from. The bail guard from T-122 applies.
- A request on the never-draft list (T-107, section 3), or one that is not legal drafting, returns `no_match`.
- Sending the same description again makes no new model call. The earlier result is returned.
- Each model call is recorded in `LlmAuxCall` under the `intakeId`, with real tokens and cost. The intake limits apply.
- No description, answer or brief text is stored or logged before generation.
- Tests cover: a request with a pack, one without, a kind change, the three date texts, the court never coming from the model, the court-document confirm rule, the 2-round limit, a repeated description, a non-legal request and a model failure.

## In scope

- `apps/drafting/src/services/intake.service.ts`, `intake.prompts.ts` and `routes/intake.routes.ts`

## Out of scope

- The web screens (T-125)
- Writing the draft (T-106)
- Images and PDFs (T-301, T-304)

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, sections 3.2 to 3.4
- Earlier: `docs/adr/ADR-019-intake-and-routing.md`, sections 3.7, 3.8, 3.10 and 3.14
- Legal sign-off: Ajay, through T-127. Use his prompt text exactly as written

## Delivery report (Vishal, 6 Oct 2026)

Pull request: https://github.com/lawie-in/lawie/pull/40 (branch `feature/t-105-questions-and-brief`). CI passed on its first run.

**Built**

- `POST /intake/brief`: describe, and get one brief back with questions for what is missing.
- `POST /intake/brief/update`: works the brief out again after the user typed, chose the court or changed the kind. No model call.
- `apps/drafting/src/services/intake-brief.ts`: the rules, with no I/O. `intake-cache.ts`, `intake-text.ts`, and Ajay's lists in `src/config/intake/`.

**Acceptance criteria**

| Criterion                                                                         | Result                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The brief has the same parts for every document                                   | Met                                                                                          |
| The kind can be changed, keeping every other part                                 | Met. A value the new kind has no place for is kept under "unplaced"                          |
| The court is never filled by the model                                            | Met. Court, district and police station are taken off the checklist before the model sees it |
| "Still unknown" with the placeholder the draft will use                           | Met                                                                                          |
| Every value carries a quote the server checks                                     | Met                                                                                          |
| A date is kept only with what it is the date of. The three texts                  | Met, tested                                                                                  |
| One date is never used for two meanings                                           | Met                                                                                          |
| Checklist from the pack, 5 questions a round, 2 rounds                            | Met                                                                                          |
| With no pack, Reception asks its own questions                                    | Met, in strict mode only (see below)                                                         |
| Confirm with facts missing, but not without court and parties on a court document | Met                                                                                          |
| Up to 3 kinds when the match is unsure. The bail guard applies                    | Met                                                                                          |
| Never-draft list and not-legal requests return `no_match`                         | Partly. See below                                                                            |
| The same description again makes no new model call                                | Met. See "For Arjun and Ajay to check"                                                       |
| Each model call recorded in `LlmAuxCall`. Limits apply                            | Met. New purpose `intake_reception`                                                          |
| No description, answer or brief text stored or logged                             | Met, with the note on the cache below                                                        |
| Tests for the ten listed cases                                                    | Met                                                                                          |

**Different from the ticket**

- The old routes `POST /intake` and `/intake/answers` are still there. The current web screens call them. T-125 removes them with those screens.
- Both new routes check `feature.describe_first` on the server and return 404 when it is off.
- The code also reads dates itself, under the test Ajay signed. It places a date the model missed, and it gives a meaning to a date the pack has no fact for, such as the date of arrest on a regular bail application.
- A follow-up request (a round of answers, a change of kind) counts against the intake, 6 at most, and only when this user started it.

**Not built**

- Light mode for a request with no pack. Every such request runs in strict mode (Ajay, T-127 section 3.1).
- Never-draft list, item 2: forms a law prescribes in a fixed format. There is no test the code can apply. The Supreme Court rule and the refusals are enforced.

**For Arjun and Ajay to check**

- The ticket asks that a repeated description makes no new model call, and that nothing is stored before generation. The model's answer is kept in Redis for 30 minutes, encrypted with a key derived from the request text itself and the server secret. Nobody can read it without the same description. If that still counts as storing, the cache comes out with a small change and the web holds the result instead.

**Run**

- Type check, lint and formatting: clean.
- 168 tests with no database, in the chat session's workspace.
- The whole drafting suite in CI, including the 32 route tests: passed.

**Not run**

- Any real model call. Every model answer in the tests is a fixture.
- A browser check. There is no screen for this yet (T-125).
- A separate review. The code and its tests were written in one session.
