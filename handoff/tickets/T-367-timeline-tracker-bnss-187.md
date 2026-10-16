# T-367 — Timeline tracker: BNSS 187 remand and default-bail date

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting tools) + Ajay (sign the rules) |
| Mode   | Small fix |
| Status | Merged into develop_staging 1706a41 (shashank, 13 Oct 2026). Ajay approved 6f00e62. Waiting for Anushka on develop; the tracker is hidden by T-375's switch, so feature.tool_timeline must be on for her run. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-278 |

## Acceptance criteria

1. Police custody: the tracker no longer says none is possible after day 15. Under BNSS 187 the 15 days may be taken in parts within the first 40 or 60 days (Ajay's wording).
2. The 60/90-day periods cite 187(3), not 187(4).
3. The default-bail date follows the day count in ED v. Kapil Wadhawan (2023): today it is one day late.
4. Tests pin 1–3. Ajay signs.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Ajay (13 Oct 2026)

Ajay signed (51175aa, handoff/legal/): remand in parts under 187(2), the 60/90-day limit under 187(3), and the remand date counts as day 1 (Kapil Wadhawan). Use his exact lines R1–R3 and the worked example.
