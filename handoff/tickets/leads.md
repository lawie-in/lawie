# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-200 | fix/t-200-missing-clause-check | apps/drafting/src/services/brief-drafter.ts (findMissingClauses, hasFixedWording, paragraphNumbers and the clause cues, which stay in code); new apps/drafting/src/__tests__/t200-*.test.ts; apps/drafting/src/services/ai.service.ts (findMissingClauses call sites in streamGenerateFromBrief only: brief values, draft language, R2b record, R1.7 warning; legal path, Ajay signs the diff; extended by Priya 12 Oct 00:20 IST); fixture-only edits in apps/drafting/src/__tests__/ brief-drafter.t136.test.ts, brief-drafter.test.ts, t147e-mandatory-clause-recheck, ai.service.brief-faithfulness, documents.generate-from-brief, t147c, t147d, t147e-fixture-isolation, t148, t189, t197 tests (T-197 is merged, so no row holds it; extended by Priya 12 Oct 00:20 IST). Read-only: rule-pack.service.ts, intake-text.ts, bail_regular.json (mahak's T-190/T-199 comes later; no cues in the pack) | yes: brief-drafter.ts. Ajay signed the rule (56f9be4); the code diff still needs his signed ok before merge | 12 Oct 00:10 IST |
| mahak | T-194 | feature/t-194-export-shows-blanks | apps/web/src/components/editor/exportUtils.ts; apps/web/src/components/editor/ (new export-warning component); apps/web/src/components/editor/DocumentEditor.tsx (cursor to first blank; extended by Priya 11 Oct 22:55 IST); packages/shared/src/blanks.ts (new file, the one blank-set function; packages/shared held by mahak from 12 Oct 00:10 IST, after T-189 merged); apps/web/src/app/dashboard/documents/[id]/page.tsx; apps/web/src/components/intake/briefTypes.ts (countBlanks); apps/drafting/src/services/pdf-export.service.ts; apps/drafting/src/utils/missingAsBlanks.ts; apps/drafting/src/routes/documents.routes.ts (split by range, Priya 12 Oct 00:30 IST: only the pdf-export.service import ~line 49 and POST /:id/export/pdf, already done in bd5d18c; no further edits); new apps/drafting/src/__tests__/t194-*.test.ts | no edits to legal paths: brief-drafter.ts (vishal's row), fact-verifier.ts, citation-check.ts are import/read-only for the blank markers. Header text and blank style are Ajay's, signed in the ticket (AC8) | 11 Oct 22:20 IST |
| shashank | T-227 | fix/t-227-price-matches-charge | apps/drafting/src/services/credits.service.ts; apps/drafting/src/middleware/enforceCredits.ts; apps/drafting/src/routes/templates.routes.ts; apps/drafting/src/models/Template.model.ts; apps/drafting/src/services/template-seed.service.ts; apps/drafting/src/services/template-promoter.ts; apps/drafting/src/routes/admin-documents.routes.ts (price field only); apps/drafting/src/routes/documents.routes.ts (split by range, Priya 12 Oct 00:30 IST: the charge lines `creditCost ?? 1` ~594/1064/1270, the legacy /generate docType enum ~229-241 and the guided id ~638/694; NOT the import at ~49 or POST /:id/export/pdf, which are mahak's); apps/drafting/src/__tests__/template.model.test.ts and template-promoter.test.ts (old default of 1 only); new apps/drafting/src/__tests__/t227-*.test.ts | no edits to document-rules/ (legal path): the price moves out of the rule files into one list in code; any rule-file edit needs Ajay's signed diff, so ask Priya first | 12 Oct 02:30 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-237 (earlier applications in the other bail packs; uses his T-200 cue map) 2. T-241 (bail instructions assert facts; same packs, after T-237) 3. T-231 (section-aware matching) | T-237: met (Ajay signed, handoff/legal/T-237-pack-text-signed.md, 909a49c). T-241: Ajay's text. T-231: Ajay's matching rule |
| mahak | 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Merge queue

Empty. Ask Priya for the slot when your chain is done.

## Last done

- shashank — T-210 CI hotfix merged to `develop_staging` (23b2971, 12 Oct 2026). Test only, nothing to test in the UI.
- vishal — T-189 merged to `develop_staging` (8bab9f7, 12 Oct 2026). Waiting for Anushka on develop.
- shashank — T-211 merged to `develop_staging` (0d37a2e, 12 Oct 2026). CI only, nothing to test in the UI.
- shashank — T-210 merged to `develop_staging` (37a1d32, 11 Oct 2026). Waiting for Anushka on develop.
- mahak — T-197 merged to `develop_staging` (d74d063, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-209 merged to `develop_staging` (d35ecee, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
