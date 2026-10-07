# T-111 — Review by agent, as a paid option

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Phase      | 2 — Drops pricing                                 |
| Owner      | Vishal                                            |
| Mode       | Full chain                                        |
| Status     | Blocked: T-106 and T-109. Go-live waits for T-108 |
| Depends on | T-106, T-109                                      |
| Branch     | feature/t-111-review-by-agent                     |
| Created    | 2026-10-04                                        |

## Goal

After a draft is ready, the user can pay some drops to have an agent review it.

## Context

- Founder, 4 Oct 2026: there is no Reviewer step in the pipeline. The user can choose a review by an agent, which costs drops.
- Estimated cost of one review on a Sonnet model is about ₹2.3. Proposed price: 30 drops. T-108 measures and confirms.
- Ajay's condition: on a strict-mode draft, the offer is shown on the draft-ready screen.

## Acceptance criteria

- A "Review by agent" control on the draft-ready screen shows its cost in drops. The user confirms before it runs.
- The review compares the draft with the brief (guided drafts) or with the form values (template drafts) and returns a list of points: invented facts, invented citations, missing parts, contradictions.
- The review changes nothing in the draft.
- The points can be sent into a revision (T-205) with one click.
- The review is recorded in `LlmAuxCall` with purpose `review`, the `runId` and the `runSequence` it reviewed, with real tokens and cost.
- The Ink ledger row carries the `runId`, the `runSequence` and the reason `review`.
- A failed review charges nothing.
- No draft text is logged.
- Tests cover: a review with points, a review with none, a failed review, and too little balance.
- The price is a setting, so T-108 can fix it without a deploy. It is built and measured in dev before it goes live.

## In scope

- A review service and its prompt file (legal content)
- `apps/drafting/src/routes/documents.routes.ts`
- `apps/drafting/src/services/credits.service.ts` (a new spend reason, no change to amounts logic)
- `apps/web`: the control and the list of points

## Out of scope

- Automatic review inside the pipeline
- Revisions (T-205)

## References

- Design: T-109
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, section 3.14
- Legal sign-off: Ajay, T-107, 4 Oct 2026. Use the Review prompt in `handoff/design/T-107-guided-draft-rules-and-prompts.md` exactly as written
