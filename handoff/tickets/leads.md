# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-189 | feature/t-189-ledger-list-and-choice-fields | apps/drafting/src/services/fact-ledger.service.ts; apps/drafting/src/services/intake-brief.ts; apps/drafting/src/services/intake.prompts.ts; apps/drafting/src/services/brief-drafter.ts; packages/shared/src/types/fact-ledger.ts (packages/shared held by vishal); apps/drafting/src/services/averments.ts and apps/drafting/src/routes/intake.routes.ts (extended by Priya, 11 Oct 20:00 IST); apps/drafting/src/services/fact-verifier.ts (extended by Priya, 11 Oct 23:15 IST: T-228 folded into T-189; Ajay signs the per-entry read); apps/drafting/src/config/document-rules/_averments/README.md ('Conditions' section only; legal path, Ajay okays the wording; extended by Priya 12 Oct 02:05 IST); apps/drafting/src/__tests__/t147b-ledger.test.ts, t147c-drafter-contract.test.ts, intake-brief.test.ts, new t189-*.test.ts | yes: intake-brief.ts, intake.prompts.ts, brief-drafter.ts. No Ajay ref yet: edit any of the three only with Ajay's signed diff (T-189 AC9); stop and escalate if needed. Golden snapshots read-only | 11 Oct 16:25 IST |
| mahak | T-194 | feature/t-194-export-shows-blanks | apps/web/src/components/editor/exportUtils.ts; apps/web/src/components/editor/ (new export-warning component); apps/web/src/components/editor/DocumentEditor.tsx (cursor to first blank; extended by Priya 11 Oct 22:55 IST); PENDING: packages/shared/src/blanks.ts (new file, the one blank-set function), moves to mahak when vishal's T-189 merges and his packages/shared hold ends; apps/web/src/app/dashboard/documents/[id]/page.tsx; apps/web/src/components/intake/briefTypes.ts (countBlanks); apps/drafting/src/services/pdf-export.service.ts; apps/drafting/src/utils/missingAsBlanks.ts; apps/drafting/src/routes/documents.routes.ts (PDF export route only); new apps/drafting/src/__tests__/t194-*.test.ts | no edits to legal paths: brief-drafter.ts (vishal's row), fact-verifier.ts, citation-check.ts are import/read-only for the blank markers. Header text and blank style are Ajay's, signed in the ticket (AC8) | 11 Oct 22:20 IST |
| shashank | T-227 | fix/t-227-price-matches-charge | apps/drafting/src/services/credits.service.ts; apps/drafting/src/middleware/enforceCredits.ts; apps/drafting/src/routes/templates.routes.ts; apps/drafting/src/models/Template.model.ts; apps/drafting/src/services/template-seed.service.ts; apps/drafting/src/services/template-promoter.ts; apps/drafting/src/routes/admin-documents.routes.ts (price field only); new apps/drafting/src/__tests__/t227-*.test.ts; apps/auth/src/__tests__/t210-e11000-sentry.test.ts (CI hotfix only: set the Google env inside the test; extended by Priya 12 Oct 02:40 IST because develop_staging auth CI is red) | no edits to document-rules/ (legal path): the price moves out of the rule files into one list in code; any rule-file edit needs Ajay's signed diff, so ask Priya first | 12 Oct 02:30 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-200 (missing-clause check; same files as T-189) 2. T-231 (section-aware matching, after Ajay's rule) | T-200: met (Ajay signed, 56f9be4). T-231: Ajay's matching rule |
| mahak | 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Merge queue

1. vishal — T-189 (ready 12 Oct 01:40 IST; README bullet now Ajay's exact text, d2fb41b). Goes first by Priya's call, 12 Oct: it is ready and it unblocks mahak (packages/shared). The red auth job on develop_staging is the known T-210 test issue, not his: he re-runs drafting plus any workspace the merge changes; auth red alone does not stop his push.
2. shashank — T-210 CI hotfix (t210-e11000-sentry.test.ts, test only), as soon as it is ready.

## Last done

- shashank — T-211 merged to `develop_staging` (0d37a2e, 12 Oct 2026). CI only, nothing to test in the UI.
- shashank — T-210 merged to `develop_staging` (37a1d32, 11 Oct 2026). Waiting for Anushka on develop.
- mahak — T-197 merged to `develop_staging` (d74d063, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-209 merged to `develop_staging` (d35ecee, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
