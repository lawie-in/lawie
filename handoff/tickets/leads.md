# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-189 | feature/t-189-ledger-list-and-choice-fields | apps/drafting/src/services/fact-ledger.service.ts; apps/drafting/src/services/intake-brief.ts; apps/drafting/src/services/intake.prompts.ts; apps/drafting/src/services/brief-drafter.ts; packages/shared/src/types/fact-ledger.ts (packages/shared held by vishal); apps/drafting/src/services/averments.ts and apps/drafting/src/routes/intake.routes.ts (extended by Priya, 11 Oct 20:00 IST); apps/drafting/src/services/fact-verifier.ts (extended by Priya, 11 Oct 23:15 IST: T-228 folded into T-189; Ajay signs the per-entry read); apps/drafting/src/__tests__/t147b-ledger.test.ts, t147c-drafter-contract.test.ts, intake-brief.test.ts, new t189-*.test.ts | yes: intake-brief.ts, intake.prompts.ts, brief-drafter.ts. No Ajay ref yet: edit any of the three only with Ajay's signed diff (T-189 AC9); stop and escalate if needed. Golden snapshots read-only | 11 Oct 16:25 IST |
| mahak | T-194 | feature/t-194-export-shows-blanks | apps/web/src/components/editor/exportUtils.ts; apps/web/src/components/editor/ (new export-warning component); apps/web/src/components/editor/DocumentEditor.tsx (cursor to first blank; extended by Priya 11 Oct 22:55 IST); PENDING: packages/shared/src/blanks.ts (new file, the one blank-set function), moves to mahak when vishal's T-189 merges and his packages/shared hold ends; apps/web/src/app/dashboard/documents/[id]/page.tsx; apps/web/src/components/intake/briefTypes.ts (countBlanks); apps/drafting/src/services/pdf-export.service.ts; apps/drafting/src/utils/missingAsBlanks.ts; apps/drafting/src/routes/documents.routes.ts (PDF export route only); new apps/drafting/src/__tests__/t194-*.test.ts | no edits to legal paths: brief-drafter.ts (vishal's row), fact-verifier.ts, citation-check.ts are import/read-only for the blank markers. Header text and blank style are Ajay's, signed in the ticket (AC8) | 11 Oct 22:20 IST |
| shashank | T-211 | fix/t-211-ci-mongo-binary-cache | .github/workflows/ci.yml (root config, held by shashank); service setupDb.ts files only if the pre-download needs it (ask Priya) | no | 12 Oct 00:00 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-200 (brief-drafter.ts, already his) 2. T-190 with T-199 (bail_regular.json, one branch if Ajay agrees) 3. T-191, T-192 | T-200: Ajay's rule. T-190/T-199: Ajay's question text. T-191/T-192: Ajay signs the logic |
| mahak | 1. T-226 (no overspend; documents.routes.ts, after T-194) 2. T-140 part 1 (after T-189 merges) 3. T-137 web part | T-226: Arjun's mechanism. T-140: Priya's scope + Ajay ok on the court rule. T-137: on hold (founder, 11 Oct) |
| shashank | 1. T-229 (Sentry scrub in every service; needs packages/shared after vishal and mahak) 2. T-227 (one price list) 3. T-187 build | T-229: none (Arjun's approach in). T-227: Rajesh for AC3 cost screen. T-187: Arjun + Ajay rule |
| unassigned | T-129, T-193, T-198, T-188, T-207 | Ajay content (T-129, T-193, T-198); Arjun + Ajay option (T-188); Vishal's problem statement (T-207) |

## Merge queue

Empty.

## Last done

- shashank — T-210 merged to `develop_staging` (37a1d32, 11 Oct 2026). Waiting for Anushka on develop.
- mahak — T-197 merged to `develop_staging` (d74d063, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-209 merged to `develop_staging` (d35ecee, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
