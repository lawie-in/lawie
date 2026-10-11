# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-189 | feature/t-189-ledger-list-and-choice-fields | apps/drafting/src/services/fact-ledger.service.ts; apps/drafting/src/services/intake-brief.ts; apps/drafting/src/services/intake.prompts.ts; apps/drafting/src/services/brief-drafter.ts; packages/shared/src/types/fact-ledger.ts (packages/shared held by vishal); apps/drafting/src/services/averments.ts and apps/drafting/src/routes/intake.routes.ts (extended by Priya, 11 Oct 20:00 IST); apps/drafting/src/__tests__/t147b-ledger.test.ts, t147c-drafter-contract.test.ts, intake-brief.test.ts, new t189-*.test.ts | yes: intake-brief.ts, intake.prompts.ts, brief-drafter.ts. No Ajay ref yet: edit any of the three only with Ajay's signed diff (T-189 AC9); stop and escalate if needed. Golden snapshots read-only | 11 Oct 16:25 IST |
| mahak | T-197 | fix/t-197-disclaimer-on-every-draft | apps/web/src/components/intake/DraftReadyStep.tsx; apps/web/src/components/intake/OneFlow.tsx; apps/web/src/components/intake/briefTypes.ts; apps/web/src/app/dashboard/documents/; apps/drafting/src/routes/documents.routes.ts; new apps/drafting/src/__tests__/t197-*.test.ts | no. Text is Ajay's, already signed (T-158, T-127 §9). `fact-verifier.ts` is import-only: read `FACT_CHECK_DISCLAIMER`, do not edit | 11 Oct 16:25 IST |
| shashank | T-209 | fix/t-209-token-unique-same-second | apps/auth/src/services/jwt.service.ts; apps/auth/src/services/session.service.ts; new apps/auth/src/__tests__/t209-*.test.ts; new apps/gateway/src/__tests__/t209-*.test.ts (test file only, no gateway source) | no | 11 Oct 20:25 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-200 (brief-drafter.ts, already his) 2. T-190 with T-199 (bail_regular.json, one branch if Ajay agrees) 3. T-191, T-192 | T-200: Ajay's rule. T-190/T-199: Ajay's question text. T-191/T-192: Ajay signs the logic |
| mahak | 1. T-140 part 1, type in a court (needs intake-brief.ts, so after T-189 merges) 2. T-194 (export blanks) 3. T-137 web part | T-140: Priya's scope + Ajay ok on the court rule in intake-brief.ts. T-194: Rajesh's design. T-137: on hold (founder, 11 Oct) until drafting is complete and Vikram's payment calculations are done |
| shashank | 1. T-210 (email in logs) 3. T-211 (flaky referral test) 4. T-187 build | T-209: Arjun heads-up only. T-210, T-211: none. T-187: Arjun + Ajay rule |
| unassigned | T-129, T-193, T-198, T-188, T-207 | Ajay content (T-129, T-193, T-198); Arjun + Ajay option (T-188); Vishal's problem statement (T-207) |

## Merge queue

Empty.

## Last done

- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
