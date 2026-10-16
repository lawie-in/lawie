# T-483: The checks panel gives false findings and wrong blank counts

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (major). Priya, 16 Oct 2026 |
| Owner  | Lead after T-480 (Vishal knows the verifier) |
| Mode   | Full chain |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw

- Says given dates are "not in your brief" (10 Dec 2025, 30 Jun 2024, 7 Aug 2019, 2 Mar 2025) when they are.
- "72 years" flagged as a period; false antecedents and brief-fact findings (2 of 4 in the anticipatory bail).
- Blank counts do not match the text ("5 blanks", 2 visible).
- Reports "no mismatch" on a caveat that lost the section and the advocate details.

## What

Explore the checks source (verifier + checks panel); fix the false positives; make the blank count equal the visible blanks. Do not weaken real checks (T-471's unsupported-name flag must still work).

## Acceptance criteria

- The listed cases give no false finding; real mismatches still flagged; blank count matches.
- Tests for each; Ajay sees golden diffs.

