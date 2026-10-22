# T-558: Live-subscription guard follow-ups (from T-536)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Small fix (billing) |
| Status | To do. Not a main blocker. Priya, 22 Oct 2026 |
| Source | Shashank's T-536 report |

1. In the create retry, if the second insert also fails there is no marker and no local row. Wrap it and write the marker (unlikely race).
2. A live-index refusal on a checkout adopt answers 409 instead of the link. Accepted for now; decide with Arjun whether to return the link.
3. T-536's Files line still lists `Subscription.model.ts`, which is unchanged per Arjun: correct the ticket.

Acceptance: tests for 1 and 2 as decided.
