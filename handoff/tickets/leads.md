# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-200 | fix/t-200-missing-clause-check | apps/drafting/src/services/brief-drafter.ts (findMissingClauses, hasFixedWording, paragraphNumbers and the clause cues, which stay in code); new apps/drafting/src/__tests__/t200-*.test.ts; apps/drafting/src/services/ai.service.ts (findMissingClauses call sites in streamGenerateFromBrief only: brief values, draft language, R2b record, R1.7 warning; legal path, Ajay signs the diff; extended by Priya 12 Oct 00:20 IST); fixture-only edits in apps/drafting/src/__tests__/ brief-drafter.t136.test.ts, brief-drafter.test.ts, t147e-mandatory-clause-recheck, ai.service.brief-faithfulness, documents.generate-from-brief, t147c, t147d, t147e-fixture-isolation, t148, t189, t197 tests (T-197 is merged, so no row holds it; extended by Priya 12 Oct 00:20 IST). Read-only: rule-pack.service.ts, intake-text.ts, bail_regular.json (mahak's T-190/T-199 comes later; no cues in the pack) | yes: brief-drafter.ts. Ajay signed the rule (56f9be4); the code diff still needs his signed ok before merge | 12 Oct 00:10 IST |
| mahak | T-251 | fix/t-251-default-bail | apps/drafting/src/config/document-rules/default_bail.json; apps/drafting/src/config/document-rules/_averments/default_bail.json (only if Ajay's signed text touches it); apps/drafting/src/services/template-engine.service.ts (only placeholder-context defaults for governing_provision and the bail-bond blank; extended by Priya 12 Oct 03:00 IST, option A); apps/drafting/src/services/intake-brief.ts (ONE change: a "No"/false answer on the default-bail bond checkbox key counts as empty, like unticked; legal path, Ajay signs the diff; extended by Priya 12 Oct 03:30 IST); .prettierignore (root config: one added line, apps/drafting/src/config/document-rules/_averments/, so prettier can't change Ajay's hash-signed file; nobody else holds root config; extended 12 Oct 03:20 IST); scripts/golden-set/fixtures/15-, 16-, 17-default-bail*.json and new 18-default-bail-period-not-given.json (expected values per Ajay's ok only; extended 12 Oct 03:00 IST); new apps/drafting/src/__tests__/t251-*.test.ts; golden snapshot files that move (list them for Ajay, no auto-update) | yes: default_bail.json is legal content. Apply Ajay's signed text (64e1e70) plus his interim procedure-code rule word for word | 12 Oct 02:55 IST |
| shashank | T-248 | fix/t-248-wrong-bnss-citations | apps/drafting/src/config/document-rules/review_petition.json, habeas_corpus.json, discharge_application.json (only the three citations, word for word as Ajay signed); new apps/drafting/src/__tests__/t248-*.test.ts; tests that assert the old citations (listed for Ajay) | yes: the three rule files. Ajay's signed text is the only input (handoff/legal/T-245-old-new-law-switch-signed.md); nothing else in the packs changes | 12 Oct 03:10 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 0. T-256 (t189 test timeout, test only, tiny) 1. T-237 (earlier applications in the other bail packs; uses his T-200 cue map) 2. T-241 (bail instructions assert facts; same packs, after T-237) 2b. T-245a (old/new law switch, bail packs; Ajay signed 345bd24; builds on mahak's T-251 for default_bail) 2e. T-263 (citation-check keeps case names starting with an initial; HIGH priority, Ajay's rule first) 2d. T-261 (clause repair after check 3; Ajay's rule first) 3. T-231 (section-aware matching) | T-237: met (Ajay signed, handoff/legal/T-237-pack-text-signed.md, 909a49c). T-241: Ajay's text. T-231: Ajay's matching rule |
| mahak | 0. T-235 (privacy page text, Ajay signed acfa09b; small web fix, v1 blocker) 0b. T-254 part A (remove the 4 sample PDF links from the home page; copy only) 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 0a. T-248 (three wrong BNSS citations, live errors, tiny; Ajay signed 345bd24) 0a2. T-250 (IEA→BSA and CrPC→BNSS table errors, urgent; after Ajay's corrected tables) 0. T-240 (category list in code; same files and pattern as T-227, small; needed before T-239 batch 1 builds) 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned (template builds, after T-240 merges; assign by who is free) | T-258, T-259, T-260 (batch 1 civil, family/consumer, notices/deeds; need T-240 only), T-257 (batch 1 criminal; also needs T-245a) |  |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Merge queue

Empty. Ask Priya for the slot when your chain is done.

## Last done

- shashank — T-249 merged to `develop_staging` (ef73910, 12 Oct 2026). CI only; nothing to test in the UI. Docs-only pushes no longer start CI.
- shashank — T-227 merged to `develop_staging` (efa610b, 12 Oct 2026). Waiting for Anushka on develop. Deploy note: first boot must log 'Template registry → Mongo sync complete'.
- mahak — T-194 merged to `develop_staging` (324416e, 12 Oct 2026). Ajay AC8 5640356. Waiting for Anushka on develop.
- shashank — T-210 CI hotfix merged to `develop_staging` (23b2971, 12 Oct 2026). Test only, nothing to test in the UI.
- vishal — T-189 merged to `develop_staging` (8bab9f7, 12 Oct 2026). Waiting for Anushka on develop.
- shashank — T-211 merged to `develop_staging` (0d37a2e, 12 Oct 2026). CI only, nothing to test in the UI.
- shashank — T-210 merged to `develop_staging` (37a1d32, 11 Oct 2026). Waiting for Anushka on develop.
- mahak — T-197 merged to `develop_staging` (d74d063, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-209 merged to `develop_staging` (d35ecee, 11 Oct 2026). Waiting for Anushka on develop.
- shashank — T-208 merged to `develop_staging` (d305233, 11 Oct 2026). Waiting for Anushka on develop.
- vishal — T-147 done. T-147a and T-147b merged to `develop` (PR #85, PR #87, 10 Oct 2026). T-147c, T-147d and T-147e merged to `develop_staging` (11 Oct 2026). Also T-196, merged to `develop_staging` (11 Oct 2026).
