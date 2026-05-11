# Vishal — SCRUM Ticket Sweep vs Codebase

Date: 2026-05-09 (sweep against state on 2026-05-08 founder ask)
Scope: every open / not-yet-Done SCRUM ticket in `/Users/abhinavanand/Files/Lawie/docs/inputToDev.md` walked against the actual repo at `/Users/abhinavanand/Files/Lawie`.
Reverse pass: searched for code attributed to tickets that have no closure in inputToDev.

Counts:
- DONE in code, status mismatch: 4 tickets
- PARTIAL: 1 ticket
- NOT STARTED (correctly pending): 8 tickets
- ORPHAN code (no clean attribution): 0 hard cases (3 soft notes)
- UNCLEAR: 1 ticket

---

## DONE in code (status mismatch in inputToDev)

| Ticket | File evidence | What to mark in inputToDev |
|---|---|---|
| SCRUM-48 | `apps/drafting/src/services/timeline.service.ts` (header `BNSS Investigation Timeline Tracker — SCRUM-48`); `apps/web/src/app/tools/timeline-tracker/page.tsx`; `apps/drafting/src/__tests__/timeline.test.ts` | Lines 431–433 + 509–512 still read `CTO-APPROVED`. Flip to **Done** with completion ~2026-05-06 (Vishal-Opus). |
| SCRUM-50 | All 13 court-rule JSONs in `apps/drafting/src/config/court-rules/*.json` carry the 7 required fields (`cause_title_format`, `party_designation`, `case_nomenclature`, `para_numbering`, `prayer_language`, `verification_format`, `supported_languages`). `cjm_generic.json` exists. `__tests__/court-rules.test.ts` is the 140-test suite. | Line 572 still reads `Picked Up`. Item 11 (CLO re-validation) is the only remaining gate per Vishal note line 575 — flip to **Done** once Ajay confirms; status field is stale either way. |
| SCRUM-44 | `apps/web/src/components/editor/DocumentEditor.tsx`, `Toolbar.tsx`, `exportUtils.ts`; `apps/drafting/src/services/pdf-export.service.ts`; activation telemetry events in `Event.model.ts`; PATCH/export endpoints in `routes/documents.routes.ts`; per CLAUDE.md 2026-05-06 entry — server-side puppeteer PDF, DOCX margins, filing checklist persistence, 376 tests pass | inputToDev line 412 already says `Done` ✓; line 488 still says `CTO-APPROVED` (duplicate stale entry). Delete or flip TASK 4 dated 28 Apr to Done. |
| SCRUM-46 / SCRUM-47 | SCRUM-46: `apps/web/src/app/tools/section-converter/page.tsx` + `apps/drafting/src/services/sections.service.ts`. SCRUM-47: `apps/drafting/src/services/bail-check.service.ts` (header line 2 says `SCRUM-47`) + `apps/web/src/app/tools/bail-checker/page.tsx`. | Both Done in inputToDev; `tools/page.tsx` listing landing page also exists. No mismatch — listing here as confirmation only. |

Net status-flip recommendations: **SCRUM-48** (CTO-APPROVED → Done) and **SCRUM-50** (Picked Up → Done pending CLO).

---

## DONE in code AND Done in inputToDev (verification only — special-focus tickets)

These were called out for verification. All confirmed shipped:

| Ticket | Evidence |
|---|---|
| SCRUM-44 | (above) |
| SCRUM-57 (cli-export) | `scripts/export-pdf.ts` exists with marked + puppeteer; `scripts/__tests__/export-pdf.test.ts` exists. Watermark removed (line 179 comment: "Watermark permanently removed"). |
| SCRUM-58 (Helicone) | `apps/drafting/src/services/ai.service.ts` lines 68–93 wire Helicone AI Gateway; `heliconeHeaders()` (line 139) attaches `Helicone-User-Id` + `Helicone-Property-Template`; `__tests__/helicone.test.ts` exists; spend-cap middleware at `middleware/spendCap.ts`. Note: implementation uses Helicone AI Gateway path (OpenAI-compat), not the `https://anthropic.helicone.ai` baseURL the ticket originally specified. CTO-approved deviation per CLAUDE.md but worth noting. |
| SCRUM-60 | `scripts/export-pdf.ts` uses `marked` (line 25 import); watermark removed; tests in `scripts/__tests__/export-pdf.test.ts`. |
| SCRUM-61 | `template-engine.service.ts` recursive placeholder pass + tests — confirmed. |
| SCRUM-62 | `template-engine.service.ts:643` exports `sanitiseAIBody()`; called in `ai.service.ts`. |
| SCRUM-63 | `template-engine.service.ts:390` `stripLeadingPrefix()`, called at line 566 for `police_station`. |
| SCRUM-64 | `services/validator.ts` exports `extractBNSSectionNumbers`, `validateBNSWhitelist`, `checkFactSectionSanity`; wired in `ai.service.ts`; `__tests__/validator.test.ts`. `bns-offences.json` is the whitelist source. |

---

## PARTIAL (some code, gap remaining)

| Ticket | What's done | What's missing |
|---|---|---|
| SCRUM-51 (Hindi / bilingual) | All 13 court-rule JSONs declare `supported_languages: ["en", "hi"]`; field is propagated through `template-engine.service.ts` (lines 111, 134, 178, 206). | No actual Hindi prompt path, no language toggle in UI, no Devanagari font in PDF export, no bilingual rendering. The metadata field is plumbed but the feature isn't built. Status `CTO-APPROVED` is correct — should NOT be flipped to Done. |

---

## NOT STARTED (confirmed pending — correct status)

| Ticket | Why not started |
|---|---|
| SCRUM-59 (free-tier credit mechanics) | Just rewritten by Priya 2026-05-08 (credit model supersedes trial-cap-10). User model still uses `freeTierMonthlyLimit` (no `creditsBalance`, `loginBonusUsedThisMonth`, `ratingBonusUsedThisMonth`). Correctly Pending. |
| SCRUM-65 (annexures pack) | `apps/drafting/src/config/annexures/` does not exist. No code. To Do — correct. |
| SCRUM-66 (separate affidavit page) | No page-break logic for affidavit page in `pdf-export.service.ts`. To Do — correct. |
| SCRUM-67 (grounds-vs-facts coherence) | No `false_implication` ↔ narrative coherence rule in `template-engine.service.ts`. To Do — correct. |
| SCRUM-68 (FIR year/date validator) | No FIR-suffix-vs-year regex check in form layer or backend `/preflight`. To Do — correct. |
| SCRUM-69 (preflight verification layer) | `POST /api/documents/preflight` does NOT exist (grep on `documents.routes.ts` returned no match for `preflight`). No `verification_rules.yaml`. To Do — correct. |
| SCRUM-70 (status bar UI) | `apps/web/src/components/draft/PipelineStatus.tsx` does NOT exist. The `draft/` directory does not exist. To Do — correct. |
| SCRUM-71 (referral codes) | No `ReferralCode` model, no `/admin/referral-codes` route, no `referredVia` field on User. To Do — correct. |
| SCRUM-72 (abuse throttle) | Cancelled — superseded by SCRUM-73 credit system. Correctly marked. |
| SCRUM-73 (credit system master) | Pending — paid tier mechanics not built. Pricing page absent. Correct. |

---

## ORPHAN CODE (no ticket attribution found in inputToDev)

No hard orphan cases. Three soft notes the founder may want to map:

| File | What it does | Suggested ticket key |
|---|---|---|
| `apps/drafting/src/middleware/spendCap.ts` | Enforces ₹2000/day total, ₹500/day per-user spend cap by querying Helicone | Belongs under SCRUM-58. Not separately ticketed. Confirm with Priya if a sub-ticket should be filed. |
| `apps/drafting/src/services/post-processor.ts` + `__tests__/post-processor.test.ts` | Post-processing pass on AI output (separate from `validator.ts`) | Likely shipped as part of SCRUM-43 / SCRUM-52-56 round, but not explicitly itemised. Likely fine — Priya to confirm. |
| `apps/drafting/src/scripts/apply-clo-patch.ts` | One-shot script for SCRUM-27 CLO patch (Apr 28) | Already Done under SCRUM-27 — no action. |

---

## UNCLEAR — needs Priya

| Ticket | The ambiguity |
|---|---|
| SCRUM-50 | Vishal note line 575 says items 1–9 implemented + tests added in items 10. Status field still says `Picked Up` because item 11 (Ajay re-validation) is the gate. Has Ajay re-validated post-2026-05-06? If yes, flip to Done. If still pending, flag in CTO sweep #19 so it's not lost. The code-side work is complete; this is a human-process gate, not a code gap. |

---

## Reverse-side observation

The newest tickets (SCRUM-65 through SCRUM-71, SCRUM-73) filed 2026-05-08 are correctly absent from the codebase — no premature implementation. SCRUM-72 cancellation respected.

The cleanest single action for the founder/Priya: **flip SCRUM-48 to Done in inputToDev.md** (most clear-cut mismatch — code is shipped, tests pass, page lives at `/dashboard/tools/timeline-tracker`).
