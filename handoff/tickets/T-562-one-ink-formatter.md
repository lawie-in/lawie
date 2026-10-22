# T-562: One Ink formatter

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish |
| Owner  | Rajesh (format), a lead (build) |
| Mode   | Small fix (web) |
| Status | To do. Not urgent; output is identical below 1,00,000. Priya, 22 Oct 2026 |
| Source | Rajesh, T-544 review (b) |

`InkCostLine`, `PaywallModal` and `PlanPanel` should use the same en-IN Ink formatting helper as `ui/InkChip` (T-544). One helper, one place, tests for the grouping at 99,999 / 1,00,000 / 12,34,567 and for half Ink (.5). No new strings.
