# Lead claims

Claim record for the three dev leads. Priya is the only writer. Leads read it from `origin/develop_staging` with `git show`, never from their own branch. Rules: `.claude/docs/multi-lead.md`.

## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| shashank | T-356 part 1 | fix/t-356-* (Shashank names it) | apps/drafting/src/config/env.ts (FEATURE_DEFAULT_DESCRIBE_FIRST default on; FACT_LEDGER stays off) + the feature-flag reader in apps/drafting/src/services/intake.service.ts (Arjun: list form retired, on/off only) + root .env.example (line 54, FEATURE_DEFAULT_DESCRIBE_FIRST=on; root config, shashank holds it until T-356 part 1 merges) + tests. Anything else after Explore: ask Priya | no | 12 Oct 2026 |
| mahak | T-223 | feature/t-223-* (Mahak names it) | T-223 (full chain). auth: models/User.model.ts, services/auth.service.ts*, controllers/auth.controller.ts*, routes/auth.routes.ts*, new routes/internal-verify.routes.ts, app.ts, config/passport.ts, config/logger.ts, config/env.ts, a new rate-limit helper in services/, apps/auth/package.json. Root yarn.lock (workspace link line only; mahak holds root yarn.lock until T-223 merges). packages/email-client/src/index.ts + its test. email-worker: src/worker.ts, src/templates/index.ts, new templates/auth/verifyEmail.tsx, src/config/env.ts. billing: src/routes/billing.routes.ts, src/models/User.model.ts. web: app/dashboard/layout.tsx, new components/VerifyEmailPrompt.tsx, new app/verify-email/page.tsx, components/intake/OneFlow.tsx, app/dashboard/new/page.tsx, components/credits/TopUpModal.tsx, app/dashboard/settings/page.tsx, app/(auth)/login/page.tsx. New t223 tests in each. *Kunal holds these three until T-354 merges: build them after. gateway: apps/gateway/src/app.ts (404 for any /internal/ path ahead of every proxy; Arjun 5863d7d) + a new gateway test; new auth verify service and route files. Test fixtures: apps/email-worker/src/__tests__/setupEnv.ts, t220-ac8-env-failfast.test.ts, apps/billing/src/__tests__/billing.routes.test.ts, t343-privacy-reaccept.test.ts. Arjun approved AUTH_SERVICE_URL | no | 12 Oct 2026 |
| vishal | T-342 | fix/t-342-* (Vishal names it) | apps/drafting/src/config/intake/date-meanings.json (legal: Ajay's Option B, new date kinds with his labels); then apps/drafting/src/services/intake-brief.ts (per-field labels, kind check scoped to the pack, longest-cue precedence) ONLY after Mahak's T-335 merges; apps/drafting/src/config/document-rules/legal_notice_s138.json and its docs/templates twin (legal: ask_when_empty on L4 and L5 with Ajay's labels); new t342 test running T-192's checks end to end from a description. Anything else after Explore: ask Priya | yes: Ajay signs the JSON diff | 12 Oct 2026 |
| kunal | FIX develop_staging red (golden privacy header), then T-354 | fix/t-354-* (Kunal names it) | Fix first: scripts/golden-set/lib/pipeline.ts (send the privacy version header, ~line 165). Then T-354: apps/auth/src/routes/auth.routes.ts, controllers/auth.controller.ts, services/auth.service.ts (the privacy accept route: test + comment; reorder only if Arjun says), their tests; web PrivacyUpdatePrompt.tsx only if the a11y check needs a fix. packages/shared released | no | 12 Oct 2026 |
| tanvi | T-357 (T-349 + T-350 merged 6be8b14) | fix/t-349-* (Tanvi names it) | apps/drafting/src/services/brief-drafter.ts (filingDate), annexures.service.ts, template-engine.service.ts (the AI prompt date line, Ajay's wording; loadTemplateConfig invalid-override handling for T-350), tests. Moved goldens go to Ajay. T-357 stacks on the same branch: apps/drafting/src/routes/documents.routes.ts (try/catch at ~665/747 → 500) and template-engine.service.ts (null override JSON; non-plain override filenames fail the boot check). Anything else after Explore: ask Priya | yes: prompt line wording (Ajay) | 12 Oct 2026 |

## Next per lead (Priya, 11 Oct 2026). Not claims: each is assigned only when its row is free and its gate is met

| Lead | Next, in order | Gate still open |
|---|---|---|
| vishal | 1. T-237 (earlier applications in the other bail packs; uses his T-200 cue map) 2. T-241 (bail instructions assert facts; same packs, after T-237) 2b. T-245a (old/new law switch, bail packs; Ajay signed 345bd24; builds on mahak's T-251 for default_bail) 2h. T-270 (validateBnsSections misses code-first cites; after T-200; Ajay's rule first) 2i. T-269 (drafting build hides tsc errors; HIGH, tiny, any lead who is free) 2g. T-267 (IPC→BNS table recheck; after T-250 + T-255; Ajay signs the table first) 2e. T-263 (citation-check keeps case names starting with an initial; HIGH priority, Ajay's rule first) 2f. T-266 (cue matching: word start and whole-token FIR number; after T-200) 2d. T-261 (clause repair after check 3; Ajay's rule first) 3. T-231 (section-aware matching) | T-237: met (Ajay signed, handoff/legal/T-237-pack-text-signed.md, 909a49c). T-241: Ajay's text. T-231: Ajay's matching rule |
| mahak | 0. T-268 (terms page, Ajay's nine signed edits; after T-234) 1. T-233 (empty DOCX, PDF margin; same file as T-194) 2. T-190 + T-199 on one branch (bail_regular.json questions; moved from vishal, 12 Oct) 3. T-226 (no overspend) | T-233: none. T-190/T-199: met (Ajay signed both, Arjun confirmed the gate). T-226: Arjun's mechanism (asked 12 Oct) |
| shashank | 00. T-267 (IPC→BNS corrected table, Ajay signed 4fed16e, 12 Oct; replace ipc-to-bns.json byte for byte, same drill as T-250/T-255; also apps/drafting/src/scripts/seed-sections.ts: add 'IPC' to SIGNED_TABLES so IPC rows carry Ajay's validatedBy; right after T-250+T-255 merges) 0. T-240 (category list in code; same files and pattern as T-227, small; needed before T-239 batch 1 builds) 1. T-234 (email and password sign-up in the web app + terms acceptance record; moved in for v1, 12 Oct) 2. T-221 (forgot password; same login page) 3. T-229 (Sentry scrub, needs packages/shared) | T-234: met (Rajesh's check, Ajay's consent line). T-221: met (design, copy approved); sends for real only after T-220. T-229: none |
| unassigned (template builds, after T-240 merges; assign by who is free) | T-258, T-259, T-260 (batch 1 civil, family/consumer, notices/deeds; need T-240 only), T-257 (batch 1 criminal; also needs T-245a), T-265 (batch 2 criminal, first 11; after T-257 and T-255) |  |
| unassigned | T-191, T-192 (Ajay signs the logic), T-223 (criteria to write), T-232 (Arjun triage), T-235 (Ajay text), T-129, T-193, T-198, T-188, T-207 | As listed |

## Ready to build, no gate (Priya, 12 Oct 2026)

- T-226 (no overspend; mahak is next after T-279 (asked 12 Oct); Arjun's `inkHolds` design is in the ticket, T-197 merged): next for the first lead who is free; builds before T-115 (both edit `documents.routes.ts`).
- T-220 (emails): the AC6 log leak in `ses.ts` is fixed first; then one founder session for SES and DNS is the remaining gate (morning report).
- T-115: after T-226. Gates: Atlas tier and prod migration (founder), 30-day wording (Ajay), screens (Rajesh).

- T-283 (env default for the two switches; small, drafting only, scoped by Arjun): next for vishal after T-263.
- T-253a+c (assistant): after T-226 and the v1 blockers (Priya's call, 12 Oct). Overlaps: documents.routes.ts (T-226, then T-115a); drafting config/env.ts and app.ts (T-253a, T-283); web layout.tsx and Sidebar.tsx (T-253d, T-234, T-281).

- T-285 (SSE keep-alive on the four drafting streams; small, drafting only; touches ai.service.ts, so after T-241 and T-245a or when no lead holds it): ready.

## Next ticket for each lead (Priya, 13 Oct 2026; Anushka run 3 FAIL fixes)

Each lead takes this after the current row is merged and released. Files are claimed then, as usual.
- vishal: T-342, then T-359 (invented facts; check the overlap with T-187/T-188 first), then T-187 + T-188.
- shashank: T-356 part 1, then T-360 (converter numbers).
- kunal: T-354, then T-364 (Ink and plan display).
- tanvi: T-349 + T-350, T-357, then T-363 (s.138).
- mahak: T-223, then T-365 (brief and template picker).
- Next free lead, in this order: T-369 (web production build fails; a deploy blocker, goes first), T-362, T-361, T-367, T-366, T-368.

## Merge queue

- kunal: T-354 (tests green, small fix, Arjun ruled option A). Next, once CI on bd26efa is green.
- shashank: T-356 part 1 (152df3b, small fix tested green; release gate). After kunal (T-354 unblocks Mahak's T-223), ahead of vishal and tanvi T-357.
- vishal: T-342 (round 2 review passed, tests green, Ajay signed 59eff64 at 54951db). Merges once the _meta.signed line is in. After kunal T-354; check with the slot holder first.
- tanvi: T-357 (c741f59, small fix tested green). After vishal; check with the slot holder first.

## Last done

- mahak: T-220 retry test race fix merged bd26efa (13 Oct 2026). Test only.
- tanvi: T-349 + T-350 merged 6be8b14 (12 Oct 2026); Ajay signed fe8113d.
- shashank: T-346 merged 4389cf1 (12 Oct 2026). Internal refactor of section warnings.
- kunal: CI fix merged 31a182c (12 Oct 2026). The golden-set dry run sends the privacy version; this fixes the red from T-343.
- mahak: T-331 merged d1b4372 (12 Oct 2026). Admin template usage from Generation.
- kunal: T-343 merged 3cbcd78 (12 Oct 2026); Ajay signed. packages/shared released.
- shashank: T-351 merged eae46a9 (12 Oct 2026). Release gate cleared.
- mahak: T-353 merged 9531484 (12 Oct 2026).
- mahak: T-220 step 1 merged b958216 (12 Oct 2026). Steps 2-3 need the founder's SES session.
- tanvi: T-345 + T-340 merged 0d90ed7 (12 Oct 2026); Ajay signed the ai.service.ts diff.
- mahak: T-334 merged 828d55e (12 Oct 2026); Ajay signed 9b484ee.
- kunal: T-344 merged c16b5db (12 Oct 2026).
- kunal: T-348 merged 66bab38 (12 Oct 2026); Ajay approved e7c7849. Release gate cleared.
- mahak: T-335 merged fcc74a5 (12 Oct 2026); Arjun read the diff. intake-brief.ts released to Vishal.
- shashank: T-347 merged a75c522 (12 Oct 2026); Ajay approved 1c2fbf4.
- kunal: T-242 merged 6b37ed6 (12 Oct 2026); Ajay signed 8ac5def; privacy page update shipped with it. Web Sentry leak fixed in T-348 before prod.
- vishal: T-192 merged 5dd6388 (12 Oct 2026); Ajay signed 527421d + averments hash 63b9b13. Date format split to T-340, date meanings T-342.
- mahak: T-338 merged 10faf08 (12 Oct 2026); Ajay signed 2db8acb (clears his fact_ledger gate for the T-190 gap).
- tanvi: T-240 merged 6a6cd2a (12 Oct 2026); Ajay signed the seed diff 903bbe5.
- mahak: T-341 merged 08103ec (12 Oct 2026); Ajay signed 479dc1d + dad223c.
- shashank: T-333 merged 2852e94 (12 Oct 2026); Ajay approved dec06f6.
- mahak: T-336 merged 273b6d4 (12 Oct 2026); Ajay approved cd889c8.
- shashank: T-270 merged e43420d (12 Oct 2026); Ajay signed 2da00de.
- kunal: T-339 merged 5adf962 (12 Oct 2026).
- kunal: T-328 + T-332 merged 5482b37 (12 Oct 2026).
- mahak: T-190 + T-199 merged 65d8707 (12 Oct 2026); Ajay signed edceb11.

- kunal — T-310 merged to `develop_staging` (af975f2, 12 Oct 2026). Consent card before Google Analytics; privacy page updated. Ajay signed 0a3ab47. Waiting for Anushka on develop.
- vishal — T-327 merged to `develop_staging` (cd5b32b, 12 Oct 2026). Default bail: the brief's own period/expiry blank is accepted as is. Ajay signed. Waiting for Anushka on develop.
- shashank — T-324 merged to `develop_staging` (cf26a25, 12 Oct 2026). A matching IPC alias on a BNS entry no longer warns; mismatches and bare IPC still do. Ajay approved. Waiting for Anushka on develop.
- kunal — T-299 + T-308 (991c0f6) and T-325 (84d9e4c) merged to `develop_staging`, 12 Oct 2026. Auth hardening, privacy GA wording, revoked tokens refused. Ajay signed 41d4c32. Waiting for Anushka on develop.
- tanvi — T-326 merged to `develop_staging` (d51311e, 12 Oct 2026). Converter: new BNS provisions show "No equivalent in the IPC"; copy gives the new section only. Ajay signed. Waiting for Anushka on develop.
- mahak — T-321 merged to `develop_staging` (36ea45e, 12 Oct 2026). One AI footer per exported draft. Ajay signed ca7d6e7. Waiting for Anushka on develop.
- mahak — T-276 merged to `develop_staging` (8db6fd3, 12 Oct 2026). No false lint-staged failure on docs; root config released. Nothing to test in the UI.
- vishal — T-322 merged to `develop_staging` (e4523df, 12 Oct 2026). A signed blank covers its clause; no needless repair. Ajay signed. Waiting for Anushka on develop.
- tanvi — T-280 merged to `develop_staging` (d80774f, 12 Oct 2026). Converter shows old and new section titles. Ajay signed. Waiting for Anushka on develop after the founder's develop reseed.
- shashank — T-295 merged to `develop_staging` (2e06933, 12 Oct 2026). Old-law sections get a soft warning in Ajay's words; draft continues. Ajay approved. Waiting for Anushka on develop.
- mahak — T-313 merged to `develop_staging` (a6b2162, 12 Oct 2026). Optional enrollment field on bail_regular, bail_anticipatory and consumer_complaint. Ajay signed 01f451e. Waiting for Anushka on develop.
- tanvi — T-323 merged to `develop_staging` (6869fa1, 12 Oct 2026). Webhook signature length and body shape refused cleanly; t320 flake fixed. Nothing to test in the UI.
- kunal — T-319 merged to `develop_staging` (2b02eae, 12 Oct 2026). Google sign-in bound to the browser that started it (no login CSRF). Ajay OK'd. Waiting for Anushka on develop; needs develop on https.
- tanvi — T-320 merged to `develop_staging` (d34a5d7, 12 Oct 2026). Stronger leak tests, safe webhook parse, email-worker CI job; ci.yml released. Nothing to test in the UI.
- mahak — T-318 merged to `develop_staging` (f5e7edb, 12 Oct 2026). New footers on server PDFs, annexures and the welcome email. Ajay signed 71fd81a and the 78 golden lines. Waiting for Anushka on develop.
- vishal — T-316 merged to `develop_staging` (2353146, 12 Oct 2026). t241 tests relabelled; tests only.
- shashank — T-278 merged to `develop_staging` (92efbc3, 12 Oct 2026). Bail checker and timeline show signed notes, never a guess. Ajay approved. Waiting for Anushka on develop.
- kunal — T-306 merged to `develop_staging` (ba54d48, 12 Oct 2026). No login token in URLs or analytics; GA only on public pages; site title, keywords and description updated. Ajay signed f718a2b. Waiting for Anushka on develop.
- tanvi — T-315 merged to `develop_staging` (9f08095, 12 Oct 2026). Shared JSON-error handler in auth, billing, gateway, email-worker; no body in logs or Sentry. Arjun OK'd. Nothing to test in the UI.
- mahak — T-317 merged to `develop_staging` (ca2d88f, 12 Oct 2026). Old claim lines gone from home, FAQ, About, Tools, footers and the exported PDF. Ajay signed d3d5301. Waiting for Anushka on develop.
- vishal — T-241 merged to `develop_staging` (6bb8f85, 12 Oct 2026). Bail packs no longer assert facts the brief doesn't hold. Ajay signed 78a123b + Addendum 2. Waiting for Anushka on develop.
- mahak — T-268 merged to `develop_staging` (f6566b4, 12 Oct 2026). Terms page carries Ajay's nine signed edits. Waiting for Anushka on develop.
- mahak — T-314 merged to `develop_staging` (a10a220, 12 Oct 2026). Legacy enrollment input checked (50-char cap). Ajay signed 3f9fa83. Nothing to test in the UI.
- kunal — T-234 + T-298 merged to `develop_staging` (b4d6b58, 12 Oct 2026). Email and password sign-up and sign-in; referral Ink granted once. Ajay signed c2fc394. Waiting for Anushka on develop.
- tanvi — T-307 merged to `develop_staging` (002d7bd, 12 Oct 2026). Drafting answers malformed bodies with plain JSON, no echo. Arjun OK'd. Nothing to test in the UI.
- mahak — T-311 merged to `develop_staging` (0bff26f, 12 Oct 2026). Enrollment number from the profile, typed value first. Ajay signed 3afe965. Waiting for Anushka on develop.
- tanvi — T-296 merged to `develop_staging` (32fc50b, 12 Oct 2026). Converter fits a phone; merged/split badges in plain words; None only for repealed. Ajay signed. Waiting for Anushka on develop.
- mahak — T-300 merged to `develop_staging` (048a632, 12 Oct 2026). Server-only template keys; advocate name consistent across draft and annexures. Ajay signed 12482f0 + dd90fe5. Waiting for Anushka on develop.
- shashank — T-294 merged to `develop_staging` (205e199, 12 Oct 2026). Seeding doc names the right files; wider t297 guard. Nothing to test in the UI.
- shashank — T-297 merged to `develop_staging` (9b4468b, 12 Oct 2026). Court notes defer to the First Schedule, JMFC note fixed. Ajay signed ff4eaac. Waiting for Anushka on develop.
- tanvi — T-309 merged to `develop_staging` (ed989ee, 12 Oct 2026). Section picker hardening: one bad chip fails alone, retry, caps, long chips wrap. Waiting for Anushka on develop.
- tanvi — T-290 merged to `develop_staging` (83a5c07, 12 Oct 2026). Section picker shows what each section was read as. Ajay signed d235458. Waiting for Anushka on develop.
- mahak — T-293 merged to `develop_staging` (cf05202, 12 Oct 2026). Sections-charged read key is server-only; bad JSON never throws. Ajay signed 120a97b. Waiting for Anushka on develop.
- vishal — T-287 merged to `develop_staging` (620ac98, 12 Oct 2026). Heartbeat test race fixed; usage-test flake stays open as T-287a (watch). Tests only.
- shashank — T-289 merged to `develop_staging` (ad6db61, 12 Oct 2026). Trial court from the First Schedule's signed "triable by" column. .prettierignore released. Waiting for Anushka on develop.
- mahak — T-292 merged to `develop_staging` (613e151, 12 Oct 2026). Intake prompt no longer asks for a matter label. Waiting for Anushka on develop.
- tanvi — T-291 merged to `develop_staging` (38433f3, 12 Oct 2026). Remove buttons on section chips and files: 44 px on phones. Waiting for Anushka on develop.
- kunal — T-284 merged to `develop_staging` (f1819ef, 12 Oct 2026). Privacy page waitlist bullets (Ajay's text). Waiting for Anushka on develop.
- shashank — T-277 merged to `develop_staging` (0e4832a, 12 Oct 2026). Ajay's corrected BNS offence table everywhere it is read. Unblocks T-278, T-280, T-289, T-290, T-293, T-294, T-295, T-241. Waiting for Anushka on develop.
- mahak — T-115e merged to `develop_staging` (2355979, 12 Oct 2026). Events keep a fixed category only, no matter label. Waiting for Anushka on develop.
- vishal — T-266 merged to `develop_staging` (633aa29, 12 Oct 2026). Cue matching: word start, whole-token FIR number. Waiting for Anushka on develop.
- mahak — T-115a merged to `develop_staging` (7c697a2, 12 Oct 2026). Saved case details encrypted; reads old or new. Production backfill is the founder's, after an offline key backup. Waiting for Anushka on develop.
- vishal — T-269 merged to `develop_staging` (9ddda55, 12 Oct 2026). The drafting build now fails on a type error, and CI runs it. Nothing to test in the UI.
- mahak — T-288 merged to `develop_staging` (66753fc, 12 Oct 2026). A failed re-hold no longer delivers an unpaid draft. Waiting for Anushka on develop.
- vishal — T-285 merged to `develop_staging` (50720bd, 12 Oct 2026). SSE keep-alive on the four draft streams. Pull before touching ai.service.ts. Waiting for Anushka on develop.
- mahak — T-226 merged to `develop_staging` (4087d6f, 12 Oct 2026). Ink holds: no overspend. Pull before touching credits.service.ts or documents.routes.ts. Waiting for Anushka on develop.
- vishal — T-283 merged to `develop_staging` (797cefd, 12 Oct 2026). Env default for the two switches. Founder step (develop environment file) is in the morning report.
- vishal — T-263 merged to `develop_staging` (4a51d23, 12 Oct 2026). Ajay approved Addenda 1–7. Pull before touching citation-check.ts. Waiting for Anushka on develop.
- mahak — T-279 merged to `develop_staging` (d0a51bf, 12 Oct 2026). Ajay approved 6bd2586. Pull before touching fact-verifier.ts. Waiting for Anushka on develop.
- vishal — T-282 merged to `develop_staging` (4958b96, 12 Oct 2026). Tests only; nothing to test in the UI. Ajay approved 850fff6.
- mahak — T-238 merged to `develop_staging` (59e4ac8, 12 Oct 2026). Ajay approved 41a41ff; wording signed in handoff/legal/T-238-pricing-page-lines-signed.md. Waiting for Anushka on develop.
- shashank — T-267 merged to `develop_staging` (ee93984, 12 Oct 2026). IPC table not live until reseed with --force (develop first; production founder-only, T-275 is merged). Pack corrections live at deploy. Waiting for Anushka on develop. Merged just as the founder's hold came; nothing new started.
- vishal — T-237 merged to `develop_staging` (8f31985, 12 Oct 2026). Ajay approved 41f23aa. Waiting for Anushka on develop.
- mahak — T-281 merged to `develop_staging` (089eb8c, 12 Oct 2026). Rajesh's design. Waiting for Anushka on develop. Not a 'works on mobile' claim (T-138 and the T-141a ban stand).
- mahak — T-275 merged to `develop_staging` (5900d7f, 12 Oct 2026). Ajay approved 5fc4d59. Waiting for Anushka on develop. The production reseed condition on T-275 is now met (founder-only).
- mahak — T-273 + T-274 merged to `develop_staging` (346cde7, 12 Oct 2026). No legal files touched. Waiting for Anushka on develop.
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
