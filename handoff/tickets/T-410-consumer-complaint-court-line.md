# T-410 — Consumer complaint takes a criminal or bail case line at non-consumer courts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix (moves goldens) |
| Status | To do. Ajay ruled (handoff/legal/T-406-T-410-case-line-signed.md, f794a72): Consumer Commission only; the picker offers District, State and National Commission only; an old draft with another court gets "[To be confirmed: Consumer Commission]", never a criminal or bail line; generation not blocked; tests in his file. Tanvi, after T-406 (same template-engine area) |
| Source | T-406 Explore (template-engine.service.ts ~:1751 fallback) |

## Acceptance criteria

1. Ajay rules what a consumer_complaint should show at a court that isn't a consumer forum: block it, show a signed blank, or pick a consumer forum only.
2. The template engine follows the rule. The moved golden snapshots go to Ajay.
3. A test pins it.
