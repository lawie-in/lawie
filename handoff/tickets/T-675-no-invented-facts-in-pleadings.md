# T-675 — Pleadings never add facts the user did not give (Anushka Blocker 2)

Status: backlog, P1. Source: Anushka run 5, prod v1.2.2, 29 Oct 2026 (handoff/tickets/anushka-run5-prod-v1.2.2.md). FAIL verdict.

## Acceptance criteria
1. Declaration plaint: paras like "the plaintiff did not receive any consideration…" and "did not appear before the Sub-Registrar" appeared with no such fact in the input. A pleading verified on oath may state only the facts given; anything else becomes a [To be confirmed] blank or is left out.
2. Add a golden or recorded-reply test that fails if the declaration draft contains a factual assertion absent from the input (Ajay sets the rule and the cases).
3. Check the other civil packs for the same behaviour and report.

## Mode
Full chain (drafting prompts/validation), legal content (Ajay).
