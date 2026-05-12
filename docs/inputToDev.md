# inputToDev.md — Task Intake for Vishal

> **Board rule (2026-04-15):** All agents must write dev tasks into this file.
> Never give Vishal tasks verbally through the Founder — write it here first.
> Only **Vishal** updates the `Status` field (Pending → Picked Up → Done).

---

## HOW TO FILE A TASK (for other agents)

Append a new entry below the `TASK QUEUE` marker using this exact format:

```
---
ID: [short-slug, e.g. auth-login-ui]
Filed by: [Priya / Rajesh / Arjun / Meera / etc.]
Filed on: YYYY-MM-DD
Status: Pending
Jira: [SCRUM-N or "N/A" if not a Jira ticket]
Figma: [Figma URL if UI task, else "N/A"]
Priority: [P0 / P1 / P2]
Task: [one-line summary]
Details: |
  [full requirements, acceptance criteria, constraints]
Dependencies: [other ticket IDs or "None"]
---
```

**Required fields when applicable:**
- **Jira ref** from Priya for every feature/bug ticket
- **Figma link** from Rajesh for every UI task

---

## RULES (Vishal only)

1. Read this file at the start of every session
2. Pick the highest-priority `Pending` task (P0 > P1 > P2; ties broken by filing date)
3. Before starting, change `Status: Pending` → `Status: Picked Up` and add `Picked up on: YYYY-MM-DD`
4. Log progress in `docs/CLAUDE.md` Task Diary (not here)
5. When done, change `Status: Picked Up` → `Status: Done` and add `Completed on: YYYY-MM-DD`
6. Never delete old entries — keep them for audit

---

## TASK QUEUE

<!-- All agents append new tasks below this line. Vishal updates Status only. -->

## TASK FROM PRIYA — 16 APRIL 2026
Agent: Priya · PM
Task for Vishal: Configure secrets management and environment variable strategy
Priority: High
Ticket ref: SCRUM-14
Figma link: N/A
Copy/brief: N/A
Deadline: 0.5 days
Notes: Foundation task — nothing else builds cleanly without this.
Use AWS Secrets Manager or per-environment .env files consistent
with ECS Fargate setup. Dev / Staging / Prod all need separate configs.
Document all variable names in team wiki once done.
Status: Done
Picked up on: 2026-04-16
Picked up by: Vishal-Opus
Completed on: 2026-04-16

## TASK FROM PRIYA · PM — 19 Apr 2026

Agent: Priya · PM
Task for Vishal: Pick up the following tickets in strict order. 
Landing page (SCRUM-28) is DONE — great work. Next sprint starts now.

**Note
Requirement architecture has changed, we don't want to have terraform. remove it from out project 

BUILD ORDER:
1. SCRUM-13 — Express.js monolith backend (all routes, JWT middleware, health check)
2. SCRUM-11 — MongoDB Atlas schema (Mongoose models: users, documents, templates)
3. SCRUM-14 — Secrets management (.env + AWS Secrets Manager)
4. SCRUM-17 — Google OAuth + user collection + session (JWT, 7-day expiry)
5. SCRUM-18 — Razorpay subscription + webhook + free tier enforcement
6. SCRUM-19 — Dashboard state (free vs paid) + settings page

RULES:
- Do NOT start SCRUM-17 until SCRUM-13 is done
- Do NOT start SCRUM-18 until SCRUM-17 is done
- All tickets carry label CTO-APPROVED — safe to build
- SCRUM-36 (AI provider) is still a blocker for Drafting — do not attempt until board decides

Priority: High
Ticket refs: SCRUM-13, 11, 14, 17, 18, 19
Figma link: N/A
Deadline: Sprint 1 end
Status: Picked Up
Picked up on: 2026-04-19
Picked up by: Vishal-Opus
Progress:
  - SCRUM-13 ✅ Done (2026-04-19) — 4 Express.js microservices, Docker, gateway routing
  - SCRUM-11 ✅ Done (2026-04-19) — Mongoose models: User (updated), Document, Template, Generation + AES-256-GCM encryption util
  - SCRUM-14 ✅ Done (2026-04-20) — environments.md rewritten, CI/CD workflows fixed for 4-service builds, ENCRYPTION_KEY documented end-to-end, Jira → In Review
  - SCRUM-17 ✅ Done (2026-04-24) — Google OAuth + JWT sessions, frontend auth flow, dashboard protected route
  - SCRUM-18 ✅ Done (2026-04-24) — Razorpay subscription + webhook + free tier enforcement
  - SCRUM-19 ✅ Done (2026-04-24) — Dashboard state (free vs paid) + settings page

TASK FROM Arjun (CTO) — 23 April 2026
Agent: Arjun · CTO
Task for Vishal: Infrastructure deployment decision + CI/CD rewire
Priority: High
Ticket ref: SCRUM-34 (rewritten), SCRUM-13 (updated), SCRUM-14 (revert Terraform)
Figma link: N/A
Copy/brief: N/A
Deadline: This sprint — do before any feature work
Notes: See below
Status: Done
Picked up on: 2026-04-23
Picked up by: Vishal-Sonnet
Completed on: 2026-04-23

CTO DECISION: Phase 1 Deployment Topology
Decision: Single EC2 (t3.medium) + Docker Compose + Nginx reverse proxy.
ECS Fargate is deferred to Phase 2. Rationale: 25 users don't need auto-scaling. ₹2,100/month vs ₹5,000+/month. Microservices architecture is preserved — 4 containers, just on one box.
What Vishal must do (in order):
1. REVERT TERRAFORM (SCRUM-14 — URGENT)

Delete the entire infrastructure/terraform/ directory from the repo
Remove any Terraform state files
Keep: .env.example, gitleaks pre-commit hook, Zod env validation — those are good
Secrets stay in AWS Secrets Manager — that part is correct, just managed via Console not Terraform

2. UPDATE CI/CD DEPLOY STEP (SCRUM-7)

Current: CI/CD pushes to ECR + triggers ECS deploy (which doesn't exist yet)
New: CI/CD pushes to ECR + SSHs into EC2 + runs docker compose pull && docker compose up -d
GitHub Actions needs: EC2 SSH key stored as GitHub Secret (EC2_SSH_KEY, EC2_HOST)
Deploy script:

bash  ssh -o StrictHostKeyChecking=no -i key.pem ubuntu@$EC2_HOST \
    "cd /home/ubuntu/lawie && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
3. CREATE docker-compose.prod.yml (SCRUM-33 + SCRUM-34)

Services: gateway (3000), auth (3001), drafting (3002), billing (3003), nginx (80/443)
Images pulled from ECR (not built locally in prod)
Nginx config with path-based routing:

/api/auth/* → auth-service:3001
/api/documents/* → drafting-service:3002
/api/billing/* → billing-service:3003
/* → gateway-service:3000


Let's Encrypt SSL via Certbot
Restart policy: unless-stopped on all services

4. EC2 SETUP (SCRUM-34 — founder will provision, Vishal documents)

t3.medium in ap-south-1
Ubuntu 24.04 LTS
Docker + Docker Compose installed
Security group: 80, 443, 22 (SSH restricted to founder IP)
Elastic IP for DNS
4GB swap file configured
Health check cron: curl each /health endpoint every 5 min

Architecture (final for Phase 1):
Client (Vercel) → EC2 (ap-south-1)
                    ├── Nginx (80/443) — SSL + routing
                    ├── gateway-service (:3000)
                    ├── auth-service (:3001)
                    ├── drafting-service (:3002)
                    └── billing-service (:3003)
                          ↓
              MongoDB Atlas (Free M0) + Redis Cloud (Free) + AI Provider (TBD) + Razorpay
What NOT to do:

Do NOT use Terraform, AWS CDK, or any IaC tool
Do NOT set up ALB — Nginx handles routing
Do NOT create ECS task definitions — deferred to Phase 2
Do NOT change the 4-service split — microservices architecture stays

Phase 2 migration (for reference, not now):
When traffic > 50 concurrent users → Docker images already in ECR → write ECS Fargate task definitions → 2-day migration. No code changes needed.

— Arjun, CTO

## TASK FROM Priya (PM) — 24 April 2026
Agent: Priya · PM (CTO-approved)
Task for Vishal: Upgrade Next.js 14 → 15 and React 18 → 19
Priority: High
Ticket ref: SCRUM-37
Figma link: N/A
Copy/brief: N/A
Deadline: This sprint — immediately after SCRUM-17 is done
Notes: Arjun approved. Do in one commit. Fix async params/searchParams
in existing pages. Keep Tailwind on latest. If anything breaks, fix in
same commit. Small scope now (~1 hour), painful later.
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Opus
Completed on: 2026-04-24

---
ID: scrum-18-billing
Filed by: Priya · PM
Filed on: 2026-04-24
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Sonnet
Completed on: 2026-04-24
Jira: SCRUM-18
Figma: N/A
Priority: P0
Task: Razorpay subscription + webhook + free tier enforcement
Details: |
  1. Billing service — POST /subscribe (create Razorpay subscription, return payment link)
  2. Billing service — GET /status (return current plan + subscription state)
  3. Billing service — POST /webhook/razorpay (verify HMAC, update User.plan on activation/charge/cancellation)
  4. Drafting service — enforce free tier: max 3 docs/month for free users (use Generation model)
  5. Subscription Mongoose model (razorpaySubscriptionId, status, currentPeriodEnd)
  6. Both /subscribe and /status require JWT auth
  Razorpay events to handle: subscription.charged, subscription.activated, subscription.cancelled, subscription.expired, payment.failed
Dependencies: SCRUM-17 (done)

## TASK FROM VISHAL — 24 APRIL 2026
Agent: Vishal · Dev
Task for Vishal: Test Automation Standard — Unit + Integration tests 
mandatory per feature + CI gate
Priority: High
Ticket ref: SCRUM-38
Figma link: N/A
Copy/brief: N/A
Deadline: 1 day (setup) + ongoing per feature
Notes: 
- Configure Jest/Vitest for all Express services
- Configure Supertest for integration tests on all API routes
- Update GitHub Actions CI pipeline — test step must be a hard 
  blocking gate (PR cannot merge if tests fail)
- Every new ticket from this point ships with [feature].test.ts
- Write retroactive tests for SCRUM-18 (Razorpay) — happy path, 
  failed payment, webhook signature validation
- Minimum coverage threshold: 70% per service
- Scope: Gateway, Auth, Drafting, Billing services
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Opus
Completed on: 2026-04-24

## TASK FROM ARJUN + PRIYA — 24 APRIL 2026
Agent: Arjun · CTO + Priya · PM
Task for Vishal: Environment strategy — dotenv per environment 
+ AWS Secrets Manager for staging/prod
Priority: High
Ticket ref: SCRUM-39
Figma link: N/A
Copy/brief: N/A
Deadline: 0.5 days

Notes:
- Create .env.dev locally — gitignored, never committed
- No .env.staging or .env.prod in codebase — values in AWS 
  Secrets Manager only
- Express loads correct file via:
  require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` })
- GitHub Actions injects NODE_ENV=staging / NODE_ENV=production 
  automatically at deploy
- Update .gitignore — block all .env.* files
- AWS Secrets Manager variables: MONGODB_URI, RAZORPAY_KEY, 
  JWT_SECRET, REDIS_URL (staging + prod)
- After docker compose up -d: curl /health on all 4 services
  (Gateway, Auth, Drafting, Billing) — any failure exits with 
  error code → pipeline goes red
- Secret rotation = update AWS Console → trigger GitHub Actions 
  manually. No SSH ever.

Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Sonnet
Completed on: 2026-04-24

## TASK — 24 Apr 2026
Ticket: SCRUM-19 (https://abhinava32.atlassian.net/browse/SCRUM-19)
Priority: High
Figma: N/A — design spec is in the Jira ticket description
Rules:
- Use shadcn/ui components (Button, Card, Badge, Table)
- Sidebar is a shared layout component across all /dashboard/* routes
- Gold (#F59E0B) for upgrade CTA — not blue
- Usage meter must call GET /api/v1/user/usage
- Depends on SCRUM-17 (auth) and SCRUM-18 (Razorpay) being done first
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Sonnet
Completed on: 2026-04-24

## TASK — 24 Apr 2026

Ticket: SCRUM-14 (https://abhinava32.atlassian.net/browse/SCRUM-14)
Priority: High
Figma: N/A
Rules:
- Read the latest comment on SCRUM-14 by Arjun (CTO)
- ANTHROPIC_API_KEY is already set in your local .env — no value needed from anyone
- Drafting service only — do not add to other services
- Once done, move immediately to SCRUM-23
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Opus
Completed on: 2026-04-24

---

## TASK — 24 Apr 2026

Ticket: SCRUM-23 (https://abhinava32.atlassian.net/browse/SCRUM-23)
Priority: High
Figma: N/A
Rules:
- AI provider: Anthropic Claude Sonnet 4 (claude-sonnet-4-20250514)
- Use ANTHROPIC_API_KEY from env — already set
- Stream the response back to client (do not wait for full completion)
- After generation, validate all section numbers against /src/config/bns-mapping.json — flag unmatched sections with a warning, do not block the response
- Append disclaimer to every generated document: "AI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice."
- Model: claude-sonnet-4-20250514 | max_tokens: 4096
Status: Done
Picked up on: 2026-04-24
Picked up by: Vishal-Opus
Completed on: 2026-04-24

## TASK FROM ARJUN — 24 APRIL 2026
Agent: Arjun · CTO
Task for Vishal: MongoDB Schema Implementation — 7 Mongoose models
Ticket ref: SCRUM-40
Priority: High
Deadline: 1 day
Status: Done
Picked up on: 2026-04-25
Picked up by: Vishal-Opus
Completed on: 2026-04-25

---
ID: scrum-10-access-control
Filed by: Priya · PM
Filed on: 2026-04-25
Status: Done
Picked up on: 2026-04-25
Picked up by: Vishal-Sonnet
Completed on: 2026-04-25
Jira: SCRUM-10
Figma: N/A
Priority: P1
Task: Simplified access control — Free vs Paid advocate tiers
Details: |
  1. Change free tier doc limit from 3 → 5 docs/month
  2. Add GET /templates route — returns templates filtered by plan (free users: planAccess=free only; pro: all)
  3. Add GET /templates/:slug route with same plan check
  4. Watermark on exports: deferred — export feature not yet built
  5. Tests for new template routes
Dependencies: SCRUM-11 (done), SCRUM-23 (done)
---

## TASK FROM ARJUN — 25 APRIL 2026
Agent: Arjun · CTO
Task for Vishal: SCRUM-41 + SCRUM-42
Ticket ref: SCRUM-41, SCRUM-42
Priority: High
Deadline: 1 day
Status: Done
Picked up on: 2026-04-25
Picked up by: Vishal-Opus
Completed on: 2026-04-25
Progress:
  - SCRUM-41 ✅ Done (2026-04-25) — Redis-backed sessions with TTL, session service, logout endpoint
  - SCRUM-42 ✅ Done (2026-04-25) — Gateway JWT validation, session check, plan-based rate limiting, internal secret auth

  ## TASK FROM PRIYA — 25 APRIL 2026
Agent: Priya · PM
Task for Vishal: Logging + Sentry integration
Ticket ref: SCRUM-15
Priority: High
Deadline: 0.5 days
Status: Done
Picked up on: 2026-04-25
Picked up by: Vishal-Opus
Completed on: 2026-04-25

# TASKS — 26 Apr 2026
## Pick tasks in sequence. Read the Jira ticket for full details.
---

## TASK 1 — 26 Apr 2026
Ticket: SCRUM-27 (https://abhinava32.atlassian.net/browse/SCRUM-27)
What: BNS/BNSS/BSA section mapping JSON — foundation for everything else
Status: Done
Picked up on: 2026-04-26
Picked up by: Vishal-Opus
Completed on: 2026-04-26
Note: Code complete — Jira moved to In Review pending Ajay (CLO) validation of mappings

## TASK 2 — 26 Apr 2026
Ticket: SCRUM-43 (https://abhinava32.atlassian.net/browse/SCRUM-43)
What: Three-layer AI drafting engine — structured prompts + formatting + validation
Status: Done
Picked up on: 2026-04-28
Picked up by: Vishal-Opus
Completed on: 2026-04-28

## TASK 3 — 26 Apr 2026
Ticket: SCRUM-44 (https://abhinava32.atlassian.net/browse/SCRUM-44)
What: Rich text editor (TipTap/Lexical) + PDF/DOCX export + filing checklist panel
Status: Done
Picked up on: 2026-04-28
Picked up by: Vishal-Opus
Completed on: 2026-05-06

## TASK 4 — 26 Apr 2026
Ticket: SCRUM-46 (https://abhinava32.atlassian.net/browse/SCRUM-46)
What: Free tool — IPC↔BNS / CrPC↔BNSS / IEA↔BSA section converter
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06

## TASK 5 — 26 Apr 2026
Ticket: SCRUM-47 (https://abhinava32.atlassian.net/browse/SCRUM-47)
What: Free tool — Bail eligibility checker (bailable/non-bailable + court + BNSS section)
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06

## TASK 6 — 26 Apr 2026
Ticket: SCRUM-48 (https://abhinava32.atlassian.net/browse/SCRUM-48)
What: Free tool — BNSS investigation timeline tracker (custody + chargesheet deadlines)
Status: Done (auto-closed via 2026-05-10 sweep delta — code shipped at apps/drafting/src/services/timeline.service.ts; page at apps/web/src/app/tools/timeline-tracker/page.tsx; tests at apps/drafting/src/__tests__/timeline.test.ts. Vishal's 2026-05-09 sweep confirmed.)

## TASK 1 - 27 APR 2026
TICKET: SCRUM-49
What: AWS Setup for t2.micro free version for dev phase. so that demo can be given before going prod live
Status: Done
Picked up on: 2026-04-27
Picked up by: Vishal-Opus
Completed on: 2026-04-27 

## TASK FROM Ajay (CLO) — 28 Apr 2026
Agent: Ajay · CLO
Task for Vishal: Apply CLO notes patch to section mappings database
Priority: High
Ticket ref: SCRUM-27
Figma link: N/A
Copy/brief: N/A
Deadline: Before SCRUM-27 moves to Done

Instructions:
1. Read /docs/clo_notes_patch.csv
2. For rows with action=UPDATE_NOTE → update the notes field matching on oldCode+oldSection
3. For the IEA 32 row (action=UPDATE_NOTE + FIX_MAPPING) → also change newSection from "26" to "32" and newTitle to "Cases in which statement of relevant fact by person who is dead or cannot be found etc. is relevant"
4. For IPC 416 (action=NEW_ROW) → insert new document with all standard fields
5. After all applied → bulk update validatedBy from "Pending CLO review" to "Ajay - CLO" and set validatedAt to current timestamp on ALL 686 rows
6. Unit tests: query IEA 32 returns BSA 32 (not 26), query IPC 416 returns BNS 319

Status: Done
Picked up on: 2026-04-28
Picked up by: Vishal-Opus
Completed on: 2026-04-28

# Lawie — inputToDev.md

## TASK 1 — DONE ✅
Ticket: SCRUM-27
What: BNS/BNSS/BSA section mapping JSON
Status: DONE — Ajay validated

## TASK 2 — 28 Apr 2026
Ticket: SCRUM-43 (https://abhinava32.atlassian.net/browse/SCRUM-43)
What: Config-driven template engine — form, prompts, formatting, validation all from JSON config
Status: Done
Picked up on: 2026-04-29
Picked up by: Vishal-Opus
Completed on: 2026-05-06

## TASK 3 — 28 Apr 2026
Ticket: SCRUM-50 (https://abhinava32.atlassian.net/browse/SCRUM-50)
What: Indian courts database + cascading dropdowns + court-specific formatting rules
Status: Done (auto-closed via 2026-05-08 sweep — court rules wired, 12/12 CLO-validated round-4 at /scripts/test-templates/results/20260506-133018 + /20260506-133324)

## TASK 4 — 28 Apr 2026
Ticket: SCRUM-44 (https://abhinava32.atlassian.net/browse/SCRUM-44)
What: Guided form (cards + dropdowns) + rich text editor + PDF/DOCX export. Read Priya's comment for form UX details.
Status: Done (auto-closed via 2026-05-08 sweep — superseded by scrum-44-editor-export-activation entry below, completed 2026-05-06 Vishal-Opus, 376 tests pass)

## TASK 5 — 28 Apr 2026
Ticket: SCRUM-51 (https://abhinava32.atlassian.net/browse/SCRUM-51)
What: Hindi + bilingual document generation and export
Status: Partial — metadata only; full pipeline pending (corrected via 2026-05-10 sweep delta — Vishal's audit found `supported_languages` field plumbed through court rules + template-engine, but actual Hindi pipeline NOT built).
Details — what's left:
  - Translate prompt context per language (`prompt_context_hi` field per template)
  - Anthropic prompt language flag wired in ai.service.ts
  - Devanagari font in PDF export pipeline (pdf-export.service.ts)
  - UI language toggle in editor / new-document form
Reviewer: Arjun (CTO) on font + prompt path, Ajay (CLO) on Hindi legal phrasing.
Stays In Progress — do NOT close until full Hindi draft lands end-to-end.

## TASK 6 — 28 Apr 2026
Ticket: SCRUM-46 (https://abhinava32.atlassian.net/browse/SCRUM-46)
What: Free tool — IPC↔BNS / CrPC↔BNSS / IEA↔BSA section converter
Status: Done
Completed on: 2026-05-06

## TASK 7 — 28 Apr 2026
Ticket: SCRUM-47 (https://abhinava32.atlassian.net/browse/SCRUM-47)
What: Free tool — bail eligibility checker
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06

## TASK 8 — 28 Apr 2026
Ticket: SCRUM-48 (https://abhinava32.atlassian.net/browse/SCRUM-48)
What: Free tool — BNSS investigation timeline tracker
Status: Done (auto-closed via 2026-05-10 sweep delta — code shipped at apps/drafting/src/services/timeline.service.ts. Duplicate entry of TASK 6 — 26 Apr 2026 above.)

## TASK FROM Ajay (CLO) — 2 May 2026
Agent: Ajay · CLO
Task for Vishal: Rework SCRUM-50 court rules — schema mismatch + missing fields (CLO review failed)
Priority: P0
Ticket ref: SCRUM-50
Figma link: N/A
Copy/brief: See full CLO review comment posted on SCRUM-50 (2 May 2026)
Deadline: Before SCRUM-50 moves to Done (blocks SCRUM-43 and SCRUM-44 drafting flow)

Instructions:

1. **REWRITE SCHEMA of all 11 court-rule JSON files** in /apps/drafting/src/config/court-rules/
   Required fields per JIRA AC (currently MISSING from every file):
   - cause_title_format       (string template, e.g. "IN THE HIGH COURT OF JUDICATURE AT PATNA\n{caseNomenclature}\nIN THE MATTER OF:\n{petitioner} ... PETITIONER\nVERSUS\n{respondent} ... RESPONDENT")
   - party_designation        (object: { petitioner, respondent, applicant, plaintiff, defendant, complainant, accused } — court-specific labels)
   - case_nomenclature        (object keyed by document type, e.g. { anticipatory_bail: "Cr. Misc. No. _____ of {year}", quashing: "CRL.M.C. _____ of {year}", civil_writ: "W.P.(C) _____ of {year}" })
   - para_numbering           (object: { style: "numeric"|"roman"|"alpha", startAt: 1, format: "1.", indentLevel: 0 })
   - prayer_language          (object: { opening, closing, tone: "humble"|"assertive"|"neutral" } — varies criminal vs civil)
   - verification_format      (string template per Order VI Rule 15 CPC, with placeholders for deponent, date, place)
   - supported_languages      (array, e.g. ["en", "hi"])

   KEEP the existing fields (jurisdictionNote, localRules) — they're useful as auxiliary context but they DO NOT replace the seven required fields above.

2. **FIX wrong rule reference** in indian-courts.json
   - bihar_civil_patna currently → "bihar_district"
   - Change to → "district_court_generic"

3. **CREATE cjm_generic.json** (CJM jurisdiction is S.16 BNSS, materially different from district court)
   - Update bihar_cjm_patna, jharkhand_cjm_ranchi, up_cjm_lucknow to reference cjm_generic instead of *_district

4. **EXPAND Delhi HC case_nomenclature** to include:
   - Bail Appln. No. (anticipatory/regular bail)
   - CRL.M.C. (quashing u/s 528 BNSS)
   - W.P.(CRL) (criminal writ)
   - W.P.(C)   (civil writ)
   - CS(OS)    (commercial original side suit)

5. **FIX Bihar State respondent template** — replace blank "Department of ____" with actual default:
   "State of Bihar through the Principal Secretary, Home Department, Government of Bihar, Patna"

6. **ENCODE Allahabad Lucknow Bench territorial jurisdiction** in allahabad_hc.json
   Add field: lucknowBenchDistricts: [list of 12 districts per Notification dated 1.7.1949 / UP Reorganisation]

7. **STANDARDISE causeListFormat placeholders** — pick ONE of {city} or {district} across HC, district, generic files. No mixing.

8. **ADD e-filing flag** to patna_hc.json, jharkhand_hc.json, allahabad_hc.json
   eFilingMandatory: true (all 3 HCs are mandatory e-filing as of 2024-25)

9. **REMOVE displayName field** from all rule files — already present in indian-courts.json as `name`. Single source of truth.

10. **Tests required**:
    - Unit test: every court entry's formattingRulesRef resolves to an existing rule file
    - Unit test: every rule file has all 7 required fields (assertion)
    - Unit test: case_nomenclature lookup by document type returns non-empty string
    - Snapshot test: AI prompt template merges court rule + form data without leaving placeholder tokens unfilled

11. **After fix**, ping Ajay (CLO) for re-validation. Do not move SCRUM-50 to Done without CLO sign-off.

Status: Done (auto-closed via 2026-05-08 sweep — CLO Round-4 re-validation passed at /scripts/test-templates/results/20260506-133018 + /20260506-133324)
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Notes: All 11 items audited — items 1-9 already implemented in prior sessions. Item 10 (tests) completed: 140 tests in court-rules.test.ts covering formattingRulesRef resolution, 7 required fields, case_nomenclature lookup, placeholder merge, consistency checks. Fixed consumer_commission_generic.json (added state party_designation, prayer closing, corrected tone). 357/357 drafting tests pass. CLO sign-off received 2026-05-06 (Round 4).

## TASK FROM AJAY + PRIYA — 4 MAY 2026
Agent: Ajay · CLO + Priya · PM
Task for Vishal: Fix CLO-flagged drafting issues — 5 tickets in priority order
Ticket refs: SCRUM-52, 53, 54, 55, 56
Priority: Highest (P0 first)
Deadline: 3-4 days total
Status: Done
Picked up on: 2026-05-04
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Notes: All 5 tickets resolved through CLO Rounds 2-4. 12/12 smoke tests pass (Bihar + Jharkhand). CLO approved.

## TASK FROM Ajay (CLO) — 4 MAY 2026 (Round 2 — post smoke-test review)
Agent: Ajay · CLO
Task for Vishal: Round-2 fixes after end-to-end document generation smoke test
Priority: Mixed (P0 / P1 below)
Ticket refs: SCRUM-43, SCRUM-50 (still open until court rules wired)
Figma link: N/A
Copy/brief: Full review at /scripts/test-templates/results/20260504-014928/ (compare against /20260504-004605/ for delta)
Deadline: Before MVP demo can be shown to advocates
Status: Done
Picked up on: 2026-05-04
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Validated by: Ajay (CLO) — re-tested at /scripts/test-templates/results/20260506-122008
Result: 6/6 production-ready. Court rules now correctly applied (designation,
case nomenclature, party labels, state respondent, prayer, verification all
match court-rule JSON). Done event restored. Latency back to 8-20s. Truncation
fixed. Pecuniary jurisdiction corrected to Rs. 50 lakh.

Background:
Smoke test run on 4 May 2026 against all 6 templates (bail_regular, bail_anticipatory,
legal_notice_s80, legal_notice_s138, rent_agreement, consumer_complaint) using Bihar/Patna
payloads. Compared to round-1 run (20260504-004605):

✅ FIXED in this round (good work):
- All 3 filing-killer hallucinations resolved (Samsung→ElectroMart, false bailability,
  invented charge sheet)
- BNS bailable/non-bailable lookup is now correct — bail_regular para 9 reads
  "Section 303 BNS classified as non-bailable, Section 351 BNS classified as bailable"
  exactly the kind of factual grounding we wanted
- Placeholder leak fixed (legal_notice_s80 now uses real address)
- "State of bihar" lowercase bug fixed
- Invented 18% interest rate in rent_agreement removed
- Verification reads "paragraphs 1 to 10" instead of "paragraphs 1 to _____"

❌ STILL BROKEN — fix in this task:

Instructions:

1. **P0 — WIRE SCRUM-50 COURT RULES INTO GENERATION ENGINE** (third time flagged)
   The 7-field schema we built into /apps/drafting/src/config/court-rules/*.json is still
   not being read by the prompt builder or template renderer. Evidence from this run:
   - bail_anticipatory cause nomenclature shows "Anticipatory Bail Application No.____"
     → patna_hc.json says case_nomenclature.anticipatory_bail = "Cr. Misc. No. _____ of {year}"
   - Court designation shows "IN THE COURT OF High Court of Judicature at Patna\nAT Patna"
     → patna_hc.json designation field = "IN THE HIGH COURT OF JUDICATURE AT PATNA"
   - Party labels show "Petitioner / Accused" / "Respondent / State"
     → bihar_district.json party_designation = { petitioner: "Applicant", respondent: "Opposite Party" }
     → patna_hc.json party_designation = { petitioner: "Petitioner", respondent: "Respondent" }
   - State respondent shows "State of Bihar Through Public Prosecutor"
     → patna_hc.json party_designation.state = "State of Bihar through the Principal Secretary,
       Home Department, Government of Bihar, Patna"
   - Prayer opening shows "In view of facts and circumstances..."
     → patna_hc.json prayer_language.opening = "It is, therefore, most humbly prayed..."
   - Verification still uses generic format, not patna_hc.json verification_format

   What to implement (drafting-service):
   a. In prompt builder, given form_data.court_name → resolve to courts[].courtId in
      indian-courts.json → load referenced court-rule JSON via formattingRulesRef
   b. Pass loaded court rule into the template renderer for cause_title, party labels,
      case_nomenclature, prayer, verification (replace the generic literals currently
      hardcoded)
   c. Inject court rule's localRules array into the AI system prompt as guardrails
      (e.g. "Follow these jurisdiction-specific rules: ...")
   d. Update unit tests (SCRUM-50 acceptance) to assert the court rule is actually
      reflected in the rendered output

2. **P0 — CONSUMER COMPLAINT TRUNCATION**
   The 06-consumer_complaint.response.json from /20260504-014928 cuts off
   mid paragraph 12 of body. No template_sections, no checklist, no done event.
   266s elapsed → looks like cURL --max-time 120 hit AND/OR drafting-service streaming
   stalled. Diagnose:
   - Is max_tokens too low for consumer_complaint specifically (it has the most
     mandatory clauses — 10)?
   - Is there a per-paragraph delay in the streaming path?
   - Is the SSE flush happening per-token or buffered?
   Fix and add a test that consumer_complaint completes within 60s.

3. **P0 — RESTORE `done` event on ALL templates**
   In round-1 run, responses 01, 02, 06 ended with:
     event: done
     data: {"complete":true,"docId":"...","sectionsCited":[...],"mandatoryClausesComplete":true}
   In round-2 run, ZERO responses have this event. We lost section validation
   tagging and the audit trail (docId returned to client). Restore the done event
   on every successful generation.

4. **P1 — CONSUMER COMPLAINT outdated pecuniary jurisdiction**
   Body para 9 still says "District Commission up to Rs. 1 Crore".
   After CPA (Jurisdiction Notification) 21 December 2021, District Commission
   pecuniary limit is **Rs. 50 lakh** (State 50L–2cr, National above 2cr).
   Fix in consumer_complaint.json promptInstructions — hard-code the correct
   current limit, do not let AI infer.

5. **P1 — Cause-title duplication ("IN THE COURT OF Court of Sessions Judge, Patna")**
   Template still concatenates "IN THE COURT OF" prefix with the user-input
   court_name (which already starts with "Court of"). Fix: derive designation
   from courts[].designation field in indian-courts.json, not from free-text input.

6. **P1 — Investigate 7× latency regression**
   Round-1 fast templates: 16-18 seconds.
   Round-2 same templates: 120+ seconds (hit cURL timeout even though responses
   completed for most). Likely culprits:
   - New internal-secret + x-user-* headers slowing gateway → drafting hop
   - Streaming buffer change
   - Anthropic SDK timeout/retry config
   Profile and report. Target: < 30s p95 per template.

7. **P2 — Verify rent_agreement markdown bold renders correctly in DOCX/PDF export**
   AI now uses **bold** clause headers ("**GRANT OF TENANCY**:", etc.). Looks
   great in markdown but check the export pipeline doesn't render literal asterisks.

8. **TESTS REQUIRED**
   - Snapshot tests for all 6 templates that the rendered output contains the
     court-rule fields (party labels, case nomenclature, prayer opening)
   - Latency assertion: each template completes in < 60s
   - Schema test: every successful response has the done event with sectionsCited

9. **After fix**, re-run /scripts/test-templates/run-all.sh and ping Ajay (CLO)
   with the new results folder for re-validation. Do not move SCRUM-43 or SCRUM-50
   to Done without CLO sign-off.

## TASK FROM Ajay (CLO) — 6 MAY 2026 (Round 3 — polish before advocate review)
Agent: Ajay · CLO
Task for Vishal: Final polish + Jharkhand smoke-test expansion
Priority: P2 (polish) + P1 (Jharkhand expansion)
Ticket refs: SCRUM-43 (polish follow-up), SCRUM-50 (Jharkhand validation), new SCRUM ticket needed for Jharkhand lawyer review pipeline
Figma link: N/A
Copy/brief: Round-3 review at /scripts/test-templates/results/20260506-122008/ — 6/6 templates production-ready, only polish items remain.
Deadline: Before sharing demo with Jharkhand advocates (target: end of week)
Status: Done

Background:
Round-3 smoke test (Bihar/Patna payloads) shows 6/6 templates production-ready.
Court rules wired in correctly, done event restored, latency back to 8-20s.
The 4 items below are non-blocking polish — they don't stop the demo, but they
do block the persistence/audit trail and a couple of legal-citation niceties.
Plus a new ask: founder lives in Jharkhand and wants Jharkhand-advocate sign-off
before going to first paid users. Need to extend the smoke test to Jharkhand.

Instructions:

1. **P2 — `docId` is null on all 6 responses (drafts not persisted to DB)**
   The `done` event currently emits: `{"complete":true,"docId":null,"sectionsCited":[...],"mandatoryClausesComplete":true}`
   This breaks:
   - Audit trail (no record that the draft was generated)
   - Free-tier counting (Generation model in MongoDB never gets a row → user can
     bypass the 5 docs/month limit by simply ignoring saved state on frontend)
   - Any "open my recent drafts" feature later
   Fix: in drafting-service generate-from-template handler, after streaming
   completes, call `Document.create({ userId, templateId, formData, generatedContent,
   sectionsCited, courtRuleRef, ... })` and emit the resulting `_id` as `docId`.
   Do this BEFORE emitting the done event.

2. **P2 — `sectionsCited` is empty for non-bail templates**
   Currently:
   - bail_regular emits `["BNSS 480"]` ✓
   - bail_anticipatory emits `["BNSS 482"]` ✓
   - legal_notice_s138 emits `[]` — should be `["NI Act 138"]` (and `["NI Act 142"]`
     once we fix point 3 below)
   - consumer_complaint emits `[]` — should be `["CPA 35", "CPA 2(7)", "CPA 2(11)",
     "CPA 2(10)", "CPA 2(47)", "CPA 34", "CPA 69"]`
   - legal_notice_s80 emits `[]` — should be `["CPC 80"]`
   - rent_agreement emits `[]` — should be `["TPA 105", "TPA 106", "Reg Act 17"]`
     (only if the body actually cites them)
   The section validator currently only scans for "BNSS XXX" / "BNS XXX" patterns.
   Extend it to read each template's `relevantActs[].act` field and scan for
   sections from that act using regex like `/Section (\d+(?:\(\d+\))?) of the
   {actName}/i`. Then emit them with the correct prefix.

3. **P2 — `legal_notice_s138` header references S.141 instead of S.142 for
   individual drawer**
   Current header: `"LEGAL NOTICE (Under Section 138 read with Section 141 of the
   Negotiable Instruments Act, 1881)"`
   Section 141 NI Act = "Offences by companies" — only applies when the drawer is
   a company, partnership, or HUF.
   Section 142 NI Act = "Cognizance of offences" — the procedural section relevant
   to ALL S.138 cases.
   Fix in legal_notice_s138.json: make the header dynamic based on whether the
   drawer is an individual or entity. For individual (default), reference S.142.
   For entity (detect via `respondent_type: "company" | "partnership"`), reference
   both S.141 and S.142.

4. **P2 — Cause title has redundant "AT Patna" line**
   Current rendered output:
       IN THE COURT OF DISTRICT & SESSIONS JUDGE
       AT Patna
       Criminal Miscellaneous Case No. _____ of 2026
   The "AT Patna" line is added by the template renderer separately from the
   designation. But for `bihar_sessions_patna`, the designation in indian-courts.json
   is already `"IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA"` (with PATNA
   appended). The renderer should pick ONE source of truth — either:
   (a) Use the courts[].designation field as-is and skip the separate "AT {city}"
       line, OR
   (b) Use the court-rule's stripped designation (without city) and append
       "AT {city}" cleanly.
   Option (a) is simpler. Recommended.

5. **P1 — JHARKHAND SMOKE-TEST EXPANSION** (NEW)
   Founder lives in Jharkhand and wants Jharkhand-advocate sign-off before
   going to first paid users (per Phase 1 plan: 25 paying users in 90 days).
   Currently all 6 smoke-test payloads use Bihar/Patna courts. We need a parallel
   Jharkhand set so the same templates can be reviewed by Jharkhand advocates.

   What to do:
   a. Create a parallel payload set in /scripts/test-templates/payloads-jharkhand/:
      - 01-bail_regular.json     → court_name: "jharkhand_sessions_ranchi"
      - 02-bail_anticipatory.json → court_name: "jharkhand_hc"
      - 03-legal_notice_s80.json → respondent: Jharkhand State PWD or similar
      - 04-legal_notice_s138.json → Ranchi-based parties
      - 05-rent_agreement.json   → Ranchi flat
      - 06-consumer_complaint.json → court_name: "jharkhand_district_ranchi" (add
        a District Consumer Commission Ranchi entry to indian-courts.json if not
        present — currently only Bihar consumer commission is implied)
   b. Update run-all.sh to accept a PAYLOAD_DIR override:
        PAYLOAD_DIR=./payloads-jharkhand bash run-all.sh
      OR add a `--state jharkhand` flag.
   c. Run both sets, generate parallel results folders.
   d. Once both sets pass CLO review (Ajay), bundle the 12 PDFs and send to
      2-3 Jharkhand advocates for real-world legal review (Founder will arrange
      via local bar association contacts in Ranchi).

   This is the gate for moving to first paid user. No advocate sign-off → no launch.

6. **TESTS REQUIRED**
   - Persistence test: after generation, query Document collection by docId,
     confirm content + sectionsCited + courtRuleRef are saved correctly
   - Section-citation test: snapshot test for legal_notice_s138 sectionsCited =
     ["NI Act 138", "NI Act 142"]; consumer_complaint sectionsCited contains
     "CPA 35"
   - Jharkhand smoke-test: same 6 templates against Jharkhand court IDs, all
     return 200 with court rules correctly applied (jharkhand_hc / jharkhand_district)

7. **After fix + Jharkhand expansion**, run BOTH payload sets and ping Ajay (CLO)
   with both results folders. Once Ajay signs off on the Jharkhand drafts, founder
   takes over for advocate-panel review (out of scope for this ticket).

## TASK FROM Ajay (CLO) — 6 MAY 2026 (Round 4 — post Bihar+Jharkhand dual-run review)
Agent: Ajay · CLO
Task for Vishal: Final cleanup before Jharkhand advocate-panel review
Priority: P0 (consumer_complaint blockers) + P1 (persistence + section-validator gaps)
Ticket refs: SCRUM-43 (drafting engine), need new SCRUM ticket for consumer-commission entries
Figma link: N/A
Copy/brief:
  Bihar run:     /scripts/test-templates/results/20260506-125259/
  Jharkhand run: /scripts/test-templates/results/20260506-125524/
Deadline: Before consumer_complaint goes into Jharkhand advocate panel pack
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Validated by: Ajay (CLO) — re-tested at:
  Bihar:     /scripts/test-templates/results/20260506-133018/
  Jharkhand: /scripts/test-templates/results/20260506-133324/

Validation Result: 12/12 production-ready (6 Bihar + 6 Jharkhand). All P0s and
P1s closed.
- Cause-title courtId leak: FIXED — now renders "AT Patna" / "AT Ranchi"
- Body identity preservation: FIXED — body para 1 reads complainant name,
  father, age, address verbatim from form_data, no invention
- docId: populated for ALL 6 templates in BOTH runs (shared persistDraft middleware)
- sectionsCited: clean across all 6 — NI Act 138/142, CPA 35/2(7)/2(11)/2(47)/69,
  CPC 80, BNSS 480/482; no spurious BNS mis-tags
- Latency: 8-22s range, healthy
- All HTTP 200

CLO Verdict: APPROVED for Jharkhand advocate-panel review pack.

Background:
Round-4 review covers BOTH Bihar and Jharkhand smoke-test runs.

Bihar:    5/6 production-ready (3 with internal persistence gaps)
Jharkhand: 4/6 production-ready (2 with material bugs in consumer_complaint)

✅ FIXED in this round (good):
- docId now populated for bail_regular, bail_anticipatory, consumer_complaint (3/6)
- sectionsCited populated for all 6 templates (was empty for 4)
- legal_notice_s138 correctly references S.142 (not S.141) — clean fix
- Cause-title "AT Patna" redundancy removed — single line "IN THE COURT OF
  DISTRICT & SESSIONS JUDGE, PATNA"
- Jharkhand court rules wire up identically to Bihar — designation, party labels,
  state respondent, prayer, verification all read correctly from jharkhand_hc.json
  and jharkhand_district.json. No per-state code paths needed. ✅

❌ STILL OPEN — fix in this task:

Instructions:

1. **P0 — CONSUMER COMPLAINT JHARKHAND: cause title leaks raw courtId as city**
   Current rendered cause title:
       BEFORE THE DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION
       AT jharkhand_district_ranchi          ← raw courtId, not human-readable
       Consumer Complaint No. _____ of 2026

   Root cause: indian-courts.json has NO entry for District Consumer Commission
   (Bihar or Jharkhand). When the renderer tries to resolve `court_name` →
   `courts[].city`, it doesn't find a match and falls back to printing the
   courtId literal.

   Fix:
   a. Add entries to indian-courts.json (both states):
      - patna_dccdrc        → "District Consumer Disputes Redressal Commission, Patna"
                              city: "Patna", courtType: needs new "consumer_commission"
                              type, formattingRulesRef: needs new
                              "consumer_commission_generic" rule file
      - ranchi_dccdrc       → "District Consumer Disputes Redressal Commission, Ranchi"
      Add for the other Phase-1 state capitals too where convenient (Delhi,
      Lucknow) so the consumer template is portable.
   b. Add new court_type entry: { id: "consumer_commission", label:
      "District Consumer Commission" }
   c. Add new rule file: /apps/drafting/src/config/court-rules/consumer_commission_generic.json
      with the 7-field schema. Designation = "BEFORE THE DISTRICT CONSUMER
      DISPUTES REDRESSAL COMMISSION", party_designation = { complainant:
      "Complainant", opposite_party: "Opposite Party" }, case_nomenclature =
      { consumer_complaint: "Consumer Complaint No. _____ of {year}" }, etc.
   d. Renderer guard: if city resolution fails, fall back to the state's capital
      from indian-courts.json (NEVER print the raw courtId).

2. **P0 — CONSUMER COMPLAINT JHARKHAND: body invents party identity**
   Current Jharkhand consumer_complaint output:
   - Cause title: "Mr. Manoj Kumar Tirkey, S/o Shri Laxman Tirkey, age 35, R/o
     Quarter B-12, HEC Township, Dhurwa, Ranchi"
   - Body para 1: "Mr. Manoj Kumar Tirkey, son of Late Shri Birsa Tirkey, aged
     34 years, resident of Flat No. 301, Sunrise Apartments, Lalpur, Ranchi"

   Body has DIFFERENT father name, DIFFERENT age, DIFFERENT address than the
   cause title. AI is inventing fresh party identity in body context.

   This is a filing-killer — cause title and body MUST show identical party
   identification. A Jharkhand advocate will spot this in 5 seconds and lose
   confidence in the entire system.

   Bihar run did NOT have this bug — only Jharkhand. So either:
   - The Jharkhand consumer_complaint payload is missing some fields the AI
     prompt expects, causing it to fabricate, OR
   - The prompt's body-context block isn't getting the same form_data the
     cause-title renderer gets.

   Fix:
   a. Audit the AI prompt for consumer_complaint — confirm it injects
      applicant_name, father_name, applicant_age, address EXPLICITLY in the
      body-context block (not just cause-title).
   b. Add an anti-hallucination rule to the prompt: "When referring to the
      complainant in the body, use ONLY the applicant_name, father_name, age,
      and address from the form_data. Do not invent or substitute any party
      identity details."
   c. Add a post-generation validation: cross-check that applicant_name from
      form_data appears unchanged in body para 1, and that father_name (if
      present) matches.

3. **P1 — `docId` still null for 3 templates**
   Bihar + Jharkhand both show:
   - bail_regular        → docId populated ✅
   - bail_anticipatory   → docId populated ✅
   - consumer_complaint  → docId populated ✅
   - legal_notice_s80    → docId NULL ❌
   - legal_notice_s138   → docId NULL ❌
   - rent_agreement      → docId NULL ❌

   The Document.create() persistence call has been wired into the bail and
   complaint handler paths, but not into the notice and agreement handlers.
   Same fix needs to be applied to all template handler routes uniformly.

   Recommend: refactor — pull persistence into a shared `persistDraft(...)`
   middleware/util that fires AFTER streaming completes for any template.
   That way new templates added later automatically get persistence.

4. **P1 — sectionsCited validator mis-tagging**
   Current outputs (both runs):
   - legal_notice_s138: ["BNS 138", "NI Act 142", "NI Act 138"]
     "BNS 138" is WRONG — BNS 138 = "Wrongful confinement of person for whom
     writ has been issued", nothing to do with cheque bounce. Validator picked
     up "Section 138" and stamped both BNS and NI Act prefixes.
     Expected: ["NI Act 138", "NI Act 142"]
   - consumer_complaint: ["CPA 35", "CPA 2(7)", "CPA 2(11)", "BNS 2(10)",
     "CPA 2(47)", "CPA 69"]
     "BNS 2(10)" is WRONG — should be "CPA 2(10)". Same issue: validator
     defaults to BNS when section number is ambiguous.
     Expected: ["CPA 35", "CPA 2(7)", "CPA 2(10)", "CPA 2(11)", "CPA 2(47)",
     "CPA 34", "CPA 69"]
   - rent_agreement Jharkhand: ["BNS 107"]
     False positive. Body cites TPA Section 105/106/107 (Leases). Validator
     picked up "Section 107" and tagged BNS.
     Expected: ["TPA 105", "TPA 106", "TPA 107", "Reg Act 17"] (or empty if
     body doesn't actually reference these acts)

   Fix: validator must be context-aware. Logic:
   - For each template, read its `relevantActs[].act` field
   - For each act in relevantActs, scan body for "Section N of [act regex]"
   - Only tag with BNS prefix if BNS is actually in the template's relevantActs
   - Never default to BNS as fallback

5. **P2 — rent_agreement still has docId null per point 3**
   Same root cause as legal notices — covered by point 3's shared persistence
   middleware fix.

6. **TESTS REQUIRED**
   - Snapshot test: legal_notice_s138 sectionsCited === ["NI Act 138", "NI Act 142"]
   - Snapshot test: consumer_complaint sectionsCited contains "CPA 2(10)" and
     does NOT contain "BNS 2(10)"
   - Snapshot test: rent_agreement sectionsCited does NOT contain any "BNS *"
   - Persistence test: all 6 templates return non-null docId, and each docId
     resolves to a Document row in MongoDB
   - Identity-preservation test for consumer_complaint: applicant_name AND
     father_name from form_data appear verbatim in body para 1
   - Cause-title fallback test: when court_name has no matching courts[] entry,
     the renderer prints the resolved city (or state capital fallback), NEVER
     the raw courtId

7. **SCOPE NOTE — Jharkhand advocate panel pack**
   Once items 1-4 are fixed:
   - Re-run both Bihar and Jharkhand smoke tests
   - Generate PDFs from each .draft.md (use the export pipeline)
   - Bundle 12 PDFs (6 Bihar + 6 Jharkhand) into a single review pack
   - Founder will share with 2-3 Jharkhand advocates via Ranchi bar association
   - DO NOT ship to advocates with the consumer_complaint Jharkhand bug — that
     single error will discredit the entire pack

8. **Provisional approval (CLO sign-off):**
   - Bihar pack: 5/6 templates (excluding open docId/sectionsCited internal
     gaps which aren't visible in rendered draft) — APPROVED for advocate review
   - Jharkhand pack: 5/6 templates (excluding consumer_complaint) — APPROVED
   - Once items 1+2 fixed and re-tested, Jharkhand consumer_complaint joins the pack

9. **After fix**, ping Ajay (CLO) with new results folders for re-validation.

---
ID: cli-export-advocate-pack
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Jira: SCRUM-57
Figma: N/A
Priority: P0 (URGENT — 4-6 hr)
Task: CLI export script — convert smoke-test SSE results → 12 advocate-review PDFs
Details: |
  PROBLEM:
  Smoke tests at /scripts/test-templates/results/20260506-133018/ (Bihar) and
  /20260506-133324/ (Jharkhand) produce SSE-stream `.response.json` files only.
  `.draft.md` files are empty. exportUtils.ts is browser-only. We have no way
  to hand an advocate a PDF today. This is the gating bug for the Jharkhand
  advocate-panel review pack.

  SCOPE:
  Build a Node CLI `scripts/export-pdf.ts` (or similar) that:
    1. Reads a `.response.json` (SSE event log).
    2. Parses `data: {"text":"..."}` chunks and concatenates into the full draft markdown.
    3. Prepends cause-title block (rendered from done event's metadata if present).
    4. Appends filing checklist + the standard AI-disclaimer footer:
       "AI-assisted draft — verify with applicable law before filing.
        Lawie does not provide legal advice."
    5. Renders to PDF via puppeteer (preferred — handles markdown + bold/italics
       consistently) OR `markdown-pdf`. Server-side, no browser.
    6. A4, court-standard margins (1.5" left, 1" others), Times New Roman 12pt
       double-spaced.
    7. Free-tier watermark NOT applied for advocate pack (use a clean export flag).

  INPUT:  directory of `.response.json` files OR a single file.
  OUTPUT: matching `.pdf` per template.

  Run BOTH result folders → 12 PDFs total. Place output at
  `/scripts/test-templates/results/<run>/pdfs/`.

  ACCEPTANCE:
  - 12 PDFs land cleanly.
  - Each cover-readable: cause title at top, body paragraphs flow, prayer
    block intact, verification at bottom, AI-disclaimer footer on last page.

  TEST:
  - 1 unit test (markdown→PDF)
  - 1 integration test (run against bail_regular result, output PDF byte-size > 5KB)

  SIZE: 4-6 hours.
  DEADLINE: by EOD 2026-05-07 — Ajay needs the PDFs Friday for Ranchi pack assembly.
Dependencies: SCRUM-43 (done), SCRUM-50 (done with CLO sign-off), smoke-test results folders (exist)
---

---
ID: helicone-integration
Filed by: Priya · PM (founder approved 2026-05-06; CTO Arjun architected)
Filed on: 2026-05-06
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Jira: SCRUM-58
Figma: N/A
Priority: P1
Task: Wire Anthropic API through Helicone proxy — add cost observability + per-user spend caps
Details: |
  WHY:
  Zero per-user LLM spend visibility today. Founder-approved thresholds:
  ₹2,000/day total cap, ₹500/day per user.

  SCOPE:
    1. Sign up Helicone free tier (account: founder; pass key to AWS Secrets
       Manager as HELICONE_API_KEY).
    2. In drafting-service Anthropic client, change baseURL:
         `https://api.anthropic.com` → `https://anthropic.helicone.ai`
       Add header: `Helicone-Auth: Bearer ${HELICONE_API_KEY}`
    3. Add user-attribution header on every call:
         `Helicone-User-Id: ${userId}`
    4. Add `Helicone-Property-Template: ${templateId}` so we can filter cost
       by template type (bail vs notice vs rent etc).
    5. Add caching: `Helicone-Cache-Enabled: true` for system-prompt portions
       where safe (NOT user-specific drafts).
    6. Implement spend-cap middleware: query Helicone API daily at midnight UTC,
       if a user has crossed ₹500/day or total ₹2,000/day, return 429 with
       friendly error. (Phase 1 is permissive — just LOG the breach + slack-style
       alert in Notion Cost Ledger; hard-block in Phase 2.)
    7. Add a cost field to Generation model: `costUsd: Number` populated from
       Helicone response header.

  ACCEPTANCE:
  - Any draft generation visible in Helicone dashboard within 30s.
  - User-id and templateId filterable.
  - Generation rows in Mongo carry costUsd.

  TEST:
  - 1 unit (mocked Helicone response → costUsd persisted)
  - 1 integration (real call to Helicone test endpoint)

  SIZE: half-day.
Dependencies: SCRUM-23 (done — Anthropic integration baseline)
---

---
ID: scrum-44-editor-export-activation
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Completed on: 2026-05-06
Notes: Server-side PDF export (puppeteer), filing checklist persistence, activation telemetry, DOCX court-standard margins. Browser-tested: all API endpoints verified (GET/PATCH/export/pdf/export/docx), activation events fire correctly, 376 tests pass, tsc clean.
Jira: SCRUM-44
Figma: (existing SCRUM-44 mocks — Rajesh)
Priority: P0
Task: Rich text editor + PDF/DOCX export + filing checklist + watermark + activation telemetry
Details: |
  NOTE: Ticket `cli-export-advocate-pack` (above) is a STRICT PREREQUISITE that
  ships first to unblock the Jharkhand advocate-panel review pack. SCRUM-44 is
  the full UI-driven solution that supersedes the CLI hack for end users.

  SCOPE:
    1. Rich text editor (TipTap or Lexical — CTO to confirm) embedded in
       /dashboard/draft/[docId] route.
       - Pre-loaded with the AI-generated markdown converted to editor JSON.
       - Bold, italic, underline, headings (H1-H3), bullet/numbered lists,
         block quote, undo/redo, find/replace.
       - Auto-save every 10s to Document.generatedContent (PATCH /api/documents/:id).
    2. PDF export
       - Server-side render (puppeteer in drafting-service or dedicated
         export-service — Arjun to decide).
       - A4, court-standard margins (1.5" left, 1" others), Times New Roman 12pt
         double-spaced.
       - Cause-title block at top (from court rule), AI-disclaimer footer on
         last page.
       - Free-tier watermark: diagonal "DRAFT — Lawie Free Tier" 30% opacity
         across every page. Pro plan = clean export.
    3. DOCX export
       - Use `docx` npm package or pandoc.
       - Same formatting standards as PDF.
       - Editable headings/paragraphs (NOT one giant text block).
    4. Filing checklist panel (right rail of editor)
       - Per-template checklist sourced from template config JSON.
         e.g. bail_regular: ["Vakalatnama signed", "Court-fee stamp affixed",
         "FIR copy attached", "Bail bond ready", "Surety affidavit"].
       - Checkbox state persists per-document.
       - "Export PDF" CTA disabled until at least 1 item checked
         (soft nudge — not hard block).
    5. Activation telemetry
       - Fire `activation_first_export` event on first successful PDF export
         per user.
       - Write to Mongo `Event` collection: { userId, type, docId, ts }.
       - This is the north-star activation metric.
    6. Plan-gating
       - Free users: max 5 docs/month (already enforced) + watermark on export.
       - Pro: unlimited + clean export + DOCX.

  ACCEPTANCE:
  - Editor loads AI draft, edits save within 10s, no data loss on refresh.
  - PDF export downloads in <8s for any of the 6 templates.
  - DOCX export opens cleanly in MS Word + LibreOffice.
  - Filing checklist visible and persists.
  - Free-tier watermark visible on every page of free-tier PDF; absent on Pro.
  - `activation_first_export` event fires exactly once per user (idempotent).

  TEST:
  - Unit: markdown → editor JSON round-trip
  - Unit: watermark applied iff plan === 'free'
  - Integration: full flow — generate → edit → export PDF → event fires
  - Snapshot: PDF byte-size > 20KB and < 500KB for typical bail_regular draft

  SIZE: 4-5 days.
Dependencies: cli-export-advocate-pack (prerequisite — server-side PDF pipeline lands first), SCRUM-43 (done), SCRUM-50 (done)
---

---
ID: credit-free-tier-signup-login-rating
Filed by: Priya · PM (founder approved 2026-05-08 — credit model supersedes trial-cap-10-gated)
Filed on: 2026-05-06 (rewritten 2026-05-08)
Status: Pending
Jira: SCRUM-59
Figma: N/A — design delivered as HTML+PNG mock at /Users/abhinavanand/Files/Lawie/docs/designs/rate-output-card-2026-05-06.html
Design files:
  - HTML viewable mock: /Users/abhinavanand/Files/Lawie/docs/designs/rate-output-card-2026-05-06.html (open in browser for live mock)
  - PNG screenshot (all 5 states + dashboard counter): /Users/abhinavanand/Files/Lawie/docs/designs/rate-output-card-2026-05-06.png
  - Approved by founder 2026-05-06; component path: apps/web/src/components/draft/RateOutputCard.tsx
  - Note: dashboard counter copy must change from "X drafts left" to "X credits left" — Rajesh to refresh
Priority: P1
Task: Credit-based free tier + signup bonus + daily login + rating earn
Details: |
  WHY: Founder approved credit-based subscription model 2026-05-08. Free
  tier moves from a draft-count cap to a credit balance, where documents
  cost 1 credit (simple) or 2 credits (complex). This ticket implements
  the FREE TIER mechanics only — earning paths (signup, login, rating)
  and the credit-spend guard. Paid tiers, top-ups, and pricing page are
  in SCRUM-73 (master credit-system ticket).

  PREREQ: HELICONE caps must be live before this ships (per-user ₹500/day cap).
  Do NOT merge before helicone-integration ticket is in production.

  CREDIT ECONOMY (free tier):
    - Signup bonus: 10 credits (one-time, on account creation)
    - Daily login: 2 credits per day, capped at 30 credits/month
    - Output rating: 1 credit per rating, capped at 5 credits/month
    - Max first-month earn = 45 credits (10 signup + 30 login + 5 rating)
    - Max ongoing earn (months 2+) = 35 credits (30 login + 5 rating)

  DOCUMENT WEIGHTING (current 6 templates):
    - bail_regular = 2 credits (complex)
    - bail_anticipatory = 2 credits (complex)
    - consumer_complaint = 2 credits (complex)
    - legal_notice_s80 = 1 credit (simple)
    - legal_notice_s138 = 1 credit (simple)
    - rent_agreement = 1 credit (simple)

  SCOPE:
    1. User model: deprecate `freeTierMonthlyLimit`, `freeTierBaseLimit`,
       `freeTierEarnedLimit`, `freeTierEarnedUsed`. Add:
         - `creditsBalance: number` (default 10 on signup)
         - `creditsLifetimeEarned: number`
         - `creditsLifetimeSpent: number`
         - `loginBonusUsedThisMonth: number` (cap 30, reset 1st of month)
         - `ratingBonusUsedThisMonth: number` (cap 5, reset 1st of month)
         - `tier: 'free' | 'practice' | 'firm'` (default 'free')
       Existing monthly cron resets the two counters on the 1st.
    2. Signup bonus: on account creation, set `creditsBalance = 10`,
       increment `creditsLifetimeEarned` by 10, emit `credits.granted`
       event with `source: 'signup'`.
    3. Daily login bonus: on first authenticated request of each day for a
       free user, if `loginBonusUsedThisMonth + 2 <= 30`, grant 2 credits,
       increment counter, emit `credits.granted` with `source: 'login'`.
       Implement as auth middleware check using `lastLoginBonusAt` date.
    4. Drafting service guard: before generation, lookup
       `template.creditsCost` (1 or 2). If `user.creditsBalance < cost`,
       return HTTP 402 with body
       `{ error: 'insufficient_credits', balance, cost, cta: 'topup' }`.
       On success, decrement `creditsBalance` by cost, increment
       `creditsLifetimeSpent`, emit `credits.spent` event.
    5. After every successful draft for a free user, prompt the rate-output
       micro-UI: thumbs (👍/👎) + optional 1-line feedback. ESC = skip allowed
       but no credit awarded.
    6. Rating endpoint: `POST /api/documents/:id/rate` — body
       `{ thumbs: "up"|"down", feedback?: string }`. If user is free AND
       `ratingBonusUsedThisMonth < 5`, grant 1 credit, increment counter,
       emit `credits.granted` with `source: 'rating'`. Persist Rating
       model (userId, docId, thumbs, feedback, createdAt) regardless.
    7. Dashboard counter: replace "X drafts left this month" with
       "X credits — earn more" (free) or "X credits — N this month" (paid).
       Show breakdown on hover: signup/login/rating used vs available.
    8. Telemetry: emit `credits.granted` (sources: signup|login|rating),
       `credits.spent`, `draft.rated`. All events include userId, balance,
       delta, timestamp.
    9. Disposable email block at signup (mailinator, tempmail, etc) — minimal
       abuse mitigation per Meera. Still required.

  SCOPE OUT (in SCRUM-73): paid tier purchase, top-up packs, pricing page,
  Razorpay extensions, yearly billing.
  SCOPE OUT (separate tickets later): device fingerprint, IP rate limiting,
  referral gates, WhatsApp share gate (BCI Rule 36 risk).

  ACCEPTANCE:
  - New free user signs up → balance = 10, dashboard shows "10 credits"
  - Logs in next day → balance = 12 (login bonus applied once)
  - Logs in twice same day → balance still 12 (no double-grant)
  - Drafts a bail_regular (2 credits) → balance = 10
  - Drafts a legal_notice_s138 (1 credit) → balance = 9
  - Rates output → balance = 10 (rating credit awarded, capped 5/mo)
  - After 5 ratings in a month → 6th rating saved but no credit awarded
  - After 15 daily logins (30 credits) → 16th day no login bonus until month flips
  - Tries to draft bail when balance = 1 → HTTP 402 + "Insufficient credits — top up or upgrade"
  - Disposable email at signup → blocked with friendly error

  TEST: 70% coverage; integration tests for the full earn loop
  (draft → rate → unlock → next draft eats earned credit).

  SIZE: 2 days backend + 1 day frontend (rate modal needs Figma).
  DEADLINE: Ships AFTER Helicone is in prod. Earliest: 2026-05-12.
Dependencies: helicone-integration (must ship first), Rajesh Figma for rate modal, SCRUM-19 (dashboard) — done
---

## TASKS FROM PRIYA — 6 MAY 2026 (SCRUM-44 split + new fact↔section validator)

> Founder approved 2026-05-06 the SCRUM-44 split into 4 sub-tickets + 1 new P0
> (fact↔section validator). Source-of-truth audit reports:
> - team-warroom/2026-05-06/clo-pdf-audit-2026-05-06.md (Ajay)
> - team-warroom/2026-05-06/export-pipeline-bugs-2026-05-06.md (Vishal)
> - team-warroom/2026-05-06/sample-bail-jharkhand-hc.pdf (defective sample)

---
ID: scrum-44-1-export-pipeline-fixes
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done
Picked up on: 2026-05-07
Picked up by: Vishal-Sonnet
Completed on: 2026-05-07
Jira: SCRUM-60
Figma: N/A
Priority: P0
Task: Export script — markdown parser, watermark removal, CSS polish
Details: |
  COVERS Ajay's audit bugs A1, A3, A4, A5.
  Reviewer: Arjun (CTO).

  BUGS:
  - A1: markdown bold (**) not parsing — renders as raw `**text**`
  - A3: watermark "Free Tie" appearing diagonally; founder + CLO policy =
    NO watermark on ANY output (free or paid)
  - A4: literal `---` rendering as text instead of horizontal rule
  - A5: `*inter alia*` italic markers rendering as raw asterisks

  FILE POINTERS (per Vishal's investigation):
  - scripts/export-pdf.ts:103-110 (markdown handling)
  - scripts/export-pdf.ts:174 (watermark string)
  - scripts/export-pdf.ts:236-246 (watermark CSS)

  FIX APPROACH:
  - Replace hand-rolled markdown handling with `marked` library
  - Remove watermark generation entirely (no flag — gone permanently)

  ACCEPTANCE:
  - Zero `**` / `---` / raw asterisks in any rendered PDF
  - No diagonal watermark on any export (free or paid)
  - All 12 smoke-test PDFs re-rendered cleanly

  TESTS:
  - Snapshot of bail_anticipatory rendered output asserts no raw markdown tokens
  - Export script unit test asserts watermark CSS not in output

  SIZE: M (1-2 hr).
Dependencies: cli-export-advocate-pack (SCRUM-57) — Vishal must pick that up first; this fixes the script created by 57
---

---
ID: scrum-44-2-placeholder-substitution
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done
Picked up on: 2026-05-07
Picked up by: Vishal-Sonnet
Completed on: 2026-05-07
Jira: SCRUM-61
Figma: N/A
Priority: P0
Task: Template engine — recursive placeholder pass + court-rule audit
Details: |
  COVERS Ajay's audit bug A2.

  BUG:
  - A2: `{current_year}` showing as literal text in cause title
    (should resolve to "2026")

  FILE POINTERS (per Vishal):
  - apps/drafting/src/config/court-rules/jharkhand_hc.json
  - All 13 court-rule JSONs — audit for `{year}` vs `{current_year}` consistency
  - apps/drafting/src/services/template-engine.service.ts:484-487

  FIX APPROACH:
  - Add recursive placeholder pass after court-rule load
  - Audit all 13 court-rule JSONs for placeholder consistency
    (standard token: `{year}`)
  - Add unit test that fails if any unresolved `{...}` token remains in
    rendered output

  ACCEPTANCE:
  - "Cr. Misc. No. _____ of 2026" (or correct year) in rendered output
  - Zero `{...}` tokens remain in any rendered template across all 13 courts

  TESTS:
  - Unit test for substitution
  - Integration test renders all 6 templates × 2 states (Bihar/Jharkhand)
    and asserts no unresolved tokens

  SIZE: S (≤30 min).
Dependencies: None — independent
---

---
ID: scrum-44-3-prompt-hardening
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done (Picked up + Completed 2026-05-07, Vishal-Sonnet)
Jira: SCRUM-62
Figma: N/A
Priority: P1
Task: AI prompt hardening + body output sanitiser
Details: |
  COVERS Ajay's audit bugs A6, A7.
  Reviewer: Ajay (CLO) for prompt language.

  BUGS:
  - A7: duplicate "IN THE COURT OF SESSIONS JUDGE, RANCHI" caption injected
    by AI (cause title appearing twice)
  - A6: AI disclaimer printed twice — once in body, once in footer

  FILE POINTERS (per Vishal):
  - docs/templates/bail_anticipatory.json:105 (prompt_context — possibly
    instructs AI to print court header twice)
  - apps/drafting/src/services/template-engine.service.ts:622 (system prompt
    rules — too weak on "do not duplicate cause title")

  FIX APPROACH:
  - Tighten system prompt with explicit "do NOT include a second cause-title
    block; do NOT include the AI-disclaimer in body — it's added by export
    footer"
  - Add a body sanitiser post-stream that strips known duplicate markers
    (cause-title regex, disclaimer regex)

  ACCEPTANCE:
  - Rendered output for any template has exactly ONE cause-title block
  - Disclaimer appears exactly once on last page (footer only)

  TESTS:
  - Snapshot test on 6 templates asserting single cause-title + single
    disclaimer

  SIZE: M (1-2 hr).
Dependencies: None
---

---
ID: scrum-44-4-form-input-normaliser
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done (Picked up + Completed 2026-05-07, Vishal-Sonnet)
Jira: SCRUM-63
Figma: N/A
Priority: P2
Task: Form input normaliser — strip duplicate prefixes (PS, etc.)
Details: |
  COVERS Ajay's audit bug A8.
  Reviewer: Priya (PM) for form UX.

  BUG:
  - A8: "PS PS Chanho" rendering in prayer — template prepends "PS" to a
    value that already starts with "PS"

  FILE POINTERS (per Vishal):
  - docs/templates/bail_anticipatory.json:114 (template prepends "PS")
  - Form input layer — UI may need to strip "PS" if user types it,
    OR template should detect and not double-prefix

  FIX APPROACH:
  - Smarter template — if form value starts with "PS" or "Police Station",
    do not prepend
  - OR clean form input on save (normaliser at write-time)
  - Same logic applies to "Sessions Judge / Sessions Judge" or any
    similar double-prefix scenarios

  ACCEPTANCE:
  - "PS Chanho" never renders as "PS PS Chanho"
  - Same logic generalises across other known prefix collisions

  TESTS:
  - Unit test on bail_anticipatory + bail_regular with both "Chanho" and
    "PS Chanho" form inputs

  SIZE: S (≤30 min).
Dependencies: None
---

---
ID: bns-section-validator-and-whitelist
Filed by: Priya · PM
Filed on: 2026-05-06
Status: Done (Picked up + Completed 2026-05-07, Vishal-Sonnet)
Jira: SCRUM-64
Figma: N/A
Priority: P0
Task: Fact↔section validator + BNS whitelist constraint on AI prompt
Details: |
  COVERS Ajay's audit defects B1, B2 — FILING-KILLER class issues.
  Reviewer: Ajay (CLO) — legal correctness lead.

  DEFECTS:
  - B1: AI generated BNS 103(1) (= MURDER) for facts that allege only injury,
    not death. Wrong section class.
  - B2: AI also generated BNS 301 which is NOT in our 686-row
    bns-mapping.json (likely hallucinated section).

  FILE POINTERS:
  - apps/drafting/src/config/bns-mapping.json (whitelist source)
  - apps/drafting/src/services/ai.service.ts (post-generation validator)
  - apps/drafting/src/services/template-engine.service.ts (system prompt —
    add whitelist constraint)

  FIX APPROACH:
  (a) Inject the BNS section whitelist into system prompt as constraints
  (b) Add post-generation validator that scans output for
      `Section N of BNS/BNSS/BSA/...` patterns and rejects/flags any not
      present in the mapping
  (c) Add fact↔section sanity rule:
      - if facts narrative mentions "death" / "killed" / "murdered" → BNS 103
        is allowed
      - otherwise default to attempt-to-murder (S.109) or grievous hurt (S.117)
  (d) Add advocate-facing warning chip in editor:
      "Section X cited but mapping/facts mismatch — please verify."

  ACCEPTANCE:
  - Regenerate the same Jharkhand bail case → output uses Section 109 or 117
    (NOT 103(1))
  - Section 301 (or any non-whitelisted section) is rejected with warning
  - Existing 12-template smoke tests still pass

  TESTS:
  - Unit test for whitelist filter
  - Integration test rerunning the failing Jharkhand bail payload now
    produces the right section
  - Legal-correctness regression suite (Ajay collaborates on cases)

  SIZE: L (half-day to full day — prompt iteration + validator code +
  mapping coverage).
Dependencies: None — independent and gating advocate-pack readiness
---

## TASKS FROM PRIYA — 8 MAY 2026 (filing-grade gate + pre-gen verifier + growth)

> Founder approved 2026-05-06 in one shot. 8 tickets covering:
> (a) filing-grade annexures + affidavit page (SCRUM-65, 66)
> (b) prompt + form coherence rules (SCRUM-67, 68)
> (c) pre-generation verification layer + status bar UI (SCRUM-69, 70)
> (d) referral codes for advocate panel distribution (SCRUM-71)
> (e) abuse throttle — DESIGN PENDING, do NOT pick up (SCRUM-72)
>
> Source-of-truth war-room docs:
> - team-warroom/2026-05-06/adr-verification-layer-2026-05-06.md
> - team-warroom/2026-05-06/clo-verification-taxonomy-2026-05-06.md
> - team-warroom/2026-05-06/hr-verification-layer-scope-2026-05-06.md
> - docs/designs/draft-pipeline-status-bar-2026-05-06.html (live mock)
> - docs/designs/draft-pipeline-status-bar-2026-05-06.png

---
ID: scrum-65-annexures-pack
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-65
Figma: N/A
Priority: P0
Task: Annexures pack generator — 7 mandatory court-filing annexures bundled with main draft
Details: |
  FILING-GRADE GATE. Reviewer: Ajay (CLO) for legal correctness, Arjun (CTO) for architecture.

  7 ANNEXURES (mandatory):
  1. Memo of Parties
  2. Synopsis (HC practice)
  3. List of Dates and Chronology of Events
  4. Index of Documents Annexed
  5. Vakalatnama (signed reference + blank template)
  6. Court Fee paid statement
  7. Affidavit on separate sheet with notary block (absorbs SCRUM-66
     scope per 2026-05-10 sweep — must force <div style="page-break-before:
     always">; pull verification language from court_rules JSON
     `verification_format`; include deponent identification, paragraph
     reference 1..N, oath statement, notary stamp placeholder, deponent
     signature line, place + date)

  IMPLEMENTATION:
  - Each annexure = own template config under
    apps/drafting/src/config/annexures/<slug>.json
  - Each renders from same form_data + court rule inputs as main draft
  - Output: single ZIP containing main draft PDF + 7 annexure PDFs
    (or one multi-page PDF, each annexure on a fresh page)
  - Court-rule aware: annexure formats vary by HC vs district vs
    consumer commission — read from court_rules JSONs

  ACCEPTANCE:
  - Re-run smoke test on Jharkhand bail_anticipatory → output ZIP with
    8 PDFs (1 main + 7 annexures)
  - Each annexure passes Ajay's checklist

  TESTS:
  - Snapshot test each annexure for both Bihar and Jharkhand
  - Integration test that ZIP contains 8 files

  SIZE: L (3-4 days).
Dependencies: SCRUM-50 (court rules — done), SCRUM-43 (drafting engine — done), SCRUM-57 (cli-export — must complete first to reuse PDF render)
---

---
ID: scrum-66-affidavit-separate-page
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Cancelled — merged into SCRUM-65 via 2026-05-10 sweep delta. Affidavit is one of the 7 annexures in the pack.
Jira: SCRUM-66
Figma: N/A
Priority: P0
Task: Verification on separate notarised affidavit page (Jharkhand HC rules)
Details: |
  FILING-GRADE GATE. Reviewer: Ajay (CLO).

  Render the verification block as a separate page with notary stamp area
  and deponent signature block per Jharkhand HC rules.

  IMPLEMENTATION:
  - New affidavit page template (separate from main draft body)
  - Includes: deponent identification, paragraph reference (1 to N),
    oath statement, notary stamp placeholder, deponent signature line,
    place + date
  - Force <div style="page-break-before: always"> in HTML/PDF
  - Court-rule aware: verification language pulled from court_rules JSON's
    `verification_format` field (already exists per SCRUM-50)

  ACCEPTANCE:
  - Every generated PDF ends with affidavit on its own dedicated page
  - Bihar + Jharkhand variants both render correctly

  TESTS:
  - Snapshot test for affidavit page
  - Assert page-break in rendered PDF

  SIZE: M (1 day).
Dependencies: SCRUM-65 if folded into the annexure pack; otherwise standalone
---

---
ID: scrum-67-grounds-facts-coherence
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Done
Picked up on: 2026-05-11
Picked up by: Vishal-Sonnet
Completed on: 2026-05-11
Jira: SCRUM-67
Figma: N/A
Priority: P1
Task: Grounds-vs-facts coherence prompt rule
Details: |
  Reviewer: Ajay (CLO) for prompt language.

  Detect when the form's selected grounds (e.g. `false_implication`)
  don't match the narrative facts pattern (e.g. petitioner described as
  passive bystander), and surface a warning to the AI prompt to reconcile.

  FILE POINTERS:
  - apps/drafting/src/services/template-engine.service.ts
    → buildAIUserPrompt() — add coherence-check block

  FIX APPROACH:
  - If `false_implication` selected AND narrative does NOT contain action
    words by petitioner ("rendered aid", "took to hospital"), inject
    prompt rule:
    "Reconcile false implication ground with passive presence —
     explain in body how passive presence led to wrongful blame"
  - Same logic for other grounds-narrative mismatches
  - Returns warning in done event so frontend can show review chip

  SIZE: M (1 day).
Dependencies: SCRUM-43 (drafting engine — done)
---

---
ID: scrum-68-fir-year-date-validator
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Cancelled — merged into SCRUM-69 via 2026-05-10 sweep delta. FIR year/date check is one of the 24 trigger categories in Ajay's verifier taxonomy (trigger D2).
Jira: SCRUM-68
Figma: N/A
Priority: P0
Task: Form input validator — FIR year/date mismatch (soft-block dialog)
Details: |
  INPUT SAFETY. Reviewer: Ajay (CLO) for what's "unusual".

  Soft-block validator on form submit — if FIR number's year suffix !=
  FIR registration date year, surface clarification dialog before
  generation.

  IMPLEMENTATION:
  - Frontend: regex parse FIR no for /YYYY or /YY suffix; compare with
    year(FIR_date)
  - If mismatch: render dialog with 3 options + skip (per the status bar
    mock for soft-warn state — see design file)
  - Backend `/preflight` endpoint also runs this check (defence in depth)

  ACCEPTANCE:
  - Entering FIR `091/2021` with date `06.01.2026` triggers the dialog
  - User can confirm "old FIR" to bypass
  - Matched values pass silently

  TESTS:
  - Unit test for the regex+year-compare function
  - Integration test for the dialog interaction

  SIZE: S (4 hr).
Dependencies: SCRUM-69 (verification layer scaffolding); can ship as part of 69 if Vishal prefers
---

---
ID: scrum-69-verification-layer
Filed by: Priya · PM
Filed on: 2026-05-08
Status: To Do
Jira: SCRUM-69
Figma: N/A
Priority: P0
Task: Pre-generation verification layer — POST /api/documents/preflight (rules + Sonnet hybrid)
Details: |
  Reviewer: Arjun (architecture), Ajay (rule taxonomy author), Priya (UX shape).

  Build the pre-generation verifier as a new endpoint
  POST /api/documents/preflight.

  TWO LAYERS:
  - Pure-rule layer (~50ms): runs all deterministic checks from Ajay's
    taxonomy (date/number, jurisdiction, identity, procedural,
    document-specific). See:
    /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/clo-verification-taxonomy-2026-05-06.md
    (24-trigger spec)
  - LLM-assisted layer (~1.5s): one Anthropic Sonnet 4 call
    (model: claude-sonnet-4-20250514) for fuzzy section-vs-facts and
    free-text red flags

  RESPONSE SHAPE:
  { verdict: "pass" | "soft" | "hard",
    questions: string[],
    hardBlockReason?: string }

  HARD BLOCK TRIGGERS (only these 5):
  1. Future FIR date
  2. Age out of range (<0 or >120)
  3. BNS/BNSS section not in whitelist
  4. Missing required field
  5. Narrative role inversion (petitioner = aggressor)

  Everything else: SOFT WARN.

  STATUS MESSAGES (SSE during preflight):
  - "Verifying your inputs…"
  - "Cross-checking sections, dates, and jurisdiction."
  (Drives SCRUM-70 status bar)

  FAIL-OPEN: if Sonnet API down → log + skip LLM layer, run rules-only.

  RULES YAML: /docs/legal/verification_rules.yaml
  (Ajay authors per Rita's HR scope memo)

  NOTE (2026-05-10 sweep delta): absorbed SCRUM-68 scope — confirm trigger
  D2 (FIR no. year suffix vs FIR registration date year) is in the rules
  YAML when implementing. Soft-warn dialog with "old FIR" bypass option,
  per the original SCRUM-68 spec. Frontend regex parser + backend
  /preflight check both required.

  ACCEPTANCE:
  - Re-run the same payload that produced the v3 PDF → verifier surfaces
    FIR mismatch + BNS 103(1)-on-living-victim warnings
  - Pass-through case (clean inputs) adds <2s to total draft time
  - Fail-open case (mock Sonnet 503): drafting still works, log entry created

  TESTS:
  - Unit test per rule
  - Integration with mocked Sonnet response
  - Chaos test for Sonnet outage

  REFERENCE DOCS:
  - ADR: /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/adr-verification-layer-2026-05-06.md
  - Taxonomy: /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/clo-verification-taxonomy-2026-05-06.md
  - HR scope: /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/hr-verification-layer-scope-2026-05-06.md

  SIZE: 8 story points / 5 person-days.
Dependencies: SCRUM-64 (BNS validator) runs in parallel — they cover different layers (post-gen vs pre-gen)
---

---
ID: scrum-70-status-bar-ui
Filed by: Priya · PM
Filed on: 2026-05-08
Status: To Do
Jira: SCRUM-70
Figma: N/A — designed directly in HTML
Priority: P0
Task: Status bar UI — 5-state pipeline stepper with per-step messages
Details: |
  UX paired with SCRUM-69. Reviewer: Priya (UX), Arjun (event integration).

  Stepper UI showing the 5 pipeline states (Inputs received / Verifying /
  Drafting / Validating / Ready) with friendly per-step messages and a
  5-segment progress bar.

  DESIGN FILES (Vishal: open HTML in browser to see live mock):
  - /Users/abhinavanand/Files/Lawie/docs/designs/draft-pipeline-status-bar-2026-05-06.html
  - /Users/abhinavanand/Files/Lawie/docs/designs/draft-pipeline-status-bar-2026-05-06.png

  STATES COVERED:
  1. Verifying  — blue, crosshair icon, message + 2-second hint
  2. Drafting   — purple, file icon, elapsed seconds counter,
                  message + 10-18s hint
  3. Soft warn  — amber, Hinglish copy: "Ek baat dhyan mein aayi —
                  confirm kar lein?", 3 options + Skip link
  4. Ready      — emerald, checkmark, draft summary, Open/Export buttons
  5. Hard block — red, error icon, reason, Edit form button

  IMPLEMENTATION:
  - Component path: apps/web/src/components/draft/PipelineStatus.tsx
  - Mount: replaces current spinner in /dashboard/documents/new
    and /draft/[id]
  - Drives off SSE events from /preflight and /generate

  ACCEPTANCE:
  - All 5 states render correctly
  - Progress bar fills as steps complete
  - Soft-warn state pauses generation until user picks an option

  TESTS:
  - Storybook component test for each state
  - Integration with mocked SSE

  SIZE: M (2 days).
Dependencies: SCRUM-69 (events to drive the bar)
---

---
ID: scrum-71-referral-codes
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-71
Figma: N/A
Priority: P0
Task: Referral code system — founder-issued codes + 25 bonus drafts on signup
Details: |
  Founder needs this for Jharkhand advocate panel review distribution.
  Reviewer: Priya (UX), Vikram (cap math).

  Founder admin can generate referral codes; advocate enters code at
  signup; referee gets 25 free drafts (one-time bonus on top of trial).

  FOUNDER ADMIN UI: /admin/referral-codes
  (gated on `user.role === 'founder'`):
  - Generate button → creates a new code (8-char alphanumeric, e.g.
    `LWPATNA1`)
  - Optional label per code (e.g. "Patna bar review", "Adv. Kumar")
  - Table: code, label, created_at, signups, drafts redeemed,
    status (active / disabled)
  - Disable button per code

  PUBLIC SIGNUP FORM:
  - Optional "Have a referral code?" field
  - Validate against active codes table on submit

  BACKEND:
  - ReferralCode model: code (unique), label, createdBy (founder userId),
    createdAt, isActive, maxUses (default null = unlimited), uses
  - User model: add `referredVia: ReferralCode._id` on signup
  - On successful signup with valid code:
    - Increment `code.uses`
    - Grant referee 25 free drafts (one-time bonus on top of trial —
      `freeTierBonusGrant: 25`)
  - Drafting service: deduct from `freeTierBonusGrant` first, then trial
    allocation, then earned credits

  CAP RULES: founder-generated codes default to unlimited uses;
  founder can set per-code cap if needed.

  ACCEPTANCE:
  - Founder generates code `LWPATNA1` → shares with advocate
  - Advocate signs up with code → dashboard shows
    "25 bonus drafts unlocked"
  - Founder admin sees signup count update

  TESTS:
  - Unit on code generation + uniqueness
  - Integration on signup attribution
  - Security test that non-founder users cannot access /admin/referral-codes

  SIZE: L (3 days backend + frontend).
Dependencies: SCRUM-17 (auth — done), SCRUM-19 (dashboard — done)
---

---
## CANCELLED — SUPERSEDED
ID: scrum-72-abuse-throttle-design-tbd
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Cancelled — superseded by credit system 2026-05-08
Jira: SCRUM-72
Figma: N/A
Priority: P1 (but DO NOT START)
Task: Abuse throttle on Rs 799 plan (mechanism TBD)
Details: |
  ⚠️ DO NOT PICK UP UNTIL FOUNDER + VIKRAM LOCK THE DESIGN.

  Reviewer: founder + Vikram (designing separately).

  Stop-limit on Rs 799 monthly plan to prevent ID sharing abuse
  (one ID shared across multiple lawyers = huge LLM cost).

  CONTEXT:
  - Founder concern 2026-05-06: "we can't give unlimited draft as one id
    can be shared with multiple lawyers"
  - Coins idea deferred (1 coin = Rs 10 too costly per founder; plan for
    re-design later)

  ALTERNATIVE OPTIONS ON THE TABLE (founder + Vikram to choose):
  a. Hard monthly cap (e.g. 100 / 150 / 200 drafts/month — soft notice
     at 80%, hard cap at 100%)
  b. Device fingerprint + max concurrent sessions (e.g. 2 devices)
  c. Time/IP heuristics (one human can't draft from BR 3am AND MH 3pm)
  d. Bar Council number tied 1:1 (registration verification)

  STATUS: PENDING. Vishal must NOT pick this up until founder + Vikram
  lock the design.

  SIZE: TBD (depends on chosen mechanism).
Dependencies: founder + Vikram session
---

---
ID: credit-system-master
Filed by: Priya · PM (founder approved credit model 2026-05-08)
Filed on: 2026-05-08
Status: Pending
Jira: SCRUM-73
Figma: pending — Rajesh to design pricing page + dashboard credit widget
Reviewers: Vikram (math), Priya (UX), Ajay (ToS), Arjun (architecture)
Priority: P0
Task: Credit-based subscription system — Free/Practice/Firm tiers + earning + top-ups
Details: |
  WHY: Founder approved credit-based subscription model 2026-05-08. This is
  the master ticket that wires the credit economy across the codebase.
  Free tier mechanics (signup/login/rating earn + spend guard) are already
  scoped in SCRUM-59. This ticket adds paid tiers, top-ups, pricing page,
  and Razorpay extensions.

  TIERS:
    | Tier      | Price/mo | Credits/mo | ₹/credit | ICP |
    |-----------|----------|------------|----------|-----|
    | Free      | ₹0       | 35-45      | n/a      | Trial advocates |
    | Practice★ | ₹799     | 80         | ₹9.99    | Junior + active solo (8-12 cases/mo) |
    | Firm      | ₹1499    | 200        | ₹7.50    | 2-5 advocate firms |

  TOP-UP PACKS (any tier):
    - ₹199  → 20 credits
    - ₹499  → 60 credits
    - ₹999  → 150 credits

  YEARLY PLANS: 17% off (12-for-10).
    - Practice yearly = ₹7,990
    - Firm yearly     = ₹14,990

  DOCUMENT WEIGHTING (current 6 templates — add `creditsCost` to each
  template config JSON):
    - bail_regular         = 2 (complex)
    - bail_anticipatory    = 2 (complex)
    - consumer_complaint   = 2 (complex)
    - legal_notice_s80     = 1 (simple)
    - legal_notice_s138    = 1 (simple)
    - rent_agreement       = 1 (simple)

  SCOPE:
    1. User model — extend with:
       - `creditsBalance: number`
       - `creditsLifetimeEarned: number`
       - `creditsLifetimeSpent: number`
       - `tier: 'free' | 'practice' | 'firm'`
       - `loginBonusUsedThisMonth: number` (cap 30, reset 1st)
       - `ratingBonusUsedThisMonth: number` (cap 5, reset 1st)
       - `subscriptionId`, `subscriptionPeriodStart`, `subscriptionPeriodEnd`,
         `billingCycle: 'monthly' | 'yearly'`
       Reset cap counters on the 1st of each month via existing cron.
    2. Document/template model — add `creditsCost: 1 | 2`. Update all 6
       template JSONs.
    3. Drafting service guard — before generation, check
       `user.creditsBalance >= template.creditsCost`. If insufficient,
       return HTTP 402 with friendly message + pricing CTA. Decrement
       balance after successful generation. (Shared with SCRUM-59.)
    4. Daily login bonus — first login of each day: if `tier === 'free'`
       AND `loginBonusUsedThisMonth < 30`, grant 2 credits, increment
       counter. Implement as auth middleware or dashboard mount check.
       (Shared with SCRUM-59.)
    5. Rating bonus — on rate submission for free user (already wired in
       SCRUM-59), if `ratingBonusUsedThisMonth < 5`, grant 1 credit,
       increment counter.
    6. Top-up packs — new endpoint `POST /api/billing/top-up` with Razorpay
       integration. Three SKUs: ₹199→20, ₹499→60, ₹999→150. Add credits
       on webhook confirmation. Available to ALL tiers (free, practice, firm).
    7. Subscription tier change — extend existing Razorpay subscription flow
       with tier picker (Practice / Firm). Monthly OR yearly. On charge
       confirmation, set tier + grant monthly credit allocation. On
       cancellation, tier reverts to free at period end.
    8. Yearly billing — 17% discount on annual prepay.
       Practice yearly = ₹7,990, Firm yearly = ₹14,990.
    9. Dashboard UI — show credit balance prominently; show tier; show
       "earn more" CTA for free users; show top-up CTA. Existing dashboard
       usage meter (SCRUM-19) extends to show credits.
    10. Pricing page — new `/pricing` route with 3-tier card layout.
        Brand teal/blue. Yearly toggle (saves 17%). Top-up section below.
    11. Telemetry — emit:
        - `credits.granted` (sources: signup|login|rating|monthly_renewal|topup|tier_upgrade)
        - `credits.spent`
        - `tier.upgraded` (from, to, billingCycle)
        - `tier.downgraded`
        - `topup.purchased` (amount, credits, razorpayId)

  POLICY DECISIONS (locked 2026-05-10 by founder):
    P1. Tier upgrade roll-over (Free → Practice or Free → Firm):
        On tier upgrade, `user.creditsBalance` is preserved (additive);
        new tier's monthly allocation is added to existing balance.
    P2. Monthly subscription renewal:
        On monthly subscription renewal, any unused subscription-included
        credits lapse on the renewal date. Credits earned via
        login/rating/top-up packs are NOT subscription-included and
        persist across renewals.
    P3. Mid-month subscription cancellation:
        On mid-month subscription cancellation, no pro-rata refund.
        `tier` reverts to `free` at end of paid period; remaining credits
        stay usable until then. After period end, credits earned via
        login/rating/top-up persist; subscription-included monthly
        allocation is forfeited.
    P4. Top-up pack credits (codified, was implicit):
        Top-up pack credits are PERMANENT — they never lapse on monthly
        renewal and persist through subscription cancellation.

  CREDIT BUCKETS (implementation note):
    To enforce P2 + P3 + P4, credits MUST be tracked by source bucket:
      - `subscriptionCredits` — granted on tier purchase/renewal; lapse
        per P2 + forfeit per P3.
      - `earnedCredits` — login/rating bonuses; persist forever.
      - `topupCredits` — purchased via top-up packs; persist forever.
    Spend order (recommended): subscriptionCredits first (use-or-lose),
    then earnedCredits, then topupCredits.
    `user.creditsBalance` = sum of all three buckets (UI display).

  ACCEPTANCE:
  - Free user signs up → sees 10 credits balance.
  - Logs in next day → balance = 12 (login bonus).
  - Drafts a bail (2 credits) → balance = 10.
  - Drafts another bail → balance = 8.
  - Drafts 4 simple notices → balance = 4.
  - Tries to draft another bail → 402 + "Insufficient credits — top up or upgrade".
  - Buys ₹199 top-up → balance = 24.
  - Upgrades to Practice via Razorpay → tier='practice', credits granted
    to 80 (additive per Q1 if approved).
  - Yearly Practice flow works, 17% discount applied (₹7,990 charged).
  - Cancels Practice mid-cycle → tier reverts to 'free' at period end,
    credits stay valid till then.
  - Top-up purchase available on all tiers.
  - Pricing page renders 3 tiers + yearly toggle + top-up section.

  TESTS:
  - Unit: credit accounting (race conditions, transaction safety on
    concurrent decrements).
  - Unit: monthly counter reset on 1st (timezone = IST).
  - Integration: each tier purchase (monthly + yearly) end-to-end.
  - Integration: each top-up SKU end-to-end.
  - Integration: cancellation flow + period-end downgrade cron.
  - Snapshot: pricing page UI (desktop + mobile).
  - Webhook idempotency: replayed Razorpay webhook does not double-credit.

  SIZE: L (5-7 days).
Dependencies: SCRUM-58 (Helicone — done), SCRUM-19 (dashboard — done), SCRUM-44 (editor — done), SCRUM-59 (free-tier credit base — in flight)
---

## TASKS FROM PRIYA — 10 MAY 2026 (sweep delta — 3 new follow-up tickets)

> Founder approved 2026-05-10 most of Arjun's + Vishal's sweep deltas.
> Dropped ADR-019 (editor stays — TipTap shipped).
> SCRUM-66 merged into SCRUM-65; SCRUM-68 merged into SCRUM-69.
> SCRUM-25 engineering portion confirmed Done; ToS / Privacy / Refund
> drafting routed to Ajay (CLO) + Madhuri (Content) — separate workstream.
> 3 new architectural follow-ups filed below.

---

## TASK 9 — 10 May 2026
Ticket: SCRUM-25 (https://abhinava32.atlassian.net/browse/SCRUM-25)
What: Compliance layer — disclaimers, encryption, ToS, Privacy Policy
Status: Done — engineering side complete (auto-closed via 2026-05-10 sweep delta). Disclaimers in body + footer shipped via SCRUM-23 + SCRUM-62; AES-256-GCM encryption shipped via SCRUM-11. ToS / Privacy Policy / Refund Policy DRAFTING re-scoped to CLO (Ajay) + Content (Madhuri) ownership per founder call 2026-05-10. Tracked separately, not as engineering work.

---

---
ID: scrum-74-advocate-panel-review-pipeline
Filed by: Priya · PM
Filed on: 2026-05-10
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-74 (https://abhinava32.atlassian.net/browse/SCRUM-74)
Figma: N/A — Priya owns UX
Priority: P0
Task: Jharkhand advocate-panel review pipeline — workflow + comms for Ranchi advocates reviewing the pack
Details: |
  Reviewer: Priya (UX), Ajay (review form), founder (decides whom to invite).

  CONTEXT:
  - CLO Round 3 (2026-04-30) flagged the panel-feedback loop as required
    before opening drafts to filing. No ticket exists today — closing the
    loop is gating Phase-1 25-paying-users milestone.
  - 12 PDFs go out to Ranchi advocate panel; structured feedback returns
    via this pipeline.

  SCOPE:
  - Review portal page at /review/[reviewToken] — advocate hits a tokenised
    URL, sees the draft inline + structured feedback form
  - Advocate auth: simple token-based access (no password needed for
    review-only access; reuse SCRUM-71 referral-code primitives)
  - Structured feedback form per Ajay's earlier 1-page checklist
    (court-readiness, factual correctness, prayer language, citations,
    annexures, formatting, overall verdict)
  - Aggregation dashboard for founder at /admin/panel-review → table of
    advocate × document × verdict + freeform comments
  - Email notification to founder on each submission

  ACCEPTANCE:
  - Founder generates 12 review tokens for the 12 PDFs
  - Each advocate hits their unique URL, sees the draft, submits feedback
  - Founder dashboard shows 12-row matrix with status

  TESTS:
  - Unit: token generation + uniqueness + expiry
  - Integration: end-to-end submission flow

  SIZE: M (2 days).
Dependencies: SCRUM-65 (annexures pack — to ensure PDFs are filing-grade by review time), SCRUM-71 (referral code primitives shared)
---

---
ID: scrum-75-court-rule-golden-master-tests
Filed by: Priya · PM
Filed on: 2026-05-10
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-75 (https://abhinava32.atlassian.net/browse/SCRUM-75)
Figma: N/A
Priority: P1
Task: Court-rule golden-master test suite — snapshot lock on 11 court-rule JSONs
Details: |
  Reviewer: Arjun (CTO).

  CONTEXT:
  - SCRUM-50 has 357/357 drafting tests passing, but no golden-master diff
    on the 11 court-rule JSONs themselves. One stray edit = silent
    formatting regression on a filed brief.
  - CTO posture: must exist before advocate-panel feedback opens us to
    rule changes.

  SCOPE:
  - Snapshot test for each court × each template combination
    (11 courts × 6 templates ≈ 66 snapshots minimum)
  - Snapshots stored under apps/drafting/src/__tests__/__snapshots__/
    court-rules-golden/
  - CI gate: PR fails if any snapshot changes without explicit
    `--update-snapshots` flag + review checkbox in PR template
  - One-line "regenerate all" script for legitimate court-rule changes

  ACCEPTANCE:
  - All snapshots committed and passing
  - CI fails on a deliberate test-mutation PR
  - Regenerate script works and produces identical snapshots when re-run

  TESTS:
  - Self-validating (snapshots ARE the tests)

  SIZE: S (4 hr).
Dependencies: SCRUM-50 (court rules — done), SCRUM-65 (must be in flight or done so annexure renders are also locked)
---

---
ID: scrum-76-helicone-alerting-runbook
Filed by: Priya · PM
Filed on: 2026-05-10
Status: To Do
Jira: SCRUM-76 (https://abhinava32.atlassian.net/browse/SCRUM-76)
Figma: N/A
Priority: P2
Task: Helicone alerting + per-user kill-switch runbook (doc only, no code)
Details: |
  Reviewer: Vikram (CFO — thresholds), Arjun (CTO — escalation).

  CONTEXT:
  - SCRUM-58 wired the Helicone proxy + spend-cap middleware. There is no
    runbook for what happens when an alert fires.
  - Today: alert fires → no documented response.

  SCOPE — DOC ONLY (no code):
  - Document thresholds:
    - Per-user daily spend > ₹100 → warn
    - Per-user daily spend > ₹500 → soft kill (require founder unlock)
    - Total daily spend > ₹2000 → hard kill all generations
    - Anomaly: 10× day-over-day spike → page founder
  - Escalation steps:
    - Who gets paged (founder always; Arjun on architecture issues)
    - Comms template for affected users
    - Investigation checklist
  - Kill-switch procedure:
    - One-line Mongo flag to disable a single user
    - Global kill-switch env var to disable all generation
    - How to verify the kill took effect via Helicone dashboard
  - Save to Notion Engineering space + link from CLAUDE.md

  ACCEPTANCE:
  - Runbook lives in Notion at Engineering > Runbooks > Helicone Alerts
  - Founder + Arjun can both follow it cold
  - Kill-switch tested in dev (mock alert) end-to-end

  TESTS:
  - Manual dry-run with Vikram + Arjun

  SIZE: S (2 hr — doc only).
Dependencies: SCRUM-58 (Helicone proxy — done)
---

## PICKUP ORDER (post-sweep — refreshed 2026-05-10 by Priya, delta round 2)

> Backlog cleaned via 2026-05-08 sweep + 2026-05-10 delta sweep.
> 2026-05-10 deltas: SCRUM-48 closed (code shipped); SCRUM-66 merged into 65;
> SCRUM-68 merged into 69; SCRUM-25 closed (eng portion); SCRUM-51 marked
> Partial; 3 new follow-up tickets filed (advocate panel review, court-rule
> golden-master, Helicone runbook).

CLEAN QUEUE (Pending tickets — pick top-down by P0 → P1 → P2):

1. **SCRUM-69** — Pre-generation verification layer + FIR year/date trigger D2 (P0, biggest single piece, ~5 person-days). Absorbed SCRUM-68 scope.
2. **SCRUM-70** — Status bar UI / 5-state pipeline stepper (P0, pairs with 69, ~2 days)
3. **SCRUM-65** — Annexures pack generator + separate affidavit page (P0, filing-grade gate, ~3-4 days). Absorbed SCRUM-66 scope.
4. **SCRUM-71** — Referral code system (P0, unblocks advocate panel distribution, ~3 days)
5. **SCRUM-74** — Advocate-panel review pipeline (P0, ~2 days). Required before opening to Ranchi advocate review.
6. **SCRUM-67** — Grounds-vs-facts coherence prompt rule (P1, ~1 day, last polish)
7. **SCRUM-75** — Court-rule golden-master tests (P1, ~4 hr). Should land before SCRUM-65 ships.
8. **SCRUM-51** — Hindi/bilingual full pipeline (Partial — metadata only). Resume when advocate-panel demand validates.
9. **SCRUM-76** — Helicone alerting runbook (P2, ~2 hr, doc only).
10. **SCRUM-59** — Credit-based free tier (P1, BLOCKED until SCRUM-73 sign-off)
11. **SCRUM-73** — Credit-based subscription master (P0, BLOCKED on founder/CFO Q1/Q2/Q3)

BLOCKED / NEEDS SIGN-OFF:
- **SCRUM-72** — Abuse throttle: cancelled, superseded by SCRUM-73.
- **SCRUM-73** + **SCRUM-59** — Credit system: founder + Vikram (CFO) must answer Q1/Q2/Q3.

CANCELLED / MERGED (do NOT pick up):
- SCRUM-66 → merged into SCRUM-65
- SCRUM-68 → merged into SCRUM-69

---
ID: scrum-70-status-bar
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-70

NEXT TOP-OF-QUEUE FOR VISHAL: **SCRUM-69** (pre-generation verification layer + FIR year/date trigger D2).

---
ID: scrum-69-preflight
Filed by: Priya · PM
Filed on: 2026-05-08
Status: Done
Picked up on: 2026-05-10
Picked up by: Vishal-Sonnet
Completed on: 2026-05-10
Jira: SCRUM-69
---

---
ID: scrum-77-email-system
Filed by: Priya · PM
Filed on: 2026-05-10
Status: Pending
Jira: SCRUM-77 (https://abhinava32.atlassian.net/browse/SCRUM-77)
Figma: N/A
Priority: P1
Task: Email system — non-blocking workers + .env config + cross-service producer
Details: |
  Reviewer: Arjun (architecture), Ajay (legal copy), Madhuri (template content), Rajesh (template visuals).

  Reference ADR (canonical source — read first):
  /Users/abhinavanand/Library/Application Support/Claude/local-agent-mode-sessions/57384051-4f1b-4a23-8a76-89db28aa1571/7b6b8ec1-f738-459d-a6cf-0b02da2b7191/local_23a57bcc-592d-4d5b-87ab-507762018fd8/outputs/adr-email-system-2026-05-10.md
  (ADR-007, Arjun, 2026-05-10).

  CONTEXT:
  - Phase 1 needs transactional email (signup, verification, password reset,
    billing receipts, payment failure, low-credit warning, monthly invoice,
    referral admin pings, advocate-pack invites, founder daily digest).
  - HARD CONSTRAINT 1: send must be non-blocking on the request path.
    HTTP responses must NEVER wait for SMTP.
  - HARD CONSTRAINT 2: every backend service uses the same one-line API.
  - HARD CONSTRAINT 3: ALL config in .env — pulled from AWS Secrets Manager
    in staging/prod (per SCRUM-39), .env.development locally.
  - This is P1, NOT P0. Nothing here blocks advocate-panel review or
    Phase-1 launch. It is infra polish that unblocks billing flow + referral
    founder ping + founder digest. Slot AFTER SCRUM-69 + SCRUM-70 ship.

  ARCHITECTURE (per ADR-007 — picked by Arjun):
  - BullMQ on existing Redis Cloud (already wired across all 4 services).
  - Two queues: email:high (verification, reset, payment receipt, payment
    failure) and email:low (digest, draft-complete, monthly invoice,
    low-credit, referral, advocate-pack, welcome).
  - New 5th docker-compose service apps/email-worker — headless container,
    single Node BullMQ worker, restart=unless-stopped, no HTTP except
    /health on :9100. NOT PM2 — Docker is the supervisor.
  - New shared package packages/email-client exporting enqueueEmail()
    — sub-10ms p95 enqueue, idempotency key, rate-limit hooks. Imported
    by all 4 backend services.
  - Provider: AWS SES ap-south-1 via @aws-sdk/client-sesv2. SMTP fallback
    via nodemailer behind EMAIL_PROVIDER switch. Free tier covers Phase 1
    fully (~1,650 emails/mo vs 62k free).
  - Templates: React Email under apps/email-worker/src/templates/
    {auth,billing,drafting,admin}/. Each template = { subject(data), Body(data) }.
  - Zod-validated env on worker boot (re-use apps/auth/src/config/env.ts pattern).
  - Secrets: AWS Secrets Manager per SCRUM-39 pattern.
  - Sentry breadcrumbs: email.enqueue / email.send.start / email.send.success|failure
    — PII stripped, email hashed. Custom metric email_lag_ms.
  - DLQ + manual replay CLI: pnpm --filter email-worker replay <jobId>.
  - SES bounce/complaint webhook → SNS → Mongo email_suppressions collection.
    Future enqueues silently dropped + Sentry breadcrumb.
  - Latency budgets: high p95 < 5s (ceiling 10s), low p95 < 60s (ceiling 5min).

  FULL SCOPE (12 work items):
  1. apps/email-worker container — Dockerfile (modelled on apps/auth/Dockerfile),
     healthcheck on :9100, restart=unless-stopped. Added to docker-compose.yml +
     docker-compose.staging.yml + docker-compose.prod.yml.
  2. packages/email-client shared producer — enqueueEmail({ template, to, data,
     priority?, idempotencyKey?, cc?, bcc?, replyTo? }). Sub-10ms p95.
  3. BullMQ queues email:high and email:low on existing Redis Cloud connection.
  4. AWS SES ap-south-1 SMTP creds + dedicated IAM user scoped ONLY to
     ses:SendEmail / ses:SendRawEmail. Rotate quarterly.
  5. DNS for lawie.in — SPF, DKIM (3 CNAMEs), DMARC p=quarantine initially
     (Arjun handles parallel; not blocking dev).
  6. ELEVEN React Email templates:
     - auth.welcome, auth.verifyEmail, auth.passwordReset
     - billing.subscriptionConfirmed, billing.paymentFailed,
       billing.monthlyInvoice, billing.lowCreditWarning
     - drafting.draftComplete
     - admin.referralIssued, admin.advocatePackInvite, admin.founderDailyDigest
  7. Bounce + complaint webhook → Mongo email_suppressions collection.
  8. Sentry instrumentation — breadcrumbs on enqueue/send/fail, PII stripped,
     email hashed.
  9. DLQ + manual replay CLI.
  10. .env keys (all 4 services + email-worker). Required:
      EMAIL_PROVIDER, AWS_REGION, AWS_SES_ACCESS_KEY_ID,
      AWS_SES_SECRET_ACCESS_KEY, EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS,
      EMAIL_REPLY_TO, EMAIL_FOUNDER, EMAIL_QUEUE_PREFIX,
      EMAIL_WORKER_CONCURRENCY, EMAIL_DEV_REDIRECT_TO, EMAIL_DRY_RUN.
      Optional listed in ADR §6 (rate-limit, backoff, lag budgets, SMTP
      fallback creds, configuration set). HARD-FAIL Zod validation on
      missing required keys.
  11. Update .env.example + docs/environments.md with all keys.
  12. Per-service wire-ins:
      - apps/auth: enqueue auth.welcome + auth.verifyEmail after registerUser;
        auth.passwordReset in initiatePasswordReset. Use `void enqueueEmail(...)`
        — never await on the request path.
      - apps/billing: enqueue billing.subscriptionConfirmed on
        subscription.activated webhook; billing.paymentFailed on payment.failed;
        billing.monthlyInvoice via worker cron (worker reads via internal
        endpoint /internal/users/active-paid).
      - apps/drafting: enqueue drafting.draftComplete after success IFF
        user.prefs.draftCompleteEmail === true (default false);
        billing.lowCreditWarning when post-decrement credits cross 80%
        (idempotency key `lowcredit:${userId}:${periodStart}`).
      - apps/gateway: no direct enqueue (stateless).

  ACCEPTANCE CRITERIA:
  1. enqueueEmail({...}) returns within 10ms p95 from any of the 4 services
     (measured locally).
  2. Email send fully OFF the request path: a forced SES outage does NOT fail
     signup, login, password reset, payment webhook, or draft completion.
  3. All 11 templates render cleanly in `pnpm --filter email-worker email:preview`
     (port 3001).
  4. High-priority queue lag p95 < 5s in staging load test (100 emails / 10s).
  5. Low-priority queue lag p95 < 60s same test.
  6. SES bounce or complaint adds the address to Mongo email_suppressions;
     future enqueue is silently dropped + Sentry breadcrumb.
  7. EMAIL_DRY_RUN=true → worker logs payloads, never calls SES.
  8. EMAIL_DEV_REDIRECT_TO set in dev → ALL mail goes to that single address
     regardless of `to`.
  9. DLQ has every failed job after 5 attempts; replay CLI re-enqueues with
     reset attempts counter.
  10. idempotencyKey collision returns existing job — no duplicate send.
  11. Sentry shows breadcrumb chain email.enqueue → email.send.start →
      email.send.success on happy path; failure path captured with full
      context (no PII — email hashed).
  12. Zod env validation HARD-FAILS on missing required keys (worker won't boot).
  13. No raw email address in any LLM prompt, log line, or Sentry payload.
  14. Founder daily digest fires at 09:00 IST (cron `30 3 * * *` UTC) and
      contains: yesterday's signups, paid conversions, drafts generated,
      total Anthropic spend (from Helicone), top 3 Sentry errors.

  TESTS:
  - Unit: template render snapshot tests (11 files); enqueueEmail queue-routing
    tests (priority → correct queue); idempotency dedupe.
  - Integration: Redis + worker via testcontainers in CI; enqueue 50 jobs
    across both priorities; assert lag budgets, retry behaviour, DLQ landing.
  - Provider mock: SES via aws-sdk-client-mock; verify exact SendEmailCommand
    payload per template.
  - End-to-end: apps/auth/src/__tests__/email.welcome.test.ts — POST /register,
    assert job lands on email:high with correct payload.
  - Suppression: simulate SES bounce SNS event; next enqueue to same address
    dropped.
  - DLQ replay: force a failure, ensure DLQ landing; replay CLI re-enqueues
    with reset attempts.

  SIZE: L (4-5 dev-days):
  - Day 1: scaffold apps/email-worker + packages/email-client, Dockerfile,
    Zod env validation.
  - Day 2: SES adapter + SMTP fallback + suppression list.
  - Day 3: 11 React Email templates (skeleton — copy from Madhuri in parallel).
  - Day 4: Wire-ins to auth/billing/drafting; idempotency keys; cron jobs
    (digest, monthly invoice); DLQ replay CLI.
  - Day 5: Tests + staging deploy + smoke.

  OUT OF SCOPE (separate tickets):
  - Marketing / drip emails.
  - WhatsApp / SMS notifications.
  - Inbound email parsing.
  - Notification preferences UI beyond single draftCompleteEmail boolean.
Dependencies: SCRUM-58 (Helicone — done; env/Sentry pattern reused), SCRUM-39 (env strategy — done), SCRUM-41 (Redis Cloud — done), SCRUM-15 (Sentry — done). Parallel-ops blockers (NOT blocking dev start): DNS for DKIM/SPF/DMARC + SES production-access (Arjun), template copy (Madhuri, blocks Day 4 only), legal disclaimer footer (Ajay, one-time).
---

## PICKUP ORDER UPDATE — 10 May 2026 (Priya, post SCRUM-77 filing)

> Adds SCRUM-77 (email infra) to the queue. P1, slots AFTER user-facing
> P0 work (SCRUM-69, 70 are already Done; SCRUM-65, 71 still in flight).
> Email infra is plumbing — it unblocks billing receipts, referral founder
> ping, and the founder digest, but does NOT block advocate-panel review.

REVISED CLEAN QUEUE (Pending — pick top-down by P0 → P1 → P2):

1. **SCRUM-65** — Annexures pack generator + separate affidavit page (P0, ~3-4 days)
2. **SCRUM-71** — Referral code system (P0, ~3 days)
3. **SCRUM-67** — Grounds-vs-facts coherence prompt rule (P1, ~1 day)
4. **SCRUM-75** — Court-rule golden-master tests (P1, ~4 hr — should land before SCRUM-65 ships)
5. **SCRUM-77** — Email system: BullMQ + SES + React Email + cross-service producer (P1, ~4-5 days). Slots HERE — after the user-facing P0s. Unblocks SCRUM-71 founder-ping email + SCRUM-73 receipt email + founder daily digest.
6. **SCRUM-51** — Hindi/bilingual full pipeline (Partial — resume when advocate-panel demand validates)
7. **SCRUM-76** — Helicone alerting runbook (P2, ~2 hr, doc only)
8. **SCRUM-59** — Credit-based free tier (P1, BLOCKED until SCRUM-73 sign-off)
9. **SCRUM-73** — Credit-based subscription master (P0, BLOCKED on founder/CFO Q1/Q2/Q3)

NEXT TOP-OF-QUEUE FOR VISHAL: **SCRUM-65** (annexures pack generator).
SCRUM-77 is queued but should NOT be picked up until SCRUM-65 + SCRUM-71 ship.
---

## TASKS FROM PRIYA — 12 MAY 2026 (template-wiring Sprint 1 — Arjun ADR approved)

> Founder approved Arjun's template-wiring ADR 2026-05-12.
> ADR ref: /team-warroom/2026-05-06/adr-template-wiring-2026-05-12.md
> Goal: cut per-template build cost from 6-8 hrs to ~10 min by treating
> CLO's 92 doc-rule JSONs (apps/drafting/src/config/document-rules/*.json)
> as source of truth and auto-promoting them into the existing TemplateConfig
> shape consumed by template-engine.service.ts. ~3 weeks Vishal total.
>
> 5 tickets filed below. Ship order locked: A+B+C in parallel → D (gate) → E.

---
ID: scrum-78-template-promoter
Filed by: Priya · PM
Filed on: 2026-05-12
Status: Done (Vishal-Opus, 2026-05-12)
Jira: SCRUM-78 (https://abhinava32.atlassian.net/browse/SCRUM-78)
Figma: N/A
Priority: P0
Task: Doc-rule → TemplateConfig promoter + boot-time sync
Details: |
  Reviewer: Arjun (CTO).

  CONTEXT:
  - CLO's 92 doc-rule JSONs at apps/drafting/src/config/document-rules/
    remain source of truth (CLO-authored). The existing
    template-engine.service.ts already consumes a canonical TemplateConfig
    shape. We need a one-shot normaliser.

  SCOPE:
  - Build apps/drafting/src/services/template-promoter.ts
  - Export promoteDocRuleToTemplateConfig(rule)
  - Mapping rules:
    - field_id → id
    - flatten steps[].fields[] → fields[]
    - carry over: mandatory_clauses, prompt_context, relevantActs,
      validation_rules, creditsCost, court_levels
  - Boot-time: walk config/document-rules/ directory, promote each JSON,
    register in in-memory template registry, log mismatches

  ACCEPTANCE:
  - All 92 docs promote cleanly with zero errors
  - Mismatch report saved on boot if any field is unmappable

  TESTS:
  - Unit on promoter for each schema variant present in the 92 JSONs
  - Integration on template-engine.service.ts after promoter wiring

  SIZE: S (1-2 days).
Dependencies: None — kicks off Sprint 1. Unblocks D (SCRUM-81) and C (SCRUM-80).
---

---
ID: scrum-79-dynamic-renderer-extend
Filed by: Priya · PM
Filed on: 2026-05-12
Status: Done (Vishal-Opus, 2026-05-12)
Jira: SCRUM-79 (https://abhinava32.atlassian.net/browse/SCRUM-79)
Figma: N/A — Priya owns UX
Priority: P0
Task: Extend DynamicFormRenderer for file/currency/regex types + cascading dropdowns
Details: |
  Reviewer: Priya (UX), Arjun (code).

  CONTEXT:
  - Per ADR, reuse the existing apps/web/src/components/form/
    DynamicFormRenderer.tsx instead of building per-template forms.
  - 92 CLO doc-rules collectively need three new field types + conditional
    + cascading rendering.

  SCOPE:
  - File: apps/web/src/components/form/DynamicFormRenderer.tsx
  - Add field types:
    - file (single + multi via shadcn FileUpload)
    - currency (rupee formatter, INR locale)
    - regex validation in zod
  - Add depends_on conditional rendering (e.g. show Marriage Date only
    if marriage_type === "registered")
  - Add cascading dropdowns (state → district → court)

  ACCEPTANCE:
  - All 4 features work in storybook
  - 92 doc-rules render without unsupported-type errors after SCRUM-78 lands

  TESTS:
  - Storybook story per new type
  - Unit tests on conditional + cascading logic

  SIZE: S (1 day).
Dependencies: None — runs in parallel with SCRUM-78 + SCRUM-80.
---

---
ID: scrum-80-template-auto-seed
Filed by: Priya · PM
Filed on: 2026-05-12
Status: Done (Vishal-Opus, 2026-05-12)
Jira: SCRUM-80 (https://abhinava32.atlassian.net/browse/SCRUM-80)
Figma: N/A
Priority: P0
Task: Auto-seed Template MongoDB collection from document-rules directory at boot
Details: |
  Reviewer: Arjun (CTO).

  CONTEXT:
  - Per ADR, Template Mongo collection becomes a read-through cache.
    Filesystem (config/document-rules/) is source of truth; DB is just an
    indexed view. usage_count moves out to a new TemplateUsage collection.

  SCOPE:
  - File: apps/drafting/src/scripts/seed-templates.ts + boot hook
  - Walks config/document-rules/, calls promoteDocRuleToTemplateConfig()
    (from SCRUM-78), upserts to Template collection
  - Move usage_count to a new TemplateUsage collection (separate concern)
  - Idempotent: running boot twice produces no diffs

  ACCEPTANCE:
  - App boot populates 92 Template records
  - Running boot twice is idempotent (no extra writes / no version churn)
  - Manual file edit triggers re-seed on next boot

  TESTS:
  - Unit on seed function (idempotency)
  - Integration: boot empty DB → 92 records; boot again → 0 writes

  SIZE: S (1 day).
Dependencies: SCRUM-78 (needs promoter to exist). Can be coded in parallel; wiring happens once SCRUM-78 lands.
---

---
ID: scrum-81-migrate-6-originals
Filed by: Priya · PM
Filed on: 2026-05-12
Status: Done — structural gate (Vishal-Opus, 2026-05-12) — PDF byte-diff deferred
Jira: SCRUM-81 (https://abhinava32.atlassian.net/browse/SCRUM-81)
Figma: N/A
Priority: P0
Task: Migrate 6 original templates to promoter path with golden-PDF diff gate
Details: |
  Reviewer: Ajay (CLO — legal-correctness on rendered output), Priya (UX flow).

  CONTEXT:
  - Validation gate after SCRUM-78 + 79 + 80 land. We need byte-level
    proof that the promoter path produces identical (or acceptably-close)
    output to today's hand-tuned production templates before retiring
    any overrides.

  SCOPE — 6 original templates:
  - bail_anticipatory
  - bail_regular
  - consumer_complaint
  - legal_notice_s138
  - legal_notice_s80
  - rent_agreement

  PER TEMPLATE:
  1. Confirm CLO's doc-rule JSON is canonical (no drift from prod)
  2. Run promoter → render → produce PDF
  3. Compare byte-for-byte against current production golden PDF
  4. If diff > 5% layout drift, keep hand-tuned docs/templates/{id}.json override
  5. If diff is clean, retire override; rely on promoter alone

  ACCEPTANCE:
  - 6/6 golden diffs pass OR overrides explicitly kept for any failures
    (with reason logged)

  TESTS:
  - PDF byte-diff suite per template
  - Both Bihar + Jharkhand payloads (reuse SCRUM-50 fixtures)

  SIZE: M (2-3 days).
Dependencies: SCRUM-78 + SCRUM-79 + SCRUM-80 must all land first. Gates SCRUM-82.
---

---
ID: scrum-82-hand-tune-top-10
Filed by: Priya · PM
Filed on: 2026-05-12
Status: To Do
Jira: SCRUM-82 (https://abhinava32.atlassian.net/browse/SCRUM-82)
Figma: N/A
Priority: P1
Task: Hand-tune prompt overrides for top-10 revenue-driver templates
Details: |
  Reviewer: Ajay (CLO).

  CONTEXT:
  - Per ADR, only top-10 revenue-driver templates get hand-tuned
    docs/templates/{id}.json overrides. Remaining 82 ride the auto-promoter.
  - Starts in parallel with SCRUM-81 batch shipping.

  SCOPE — top 10 (per Ajay's plan):
  1. interim_bail
  2. vakalatnama
  3. affidavit_in_support
  4. plaint_recovery
  5. written_statement
  6. divorce_mutual_consent
  7. maintenance_bnss_144
  8. dv_act_complaint
  9. temporary_injunction_o39
  10. quashing_528_bnss

  PER TEMPLATE:
  - Create docs/templates/{id}.json with hand-tuned system prompt + few-shot examples
  - Verify output quality against CLO checklist (court-readiness, factual
    correctness, prayer language, citations, annexures, formatting)

  ACCEPTANCE:
  - Smoke test all 10 templates × Bihar + Jharkhand payloads → CLO sign-off

  TESTS:
  - Smoke run per template per state (20 renders)
  - CLO checklist sign-off recorded in ticket

  SIZE: M (4-5 days).
Dependencies: Starts in parallel with SCRUM-81 batch shipping.
---

## PICKUP ORDER UPDATE — 12 May 2026 (Priya, post template-wiring ADR)

> Sprint 1 = template wiring. Locked ship order:
> 1. **SCRUM-78** (promoter) + **SCRUM-79** (renderer extend) + **SCRUM-80** (auto-seed) → parallel
> 2. **SCRUM-81** (migrate 6 originals + golden-PDF gate) → after 78+79+80
> 3. **SCRUM-82** (hand-tune top-10) → parallel with 81 shipping
>
> Sprint 1 sits AHEAD of pre-existing P0 queue (SCRUM-65, 71) only if founder explicitly switches focus. Default: finish SCRUM-65 + SCRUM-71 first per 2026-05-10 queue, then start SCRUM-78. Confirm with founder before pickup.
---