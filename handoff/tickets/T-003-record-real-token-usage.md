# T-003 — Record real token usage for every generation

| Field      | Value                            |
| ---------- | -------------------------------- |
| Phase      | 0 — Prep                         |
| Owner      | Vishal                           |
| Mode       | Full chain                       |
| Status     | Done                             |
| Depends on | T-001                            |
| Branch     | feature/t-003-record-token-usage |
| Created    | 2026-10-03                       |

## Goal

Every generation records the tokens it really used, so pricing can be checked against real cost.

## Context

- Each generation writes a `Generation` row with `tokensUsed: 0` in `apps/drafting/src/routes/documents.routes.ts` (around lines 307 and 407). `costUsd` stays at its default of 0. The `UsageLog` model exists but nothing writes to it. There is no real token data today.
- `streamLLM` in `apps/drafting/src/services/ai.service.ts` yields text only and drops the usage numbers.
- Generation makes one model call per `ai_generated` section. Each call resends the system prompt with `max_tokens` 8192. There is no prompt caching.
- The admin cost screens (`admin-documents.routes.ts`) and the daily spend cap (`middleware/spendCap.ts`) both sum `Generation.costUsd`, which is always 0. Admin shows zero cost and the spend cap can never fire. Admin converts at a hard-coded 85 rupees per dollar.
- The drops formula (50 + 2 per paragraph) was confirmed on estimates. This ticket supplies the data to check it (T-004).

## Acceptance criteria

- Each generation and regeneration writes its `Generation` row with real input tokens, output tokens, number of model calls, and the paragraph count of the final draft.
- It works on both paths: the Helicone gateway and the direct Anthropic SDK.
- `tokensUsed` equals input plus output, so the admin screens keep working. New fields: `inputTokens`, `outputTokens`, `llmCalls`, `paragraphCount`.
- `costUsd` is computed from per-model rates held in `AppSetting`. The dollar-to-rupee rate also moves to `AppSetting`.
- A generation that fails mid-stream still records the tokens used so far.
- No prompt text and no document content is written to any log.
- Tests cover both paths, a multi-section document, and a mid-stream failure.
- On the Helicone path (OpenAI-compatible stream), usage is requested in the final stream chunk. On the direct path, usage is read from the final message.
- After this ticket the daily spend cap sees real cost. It still only logs. Turning it into a hard block is a separate decision.
- Every draft gets a `runId` and every attempt gets a `runSequence`, 1 for the first try (design section 3.8). Both are stored on the `Generation` row (unique as a pair), the `Document` and the Ink ledger rows, written in log lines, sent to Helicone as property headers, and returned to the browser in headers and in the `done` and `error` events.
- A retry after a failure sends `run_id`. The server checks the run (same user, same template, not completed), keeps the `runId` and raises `runSequence` by 1. A `run_id` that fails the check starts a new run at 1 without an error. The browser never sets the sequence.
- `spendInk` charges exactly the same amount with and without the run values.
- Production uses Helicone only, so the build starts with the Helicone usage spike (design section 6, step 0).

## In scope

- `apps/drafting/src/services/ai.service.ts` (usage capture only)
- `apps/drafting/src/routes/documents.routes.ts`
- `apps/drafting/src/models/Generation.model.ts`
- `apps/drafting/src/routes/admin-documents.routes.ts` (use the recorded cost)
- `apps/drafting/src/models/Document.model.ts` (`runId` and `runSequence` fields)
- `apps/web/src/app/dashboard/new/page.tsx` (retry sends `run_id`; manual checks with screenshots, because web has no tests)
- `apps/drafting/src/services/credits.service.ts` (`spendInk` passes `runId` and `runSequence` to the ledger rows, nothing else)
- `apps/drafting/src/middleware/spendCap.ts`, `enforceFreeLimit.ts` and `GET /documents/usage` (design section 3.7)

## Out of scope

- Any change to prompts
- Prompt caching (worth a later ticket, it would cut the repeated system-prompt cost)
- Any change to what the user is charged

## References

- Design: Not needed
- ADR: `handoff/design/T-003-token-usage-design.md` (Arjun, approved by the founder on 3 Oct 2026). Build to this design.
- Legal sign-off: Given by Ajay on 3 Oct 2026 in the war-room review, for usage capture only. Void if any prompt text changes.

## Open questions

- Paragraph count needs one definition shared with T-202. Proposed: non-empty text blocks in AI-generated sections, not counting headings, cause title, prayer or verification.

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                                                                                                                                                                       |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes | Feasible on both paths. The ticket named the wrong collection: the zeros are in `Generation`, and `UsageLog` is never written. Corrected above.                                                                            |
| Ajay     | Signed off            | Usage capture only. No prompt text may change under this ticket.                                                                                                                                                           |
| Vikram   | Approved              | This is the data T-004 needs. Model rates must be settings, not constants.                                                                                                                                                 |
| Arjun    | Design written        | Vishal asked for a design before code. See `handoff/design/T-003-token-usage-design.md`. It adds: failed drafts are recorded, two readers that count rows must skip failed rows, and the spend cap user-id match is fixed. |
| Founder  | Approved              | Design approved with D1 to D5 as recommended, plus a unique run ID for every generation.                                                                                                                                   |
| Founder  | Added                 | Production is Helicone only. A retry keeps the same `runId` and raises `runSequence`, so one draft is tracked across attempts.                                                                                             |
