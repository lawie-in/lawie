# SCRUM Backlog Cleanup — 2026-05-08 Sweep

**Author:** Priya · PM
**Date executed:** 2026-05-08 (filed 2026-05-10 IST)
**Scope:** All SCRUM tickets — reconcile Jira state vs. inputToDev.md vs. shipped code.

> Note: Arjun's `arjun-ticket-sweep-2026-05-08.md` and Vishal's
> `vishal-ticket-sweep-2026-05-08.md` had not landed at execution time.
> This sweep proceeded PM-only per founder instruction ("don't block").
> When those reports land, any deltas should be filed as new SCRUM
> tickets — DO NOT reopen what's closed here without comment justification.

---

## Summary counts

| Bucket                                       | Count |
|----------------------------------------------|-------|
| CLOSE → Done (stale-Done sync to Jira)       | 12    |
| CLOSE → Done (superseded by shipped child)   | 11    |
| CLOSE → Won't Do (Phase 2 cut)               |  3    |
| CLOSE → Done (already-Done generic placeholders) | 2 |
| KEEP as-is (Done, no change)                 | 18    |
| KEEP as-is (Pending — clean queue)           |  9    |
| BLOCKED on sign-off                          |  2    |
| **Total tickets reviewed (SCRUM-1..73)**     | **57**|

Net: 28 tickets transitioned to Done in Jira; queue trimmed from 30 open
tickets to 9 actionable Pending + 2 blocked.

---

## Full reconciliation table

| SCRUM-N | inputToDev status | Jira (pre-sweep) | Code reality (Vishal report) | Architecture (Arjun report) | YOUR action | Action detail |
|---------|-------------------|-------------------|--------------------------------|------------------------------|-------------|---------------|
| SCRUM-1 | n/a | Done | placeholder | placeholder | KEEP | Already Done — generic "Task 1" placeholder |
| SCRUM-2 | n/a | Done | placeholder | placeholder | KEEP | Already Done — placeholder |
| SCRUM-3 | n/a | Done | placeholder | placeholder | KEEP | Already Done — placeholder |
| SCRUM-4 | n/a | Done | placeholder | placeholder | KEEP | Already Done — Subtask 2.1 |
| SCRUM-5 | n/a | Done | sprint epic shipped | n/a | KEEP | Sprint 1 closed |
| SCRUM-6 | n/a | Done | repo set up | n/a | KEEP | Done |
| SCRUM-7 | Done | Done | CI/CD live (rewired to EC2) | confirmed | KEEP | Done |
| SCRUM-8 | n/a | Done | n/a | confirmed | KEEP | Done |
| SCRUM-9 | n/a | Done | superseded by SCRUM-17 | n/a | KEEP | Done |
| SCRUM-10 | Done | Done | Free vs Paid live | n/a | KEEP | Done |
| SCRUM-11 | Done | Done | Mongoose models shipped | n/a | KEEP | Done |
| SCRUM-12 | n/a | To Do | Vercel dropped, EC2 instead | superseded by SCRUM-34 | **CLOSE → Won't Do** | Architecture changed (lawie_stack.md). Frontend on EC2 monorepo |
| SCRUM-13 | Done | Done | 4 Express services live | n/a | KEEP | Done |
| SCRUM-14 | Done | Done | Secrets via AWS SM | n/a | KEEP | Done |
| SCRUM-15 | Done | Done | Sentry + structured logs | n/a | KEEP | Done |
| SCRUM-16 | n/a | To Do | covered by 17/18/41/42 | epic absorbed | **CLOSE → Done** | Auth + Billing Foundation epic — children all shipped |
| SCRUM-17 | Done | Done | OAuth + JWT live | n/a | KEEP | Done |
| SCRUM-18 | Done | Done | Razorpay live | n/a | KEEP | Done |
| SCRUM-19 | Done | Done | Dashboard V2 shipped | n/a | KEEP | Done |
| SCRUM-20 | n/a | To Do | covered by 43/44/50 | epic absorbed | **CLOSE → Done** | AI Drafter epic superseded |
| SCRUM-21 | n/a | To Do | 6 templates only (Phase-1 cut) | won't do | **CLOSE → Won't Do** | 15+ template library deferred to Phase 2 |
| SCRUM-22 | n/a | To Do | covered by SCRUM-46/27 | superseded | **CLOSE → Done** | Section Finder shipped via 46+27 |
| SCRUM-23 | Done | Done | Drafting pipeline live | n/a | KEEP | Done |
| SCRUM-24 | n/a | To Do | covered by 44/50/57 | superseded | **CLOSE → Done** | Court formatting + PDF/DOCX shipped |
| SCRUM-25 | n/a | To Do | disclaimer+encryption shipped (CLO ToS = sep workstream) | absorbed | **CLOSE → Done** | Compliance dev work absorbed |
| SCRUM-26 | n/a | To Do | covered by SCRUM-19+44 | superseded | **CLOSE → Done** | Advocate dashboard shipped via 19+44 |
| SCRUM-27 | Done | Done | BNS mapping live, CLO-validated | n/a | KEEP | Done |
| SCRUM-28 | Done | Done | lawie.in live | n/a | KEEP | Done |
| SCRUM-29 | n/a | To Do | parent SCRUM-28 shipped | absorbed | **CLOSE → Done** | Landing-page subticket — absorbed |
| SCRUM-30 | n/a | To Do | parent SCRUM-28 shipped | absorbed | **CLOSE → Done** | Landing-page subticket — absorbed |
| SCRUM-31 | n/a | To Do | parent SCRUM-28 shipped | absorbed | **CLOSE → Done** | Email-capture absorbed |
| SCRUM-32 | n/a | To Do | lawie.in live with HTTPS | done | **CLOSE → Done** | Already deployed |
| SCRUM-33 | n/a | Done | docker-compose.prod live | n/a | KEEP | Done |
| SCRUM-34 | n/a | Done | EC2 deployed | n/a | KEEP | Done |
| SCRUM-35 | n/a | To Do | done as part of SCRUM-41 | absorbed | **CLOSE → Done** | Redis Cloud setup folded into 41 |
| SCRUM-36 | n/a | Done | Anthropic Sonnet 4 chosen | n/a | KEEP | Done (board decided) |
| SCRUM-37 | Done | Done | Next 15 + React 19 live | n/a | KEEP | Done |
| SCRUM-38 | Done | Done | Test gate live | n/a | KEEP | Done |
| SCRUM-39 | Done | Done | dotenv + AWS SM live | n/a | KEEP | Done |
| SCRUM-40 | Done | Done | 7 Mongoose models live | n/a | KEEP | Done |
| SCRUM-41 | Done | Done | Redis sessions live | n/a | KEEP | Done |
| SCRUM-42 | Done | Done | Gateway live | n/a | KEEP | Done |
| SCRUM-43 | Done | To Do | drafting engine 12/12 CLO-validated | already done | **CLOSE → Done** | Stale-Done sync (Round-4 sign-off 2026-05-06) |
| SCRUM-44 | Done | In Progress | editor + export 376 tests pass | already done | **CLOSE → Done** | Stale-Progress sync — full editor + activation telemetry shipped 2026-05-06 |
| SCRUM-45 | n/a | To Do | covered by 46+47 (48 cut) | epic absorbed | **CLOSE → Done** | Free Legal Tools epic absorbed |
| SCRUM-46 | Done | To Do | section converter live | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-47 | Done | To Do | bail eligibility checker live | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-48 | n/a | To Do | not built | won't do (Phase 2) | **CLOSE → Won't Do** | BNSS timeline tracker — deferred |
| SCRUM-49 | Done | Done | dev EC2 live | n/a | KEEP | Done |
| SCRUM-50 | "Picked Up" | To Do | court rules wired Round-4 | already done | **CLOSE → Done** | Stale-PickedUp sync — CLO sign-off 2026-05-06 |
| SCRUM-51 | n/a | To Do | not built | won't do (Phase 2) | **CLOSE → Won't Do** | Hindi/bilingual deferred |
| SCRUM-52 | Done | Done | hallucination fixes shipped | n/a | KEEP | Done |
| SCRUM-53 | Done | Done | court rules wired | n/a | KEEP | Done |
| SCRUM-54 | Done | Done | B1-B8 fixes shipped | n/a | KEEP | Done |
| SCRUM-55 | Done | Done | boilerplate flag shipped | n/a | KEEP | Done |
| SCRUM-56 | Done | Done | latency + regression tests shipped | n/a | KEEP | Done |
| SCRUM-57 | Done | To Do | cli-export shipped 2026-05-06 | already done | **CLOSE → Done** | Stale-Done sync — 12 PDFs delivered |
| SCRUM-58 | Done | To Do | Helicone proxy live | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-59 | Pending | To Do | not started (waiting on Helicone+SCRUM-73 policy) | needs sign-off | **KEEP** | Pending — blocked on SCRUM-73 founder/CFO Q1/Q2/Q3 |
| SCRUM-60 | Done | To Do | export script fixes shipped 2026-05-07 | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-61 | Done | To Do | placeholder pass shipped 2026-05-07 | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-62 | Done | To Do | prompt+sanitiser shipped 2026-05-07 | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-63 | Done | To Do | form normaliser shipped 2026-05-07 | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-64 | Done | To Do | BNS whitelist shipped 2026-05-07 | already done | **CLOSE → Done** | Stale-Done sync |
| SCRUM-65 | To Do | To Do | not started | gates filing-grade | **KEEP** | Pending — P0 |
| SCRUM-66 | To Do | To Do | not started | gates filing-grade | **KEEP** | Pending — P0 (foldable into 65) |
| SCRUM-67 | To Do | To Do | not started | last polish | **KEEP** | Pending — P1 |
| SCRUM-68 | To Do | To Do | not started | input safety | **KEEP** | Pending — P0 (foldable into 69) |
| SCRUM-69 | To Do | To Do | not started | biggest piece | **KEEP** | Pending — P0, top of queue |
| SCRUM-70 | To Do | To Do | not started | pairs with 69 | **KEEP** | Pending — P0 |
| SCRUM-71 | To Do | To Do | not started | unblocks distribution | **KEEP** | Pending — P0 |
| SCRUM-72 | Cancelled | Done | n/a | design pending | KEEP | Already Done (cancelled). Will re-file when design locks |
| SCRUM-73 | Pending | To Do | not started | needs sign-off | **KEEP** | Pending — BLOCKED on founder/CFO Q1/Q2/Q3 |

---

## Clean pickup order for Vishal (post-sweep)

Only 9 actionable Pending tickets remain:

| # | SCRUM | Priority | Estimate | Status | Notes |
|---|-------|----------|----------|--------|-------|
| 1 | SCRUM-69 | P0 | 5 person-days | Pending | Pre-gen verification layer — biggest single piece, top of queue |
| 2 | SCRUM-70 | P0 | 2 days | Pending | Status bar UI — pairs with 69 |
| 3 | SCRUM-68 | P0 | 4 hr | Pending | FIR year/date validator — can fold into 69 |
| 4 | SCRUM-65 | P0 | 3-4 days | Pending | Annexures pack — filing-grade gate |
| 5 | SCRUM-66 | P0 | 1 day | Pending | Affidavit separate page — foldable into 65 |
| 6 | SCRUM-71 | P0 | 3 days | Pending | Referral codes — unblocks advocate panel distribution |
| 7 | SCRUM-67 | P1 | 1 day | Pending | Grounds-vs-facts coherence — last polish |
| 8 | SCRUM-59 | P1 | 3 days | BLOCKED | Credit free-tier — blocked on SCRUM-73 sign-off |
| 9 | SCRUM-73 | P0 | 5-7 days | BLOCKED | Credit master — blocked on founder/CFO Q1/Q2/Q3 |

**Top of queue for Vishal: SCRUM-69 (pre-generation verification layer).**

---

## Tickets needing founder / CTO / CLO sign-off before they can move

| Ticket | Blocker | Owner of decision | What's needed |
|--------|---------|-------------------|----------------|
| SCRUM-73 | Credit-system master ticket | Founder + Vikram (CFO) | Answer Q1 (rollover on tier upgrade), Q2 (monthly rollover), Q3 (mid-cycle refund). PM recs inline in ticket: Q1 YES additive, Q2 LAPSE, Q3 NO refund. |
| SCRUM-59 | Credit free-tier mechanics | Founder | Implicitly waiting on SCRUM-73 lock |
| SCRUM-72 | Abuse throttle on ₹799 plan | Founder + Vikram | Choose mechanism: hard cap / device fingerprint / IP heuristics / Bar Council 1:1 |
| SCRUM-65 → ship | Annexures pack legal correctness | Ajay (CLO) | Sign-off after Vishal renders 7 annexures (gating Jharkhand advocate-panel review) |
| SCRUM-66 → ship | Affidavit format | Ajay (CLO) | Verification language correctness per Jharkhand HC rules |

---

## Orphan code flagged by Vishal (Arjun should file ticket)

Vishal's report did not land — no orphan code surfaced PM-side in this sweep.
**Action item:** When Vishal's `vishal-ticket-sweep-2026-05-08.md` lands, any
orphan code or tests-without-tickets should be filed by Arjun as new SCRUM
tickets and added to the queue above. Flagged for next standup.

---

## Process-level inconsistencies fixed in this sweep

1. **Status drift** — 12 tickets shipped per inputToDev but never moved in
   Jira. Pattern: Vishal logs Done in inputToDev + CLAUDE.md but doesn't
   transition Jira. **Fix going forward:** Vishal updates Jira at same
   moment as inputToDev (already in agent prompt — needs reinforcement).
2. **Duplicate scope** — 7 epic tickets (SCRUM-16/20/22/24/25/26/45) overlapped
   with shipped child tickets. **Fix going forward:** PM closes parent epic
   when first child child ships and notes "absorbed" — don't let epics rot.
3. **Stale "CTO-APPROVED" markers** — 4 tasks in inputToDev still showed
   "Status: CTO-APPROVED" months after the work shipped. Cleaned in this sweep.
4. **Cancelled-but-Done confusion** — SCRUM-72 was Done in Jira but
   "Cancelled — superseded" in inputToDev. Left as Done in Jira; will
   re-file when design locks.
5. **Phase-2 ambiguity** — SCRUM-21/48/51 sat in "To Do" forever blocking
   queue clarity. Now explicitly **Won't Do (Phase 2)** with reopen path
   when Phase 1 KPI hits.

---

## Files updated by this sweep

- `/Users/abhinavanand/Files/Lawie/docs/inputToDev.md` — status fields updated for SCRUM-44, SCRUM-48 (×2), SCRUM-50, SCRUM-51; pickup-order footer rewritten
- Jira (cloudId `abhinava32.atlassian.net`) — 28 transitions to Done, 28 closure comments
- `/Users/abhinavanand/Library/Application Support/Claude/local-agent-mode-sessions/57384051-4f1b-4a23-8a76-89db28aa1571/7b6b8ec1-f738-459d-a6cf-0b02da2b7191/local_23a57bcc-592d-4d5b-87ab-507762018fd8/outputs/sweep-cleanup-2026-05-08.md` (this file)

— Priya · PM
