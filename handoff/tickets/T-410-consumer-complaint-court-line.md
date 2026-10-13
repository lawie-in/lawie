# T-410 — Consumer complaint takes a criminal or bail case line at non-consumer courts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix (moves goldens) |
| Status | Merged into develop_staging 0a18bda (Tanvi, in T-410, 13 Oct 2026). Waiting for Anushka on develop. Priya |
| Source | T-406 Explore (template-engine.service.ts ~:1751 fallback) |

## Acceptance criteria

1. Ajay rules what a consumer_complaint should show at a court that isn't a consumer forum: block it, show a signed blank, or pick a consumer forum only.
2. The template engine follows the rule. The moved golden snapshots go to Ajay.
3. A test pins it.
