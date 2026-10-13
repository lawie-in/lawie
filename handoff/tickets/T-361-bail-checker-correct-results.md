# T-361 — Bail checker reads "BNS" and gives the right punishment

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting tools) + Ajay (sign data changes) |
| Mode   | Small fix |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Ajay signed; ready for a lead. Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-277 |

## Acceptance criteria

1. "BNS 318(4), BNS 316(2)" gives the same result as "318(4), 316(2)": both are offences.
2. BNS 303(2) theft shows the first-offence maximum of 3 years (Ajay gives the exact line, including the repeat-offence range).
3. "Most serious offence" orders by maximum punishment: 103(1) above 318(4) above 316(2).
4. A bare number ("351") gets a reminder to add the code (BNS or IPC).
5. Tests pin each case above.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Ajay (13 Oct 2026)

Ajay signed (51175aa, handoff/legal/). The 303(2) line: "Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine." Rank offences by the maximum. A bare number gets a reminder to add the code.

## ADR-025

**Arjun, ADR-025 (13 Oct):** the parser half (BNS prefix, unknown max, ranking) moves to T-371. This ticket keeps Ajay's 303(2) row fix and the bare-number reminder.
