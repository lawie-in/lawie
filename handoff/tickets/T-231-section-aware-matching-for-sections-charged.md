# T-231 — The verifier recognises sections cited together

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (matching rule, signs), Lead (build), Anushka (verdict) |
| Mode           | Rule first (Ajay), then build, full chain (drafting) |
| Status         | To do. Waits for Ajay's rule |
| Size           | S to M |
| Depends on     | T-189 |
| Gate           | Before `feature.fact_ledger` for real users (cost: one extra repair call per joined citation) |
| Branch         | feature/t-231-section-aware-matching |
| Legal sign-off | Ajay signs the matching rule and the diff to `fact-verifier.ts` |
| Created        | 2026-10-11 |
| Source         | Ajay's accepted risk on T-189, 11 Oct 2026 |

## Problem

`sections_charged` entries are text, so the verifier matches each entry as a whole phrase. A draft that cites "Sections 318(4) and 319(2) BNS" in one phrase flags 318(4) BNS as dropped and runs one paid repair. It fails safe (no placeholder, no text removed), but it costs money and noise.

## Acceptance criteria

1. Ajay writes the matching rule: how a section number and its act are read from a joined citation, and what never counts (a different act, a different sub-section).
2. The verifier passes "Sections 318(4) and 319(2) BNS" for entries 318(4) BNS and 319(2) BNS, and still fails 318(4) IPC.
3. No repair call for a correct joined citation. Tests for each case in AC2.
4. Ajay signs the diff before merge.
