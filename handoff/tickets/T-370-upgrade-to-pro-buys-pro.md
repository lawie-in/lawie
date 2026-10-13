# T-370 — "Upgrade to Pro" buys Pro, labels from the plan catalogue

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + billing) |
| Mode   | Small fix |
| Status | Built, waiting to merge after T-223 (kunal, a804570, tester green). Priya, 13 Oct 2026 |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

1. The settings page subscribe call sends the `planId` of the plan shown. "Upgrade to Pro" buys Pro, not Solo.
2. The plan name, price and Ink on the settings page come from billing `GET /plans`, never hard-coded. No "₹799 Unlimited".
3. A test pins that the Pro button sends the Pro planId and shows the catalogue's label.
