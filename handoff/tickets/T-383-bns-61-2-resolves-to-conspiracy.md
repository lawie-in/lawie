# T-383 — BNS 61(2) (target of IPC 120B) shows "not an offence"

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix |
| Status | To do. Shashank, after T-371 (he holds bns-offence-resolver.ts). Ajay asked for its own ticket, 13 Oct 2026 |
| Source | Ajay (25b3a26), while answering T-371 |

## Acceptance criteria

1. BNS 61(2), the converter's target for IPC 120B, resolves to row 61 (criminal conspiracy) in the T-277 resolver, not "not an offence" under rule 3.
2. The bail checker and the converter show the conspiracy row for "BNS 61(2)" and for "120B IPC" converted.
3. A test pins both. Ajay checks the result.

## Also in this ticket (T-371 reviewer should-fix, Priya 13 Oct)

4. On the bail checker page (apps/web/src/app/tools/bail-checker/page.tsx ~:378), not-found rows show the display form from the API ("Section 400 …"), not the raw token (`Section "400-BNS"`). Add a test.
