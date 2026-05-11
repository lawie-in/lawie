# Arjun · CTO · Jira SCRUM Sweep — 2026-05-08

> **Founder ask:** identify tickets where today's architectural decisions have made the original spec moot. Lawie must be PERFECT before Jharkhand advocate review — don't rush, but don't let Jira drift.
> **Source of truth:** /Users/abhinavanand/Files/Lawie/docs/inputToDev.md + war-room outputs at /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/.
> **Jira state pulled:** 2026-05-08 from abhinava32.atlassian.net, project SCRUM.
> **Note:** Priya executes the transitions/comments — this is analysis only.

---

## Headline counts

| Bucket | Count |
|---|---|
| CLOSE — superseded by architecture | **9** (epics + Vercel-era subtasks + abuse throttle) |
| CLOSE — already done under another key | **5** (SCRUM-60..64 — work shipped 2026-05-07) |
| MERGE | **2** |
| MODIFY | **3** |
| KEEP | **9** |
| Architectural follow-ups (new tickets) | **4** |

---

## CLOSE — Superseded by architecture

| SCRUM-N | Title | Why superseded | Replacement / ADR |
|---|---|---|---|
| SCRUM-12 | Next.js + Tailwind frontend — **Vercel deploy** + route scaffold | Vercel is dropped. Frontend runs as the `gateway-service` container on EC2 (Phase-1 architecture, lawie-aws-architecture.md). Route scaffold delivered via SCRUM-28 (landing) + SCRUM-37 (Next 15/React 19). | Replaced by SCRUM-28, SCRUM-34, SCRUM-37 (CTO memo 2026-04-23 — single-EC2 + Docker Compose) |
| SCRUM-16 | Auth + Billing Foundation (epic) | All children shipped: Google OAuth (SCRUM-17), Razorpay subscription + webhook (SCRUM-18), Dashboard states (SCRUM-19), Redis sessions + JWT denylist (SCRUM-41), Gateway rate-limit (SCRUM-42). | SCRUM-17, 18, 19, 41, 42 |
| SCRUM-20 | AI Document Drafter (epic) | Drafting engine shipped (SCRUM-23), three-layer template engine + 12 templates production-ready (SCRUM-43, 50, 52-56), CLO Round 4 APPROVED 2026-05-06. Master ticket has been split. | SCRUM-23, 43, 50, 52-56 |
| SCRUM-21 | Template Library — 15+ Indian Legal Templates (epic) | Scope changed: 12 templates production-ready under three-layer config-driven engine (SCRUM-43). "15+" target was Phase-2 ambition; current Phase-1 gate is the Jharkhand pack on the 12 we have. | SCRUM-43, SCRUM-50 (court rules), SCRUM-52-56 (CLO fixes) |
| SCRUM-22 | Section Finder — Legal Provision Lookup (epic) | Delivered as BNS/BNSS/BSA mapping (SCRUM-27, CLO-validated 2026-04-28) + free-tool section converter (SCRUM-46, live 2026-05-06). | SCRUM-27, SCRUM-46 |
| SCRUM-24 | Court-specific formatting engine + PDF/DOCX export (epic) | Decomposed into three live tickets: court rules (SCRUM-50, Done), server-side PDF pipeline (SCRUM-57, in queue), full editor + DOCX (SCRUM-44 + 60-64 + 65-71). The umbrella has no remaining unique scope. | SCRUM-50, SCRUM-57, SCRUM-44 split |
| SCRUM-26 | Advocate dashboard — vault + usage + quick-create | Dashboard states + settings shipped via SCRUM-19. Vault/usage details now belong to the credit-system master (SCRUM-73). No incremental scope left here. | SCRUM-19, SCRUM-73 |
| SCRUM-29, 30, 31, 32 | Landing-page subtasks (copy, HTML/CSS, email capture, lawie.in HTTPS) | Rolled into SCRUM-28 which is Done. Subtasks carry no extra acceptance criteria. | SCRUM-28 |
| SCRUM-35 | Redis Cloud free tier setup + connection | Redis Cloud already provisioned and in production via SCRUM-41 (Redis sessions + JWT denylist, Done 2026-04-25). | SCRUM-41 |
| SCRUM-72 | Abuse throttle on Rs 799 plan | Abandoned as a standalone control. Founder + Vikram + Meera approved hybrid subscription + credit-economy model on 2026-05-08; abuse mitigation now lives inside SCRUM-73. Already marked Done in Jira — confirm closure rationale comment is on the ticket. | SCRUM-73 (credit-based subscription) |

(Counts row totals 9 entries — SCRUM-29/30/31/32 collapse into one line on the founder's "13 stale epics" list.)

## CLOSE — Already done under another key

| SCRUM-N | Title | Where the work actually lives | Original key absorbed |
|---|---|---|---|
| SCRUM-25 | Compliance layer — disclaimers, encryption, ToS, Privacy Policy | Disclaimer in body + footer shipped via drafting engine (SCRUM-23, SCRUM-62). AES-256-GCM encryption shipped via SCRUM-11. ToS/Privacy Policy still pending but is content work, not engineering. | SCRUM-11, SCRUM-23, SCRUM-62 (eng portion) |
| SCRUM-60 | Export script — markdown parser, watermark removal, CSS polish | Shipped 2026-05-07 (Vishal-Sonnet, inputToDev line 1305). Jira still shows To Do — needs status sync. | Same key — Jira update only |
| SCRUM-61 | Template engine — recursive placeholder pass + court-rule audit | Shipped 2026-05-07 (Vishal-Sonnet, inputToDev line 1351). Jira still shows To Do. | Same key — Jira update only |
| SCRUM-62 | AI prompt hardening + body output sanitiser | Shipped 2026-05-07 (Vishal-Sonnet, inputToDev line 1394). Jira still shows To Do. | Same key — Jira update only |
| SCRUM-63 | Form input normaliser — strip duplicate prefixes (PS, etc.) | Shipped 2026-05-07 (Vishal-Sonnet, inputToDev line 1437). Jira still shows To Do. | Same key — Jira update only |
| SCRUM-64 | Fact↔section validator + BNS whitelist constraint on AI prompt | Shipped 2026-05-07 (Vishal-Sonnet, inputToDev line 1478). Jira still shows To Do. | Same key — Jira update only |

## MERGE

| SCRUM-N | Should merge into | Reason |
|---|---|---|
| SCRUM-66 | SCRUM-65 | Per inputToDev line 1620: "SCRUM-65 if folded into the annexure pack; otherwise standalone." Verification affidavit is one of the seven mandatory annexures — single PR, single review, single deploy. Cleaner as one ticket. |
| SCRUM-68 | SCRUM-69 | Per inputToDev line 1689: "can ship as part of 69 if Vishal prefers." FIR year/date mismatch is one rule inside the pre-generation verification layer — keeping it separate creates two-PR overhead for ~30 LOC. |

## MODIFY

| SCRUM-N | Current spec | Updated spec |
|---|---|---|
| SCRUM-44 | "Rich text document editor + PDF/DOCX export + filing checklist panel" — was the master ticket; currently In Progress in Jira | Re-scope to **DOCX export + filing checklist + activation event only**. Editor surface (TipTap/Lexical) is **descoped from Phase 1** — the war-room build queue (SCRUM-65..71) plus existing read-only + regenerate flow is sufficient for the Jharkhand pack. PDF pipeline lives in SCRUM-57. AC update: (a) `POST /api/documents/:id/export?format=docx` server-side, (b) checklist panel on dashboard, (c) `activation_first_export` event in Mongo `Event` collection. Add comment linking to SCRUM-60..64 (cosmetics shipped) and SCRUM-65 (annexure pack — true filing-grade output). |
| SCRUM-45 | "Free Legal Tools — Traffic magnets for advocate acquisition" (epic) | Deprioritise to Phase-2 backlog. SCRUM-46 (section converter) is live; SCRUM-47 + SCRUM-48 stay open as standalone Stories. The epic adds no scope — close-or-rescope when SCRUM-47 ships. Founder call. |
| SCRUM-50 | "Indian courts database + cascading dropdowns + court-specific formatting rules" — already Done, but original AC predates the 7-field schema rewrite + 11-file court-rule structure (CLO Round 4) | No status change (correctly Done). **AC needs a closure comment** confirming: 7-field schema, 11 court-rule files, 357/357 drafting tests pass, CLO Round 4 verdict APPROVED 2026-05-06. Ensures audit trail for advocate review. |

## KEEP — still valid

| SCRUM-N | Why keep |
|---|---|
| SCRUM-44 | Critical Phase-1 gate (export pipeline) — kept after MODIFY above. |
| SCRUM-47 | Bail eligibility checker — top-of-funnel SEO surface, low-risk ship. CTO-APPROVED. |
| SCRUM-48 | BNSS investigation timeline tracker — second free tool, builds on SCRUM-27 mapping. |
| SCRUM-51 | Multilingual Hindi + bilingual generation — large Phase-2 effort but on roadmap. Hold until advocate-panel feedback validates demand. |
| SCRUM-57 | CLI export script — gates the Friday Ranchi advocate pack. P0. |
| SCRUM-58 | Helicone proxy + per-user spend caps — non-negotiable Day-1 cost observability before opening any free credits at scale. |
| SCRUM-59 | Credit-based free tier (signup + daily login + rating earn) — first slice of the SCRUM-73 master credit system. Ships post-Helicone. |
| SCRUM-65 (after merging 66) | Annexures pack generator — filing-grade gate. Without this, the pack remains "design preview, not for filing." |
| SCRUM-67 | Grounds-vs-facts coherence prompt rule — last-mile draft quality. Distinct enough from 69 to keep. |
| SCRUM-69 (after merging 68) | Pre-generation verification layer — ADR-018, Sonnet hybrid, soft+hard rules. The single biggest defect-prevention investment. |
| SCRUM-70 | Status bar UI — paired with 69, but distinct surface area (frontend stepper). |
| SCRUM-71 | Referral code system — required for advocate-panel distribution + 25 free drafts. |
| SCRUM-73 | Credit-based subscription system (master) — replaces SCRUM-72; founder approved 2026-05-08. Still in design/scoping. |

## Architectural follow-ups (new tickets that should be filed)

| Title | Reason | Priority |
|---|---|---|
| Jharkhand advocate-panel review pipeline | CLO Round 3 explicitly required a feedback-capture pipeline for the panel (12 PDFs out, structured returns in). No ticket exists. Blocks closing the loop on Jharkhand pack. | P0 — file before Friday |
| ADR-019: Editor descope decision (Phase 1) | Codify the SCRUM-44 MODIFY above. "We are not shipping a rich-text editor in Phase 1; advocates regenerate from form." Future devs need to know why. | P1 — file with the SCRUM-44 modify |
| Court-rule golden-master regression suite | SCRUM-50 has 357/357 passing tests on drafting, but no golden-master diff on the 13 court-rule JSONs. One stray edit = silent formatting regression on a filed brief. CTO posture: must exist before advocate-panel feedback opens us to changes. | P1 — before SCRUM-65 ships |
| Helicone alerting + per-user kill-switch runbook | SCRUM-58 wires the proxy. We also need: (a) PagerDuty/email alert on per-user spend > Rs 100/day, (b) one-line kill-switch to disable a user via Mongo flag, (c) ops runbook in Notion Engineering. | P1 — same sprint as SCRUM-58 |

---

## Special-focus answers (founder's checklist)

1. **13 stale epics (SCRUM-12, 16, 20, 21, 22, 24, 25, 26, 29-32, 35):** all 13 close as Superseded with comment pointing to children. Mapping is in the two CLOSE tables above.
2. **SCRUM-44 (master editor + export):** **NOT Done.** Jira shows In Progress. Reality: cosmetic + safety bugs shipped under SCRUM-60-64. The editor surface itself was never started. **Decision:** MODIFY the AC to descope the editor and keep the DOCX-export + checklist + activation-event slice. See MODIFY table.
3. **SCRUM-44.x sub-tickets (60-64):** all five shipped per inputToDev (Vishal-Sonnet, completed 2026-05-07). Jira still shows To Do. Priya transitions all five to Done.
4. **SCRUM-72 (abuse throttle):** already Done in Jira, superseded by SCRUM-73. Confirm closure comment links to SCRUM-73 — if not, add it.
5. **SCRUM-50 (court rules):** correctly Done. Add a closure comment summarising CLO Round 4 verdict + 357/357 tests passing for audit trail. See MODIFY table.
6. **Vercel/ECS/Confluence/Slack/Linear/Figma references:** Vercel removed from architecture (SCRUM-12 supersede covers this). ECS Fargate is explicit Phase-2 — referenced as deferred, no live ticket assumes it. Confluence dropped (Notion is single source of truth per memory file). Slack/Linear never adopted. Figma is still in use for design (Rajesh) but only as a per-task asset, not as a tooling-tier choice — no tickets need supersede on this.

---

## Decision summary (ADR-style)

**Assumption:** Jira hygiene matters because Phase-1 "perfect" requires every open ticket to map to either (a) shippable code this sprint or (b) explicit Phase-2 deferral.
**Risk:** drift between inputToDev (truth) and Jira (board) makes velocity reporting and advocate-panel readiness opaque to the founder.
**Decision:** Close 14 tickets, modify 3, keep 13 open in Phase-1 queue, file 4 new architectural follow-ups.

Ready for next task.
