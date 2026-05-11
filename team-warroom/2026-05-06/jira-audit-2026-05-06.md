# Jira State Audit — Lawie / SCRUM project
Date: 2026-05-06
Author: Priya (PM)
Source files: docs/inputToDev.md, docs/CLAUDE.md (Vishal diary)
Jira instance: abhinava32.atlassian.net · Project key: **SCRUM**

---

## 1. Ticket-by-ticket state audit

| Ticket | Title (short) | Real-world status | Likely Jira state | Stale? | Notes |
|--------|---------------|-------------------|-------------------|--------|-------|
| SCRUM-7 | CI/CD deploy step rewire (EC2 + Docker Compose) | Done 2026-04-23 | Should be Done | Verify | Replaced ECS path |
| SCRUM-10 | Free vs Paid access control (5 docs/mo, template gating) | Done 2026-04-25 | Should be Done | Verify | Watermark deferred |
| SCRUM-11 | Mongoose schema (User, Document, Template, Generation) | Done 2026-04-19 | Should be Done | Verify | |
| SCRUM-13 | Express monolith → 4 microservices | Done 2026-04-19 | Should be Done | Verify | |
| SCRUM-14 | Secrets mgmt + Terraform revert | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-15 | Logging + Sentry | Done 2026-04-25 | Should be Done | Verify | |
| SCRUM-17 | Google OAuth + JWT 7-day | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-18 | Razorpay subscription + webhook | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-19 | Dashboard (free/paid) + settings | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-23 | AI drafting (Sonnet 4 streaming + disclaimer) | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-27 | BNS/BNSS/BSA section mapping | Done 2026-04-26, CLO-validated 2026-04-28 | May still be In Review | **Likely stale** — push to Done |
| SCRUM-28 | Landing page | Done pre-2026-04-19 | Should be Done | Verify | |
| SCRUM-33 | docker-compose.prod.yml | Done 2026-04-23 | Should be Done | Verify | |
| SCRUM-34 | EC2 Phase-1 deployment | Done 2026-04-23 | Should be Done | Verify | demo.lawie.in live |
| SCRUM-36 | AI provider decision | Resolved (Claude Sonnet 4) | Should be Done | Verify | |
| SCRUM-37 | Next.js 15 / React 19 upgrade | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-38 | Test automation (Jest/Vitest + CI gate) | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-39 | dotenv + AWS Secrets Manager strategy | Done 2026-04-24 | Should be Done | Verify | |
| SCRUM-40 | 7 Mongoose models | Done 2026-04-25 | Should be Done | Verify | |
| SCRUM-41 | Redis sessions + logout | Done 2026-04-25 | Should be Done | Verify | |
| SCRUM-42 | Gateway JWT validation + plan rate-limit | Done 2026-04-25 | Should be Done | Verify | |
| SCRUM-43 | Three-layer drafting / config-driven template engine | Done 2026-05-06 (CLO Round 4 APPROVED) | Likely In Review / In Progress | **Stale** — push to Done |
| SCRUM-44 | Rich text editor + PDF/DOCX export + filing checklist | "Picked Up" by Vishal 2026-04-28 — but no progress visible in last 4 diary sessions; CTO-APPROVED entry re-filed 2026-04-28 | Likely In Progress | **Stale** — actually NOT started; re-set to To Do |
| SCRUM-46 | Section converter (free tool) | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |
| SCRUM-47 | Bail eligibility checker (free tool) | Not started, CTO-APPROVED | To Do / Backlog | OK |
| SCRUM-48 | BNSS investigation timeline tracker | Not started, CTO-APPROVED | To Do / Backlog | OK |
| SCRUM-49 | AWS t2.micro dev/demo env | Done 2026-04-27 | Should be Done | Verify |
| SCRUM-50 | Court rules (7-field schema, 11 files) | Code done 2026-05-06; pending CLO item-11 sign-off | In Review | Confirm; close once Ajay signs |
| SCRUM-51 | Hindi / bilingual generation + export | Not started, CTO-APPROVED | To Do / Backlog | OK |
| SCRUM-52 | CLO-flagged drafting fix #1 | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |
| SCRUM-53 | CLO-flagged drafting fix #2 | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |
| SCRUM-54 | CLO-flagged drafting fix #3 | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |
| SCRUM-55 | CLO-flagged drafting fix #4 | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |
| SCRUM-56 | CLO-flagged drafting fix #5 | Done 2026-05-06 | Likely In Progress | **Stale** — push to Done |

### Likely-stale tickets (Jira reconciliation queue)
1. SCRUM-27 — move In Review → Done (Ajay validated 2026-04-28)
2. SCRUM-43 — move to Done (CLO Round 4 APPROVED, 12/12 production-ready)
3. SCRUM-44 — reset Picked Up → To Do (Vishal never actually started; re-filed 2026-04-28)
4. SCRUM-46 — push to Done
5. SCRUM-50 — currently Picked Up; awaiting CLO item-11 sign-off — chase Ajay today
6. SCRUM-52 / 53 / 54 / 55 / 56 — push to Done
7. New ticket needed: **Jharkhand advocate-panel review pipeline** (CLO Round 3 explicitly called for one; not yet created)
8. New ticket needed: **PDF export pipeline** (referenced in CLO Round 4 item 7 — "use the export pipeline" — not yet built; actually a sub-task of SCRUM-44)

---

## 2. Next 3 tickets to build — strict priority order

### #1 — SCRUM-44: Editor + PDF/DOCX export + filing checklist  (P0)
**Why first:** This is the single biggest gate to first paid user.
- Activation metric = first drafted document → exported PDF. Today there is no export. Without it, advocates cannot file what Lawie generates and will never pay Rs.799.
- CLO Round 3 + Round 4 explicitly require PDF export to bundle the 12 advocate-review pack. **Without PDF, the Jharkhand bar association review cannot happen.**
- All upstream blockers are now green: drafting engine (SCRUM-43) is CLO-approved, court rules (SCRUM-50) wired in, persistence + sectionsCited done.
- SCRUM-44 was "Picked Up" 2026-04-28 but Vishal pivoted to CLO Rounds 1-4 — it has effectively been on ice for 8 days. Must re-pick with fresh scope.

### #2 — Jharkhand advocate-panel review pack (NEW SCRUM ticket needed)
**Why second:** Once SCRUM-44 lands, generate the 12 PDFs and ship the pack. This is the Phase-1 demand-validation gate before first paying user. CLO has already approved the drafts — the only missing step is the export.

### #3 — SCRUM-47: Bail eligibility checker (free tool)
**Why third:** Top-of-funnel. SCRUM-46 (section converter) is live and is our only SEO/free-acquisition surface. SCRUM-47 stacks the second free tool, doubles indexable surface area for "bail eligibility" queries (high intent for our exact target — district court advocates), and is low-risk: data already in BNSS section mapping (SCRUM-27). Estimated 1-2 days. Better than starting SCRUM-51 (Hindi) which is large and unvalidated demand.

### Why NOT these next:
- **SCRUM-51 (Hindi)** — large effort, demand unconfirmed. Wait for advocate-panel feedback first.
- **SCRUM-48 (timeline tracker)** — useful but second free tool of same kind as 47; pick one, ship, measure.
- **Pure refactor / test debt** — busywork at this stage.

---

## 3. Sign-offs needed before Vishal starts SCRUM-44

| Owner | What | Status |
|-------|------|--------|
| Arjun (CTO) | Editor library choice (TipTap vs Lexical) and PDF/DOCX library choice (e.g. puppeteer/react-pdf vs docx) | **Needed** — flag in his next sync |
| Rajesh (Designer) | Figma for editor surface, checklist panel, export modal | **Needed** before UI work starts |
| Ajay (CLO) | Final sign-off on SCRUM-50 item 11 (court rules CLO re-validation) | **Pending** — not blocking SCRUM-44 directly but blocks closing SCRUM-50 |
| Founder | Confirm 12-PDF advocate pack distribution plan via Ranchi bar contacts | Confirmed in brief — proceed |

Vishal CAN start SCRUM-44 backend (export endpoint, persistence wiring) in parallel without Figma. UI work blocked until Rajesh delivers.

---

## 4. New inputToDev.md entry (paste-ready)

See chat response.
