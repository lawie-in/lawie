# T-115e — Stop storing the matter label in demand-signal events

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay decides whether the label is needed at all. Arjun found it |
| Mode           | Small fix (drafting only) |
| Status         | To do. Unassigned. Found in Arjun's T-115 audit, 12 Oct 2026 |
| Parent         | T-115 |

`Event.metadata.label`, written in `apps/drafting/src/services/intake.service.ts` (about line 798), can hold a matter label with party names. That breaks Ajay's T-302 demand-signal rule (no personal data in demand signals). Details: the audit section of `T-115-permanent-delete-and-encrypted-inputs.md`.

## Acceptance criteria

1. New events no longer store the label. The category stays.
2. A one-line `$unset` removes `metadata.label` from existing event rows (develop first; production by the founder with the other T-115 steps).
3. A test: an intake that would have written a label stores only the category.
4. Ajay ruled (below): no label; category only. Any other place a matter label or description reaches events, logs or analytics is listed and fixed the same way, or ticketed.

## Gates

- Design: Not needed
- ADR: Arjun's T-115 design
- Legal sign-off: Ajay (point 4)

## Ajay (12 Oct 2026)

The label is NOT needed. Keep only the category, a fixed value from our own list, never user text. Stop writing the label and unset old rows as planned. The same rule applies anywhere else a matter label or description could reach events, logs or analytics: the lead greps for other places and lists them in the report.
