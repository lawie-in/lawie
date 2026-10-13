# T-406 — No case nomenclature on legal notices

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (signs moved goldens) |
| Mode   | Small fix, with a reviewer (moves golden snapshots) |
| Status | Merged into develop_staging 43dc53f (Tanvi, 13 Oct 2026). Nothing to test in the UI (latent). Priya |
| Source | court-rules-golden.test.ts.snap (~:2878): a bail case nomenclature shows on legal_notice_s138 under HC courts |

## Problem

A legal notice isn't filed in any court, so it carries no case nomenclature. But the court-rules layer applies one to legal_notice_s138 under HC courts (a bail one), and maybe to the other legal_notice_* packs.

## Acceptance criteria

1. Find where the nomenclature is applied to notice packs, and stop it for every `legal_notice_*` pack.
2. The court-rules golden snapshots move only for notice packs. Read `.claude/docs/golden-snapshots.md` first. Ajay signs the moved snapshots before the merge.
3. A test pins that no legal_notice_* pack gets a case nomenclature under any court.
