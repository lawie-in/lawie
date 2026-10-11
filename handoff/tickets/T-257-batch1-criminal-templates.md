# T-257 — Template batch 1: criminal (16 templates)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Lead (build). Ajay (signed specs; signs every diff). Anushka (samples) |
| Mode           | Full chain. Legal content: apply Ajay's signed text only |
| Status         | To do. Unassigned. Ajay signed all 53 batch 1 specs, 12 Oct 2026 (a4e7ace) |
| Depends on     | T-240 and T-245a (the procedure_code and governing_provision mechanism). Also T-250/T-255 if a spec cites a BSA or BNSS pair. |

## Scope

Specs #1–#6, #13, #15–#17 (NI Act, FIR and police applications, protest petition, NDPS bail, SC/ST bail appeal, juvenile bail, BSA 63 certificate) plus #7–#12 (superdari, exemption, compounding, recall of witness, additional accused, modification of bail conditions). **#14 bail_bihar_prohibition is HELD: do not build it.**

The signed specs are `handoff/legal/T-239-b1-<nn>-<id>-signed.md`. They list each template's fields, clauses, cues, citations and Ink.

## Acceptance criteria

1. Each template's rule file matches its signed spec word for word. A lead writes no legal text; if something is missing, return `BLOCKED`.
2. Category and price go in this batch's own files under `config/catalogue/` (T-240). No other lead's batch file is touched.
3. Tests, per template: the rule file is valid; it has a category and a price; every BNS/BNSS/BSA citation is in `config/sections/`; its averments load.
4. No fee or stamp amounts, no case law, and no "within limitation" claim.
5. Ajay signs each diff. Golden snapshots that move are listed for him, and none are auto-updated.
6. Anushka's sampling: Tier A: every template, twice. #4, 11, 12, 13, 15, 16 are all Tier A.
