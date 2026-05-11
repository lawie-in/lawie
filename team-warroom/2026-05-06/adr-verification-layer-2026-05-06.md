# ADR-018: Pre-Generation Input Verification Layer

**Status:** Proposed | **Date:** 2026-05-06 | **Owner:** Arjun (CTO)

## 1. Current structure (read from code)

End-to-end today, in `streamGenerateFromTemplate` (apps/drafting/src/services/ai.service.ts):

1. **Form submit** -> POST hits `documents.routes.ts` -> `validateFormData()` (required-field + min/max length only; no semantic checks).
2. **Auto-convert** old IPC/CrPC refs in text fields -> **Court lookup** from Mongo + load `court-rules/*.json` -> **`buildPlaceholderContext()`** flattens form + computed fields + court rule into `ctx`.
3. **Render template sections** (pure string replace, zero AI) -> for each `ai_generated` section, **stream Anthropic call** via `streamLLM()` with `buildAISystemPrompt` (BNS whitelist, anti-hallucination rules, immutable applicant identity, bailability classification injected from `bnsBailability.json`).
4. **Post-stream guardrails** (validator.ts): placeholder-leak detection, old-law detection, **BNS whitelist (SCRUM-64b)**, **fact<->section sanity (SCRUM-64c)** — only catches BNS 103 with no death keyword, **identity-preservation** (applicant_name / father_name must appear in body), `checkFactAlteration` (FIR + dates must echo).
5. **Existing guardrails are all post-generation**: by the time we warn, tokens are already paid and streamed to the user. The v3 PDF defect (FIR 091/2021 vs date 06.01.2026) slipped through because there is **no cross-field temporal consistency check anywhere**.

## 2. Where the verification layer plugs in

New endpoint: `POST /api/documents/preflight` — runs **before** `POST /api/documents/generate`. Synchronous, returns within 2-3s.

```
[Form submit]
   v
[/preflight] -- pure rules (sub-50ms) ---> {pass | hard-block | soft-warn list}
   v (only if pure rules pass)
[Haiku LLM check, ~1.5s] -------------> {unusual: bool, questions: [..]}
   v
   - PASS  -> auto-proceed to /generate (no UI prompt)
   - SOFT  -> UI shows clarification modal; advocate confirms or edits, then /generate
   - HARD  -> UI blocks; advocate must fix; never reaches /generate
```

Lives in `apps/drafting/src/services/preflight.service.ts`. Frontend hook in `apps/web/src/app/dashboard/documents/[templateId]/page.tsx` between the Step-3 submit and the SSE stream open.

## 3. What the verifier does

**Pure-rule layer (no LLM, ~50ms):**

| Check | Logic | Severity |
|---|---|---|
| FIR-year vs FIR-date year mismatch | `fir_number` suffix `/YYYY` must equal `fir_date` year | SOFT (the v3 bug) |
| FIR date in future | `fir_date > today` | HARD |
| Applicant age | `<18` warn, `<0` or `>120` HARD | mixed |
| Court-state vs PS-state | `court.state !== police_station_state` (need state on PS lookup) | SOFT |
| BNS bailable + anticipatory bail | all sections bailable -> "anticipatory bail not required" | SOFT |
| Sections-charged whitelist | every section in `bns-offences.json` | HARD |
| Required regex | FIR `^\d+/\d{4}$`, enrollment number, etc. | HARD |

**LLM-assisted layer (Haiku, one call, max 200 output tokens):**

```
Input: { template_id, sections_charged + bailability, facts_narrative, key fields }
Output: { unusual: bool, questions: string[] (<=3, advocate-friendly) }
```

Catches the BNS 103 (murder) + "victim received timely medical attention" mismatch the pure rules can't. Returns clarification questions, max 5 total combined.

**Hard-block triggers (only):** future FIR date, age out of range, sections not in BNS whitelist, missing required field.

## 4. Model choice

**Haiku 4.5.** Confirmed.

| | Haiku 4.5 | Sonnet 4 |
|---|---|---|
| Input/output cost | ~$1 / $5 per MTok | ~$3 / $15 per MTok |
| Latency p50 | 600-900ms | 1.5-2.5s |
| Task fit | yes/no + 1-3 questions | overkill |

Cost per preflight ~ ₹0.05-0.10 vs ~₹0.20-0.30 on Sonnet. Detector is a constrained classifier with structured output — Haiku's accuracy delta on this class of task is <2%. If false-negative rate exceeds 8% on Priya's eval set, we revisit.

## 5. Build effort

**8 story points / ~5 person-days (Vishal).** Sprint slot: end of current sprint.

**Acceptance criteria:**
- `/preflight` returns in p95 < 2.5s, p99 < 4s
- Pure-rule layer has 100% unit-test coverage (cases include the v3 FIR/date bug)
- Haiku layer evals on Priya's 30-case fixture: false-positive < 15%, false-negative on planted bugs < 10%
- Frontend: clarification modal, edit-and-resubmit, dismissible soft warnings, blocking hard errors
- Telemetry: log `{rule_hits, haiku_unusual, advocate_action}` in `Event` collection

**Relationship to SCRUM-64:** **Runs alongside, does not subsume.** SCRUM-64's BNS whitelist + fact<->section sanity stays as last-line post-gen defence (catches model hallucination; preflight catches advocate input). Pre-gen catches it cheap, post-gen catches it after.

## 6. Risk + mitigation

| Risk | Mitigation |
|---|---|
| False positives annoying advocates | Soft warnings dismissible in one click; track dismiss rate, kill any rule >40% dismiss |
| Latency 1-3s before stream | Run pure-rule + Haiku in parallel; show "Reviewing your inputs..." UI; total budget 2.5s |
| Verifier service down | **Fail-open** — log `preflight_skipped` event, proceed to generate. Drafting must never be blocked by an optional safety net. Post-gen validators still run. |

## 7. Top 3 risks of NOT building this

1. **Advocate trust / refund risk.** A wrong year or wrong section in a filed bail application is grounds for the advocate to demand refund and walk. At 25 paid users, two such defects = 8% churn in a single week.
2. **Wasted Anthropic spend.** Every garbage-in draft costs ~₹4-8 in tokens and 30s of advocate time. Pre-gen catch costs ~₹0.10. ROI is ~50x on every prevented bad draft.
3. **Liability + Ajay's compliance posture.** Drafting on contradictory facts (BNS 103 with alive victim) = advocate filing a self-defeating pleading. If discovered by court, we own the headline risk.

---

**Decision:** Build the verification layer. Pure-rule + Haiku assist. Fail-open. Sprint slot now.

Ready for next task.
