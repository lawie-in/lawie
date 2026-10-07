# T-205 — Revise a draft: paid, same run

| Field      | Value                                                    |
| ---------- | -------------------------------------------------------- |
| Phase      | 2 — Drops pricing                                        |
| Owner      | Vishal                                                   |
| Mode       | Full chain                                               |
| Status     | Blocked: T-110, T-202 and T-109. Go-live waits for T-108 |
| Depends on | T-110, T-202, T-109                                      |
| Branch     | feature/t-205-regenerate                                 |
| Created    | 2026-10-03                                               |

## Goal

The user can regenerate a draft and is charged half of that draft's original charge.

## Context

- Pricing decision from June 2026: a regeneration costs half. On 3 Oct 2026 the team proposed 50 percent of the draft's drops and the founder confirmed.
- No regenerate endpoint or button exists in `apps/drafting` or `apps/web`. `spendInk` accepts a `regenerate` reason, but nothing calls it.
- `Document.version` already exists on the document model.
- **Founder, 4 Oct 2026: a revision costs the user, keeps the same `runId`, takes the next `runSequence`, and is stored with `runType: revision`.** This answers the earlier question of whether a regeneration continues the run.
- A revision is driven by the user's instructions, the points from a paid review (T-111), or both. Running again with nothing changed is also allowed.
- `resolveRun` today starts a new run when the run already has a completed attempt. A revision request needs the opposite check.
- A revision is estimated to cost us more than the first draft (about ₹5.4 against ₹4.5 for 25 paragraphs), because the Drafter reads the earlier draft too. Half price would leave about 33 percent. Vikram proposes three quarters of the original charge. T-108 decides.

## Acceptance criteria

- A revise action on an existing draft runs the Drafter again with the earlier draft, the brief or form values, and the user's instructions.
- The new `Generation` row has the same `runId`, the next `runSequence` and `runType: revision`.
- A revision is accepted only for a run that belongs to the same user and has a completed attempt.
- The Ink ledger row carries the `runId`, the `runSequence` and the reason `revise`.
- The charge is the share of the original charge that T-108 fixes, rounded up to a whole drop. Until then the working figure is 75 percent.
- The user sees the cost in drops and confirms before it runs.
- The new draft is saved as a new version. The earlier version is kept.
- A failed regeneration charges nothing.
- Tokens are recorded the same way as a first generation.
- The control matches Rajesh's design.
- The share of the original charge is a setting, so T-108 can fix it without a deploy.

## In scope

- `apps/drafting/src/routes/documents.routes.ts`
- `apps/drafting/src/services/credits.service.ts`
- `apps/web`: the draft-ready and editor screens

## Out of scope

- Editing the inputs before regenerating (that is a new draft)
- Any prompt change

## References

- Design: T-005
- ADR: Not needed
- Legal sign-off: Required only if `ai.service.ts` or a prompt is edited.

## Open questions

- Founder: revisions are treated as part of v1, since the 4 Oct decisions design them in. Say so if they should wait.

## Review, 3 Oct 2026

| Reviewer | Verdict          | Note                                                         |
| -------- | ---------------- | ------------------------------------------------------------ |
| Arjun    | Approved         | Split out of T-202 because the endpoint does not exist yet.  |
| Vikram   | Approved         | Half charge still covers cost if T-004 confirms the formula. |
| Priya    | Needs a decision | Founder to say whether it is in v1.                          |
