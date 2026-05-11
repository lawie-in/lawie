# SCRUM Backlog — Round-2 Delta Sweep — 2026-05-10

**Author:** Priya · PM
**Filed:** 2026-05-10
**Trigger:** Founder approved 2026-05-10 most of Arjun's + Vishal's sweep deltas (which landed AFTER Priya's Round-1 sweep on 2026-05-08).
**Founder exception:** ADR-019 dropped — TipTap editor stays. SCRUM-44 left Done as-is.

---

## Action-by-action result

| # | Action | SCRUM-N | Result |
|---|--------|---------|--------|
| 1 | Flip BNSS timeline tracker to Done — code shipped | SCRUM-48 | Comment posted; transitioned To Do → Done; both inputToDev entries (Apr 26 + Apr 28) updated to Done with file pointers |
| 2 | Merge separate-affidavit page into annexures pack | SCRUM-66 → SCRUM-65 | SCRUM-66 closure comment + transition to Done; SCRUM-65 absorption comment posted; inputToDev SCRUM-65 description updated to make affidavit-page scope explicit (page-break, verification language source, deponent fields); SCRUM-66 marked Cancelled in inputToDev |
| 3 | Merge FIR year/date validator into pre-gen verifier | SCRUM-68 → SCRUM-69 | SCRUM-68 closure comment + transition to Done; SCRUM-69 absorption comment posted; inputToDev SCRUM-69 details note added re trigger D2 in verification_rules.yaml; SCRUM-68 marked Cancelled in inputToDev |
| 4 | Mark Hindi/bilingual as PARTIAL (was wrongly Phase-2-cut) | SCRUM-51 | Correction comment posted with what's done (metadata) vs what's left (prompt translation, language flag, Devanagari font, UI toggle); kept In Progress (NOT transitioned to Done); inputToDev refined |
| 5 | Re-route ToS/Privacy/Refund drafting from Eng to CLO + Content | SCRUM-25 | Comment posted; labels added (`clo-ownership`, `content-work`); assignee set to founder pending Ajay/Madhuri profile route; transitioned to Done (eng portion); new inputToDev TASK 9 entry filed |
| 6a | NEW: Advocate-panel review pipeline (P0) | **SCRUM-74** | Created as Story; priority Highest; labels `sweep-delta-2026-05-10, advocate-panel, phase-1-gate`; full PRD in description; inputToDev entry filed |
| 6b | NEW: Court-rule golden-master test suite (P1) | **SCRUM-75** | Created as Task; priority High; labels `sweep-delta-2026-05-10, testing, regression-prevention`; inputToDev entry filed |
| 6c | NEW: Helicone alerting runbook (P2, doc only) | **SCRUM-76** | Created as Task; priority Medium; labels `sweep-delta-2026-05-10, runbook, ops`; inputToDev entry filed |

**Founder exception honoured:** SCRUM-44 untouched (TipTap editor stays Done as-is). ADR-019 NOT filed.

---

## New SCRUM keys created

| Key | Title | Priority | Effort |
|-----|-------|----------|--------|
| SCRUM-74 | Advocate-panel review pipeline | P0 | M (2 days) |
| SCRUM-75 | Court-rule golden-master test suite | P1 | S (4 hr) |
| SCRUM-76 | Helicone alerting + kill-switch runbook | P2 | S (2 hr) |

---

## Tool failures

None. All 7 comments posted, all 4 transitions succeeded, 1 edit (labels + assignee on SCRUM-25) succeeded, 3 issue creations succeeded.

---

## Refreshed pickup order (post-delta-sweep) for Vishal

1. SCRUM-69 — Pre-gen verifier + FIR trigger D2 (P0, 5 days) ← **TOP OF QUEUE**
2. SCRUM-70 — Status bar UI (P0, 2 days)
3. SCRUM-65 — Annexures pack + affidavit page (P0, 3-4 days)
4. SCRUM-71 — Referral codes (P0, 3 days)
5. SCRUM-74 — Advocate-panel review pipeline (P0, 2 days)
6. SCRUM-67 — Grounds-vs-facts coherence (P1, 1 day)
7. SCRUM-75 — Golden-master tests (P1, 4 hr)
8. SCRUM-51 — Hindi/bilingual full pipeline (Partial — backlog)
9. SCRUM-76 — Helicone runbook (P2, 2 hr — doc only)
10. SCRUM-59 — Free-tier credit base (BLOCKED on SCRUM-73)
11. SCRUM-73 — Credit master (BLOCKED on founder/CFO Q1/Q2/Q3)

CANCELLED — DO NOT PICK UP:
- SCRUM-66 → merged into SCRUM-65
- SCRUM-68 → merged into SCRUM-69
- SCRUM-72 → superseded by SCRUM-73 (credit system)

---

## Files updated by this sweep

- `/Users/abhinavanand/Files/Lawie/docs/inputToDev.md` — 7 status edits + 3 new ticket entries + pickup-order rewrite
- Jira (cloudId 57ca8a5c-7344-4f00-94de-eb4ff6237702) — 7 comments, 4 transitions, 1 edit, 3 new issues
- `/Users/abhinavanand/Library/Application Support/Claude/local-agent-mode-sessions/57384051-4f1b-4a23-8a76-89db28aa1571/7b6b8ec1-f738-459d-a6cf-0b02da2b7191/local_23a57bcc-592d-4d5b-87ab-507762018fd8/outputs/sweep-deltas-2026-05-10.md` (this file)

— Priya · PM
