# T-372 — Hide the documents counter; show Ink cost and balance

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Small fix |
| Status | Merged into develop_staging 587ce69 (kunal, 13 Oct 2026), with T-365 AC2. Ajay to see the cost screen before any public claim. Waiting for Anushka on develop |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

1. The "N of 5 documents used" counter is hidden on the dashboard and settings.
2. The Confirm button shows the template's `creditsCost` before drafting.
3. The SSE `done` event carries the new Ink balance, and the web updates the balance from it.
4. Tests for 2 and 3.

## Meera (13 Oct 2026)

Wording: "Uses 2 Ink" / "Uses 1 Ink". Layout approved: text-sm, slate-600, for AA contrast. This is the T-227 AC3 feature. After merge, Ajay sees the built screen. Only then may public copy say "you see the cost before you generate"; until then the signed T-238 line stays.
