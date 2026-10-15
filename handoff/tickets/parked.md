# Parked list

Should-fixes and nice-to-haves that are not tickets (Arjun's rule, 14 Oct 2026; see README "Follow-ups and the parked list"). One line each: date, source, what. Priya and Arjun review it weekly; most items die here.

| Date | Source | What |
| ---- | ------ | ---- |
| 14 Oct 2026 | T-411 review (Tanvi) | DynamicFormRenderer: a failed courts/states fetch is swallowed silently (no Retry alert, unlike CourtPicker); pre-existing, all templates. |
| 14 Oct 2026 | T-425 (Tanvi) | Six bail template ids and the court-type labels are duplicated between web and server; move them to @lawie/shared later (needs the shared claim). |
| 14 Oct 2026 | T-407 part 2 (Vishal) | Template seed copies related_acts raw into Template.relatedActs in Mongo, so the s.138 twin stores the literal "{ni_act_related_sections}". Nothing reads it today; a future UI showing relatedActs would print the placeholder. |
| 14 Oct 2026 | T-115b (Kunal) | review.routes.ts admin assign/list (~95/137/193) skips the isDeleted filter, so an admin could mint a review token for a document mid-erase. (Public GET/POST review paths fixed in T-115b; admin paths stay parked.) |
| 14 Oct 2026 | T-115b (Kunal) | Erase sweep has no alert for a document stuck pending; more than 50 stuck would starve newer erases. |
| 14 Oct 2026 | T-425 part 2 (Tanvi) | Classic form: a kept (not-offered) court can show the saved court's state name when the draft's state differs. DFR has no draft loading yet. |
| 14 Oct 2026 | T-425 part 2 (Tanvi) | Possibly one extra court lookup on a state/type change; no wrong value. |
| 14 Oct 2026 | T-436 (Ajay) | Optional customer GSTIN on invoices (B2B input credit). Ajay, parked. |
| 14 Oct 2026 | T-436 (Ajay) | Class 3 DSC on invoice PDFs instead of a scanned signature. Ajay, parked. |
| 14 Oct 2026 | T-115c (Ajay) | Privacy §9 server-log retention has no period. Arjun to give one, Ajay signs the line. |
| 14 Oct 2026 | Arjun (post-v1) | SES bounce/complaint webhook to an app suppression list (SCRUM-77 §7; code has only the EMAIL_CONFIGURATION_SET hook, no handler). For v1 the SES account-level suppression list covers it. |
| 14 Oct 2026 | T-115b (Kunal) | POST /review/:token/feedback can race the erase within one Mongo round trip; claim the token atomically (findOneAndUpdate isUsed:false to true), which also closes the existing double-submit. |
| 14 Oct 2026 | Ajay ef06e89 | Privacy §3/§5: the Atlas row may say 'India (Mumbai)' (Arjun confirmed). Ships with the next privacy-page change: Tanvi's T-115c. |
| 14 Oct 2026 | T-429 (Ajay 83fbd62) | criminal_revision Para 7: say the S.438(3) BNSS bar is on a further revision 'by the same person'. |
| 14 Oct 2026 | T-115c (Ajay 41616be) | Billing/ledger rows have no TTL. Add a sweep that deletes them after 72 months (Privacy §9, DPDP s.8(7)). Tax retention is the billing rows, not AuditLog (Arjun). |
| 14 Oct 2026 | T-433 (Shashank) | Terms §6 still says 'short ones use 1'; T-238 signed 'short documents' wherever the Ink line appears. Needs Ajay's word; ships with the next terms-page change. |
| 14 Oct 2026 | T-429 (Vishal) | template-promoter readComputedFields shallow-copies value_map, which is shared with the cached rule JSON; deep-copy it. |
| 14 Oct 2026 | T-384 (Meera/Rajesh) | Let the advocate choose 'Not known' on a date row from the brief itself; T-384 covers only a date already answered 'Not known'. |
| 14 Oct 2026 | T-384 (Meera/Rajesh) | The 'Change' link on a 'Not known' date needs an accessible name with the row label, e.g. 'Change {row label}'. Low priority. |
| 14 Oct 2026 | T-437 (Vishal) | The admin AI cost screen leaves out LlmAuxCall cost (intake and preflight). |
| 14 Oct 2026 | T-437 (Vishal) | Preflight LlmAuxCall rows have no intakeId, so they don't join to a draft. |
| 14 Oct 2026 | T-115c (Tanvi) | The auth erase sweep sorts on lastAttemptAt+requestedAt with no matching index (in-memory sort over pending erasures). Add the index. |
| 14 Oct 2026 | T-115c (Tanvi) | The 'erase keeps failing' warning has no alert. Tie it to Ajay's parked operator-alert item. |
| 14 Oct 2026 | T-436a (Kunal) | Refund cap is check-then-insert; two refunds at the same instant could over-credit (refunds are founder-run; Razorpay caps the refund). Arjun: should-fix (credit notes are idempotent on refundId and Razorpay caps the refund). Fix in T-436b: make the cap a conditional $inc on the invoice's refundedTotal (CAS). |
| 14 Oct 2026 | T-436a (Kunal) | Invoice-number allocation retries have no backoff; a burst hands work to the sweep early. |
| 14 Oct 2026 | T-440 (Shashank) | ai.service.ts :676/:1268 never pass extra.notKnownDates to buildPlaceholderContext. No user can reach it (brief drafts never take the template route). Wire it or comment it. |
| 14 Oct 2026 | T-440 (Shashank) | blankLabel is copied 3 times (intake-brief, template-engine blankWords, s138BlankLabel). Merge into one, minding the intake-brief/s138 import cycle. |
| 14 Oct 2026 | T-440 (Shashank) | The guided drafter prompt lacks Ajay's not-known line (unreachable today; guided has no pack). Take it to Ajay before any pack-less brief can carry 'Not known'. |
| 14 Oct 2026 | T-437 fix (Vishal) | scripts/golden-set/__tests__/harness.test.ts runs in no CI job or workspace script, which is why the T-437 break showed only in the dry run. Add a CI step or a script. |
| 14 Oct 2026 | T-436a (Kunal) | One unnamed billing failure under load (1 of 632), not reproducible in 7 reruns. If it shows in CI, the log has the name; Kunal chases it then. Likely a timing-dependent new async test (sweep timers or the concurrency test). |
| 15 Oct 2026 | T-424 (Mahak) | gitleaks is not installed in the lead sandboxes, so the commit secret scan degrades to a warning (CLAUDE.md). Install it in the sandbox image, or confirm CI secret scanning covers pushes. |
| 15 Oct 2026 | T-442 (Mahak) | The deploy health check retries 10 x 3 s; a slow fork-mode boot may false-fail (never false-pass). Arjun may want 20 tries. |
| 15 Oct 2026 | T-442 (Mahak) | docker-compose.staging.yml and the .env*.example files still mention ECR_REGISTRY (staging is its own path). |
| 15 Oct 2026 | T-442 (Mahak) | .env.production.example sets GATEWAY_PORT/AUTH_PORT/DRAFTING_PORT/BILLING_PORT but no service reads them (services read PORT). |
| 15 Oct 2026 | T-442 (Mahak) | deploy-production.yml points to docs/DEPLOY.md, which does not exist. |
| 15 Oct 2026 | T-442 (Mahak) | T-117 cites docker-compose.prod.yml line 5, now deleted. |
| 15 Oct 2026 | T-442 (Mahak) | email-worker app.ts comment says /health is 'for docker-compose'; it is now the deploy gate (comment only). |
| 15 Oct 2026 | T-442 (Mahak) | The web deploy check is GET / without -L; a redirect from / would false-fail (none today). Add a /health route to apps/web later. |
| 15 Oct 2026 | T-377 (Mahak) | The API's Google callback GET /api/auth/google/callback?code=...&state=... (apps/auth/src/routes/oauth.routes.ts:138) still logs the single-use code in full in nginx.prod.conf; the map matches only /auth/callback at the path start. Arjun ruled 15 Oct: widen it in T-377. NOT yet in 846ad85; Mahak's follow-up widens it. |
| 15 Oct 2026 | T-377 (Mahak) | docker/nginx/nginx.prod.conf upstream ports (3000-3003) differ from CLAUDE.md (4000-4003); Arjun ruled 15 Oct: ecosystem.config.js is the source of truth; Mahak fixed the conf in the T-377b follow-up (not T-442). |
| 15 Oct 2026 | T-377 (Mahak) | apps/web build is `next build`, not tsc, so CLAUDE.md's 'build = typecheck' does not hold for web. Fix the doc or add a typecheck script. |
| 15 Oct 2026 | T-377 (Mahak) | The t377-referrer-header test spawns node and needs @sentry/nextjs installed; a broken install fails it with a spawn error, not an assertion. |
| 15 Oct 2026 | T-442/T-377b (Mahak) | docker-compose.staging.yml mounts docker/nginx/nginx.prod.conf and runs services on 3000-3003 (lines 17, 36-42, 56-60, 73-77, 90-94); after the port fix it points at ports nothing listens on. Deploy-staging is a disabled placeholder. Arjun ruled 15 Oct: delete it and deploy-staging.yml in T-442 (no staging environment). |
| 15 Oct 2026 | T-377b (Mahak) | apps/web/src/app/review/[token]/page.tsx:40 falls back to API URL http://localhost:3001 (auth binds 4001, gateway 4000). Wrong fallback, dead in prod because NEXT_PUBLIC_API_URL is set. Arjun: V1.1; the right fix is no fallback and fail loudly on a missing NEXT_PUBLIC_* URL (one line) whenever a lead is in that file. |
| 15 Oct 2026 | T-245a (Vishal) | POST /documents/generate (documents.routes.ts ~1620-1720) is a legacy API route no part of the web or gateway calls any more; a direct API call with docType 'bail_regular' still reaches streamGenerateDocument, whose base prompt (prompt-assembler.ts:~384) says 'NEVER reference old IPC, CrPC, or IEA'. Arjun ruled 15 Oct: must-fix, retire the route with 410. Now T-443. |
| 15 Oct 2026 | T-358 (Tanvi) | Partial index on firstVerifySentAt / unverifiedNoticeSentAt for the hourly sweep counts (index migration). |
| 15 Oct 2026 | T-442/T-377b (Mahak) | Once docker-compose.staging.yml and deploy-staging.yml are deleted: README.md:189 says `develop` 'auto-deploys staging' (wrong), .gitleaks.toml:37 allowlists .env.staging.example, the root staging env example is orphaned, .github/copilot-instructions.md:90 is stale. Fix with the deletions. |
| 15 Oct 2026 | T-436 (Shashank) | On a credit-note row, 'Against invoice {n}' is plain text. A link to the original invoice row or PDF would be nicer (Rajesh/Meera). |
