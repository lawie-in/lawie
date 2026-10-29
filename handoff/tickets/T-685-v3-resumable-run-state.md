# T-685 — v3 P1: resumable run state (orchestrator A)

Status: backlog, drafting v3 Phase 1 (ADR handoff/design/ADR-drafting-v3.md, Arjun signed 26 Oct). Behind feature.drafting_v3_stage. Founder re-plan 29 Oct 2026.

## Acceptance criteria
1. A run document: step, ledger version, outputs by step id. Every step is idempotent and persisted.
2. A crash or token expiry resumes from the last step. No double charge.
3. SSE stages (T-538) get the new stage names and `round`.
4. Behind feature.drafting_v3_stage. The old path is untouched when the flag is off.

## Mode
Full chain. Arjun reviews.


## Added 29 Oct 2026 (Arjun, 5e493930)
- The orchestrator enforces the per-run cost cap `ai.cost_cap_paise_per_ink` for all v3 stages. T-683 ships without it, behind the flag (default 0).
- v1.3 runbook (ops): seed `ai.model.extractor=claude-haiku-5-5` and `ai.effort.extractor_v3` before feature.drafting_v3_stage goes above 0.
