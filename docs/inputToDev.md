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
Status: Picked Up
Picked up on: 2026-04-28
Picked up by: Vishal-Opus

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
Status: CTO-APPROVED

## TASK 6 — 26 Apr 2026
Ticket: SCRUM-48 (https://abhinava32.atlassian.net/browse/SCRUM-48)
What: Free tool — BNSS investigation timeline tracker (custody + chargesheet deadlines)
Status: CTO-APPROVED

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
Status: CTO-APPROVED

## TASK 4 — 28 Apr 2026
Ticket: SCRUM-44 (https://abhinava32.atlassian.net/browse/SCRUM-44)
What: Guided form (cards + dropdowns) + rich text editor + PDF/DOCX export. Read Priya's comment for form UX details.
Status: CTO-APPROVED

## TASK 5 — 28 Apr 2026
Ticket: SCRUM-51 (https://abhinava32.atlassian.net/browse/SCRUM-51)
What: Hindi + bilingual document generation and export
Status: CTO-APPROVED

## TASK 6 — 28 Apr 2026
Ticket: SCRUM-46 (https://abhinava32.atlassian.net/browse/SCRUM-46)
What: Free tool — IPC↔BNS / CrPC↔BNSS / IEA↔BSA section converter
Status: Done
Completed on: 2026-05-06

## TASK 7 — 28 Apr 2026
Ticket: SCRUM-47 (https://abhinava32.atlassian.net/browse/SCRUM-47)
What: Free tool — bail eligibility checker
Status: CTO-APPROVED

## TASK 8 — 28 Apr 2026
Ticket: SCRUM-48 (https://abhinava32.atlassian.net/browse/SCRUM-48)
What: Free tool — BNSS investigation timeline tracker
Status: CTO-APPROVED

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

Status: Picked Up
Picked up on: 2026-05-06
Picked up by: Vishal-Opus
Notes: All 11 items audited — items 1-9 already implemented in prior sessions. Item 10 (tests) completed: 140 tests in court-rules.test.ts covering formattingRulesRef resolution, 7 required fields, case_nomenclature lookup, placeholder merge, consistency checks. Fixed consumer_commission_generic.json (added state party_designation, prayer closing, corrected tone). 357/357 drafting tests pass. Pending CLO re-validation (item 11) before moving to Done.

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