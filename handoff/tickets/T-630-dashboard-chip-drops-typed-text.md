Status: assigned 28 Oct 2026 (see leads.md)

# T-630: The dashboard document chip drops typed text and opens the general page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (Anushka 26 Oct prod item 6) |
| Owner  | a lead (web) |
| Mode   | Small fix |
| Status | To do. Raised 26 Oct 2026 from Mahak's T-608 explore. Priya |

## Problem
The dashboard box suggested "Bail application", but the chip goes to /dashboard/new?kind=bail_regular and drops the typed text. The Draft/Enter submit never passes a kind, so the general page opened.

## Acceptance criteria
1. Clicking a suggested chip carries the typed description AND the kind.
2. Draft/Enter with a suggestion selected passes the kind.
3. Tests.
