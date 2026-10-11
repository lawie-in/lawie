# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-189 | feature/t-189-ledger-list-and-choice-fields | apps/drafting/src/services/fact-ledger.service.ts; apps/drafting/src/services/intake-brief.ts; apps/drafting/src/services/intake.prompts.ts; apps/drafting/src/services/brief-drafter.ts; packages/shared/src/types/fact-ledger.ts (packages/shared held by vishal); apps/drafting/src/services/averments.ts and apps/drafting/src/routes/intake.routes.ts (extended by Priya, 11 Oct 20:00 IST); apps/drafting/src/__tests__/t147b-ledger.test.ts, t147c-drafter-contract.test.ts, intake-brief.test.ts, new t189-*.test.ts | yes: intake-brief.ts, intake.prompts.ts, brief-drafter.ts. No Ajay ref yet: edit any of the three only with Ajay's signed diff (T-189 AC9); stop and escalate if needed. Golden snapshots read-only | 11 Oct 16:25 IST |
| mahak | T-194 | feature/t-194-export-shows-blanks | apps/web/src/components/editor/exportUtils.ts; apps/web/src/components/editor/ (new export-warning component); apps/web/src/app/dashboard/documents/[id]/page.tsx; apps/web/src/components/intake/briefTypes.ts (countBlanks); apps/drafting/src/services/pdf-export.service.ts; apps/drafting/src/utils/missingAsBlanks.ts; apps/drafting/src/routes/documents.routes.ts (PDF export route only); new apps/drafting/src/__tests__/t194-*.test.ts | no edits to legal paths: brief-drafter.ts (vishal's row), fact-verifier.ts, citation-check.ts are import/read-only for the blank markers. Header text and blank style are Ajay's, signed in the ticket (AC8) | 11 Oct 22:20 IST |
| shashank | T-210 | fix/t-210-no-email-in-auth-logs | apps/auth/src/config/passport.ts; apps/auth/src/config/logger.ts; apps/auth/src/middleware/errorHandler.ts; apps/auth/src/config/sentry.ts and apps/auth/src/app.ts (Sentry setup only; extended by Priya 11 Oct 22:25 IST per Arjun's AC4 call); any other apps/auth/src file whose logger call carries an email (extend via Priya); new apps/auth/src/__tests__/t210-*.test.ts | no | 11 Oct 21:50 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 0. T-228 (verifier + averments read every list entry; same files and context as T-189) 1. T-200 (brief-drafter.ts, already his) 2. T-190 with T-199 (bail_regular.json, one branch if Ajay agrees) 3. T-191, T-192 | T-200: Ajay's rule. T-190/T-199: Ajay's question text. T-191/T-192: Ajay signs the logic |
| mahak | 1. T-226 (no overspend; documents.routes.ts, after T-194) 2. T-140 part 1 (after T-189 merges) 3. T-137 web part | T-226: Arjun's mechanism. T-140: Priya's scope + Ajay ok on the court rule. T-137: on hold (founder, 11 Oct) |
| shashank | 1. T-211 (Mongo download race in CI, widened 11 Oct) 2. T-227 (one price list) 3. T-187 build | T-211: Arjun ok on the CI approach (root config). T-227: none (Vikram's prices in; AC3 cost screen needs Rajesh). T-187: Arjun + Ajay rule |
| unassigned | T-129, T-193, T-198, T-188, T-207 | Ajay content (T-129, T-193, T-198); Arjun + Ajay option (T-188); Vishal's problem statement (T-207) |

## Merge queue

Empty.

## Last done

- mahak — T-197 merged to `develop_staging` (d74d063, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-209 merged to `develop_staging` (d35ecee, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
