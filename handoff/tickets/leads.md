# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-256 + T-264 | fix/t-256-t-264-test-and-golden-fixes | apps/drafting/src/__tests__/t189-*.test.ts (timeout, AC7 asserts: T-256); scripts/golden-set/fixtures/ (fixture 1a's recorded clean reply, plus any other fixture that fails the same way; Ajay sees changed draft text: T-264); .github/workflows/ci.yml (only: add the golden-set dry-run to the drafting test step, no secrets needed; nobody else holds root config now: T-264 AC4)  ; plus the drafting `changes` filter line for scripts/golden-set/** (added by Priya 12 Oct 07:55 IST)| none for t189. Fixture draft text: Ajay sees it | 12 Oct 04:55 IST |
| mahak | T-233 + T-271 | fix/t-233-t-271-export-bugs-and-privacy-polish | apps/web/src/components/editor/exportUtils.ts (empty DOCX, PDF margin left); apps/web/src/app/dashboard/documents/[id]/page.tsx (exportFile catch and retry message); packages/shared/src/blanks.ts (case-insensitive blank marker only, Ajay's T-194 follow-up; packages/shared is held by you alone); apps/web/src/app/(marketing)/privacy/page.tsx (T-271: table scroll box keyboard focus, and the meta description, Ajay's exact string in T-271; body text untouched); no web tests exist: list what you checked by hand; apps/drafting/src/__tests__/t233-blank-case.test.ts (new test file only, added by Priya 12 Oct) | privacy page: Ajay signs the diff as applied (blanks.ts is not a listed legal path, but Ajay saw the case-insensitive item and needs no sign-off) | 12 Oct 02:24 UTC |
| shashank | T-250 + T-255 | fix/t-250-t-255-section-tables | apps/drafting/src/config/sections/iea-to-bsa.json (replace byte for byte, SHA-256 in Ajay's file); apps/drafting/src/config/sections/crpc-to-bnss.json (replace byte for byte, SHA-256 in Ajay's file); apps/drafting/src/config/document-rules/production_of_documents.json (para 7 only, Ajay's section C); apps/drafting/src/config/bns-mapping.json (delete the iea_to_bsa object; "BSA 85 Affidavit" becomes "Affidavit"); apps/drafting/src/config/court-rules/cjm_generic.json (L13 and L55 only: S.16 becomes S.10 and S.23); apps/drafting/src/config/courts/indian-courts.json (only the three metropolitan notes: Ahmedabad, Bengaluru, Chennai); production_of_documents.json beyond para 7 (L218, provisions entries L246-254, L307); all as Ajay signed in handoff/legal/T-250-followup-citations-signed.md (extended by Priya 12 Oct 04:00 IST); apps/drafting/src/scripts/seed-sections.ts, apps/drafting/src/models/SectionMapping.model.ts (add the mappingType value repealed_no_equivalent; fix `notes` vs `note`; small schema change, no ADR), apps/drafting/src/scripts/apply-clo-patch.ts (stop it overwriting the signed values; extended by Priya 12 Oct 03:50 IST, option a); new apps/drafting/src/__tests__/t250-*.test.ts and t255-*.test.ts; tests that encoded a wrong pair (list each for Ajay, nothing else changes); docs/seeding.md (Markdown only: --force for this reseed, the repealed_no_equivalent type, the validatedBy rule, apply-clo-patch removed; added by Priya 12 Oct); .prettierignore (root config, three lines: apps/drafting/src/config/sections/, apps/drafting/src/config/bns-mapping.json, apps/drafting/src/config/court-rules/cjm_generic.json, so the formatter does not rewrite signed legal JSON; nobody else holds it; added by Priya 12 Oct) | yes: all three data files. Ajay's signed text is the only input (handoff/legal/T-250-iea-to-bsa-corrected-signed.md, T-255-crpc-to-bnss-corrected-signed.md) | 12 Oct 03:35 IST |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-237 (earlier applications in the other bail packs; uses his T-200 cue map) 2. T-241 (bail instructions assert facts; same packs, after T-237) 2b. T-245a (old/new law switch, bail packs; Ajay signed 345bd24; builds on mahak's T-251 for default_bail) 2h. T-270 (validateBnsSections misses code-first cites; after T-200; Ajay's rule first) 2i. T-269 (drafting build hides tsc errors; HIGH, tiny, any lead who is free) 2g. T-267 (IPC→BNS table recheck; after T-250 + T-255; Ajay signs the table first) 2e. T-263 (citation-check keeps case names starting with an initial; HIGH priority, Ajay's rule first) 2f. T-266 (cue matching: word start and whole-token FIR number; after T-200) 2d. T-261 (clause repair after check 3; Ajay's rule first) 3. T-231 (section-aware matching) | T-237: met (Ajay signed, handoff/legal/T-237-pack-text-signed.md, 909a49c). T-241: Ajay's text. T-231: Ajay's matching rule |
| mahak | 0. T-268 (terms page, Ajay's nine signed edits; after T-234) 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 00. T-267 (IPC→BNS corrected table, Ajay signed 4fed16e, 12 Oct; replace ipc-to-bns.json byte for byte, same drill as T-250/T-255; also apps/drafting/src/scripts/seed-sections.ts: add 'IPC' to SIGNED_TABLES so IPC rows carry Ajay's validatedBy; right after T-250+T-255 merges) 0. T-240 (category list in code; same files and pattern as T-227, small; needed before T-239 batch 1 builds) 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned (template builds, after T-240 merges; assign by who is free) | T-258, T-259, T-260 (batch 1 civil, family/consumer, notices/deeds; need T-240 only), T-257 (batch 1 criminal; also needs T-245a), T-265 (batch 2 criminal, first 11; after T-257 and T-255) |  |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Merge queue

1. shashank — T-250 + T-255 (chain complete; adding the .prettierignore lines, then he asks for the slot).
2. vishal — T-256 + T-264 (chain complete, bee7185; Ajay approved fixture 1a; goes right after shashank, pulls first).
3. mahak — T-233 + T-271 (reviewer round 1 passed; retest and re-review running).

## Last done

- mahak — T-235 + T-254A merged to `develop_staging` (77a06ec, 12 Oct 2026). Ajay approved d2d0885. Waiting for Anushka on develop. CI #380 (T-252a) was green; #381 running.
- mahak — T-252a merged to `develop_staging` (5355604, 12 Oct 2026). Waiting for Anushka on develop. Copy only.
- vishal — T-200 merged to `develop_staging` (89afcef, 12 Oct 2026). Waiting for Anushka on develop.
- mahak — T-251 merged to `develop_staging` (871f7c6, 12 Oct 2026). Waiting for Anushka on develop. Go-live gate: feature.fact_ledger ON before default_bail is offered.
- shashank — T-248 merged to `develop_staging` (4787900, 12 Oct 2026). Waiting for Anushka on develop.
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
