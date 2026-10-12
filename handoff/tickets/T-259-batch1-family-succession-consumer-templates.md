# T-259 — Template batch 1: family, succession, consumer (#34–#44, 11 templates)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Lead (build). Ajay (signed specs; signs every diff). Anushka (samples) |
| Mode           | Full chain. Legal content: apply Ajay's signed text only |
| Status         | To do. Unassigned. Ajay signed all 53 batch 1 specs, 12 Oct 2026 (a4e7ace) |
| Depends on     | T-240; #39 also needs the T-245 mechanism. |

## Scope

Maintenance pendente lite, assets and liabilities affidavit, custody of a ward, DV Act interim relief, Muslim marriage dissolution, alteration of maintenance, succession certificate, probate, legal heir affidavit, consumer appeal, consumer execution.

The signed specs are `handoff/legal/T-239-b1-<nn>-<id>-signed.md`. They list each template's fields, clauses, cues, citations and Ink.

## Acceptance criteria

1. Each template's rule file matches its signed spec word for word. A lead writes no legal text; if something is missing, return `BLOCKED`.
2. Category and price go in this batch's own files under `config/catalogue/` (T-240). No other lead's batch file is touched.
3. Tests, per template: the rule file is valid; it has a category and a price; every BNS/BNSS/BSA citation is in `config/sections/`; its averments load.
4. No fee or stamp amounts, no case law, and no "within limitation" claim.
5. Ajay signs each diff. Golden snapshots that move are listed for him, and none are auto-updated.
6. Anushka's sampling: Tier A: #34, #36, #37, #38, #41, #43, #44.
