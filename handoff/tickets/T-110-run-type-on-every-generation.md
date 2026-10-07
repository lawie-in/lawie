# T-110 — Store runType on every generation

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                           |
| Owner      | Vishal                                                                             |
| Mode       | Full chain                                                                         |
| Status     | Built 4 Oct 2026, drafting suite green (2786 tests). Not committed or reviewed yet |
| Depends on | T-003                                                                              |
| Branch     | feature/t-110-run-type                                                             |
| Created    | 2026-10-04                                                                         |

## Goal

Every generation row says whether it is an initial draft or a revision.

## Context

- Founder, 4 Oct 2026: store `runType`, `initial` or `revision`, in the database for every generation.
- T-003 already stores `runId` and `runSequence`. `resolveRun` is in `apps/drafting/src/routes/documents.routes.ts`.
- Revisions do not exist yet (T-205). This ticket adds the field and writes `initial`, so the data is right from now on.

## Acceptance criteria

- `Generation` has a `runType` field with the values `initial` and `revision`.
- Both generate routes write `runType: initial`, on completed and on failed rows.
- A retry after a failure keeps the `runType` of the attempt it retries.
- Rows written before this ticket have no `runType`. Every reader treats them as `initial`.
- The Helicone request carries `Helicone-Property-Run-Type`, and log lines in the generation path include it.
- Tests cover: a first draft, a failed draft, and a retry.

## In scope

- `apps/drafting/src/models/Generation.model.ts`
- `apps/drafting/src/routes/documents.routes.ts`
- `apps/drafting/src/services/ai.service.ts` (the Helicone header only)

## Out of scope

- Revisions themselves (T-205)
- Any change to prompts or to Ink

## References

- Design: Not needed
- ADR: `handoff/design/T-003-token-usage-design.md` (addendum of 4 Oct 2026) and `docs/adr/ADR-019-intake-and-routing.md`, section 3.14
- Legal sign-off: Given by Ajay on 4 Oct 2026 for the Helicone header only, the same scope as his T-003 sign-off. Void if any prompt text changes

## Build note (Vishal, 4 Oct 2026)

- `Generation.runType` (`initial` | `revision`, enum-checked, no default so old rows stay without it). Read it through `effectiveRunType(row)`, which returns `initial` for old rows.
- `resolveRun` now returns `runType`: `initial` for a new run, the latest attempt's type for a retry.
- `recordGeneration` writes it on all six call sites (completed and both failure paths, both routes). Helicone gets `Helicone-Property-Run-Type`. Generation-path log lines include it.
- No prompt text changed in `ai.service.ts`: only the header helper, two input types and two log lines.
- Tests: `apps/drafting/src/__tests__/documents.run-type.test.ts` (first draft, failed draft, retry, legacy route, old rows, retry of a revision attempt, enum rejection).
- **For T-205:** a retry of a failed revision cannot reach the revision branch yet. The run already has a completed attempt, so `resolveRun` starts a new run. T-205 has to add the revision request path that the T-003 addendum describes.
- Seen while testing, not caused by this ticket: `documents.generate.usage.test.ts` "spendInk ... same amount" failed in one of two full-suite runs and passed 3 of 3 times on its own. It reads the `inkledger` row before `spendInk`'s fire-and-forget write lands.
