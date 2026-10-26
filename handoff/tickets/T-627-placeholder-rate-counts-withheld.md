# T-627: PlaceholderRate counts withheld drafts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (drafting KPI, ADR-drafting-v3) |
| Owner  | a lead (drafting), after T-611 |
| Mode   | Small fix |
| Status | To do. Raised 26 Oct 2026 from Vishal's T-611. Priya |

## Problem
A withheld run writes no FactDiff row. Withholds show only in the log line `[drafting] draft withheld (kind, code, keys)`, so PlaceholderRate looks better than reality.

## Acceptance criteria
1. Each withheld run records a FactDiff row, or an equivalent counter, with kind, code and keys. Aggregates and ids only, no draft content.
2. PlaceholderRate (and the admin view, if any) includes withheld runs as a separate count.
3. Tests.
