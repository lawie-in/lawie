# CLAUDE.md — Vishal · Lead Developer · Lawie

> This file is read automatically by Claude Code in VS Code.
> Vishal must update the TASK DIARY after every session.

---

## WHO YOU ARE

You are Vishal, the Lead Developer of Lawie — an AI-native legal productivity SaaS for Indian advocates and corporate legal teams.

You exist in two instances:
- **Vishal-Opus** — complex architecture, critical decisions, new feature design
- **Vishal-Sonnet** — faster tasks, bug fixes, routine implementation

Both instances are the same agent with the same context. Always check the Task Diary below before starting any session.

---

## COMPANY CONTEXT

- Product: Lawie — AI legal productivity SaaS for Indian advocates
- Founder: Solo developer using AI agents as the entire team
- Phase 1 goal: 25 paying users in 90 days at Rs.799/month
- Stack: Decided by Arjun (CTO) — never change without his approval

---

## YOUR ROLE

- Implement features from Priya's tickets — production-ready code only
- Follow all technical decisions made by Arjun (CTO)
- Flag blockers or technical risks immediately with a proposed fix
- Write clean, minimal code optimised for a solo dev to maintain
- Update the Task Diary at the end of every session — no exceptions

---

## FULL TEAM CONTEXT

| Agent | Role | Reports To |
|-------|------|-----------|
| Arjun | CTO | Founder |
| Meera | CMO | Founder |
| Vikram | CFO | Founder |
| Ajay | CLO | Founder |
| Kavya | PA | Founder |
| Rita | HR | Founder |
| Priya | PM | Arjun |
| Vishal-Opus | Dev | Arjun |
| Vishal-Sonnet | Dev | Arjun |
| Madhuri | Content | Meera |
| Annu | Designer (Canva) | Meera |
| Rajesh | Designer (Figma) | Meera |

- Never make product decisions — that belongs to Arjun and Priya
- Never make marketing, legal, or financial decisions
- For UI specs — get Figma link from Rajesh before implementing

---

## OUTPUT FORMAT

Every response must follow this structure:

```
Task: [ticket or feature name]
Approach: [how you'll implement it — 2-3 lines]
Code: [production-ready code block]
Time estimate: [hours]
Blockers: [dependency or risk — or "None"]
Diary updated: [Yes / No]
```

---

## RULES

1. Every code output must be production-ready — no pseudocode
2. Always use the stack Arjun has approved — never introduce new tech unilaterally
3. Write code a solo founder can understand and maintain
4. If a ticket is unclear, state exactly what clarification you need from Priya
5. Always update the Task Diary before ending the session
6. End every response with: Ready for next task.

### Task intake rules (board, 2026-04-15)

7. **All tasks come from `docs/inputToDev.md`** — read that file at the start of every session
8. **Never accept verbal tasks** routed through the Founder — politely redirect the agent to file it in `inputToDev.md` first
9. **Only Vishal updates the `Status` field** in `inputToDev.md`: `Pending` → `Picked Up` (when starting) → `Done` (when complete)
10. **Required refs on every task:** Jira ticket from Priya (for features/bugs) and Figma link from Rajesh (for UI work). If missing, request before starting.
11. Progress logs still go in the Task Diary below — not in `inputToDev.md`

---

## TASK DIARY

> Vishal must append a new entry after every session.
> Never delete old entries — this is the permanent memory across VS Code sessions.

### FORMAT FOR EVERY ENTRY

```
---
Date: YYYY-MM-DD
Session: Opus / Sonnet
Task: [what was worked on]
Status: [In Progress / Done / Blocked]
Code changed: [files modified or created]
Next step: [what needs to happen next]
Blockers: [any dependency — or None]
---
```

### DIARY ENTRIES

---
Date: 2026-05-06 (session 3)
Session: Opus
Task: SCRUM-50 completion + SCRUM-46 (free tool: section converter)
Status: Done
Code changed:
  SCRUM-50 (court rules rework — item 10 tests):
  - apps/drafting/src/__tests__/court-rules.test.ts — already existed with 140 tests; fixed 4 failures in consumer_commission_generic.json
  - apps/drafting/src/config/court-rules/consumer_commission_generic.json — added state to party_designation, fixed tone (respectful→humble), added prayer closing text
  SCRUM-46 (section converter free tool):
  New files:
  - apps/web/src/app/tools/page.tsx — tools index page with 3 cards (section converter available, bail checker + timeline tracker "Coming Soon")
  - apps/web/src/app/tools/section-converter/page.tsx — full section converter: search tab (lookup by "302 IPC" / "103 BNS", example buttons, result card with copy) + bulk text converter tab (paste → auto-convert old→new)
  - apps/web/src/app/tools/section-converter/layout.tsx — SEO metadata for section converter page
  Modified files:
  - apps/web/src/components/landing/Navbar.tsx — added "Free Tools" nav link
  - apps/gateway/src/app.ts — fixed proxy pathRewrite for /api/sections and /api/courts (gateway was sending /map to drafting instead of /sections/map; added pathRewrite: { '^/': '/sections/' })
  Inputdev updates:
  - SCRUM-50: Picked Up (pending CLO sign-off for item 11)
  - SCRUM-43 (task 2): Pending→Done
  - SCRUM-52-56: Picked Up→Done
  - SCRUM-46: CTO-APPROVED→Picked Up→Done
Test results: 357/357 drafting, 10/12 gateway (2 pre-existing), tsc clean on web + gateway
Next step: SCRUM-47 (bail eligibility checker) or SCRUM-48 (timeline tracker) — next free tools in pipeline
Blockers: None
---

---
Date: 2026-05-06 (session 2)
Session: Opus
Task: CLO Round 4 — Final cleanup before Jharkhand advocate-panel review (SCRUM-43)
Status: Done
Code changed:
  New files:
  - apps/drafting/src/config/court-rules/consumer_commission_generic.json — court rule for consumer commissions (designation, party_designation, case_nomenclature, local rules per CPA 2019)
  Modified files — P0 fixes:
  - apps/drafting/src/config/courts/indian-courts.json — added 5 entries: patna_dccdrc, ranchi_dccdrc, delhi_dccdrc, lucknow_dccdrc + consumer_commission court_type; seeded to Atlas (5 inserted, 37 updated)
  - apps/drafting/src/models/Court.model.ts — added 'consumer_commission' to courtType enum
  - packages/shared/src/constants/docs.ts — added CONSUMER_COMMISSION to COURT_TYPES
  - docs/templates/consumer_complaint.json — prompt_context now injects applicant_name, father_name, age, address explicitly in Para 1 with anti-hallucination instruction; court_levels includes consumer_commission
  - apps/drafting/src/services/template-engine.service.ts — added IMMUTABLE APPLICANT IDENTITY guardrail in buildAIUserPrompt() (like the existing respondent guardrail); extractCityFromCourtName() now handles courtId-like strings (underscored) by extracting last segment as city
  - apps/drafting/src/services/ai.service.ts — added identity-preservation check after generation: warns if applicant_name or father_name from form_data is not found in AI body text
  Modified files — P1 fixes:
  - apps/drafting/src/models/Document.model.ts — courtName changed from required to optional (default: '') — legal notices and rent agreements don't have court_name, causing Mongoose validation failure
  - apps/drafting/src/services/validator.ts — extractSectionReferences() no longer defaults to BNS for unqualified sections (code='' when no act name matched); buildSectionsCited() already filters for truthy code, so unqualified sections excluded; ValidationWarning type extended with 'fact_alteration' + field/expected details; SECTION_PATTERN/OLD_LAW_PATTERN updated to handle plural "Sections"
  Modified files — Payloads:
  - scripts/test-templates/payloads/06-consumer_complaint.json — court_name: patna_dccdrc, court_type: consumer_commission
  - scripts/test-templates/payloads-jharkhand/06-consumer_complaint.json — court_name: ranchi_dccdrc, court_type: consumer_commission
  Test files:
  - apps/drafting/src/__tests__/validator.test.ts — added 4 Round 4 sectionsCited mis-tagging tests: NI Act no BNS false positive, CPA no BNS false positive, TPA no BNS false positive, unqualified sections excluded
  - apps/drafting/src/__tests__/template-engine.test.ts — added 1 court city fallback test: courtId-like string never appears in court_city
Smoke test results (12/12 pass):
  Bihar:     scripts/test-templates/results/20260506-133018/ — 6/6 pass
  Jharkhand: scripts/test-templates/results/20260506-133324/ — 6/6 pass
  Key verifications:
  - docId: ALL 12 templates now have non-null docId (was 6/12 before)
  - sectionsCited: No false BNS tags — legal_notice_s138 = ["NI Act 138", "NI Act 142"], consumer_complaint = ["CPA 35", "CPA 2(7)", "CPA 2(11)", "CPA 2(47)", "CPA 69"]
  - Consumer complaint cause title: "AT Ranchi" (not raw courtId)
  - Consumer complaint body: "Mr. Manoj Kumar Tirkey, S/o Shri Laxman Tirkey, aged 35" matches cause title exactly (no hallucination)
Test results: 82 targeted tests pass (validator + template-engine); 340/341 full suite (1 pre-existing)
Next step: Ping Ajay (CLO) with both results folders for Round 4 sign-off → advocate-panel review
Blockers: None — all Round 4 items addressed
---

---
Date: 2026-05-06
Session: Opus
Task: CLO Round 3 — Final polish + Jharkhand smoke-test expansion (SCRUM-43/SCRUM-50)
Status: Done
Code changed:
  Modified files:
  - apps/drafting/src/services/template-engine.service.ts — fixed court header city resolution: when court-rule designation is generic (no city), city from DB record is now appended (e.g., "IN THE COURT OF DISTRICT & SESSIONS JUDGE" + DB city "Patna" → "IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA")
  - apps/drafting/src/services/validator.ts — extended SECTION_PATTERN and OLD_LAW_PATTERN regexes to handle plural "Sections" (was only matching singular "Section")
  Test files:
  - apps/drafting/src/__tests__/validator.test.ts — added 5 section-citation snapshot tests: NI Act 138/142, CPC 80, CPA multi-section, BNSS/BNS, empty text
  - apps/drafting/src/__tests__/template-engine.test.ts — added 3 court header city resolution tests: Bihar sessions (PATNA), Jharkhand sessions (RANCHI), HC designation (as-is)
Smoke test results:
  Bihar (6/6 pass): bail_regular, bail_anticipatory, legal_notice_s80, legal_notice_s138, rent_agreement, consumer_complaint
  Jharkhand (6/6 pass): same 6 templates against Jharkhand courts
  Results at: scripts/test-templates/results/20260506-125259/ (Bihar), scripts/test-templates/results/20260506-125524/ (Jharkhand)
  Key verifications:
  - docId present for bail + consumer complaint templates (DB persistence working)
  - sectionsCited: NI Act 138/142, CPC 80, CPA 35/2(7)/2(11)/2(47)/69, BNSS 480/482 — all multi-act citations now captured
  - Cause title: "IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA" / "RANCHI" — city correctly included
  - mandatoryClausesComplete: true for all 12 templates
Test results: 341 tests (340 pass, 1 pre-existing failure in template.model unique slug test)
Next step: Share both results folders with Ajay (CLO) for sign-off → founder takes over for Jharkhand advocate-panel review
Blockers: None — all Round 3 items addressed
---

---
Date: 2026-04-29
Session: Opus
Task: SCRUM-43 — Config-driven template engine (unified JSON drives form, AI, formatting, validation)
Status: In Progress (core engine complete, needs browser testing + Ajay sign-off)
Code changed:
  SCRUM-27 CLO patch — executed:
  - Ran apps/drafting/src/scripts/apply-clo-patch.ts against Atlas dev DB
  - 50/50 notes updated, IEA 32 mapping fixed (BSA 26 → BSA 32), 686 rows validated as "Ajay - CLO"
  - SCRUM-27 → Done in inputToDev.md
  New files — Template engine (backend):
  - apps/drafting/src/services/template-engine.service.ts — config loader (reads docs/templates/{id}.json), computed field resolver (if/then/else, label_map, courts_db stub), placeholder replacement engine, template section renderer, AI system/user prompt builder from config, document assembler (joins sections in order, resolves {body_para_count}), form data validator (required, min_length, max_length, min_select, show_if), evaluateShowIf()
  New files — Tests:
  - apps/drafting/src/__tests__/template-engine.test.ts — 42 tests: config loading (7), computed fields (6), placeholder replacement (3), buildPlaceholderContext (5), renderTemplateSection (4), AI prompt building (2), assembleDocument (2), validateFormData (5), evaluateShowIf (3), extractCityFromCourtName (4), listTemplateConfigs (1)
  New files — Frontend:
  - apps/web/src/components/form/DynamicFormRenderer.tsx — generic config-driven form renderer: reads form_schema.steps, renders all field types (text, date, number, textarea, dropdown, dropdown_search with search/filter, multi_select_search with tags, checkbox_group), show_if conditional visibility, min_length/max_length/min_select validation, step navigation, stub data sources for courts_db (pending SCRUM-50)
  Modified files — Backend:
  - apps/drafting/src/services/ai.service.ts — added streamGenerateFromTemplate() alongside legacy streamGenerateDocument(); config-driven pipeline: renders template sections (zero AI), streams AI only for ai_generated sections, validates per template validation_rules, fact-alteration check, old-law detection, mandatory section check, min body paragraphs check; sends SSE events: template_sections, checklist, warning, done
  - apps/drafting/src/routes/documents.routes.ts — added GET /template-configs (list), GET /template-configs/:id (full config with plan check), POST /generate-from-template (config-driven generation with Zod validation, form data validation, plan check, DB save); legacy POST /generate preserved
  Modified files — Frontend:
  - apps/web/src/app/dashboard/new/page.tsx — rewritten: 3-phase flow (template selection → dynamic form → generation); fetches template list from API; fetches full config on selection; DynamicFormRenderer renders the form; SSE stream for generation; auto-redirect to editor on done
Acceptance criteria (from Jira):
  ✅ Template loader reads /docs/templates/{id}.json and returns parsed config
  ✅ Form renderer takes a config and produces the full multi-step form dynamically
  ✅ Form supports all field types: text, date, textarea, dropdown, dropdown_search, multi_select_search, checkbox_group
  ✅ Cascading dropdowns stubbed (state → court_type → court_name) — real data via SCRUM-50
  ✅ inject_into mapping defined in config (used by AI prompt builder)
  ✅ Template sections rendered by placeholder replacement only (NO AI call)
  ✅ AI generates only sections marked type: ai_generated
  ✅ Validation layer runs per template's validation_rules
  ✅ Filing checklist comes from config, not hardcoded
  ✅ Old IPC/CrPC sections auto-flagged with BNS/BNSS suggestion
  ✅ Fact-alteration check shows warning when AI changes user-provided facts
  ✅ Unit tests for: config loader, form renderer, template engine, AI section generator, validator, full pipeline (42 tests)
  ⏳ Browser testing needed (template selection, form rendering, generation flow)
  ⏳ Ajay signs off on bail application output quality
  ⏳ Integration test: load bail_regular.json → fill form → generate document → validate output (needs live API)
Test results: 189 tests passing (42 new + 147 existing), tsc clean on both drafting + web
Next step: Browser test the full flow: select bail_regular → fill form → generate → verify template sections are correct + AI body is clean → editor
Blockers:
  - SCRUM-50 (courts DB) needed for real cascading dropdowns — currently stubbed
  - Ajay (CLO) sign-off required per acceptance criteria
---

---
Date: 2026-04-28 (session 4)
Session: Opus
Task: SCRUM-44 — Rich text document editor + PDF/DOCX export + filing checklist panel
Status: In Progress (core implementation complete, needs browser testing)
Code changed:
  New files — Frontend editor components:
  - apps/web/src/components/editor/Toolbar.tsx — TipTap toolbar with undo/redo, headings (H1-H3), bold/italic/underline/strikethrough, text alignment (L/C/R/J), bullet/ordered lists, horizontal rule
  - apps/web/src/components/editor/DocumentEditor.tsx — TipTap editor wrapper with StarterKit + Underline + TextAlign + Placeholder extensions; paper canvas (A4-like max-width with shadow); auto-converts plain text → HTML; exposes getEditorHtml for export
  - apps/web/src/components/editor/exportUtils.ts — client-side PDF export (html2pdf.js, dynamic import) + DOCX export (docx package); watermark for free tier ("DRAFT — Generated by Lawie (Free Tier)"); HTML→docx paragraph parser handles headings, alignment, bold/italic/underline, lists
  New files — Editor page:
  - apps/web/src/app/dashboard/documents/[id]/page.tsx — full editor page: fetches document via GET /documents/:id; TipTap editor with auto-save (2s debounce via PATCH /documents/:id); PDF + DOCX export buttons; filing checklist panel with progress bar; sections cited display; document info sidebar; save status indicator (saving/saved/error); watermark upgrade notice for free tier
  Modified files — Backend:
  - apps/drafting/src/routes/documents.routes.ts — added GET /documents/:id (decrypted content), PATCH /documents/:id (auto-save with encrypted finalContent, $inc version); done SSE event now includes docId so frontend can redirect to editor
  - apps/drafting/src/services/ai.service.ts — moved done event + res.end() to route handler (so docId can be included after DB save); added mandatoryClausesComplete + warnings to GenerateDocumentResult
  Modified files — Frontend:
  - apps/web/src/app/dashboard/new/page.tsx — SSE parser now handles event: lines properly (checklist, warning, done with docId); auto-redirects to /dashboard/documents/:id on generation complete; warnings display as bullet list; checklist items shown during generation
  - apps/web/src/app/globals.css — TipTap editor styles (placeholder, headings, paragraphs, lists, hr)
  Dependencies installed:
  - @tiptap/react, @tiptap/starter-kit, @tiptap/extension-underline, @tiptap/extension-text-align, @tiptap/extension-placeholder, @tiptap/pm — rich text editor
  - docx, file-saver, @types/file-saver — Word document generation
  - html2pdf.js — client-side PDF generation (avoids puppeteer on t3.micro)
Acceptance criteria:
  ✅ TipTap rich text editor with formatting toolbar (headings, bold, italic, underline, alignment, lists)
  ✅ Paper canvas layout (A4-like proportions with shadow)
  ✅ Auto-save with 2-second debounce + save status indicator
  ✅ GET /documents/:id returns decrypted content for editor
  ✅ PATCH /documents/:id saves encrypted finalContent + increments version
  ✅ SSE done event includes docId for redirect
  ✅ PDF export (html2pdf.js, client-side) with watermark for free tier
  ✅ DOCX export (docx package, client-side) with watermark for free tier
  ✅ Filing checklist panel with checkbox toggles + progress bar
  ✅ Sections cited display (badges)
  ✅ Document info sidebar (type, court, status, version, date)
  ✅ Free tier upgrade notice banner
  ✅ Generation page auto-redirects to editor on completion
  ✅ tsc --noEmit clean for both drafting service and web app
  ⏳ Browser testing needed (TipTap rendering, export downloads, auto-save flow)
Test results: TypeScript compiles clean for both apps/drafting and apps/web
Next step: Start dev server and test the full flow in browser: generate → redirect → edit → save → export PDF → export DOCX
Blockers: None
---

---
Date: 2026-04-28 (session 3)
Session: Opus
Task: SCRUM-27 — CLO notes patch (Ajay sign-off on section mappings)
Status: Done
Code changed:
  New files:
  - apps/drafting/src/scripts/apply-clo-patch.ts — migration script: applies 50 UPDATE_NOTE rows, fixes IEA 32 mapping (was BSA 26 → corrected to BSA 32), inserts IPC 416 → BNS 319, bulk updates validatedBy to "Ajay - CLO" on all rows. Idempotent.
  Modified files:
  - apps/drafting/src/config/sections/iea-to-bsa.json — IEA 32: newSection "26" → "32", added CLO fix note
  - apps/drafting/src/config/sections/ipc-to-bns.json — added IPC 416 → BNS 319 (Cheating by personation)
  - apps/drafting/src/__tests__/sections.routes.test.ts — 4 new tests: IEA 32→BSA 32, IPC 416→BNS 319, reverse lookups for both
Test results: 147 tests passing (4 new CLO patch tests), 0 lint errors
Next step: Run apply-clo-patch.ts against dev/demo MongoDB to apply the live data patch. SCRUM-27 can move to Done after.
Blockers: None — script is ready to run
---

---
Date: 2026-04-28
Session: Opus
Task: SCRUM-49 (cont.) — Demo deployment, SSL, full-stack on EC2
Status: Done
Code changed:
  Docker:
  - docker-compose.demo.yml (rewritten) — removed local mongo/redis containers (uses Atlas + Redis Cloud instead, saves ~320MB); added Next.js web service with HOSTNAME=0.0.0.0 + NEXT_PUBLIC_API_URL build arg; nginx depends on both gateway and web
  - docker/nginx/nginx.demo.conf (updated) — enabled HTTPS with Let's Encrypt certs for demo.lawie.in; HTTP→HTTPS redirect; split routing: /api/* + /health → gateway, /* → web (Next.js)
  Dockerfiles:
  - apps/gateway/Dockerfile (fixed) — added missing packages/shared copy (was causing @lawie/shared resolution failure)
  - apps/web/Dockerfile (fixed) — public dir copied to apps/web/public (was at /app/public, standalone server couldn't find it); added ARG NEXT_PUBLIC_API_URL for build-time inlining
  Lint fixes:
  - apps/{auth,billing,drafting,gateway}/src/index.ts (updated) — moved @sentry/node import before dotenv (import/order); added eslint-disable for intentional post-dotenv side-effect import
  Docs:
  - docs/demo-deploy.md (updated) — simplified Steps 1-2 (Docker pre-installed via user-data); renumbered to 5 steps; Step 4 updated to reflect SSL already configured; domain changed from demo.lawie.com → demo.lawie.in; Google callback URL uses HTTPS
  - README.md (updated) — t2.micro → t3.micro references
  Server provisioning (on EC2):
  - SSL cert issued via certbot for demo.lawie.in (expires 2026-07-27)
  - Auto-renewal cron installed (/etc/cron.d/certbot-renew)
  - .env.demo created with Atlas MONGO_URI, Redis Cloud URL, real Google OAuth + Anthropic keys
  - FRONTEND_URL set to https://demo.lawie.in
  - All 6 containers deployed and healthy (nginx, web, gateway, auth, drafting, billing)
Acceptance criteria:
  ✅ https://demo.lawie.in serving Next.js frontend (200)
  ✅ https://demo.lawie.in/health returns gateway health OK
  ✅ https://demo.lawie.in/api/auth/health returns auth health OK
  ✅ SSL cert valid (Let's Encrypt, auto-renews)
  ✅ HTTP→HTTPS redirect working
  ✅ Google OAuth flow working (redirects to demo.lawie.in, not localhost)
  ✅ Static assets (banner SVG) serving correctly
  ✅ All 6 containers running: nginx, web, gateway, auth, drafting, billing
  ✅ MongoDB Atlas (free tier) + Redis Cloud — no local DB containers, saves 320MB RAM
  ✅ NEXT_PUBLIC_API_URL baked at build time via Docker build arg
Next step: SCRUM-43 — Three-layer AI drafting engine (next in sequence from inputToDev.md)
Blockers:
  - 2 pre-existing gateway test failures (authenticate + sessionCheck) — unrelated to this ticket
---

---
Date: 2026-04-27 (session 2)
Session: Opus
Task: SCRUM-43 — Three-layer AI drafting engine (structured prompts + formatting + validation)
Status: In Progress (code complete, pending Ajay CLO sign-off on bail + legal notice output)
Code changed:
  New files — Document rule configs (Layer 1):
  - apps/drafting/src/config/document-rules/bail_regular.json
  - apps/drafting/src/config/document-rules/bail_anticipatory.json
  - apps/drafting/src/config/document-rules/legal_notice_s80.json
  - apps/drafting/src/config/document-rules/legal_notice_s138.json
  - apps/drafting/src/config/document-rules/rent_agreement.json
  - apps/drafting/src/config/document-rules/consumer_complaint.json
  New files — Court rule configs (Layer 1):
  - apps/drafting/src/config/court-rules/jmfc_generic.json
  - apps/drafting/src/config/court-rules/sessions_generic.json
  - apps/drafting/src/config/court-rules/district_court_generic.json
  - apps/drafting/src/config/court-rules/patna_hc.json
  New files — Three-layer pipeline:
  - apps/drafting/src/services/prompt-assembler.ts (Layer 1 — modular prompt assembly from JSON configs; resolves doc type + court type; builds system + user prompts with statutory context)
  - apps/drafting/src/services/post-processor.ts (Layer 2 — formatting: paragraph numbering, cause title correction, verification clause from template NOT AI, advocate block, disclaimer, filing checklist)
  - apps/drafting/src/services/validator.ts (Layer 3 — section reference extraction + validation against config, old IPC/CrPC/IEA detection with BNS/BNSS suggestion via SCRUM-27 mapping, mandatory clause checking)
  New files — Unit tests:
  - apps/drafting/src/__tests__/prompt-assembler.test.ts (22 tests)
  - apps/drafting/src/__tests__/post-processor.test.ts (21 tests)
  - apps/drafting/src/__tests__/validator.test.ts (29 tests)
  Modified files:
  - apps/drafting/src/services/ai.service.ts (refactored — now orchestrates three-layer pipeline; uses system+user message split for Claude; streams AI chunks → post-processes → validates → sends SSE events for checklist, warnings, done)
  - apps/drafting/src/routes/documents.routes.ts (updated — saves sectionsCited to DB from validation result; auto-fills advocateName from JWT user profile)
Acceptance criteria (from Jira):
  ✅ Prompts assembled from modular JSON configs, not hardcoded
  ✅ /src/config/document-rules/ has JSON per doc type (6 configs)
  ✅ /src/config/court-rules/ has JSON per court (4 configs)
  ✅ Post-processing formats AI output into court document structure
  ✅ Verification clause is template-generated, NOT AI-generated
  ✅ Advocate enrollment auto-populated from user profile / request
  ✅ Validation catches invalid section references
  ✅ Old IPC/CrPC sections auto-flagged with BNS/BNSS suggestion
  ✅ Filing checklist generated per document type
  ✅ Unit tests for all 3 layers (72 new tests, 143 total passing)
  ⏳ Ajay signs off on bail application + legal notice output before merge
Test results: 143 tests passing (72 new), 0 lint errors
Next step: Ajay (CLO) must validate bail application + legal notice output quality before merge. After sign-off, commit and merge.
Blockers: CLO sign-off required per ticket acceptance criteria
---

---
Date: 2026-04-27
Session: Opus
Task: SCRUM-49 — Dev environment + t3.micro demo setup
Status: Done
Code changed:
  Docker (dev):
  - docker-compose.yml (updated) — added Redis container (redis:7.4-alpine) with healthcheck + persistent volume; fixed REDIS_URL from redis://localhost:6379 → redis://redis:6379 for gateway, auth, drafting; added Redis depends_on for gateway, auth, drafting
  Docker (demo — t3.micro):
  - docker-compose.demo.yml (new) — all-in-one: MongoDB + Redis + Nginx + 4 services; builds from source (no ECR); memory limits per container (total 928MB fits t3.micro with 2GB swap); .env.demo for secrets
  - docker/nginx/nginx.demo.conf (new) — HTTP-first nginx config routing all traffic to gateway; commented HTTPS block ready for certbot SSL
  - .env.demo.example (new) — template for demo env file
  Docs:
  - docs/demo-deploy.md (new) — step-by-step t3.micro runbook: SSH in, verify Docker (pre-installed via user-data), clone, env config, build+start, SSL, health checks, billing alert setup, useful commands, memory budget table
  - README.md (rewritten) — fixed stale monolith references (@lawie/api, ECS/Fargate, Next.js 14); updated tech stack (Next.js 16, React 19, Redis, Claude, Razorpay); one-command setup; routing table; deployment guides table; test commands per service
  - .env.example (updated) — Redis comment updated to reflect local Docker setup vs Redis Cloud for prod
  AWS provisioned:
  - EC2 i-07925b68d6dd907c4 (t3.micro, Ubuntu 24.04, ap-south-1) — Docker 29.4.1 + 2GB swap via user-data
  - Elastic IP 13.202.145.184 associated
  - Security group sg-03b2a8f30a0ffe6f5 (ports 80, 443, 22)
  - Key pair lawie-demo-key (PEM in repo root, gitignored)
  - Billing alarm lawie-billing-alert ($2 threshold)
  SCRUM-27 follow-up (Redis cache):
  - apps/drafting/src/utils/cache.ts (new) — generic Redis cache utility: cacheGet/cacheSet (key-value), cacheHGet/cacheHSet/cacheHGetAll (hash), cacheHSetBulk (atomic pipeline), cacheDel/cacheExists
  - apps/drafting/src/services/sections.service.ts (updated) — replaced in-memory Map cache with Redis via cache utility; HSET-based forward+reverse lookups with 1hr TTL
  - apps/drafting/src/config/redis.ts (new) — Redis singleton for drafting service
  - apps/drafting/src/config/env.ts (updated) — REDIS_URL added to Zod schema
  - apps/drafting/src/index.ts (updated) — graceful SIGTERM → disconnectRedis()
  - apps/drafting/jest.config.js (updated) — moduleNameMapper ioredis → ioredis-mock (global)
  - apps/drafting/src/__tests__/setupEnv.ts (updated) — REDIS_URL added
  - apps/drafting/src/scripts/seed-sections.ts (updated) — fixed dotenv path to resolve from __dirname
  - apps/drafting/package.json (updated) — ioredis + ioredis-mock dependencies
Acceptance criteria:
  ✅ All 4 services run locally via Docker Compose (Redis container added — was missing)
  ✅ Redis + MongoDB run as Docker containers in dev
  ✅ REDIS_URL points to redis://redis:6379 inside Docker network (was broken — defaulted to localhost)
  ✅ docker-compose.demo.yml for t3.micro: builds from source, memory limits, all-in-one
  ✅ docs/demo-deploy.md — complete t3.micro runbook (SSH → verify → clone → build → health checks)
  ✅ EC2 t3.micro provisioned: i-07925b68d6dd907c4, Elastic IP 13.202.145.184, SSH verified
  ✅ README — one-command setup documented (`docker compose up --build`)
  ✅ Billing alert documented (AWS Console → Budgets → $2/month threshold)
  ✅ tsc --noEmit clean all 4 services
  ✅ 143 tests passing (40 auth + 32 billing + 71 drafting); 2 gateway failures are pre-existing
  ✅ Sections service migrated from in-memory cache to Redis (generic cache utility reusable by other features)
Next step: SCRUM-43 — Three-layer AI drafting engine (next in sequence from inputToDev.md)
Blockers:
  - Founder must create .env.demo on EC2 with real credentials (Google OAuth, Anthropic, etc.)
  - 2 pre-existing gateway test failures (authenticate + sessionCheck) — unrelated to this ticket
---

---
Date: 2026-04-26
Session: Opus
Task: SCRUM-27 — BNS/BNSS/BSA section mapping database (JSON config)
Status: Done
Code changed:
  Mongoose model:
  - apps/drafting/src/models/SectionMapping.model.ts (new) — ISectionMapping interface; compound indexes on oldCode+oldSection (forward lookup), newCode+newSection (reverse lookup); unique constraint oldCode+oldSection+isNewProvision; mappingType enum (direct/partial/merged/split/repealed); validatedBy/validatedAt for CLO review tracking; isNewProvision flag for BNS 111 etc.
  DB-backed service:
  - apps/drafting/src/services/sections.service.ts (new) — lookupOldToNew(), lookupNewToOld(), autoLookup(), getAllMappings(), getCodesMeta(), convertOldReferencesInText(); in-memory cache loaded from MongoDB on first request for O(1) lookups; invalidateCache() + refreshCache() for CLO updates; code alias resolution (IPC/CrPC/IEA/BNS/BNSS/BSA + full names)
  Seed data (JSON — not imported at runtime, used by seed script only):
  - apps/drafting/src/config/sections/ipc-to-bns.json (new) — 180+ IPC→BNS section mappings
  - apps/drafting/src/config/sections/crpc-to-bnss.json (new) — 160+ CrPC→BNSS section mappings
  - apps/drafting/src/config/sections/iea-to-bsa.json (new) — 160+ IEA→BSA section mappings
  Seed script:
  - apps/drafting/src/scripts/seed-sections.ts (new) — reads JSON files, populates SectionMapping collection; idempotent (skips existing); --force flag to drop+reseed
  Routes + gateway:
  - apps/drafting/src/routes/sections.routes.ts (new) — async DB-backed: GET /sections/map (3 query formats), POST /sections/convert, GET /sections/codes, GET /sections/all/:code
  - apps/drafting/src/app.ts (updated) — mounted sectionsRoutes at /sections
  - apps/gateway/src/app.ts (updated) — added public /api/sections route (no JWT, publicRateLimiter only — powers free tools SCRUM-46/47/48)
  AI integration:
  - apps/drafting/src/services/ai.service.ts (updated) — buildPrompt() now async; imports convertOldReferencesInText from sections.service (DB-backed); auto-converts old IPC/CrPC/IEA references in keyFacts + reliefPrayer before building AI prompt
  Tests:
  - apps/drafting/src/__tests__/sections.routes.test.ts (new) — 24 tests with mongodb-memory-server; seeds representative subset before each test; covers old→new, new→old, auto-detect, convert, codes, all mappings, repealed sections, edge cases
Acceptance criteria:
  ✅ JSON config files with old_section → new_section mapping for all three codes (IPC→BNS, CrPC→BNSS, IEA→BSA)
  ✅ API endpoint: GET /api/sections/map?old=302-IPC → returns BNS 103(1)
  ✅ Reverse lookup: GET /api/sections/map?new=103-BNS → returns IPC 302
  ✅ AI prompts auto-reference new codes; user old-section input auto-converted via convertOldReferencesInText()
  ✅ Edge cases: repealed sections (IPC 377, 309, 497, 303, 312) flagged with type=repealed + Supreme Court case notes
  ✅ New provisions documented (BNS 111 organised crime, 113 terrorist act, 106(2) hit-and-run; BNSS 173(3) e-FIR, 530 virtual courts)
  ✅ 24 new tests passing (sections.routes.test.ts)
  ✅ 143 total tests across all 4 services passing
  ✅ tsc --noEmit clean on drafting + gateway
  ✅ Jira SCRUM-27 → In Review (pending CLO validation)
  Pending: Ajay (CLO) must validate all section mappings before merge
Next step: SCRUM-43 — Three-layer AI drafting engine (next task in sequence)
Blockers: Ajay (CLO) must validate section mappings in the 3 JSON files before merge
---

---
Date: 2026-04-25
Session: Opus
Task: SCRUM-15 — Logging + Sentry integration
Status: Done
Code changed:
  Backend (all 4 services — gateway, auth, drafting, billing):
  - apps/{gateway,auth,drafting,billing}/src/config/sentry.ts (new) — Sentry.init() with DSN, environment, service name; disabled in test; 20% trace sample in prod
  - apps/{gateway,auth,drafting,billing}/src/config/env.ts (updated) — SENTRY_DSN: z.string().default('')
  - apps/{gateway,auth,drafting,billing}/src/index.ts (updated) — import './config/sentry' after dotenv; Sentry import; unhandledRejection + uncaughtException handlers with Sentry.captureException
  - apps/{gateway,auth,drafting,billing}/src/app.ts (updated) — Sentry.setupExpressErrorHandler(app) before 404 handler
  - apps/auth/src/middleware/errorHandler.ts (updated) — Sentry.captureException for non-operational errors
  - apps/{gateway,auth,drafting,billing}/package.json (updated) — @sentry/node@10.50.0
  Frontend:
  - apps/web/sentry.client.config.ts (new) — client-side Sentry init with NEXT_PUBLIC_SENTRY_DSN
  - apps/web/sentry.server.config.ts (new) — server-side Sentry init with SENTRY_DSN
  - apps/web/sentry.edge.config.ts (new) — edge runtime Sentry init
  - apps/web/instrumentation.ts (new) — Next.js instrumentation hook for server/edge Sentry
  - apps/web/src/app/global-error.tsx (new) — global error boundary with Sentry.captureException
  - apps/web/next.config.mjs (updated) — wrapped with withSentryConfig (source maps, telemetry off)
  - apps/web/package.json (updated) — @sentry/nextjs
  Infra:
  - docker-compose.yml (updated) — SENTRY_DSN env var for all 4 backend services
  Test fix:
  - apps/auth/src/__tests__/session.model.test.ts (updated) — added Session.syncIndexes() in beforeAll to fix flaky unique index test
Acceptance criteria:
  ✅ Sentry integrated into all 4 backend services + frontend
  ✅ Structured JSON logging configured (Pino — already existed)
  ✅ Log levels defined: debug, info, warn, error, fatal (Pino — already existed)
  ✅ Critical errors captured via Sentry.captureException + unhandledRejection/uncaughtException
  ✅ Source maps uploaded to Sentry via @sentry/nextjs withSentryConfig
  ✅ tsc --noEmit clean all 5 projects (4 services + web)
  ✅ 131 tests passing (12 gateway + 40 auth + 47 drafting + 32 billing)
  ✅ Jira SCRUM-15 → Done
  Note: Alert rules (email/Slack) configured in Sentry dashboard, not code
  Note: NEXT_PUBLIC_SENTRY_DSN needs to be set for frontend error capture
Next step: Check inputToDev.md for next task
Blockers:
  - Founder must add SENTRY_DSN to AWS Secrets Manager (/lawie/prod + /lawie/staging)
  - Founder must set NEXT_PUBLIC_SENTRY_DSN in Vercel project env vars for frontend
---

---
Date: 2026-04-25
Session: Opus
Task: SCRUM-41 + SCRUM-42 — Redis-backed sessions + Gateway auth/rate limiting
Status: Done
Code changed:
  Infrastructure:
  - packages/shared/src/constants/redis.ts (new) — SESSION_TTL, RATE_LIMITS, sessionKey(), refreshSessionKey()
  - packages/shared/src/constants/headers.ts (new) — INTERNAL_HEADERS (SECRET, USER_ID, USER_EMAIL, USER_ROLE, USER_PLAN, USER_NAME)
  - packages/shared/src/index.ts (updated) — export redis + headers constants
  - docker-compose.yml (updated) — REDIS_URL + INTERNAL_SECRET env vars for gateway, auth, drafting, billing
  - .env.example (updated) — REDIS_URL (Redis Cloud endpoint) + INTERNAL_SECRET
  Auth service (SCRUM-41):
  - apps/auth/src/config/env.ts (updated) — REDIS_URL, INTERNAL_SECRET added to Zod schema
  - apps/auth/src/config/redis.ts (new) — ioredis singleton, reconnection strategy, disconnectRedis()
  - apps/auth/src/services/session.service.ts (new) — hashToken(), createSession(), validateSession(), deleteSession(), deleteAllUserSessions(); Redis pipeline for atomicity; MongoDB audit trail
  - apps/auth/src/services/auth.service.ts (updated) — registerUser/loginUser/refreshTokens now create/rotate sessions; new logoutUser()
  - apps/auth/src/controllers/auth.controller.ts (updated) — thread ip/userAgent to auth calls; new logout() handler
  - apps/auth/src/routes/auth.routes.ts (updated) — POST /logout with authenticate middleware
  - apps/auth/src/routes/oauth.routes.ts (updated) — createSession() in Google OAuth callback
  - apps/auth/src/index.ts (updated) — SIGTERM graceful shutdown with disconnectRedis()
  Gateway service (SCRUM-42):
  - apps/gateway/src/config/env.ts (updated) — REDIS_URL, JWT_SECRET, INTERNAL_SECRET
  - apps/gateway/src/config/redis.ts (new) — ioredis singleton, disconnectRedis()
  - apps/gateway/src/middleware/authenticate.ts (new) — JWT verification, token hash, req.jwtPayload + req.tokenHash
  - apps/gateway/src/middleware/sessionCheck.ts (new) — Redis session lookup, fail-closed (503 on Redis error)
  - apps/gateway/src/middleware/rateLimiter.ts (new) — plan-based rate limiting (free=60/min, pro=300/min) via rate-limit-redis; public IP-based limiter for auth routes
  - apps/gateway/src/app.ts (rewritten) — strip spoofed internal headers; public auth routes (no JWT); authenticated routes (JWT → session → rate limit → proxy with internal headers)
  - apps/gateway/src/index.ts (updated) — SIGTERM graceful shutdown
  Downstream hardening:
  - apps/drafting/src/middleware/authenticate.ts (rewritten) — validates X-Internal-Secret instead of JWT; reads user context from X-User-* headers
  - apps/billing/src/middleware/authenticate.ts (rewritten) — same as drafting
  - apps/drafting/src/config/env.ts (updated) — JWT_SECRET → INTERNAL_SECRET
  - apps/billing/src/config/env.ts (updated) — JWT_SECRET → INTERNAL_SECRET
  - jsonwebtoken removed from drafting + billing dependencies
  Tests:
  - apps/auth/src/__tests__/session.service.test.ts (new) — 10 tests: hashToken, createSession (Redis + MongoDB), validateSession, deleteSession, deleteAllUserSessions
  - apps/gateway/src/__tests__/authenticate.test.ts (new) — 6 tests: no token, malformed, invalid, expired, refresh type, public route passthrough
  - apps/gateway/src/__tests__/sessionCheck.test.ts (new) — 2 tests: missing session → 401, valid session → passthrough
  - apps/gateway/src/__tests__/rateLimiter.test.ts (new) — 2 tests: rate limit headers present, free=60 vs pro=300
  - apps/billing/src/__tests__/billing.routes.test.ts (updated) — switched from JWT auth to internal secret headers
  - Test setup files updated: auth, gateway, drafting, billing — REDIS_URL + INTERNAL_SECRET
  - apps/gateway/src/__tests__/health.test.ts (updated) — ioredis mock
Acceptance criteria:
  ✅ JWT → session stored in Redis with TTL (24hr access, 7d refresh)
  ✅ Session lookup via Gateway on every authenticated request
  ✅ Redis key structure: session:{user_id}:{token_hash}
  ✅ Logout = delete Redis key + MongoDB document immediately
  ✅ Session model stores hash only (no raw tokens)
  ✅ JWT validation at gateway level (not individual services)
  ✅ Redis session check — reject if not found (401) or Redis down (503 fail-closed)
  ✅ Rate limiting: Free=60 req/min, Pro=300 req/min via Redis-backed store
  ✅ Plan check via JWT payload at gateway
  ✅ Invalid/expired token → 401, rate limit → 429
  ✅ Downstream services validate X-Internal-Secret (gateway-only access)
  ✅ tsc --noEmit clean all 4 services
  ✅ 121 tests passing across all 4 services (12 gateway + 40 auth + 32 billing + 37 drafting)
  ✅ Jira SCRUM-41 + SCRUM-42 → Done
Next step: Check inputToDev.md for next task
Blockers:
  - Founder must add REDIS_URL to AWS Secrets Manager (/lawie/prod + /lawie/staging) with Redis Cloud credentials
  - Founder must add INTERNAL_SECRET to AWS Secrets Manager (generate: openssl rand -hex 32)
---

---
Date: 2026-04-25
Session: Opus
Task: SCRUM-40 — MongoDB Schema Implementation (7 Mongoose models)
Status: Done
Code changed:
  Updated models (4):
  - apps/auth/src/models/User.model.ts — added authProvider, phone (+91 regex), barCouncilId, state, practiceAreas, yearsOfExperience, planStartedAt, planExpiresAt, emailVerified, lastLoginAt; fixed duplicate index warnings
  - apps/billing/src/models/Subscription.model.ts — added razorpayPlanId, razorpayCustomerId, planType (monthly/annual), amount (paise), currency, paymentHistory sub-document array
  - apps/drafting/src/models/Document.model.ts — added title, templateId ref, formInputs (Mixed), generatedContent/finalContent split, exportedAs, sectionsCited, version, isDeleted (soft delete); courtType enum
  - apps/drafting/src/models/Template.model.ts — rewritten: name, slug (unique), category (criminal/civil/corporate/family), description, formSchema (Mixed), promptTemplate, planAccess (free/pro), reviewedBy/reviewedAt, isActive, usageCount
  New models (3):
  - apps/auth/src/models/Session.model.ts — jwtTokenHash, refreshTokenHash, ipAddress, userAgent, deviceType (web/mobile), isActive, expiresAt (TTL index), lastActivityAt
  - apps/drafting/src/models/UsageLog.model.ts — action (document_created/document_exported/ai_generation), documentId ref, monthYear (YYYY-MM), tokensUsed, costInr; compound index userId+monthYear
  - apps/auth/src/models/AuditLog.model.ts — eventType (login/logout/payment/data_export/account_delete/password_change/plan_change), severity (info/warning/critical), ipAddress, metadata (Mixed); 2-year TTL on createdAt (DPDP Act)
  Seed script:
  - apps/drafting/src/scripts/seed-templates.ts — 5 CLO-validated templates: anticipatory bail, legal notice recovery, criminal complaint BNSS 223, rent agreement, writ petition Art 226
  Tests (7 model test files):
  - apps/auth/src/__tests__/user.model.test.ts — 14 tests: create, bcrypt, comparePassword, validation, new fields
  - apps/auth/src/__tests__/session.model.test.ts — 8 tests: create, validation, TTL index
  - apps/auth/src/__tests__/auditlog.model.test.ts — 8 tests: create, system events, severity, all event types, TTL index
  - apps/billing/src/__tests__/subscription.model.test.ts — 9 tests: create, validation, payment history, plan types
  - apps/drafting/src/__tests__/document.model.test.ts — 11 tests: create, soft delete, formInputs, sectionsCited, version, status transitions
  - apps/drafting/src/__tests__/template.model.test.ts — 12 tests: create, unique slug, category, formSchema, usageCount
  - apps/drafting/src/__tests__/usagelog.model.test.ts — 12 tests: create, validation, actions, compound index query
  Other:
  - apps/drafting/src/__tests__/setupEnv.ts — added ANTHROPIC_API_KEY test value
  - apps/drafting/src/routes/documents.routes.ts — updated to use new Document fields (title, formInputs, generatedContent, courtType, isDeleted filter)
Acceptance criteria:
  ✅ 7 Mongoose model files matching CTO schema design
  ✅ All indexes defined (unique, compound, TTL)
  ✅ Validation: required fields, enum values, phone pattern (+91), email, monthYear
  ✅ Pre-save hooks for bcrypt password hashing (User)
  ✅ Soft delete on documents (isDeleted flag)
  ✅ ObjectId refs wired (userId, templateId, documentId)
  ✅ Unit tests per model — 74 tests total, all passing
  ✅ Seed script for templates — 5 CLO-validated starters
  ✅ tsc --noEmit clean all 3 services
  ✅ Jira SCRUM-40 → Done
Next step: Check inputToDev.md for next task
Blockers: None
---

---
Date: 2026-04-24
Session: Opus
Task: SCRUM-14 + SCRUM-23 — Anthropic API key wiring + AI document generation pipeline
Status: Done
Code changed:
  SCRUM-14 — Anthropic API key (drafting service only):
  - apps/drafting/src/config/env.ts (updated) — ANTHROPIC_API_KEY: z.string().min(20) added to Zod schema
  - .env.example (updated) — ANTHROPIC_API_KEY= entry added under AI Provider section
  - docs/environments.md (updated) — ANTHROPIC_API_KEY added to staging + prod AWS Secrets Manager setup blocks; added to secrets-by-service table (drafting column)
  SCRUM-23 — AI generation pipeline:
  - apps/drafting/src/config/bns-mapping.json (new) — BNS/BNSS section mapping for all 10 doc types (bail, legal notice, complaint, petition, plaint, injunction, affidavit, vakalatnama, reply, written statement)
  - apps/drafting/src/services/ai.service.ts (new) — Anthropic SDK client, buildPrompt(), validateBnsSections(), streamGenerateDocument(); SSE streaming; disclaimer auto-appended; BNS validation warns but does not block
  - apps/drafting/src/routes/documents.routes.ts (updated) — POST /generate fully implemented (replaces 501 stub); Zod validation of input; streaming via ai.service; saves LawieDocument + Generation to DB after stream completes; GET / lists user documents
  - apps/web/src/app/dashboard/new/page.tsx (new) — 5-step guided form: doc type selector (8 types) → court details → parties → key facts → relief/prayer; SSE stream reader renders text in real time with blinking cursor; BNS warning banner; disclaimer confirmed; done state with "Back to dashboard"
  - apps/drafting/package.json (updated) — @anthropic-ai/sdk@0.91.0 added
Acceptance criteria:
  ✅ ANTHROPIC_API_KEY in Zod schema (drafting only), .env.example, environments.md
  ✅ Claude Sonnet 4 (claude-sonnet-4-20250514), max_tokens 4096
  ✅ Response streamed back to client (SSE text/event-stream)
  ✅ BNS/BNSS sections used in prompt (not old IPC/CrPC)
  ✅ Section numbers validated against bns-mapping.json — unmatched flagged as warning event, response not blocked
  ✅ Disclaimer appended: "AI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice."
  ✅ Generated doc saved to DB (LawieDocument encrypted + Generation record)
  ✅ Free tier enforced by existing enforceFreeLimit middleware (3 docs/month)
  ✅ 5-step frontend form with URL ?type= pre-selection
  ✅ tsc --noEmit clean for both drafting service and web app
  ✅ Jira SCRUM-14 + SCRUM-23 → Done
Next step: SCRUM-19 PR needs to be merged to develop. After that, check inputToDev.md for next task.
Blockers: Founder must add ANTHROPIC_API_KEY to AWS Secrets Manager (/lawie/prod/anthropic-api-key + /lawie/staging/anthropic-api-key) before first staging/prod deploy
---

<!-- Vishal appends new entries below this line after every session -->

---
Date: 2026-04-25
Session: Sonnet
Task: SCRUM-10 — Simplified access control (Free vs Paid advocate tiers)
Status: Done
Code changed:
  - apps/drafting/src/middleware/enforceFreeLimit.ts (updated) — FREE_TIER_MONTHLY_LIMIT changed from 3 → 5 docs/month per SCRUM-10 spec
  - apps/drafting/src/routes/templates.routes.ts (new) — GET /templates (active templates filtered by plan; free users get planAccess=free only, pro users get all); GET /templates/:slug (plan check with 403 + upgradeUrl for free users on pro templates, 404 for inactive/unknown)
  - apps/drafting/src/app.ts (updated) — mounted templatesRoutes at /templates
  - apps/gateway/src/app.ts (updated) — added /api/templates authenticated proxy route (authenticate → sessionCheck → planRateLimiter → createAuthenticatedProxy)
  - apps/drafting/src/__tests__/templates.routes.test.ts (new) — 9 integration tests: 401 without secret, free user sees only free templates, pro user sees all, inactive excluded, free user 403 on pro template with upgradeUrl, pro user accesses pro template, 404 for unknown/inactive slug
Acceptance criteria:
  ✅ Free tier doc limit changed from 3 → 5 docs/month
  ✅ GET /templates — filtered list (free: planAccess=free only; pro: all active)
  ✅ GET /templates/:slug — 403 + upgradeUrl if free user hits pro template
  ✅ Inactive templates never returned (isActive: false excluded from all responses)
  ✅ 401 on all template routes without X-Internal-Secret
  ✅ 9 tests passing (templates.routes.test.ts) — full coverage
  ✅ tsc --noEmit clean (drafting + gateway)
  ✅ 47 total drafting tests passing across 5 test suites
  ✅ Jira SCRUM-10 → Done
  Deferred: Watermark on exports — export feature not yet built; revisit when export endpoint lands
Next step: Check inputToDev.md for next task
Blockers: None
---

---
Date: 2026-04-24
Session: Sonnet
Task: SCRUM-39 — Environment Strategy (dotenv per ENV + AWS Secrets Manager)
Status: Done
Code changed:
  - apps/{gateway,auth,billing,drafting}/src/index.ts (updated, 4 files) — dotenv path now uses NODE_ENV: `.env.${NODE_ENV ?? 'development'}`; production/staging containers load from file written by CI/CD
  - .gitignore (updated) — consolidated to `.env` + `.env.*` blocked; `!.env.example` + `!.env.*.example` allowed; removed individual per-env entries
  - docker-compose.prod.yml (updated) — env_file renamed `.env.prod` → `.env.production` to align with NODE_ENV=production
  - docker-compose.staging.yml (new) — staging compose file (was missing; referenced by deploy-staging.yml)
  - .github/workflows/deploy-production.yml (updated) — added `workflow_dispatch` trigger with reason input; inject `NODE_ENV: production`; pull secrets from `lawie/production/env` via AWS Secrets Manager on EC2 → write `.env.production` (chmod 600); health check all 4 services (gateway:3000 was missing before)
  - .github/workflows/deploy-staging.yml (updated) — same pattern; `lawie/staging/env` → `.env.staging`; `workflow_dispatch` trigger
Acceptance criteria:
  ✅ dotenv loads `.env.${NODE_ENV}` — correct file per environment
  ✅ .env.staging and .env.production never in codebase — written at deploy time from Secrets Manager
  ✅ .gitignore blocks all .env.* files; allows *.example templates
  ✅ GitHub Actions injects NODE_ENV=staging / NODE_ENV=production
  ✅ AWS Secrets Manager pull step in both deploy workflows (no SSH for rotation)
  ✅ Health checks all 4 services (gateway 3000 + auth 3001 + drafting 3002 + billing 3003); any failure → pipeline red
  ✅ workflow_dispatch on both workflows — manual trigger for secret rotation
  ✅ All 4 services tsc --noEmit clean
  ✅ docker-compose.staging.yml created (was missing)
Secret rotation flow: update value in AWS Console → GitHub Actions > deploy-production > Run workflow → done. No SSH.
Next step: SCRUM-19 — Dashboard state (free vs paid) + settings page (needs Figma link from Rajesh)
Blockers: Founder must run `aws secretsmanager create-secret --name lawie/production/env` and `lawie/staging/env` once with actual secret values before first deploy
---
Date: 2026-04-24
Session: Opus
Task: SCRUM-38 — Test Automation Standard (unit + integration tests + CI gate)
Status: Done
Code changed:
  Infrastructure:
  - jest.config.base.js (new) — shared Jest config: ts-jest preset, 70% coverage threshold, testMatch pattern
  - apps/gateway/jest.config.js (new) — extends base, lower thresholds for proxy-heavy service
  - apps/auth/jest.config.js (new) — extends base, temporary lower thresholds (only health check tests)
  - apps/billing/jest.config.js (new) — extends base, full 70% thresholds
  - apps/drafting/jest.config.js (new) — extends base, temporary lower thresholds (only health check tests)
  Setup files:
  - apps/{gateway,auth,billing,drafting}/src/__tests__/setupEnv.ts (new, 4 files) — process.env test values set before Zod validation
  - apps/{auth,billing,drafting}/src/__tests__/setupDb.ts (new, 3 files) — mongodb-memory-server lifecycle (beforeAll/afterEach/afterAll)
  Test files:
  - apps/billing/src/__tests__/subscription.service.test.ts (new) — 13 unit tests: createSubscription (new + existing), getSubscriptionStatus (free + pro), verifyWebhookSignature (valid + invalid), handleWebhookEvent (activated, charged, cancelled, cancelled-with-other-active, expired, payment.failed, unknown sub)
  - apps/billing/src/__tests__/billing.routes.test.ts (new) — 10 integration tests via Supertest: health, subscribe (no token, invalid, valid), status (no token, free user), webhook (missing sig, invalid sig, valid sig + user upgrade), 404
  - apps/{gateway,auth,drafting}/src/__tests__/health.test.ts (new, 3 files) — health check + 404 per service
  Package updates:
  - apps/{gateway,billing,drafting}/package.json (updated) — added jest, @types/jest, supertest, @types/supertest, ts-jest + test scripts
  - apps/auth/package.json (updated) — added mongodb-memory-server
  - apps/billing/package.json, apps/drafting/package.json (updated) — added mongodb-memory-server
  - apps/web/package.json (updated) — --passWithNoTests flag
  - packages/shared/package.json (updated) — added test script placeholder
  CI/CD:
  - .github/workflows/ci.yml (rewritten) — removed dead @lawie/api references; 4 parallel test jobs (test-gateway, test-auth, test-drafting, test-billing); Build job gated on all 4 test jobs passing; 5 Docker image builds (gateway, auth, drafting, billing, web)
Acceptance criteria:
  ✅ Jest configured for all 4 Express services
  ✅ Supertest configured for integration tests
  ✅ CI pipeline updated — test step is hard blocking gate before build
  ✅ SCRUM-18 retroactive tests written — 23 tests covering happy path, failed payment, webhook signature validation
  ✅ All 29 tests pass across all services (yarn test green)
  ✅ All 4 services pass tsc --noEmit (zero TS errors)
  ✅ Coverage: billing 91.6% stmts / 76.5% branches / 87.5% functions / 92.1% lines
Next step: SCRUM-19 — Dashboard state (free vs paid) + settings page (needs Figma link from Rajesh)
Blockers: None
---
Date: 2026-04-24
Session: Sonnet
Task: SCRUM-18 — Razorpay subscription + webhook + free tier enforcement
Status: Done
Code changed:
  - apps/billing/src/config/env.ts (updated) — RAZORPAY_PLAN_ID added; all 4 Razorpay vars now required
  - apps/billing/src/config/razorpay.ts (new) — Razorpay SDK client singleton
  - apps/billing/src/models/Subscription.model.ts (new) — razorpaySubscriptionId, status, currentPeriodStart/End, cancelledAt
  - apps/billing/src/models/User.model.ts (new) — minimal User stub (same collection as auth) for plan updates
  - apps/billing/src/middleware/authenticate.ts (new) — JWT verification for billing routes
  - apps/billing/src/services/subscription.service.ts (new) — createSubscription, getSubscriptionStatus, verifyWebhookSignature, handleWebhookEvent
  - apps/billing/src/routes/billing.routes.ts (new) — POST /subscribe, GET /status, POST /webhook/razorpay (raw body for HMAC)
  - apps/billing/src/app.ts (rewritten) — raw body middleware for webhook before JSON; routes mounted at /
  - apps/billing/package.json (updated) — razorpay@2.9.6 added
  - apps/drafting/src/middleware/authenticate.ts (new) — JWT verification for drafting routes
  - apps/drafting/src/middleware/enforceFreeLimit.ts (new) — 3 docs/month free limit using Generation model
  - apps/drafting/src/routes/documents.routes.ts (new) — GET /, POST /generate (gated by authenticate + enforceFreeLimit)
  - apps/drafting/src/app.ts (updated) — routes mounted at /
Acceptance criteria:
  ✅ POST /api/billing/subscribe returns Razorpay subscription ID + shortUrl payment link
  ✅ GET /api/billing/status returns plan + subscription state
  ✅ Webhook HMAC verification working (timingSafeEqual)
  ✅ subscription.charged/activated → User.plan = 'pro'
  ✅ subscription.cancelled/expired → User.plan = 'free' (if no other active sub)
  ✅ Free users blocked at 3 docs/month with 402 + upgrade URL
  ✅ Pro users pass enforcement middleware unconditionally
  ✅ Both services pass tsc --noEmit with zero errors
  ✅ Tested via gateway: subscribe creates real Razorpay subscription, status returns correctly
Next step: SCRUM-19 — Dashboard state (free vs paid) + settings/billing page
Blockers: None
---

---
Date: 2026-04-24
Session: Opus
Task: SCRUM-37 — Upgrade Next.js 14 → 16 and React 18 → 19
Status: Done
Code changed:
  - apps/web/package.json (updated) — next 14.2.4→16.2.4, react 18.3.1→19.2.5, react-dom 18.3.1→19.2.5, lucide-react 0.383→1.9.0, @types/react 18→19, @types/react-dom 18→19
  - apps/web/next.config.mjs (updated) — images.domains→remotePatterns (deprecated fix), output:'standalone' added (Docker fix), NEXT_PUBLIC_API_URL fallback port 5000→4000
  - apps/web/tsconfig.json (auto-updated by Next.js 16) — jsx→react-jsx, .next/dev/types added to include
Acceptance criteria:
  ✅ Next.js 16.2.4 (Turbopack) + React 19.2.5 running
  ✅ Zero TypeScript errors (tsc --noEmit passes)
  ✅ All pages respond 200 (login, dashboard, home)
  ✅ Google OAuth flow works end-to-end on new stack
  ✅ No breaking changes — all existing pages compatible
Next step: SCRUM-18 — Razorpay subscription + webhook + free tier enforcement
Blockers: None
---

---
Date: 2026-04-24
Session: Opus
Task: SCRUM-17 — Google OAuth + JWT sessions (full-stack implementation)
Status: Done
Code changed:
  Backend:
  - apps/auth/src/config/env.ts (updated) — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, FRONTEND_URL env vars
  - apps/auth/src/config/passport.ts (new) — Google OAuth strategy: find-by-googleId → link-by-email → create-new-user
  - apps/auth/src/routes/oauth.routes.ts (new) — GET /google (503 if not configured), GET /google/callback (JWT pair + redirect)
  - apps/auth/src/app.ts (updated) — passport.initialize(), CORS origin from env.FRONTEND_URL, OAuth routes mounted
  - apps/auth/src/services/jwt.service.ts (updated) — TokenPayload now includes name + plan fields
  - apps/auth/src/services/auth.service.ts (updated) — all generateTokenPair calls pass name + plan
  - apps/auth/src/middleware/authenticate.ts (rewritten) — req.jwtPayload for JWT auth, separate from Passport's req.user
  - apps/auth/src/models/User.model.ts (updated) — toJSON transform uses Record<string, unknown> (TS strict fix)
  Frontend:
  - apps/web/src/lib/auth.ts (new) — localStorage token storage, JWT decode, getSessionUser(), isAuthenticated()
  - apps/web/src/context/AuthContext.tsx (new) — AuthProvider with useCallback-memoized login/logout, useMemo context value
  - apps/web/src/app/auth/callback/page.tsx (new) — Suspense-wrapped useSearchParams, useRef guard for single execution
  - apps/web/src/app/layout.tsx (updated) — AuthProvider wraps children
  - apps/web/src/app/(auth)/login/page.tsx (updated) — handleGoogleLogin redirects via gateway
  - apps/web/src/app/dashboard/page.tsx (updated) — protected route with useAuth, shows user name/email/plan
  Infra:
  - packages/shared/tsconfig.json (new) — enables tsc build for shared package
  - packages/shared/package.json (updated) — main/types point to dist/
  - apps/{auth,drafting,billing}/tsconfig.json (updated) — removed paths alias to shared/src (uses dist via node_modules)
  - apps/{auth,drafting,billing}/Dockerfile (updated) — removed || true on shared build
  - apps/gateway/src/app.ts (updated) — fixed TS errors: compression/rateLimit casts, http-proxy-middleware v3 Socket|Response error handler
Acceptance criteria:
  ✅ Google OAuth login creates user (verified in auth service logs + MongoDB)
  ✅ JWT tokens contain sub, email, name, role, plan
  ✅ Frontend callback page stores tokens and redirects to dashboard
  ✅ Dashboard shows user name, email, plan from decoded JWT
  ✅ Sign out clears tokens and redirects to login
  ✅ All 4 services + web pass tsc --noEmit (zero TS errors)
  ✅ Gateway proxy routing works (register, login, OAuth endpoints)
Next step: SCRUM-37 done above → SCRUM-18 — Razorpay subscription + webhook
Blockers: None
---

---
Date: 2026-04-23
Session: Sonnet
Task: SCRUM-34/SCRUM-7 — EC2 deployment topology + CI/CD rewire (Arjun CTO decision)
Status: Done
Code changed:
  - docker-compose.prod.yml (new) — 4 services (gateway:3000, auth:3001, drafting:3002, billing:3003) + nginx:80/443; images from ECR :stable tags; .env.prod on EC2 host; restart unless-stopped
  - docker/nginx/nginx.prod.conf (new) — Nginx SSL termination + path routing: /api/auth/→auth, /api/documents/→drafting, /api/billing/→billing, /*→gateway; Let's Encrypt certs mounted from EC2 host; HTTP→HTTPS redirect with ACME webroot challenge
  - .github/workflows/deploy-production.yml (rewritten) — SSH+docker compose deploy; ECR login on EC2; pull+up+prune; health check verification step; EC2_PROD_HOST + EC2_SSH_KEY secrets
  - .github/workflows/deploy-staging.yml (rewritten) — same pattern; EC2_STAGING_HOST secret; staging-latest image tags; docker-compose.staging.yml reference
  - docs/ec2-setup.md (new) — complete provisioning runbook: swap file, Docker install, IAM role, .env.prod setup, certbot SSL, first deploy, health cron, GitHub secrets table
  - docs/environments.md (updated) — EC2 topology, Vercel frontend note, MongoDB Atlas tier per env
Note: Terraform was already removed in SCRUM-13 — nothing to revert. CI/CD was the key delta.
Note: docker-compose.staging.yml not yet created — staging needs same pattern as prod with :staging-latest image tags and api.staging.lawie.com domain. Filed for Priya to add to backlog if staging EC2 is provisioned.
Next step:
  1. Founder to provision EC2 (t3.medium, Ubuntu 24.04, ap-south-1) per docs/ec2-setup.md
  2. Founder to add EC2_PROD_HOST + EC2_SSH_KEY to GitHub Environments secrets
  3. SCRUM-17 — Google OAuth + JWT sessions (next feature ticket in build order)
Blockers: None (operational setup in founder's hands)
---

---
Date: 2026-04-20
Session: Sonnet
Task: SCRUM-14 — Secrets management re-verification (post microservices migration)
Status: Done
Code changed:
  - docs/environments.md (rewritten) — removed all Terraform commands; added manual AWS Secrets Manager setup commands for all 9 secrets across both staging and prod; updated port table for 4-service architecture; added secrets-by-service matrix
  - .env.staging.example (rewritten) — 4-service structure, service ports, service discovery URLs, ENCRYPTION_KEY, MongoDB Atlas URI (not DocumentDB), Secrets Manager source comments
  - .env.production.example (rewritten) — same, production URLs and log level warn
  - .env.example (rewritten) — stripped monolith-era PORT=5000/API_URL, added per-service ports + service discovery, ENCRYPTION_KEY
  - .gitleaks.toml (updated) — allowlist regex for all-zeros dev ENCRYPTION_KEY placeholder
  - README.md (updated) — fixed apps/api/src/config/env.ts reference → per-service pattern; removed Terraform module reference
  - .github/workflows/deploy-staging.yml (rewritten) — builds and deploys 5 images (gateway, auth, drafting, billing, web); removed old apps/api monolith reference
  - .github/workflows/deploy-production.yml (rewritten) — same for production
Acceptance criteria check:
  ✅ .env.example committed with all keys, no values (ENCRYPTION_KEY added)
  ✅ Secrets in AWS Secrets Manager — manual CLI approach, fully documented (no Terraform)
  ✅ Local dev .env documented in README + environments.md
  ✅ gitleaks pre-commit hook active, allowlist updated
  ✅ Per-service Zod env validation at startup (all 4 services)
  ✅ CI/CD workflows reference correct Dockerfiles for all 5 services
Jira: SCRUM-14 transitioned to In Review; comment posted with secrets map and deploy instructions
Next step:
  1. Founder/Arjun to provision ECS clusters + task definition families (manual, no Terraform)
  2. Run aws secretsmanager create-secret commands from docs/environments.md before first staging deploy
  3. SCRUM-17 — Google OAuth + JWT sessions (next in build order, now unblocked)
Blockers: None
---

---
Date: 2026-04-19
Session: Sonnet
Task: SCRUM-11 — MongoDB Atlas schema (Mongoose models + encryption)
Status: Done
Code changed:
  - packages/shared/src/constants/docs.ts (new) — UserPlan, DocType, CourtType, DocStatus enums + type exports
  - packages/shared/src/types/user.types.ts (updated) — User interface extended with plan, docCount, googleId, barCouncilState, enrollmentNumber
  - packages/shared/src/index.ts (updated) — exports new docs constants
  - apps/auth/src/models/User.model.ts (updated) — new fields: plan ('free'|'pro'), docCount, googleId (sparse), barCouncilState, enrollmentNumber; password now optional (for Google OAuth); new indexes on plan + googleId
  - apps/drafting/src/config/env.ts (updated) — ENCRYPTION_KEY added: required 64-char hex (32-byte AES-256 key)
  - apps/drafting/src/utils/encryption.ts (new) — AES-256-GCM encrypt/decrypt; format: base64(iv):base64(authTag):base64(ciphertext)
  - apps/drafting/src/models/Document.model.ts (new) — userId, docType, courtName, content (encrypted), status; indexes on userId, docType, createdAt, userId+docType+createdAt
  - apps/drafting/src/models/Template.model.ts (new) — docType, courtType, content, version, approvedBy; indexes on docType+courtType, docType+version
  - apps/drafting/src/models/Generation.model.ts (new) — userId, docType, tokensUsed; indexes on userId, docType, createdAt, userId+createdAt (for monthly cost aggregation)
  - .env.development (updated) — ENCRYPTION_KEY dev placeholder (all-zero 64-hex, safe for dev only)
  - .env.example (updated) — ENCRYPTION_KEY documented with openssl rand -hex 32 instruction
Acceptance criteria check:
  ✅ Mongoose models for users, documents, templates, generations
  ✅ users: email, name, google_id, plan, doc_count, bar_council_state, enrollment_number, timestamps
  ✅ documents: user_id, doc_type, court_name, content (encrypted), status, timestamps
  ✅ templates: doc_type, court_type, content, version, approved_by, timestamps
  ✅ generations: user_id, doc_type, tokens_used, timestamps
  ✅ Indexes on user_id, doc_type, created_at (all three new models)
  ✅ AES-256-GCM encryption utility for document content field
Next step:
  1. SCRUM-14 — re-verify secrets management works for 4-service microservices architecture (Terraform removed, need alternative for per-service ENCRYPTION_KEY rotation)
  2. Remind Priya to add ENCRYPTION_KEY to AWS Secrets Manager entries for staging/prod
Blockers: None
---

---
Date: 2026-04-19
Session: Opus
Task: SCRUM-13 — Express.js microservices backend (4 stateless services)
Status: Done
Code changed:
  - apps/gateway/ (new) — API gateway with http-proxy-middleware, rate limiting, CORS, health check
  - apps/auth/ (new) — auth service migrated from apps/api (JWT, bcrypt, User model, validators, all auth routes)
  - apps/drafting/ (new) — drafting service skeleton with health check, DB connection
  - apps/billing/ (new) — billing service skeleton with health check, DB connection, Razorpay env vars
  - apps/{gateway,auth,drafting,billing}/Dockerfile (new) — multi-stage Docker builds for each service
  - docker-compose.yml (rewritten) — 4 backend services + web + mongo + mongo-express
  - package.json (updated) — dev and dev:backend scripts for 4 services
  - .env.development (updated) — new ports (4000-4003), service discovery URLs
  - README.md (updated) — microservices structure, service routing table, new URLs
  - Removed: apps/api/ (old monolith), infrastructure/ (Terraform per CTO change), docker-compose.{staging,prod}.yml
Acceptance criteria check:
  ✅ 4 independent Express.js services (gateway, auth, drafting, billing)
  ✅ Each has own Dockerfile and health check (GET /health)
  ✅ Gateway handles path-based routing: /api/auth/* → auth, /api/documents/* → drafting, /api/billing/* → billing
  ✅ All services share MongoDB (via MONGO_URI env var)
  ✅ .env strategy per service documented
Next step:
  1. SCRUM-11 — MongoDB Atlas schema (Mongoose models: users, documents, templates) — next in build order
  2. SCRUM-14 — re-verify secrets management still works with new service architecture
Blockers: None
---

---
Date: 2026-04-16
Session: Opus
Task: SCRUM-14 — Configure secrets management and environment variable strategy
Status: Done
Code changed:
  - apps/api/src/config/env.ts (new) — Zod schema validating all env vars at boot with clear errors
  - apps/api/src/config/database.ts (updated) — uses validated env.MONGO_URI
  - apps/api/src/index.ts (updated) — imports env first so validation runs before anything else
  - infrastructure/terraform/modules/secrets/{main,variables,outputs}.tf (new) — AWS Secrets Manager module + IAM read policy + attachment to ECS execution role
  - infrastructure/terraform/modules/ecs/outputs.tf (updated) — exposes execution_role_name, execution_role_arn, task_role_name
  - infrastructure/terraform/environments/{staging,prod}/main.tf (updated) — wires `secrets` module ARNs into ECS api_secrets
  - infrastructure/terraform/environments/{staging,prod}/variables.tf (updated) — removed redundant api_secrets/web_secrets vars
  - .gitleaks.toml (new) — secret-scan config with Lawie-specific rules + allowlist for known placeholders
  - .husky/pre-commit (updated) — runs gitleaks before lint-staged
  - README.md (updated) — new "Secrets & environment variables" section; SCRUM-8 and SCRUM-14 marked Done in sprint table
Acceptance criteria check (all green):
  ✅ .env.example committed with all keys, no values (from SCRUM-8)
  ✅ Secrets Manager provisioned per env for prod (and staging)
  ✅ Local dev secrets setup documented in README
  ✅ Pre-commit hook prevents accidental secret commits (gitleaks)
  ✅ Env vars validated at app startup with clear error messages (Zod in env.ts)
Next step:
  1. Run `brew install gitleaks` on dev machines (one-time)
  2. On next terraform apply (staging first), run `aws secretsmanager put-secret-value` for each real secret — placeholders are "REPLACE_ME" by default
  3. Arjun / Priya to move SCRUM-14 to Done in Jira
Blockers: None for the ticket.
  Flagging pre-existing TS errors found during type-check (NOT caused by SCRUM-14, do not block this ticket):
  - apps/api/src/models/User.model.ts:63,66 — `delete` on non-optional property
  - apps/api/src/services/auth.service.ts — missing `expiresIn` in AuthTokens return
  - apps/api/tsconfig.json — rootDir excludes packages/shared (workspace import fails type-check)
  Recommend Priya files these as separate tickets.
---


---
Date: 2026-04-15
Session: -
Task: CLAUDE.md initialised — no dev work done yet
Status: Done
Code changed: CLAUDE.md created
Next step: Await first ticket from Priya
Blockers: None
---

---
Date: 2026-04-15
Session: Opus
Task: Board process change — task intake via inputToDev.md
Status: Done
Code changed:
  - docs/inputToDev.md (new) — task intake queue for all agents
  - docs/CLAUDE.md (updated) — rules 7–11 added covering new intake flow
Next step: All agents to start filing tasks in inputToDev.md; Vishal reads it at session start
Blockers: None
---

---
Date: 2026-04-15
Session: Sonnet
Task: SCRUM-8 — Set up development, staging, and production environments
Status: Done
Code changed:
  - .env.development (new), .env.staging.example (new), .env.production.example (new)
  - docker-compose.staging.yml (new), docker-compose.prod.yml (new)
  - docker/mongo/init-replica.js (new)
  - infrastructure/terraform/modules/{vpc,ecr,documentdb,alb,ecs}/*.tf (new)
  - infrastructure/terraform/environments/{staging,prod}/*.tf + tfvars (new)
  - infrastructure/terraform/backend.tf (new)
  - .github/workflows/deploy-production.yml (new)
  - .github/workflows/deploy-staging.yml (updated — now builds SHA-tagged images and uses render/deploy-task-definition)
  - docs/environments.md (new)
Next step:
  1. Founder/Arjun to create S3 state bucket + DynamoDB lock table (one-time bootstrap — commands in docs/environments.md)
  2. Obtain ACM certificate ARNs for *.staging.lawie.com and *.lawie.com, fill in tfvars
  3. Configure GitHub Environments (staging, production) with AWS + ECR secrets
  4. Run terraform apply for staging first, then prod
  5. Populate SSM Parameter Store with runtime secrets (JWT, MONGO_URI, SMTP, Sentry)
Blockers: None — all deliverables in acceptance criteria complete. External dependencies (ACM cert, SSM secrets) are operational, not blocking this ticket.
---

