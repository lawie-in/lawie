# Lawie Build Queue Audit — 2026-05-06
Owner: Priya (PM) · Source: /Users/abhinavanand/Files/Lawie/docs/inputToDev.md

## Open work (NOT Done) in ship order

| Order | inputToDev ID | Jira | Priority | Status | What it does (1 line) | Blocked by | ETA |
|---|---|---|---|---|---|---|---|
| 1 | cli-export-advocate-pack | SCRUM-57 | P0 | Pending | Node CLI: SSE `.response.json` → 12 advocate-review PDFs (puppeteer, A4, court margins, AI-disclaimer footer) | None — all prereqs Done | EOD 2026-05-07 |
| 2 | scrum-50-court-rules-rework (CLO) | SCRUM-50 | P0 | Picked Up (code done, awaiting CLO re-validation) | 11 court-rule files schema rewrite + 140 tests passing | CLO sign-off (Ajay) | 2026-05-07 |
| 3 | helicone-integration | SCRUM-58 | P1 | Pending | Anthropic via Helicone proxy + per-user/day spend caps + costUsd on Generation | SCRUM-23 (done) | 2026-05-08 (half-day) |
| 4 | trial-cap-10-gated | SCRUM-59 | P1 | Pending | Free trial cap = 5 base + 5 earned via thumbs/feedback rating; rate-output micro-UI; disposable email block | helicone-integration MUST be in prod first | earliest 2026-05-12 |
| 5 | scrum-44-editor-export-activation | SCRUM-44 | P0 | Pending | Full TipTap/Lexical editor + PDF/DOCX export + filing checklist + watermark + `activation_first_export` event | cli-export-advocate-pack (server-side PDF pipeline lands there first) | 2026-05-13 (4-5 days) |

Notes on Picked-Up but effectively complete:
- SCRUM-13/11/14/17/18/19 batch (line 94, 19 Apr) — all 6 sub-items marked Done in progress log; entry header still says "Picked Up". Stale, no action needed.
- SCRUM-44 (line 409, 26 Apr "TASK 3") — superseded by line 1104 entry (`scrum-44-editor-export-activation`). Same Jira ID.

## Vishal next session pickup
SCRUM-57 (cli-export-advocate-pack) — P0, no blockers, 4-6 hr, gates the Jharkhand advocate-panel pack that Ajay needs Friday. Everything downstream (SCRUM-44 PDF pipeline) reuses this code.

## What ships this week (8-13 May)
- SCRUM-57 ships Wed 7 May → 12 PDFs handed to Ajay for Ranchi pack assembly
- SCRUM-58 (Helicone) ships Thu 8 May → unblocks SCRUM-59
- SCRUM-59 (trial cap 10, gated) starts Mon 12 May, ships Wed 13 May; design files at `/Users/abhinavanand/Files/Lawie/docs/designs/rate-output-card-2026-05-06.html` + `.png`

## Still needs sign-off before it can move
- SCRUM-50 → blocked on Ajay (CLO) re-validation. Code + 140 tests done. Ping Ajay.
- SCRUM-59 → blocked on SCRUM-58 reaching production (founder/Arjun must verify Helicone live before merge).
- SCRUM-44 → blocked on (a) SCRUM-57 server-side PDF pipeline shipping, (b) Arjun decision on TipTap vs Lexical, (c) Arjun decision on puppeteer location (drafting-service vs new export-service).
- SCRUM-47 / SCRUM-48 / SCRUM-50 (court DB) / SCRUM-51 (Hindi) → all sit at "CTO-APPROVED" but no inputToDev entry filed yet. Priya to file PRDs + tickets when Phase 1 paid-user blockers clear.
