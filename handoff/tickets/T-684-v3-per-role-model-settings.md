# T-684 — v3 P1: per-role model settings

Status: assigned to kunal (after T-673), 29 Oct 2026. Parallel to T-682, no dependency.

## Acceptance criteria
1. AppSettings ai.model.{matcher,extractor,drafter,fact_checker,legal_reviewer,language} and ai.effort.*. The admin AI page lists them as required or optional, with the T-585 boot warning.
2. Migration: ai.drafting_model, ai.intake_model and ai.preflight_model map to drafter, extractor and fact_checker, with a fallback for one release.

## Mode
Small/medium (drafting + web admin). No legal content.
