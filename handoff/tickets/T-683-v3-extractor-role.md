# T-683 — v3 P1: Extractor role (C)

Status: backlog, drafting v3 Phase 1 (ADR handoff/design/ADR-drafting-v3.md, Arjun signed 26 Oct). Behind feature.drafting_v3_stage. Founder re-plan 29 Oct 2026.

## Acceptance criteria
1. One Sonnet call per intake turn: description + answer → ledger candidates. Code validates types and ranges and rejects bad values.
2. Hinglish/Hindi answers are read as facts (नहीं = no; थाना X = police station X), never copied raw.
3. Per-field hints from the rule pack (first: the O.39 restraint_sought hint Ajay signed, T-613 row 7).
4. Acceptance cases from Anushka run 5 (golden cases): T-675 no invented facts, T-676 Hinglish/Hindi answers read as facts, T-677 section numbers kept, T-679 given facts reach the draft, T-680 NI Act basics.

## Mode
Full chain. Ajay signs prompts and hints.
