# T-482: Maintenance under S.144 BNSS: "no ready document" and no Family Court in the list

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Status | To do. V1 (maintenance is one of the commonest filings). Priya, 16 Oct 2026 |
| Owner  | Kunal (after T-477), Ajay gates                                             |
| Mode   | Full chain                                                                  |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw

"Wife ke liye maintenance ... Bihar ... Gaya" got "We could not find a ready document for this." After naming "Section 144 BNSS before Family Court, Gaya", the court list had no Family Court; District, JMFC and CJM each offered only Patna. Abandoned, 0 Ink.

## What

Explore: why the request is not routed to the maintenance_bnss_144 pack, and why the court list has no Family Court for Gaya (check T-174, T-176 family court routing and the court list data). Fix routing and court choices for the maintenance flow in Bihar and Jharkhand at least.

## Acceptance criteria

- Natural requests ("maintenance", "bharan-poshan", S.144 BNSS) reach the pack.
- A Family Court is offered where one exists; the court list for Gaya is right (Ajay confirms the court data).
- Tests and a golden for the routing.

## Ajay's ruling (16 Oct 2026)

Offer a Family Court only for districts he has verified; otherwise JMFC. He is checking the Bihar and Jharkhand list and will send it.
