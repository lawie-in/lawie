# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-237 | fix/t-237-earlier-applications-other-bail-packs | apps/drafting/src/config/document-rules/bail_anticipatory.json, interim_bail.json, bail_before_magistrate.json (only Ajay's signed text, word for word: handoff/legal/T-237-pack-text-signed.md, 909a49c; earlier_applications clause, Drafter instruction, the two no_flight_risk rewrites); apps/drafting/src/services/brief-drafter.ts (CLAUSE_CUES: EA-standard and EA-interim cue sets only; Ajay lists the diff); new apps/drafting/src/__tests__/t237-*.test.ts; moved golden snapshots (list for Ajay before merge). bail_regular.json stays out: Shashank holds it for T-267 (L324) and T-241 follows | yes: pack text and cue map are Ajay's signed text; one test per pack plus the interim false-positive test | 12 Oct 03:56 UTC |
| mahak | T-273 + T-274 | fix/t-273-t-274-blank-marker-and-escape | apps/drafting/src/utils/missingAsBlanks.ts and its test (case-insensitive marker, T-273); apps/web/src/components/editor/DocumentEditor.tsx (textToHtml escaping, T-274); apps/web/src/components/editor/exportUtils.ts (plainTextToHtml escaping, CRLF); packages/shared/src/blanks.ts only if the parity test needs it (you hold packages/shared). Added 12 Oct: apps/drafting/src/__tests__/t147c-drafter-contract.test.ts L1214-1223 only (the util's one test, which asserts {{Missing: x}} stays untouched and must change); one new apps/drafting/src/__tests__/t273-*.test.ts; apps/web/src/components/intake/briefTypes.ts L379 (case only; /i on the existing check, no other rule change); apps/drafting/src/services/pdf-export.service.ts ~L95 (split CRLF paragraphs like LF). briefTypes.ts, fact-verifier.ts and brief-drafter.ts: grep first and ask me before touching; the two legal ones only with Ajay's sign-off. apps/web has no test runner: list what you checked by hand | only if fact-verifier.ts or brief-drafter.ts change (Ajay lists the diff) | 12 Oct 03:33 UTC |
| shashank | T-267 | fix/t-267-ipc-to-bns-table | apps/drafting/src/config/sections/ipc-to-bns.json (replace byte for byte; SHA-256 c7c8d74a661b304c6fe349e2dad64f1ef6663348746747d5103ca783121dcb78); apps/drafting/src/scripts/seed-sections.ts ('IPC' into SIGNED_TABLES); docs/seeding.md (the IPC line); apps/drafting/src/models/SectionMapping.model.ts ('unverified' added to the enum; seed puts the row's verify text into notes); apps/drafting/src/services/bail-check.service.ts (~L252-254) and its test (a null BNS target means 'no equivalent', never a BNS lookup of the same number; Ajay sees the diff); apps/drafting/src/config/document-rules/ fir_quashing.json (L281, L324-327), discharge_application.json (L285, L288, L290), quashing_528_bnss.json (L304), affidavit_identity.json (L165, L178, L194-195), mact_claim.json (L331, L279, L333-334), legal_notice_defamation.json (L126-127, L196), bail_regular.json (L324 only; Vishal's T-237/T-241 come after this merges): only the cited lines change, to the T-267 table values (Ajay's item D; list the moved snapshots for him; added by Priya 12 Oct); apps/drafting/src/config/bns-mapping.json (delete the unused ipc_to_bns copy, its schema_note and the t250 test line; added by Priya 12 Oct, subject to Ajay's ok); affected drafting tests and goldens (list for Ajay); anything else with IPC→BNS numbers outside the table: grep first and ask me to extend | yes: ipc-to-bns.json is Ajay's signed table (handoff/legal/T-267-ipc-to-bns-corrected-signed.md, 4fed16e) | 12 Oct 03:01 UTC |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-237 (earlier applications in the other bail packs; uses his T-200 cue map) 2. T-241 (bail instructions assert facts; same packs, after T-237) 2b. T-245a (old/new law switch, bail packs; Ajay signed 345bd24; builds on mahak's T-251 for default_bail) 2h. T-270 (validateBnsSections misses code-first cites; after T-200; Ajay's rule first) 2i. T-269 (drafting build hides tsc errors; HIGH, tiny, any lead who is free) 2g. T-267 (IPC→BNS table recheck; after T-250 + T-255; Ajay signs the table first) 2e. T-263 (citation-check keeps case names starting with an initial; HIGH priority, Ajay's rule first) 2f. T-266 (cue matching: word start and whole-token FIR number; after T-200) 2d. T-261 (clause repair after check 3; Ajay's rule first) 3. T-231 (section-aware matching) | T-237: met (Ajay signed, handoff/legal/T-237-pack-text-signed.md, 909a49c). T-241: Ajay's text. T-231: Ajay's matching rule |
| mahak | 0. T-268 (terms page, Ajay's nine signed edits; after T-234) 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 00. T-267 (IPC→BNS corrected table, Ajay signed 4fed16e, 12 Oct; replace ipc-to-bns.json byte for byte, same drill as T-250/T-255; also apps/drafting/src/scripts/seed-sections.ts: add 'IPC' to SIGNED_TABLES so IPC rows carry Ajay's validatedBy; right after T-250+T-255 merges) 0. T-240 (category list in code; same files and pattern as T-227, small; needed before T-239 batch 1 builds) 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned (template builds, after T-240 merges; assign by who is free) | T-258, T-259, T-260 (batch 1 civil, family/consumer, notices/deeds; need T-240 only), T-257 (batch 1 criminal; also needs T-245a), T-265 (batch 2 criminal, first 11; after T-257 and T-255) |  |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Merge queue

(queue empty: shashank's T-267 asks for the slot after its tester, reviewer and doc-writer)

## Last done

- vishal — T-256 + T-264 merged to `develop_staging` (addd9e7, 12 Oct 2026). Tests, a fixture and CI only; nothing to test in the UI. Fixes red run 382 ('420' flake).
- mahak — T-233 + T-271 merged to `develop_staging` (0e965e7, 12 Oct 2026). Ajay approved e80fa13 (privacy). Waiting for Anushka on develop.
- shashank — T-250 + T-255 merged to `develop_staging` (ee76d8e, 12 Oct 2026). Tables are not live until reseeded (develop first; production founder-only after T-275). Waiting for Anushka on develop.
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
